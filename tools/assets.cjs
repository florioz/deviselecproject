const path = require("node:path");

const assetsPath = path.join(__dirname, "../app/src/main/assets");
const routes = require(path.join(assetsPath, "asset-routes.json"));

function findAssetResource(pathname) {
  if (Object.hasOwn(routes, pathname)) {
    const [filename, mime] = routes[pathname];
    return { filename, mime };
  }
  if (/^\/equipment-images\/[a-z0-9-]+\.(jpg|jpeg|png|webp)$/.test(pathname)) {
    const extension = path.extname(pathname);
    return {
      filename: pathname.slice(1),
      mime:
        extension === ".png"
          ? "image/png"
          : extension === ".webp"
            ? "image/webp"
            : "image/jpeg",
    };
  }
  return null;
}

module.exports = { assetsPath, routes, findAssetResource };
