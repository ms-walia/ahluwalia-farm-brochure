/* Small rotating 3D jar for the shop size cards.
   Uses the same single GLB jar; only the label (per size) and the overall scale change. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const JAR_URL = 'assets/3d/Multiflora_1kg_jar.glb';
const HONEY_COL = {
  'multiflora': ['#7b3a0d', '#3a1503', 0.88], 'mustard': ['#e6cc8e', '#6a5320', 0.99],
  'kashmiri-acacia': ['#e2a53a', '#a0560a', 0.74], 'ajwain': ['#b5650f', '#6e2c03', 0.85], 'jamun': ['#5a210a', '#2a0c02', 0.92],
};
let gltfP = null;
const loadJar = () => (gltfP ||= new GLTFLoader().loadAsync(JAR_URL));

export async function mountJar(el, { variety, size, scale = 1 }) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab';
  el.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.localClippingEnabled = true;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(renderer), 0.04).texture;
  const k = new THREE.DirectionalLight(0xfff3e0, 1.25); k.position.set(-2, 3, 4); scene.add(k);
  const r = new THREE.DirectionalLight(0xffd59a, 0.8); r.position.set(3, 2, -3); scene.add(r);
  const camera = new THREE.PerspectiveCamera(26, 1, 0.01, 10);
  camera.position.set(0, 0.07, 0.82); camera.lookAt(0, -0.005, 0);

  const [gltf, tex] = await Promise.all([loadJar(), new THREE.TextureLoader().loadAsync(`assets/3d/labels/${variety}-${size}.jpg`)]);
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const jar = gltf.scene.clone(true);
  const [hc, he, hop] = HONEY_COL[variety] || HONEY_COL.multiflora;
  const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  jar.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.material.name;
    if (n === 'Label' || o.name.startsWith('Label')) {
      o.material = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.38, clearcoat: 0.12, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.12, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      o.renderOrder = 5;
    } else if (n === 'Glass') {
      o.material = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.05, clearcoat: 1, envMapIntensity: 1.6, depthWrite: false });
      o.renderOrder = 3;
    } else if (n.startsWith('Honey')) {
      o.material = new THREE.MeshPhysicalMaterial({ color: hc, emissive: he, emissiveIntensity: 0.45, transparent: true, opacity: hop, roughness: variety === 'mustard' ? 0.4 : 0.05, clearcoat: 1, envMapIntensity: 1.4, clippingPlanes: [plane] });
    } else if (n === 'GoldCap') {
      o.material = new THREE.MeshPhysicalMaterial({ color: '#cfae62', metalness: 1, roughness: 0.32, envMapIntensity: 1.1 });
    }
  });
  const box = new THREE.Box3().setFromObject(jar), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
  jar.position.sub(c);
  const pivot = new THREE.Group(); pivot.add(jar); scene.add(pivot);
  const s = (0.26 / sz.y) * scale;
  pivot.scale.setScalar(s);
  pivot.position.y = -0.13 * (1 - scale);          // smaller jars sit on the same "shelf"

  let user = -0.35, v = 0.25, drag = null, visible = true;
  canvas.addEventListener('pointerdown', (e) => { drag = e.clientX; v = 0; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (drag === null) return; const d = (e.clientX - drag) * 0.012; user += d; v = d * 30; drag = e.clientX; });
  const end = () => { drag = null; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  new IntersectionObserver((en) => { visible = en[0].isIntersecting; if (visible) loop(); }).observe(el);

  function resize() {
    const w = el.clientWidth, h = el.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();
  let last = performance.now(), raf = 0;
  function loop() {
    if (raf) return;
    raf = requestAnimationFrame(function f(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (drag === null) { v += (0.25 - v) * Math.min(1, dt * 1.5); user += v * dt; }
      pivot.rotation.y = user;
      pivot.updateMatrixWorld(true);
      const wp = jar.localToWorld(new THREE.Vector3(0, 0.100, 0));
      plane.constant = wp.y;
      renderer.render(scene, camera);
      raf = visible ? requestAnimationFrame(f) : 0;
    });
  }
  loop();
}
