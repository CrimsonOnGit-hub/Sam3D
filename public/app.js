import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Sam3D - 3D Spatial Plane, Sonas, Chat, Spawning, & First-Person WASD

// --- Scene Setup ---
const container = document.getElementById('canvas-container');
const labelsOverlay = document.getElementById('labels-overlay');
const chatFeed = document.getElementById('chat-feed');
const fpHud = document.getElementById('fp-hud');
const fpCrosshair = document.getElementById('fp-crosshair');
const btnToggleFp = document.getElementById('btn-toggle-fp');
const fpBtnText = document.getElementById('fp-btn-text');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07090e);
scene.fog = new THREE.FogExp2(0x07090e, 0.015);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
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
controls.maxPolarAngle = Math.PI / 2 - 0.04;
controls.minDistance = 6;
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

// --- 3D Plane & Terrain ---
const planeSize = 50;

function getTerrainHeight(x, z) {
  // Contoured rolling hills elevation
  return Math.sin(x * 0.12) * Math.cos(z * 0.12) * 0.75 + Math.cos(x * 0.06 + z * 0.06) * 0.35;
}

const planeGeo = new THREE.PlaneGeometry(planeSize, planeSize, 64, 64);
const posAttr = planeGeo.attributes.position;
for (let i = 0; i < posAttr.count; i++) {
  const vx = posAttr.getX(i);
  const vy = posAttr.getY(i);
  posAttr.setZ(i, getTerrainHeight(vx, -vy));
}
planeGeo.computeVertexNormals();

const planeMat = new THREE.MeshStandardMaterial({
  color: 0x0f1522,
  roughness: 0.85,
  metalness: 0.15,
});
const planeMesh = new THREE.Mesh(planeGeo, planeMat);
planeMesh.rotation.x = -Math.PI / 2;
planeMesh.receiveShadow = true;
scene.add(planeMesh);

// Topographic Contoured Wireframe
const terrainWireMat = new THREE.MeshBasicMaterial({
  color: 0x2e4263,
  wireframe: true,
  transparent: true,
  opacity: 0.25
});
const terrainWire = new THREE.Mesh(planeGeo, terrainWireMat);
terrainWire.rotation.x = -Math.PI / 2;
terrainWire.position.y = 0.005;
scene.add(terrainWire);

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

// --- Articulated Hand & Finger Factory ---
function createHandWithFingers(isLeft, bodyMat, accentMat) {
  const handGroup = new THREE.Group();
  handGroup.name = isLeft ? 'LeftHand' : 'RightHand';

  // Palm base
  const palmGeo = new THREE.BoxGeometry(0.24, 0.28, 0.14);
  const palm = new THREE.Mesh(palmGeo, bodyMat);
  palm.castShadow = true;
  handGroup.add(palm);

  // Wrist ring / accent band
  const cuffGeo = new THREE.TorusGeometry(0.13, 0.026, 12, 24);
  const cuff = new THREE.Mesh(cuffGeo, accentMat);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.y = -0.12;
  handGroup.add(cuff);

  const fingers = [];
  // 5 digits: Thumb + Index + Middle + Ring + Pinky
  const fingerConfigs = [
    { name: 'thumb', x: isLeft ? 0.13 : -0.13, y: -0.01, z: 0.045, len: 0.13, rad: 0.035, isThumb: true },
    { name: 'index', x: isLeft ? 0.08 : -0.08, y: 0.15, z: 0.01, len: 0.15, rad: 0.03 },
    { name: 'middle', x: isLeft ? 0.025 : -0.025, y: 0.165, z: 0.01, len: 0.17, rad: 0.031 },
    { name: 'ring', x: isLeft ? -0.03 : 0.03, y: 0.15, z: 0.01, len: 0.15, rad: 0.029 },
    { name: 'pinky', x: isLeft ? -0.085 : 0.085, y: 0.125, z: 0.01, len: 0.12, rad: 0.026 }
  ];

  for (let i = 0; i < fingerConfigs.length; i++) {
    const cfg = fingerConfigs[i];
    const knuckle = new THREE.Group();
    knuckle.position.set(cfg.x, cfg.y, cfg.z);

    if (cfg.isThumb) {
      knuckle.rotation.z = isLeft ? -0.7 : 0.7;
      knuckle.rotation.y = isLeft ? 0.4 : -0.4;
    }

    // Proximal segment (knuckle to mid-joint)
    const segLen = cfg.len * 0.58;
    const segGeo = new THREE.CylinderGeometry(cfg.rad * 0.9, cfg.rad, segLen, 12);
    const segMesh = new THREE.Mesh(segGeo, bodyMat);
    segMesh.position.y = segLen / 2;
    segMesh.castShadow = true;
    knuckle.add(segMesh);

    // Mid-joint knuckle sphere
    const midKnuckleGeo = new THREE.SphereGeometry(cfg.rad * 0.95, 10, 10);
    const midKnuckle = new THREE.Mesh(midKnuckleGeo, accentMat);
    midKnuckle.position.y = segLen;
    knuckle.add(midKnuckle);

    // Distal tip phalanx
    const tipPivot = new THREE.Group();
    tipPivot.position.y = segLen;
    knuckle.add(tipPivot);

    const tipLen = cfg.len * 0.46;
    const tipGeo = new THREE.CylinderGeometry(cfg.rad * 0.75, cfg.rad * 0.9, tipLen, 12);
    const tipMesh = new THREE.Mesh(tipGeo, accentMat);
    tipMesh.position.y = tipLen / 2;
    tipMesh.castShadow = true;
    tipPivot.add(tipMesh);

    // Finger cap
    const capGeo = new THREE.SphereGeometry(cfg.rad * 0.75, 10, 10);
    const capMesh = new THREE.Mesh(capGeo, accentMat);
    capMesh.position.y = tipLen;
    tipPivot.add(capMesh);

    handGroup.add(knuckle);
    fingers.push({
      config: cfg,
      knuckle,
      tipPivot,
      isThumb: !!cfg.isThumb
    });
  }

  handGroup.userData = { fingers, isLeft };
  return handGroup;
}

function animateFingers(hand, action, time, isMoving) {
  if (!hand || !hand.userData || !hand.userData.fingers) return;
  const { fingers, isLeft } = hand.userData;

  for (let i = 0; i < fingers.length; i++) {
    const f = fingers[i];
    if (action === 'hold') {
      // Gripping held object
      if (f.isThumb) {
        f.knuckle.rotation.x = 0.75;
        f.knuckle.rotation.y = isLeft ? 0.6 : -0.6;
        f.tipPivot.rotation.x = 0.6;
      } else {
        f.knuckle.rotation.x = 1.35 + (i * 0.05);
        f.tipPivot.rotation.x = 1.15;
      }
    } else if (action === 'throw') {
      // Open hand release forward
      f.knuckle.rotation.x = -0.4;
      f.tipPivot.rotation.x = -0.25;
    } else if (action === 'wave') {
      // Articulated finger wave
      f.knuckle.rotation.x = -0.15 + Math.sin(time * 16 + i * 0.6) * 0.45;
      f.tipPivot.rotation.x = 0.2 + Math.sin(time * 16 + i * 0.6 + 0.3) * 0.35;
    } else if (action === 'handsup') {
      // Splayed celebration fingers
      f.knuckle.rotation.x = -0.3;
      f.tipPivot.rotation.x = -0.15;
    } else if (isMoving) {
      // Natural walking flex
      const flex = Math.sin(time * 12 + i * 0.4) * 0.22;
      f.knuckle.rotation.x = 0.35 + flex;
      f.tipPivot.rotation.x = 0.25 + flex;
    } else {
      // Relaxed idle resting curl
      const breath = Math.sin(time * 2.5 + i * 0.3) * 0.08;
      f.knuckle.rotation.x = 0.28 + breath;
      f.tipPivot.rotation.x = 0.22 + breath;
    }
  }
}

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

  // Model body container
  const bodyRig = new THREE.Group();
  root.add(bodyRig);

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

  const visorGazeMat = new THREE.MeshBasicMaterial({ color: accentHex });

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

  // Head container
  const headGroup = new THREE.Group();
  bodyRig.add(headGroup);

  // Head
  const headGeo = new THREE.SphereGeometry(0.68, 32, 24);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.y = 1.95;
  head.castShadow = true;
  headGroup.add(head);

  // Face Visor Screen
  const visorGeo = new THREE.BoxGeometry(0.72, 0.28, 0.35);
  const visor = new THREE.Mesh(visorGeo, eyeVisorMat);
  visor.position.set(0, 1.95, 0.45);
  headGroup.add(visor);

  // Gaze eye slashes
  const eyeLeft = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.02), visorGazeMat);
  eyeLeft.position.set(-0.18, 1.96, 0.63);
  headGroup.add(eyeLeft);

  const eyeRight = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.02), visorGazeMat);
  eyeRight.position.set(0.18, 1.96, 0.63);
  headGroup.add(eyeRight);

  // Floating Hands with articulated Fingers
  const leftHand = createHandWithFingers(true, bodyMat, accentMat);
  leftHand.position.set(-0.95, 1.15, 0);
  bodyRig.add(leftHand);

  const rightHand = createHandWithFingers(false, bodyMat, accentMat);
  rightHand.position.set(0.95, 1.15, 0);
  bodyRig.add(rightHand);

  // Distinct Features per Sona
  if (name === 'Cam') {
    const antStemGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.45, 12);
    const antTipGeo = new THREE.SphereGeometry(0.11, 16, 16);

    const antL = new THREE.Mesh(antStemGeo, bodyMat);
    antL.position.set(-0.25, 2.7, 0);
    antL.rotation.z = 0.25;
    const tipL = new THREE.Mesh(antTipGeo, accentMat);
    tipL.position.y = 0.26;
    antL.add(tipL);
    headGroup.add(antL);

    const antR = new THREE.Mesh(antStemGeo, bodyMat);
    antR.position.set(0.25, 2.7, 0);
    antR.rotation.z = -0.25;
    const tipR = new THREE.Mesh(antTipGeo, accentMat);
    tipR.position.y = 0.26;
    antR.add(tipR);
    headGroup.add(antR);
  } else if (name === 'Sam') {
    const crestGeo = new THREE.ConeGeometry(0.18, 0.45, 4);
    const crest = new THREE.Mesh(crestGeo, accentMat);
    crest.position.set(0, 2.75, 0);
    crest.rotation.y = Math.PI / 4;
    headGroup.add(crest);

    const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 16), accentMat);
    badge.rotation.x = Math.PI / 2;
    badge.position.set(0, 1.25, 0.6);
    bodyRig.add(badge);
  } else if (name === 'Evil Sam') {
    const hornGeo = new THREE.ConeGeometry(0.14, 0.55, 12);
    const hornL = new THREE.Mesh(hornGeo, accentMat);
    hornL.position.set(-0.35, 2.65, -0.05);
    hornL.rotation.z = 0.4;
    hornL.rotation.x = -0.2;
    headGroup.add(hornL);

    const hornR = new THREE.Mesh(hornGeo, accentMat);
    hornR.position.set(0.35, 2.65, -0.05);
    hornR.rotation.z = -0.4;
    hornR.rotation.x = -0.2;
    headGroup.add(hornR);
  } else if (name === 'Player') {
    // Player (Gold): Golden crown halo & dual visor wings
    const haloGeo = new THREE.TorusGeometry(0.42, 0.05, 16, 32);
    const halo = new THREE.Mesh(haloGeo, accentMat);
    halo.position.set(0, 2.8, 0);
    halo.rotation.x = Math.PI / 2.2;
    headGroup.add(halo);

    const finGeo = new THREE.BoxGeometry(0.08, 0.35, 0.4);
    const finL = new THREE.Mesh(finGeo, accentMat);
    finL.position.set(-0.62, 1.95, 0.2);
    headGroup.add(finL);

    const finR = new THREE.Mesh(finGeo, accentMat);
    finR.position.set(0.62, 1.95, 0.2);
    headGroup.add(finR);
  }

  // Floating HTML Label element
  const labelEl = document.createElement('div');
  labelEl.className = 'char-label-tag';
  const tagClass = name === 'Sam' ? 'sam' : name === 'Cam' ? 'cam' : name === 'Evil Sam' ? 'evil-sam' : 'player';
  labelEl.innerHTML = `
    <span class="char-name-badge ${tagClass}">${name}</span>
    <span class="char-coord-badge" id="tag-coords-${name.toLowerCase().replace(/\s+/g, '-')}">[0, 0, 0]</span>
  `;
  labelsOverlay.appendChild(labelEl);

  return {
    name,
    root,
    bodyRig,
    headGroup,
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
    handAction: 'idle',
    heldObjectId: null,
    speechTimeout: null
  };
}

// Instantiate Characters
const characters = {
  'Sam': createSonaRig('Sam', 0xff3b30, 0xff6961),
  'Cam': createSonaRig('Cam', 0x34c759, 0x30d158),
  'Evil Sam': createSonaRig('Evil Sam', 0x0a84ff, 0x5ac8fa),
  'Player': createSonaRig('Player', 0xf59e0b, 0xfbbf24)
};

for (const key in characters) {
  scene.add(characters[key].root);
}

// Initial Spawn Positions
function setInitialPositions() {
  characters['Sam'].currentPos.set(0, getTerrainHeight(0, 0), 0);
  characters['Sam'].targetPos.copy(characters['Sam'].currentPos);
  characters['Sam'].root.position.copy(characters['Sam'].currentPos);

  characters['Cam'].currentPos.set(-6, getTerrainHeight(-6, -3), -3);
  characters['Cam'].targetPos.copy(characters['Cam'].currentPos);
  characters['Cam'].root.position.copy(characters['Cam'].currentPos);

  characters['Evil Sam'].currentPos.set(6, getTerrainHeight(6, 3), 3);
  characters['Evil Sam'].targetPos.copy(characters['Evil Sam'].currentPos);
  characters['Evil Sam'].root.position.copy(characters['Evil Sam'].currentPos);

  characters['Player'].currentPos.set(0, getTerrainHeight(0, 6), 6);
  characters['Player'].targetPos.copy(characters['Player'].currentPos);
  characters['Player'].root.position.copy(characters['Player'].currentPos);
}
setInitialPositions();

// --- 3D World Objects Management ---
const worldObjects = {};
const worldObjectMeshes = {};

function createObjectMesh(data) {
  const group = new THREE.Group();
  group.name = data.id;
  group.userData = { id: data.id, type: data.type, heldBy: data.heldBy };

  let geom;
  let mat;
  const col = data.color || '#f59e0b';

  if (data.type === 'orb') {
    geom = new THREE.SphereGeometry(0.45, 24, 24);
    mat = new THREE.MeshStandardMaterial({
      color: col,
      roughness: 0.15,
      metalness: 0.7,
      emissive: col,
      emissiveIntensity: 0.4
    });
  } else if (data.type === 'diamond') {
    geom = new THREE.OctahedronGeometry(0.55, 0);
    mat = new THREE.MeshStandardMaterial({
      color: col,
      roughness: 0.1,
      metalness: 0.9,
      emissive: col,
      emissiveIntensity: 0.3
    });
  } else {
    geom = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    mat = new THREE.MeshStandardMaterial({
      color: col,
      roughness: 0.3,
      metalness: 0.4
    });
  }

  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  const shadowGeo = new THREE.CircleGeometry(0.5, 16);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  group.add(shadow);

  const p = data.position || { x: 0, y: 0.5, z: 0 };
  group.position.set(p.x, p.y || 0.5, p.z);
  scene.add(group);
  return group;
}

function syncWorldObjects(serverObjects) {
  if (!serverObjects) return;
  for (const id in serverObjects) {
    const data = serverObjects[id];
    worldObjects[id] = data;

    if (!worldObjectMeshes[id]) {
      worldObjectMeshes[id] = createObjectMesh(data);
    } else {
      const mesh = worldObjectMeshes[id];
      mesh.userData.heldBy = data.heldBy;
      if (!data.heldBy && data.position) {
        mesh.position.set(data.position.x, data.position.y || 0.5, data.position.z);
      }
    }
  }
}

// --- Speech Bubble Trigger ---
function showSpeechBubble(charObj, text) {
  if (charObj.speechBubbleEl) {
    charObj.speechBubbleEl.remove();
    charObj.speechBubbleEl = null;
  }
  if (charObj.speechTimeout) clearTimeout(charObj.speechTimeout);

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
  }, 4500);
}

// --- Toast Notification ---
function showToast(message) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// --- Character Movement Animation ---
function applyCharacterMove(who, x, y, z) {
  const char = characters[who];
  if (!char) return;

  const targetY = (y === 0 || y === undefined || y === null) ? getTerrainHeight(x, z) : Math.max(getTerrainHeight(x, z), y);
  char.targetPos.set(x, targetY, z);
  char.isMoving = true;
}

// --- Chat Feed Helper ---
const seenMessageIds = new Set();
function appendChatMessage(who, message, id = null) {
  if (id && seenMessageIds.has(id)) return;
  if (id) seenMessageIds.add(id);

  const entry = document.createElement('div');
  entry.className = 'chat-msg-entry';
  const tagClass = who === 'Sam' ? 'sam' : who === 'Cam' ? 'cam' : who === 'Evil Sam' ? 'evil-sam' : 'player';
  entry.innerHTML = `
    <span class="chat-msg-author ${tagClass}">${who}:</span>
    <span class="chat-msg-text">${escapeHtml(message)}</span>
  `;
  chatFeed.appendChild(entry);
  setTimeout(() => entry.remove(), 9000);
  if (chatFeed.children.length > 8) {
    chatFeed.firstElementChild.remove();
  }
}

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag] || tag));
}

// --- HTTP Request Engine (PUT /Move) ---
let selectedWho = 'Sam';

async function executeMoveRequest(who, whereStr) {
  if (who === 'Player') {
    showToast("Player can only be moved with WASD from public.html!");
    return;
  }

  const endpoint = '/Move';
  const bodyPayload = { Who: who, Where: whereStr };

  try {
    const res = await fetch(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload)
    });

    if (res.ok) {
      const data = await res.json();
      const returnWho = data.Who || who;
      const returnWhere = data.Where || whereStr;
      const targetCoords = data.character ? data.character.position : parseWhereClient(returnWhere);
      if (targetCoords) {
        applyCharacterMove(returnWho, targetCoords.x, targetCoords.y, targetCoords.z);
      }
      showToast(`${returnWho} moved to [${returnWhere}]`);
    } else {
      const errData = await res.json().catch(() => ({}));
      showToast(`Error: ${errData.error || `HTTP ${res.status}`}`);
    }
  } catch (err) {
    const coords = parseWhereClient(whereStr);
    if (coords) {
      applyCharacterMove(who, coords.x, coords.y, coords.z);
      showToast(`${who} moved to [${whereStr}]`);
    }
  }
}

function parseWhereClient(str) {
  if (!str) return null;
  const clean = String(str).replace(/[()[\]{}]/g, '').trim();
  const parts = clean.split(/[,\s]+/).map(p => Number(p)).filter(n => !isNaN(n));
  if (parts.length === 2) return { x: parts[0], y: 0, z: parts[1] };
  if (parts.length >= 3) return { x: parts[0], y: parts[1], z: parts[2] };
  return null;
}

// --- Chat Sender ---
async function sendChatMessage(who, message) {
  if (!message) return;
  try {
    const res = await fetch('/Chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Who: who, Message: message })
    });
    if (res.ok) {
      const data = await res.json();
      const char = characters[who];
      if (char) showSpeechBubble(char, message);
      appendChatMessage(who, message, data.id);
    }
  } catch (err) {
    const char = characters[who];
    if (char) showSpeechBubble(char, message);
    appendChatMessage(who, message);
  }
}

// --- Spawn Object Sender ---
async function sendSpawnRequest(who, type) {
  try {
    const res = await fetch('/Spawn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Who: who, Type: type })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.object) {
        syncWorldObjects({ [data.object.id]: data.object });
        showToast(`Spawned ${type}! Click it to hold.`);
      }
    }
  } catch (err) {
    const id = 'obj-' + Date.now();
    const char = characters[who];
    const newObj = {
      id,
      type,
      color: type === 'orb' ? '#a855f7' : type === 'diamond' ? '#06b6d4' : '#f59e0b',
      position: { x: char.currentPos.x + 1.5, y: getTerrainHeight(char.currentPos.x + 1.5, char.currentPos.z + 1.5) + 0.5, z: char.currentPos.z + 1.5 },
      heldBy: null
    };
    syncWorldObjects({ [id]: newObj });
    showToast(`Spawned ${type} locally!`);
  }
}

// --- Hand Action Sender ---
async function sendHandAction(who, action, objectId = null) {
  try {
    const res = await fetch('/Hand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Who: who, Action: action, ObjectId: objectId })
    });
    if (res.ok) {
      const data = await res.json();
      const char = characters[who];
      if (char) {
        char.handAction = action;
        char.heldObjectId = objectId;
      }
      if (action === 'drop' && char) {
        char.heldObjectId = null;
      }
      showToast(`${who} hand: ${action}`);
    }
  } catch (err) {
    const char = characters[who];
    if (char) {
      char.handAction = action;
      char.heldObjectId = action === 'drop' ? null : objectId;
    }
  }
}

// --- Throw Object Sender ---
async function sendThrowRequest(who, force = 16) {
  try {
    let dir = null;
    if (isFirstPerson && who === 'Player') {
      dir = {
        x: -Math.sin(fpYaw) * Math.cos(fpPitch),
        y: Math.sin(fpPitch) + 0.25,
        z: -Math.cos(fpYaw) * Math.cos(fpPitch)
      };
    } else {
      const char = characters[who];
      const rad = char ? char.bodyRig.rotation.y : 0;
      dir = {
        x: Math.sin(rad),
        y: 0.35,
        z: Math.cos(rad)
      };
    }

    const res = await fetch('/Throw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Who: who, Force: force, Direction: dir })
    });
    const data = await res.json();
    if (res.ok) {
      const char = characters[who];
      if (char) {
        char.handAction = 'throw';
        char.heldObjectId = null;
        setTimeout(() => {
          if (char.handAction === 'throw') char.handAction = 'idle';
        }, 600);
      }
      showToast(`🚀 ${who} threw object!`);
    } else {
      showToast(data.error || 'Could not throw object');
    }
  } catch (err) {
    showToast('Throw error: ' + err.message);
  }
}

// --- Hit Reaction Visual Effect ---
function triggerHitEffect(charName, message) {
  const char = characters[charName];
  if (!char) return;
  showToast(`💥 ${message || `${charName} was hit by an object!`}`);

  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  char.bodyRig.traverse((child) => {
    if (child.isMesh && child.material && !child.userData.origMat) {
      child.userData.origMat = child.material;
      child.material = flashMat;
    }
  });
  setTimeout(() => {
    char.bodyRig.traverse((child) => {
      if (child.isMesh && child.userData.origMat) {
        child.material = child.userData.origMat;
        delete child.userData.origMat;
      }
    });
  }, 160);
}

// --- Universal State Synchronization ---
let isInitialStateLoaded = false;

function isAnyMovementKeyPressed() {
  return !!(keysDown['KeyW'] || keysDown['KeyA'] || keysDown['KeyS'] || keysDown['KeyD'] ||
            keysDown['ArrowUp'] || keysDown['ArrowLeft'] || keysDown['ArrowDown'] || keysDown['ArrowRight']);
}

function syncCharactersFromServer(serverCharacters, animate = true) {
  if (!serverCharacters) return;

  for (const key in serverCharacters) {
    // Skip local Player interpolation if currently controlling with WASD or in first person
    if (key === 'Player' && (isFirstPerson || isAnyMovementKeyPressed())) continue;

    const sChar = serverCharacters[key];
    const lChar = characters[key];
    if (!lChar || !sChar.position) continue;

    const sx = Number(sChar.position.x);
    const sy = Number(sChar.position.y);
    const sz = Number(sChar.position.z);

    const dx = Math.abs(lChar.targetPos.x - sx);
    const dy = Math.abs(lChar.targetPos.y - sy);
    const dz = Math.abs(lChar.targetPos.z - sz);

    if (dx > 0.05 || dy > 0.05 || dz > 0.05) {
      if (animate && isInitialStateLoaded) {
        applyCharacterMove(key, sx, sy, sz, sChar.lastCommand);
      } else {
        lChar.currentPos.set(sx, sy, sz);
        lChar.targetPos.set(sx, sy, sz);
        lChar.root.position.set(sx, sy, sz);
      }
    }
  }
  isInitialStateLoaded = true;
}

async function fetchCurrentState(animate = true) {
  try {
    const res = await fetch('/api/state', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data.characters) syncCharactersFromServer(data.characters, animate);
      if (data.worldObjects) syncWorldObjects(data.worldObjects);
      if (data.characterHands) {
        for (const k in data.characterHands) {
          if (characters[k]) {
            characters[k].handAction = data.characterHands[k].action;
            characters[k].heldObjectId = data.characterHands[k].heldObjectId;
          }
        }
      }
    }
  } catch (err) {}
}

fetchCurrentState(false);

setInterval(() => {
  fetchCurrentState(true);
}, 900);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) fetchCurrentState(true);
});

// SSE Live Stream
function initSSE() {
  try {
    const eventSource = new EventSource('/api/stream');

    const handleEventData = (rawData) => {
      try {
        const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
        if (data.characters) syncCharactersFromServer(data.characters, true);
        if (data.worldObjects) syncWorldObjects(data.worldObjects);
        if (data.who && data.where) {
          if (!(data.who === 'Player' && isFirstPerson)) {
            applyCharacterMove(data.who, data.where.x, data.where.y, data.where.z, data.command);
          }
        }
        if (data.type === 'chat' || (data.who && data.message)) {
          appendChatMessage(data.who, data.message, data.id);
          const char = characters[data.who];
          if (char) showSpeechBubble(char, data.message);
        }
        if (data.type === 'spawn' && data.id) {
          syncWorldObjects({ [data.id]: data });
        }
        if (data.type === 'hand' && data.who) {
          if (characters[data.who]) {
            characters[data.who].handAction = data.action;
            characters[data.who].heldObjectId = data.heldObjectId;
          }
          if (data.worldObjects) syncWorldObjects(data.worldObjects);
        }
        if (data.type === 'throw' || (data.velocity && data.objectId)) {
          if (data.who) showToast(`🚀 ${data.who} threw an object!`);
          if (data.worldObjects) syncWorldObjects(data.worldObjects);
        }
        if (data.type === 'physics' && data.worldObjects) {
          syncWorldObjects(data.worldObjects);
        }
        if (data.type === 'hit' || data.target) {
          triggerHitEffect(data.target, data.message);
        }
      } catch (err) {}
    };

    eventSource.onmessage = (e) => handleEventData(e.data);
    eventSource.addEventListener('init', (e) => handleEventData(e.data));
    eventSource.addEventListener('move', (e) => handleEventData(e.data));
    eventSource.addEventListener('chat', (e) => handleEventData(e.data));
    eventSource.addEventListener('spawn', (e) => handleEventData(e.data));
    eventSource.addEventListener('hand', (e) => handleEventData(e.data));
    eventSource.addEventListener('throw', (e) => handleEventData(e.data));
    eventSource.addEventListener('physics', (e) => handleEventData(e.data));
    eventSource.addEventListener('hit', (e) => handleEventData(e.data));
  } catch (err) {}
}
initSSE();

// --- UI Interaction: Sona Pills, Hands, Spawning, & Chat ---
const sonaPills = document.querySelectorAll('.sona-pill');
const dockHint = document.getElementById('dock-hint');
const chatInput = document.getElementById('chat-input');
const chatForm = document.getElementById('chat-form');

function selectSona(name) {
  selectedWho = name;
  sonaPills.forEach(p => {
    p.classList.toggle('active', p.dataset.who === name);
  });
  if (chatInput) chatInput.placeholder = `Chat as ${name}... (Press Enter to speak)`;
  if (dockHint) {
    dockHint.textContent = name === 'Player'
      ? 'Player is WASD first-person only | Click First Person to control'
      : `Click plane to move ${name} | Click objects to hold | Press Throw to launch`;
  }
}

sonaPills.forEach(pill => {
  pill.addEventListener('click', () => {
    selectSona(pill.dataset.who);
  });
});

// Chat Form
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  sendChatMessage(selectedWho, text);
  chatInput.value = '';
});

// Spawn Buttons
document.querySelectorAll('.spawn-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.type;
    sendSpawnRequest(selectedWho, type);
  });
});

// Hand Buttons
document.getElementById('btn-hand-wave').addEventListener('click', () => {
  sendHandAction(selectedWho, 'wave');
});

document.getElementById('btn-hand-up').addEventListener('click', () => {
  sendHandAction(selectedWho, 'handsup');
});

const btnHandThrow = document.getElementById('btn-hand-throw');
if (btnHandThrow) {
  btnHandThrow.addEventListener('click', () => {
    sendThrowRequest(selectedWho);
  });
}

document.getElementById('btn-hand-drop').addEventListener('click', () => {
  sendHandAction(selectedWho, 'drop');
});

// --- NEW CHARACTER: First-Person WASD Control Mode ---
let isFirstPerson = false;
let fpYaw = 0;
let fpPitch = 0;
const keysDown = {};
let lastPlayerSyncTime = 0;

function setFirstPersonMode(enable) {
  isFirstPerson = enable;
  const player = characters['Player'];

  if (isFirstPerson) {
    selectSona('Player');
    controls.enabled = false;
    fpHud.style.display = 'flex';
    fpCrosshair.style.display = 'block';
    btnToggleFp.classList.add('active');
    fpBtnText.textContent = 'Exit First Person (ESC)';

    // Completely hide Player's body and shadow so you cannot see your body in first person
    player.bodyRig.visible = false;
    player.shadowMesh.visible = false;
    showToast('Entered First Person. Use W, A, S, D to walk!');
  } else {
    controls.enabled = true;
    fpHud.style.display = 'none';
    fpCrosshair.style.display = 'none';
    btnToggleFp.classList.remove('active');
    fpBtnText.textContent = '🎮 First Person View';

    // Restore body visibility and reset camera to overview
    player.bodyRig.visible = true;
    player.shadowMesh.visible = true;
    camera.position.copy(DEFAULT_CAM_POS);
    controls.target.copy(DEFAULT_CAM_TARGET);
    showToast('Exited First Person to Overview.');
  }
}

btnToggleFp.addEventListener('click', () => {
  setFirstPersonMode(!isFirstPerson);
});

// Keyboard Listeners for WASD
window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  keysDown[e.code] = true;
  if (e.code === 'Escape' && isFirstPerson) {
    setFirstPersonMode(false);
  }
});

window.addEventListener('keyup', (e) => {
  keysDown[e.code] = false;
});

// Mouse Look in First Person
let isMouseDown = false;
window.addEventListener('mousedown', (e) => {
  if (e.target.closest('.interactive-dock') || e.target.closest('#chat-feed')) return;
  isMouseDown = true;
});

window.addEventListener('mouseup', () => {
  isMouseDown = false;
});

window.addEventListener('mousemove', (e) => {
  if (isFirstPerson && (isMouseDown || document.pointerLockElement === renderer.domElement)) {
    const sensitivity = 0.003;
    fpYaw -= e.movementX * sensitivity;
    fpPitch -= e.movementY * sensitivity;
    fpPitch = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, fpPitch));
  }
});

// --- Raycasting for Objects and Plane Click-to-Move ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('mousemove', (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

  if (!isFirstPerson) {
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(planeMesh);
    if (intersects.length > 0) {
      const pt = intersects[0].point;
      targetBeacon.position.set(pt.x, pt.y + 0.05, pt.z);
      targetBeacon.visible = true;
    } else {
      targetBeacon.visible = false;
    }
  }
});

renderer.domElement.addEventListener('click', (e) => {
  if (isFirstPerson) {
    const player = characters['Player'];
    // If player holds an object, throw it forward!
    if (player && player.heldObjectId) {
      sendThrowRequest('Player');
      return;
    }

    // In First Person: Click interacts with objects in center crosshair
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const objMeshes = Object.values(worldObjectMeshes);
    const hits = raycaster.intersectObjects(objMeshes, true);
    if (hits.length > 0) {
      let top = hits[0].object;
      while (top.parent && top.parent !== scene && !top.userData.id) {
        top = top.parent;
      }
      if (top.userData && top.userData.id) {
        sendHandAction('Player', 'hold', top.userData.id);
        showToast('Player holding object! Click again to throw.');
      }
    }
    return;
  }

  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  // 1. Check if clicked on a world object to hold it
  const objMeshes = Object.values(worldObjectMeshes);
  const objHits = raycaster.intersectObjects(objMeshes, true);
  if (objHits.length > 0) {
    let top = objHits[0].object;
    while (top.parent && top.parent !== scene && !top.userData.id) {
      top = top.parent;
    }
    if (top.userData && top.userData.id) {
      sendHandAction(selectedWho, 'hold', top.userData.id);
      showToast(`${selectedWho} picked up object!`);
      return;
    }
  }

  // 2. Check if clicked on a character to select them
  for (const key in characters) {
    const hits = raycaster.intersectObjects(characters[key].bodyRig.children, true);
    if (hits.length > 0) {
      selectSona(key);
      showToast(`Selected ${key}`);
      return;
    }
  }

  // 3. Click on ground plane to move selected character
  const groundHits = raycaster.intersectObject(planeMesh);
  if (groundHits.length > 0) {
    const pt = groundHits[0].point;
    const x = Math.round(pt.x * 10) / 10;
    const y = Math.round(pt.y * 10) / 10;
    const z = Math.round(pt.z * 10) / 10;
    const whereStr = `${x}, ${y}, ${z}`;
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
    tempVec.y += 2.85;

    tempVec.project(camera);

    // Hide if behind camera or in first person looking at self
    if (tempVec.z > 1 || (isFirstPerson && key === 'Player')) {
      char.labelEl.style.display = 'none';
      if (char.speechBubbleEl) char.speechBubbleEl.style.display = 'none';
      continue;
    }

    char.labelEl.style.display = 'flex';
    const screenX = (tempVec.x * halfW) + halfW;
    const screenY = -(tempVec.y * halfH) + halfH;
    char.labelEl.style.left = `${screenX}px`;
    char.labelEl.style.top = `${screenY}px`;

    char.coordBadgeEl.textContent = `[${char.currentPos.x.toFixed(1)}, ${char.currentPos.y.toFixed(1)}, ${char.currentPos.z.toFixed(1)}]`;

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

  // 1. Movement Controller (WASD for Player in both First Person AND Third Person Overview)
  const player = characters['Player'];
  let isPlayerActiveWASD = false;

  const moveVec = new THREE.Vector3();
  if (keysDown['KeyW'] || keysDown['ArrowUp']) moveVec.z -= 1;
  if (keysDown['KeyS'] || keysDown['ArrowDown']) moveVec.z += 1;
  if (keysDown['KeyA'] || keysDown['ArrowLeft']) moveVec.x -= 1;
  if (keysDown['KeyD'] || keysDown['ArrowRight']) moveVec.x += 1;

  if (isFirstPerson) {
    const moveSpeed = 14 * delta;
    if (moveVec.lengthSq() > 0) {
      isPlayerActiveWASD = true;
      moveVec.normalize();
      moveVec.applyAxisAngle(new THREE.Vector3(0, 1, 0), fpYaw);
      player.currentPos.addScaledVector(moveVec, moveSpeed);

      // Clamp to plane bounds and align with contoured terrain height
      player.currentPos.x = Math.max(-48, Math.min(48, player.currentPos.x));
      player.currentPos.z = Math.max(-48, Math.min(48, player.currentPos.z));
      player.currentPos.y = getTerrainHeight(player.currentPos.x, player.currentPos.z);
      player.targetPos.copy(player.currentPos);
      player.root.position.copy(player.currentPos);

      // Walk bobbing
      player.walkCycle += delta * 12;
      player.bodyRig.position.y = Math.abs(Math.sin(player.walkCycle)) * 0.15;

      // Throttle live sync to server (every 120ms while walking)
      if (Date.now() - lastPlayerSyncTime > 120) {
        lastPlayerSyncTime = Date.now();
        fetch('/api/player/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            Where: `${player.currentPos.x.toFixed(1)}, ${player.currentPos.y.toFixed(1)}, ${player.currentPos.z.toFixed(1)}`,
            rotationY: fpYaw
          })
        }).catch(() => {});
      }
    }

    // Camera placed at eye level
    player.bodyRig.rotation.y = fpYaw;
    camera.position.set(
      player.currentPos.x,
      player.currentPos.y + 1.95 + (Math.sin(player.walkCycle) * 0.05),
      player.currentPos.z
    );

    const lookTarget = new THREE.Vector3(
      camera.position.x - Math.sin(fpYaw) * Math.cos(fpPitch),
      camera.position.y + Math.sin(fpPitch),
      camera.position.z - Math.cos(fpYaw) * Math.cos(fpPitch)
    );
    camera.lookAt(lookTarget);

    // Completely hide body in first person
    player.bodyRig.visible = false;
    player.shadowMesh.visible = false;
  } else {
    controls.update();

    // Overview Mode: WASD moves Player directly across the terrain!
    if (moveVec.lengthSq() > 0) {
      isPlayerActiveWASD = true;
      moveVec.normalize();

      // Camera horizontal forward and right vectors
      const camForward = new THREE.Vector3();
      camera.getWorldDirection(camForward);
      camForward.y = 0;
      camForward.normalize();

      const camRight = new THREE.Vector3();
      camRight.crossVectors(camForward, new THREE.Vector3(0, 1, 0)).normalize();

      const worldMoveDir = new THREE.Vector3()
        .addScaledVector(camForward, -moveVec.z)
        .addScaledVector(camRight, moveVec.x)
        .normalize();

      const moveSpeed = 13.5 * delta;
      player.currentPos.addScaledVector(worldMoveDir, moveSpeed);

      player.currentPos.x = Math.max(-48, Math.min(48, player.currentPos.x));
      player.currentPos.z = Math.max(-48, Math.min(48, player.currentPos.z));
      player.currentPos.y = getTerrainHeight(player.currentPos.x, player.currentPos.z);
      player.targetPos.copy(player.currentPos);
      player.root.position.copy(player.currentPos);
      player.isMoving = true;

      // Smoothly rotate Player towards movement direction
      const targetAngle = Math.atan2(worldMoveDir.x, worldMoveDir.z);
      let diff = targetAngle - player.bodyRig.rotation.y;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      player.bodyRig.rotation.y += diff * 0.22;

      // Walk bobbing & hand swinging
      player.walkCycle += delta * 14;
      player.bodyRig.position.y = Math.abs(Math.sin(player.walkCycle)) * 0.35;
      player.leftHand.position.z = Math.sin(player.walkCycle) * 0.45;
      player.rightHand.position.z = -Math.sin(player.walkCycle) * 0.45;

      // Keep held object anchored to player
      if (player.heldObjectId && worldObjects[player.heldObjectId]) {
        const mesh = worldObjectMeshes[player.heldObjectId];
        if (mesh) {
          const rad = player.bodyRig.rotation.y;
          mesh.position.set(
            player.currentPos.x + Math.sin(rad) * 0.85,
            player.currentPos.y + 1.25 + Math.sin(time * 3) * 0.05,
            player.currentPos.z + Math.cos(rad) * 0.85
          );
        }
      }

      if (Date.now() - lastPlayerSyncTime > 120) {
        lastPlayerSyncTime = Date.now();
        fetch('/api/player/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            Where: `${player.currentPos.x.toFixed(1)}, ${player.currentPos.y.toFixed(1)}, ${player.currentPos.z.toFixed(1)}`,
            rotationY: player.bodyRig.rotation.y
          })
        }).catch(() => {});
      }
    }
  }

  // 2. Animate Characters & Hand Actions
  for (const key in characters) {
    const char = characters[key];

    // Distance to movement target (if not active WASD player)
    if (!(key === 'Player' && (isFirstPerson || isPlayerActiveWASD))) {
      const dist = char.currentPos.distanceTo(char.targetPos);
      if (dist > 0.05) {
        char.isMoving = true;
        const dir = new THREE.Vector3().subVectors(char.targetPos, char.currentPos).normalize();
        const targetAngle = Math.atan2(dir.x, dir.z);
        let diff = targetAngle - char.bodyRig.rotation.y;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        char.bodyRig.rotation.y += diff * 0.15;

        const step = Math.min(dist, char.speed * delta);
        char.currentPos.addScaledVector(dir, step);
        char.currentPos.y = getTerrainHeight(char.currentPos.x, char.currentPos.z);
        char.root.position.copy(char.currentPos);

        char.walkCycle += delta * 14;
        char.bodyRig.position.y = Math.abs(Math.sin(char.walkCycle)) * 0.35;
        char.leftHand.position.z = Math.sin(char.walkCycle) * 0.45;
        char.rightHand.position.z = -Math.sin(char.walkCycle) * 0.45;
      } else {
        if (char.isMoving) {
          char.isMoving = false;
          char.currentPos.copy(char.targetPos);
          char.currentPos.y = getTerrainHeight(char.currentPos.x, char.currentPos.z);
          char.root.position.copy(char.currentPos);
        }
        const idleOffset = key === 'Sam' ? 0 : key === 'Cam' ? 2 : key === 'Evil Sam' ? 4 : 6;
        char.bodyRig.position.y = Math.sin(time * 2.2 + idleOffset) * 0.08;
      }
    }

    // Hand Actions Animation
    if (char.heldObjectId && worldObjects[char.heldObjectId]) {
      // Holding an object: hands reach forward together
      char.leftHand.position.set(-0.45, 1.2, 0.7);
      char.rightHand.position.set(0.45, 1.2, 0.7);

      // Attached object floats between their hands
      const mesh = worldObjectMeshes[char.heldObjectId];
      if (mesh) {
        const rad = char.bodyRig.rotation.y;
        mesh.position.set(
          char.currentPos.x + Math.sin(rad) * 0.85,
          char.currentPos.y + 1.25 + Math.sin(time * 3) * 0.05,
          char.currentPos.z + Math.cos(rad) * 0.85
        );
        mesh.rotation.y += delta * 1.5;
      }
    } else if (char.handAction === 'throw') {
      // Throw gesture thrust
      char.rightHand.position.set(0.45, 1.6, 1.1);
      char.leftHand.position.set(-0.55, 1.1, 0.2);
    } else if (char.handAction === 'wave') {
      // Waving hand
      char.rightHand.position.set(0.85, 2.15, 0.2);
      char.rightHand.position.x = 0.85 + Math.sin(time * 10) * 0.3;
      char.leftHand.position.set(-0.95, 1.15, 0);
    } else if (char.handAction === 'handsup') {
      // Both hands up
      char.leftHand.position.set(-0.75, 2.5, 0);
      char.rightHand.position.set(0.75, 2.5, 0);
    } else if (!char.isMoving && !(isFirstPerson && key === 'Player')) {
      // Idle float hands
      const idleOffset = key === 'Sam' ? 0 : 2;
      char.leftHand.position.y = 1.15 + Math.sin(time * 2.5 + idleOffset) * 0.06;
      char.rightHand.position.y = 1.15 + Math.cos(time * 2.5 + idleOffset) * 0.06;
      char.leftHand.position.z = 0;
      char.rightHand.position.z = 0;
    }

    // Articulated finger animations for both hands
    const currentAction = char.heldObjectId ? 'hold' : char.handAction;
    animateFingers(char.leftHand, currentAction, time, char.isMoving);
    animateFingers(char.rightHand, currentAction, time, char.isMoving);
  }

  // 3. Subtle floating rotation and terrain grounding for unheld world objects
  for (const id in worldObjects) {
    const objData = worldObjects[id];
    if (!objData.heldBy && worldObjectMeshes[id]) {
      const mesh = worldObjectMeshes[id];
      mesh.rotation.y += delta * 0.8;
      const groundY = getTerrainHeight(objData.position?.x || 0, objData.position?.z || 0) + 0.35;
      const targetY = Math.max(groundY, objData.position?.y || groundY);
      mesh.position.set(
        objData.position?.x || 0,
        targetY + (objData.velocity ? 0 : Math.sin(time * 2 + id.charCodeAt(id.length - 1)) * 0.05),
        objData.position?.z || 0
      );
    }
  }

  // 4. Update 2D overhead labels
  updateOverheadLabels();

  // 5. Render Scene
  renderer.render(scene, camera);
}

animate();

// Window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
