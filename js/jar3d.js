/* ============================================
   Ahluwalia Farm — scroll-driven 3D honey jar
   One GLB jar travels from the Multiflora slot (right) to the
   Mustard slot (left), turning a full 360° on the way.
   The label image is swapped at the half-turn, when only the
   plain honey back faces the viewer.
   ============================================ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const section = document.getElementById('jar-journey');
const canvas = document.getElementById('jar-canvas');
const slotA = document.getElementById('jar-slot-a');
const slotB = document.getElementById('jar-slot-b');

const JAR_URL = 'assets/3d/Multiflora_1kg_jar.glb';
const LABELS = {
  'multiflora': 'assets/3d/labels/multiflora-1kg.jpg',
  'mustard': 'assets/3d/labels/mustard-1kg.jpg',
};
const FROM = 'multiflora';
const TO = 'mustard';

// ?nosmooth disables easing (used for automated screenshots)
const SMOOTH = new URLSearchParams(location.search).has('nosmooth') ? 1 : 0.18;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) {
    return false;
  }
}

if (section && canvas && slotA && slotB && !reduceMotion && webglAvailable()) {
  init().catch((err) => {
    // Leave the static jar photos in place if anything fails.
    console.warn('[jar3d] 3D jar disabled:', err);
    section.classList.remove('is-3d');
  });
}

async function init() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;   // keep label colours true to the artwork
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  const key = new THREE.DirectionalLight(0xfff3e0, 1.25);
  key.position.set(-2, 3, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffd59a, 0.9);
  rim.position.set(3, 2, -3);
  scene.add(rim);

  const FOV = 28;
  const DIST = 10;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, DIST);

  // Load textures and the jar in parallel
  const texLoader = new THREE.TextureLoader();
  const loadTex = (url) => new Promise((res, rej) => texLoader.load(url, (t) => {
    t.flipY = false;                       // glTF UV convention
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    res(t);
  }, undefined, rej));

  const [gltf, texFrom, texTo] = await Promise.all([
    new GLTFLoader().loadAsync(JAR_URL),
    loadTex(LABELS[FROM]),
    loadTex(LABELS[TO]),
  ]);

  const jar = gltf.scene;
  let labelMat = null;
  jar.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (!m) return;
    m.envMapIntensity = 0.55;
    if (o.name.startsWith('Label') || m.name === 'Label') {
      labelMat = m;
      m.envMapIntensity = 0.25;
      m.roughness = 0.6;
      m.clearcoat = 0.0;
    }
    if (m.name === 'Glass') {
      m.transparent = true;
      m.thickness = 0.02;
      m.envMapIntensity = 0.9;
    }
    if (m.name.startsWith('Honey')) {
      m.color.set('#5a1a06');             // deep reddish amber, like the real jar
      m.roughness = 0.12;
      m.clearcoat = 0.4;
    }
    if (m.name === 'GoldCap') {
      m.color.set('#b08a3e');
      m.roughness = 0.32;
      m.envMapIntensity = 1.0;
    }
  });
  if (!labelMat) throw new Error('label mesh not found in GLB');
  labelMat.map = texFrom;
  labelMat.needsUpdate = true;

  // Centre the jar on its own vertical middle and normalise its height to 1 unit
  const box = new THREE.Box3().setFromObject(jar);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  jar.position.sub(centre);
  const pivot = new THREE.Group();          // spins around the jar's own axis
  pivot.add(jar);
  const mover = new THREE.Group();          // travels along the curve
  mover.add(pivot);
  const baseScale = 1 / size.y;
  scene.add(mover);

  section.classList.add('is-3d');

  // ---------- layout helpers ----------
  let vw = window.innerWidth;
  let vh = window.innerHeight;

  function resize() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    renderer.setSize(vw, vh, false);
    camera.aspect = vw / vh;
    camera.updateProjectionMatrix();
    requestFrame();
  }

  // world units per CSS pixel at z = 0
  function unitsPerPx() {
    return (2 * DIST * Math.tan(THREE.MathUtils.degToRad(FOV / 2))) / vh;
  }

  function slotInfo(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height };
  }

  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // Scroll progress: 0 while Multiflora's jar slot is above the viewport centre line,
  // 1 once Mustard's slot reaches it.
  function targetProgress() {
    const a = slotA.getBoundingClientRect();
    const b = slotB.getBoundingClientRect();
    const mid = vh / 2;
    const start = a.top + a.height / 2;     // slot A centre
    const end = b.top + b.height / 2;       // slot B centre
    const span = end - start;
    if (span <= 0) return 0;
    return clamp01((mid - start) / span);
  }

  let progress = targetProgress();
  let showingTo = false;
  let inView = false;
  let rafId = 0;

  const REST_A = -0.32;                     // slight turn so the jar reads as 3D
  const REST_B = 0.32;

  function frame() {
    rafId = 0;
    const target = targetProgress();
    progress += (target - progress) * SMOOTH;  // gentle smoothing
    if (Math.abs(target - progress) < 0.0005) progress = target;

    const e = ease(progress);
    const A = slotInfo(slotA);
    const B = slotInfo(slotB);

    // Screen position: blend between the two live slot centres along an S-curve
    const sx = A.x + (B.x - A.x) * e;
    const sy = A.y + (B.y - A.y) * e;
    const arc = Math.sin(Math.PI * e);       // 0 → 1 → 0
    const u = unitsPerPx();
    mover.position.set((sx - vw / 2) * u, -(sy - vh / 2) * u, arc * 1.2);

    // Size follows the slot height, with a small lift in the middle of the journey
    const slotH = A.h + (B.h - A.h) * e;
    const s = slotH * 0.86 * u * baseScale;
    pivot.scale.setScalar(s);
    pivot.rotation.x = 0.08 + arc * 0.06;
    pivot.rotation.z = -arc * 0.12 * (B.x < A.x ? 1 : -1);

    // Full turn: REST_A → REST_A + 2π (+ settle to REST_B)
    const angle = REST_A + e * (Math.PI * 2 + (REST_B - REST_A));
    pivot.rotation.y = angle;

    // Swap the label exactly at the half-turn, when the back faces the viewer
    const wantTo = angle > Math.PI;
    if (wantTo !== showingTo) {
      labelMat.map = wantTo ? texTo : texFrom;
      labelMat.needsUpdate = true;
      showingTo = wantTo;
    }

    renderer.render(scene, camera);

    if (inView && progress !== target) requestFrame();
  }

  function requestFrame() {
    if (!rafId) rafId = requestAnimationFrame(frame);
  }

  const io = new IntersectionObserver((entries) => {
    inView = entries[0].isIntersecting;
    section.classList.toggle('in-view', inView);
    if (inView) requestFrame();
  }, { threshold: 0 });
  io.observe(section);

  window.addEventListener('scroll', () => { if (inView) requestFrame(); }, { passive: true });
  window.addEventListener('resize', resize);
  resize();
}
