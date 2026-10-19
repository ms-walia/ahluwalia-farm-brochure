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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const section = document.getElementById('jar-journey');
const canvas = document.getElementById('jar-canvas');
const slots = section ? [...section.querySelectorAll('.journey-slot')] : [];
const rows = slots.map((el) => el.closest('.journey-row'));
const KEYS = rows.map((r) => r.dataset.variety);
const introRow = document.getElementById('journey-intro');
const introSlot = document.getElementById('jar-slot-intro');
const combSlot = document.getElementById('comb-slot');
const HAS_INTRO = !!(introRow && introSlot);
const COMB_URL = 'assets/3d/corner_comb.glb';
const BEE_URL = 'assets/3d/bee.glb';
const DROP_URL = 'assets/3d/droplet.glb';
const introInner = document.getElementById('journey-intro-inner');

// Honey look per variety (blended while the jar spins between cards)
const HONEY = {
  'multiflora':      { c: '#7b3a0d', em: '#3a1503', ei: 0.5,  op: 0.93,  rough: 0.06, cc: 1.0, glow: 0.45, gc: [1.0, 0.55, 0.12], cloud: 0 },
  'mustard':         { c: '#e6cc8e', em: '#6a5320', ei: 0.22, op: 0.99,  rough: 0.42, cc: 0.4, glow: 0.08, gc: [1.0, 0.92, 0.65], cloud: 1 },
  'kashmiri-acacia': { c: '#e2a53a', em: '#a0560a', ei: 0.4,  op: 0.8,   rough: 0.04, cc: 1.0, glow: 0.65, gc: [1.0, 0.7, 0.2],   cloud: 0 },
  'ajwain':          { c: '#b5650f', em: '#6e2c03', ei: 0.4,  op: 0.9,   rough: 0.06, cc: 1.0, glow: 0.5,  gc: [1.0, 0.58, 0.12], cloud: 0 },
  'jamun':           { c: '#5a210a', em: '#2a0c02', ei: 0.5,  op: 0.95,  rough: 0.07, cc: 1.0, glow: 0.32, gc: [1.0, 0.45, 0.15], cloud: 0 },
};

const JAR_URL = 'assets/3d/Multiflora_1kg_jar.glb';
const LABELS = {
  'multiflora': 'assets/3d/labels/multiflora-1kg.jpg',
  'mustard': 'assets/3d/labels/mustard-1kg.jpg',
  'kashmiri-acacia': 'assets/3d/labels/kashmiri-acacia-1kg.jpg',
  'ajwain': 'assets/3d/labels/ajwain-1kg.jpg',
  'jamun': 'assets/3d/labels/jamun-1kg.jpg',
};

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

if (section && canvas && slots.length > 1 && !reduceMotion && webglAvailable()) {
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

  const opt = (url) => (HAS_INTRO ? new GLTFLoader().loadAsync(url).catch(() => null) : null);
  const [gltf, combGltf, beeGltf, dropGltf, ...tex] = await Promise.all([
    new GLTFLoader().loadAsync(JAR_URL),
    opt(COMB_URL), opt(BEE_URL), opt(DROP_URL),
    ...KEYS.map((k) => loadTex(LABELS[k])),
  ]);

  const jar = gltf.scene;
  renderer.localClippingEnabled = true;

  // ---- jar dimensions (GLB units = metres, Y up) ----
  const FILL_Y = 0.100;          // honey surface: middle of the upper glass bulge
  const HONEY_HALF = 0.041;      // inner half-width of the honey at that height
  const GLASS_WALL = 0.0026;     // honey pushed out by the modelled wall thickness
  const HONEY_R = 0.0072 + GLASS_WALL;  // corner radius of the honey surface

  // Keep only the outward-facing triangles of the glass shell (drops the inner wall)
  function outerShellOnly(geo) {
    const g = geo.index ? geo : geo.clone();
    const pos = g.attributes.position;
    const idx = g.index ? g.index.array : [...Array(pos.count).keys()];
    g.computeBoundingBox();
    const yc = (g.boundingBox.min.y + g.boundingBox.max.y) / 2;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const n = new THREE.Vector3(), ctr = new THREE.Vector3();
    const keep = [];
    for (let i = 0; i < idx.length; i += 3) {
      a.fromBufferAttribute(pos, idx[i]); b.fromBufferAttribute(pos, idx[i + 1]); c.fromBufferAttribute(pos, idx[i + 2]);
      n.subVectors(c, b).cross(ctr.subVectors(a, b));
      ctr.addVectors(a, b).add(c).divideScalar(3); ctr.y -= yc;
      if (n.dot(ctr) > 0) keep.push(idx[i], idx[i + 1], idx[i + 2]);
    }
    const out = g.clone();
    out.setIndex(keep);
    return out;
  }

  // Neck: turn the thread ring into a real helix (its end step shows the turn) and give the
  // glass a slight hand-made unevenness so highlights travel round as the jar spins
  const NECK_Y0 = 0.1185, NECK_K = 0.5;
  const NECK_DROP = (0.134 - NECK_Y0) * (1 - NECK_K);   // how much lower the rim (and the closed cap) sit
  function neckDetail(geo) {
    const p = geo.attributes.position, n = geo.attributes.normal;
    const PITCH = 0.0024;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (y < 0.104) continue;
      const th = Math.atan2(z, x);                  // -π..π
      if (y > 0.1155 && y < 0.1205 && Math.hypot(x, z) < 0.0416) {
        p.setY(i, y + PITCH * (th / (2 * Math.PI)));
      }
      // shorter neck: squash everything above the shoulder
      if (y > NECK_Y0) p.setY(i, NECK_Y0 + (p.getY(i) - NECK_Y0) * NECK_K);
      const w = 0.07 * Math.sin(th * 5 + 1.3) + 0.05 * Math.sin(th * 11 + 0.4) + 0.04 * Math.sin(th * 3 + y * 900);
      n.setXYZ(i, n.getX(i) - Math.sin(th) * w, n.getY(i) + w * 0.4, n.getZ(i) + Math.cos(th) * w);
    }
    n.needsUpdate = true; p.needsUpdate = true;
    geo.computeBoundingBox(); geo.computeBoundingSphere();
    return geo;
  }

  // Move every vertex out along its normal (honey meets the outer glass)
  function pushOut(geo, d) {
    const out = geo.clone();
    const p = out.attributes.position, nr = out.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(i, p.getX(i) + nr.getX(i) * d, p.getY(i) + nr.getY(i) * d, p.getZ(i) + nr.getZ(i) * d);
    }
    out.computeBoundingBox(); out.computeBoundingSphere();
    return out;
  }

  // Honey surface clipping plane (world space, updated every frame)
  const honeyPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);

  // Translucent golden honey (light passes through, like the real jar)
  const honeyMat = new THREE.MeshPhysicalMaterial({
    name: 'HoneyLive',
    // No transmission: the canvas is transparent, so refraction would only see black and turn the
    // honey brown. Instead: amber body, a little see-through, glowing gold where the light passes
    // through thin edges, deeper in the middle.
    color: new THREE.Color('#a85a0c'),
    emissive: new THREE.Color('#6e2c03'),
    emissiveIntensity: 0.4,
    transparent: true,
    opacity: 0.9,
    roughness: 0.06,
    ior: 1.5,
    specularIntensity: 1,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 0.9,
    
  });

  const glowU = { uGlowAmt: { value: 0.45 }, uGlowCol: { value: new THREE.Color(1, 0.55, 0.12) } };
  const honeyGlow = (sh) => {
    sh.uniforms.uGlowAmt = glowU.uGlowAmt; sh.uniforms.uGlowCol = glowU.uGlowCol;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlowAmt; uniform vec3 uGlowCol;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float rim = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
      totalEmissiveRadiance += uGlowCol * (0.03 + pow(rim, 2.0) * uGlowAmt);`);
  };
  // ---- flowing honey surface: shared wave + meniscus height field (surface-local metres) ----
  const SURF_HALF = HONEY_HALF + GLASS_WALL;
  const waveU = { uTime: { value: 0 }, uSlosh: { value: 0 }, uSurfInv: { value: new THREE.Matrix4() } };
  const WAVE_GLSL = `
    uniform float uTime; uniform float uSlosh;
    float sdRB(vec2 p, float b, float r){ vec2 q = abs(p) - vec2(b - r); return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
    float honeyH(vec2 p){
      float d = max(-sdRB(p, ${SURF_HALF.toFixed(5)}, ${HONEY_R.toFixed(5)}), 0.0);
      float men = 0.0016 * exp(-d / 0.0022);              // honey creeps up the glass
      float a = 0.00006 + 0.0011 * uSlosh;                 // slow, heavy waves while it moves
      float w = sin(p.x * 95.0 + uTime * 1.3) * 0.55
              + sin(p.y * 72.0 - uTime * 0.95 + 1.7) * 0.35
              + sin((p.x - p.y) * 140.0 + uTime * 1.9) * 0.2;
      return men + a * w;
    }`;
  honeyMat.onBeforeCompile = (sh) => {
    honeyGlow(sh);
    sh.uniforms.uTime = waveU.uTime; sh.uniforms.uSlosh = waveU.uSlosh; sh.uniforms.uSurfInv = waveU.uSurfInv;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvHW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHW; uniform mat4 uSurfInv;' + WAVE_GLSL)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        vec3 hp = (uSurfInv * vec4(vHW, 1.0)).xyz;
        if (hp.y > honeyH(hp.xz)) discard;`);
  };
  honeyMat.customProgramCacheKey = () => 'honeyBody';

  // Glossy clear glass
  const glassMat = new THREE.MeshPhysicalMaterial({
    name: 'GlassLive',
    color: 0xffffff,
    transparent: true,
    opacity: 0.05,                // nearly invisible face-on…
    roughness: 0.03,              // glossy
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.9,
    side: THREE.DoubleSide,       // near and far wall, each a single thin layer
    depthWrite: false,
  });
  // …brighter at the edges and wherever a highlight lands, like real glass
  glassMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vGY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGY = position.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGY;')
      .replace('#include <opaque_fragment>', `
      float fr = pow(1.0 - abs(dot(normalize(geometryNormal), normalize(geometryViewDir))), 3.0);
      vec3 sp = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
      // over the label band keep the glass almost clear, so the print stays crisp
      float band = smoothstep(0.010, 0.014, vGY) * (1.0 - smoothstep(0.094, 0.099, vGY));
      float boost = mix(1.0, 0.18, band);
      float neck = smoothstep(0.117, 0.119, vGY);          // soft frost so the neck doesn't vanish
      diffuseColor.a = clamp(diffuseColor.a * mix(1.0, 0.4, band) + (fr * 0.55 + dot(sp, vec3(0.3333)) * 0.9) * boost, 0.0, 0.9);
      #include <opaque_fragment>`);
  };
  glassMat.customProgramCacheKey = () => 'glassBand';

  // Satin brushed-gold lug cap
  const capMat = new THREE.MeshPhysicalMaterial({
    name: 'CapLive', color: new THREE.Color('#cfae62'), metalness: 1, roughness: 0.34, envMapIntensity: 1.1,
  });

  let labelMat = null;
  let capMesh = null;
  let capLive = null;
  const capBase = new THREE.Vector3();
  jar.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (!m) return;
    if (o.name.startsWith('Label') || m.name === 'Label') {
      labelMat = m;
      m.roughness = 0.38;
      m.clearcoat = 0.12;
      m.clearcoatRoughness = 0.2;
      m.envMapIntensity = 0.5;
      m.emissive = new THREE.Color(0xffffff);
      m.emissiveIntensity = 0.12;            // keeps the printed colours bright and crisp
      // draw the label after the glass and pull it onto the outer surface so it reads as stuck on
      m.polygonOffset = true;
      m.polygonOffsetFactor = -2;
      m.polygonOffsetUnits = -2;
      o.renderOrder = 5;
    } else if (m.name === 'Glass') {
      o.geometry = neckDetail(outerShellOnly(o.geometry));   // one thin layer of glass, not two
      o.material = glassMat;
      o.renderOrder = 3;
    } else if (m.name.startsWith('Honey')) {
      o.geometry = pushOut(o.geometry, GLASS_WALL); // honey fills right up to the thin glass
      o.material = honeyMat;
    } else if (m.name === 'GoldCap') {
      capMesh = o;
    }
  });
  if (!labelMat) throw new Error('label mesh not found in GLB');
  labelMat.map = tex[0];
  labelMat.emissiveMap = tex[0];
  labelMat.needsUpdate = true;

  // Replace the plain cap with one that has the stepped rings and sunken centre of the real lug cap
  if (capMesh) {
    capMesh.geometry.computeBoundingBox();
    const cb = capMesh.geometry.boundingBox;
    const R = (cb.max.x - cb.min.x) / 2;
    const H = cb.max.y - cb.min.y;
    const top = cb.max.y, y0 = top - (top - cb.min.y) * 0.7;   // shorter lug cap (~10 mm)
    const mm = 0.001;
    const prof = [
      [R - 0.6 * mm, y0], [R, y0 + 0.8 * mm],
      ...Array.from({ length: 9 }, (_, i) => [R, y0 + 0.8 * mm + (i + 1) * ((top - 2.4 * mm) - (y0 + 0.8 * mm)) / 10]),
      [R, top - 2.4 * mm],
      [R - 0.5 * mm, top - 0.8 * mm], [R - 1.6 * mm, top],            // rounded outer edge
      [R - 3.2 * mm, top],                                             // flat outer rim
      [R - 3.6 * mm, top - 0.5 * mm], [R - 4.6 * mm, top - 0.5 * mm],  // groove
      [R - 5.0 * mm, top - 0.1 * mm], [R - 5.8 * mm, top - 0.1 * mm],  // thin raised ring
      [R - 6.2 * mm, top - 0.6 * mm], [R - 7.2 * mm, top - 0.6 * mm],  // second step
      [R - 8.6 * mm, top - 1.4 * mm], [0, top - 1.4 * mm],             // sunken flat centre
    ].map(([x, y]) => new THREE.Vector2(x, y));
    // pressed-in lugs round the bottom edge of the skirt (they grip the jar's thread), like the real cap
    const capGeo = new THREE.LatheGeometry(prof, 360);
    {
      const LUGS = 4, LUG_W = 4.0 * mm, LUG_H = 5.0 * mm, LUG_D = 1.5 * mm;
      const cp = capGeo.attributes.position;
      for (let i = 0; i < cp.count; i++) {
        const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i);
        const r = Math.hypot(x, z);
        if (r < R - 0.7 * mm || y > y0 + LUG_H) continue;
        const th = Math.atan2(z, x);
        const step = (2 * Math.PI) / LUGS;
        const dTh = ((th - step / 2) % step + step * 1.5) % step - step / 2;   // angle to nearest lug
        const t = (R * dTh) / LUG_W;
        const wy = Math.pow(Math.max(0, 1 - (y - y0) / LUG_H), 1.3);
        const dent = LUG_D * Math.exp(-t * t) * wy;
        const k = (r - dent) / r;
        cp.setXYZ(i, x * k, y, z * k);
      }
      capGeo.computeVertexNormals();
      // weld the lathe seam so no line shows on the cap
      const cn = capGeo.attributes.normal, P = prof.length, last = 360 * P;
      for (let j = 0; j < P; j++) {
        const nx = cn.getX(j) + cn.getX(last + j), ny = cn.getY(j) + cn.getY(last + j), nz = cn.getZ(j) + cn.getZ(last + j);
        const l = Math.hypot(nx, ny, nz) || 1;
        cn.setXYZ(j, nx / l, ny / l, nz / l); cn.setXYZ(last + j, nx / l, ny / l, nz / l);
      }
    }
    const lathe = new THREE.Mesh(capGeo, capMat);
    lathe.position.copy(capMesh.position);
    lathe.quaternion.copy(capMesh.quaternion);
    lathe.position.y += 0;                  // lathe profile already in the cap's local units
    capMesh.parent.add(lathe);
    capLive = lathe;
    capBase.copy(lathe.position);
    capBase.y -= NECK_DROP;
    // a raised glass screw thread round the neck, visible when the lid is off
    {
      const R = 0.0401, y0 = NECK_Y0 + 0.0008, PITCH = 0.0026, TURNS = 1.6;
      class Helix extends THREE.Curve {
        getPoint(t, out = new THREE.Vector3()) {
          const a = t * TURNS * Math.PI * 2;
          const taper = Math.min(1, t * 8, (1 - t) * 8);
          return out.set((R + 0.0004 * taper) * Math.cos(a), y0 + PITCH * t * TURNS, (R + 0.0004 * taper) * Math.sin(a));
        }
      }
      const threadMat = glassMat.clone();
      threadMat.opacity = 0.32;
      threadMat.side = THREE.FrontSide;
      const thread = new THREE.Mesh(new THREE.TubeGeometry(new Helix(), 220, 0.00085, 8, false), threadMat);
      thread.renderOrder = 3;
      void thread;   // (not added: it made the open neck look wider than the original)
    }
    capMesh.visible = false;
    void H;
  }

  // Honey surface (a rounded-square sheet that stays level and wobbles)
  const surfShape = new THREE.Shape();
  {
    const h = HONEY_HALF + GLASS_WALL, r = HONEY_R;
    surfShape.moveTo(-h + r, -h);
    surfShape.lineTo(h - r, -h); surfShape.quadraticCurveTo(h, -h, h, -h + r);
    surfShape.lineTo(h, h - r); surfShape.quadraticCurveTo(h, h, h - r, h);
    surfShape.lineTo(-h + r, h); surfShape.quadraticCurveTo(-h, h, -h, h - r);
    surfShape.lineTo(-h, -h + r); surfShape.quadraticCurveTo(-h, -h, -h + r, -h);
  }
  void surfShape;
  const surfGeo = new THREE.PlaneGeometry(SURF_HALF * 2, SURF_HALF * 2, 72, 72);
  surfGeo.rotateX(-Math.PI / 2);           // lie flat in XZ; displaced into waves in the shader
  const surfVert = (vs) => vs
    .replace('#include <common>', '#include <common>\nvarying vec2 vLP;' + WAVE_GLSL)
    .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      float h0 = honeyH(position.xz);
      objectNormal = normalize(vec3(h0 - honeyH(position.xz + vec2(0.0006, 0.0)), 0.0006, h0 - honeyH(position.xz + vec2(0.0, 0.0006))));`)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += honeyH(position.xz); vLP = position.xz;');
  const surfFrag = (fs) => fs
    .replace('#include <common>', `#include <common>
      varying vec2 vLP;
      float sdRB2(vec2 p, float b, float r){ vec2 q = abs(p) - vec2(b - r); return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }`)
    .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (sdRB2(vLP, ' + SURF_HALF.toFixed(5) + ', ' + HONEY_R.toFixed(5) + ') > 0.0) discard;');
  const surfMat = honeyMat.clone();
  surfMat.clippingPlanes = [];
  surfMat.side = THREE.DoubleSide;
  surfMat.onBeforeCompile = (sh) => {
    honeyGlow(sh);
    sh.uniforms.uTime = waveU.uTime; sh.uniforms.uSlosh = waveU.uSlosh;
    sh.vertexShader = surfVert(sh.vertexShader);
    sh.fragmentShader = surfFrag(sh.fragmentShader);
  };
  surfMat.customProgramCacheKey = () => 'honeySurface';
  const surface = new THREE.Mesh(surfGeo, surfMat);
  scene.add(surface);

  // Golden shimmer on top of the honey: glints off tiny surface bubbles, stronger while it sloshes
  const shimmerMat = new THREE.ShaderMaterial({
    uniforms: { uTime: waveU.uTime, uSlosh: waveU.uSlosh, uAmt: { value: 0.15 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vP;` + WAVE_GLSL + `
      void main(){ vP = position.xz; vec3 q = position; q.y += honeyH(position.xz) + 0.0002;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(q, 1.0); }`,
    fragmentShader: `
      uniform float uTime, uAmt; varying vec2 vP;
      float sdRB(vec2 p, float b, float r){ vec2 q = abs(p) - vec2(b - r); return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        if (sdRB(vP, ${SURF_HALF.toFixed(5)}, ${HONEY_R.toFixed(5)}) > 0.0) discard;
        vec2 g = vP * 520.0; vec2 id = floor(g); vec2 f = fract(g) - 0.5;
        float r = h(id);
        vec2 o = vec2(h(id + 3.1), h(id + 7.7)) - 0.5;
        float tw = 0.5 + 0.5 * sin(uTime * (2.5 + r * 6.0) + r * 40.0);
        float spark = smoothstep(0.16, 0.0, length(f - o * 0.6)) * step(0.78, r) * tw * tw * tw;
        float band = pow(0.5 + 0.5 * sin(vP.x * 70.0 + vP.y * 35.0 - uTime * 2.2), 8.0);
        float a = uAmt * (spark * 1.8 + band * 0.35 + 0.06);
        gl_FragColor = vec4(vec3(1.0, 0.8, 0.42) * a, 1.0);
      }`,
  });
  const shimmer = new THREE.Mesh(surfGeo, shimmerMat);
  shimmer.renderOrder = 4;
  surface.add(shimmer);

  // A few tiny air bubbles drifting up through the honey (jar-local, metres)
  const BUBBLES = 22;
  const bubbleMat = new THREE.MeshPhysicalMaterial({
    color: 0xfff1cf, roughness: 0.08, metalness: 0, emissive: 0xffe2a0, emissiveIntensity: 0.25,
    clippingPlanes: [honeyPlane],
  });
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), bubbleMat, BUBBLES);
  const bub = [];
  const rand = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < BUBBLES; i++) {
    bub.push({
      x: rand(-0.034, 0.034), y: rand(0.008, FILL_Y - 0.004), z: rand(-0.034, 0.034),
      r: rand(0.00035, 0.0009), v: rand(0.0008, 0.0022), ph: rand(0, Math.PI * 2),
    });
  }
  const tmpM = new THREE.Matrix4();
  bubbles.frustumCulled = false;

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
  jar.add(bubbles);                         // added after measuring so it doesn't affect the size
  scene.add(mover);

  section.classList.add('is-3d');

  // per-card honey look
  const HV = KEYS.map((k) => {
    const h = HONEY[k] || HONEY.ajwain;
    return { ...h, c: new THREE.Color(h.c), em: new THREE.Color(h.em), gcol: new THREE.Color(...h.gc) };
  });

  // ---------- corner honeycomb (real scanned comb, prepared in Blender) + bees + stretchy honey drop ----------
  const tmpV1 = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
  let landed = false;
  const comb = new THREE.Group();          // origin = the comb's right-angle corner (top-right of the screen)
  comb.visible = false;
  scene.add(comb);
  const COMB_W = 0.30;                     // comb width in its own units
  const crawlers = [];
  let flyer = null;
  const honeyLook = { color: '#c0640c', emissive: '#6a2a03', emissiveIntensity: 0.55, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02, specularIntensity: 0.8, envMapIntensity: 0.6 };
  const tips = [];
  const spots = [];                          // cell rims the bees walk between (from Blender)
  if (combGltf) {
    const cm = combGltf.scene.getObjectByName('CornerComb');
    // organic wax: subtle mottling so it doesn't look flat or plastic
    const mottle = (sh, amt) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vOP;
        float hh(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float nz(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hh(i), hh(i + vec3(1,0,0)), f.x), mix(hh(i + vec3(0,1,0)), hh(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(hh(i + vec3(0,0,1)), hh(i + vec3(1,0,1)), f.x), mix(hh(i + vec3(0,1,1)), hh(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float m = nz(vOP * 260.0) * 0.6 + nz(vOP * 900.0) * 0.4;
          diffuseColor.rgb *= 1.0 - ${amt.toFixed(2)} + m * ${(2 * amt).toFixed(2)};
          diffuseColor.rgb *= mix(0.42, 1.0, smoothstep(0.004, 0.028, vOP.z));   // deeper in the cell = darker`);
    };
    const waxMat = new THREE.MeshPhysicalMaterial({
      color: '#e9a530', emissive: '#a5560a', emissiveIntensity: 0.4, roughness: 0.42, sheen: 0.4, sheenColor: new THREE.Color('#ffd27a'),
      clearcoat: 0.35, clearcoatRoughness: 0.3, envMapIntensity: 0.6, side: THREE.DoubleSide,
    });
    waxMat.onBeforeCompile = (sh) => mottle(sh, 0.22);
    waxMat.customProgramCacheKey = () => 'combWax';
    const capMat = new THREE.MeshPhysicalMaterial({
      color: '#f1d79c', emissive: '#7a5a1c', emissiveIntensity: 0.3, roughness: 0.55, envMapIntensity: 0.5, side: THREE.DoubleSide,
    });
    capMat.onBeforeCompile = (sh) => mottle(sh, 0.18);
    capMat.customProgramCacheKey = () => 'combCap';
    const cellHoney = new THREE.MeshPhysicalMaterial({ ...honeyLook, envMapIntensity: 0.9, side: THREE.DoubleSide });
    // the real scanned comb: keep its texture, warm the old brown wax to fresh gold
    const scanMat = (map) => {
      const mt = new THREE.MeshPhysicalMaterial({ map, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.18, envMapIntensity: 0.7, side: THREE.DoubleSide });
      mt.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vDepth;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDepth = position.z;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vDepth;')
          .replace('#include <map_fragment>', `#include <map_fragment>
            float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
            // cell rims sit at the front, cell bottoms deep inside: shade by depth so every cell reads
            float rimK = smoothstep(0.006, 0.03, vDepth);
            float gl = clamp(rimK * 0.8 + smoothstep(0.06, 0.34, lum) * 0.35, 0.0, 1.0);
            diffuseColor.rgb = mix(vec3(0.42, 0.15, 0.01), vec3(1.0, 0.66, 0.12), gl);
            vec3 combGlow = mix(vec3(0.22, 0.07, 0.0), vec3(0.42, 0.2, 0.02), gl);`)
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance = combGlow;');
      };
      mt.customProgramCacheKey = () => 'scanComb';
      return mt;
    };
    cm.traverse((o) => {
      if (o.isMesh) {
        const n = o.material && o.material.name;
        o.material = o.material.map ? scanMat(o.material.map) : n === 'Honey' ? cellHoney : n === 'CapWax' ? capMat : waxMat;
      }
      if (o.name.startsWith('DripTip')) tips.push(o);
      if (o.name.startsWith('BeeSpot')) spots.push(o.position.clone());
    });
    comb.add(cm);
  }
  // bees (CC-BY model): three crawl on the comb, one flies about with fast wings
  if (beeGltf) {
    const src = beeGltf.scene.getObjectByName('BeeBody');
    src.traverse((o) => {
      if (o.isMesh && o.name.startsWith('BeeWing')) {
        o.material = o.material.clone();
        o.material.transparent = true; o.material.opacity = 0.55; o.material.depthWrite = false; o.material.side = THREE.DoubleSide;
      }
    });
    const makeBee = () => {
      const b = src.clone(true);
      const wings = [b.getObjectByName('BeeWingL'), b.getObjectByName('BeeWingR')].filter(Boolean);
      wings.forEach((w) => { w.userData.rz = w.rotation.z; });
      return { obj: b, wings };
    };
    let sd = 3;
    const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    const BEE_S = 0.017;
    const sizes = [1.25, 0.8, 1.05, 0.7];          // every bee a different size
    const nB = spots.length ? sizes.length : 0;
    for (let i = 0; i < nB; i++) {
      const bee = makeBee();
      const holder = new THREE.Group();
      bee.obj.rotation.x = Math.PI / 2;            // back faces out of the comb, head points along -Y of the holder
      bee.obj.scale.setScalar(BEE_S * sizes[i]);
      holder.add(bee.obj);
      const start = spots[Math.floor(rnd() * spots.length)].clone();
      const p = { pos: start, target: start.clone(), h: rnd() * 6.28, sp: (0.007 + rnd() * 0.006) / Math.sqrt(sizes[i]),
                  wait: rnd() * 2, size: sizes[i], ph: rnd() * 10 };
      comb.add(holder);
      crawlers.push({ holder, bee, p });
    }
    flyer = makeBee();
    flyer.obj.scale.setScalar(BEE_S * 0.9);
    comb.add(flyer.obj);
  }
  // honey drop: the droplet model (origin at its top tip), honey-coloured, on a stretching strand
  // clear golden honey: see-through, deeper amber in the middle, bright gold where light comes
  // through the edges and the bottom, long white highlights down the sides
  const dropMat = new THREE.MeshPhysicalMaterial({
    color: '#c97a10', emissive: '#7a3a04', emissiveIntensity: 0.45, roughness: 0.015, metalness: 0,
    clearcoat: 1, clearcoatRoughness: 0.01, specularIntensity: 1, envMapIntensity: 2.2,
    transparent: true, opacity: 0.8, depthWrite: false,
  });
  dropMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      vec3 nv = normalize(normal);
      float rimD = 1.0 - abs(dot(nv, normalize(vViewPosition)));
      float under = clamp(-nv.y, 0.0, 1.0);
      totalEmissiveRadiance += vec3(1.0, 0.72, 0.16) * (pow(rimD, 1.4) * 0.55 + pow(under, 2.0) * 0.45);
      diffuseColor.a = clamp(diffuseColor.a * (0.75 + 0.35 * rimD), 0.0, 1.0);`);
  };
  dropMat.customProgramCacheKey = () => 'honeyDrop';
  let dropGeo = null;
  if (dropGltf) dropGltf.scene.traverse((o) => { if (o.isMesh && !dropGeo && o.name !== 'Floor' && o.name !== 'Cube') dropGeo = o.geometry; });
  const drop = new THREE.Mesh(dropGeo || new THREE.SphereGeometry(0.35, 24, 18).translate(0, -0.6, 0), dropMat);
  // strand: thick where it leaves the comb, thin in the middle, flaring into the drop's neck
  const strandPts = [];
  for (let i = 0; i <= 20; i++) {
    const y = i / 20;                                    // 0 = drop end, 1 = comb end
    const r = 0.35 + 1.25 * Math.pow(1 - y, 6) + 0.6 * Math.pow(y, 4);
    strandPts.push(new THREE.Vector2(r, y - 0.5));
  }
  const strand = new THREE.Mesh(new THREE.LatheGeometry(strandPts, 18), dropMat);
  const stub = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), dropMat);   // honey gathered at the comb's edge
  {
    const bmat = new THREE.MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.85 });
    const bg = new THREE.SphereGeometry(1, 8, 6);
    [[0.05, -0.62, 0.08, 0.025], [-0.08, -0.7, 0.05, 0.018], [0.02, -0.8, 0.1, 0.03], [-0.03, -0.55, 0.12, 0.014], [0.09, -0.75, -0.02, 0.016]]
      .forEach(([x, y, z, r]) => { const b = new THREE.Mesh(bg, bmat); b.position.set(x, y, z); b.scale.setScalar(r); drop.add(b); });
  }
  drop.visible = strand.visible = stub.visible = false;
  drop.renderOrder = strand.renderOrder = 2;
  scene.add(drop, strand, stub);

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

  // Scroll progress P: 0 when the first card fills the screen, 1 for the second, … N-1 for the last
  const N = slots.length;
  // (with the intro card in front, P runs from -1 = intro to N-1)
  const allRows = HAS_INTRO ? [introRow, ...rows] : rows;
  const P0 = HAS_INTRO ? -1 : 0;
  function rawProgress() {
    const tops = allRows.map((r) => r.getBoundingClientRect().top);
    const M = tops.length;
    let q;
    if (tops[0] >= 0) q = -tops[0] / Math.max(1, tops[1] - tops[0]);
    else {
      q = M - 1 + -tops[M - 1] / Math.max(1, tops[M - 1] - tops[M - 2]);
      for (let i = 0; i < M - 1; i++) {
        if (tops[i + 1] > 0) { q = i + -tops[i] / Math.max(1, tops[i + 1] - tops[i]); break; }
      }
    }
    return q + P0;
  }
  function targetProgress() {
    return Math.min(N - 1, Math.max(P0, rawProgress()));
  }

  let progress = targetProgress();
  let lastT = performance.now();
  const lastPos = new THREE.Vector3();
  const lastVel = new THREE.Vector2();
  let lastAngle = 0;
  const tilt = new THREE.Vector2();
  const tiltV = new THREE.Vector2();
  let shownTex = 0;
  let inView = false;
  let rafId = 0;

  // slight turn towards the text so the jar reads as 3D
  const REST = rows.map((r) => (r.classList.contains('journey-row--left') ? 0.32 : -0.32));
  const TAU = Math.PI * 2;

  // ---- visitor can swipe/drag the jar to turn it while it rests on a card ----
  let atCard = 0;                           // index of the card the jar rests on, -1 = travelling
  const user = slots.map(() => 0);
  let userV = 0;
  let dragging = false, dragX = 0, dragT = 0;
  const DRAG = 0.012;                       // radians per pixel
  const turnBy = (d) => { if (atCard >= 0) user[atCard] += d; };
  slots.forEach((el) => {
    el.addEventListener('pointerdown', (ev) => {
      if (atCard < 0) return;
      if (ev.pointerType === 'mouse') ev.preventDefault();
      dragging = true; dragX = ev.clientX; dragT = performance.now(); userV = 0;
      try { el.setPointerCapture(ev.pointerId); } catch (_) { /* ignore */ }
    });
    el.addEventListener('pointermove', (ev) => {
      if (!dragging) return;
      const now = performance.now();
      const d = (ev.clientX - dragX) * DRAG;
      dragX = ev.clientX;
      turnBy(d);
      userV = THREE.MathUtils.clamp(d / Math.max(0.008, (now - dragT) / 1000), -12, 12);
      dragT = now;
    });
    const up = () => { if (dragging && performance.now() - dragT > 90) userV = 0; dragging = false; };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });

  // ---- scroll assist: a part-scroll that stops between cards is carried to the next card ----
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  let touching = false, snapping = false, lastY = window.scrollY, dir = 0, snapTimer = 0, snapEnd = 0;
  function maybeSnap() {
    if (touching || snapping || SMOOTH === 1) return;   // ?nosmooth (screenshots): no assist
    const p = rawProgress();
    if (p <= P0 + 0.003 || p >= N - 1.003) return;   // outside the cards
    const f = p - Math.floor(p);
    if (f <= 0.003 || f >= 0.997) return;       // already resting on a card
    const next = dir > 0 ? (f > 0.08 ? Math.ceil(p) : Math.floor(p)) : (f < 0.92 ? Math.floor(p) : Math.ceil(p));
    const row = next < 0 ? introRow : rows[next];
    snapping = true;
    window.scrollTo({ top: row.getBoundingClientRect().top + window.scrollY, behavior: 'smooth' });
    clearTimeout(snapEnd);
    snapEnd = setTimeout(() => { snapping = false; }, 1200);
  }
  const armSnap = () => { clearTimeout(snapTimer); snapTimer = setTimeout(maybeSnap, coarse ? 150 : 220); };
  window.addEventListener('touchstart', () => { touching = true; snapping = false; clearTimeout(snapTimer); }, { passive: true });
  const touchUp = () => { touching = false; armSnap(); };
  window.addEventListener('touchend', touchUp, { passive: true });
  window.addEventListener('touchcancel', touchUp, { passive: true });
  window.addEventListener('wheel', () => { snapping = false; }, { passive: true });
  window.addEventListener('scrollend', () => { if (snapping) { clearTimeout(snapEnd); snapEnd = setTimeout(() => { snapping = false; }, 80); } });
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (y !== lastY) dir = Math.sign(y - lastY);
    lastY = y;
    if (!snapping) armSnap();
  }, { passive: true });

  function frame() {
    rafId = 0;
    const target = targetProgress();
    progress += (target - progress) * SMOOTH;  // gentle smoothing
    if (Math.abs(target - progress) < 0.0005) progress = target;

    const inIntro = HAS_INTRO && progress < 0;
    const tI = inIntro ? progress + 1 : 1;    // 0 = intro card, 1 = first variety card
    const seg = inIntro ? 0 : Math.min(N - 2, Math.floor(progress));
    const e = inIntro ? 0 : ease(progress - seg);
    const A = slotInfo(inIntro ? introSlot : slots[seg]);
    const B = slotInfo(inIntro ? slots[0] : slots[seg + 1]);
    const m = inIntro ? ease(clamp01((tI - 0.5) / 0.5)) : e;

    // Screen position: blend between the two live slot centres along an S-curve
    const sx = A.x + (B.x - A.x) * m;
    const sy = A.y + (B.y - A.y) * m;
    const arc = inIntro ? 0 : Math.sin(Math.PI * e);       // 0 → 1 → 0
    const u = unitsPerPx();
    // phones: no swing toward the camera, so the jar keeps its size the whole way
    mover.position.set((sx - vw / 2) * u, -(sy - vh / 2) * u, arc * (vw < 768 ? 0 : 1.2));

    // Size follows the slot height, with a small lift in the middle of the journey
    const slotH = A.h + (B.h - A.h) * m;
    const s = slotH * 0.86 * u * baseScale;
    pivot.scale.setScalar(s);
    pivot.rotation.x = 0.08 + arc * 0.06;
    pivot.rotation.z = -arc * 0.12 * (B.x < A.x ? 1 : -1);

    // Resting on a card, or travelling between them
    if (inIntro) {
      if (atCard !== -1) { user[0] = 0; userV = 0; dragging = false; atCard = -1; }
    } else if (e <= 0.0001) atCard = seg;
    else if (e >= 0.9999) atCard = seg + 1;
    else if (atCard !== -1) {
      // leaving a card: the jar sets off from wherever the visitor left it,
      // and every other card receives it front-facing
      for (let k = 0; k < N; k++) if (k !== atCard) user[k] = 0;
      userV = 0; dragging = false; atCard = -1;
    }
    const angA = REST[seg] + user[seg];
    let angB = REST[seg + 1] + user[seg + 1];
    angB += TAU * Math.ceil((angA + Math.PI - angB) / TAU);   // at least half a turn, so the back passes the viewer
    const angle = angA + (angB - angA) * e;
    pivot.rotation.y = angle;

    // Swap the label when the plain back faces the viewer
    const swapAt = Math.PI * (2 * Math.round(((angA + angB) / 2 - Math.PI) / TAU) + 1);
    const wantTex = e >= 0.9999 ? seg + 1 : e <= 0.0001 ? seg : (angle >= swapAt ? seg + 1 : seg);
    if (wantTex !== shownTex) {
      labelMat.map = tex[wantTex];
      labelMat.emissiveMap = labelMat.map;
      labelMat.needsUpdate = true;
      shownTex = wantTex;
    }

    // ---- liquid: level surface that sloshes with the jar's motion ----
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
    lastT = now;
    mover.updateMatrixWorld(true);
    const p = mover.position;
    const vx = (p.x - lastPos.x) / dt, vy = (p.y - lastPos.y) / dt;
    const ax = (vx - lastVel.x) / dt, ay = (vy - lastVel.y) / dt;
    let dA = angle - lastAngle;
    dA -= Math.round(dA / TAU) * TAU;
    const spin = dA / dt;
    // swipe inertia
    if (!dragging && userV) {
      turnBy(userV * dt);
      userV *= Math.exp(-3 * dt);
      if (Math.abs(userV) < 0.02) userV = 0;
    }
    lastPos.copy(p); lastVel.set(vx, vy); lastAngle = angle;
    const worldH = s * size.y;
    // drive: sideways acceleration tips the surface; spinning adds a little slosh
    const drive = THREE.MathUtils.clamp(-ax / worldH * 0.03 + spin * 0.035, -3, 3);
    const driveZ = THREE.MathUtils.clamp(ay / worldH * 0.015, -3, 3);
    tiltV.x += (-60 * tilt.x - 5.5 * tiltV.x + drive) * dt;
    tiltV.y += (-60 * tilt.y - 5.5 * tiltV.y + driveZ) * dt;
    tilt.x = THREE.MathUtils.clamp(tilt.x + tiltV.x * dt, -0.22, 0.22);
    tilt.y = THREE.MathUtils.clamp(tilt.y + tiltV.y * dt, -0.22, 0.22);

    const up = new THREE.Vector3(Math.sin(tilt.x), 1, Math.sin(tilt.y)).normalize();
    const fillPt = jar.localToWorld(new THREE.Vector3(0, FILL_Y, 0));
    honeyPlane.setFromNormalAndCoplanarPoint(up.clone().negate(), fillPt);
    surface.position.copy(fillPt);
    surface.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle));
    surface.scale.setScalar(s);
    surface.updateMatrixWorld(true);
    waveU.uSurfInv.value.copy(surface.matrixWorld).invert();
    waveU.uTime.value = now / 1000;
    waveU.uSlosh.value = Math.min(1, Math.abs(tilt.x) * 3.5 + Math.abs(tilt.y) * 3.5 + Math.abs(tiltV.x) * 0.4 + Math.abs(tiltV.y) * 0.4);
    shimmerMat.uniforms.uAmt.value = Math.min(1, 0.15 + Math.abs(tilt.x) * 4 + Math.abs(tilt.y) * 4 + Math.abs(tiltV.x) * 0.5);

    // ---- bubbles drift upward and wiggle; reset at the bottom ----
    const t = now / 1000;
    for (let i = 0; i < BUBBLES; i++) {
      const b = bub[i];
      b.y += b.v * dt * (1 + Math.abs(tiltV.x) * 0.5);
      if (b.y > FILL_Y - 0.003) { b.y = 0.008; b.x = rand(-0.034, 0.034); b.z = rand(-0.034, 0.034); }
      const wx = Math.sin(t * 0.9 + b.ph) * 0.0012 + tilt.x * 0.004;
      tmpM.makeScale(b.r, b.r, b.r).setPosition(b.x + wx, b.y, b.z + Math.cos(t * 0.7 + b.ph) * 0.001);
      bubbles.setMatrixAt(i, tmpM);
    }
    bubbles.instanceMatrix.needsUpdate = true;

    // ---- honey colour of the variety (blends mid-spin, mostly while the back faces you) ----
    {
      const h0 = HV[inIntro ? 0 : seg], h1 = HV[inIntro ? 0 : seg + 1];
      const w = inIntro ? 0 : THREE.MathUtils.smoothstep(e, 0.3, 0.7);
      for (const mt of [honeyMat, surfMat]) {
        mt.color.copy(h0.c).lerp(h1.c, w);
        mt.emissive.copy(h0.em).lerp(h1.em, w);
        mt.emissiveIntensity = h0.ei + (h1.ei - h0.ei) * w;
        mt.opacity = h0.op + (h1.op - h0.op) * w;
        mt.roughness = h0.rough + (h1.rough - h0.rough) * w;
        mt.clearcoat = h0.cc + (h1.cc - h0.cc) * w;
      }
      glowU.uGlowAmt.value = h0.glow + (h1.glow - h0.glow) * w;
      glowU.uGlowCol.value.copy(h0.gcol).lerp(h1.gcol, w);
      const cloud = h0.cloud + (h1.cloud - h0.cloud) * w;
      bubbles.visible = cloud < 0.5;
      shimmerMat.uniforms.uAmt.value *= 1 - 0.75 * cloud;
    }

    // ---- intro: lid screws on as you scroll; drop falls from the honeycomb into the jar ----
    if (capLive) {
      const c = HAS_INTRO ? THREE.MathUtils.smoothstep(tI, 0.48, 0.92) : 1;
      const k1 = ease(clamp01(c / 0.45)), k2 = clamp01((c - 0.45) / 0.55);
      capLive.position.set(capBase.x - 0.09 * (1 - k1), capBase.y + 0.018 * (1 - k2) - 0.012 * (1 - k1), capBase.z + 0.01 * (1 - k1));
      capLive.rotation.set(0.3 * (1 - k1), -(1 - k2) * TAU * 1.25, 0.12 * (1 - k1));
    }
    if (HAS_INTRO) {
      // comb sits in the top-right corner of the (sticky) intro screen, under the site header
      const ir = (introInner || introRow).getBoundingClientRect();
      const headerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 80;
      const cy = ir.top + headerH - 6;
      const showComb = ir.bottom > 0 && cy < vh;
      const wPx = vw < 768 ? vw * 0.62 : Math.min(vw * 0.42, 600);
      comb.visible = showComb;
      if (showComb) {
        comb.position.set((vw / 2 + 4) * u, -(cy - vh / 2) * u, 0);
        comb.scale.setScalar((wPx * u) / COMB_W);
        comb.rotation.set(0.12, 0.25, 0);
        comb.updateMatrixWorld(true);
        for (const c of crawlers) {
          // walk from cell to cell across the comb's surface, pausing now and then
          const p = c.p;
          const dxT = p.target.x - p.pos.x, dyT = p.target.y - p.pos.y, dist = Math.hypot(dxT, dyT);
          let go = 0;
          if (p.wait > 0) p.wait -= dt;
          else if (dist < 0.003) {
            p.wait = 0.6 + Math.random() * 2.5;
            const near = spots.filter((q) => q.distanceTo(p.pos) < 0.07 && q.distanceTo(p.pos) > 0.01);
            p.target = (near.length ? near[Math.floor(Math.random() * near.length)] : spots[Math.floor(Math.random() * spots.length)]).clone();
          } else {
            const want = Math.atan2(dxT, -dyT);
            let dh = want - p.h; dh -= Math.round(dh / TAU) * TAU;
            p.h += THREE.MathUtils.clamp(dh, -3 * dt, 3 * dt);
            go = Math.abs(dh) < 0.6 ? 1 : 0.3;
            const step = Math.min(dist, p.sp * go * dt);
            p.pos.x += Math.sin(p.h) * step; p.pos.y += -Math.cos(p.h) * step;
            p.pos.z += (p.target.z - p.pos.z) * Math.min(1, 4 * dt);
          }
          // feet on the cell rims: lift the body by its own leg height
          c.holder.position.set(p.pos.x, p.pos.y, p.pos.z + 0.0085 * p.size + Math.sin(t * 14 + p.ph) * 0.0002 * go);
          c.holder.rotation.z = p.h;
          const flick = Math.max(0, Math.sin(t * 1.3 + p.ph * 3) - 0.85) * 6;
          c.bee.wings.forEach((w, k) => { w.rotation.z = w.userData.rz + (k ? -1 : 1) * Math.sin(t * 60) * 0.3 * flick; });
        }
        if (flyer) {
          // a lazy loop below the comb, turning to face where it flies, wings a blur
          const a = t * 0.5;
          const fx = -0.17 + Math.sin(a) * 0.09, fy = -0.17 + Math.sin(a * 2) * 0.025, fz = 0.08 + Math.cos(a) * 0.05;
          const vx = Math.cos(a) * 0.35, vz = -Math.sin(a) * 0.25;
          flyer.obj.position.set(fx, fy + Math.sin(t * 11) * 0.002, fz);
          flyer.obj.rotation.set(0, Math.atan2(vx, vz), 0);
          flyer.wings.forEach((w, k) => { w.rotation.z = w.userData.rz + (k ? -1 : 1) * Math.sin(t * 150) * 0.8; });
        }
      }
      // ---- the drop: grows as it sags on a stretching strand, the strand thins and breaks
      //      about halfway, then the drop falls the rest of the way into the jar ----
      const mouth = jar.localToWorld(tmpV2.set(0, 0.124, 0));
      let tipObj = null, best = 1e9;
      for (const tp of tips) {
        const w = tp.getWorldPosition(tmpV1);
        const dd = Math.abs(w.x - mouth.x) + (w.y < mouth.y + 30 * u ? 1e3 : 0);
        if (dd < best) { best = dd; tipObj = tp; }
      }
      const tip = tipObj ? tipObj.getWorldPosition(tmpV1) : tmpV1.set(mouth.x, mouth.y + 200 * u, 0);
      // the jar slides under the drip, so the drop lands in the mouth
      const d = clamp01((tI - 0.03) / 0.42);
      const R = s * 0.02;                       // droplet scale (model is 1 unit tall)
      drop.visible = strand.visible = stub.visible = false;
      if (inIntro && showComb) {
        const span = tip.y - mouth.y;
        const BREAK = 0.6;
        stub.visible = true;
        stub.scale.set(R * 0.28, R * 0.18, R * 0.28);
        stub.position.copy(tip);
        if (dir >= 0 && d > 0.005) {
          if (d < BREAK) {
            const k = d / BREAK;                               // 0..1 while it sags
            const g = 0.35 + 0.65 * k;                          // drop collects more honey as it goes
            const L = span * 0.5 * Math.pow(k, 1.3);            // strand reaches about halfway
            drop.visible = true;
            drop.scale.set(R * g, R * g * (1 + 0.5 * k), R * g);
            drop.position.set(tip.x, tip.y - L, tip.z);
            const sr = R * (0.16 - 0.145 * Math.pow(k, 0.8));   // strand gets really thin
            if (L > 0.0001) {
              strand.visible = true;
              strand.scale.set(sr, L + R * 0.05, sr);
              strand.position.set(tip.x, tip.y - L / 2, tip.z);
            }
          } else if (d < 1) {
            const f = (d - BREAK) / (1 - BREAK);
            const y0 = tip.y - span * 0.5;
            drop.visible = true;
            drop.scale.set(R, R * (1.5 - 0.35 * f), R);
            drop.position.set(tip.x + (mouth.x - tip.x) * f * f, y0 - (y0 - mouth.y) * f * f, tip.z + (mouth.z - tip.z) * f * f);
            // the cut strand: upper part shrinks back into the honey on the comb
            const back = 1 - clamp01(f / 0.3);
            if (back > 0.02) {
              const L = span * 0.5 * back;
              strand.visible = true;
              strand.scale.set(R * 0.012, L, R * 0.012);
              strand.position.set(tip.x, tip.y - L / 2, tip.z);
            }
          }
          if (d >= 1 && !landed) { landed = true; tiltV.x += 1.6; tiltV.y += 0.7; }
        } else if (dir < 0) {
          // scrolling back: a fresh small drop gathers at the comb, ready to fall again
          const g = 0.35 * clamp01((1 - d) / 0.5);
          if (g > 0.02) {
            drop.visible = true;
            drop.scale.set(R * g, R * g, R * g);
            drop.position.copy(tip);
          }
        }
        if (d < 0.98) landed = false;
      }
    }

    renderer.render(scene, camera);

    if (inView) requestFrame();
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
