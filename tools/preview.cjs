const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const address = '127.0.0.1';
const port = 8765;
const assets = path.join(__dirname, '..', 'app', 'src', 'main', 'assets');
const routes = new Map([
    ['/', ['index.html', 'text/html']],
    ['/app.js', ['app.js', 'application/javascript']],
    ['/catalog.js', ['catalog.js', 'application/javascript']],
    ['/form-helpers.js', ['form-helpers.js', 'application/javascript']],
    ['/catalog-123elec.json', ['catalog-123elec.json', 'application/json']],
]);

const server = http.createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(405, { Allow: 'GET, HEAD' }).end();
        return;
    }
    const pathname = new URL(request.url, `http://${address}:${port}`).pathname;
    if (pathname === '/preview-health') {
        response.setHeader('Content-Type', 'application/json');
        response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ app: 'deviselec-preview' }));
        return;
    }
    if (pathname === '/favicon.ico') { response.writeHead(204).end(); return; }
    const resource = routes.get(pathname);
    if (!resource) { response.writeHead(404).end(); return; }
    fs.readFile(path.join(assets, resource[0]), (error, bytes) => {
        if (error) { response.writeHead(500).end('Ressource indisponible'); return; }
        response.setHeader('Content-Type', `${resource[1]}; charset=utf-8`);
        response.end(request.method === 'HEAD' ? undefined : bytes);
    });
});

server.on('error', error => {
    console.error(`Impossible de lancer l’aperçu Deviselec. ${error.message}`);
    process.exitCode = 1;
});
server.listen(port, address, () => {
    console.log(`Deviselec est accessible sur http://${address}:${port}`);
});
