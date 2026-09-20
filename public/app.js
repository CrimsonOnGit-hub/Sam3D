import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Sam3D - 3D Spatial Plane & Sona Coordinate Controller

// --- Scene Setup ---
const container = document.getElementById('canvas-container');
const labelsOverlay = document.getElementById('labels-overlay');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07090e);
scene.fog = new THREE.FogExp2(0x07090e, 0.015);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
// Camera positioned to frame the entire 3D plane overview
const DEFAULT_CAM_POS = new THREE.Vector3(0, 32, 44);
const DEFAULT_CAM_TARGET = new THREE.Vector3(0, 0, 0);
camera.position.copy(DEFAULT_CAM_POS);
camera.lookAt(DEFAULT_CAM_TARGET);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2 - 0.04; // Don't clip under ground
controls.minDistance = 10;
controls.maxDistance = 120;
controls.target.copy(DEFAULT_CAM_TARGET);

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
dirLight.position.set(25, 45, 25);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 150;
dirLight.shadow.camera.left = -35;
dirLight.shadow.camera.right = 35;
dirLight.shadow.camera.top = 35;
dirLight.shadow.camera.bottom = -35;
dirLight.shadow.bias = -0.0005;
scene.add(dirLight);

const fillLight = new THREE.DirectionalLight(0x88a0c8, 0.6);
fillLight.position.set(-25, 20, -25);
scene.add(fillLight);

// --- 3D Plane & Grid ---
const planeSize = 50;
const planeGeo = new THREE.PlaneGeometry(planeSize, planeSize, 64, 64);
const planeMat = new THREE.MeshStandardMaterial({
  color: 0x0f1522,
  roughness: 0.85,
  metalness: 0.15,
});
const planeMesh = new THREE.Mesh(planeGeo, planeMat);
planeMesh.rotation.x = -Math.PI / 2;
planeMesh.receiveShadow = true;
scene.add(planeMesh);

// Outer Border Rim
const rimGeo = new THREE.BoxGeometry(planeSize + 1, 0.3, planeSize + 1);
const rimEdges = new THREE.EdgesGeometry(rimGeo);
const rimMat = new THREE.LineBasicMaterial({ color: 0x2e3c54, linewidth: 2 });
const rimLines = new THREE.LineSegments(rimEdges, rimMat);
rimLines.position.y = -0.1;
scene.add(rimLines);

// Dual Grid Helpers
const gridHelper = new THREE.GridHelper(planeSize, 25, 0x4f6b95, 0x1c2538);
gridHelper.position.y = 0.02;
scene.add(gridHelper);

// Coordinate Axes (Red = X, Blue = Z)
const axisGroup = new THREE.Group();
const xLineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-25, 0.04, 0), new THREE.Vector3(25, 0.04, 0)]);
const xLineMat = new THREE.LineBasicMaterial({ color: 0xff3b30, linewidth: 2 });
axisGroup.add(new THREE.Line(xLineGeo, xLineMat));

const zLineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.04, -25), new THREE.Vector3(0, 0.04, 25)]);
const zLineMat = new THREE.LineBasicMaterial({ color: 0x0a84ff, linewidth: 2 });
axisGroup.add(new THREE.Line(zLineGeo, zLineMat));
scene.add(axisGroup);

// Coordinate Labels on the Plane at intervals
function createGridMarker(text, x, z) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 32);

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.6 });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.position.set(x, 0.3, z);
  sprite.scale.set(3, 1.5, 1);
  scene.add(sprite);
}

// Markers along axes
createGridMarker('X: -20', -20, 1.2);
createGridMarker('X: +20', 20, 1.2);
createGridMarker('Z: -20', 1.6, -20);
createGridMarker('Z: +20', 1.6, 20);
createGridMarker('(0,0)', 1.2, 1.2);

// Target cursor marker on plane
const targetBeacon = new THREE.Group();
const ringGeo = new THREE.RingGeometry(0.8, 1.0, 32);
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
const ringMesh = new THREE.Mesh(ringGeo, ringMat);
ringMesh.rotation.x = -Math.PI / 2;
targetBeacon.add(ringMesh);

const dotGeo = new THREE.CircleGeometry(0.2, 16);
const dotMat = new THREE.MeshBasicMaterial({ color: 0x6366f1, side: THREE.DoubleSide });
const dotMesh = new THREE.Mesh(dotGeo, dotMat);
dotMesh.rotation.x = -Math.PI / 2;
dotMesh.position.y = 0.01;
targetBeacon.add(dotMesh);

targetBeacon.position.set(0, 0.05, 0);
targetBeacon.visible = false;
scene.add(targetBeacon);

// --- Sona 3D Character Rig Factory ---
function createSonaRig(name, baseColorHex, accentHex) {
  const root = new THREE.Group();
  root.name = name;

  // Shadow blob under feet
  const shadowGeo = new THREE.CircleGeometry(0.85, 32);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.45,
    depthWrite: false
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.y = 0.02;
  root.add(shadowMesh);

  // Model body container (for bobbing & rotation)
  const bodyRig = new THREE.Group();
  root.add(bodyRig);

  // Materials
  const bodyMat = new THREE.MeshStandardMaterial({
    color: baseColorHex,
    roughness: 0.35,
    metalness: 0.25
  });

  const accentMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    roughness: 0.2,
    metalness: 0.4,
    emissive: accentHex,
    emissiveIntensity: 0.25
  });

  const eyeVisorMat = new THREE.MeshStandardMaterial({
    color: 0x0b1120,
    roughness: 0.1,
    metalness: 0.8
  });

  const visorGazeMat = new THREE.MeshBasicMaterial({
    color: accentHex
  });

  // Torso / Body
  const torsoGeo = new THREE.CylinderGeometry(0.55, 0.65, 1.1, 32);
  const torso = new THREE.Mesh(torsoGeo, bodyMat);
  torso.position.y = 1.05;
  torso.castShadow = true;
  bodyRig.add(torso);

  // Belt / accent ring
  const beltGeo = new THREE.TorusGeometry(0.62, 0.06, 16, 32);
  const belt = new THREE.Mesh(beltGeo, accentMat);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.85;
  bodyRig.add(belt);

  // Head
  const headGeo = new THREE.SphereGeometry(0.68, 32, 24);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.y = 1.95;
  head.castShadow = true;
  bodyRig.add(head);

  // Face Visor Screen
  const visorGeo = new THREE.BoxGeometry(0.72, 0.28, 0.35);
  const visor = new THREE.Mesh(visorGeo, eyeVisorMat);
  visor.position.set(0, 1.95, 0.45);
  bodyRig.add(visor);

  // Gaze eye slashes (left and right eyes)
  const eyeLeft = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.02), visorGazeMat);
  eyeLeft.position.set(-0.18, 1.96, 0.63);
  bodyRig.add(eyeLeft);

  const eyeRight = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.02), visorGazeMat);
  eyeRight.position.set(0.18, 1.96, 0.63);
  bodyRig.add(eyeRight);

  // Floating Hands (Left and Right)
  const handGeo = new THREE.SphereGeometry(0.22, 16, 16);
  const leftHand = new THREE.Mesh(handGeo, bodyMat);
  leftHand.position.set(-0.95, 1.15, 0);
  leftHand.castShadow = true;
  bodyRig.add(leftHand);

  const rightHand = new THREE.Mesh(handGeo, bodyMat);
  rightHand.position.set(0.95, 1.15, 0);
  rightHand.castShadow = true;
  bodyRig.add(rightHand);

  // Distinct Sona Silhouette Features
  if (name === 'Cam') {
    // Cam (Green): Dual playful antennae with glowing tip spheres
    const antStemGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.45, 12);
    const antTipGeo = new THREE.SphereGeometry(0.11, 16, 16);

    const antL = new THREE.Mesh(antStemGeo, bodyMat);
    antL.position.set(-0.25, 2.7, 0);
    antL.rotation.z = 0.25;
    const tipL = new THREE.Mesh(antTipGeo, accentMat);
    tipL.position.y = 0.26;
    antL.add(tipL);
    bodyRig.add(antL);

    const antR = new THREE.Mesh(antStemGeo, bodyMat);
    antR.position.set(0.25, 2.7, 0);
    antR.rotation.z = -0.25;
    const tipR = new THREE.Mesh(antTipGeo, accentMat);
    tipR.position.y = 0.26;
    antR.add(tipR);
    bodyRig.add(antR);
  } else if (name === 'Sam') {
    // Sam (Red): Crown crest on head & heart badge
    const crestGeo = new THREE.ConeGeometry(0.18, 0.45, 4);
    const crest = new THREE.Mesh(crestGeo, accentMat);
    crest.position.set(0, 2.75, 0);
    crest.rotation.y = Math.PI / 4;
    bodyRig.add(crest);

    const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 16), accentMat);
    badge.rotation.x = Math.PI / 2;
    badge.position.set(0, 1.25, 0.6);
    bodyRig.add(badge);
  } else if (name === 'Evil Sam') {
    // Evil Sam (Blue): Dual sleek curved horns & angular visor
    const hornGeo = new THREE.ConeGeometry(0.14, 0.55, 12);
    
    const hornL = new THREE.Mesh(hornGeo, accentMat);
    hornL.position.set(-0.35, 2.65, -0.05);
    hornL.rotation.z = 0.4;
    hornL.rotation.x = -0.2;
    bodyRig.add(hornL);

    const hornR = new THREE.Mesh(hornGeo, accentMat);
    hornR.position.set(0.35, 2.65, -0.05);
    hornR.rotation.z = -0.4;
    hornR.rotation.x = -0.2;
    bodyRig.add(hornR);
  }

  // Floating HTML Label element
  const labelEl = document.createElement('div');
  labelEl.className = 'char-label-tag';
  const tagClass = name === 'Sam' ? 'sam' : name === 'Cam' ? 'cam' : 'evil-sam';
  labelEl.innerHTML = `
    <span class="char-name-badge ${tagClass}">${name}</span>
    <span class="char-coord-badge" id="tag-coords-${name.toLowerCase().replace(/\s+/g, '-')}">[0, 0, 0]</span>
  `;
  labelsOverlay.appendChild(labelEl);

  return {
    name,
    root,
    bodyRig,
    shadowMesh,
    leftHand,
    rightHand,
    labelEl,
    coordBadgeEl: labelEl.querySelector('.char-coord-badge'),
    currentPos: new THREE.Vector3(),
    targetPos: new THREE.Vector3(),
    isMoving: false,
    speed: 12.0,
    walkCycle: 0,
    speechTimeout: null
  };
}

// Instantiate the 3 Sonas
const characters = {
  'Sam': createSonaRig('Sam', 0xff3b30, 0xff6961),
  'Cam': createSonaRig('Cam', 0x34c759, 0x30d158),
  'Evil Sam': createSonaRig('Evil Sam', 0x0a84ff, 0x5ac8fa)
};

for (const key in characters) {
  scene.add(characters[key].root);
}

// Initial Spawn Positions
function setInitialPositions() {
  characters['Sam'].currentPos.set(0, 0, 0);
  characters['Sam'].targetPos.set(0, 0, 0);
  characters['Sam'].root.position.set(0, 0, 0);

  characters['Cam'].currentPos.set(-6, 0, -3);
  characters['Cam'].targetPos.set(-6, 0, -3);
  characters['Cam'].root.position.set(-6, 0, -3);

  characters['Evil Sam'].currentPos.set(6, 0, 3);
  characters['Evil Sam'].targetPos.set(6, 0, 3);
  characters['Evil Sam'].root.position.set(6, 0, 3);
}
setInitialPositions();

// --- Speech Bubble Trigger ---
function showSpeechBubble(charObj, text) {
  // Remove any existing bubble for this character
  if (charObj.speechBubbleEl) {
    charObj.speechBubbleEl.remove();
    charObj.speechBubbleEl = null;
  }
  if (charObj.speechTimeout) {
    clearTimeout(charObj.speechTimeout);
  }

  const bubble = document.createElement('div');
  bubble.className = 'speech-bubble';
  bubble.textContent = text;
  labelsOverlay.appendChild(bubble);
  charObj.speechBubbleEl = bubble;

  charObj.speechTimeout = setTimeout(() => {
    if (charObj.speechBubbleEl) {
      charObj.speechBubbleEl.remove();
      charObj.speechBubbleEl = null;
    }
  }, 3600);
}

// --- Toast Notification ---
function showToast(message) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

// --- Character Movement Handler ---
function applyCharacterMove(who, x, y, z, commandText) {
  const char = characters[who];
  if (!char) return;

  char.targetPos.set(x, y, z);
  char.isMoving = true;

  const cmd = commandText || `[move] ${x}, ${y}, ${z}`;
  showSpeechBubble(char, cmd);

  // Update UI cards
  updateSonaUICard(who, x, y, z, 'Moving to coordinates');
}

function updateSonaUICard(who, x, y, z, status) {
  const idMap = { 'Sam': 'sam', 'Cam': 'cam', 'Evil Sam': 'evil-sam' };
  const id = idMap[who];
  if (!id) return;

  const coordsEl = document.getElementById(`coords-${id}`);
  if (coordsEl) {
    coordsEl.innerHTML = `<span>X: ${x.toFixed(1)}</span> <span>Y: ${y.toFixed(1)}</span> <span>Z: ${z.toFixed(1)}</span>`;
  }
  const statusEl = document.getElementById(`status-${id}`);
  if (statusEl && status) {
    statusEl.textContent = status;
  }
}

// --- HTTP Request Engine (PUT /Move) ---
let selectedWho = 'Sam';

async function executeMoveRequest(who, whereStr) {
  const endpoint = '/Move';
  const bodyPayload = {
    Who: who,
    Where: whereStr
  };

  try {
    const res = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bodyPayload)
    });

    if (res.ok) {
      const data = await res.json();
      // Server returns Who and Where
      const returnWho = data.Who || who;
      const returnWhere = data.Where || whereStr;
      
      const targetCoords = data.character ? data.character.position : parseWhereClient(returnWhere);
      if (targetCoords) {
        applyCharacterMove(returnWho, targetCoords.x, targetCoords.y, targetCoords.z, `[move] ${returnWhere}`);
      }
      showToast(`${returnWho} moved to [${returnWhere}]`);
    } else {
      const errData = await res.json().catch(() => ({}));
      const errMsg = errData.error || `HTTP ${res.status}`;
      showToast(`Error: ${errMsg}`);
    }
  } catch (err) {
    // Fallback if running standalone or offline
    const coords = parseWhereClient(whereStr);
    if (coords) {
      applyCharacterMove(who, coords.x, coords.y, coords.z, `[move] ${whereStr}`);
      showToast(`${who} moved to [${whereStr}]`);
    } else {
      showToast(`Invalid coordinates: "${whereStr}"`);
    }
  }
}

// Client-side parser utility
function parseWhereClient(str) {
  if (!str) return null;
  const clean = str.replace(/[()[\]{}]/g, '').trim();
  const parts = clean.split(/[,\s]+/).map(p => Number(p)).filter(n => !isNaN(n));
  if (parts.length === 2) return { x: parts[0], y: 0, z: parts[1] };
  if (parts.length >= 3) return { x: parts[0], y: parts[1], z: parts[2] };
  return null;
}

// --- Universal Multi-Instance Real-Time Synchronization Engine ---
let isInitialStateLoaded = false;

function syncCharactersFromServer(serverCharacters, animate = true) {
  if (!serverCharacters) return;

  for (const key in serverCharacters) {
    const sChar = serverCharacters[key];
    const lChar = characters[key];
    if (!lChar || !sChar.position) continue;

    const sx = Number(sChar.position.x);
    const sy = Number(sChar.position.y);
    const sz = Number(sChar.position.z);

    // Calculate distance to current target position
    const dx = Math.abs(lChar.targetPos.x - sx);
    const dy = Math.abs(lChar.targetPos.y - sy);
    const dz = Math.abs(lChar.targetPos.z - sz);

    // If coordinates on server changed
    if (dx > 0.05 || dy > 0.05 || dz > 0.05) {
      if (animate && isInitialStateLoaded) {
        applyCharacterMove(key, sx, sy, sz, sChar.lastCommand);
      } else {
        // Initial setup or direct snap
        lChar.currentPos.set(sx, sy, sz);
        lChar.targetPos.set(sx, sy, sz);
        lChar.root.position.set(sx, sy, sz);
        updateSonaUICard(key, sx, sy, sz, 'Synchronized');
      }
    }
  }
  isInitialStateLoaded = true;
}

async function fetchCurrentState(animate = true) {
  try {
    const res = await fetch('/api/characters', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data.characters) {
        syncCharactersFromServer(data.characters, animate);
      }
    }
  } catch (err) {
    // Offline or server temporarily unreachable
  }
}

// Initial fetch to sync immediately with whatever is on the server
fetchCurrentState(false);

// Continuous polling fallback ensures guaranteed sync across all devices/instances even if SSE drops
setInterval(() => {
  fetchCurrentState(true);
}, 800);

// Sync immediately whenever the tab becomes active/visible
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    fetchCurrentState(true);
  }
});

// SSE Live Stream for sub-10ms instant event push
function initSSE() {
  try {
    const eventSource = new EventSource('/api/stream');
    
    const handleEventData = (rawData) => {
      try {
        const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
        if (data.characters) {
          syncCharactersFromServer(data.characters, true);
        } else if (data.who && data.where) {
          applyCharacterMove(data.who, data.where.x, data.where.y, data.where.z, data.command);
        }
      } catch (err) {
        // Non-JSON or heartbeat ping
      }
    };

    eventSource.onmessage = (e) => handleEventData(e.data);
    eventSource.addEventListener('init', (e) => handleEventData(e.data));
    eventSource.addEventListener('move', (e) => handleEventData(e.data));

    eventSource.onerror = () => {
      // EventSource auto-reconnects, while fast polling maintains sync
    };
  } catch (err) {
    console.log('SSE not available in this environment, relying on sync polling.');
  }
}
initSSE();

// --- ONLY UI: Click-to-Move Dock Controller ---
const sonaPills = document.querySelectorAll('.sona-pill');
const dockHint = document.getElementById('dock-hint');

function selectSona(name) {
  selectedWho = name;
  sonaPills.forEach(p => {
    p.classList.toggle('active', p.dataset.who === name);
  });
  if (dockHint) dockHint.textContent = `Click anywhere on the plane to move ${name}`;
}

sonaPills.forEach(pill => {
  pill.addEventListener('click', () => {
    selectSona(pill.dataset.who);
  });
});

// Raycasting for Plane Hover and Click-to-Move
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('mousemove', (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(planeMesh);
  if (intersects.length > 0) {
    const pt = intersects[0].point;
    targetBeacon.position.set(pt.x, 0.04, pt.z);
    targetBeacon.visible = true;
  } else {
    targetBeacon.visible = false;
  }
});

renderer.domElement.addEventListener('click', (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // Check if clicked directly on a character in 3D to select them
  for (const key in characters) {
    const hits = raycaster.intersectObjects(characters[key].bodyRig.children, true);
    if (hits.length > 0) {
      selectSona(key);
      showToast(`Selected ${key}`);
      return;
    }
  }

  // Click on ground plane to move selected character
  const groundHits = raycaster.intersectObject(planeMesh);
  if (groundHits.length > 0) {
    const pt = groundHits[0].point;
    const x = Math.round(pt.x * 10) / 10;
    const z = Math.round(pt.z * 10) / 10;
    const whereStr = `${x}, 0, ${z}`;
    executeMoveRequest(selectedWho, whereStr);
  }
});

// --- Screen Space Label Projection ---
const tempVec = new THREE.Vector3();

function updateOverheadLabels() {
  const halfW = window.innerWidth / 2;
  const halfH = window.innerHeight / 2;

  for (const key in characters) {
    const char = characters[key];
    tempVec.setFromMatrixPosition(char.root.matrixWorld);
    tempVec.y += 2.85; // Float above character head

    tempVec.project(camera);

    // If behind camera, hide
    if (tempVec.z > 1) {
      char.labelEl.style.display = 'none';
      if (char.speechBubbleEl) char.speechBubbleEl.style.display = 'none';
      continue;
    }

    char.labelEl.style.display = 'flex';
    const screenX = (tempVec.x * halfW) + halfW;
    const screenY = -(tempVec.y * halfH) + halfH;
    char.labelEl.style.left = `${screenX}px`;
    char.labelEl.style.top = `${screenY}px`;

    // Update coordinate badge text
    char.coordBadgeEl.textContent = `[${char.currentPos.x.toFixed(1)}, ${char.currentPos.y.toFixed(1)}, ${char.currentPos.z.toFixed(1)}]`;

    // Position speech bubble above label if active
    if (char.speechBubbleEl) {
      char.speechBubbleEl.style.display = 'block';
      char.speechBubbleEl.style.left = `${screenX}px`;
      char.speechBubbleEl.style.top = `${screenY - 32}px`;
    }
  }
}

// --- Main Animation Loop ---
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const time = clock.getElapsedTime();

  // Update controls
  controls.update();

  // Animate Characters
  for (const key in characters) {
    const char = characters[key];

    // Check distance to target
    const dist = char.currentPos.distanceTo(char.targetPos);

    if (dist > 0.05) {
      char.isMoving = true;
      // Direction vector
      const dir = new THREE.Vector3().subVectors(char.targetPos, char.currentPos).normalize();
      
      // Face towards moving direction
      const targetAngle = Math.atan2(dir.x, dir.z);
      // Smooth angular slerp
      let diff = targetAngle - char.bodyRig.rotation.y;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      char.bodyRig.rotation.y += diff * 0.15;

      // Move position smoothly
      const step = Math.min(dist, char.speed * delta);
      char.currentPos.addScaledVector(dir, step);
      char.root.position.copy(char.currentPos);

      // Walk cycle bobbing
      char.walkCycle += delta * 14;
      char.bodyRig.position.y = Math.abs(Math.sin(char.walkCycle)) * 0.35;
      char.leftHand.position.z = Math.sin(char.walkCycle) * 0.45;
      char.rightHand.position.z = -Math.sin(char.walkCycle) * 0.45;
      char.bodyRig.rotation.z = Math.sin(char.walkCycle * 0.5) * 0.08;

      updateSonaUICard(key, char.currentPos.x, char.currentPos.y, char.currentPos.z, 'Traveling...');
    } else {
      if (char.isMoving) {
        char.isMoving = false;
        char.currentPos.copy(char.targetPos);
        char.root.position.copy(char.currentPos);
        updateSonaUICard(key, char.currentPos.x, char.currentPos.y, char.currentPos.z, 'Idle at Destination');
      }

      // Idle gentle floating & breathing
      const idleOffset = key === 'Sam' ? 0 : key === 'Cam' ? 2 : 4;
      char.bodyRig.position.y = Math.sin(time * 2.2 + idleOffset) * 0.08;
      char.leftHand.position.y = 1.15 + Math.sin(time * 2.5 + idleOffset) * 0.06;
      char.rightHand.position.y = 1.15 + Math.cos(time * 2.5 + idleOffset) * 0.06;
      char.leftHand.position.z = 0;
      char.rightHand.position.z = 0;
      char.bodyRig.rotation.z = 0;
    }
  }

  // Update 2D overhead labels
  updateOverheadLabels();

  // Render Scene
  renderer.render(scene, camera);
}

animate();

// --- Responsive Resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Initial log entry
logNetworkRequest('SYSTEM', '/Move', 200, 'Sam3D initialized. Ready for PUT /Move requests.');
