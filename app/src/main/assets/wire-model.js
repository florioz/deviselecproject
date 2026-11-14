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
  else if (/\bliycy\b/.test(text)) facts.type = "LiYCY";
  else if (/\bicta\b/.test(text)) facts.type = "ICTA";
  else if (/\birl\b/.test(text)) facts.type = "IRL";
  else if (/\b(?:cable|cordon)\b.*\b(?:rj45|cat[ .-]?[5678])/.test(text))
    facts.type = "RJ45";
  const constructions = [
    ...text.matchAll(
      /\b([1-9]\d?)\s*([gx])\s*(\d+(?:\.\d+)?)(?![\d.])(?=mm[²2]|\b)/g,
    ),
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
  if (facts.type === "RJ45") {
    const pairs = [...text.matchAll(/\b(?:(\d+)\s*x\s*)?(\d+)\s*p\b/g)].map(
      (match) => Number(match[1] || 1) * Number(match[2]) * 2,
    );
    if (new Set(pairs).size === 1) facts.conductors = String(pairs[0]);
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
  const lengths = [
    ...text.matchAll(/\b(?:l\s*)?(\d+(?:\.\d+)?)\s*m\b(?![²2])/g),
  ].map((match) => String(Number(match[1])));
  if (new Set(lengths).size === 1) facts.length = lengths[0];
  if (/prix au metre|vendu au metre/.test(text)) facts.pack = "cut";
  else {
    const packaging = text.match(/\b(couronne|touret|bobine|box|boite)\b/);
    if (packaging) facts.pack = packaging[1];
  }
  const shields = [...text.matchAll(/\b(sf|s|f|u)\s*\/\s*(ftp|utp)\b/g)].map(
    (match) => (match[1] + "/" + match[2]).toUpperCase(),
  );
  if (new Set(shields).size === 1) facts.shield = shields[0];
  else if (!shields.length) {
    if (/non[ -]blind|sans blindage/.test(text)) facts.shield = "none";
    else if (/\bftp\s+pimf\b/.test(text)) facts.shield = "U/FTP";
    else if (/\bsftp\b/.test(text)) facts.shield = "S/FTP";
    else if (/\bftp\b/.test(text)) facts.shield = "F/UTP";
    else if (/\butp\b/.test(text)) facts.shield = "U/UTP";
    else if (/\bblinde/.test(text)) facts.shield = "shielded";
  }
  if (/\b(?:gaine|icta|irl|tube)\b/.test(text)) {
    const diameters = [
      ...text.matchAll(/\b(?:d|diametre|ø)\s*(\d+(?:\.\d+)?)/g),
    ].map((match) => String(Number(match[1])));
    if (new Set(diameters).size === 1) facts.diameter = diameters[0];
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
  return active.every(([key, value]) =>
    value === "unknown" ? profile[key] === undefined : profile[key] === value,
  );
}
