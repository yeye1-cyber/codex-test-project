import * as THREE from "https://unpkg.com/three@0.165.0/build/three.module.js";

// Core renderer + scene setup.
const canvas = document.getElementById("scene");
const scene = new THREE.Scene();
scene.background = new THREE.Color("#90a6bb");
scene.fog = new THREE.FogExp2("#aebfd0", 0.009);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(0, 1.7, 18);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Lighting tuned for soft, painterly mood.
const ambientLight = new THREE.AmbientLight("#95b6ff", 0.58);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight("#dce8ff", "#102133", 0.6);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight("#d3ddff", 0.55);
sunLight.position.set(10, 16, 6);
scene.add(sunLight);

const worldRoot = new THREE.Group();
scene.add(worldRoot);

const clock = new THREE.Clock();
const player = {
  speed: 6,
  eyeHeight: 1.7,
  yaw: 0,
  pitch: 0,
  velocity: new THREE.Vector3(),
};

const controls = {
  forward: false,
  backward: false,
  left: false,
  right: false,
};

const collisionObjects = [];
let triggerZones = [];
let pathGuide = null;

const overlay = document.getElementById("overlay");
const emotionForm = document.getElementById("emotion-form");
const emotionInput = document.getElementById("emotion-input");
const poemBox = document.getElementById("poem");

const emotionPresets = {
  anxiety: {
    fogDensity: 0.017,
    fogColor: "#8f9db0",
    ambient: "#7788a9",
    sky: "#141a24",
    sun: "#c9d2ef",
    terrainScale: 2.2,
    mountainCount: 45,
    mountainHeight: [8, 24],
    openWater: false,
    pathWidth: 3,
    triggerPoems: [
      "Edges rise like unspoken thoughts.",
      "Breath narrows between stone and mist.",
      "A steep silence leans against your chest.",
    ],
  },
  calm: {
    fogDensity: 0.0085,
    fogColor: "#c3d0db",
    ambient: "#d7eeff",
    sky: "#8ab6d6",
    sun: "#fff5dd",
    terrainScale: 0.6,
    mountainCount: 12,
    mountainHeight: [2, 8],
    openWater: true,
    pathWidth: 12,
    triggerPoems: [
      "The horizon exhales with you.",
      "Water keeps no memory of weight.",
      "Light drifts slowly over still ground.",
    ],
  },
  loneliness: {
    fogDensity: 0.012,
    fogColor: "#9baebe",
    ambient: "#b7cce2",
    sky: "#3e5a70",
    sun: "#dce8f7",
    terrainScale: 1.1,
    mountainCount: 8,
    mountainHeight: [4, 11],
    openWater: false,
    pathWidth: 4,
    triggerPoems: [
      "One footstep, then the waiting sky.",
      "Distance turns sound into silver thread.",
      "A single path keeps unfolding forward.",
    ],
  },
};

function getPreset(rawEmotion) {
  const key = rawEmotion.toLowerCase().trim();
  if (emotionPresets[key]) return emotionPresets[key];

  // Fall back to the nearest mood through simple keyword matching.
  if (/(stress|fear|panic|worry|tense)/.test(key)) return emotionPresets.anxiety;
  if (/(peace|focus|gentle|joy|relief)/.test(key)) return emotionPresets.calm;
  if (/(sad|empty|isolated|alone|grief)/.test(key)) return emotionPresets.loneliness;
  return emotionPresets.calm;
}

function clearWorld() {
  collisionObjects.length = 0;
  triggerZones = [];
  if (pathGuide) {
    worldRoot.remove(pathGuide);
    pathGuide.geometry.dispose();
    pathGuide.material.dispose();
    pathGuide = null;
  }

  while (worldRoot.children.length) {
    const child = worldRoot.children.pop();
    worldRoot.remove(child);
    child.traverse?.((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
  }
}

function createGround(preset) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(320, 320, 1, 1),
    new THREE.MeshStandardMaterial({ color: preset.openWater ? "#365f80" : "#2f4356", roughness: 0.92 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  worldRoot.add(ground);

  if (preset.openWater) {
    const lake = new THREE.Mesh(
      new THREE.CircleGeometry(85, 80),
      new THREE.MeshStandardMaterial({
        color: "#7ab8da",
        transparent: true,
        opacity: 0.72,
        roughness: 0.4,
        metalness: 0.15,
      })
    );
    lake.rotation.x = -Math.PI / 2;
    lake.position.y = 0.04;
    worldRoot.add(lake);
  }
}

function createMountains(preset) {
  const coneGeometry = new THREE.ConeGeometry(1, 1, 5);
  const mountainMaterial = new THREE.MeshStandardMaterial({ color: "#50637a", roughness: 0.95, flatShading: true });

  for (let i = 0; i < preset.mountainCount; i += 1) {
    const mesh = new THREE.Mesh(coneGeometry.clone(), mountainMaterial.clone());
    const height = THREE.MathUtils.randFloat(preset.mountainHeight[0], preset.mountainHeight[1]);
    const radius = THREE.MathUtils.randFloat(1.4, 4.5) * preset.terrainScale;

    mesh.geometry.scale(radius, height, radius);

    const isNearPath = Math.abs(i % 2 === 0 ? THREE.MathUtils.randFloatSpread(16) : THREE.MathUtils.randFloatSpread(6));
    const xOffset = THREE.MathUtils.randFloatSpread(130);
    const zOffset = THREE.MathUtils.randFloatSpread(130);

    // Carve a walkable corridor by pushing some mountains away from center line.
    mesh.position.set(
      xOffset + Math.sign(xOffset || 1) * (isNearPath < preset.pathWidth ? preset.pathWidth * 2 : 0),
      height * 0.48,
      zOffset
    );

    mesh.rotation.y = Math.random() * Math.PI;
    mesh.material.color.setHSL(0.57, 0.2, THREE.MathUtils.randFloat(0.3, 0.55));

    worldRoot.add(mesh);
    collisionObjects.push({ position: mesh.position.clone(), radius: radius * 0.72 });
  }
}

function createPath(preset) {
  // Single atmospheric path line gives orientation, especially for loneliness.
  const pathGeometry = new THREE.PlaneGeometry(preset.pathWidth, 180);
  const pathMaterial = new THREE.MeshStandardMaterial({
    color: preset.openWater ? "#d9ebf2" : "#9eb8c9",
    transparent: true,
    opacity: preset.openWater ? 0.28 : 0.2,
    roughness: 1,
  });

  pathGuide = new THREE.Mesh(pathGeometry, pathMaterial);
  pathGuide.rotation.x = -Math.PI / 2;
  pathGuide.position.y = 0.06;
  pathGuide.position.z = -4;
  worldRoot.add(pathGuide);
}

function createFogSheets() {
  const fogGroup = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: "#d2dcf1", transparent: true, opacity: 0.09, depthWrite: false });

  for (let i = 0; i < 8; i += 1) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(120, 12), mat.clone());
    strip.position.set(THREE.MathUtils.randFloatSpread(60), THREE.MathUtils.randFloat(2.5, 8), -40 + i * 15);
    strip.rotation.y = THREE.MathUtils.randFloat(-0.3, 0.3);
    fogGroup.add(strip);
  }

  worldRoot.add(fogGroup);
}

function createTriggerZones(preset) {
  const zonePositions = [
    new THREE.Vector3(0, 0, -34),
    new THREE.Vector3(16, 0, -65),
    new THREE.Vector3(-18, 0, -95),
  ];

  triggerZones = zonePositions.map((pos, idx) => ({
    center: pos,
    radius: 6,
    text: preset.triggerPoems[idx % preset.triggerPoems.length],
    activated: false,
  }));
}

function applyAtmosphere(preset) {
  scene.background.set(preset.sky);
  scene.fog.color.set(preset.fogColor);
  scene.fog.density = preset.fogDensity;
  ambientLight.color.set(preset.ambient);
  sunLight.color.set(preset.sun);
}

function generateLandscape(emotion) {
  const preset = getPreset(emotion);
  clearWorld();
  applyAtmosphere(preset);
  createGround(preset);
  createPath(preset);
  createMountains(preset);
  createFogSheets();
  createTriggerZones(preset);
}

function showPoem(text) {
  poemBox.textContent = text;
  poemBox.classList.remove("hidden");
  clearTimeout(showPoem.timeoutId);
  showPoem.timeoutId = setTimeout(() => {
    poemBox.classList.add("hidden");
  }, 3200);
}
showPoem.timeoutId = null;

function checkTriggers() {
  for (const zone of triggerZones) {
    if (zone.activated) continue;
    const distance = camera.position.distanceTo(zone.center);
    if (distance <= zone.radius) {
      zone.activated = true;
      showPoem(zone.text);
    }
  }
}

function resolveCollisions() {
  const padding = 1.2;
  const temp2D = new THREE.Vector2(camera.position.x, camera.position.z);

  for (const obstacle of collisionObjects) {
    const obstacle2D = new THREE.Vector2(obstacle.position.x, obstacle.position.z);
    const distance = temp2D.distanceTo(obstacle2D);
    const limit = obstacle.radius + padding;

    if (distance < limit) {
      const pushDir = temp2D.clone().sub(obstacle2D).normalize();
      const overlap = limit - distance;
      camera.position.x += pushDir.x * overlap;
      camera.position.z += pushDir.y * overlap;
      temp2D.set(camera.position.x, camera.position.z);
    }
  }

  // Keep player inside world bounds.
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -145, 145);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -145, 145);
  camera.position.y = player.eyeHeight;
}

function updatePlayer(delta) {
  const forward = new THREE.Vector3(Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right = new THREE.Vector3(forward.z, 0, -forward.x);

  player.velocity.set(0, 0, 0);

  if (controls.forward) player.velocity.add(forward);
  if (controls.backward) player.velocity.sub(forward);
  if (controls.right) player.velocity.add(right);
  if (controls.left) player.velocity.sub(right);

  if (player.velocity.lengthSq() > 0) {
    player.velocity.normalize().multiplyScalar(player.speed * delta);
    camera.position.add(player.velocity);
  }

  resolveCollisions();
  checkTriggers();
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);

  updatePlayer(delta);
  renderer.render(scene, camera);
}

function onPointerMove(event) {
  if (document.pointerLockElement !== canvas) return;

  const sensitivity = 0.0022;
  player.yaw -= event.movementX * sensitivity;
  player.pitch -= event.movementY * sensitivity;
  player.pitch = THREE.MathUtils.clamp(player.pitch, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);

  camera.rotation.set(player.pitch, player.yaw, 0, "YXZ");
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener("resize", onResize);
window.addEventListener("mousemove", onPointerMove);
window.addEventListener("keydown", (event) => {
  if (event.code === "KeyW") controls.forward = true;
  if (event.code === "KeyS") controls.backward = true;
  if (event.code === "KeyA") controls.left = true;
  if (event.code === "KeyD") controls.right = true;
});
window.addEventListener("keyup", (event) => {
  if (event.code === "KeyW") controls.forward = false;
  if (event.code === "KeyS") controls.backward = false;
  if (event.code === "KeyA") controls.left = false;
  if (event.code === "KeyD") controls.right = false;
});

canvas.addEventListener("click", () => {
  canvas.requestPointerLock();
  overlay.classList.add("hidden");
});

emotionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const emotion = emotionInput.value.trim();
  if (!emotion) return;
  generateLandscape(emotion);
  triggerZones.forEach((z) => (z.activated = false));
  overlay.classList.add("hidden");
});

// Initial mood.
generateLandscape("calm");
animate();
