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
  addClosedChoices(
    $("f-roomName"),
    [
      "Cuisine",
      "Salon",
      "Chambre 1",
      "Chambre 2",
      "Salle de bains",
      "Garage",
      "Extérieur",
    ],
    "roomNameChoice",
    "Nom personnalisé…",
  );
}

function mountQuotePricing() {
  const section = document.createElement("section");
  section.className = "card";
  const missing = draft.lines.some((line) => line.needsPrice);
  section.innerHTML = `<h2>Prix et TVA</h2><div class="grid">${select(
    "quoteVat",
    "TVA à appliquer au devis",
    [
      ["", "Conserver les taux par ligne"],
      [20, "20 %"],
      [10, "10 %"],
      [5.5, "5,5 %"],
      [0, "0 %"],
    ],
    "",
  )}<button type="button" class="secondary" id="applyQuoteVat">Appliquer à toutes les lignes</button></div>
    <details id="quotePricing" ${missing ? "open" : ""}><summary>Vérifier les prix et ajuster les taux par ligne${missing ? " · Prix à compléter" : ""}</summary>
    ${draft.lines
      .map(
        (
          line,
          index,
        ) => `<article class="line"><strong>${esc(line.label)}</strong><p class="muted">${esc(line.room || "Ensemble du chantier")} · ${line.qty} ${esc(line.unit)}${line.ref ? " · Réf. " + esc(line.ref) : ""}</p><div class="grid">
      <label>Prix de vente HT / ${esc(line.unit)}<input type="number" data-review-price="${index}" value="${line.needsPrice ? "" : line.price}" min="0" max="10000000" step="0.01" required></label>
      <label>TVA<select data-review-vat="${index}">${[20, 10, 5.5, 0].map((vat) => `<option value="${vat}" ${Number(line.vat) === vat ? "selected" : ""}>${vat} %</option>`).join("")}</select></label></div></article>`,
      )
      .join("")}</details>`;
  $("summary").before(section);
  section.querySelectorAll("[data-review-price]").forEach((input) => {
    input.oninput = () => {
      const line = draft.lines[Number(input.dataset.reviewPrice)];
      line.needsPrice = input.value === "" || !input.validity.valid;
      if (!line.needsPrice) line.price = Number(input.value);
      $("quoteForm").dispatchEvent(new Event("change"));
    };
  });
  section.querySelectorAll("[data-review-vat]").forEach((input) => {
    input.onchange = () => {
      draft.lines[Number(input.dataset.reviewVat)].vat = Number(input.value);
    };
  });
  $("applyQuoteVat").onclick = () => {
    if ($("f-quoteVat").value === "")
      return toast("Choisissez le taux à appliquer");
    draft.defaultVat = Number($("f-quoteVat").value);
    draft.lines.forEach((line) => {
      line.vat = draft.defaultVat;
    });
    section.querySelectorAll("[data-review-vat]").forEach((input) => {
      input.value = String(draft.defaultVat);
    });
    $("quoteForm").dispatchEvent(new Event("change"));
  };
}

let kitSession = false;

function beginKitSession() {
  kitSession = true;
  $("dialog").classList.add("kit-dialog");
  $("catalogBrowser")?.replaceChildren();
}
$("dialog").addEventListener("close", () => {
  if ($("dialog").open || !kitSession) return;
  kitSession = false;
  $("dialog").classList.remove("kit-dialog");
  if (draft) renderEditor();
});

function kitMaterial(product, qty = 1) {
  return {
    ...structuredClone(product),
    catalogId: productKey(product),
    qty,
    markup: company().markup,
    vat: company().vat,
    price:
      product.cost == null
        ? 0
        : round(product.cost * (1 + company().markup / 100)),
    needsPrice: product.cost == null,
    room: "",
  };
}
function defaultWorkKits() {
  const products = catalogItems();
  const definitions = [
    {
      id: "template-socket",
      name: "Prise Dooxie et boîte EUROHM",
      refs: ["600335", "52061"],
      hours: 0.5,
      labor: "Pose et raccordement d’une prise",
    },
    {
      id: "template-light",
      name: "Point de centre DCL CAPRI",
      refs: ["CAP715859"],
      hours: 0.5,
      labor: "Pose et raccordement d’un point lumineux",
    },
    {
      id: "template-panel",
      name: "Tableau Drivia et protections Legrand",
      refs: ["401211", "411611", "406783"],
      hours: 4,
      labor: "Pose du tableau et essais",
    },
  ];
  return definitions.flatMap((definition) => {
    const materials = definition.refs.map((ref) =>
      products.find((p) => p.ref === ref && p.kind === "material"),
    );
    if (materials.some((product) => !product)) return [];
    return [
      {
        id: definition.id,
        name: definition.name,
        template: true,
        lines: [
          ...materials.map((product) => kitMaterial(product)),
          {
            kind: "labor",
            label: definition.labor,
            qty: definition.hours,
            unit: "h",
            cost: 0,
            markup: 0,
            price: company().rate,
            vat: company().vat,
          },
        ],
      },
    ];
  });
}
function ownWorkKits() {
  return (db.workKits || []).filter((kit) => kit.companyId === db.active);
}
function openKits() {
  beginKitSession();
  modal(
    `<h2>Mes kits de matériel</h2><div class="actions"><button id="newWorkKit">+ Créer avec le catalogue</button><button class="secondary" onclick="closeModal()">Fermer</button></div><div id="workKitList"></div>`,
  );
  const kits = [...ownWorkKits(), ...defaultWorkKits()];
  $("workKitList").innerHTML = kits
    .map((kit, index) => {
      const material = kit.lines.find((line) => line.kind === "material");
      return `<article class="kit-preview">${material ? equipmentPhoto(material) : ""}<div><h3>${esc(kit.name)}</h3>
      <p class="muted">${
        kit.lines
          .filter((line) => line.kind === "material")
          .map((line) => esc(line.ref || line.label))
          .join(" · ") || "Main-d’œuvre"
      }</p>
      ${kit.template ? '<p class="muted">Exemple à adapter au chantier</p>' : ""}<button class="secondary" data-kit="${index}">Voir le contenu / ajouter</button></div></article>`;
    })
    .join("");
  wireEquipmentPhotos($("dialog"));
  document.querySelectorAll("[data-kit]").forEach((button) => {
    button.onclick = () =>
      editWorkKit(structuredClone(kits[Number(button.dataset.kit)]));
  });
  $("newWorkKit").onclick = () => editWorkKit({ name: "", lines: [] });
}
function editWorkKit(
  kit,
  context = { count: 1, room: draft.activeRoom || "" },
) {
  beginKitSession();
  if ($("dialog").open) closeModal();
  modal(`<h2>Composer mon kit</h2><form id="kitForm">${field("kitName", "Nom du kit", kit.name, "text", 'required maxlength="120" placeholder="Ex. Prise du salon"')}
    <div class="actions"><button type="button" id="kitAddMaterial">+ Piocher dans le catalogue</button><button type="button" id="kitAddLabor" class="secondary">+ Temps de pose</button></div>
    <div id="kitRows">${
      kit.lines
        .map(
          (line, index) => `<article class="kit-item">
      <div class="kit-item-product">${line.kind === "material" ? equipmentPhoto(line) : '<span class="labor-symbol" aria-hidden="true">h</span>'}<div><strong>${esc(line.label)}</strong>
        <p class="muted">${line.kind === "material" ? `Réf. ${esc(line.ref || line.sku || "à choisir dans le catalogue")}` : "Main-d’œuvre"}</p>
        <span>${line.needsPrice || line.price === "" || line.price == null ? "Prix à compléter dans Conditions et PDF" : money(line.price) + " HT / " + esc(line.unit)}</span></div></div>
      <div class="kit-item-controls"><label>${line.kind === "labor" ? "Temps de pose (heures)" : "Quantité (" + esc(line.unit || "u") + ")"}<input type="number" data-kit-field="qty" data-row="${index}" value="${line.qty}" min="0.001" max="1000000" step="0.001" required></label>
      <div class="actions">${line.kind === "material" ? `<button type="button" class="secondary" data-kit-product="${index}">Remplacer</button>` : ""}<button type="button" class="danger" data-kit-remove="${index}">Retirer</button></div></div></article>`,
        )
        .join("") ||
      '<p class="empty">Ajoutez vos premiers produits depuis le catalogue.</p>'
    }</div>
    <div class="grid">${field("kitCount", "Nombre de kits", context.count, "number", 'min="0.001" max="1000000" step="0.001" required')}${select("kitRoom", "Pièce", roomOptions(), context.room)}</div>
    <div class="actions"><button type="submit">Ajouter au devis</button><button type="button" id="saveWorkKit" class="secondary">Enregistrer ce kit</button><button type="button" class="secondary" id="backKits">Retour</button>${kit.companyId ? '<button type="button" id="deleteWorkKit" class="danger">Supprimer le kit</button>' : ""}</div></form>`);
  wireEquipmentPhotos($("dialog"));
  const captureKit = () => {
    kit.name = $("f-kitName").value.trim();
    document.querySelectorAll("[data-kit-field='qty']").forEach((input) => {
      kit.lines[Number(input.dataset.row)].qty = Number(input.value);
    });
    context.count = Number($("f-kitCount").value);
    context.room = $("f-kitRoom").value;
  };
  const validKit = () => {
    if (!$("kitForm").reportValidity()) return false;
    captureKit();
    if (!kit.name || !kit.lines.length) {
      toast("Nommez le kit et ajoutez au moins un élément");
      return false;
    }
    if (kit.lines.some((line) => line.kind === "material" && !line.catalogId)) {
      toast(
        "Remplacez les éléments sans référence par un produit du catalogue",
      );
      return false;
    }
    return true;
  };
  $("kitAddMaterial").onclick = () => {
    captureKit();
    pickKitProduct(kit, undefined, context);
  };
  $("kitAddLabor").onclick = () => {
    captureKit();
    kit.lines.push({
      kind: "labor",
      label: "Pose et raccordement",
      qty: 0.5,
      unit: "h",
      cost: 0,
      markup: 0,
      price: company().rate,
      vat: company().vat,
    });
    editWorkKit(kit, context);
  };
  document.querySelectorAll("[data-kit-product]").forEach((button) => {
    button.onclick = () => {
      captureKit();
      pickKitProduct(kit, Number(button.dataset.kitProduct), context);
    };
  });
  document.querySelectorAll("[data-kit-remove]").forEach((button) => {
    button.onclick = () => {
      captureKit();
      kit.lines.splice(Number(button.dataset.kitRemove), 1);
      editWorkKit(kit, context);
    };
  });
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
    saved.lines.forEach((line) => {
      if (line.price === "" || line.price == null) {
        line.price = 0;
        line.needsPrice = true;
      }
    });
    db.workKits = [
      ...(previous || []).filter((item) => item.id !== saved.id),
      saved,
    ];
    if (!save()) {
      db.workKits = previous;
      return;
    }
    toast("Kit enregistré");
    editWorkKit(saved, context);
  };
  if ($("deleteWorkKit"))
    $("deleteWorkKit").onclick = () => {
      if (!confirm("Supprimer ce kit enregistré ?")) return;
      const previous = db.workKits;
      db.workKits = db.workKits.filter((item) => item.id !== kit.id);
      if (!save()) {
        db.workKits = previous;
        return;
      }
      closeModal();
      openKits();
    };
  $("kitForm").onsubmit = (event) => {
    event.preventDefault();
    if (!validKit()) return;
    const lines = structuredClone(kit.lines).map((line) => ({
      ...line,
      qty: Math.round(line.qty * context.count * 1000) / 1000,
      price: Number(line.price) || 0,
      needsPrice: Boolean(
        line.needsPrice || line.price === "" || line.price == null,
      ),
      vat: draft.defaultVat ?? company().vat,
      room: context.room,
      kitName: kit.name,
    }));
    if (lines.some((line) => line.qty < 0.001 || line.qty > 1000000))
      return toast("Vérifiez les quantités finales du kit");
    const previous = draft.lines;
    draft.lines = [...previous, ...lines];
    if (!storeQuote(true)) {
      draft.lines = previous;
      return;
    }
    closeModal();
    renderEditor();
    toast("Kit ajouté au devis");
  };
}
function pickKitProduct(kit, index, context) {
  closeModal();
  modal(
    `<div class="row wrap"><h2>Catalogue du kit</h2><button id="backKitEditor" class="secondary">Terminer la sélection</button></div><p id="kitPickCount" class="muted"></p><section id="kitCatalogue"></section>`,
  );
  const selection = (product) => {
    if (index !== undefined) return null;
    return kit.lines.find((line) => line.catalogId === productKey(product));
  };
  const updateCount = () => {
    $("kitPickCount").textContent =
      `${kit.lines.filter((line) => line.kind === "material").length} référence(s) dans ce kit`;
  };
  mountCatalogBrowser($("kitCatalogue"), true, {
    kitPicker: true,
    selection,
    priceFor: (product) =>
      product.kind === "material"
        ? product.cost == null
          ? null
          : round(product.cost * (1 + company().markup / 100))
        : product.price,
    addProduct: (product, delta) => {
      if (product.kind !== "material")
        return toast("Choisissez un matériel pour ce kit");
      if (index !== undefined) {
        kit.lines[index] = kitMaterial(product, kit.lines[index].qty);
        queueMicrotask(() => editWorkKit(kit, context));
        return;
      }
      const existing = selection(product);
      if (existing) {
        existing.qty = Math.round((existing.qty + delta) * 1000) / 1000;
        if (existing.qty <= 0) kit.lines.splice(kit.lines.indexOf(existing), 1);
      } else if (delta > 0) kit.lines.push(kitMaterial(product));
      updateCount();
    },
  });
  $("backKitEditor").onclick = () => editWorkKit(kit, context);
  updateCount();
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
  const validId = (id) =>
    typeof id === "string" && /^[a-zA-Z0-9_.:-]{1,150}$/.test(id);
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
