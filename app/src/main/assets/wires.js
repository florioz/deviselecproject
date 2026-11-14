"use strict";

const WIRE_TYPES = {
  R2V: "U-1000 R2V",
  N1X6G3: "FR-N1X6G3",
  "H07V-U": "H07V-U · fil rigide",
  "H07V-R": "H07V-R · fil câblé",
  "H07V-K": "H07V-K · fil souple",
  "H07RN-F": "H07RN-F · câble souple",
  "H05VV-F": "H05VV-F · câble souple",
};
const WIRE_PRESETS = {
  "3g15": { conductors: "3", earth: "G", section: "1.5" },
  "3g25": { conductors: "3", earth: "G", section: "2.5" },
  "5g15": { conductors: "5", earth: "G", section: "1.5" },
  "5g25": { conductors: "5", earth: "G", section: "2.5" },
  h07vu: { type: "H07V-U" },
  h07vk: { type: "H07V-K" },
  wires: {},
};
function wireChoiceLabel(key, value) {
  switch (key) {
    case "type":
      return WIRE_TYPES[value] || value;
    case "section":
      return value.replace(".", ",") + " mm²";
    case "earth":
      return value === "G" ? "G · avec vert/jaune" : "X · sans vert/jaune";
    case "pack":
      return value === "cut" ? "Au mètre" : value + " m · couronne / touret";
    default:
      return value;
  }
}

function renderWireFilters(browser) {
  const section = $("wireFilters");
  const guided =
    browser.treeFamily === "cables" &&
    Object.hasOwn(WIRE_PRESETS, browser.treeLeaf);
  const searching = /3g|5g|h07|h05|r2v|cable|fil electrique/.test(
    normalizeSearch($("catalogSearch").value),
  );
  section.hidden =
    !guided && !searching && !Object.values(browser.wire || {}).some(Boolean);
  if (section.hidden) return;
  const fields = [
    ["type", "Type de fil / câble"],
    ["section", "Section (mm²)"],
    ["conductors", "Nombre de conducteurs"],
    ["earth", "Repérage terre"],
    ["color", "Couleur du fil / de la gaine"],
    ["pack", "Conditionnement"],
  ];
  const profiles = browser.items
    .map((entry) => entry.product)
    .filter(
      (product) =>
        wireProfile(product).isConductor && equipmentMatches(product, browser),
    );
  const moreOpen = $("wireMoreFilters")?.open;
  const controls = fields.map(([key, title]) => {
    const current = browser.wire?.[key] || "";
    const values = [
      ...new Set(
        [
          ...profiles
            .filter((product) => matchesWireFilters(product, browser, key))
            .map((product) => wireProfile(product)[key]),
          current,
        ].filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
    if (["earth", "color"].includes(key) && !values.length) return "";
    return `<label>${title}<select id="wire-${key}" data-wire-filter="${key}"><option value="">Tous</option>${values.map((value) => `<option value="${esc(value)}" ${value === current ? "selected" : ""}>${esc(wireChoiceLabel(key, value))}</option>`).join("")}</select></label>`;
  });
  section.innerHTML = `<h3>Affiner les fils et câbles</h3><div class="grid">${controls.slice(0, 2).join("")}</div><details id="wireMoreFilters" ${moreOpen ? "open" : ""}><summary>Conducteurs, couleur et conditionnement</summary><div class="grid filter-grid">${controls.slice(2).join("")}</div></details><button type="button" id="clearWireFilters" class="text-button">Effacer ces critères</button>`;
  section.querySelectorAll("[data-wire-filter]").forEach(
    (input) =>
      (input.onchange = () => {
        browser.wire = {
          ...(browser.wire || {}),
          [input.dataset.wireFilter]: input.value,
        };
        if (guided) browser.treeLeaf = "wires";
        browser.limit = 30;
        updateBrandChoices(browser);
        updateCatalogResults(browser);
        $(input.id)?.focus({ preventScroll: true });
      }),
  );
  $("clearWireFilters").onclick = () => {
    browser.wire = {};
    if (guided) browser.treeLeaf = "wires";
    updateBrandChoices(browser);
    updateCatalogResults(browser);
  };
}
