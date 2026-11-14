"use strict";

function purchaseItems(quote) {
  const grouped = new Map();
  quote.lines
    .filter((line) => line.kind === "material")
    .forEach((line) => {
      const identity =
        line.catalogId ||
        JSON.stringify([line.brand || "", line.ref || line.label]);
      const key = JSON.stringify([identity, line.unit || "u"]);
      if (!grouped.has(key))
        grouped.set(key, {
          label: line.label,
          ref: line.ref || line.sku || "",
          brand: line.brand || "",
          unit: line.unit || "u",
          qty: 0,
          rooms: new Map(),
        });
      const item = grouped.get(key);
      item.qty = roundQuantity(item.qty + line.qty);
      const room = line.room || "Ensemble du chantier";
      item.rooms.set(
        room,
        roundQuantity((item.rooms.get(room) || 0) + line.qty),
      );
    });
  return [...grouped.values()].sort((a, b) =>
    a.label.localeCompare(b.label, "fr"),
  );
}

function purchaseRooms(item) {
  return [...item.rooms]
    .map(([room, qty]) => `${room} (${qty} ${item.unit})`)
    .join(", ");
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function purchaseCsv(quote) {
  const rows = [
    [
      "Référence",
      "Marque",
      "Désignation",
      "Quantité",
      "Unité de vente",
      "Pièces",
    ],
  ];
  purchaseItems(quote).forEach((item) =>
    rows.push([
      item.ref,
      item.brand,
      item.label,
      item.qty.toLocaleString("fr-FR", {
        useGrouping: false,
        maximumFractionDigits: 3,
      }),
      item.unit,
      purchaseRooms(item),
    ]),
  );
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
}

function purchaseHtml(quote) {
  const items = purchaseItems(quote);
  return `<!doctype html><html lang="fr"><meta charset="UTF-8"><title>Matériel ${esc(quote.number)}</title><style>
    @page{size:A4;margin:14mm}body{font:11px Arial,sans-serif;color:#233a46;line-height:1.5}h1{font-size:23px;color:#087f77;margin-bottom:8px}p{margin:5px 0}.head{border-bottom:3px solid #087f77;padding-bottom:14px;margin-bottom:18px}.muted{color:#607680}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}th{background:#173846;color:white;text-align:left;padding:8px}td{border-bottom:1px solid #dce5e9;padding:9px 7px;vertical-align:top;overflow-wrap:anywhere}tr{break-inside:avoid}.qty{text-align:right}</style><body>
    <div class="head"><h1>Matériel à commander</h1><strong>${esc(quote.company.name)}</strong><p>${esc(quote.number)} · ${esc(quote.client)}</p><p>${esc(quote.title)}</p><p class="muted">${esc(quote.site || quote.clientAddress)}</p></div>
    <p>${items.length} référence(s) regroupée(s). Les quantités utilisent le conditionnement et l’unité de vente des lignes du devis.</p>
    <table><colgroup><col style="width:17%"><col style="width:37%"><col style="width:9%"><col style="width:9%"><col style="width:28%"></colgroup><thead><tr><th>Référence</th><th>Désignation</th><th>Qté</th><th>Unité</th><th>Pièces</th></tr></thead><tbody>${items.map((item) => `<tr><td>${esc(item.ref || "Hors catalogue")}<br><span class="muted">${esc(item.brand)}</span></td><td>${esc(item.label)}</td><td class="qty">${item.qty}</td><td>${esc(item.unit)}</td><td>${esc(purchaseRooms(item))}</td></tr>`).join("")}</tbody></table></body></html>`;
}

function openPurchaseList(quote = draft) {
  if (!isQuoteLocked(quote)) {
    capture();
    if (!storeQuote(true)) return;
  }
  const items = purchaseItems(quote);
  modal(`<h2>Matériel à commander</h2><p class="muted">${esc(quote.number)} · ${items.length} référence(s). Quantités exprimées dans l’unité de vente du devis.</p>
    <div class="actions"><button id="purchasePdf" ${items.length ? "" : "disabled"}>PDF</button><button id="purchaseCsv" class="secondary" ${items.length ? "" : "disabled"}>Exporter en CSV</button><button class="secondary" onclick="closeModal()">Fermer</button></div>
    <div class="purchase-list">${items.map((item) => `<article class="line"><strong>${esc(item.label)}</strong><p>Réf. ${esc(item.ref || "hors catalogue")} · <strong>${item.qty} ${esc(item.unit)}</strong></p><p class="muted">${esc(purchaseRooms(item))}</p></article>`).join("") || '<p class="empty">Aucun matériel dans ce devis.</p>'}</div>`);
  $("purchaseCsv").onclick = () =>
    exportTextFile(
      purchaseCsv(quote),
      `${quote.number}-materiel.csv`,
      "text/csv",
    );
  $("purchasePdf").onclick = () =>
    printHtml(purchaseHtml(quote), `${quote.number}-materiel`);
}

function hourlyInternalCost(quote) {
  const value =
    quote.internalHourlyCost !== undefined
      ? quote.internalHourlyCost
      : quote.company.internalHourlyCost;
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function profitEstimate(quote) {
  const result = {
    revenue: totals(quote).ht,
    materials: 0,
    labor: 0,
    services: 0,
    unknownCosts: 0,
    hours: 0,
  };
  const hourly = hourlyInternalCost(quote);
  quote.lines.forEach((line) => {
    if (line.kind === "labor" && line.unit === "h") {
      result.hours = roundQuantity(result.hours + line.qty);
      if (hourly == null) result.unknownCosts++;
      else result.labor = round(result.labor + round(line.qty * hourly));
      return;
    }
    const known =
      Number.isFinite(line.cost) &&
      line.cost >= 0 &&
      (line.kind === "material" || line.cost > 0 || line.costConfirmed);
    if (!known) {
      result.unknownCosts++;
      return;
    }
    const key =
      line.kind === "material"
        ? "materials"
        : line.kind === "labor"
          ? "labor"
          : "services";
    result[key] = round(result[key] + round(line.qty * line.cost));
  });
  result.cost = round(result.materials + result.labor + result.services);
  result.margin = round(result.revenue - result.cost);
  result.marginRate = result.revenue
    ? round((result.margin / result.revenue) * 100)
    : null;
  return result;
}

function profitSummaryHtml(quote) {
  const estimate = profitEstimate(quote);
  return `<dl class="profit-summary"><div><dt>Vente HT après remise</dt><dd>${money(estimate.revenue)}</dd></div>
    <div><dt>Coût matériel renseigné</dt><dd>${money(estimate.materials)}</dd></div><div><dt>Coût de main-d’œuvre renseigné (${estimate.hours} h)</dt><dd>${money(estimate.labor)}</dd></div>
    <div><dt>Coût des forfaits renseigné</dt><dd>${money(estimate.services)}</dd></div><div><dt>${estimate.unknownCosts ? "Écart HT sur les coûts renseignés" : "Marge estimée avant frais généraux"}</dt><dd>${money(estimate.margin)}${!estimate.unknownCosts && estimate.marginRate != null ? ` (${estimate.marginRate} % du HT)` : ""}</dd></div></dl>
    ${estimate.unknownCosts ? `<p class="notice">${estimate.unknownCosts} ligne(s) avec un coût interne manquant. Complétez-les pour estimer la marge.</p>` : '<p class="muted">Estimation avant frais généraux et autres charges de l’entreprise.</p>'}`;
}

function mountProfitPanel() {
  const section = document.createElement("section");
  section.className = "card";
  const hourly = hourlyInternalCost(draft);
  section.innerHTML = `<details id="profitPanel"><summary>Rentabilité estimée · usage interne</summary><p class="muted">Ces informations servent à votre estimation interne.</p><div id="profitSummary"></div>
    <label>Coût horaire interne estimé HT (€ / h)<input id="internalHourlyCost" type="number" min="0" max="1000000" step="0.01" value="${hourly ?? ""}" placeholder="À renseigner"></label>
    <details><summary>Compléter les coûts par ligne</summary>${draft.lines
      .filter((line) => !(line.kind === "labor" && line.unit === "h"))
      .map((line) => {
        const index = draft.lines.indexOf(line);
        const known =
          Number.isFinite(line.cost) &&
          (line.kind === "material" || line.cost > 0 || line.costConfirmed);
        return `<label class="internal-cost">${esc(line.label)} · ${esc(line.room || "Ensemble du chantier")}<input data-internal-cost="${index}" type="number" min="0" max="10000000" step="0.01" value="${known ? line.cost : ""}" placeholder="Coût HT par ${esc(line.unit)}"></label>`;
      })
      .join("")}</details></details>`;
  $("summary").before(section);
  const refresh = () => {
    $("profitSummary").innerHTML = profitSummaryHtml(draft);
  };
  $("internalHourlyCost").oninput = (event) => {
    if (event.target.value !== "" && !event.target.validity.valid) return;
    draft.internalHourlyCost =
      event.target.value === "" ? null : Number(event.target.value);
    refresh();
  };
  section.querySelectorAll("[data-internal-cost]").forEach((input) => {
    input.oninput = () => {
      if (input.value !== "" && !input.validity.valid) return;
      const line = draft.lines[Number(input.dataset.internalCost)];
      line.cost = input.value === "" ? null : Number(input.value);
      line.costConfirmed = true;
      refresh();
    };
  });
  $("quoteForm").addEventListener("change", refresh);
  refresh();
}
