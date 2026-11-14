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
    priceFor: (product) => productSalePrice(product),
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
        existing.qty = roundQuantity(existing.qty + delta);
        if (existing.qty <= 0) kit.lines.splice(kit.lines.indexOf(existing), 1);
      } else if (delta > 0) kit.lines.push(kitMaterial(product));
      updateCount();
    },
  });
  $("backKitEditor").onclick = () => editWorkKit(kit, context);
  updateCount();
}
