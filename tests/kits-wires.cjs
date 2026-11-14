const { chromium } = require("playwright");
const fs = require("node:fs"),
  http = require("node:http"),
  path = require("node:path"),
  assert = require("node:assert/strict");
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
        : name.endsWith(".css")
          ? "text/css"
          : name.endsWith(".json")
            ? "application/json"
            : "text/html",
    );
    res.end(fs.readFileSync(path.join(assets, name)));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.route("https://www.123elec.com/**", (route) => route.abort());
    await page.addInitScript(() =>
      localStorage.setItem(
        "deviselec.v1",
        JSON.stringify({
          version: 1,
          active: "a",
          companies: [
            {
              id: "a",
              name: "Électricité Contrôle",
              rate: 50,
              markup: 30,
              vat: 20,
              validity: 30,
              nextNumber: 1,
            },
          ],
          catalog: [],
          quotes: [],
          clients: [],
        }),
      ),
    );
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => !catalogLoading);
    await page.locator("#newQuote").click();
    // Exact numeric parsing distinguishes decimal sections, earth markings and accessories.
    assert.deepEqual(
      await page.evaluate(() => [
        wireProfile({ label: "Câble U-1000 R2V 3G1,5 mm² couronne de 100m" })
          .section,
        wireProfile({ label: "Câble R2V 3G15 mm²" }).section,
        wireProfile({ label: "Câble R2V 3x2.5 mm²" }).earth,
        wireProfile({ label: "Fil électrique H07VU 1.5² bleu" }).color,
        wireProfile({ label: "Pince pour fil H07VU 1.5 mm²" }).isConductor,
        wireProfile({ label: "Fil électrique H07VU réf. 31525" }).section ??
          null,
        wireProfile({ label: "Fil électrique H07VU 1.5 mm² / 2.5 mm²" })
          .section ?? null,
      ]),
      ["1.5", "15", "X", "bleu", false, null, null],
    );
    await page.locator('[data-tree-tile="cables"]').click();
    await page.locator('[data-tree-tile="3g25"]').click();
    assert.ok((await page.locator(".catalog-product").count()) > 0);
    await page.locator("#wire-type").selectOption("R2V");
    await page.locator("#wireMoreFilters>summary").click();
    await page.locator("#wire-pack").selectOption("cut");
    assert.equal(
      await page.evaluate(() =>
        [...document.querySelectorAll("[data-pick]")].every((button) => {
          const facts = wireProfile(
            catalogItems().find(
              (product) => product.id === button.dataset.pick,
            ),
          );
          return (
            facts.type === "R2V" &&
            facts.section === "2.5" &&
            facts.conductors === "3" &&
            facts.earth === "G" &&
            facts.pack === "cut"
          );
        }),
      ),
      true,
    );
    await page.screenshot({
      path: "tmp/wires-3g25-mobile.png",
      fullPage: true,
    });
    await page.locator('[data-tree-family="cables"]').click();
    await page.locator('[data-tree-tile="h07vu"]').click();
    await page.locator("#wire-section").selectOption("1.5");
    if (!(await page.locator("#wireMoreFilters").evaluate((el) => el.open)))
      await page.locator("#wireMoreFilters>summary").click();
    await page.locator("#wire-color").selectOption("bleu");
    assert.ok((await page.locator(".catalog-product").count()) > 0);
    assert.equal(
      await page.evaluate(() =>
        [...document.querySelectorAll("[data-pick]")].every((button) => {
          const facts = wireProfile(
            catalogItems().find(
              (product) => product.id === button.dataset.pick,
            ),
          );
          return (
            facts.type === "H07V-U" &&
            facts.section === "1.5" &&
            facts.color === "bleu"
          );
        }),
      ),
      true,
    );
    await page.locator("#resetFilters").click();
    await page.locator("#openKits").click();
    await page.locator("#newWorkKit").click();
    assert.equal(await page.locator("#kitAddMaterial").count(), 1);
    assert.equal(await page.locator("[data-kit-product]").count(), 0);
    assert.equal(await page.locator("#f-kitName").count(), 0);
    await page.locator("#kitAddMaterial").click();
    await page.locator("#catalogSearch").fill("600335");
    const socket = page
      .locator(".catalog-product")
      .filter({ hasText: "Réf. 600335" });
    await socket.locator("[data-pick]").click();
    await socket.locator("[data-pick]").click();
    await socket.locator("[data-pick]").click();
    assert.ok(await page.locator("#kitQuickConfirm").isVisible());
    const confirmation = await page.locator("#kitQuickConfirm").boundingBox();
    assert.ok(confirmation.y >= 0 && confirmation.y + confirmation.height <= 844);
    await page.screenshot({path:"tmp/kit-quick-confirm-mobile.png"});
    assert.match(await page.locator("#kitPickedSummary").textContent(), /3 u/);
    await page.locator("#continueKitProducts").click();
    assert.equal(await page.locator("#kitQuickConfirm").isVisible(), false);
    assert.ok((await page.locator(".equipment-tile").count()) > 0);
    await page.locator("#catalogSearch").fill("52061");
    await page
      .locator(".catalog-product")
      .filter({ hasText: "Réf. 52061" })
      .locator("[data-pick]")
      .click();
    await page.locator("#confirmKitProduct").click();
    assert.equal(await page.locator(".kit-item").count(), 2);
    assert.equal(await page.locator("[data-kit-product]").count(), 0);
    await page.locator("#f-kitHours").fill("0.75");
    await page.locator("#f-kitCount").fill("2");
    await page.locator("#saveWorkKit").click();
    await page.locator("#f-kitName").fill("Cuisine");
    await page.locator('#kitNameForm button[type="submit"]').click();
    const id = await page.evaluate(() => ownWorkKits()[0].id);
    assert.deepEqual(
      await page.evaluate(() => {
        const kit = ownWorkKits()[0];
        return [
          kit.lines.filter((line) => line.kind === "labor").length,
          kitLaborHours(kit),
        ];
      }),
      [1, 0.75],
    );
    await page.locator("#saveWorkKit").click();
    assert.equal(await page.locator("#f-kitName").inputValue(), "Cuisine");
    await page.locator("#f-kitName").fill("Cuisine standard");
    await page.locator('#kitNameForm button[type="submit"]').click();
    assert.equal(await page.evaluate(() => ownWorkKits().length), 1);
    assert.equal(await page.evaluate(() => ownWorkKits()[0].id), id);
    await page.locator("#f-kitHours").fill("2");
    await page.locator("#backKits").click();
    assert.equal(
      await page.evaluate(() => kitLaborHours(ownWorkKits()[0])),
      0.75,
    );
    await page.locator('[data-kit="0"]').click();
    await page.locator("#f-kitCount").fill("2");
    await page.screenshot({
      path: "tmp/kit-global-time-mobile.png",
      fullPage: true,
    });
    await page.locator('#kitForm button[type="submit"]').click();
    assert.deepEqual(
      await page.evaluate(() =>
        draft.lines.map((line) => [line.kind, line.qty]),
      ),
      [
        ["material", 6],
        ["material", 2],
        ["labor", 1.5],
      ],
    );
    assert.match(
      await page.evaluate(() => draft.lines[2].label),
      /Cuisine standard/,
    );
    assert.deepEqual(
      await page.evaluate(() => {
        const kit = {
          lines: [
            { kind: "labor", unit: "h", qty: 1, price: 40 },
            { kind: "labor", unit: "h", qty: 2, price: 55 },
          ],
        };
        consolidateKitLabor(kit);
        return [kit.lines.length, kitLaborHours(kit), kit.lines[0].price];
      }),
      [1, 3, 50],
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: guided cable sections/counts/earth/colors/packaging, exact decimal parsing, one kit edit action, quick product confirmation, global installation time, naming on every save and saved-kit isolation.",
    );
  } finally {
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
