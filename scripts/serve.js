import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.md': 'text/plain',
  '.wasm': 'application/wasm',
};
export function createStaticServer(directory = root, basePath = '/') {
  const base = resolve(directory);
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(basePath)) throw new Error('Invalid base path');
  return createServer(async (req, res) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(405);
        res.end();
        return;
      }
      const requestURL = new URL(req.url, 'http://localhost');
      if (basePath !== '/' && requestURL.pathname === basePath.slice(0, -1)) {
        res.writeHead(302, { Location: basePath + requestURL.search });
        res.end();
        return;
      }
      if (!requestURL.pathname.startsWith(basePath)) throw Error('Outside base path');
      const pathname = decodeURIComponent('/' + requestURL.pathname.slice(basePath.length));
      const segments = pathname.split(/[\\/]/);
      if (
        segments.some(
          (part) =>
            part.startsWith('.') ||
            part.endsWith('.log') ||
            ['node_modules', 'test', 'scripts'].includes(part),
        )
      )
        throw Error('Private path');
      let file = resolve(base, `.${pathname}`);
      if (file !== base && !file.startsWith(base + sep)) throw Error('Invalid path');
      if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': `${mime[extname(file)] || 'application/octet-stream'}; charset=utf-8`,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  const basePath = process.env.BASE_PATH || '/';
  createStaticServer(root, basePath).listen(port, '127.0.0.1', () =>
    console.log(`ChatStage: http://localhost:${port}${basePath}`),
  );
}
