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
    lastMessage: null,
    updatedAt: Date.now()
  },
  'Cam': {
    name: 'Cam',
    color: '#34c759',
    accentColor: '#30d158',
    position: { x: -6, y: 0, z: -3 },
    rotationY: 0,
    lastCommand: '[initial] -6, 0, -3',
    lastMessage: null,
    updatedAt: Date.now()
  },
  'Evil Sam': {
    name: 'Evil Sam',
    color: '#0a84ff',
    accentColor: '#5ac8fa',
    position: { x: 6, y: 0, z: 3 },
    rotationY: 0,
    lastCommand: '[initial] 6, 0, 3',
    lastMessage: null,
    updatedAt: Date.now()
  },
  'Player': {
    name: 'Player',
    color: '#f59e0b',
    accentColor: '#fbbf24',
    position: { x: 0, y: 0, z: 6 },
    rotationY: 0,
    lastCommand: '[wasd] 0, 0, 6',
    lastMessage: null,
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

// Chat message log (most recent 100)
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
            characters[k].lastMessage = data.characters[k].lastMessage || characters[k].lastMessage;
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
      if (Array.isArray(data.chatMessages)) {
        chatMessages.length = 0;
        chatMessages.push(...data.chatMessages);
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
      characterHands,
      chatMessages: chatMessages.slice(-100)
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
  if (clean === 'player' || clean === 'gold sam' || clean === 'goldsam' || clean === 'yellow sam' || clean === 'gold' || clean === 'user' || clean === 'me' || clean === 'player1') return 'Player';
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

// 3D Contoured Terrain Elevation Function
function getTerrainHeight(x, z) {
  return Math.sin(x * 0.12) * Math.cos(z * 0.12) * 0.75 + Math.cos(x * 0.06 + z * 0.06) * 0.35;
}

// Real-time Physics Engine for Thrown Objects and Character Collisions
function updatePhysics() {
  const dt = 0.05; // 50ms tick (20 FPS)
  let hasActivePhysics = false;

  for (const id in worldObjects) {
    const obj = worldObjects[id];
    if (!obj.velocity || obj.heldBy) continue;

    hasActivePhysics = true;
    let { x: vx, y: vy, z: vz } = obj.velocity;

    // Apply gravity
    vy -= 9.8 * dt;

    // Update position
    let px = obj.position.x + vx * dt;
    let py = obj.position.y + vy * dt;
    let pz = obj.position.z + vz * dt;

    // World boundary clamping
    px = Math.max(-24, Math.min(24, px));
    pz = Math.max(-24, Math.min(24, pz));

    const groundY = getTerrainHeight(px, pz) + 0.35;

    // Ground bounce & friction
    if (py <= groundY) {
      py = groundY;
      vy = -vy * 0.52; // restitution
      vx *= 0.82; // ground friction
      vz *= 0.82;

      // Rest condition
      if (Math.abs(vy) < 0.3 && Math.hypot(vx, vz) < 0.25) {
        delete obj.velocity;
        delete obj.thrownBy;
        obj.position = { x: Math.round(px * 100) / 100, y: Math.round(py * 100) / 100, z: Math.round(pz * 100) / 100 };
        broadcastEvent('object_rest', { id: obj.id, position: obj.position });
        continue;
      }
    }

    // Check collision against all characters (objects bounce off people)
    for (const charName in characters) {
      const char = characters[charName];
      const cx = char.position.x;
      const cy = char.position.y + 1.1; // approximate torso height
      const cz = char.position.z;

      const dist = Math.hypot(px - cx, py - cy, pz - cz);
      const hitRadius = 1.15;

      const isThrower = obj.thrownBy === charName;
      const timeSinceThrow = Date.now() - (obj.thrownAt || 0);

      // Bounce off character if within radius (and not immediate thrower cooldown)
      if (dist < hitRadius && (!isThrower || timeSinceThrow > 350)) {
        const nx = (px - cx) / (dist || 1);
        const ny = (py - cy) / (dist || 1);
        const nz = (pz - cz) / (dist || 1);

        // Reflect velocity with bounce impulse
        const vDotN = vx * nx + vy * ny + vz * nz;
        vx = (vx - 1.8 * vDotN * nx) * 0.75;
        vy = Math.max(1.8, (vy - 1.8 * vDotN * ny) * 0.75 + 1.2);
        vz = (vz - 1.8 * vDotN * nz) * 0.75;

        // Push outside character body
        px = cx + nx * (hitRadius + 0.1);
        py = cy + ny * (hitRadius + 0.1);
        pz = cz + nz * (hitRadius + 0.1);

        const impactSpeed = Math.round(Math.hypot(vx, vy, vz) * 10) / 10;
        const hitInfo = {
          id: 'hit-' + Date.now(),
          target: charName,
          thrownBy: obj.thrownBy || 'Unknown',
          objectId: obj.id,
          objectType: obj.type,
          speed: impactSpeed,
          message: `${charName} was hit by a ${obj.type} thrown by ${obj.thrownBy || 'someone'}!`,
          timestamp: Date.now()
        };

        char.lastHit = hitInfo;
        char.hitCount = (char.hitCount || 0) + 1;
        char.updatedAt = Date.now();

        // Change thrownBy to this character so it doesn't immediately re-hit same frame
        obj.thrownBy = charName;
        obj.thrownAt = Date.now();

        savePersistentState();
        broadcastEvent('hit', hitInfo);
        break;
      }
    }

    obj.position = {
      x: Math.round(px * 100) / 100,
      y: Math.round(py * 100) / 100,
      z: Math.round(pz * 100) / 100
    };
    obj.velocity = { x: vx, y: vy, z: vz };
  }

  if (hasActivePhysics) {
    broadcastEvent('physics', { worldObjects });
  }
}

setInterval(updatePhysics, 50);

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
      chatMessages: chatMessages.slice(-50),
      messages: chatMessages.slice(-50)
    }));
    return;
  }

  // GET /Chat or GET /chat or GET /api/chat or GET /messages or GET /api/messages
  if (req.method === 'GET' && (
    pathname === '/Chat' || pathname === '/chat' || pathname === '/api/chat' ||
    pathname === '/messages' || pathname === '/api/messages'
  )) {
    const whoFilter = url.searchParams.get('who') || url.searchParams.get('Who');
    let msgs = chatMessages;
    if (whoFilter) {
      const canonicalWho = findCharacterKey(whoFilter);
      if (canonicalWho) {
        msgs = chatMessages.filter(m => m.who.toLowerCase() === canonicalWho.toLowerCase());
      }
    }
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    });
    res.end(JSON.stringify({
      ok: true,
      count: msgs.length,
      messages: msgs,
      playerMessages: chatMessages.filter(m => m.who === 'Player')
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
        lastHit: charObj.lastHit,
        hitNotification: charObj.lastHit ? charObj.lastHit.message : null,
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
        res.end(JSON.stringify({
          ok: true,
          Who: 'Player',
          Where: `${coords.x}, ${coords.y}, ${coords.z}`,
          lastHit: charObj.lastHit,
          hitNotification: charObj.lastHit ? charObj.lastHit.message : null
        }));
        return;
      }
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Invalid WASD payload' }));
      return;
    }
  }

  // PUT or POST /move/feet (Foot-by-Foot Movement Endpoint)
  if ((req.method === 'PUT' || req.method === 'POST') && (pathname.toLowerCase() === '/move/feet' || pathname.toLowerCase() === '/move/foot')) {
    try {
      const data = await readRequestBody(req);
      const whoKey = findCharacterKey(data.Who || data.who || data.sender) || 'Sam';
      const charObj = characters[whoKey];

      if (whoKey === 'Player' && req.headers['x-source'] !== 'public-html') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: false,
          error: "Character 'Player' can only be moved directly from public.html using WASD in first person."
        }));
        return;
      }

      // Initialize feet state if needed
      if (!charObj.feet) {
        charObj.feet = {
          left: { x: Math.round((charObj.position.x - 0.35) * 100) / 100, y: charObj.position.y, z: charObj.position.z },
          right: { x: Math.round((charObj.position.x + 0.35) * 100) / 100, y: charObj.position.y, z: charObj.position.z },
          lastStep: 'none',
          stepCount: 0
        };
      }

      const footInput = String(data.Foot || data.foot || (charObj.feet.lastStep === 'left' ? 'right' : 'left')).toLowerCase();
      const stepFoot = (footInput.includes('r') || footInput === '2') ? 'right' : 'left';
      const stepDist = Math.max(0.2, Math.min(3.0, Number(data.Step || data.step || 1.0)));

      // Step direction angle
      let angle = charObj.rotationY || 0;
      if (data.Angle !== undefined || data.angle !== undefined) {
        angle = Number(data.Angle !== undefined ? data.Angle : data.angle);
        charObj.rotationY = angle;
      }
      if (data.Direction || data.direction) {
        const dStr = String(data.Direction || data.direction).toLowerCase();
        if (dStr === 'backward' || dStr === 'back') angle += Math.PI;
        else if (dStr === 'left') angle += Math.PI / 2;
        else if (dStr === 'right') angle -= Math.PI / 2;
      }

      const forwardX = Math.sin(angle);
      const forwardZ = Math.cos(angle);
      const perpX = Math.cos(angle);
      const perpZ = -Math.sin(angle);
      const lateralOffset = stepFoot === 'left' ? -0.35 : 0.35;

      const otherFootKey = stepFoot === 'left' ? 'right' : 'left';
      const anchorFoot = charObj.feet[otherFootKey];

      // New position of stepping foot
      const newFootX = anchorFoot.x + forwardX * stepDist + perpX * lateralOffset;
      const newFootZ = anchorFoot.z + forwardZ * stepDist + perpZ * lateralOffset;
      const newFootY = getTerrainHeight(newFootX, newFootZ);

      charObj.feet[stepFoot] = {
        x: Math.round(newFootX * 100) / 100,
        y: Math.round(newFootY * 100) / 100,
        z: Math.round(newFootZ * 100) / 100
      };
      charObj.feet.lastStep = stepFoot;
      charObj.feet.stepCount = (charObj.feet.stepCount || 0) + 1;

      // Body centers between both feet
      const newBodyX = Math.round(((charObj.feet.left.x + charObj.feet.right.x) / 2) * 100) / 100;
      const newBodyZ = Math.round(((charObj.feet.left.z + charObj.feet.right.z) / 2) * 100) / 100;
      const newBodyY = Math.round(getTerrainHeight(newBodyX, newBodyZ) * 100) / 100;

      charObj.position = { x: newBodyX, y: newBodyY, z: newBodyZ };
      charObj.lastCommand = `[feet] ${stepFoot} foot step +${stepDist}m -> [${newBodyX}, ${newBodyY}, ${newBodyZ}]`;
      charObj.updatedAt = Date.now();

      // If holding an object, update object position
      const heldId = characterHands[whoKey]?.heldObjectId;
      if (heldId && worldObjects[heldId]) {
        worldObjects[heldId].position = { x: newBodyX, y: newBodyY + 1.25, z: newBodyZ };
      }

      savePersistentState();

      broadcastEvent('move', {
        who: whoKey,
        where: charObj.position,
        rotationY: charObj.rotationY,
        command: charObj.lastCommand,
        feet: charObj.feet,
        stepFoot,
        updatedAt: charObj.updatedAt
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        endpoint: '/move/feet',
        Who: whoKey,
        Foot: stepFoot,
        Step: stepDist,
        BodyPosition: charObj.position,
        Feet: charObj.feet,
        lastHit: charObj.lastHit,
        hitNotification: charObj.lastHit ? charObj.lastHit.message : null,
        message: `${whoKey} stepped forward ${stepDist}m with ${stepFoot} foot. Body position is now [${newBodyX}, ${newBodyY}, ${newBodyZ}].`
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Malformed feet payload: ' + err.message }));
    }
    return;
  }

  // POST /Chat or POST /api/chat
  if (req.method === 'POST' && (pathname === '/Chat' || pathname === '/chat' || pathname === '/api/chat')) {
    try {
      const data = await readRequestBody(req);
      const whoKey = findCharacterKey(data.Who || data.who || data.sender || data.user || data.author || data.name || data.char) || 'Player';
      const message = String(data.Message || data.message || data.text || data.content || '').trim();

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
      if (chatMessages.length > 100) chatMessages.shift();

      if (characters[whoKey]) {
        characters[whoKey].lastMessage = {
          message,
          timestamp: msgObj.timestamp
        };
        characters[whoKey].updatedAt = Date.now();
      }

      savePersistentState();
      broadcastEvent('chat', msgObj);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        Who: whoKey,
        Message: message,
        timestamp: msgObj.timestamp,
        id: msgObj.id
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
        HeldObjectId: handState.heldObjectId,
        lastHit: characters[whoKey]?.lastHit,
        hitNotification: characters[whoKey]?.lastHit ? characters[whoKey].lastHit.message : null
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Malformed JSON payload' }));
    }
    return;
  }

  // POST /Throw or POST /api/throw
  if (req.method === 'POST' && (pathname === '/Throw' || pathname === '/throw' || pathname === '/api/throw')) {
    try {
      const data = await readRequestBody(req);
      const whoKey = findCharacterKey(data.Who || data.who || data.sender) || 'Player';
      const charObj = characters[whoKey];
      const handState = characterHands[whoKey];

      let heldId = handState?.heldObjectId || data.ObjectId || data.objectId;
      if (!heldId) {
        // If not holding, find nearest object within 3.5m to throw
        for (const id in worldObjects) {
          const obj = worldObjects[id];
          if (!obj.heldBy) {
            const d = Math.hypot(obj.position.x - charObj.position.x, obj.position.z - charObj.position.z);
            if (d < 3.5) {
              heldId = id;
              break;
            }
          }
        }
      }

      if (!heldId || !worldObjects[heldId]) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: false,
          error: `${whoKey} is not holding an object and none are within reach. Pick up or spawn an object first!`,
          lastHit: charObj.lastHit,
          hitNotification: charObj.lastHit?.message || null
        }));
        return;
      }

      const force = Number(data.Force || data.force || 16);
      let dir = data.Direction || data.direction;
      if (!dir || typeof dir !== 'object') {
        const rad = Number(data.RotationY || data.rotationY || charObj.rotationY || 0);
        dir = {
          x: Math.sin(rad),
          y: 0.35,
          z: Math.cos(rad)
        };
      }
      const dirLen = Math.hypot(dir.x, dir.y || 0, dir.z) || 1;
      const nx = dir.x / dirLen;
      const ny = (dir.y || 0.35) / dirLen;
      const nz = dir.z / dirLen;

      const obj = worldObjects[heldId];
      obj.heldBy = null;
      obj.position = {
        x: Math.round((charObj.position.x + nx * 1.0) * 100) / 100,
        y: Math.round((charObj.position.y + 1.4) * 100) / 100,
        z: Math.round((charObj.position.z + nz * 1.0) * 100) / 100
      };
      obj.velocity = {
        x: Math.round(nx * force * 100) / 100,
        y: Math.round((ny * force + 2.5) * 100) / 100,
        z: Math.round(nz * force * 100) / 100
      };
      obj.thrownBy = whoKey;
      obj.thrownAt = Date.now();

      handState.heldObjectId = null;
      handState.action = 'throw';
      setTimeout(() => {
        if (handState.action === 'throw') handState.action = 'idle';
      }, 700);

      savePersistentState();
      broadcastEvent('throw', {
        who: whoKey,
        objectId: heldId,
        velocity: obj.velocity,
        position: obj.position,
        worldObjects
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        Who: whoKey,
        ThrownObject: heldId,
        Force: force,
        lastHit: charObj.lastHit,
        hitNotification: charObj.lastHit ? charObj.lastHit.message : null,
        message: `${whoKey} threw ${obj.type} (${heldId}) with force ${force}!`
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Malformed throw payload: ' + err.message }));
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
        move_feet: 'PUT /move/feet',
        player_move: 'POST /api/player/move',
        chat_send: 'POST /Chat',
        chat_history: 'GET /Chat or GET /messages',
        spawn: 'POST /Spawn',
        hand: 'POST /Hand',
        throw: 'POST /Throw',
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
