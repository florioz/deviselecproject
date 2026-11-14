const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { assetsPath, findAssetResource } = require("../tools/assets.cjs");

function createTestServer(respond) {
  return http.createServer((request, response) => {
    if (respond?.(request, response)) return;
    const pathname = new URL(request.url, "http://localhost").pathname;
    const resource = findAssetResource(pathname);
    if (!resource) {
      response.writeHead(404).end();
      return;
    }
    fs.readFile(path.join(assetsPath, resource.filename), (error, bytes) => {
      if (error) {
        response.writeHead(404).end();
        return;
      }
      response.setHeader("Content-Type", resource.mime);
      response.end(bytes);
    });
  });
}

module.exports = { createTestServer };
