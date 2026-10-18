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

  const honeyGlow = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float rim = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
      totalEmissiveRadiance += vec3(1.0, 0.58, 0.12) * (0.03 + pow(rim, 2.0) * 0.5);`);
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
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      float fr = pow(1.0 - abs(dot(normalize(geometryNormal), normalize(geometryViewDir))), 3.0);
      vec3 sp = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
      diffuseColor.a = clamp(diffuseColor.a + fr * 0.55 + dot(sp, vec3(0.3333)) * 0.9, 0.0, 0.9);
      #include <opaque_fragment>`);
  };

  // Satin brushed-gold lug cap
  const capMat = new THREE.MeshPhysicalMaterial({
    name: 'CapLive', color: new THREE.Color('#cfae62'), metalness: 1, roughness: 0.34, envMapIntensity: 1.1,
  });

  let labelMat = null;
  let capMesh = null;
  jar.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (!m) return;
    if (o.name.startsWith('Label') || m.name === 'Label') {
      labelMat = m;
      m.roughness = 0.38;
      m.clearcoat = 0.25;
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
  labelMat.map = texFrom;
  labelMat.emissiveMap = texFrom;
  labelMat.needsUpdate = true;

  // Replace the plain cap with one that has the stepped rings and sunken centre of the real lug cap
  if (capMesh) {
    capMesh.geometry.computeBoundingBox();
    const cb = capMesh.geometry.boundingBox;
    const R = (cb.max.x - cb.min.x) / 2;
    const H = cb.max.y - cb.min.y;
    const y0 = cb.min.y, top = cb.max.y;
    const mm = 0.001;
    const prof = [
      [R - 0.6 * mm, y0], [R, y0 + 0.8 * mm], [R, top - 2.4 * mm],
      [R - 0.5 * mm, top - 0.8 * mm], [R - 1.6 * mm, top],            // rounded outer edge
      [R - 3.2 * mm, top],                                             // flat outer rim
      [R - 3.6 * mm, top - 0.5 * mm], [R - 4.6 * mm, top - 0.5 * mm],  // groove
      [R - 5.0 * mm, top - 0.1 * mm], [R - 5.8 * mm, top - 0.1 * mm],  // thin raised ring
      [R - 6.2 * mm, top - 0.6 * mm], [R - 7.2 * mm, top - 0.6 * mm],  // second step
      [R - 8.6 * mm, top - 1.4 * mm], [0, top - 1.4 * mm],             // sunken flat centre
    ].map(([x, y]) => new THREE.Vector2(x, y));
    // fine vertical grip ribs round the skirt, so you can see the cap turn
    const capGeo = new THREE.LatheGeometry(prof, 360);
    {
      const cp = capGeo.attributes.position;
      for (let i = 0; i < cp.count; i++) {
        const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i);
        const r = Math.hypot(x, z);
        if (r > R - 0.2 * mm && y > y0 + 1.0 * mm && y < top - 2.6 * mm) {
          const th = Math.atan2(z, x);
          const rib = Math.pow(0.5 + 0.5 * Math.cos(th * 72), 3) * 0.35 * mm;
          const k = (r - rib) / r;
          cp.setXYZ(i, x * k, y, z * k);
        }
      }
      capGeo.computeVertexNormals();
    }
    // brushed-gold streaks that vary round the cap (roughness + a hint of bump)
    {
      const cv = document.createElement('canvas');
      cv.width = 1024; cv.height = 8;
      const cx = cv.getContext('2d');
      for (let xx = 0; xx < 1024; xx++) {
        const g = 120 + Math.random() * 70 + 40 * Math.sin(xx / 1024 * Math.PI * 6);
        cx.fillStyle = `rgb(${g},${g},${g})`;
        cx.fillRect(xx, 0, 1, 8);
      }
      const bt = new THREE.CanvasTexture(cv);
      bt.wrapS = THREE.RepeatWrapping;
      capMat.roughnessMap = bt;
      capMat.roughness = 0.5;                  // × map → about 0.25–0.4
      capMat.bumpMap = bt;
      capMat.bumpScale = 0.4;
      capMat.needsUpdate = true;
    }
    const lathe = new THREE.Mesh(capGeo, capMat);
    lathe.position.copy(capMesh.position);
    lathe.quaternion.copy(capMesh.quaternion);
    lathe.position.y += 0;                  // lathe profile already in the cap's local units
    capMesh.parent.add(lathe);
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
  const rowA = slotA.closest('.journey-row');
  const rowB = slotB.closest('.journey-row');
  // 0 when the Multiflora card fills the screen, 1 when the Mustard card does
  function rawProgress() {
    const a = rowA.getBoundingClientRect().top;
    const span = rowB.getBoundingClientRect().top - a;
    return span > 0 ? -a / span : 0;
  }
  function targetProgress() {
    return clamp01(rawProgress());
  }

  let progress = targetProgress();
  let lastT = performance.now();
  const lastPos = new THREE.Vector3();
  const lastVel = new THREE.Vector2();
  let lastAngle = 0;
  const tilt = new THREE.Vector2();
  const tiltV = new THREE.Vector2();
  let showingTo = false;
  let inView = false;
  let rafId = 0;

  const REST_A = -0.32;                     // slight turn so the jar reads as 3D
  const REST_B = 0.32;
  const TAU = Math.PI * 2;

  // ---- visitor can swipe/drag the jar to turn it while it rests on a card ----
  let atCard = 0;                           // 0 = Multiflora, 1 = Mustard, -1 = travelling
  let userA = 0, userB = 0, userV = 0;
  let dragging = false, dragX = 0, dragT = 0;
  const DRAG = 0.012;                       // radians per pixel
  const turnBy = (d) => { if (atCard === 0) userA += d; else if (atCard === 1) userB += d; };
  [slotA, slotB].forEach((el) => {
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
    if (p <= 0.003 || p >= 0.997) return;   // resting on a card, or outside the cards
    const next = dir > 0 ? (p > 0.08 ? 1 : 0) : (p < 0.92 ? 0 : 1);
    const row = next ? rowB : rowA;
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

    const e = ease(progress);
    const A = slotInfo(slotA);
    const B = slotInfo(slotB);

    // Screen position: blend between the two live slot centres along an S-curve
    const sx = A.x + (B.x - A.x) * e;
    const sy = A.y + (B.y - A.y) * e;
    const arc = Math.sin(Math.PI * e);       // 0 → 1 → 0
    const u = unitsPerPx();
    // phones: no swing toward the camera, so the jar keeps its size the whole way
    mover.position.set((sx - vw / 2) * u, -(sy - vh / 2) * u, arc * (vw < 768 ? 0 : 1.2));

    // Size follows the slot height, with a small lift in the middle of the journey
    const slotH = A.h + (B.h - A.h) * e;
    const s = slotH * 0.86 * u * baseScale;
    pivot.scale.setScalar(s);
    pivot.rotation.x = 0.08 + arc * 0.06;
    pivot.rotation.z = -arc * 0.12 * (B.x < A.x ? 1 : -1);

    // Resting on a card, or travelling between them
    if (e <= 0.0001) atCard = 0;
    else if (e >= 0.9999) atCard = 1;
    else if (atCard !== -1) {
      // leaving a card: the jar sets off from wherever the visitor left it,
      // and the card it is heading to receives it front-facing
      if (atCard === 0) userB = 0; else userA = 0;
      userV = 0; dragging = false; atCard = -1;
    }
    const angA = REST_A + userA;
    let angB = REST_B + userB;
    angB += TAU * Math.ceil((angA + Math.PI - angB) / TAU);   // at least half a turn, so the back passes the viewer
    const angle = angA + (angB - angA) * e;
    pivot.rotation.y = angle;

    // Swap the label when the plain back faces the viewer
    const swapAt = Math.PI * (2 * Math.round(((angA + angB) / 2 - Math.PI) / TAU) + 1);
    const wantTo = e >= 0.9999 ? true : e <= 0.0001 ? false : angle >= swapAt;
    if (wantTo !== showingTo) {
      labelMat.map = wantTo ? texTo : texFrom;
      labelMat.emissiveMap = labelMat.map;
      labelMat.needsUpdate = true;
      showingTo = wantTo;
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
