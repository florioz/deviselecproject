"use strict";
const KEY = "deviselec.v1",
  $ = (id) => document.getElementById(id),
  uid = () => crypto.randomUUID(),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    ),
  money = (n) =>
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
    }).format(n || 0),
  round = (n) => Math.round((n + Number.EPSILON) * 100) / 100,
  today = () => new Date().toLocaleDateString("en-CA"),
  num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
let db;
try {
  db = JSON.parse(localStorage.getItem(KEY));
} catch (e) {}
if (!db)
  db = { version: 1, companies: [], quotes: [], catalog: [], active: null };
let tab = "quotes",
  draft = null;
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
    return true;
  } catch (e) {
    alert(
      "Stockage saturé : exportez une sauvegarde. Vos dernières modifications ne sont pas enregistrées.",
    );
    return false;
  }
}
function toast(s) {
  $("toast").textContent = s;
  $("toast").style.display = "block";
  setTimeout(() => ($("toast").style.display = "none"), 3200);
}
const company = () => db.companies.find((c) => c.id === db.active);
function field(name, label, value = "", type = "text", extra = "") {
  return `<div class="field"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}></div>`;
}
function area(name, label, value = "") {
  return `<div class="field full"><label for="f-${name}">${label}</label><textarea id="f-${name}" name="${name}">${esc(value)}</textarea></div>`;
}
function select(name, label, opts, value) {
  return `<div class="field"><label for="f-${name}">${label}</label><select id="f-${name}" name="${name}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(value) === String(v) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div>`;
}
function modal(html) {
  $("dialog").innerHTML = html;
  $("dialog").showModal();
}
function closeModal() {
  $("dialog").close();
}
function render() {
  $("companySelect").innerHTML = db.companies.length
    ? db.companies
        .map(
          (c) =>
            `<option value="${c.id}" ${c.id === db.active ? "selected" : ""}>${esc(c.name)}</option>`,
        )
        .join("")
    : "<option>Créez votre entreprise</option>";
  $("nav").innerHTML = [
    ["quotes", "Mes devis"],
    ["catalog", "Catalogue"],
    ["company", "Entreprise"],
    ["settings", "Données"],
  ]
    .map(
      ([id, label]) =>
        `<button data-tab="${id}" class="${tab === id ? "active" : ""}">${label}</button>`,
    )
    .join("");
  document
    .querySelectorAll("[data-tab]")
    .forEach((b) => (b.onclick = () => navigate(b.dataset.tab)));
  if (tab === "company") renderCompany();
  else if (tab === "catalog") renderCatalog();
  else if (tab === "settings") renderSettings();
  else if (draft) renderEditor();
  else renderQuotes();
}
function navigate(next) {
  if (
    draft &&
    !confirm(
      "Quitter le devis ? Les modifications non enregistrées seront perdues.",
    )
  )
    return;
  draft = null;
  tab = next;
  render();
}
$("companySelect").onchange = (e) => {
  if (
    draft &&
    !confirm(
      "Changer d’entreprise et quitter les modifications non enregistrées ?",
    )
  ) {
    render();
    return;
  }
  db.active = e.target.value;
  draft = null;
  save();
  render();
};
function renderCompany() {
  const c = company() || {};
  $("main").innerHTML =
    `<div class="row"><h1>Mon entreprise</h1><button id="newCompany" class="secondary">+ Ajouter</button></div><p class="muted">Chaque entreprise possède ses devis, son catalogue et ses réglages. Les profils restent sur cet appareil.</p><form id="companyForm" class="card"><h2>Identité professionnelle</h2><div class="grid">${field("name", "Nom commercial / raison sociale *", c.name, "text", "required")}${field("legal", "Forme juridique et capital", c.legal)}${field("siret", "SIRET", c.siret, "text", 'inputmode="numeric" pattern="[0-9 ]{14,18}"')}${field("vatId", "Numéro de TVA intracommunautaire", c.vatId)}${area("address", "Adresse complète", c.address)}${field("email", "E-mail", c.email, "email")}${field("phone", "Téléphone", c.phone, "tel")}${area("insurance", "Assurance professionnelle : assureur, coordonnées, contrat, couverture géographique", c.insurance)}${field("rate", "Tarif horaire HT (€)", c.rate ?? 45, "number", 'min="0" step="0.01" required')}${field("markup", "Majoration du prix d’achat (%)", c.markup ?? 30, "number", 'min="0" step="0.1" required')}${select(
      "vat",
      "TVA par défaut",
      [
        [20, "20 %"],
        [10, "10 %"],
        [5.5, "5,5 %"],
        [0, "0 %"],
      ],
      c.vat ?? 20,
    )}${field("validity", "Validité du devis (jours)", c.validity ?? 30, "number", 'min="1" max="365" required')}${area("terms", "Conditions de paiement et d’exécution", c.terms || "Acompte de 30 % à la commande. Solde à la réception des travaux. Planning à convenir avec le client.")}${area("vatNote", "Mention TVA (si nécessaire)", c.vatNote)}<div class="full"><label>Logo (PNG, JPEG ou WebP)</label><input id="logoInput" type="file" accept="image/png,image/jpeg,image/webp">${c.logo ? `<img src="${esc(c.logo)}" alt="Logo" style="max-height:65px;margin-top:10px"><label><input type="checkbox" name="removeLogo" style="width:auto;min-height:0"> Retirer le logo</label>` : ""}</div></div><button type="submit">Enregistrer l’entreprise</button></form>`;
  $("newCompany").onclick = () => {
    db.active = null;
    renderCompany();
  };
  $("companyForm").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    if (form.dataset.saving) return;
    form.dataset.saving = "true";
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
      let values = Object.fromEntries(new FormData(e.target));
      let logo = c.logo || "";
      const file = $("logoInput").files[0];
      if (file) {
        logo = await $("companyForm").logoPromise;
        if (!logo) {
          toast("Choisissez une image lisible pour le logo");
          return;
        }
      }
      if (values.removeLogo) logo = "";
      let next = {
        ...values,
        id: c.id || uid(),
        logo,
        rate: num(values.rate),
        markup: num(values.markup),
        vat: num(values.vat),
        validity: num(values.validity),
        nextNumber: c.nextNumber || 1,
      };
      delete next.removeLogo;
      if (c.id)
        db.companies = db.companies.map((x) => (x.id === c.id ? next : x));
      else db.companies.push(next);
      db.active = next.id;
      if (save()) {
        toast("Entreprise enregistrée");
        render();
      }
    } finally {
      delete form.dataset.saving;
      submitButton.disabled = false;
    }
  };
  attachCompanyHelpers(c);
}
function renderQuotes() {
  const list = db.quotes
    .filter((q) => q.companyId === db.active)
    .sort((a, b) => b.updated.localeCompare(a.updated));
  $("main").innerHTML =
    `<div class="row"><h1>Mes devis</h1><span class="pill">Hors connexion</span></div><p class="muted">Du premier chiffrage au document client.</p><button id="newQuote">+ Créer un devis</button><div class="card"><div class="row"><h2>${list.length} devis enregistré${list.length > 1 ? "s" : ""}</h2></div><input id="search" placeholder="Rechercher un client, un chantier…" aria-label="Rechercher un devis"><div id="quoteList"></div></div>`;
  $("newQuote").onclick = () => {
    if (!company()) {
      tab = "company";
      render();
      toast("Commencez par créer votre entreprise");
      return;
    }
    newQuote();
  };
  function results() {
    let s = $("search").value.toLowerCase();
    $("quoteList").innerHTML =
      list
        .filter((q) =>
          (q.client + q.title + q.number).toLowerCase().includes(s),
        )
        .map(
          (q) =>
            `<div class="line"><div class="row"><div><strong>${esc(q.client)}</strong><div class="muted">${esc(q.number)} · ${esc(q.title)}</div></div><strong>${money(totals(q).ttc)}</strong></div><div class="actions"><button class="secondary" data-open="${q.id}">Ouvrir</button><button class="secondary" data-copy="${q.id}">Dupliquer</button></div></div>`,
        )
        .join("") ||
      '<div class="empty">Vos prochains devis apparaîtront ici.</div>';
    document.querySelectorAll("[data-open]").forEach(
      (b) =>
        (b.onclick = () => {
          draft = structuredClone(
            db.quotes.find((q) => q.id === b.dataset.open),
          );
          render();
        }),
    );
    document.querySelectorAll("[data-copy]").forEach(
      (b) =>
        (b.onclick = () => {
          newQuote(db.quotes.find((q) => q.id === b.dataset.copy));
        }),
    );
  }
  $("search").oninput = results;
  results();
}
function newQuote(source) {
  const c = company();
  draft = source
    ? structuredClone(source)
    : {
        client: "",
        email: "",
        clientAddress: "",
        site: "",
        title: "Travaux électriques",
        lines: [],
        discount: 0,
        notes: "",
        mode: "hourly",
        status: "Brouillon",
      };
  Object.assign(draft, {
    id: uid(),
    companyId: c.id,
    number: `DEV-${new Date().getFullYear()}-${String(c.nextNumber).padStart(4, "0")}`,
    date: today(),
    validity: c.validity,
    terms: c.terms,
    vatNote: c.vatNote,
    company: structuredClone(c),
    updated: new Date().toISOString(),
  });
  tab = "quotes";
  render();
}
function totals(q) {
  let base = q.lines.reduce((s, l) => s + round(l.qty * l.price), 0),
    discount = round((base * num(q.discount)) / 100);
  let groups = {};
  q.lines.forEach((l) => {
    let amount = round(l.qty * l.price * (1 - num(q.discount) / 100));
    groups[l.vat] = round((groups[l.vat] || 0) + amount);
  });
  let ht = round(Object.values(groups).reduce((s, n) => s + n, 0)),
    tax = round(
      Object.entries(groups).reduce(
        (s, [v, n]) => s + round((n * num(v)) / 100),
        0,
      ),
    );
  return { base, discount, ht, tax, ttc: round(ht + tax), groups };
}
function capture() {
  if (!$("quoteForm")) return;
  Object.assign(draft, Object.fromEntries(new FormData($("quoteForm"))));
  draft.discount = num(draft.discount);
  draft.validity = num(draft.validity);
}
function renderEditor() {
  let q = draft,
    t = totals(q);
  $("main").innerHTML =
    `<div class="row"><div><p class="muted">${esc(q.number)}</p><h1>Nouveau chiffrage</h1></div><button id="back" class="secondary">Fermer</button></div><form id="quoteForm"><section class="card"><h2>Client et chantier</h2><div class="grid">${field("client", "Nom du client *", q.client, "text", "required")}${field("email", "E-mail du client", q.email, "email")}${area("clientAddress", "Adresse du client *", q.clientAddress)}${field("title", "Objet du devis *", q.title, "text", "required")}${field("site", "Adresse du chantier", q.site)}${field("date", "Date du devis *", q.date, "date", "required")}${field("validity", "Validité (jours)", q.validity, "number", 'min="1" max="365" required')}${select(
      "mode",
      "Mode de tarification",
      [
        ["hourly", "Matériel + main-d’œuvre horaire"],
        ["package", "Forfaits par prestation"],
        ["mixed", "Mixte : matériel, heures et forfaits"],
      ],
      q.mode,
    )}${select(
      "status",
      "Suivi",
      [
        ["Brouillon", "Brouillon"],
        ["Envoyé", "Envoyé"],
        ["Accepté", "Accepté"],
        ["Refusé", "Refusé"],
      ],
      q.status,
    )}</div></section><section class="card"><h2>Matériel et prestations</h2><p class="muted">${q.mode === "package" ? "Ajoutez vos prestations avec un prix forfaitaire." : q.mode === "mixed" ? "Combinez librement matériel, heures et prestations." : "Ajoutez les fournitures et les heures de main-d’œuvre."}</p>${q.lines.map((l, i) => `<div class="line"><div class="row"><div><strong>${esc(l.label)}</strong><div class="muted">${l.qty} ${esc(l.unit)} × ${money(l.price)} HT · TVA ${l.vat} %</div>${l.ref ? `<div class="muted">Réf. ${esc(l.ref)}</div>` : ""}</div><strong>${money(round(l.qty * l.price))}</strong></div><div class="actions"><button type="button" class="secondary" data-edit="${i}">Modifier</button><button type="button" class="danger" data-remove="${i}">Retirer</button></div></div>`).join("") || '<p class="empty">Ajoutez votre première ligne.</p>'}<div class="actions"><button id="addLine" type="button">+ Ligne libre</button><button id="fromCatalog" type="button" class="secondary">Depuis le catalogue</button></div></section><section class="card"><h2>Conditions et ajustements</h2>${field("discount", "Remise globale (%)", q.discount, "number", 'min="0" max="100" step="0.1" required')}${area("terms", "Paiement et conditions d’exécution", q.terms)}${area("vatNote", "Mention TVA", q.vatNote)}${area("notes", "Précisions et exclusions", q.notes)}</section><section id="summary" class="card total"></section><div class="actions"><button type="submit">Enregistrer</button><button type="button" id="pdf" class="secondary">Générer le PDF</button></div><p class="muted">Les modifications sont sauvegardées avec le bouton Enregistrer. Les prix du devis restent indépendants du catalogue.</p></form>`;
  function summary() {
    const t = totals(draft);
    $("summary").innerHTML =
      `<div class="row"><span>Fournitures et prestations HT</span><span>${money(t.base)}</span></div><div class="row"><span>Remise ${draft.discount} %</span><span>− ${money(t.discount)}</span></div><div class="row"><span>Total HT après remise</span><strong>${money(t.ht)}</strong></div><div class="row"><span>TVA</span><span>${money(t.tax)}</span></div><div class="row"><span>Total TTC</span><span class="money">${money(t.ttc)}</span></div>`;
  }
  summary();
  $("quoteForm").onchange = () => {
    capture();
    summary();
  };
  $("f-mode").onchange = () => {
    capture();
    renderEditor();
  };
  $("f-discount").oninput = () => {
    capture();
    summary();
  };
  $("back").onclick = () => navigate("quotes");
  $("addLine").onclick = () => {
    capture();
    lineModal();
  };
  $("fromCatalog").onclick = () => {
    capture();
    pickCatalog();
  };
  document.querySelectorAll("[data-edit]").forEach(
    (b) =>
      (b.onclick = () => {
        capture();
        lineModal(num(b.dataset.edit));
      }),
  );
  document.querySelectorAll("[data-remove]").forEach(
    (b) =>
      (b.onclick = () => {
        capture();
        draft.lines.splice(num(b.dataset.remove), 1);
        renderEditor();
      }),
  );
  $("quoteForm").onsubmit = (e) => {
    e.preventDefault();
    capture();
    storeQuote();
  };
  $("pdf").onclick = () => {
    if (!$("quoteForm").reportValidity()) return;
    capture();
    if (!draft.clientAddress.trim()) {
      alert("Renseignez l’adresse du client avant de générer le PDF.");
      return;
    }
    if (!draft.lines.length) {
      alert("Ajoutez au moins une ligne.");
      return;
    }
    if (!storeQuote()) return;
    printQuote(draft);
  };
  attachQuoteHelpers();
}
function storeQuote() {
  if (!draft.lines.length) {
    toast("Ajoutez au moins une ligne");
    return false;
  }
  draft.updated = new Date().toISOString();
  let existing = db.quotes.findIndex((q) => q.id === draft.id);
  if (existing < 0) {
    db.quotes.push(structuredClone(draft));
    const c = company();
    c.nextNumber++;
  } else db.quotes[existing] = structuredClone(draft);
  if (!save()) return false;
  toast("Devis enregistré");
  return true;
}
function lineModal(index, source) {
  const c = company(),
    l =
      index !== undefined
        ? draft.lines[index]
        : source || {
            kind: draft.mode === "package" ? "service" : "material",
            label: "",
            qty: 1,
            unit: "u",
            cost: 0,
            markup: c.markup,
            price: 0,
            vat: c.vat,
            ref: "",
            url: "",
            checked: "",
          };
  modal(
    `<h2>${index === undefined ? "Ajouter une ligne" : "Modifier la ligne"}</h2><form id="lineForm"><div class="grid">${select(
      "kind",
      "Type",
      [
        ["material", "Matériel"],
        ["labor", "Main-d’œuvre"],
        ["service", "Prestation / forfait"],
      ],
      l.kind,
    )}${field("label", "Désignation *", l.label, "text", "required")}${field("qty", "Quantité *", l.qty, "number", 'min="0.001" max="1000000" step="0.001" required')}${select(
      "unit",
      "Unité",
      [
        ["u", "Unité"],
        ["m", "Mètre"],
        ["h", "Heure"],
        ["forfait", "Forfait"],
        ["lot", "Lot"],
      ],
      l.unit,
    )}${field("cost", "Prix d’achat unitaire HT (€)", l.cost, "number", 'min="0" step="0.01" required')}${field("markup", "Majoration achat (%)", l.markup, "number", 'min="0" step="0.1" required')}${field("price", "Prix de vente unitaire HT (€) *", l.price, "number", 'min="0" max="10000000" step="0.01" required')}${select(
      "vat",
      "TVA",
      [
        [20, "20 %"],
        [10, "10 %"],
        [5.5, "5,5 %"],
        [0, "0 %"],
      ],
      l.vat,
    )}${field("ref", "Référence fabricant", l.ref)}${field("url", "Lien produit 123elec", l.url, "url")}${field("checked", "Date de vérification du prix", l.checked, "date")}</div><p class="muted">La majoration s’applique au prix d’achat HT. Le prix de vente reste ajustable. Vérifiez les taux de TVA selon votre chantier.</p><div class="actions"><button type="submit">Valider</button><button type="button" class="secondary" onclick="closeModal()">Annuler</button></div></form>`,
  );
  const calc = () => {
    $("f-price").value = round(
      num($("f-cost").value) * (1 + num($("f-markup").value) / 100),
    );
  };
  $("f-cost").oninput = calc;
  $("f-markup").oninput = calc;
  $("f-kind").onchange = () => {
    if ($("f-kind").value === "labor") {
      $("f-unit").value = "h";
      $("f-price").value = c.rate;
    } else if ($("f-kind").value === "service") $("f-unit").value = "forfait";
  };
  $("lineForm").onsubmit = (e) => {
    e.preventDefault();
    let v = { ...l, ...Object.fromEntries(new FormData(e.target)) };
    ["qty", "cost", "markup", "price", "vat"].forEach(
      (k) => (v[k] = num(v[k])),
    );
    if (index !== undefined) draft.lines[index] = v;
    else draft.lines.push(v);
    closeModal();
    renderEditor();
  };
  attachLineHelpers(l);
}
function renderSettings() {
  $("main").innerHTML =
    `<h1>Mes données</h1><section class="card"><h2>Stockage local</h2><p>Les profils, catalogues et devis sont conservés sur ce téléphone. Exportez régulièrement une sauvegarde et avant de désinstaller l’application.</p><p class="muted">${db.companies.length} entreprise(s) · ${db.quotes.length} devis · ${db.catalog.length} référence(s)</p><div class="actions"><button id="backup">Exporter la sauvegarde</button><button id="restore" class="secondary">Restaurer</button></div></section><section class="card"><h2>Deviselec · 0.3.0</h2><p class="muted">Profils d’entreprise locaux : pas de compte en ligne ni de synchronisation entre téléphones dans cette version. Le PDF s’enregistre depuis la fenêtre Android « Enregistrer au format PDF ».</p></section>`;
  $("backup").onclick = () => {
    if (window.Android) Android.backup(JSON.stringify(db));
    else {
      let a = document.createElement("a");
      a.href = URL.createObjectURL(
        new Blob([JSON.stringify(db)], { type: "application/json" }),
      );
      a.download = "deviselec-sauvegarde.json";
      a.click();
      URL.revokeObjectURL(a.href);
    }
  };
  $("restore").onclick = () => {
    if (window.Android) Android.restore();
    else toast("Restauration disponible dans l’application Android");
  };
}
function restoreData(text) {
  try {
    const v = JSON.parse(text);
    if (
      v.version !== 1 ||
      !Array.isArray(v.companies) ||
      !Array.isArray(v.quotes) ||
      !Array.isArray(v.catalog)
    )
      throw Error();
    if (
      v.companies.some((c) => !c.id || typeof c.name !== "string") ||
      v.quotes.some((q) => !q.id || !Array.isArray(q.lines) || !q.company)
    )
      throw Error();
    if (!confirm("Remplacer toutes les données locales par cette sauvegarde ?"))
      return;
    db = v;
    if (!company()) db.active = db.companies[0]?.id || null;
    if (save()) {
      draft = null;
      render();
      toast("Sauvegarde restaurée");
    }
  } catch (e) {
    alert("Sauvegarde invalide ou incompatible.");
  }
}
function pdfHtml(q) {
  const c = q.company,
    t = totals(q),
    date = new Date(q.date + "T12:00:00"),
    expiry = new Date(date);
  expiry.setDate(date.getDate() + num(q.validity));
  const br = (s) => esc(s).replace(/\n/g, "<br>");
  return `<!doctype html><html lang="fr"><meta charset="UTF-8"><title>${esc(q.number)}</title><style>@page{size:A4;margin:14mm}body{font:11px Arial,sans-serif;color:#233a46;line-height:1.5}h1{font-size:30px;letter-spacing:2px;color:#087f77;margin:0}h2{font-size:15px;margin:0 0 8px}p{margin:5px 0}.head{width:100%;border-bottom:3px solid #087f77;padding-bottom:16px}.head td{vertical-align:top}.head td:last-child{text-align:right}.logo{max-width:150px;max-height:65px;margin-bottom:8px}.boxes{width:100%;margin:20px 0}.boxes td{width:50%;vertical-align:top;padding:12px;background:#f2f6f7}.lines{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:15px}.lines th{background:#173846;color:white;text-align:left;padding:9px 6px;font-size:10px}.lines td{border-bottom:1px solid #dce5e9;padding:9px 6px;vertical-align:top;overflow-wrap:anywhere}.lines tr{break-inside:avoid}.lines thead{display:table-header-group}.right{text-align:right}.totals{margin:18px 0 18px auto;width:48%;break-inside:avoid}.totals td{padding:5px}.grand{background:#173846;color:white;font-weight:bold;font-size:15px}.section{margin:18px 0;break-inside:avoid}.muted{color:#637984;font-size:10px}.sign{border:1px solid #cddadd;padding:12px;min-height:95px;break-inside:avoid}.footer{border-top:1px solid #cddadd;margin-top:20px;padding-top:9px;font-size:9px;color:#637984;overflow-wrap:anywhere}</style><body><table class="head"><tr><td>${c.logo ? `<img class="logo" src="${esc(c.logo)}"><br>` : ""}<h2>${esc(c.name)}</h2>${br(c.address)}<p>${esc(c.phone)}${c.email ? " · " + esc(c.email) : ""}</p></td><td><h1>DEVIS</h1><strong>${esc(q.number)}</strong><p>Émis le ${date.toLocaleDateString("fr-FR")}</p><p>Valable jusqu’au ${expiry.toLocaleDateString("fr-FR")}</p></td></tr></table><table class="boxes"><tr><td><h2>Client</h2><strong>${esc(q.client)}</strong><br>${br(q.clientAddress)}<p>${esc(q.email)}</p></td><td><h2>Chantier</h2><strong>${esc(q.title)}</strong><p>${br(q.site || q.clientAddress)}</p></td></tr></table><table class="lines"><colgroup><col style="width:43%"><col style="width:10%"><col style="width:9%"><col style="width:14%"><col style="width:9%"><col style="width:15%"></colgroup><thead><tr><th>Désignation</th><th>Qté</th><th>Unité</th><th>P.U. HT</th><th>TVA</th><th>Total HT</th></tr></thead><tbody>${q.lines.map((l) => `<tr><td><strong>${esc(l.label)}</strong>${l.ref ? `<br><span class="muted">Réf. ${esc(l.ref)}</span>` : ""}</td><td>${l.qty}</td><td>${esc(l.unit)}</td><td>${money(l.price)}</td><td>${l.vat} %</td><td class="right">${money(round(l.qty * l.price))}</td></tr>`).join("")}</tbody></table><table class="totals"><tr><td>Sous-total HT</td><td class="right">${money(t.base)}</td></tr>${q.discount ? `<tr><td>Remise ${q.discount} %</td><td class="right">− ${money(t.discount)}</td></tr>` : ""}<tr><td>Total HT</td><td class="right">${money(t.ht)}</td></tr>${Object.entries(
    t.groups,
  )
    .map(
      ([v, b]) =>
        `<tr><td>TVA ${v} % (base ${money(b)})</td><td class="right">${money(round((b * num(v)) / 100))}</td></tr>`,
    )
    .join(
      "",
    )}<tr class="grand"><td>Total TTC</td><td class="right">${money(t.ttc)}</td></tr></table>${q.vatNote ? `<p>${br(q.vatNote)}</p>` : ""}<div class="section"><h2>Paiement et exécution</h2>${br(q.terms)}</div>${q.notes ? `<div class="section"><h2>Précisions et exclusions</h2>${br(q.notes)}</div>` : ""}<div class="sign"><strong>Bon pour accord</strong><br>Date et lieu :<br>Nom et signature du client :</div><div class="footer"><strong>${esc(c.name)}</strong> ${esc(c.legal)}<br>${br(c.address)}<br>${c.siret ? "SIRET : " + esc(c.siret) : ""}${c.vatId ? " · TVA : " + esc(c.vatId) : ""}${c.insurance ? "<br>Assurance : " + br(c.insurance) : ""}</div></body></html>`;
}
function printQuote(q) {
  const html = pdfHtml(q);
  if (window.Android) Android.pdf(html, q.number);
  else {
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      w.onload = () => w.print();
    }
  }
}
