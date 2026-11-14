const { createTestServer } = require("./helpers.cjs");
const { chromium } = require("playwright");
const fs = require("node:fs");
const assert = require("node:assert/strict");

(async () => {
  const server = createTestServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
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
    page.on("pageerror", (e) => errors.push(e.message));
    let acceptDialog = true;
    page.on("dialog", (d) => (acceptDialog ? d.accept() : d.dismiss()));
    await page.route("https://www.123elec.com/**", (r) => r.abort());
    await page.addInitScript(() => {
      if (localStorage.getItem("deviselec.v1")) return;
      const company = (id) => ({
        id,
        name: "Entreprise " + id,
        address: "12 rue des Artisans, 75000 Paris",
        rate: 50,
        markup: 30,
        vat: 20,
        validity: 30,
        nextNumber: 1,
        terms: "Acompte 30 %, solde à réception.",
        email: "contact@example.fr",
      });
      localStorage.setItem(
        "deviselec.v1",
        JSON.stringify({
          version: 1,
          active: "A",
          companies: [company("A"), company("B")],
          quotes: [],
          catalog: [],
          clients: [
            {
              id: "client-A",
              companyId: "A",
              name: "Client Martin",
              address: "24 avenue du Chantier, 75000 Paris",
              email: "martin@example.fr",
            },
          ],
        }),
      );
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => !catalogLoading);
    await page.locator("#newQuote").click();
    await page.locator("#addRoom").click();
    await page.locator("#roomNameChoice").selectOption("Cuisine");
    await page.locator("#roomForm button").first().click();
    await page.locator("#openKits").click();
    assert.ok(
      await page
        .locator(".kit-preview")
        .first()
        .textContent()
        .then((text) => text.includes("600335")),
    );
    await page.locator("#newWorkKit").click();
    await page.locator('#kitForm button[type="submit"]').click();
    assert.equal(await page.evaluate(() => draft.lines.length), 0);
    assert.equal(await page.locator('[data-kit-field="vat"]').count(), 0);
    await page.locator("#kitAddMaterial").click();
    await page.evaluate(() => initializeCatalog());
    assert.equal(await page.locator("#catalogSearch").count(), 1);
    assert.equal(await page.locator("#kitCatalogue #catalogSearch").count(), 1);
    assert.ok((await page.locator(".equipment-tile").count()) > 0);
    await page.locator("#catalogSearch").fill("600335");
    await page
      .locator(".catalog-product")
      .filter({ hasText: "Réf. 600335" })
      .locator("[data-pick]")
      .click();
    await page.locator("#catalogSearch").fill("52061");
    await page
      .locator(".catalog-product")
      .filter({ hasText: "Réf. 52061" })
      .locator("[data-pick]")
      .click();
    assert.equal(await page.evaluate(() => draft.lines.length), 0);
    await page.locator("#backKitEditor").click();
    await page.locator("#f-kitHours").fill("0.5");
    assert.equal(await page.locator(".kit-item").count(), 2);
    await page.locator("#f-kitCount").fill("2");
    await page.locator("#kitAddMaterial").click();
    assert.equal(await page.locator("#catalogSearch").count(), 1);
    await page.locator("#backKitEditor").click();
    assert.equal(await page.locator("#f-kitCount").inputValue(), "2");
    await page.locator("#saveWorkKit").click();
    await page.locator("#f-kitName").fill("Prise cuisine complète");
    await page.locator('#kitNameForm button[type="submit"]').click();
    assert.equal(await page.evaluate(() => ownWorkKits().length), 1);
    await page.locator("#f-kitCount").fill("2");
    await page.locator('#kitForm button[type="submit"]').click();
    assert.equal(await page.evaluate(() => draft.lines.length), 3);
    assert.equal(await page.evaluate(() => draft.lines[0].qty), 2);
    assert.equal(await page.evaluate(() => draft.lines[2].qty), 1);
    assert.equal(
      await page.evaluate(() => draft.lines.every((l) => l.room === "Cuisine")),
      true,
    );
    const firstTotal = await page.evaluate(() => totals(draft).ht);
    await page.locator(".work-tools summary").click();
    await page.locator("#copyRoom").click();
    await page.locator("#roomNameChoice").selectOption("__custom");
    await page.locator("#f-roomName").fill("Chambre");
    await page.locator("#roomForm button").first().click();
    assert.equal(
      await page.evaluate(() => totals(draft).ht),
      Math.round(firstTotal * 200) / 100,
    );
    await page.evaluate(() => {
      quickAddProduct(catalogItems().find((p) => p.ref === "600335"));
    });
    assert.deepEqual(
      await page.evaluate(() =>
        draft.lines
          .filter((l) => l.ref === "600335")
          .map((l) => [l.room, l.qty]),
      ),
      [
        ["Cuisine", 2],
        ["Chambre", 3],
      ],
    );
    await page.locator(".work-tools summary").click();
    await page.locator("#renameRoom").click();
    await page.locator("#roomNameChoice").selectOption("Chambre 1");
    await page.locator("#roomForm button").first().click();
    assert.equal(
      await page.evaluate(() => draft.lines.some((l) => l.room === "Chambre")),
      false,
    );
    await page.locator("#openLabor").click();
    await page.locator("#newLaborPreset").click();
    await page.locator("#f-presetLabel").fill("Déplacement secteur");
    await page.locator("#f-presetPrice").fill("35");
    await page.locator("#laborPresetForm button").first().click();
    await page.locator('[data-add-labor="0"]').click();
    await page.locator('#lineForm button[type="submit"]').click();
    assert.equal(
      await page.evaluate(() => draft.lines.at(-1).room),
      "Chambre 1",
    );
    assert.equal(await page.evaluate(() => draft.lines.at(-1).price), 35);
    await page.locator("#openLabor").click();
    await page.locator("#hourlyLabor").click();
    await page.locator("#f-qty").fill("1.5");
    await page.locator('#lineForm button[type="submit"]').click();
    assert.equal(await page.evaluate(() => draft.lines.at(-1).price), 50);
    await page.locator("#selectionButton").click();
    await page.locator('[data-edit-line="0"]').click();
    await page.locator("#lineRoomChoice").selectOption("__custom");
    await page.locator("#f-room").fill("Salon");
    await page.locator('#lineForm button[type="submit"]').click();
    assert.equal(
      await page.evaluate(() => roomNames().includes("Salon")),
      true,
    );
    // Go through client and review, then verify room information in PDF output.
    await page.locator("#nextStage").click();
    await page.locator("#chooseQuoteClient").click();
    await page.locator('[data-choose-client="client-A"]').click();
    await page.locator('#quoteForm button[type="submit"]').click();
    await page.locator("#reviewSelection").click();
    assert.equal(await page.locator(".selected-line").count(), 8);
    await page.locator("#closeSelection").click();
    await page.screenshot({
      path: "tmp/productivity-review-mobile.png",
      fullPage: true,
    });
    const original = await page.evaluate(() => structuredClone(draft));
    const html = await page.evaluate(() => pdfHtml(draft));
    assert.ok(html.includes("room-heading"));
    assert.ok(html.includes("Chambre 1"));
    const print = await browser.newPage();
    await print.setContent(html);
    await print.pdf({
      path: "tmp/productivity-room-quote.pdf",
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    await print.close();
    await page.locator("#changeQuoteStatus").click();
    await page.locator("#f-nextQuoteStatus").selectOption("Accepté");
    await page.locator("#lockAcceptedQuote").uncheck();
    await page.locator('#quoteStatusForm button[type="submit"]').click();
    await page.locator("#back").click();
    assert.equal(await page.locator("[data-quote-status]").count(), 0);
    await page
      .locator("summary")
      .filter({ hasText: "Statut, dates et tri" })
      .click();
    await page.locator("#f-quoteStatus").selectOption("Envoyé");
    assert.equal(await page.locator("[data-open]").count(), 0);
    await page.locator("#f-quoteStatus").selectOption("Accepté");
    assert.equal(await page.locator("[data-open]").count(), 1);
    await page.locator("#f-quoteFrom").fill("2099-01-01");
    assert.equal(await page.locator("[data-open]").count(), 0);
    await page.locator("#clearQuoteFilters").click();
    // Keep-price duplicate preserves exact values and resets accepted status.
    await page.locator("[data-copy]").click();
    await page.locator("#duplicateForm button").first().click();
    assert.equal(await page.evaluate(() => draft.status), "Brouillon");
    assert.deepEqual(await page.evaluate(() => draft.lines), original.lines);
    assert.notEqual(await page.evaluate(() => draft.number), original.number);
    await page.locator("#back").click();
    // Supplier change affects only an explicitly repriced duplicate.
    await page.evaluate(() => {
      supplierCatalog.products.find((p) => p.ref === "600335").cost = 10;
    });
    await page.locator(`[data-copy="${original.id}"]`).click();
    await page.locator("#f-copyPrices").selectOption("current");
    await page.locator("#duplicateForm button").first().click();
    assert.equal(
      await page.evaluate(
        () => draft.lines.find((l) => l.ref === "600335").price,
      ),
      13,
    );
    assert.equal(
      await page.evaluate(
        (id) =>
          db.quotes
            .find((q) => q.id === id)
            .lines.find((l) => l.ref === "600335").price,
        original.id,
      ),
      original.lines.find((l) => l.ref === "600335").price,
    );
    // Missing and mismatched sale units cannot silently reprice a line.
    assert.deepEqual(
      await page.evaluate(() => {
        const l = {
          kind: "material",
          catalogId: "missing",
          unit: "u",
          qty: 1,
          price: 99,
        };
        const a = repricedLines([l], []),
          b = repricedLines(
            [{ ...l, catalogId: "x" }],
            [{ id: "x", unit: "lot", cost: 10 }],
          );
        return [
          a.lines[0].price,
          a.unavailable,
          b.lines[0].price,
          b.unavailable,
        ];
      }),
      [99, 1, 99, 1],
    );
    await page.locator("#back").click();
    await page.locator("#companySelect").selectOption("B");
    await page.locator("#newQuote").click();
    await page.locator("#openKits").click();
    assert.equal(await page.locator("[data-kit]").count(), 3);
    await page
      .getByRole("button", { name: "Fermer", exact: true })
      .last()
      .click();
    await page.locator("#openLabor").click();
    assert.equal(await page.locator("[data-add-labor]").count(), 0);
    await page
      .getByRole("button", { name: "Fermer", exact: true })
      .last()
      .click();
    await page.locator("#back").click();
    await page.getByRole("button", { name: "Données", exact: true }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#backup").click();
    const download = await downloadPromise;
    const backup = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
    assert.equal(backup.workKits.length, 1);
    assert.equal(backup.laborPresets.length, 1);
    assert.equal(backup.clients.length, 1);
    assert.ok(backup.backupInfo.exportedAt);
    const before = await page.evaluate(() => JSON.stringify(db));
    await page.evaluate(() => restoreData('{"version":1}'));
    assert.equal(await page.evaluate(() => JSON.stringify(db)), before);
    acceptDialog = false;
    await page.evaluate((text) => restoreData(text), JSON.stringify(backup));
    assert.equal(await page.evaluate(() => JSON.stringify(db)), before);
    acceptDialog = true;
    // Storage failure rolls back in-memory data, without corrupting persisted state.
    assert.equal(
      await page.evaluate(
        (text) => {
          const set = Storage.prototype.setItem;
          Storage.prototype.setItem = () => {
            throw Error("full");
          };
          try {
            return restoreData(text);
          } finally {
            Storage.prototype.setItem = set;
          }
        },
        JSON.stringify({ ...backup, active: "A" }),
      ),
      false,
    );
    assert.equal(await page.evaluate(() => JSON.stringify(db)), before);
    // Browser file restore follows the same validation and confirmation path.
    await page.evaluate(() => {
      db.workKits = [];
      db.laborPresets = [];
      save();
    });
    const chooser = page.waitForEvent("filechooser");
    await page.locator("#restore").click();
    await (
      await chooser
    ).setFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    await page.waitForFunction(() => db.workKits.length === 1);
    await page.reload();
    await page.waitForFunction(() => !catalogLoading);
    assert.equal(await page.evaluate(() => db.laborPresets.length), 1);
    assert.equal(
      await page.evaluate(
        () => db.quotes.find((q) => q.id === db.quotes[0].id).lines[0].room,
      ),
      "Salon",
    );
    await page.locator("#companySelect").selectOption("A");
    await page.locator("[data-open]").first().click();
    await page.evaluate(() => {
      draft.stage = 0;
      renderEditor();
    });
    await page.screenshot({
      path: "tmp/productivity-material-mobile.png",
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.locator("#openKits").click();
    await page.locator('[data-kit="0"]').click();
    await page.screenshot({
      path: "tmp/productivity-kit-mobile.png",
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.locator("#backKits").click();
    await page
      .getByRole("button", { name: "Fermer", exact: true })
      .last()
      .click();
    await page.waitForFunction(() => !kitSession);
    for (const width of [320, 390, 600]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(
        await page.evaluate(() => {
          const elements = [
            ...document.querySelectorAll("nav button,.quote-steps button"),
          ];
          return (
            document.documentElement.scrollWidth <= innerWidth &&
            elements.every(
              (element) =>
                element.scrollWidth <= element.clientWidth &&
                element.getBoundingClientRect().width >= 90,
            )
          );
        }),
        true,
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#selectionButton").click();
    await page.locator('[data-edit-line="0"]').click();
    assert.equal(await page.locator("#f-vat").isVisible(), false);
    assert.equal(await page.locator("#f-room").isVisible(), false);
    assert.equal(
      await page.locator("#lineRoomChoice").evaluate((el) => el.tagName),
      "SELECT",
    );
    await page.getByRole("button", { name: "Annuler", exact: true }).click();
    // A supplier reference without a price can enter a kit and gets completed at the final stage.
    const unknown = await page.evaluate(() =>
      catalogItems().find(
        (p) => p.kind === "material" && p.cost == null && p.ref,
      ),
    );
    assert.ok(unknown);
    await page.locator("#openKits").click();
    await page.locator("#newWorkKit").click();
    await page.locator("#kitAddMaterial").click();
    await page.locator("#catalogSearch").fill(unknown.ref);
    await page.locator(`[data-pick="${unknown.id}"]`).click();
    await page.locator("#backKitEditor").click();
    assert.equal(await page.locator('[data-kit-field="vat"]').count(), 0);
    await page.locator('#kitForm button[type="submit"]').click();
    await page.locator("#f-kitName").fill("Matériel sans prix");
    await page.locator('#kitNameForm button[type="submit"]').click();
    assert.equal(
      await page.evaluate(() => draft.lines.at(-1).needsPrice),
      true,
    );
    await page.evaluate(() => changeQuoteStage(2));
    assert.equal(await page.locator("#quotePricing").getAttribute("open"), "");
    await page.locator("[data-review-price]").last().fill("12.50");
    await page.locator("#f-quoteVat").selectOption("10");
    await page.locator("#applyQuoteVat").click();
    assert.equal(
      await page.evaluate(() => draft.lines.every((line) => line.vat === 10)),
      true,
    );
    assert.equal(
      await page.evaluate(() => draft.lines.at(-1).needsPrice),
      false,
    );
    assert.equal(await page.evaluate(() => draft.lines.at(-1).price), 12.5);
    // Labor added after the final tax choice inherits that choice, including fractional hours.
    await page.locator("#addReviewLine").click();
    await page.locator("#hourlyLabor").click();
    await page.locator("#f-qty").fill("0.125");
    await page
      .getByRole("button", { name: "Augmenter la quantité", exact: true })
      .click();
    assert.equal(await page.locator("#f-qty").inputValue(), "1.125");
    await page.locator('#lineForm button[type="submit"]').click();
    assert.equal(await page.evaluate(() => draft.lines.at(-1).vat), 10);
    assert.equal(await page.evaluate(() => draft.lines.at(-1).qty), 1.125);
    assert.deepEqual(
      await page.evaluate(() => {
        const result = repricedLines(
          [
            {
              kind: "material",
              catalogId: "pending",
              unit: "u",
              price: 0,
              qty: 1,
              markup: 30,
              needsPrice: true,
            },
          ],
          [{ id: "pending", kind: "material", unit: "u", cost: 10 }],
        );
        return [result.lines[0].price, result.lines[0].needsPrice];
      }),
      [13, false],
    );
    await page.screenshot({
      path: "tmp/productivity-pricing-mobile.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: configured kits, room duplication/rename/line moves, labor presets, status/date filters, preserved and current-price copies, company isolation, backup export/file restore/cancel/invalid/storage rollback, PDF room grouping.",
    );
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
