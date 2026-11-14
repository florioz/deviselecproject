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
  roundQuantity = (n) => Math.round((n + Number.EPSILON) * 1000) / 1000,
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
function save(options = {}) {
  try {
    const previous = localStorage.getItem(KEY);
    const current = JSON.stringify(db);
    localStorage.setItem(KEY, current);
    queueRecoveryCheckpoint(previous, current, options);
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
  const heading = $("dialog").querySelector("h2");
  if (heading) {
    heading.tabIndex = -1;
    heading.setAttribute("autofocus", "");
  }
  $("dialog").showModal();
}
function closeModal() {
  $("dialog").close();
}
function render() {
  delete document.body.dataset.quoteMode;
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
    ["clients", "Clients"],
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
  else if (tab === "clients") renderClients();
  else if (tab === "settings") renderSettings();
  else if (draft) renderEditor();
  else renderQuotes();
}
function navigate(next) {
  if (draft) {
    capture();
    if (!storeQuote(true)) return;
  }
  draft = null;
  clientReturnQuote = null;
  tab = next;
  render();
}
$("companySelect").onchange = (event) => {
  if (draft) {
    capture();
    if (!storeQuote(true)) {
      render();
      return;
    }
  }
  db.active = event.target.value;
  draft = null;
  clientReturnQuote = null;
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
        internalHourlyCost: values.internalHourlyCost === "" ? null : num(values.internalHourlyCost),
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
  const costs = document.createElement("details");
  costs.className = "full";
  costs.innerHTML = `<summary>Coût interne pour estimer la rentabilité</summary>${field("internalHourlyCost", "Coût horaire interne estimé HT (€ / h)", c.internalHourlyCost ?? "", "number", 'min="0" max="1000000" step="0.01"')}`;
  $("companyForm").querySelector(".grid").append(costs);
  attachCompanyHelpers();
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
    terms: source ? source.terms : c.terms,
    vatNote: source ? source.vatNote : c.vatNote,
    company: structuredClone(c),
    updated: new Date().toISOString(),
  });
  draft.status = "Brouillon";
  delete draft.locked;
  delete draft.lockedAt;
  delete draft.versionRoot;
  delete draft.revision;
  delete draft.supersedes;
  delete draft.previousNumber;
  draft.stage = 0;
  quoteCatalogState = null;
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
  if (draft.priceAgeDays !== undefined) draft.priceAgeDays = num(draft.priceAgeDays, 90);
}
function lineModal(index, source) {
  if (isQuoteLocked(draft)) return;
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
            room: draft.activeRoom || "",
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
    )}${field("room", "Pièce du chantier (facultatif)", l.room || "", "text", 'maxlength="100" list="lineRooms"')}<datalist id="lineRooms">${roomNames()
      .map((r) => `<option value="${esc(r)}">`)
      .join(
        "",
      )}</datalist>${field("ref", "Référence fabricant", l.ref)}${field("url", "Lien produit 123elec", l.url, "url")}${field("checked", "Date de vérification du prix", l.checked, "date")}</div><p class="muted">La majoration s’applique au prix d’achat HT. Le prix de vente reste ajustable. Les taux de TVA se règlent dans Conditions et PDF.</p><div class="actions"><button type="submit">Valider</button><button type="button" class="secondary" onclick="closeModal()">Annuler</button></div></form>`,
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
    v.room = v.room.trim();
    v.needsPrice = false;
    if (index !== undefined) draft.lines[index] = v;
    else draft.lines.push(v);
    storeQuote(true);
    closeModal();
    renderEditor();
  };
  attachLineHelpers(l);
  if (draft.stage !== 2) {
    const vatField = $("f-vat");
    vatField.closest(".field").hidden = true;
  }
  addClosedChoices($("f-room"), roomNames(), "lineRoomChoice", "Nouvelle pièce…");
  if (index !== undefined) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger";
    remove.textContent = "Retirer la ligne";
    remove.onclick = () => {
      draft.lines.splice(index, 1);
      storeQuote(true);
      closeModal();
      renderEditor();
    };
    $("lineForm").append(remove);
  }
}
function renderSettings() {
  $("main").innerHTML =
    `<h1>Mes données</h1><section class="card"><h2>Stockage local</h2><p>Les profils, catalogues et devis sont conservés sur ce téléphone. Exportez régulièrement une sauvegarde et avant de désinstaller l’application.</p><p class="muted">${db.companies.length} entreprise(s) · ${db.quotes.length} devis · ${db.catalog.length} référence(s) · ${(db.clients || []).length} clients · ${(db.workKits || []).length} kits · ${(db.laborPresets || []).length} forfaits</p><p class="muted">La sauvegarde comprend les logos, clients, devis avec leurs pièces et prix enregistrés, références personnelles, favoris, kits et forfaits. Les photos du catalogue et sa base fournisseur actualisée ne sont pas incluses : elles peuvent être rechargées depuis Catalogue.</p><div class="actions"><button id="backup">Exporter la sauvegarde</button><button id="restore" class="secondary">Restaurer</button></div></section><section class="card"><h2>Deviselec · 0.7.1</h2><p class="muted">Profils d’entreprise locaux : pas de compte en ligne ni de synchronisation entre téléphones dans cette version. Le PDF s’enregistre depuis la fenêtre Android « Enregistrer au format PDF ».</p></section>`;
  $("backup").onclick = () => {
    const backup = JSON.stringify({
      ...db,
      backupInfo: {
        app: "Deviselec",
        version: "0.7.1",
        exportedAt: new Date().toISOString(),
      },
    });
    exportTextFile(backup, "deviselec-sauvegarde.json", "application/json");
  };
  $("restore").onclick = () => {
    if (window.Android) Android.restore();
    else {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        if (file.size > 20 * 1024 * 1024)
          return alert("Sauvegarde trop volumineuse (20 Mo maximum).");
        try {
          restoreData(await file.text());
        } catch (e) {
          alert("Impossible de lire ce fichier.");
        }
      };
      input.click();
    }
  };
  mountRecoveryPanel();
}
