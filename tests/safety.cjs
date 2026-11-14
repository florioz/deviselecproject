const { chromium } = require("playwright");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const assert = require("node:assert/strict");

(async () => {
  const assets = path.join(__dirname, "../app/src/main/assets");
  const server = http.createServer((req, res) => {
    const name =
      new URL(req.url, "http://localhost").pathname.slice(1) || "index.html";
    if (
      !/^[a-z0-9.-]+$/.test(name) ||
      !fs.existsSync(path.join(assets, name))
    ) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      "Content-Type",
      name.endsWith(".js")
        ? "application/javascript"
        : name.endsWith(".json")
          ? "application/json"
          : name.endsWith(".css")
            ? "text/css"
            : "text/html",
    );
    res.end(fs.readFileSync(path.join(assets, name)));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      acceptDownloads: true,
    });
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let accept = true;
    page.on("dialog", (dialog) =>
      accept ? dialog.accept() : dialog.dismiss(),
    );
    await page.route("https://www.123elec.com/**", (route) => route.abort());
    await page.addInitScript(() => {
      const c = {
        id: "company",
        name: "Électricité Contrôle",
        address: "12 rue des Artisans, Paris",
        rate: 50,
        internalHourlyCost: 20,
        markup: 30,
        vat: 20,
        validity: 30,
        nextNumber: 2,
        terms: "Solde à réception.",
      };
      const material = {
        kind: "material",
        catalogId: "m1",
        label: "Prise de contrôle",
        brand: "Marque A",
        ref: "A-001",
        qty: 2,
        unit: "u",
        price: 20,
        cost: 10,
        vat: 20,
        markup: 30,
        room: "Cuisine",
        checked: "2020-01-01",
      };
      const quote = {
        id: "quote",
        companyId: c.id,
        company: c,
        number: "DEV-2026-0001",
        client: "Client Martin",
        clientAddress: "24 avenue du Chantier, Paris",
        site: "",
        email: "martin@example.fr",
        title: "Rénovation électrique",
        date: new Date().toLocaleDateString("en-CA"),
        updated: new Date().toISOString(),
        validity: 30,
        discount: 10,
        terms: c.terms,
        mode: "mixed",
        status: "Brouillon",
        stage: 2,
        lines: [
          material,
          { ...material, qty: 3, room: "Salon" },
          {
            ...material,
            qty: 1,
            unit: "lot",
            cost: 50,
            price: 80,
            room: "Garage",
          },
          {
            ...material,
            catalogId: "m2",
            ref: "B-001",
            label: "=FORMULE()",
            qty: 1,
            cost: null,
            price: 0,
            checked: "",
          },
          {
            kind: "labor",
            label: "Pose",
            qty: 2,
            unit: "h",
            cost: 0,
            price: 50,
            vat: 20,
            room: "Cuisine",
          },
          {
            kind: "service",
            label: "Déplacement",
            qty: 1,
            unit: "forfait",
            cost: 0,
            price: 30,
            vat: 20,
          },
        ],
      };
      localStorage.setItem(
        "deviselec.v1",
        JSON.stringify({
          version: 1,
          companies: [c],
          active: c.id,
          quotes: [quote],
          catalog: [],
          clients: [],
        }),
      );
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => !catalogLoading);
    assert.equal(await page.locator("[data-quote-status]").count(), 0);
    assert.match(
      await page.locator(".quote-status").textContent(),
      /Brouillon/,
    );
    await page.locator("[data-open]").click();
    // Merely choosing a new status has no persistent effect, and cancelling preserves it.
    await page.locator("#changeQuoteStatus").click();
    await page.locator("#f-nextQuoteStatus").selectOption("Envoyé");
    assert.equal(await page.evaluate(() => db.quotes[0].status), "Brouillon");
    await page.getByRole("button", { name: "Annuler", exact: true }).click();
    assert.equal(await page.evaluate(() => db.quotes[0].status), "Brouillon");
    const warnings = await page.evaluate(() => quoteWarnings(draft));
    assert.ok(
      warnings.some((issue) => issue.message.includes("plus de 90 jours")),
    );
    assert.ok(warnings.some((issue) => issue.message.includes("à zéro")));
    // PDF warning confirmation and cancellation do not generate a document.
    await page.evaluate(() => {
      window.Android = { pdf: () => (window.printed = true) };
    });
    await page.locator("#pdf").click();
    assert.equal(await page.locator("#confirmQuotePdf").count(), 1);
    await page
      .getByRole("button", { name: "Revenir au devis", exact: true })
      .click();
    assert.equal(await page.evaluate(() => Boolean(window.printed)), false);
    await page.evaluate(() => delete window.Android);
    // The estimate includes the discount and reports unknown purchase/service costs.
    assert.equal(
      await page.evaluate(() => profitEstimate(draft).unknownCosts),
      2,
    );
    await page.locator("#profitPanel>summary").click();
    await page.locator("#profitPanel details>summary").click();
    await page.locator('[data-internal-cost="3"]').fill("5");
    await page.locator('[data-internal-cost="5"]').fill("10");
    assert.deepEqual(
      await page.evaluate(() => {
        const p = profitEstimate(draft);
        return [
          p.revenue,
          p.materials,
          p.labor,
          p.services,
          p.cost,
          p.margin,
          p.unknownCosts,
        ];
      }),
      [279, 105, 40, 10, 155, 124, 0],
    );
    assert.equal(
      await page.evaluate(() =>
        /rentabilit|coût interne|marge estimée/i.test(pdfHtml(draft)),
      ),
      false,
    );
    await page.screenshot({
      path: "tmp/safety-profit-mobile.png",
      fullPage: true,
    });
    // Material is aggregated across rooms, with separate quantities for distinct sale units.
    assert.deepEqual(
      await page.evaluate(() =>
        purchaseItems(draft)
          .filter((item) => item.ref === "A-001")
          .map((item) => [item.unit, item.qty])
          .sort(),
      ),
      [
        ["lot", 1],
        ["u", 5],
      ],
    );
    await page.locator("#purchaseList").click();
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#purchaseCsv").click();
    const download = await downloadPromise;
    const csv = fs.readFileSync(await download.path(), "utf8");
    assert.ok(csv.includes('"5"'));
    assert.ok(csv.includes("'=FORMULE()"));
    assert.ok(!csv.includes("Déplacement"));
    await page.screenshot({
      path: "tmp/safety-purchases-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Fermer", exact: true })
      .last()
      .click();
    // Acceptance freezes the complete document only after explicit confirmation.
    await page.locator("#changeQuoteStatus").click();
    await page.locator("#f-nextQuoteStatus").selectOption("Accepté");
    assert.equal(await page.locator("#lockAcceptedQuote").isChecked(), true);
    await page.locator('#quoteStatusForm button[type="submit"]').click();
    assert.equal(await page.locator("#newQuoteRevision").count(), 1);
    assert.equal(await page.locator("#f-discount").count(), 0);
    const locked = await page.evaluate(() => JSON.stringify(db.quotes[0]));
    await page.evaluate(() => {
      draft.lines[0].price = 999;
      storeQuote(true);
      window.Android = { pdf: (html) => (window.lockedPrint = html) };
      printQuote(draft);
      delete window.Android;
      renderEditor();
    });
    assert.equal(
      await page.evaluate(() => JSON.stringify(db.quotes[0])),
      locked,
    );
    assert.equal(
      await page.evaluate(() => window.lockedPrint.includes("999,00")),
      false,
    );
    await page.screenshot({
      path: "tmp/safety-locked-mobile.png",
      fullPage: true,
    });
    await page.locator("#newQuoteRevision").click();
    await page.locator('#duplicateForm button[type="submit"]').click();
    assert.deepEqual(
      await page.evaluate(() => [
        draft.status,
        Boolean(draft.locked),
        draft.versionRoot,
        draft.revision,
        draft.supersedes,
      ]),
      ["Brouillon", false, "quote", 2, "quote"],
    );
    await page.locator("#selectionButton").click();
    await page.locator('[data-edit-line="0"]').click();
    await page.locator("#f-qty").fill("4");
    await page.locator('#lineForm button[type="submit"]').click();
    assert.equal(
      await page.evaluate(
        () => db.quotes.find((q) => q.id === "quote").lines[0].qty,
      ),
      2,
    );
    await page.locator("#back").click();
    await page.locator('[data-open="quote"]').click();
    await page.locator("#newQuoteRevision").click();
    await page.locator('#duplicateForm button[type="submit"]').click();
    assert.equal(await page.evaluate(() => draft.revision), 3);
    // Exercise a large, multi-room document and both PDF generators.
    const html = await page.evaluate(() => {
      draft.lines = Array.from({ length: 150 }, (_, i) => ({
        ...draft.lines[0],
        catalogId: "stress-" + i,
        ref: i === 149 ? "LAST-REF" : "REF-" + i,
        label: "Équipement de contrôle " + i,
        room: "Pièce " + Math.floor(i / 15),
        qty: 1,
      }));
      draft.lines.push({
        ...draft.lines[0],
        catalogId: "pending",
        ref: "PENDING",
        needsPrice: true,
        price: 0,
        cost: null,
      });
      draft.stage = 2;
      renderEditor();
      return purchaseHtml(draft);
    });
    await page.locator("#pdf").click();
    assert.equal(await page.locator("#confirmQuotePdf").count(), 0);
    assert.ok(
      await page
        .locator("#toast")
        .textContent()
        .then((text) => text.includes("prix à compléter")),
    );
    await page.locator("[data-review-price]").last().fill("12");
    const quoteHtml = await page.evaluate(() => pdfHtml(draft));
    const print = await browser.newPage();
    await print.setContent(html);
    await print.pdf({
      path: "tmp/safety-purchases.pdf",
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    await print.setContent(quoteHtml);
    await print.pdf({
      path: "tmp/safety-quote.pdf",
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    await print.close();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    // Recovery is persistent, bounded, and also records a state before restoration.
    await page.locator("#back").click();
    await page.evaluate(async () => {
      await checkpointQueue;
      for (let i = 0; i < 7; i++) {
        db.companies[0].name = "Entreprise " + i;
        save({
          forceCheckpoint: true,
          checkpointReason: "Contrôle de conservation",
        });
        await checkpointQueue;
      }
    });
    assert.equal(
      await page.evaluate(async () => (await recoverySnapshots()).length),
      5,
    );
    const previousName = await page.evaluate(
      async () =>
        JSON.parse((await recoverySnapshots())[0].payload).companies[0].name,
    );
    await page.getByRole("button", { name: "Données", exact: true }).click();
    await page.locator('[data-recover="0"]').waitFor();
    accept = false;
    await page.locator('[data-recover="0"]').click();
    assert.equal(
      await page.evaluate(() => db.companies[0].name),
      "Entreprise 6",
    );
    accept = true;
    await page.locator('[data-recover="0"]').click();
    await page.waitForFunction(
      (expected) => db.companies[0].name === expected,
      previousName,
    );
    await page.evaluate(async () => {
      await checkpointQueue;
    });
    assert.equal(
      await page.evaluate(async () => (await recoverySnapshots()).length),
      5,
    );
    assert.ok(
      await page.evaluate(async () =>
        (await recoverySnapshots()).some(
          (snapshot) => snapshot.reason === "Avant restauration",
        ),
      ),
    );
    // A failure of the independent recovery store does not lose the current saved document.
    await page.evaluate(async () => {
      const open = openRecoveryDatabase;
      openRecoveryDatabase = () => Promise.reject(Error("quota"));
      try {
        db.companies[0].name = "Enregistrement conservé";
        save({ forceCheckpoint: true });
        await checkpointQueue;
      } finally {
        openRecoveryDatabase = open;
      }
    });
    assert.equal(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem(KEY)).companies[0].name,
      ),
      "Enregistrement conservé",
    );
    assert.ok(await page.evaluate(() => recoveryError.length > 0));
    await page.evaluate(async () => {
      db.companies[0].name = "Enregistrement suivant";
      save({ forceCheckpoint: true });
      await checkpointQueue;
    });
    assert.equal(await page.evaluate(() => recoveryError), "");
    await page.screenshot({
      path: "tmp/safety-recovery-mobile.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: protected status changes, warnings, purchase grouping/CSV, discounted profitability, locked snapshots and revisions, large PDFs, five persistent recovery checkpoints, restore cancellation and storage failure.",
    );
  } finally {
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
