"use strict";

function repricedLines(lines, products = catalogItems()) {
  const byId = new Map(products.map((p) => [productKey(p), p]));
  const report = { updated: 0, unavailable: 0 };
  const next = structuredClone(lines).map((l) => {
    if (l.kind !== "material" || !l.catalogId) {
      return l;
    }
    const p = byId.get(l.catalogId);
    if (!p || p.cost == null || p.unit !== l.unit) {
      report.unavailable++;
      return l;
    }
    report.updated++;
    return {
      ...l,
      cost: p.cost,
      price: productSalePrice(p, num(l.markup, company().markup)),
      needsPrice: false,
      checked: p.checked,
      sourceTtc: p.sourceTtc,
    };
  });
  return { lines: next, ...report };
}
function duplicateQuoteDialog(source, revision = false) {
  const estimate = repricedLines(source.lines);
  modal(`<h2>${revision ? "Nouvelle version de" : "Dupliquer"} ${esc(source.number)}</h2><p>Un nouveau brouillon sera créé. Le client, les pièces et les quantités sont repris et restent modifiables.</p><form id="duplicateForm">${select(
    "copyPrices",
    "Prix du nouveau devis",
    [
      ["keep", "Conserver les prix du devis d’origine"],
      ["current", "Recalculer le matériel avec le catalogue chargé"],
    ],
    "keep",
  )}
    <p class="notice">Actualisation possible : ${estimate.updated} ligne(s). ${estimate.unavailable} référence(s) absente(s), sans prix ou avec une unité différente : prix d’origine conservé. Main-d’œuvre et lignes libres conservées. La majoration de chaque ligne est conservée ; un prix de vente ajusté manuellement sera recalculé.</p>
    <p class="muted">Les prix chargés peuvent dater d’un précédent relevé. Vous pouvez d’abord actualiser le catalogue depuis l’onglet Catalogue.</p><div class="actions"><button type="submit">Créer la copie</button><button type="button" class="secondary" onclick="closeModal()">Annuler</button></div></form>`);
  $("duplicateForm").onsubmit = (e) => {
    e.preventDefault();
    const current = $("f-copyPrices").value === "current";
    closeModal();
    newQuote(source);
    if (revision) {
      const root = source.versionRoot || source.id;
      const versions = db.quotes.filter(
        (quote) =>
          quote.companyId === db.active &&
          (quote.versionRoot || quote.id) === root,
      );
      draft.versionRoot = root;
      draft.revision =
        Math.max(...versions.map((quote) => quote.revision || 1)) + 1;
      draft.supersedes = source.id;
      draft.previousNumber = source.number;
    }
    draft.status = "Brouillon";
    if (current) {
      draft.lines = estimate.lines;
      draft.priceRefresh = {
        date: today(),
        updated: estimate.updated,
        unavailable: estimate.unavailable,
      };
    }
    storeQuote(true);
    renderEditor();
  };
}

function renderQuotes() {
  delete document.body.dataset.quoteMode;
  const list = db.quotes.filter((q) => q.companyId === db.active);
  $("main").innerHTML =
    `<div class="row"><h1>Mes devis</h1><span class="pill">Hors connexion</span></div><button id="newQuote">+ Créer un devis</button><section class="card"><h2>${list.length} devis enregistrés</h2><label>Rechercher un client, un chantier ou un numéro<input id="search" type="search"></label><details class="filter-details"><summary>Statut, dates et tri</summary><div class="grid">${select("quoteStatus", "Statut", [["", "Tous les statuts"], ...QUOTE_STATUSES.map((s) => [s, s])], "")}${field("quoteFrom", "Émis à partir du", "", "date")}${field("quoteTo", "Émis jusqu’au", "", "date")}${select(
      "quoteSort",
      "Trier",
      [
        ["updated", "Dernière modification"],
        ["dateDown", "Date décroissante"],
        ["dateUp", "Date croissante"],
        ["totalDown", "Montant TTC décroissant"],
      ],
      "updated",
    )}</div><button class="text-button" id="clearQuoteFilters">Effacer les filtres</button></details><p id="quoteResultCount" class="muted"></p><div id="quoteList"></div></section>`;
  $("newQuote").onclick = () => {
    if (!company()) {
      tab = "company";
      render();
      toast("Commencez par créer votre entreprise");
      return;
    }
    newQuote();
  };
  const results = () => {
    const search = normalizeSearch($("search").value),
      status = $("f-quoteStatus").value,
      from = $("f-quoteFrom").value,
      to = $("f-quoteTo").value,
      sort = $("f-quoteSort").value;
    if (from && to && from > to) {
      $("quoteResultCount").textContent =
        "La date de début doit précéder la date de fin.";
      $("quoteList").innerHTML = "";
      return;
    }
    const found = list
      .filter(
        (q) =>
          normalizeSearch([q.client, q.title, q.number].join(" ")).includes(
            search,
          ) &&
          (!status || (q.status || "Brouillon") === status) &&
          (!from || q.date >= from) &&
          (!to || q.date <= to),
      )
      .sort((a, b) =>
        sort === "totalDown"
          ? totals(b).ttc - totals(a).ttc
          : sort === "dateUp"
            ? String(a.date).localeCompare(b.date)
            : sort === "dateDown"
              ? String(b.date).localeCompare(a.date)
              : String(b.updated).localeCompare(a.updated),
      );
    $("quoteResultCount").textContent =
      `${found.length} résultat(s) · ${money(found.reduce((s, q) => s + totals(q).ttc, 0))} TTC`;
    $("quoteList").innerHTML =
      found
        .map(
          (q) =>
            `<article class="quote-card"><div class="row wrap"><div><strong>${esc(q.client || "Brouillon sans client")}</strong><p class="muted">${esc(q.number)}${q.revision ? " · Version " + q.revision : ""} · ${esc(q.date)}<br>${esc(q.title)}</p></div><strong>${money(totals(q).ttc)}</strong></div><span class="pill quote-status">${esc(q.status || "Brouillon")}${q.locked ? " · Verrouillé" : ""}</span><div class="actions"><button class="secondary" data-open="${esc(q.id)}">Ouvrir</button><button class="secondary" data-copy="${esc(q.id)}">Dupliquer</button></div></article>`,
        )
        .join("") ||
      '<p class="empty">Aucun devis ne correspond à ces critères.</p>';
    document.querySelectorAll("[data-open]").forEach(
      (b) =>
        (b.onclick = () => {
          draft = structuredClone(list.find((q) => q.id === b.dataset.open));
          quoteCatalogState = null;
          render();
        }),
    );
    document
      .querySelectorAll("[data-copy]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            duplicateQuoteDialog(list.find((q) => q.id === b.dataset.copy))),
      );
  };
  ["search", "f-quoteFrom", "f-quoteTo"].forEach(
    (id) => ($(id).oninput = results),
  );
  ["f-quoteStatus", "f-quoteSort"].forEach((id) => ($(id).onchange = results));
  $("clearQuoteFilters").onclick = () => {
    ["search", "f-quoteStatus", "f-quoteFrom", "f-quoteTo"].forEach(
      (id) => ($(id).value = ""),
    );
    $("f-quoteSort").value = "updated";
    results();
  };
  results();
}
