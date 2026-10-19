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
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const NOSMOOTH = new URLSearchParams(location.search).has('nosmooth');

if (section && canvas && !reduceMotion) {
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
  const FOV = 28, DIST = 10;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, DIST);

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

  const packs = [
    { key: '12', carton: buildCarton(2, 6, { wrap: true }) },
    { key: '25', carton: buildCarton(5, 5, { sticker: true }) },
    { key: '30', carton: buildCarton(5, 6, { sticker: true }) },
  ];
  for (const p of packs) {
    p.slot = document.getElementById(`egg-slot-${p.key}`);
    p.row = p.slot && p.slot.closest('.journey-row');
    p.pivot = new THREE.Group(); p.pivot.add(p.carton.g); scene.add(p.pivot);
    p.user = 0; p.userV = 0; p.rest = p.row && p.row.classList.contains('journey-row--left') ? 0.35 : -0.35;
    p.away = true;
  }
  section.classList.add('is-3d');

  // ---------- layout ----------
  let vw = innerWidth, vh = innerHeight;
  function resize() { vw = innerWidth; vh = innerHeight; renderer.setSize(vw, vh, false); camera.aspect = vw / vh; camera.updateProjectionMatrix(); }
  const unitsPerPx = () => (2 * DIST * Math.tan(THREE.MathUtils.degToRad(FOV / 2))) / vh;
  addEventListener('resize', resize); resize();

  // ---------- tap to open/close, swipe to turn ----------
  for (const p of packs) {
    if (!p.slot) continue;
    let down = null, lastX = 0, lastT = 0;
    p.slot.addEventListener('pointerdown', (ev) => {
      down = { x: ev.clientX, y: ev.clientY, moved: false }; lastX = ev.clientX; lastT = performance.now(); p.userV = 0;
      if (ev.pointerType === 'mouse') ev.preventDefault();
      try { p.slot.setPointerCapture(ev.pointerId); } catch (_) { /* ignore */ }
    });
    p.slot.addEventListener('pointermove', (ev) => {
      if (!down) return;
      if (Math.abs(ev.clientX - down.x) > 6) down.moved = true;
      const now = performance.now(), d = (ev.clientX - lastX) * 0.012;
      p.user += d; p.userV = THREE.MathUtils.clamp(d / Math.max(0.008, (now - lastT) / 1000), -12, 12);
      lastX = ev.clientX; lastT = now;
    });
    const up = (ev) => {
      if (!down) return;
      if (!down.moved && ev.type === 'pointerup') {
        const c = p.carton;
        c.target = c.target ? 0 : 1;
        if (c.target && c.wrap) c.torn = true;        // the seal breaks the first time it opens
      }
      if (performance.now() - lastT > 90) p.userV = 0;
      down = null;
    };
    p.slot.addEventListener('pointerup', up);
    p.slot.addEventListener('pointercancel', up);
  }

  // ---------- scroll assist between the pack cards (same feel as the honey jars) ----------
  const rowsAll = packs.map((p) => p.row).filter(Boolean);
  let touching = false, snapping = false, lastY = scrollY, dir = 0, snapTimer = 0, snapEnd = 0;
  function rawProgress() {
    const tops = rowsAll.map((r) => r.getBoundingClientRect().top);
    if (tops[0] >= 0) return -tops[0] / Math.max(1, tops[1] - tops[0]);
    for (let i = 0; i < tops.length - 1; i++) if (tops[i + 1] > 0) return i + -tops[i] / Math.max(1, tops[i + 1] - tops[i]);
    return tops.length - 1 + -tops[tops.length - 1] / Math.max(1, tops[1] - tops[0]);
  }
  function maybeSnap() {
    if (touching || snapping || NOSMOOTH) return;
    const p = rawProgress();
    if (p <= 0.003 || p >= rowsAll.length - 1.003) return;
    const f = p - Math.floor(p);
    if (f <= 0.003 || f >= 0.997) return;
    const next = dir > 0 ? (f > 0.08 ? Math.ceil(p) : Math.floor(p)) : (f < 0.92 ? Math.floor(p) : Math.ceil(p));
    snapping = true;
    scrollTo({ top: rowsAll[next].getBoundingClientRect().top + scrollY, behavior: 'smooth' });
    clearTimeout(snapEnd); snapEnd = setTimeout(() => { snapping = false; }, 1200);
  }
  const armSnap = () => { clearTimeout(snapTimer); snapTimer = setTimeout(maybeSnap, matchMedia('(pointer: coarse)').matches ? 150 : 220); };
  addEventListener('touchstart', () => { touching = true; snapping = false; }, { passive: true });
  addEventListener('touchend', () => { touching = false; armSnap(); }, { passive: true });
  addEventListener('wheel', () => { snapping = false; }, { passive: true });
  addEventListener('scroll', () => {
    const y = scrollY; if (y !== lastY) dir = Math.sign(y - lastY); lastY = y;
    if (!snapping && inView) armSnap();
  }, { passive: true });

  // ---------- frame loop ----------
  let inView = false, raf = 0, lastT = performance.now();
  const io = new IntersectionObserver((en) => {
    inView = en[0].isIntersecting; section.classList.toggle('in-view', inView);
    if (inView && !raf) raf = requestAnimationFrame(frame);
  });
  io.observe(section);
  const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function frame() {
    raf = 0;
    const now = performance.now(), dt = Math.min(0.05, (now - lastT) / 1000 || 0.016); lastT = now;
    const u = unitsPerPx();
    for (const p of packs) {
      if (!p.slot) continue;
      const r = p.slot.getBoundingClientRect();
      const rowR = p.row.getBoundingClientRect();
      // how far this card is from filling the screen: 0 = in place, ±1 = a whole screen away
      const off = THREE.MathUtils.clamp(rowR.top / vh, -1.2, 1.2);
      const visible = rowR.bottom > -vh * 0.2 && rowR.top < vh * 1.2;
      p.pivot.visible = visible;
      if (!visible) continue;
      // leaving the card resets it: lid shut, seal whole again, front-facing
      const away = Math.abs(off) > 0.6;
      if (away && !p.away) { p.carton.target = 0; p.carton.open = 0; p.carton.torn = false; p.user = 0; p.userV = 0; }
      p.away = away;
      const c = p.carton;
      // size the carton to its slot
      const fit = Math.min((r.width * 0.95 * u) / c.W, (r.height * 0.78 * u) / c.D);
      p.pivot.position.set((r.left + r.width / 2 - vw / 2) * u, -(r.top + r.height / 2 - vh / 2) * u, 0);
      p.pivot.scale.setScalar(fit);
      // spin in as the card arrives (a full turn spread over the approach), plus the visitor's own turn
      if (p.userV && Math.abs(p.userV) > 0.02) { p.user += p.userV * dt; p.userV *= Math.exp(-3 * dt); } else p.userV = 0;
      const arrive = easeIO(1 - Math.min(1, Math.abs(off)));
      p.pivot.rotation.set(0.55 + (1 - arrive) * 0.25, p.rest + p.user + (1 - arrive) * Math.PI * 2 * Math.sign(off || 1), 0);
      // lid swing
      c.open += (c.target - c.open) * Math.min(1, dt * 5);
      c.hinge.rotation.x = -easeIO(c.open) * 1.95;
      if (c.wrap) {
        // once torn, the two halves of the label no longer meet: a ragged gap stays along the seam
        c.wrap.fringes.forEach((f) => { f.visible = c.torn; });
        c.wrap.lidBand.position.y = c.torn ? 0.004 : 0;
        c.wrap.baseBand.position.y = c.torn ? -0.003 : 0;
        c.wrap.fringes[0].position.y = c.torn ? 0.004 : 0; c.wrap.fringes[2].position.y = c.torn ? 0.004 : 0;
        c.wrap.fringes[1].position.y = c.torn ? -0.003 : 0; c.wrap.fringes[3].position.y = c.torn ? -0.003 : 0;
      }
    }
    renderer.render(scene, camera);
    if (inView) raf = requestAnimationFrame(frame);
  }
}
