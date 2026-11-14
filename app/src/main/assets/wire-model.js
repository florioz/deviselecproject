"use strict";

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
