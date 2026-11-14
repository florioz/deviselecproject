"use strict";

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
