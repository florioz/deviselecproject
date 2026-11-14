"use strict";

const WIRE_TYPES = {
  R2V: "U-1000 R2V",
  N1X6G3: "FR-N1X6G3",
  "H07V-U": "H07V-U · fil rigide",
  "H07V-R": "H07V-R · fil câblé",
  "H07V-K": "H07V-K · fil souple",
  "H07RN-F": "H07RN-F · câble souple",
  "H05VV-F": "H05VV-F · câble souple",
  LiYCY: "LiYCY · câble blindé",
  ICTA: "Gaine ICTA",
  IRL: "Tube IRL",
  RJ45: "Câble / cordon RJ45",
};
function wireChoiceLabel(key, value) {
  switch (key) {
    case "shield":
      return (
        { none: "Non blindé (indiqué)", shielded: "Blindé (indiqué)" }[value] ||
        value
      );
    case "length":
      return value + " m";
    case "diameter":
      return value + " mm";
    case "type":
      return WIRE_TYPES[value] || value;
    case "section":
      return value.replace(".", ",") + " mm²";
    case "earth":
      return value === "G" ? "G · avec vert/jaune" : "X · sans vert/jaune";
    case "pack":
      return (
        {
          cut: "À la coupe / au mètre",
          couronne: "Couronne",
          touret: "Touret",
          bobine: "Bobine",
          box: "Box",
          boite: "Boîte",
        }[value] || value
      );
    default:
      return value;
  }
}

function renderWireFilters(browser) {
  const section = $("wireFilters");
  const guided =
    (browser.treeFamily === "cables" && browser.showResults) ||
    (browser.treeFamily === "reseau" && browser.treeLeaf === "rj45") ||
    ($("catalogCategory").value === "Câbles et conduits" &&
      browser.showResults);
  const searching = /3g|5g|h07|h05|r2v|cable|fil electrique/.test(
    normalizeSearch($("catalogSearch").value),
  );
  section.hidden =
    !guided && !searching && !Object.values(browser.wire || {}).some(Boolean);
  if (section.hidden) return;
  const conduit =
    browser.treeFamily === "cables" &&
    ["gaines", "tubes", "goulottes"].includes(browser.treeLeaf);
  const category = $("catalogCategory").value;
  const fields = [
    ["type", "Type de câble / conduit"],
    [
      conduit ? "diameter" : "section",
      conduit ? "Diamètre (mm)" : "Section (mm²)",
    ],
    ["conductors", "Nombre de conducteurs"],
    ["earth", "Repérage terre"],
    ["color", "Couleur du fil / de la gaine"],
    ["shield", "Blindage"],
    ["length", "Longueur du produit (m)"],
    ["pack", "Conditionnement"],
    [
      conduit ? "section" : "diameter",
      conduit ? "Section des fils (mm²)" : "Diamètre de gaine (mm)",
    ],
  ];
  const profiles = browser.items
    .map((entry) => entry.product)
    .filter(
      (product) =>
        equipmentMatches(product, browser) &&
        (!category || product.category === category),
    );
  const moreOpen = $("wireMoreFilters")?.open;
  const controls = fields.map(([key, title]) => {
    const current = browser.wire?.[key] || "";
    const candidates = profiles.filter((product) =>
      matchesWireFilters(product, browser, key),
    );
    const values = [
      ...new Set(
        [
          ...candidates.map((product) => wireProfile(product)[key]),
          current,
        ].filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
    if (!values.length && !["type", "shield", "length"].includes(key))
      return "";
    if (
      !values.includes("unknown") &&
      candidates.some((product) => wireProfile(product)[key] === undefined)
    )
      values.push("unknown");
    return `<label>${title}<select id="wire-${key}" data-wire-filter="${key}"><option value="">Tous</option>${values.map((value) => `<option value="${esc(value)}" ${value === current ? "selected" : ""}>${esc(value === "unknown" ? "Non renseigné" : wireChoiceLabel(key, value))}</option>`).join("")}</select></label>`;
  });
  section.innerHTML = `<h3>Spécificités des câbles et conduits</h3><div class="grid">${controls.slice(0, 2).join("")}</div><details id="wireMoreFilters" ${moreOpen ? "open" : ""}><summary>Conducteurs, blindage, longueur et autres critères</summary><div class="grid filter-grid">${controls.slice(2).join("")}</div></details><button type="button" id="clearWireFilters" class="text-button">Effacer ces critères</button>`;
  section.querySelectorAll("[data-wire-filter]").forEach(
    (input) =>
      (input.onchange = () => {
        browser.wire = {
          ...(browser.wire || {}),
          [input.dataset.wireFilter]: input.value,
        };
        browser.limit = 30;
        updateBrandChoices(browser);
        updateCatalogResults(browser);
        $(input.id)?.focus({ preventScroll: true });
      }),
  );
  $("clearWireFilters").onclick = () => {
    browser.wire = {};
    updateBrandChoices(browser);
    updateCatalogResults(browser);
  };
}
