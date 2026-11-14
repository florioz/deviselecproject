"use strict";

function validateBackup(v) {
  if (
    !v ||
    v.version !== 1 ||
    !Array.isArray(v.companies) ||
    !Array.isArray(v.quotes) ||
    !Array.isArray(v.catalog)
  )
    throw Error("Format incompatible");
  const ids = new Set();
  const validId = (id) =>
    typeof id === "string" && /^[a-zA-Z0-9_.:-]{1,150}$/.test(id);
  v.companies.forEach((c) => {
    if (
      !c ||
      !validId(c.id) ||
      ids.has(c.id) ||
      typeof c.name !== "string" ||
      !Number.isInteger(c.nextNumber) ||
      c.nextNumber < 1
    )
      throw Error("Entreprise invalide");
    ids.add(c.id);
  });
  const qids = new Set();
  const validLine = (l) =>
    l &&
    typeof l.label === "string" &&
    typeof l.unit === "string" &&
    ["material", "labor", "service"].includes(l.kind) &&
    Number.isFinite(l.qty) &&
    l.qty > 0 &&
    l.qty <= 1000000 &&
    Number.isFinite(l.price) &&
    l.price >= 0 &&
    l.price <= 10000000 &&
    [0, 5.5, 10, 20].includes(Number(l.vat)) &&
    (l.room == null || typeof l.room === "string");
  v.quotes.forEach((q) => {
    if (
      !q ||
      !validId(q.id) ||
      qids.has(q.id) ||
      !ids.has(q.companyId) ||
      !q.company ||
      !Array.isArray(q.lines) ||
      !q.lines.every(validLine) ||
      (q.locked !== undefined && typeof q.locked !== "boolean") ||
      (q.locked && q.status !== "Accepté") ||
      (q.revision !== undefined &&
        (!Number.isInteger(q.revision) || q.revision < 1)) ||
      (q.versionRoot !== undefined && !validId(q.versionRoot)) ||
      (q.internalHourlyCost != null &&
        (!Number.isFinite(q.internalHourlyCost) || q.internalHourlyCost < 0)) ||
      typeof q.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(q.date) ||
      (q.rooms != null &&
        (!Array.isArray(q.rooms) ||
          !q.rooms.every((r) => typeof r === "string")))
    )
      throw Error("Devis invalide");
    qids.add(q.id);
  });
  for (const key of ["clients", "catalog", "workKits", "laborPresets"]) {
    if (v[key] != null && !Array.isArray(v[key])) throw Error("Liste invalide");
    const recordIds = new Set();
    (v[key] || []).forEach((item) => {
      if (
        !item ||
        !validId(item.id) ||
        recordIds.has(item.id) ||
        !ids.has(item.companyId)
      )
        throw Error("Donnée sans entreprise ou identifiant unique");
      recordIds.add(item.id);
      if (
        key === "clients" &&
        (typeof item.name !== "string" || typeof item.address !== "string")
      )
        throw Error("Client invalide");
      if (
        key === "workKits" &&
        (typeof item.name !== "string" ||
          !Array.isArray(item.lines) ||
          !item.lines.every(validLine))
      )
        throw Error("Kit invalide");
      if (
        key === "laborPresets" &&
        (typeof item.label !== "string" ||
          !Number.isFinite(item.price) ||
          item.price < 0)
      )
        throw Error("Forfait invalide");
    });
  }
  return v;
}
function restoreData(text) {
  let next;
  try {
    next = validateBackup(JSON.parse(text));
  } catch (e) {
    alert(
      "Sauvegarde invalide ou incompatible. Aucune donnée n’a été remplacée.",
    );
    return false;
  }
  if (
    !confirm(
      `Restaurer ${next.companies.length} entreprise(s), ${next.quotes.length} devis, ${(next.clients || []).length} clients, ${(next.workKits || []).length} kits et ${(next.laborPresets || []).length} forfaits ?\nToutes les données locales seront remplacées. Exportez une sauvegarde actuelle avant de continuer.`,
    )
  )
    return false;
  const previous = db;
  db = next;
  try {
    initializeClients(false);
    if (!company()) db.active = db.companies[0]?.id || null;
    if (
      !save({ forceCheckpoint: true, checkpointReason: "Avant restauration" })
    ) {
      db = previous;
      return false;
    }
    draft = null;
    quoteCatalogState = null;
    clientReturnQuote = null;
    render();
    toast("Sauvegarde restaurée");
    return true;
  } catch (e) {
    db = previous;
    alert("Restauration impossible. Vos données sont conservées.");
    return false;
  }
}
