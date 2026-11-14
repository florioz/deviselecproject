"use strict";

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
    price: productSalePrice(product) ?? 0,
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
function kitLaborHours(kit) {
  return roundQuantity(
    kit.lines
      .filter((line) => line.kind === "labor" && line.unit === "h")
      .reduce((total, line) => total + line.qty, 0),
  );
}
function consolidateKitLabor(kit) {
  const lines = kit.lines.filter(
    (line) => line.kind === "labor" && line.unit === "h",
  );
  if (lines.length < 2) return false;
  const hours = kitLaborHours(kit);
  const amount = lines.reduce(
    (total, line) => total + line.qty * line.price,
    0,
  );
  kit.lines = kit.lines.filter((line) => !lines.includes(line));
  kit.lines.push({
    ...lines[0],
    label: "Pose du kit",
    qty: hours,
    price: round(amount / hours),
    kitGlobalLabor: true,
  });
  return true;
}
function setKitLaborHours(kit, hours) {
  const labor = kit.lines.filter(
    (line) => line.kind === "labor" && line.unit === "h",
  );
  const previous = kitLaborHours(kit);
  if (previous === hours) return;
  if (!hours) {
    kit.lines = kit.lines.filter((line) => !labor.includes(line));
    return;
  }
  if (!labor.length) {
    kit.lines.push({
      kind: "labor",
      label: "Pose du kit",
      qty: hours,
      unit: "h",
      price: company().rate,
      cost: 0,
      markup: 0,
      vat: company().vat,
      kitGlobalLabor: true,
    });
    return;
  }
  let remaining = hours;
  labor.forEach((line, index) => {
    const quantity =
      index === labor.length - 1
        ? remaining
        : Math.min(remaining, roundQuantity((hours * line.qty) / previous));
    line.qty = quantity;
    remaining = roundQuantity(remaining - quantity);
  });
  kit.lines = kit.lines.filter((line) => !labor.includes(line) || line.qty > 0);
}
function requestKitName(kit, context, confirmName) {
  closeModal();
  modal(
    `<h2>Nommer le kit</h2><form id="kitNameForm">${field("kitName", "Nom du kit", kit.name || "", "text", 'required maxlength="120" placeholder="Ex. Prise du salon"')}<div class="actions"><button type="submit">Confirmer le nom</button><button type="button" class="secondary" id="cancelKitName">Retour au kit</button></div></form>`,
  );
  $("cancelKitName").onclick = () => editWorkKit(kit, context);
  $("kitNameForm").onsubmit = (event) => {
    event.preventDefault();
    const name = $("f-kitName").value.trim();
    if (!name) return;
    kit.name = name;
    confirmName();
  };
  requestAnimationFrame(() => $("f-kitName")?.focus());
}
function editWorkKit(
  kit,
  context = { count: 1, room: draft.activeRoom || "" },
) {
  kit = structuredClone(kit);
  context.installationMerged =
    consolidateKitLabor(kit) || context.installationMerged;
  beginKitSession();
  if ($("dialog").open) closeModal();
  modal(`<h2>${esc(kit.name || "Composer mon kit")}</h2><form id="kitForm">
    <button type="button" id="kitAddMaterial">Modifier le matériel du kit</button>
    <div id="kitRows">${
      kit.lines
        .filter((line) => !(line.kind === "labor" && line.unit === "h"))
        .map(
          (line) =>
            `<article class="kit-item"><div class="kit-item-product">${line.kind === "material" ? equipmentPhoto(line) : '<span class="labor-symbol">F</span>'}<div><strong>${esc(line.label)}</strong><p class="muted">${line.kind === "material" ? "Réf. " + esc(line.ref || line.sku || line.catalogId || "à choisir") : "Forfait"}</p><span>${line.qty} ${esc(line.unit)} · ${line.needsPrice ? "Prix à compléter à la fin" : money(line.price) + " HT / " + esc(line.unit)}</span></div></div></article>`,
        )
        .join("") ||
      '<p class="empty">Choisissez les produits du kit dans le catalogue.</p>'
    }</div>
    <section class="kit-installation">${field("kitHours", "Temps de pose global pour un kit (heures)", kitLaborHours(kit), "number", 'min="0" max="1000000" step="0.001" required')}<p class="muted">Tarif de pose ${money(kit.lines.find((line) => line.kind === "labor" && line.unit === "h")?.price ?? company().rate)} HT / h. Le temps sera multiplié par le nombre de kits.</p>${context.installationMerged ? '<p class="notice">Les anciens temps multiples ont été regroupés. Leur tarif moyen est arrondi au centime et reste ajustable dans Conditions et PDF.</p>' : ""}</section>
    <div class="grid">${field("kitCount", "Nombre de kits", context.count, "number", 'min="0.001" max="1000000" step="0.001" required')}${select("kitRoom", "Pièce", roomOptions(), context.room)}</div>
    <div class="actions"><button type="submit">Ajouter au devis</button><button type="button" id="saveWorkKit" class="secondary">Enregistrer ce kit</button><button type="button" class="secondary" id="backKits">Retour</button>${kit.companyId ? '<button type="button" id="deleteWorkKit" class="danger">Supprimer le kit</button>' : ""}</div></form>`);
  wireEquipmentPhotos($("dialog"));
  const captureKit = () => {
    context.count = Number($("f-kitCount").value);
    context.room = $("f-kitRoom").value;
    setKitLaborHours(kit, Number($("f-kitHours").value));
  };
  const validKit = () => {
    if (!$("kitForm").reportValidity()) return false;
    captureKit();
    if (!kit.lines.length) {
      toast("Ajoutez au moins un matériel ou un temps de pose");
      return false;
    }
    if (kit.lines.some((line) => line.kind === "material" && !line.catalogId)) {
      toast("Choisissez les références depuis Modifier le matériel du kit");
      return false;
    }
    return true;
  };
  $("kitAddMaterial").onclick = () => {
    if (!$("kitForm").reportValidity()) return;
    captureKit();
    pickKitProduct(kit, context);
  };
  $("backKits").onclick = () => {
    closeModal();
    openKits();
  };
  $("saveWorkKit").onclick = () => {
    if (!validKit()) return;
    requestKitName(kit, context, () => {
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
    });
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
  const addKit = () => {
    const lines = structuredClone(kit.lines).map((line) => ({
      ...line,
      label: line.kitGlobalLabor ? "Pose du kit " + kit.name : line.label,
      qty: roundQuantity(line.qty * context.count),
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
  $("kitForm").onsubmit = (event) => {
    event.preventDefault();
    if (!validKit()) return;
    if (!kit.name) requestKitName(kit, context, addKit);
    else addKit();
  };
}
function pickKitProduct(kit, context) {
  closeModal();
  modal(`<div class="row wrap"><h2>Matériel du kit</h2><button id="backKitEditor" class="secondary">Revenir au kit</button></div>
    <details id="selectedKitMaterials"><summary>Contenu actuel du kit</summary><div id="kitSelectedRows"></div></details>
    <section id="kitCatalogue"></section><div id="kitQuickConfirm" class="kit-confirm-bar" hidden><strong id="kitPickedSummary"></strong><div class="actions"><button id="confirmKitProduct">Confirmer et revenir au kit</button><button id="continueKitProducts" class="secondary">Choisir un autre matériel</button></div></div>`);
  let picked = null;
  const selection = (product) =>
    kit.lines.find((line) => line.catalogId === productKey(product));
  const refreshSelection = () => {
    const rows = kit.lines
      .map((line, row) => ({ line, row }))
      .filter(({ line }) => !(line.kind === "labor" && line.unit === "h"));
    $("selectedKitMaterials").querySelector("summary").textContent =
      `Contenu actuel du kit (${rows.length})`;
    $("kitSelectedRows").innerHTML = rows
      .map(
        ({ line, row }) =>
          `<article class="line"><strong>${esc(line.label)}</strong><div class="kit-item-controls"><label>Quantité (${esc(line.unit)})<input type="number" data-kit-quantity="${row}" value="${line.qty}" min="0.001" max="1000000" step="0.001"></label><button type="button" class="danger" data-remove-kit-material="${row}">Retirer</button></div></article>`,
      )
      .join("");
    $("kitSelectedRows")
      .querySelectorAll("[data-kit-quantity]")
      .forEach(
        (input) =>
          (input.onchange = () => {
            if (!input.value || !input.validity.valid) {
              input.value = kit.lines[Number(input.dataset.kitQuantity)].qty;
              return;
            }
            kit.lines[Number(input.dataset.kitQuantity)].qty = Number(
              input.value,
            );
            refreshSelection();
            updateCatalogResults(browser);
          }),
      );
    $("kitSelectedRows")
      .querySelectorAll("[data-remove-kit-material]")
      .forEach(
        (button) =>
          (button.onclick = () => {
            kit.lines.splice(Number(button.dataset.removeKitMaterial), 1);
            refreshSelection();
            updateCatalogResults(browser);
          }),
      );
    const chosen = picked && selection(picked);
    $("kitQuickConfirm").hidden = !chosen;
    if (chosen)
      $("kitPickedSummary").textContent =
        `${chosen.label} · ${chosen.qty} ${chosen.unit}`;
  };
  const browser = mountCatalogBrowser($("kitCatalogue"), true, {
    kitPicker: true,
    selection,
    priceFor: (product) => productSalePrice(product),
    addProduct: (product, delta) => {
      if (product.kind !== "material")
        return toast("Choisissez un matériel pour ce kit");
      const existing = selection(product);
      if (existing) {
        existing.qty = roundQuantity(existing.qty + delta);
        if (existing.qty <= 0) kit.lines.splice(kit.lines.indexOf(existing), 1);
      } else if (delta > 0) kit.lines.push(kitMaterial(product));
      picked = product;
      refreshSelection();
    },
  });
  $("backKitEditor").onclick = () => editWorkKit(kit, context);
  $("confirmKitProduct").onclick = () => editWorkKit(kit, context);
  $("continueKitProducts").onclick = () => {
    picked = null;
    $("resetFilters").click();
    refreshSelection();
    $("kitCatalogue").scrollIntoView({ block: "start", behavior: "smooth" });
  };
  refreshSelection();
}
