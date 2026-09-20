import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');
const STATE_FILE = path.join(__dirname, 'characters.json');

const PORT = process.env.PORT || 3000;

// Character State: Sam (Red), Cam (Green), Evil Sam (Blue)
const characters = {
  'Sam': {
    name: 'Sam',
    color: '#ff3b30',
    accentColor: '#ff6961',
    position: { x: 0, y: 0, z: 0 },
    rotationY: 0,
    lastCommand: '[initial] 0, 0, 0',
    updatedAt: Date.now()
  },
  'Cam': {
    name: 'Cam',
    color: '#34c759',
    accentColor: '#30d158',
    position: { x: -6, y: 0, z: -3 },
    rotationY: 0,
    lastCommand: '[initial] -6, 0, -3',
    updatedAt: Date.now()
  },
  'Evil Sam': {
    name: 'Evil Sam',
    color: '#0a84ff',
    accentColor: '#5ac8fa',
    position: { x: 6, y: 0, z: 3 },
    rotationY: 0,
    lastCommand: '[initial] 6, 0, 3',
    updatedAt: Date.now()
  }
};

// Persistence functions
function loadPersistentState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const data = JSON.parse(raw);
      for (const k in data) {
        if (characters[k] && data[k].position) {
          characters[k].position = data[k].position;
          characters[k].lastCommand = data[k].lastCommand || characters[k].lastCommand;
          characters[k].updatedAt = data[k].updatedAt || Date.now();
        }
      }
      console.log('Loaded persisted character positions from disk.');
    }
  } catch (err) {
    console.warn('Could not read characters.json:', err.message);
  }
}

function savePersistentState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(characters, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not save characters.json:', err.message);
  }
}

loadPersistentState();

// Connected SSE clients
const sseClients = new Set();

function broadcastEvent(type, data) {
  const namedPayload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  const defaultPayload = `data: ${JSON.stringify({ type, ...data })}\n\n`;
  
  for (const client of sseClients) {
    try {
      client.write(namedPayload);
      client.write(defaultPayload);
    } catch {
      sseClients.delete(client);
    }
  }
}

// Canonical name finder
function findCharacterKey(input) {
  if (!input || typeof input !== 'string') return null;
  const clean = input.trim().toLowerCase();
  if (clean === 'sam') return 'Sam';
  if (clean === 'cam') return 'Cam';
  if (clean === 'evil sam' || clean === 'evilsam' || clean === 'evil_sam') return 'Evil Sam';
  return null;
}

// Parse coordinate string "X, Y, Z" or "X,Y,Z" or array
function parseWhere(whereInput) {
  if (Array.isArray(whereInput) && whereInput.length >= 2) {
    const x = Number(whereInput[0]);
    const y = whereInput.length >= 3 ? Number(whereInput[1]) : 0;
    const z = whereInput.length >= 3 ? Number(whereInput[2]) : Number(whereInput[1]);
    if (isNaN(x) || isNaN(y) || isNaN(z)) return null;
    return { x, y, z };
  }

  if (typeof whereInput === 'object' && whereInput !== null) {
    const x = Number(whereInput.x);
    const y = whereInput.y !== undefined ? Number(whereInput.y) : 0;
    const z = Number(whereInput.z);
    if (!isNaN(x) && !isNaN(y) && !isNaN(z)) return { x, y, z };
  }

  if (typeof whereInput === 'string') {
    const clean = whereInput.replace(/[()[\]{}]/g, '').trim();
    const parts = clean.split(/[,\s]+/).map(p => Number(p)).filter(n => !isNaN(n));
    if (parts.length === 2) {
      return { x: parts[0], y: 0, z: parts[1] };
    }
    if (parts.length >= 3) {
      return { x: parts[0], y: parts[1], z: parts[2] };
    }
  }

  return null;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // SSE Stream
  if (req.method === 'GET' && pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    if (res.flushHeaders) res.flushHeaders();

    // Send initial snapshot
    res.write(`event: init\ndata: ${JSON.stringify({ characters })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'init', characters })}\n\n`);
    sseClients.add(res);

    // Keepalive ping every 15s to keep connections open through proxies/load balancers
    const heartbeatTimer = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(heartTimer);
        sseClients.delete(res);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeatTimer);
      sseClients.delete(res);
    });
    return;
  }

  // GET /api/characters
  if (req.method === 'GET' && pathname === '/api/characters') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    });
    res.end(JSON.stringify({ ok: true, characters }));
    return;
  }

  // PUT /Move or PUT /move
  if (req.method === 'PUT' && (pathname === '/Move' || pathname === '/move')) {
    let bodyText = '';
    req.on('data', chunk => {
      bodyText += chunk;
      if (bodyText.length > 1e6) req.destroy();
    });

    req.on('end', () => {
      try {
        const data = JSON.parse(bodyText || '{}');
        const whoKey = findCharacterKey(data.Who || data.who);

        if (!whoKey) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: false,
            error: `Character '${data.Who || data.who}' not recognized. Allowed: 'Sam', 'Cam', 'Evil Sam'`
          }));
          return;
        }

        const coords = parseWhere(data.Where !== undefined ? data.Where : data.where);
        if (!coords) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: false,
            error: `Invalid coordinates '${data.Where || data.where}'. Provide 'X, Y, Z' or 'X, Z'`
          }));
          return;
        }

        // Clamp coordinates to plane bounds [-50, 50]
        coords.x = Math.max(-50, Math.min(50, Math.round(coords.x * 100) / 100));
        coords.y = Math.max(-10, Math.min(30, Math.round(coords.y * 100) / 100));
        coords.z = Math.max(-50, Math.min(50, Math.round(coords.z * 100) / 100));

        const charObj = characters[whoKey];
        charObj.position = coords;
        charObj.lastCommand = `[move] ${coords.x}, ${coords.y}, ${coords.z}`;
        charObj.updatedAt = Date.now();

        // Save persistent copy
        savePersistentState();

        const moveEvent = {
          who: whoKey,
          where: coords,
          command: charObj.lastCommand,
          updatedAt: charObj.updatedAt
        };

        broadcastEvent('move', moveEvent);

        const whereStr = `${coords.x}, ${coords.y}, ${coords.z}`;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          Who: whoKey,
          Where: whereStr,
          character: charObj
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Malformed JSON payload: ' + err.message }));
      }
    });
    return;
  }

  // Root endpoint: Pure API, No UI
  if (req.method === 'GET' && pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'online',
      service: 'Sam3D API',
      endpoints: {
        move: 'PUT /Move',
        characters: 'GET /api/characters',
        stream: 'GET /api/stream',
        ui: 'GET /public.html'
      }
    }, null, 2));
    return;
  }

  // UI endpoint: ONLY on /public.html or /public
  let reqPath = pathname;
  if (reqPath === '/public') reqPath = '/public.html';
  const safePath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(PUBLIC_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Endpoint not found' }));
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Failed to read asset' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Sam3D server is running on port ${PORT}`);
});
