// 로컬 개발 서버: public/ 을 제공하고, netlify/functions/*.mjs 를 각 함수의 config.path(/api/...)에 그대로 연결한다.
// 실제 인천공항·카카오 API를 부르려면 .env 의 키가 필요하다:  npm run dev   (= node --env-file=.env scripts/dev-server.mjs)
// - 키는 환경변수로만 읽고 출력하지 않는다. 이 컴퓨터(127.0.0.1)에서만 접속된다.
// - Netlify 배포 환경과 같은 함수 코드를 쓰지만 Netlify 의 CDN 캐시·함수 번들링은 재현하지 않는다. (배포 후 동작은 확인 못 함)
import http from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const functionsDir = path.join(root, 'netlify', 'functions');
const port = Number(process.env.PORT ?? 5173);

const routes = new Map();
for (const name of (await readdir(functionsDir)).filter((file) => file.endsWith('.mjs'))) {
  const module = await import(pathToFileURL(path.join(functionsDir, name)).href);
  if (typeof module.default === 'function' && module.config?.path) routes.set(module.config.path, module.default);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);

  const handler = routes.get(url.pathname);
  if (handler) {
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const request = new Request(url, { method: req.method, headers: req.headers, body: hasBody ? await readBody(req) : undefined });
    try {
      const response = await handler(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      console.error(`[dev-server] ${url.pathname} 처리 중 오류: ${error?.name ?? 'Error'}`); // 오류 객체 전체는 키가 든 주소를 담을 수 있어 이름만 남긴다.
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, reason: 'error' }));
    }
    return;
  }

  const file = path.normalize(path.join(publicDir, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname)));
  if (!file.startsWith(publicDir)) {
    res.writeHead(403).end();
    return;
  }
  try {
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end('not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  const missing = ['ICN_AIRPORT_API_KEY', 'KAKAO_REST_API_KEY'].filter((key) => !process.env[key]);
  console.log(`마중 개발 서버: http://127.0.0.1:${port}/   (함수 ${[...routes.keys()].join(', ')})`);
  if (missing.length > 0) console.log(`⚠ 설정되지 않은 환경변수: ${missing.join(', ')} (.env 를 확인하세요. 값은 출력하지 않습니다)`);
});
