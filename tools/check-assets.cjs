const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { assetsPath, routes, findAssetResource } = require("./assets.cjs");

const mimeTypes = {
  ".js": "application/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".html": "text/html",
};
for (const [route, definition] of Object.entries(routes)) {
  assert.match(route, /^\/[a-z0-9.-]*$/);
  assert.equal(
    definition.length,
    2,
    `Invalid resource definition for ${route}`,
  );
  const [filename, mime] = definition;
  assert.match(filename, /^[a-z0-9.-]+$/);
  assert.ok(!filename.includes(".."), `Invalid filename ${filename}`);
  assert.equal(
    mime,
    mimeTypes[path.extname(filename)],
    `Invalid content type for ${filename}`,
  );
  assert.ok(
    fs.statSync(path.join(assetsPath, filename)).isFile(),
    `Missing asset ${filename}`,
  );
}

const html = fs.readFileSync(path.join(assetsPath, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(
  (match) => match[1],
);
const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(
  (match) => match[1],
);
assert.equal(
  new Set(scripts).size,
  scripts.length,
  "A script is loaded more than once",
);
for (const filename of [...scripts, ...styles]) {
  assert.ok(
    findAssetResource("/" + filename),
    `Unregistered resource ${filename}`,
  );
}
for (const filename of fs
  .readdirSync(assetsPath)
  .filter((filename) => filename.endsWith(".js"))) {
  assert.ok(
    scripts.includes(filename),
    `Unused or unregistered application script ${filename}`,
  );
}
const sources = scripts.map((filename) =>
  fs.readFileSync(path.join(assetsPath, filename), "utf8"),
);
new vm.Script(sources.join("\n"), { filename: "deviselec-application.js" });

assert.equal(findAssetResource("/unknown.js"), null);
assert.equal(findAssetResource("/equipment-images/../app.js"), null);
assert.equal(
  findAssetResource("/equipment-images/photo.webp").mime,
  "image/webp",
);
assert.equal(
  findAssetResource("/equipment-images/photo.png").mime,
  "image/png",
);
console.log(
  `PASS: ${Object.keys(routes).length} asset routes, ${scripts.length} scripts, stylesheet registration and application syntax.`,
);
