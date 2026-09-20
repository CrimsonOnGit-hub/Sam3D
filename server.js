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
  },
  'Player': {
    name: 'Player',
    color: '#f59e0b',
    accentColor: '#fbbf24',
    position: { x: 0, y: 0, z: 6 },
    rotationY: 0,
    lastCommand: '[wasd] 0, 0, 6',
    updatedAt: Date.now()
  }
};

// Spawned 3D World Objects
const worldObjects = {
  'obj-init-1': {
    id: 'obj-init-1',
    type: 'cube',
    color: '#f59e0b',
    position: { x: 2, y: 0.5, z: 2 },
    heldBy: null,
    createdAt: Date.now()
  },
  'obj-init-2': {
    id: 'obj-init-2',
    type: 'orb',
    color: '#8b5cf6',
    position: { x: -3, y: 0.5, z: 4 },
    heldBy: null,
    createdAt: Date.now()
  }
};

// Hand States for characters
const characterHands = {
  'Sam': { action: 'idle', heldObjectId: null, updatedAt: Date.now() },
  'Cam': { action: 'idle', heldObjectId: null, updatedAt: Date.now() },
  'Evil Sam': { action: 'idle', heldObjectId: null, updatedAt: Date.now() },
  'Player': { action: 'idle', heldObjectId: null, updatedAt: Date.now() }
};

// Chat message log (most recent 40)
const chatMessages = [];

// Persistence functions
function loadPersistentState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (data.characters) {
        for (const k in data.characters) {
          if (characters[k] && data.characters[k].position) {
            characters[k].position = data.characters[k].position;
            characters[k].lastCommand = data.characters[k].lastCommand || characters[k].lastCommand;
            characters[k].updatedAt = data.characters[k].updatedAt || Date.now();
          }
        }
      }
      if (data.worldObjects && typeof data.worldObjects === 'object') {
        Object.assign(worldObjects, data.worldObjects);
      }
      if (data.characterHands && typeof data.characterHands === 'object') {
        Object.assign(characterHands, data.characterHands);
      }
      console.log('Loaded persisted state from disk.');
    }
  } catch (err) {
    console.warn('Could not read characters.json:', err.message);
  }
}

function savePersistentState() {
  try {
    const payload = {
      characters,
      worldObjects,
      characterHands
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(payload, null, 2), 'utf-8');
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
  if (clean === 'player' || clean === 'gold sam' || clean === 'goldsam' || clean === 'yellow sam') return 'Player';
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

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
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

const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
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

    // Send complete initial snapshot
    const initPayload = {
      characters,
      worldObjects,
      characterHands,
      chatMessages: chatMessages.slice(-20)
    };
    res.write(`event: init\ndata: ${JSON.stringify(initPayload)}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'init', ...initPayload })}\n\n`);
    sseClients.add(res);

    const heartbeatTimer = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(heartbeatTimer);
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

  // GET /api/state
  if (req.method === 'GET' && pathname === '/api/state') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    });
    res.end(JSON.stringify({
      ok: true,
      characters,
      worldObjects,
      characterHands,
      chatMessages: chatMessages.slice(-30)
    }));
    return;
  }

  // PUT /Move or PUT /move
  if (req.method === 'PUT' && (pathname === '/Move' || pathname === '/move')) {
    try {
      const data = await readRequestBody(req);
      const whoKey = findCharacterKey(data.Who || data.who);

      if (!whoKey) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: false,
          error: `Character '${data.Who || data.who}' not recognized. Allowed: 'Sam', 'Cam', 'Evil Sam'`
        }));
        return;
      }

      if (whoKey === 'Player' && req.headers['x-source'] !== 'public-html') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: false,
          error: "Character 'Player' can only be moved directly from public.html using WASD in first person."
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

      // If holding an object, update that object's position as well
      const heldId = characterHands[whoKey]?.heldObjectId;
      if (heldId && worldObjects[heldId]) {
        worldObjects[heldId].position = { x: coords.x, y: coords.y + 1.2, z: coords.z };
      }

      savePersistentState();

      const whereStr = `${coords.x}, ${coords.y}, ${coords.z}`;
      const moveEvent = {
        who: whoKey,
        where: coords,
        command: charObj.lastCommand,
        updatedAt: charObj.updatedAt
      };

      broadcastEvent('move', moveEvent);

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
    return;
  }

  // POST /api/player/move (Direct WASD control from public.html)
  if (req.method === 'POST' && (pathname === '/api/player/move' || pathname === '/PlayerMove')) {
    try {
      const data = await readRequestBody(req);
      const coords = parseWhere(data.Where || data.where || data.position);
      if (coords) {
        coords.x = Math.max(-48, Math.min(48, Math.round(coords.x * 100) / 100));
        coords.y = Math.max(0, Math.min(25, Math.round(coords.y * 100) / 100));
        coords.z = Math.max(-48, Math.min(48, Math.round(coords.z * 100) / 100));

        const charObj = characters['Player'];
        charObj.position = coords;
        if (data.rotationY !== undefined) charObj.rotationY = Number(data.rotationY);
        charObj.lastCommand = `[wasd] ${coords.x}, ${coords.y}, ${coords.z}`;
        charObj.updatedAt = Date.now();

        const heldId = characterHands['Player']?.heldObjectId;
        if (heldId && worldObjects[heldId]) {
          worldObjects[heldId].position = { x: coords.x, y: coords.y + 1.2, z: coords.z };
        }

        broadcastEvent('move', {
          who: 'Player',
          where: coords,
          rotationY: charObj.rotationY,
          command: charObj.lastCommand,
          updatedAt: charObj.updatedAt
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, Who: 'Player', Where: `${coords.x}, ${coords.y}, ${coords.z}` }));
        return;
      }
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Invalid WASD payload' }));
      return;
    }
  }

  // POST /Chat or POST /api/chat
  if (req.method === 'POST' && (pathname === '/Chat' || pathname === '/chat' || pathname === '/api/chat')) {
    try {
      const data = await readRequestBody(req);
      const whoKey = findCharacterKey(data.Who || data.who) || 'Sam';
      const message = String(data.Message || data.message || '').trim();

      if (!message) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Message cannot be empty' }));
        return;
      }

      const msgObj = {
        id: 'msg-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        who: whoKey,
        message,
        timestamp: Date.now()
      };

      chatMessages.push(msgObj);
      if (chatMessages.length > 50) chatMessages.shift();

      broadcastEvent('chat', msgObj);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        Who: whoKey,
        Message: message,
        timestamp: msgObj.timestamp
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Malformed JSON payload' }));
    }
    return;
  }

  // POST /Spawn or POST /api/spawn
  if (req.method === 'POST' && (pathname === '/Spawn' || pathname === '/spawn' || pathname === '/api/spawn')) {
    try {
      const data = await readRequestBody(req);
      const whoKey = findCharacterKey(data.Who || data.who) || 'Sam';
      const type = ['cube', 'orb', 'diamond'].includes(String(data.Type || data.type).toLowerCase())
        ? String(data.Type || data.type).toLowerCase()
        : 'cube';

      const colorMap = {
        'cube': '#f59e0b',
        'orb': '#a855f7',
        'diamond': '#06b6d4'
      };
      const color = data.Color || data.color || colorMap[type] || '#f59e0b';

      let pos = parseWhere(data.Where || data.where);
      if (!pos) {
        // Spawn 1.8 units in front of the character
        const char = characters[whoKey];
        pos = {
          x: Math.round((char.position.x + (Math.random() * 2 - 1)) * 10) / 10,
          y: 0.5,
          z: Math.round((char.position.z + 1.8) * 10) / 10
        };
      }

      const objId = 'obj-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
      const newObj = {
        id: objId,
        type,
        color,
        position: pos,
        heldBy: null,
        createdAt: Date.now()
      };

      worldObjects[objId] = newObj;
      savePersistentState();

      broadcastEvent('spawn', newObj);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        object: newObj
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Malformed JSON payload' }));
    }
    return;
  }

  // POST /Hand or PUT /Hand or POST /api/hand
  if ((req.method === 'POST' || req.method === 'PUT') && (pathname === '/Hand' || pathname === '/hand' || pathname === '/api/hand')) {
    try {
      const data = await readRequestBody(req);
      const whoKey = findCharacterKey(data.Who || data.who);

      if (!whoKey) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Character not recognized' }));
        return;
      }

      const action = String(data.Action || data.action || 'idle').toLowerCase();
      const objectId = data.ObjectId || data.objectId || null;

      const handState = characterHands[whoKey];
      handState.action = action;
      handState.updatedAt = Date.now();

      if (action === 'hold' && objectId && worldObjects[objectId]) {
        // Release any object previously held by this character
        if (handState.heldObjectId && worldObjects[handState.heldObjectId]) {
          worldObjects[handState.heldObjectId].heldBy = null;
        }
        worldObjects[objectId].heldBy = whoKey;
        handState.heldObjectId = objectId;
      } else if (action === 'drop') {
        if (handState.heldObjectId && worldObjects[handState.heldObjectId]) {
          const char = characters[whoKey];
          worldObjects[handState.heldObjectId].heldBy = null;
          worldObjects[handState.heldObjectId].position = {
            x: Math.round(char.position.x * 10) / 10,
            y: 0.5,
            z: Math.round((char.position.z + 1.2) * 10) / 10
          };
        }
        handState.heldObjectId = null;
        handState.action = 'idle';
      }

      savePersistentState();

      const payload = {
        who: whoKey,
        action: handState.action,
        heldObjectId: handState.heldObjectId,
        updatedAt: handState.updatedAt,
        worldObjects
      };

      broadcastEvent('hand', payload);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        Who: whoKey,
        Action: handState.action,
        HeldObjectId: handState.heldObjectId
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Malformed JSON payload' }));
    }
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
        chat: 'POST /Chat',
        spawn: 'POST /Spawn',
        hand: 'POST /Hand',
        characters: 'GET /api/characters',
        state: 'GET /api/state',
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
