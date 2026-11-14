"use strict";

const QUOTE_STATUSES = ["Brouillon", "Envoyé", "Accepté", "Refusé"];
function roomNames(q = draft) {
  return [
    ...new Set(
      [...(q.rooms || []), ...q.lines.map((l) => l.room)].filter(Boolean),
    ),
  ];
}
function orderedQuoteLines(q) {
  return ["", ...roomNames(q)].flatMap((room) =>
    q.lines.filter((l) => (l.room || "") === room),
  );
}
function roomOptions(value = "") {
  return [
    ["", "Sans pièce / ensemble du chantier"],
    ...roomNames().map((r) => [r, r]),
  ];
}
function mountWorkTools() {
  const block = document.createElement("section");
  block.className = "card work-tools";
  block.innerHTML = `<div class="work-room">${select("activeRoom", "Pièce pour les ajouts", roomOptions(), draft.activeRoom || "")}<button id="addRoom" class="secondary">+ Pièce</button></div>
    <div class="actions work-primary"><button id="openKits">Kits de travaux</button><button id="openLabor" class="secondary">Main-d’œuvre / forfaits</button></div>
    <details class="filter-details"><summary>Gérer les pièces et mes kits</summary><div class="actions"><button id="copyRoom" class="secondary">Dupliquer la pièce</button><button id="renameRoom" class="text-button">Renommer la pièce</button><button id="saveKitSelection" class="text-button">Enregistrer la sélection comme kit</button></div></details>`;
  $("catalogBrowser").before(block);
  $("f-activeRoom").onchange = (e) => {
    draft.activeRoom = e.target.value;
    storeQuote(true);
    renderEditor();
  };
  $("addRoom").onclick = () => roomDialog("add");
  $("copyRoom").onclick = () => roomDialog("copy");
  $("renameRoom").onclick = () => roomDialog("rename");
  $("openKits").onclick = openKits;
  $("openLabor").onclick = openLabor;
  $("saveKitSelection").onclick = () => {
    const lines = draft.lines.filter(
      (l) => !draft.activeRoom || l.room === draft.activeRoom,
    );
    if (!lines.length)
      return toast("Ajoutez d’abord du matériel ou une prestation");
    editWorkKit({
      name: "Mon kit de travaux",
      lines: structuredClone(lines).map((l) => ({ ...l, room: "" })),
    });
  };
}
function roomDialog(mode) {
  const current = draft.activeRoom || "";
  if (mode !== "add" && !current) return toast("Choisissez d’abord une pièce");
  modal(
    `<h2>${mode === "copy" ? "Dupliquer" : mode === "rename" ? "Renommer" : "Ajouter"} une pièce</h2><form id="roomForm">${field("roomName", "Nom de la pièce", mode === "copy" ? current + " (copie)" : mode === "rename" ? current : "", "text", 'required maxlength="100" list="usualRooms"')}<datalist id="usualRooms">${["Cuisine", "Salon", "Chambre 1", "Chambre 2", "Salle de bains", "Garage", "Extérieur"].map((r) => `<option value="${r}">`).join("")}</datalist><p class="muted">${mode === "copy" ? "Les quantités, références et prix de cette pièce seront copiés. Les totaux du devis augmenteront." : "Chaque ligne pourra être déplacée depuis ses détails."}</p><div class="actions"><button>Valider</button><button type="button" class="secondary" onclick="closeModal()">Annuler</button></div></form>`,
  );
  $("roomForm").onsubmit = (e) => {
    e.preventDefault();
    const name = $("f-roomName").value.trim();
    if (
      !name ||
      roomNames().some(
        (r) =>
          normalizeSearch(r) === normalizeSearch(name) &&
          !(mode === "rename" && r === current),
      )
    )
      return toast("Choisissez un nom de pièce unique");
    const names = roomNames();
    if (mode === "rename") {
      draft.rooms = names.map((r) => (r === current ? name : r));
      draft.lines.forEach((l) => {
        if (l.room === current) l.room = name;
      });
    } else {
      draft.rooms = [...names, name];
      if (mode === "copy")
        draft.lines.push(
          ...structuredClone(draft.lines.filter((l) => l.room === current)).map(
            (l) => ({ ...l, room: name }),
          ),
        );
    }
    draft.activeRoom = name;
    storeQuote(true);
    closeModal();
    renderEditor();
  };
}

function defaultWorkKits() {
  const material = (label, qty = 1, unit = "u") => ({
    kind: "material",
    label,
    qty,
    unit,
    cost: null,
    price: "",
    markup: company().markup,
    vat: company().vat,
  });
  const labor = (label, qty) => ({
    kind: "labor",
    label,
    qty,
    unit: "h",
    cost: 0,
    markup: 0,
    price: company().rate,
    vat: company().vat,
  });
  return [
    {
      id: "template-socket",
      name: "Prise encastrée",
      template: true,
      lines: [
        material("Prise de courant à choisir"),
        material("Boîte d’encastrement à choisir"),
        labor("Pose et raccordement d’une prise", 0.5),
      ],
    },
    {
      id: "template-light",
      name: "Point lumineux",
      template: true,
      lines: [
        material("Dispositif DCL à choisir"),
        material("Boîte de connexion à choisir"),
        labor("Pose et raccordement d’un point lumineux", 0.5),
      ],
    },
    {
      id: "template-panel",
      name: "Remplacement de tableau",
      template: true,
      lines: [
        material("Coffret électrique à choisir"),
        material("Interrupteur différentiel à choisir"),
        material("Disjoncteurs à choisir"),
        labor("Remplacement du tableau et essais", 4),
      ],
    },
  ];
}
function ownWorkKits() {
  return (db.workKits || []).filter((k) => k.companyId === db.active);
}
function openKits() {
  modal(
    `<h2>Kits de travaux</h2><p class="muted">Modèles de départ à adapter : références, quantités et temps de pose. Ces modèles ne constituent pas une étude de l’installation.</p><div class="actions"><button id="newWorkKit">+ Mon kit</button><button class="secondary" onclick="closeModal()">Fermer</button></div><div id="workKitList"></div>`,
  );
  const kits = [...ownWorkKits(), ...defaultWorkKits()];
  $("workKitList").innerHTML = kits
    .map(
      (k, i) =>
        `<article class="line"><strong>${esc(k.name)}</strong><p class="muted">${k.lines.length} lignes · ${k.template ? "Modèle à configurer" : "Kit de votre entreprise"}</p><button class="secondary" data-kit="${i}">Configurer / ajouter</button></article>`,
    )
    .join("");
  document
    .querySelectorAll("[data-kit]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          editWorkKit(structuredClone(kits[Number(b.dataset.kit)]))),
    );
  $("newWorkKit").onclick = () => editWorkKit({ name: "Mon kit", lines: [] });
}
function editWorkKit(kit) {
  if ($("dialog").open) closeModal();
  modal(`<h2>Configurer le kit</h2><form id="kitForm">${field("kitName", "Nom du kit", kit.name, "text", 'required maxlength="120"')}
    <p class="notice">Choisissez les références adaptées et vérifiez les prix HT. Les durées proposées sont des estimations modifiables.</p>
    <div id="kitRows">${kit.lines
      .map(
        (
          l,
          i,
        ) => `<fieldset class="kit-row"><legend>${i + 1}. ${l.kind === "material" ? "Matériel" : "Main-d’œuvre / forfait"}</legend>
      <label>Désignation<input data-kit-field="label" data-row="${i}" value="${esc(l.label)}" required maxlength="500"></label>
      ${l.ref ? `<p class="muted">Réf. ${esc(l.ref)} · Prix relevé : ${esc(l.checked || "non daté")}</p>` : ""}
      <div class="grid"><label>Quantité<input type="number" data-kit-field="qty" data-row="${i}" value="${l.qty}" min="0.001" max="1000000" step="0.001" required></label>
      <label>Unité<select data-kit-field="unit" data-row="${i}">${["u", "m", "h", "forfait", "lot"].map((u) => `<option ${u === l.unit ? "selected" : ""}>${u}</option>`).join("")}</select></label>
      <label>Prix de vente HT / unité<input type="number" data-kit-field="price" data-row="${i}" value="${l.price ?? ""}" min="0" max="10000000" step="0.01" required></label>
      <label>TVA (%)<select data-kit-field="vat" data-row="${i}">${[20, 10, 5.5, 0].map((v) => `<option value="${v}" ${Number(l.vat) === v ? "selected" : ""}>${v}</option>`).join("")}</select></label></div>
      <div class="actions">${l.kind === "material" ? `<button type="button" class="secondary" data-kit-product="${i}">Choisir une référence</button>` : ""}<button type="button" class="danger" data-kit-remove="${i}">Retirer</button></div></fieldset>`,
      )
      .join("")}</div>
    <div class="actions"><button type="button" id="kitAddMaterial" class="secondary">+ Matériel</button><button type="button" id="kitAddLabor" class="secondary">+ Main-d’œuvre</button><button type="button" id="kitAddService" class="secondary">+ Forfait</button></div>
    <hr><div class="grid">${field("kitCount", "Nombre de kits à ajouter", 1, "number", 'min="0.001" max="1000000" step="0.001" required')}${select("kitRoom", "Pièce du chantier", roomOptions(), draft.activeRoom || "")}</div>
    <div class="actions"><button type="submit">Ajouter au devis</button><button type="button" id="saveWorkKit" class="secondary">Enregistrer ce kit</button><button type="button" class="secondary" id="backKits">Retour</button>${kit.companyId ? '<button type="button" id="deleteWorkKit" class="danger">Supprimer le kit</button>' : ""}</div></form>`);
  const captureKit = () => {
    kit.name = $("f-kitName").value.trim();
    document.querySelectorAll("[data-kit-field]").forEach((input) => {
      const key = input.dataset.kitField;
      kit.lines[Number(input.dataset.row)][key] =
        ["qty", "vat"].includes(key) || (key === "price" && input.value !== "")
          ? Number(input.value)
          : input.value;
    });
  };
  const validKit = () => {
    if (!$("kitForm").reportValidity()) return false;
    captureKit();
    if (
      !kit.name ||
      !kit.lines.length ||
      kit.lines.some((l) => !l.label.trim())
    ) {
      toast("Ajoutez au moins une ligne avec une désignation");
      return false;
    }
    return true;
  };
  document.querySelectorAll("[data-kit-product]").forEach(
    (b) =>
      (b.onclick = () => {
        captureKit();
        pickKitProduct(kit, Number(b.dataset.kitProduct));
      }),
  );
  document.querySelectorAll("[data-kit-remove]").forEach(
    (b) =>
      (b.onclick = () => {
        captureKit();
        kit.lines.splice(Number(b.dataset.kitRemove), 1);
        editWorkKit(kit);
      }),
  );
  ["Material", "Labor", "Service"].forEach(
    (type, i) =>
      ($("kitAdd" + type).onclick = () => {
        captureKit();
        kit.lines.push({
          kind: ["material", "labor", "service"][i],
          label: "",
          qty: 1,
          unit: ["u", "h", "forfait"][i],
          cost: i ? 0 : null,
          markup: i ? 0 : company().markup,
          price: i === 1 ? company().rate : "",
          vat: company().vat,
        });
        editWorkKit(kit);
      }),
  );
  $("backKits").onclick = () => {
    closeModal();
    openKits();
  };
  $("saveWorkKit").onclick = () => {
    if (!validKit()) return;
    const previous = db.workKits;
    const saved = {
      ...structuredClone(kit),
      id: kit.companyId ? kit.id : uid(),
      companyId: db.active,
      template: false,
    };
    db.workKits = [
      ...(db.workKits || []).filter((k) => k.id !== saved.id),
      saved,
    ];
    if (!save()) {
      db.workKits = previous;
      return;
    }
    kit = saved;
    toast("Kit enregistré pour cette entreprise");
    editWorkKit(kit);
  };
  if ($("deleteWorkKit"))
    $("deleteWorkKit").onclick = () => {
      if (
        !confirm("Supprimer ce kit enregistré ? Les devis restent inchangés.")
      )
        return;
      const previous = db.workKits;
      db.workKits = db.workKits.filter((k) => k.id !== kit.id);
      if (!save()) {
        db.workKits = previous;
        return;
      }
      closeModal();
      openKits();
    };
  $("kitForm").onsubmit = (e) => {
    e.preventDefault();
    if (!validKit()) return;
    const count = Number($("f-kitCount").value),
      room = $("f-kitRoom").value;
    const lines = structuredClone(kit.lines).map((l) => ({
      ...l,
      qty: Math.round(l.qty * count * 1000) / 1000,
      price: Number(l.price),
      room,
      kitName: kit.name,
    }));
    if (lines.some((l) => l.qty < 0.001 || l.qty > 1000000))
      return toast(
        "La quantité finale doit être comprise entre 0,001 et 1 000 000",
      );
    const previous = draft.lines;
    draft.lines = [...draft.lines, ...lines];
    if (!storeQuote(true)) {
      draft.lines = previous;
      return;
    }
    closeModal();
    renderEditor();
    toast("Kit ajouté : vérifiez la sélection avant de finaliser");
  };
}
function pickKitProduct(kit, index) {
  closeModal();
  modal(
    `<h2>Choisir une référence</h2><p>${esc(kit.lines[index].label)}</p><label>Nom, référence ou marque<input id="kitProductSearch" type="search" autofocus></label><div id="kitProductResults"></div><button id="backKitEditor" class="secondary">Retour au kit</button>`,
  );
  const products = catalogItems().filter((p) => p.kind === "material");
  const results = () => {
    const tokens = normalizeSearch($("kitProductSearch").value)
      .split(" ")
      .filter(Boolean);
    if (!tokens.length) {
      $("kitProductResults").innerHTML =
        '<p class="muted">Recherchez le matériel à utiliser dans ce kit.</p>';
      return;
    }
    const found = products.filter((p) =>
      tokens.every((t) =>
        normalizeSearch([p.label, p.ref, p.brand].join(" ")).includes(t),
      ),
    );
    $("kitProductResults").innerHTML =
      `<p class="muted">${found.length} résultats · 20 premiers affichés, précisez la recherche si nécessaire.</p>` +
      found
        .slice(0, 20)
        .map(
          (p, i) =>
            `<button class="client-choice" data-kit-pick="${i}"><strong>${esc(p.label)}</strong><small>${esc(p.ref)} · ${p.cost == null ? "Prix à saisir" : money(round(p.cost * (1 + company().markup / 100))) + " HT"}</small></button>`,
        )
        .join("");
    document.querySelectorAll("[data-kit-pick]").forEach(
      (b) =>
        (b.onclick = () => {
          const p = found[Number(b.dataset.kitPick)],
            qty = kit.lines[index].qty;
          kit.lines[index] = {
            ...p,
            catalogId: productKey(p),
            qty,
            markup: company().markup,
            vat: company().vat,
            price:
              p.cost == null
                ? ""
                : round(p.cost * (1 + company().markup / 100)),
          };
          editWorkKit(kit);
        }),
    );
  };
  $("kitProductSearch").oninput = results;
  $("backKitEditor").onclick = () => editWorkKit(kit);
  results();
}

function laborPresets() {
  return (db.laborPresets || []).filter((p) => p.companyId === db.active);
}
function openLabor() {
  if ($("dialog").open) closeModal();
  modal(
    `<h2>Main-d’œuvre et forfaits</h2><p class="muted">Tarif horaire de l’entreprise : ${money(company().rate)} HT. Modifiable dans Entreprise.</p><button id="hourlyLabor">+ Heures de main-d’œuvre</button><div id="laborPresets"></div><div class="actions"><button id="newLaborPreset" class="secondary">+ Enregistrer un forfait</button><button class="secondary" onclick="closeModal()">Fermer</button></div>`,
  );
  const presets = laborPresets();
  $("laborPresets").innerHTML = presets
    .map(
      (p, i) =>
        `<article class="line"><strong>${esc(p.label)}</strong><p>${money(p.price)} HT / ${esc(p.unit)}</p><div class="actions"><button data-add-labor="${i}">Ajouter</button><button class="secondary" data-edit-labor="${i}">Modifier</button><button class="danger" data-delete-labor="${i}">Supprimer</button></div></article>`,
    )
    .join("");
  const add = (l) => {
    closeModal();
    lineModal(undefined, {
      ...l,
      room: draft.activeRoom || "",
      qty: 1,
      cost: 0,
      markup: 0,
      vat: company().vat,
    });
  };
  $("hourlyLabor").onclick = () =>
    add({
      kind: "labor",
      label: "Pose et raccordement",
      unit: "h",
      price: company().rate,
    });
  document
    .querySelectorAll("[data-add-labor]")
    .forEach(
      (b) => (b.onclick = () => add(presets[Number(b.dataset.addLabor)])),
    );
  document
    .querySelectorAll("[data-edit-labor]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          editLaborPreset(presets[Number(b.dataset.editLabor)])),
    );
  document.querySelectorAll("[data-delete-labor]").forEach(
    (b) =>
      (b.onclick = () => {
        if (!confirm("Supprimer ce forfait enregistré ?")) return;
        const previous = db.laborPresets;
        db.laborPresets = db.laborPresets.filter(
          (p) => p.id !== presets[Number(b.dataset.deleteLabor)].id,
        );
        if (!save()) {
          db.laborPresets = previous;
          return;
        }
        openLabor();
      }),
  );
  $("newLaborPreset").onclick = () => editLaborPreset();
}
function editLaborPreset(p = {}) {
  closeModal();
  modal(
    `<h2>Forfait habituel</h2><form id="laborPresetForm">${field("presetLabel", "Prestation", p.label, "text", 'required maxlength="200"')}${field("presetPrice", "Prix HT (€)", p.price ?? "", "number", 'required min="0" max="10000000" step="0.01"')}<div class="actions"><button>Enregistrer</button><button type="button" class="secondary" id="backLabor">Annuler</button></div></form>`,
  );
  $("backLabor").onclick = openLabor;
  $("laborPresetForm").onsubmit = (e) => {
    e.preventDefault();
    const label = $("f-presetLabel").value.trim();
    if (!label) return;
    const item = {
      id: p.id || uid(),
      companyId: db.active,
      label,
      price: Number($("f-presetPrice").value),
      kind: "service",
      unit: "forfait",
    };
    const previous = db.laborPresets;
    db.laborPresets = [
      ...(db.laborPresets || []).filter((l) => l.id !== item.id),
      item,
    ];
    if (!save()) {
      db.laborPresets = previous;
      return;
    }
    openLabor();
  };
}

function repricedLines(lines, products = catalogItems()) {
  const byId = new Map(products.map((p) => [productKey(p), p]));
  const report = { updated: 0, unavailable: 0, unchanged: 0 };
  const next = structuredClone(lines).map((l) => {
    if (l.kind !== "material" || !l.catalogId) {
      report.unchanged++;
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
      price: round(p.cost * (1 + num(l.markup, company().markup) / 100)),
      checked: p.checked,
      sourceTtc: p.sourceTtc,
    };
  });
  return { lines: next, ...report };
}
function duplicateQuoteDialog(source) {
  const estimate = repricedLines(source.lines);
  modal(`<h2>Dupliquer ${esc(source.number)}</h2><p>Un nouveau brouillon sera créé. Le client, les pièces et les quantités sont repris et restent modifiables.</p><form id="duplicateForm">${select(
    "copyPrices",
    "Prix du nouveau devis",
    [
      ["keep", "Conserver les prix du devis d’origine"],
      ["current", "Recalculer le matériel avec le catalogue chargé"],
    ],
    "keep",
  )}
    <p class="notice">Actualisation possible : ${estimate.updated} ligne(s). ${estimate.unavailable} référence(s) absente(s), sans prix ou avec une unité différente : prix d’origine conservé. Main-d’œuvre et lignes libres conservées. La majoration de chaque ligne est conservée ; un prix de vente ajusté manuellement sera recalculé.</p>
    <p class="muted">Les prix chargés peuvent dater d’un précédent relevé. Vous pouvez d’abord actualiser le catalogue depuis l’onglet Catalogue.</p><div class="actions"><button>Créer la copie</button><button type="button" class="secondary" onclick="closeModal()">Annuler</button></div></form>`);
  $("duplicateForm").onsubmit = (e) => {
    e.preventDefault();
    const current = $("f-copyPrices").value === "current";
    closeModal();
    newQuote(source);
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

function renderQuoteDashboard() {
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
            `<article class="line"><div class="row wrap"><div><strong>${esc(q.client || "Brouillon sans client")}</strong><p class="muted">${esc(q.number)} · ${esc(q.date)}<br>${esc(q.title)}</p></div><strong>${money(totals(q).ttc)}</strong></div><label>Statut<select data-quote-status="${esc(q.id)}">${QUOTE_STATUSES.map((s) => `<option ${s === (q.status || "Brouillon") ? "selected" : ""}>${s}</option>`).join("")}</select></label><div class="actions"><button class="secondary" data-open="${esc(q.id)}">Ouvrir</button><button class="secondary" data-copy="${esc(q.id)}">Dupliquer</button></div></article>`,
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
    document.querySelectorAll("[data-quote-status]").forEach(
      (input) =>
        (input.onchange = () => {
          const q = list.find((q) => q.id === input.dataset.quoteStatus),
            previous = { status: q.status, updated: q.updated };
          q.status = input.value;
          q.updated = new Date().toISOString();
          if (!save()) Object.assign(q, previous);
          results();
        }),
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

function validateBackup(v) {
  if (
    !v ||
    v.version !== 1 ||
    !Array.isArray(v.companies) ||
    !Array.isArray(v.quotes) ||
    !Array.isArray(v.catalog)
  )
    throw Error("Format incompatible");
  const ids = new Set();
  const validId = id => typeof id === "string" && /^[a-zA-Z0-9_.:-]{1,150}$/.test(id);
  v.companies.forEach((c) => {
    if (
      !c ||
      !validId(c.id) ||
      ids.has(c.id) ||
      typeof c.name !== "string" ||
      !Number.isInteger(c.nextNumber) ||
      c.nextNumber < 1
    )
      throw Error("Entreprise invalide");
    ids.add(c.id);
  });
  const qids = new Set();
  const validLine = (l) =>
    l &&
    typeof l.label === "string" &&
    typeof l.unit === "string" &&
    ["material", "labor", "service"].includes(l.kind) &&
    Number.isFinite(l.qty) &&
    l.qty > 0 &&
    l.qty <= 1000000 &&
    Number.isFinite(l.price) &&
    l.price >= 0 &&
    l.price <= 10000000 &&
    [0, 5.5, 10, 20].includes(Number(l.vat)) &&
    (l.room == null || typeof l.room === "string");
  v.quotes.forEach((q) => {
    if (
      !q ||
      !validId(q.id) ||
      qids.has(q.id) ||
      !ids.has(q.companyId) ||
      !q.company ||
      !Array.isArray(q.lines) ||
      !q.lines.every(validLine) ||
      typeof q.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(q.date) ||
      (q.rooms != null &&
        (!Array.isArray(q.rooms) ||
          !q.rooms.every((r) => typeof r === "string")))
    )
      throw Error("Devis invalide");
    qids.add(q.id);
  });
  for (const key of ["clients", "catalog", "workKits", "laborPresets"]) {
    if (v[key] != null && !Array.isArray(v[key])) throw Error("Liste invalide");
    const recordIds = new Set();
    (v[key] || []).forEach((item) => {
      if (
        !item ||
        !validId(item.id) ||
        recordIds.has(item.id) ||
        !ids.has(item.companyId)
      )
        throw Error("Donnée sans entreprise ou identifiant unique");
      recordIds.add(item.id);
      if (
        key === "clients" &&
        (typeof item.name !== "string" || typeof item.address !== "string")
      )
        throw Error("Client invalide");
      if (
        key === "workKits" &&
        (typeof item.name !== "string" ||
          !Array.isArray(item.lines) ||
          !item.lines.every(validLine))
      )
        throw Error("Kit invalide");
      if (
        key === "laborPresets" &&
        (typeof item.label !== "string" ||
          !Number.isFinite(item.price) ||
          item.price < 0)
      )
        throw Error("Forfait invalide");
    });
  }
  return v;
}
function restoreBackup(text) {
  let next;
  try {
    next = validateBackup(JSON.parse(text));
  } catch (e) {
    alert(
      "Sauvegarde invalide ou incompatible. Aucune donnée n’a été remplacée.",
    );
    return false;
  }
  if (
    !confirm(
      `Restaurer ${next.companies.length} entreprise(s), ${next.quotes.length} devis, ${(next.clients || []).length} clients, ${(next.workKits || []).length} kits et ${(next.laborPresets || []).length} forfaits ?\nToutes les données locales seront remplacées. Exportez une sauvegarde actuelle avant de continuer.`,
    )
  )
    return false;
  const previous = db;
  db = next;
  try {
    initializeClients(false);
    if (!company()) db.active = db.companies[0]?.id || null;
    if (!save()) {
      db = previous;
      return false;
    }
    draft = null;
    quoteCatalogState = null;
    clientReturnQuote = null;
    render();
    toast("Sauvegarde restaurée");
    return true;
  } catch (e) {
    db = previous;
    alert("Restauration impossible. Vos données sont conservées.");
    return false;
  }
}
