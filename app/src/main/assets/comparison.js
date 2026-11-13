"use strict";

let technicalProfiles = {};
const COMPARISON_FIELDS = {
  type: [
    "Fonction",
    {
      socket: "Prise de courant",
      "socket-usb": "Prise secteur + USB",
      "socket-cover": "Enjoliveur de prise",
      cover: "Enjoliveur",
      plate: "Plaque",
      support: "Support",
      breaker: "Disjoncteur",
      rcd: "Interrupteur différentiel",
      "two-way-switch": "Va-et-vient",
      switch: "Interrupteur",
      "push-button": "Poussoir",
      bulb: "Ampoule",
      spot: "Spot",
      cable: "Câble / fil",
      "flush-box": "Boîte d’encastrement",
    },
  ],
  poles: ["Pôles"],
  amps: ["Intensité", "A"],
  volts: ["Tension", "V"],
  watts: ["Puissance", "W"],
  milliamps: ["Sensibilité", "mA"],
  ip: ["Protection", "IP"],
  kelvin: ["Température", "K"],
  curve: ["Courbe"],
  rcdType: ["Type différentiel"],
  color: ["Couleur"],
  posts: ["Postes"],
  outlets: ["Prises intégrées"],
  pack: ["Conditionnement"],
  base: ["Culot"],
  conductors: ["Conducteurs"],
  assembly: [
    "Assemblage",
    { mechanism: "Mécanisme / à composer", complete: "Complet" },
  ],
  mount: ["Pose", { flush: "Encastrée", surface: "Saillie" }],
  connection: [
    "Bornes",
    { automatic: "Automatiques", "non-automatic": "Non automatiques" },
  ],
};
const COMPARISON_CRITERIA = {
  socket: [
    "poles",
    "amps",
    "volts",
    "assembly",
    "mount",
    "color",
    "ip",
    "connection",
    "posts",
  ],
  "socket-usb": [
    "poles",
    "amps",
    "volts",
    "assembly",
    "mount",
    "color",
    "ip",
    "connection",
    "posts",
  ],
  "socket-cover": ["poles", "assembly", "color", "posts"],
  breaker: ["poles", "amps", "curve", "volts", "ip"],
  rcd: ["poles", "amps", "milliamps", "rcdType", "volts"],
  switch: ["amps", "volts", "assembly", "mount", "color", "ip"],
  "two-way-switch": ["amps", "volts", "assembly", "mount", "color", "ip"],
  "push-button": ["amps", "volts", "assembly", "mount", "color", "ip"],
  bulb: ["base", "watts", "volts", "kelvin", "color"],
  spot: ["base", "watts", "volts", "kelvin", "ip", "color"],
  cable: ["conductors", "volts", "color"],
  "flush-box": ["posts", "ip"],
  plate: ["posts", "color"],
  cover: ["posts", "color"],
  support: ["posts"],
};

function productProfile(product) {
  const key = product.sourceId || product.catalogId || product.id;
  if (technicalProfiles[key]) return technicalProfiles[key];
  const source =
    product.ref &&
    supplierCatalog.products.find((item) => item.ref === product.ref);
  return technicalProfiles[source?.id] || { facts: {} };
}

function comparisonFields(product) {
  const facts = productProfile(product).facts;
  if (!COMPARISON_CRITERIA[facts.type]) return [];
  const fields = [...(COMPARISON_CRITERIA[facts.type] || []), "pack"];
  if (facts.type === "socket" || facts.type === "socket-usb")
    fields.push("outlets");
  return fields.filter((key) => facts[key] != null && facts[key] !== "");
}

function comparisonValue(key, value) {
  if (key === "posts") return value + (value === "1" ? " poste" : " postes");
  if (key === "outlets") return value + (value === "1" ? " prise" : " prises");
  if (key === "curve") return "Courbe " + value;
  if (key === "rcdType") return "Type " + value;
  if (key === "pack")
    return value === "1"
      ? "À l’unité"
      : /^\d+$/.test(value)
        ? "Lot de " + value
        : value + " par vente";
  const field = COMPARISON_FIELDS[key];
  if (!field) return String(value);
  if (typeof field[1] === "object") return field[1][value] || value;
  if (key === "ip") return "IP" + value;
  return value + (field[1] ? " " + field[1] : "");
}

function comparisonReference(browser) {
  return (
    browser.comparison &&
    browser.items.find(
      (item) => productKey(item.product) === browser.comparison.reference,
    )?.product
  );
}

function matchesComparison(product, browser) {
  if (!browser.comparison) return true;
  const expected = browser.comparison.facts;
  const actual = productProfile(product).facts;
  if (!expected.type || actual.type !== expected.type) return false;
  return browser.comparison.criteria.every(
    (key) => actual[key] != null && actual[key] === expected[key],
  );
}

function startProductComparison(product, browser) {
  const available = comparisonFields(product);
  const essential = [
    "poles",
    "amps",
    "assembly",
    "mount",
    "posts",
    "outlets",
    "pack",
  ];
  const core = available.filter((key) => essential.includes(key));
  const criteria =
    productProfile(product).facts.type === "socket" && core.length
      ? core
      : available;
  browser.comparison = {
    reference: productKey(product),
    criteria,
    facts: productProfile(product).facts,
  };
  browser.showResults = true;
  browser.treeFamily = "";
  browser.treeLeaf = "";
  browser.limit = 30;
  for (const id of [
    "catalogSearch",
    "catalogBrand",
    "catalogBudget",
    "catalogMin",
    "catalogMax",
    "catalogKind",
    "catalogPrice",
    "catalogStock",
  ])
    $(id).value = "";
  $("catalogSource").value = "all";
  $("catalogCategory").value = product.category || "";
  $("catalogSort").value = "priceUp";
  updateBrandChoices(browser);
  updateCatalogResults(browser);
  $("comparisonPanel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function comparisonCardFacts(product, browser) {
  if (!browser.comparison) return "";
  const facts = productProfile(product).facts;
  const expected = browser.comparison.facts;
  const displayed = ["color", "mount", "ip"];
  if (expected.assembly && facts.assembly !== expected.assembly)
    displayed.unshift("assembly");
  if (expected.volts && facts.volts && facts.volts !== expected.volts)
    displayed.push("volts");
  return `<p class="comparison-card-facts">${displayed
    .filter((key) => facts[key] || expected[key])
    .map((key) => {
      const different = expected[key] && facts[key] !== expected[key];
      const text = facts[key]
        ? comparisonValue(key, facts[key])
        : COMPARISON_FIELDS[key][0] + " non renseigné";
      return `<span class="${different ? "different-fact" : ""}">${esc(text)}</span>`;
    })
    .join("")}</p>`;
}

function renderComparisonPanel(browser) {
  const reference = comparisonReference(browser);
  if (!reference) {
    $("comparisonPanel").hidden = true;
    $("comparisonPanel").innerHTML = "";
    return;
  }
  const profile = productProfile(reference);
  const facts = profile.facts;
  browser.comparison.facts = facts;
  const available = comparisonFields(reference);
  const selected = browser.comparison.criteria;
  const missing = (COMPARISON_CRITERIA[facts.type] || []).filter(
    (key) => facts[key] == null,
  );
  $("comparisonPanel").hidden = false;
  $("comparisonPanel").innerHTML =
    `<div class="comparison-reference">${equipmentPhoto(reference)}<div>
    <span class="muted">Comparer avec cette référence</span><h3>${esc(reference.label)}</h3><span class="muted">${esc(reference.ref || reference.sku)}</span></div></div>
    <p class="comparison-facts">${["type", ...selected].map((key) => `<span>${esc(comparisonValue(key, facts[key]))}</span>`).join("")}</p>
    <details id="comparisonCriteria"><summary>Modifier les critères (${selected.length + 1})</summary><div class="comparison-checks">
      <label><input type="checkbox" checked disabled> ${esc(comparisonValue("type", facts.type))}</label>
      ${available.map((key) => `<label><input type="checkbox" data-criterion="${key}" ${selected.includes(key) ? "checked" : ""}> ${esc(COMPARISON_FIELDS[key][0])} · ${esc(comparisonValue(key, facts[key]))}</label>`).join("")}
    </div>${missing.length ? `<p class="muted">Non renseigné pour ce produit · ${missing.map((key) => esc(COMPARISON_FIELDS[key][0])).join(", ")}</p>` : ""}</details>
    <p class="muted">Correspondances sur les critères cochés. Une valeur inconnue est exclue du résultat pour ce critère. Dimensions et compatibilité de gamme à vérifier sur les fiches.</p>
    <div class="comparison-controls"><div><label for="comparisonSort">Trier les références</label><select id="comparisonSort">
      <option value="priceUp">Prix HT croissant</option><option value="priceDown">Prix HT décroissant</option><option value="brand">Marque A → Z</option><option value="name">Désignation A → Z</option><option value="relevance">Pertinence</option>
    </select></div><button id="exitComparison" class="secondary" type="button">Quitter la comparaison</button></div>`;
  $("comparisonSort").value = $("catalogSort").value;
  $("comparisonSort").onchange = () => {
    $("catalogSort").value = $("comparisonSort").value;
    updateCatalogResults(browser);
  };
  const criteriaOpen = Boolean(browser.comparison.criteriaOpen);
  $("comparisonCriteria").open = criteriaOpen;
  $("comparisonCriteria").ontoggle = (event) => {
    if (browser.comparison) browser.comparison.criteriaOpen = event.target.open;
  };
  $("comparisonPanel")
    .querySelectorAll("[data-criterion]")
    .forEach((input) => {
      input.onchange = () => {
        browser.comparison.criteria = Array.from(
          $("comparisonPanel").querySelectorAll("[data-criterion]:checked"),
          (item) => item.dataset.criterion,
        );
        browser.comparison.criteriaOpen = true;
        updateBrandChoices(browser);
        updateCatalogResults(browser);
        $("comparisonPanel")
          .querySelector(`[data-criterion="${input.dataset.criterion}"]`)
          ?.focus();
      };
    });
  $("exitComparison").onclick = () => {
    browser.comparison = null;
    updateBrandChoices(browser);
    updateCatalogResults(browser);
  };
  wireEquipmentPhotos($("comparisonPanel"));
}
