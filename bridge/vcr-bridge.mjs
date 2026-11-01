// MarketHisob ↔ REGOS: VCR bridge.
//
// The web till (https://app.markethisob.uz) talks to the virtual cash register on this
// computer. Browsers only allow that when the local service answers with CORS headers;
// this tiny proxy adds them and forwards every request to VCR unchanged.
//
// Run:   node vcr-bridge.mjs http://127.0.0.1:<VCR API port>
// (or start-bridge.bat). Then in MarketHisob → Settings → Fiscal register use
// http://127.0.0.1:18347 as the VCR address.
//
// It listens on 127.0.0.1 only (not reachable from the network) and accepts calls only
// from MarketHisob's own addresses.
import http from 'node:http';

const TARGET = process.argv[2] || process.env.VCR_URL;
const PORT = Number(process.env.BRIDGE_PORT || 18347);
const ALLOWED_ORIGINS = new Set([
  'https://app.markethisob.uz',
  'https://smartstock-d737f.web.app',
  'https://smartstock-d737f.firebaseapp.com',
  'http://localhost:4200'
]);

if (!TARGET) {
  console.error('VCR manzili kerak: node vcr-bridge.mjs http://127.0.0.1:<port>');
  process.exit(1);
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // Chrome's Private Network Access: a public site calling 127.0.0.1.
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.setHeader('Access-Control-Max-Age', '600');
    return true;
  }
  return !origin; // tools without an Origin (curl) are fine; other websites are not
}

http
  .createServer((req, res) => {
    if (!cors(req, res)) {
      res.writeHead(403).end('origin not allowed');
      return;
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('MarketHisob VCR bridge → ' + TARGET);
      return;
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      try {
        const upstream = await fetch(TARGET, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json;charset=utf-8' },
          body: Buffer.concat(chunks)
        });
        const body = Buffer.from(await upstream.arrayBuffer());
        res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json' }).end(body);
      } catch (err) {
        res.writeHead(502, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: false, result: { message: 'VCR bilan aloqa yo\'q: ' + err.message } }));
      }
    });
  })
  .listen(PORT, '127.0.0.1', () => console.log(`MarketHisob VCR ko'prigi: http://127.0.0.1:${PORT} → ${TARGET}`));
