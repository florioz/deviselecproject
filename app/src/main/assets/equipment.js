"use strict";

let productImages = {};
let quoteCatalogState = null;
const EQUIPMENT_FAMILIES = [
  {
    id: "appareillage",
    label: "Prises et interrupteurs",
    category: "Appareillage",
    leaves: [
      ["prises", "Prises de courant", /prise.*(?:courant|2p|terre)/],
      ["interrupteurs", "Interrupteurs", /interrupteur|va.et.vient/],
      ["plaques", "Plaques de finition", /plaque/],
      ["commandes", "Poussoirs et variateurs", /poussoir|variateur/],
    ],
  },
  {
    id: "tableaux",
    label: "Tableaux et protections",
    category: "Protection et tableaux",
    leaves: [
      ["disjoncteurs", "Disjoncteurs", /disjoncteur/],
      [
        "differentiels",
        "Interrupteurs différentiels",
        /interrupteur.*differentiel/,
      ],
      ["tableaux", "Tableaux et coffrets", /tableau|coffret/],
      ["parafoudres", "Parafoudres", /parafoudre/],
      ["modules", "Contacteurs et modules", /contacteur|telerupteur|peigne/],
    ],
  },
  {
    id: "cables",
    label: "Câbles et gaines",
    category: "Câbles et conduits",
    leaves: [
      ["cables", "Câbles et fils", /cable|\bfil\b/],
      ["gaines", "Gaines ICTA", /gaine|icta/],
      ["tubes", "Tubes IRL", /tube|irl/],
      ["goulottes", "Goulottes et moulures", /goulotte|moulure/],
    ],
  },
  {
    id: "connexions",
    label: "Boîtes et connexions",
    category: "Boîtes et connexions",
    leaves: [
      ["encastrement", "Boîtes d’encastrement", /encastrement/],
      ["derivation", "Boîtes de dérivation", /derivation/],
      ["connexions", "Bornes et Wago", /wago|borne|connecteur/],
    ],
  },
  {
    id: "eclairage",
    label: "Éclairage",
    category: "Éclairage",
    leaves: [
      ["spots", "Spots", /spot/],
      ["ampoules", "Ampoules", /ampoule/],
      ["rubans", "Rubans LED", /ruban/],
      [
        "luminaires",
        "Luminaires et projecteurs",
        /luminaire|projecteur|hublot|reglette/,
      ],
    ],
  },
  {
    id: "reseau",
    label: "Réseau et communication",
    category: "Communication et réseau",
    leaves: [
      ["rj45", "Prises et câbles RJ45", /rj45|ethernet/],
      [
        "communication",
        "Coffrets de communication",
        /coffret|communication|brassage/,
      ],
    ],
  },
  {
    id: "ventilation",
    label: "Ventilation",
    category: "Ventilation",
    leaves: [
      ["vmc", "VMC et accessoires", /vmc|ventilation|aerateur|extracteur/],
    ],
  },
  {
    id: "chauffage",
    label: "Chauffage",
    category: "Chauffage et eau chaude",
    leaves: [
      [
        "radiateurs",
        "Radiateurs et sèche-serviettes",
        /radiateur|seche.serviette/,
      ],
      ["thermostats", "Thermostats", /thermostat/],
      ["chauffe-eau", "Chauffe-eau", /chauffe.eau/],
    ],
  },
  {
    id: "solaire",
    label: "Solaire et recharge",
    category: "Solaire et recharge",
    leaves: [
      ["recharge", "Bornes de recharge", /borne|recharge/],
      ["solaire", "Panneaux et accessoires", /solaire|photovolt|onduleur/],
    ],
  },
  {
    id: "securite",
    label: "Sécurité et accès",
    category: "Sécurité et accès",
    leaves: [
      ["interphones", "Interphones et visiophones", /interphone|visiophone/],
      ["detecteurs", "Détecteurs et alarmes", /detecteur|alarme|camera/],
    ],
  },
  {
    id: "outillage",
    label: "Outillage et fixations",
    category: "Outillage et accessoires",
    leaves: [
      ["outils", "Outils", /pince|tournevis|scie|outil/],
      ["fixations", "Fixations", /cheville|vis|fixation/],
    ],
  },
];

function equipmentPhoto(product) {
  const image =
    productImages[product.sourceId || product.catalogId || product.id] || {};
  const bundled = product.bundledImage || image.bundledImage;
  const remote = product.image || image.image;
  const url =
    bundled ||
    (remote && window.Android
      ? "product-image?url=" + encodeURIComponent(remote)
      : remote);
  return `<span class="product-photo">${url ? `<img src="${esc(url)}" alt="" loading="lazy" decoding="async">` : ""}
        <span class="photo-fallback" ${url ? "hidden" : ""}>▦</span></span>`;
}

function wireEquipmentPhotos(container) {
  container.querySelectorAll(".product-photo img").forEach((image) => {
    const fallback = () => {
      image.hidden = true;
      image.nextElementSibling.hidden = false;
    };
    image.onerror = fallback;
    if (image.complete && !image.naturalWidth) fallback();
  });
}

function equipmentUsage() {
  const usage = new Map();
  db.quotes
    .filter((quote) => quote.companyId === db.active)
    .forEach((quote) => {
      const identifiers = new Set(
        quote.lines
          .flatMap((line) => [line.catalogId, line.ref && "ref:" + line.ref])
          .filter(Boolean),
      );
      identifiers.forEach((id) => usage.set(id, (usage.get(id) || 0) + 1));
    });
  return usage;
}

function equipmentMatches(product, browser) {
  if (!browser.treeFamily) return true;
  const family = EQUIPMENT_FAMILIES.find(
    (item) => item.id === browser.treeFamily,
  );
  if (!family || product.category !== family.category) return false;
  const leaf = family.leaves.find((item) => item[0] === browser.treeLeaf);
  return !leaf || leaf[2].test(normalizeSearch(product.label));
}

function rememberEquipmentState(browser) {
  if (!browser.picker || !draft) return;
  quoteCatalogState = {
    treeFamily: browser.treeFamily,
    treeLeaf: browser.treeLeaf,
    showResults: browser.showResults,
    comparison: browser.comparison,
  };
  for (const id of [
    "catalogSearch",
    "catalogCategory",
    "catalogBrand",
    "catalogBudget",
    "catalogSource",
    "catalogKind",
    "catalogPrice",
    "catalogStock",
    "catalogSort",
    "catalogMin",
    "catalogMax",
  ]) {
    quoteCatalogState[id] = $(id).value;
  }
}

function renderEquipmentExplorer(browser) {
  const family = EQUIPMENT_FAMILIES.find(
    (item) => item.id === browser.treeFamily,
  );
  const leaf = family?.leaves.find((item) => item[0] === browser.treeLeaf);
  const searching = Boolean($("catalogSearch").value.trim());
  const collection = $("catalogSource").value;
  const showResults = searching || browser.showResults || collection !== "all";
  $("catalogRefinements").hidden = !showResults;
  $("catalogFamilyField").hidden = Boolean(family || browser.comparison);
  $("catalogResultSection").hidden = !showResults;
  const representative = (category, pattern) => {
    const matches = browser.items
      .map((item) => item.product)
      .filter(
        (product) =>
          product.category === category &&
          (!pattern || pattern.test(normalizeSearch(product.label))),
      );
    const useful = matches.filter(
      (product) =>
        !/accessoire|adaptateur|filtre|gaz d|rail spot|pince pour collier/.test(
          normalizeSearch(product.label),
        ),
    );
    const pool = useful.length ? useful : matches;
    const preferred = {
      Appareillage: "600335",
      "Protection et tableaux": "R9PFC616",
      "Boîtes et connexions": "52061",
      Ventilation: "11033025",
      "Sécurité et accès": "1870535",
    };
    return (
      pool.find((product) => product.ref === preferred[category]) ||
      pool.find(
        (product) =>
          product.bundledImage ||
          productImages[product.sourceId || product.id]?.bundledImage,
      ) ||
      pool[0] ||
      {}
    );
  };
  const tiles = showResults
    ? []
    : family
      ? family.leaves.map((item) => ({
          id: item[0],
          label: item[1],
          product: representative(family.category, item[2]),
        }))
      : EQUIPMENT_FAMILIES.map((item) => ({
          id: item.id,
          label: item.label,
          product: representative(item.category),
        }));
  const usage = equipmentUsage();
  const favorites = new Set(favoriteIds());
  const recommended = (showResults || family ? [] : browser.items)
    .map((item) => item.product)
    .filter(
      (product) =>
        favorites.has(productKey(product)) ||
        usage.has(productKey(product)) ||
        usage.has("ref:" + product.ref),
    )
    .sort(
      (a, b) =>
        Number(favorites.has(productKey(b))) -
          Number(favorites.has(productKey(a))) ||
        (usage.get(productKey(b)) || usage.get("ref:" + b.ref) || 0) -
          (usage.get(productKey(a)) || usage.get("ref:" + a.ref) || 0),
    )
    .slice(0, 6);
  $("equipmentExplorer").innerHTML =
    `<div class="equipment-breadcrumb"><button type="button" data-tree-home>Tout le matériel</button>
        ${family ? `<span>›</span><button type="button" data-tree-family="${family.id}">${esc(family.label)}</button>` : ""}
        ${leaf && showResults ? `<span>›</span><strong>${esc(leaf[1])}</strong>` : ""}</div>
        ${
          !showResults
            ? `${
                recommended.length && !family
                  ? `<details id="recommendedEquipment" class="frequent-equipment" ${db.recommendationsExpanded?.[db.active] ? "open" : ""}><summary>Favoris et équipements déjà utilisés <span class="muted">(${recommended.length})</span></summary><div class="recommendation-grid">${recommended
                      .map(
                        (product) =>
                          `<button type="button" class="recommendation" data-recommend="${esc(product.id)}">${equipmentPhoto(product)}<span>${esc(product.label)}</span></button>`,
                      )
                      .join("")}</div></details>`
                  : ""
              }
            <div class="equipment-tiles">${tiles
              .map(
                (
                  item,
                ) => `<button type="button" class="equipment-tile" data-tree-tile="${item.id}">
                <strong>${esc(item.label)}</strong>${equipmentPhoto(item.product)}<span aria-hidden="true">→</span></button>`,
              )
              .join("")}</div>
            ${family ? '<button type="button" id="allFamilyProducts" class="text-button">Voir tous les équipements de cette famille →</button>' : ""}`
            : ""
        }`;
  const choose = (familyId, leafId = "") => {
    browser.comparison = null;
    browser.treeFamily = familyId;
    browser.treeLeaf = leafId;
    browser.showResults = Boolean(leafId);
    $("catalogSearch").value = "";
    $("catalogCategory").value =
      EQUIPMENT_FAMILIES.find((item) => item.id === familyId)?.category || "";
    $("catalogBrand").value = "";
    $("catalogBudget").value = "";
    $("catalogMin").value = "";
    $("catalogMax").value = "";
    $("catalogSource").value = "all";
    updateBrandChoices(browser);
    browser.limit = 30;
    updateCatalogResults(browser);
  };
  $("equipmentExplorer").querySelector("[data-tree-home]").onclick = () =>
    choose("");
  $("equipmentExplorer")
    .querySelectorAll("[data-tree-family]")
    .forEach((button) => {
      button.onclick = () => choose(button.dataset.treeFamily);
    });
  $("equipmentExplorer")
    .querySelectorAll("[data-tree-tile]")
    .forEach((button) => {
      button.onclick = () =>
        family
          ? choose(family.id, button.dataset.treeTile)
          : choose(button.dataset.treeTile);
    });
  if ($("allFamilyProducts"))
    $("allFamilyProducts").onclick = () => {
      browser.showResults = true;
      updateCatalogResults(browser);
    };
  $("equipmentExplorer")
    .querySelectorAll("[data-recommend]")
    .forEach((button) => {
      button.onclick = () => {
        const product = browser.items.find(
          (item) => item.product.id === button.dataset.recommend,
        ).product;
        if (browser.picker) {
          quickAddProduct(product);
          updateCatalogResults(browser);
        } else catalogModal(product);
      };
    });
  wireEquipmentPhotos($("equipmentExplorer"));
  if ($("recommendedEquipment"))
    $("recommendedEquipment").ontoggle = (event) => {
      const expanded = event.target.open;
      if (Boolean(db.recommendationsExpanded?.[db.active]) === expanded) return;
      db.recommendationsExpanded = {
        ...db.recommendationsExpanded,
        [db.active]: expanded,
      };
      save();
    };
}
