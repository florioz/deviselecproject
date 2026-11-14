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
  h07vr: { type: "H07V-R" },
  h07vk: { type: "H07V-K" },
  wires: {},
};
const wireProfileCache = new WeakMap();
function wireProfile(product) {
  if (wireProfileCache.has(product)) return wireProfileCache.get(product);
  const text = String(product.label || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/,/g, ".");
  const facts = {};
  const single = text.match(/\bh07v[ -]?([urk])\b/);
  if (single) facts.type = "H07V-" + single[1].toUpperCase();
  else if (/\br2v\b/.test(text)) facts.type = "R2V";
  else if (/\bfr[ -]?n1x6g3\b/.test(text)) facts.type = "N1X6G3";
  else if (/\bh07rn[ -]?f\b/.test(text)) facts.type = "H07RN-F";
  else if (/\bh05vv[ -]?f\b/.test(text)) facts.type = "H05VV-F";
  const constructions = [
    ...text.matchAll(/\b([1-9]\d?)\s*([gx])\s*(\d+(?:\.\d+)?)(?![\d.])/g),
  ].map((match) => ({
    conductors: String(Number(match[1])),
    earth: match[2].toUpperCase(),
    section: String(Number(match[3])),
  }));
  if (
    constructions.length &&
    new Set(constructions.map((value) => JSON.stringify(value))).size === 1
  )
    Object.assign(facts, constructions[0]);
  else if (!constructions.length) {
    const sections = [
      ...text.matchAll(/\b(\d+(?:\.\d+)?)\s*(?:mm\s*[²2]|²)/g),
    ].map((match) => String(Number(match[1])));
    if (new Set(sections).size === 1) facts.section = sections[0];
  }
  const accessory =
    /pince|outil|devidoir|derouleur|sans fil|serre.cable|presse.etoupe|collier|cosse|embout|connecteur|gaine|icta|ruban|attache/.test(
      text,
    );
  facts.isConductor =
    !accessory &&
    Boolean(
      facts.type ||
        (constructions.length && /\bcable\b/.test(text)) ||
        (/\bfil electrique\b/.test(text) && facts.section),
    );
  if (single) {
    facts.conductors = "1";
    delete facts.earth;
  }
  const colors = [];
  let colorText = text;
  if (/vert\s*(?:\/|-|et)?\s*jaune/.test(colorText)) {
    colors.push("vert-jaune");
    colorText = colorText.replace(/vert\s*(?:\/|-|et)?\s*jaune/g, "");
  }
  for (const color of [
    "bleu",
    "rouge",
    "noir",
    "marron",
    "gris",
    "blanc",
    "orange",
    "violet",
    "vert",
    "jaune",
  ]) {
    if (new RegExp("\\b" + color + "\\b").test(colorText)) colors.push(color);
  }
  if (colors.length) facts.color = colors.sort().join(" / ");
  if (/prix au metre|vendu au metre/.test(text)) facts.pack = "cut";
  else {
    const length = text.match(
      /(?:couronne|touret|bobine)\s*(?:de\s*)?(\d+(?:\.\d+)?)\s*m\b/,
    );
    if (length) facts.pack = String(Number(length[1]));
  }
  wireProfileCache.set(product, facts);
  return facts;
}
function matchesWireFilters(product, browser, excluded = "") {
  const filters = browser.wire || {};
  const active = Object.entries(filters).filter(
    ([key, value]) => value && key !== excluded,
  );
  if (!active.length) return true;
  const profile = wireProfile(product);
  return (
    profile.isConductor &&
    active.every(([key, value]) => profile[key] === value)
  );
}
function wireRelevance(product) {
  const facts = wireProfile(product);
  if (!facts.isConductor) return 0;
  if (
    ["R2V", "N1X6G3"].includes(facts.type) &&
    ["1.5", "2.5"].includes(facts.section) &&
    ["3", "5"].includes(facts.conductors)
  )
    return 6;
  return facts.type?.startsWith("H07V-") ? 4 : 0;
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
  const label = (key, value) =>
    key === "type"
      ? WIRE_TYPES[value] || value
      : key === "section"
        ? value.replace(".", ",") + " mm²"
        : key === "earth"
          ? value === "G"
            ? "G · avec vert/jaune"
            : "X · sans vert/jaune"
          : key === "pack"
            ? value === "cut"
              ? "Au mètre"
              : value + " m · couronne / touret"
            : value;
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
    return `<label>${title}<select id="wire-${key}" data-wire-filter="${key}"><option value="">Tous</option>${values.map((value) => `<option value="${esc(value)}" ${value === current ? "selected" : ""}>${esc(label(key, value))}</option>`).join("")}</select></label>`;
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
