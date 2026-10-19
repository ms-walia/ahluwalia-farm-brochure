/* ============================================
   Ahluwalia Farm — 3D clear egg cartons (12 / 25 / 30)
   - one full-screen card per pack; the carton spins in as its card arrives
   - tap a carton to open / close its lid; swipe to turn it
   - the 12 pack carries a wrap-around label that tears when it is first opened,
     stays torn while you stay on the card, and is whole again when you come back
   ============================================ */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const section = document.getElementById('egg-cartons');
const canvas = document.getElementById('egg-canvas');
const stage = document.getElementById('egg-stage');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const NOSMOOTH = new URLSearchParams(location.search).has('nosmooth');

if (section && canvas && stage && !reduceMotion) {
  try { init(); } catch (err) { console.warn('[eggs3d] disabled:', err); }
}

function init() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(renderer), 0.04).texture;
  const key = new THREE.DirectionalLight(0xfff1dc, 1.3); key.position.set(-2, 4, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffe0b0, 0.7); rim.position.set(3, 2, -3); scene.add(rim);

  const texLoader = new THREE.TextureLoader();
  const tex = (url) => { const t = texLoader.load(url); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  const wrapTex = tex('assets/eggs/wrap-12.jpg');
  wrapTex.wrapT = THREE.RepeatWrapping;
  const stickerTex = tex('assets/eggs/sticker-30.jpg');

  // ---------- materials ----------
  // clear PET plastic: nearly invisible face-on, brighter at grazing angles and highlights
  const plastic = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, transparent: true, opacity: 0.1, roughness: 0.12, metalness: 0,
    clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false,
  });
  plastic.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      float fr = pow(1.0 - abs(dot(normalize(geometryNormal), normalize(geometryViewDir))), 2.5);
      vec3 sp = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
      diffuseColor.a = clamp(diffuseColor.a + fr * 0.45 + dot(sp, vec3(0.333)) * 0.7, 0.0, 0.85);
      #include <opaque_fragment>`);
  };
  plastic.customProgramCacheKey = () => 'eggPlastic';
  const eggMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.72, envMapIntensity: 0.45 });
  const stickerMat = new THREE.MeshPhysicalMaterial({ map: stickerTex, roughness: 0.45, clearcoat: 0.2, emissive: 0xffffff, emissiveMap: stickerTex, emissiveIntensity: 0.12 });
  const wrapMat = new THREE.MeshPhysicalMaterial({ map: wrapTex, roughness: 0.5, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: wrapTex, emissiveIntensity: 0.1 });

  // ---------- shared geometry (metres) ----------
  const P = 0.05;              // cup pitch
  const CUP_R = 0.022, CUP_D = 0.03, DOME_H = 0.03;
  const lathe = (pts, seg = 28) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  // tray cup: slightly faceted, narrowing to a small flat bottom
  const cupGeo = lathe([[CUP_R, 0], [CUP_R * 0.97, -0.006], [CUP_R * 0.86, -0.018], [CUP_R * 0.62, -CUP_D + 0.002], [CUP_R * 0.5, -CUP_D], [0, -CUP_D]], 8);
  cupGeo.rotateY(Math.PI / 8);
  const domeGeo = lathe([[CUP_R, 0], [CUP_R * 0.98, 0.008], [CUP_R * 0.88, 0.02], [CUP_R * 0.62, DOME_H - 0.002], [CUP_R * 0.45, DOME_H], [0, DOME_H]], 8);
  domeGeo.rotateY(Math.PI / 8);
  const bumpGeo = new THREE.ConeGeometry(0.006, 0.012, 4); bumpGeo.translate(0, 0.006, 0);
  // light-brown egg
  const eggPts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, a = t * Math.PI;
    const r = Math.sin(a) * 0.0215 * (1 - 0.18 * t);
    eggPts.push(new THREE.Vector2(Math.max(r, 0.0001), -Math.cos(a) * 0.0285 + (t > 0.5 ? (t - 0.5) * 0.006 : 0)));
  }
  const eggGeo = new THREE.LatheGeometry(eggPts, 28);

  function plate(w, d, holes) {
    const r = 0.008, s = new THREE.Shape();
    s.moveTo(-w / 2 + r, -d / 2); s.lineTo(w / 2 - r, -d / 2); s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
    s.lineTo(w / 2, d / 2 - r); s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2); s.lineTo(-w / 2 + r, d / 2);
    s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r); s.lineTo(-w / 2, -d / 2 + r); s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
    for (const [x, z] of holes) { const h = new THREE.Path(); h.absarc(x, z, CUP_R, 0, Math.PI * 2, true); s.holes.push(h); }
    const g = new THREE.ShapeGeometry(s, 16); g.rotateX(-Math.PI / 2);
    // ShapeGeometry is in the XY plane; after rotating, shape y -> -z, so flip back
    g.scale(1, 1, -1);
    return g;
  }
  function skirt(w, d, h, y0) {
    // four side walls of the tray / lid (with a slight draft)
    const g = [];
    for (const [sx, sz, len, rot] of [[0, d / 2, w, 0], [0, -d / 2, w, Math.PI], [w / 2, 0, d, -Math.PI / 2], [-w / 2, 0, d, Math.PI / 2]]) {
      const p = new THREE.PlaneGeometry(len, Math.abs(h)); p.rotateY(rot); p.translate(sx, y0 + h / 2, sz); g.push(p);
    }
    return mergeGeometries(g);
  }

  // ---------- build one carton ----------
  function buildCarton(rows, cols, opts) {
    const W = cols * P + 0.012, D = rows * P + 0.012;
    const cells = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([(c - (cols - 1) / 2) * P, (r - (rows - 1) / 2) * P]);
    const g = new THREE.Group();
    // base tray
    const baseParts = [plate(W, D, cells), skirt(W, D, -CUP_D - 0.004, 0)];
    for (const [x, z] of cells) baseParts.push(cupGeo.clone().translate(x, 0, z));
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
      if ((r === 0 || r === rows) && (c === 0 || c === cols)) continue;
      baseParts.push(bumpGeo.clone().translate((c - cols / 2) * P, 0, (r - rows / 2) * P));
    }
    const base = new THREE.Mesh(mergeGeometries(baseParts.map((x) => x.toNonIndexed ? x.toNonIndexed() : x)), plastic);
    base.renderOrder = 3;
    g.add(base);
    // eggs
    const eggs = new THREE.InstancedMesh(eggGeo, eggMat, cells.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    let seed = rows * 31 + cols;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    cells.forEach(([x, z], i) => {
      q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.12, rnd() * 6.28, (rnd() - 0.5) * 0.12));
      const sc = 0.96 + rnd() * 0.08;
      m4.compose(new THREE.Vector3(x, -CUP_D + 0.0275 * sc, z), q, new THREE.Vector3(sc, sc, sc));
      eggs.setMatrixAt(i, m4);
      col.setHSL(0.072 + rnd() * 0.012, 0.5 + rnd() * 0.1, 0.5 + rnd() * 0.06);   // light brown, each a little different
      eggs.setColorAt(i, col);
    });
    g.add(eggs);
    // lid, hinged along the back edge (z = -D/2)
    const hinge = new THREE.Group(); hinge.position.set(0, 0, -D / 2); g.add(hinge);
    const lidParts = [plate(W, D, cells), skirt(W, D, 0.006, 0)];
    for (const [x, z] of cells) lidParts.push(domeGeo.clone().translate(x, 0, z));
    const lidGeo = mergeGeometries(lidParts.map((x) => x.toNonIndexed ? x.toNonIndexed() : x));
    lidGeo.translate(0, 0.002, D / 2);
    const lid = new THREE.Mesh(lidGeo, plastic); lid.renderOrder = 4;
    hinge.add(lid);
    const carton = { g, hinge, rows, cols, W, D, open: 0, target: 0, torn: false, wrap: null };
    if (opts.sticker) {
      const s = Math.min(W, D) * 0.82;
      const st = new THREE.Mesh(new THREE.PlaneGeometry(s, s), stickerMat);
      st.rotation.x = -Math.PI / 2; st.position.set(0, 0.002 + DOME_H + 0.0015, D / 2);
      st.renderOrder = 5;
      hinge.add(st);
    }
    if (opts.wrap) carton.wrap = buildWrap(carton);
    return carton;
  }

  // wrap-around label for the 12 pack: a band round the middle, split where lid meets tray
  function buildWrap(c) {
    const BW = 0.08;                         // band width along the carton
    const top = 0.002 + DOME_H + 0.002, bot = -CUP_D - 0.006, zf = c.D / 2 + 0.001, zb = -c.D / 2 - 0.001;
    const hb = top - bot, L = 2 * hb + 2 * (zf - zb);
    const sTop = (top - 0) + (zf - zb) / 2;  // perimeter position of the top centre (start: back face at y = 0)
    const vOf = (s) => 1 - (0.5 + (s - sTop) / L);
    // perimeter path, starting at the back face at y = 0 and going up, over, down the front, under, up the back
    // pieces: [y/z start, y/z end, which part]
    const jag = (n) => Array.from({ length: n + 1 }, (_, i) => (i % 2 ? 0.0035 : -0.0035));
    function strip(points, part) {
      // points: list of [y, z, s]; makes a ribbon across x (band width) through them
      const pos = [], uv = [], idx = [];
      points.forEach(([y, z, s], i) => {
        pos.push(-BW / 2, y, z, BW / 2, y, z);
        uv.push(0, vOf(s), 1, vOf(s));
        if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      });
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      gg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      gg.setIndex(idx); gg.computeVertexNormals();
      return gg;
    }
    // lid piece: back face from y=0 up, top, front down to y=0
    const sBackTop = top, sFrontTop = top + (zf - zb), sFrontMid = sFrontTop + top;
    const lidPts = [[0, zb, 0], [top, zb, sBackTop], [top, zf, sFrontTop], [0, zf, sFrontMid]];
    const sBot = sFrontMid - bot, sBotB = sBot + (zf - zb), sEnd = L;
    const basePts = [[0, zf, sFrontMid], [bot, zf, sBot], [bot, zb, sBotB], [0, zb, sEnd]];
    const lidBand = new THREE.Mesh(strip(lidPts), wrapMat);
    const baseBand = new THREE.Mesh(strip(basePts), wrapMat);
    // torn edges: thin jagged paper fringes that only show once the seal is broken
    const fringeMat = new THREE.MeshBasicMaterial({ color: 0xf3e6c8, side: THREE.DoubleSide });
    const fringe = (z, dir) => {
      const n = 16, pos = [];
      const jg = jag(n);
      for (let i = 0; i < n; i++) {
        const x0 = -BW / 2 + (i / n) * BW, x1 = -BW / 2 + ((i + 1) / n) * BW;
        pos.push(x0, 0, z, x1, 0, z, (x0 + x1) / 2 + (i % 3 - 1) * 0.001, dir * (Math.abs(jg[i]) * 1.4 + (i % 4) * 0.0012), z);
      }
      const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const m = new THREE.Mesh(gg, fringeMat); m.visible = false; return m;
    };
    const fLidF = fringe(zf + 0.0005, -1), fBaseF = fringe(zf + 0.0005, 1);
    const fLidB = fringe(zb - 0.0005, -1), fBaseB = fringe(zb - 0.0005, 1);
    // lid parts live in the hinge's frame (hinge at z = -D/2)
    const lidGroup = new THREE.Group(); lidGroup.position.set(0, 0, c.D / 2); lidGroup.add(lidBand, fLidF, fLidB);
    c.hinge.add(lidGroup);
    c.g.add(baseBand, fBaseF, fBaseB);
    lidBand.renderOrder = baseBand.renderOrder = 6;
    return { fringes: [fLidF, fBaseF, fLidB, fBaseB], lidBand, baseBand };
  }


  // ---------- the display: 12 in front, 30 standing behind, 25 leaning on the right ----------
  const stickerTex25 = stickerTex;   // (swap in the 25-pack sticker when it arrives)
  void stickerTex25;
  const display = new THREE.Group(); scene.add(display);
  const packs = [
    { key: '30', carton: buildCarton(5, 6, { sticker: true }), rest: { p: [-0.02, 0.07, -0.16], r: [1.02, 0.08, 0] } },
    { key: '25', carton: buildCarton(5, 5, { sticker: true }), rest: { p: [0.235, 0.0, -0.02], r: [0.92, -0.55, -0.12] } },
    { key: '12', carton: buildCarton(2, 6, { wrap: true }),    rest: { p: [-0.05, -0.12, 0.1], r: [0.62, 0.12, 0.02] } },
  ];
  // "open" pose: lid up, tray turned straight towards the viewer, brought forward
  const OPEN = { p: [0.02, -0.04, 0.34], r: [1.1, 0, 0] };
  for (const pk of packs) {
    pk.holder = new THREE.Group(); pk.spin = new THREE.Group();
    pk.holder.add(pk.spin); pk.spin.add(pk.carton.g); display.add(pk.holder);
    pk.k = 0; pk.user = 0; pk.userV = 0;
    pk.carton.g.traverse((o) => { o.userData.pack = pk; });
  }
  section.classList.add('is-3d');

  // ---------- canvas = the stage area ----------
  stage.appendChild(canvas);
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 20);
  camera.position.set(0.03, 0.42, 1.25); camera.lookAt(0.03, -0.01, 0);
  function resize() {
    const r = stage.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height);
    // keep the whole group in view on narrow screens
    camera.position.setLength(camera.aspect < 1 ? 1.25 / Math.max(0.62, camera.aspect) : 1.25);
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();

  // ---------- tap a carton: open + face the viewer / close + tilt back; swipe: turn it ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(ev) {
    const r = stage.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(packs.map((p) => p.carton.g), true)[0];
    return hit ? hit.object.userData.pack : null;
  }
  let down = null, lastX = 0, lastT = 0;
  stage.addEventListener('pointerdown', (ev) => {
    const pk = pick(ev) || packs.find((p) => p.carton.target) || null;
    down = { x: ev.clientX, moved: false, pk }; lastX = ev.clientX; lastT = performance.now();
    if (pk) pk.userV = 0;
    if (ev.pointerType === 'mouse') ev.preventDefault();
    try { stage.setPointerCapture(ev.pointerId); } catch (_) { /* ignore */ }
  });
  stage.addEventListener('pointermove', (ev) => {
    if (!down || !down.pk) return;
    if (Math.abs(ev.clientX - down.x) > 6) down.moved = true;
    if (!down.moved) return;
    const now = performance.now(), d = (ev.clientX - lastX) * 0.012;
    down.pk.user += d; down.pk.userV = THREE.MathUtils.clamp(d / Math.max(0.008, (now - lastT) / 1000), -12, 12);
    lastX = ev.clientX; lastT = now;
  });
  const up = (ev) => {
    if (!down) return;
    const pk = down.pk;
    if (pk && !down.moved && ev.type === 'pointerup') {
      const opening = !pk.carton.target;
      for (const o of packs) if (o !== pk && o.carton.target) { o.carton.target = 0; }   // only one open at a time
      pk.carton.target = opening ? 1 : 0;
      if (opening && pk.carton.wrap) pk.carton.torn = true;      // seal breaks on first open, stays torn
      if (!opening) pk.user = 0;
    }
    if (pk && performance.now() - lastT > 90) pk.userV = 0;
    down = null;
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);

  // ---------- loop ----------
  let inView = false, raf = 0, lastF = performance.now();
  const io = new IntersectionObserver((en) => {
    const was = inView; inView = en[0].isIntersecting;
    if (!inView && was) {
      // leaving the section resets everything: lids shut, seal whole again
      for (const pk of packs) { pk.carton.target = 0; pk.carton.open = 0; pk.carton.torn = false; pk.user = 0; pk.userV = 0; pk.k = 0; }
    }
    if (inView && !raf) { resize(); raf = requestAnimationFrame(frame); }
  });
  io.observe(section);
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const lerp = (a, b, t) => a + (b - a) * t;

  function frame() {
    raf = 0;
    const now = performance.now(), dt = Math.min(0.05, (now - lastF) / 1000 || 0.016); lastF = now;
    const t = now / 1000;
    for (const pk of packs) {
      const c = pk.carton;
      c.open += (c.target - c.open) * Math.min(1, dt * 5);
      pk.k += (c.target - pk.k) * Math.min(1, dt * 4);
      const k = ease(Math.min(1, Math.max(0, pk.k)));
      const R = pk.rest, idle = Math.sin(t * 0.8 + pk.rest.p[0] * 20) * 0.01 * (1 - k);
      pk.holder.position.set(lerp(R.p[0], OPEN.p[0], k), lerp(R.p[1], OPEN.p[1], k) + idle, lerp(R.p[2], OPEN.p[2], k));
      pk.holder.rotation.set(lerp(R.r[0], OPEN.r[0], k), lerp(R.r[1], OPEN.r[1], k), lerp(R.r[2], OPEN.r[2], k));
      // the other cartons step back a little while one is open
      const other = packs.some((o) => o !== pk && o.k > 0.05) ? Math.max(...packs.filter((o) => o !== pk).map((o) => o.k)) : 0;
      pk.holder.scale.setScalar(1 - 0.25 * other);
      if (pk.userV && Math.abs(pk.userV) > 0.02) { pk.user += pk.userV * dt; pk.userV *= Math.exp(-3 * dt); } else pk.userV = 0;
      pk.spin.rotation.y = pk.user;     // turn about the carton's own up axis
      c.hinge.rotation.x = -ease(c.open) * 1.95;
      if (c.wrap) {
        c.wrap.fringes.forEach((f) => { f.visible = c.torn; });
        c.wrap.lidBand.position.y = c.torn ? 0.004 : 0;
        c.wrap.baseBand.position.y = c.torn ? -0.003 : 0;
        c.wrap.fringes[0].position.y = c.wrap.fringes[2].position.y = c.torn ? 0.004 : 0;
        c.wrap.fringes[1].position.y = c.wrap.fringes[3].position.y = c.torn ? -0.003 : 0;
      }
    }
    renderer.render(scene, camera);
    if (inView) raf = requestAnimationFrame(frame);
  }
}
