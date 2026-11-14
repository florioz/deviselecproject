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
function roomOptions() {
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
      vat: draft.defaultVat ?? company().vat,
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
