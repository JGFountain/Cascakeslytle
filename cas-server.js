const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = __dirname;
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

const port = Number(process.env.PORT || 3000);
const deliveryRadiusMiles = 30;
const deliveryRatePerMile = Number(process.env.DELIVERY_RATE_PER_MILE || 2);
const squareToken = process.env.SQUARE_ACCESS_TOKEN || '';
const squareLocationId = process.env.SQUARE_LOCATION_ID || '';
const squareAdminKey = process.env.SQUARE_ADMIN_KEY || '';
const squareHost = process.env.SQUARE_ENVIRONMENT === 'production'
  ? 'https://connect.squareup.com'
  : 'https://connect.squareupsandbox.com';

const config = {
  email: 'cascakes16@outlook.com',
  deliveryRadiusMiles,
  deliveryRatePerMile: Number.isFinite(deliveryRatePerMile) && deliveryRatePerMile > 0 ? deliveryRatePerMile : null,
  sizes: [
    { name: '6-inch round · 3 layers', priceCents: 3500 },
    { name: '8-inch round · 3 layers', priceCents: 4500 },
    { name: '10-inch round · 3 layers', priceCents: 5500 },
    { name: 'Quarter sheet · 9 × 13', priceCents: 5000 },
    { name: 'Half sheet · 12 × 18', priceCents: 7500 },
    { name: 'Tiered, custom carved, or other size', priceCents: null }
  ],
  occasions: ['Birthday', 'Wedding', 'Bridal shower', 'Engagement', 'Anniversary', 'Baby shower', 'Gender reveal', 'Retirement', 'Military', 'Quinceañera', 'Sweet sixteen', 'Other'],
  flavors: ['Butter / yellow', 'White / vanilla', 'Biscoff cookie', 'Chocolate', 'Strawberry', 'Marble', 'Funfetti', 'Tres leches'],
  fillings: ['Strawberry', 'Raspberry', 'Lemon', 'Oreo', 'Vanilla', 'Chocolate ganache', 'Nutella', 'Peanut butter'],
  frostings: ['Swiss meringue buttercream · less sweet', 'American dreamy vanilla buttercream · less sweet', 'Biscoff cookie butter buttercream', 'Cream cheese', 'Chocolate buttercream', 'Almond buttercream', 'Whip cream', 'Fondant']
};

const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

function sendJson(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', chunk => {
      body += chunk;
      if (body.length > 20000) reject(new Error('Request is too large.'));
    });
    request.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(new Error('Invalid request body.')); }
    });
    request.on('error', reject);
  });
}

async function createPaymentLink(request, response) {
  if (!squareAdminKey || !squareToken || !squareLocationId) {
    return sendJson(response, 503, { error: 'Square payment links are not configured.' });
  }
  const providedKey = (request.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const expected = Buffer.from(squareAdminKey);
  const provided = Buffer.from(providedKey);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return sendJson(response, 401, { error: 'Unauthorized.' });
  }

  const { amountCents, deliveryMiles = 0, orderLabel = 'Custom cake order' } = await readJson(request);
  if (!Number.isInteger(amountCents) || amountCents < 100 || amountCents > 10000000) {
    return sendJson(response, 400, { error: 'Provide the confirmed cake total in cents.' });
  }
  if (!Number.isFinite(deliveryMiles) || deliveryMiles < 0 || deliveryMiles > deliveryRadiusMiles) {
    return sendJson(response, 400, { error: `Delivery must be within ${deliveryRadiusMiles} miles.` });
  }
  if (deliveryMiles > 0 && !config.deliveryRatePerMile) {
    return sendJson(response, 503, { error: 'Set the per-mile delivery rate before creating a delivery payment link.' });
  }

  const lineItems = [{
    name: String(orderLabel).slice(0, 100), quantity: '1',
    base_price_money: { amount: amountCents, currency: 'USD' }
  }];
  if (deliveryMiles > 0) {
    const miles = Math.ceil(deliveryMiles * 100) / 100;
    lineItems.push({
      name: `Estimated delivery · ${miles} miles`, quantity: '1',
      base_price_money: { amount: Math.round(miles * config.deliveryRatePerMile * 100), currency: 'USD' }
    });
  }

  const squareResponse = await fetch(`${squareHost}/v2/online-checkout/payment-links`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${squareToken}`, 'Square-Version': '2025-10-16', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idempotency_key: crypto.randomUUID(),
      order: { location_id: squareLocationId, line_items: lineItems },
      payment_note: 'Custom cake quote confirmed by Cas\' Cakes.'
    })
  });
  const result = await squareResponse.json();
  if (!squareResponse.ok) {
    console.error('Square payment-link error:', JSON.stringify(result.errors || result));
    return sendJson(response, 502, { error: 'Square could not create the payment link.' });
  }
  return sendJson(response, 200, { checkoutUrl: result.payment_link?.url });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/api/config') return sendJson(response, 200, config);
  if (request.method === 'POST' && url.pathname === '/api/payment-link') {
    try { return await createPaymentLink(request, response); }
    catch (error) {
      console.error('Square link request failed:', error.message);
      return sendJson(response, 500, { error: 'Could not create the payment link.' });
    }
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { 'Allow': 'GET, HEAD' });
    return response.end();
  }

  const requestedPath = decodeURIComponent(url.pathname === '/' ? '/cas.html' : url.pathname);
  const filePath = path.resolve(root, `.${requestedPath}`);
  if (!filePath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403);
    return response.end();
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return response.end('Not found');
    }
    response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' });
    response.end(request.method === 'HEAD' ? undefined : content);
  });
});

server.listen(port, () => console.log(`Cas' Cakes is running at http://localhost:${port}`));