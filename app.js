import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ============================================================ boot */
const errors = [];
window.addEventListener('error', e => { errors.push(String(e.message)); console.error('AURELIA_ERR', e.message); });

const DBG = new URLSearchParams(location.search).get('dbg') || '';
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe6d6b4, 50, 150);

const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 400);
camera.layers.enable(2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 14;
controls.maxDistance = 42;
controls.minPolarAngle = 0.95;
controls.maxPolarAngle = 1.33;
controls.target.set(-2, 1, 0);
controls.autoRotateSpeed = 0.35;

function placeCamera(azimuth, polar, dist) {
  const t = controls.target;
  camera.position.set(
    t.x + dist * Math.sin(polar) * Math.sin(azimuth),
    t.y + dist * Math.cos(polar),
    t.z + dist * Math.sin(polar) * Math.cos(azimuth)
  );
  camera.lookAt(t);
}
placeCamera(0.30, 1.24, 36);

/* idle auto-drift */
let idleTimer = null;
controls.autoRotate = true;
controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(idleTimer); });
controls.addEventListener('end', () => {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { controls.autoRotate = true; }, 9000);
});

/* ============================================================ sky + light */
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { uTop: { value: new THREE.Color(0x9fb0b2) }, uMid: { value: new THREE.Color(0xf2e0ba) }, uBot: { value: new THREE.Color(0xead9b6) } },
  vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `varying vec3 vP; uniform vec3 uTop,uMid,uBot;
    void main(){ float h = normalize(vP).y;
      vec3 c = h > 0.12 ? mix(uMid, uTop, smoothstep(0.12, 0.85, h)) : mix(uBot, uMid, smoothstep(-0.25, 0.12, h));
      gl_FragColor = vec4(c, 1.); }`
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(220, 32, 16), skyMat));

{
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
}
const hemi = new THREE.HemisphereLight(0xf2ddb2, 0x4a4a44, 0.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd9a0, 2.4);
sun.position.set(34, 30, -20);
sun.castShadow = DBG !== 'nosun';
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -46; sun.shadow.camera.right = 46;
sun.shadow.camera.top = 46; sun.shadow.camera.bottom = -46;
sun.shadow.camera.near = 15; sun.shadow.camera.far = 100;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(sun); scene.add(sun.target);
const fill = new THREE.DirectionalLight(0xbfd0d8, 0.35);
fill.position.set(-30, 20, 30);
scene.add(fill);

/* distant towers */
{
  const g = new THREE.Group();
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const mats = [0xcbb289, 0xd8bf97, 0xbfae8c, 0xd3b78e].map(c => new THREE.MeshBasicMaterial({ color: c }));
  const rng = mulberry(7);
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + rng() * 0.25;
    const r = 78 + rng() * 55;
    const w = 6 + rng() * 10, h = 22 + rng() * 66, d = 6 + rng() * 10;
    const m = new THREE.Mesh(boxGeo, mats[i % mats.length]);
    m.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r);
    m.scale.set(w, h, d);
    m.rotation.y = rng() * Math.PI;
    g.add(m);
  }
  /* needle spires, echoing the meridian skyline */
  const spireMat = new THREE.MeshBasicMaterial({ color: 0xd8c193 });
  const spireGeo = new THREE.CylinderGeometry(0.12, 1.1, 90, 6);
  [[-70, -60], [30, -95], [95, -30], [-95, 25], [10, 105], [-40, 95]].forEach(([x, z], i) => {
    const s = new THREE.Mesh(spireGeo, spireMat);
    s.position.set(x, 34 + (i % 3) * 7, z);
    g.add(s);
  });
  scene.add(g);
}

/* ============================================================ ground : wet stone */
const GROUND_W = 84, GROUND_D = 58;
const groundUniforms = {
  tReflect: { value: null },
  uTexMatrix: { value: new THREE.Matrix4() },
  uTime: { value: 0 },
  uWet: { value: 0.55 }
};
const groundMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.93, metalness: 0.04, envMapIntensity: 0.15 });
groundMat.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, groundUniforms);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
      varying vec3 vWorldPos;
      uniform sampler2D tReflect; uniform mat4 uTexMatrix; uniform float uTime; uniform float uWet;
      float hash21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
      float vnoise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.-2.*f);
        float a=hash21(i), b=hash21(i+vec2(1.,0.)), c=hash21(i+vec2(0.,1.)), d=hash21(i+vec2(1.,1.));
        return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
      float fbm(vec2 p){ float v=0.; float a=.5; for(int i=0;i<4;i++){ v+=a*vnoise(p); p*=2.03; a*=.5; } return v; }`)
    .replace('void main() {', 'void main() {\nfloat puddleMask = 0.0;')
    .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec2 tileUv = vWorldPos.xz / 2.3;
        vec2 tileId = floor(tileUv);
        vec2 tileFr = fract(tileUv);
        float th = hash21(tileId);
        vec3 col = mix(vec3(0.328, 0.298, 0.258), vec3(0.402, 0.366, 0.314), th);
        col *= 0.90 + 0.10 * vnoise(vWorldPos.xz * 5.5);
        col *= 0.96 + 0.04 * hash21(tileId + 7.7);
        float grout = smoothstep(0.0, 0.05, tileFr.x) * smoothstep(1.0, 0.95, tileFr.x)
                    * smoothstep(0.0, 0.05, tileFr.y) * smoothstep(1.0, 0.95, tileFr.y);
        col *= mix(0.48, 1.0, grout);
        diffuseColor.rgb = col;
      }`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      {
        float pn = fbm(vWorldPos.xz * 0.17 + vec2(3.7, 8.2));
        puddleMask = smoothstep(1.0 - uWet, 1.0 - uWet + 0.30, pn);
        roughnessFactor = mix(roughnessFactor, 0.06, puddleMask);
      }`)
    .replace('#include <opaque_fragment>', `
      vec4 diffuseColorOut = vec4(outgoingLight, diffuseColor.a);
      if (puddleMask > 0.001) {
        vec4 tuv = uTexMatrix * vec4(vWorldPos, 1.0);
        vec2 ruv = tuv.xy / max(tuv.w, 1e-4);
        float rn1 = vnoise(vWorldPos.xz * 2.6 + vec2(uTime * 0.70, uTime * 0.45));
        float rn2 = vnoise(vWorldPos.xz * 2.6 + vec2(11.3 - uTime * 0.50, 4.1 + uTime * 0.60));
        ruv += (vec2(rn1, rn2) - 0.5) * 0.014 * puddleMask;
        vec3 refl = texture2D(tReflect, clamp(ruv, 0.002, 0.998)).rgb;
        vec3 Vv = normalize(cameraPosition - vWorldPos);
        float fres = pow(1.0 - max(Vv.y, 0.0), 1.5);
        float mixAmt = puddleMask * mix(0.55, 0.95, fres);
        diffuseColorOut.rgb = mix(diffuseColorOut.rgb * 0.75, refl * vec3(0.80, 0.88, 0.92), mixAmt);
      }
      gl_FragColor = diffuseColorOut;`);
};
const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_W, GROUND_D), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
ground.layers.set(2); // main camera only, never in the reflection pass
scene.add(ground);

/* planar reflection rig (adapted from three.js Reflector) */
const reflection = (() => {
  const rt = new THREE.WebGLRenderTarget(1024, 1024);
  const virtualCamera = new THREE.PerspectiveCamera();
  const plane = new THREE.Plane();
  const normal = new THREE.Vector3();
  const reflectorWorldPosition = new THREE.Vector3();
  const cameraWorldPosition = new THREE.Vector3();
  const rotationMatrix = new THREE.Matrix4();
  const lookAtPosition = new THREE.Vector3(0, 0, -1);
  const clipPlane = new THREE.Vector4();
  const view = new THREE.Vector3();
  const target = new THREE.Vector3();
  const q = new THREE.Vector4();
  const clipBias = 0.003;
  groundUniforms.tReflect.value = rt.texture;

  function update() {
    reflectorWorldPosition.setFromMatrixPosition(ground.matrixWorld);
    cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);
    rotationMatrix.extractRotation(ground.matrixWorld);
    normal.set(0, 0, 1).applyMatrix4(rotationMatrix);
    view.subVectors(reflectorWorldPosition, cameraWorldPosition);
    if (view.dot(normal) > 0) return;
    view.reflect(normal).negate();
    view.add(reflectorWorldPosition);
    rotationMatrix.extractRotation(camera.matrixWorld);
    lookAtPosition.set(0, 0, -1).applyMatrix4(rotationMatrix).add(cameraWorldPosition);
    target.subVectors(reflectorWorldPosition, lookAtPosition);
    target.reflect(normal).negate();
    target.add(reflectorWorldPosition);
    virtualCamera.position.copy(view);
    virtualCamera.up.set(0, 1, 0);
    virtualCamera.up.applyMatrix4(rotationMatrix);
    virtualCamera.up.reflect(normal);
    virtualCamera.lookAt(target);
    virtualCamera.far = camera.far;
    virtualCamera.updateMatrixWorld();
    virtualCamera.projectionMatrix.copy(camera.projectionMatrix);

    groundUniforms.uTexMatrix.value.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1);
    groundUniforms.uTexMatrix.value.multiply(virtualCamera.projectionMatrix);
    groundUniforms.uTexMatrix.value.multiply(virtualCamera.matrixWorldInverse);
    groundUniforms.uTexMatrix.value.multiply(ground.matrixWorld);

    plane.setFromNormalAndCoplanarPoint(normal, reflectorWorldPosition);
    plane.applyMatrix4(virtualCamera.matrixWorldInverse);
    clipPlane.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = virtualCamera.projectionMatrix;
    q.x = (Math.sign(clipPlane.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(clipPlane.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1.0;
    q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    clipPlane.multiplyScalar(2.0 / clipPlane.dot(q));
    pm.elements[2] = clipPlane.x;
    pm.elements[6] = clipPlane.y;
    pm.elements[10] = clipPlane.z + 1.0 - clipBias;
    pm.elements[14] = clipPlane.w;

    ground.visible = false;
    const old = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, virtualCamera);
    renderer.setRenderTarget(old);
    ground.visible = true;
  }
  return { update };
})();

/* ============================================================ architecture */
const stone = new THREE.MeshStandardMaterial({ color: 0xb3a284, roughness: 0.92, envMapIntensity: 0.35 });
const stoneDark = new THREE.MeshStandardMaterial({ color: 0x8d7d63, roughness: 0.95, envMapIntensity: 0.35 });
const bronze = new THREE.MeshStandardMaterial({ color: 0x8a6a3f, roughness: 0.3, metalness: 0.9, envMapIntensity: 1.3 });
const bronzeDark = new THREE.MeshStandardMaterial({ color: 0x4a4034, roughness: 0.5, metalness: 0.7, envMapIntensity: 1.0 });
const leafMat = new THREE.MeshStandardMaterial({ color: 0x50603c, roughness: 0.9, flatShading: true, envMapIntensity: 0.3 });
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x57452f, roughness: 0.95, envMapIntensity: 0.3 });

function box(w, h, d, mat, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.y = ry;
  m.castShadow = true; m.receiveShadow = true;
  scene.add(m); return m;
}

/* café deck (left) + back walkway + stairs */
const CAFE = { x: -24, y: 1.2, z: 2, w: 20, d: 26 };
box(CAFE.w, CAFE.y, CAFE.d, stone, CAFE.x, CAFE.y / 2, CAFE.z);
const WALK = { x: -2, y: 2.4, z: -19, w: 58, d: 11 };
box(WALK.w, WALK.y, WALK.d, stone, WALK.x, WALK.y / 2, WALK.z);

function stairs(x, z, width, rise, run, count, dirZ) {
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const h = rise * (i + 1);
    const s = new THREE.Mesh(new THREE.BoxGeometry(width, h, run), stoneDark);
    s.position.set(0, h / 2, dirZ * (run * (i + 0.5)));
    s.castShadow = true; s.receiveShadow = true;
    g.add(s);
  }
  g.position.set(x, 0, z);
  scene.add(g); return g;
}
stairs(-13.6, 4, 5, 0.2, 0.55, 6, 1);        // plaza -> café deck
stairs(2, -13.1, 6, 0.2, 0.55, 12, -1);       // plaza -> walkway

/* deck lip trims */
box(CAFE.w + 0.4, 0.12, CAFE.d + 0.4, stoneDark, CAFE.x, CAFE.y + 0.06, CAFE.z);
box(WALK.w + 0.4, 0.12, WALK.d + 0.4, stoneDark, WALK.x, WALK.y + 0.06, WALK.z);

/* railings along walkway + café edges */
{
  const postGeo = new THREE.BoxGeometry(0.07, 0.85, 0.07);
  const railMat = bronzeDark;
  const positions = [];
  for (let x = WALK.x - WALK.w / 2 + 0.4; x <= WALK.x + WALK.w / 2 - 0.4; x += 1.6)
    positions.push([x, WALK.y + 0.43, WALK.z + WALK.d / 2 - 0.25]);
  for (let z = CAFE.z - CAFE.d / 2 + 0.4; z <= CAFE.z + CAFE.d / 2 - 0.4; z += 1.6)
    positions.push([CAFE.x + CAFE.w / 2 - 0.25, CAFE.y + 0.43, z]);
  const inst = new THREE.InstancedMesh(postGeo, railMat, positions.length);
  const m4 = new THREE.Matrix4();
  positions.forEach((p, i) => { m4.makeTranslation(p[0], p[1], p[2]); inst.setMatrixAt(i, m4); });
  inst.castShadow = true;
  scene.add(inst);
  box(WALK.w - 0.6, 0.06, 0.08, railMat, WALK.x, WALK.y + 0.88, WALK.z + WALK.d / 2 - 0.25);
  box(0.08, 0.06, CAFE.d - 0.6, railMat, CAFE.x + CAFE.w / 2 - 0.25, CAFE.y + 0.88, CAFE.z);
}

/* planters + bushes */
const OBSTACLES = [{ x: 2, z: 4, r: 4.6 }];
function planter(x, z, w, d, onY = 0) {
  box(w, 0.65, d, stoneDark, x, onY + 0.32, z);
  const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(Math.min(w, d) * 0.42, 0), leafMat);
  bush.position.set(x, onY + 0.85, z); bush.scale.y = 0.7;
  bush.castShadow = true;
  scene.add(bush);
  OBSTACLES.push({ x, z, r: Math.max(w, d) * 0.5 + 0.4 });
}
planter(-8, 12.5, 5, 1.6);
planter(12, 13.5, 4, 1.6);
planter(-8, -9.5, 4, 1.6);
planter(16, -2, 1.6, 5);

/* kiosks with lit signage */
function kiosk(x, z, ry) {
  const g = new THREE.Group();
  const bodyM = new THREE.MeshStandardMaterial({ color: 0x9b8c70, roughness: 0.85 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.3, 1.8), bodyM);
  body.position.y = 1.15; body.castShadow = true; body.receiveShadow = true;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.12, 2.2), bronzeDark);
  roof.position.y = 2.4; roof.castShadow = true;
  const strip = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x2a4a4a, emissive: 0x6fd8cf, emissiveIntensity: 1.4 }));
  strip.position.set(0, 1.75, 0.93);
  g.add(body, roof, strip);
  g.position.set(x, 0, z); g.rotation.y = ry;
  scene.add(g);
  OBSTACLES.push({ x, z, r: 2.1 });
}
kiosk(9.5, 10.5, -0.35);
kiosk(-6, -6.5, 0.2);

/* lamps */
const lampHeads = [];
function lamp(x, z, real = false) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.3, 6), bronzeDark);
  post.position.y = 1.65; post.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x3a3a30, emissive: 0xffc873, emissiveIntensity: 2.2 }));
  head.position.y = 3.4;
  g.add(post, head);
  lampHeads.push(head);
  if (real) {
    const pl = new THREE.PointLight(0xffc873, 6, 12, 2);
    pl.position.y = 3.3; g.add(pl);
  }
  g.position.set(x, 0, z);
  scene.add(g);
  OBSTACLES.push({ x, z, r: 0.5 });
}
lamp(-11, 8, true); lamp(7, 14.5, true); lamp(15, 5.5); lamp(-12, -3, true); lamp(14, -7.5); lamp(-2, 15.5);

/* café: parasols + tables on the deck */
function parasol(x, z) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), bronzeDark);
  pole.position.y = 1.3;
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.65, 8, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xe9e2cf, roughness: 0.9, side: THREE.DoubleSide }));
  canopy.position.y = 2.7; canopy.castShadow = true;
  const table = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.5, 0.06, 10), stoneDark);
  table.position.y = 0.78; table.castShadow = true;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 6), bronzeDark);
  stem.position.y = 0.4;
  g.add(pole, canopy, table, stem);
  g.position.set(x, CAFE.y, z);
  scene.add(g);
}
parasol(-28, -2); parasol(-21, 5); parasol(-27, 8.5); parasol(-20, -6);

/* ============================================================ armillary sculpture */
const armillary = new THREE.Group();
{
  const base = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.7, 0.55, 28), stone);
  base.position.y = 0.27; base.receiveShadow = true; base.castShadow = true;
  const ringLight = new THREE.Mesh(new THREE.TorusGeometry(3.9, 0.06, 8, 40),
    new THREE.MeshStandardMaterial({ color: 0x3a3a30, emissive: 0xffd9a0, emissiveIntensity: 2.4 }));
  ringLight.rotation.x = Math.PI / 2; ringLight.position.y = 0.58;
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.15, 1.1, 12), stoneDark);
  pedestal.position.y = 1.05; pedestal.castShadow = true;
  armillary.add(base, ringLight, pedestal);

  const spin = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.85, 24, 18),
    new THREE.MeshStandardMaterial({ color: 0x2c2620, roughness: 0.25, metalness: 0.9 }));
  spin.add(core);
  const mkRing = (r, tube, rx, rz) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 10, 48), bronze);
    ring.rotation.set(rx, 0, rz);
    ring.castShadow = true;
    spin.add(ring); return ring;
  };
  spin.userData.rings = [mkRing(1.55, 0.09, Math.PI / 2, 0), mkRing(1.95, 0.07, Math.PI / 3, 0.6), mkRing(2.3, 0.06, Math.PI / 1.7, -0.5)];
  spin.position.y = 3.6;
  armillary.add(spin);
  armillary.userData.spin = spin;

  /* planter ring bushes */
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 + (i % 3) * 0.12, 0), leafMat);
    b.position.set(Math.cos(a) * 3.9, 0.85, Math.sin(a) * 3.9);
    b.scale.y = 0.65; b.castShadow = true;
    armillary.add(b);
  }
  armillary.position.set(2, 0, 4);
  scene.add(armillary);
}

/* ============================================================ billboard */
const bbCanvas = document.createElement('canvas');
bbCanvas.width = 512; bbCanvas.height = 288;
const bbCtx = bbCanvas.getContext('2d');
const bbTex = new THREE.CanvasTexture(bbCanvas);
bbTex.colorSpace = THREE.SRGBColorSpace;
let bbT = 0;
function drawBillboard(t) {
  const c = bbCtx, W = 512, H = 288;
  const grd = c.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#0d3b46'); grd.addColorStop(1, '#082730');
  c.fillStyle = grd; c.fillRect(0, 0, W, H);
  /* travelling wave lines */
  c.strokeStyle = 'rgba(111,216,207,0.5)'; c.lineWidth = 1.5;
  for (let k = 0; k < 3; k++) {
    c.beginPath();
    for (let x = 0; x <= W; x += 8) {
      const y = H * 0.72 + k * 14 + Math.sin(x * 0.02 + t * 1.4 + k * 1.7) * 10;
      x === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.stroke();
  }
  /* glyph */
  const cx = W / 2, cy = H * 0.36, pulse = 1 + Math.sin(t * 2) * 0.05;
  c.save(); c.translate(cx, cy); c.scale(pulse, pulse); c.rotate(Math.PI / 4);
  c.strokeStyle = '#e8c98a'; c.lineWidth = 5;
  c.strokeRect(-26, -26, 52, 52);
  c.rotate(-Math.PI / 4);
  c.beginPath(); c.arc(0, 0, 12 + Math.sin(t * 2.7) * 3, 0, Math.PI * 2);
  c.fillStyle = '#e8c98a'; c.fill();
  c.restore();
  c.fillStyle = '#e8c98a'; c.font = '600 34px Georgia'; c.textAlign = 'center';
  c.fillText('A U R E L I A', cx, H * 0.62);
  c.fillStyle = 'rgba(209,213,207,0.75)'; c.font = '11px monospace';
  c.fillText('MERIDIAN CITY · CIVIC BROADCAST · LIVE', cx, H * 0.68);
  /* scanlines */
  c.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = (t * 40) % 4; y < H; y += 4) c.fillRect(0, y, W, 1);
  bbTex.needsUpdate = true;
}
drawBillboard(0);
{
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(15.4, 8.8, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x3a3a32, roughness: 0.6, metalness: 0.4 }));
  frame.position.y = 5.6; frame.castShadow = true;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(14.4, 8.1),
    new THREE.MeshBasicMaterial({ map: bbTex, toneMapped: false }));
  screen.position.set(0, 5.6, 0.28);
  const feetL = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.2, 1.2), stoneDark);
  feetL.position.set(-5.5, 1.1, 0); feetL.castShadow = true;
  const feetR = feetL.clone(); feetR.position.x = 5.5;
  const planterBox = new THREE.Mesh(new THREE.BoxGeometry(16.4, 0.9, 2.2), stoneDark);
  planterBox.position.set(0, 0.45, 1.6); planterBox.castShadow = true; planterBox.receiveShadow = true;
  g.add(frame, screen, feetL, feetR, planterBox);
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45 + (i % 2) * 0.15, 0), leafMat);
    b.position.set(-7 + i * 2.3, 1.15, 1.6); b.scale.y = 0.6; b.castShadow = true;
    g.add(b);
  }
  g.position.set(18.5, 0, -8);
  g.rotation.y = -0.9;
  scene.add(g);
  OBSTACLES.push({ x: 18.5, z: -8, r: 6 });
}

/* ============================================================ trees */
const trees = [];
function tree(x, z, s = 1, onY = 0) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * s, 0.14 * s, 1.6 * s, 6), trunkMat);
  trunk.position.y = 0.8 * s; trunk.castShadow = true;
  g.add(trunk);
  const canopy = new THREE.Group();
  [[0, 2.1, 0, 1.05], [0.5, 1.75, 0.25, 0.7], [-0.45, 1.8, -0.2, 0.62]].forEach(([ox, oy, oz, r]) => {
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 0), leafMat);
    c.position.set(ox * s, oy * s, oz * s); c.castShadow = true;
    canopy.add(c);
  });
  g.add(canopy);
  g.position.set(x, onY, z);
  scene.add(g);
  trees.push({ canopy, phase: Math.random() * 6.28 });
  if (onY === 0) OBSTACLES.push({ x, z, r: 0.6 });
}
tree(-14, 14.5, 1.1); tree(17.5, 14.5, 0.95); tree(-13.5, -7.5, 1.2);
tree(9, -10.5, 1.05); tree(18.5, 10.5, 0.9); tree(-30, 14, 1.0, CAFE.y); tree(-18, 12.5, 0.85, CAFE.y);
tree(-30, -9, 0.95, CAFE.y); tree(-26, WALK.z, 1.1, WALK.y); tree(20, WALK.z, 1.0, WALK.y); tree(8, WALK.z - 1, 0.9, WALK.y);

/* ============================================================ people */
const WALK_BOUNDS = { x0: -14.5, x1: 17, z0: -11.5, z1: 15.5 };
function freePoint() {
  for (let tries = 0; tries < 40; tries++) {
    const x = WALK_BOUNDS.x0 + Math.random() * (WALK_BOUNDS.x1 - WALK_BOUNDS.x0);
    const z = WALK_BOUNDS.z0 + Math.random() * (WALK_BOUNDS.z1 - WALK_BOUNDS.z0);
    if (OBSTACLES.every(o => (x - o.x) ** 2 + (z - o.z) ** 2 > o.r * o.r)) return new THREE.Vector3(x, 0, z);
  }
  return new THREE.Vector3(0, 0, 10);
}
function makePerson(coat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.62, 3, 8),
    new THREE.MeshStandardMaterial({ color: coat, roughness: 0.85 }));
  body.position.y = 0.62; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xd9b28c, roughness: 0.7 }));
  head.position.y = 1.24; head.castShadow = true;
  g.add(body, head);
  scene.add(g);
  return g;
}
const COATS = [0xb8452f, 0xe8e0cc, 0x3f6d6a, 0xc9c9c9, 0x8a4a5a, 0x4a4a55, 0x75604a, 0x9d8360];
const people = [];
for (let i = 0; i < 13; i++) {
  const mesh = makePerson(COATS[i % COATS.length]);
  const p = freePoint(); mesh.position.copy(p);
  people.push({ mesh, target: freePoint(), speed: 0.75 + Math.random() * 0.7, pause: Math.random() * 4, phase: Math.random() * 6.28 });
}
/* the amber figure you steer */
const player = { mesh: makePerson(0xe8a33d), target: null, speed: 1.7, phase: 0 };
player.mesh.position.set(-4, 0, 9);
scene.add(player.mesh);
const marker = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.45, 24),
  new THREE.MeshBasicMaterial({ color: 0xe8a33d, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
marker.rotation.x = -Math.PI / 2; marker.position.y = 0.03; marker.visible = false;
marker.layers.set(2);
scene.add(marker);

function steer(p, dt, t) {
  if (!p.target) return;
  const m = p.mesh.position;
  const dx = p.target.x - m.x, dz = p.target.z - m.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.25) {
    p.mesh.rotation.y += (Math.random() - 0.5) * dt;
    p.mesh.position.y = 0;
    return true;
  }
  const want = Math.atan2(dx, dz);
  let cur = p.mesh.rotation.y;
  let diff = ((want - cur + Math.PI) % (Math.PI * 2)) - Math.PI;
  p.mesh.rotation.y = cur + diff * Math.min(1, dt * 8);
  m.x += Math.sin(p.mesh.rotation.y) * p.speed * dt;
  m.z += Math.cos(p.mesh.rotation.y) * p.speed * dt;
  p.phase = (p.phase || 0) + dt * p.speed * 5;
  p.mesh.position.y = Math.abs(Math.sin(p.phase)) * 0.05;
  p.mesh.rotation.z = Math.sin(p.phase) * 0.04;
  return false;
}

/* ============================================================ rain / dust / birds / shafts */
const rainGroup = new THREE.Group(); scene.add(rainGroup); rainGroup.layers.set(2);
let rainPts;
{
  const N = 1400;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 70;
    pos[i * 3 + 1] = Math.random() * 26;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 60;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const c = document.createElement('canvas'); c.width = 8; c.height = 32;
  const cx = c.getContext('2d');
  const lg = cx.createLinearGradient(0, 0, 0, 32);
  lg.addColorStop(0, 'rgba(200,215,220,0)'); lg.addColorStop(0.5, 'rgba(200,215,220,0.9)'); lg.addColorStop(1, 'rgba(200,215,220,0)');
  cx.fillStyle = lg; cx.fillRect(3, 0, 2, 32);
  const tex = new THREE.CanvasTexture(c);
  rainPts = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.55, map: tex, transparent: true, opacity: 0.5, depthWrite: false,
    blending: THREE.AdditiveBlending, color: 0xbfd4d9
  }));
  rainPts.layers.set(2);
  rainGroup.add(rainPts);
  rainGroup.visible = false;
}
const dust = (() => {
  const N = 260, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 60;
    pos[i * 3 + 1] = Math.random() * 14 + 0.5;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 45;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.05, transparent: true, opacity: 0.35, depthWrite: false,
    blending: THREE.AdditiveBlending, color: 0xffe3b0
  }));
  pts.layers.set(2);
  scene.add(pts);
  return pts;
})();
const shafts = new THREE.Group(); scene.add(shafts);
{
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uA: { value: 0.10 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec2 vUv; uniform float uA;
      void main(){ float a = (1.0 - vUv.y) * vUv.y * 4.0 * uA * smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
        gl_FragColor = vec4(1.0, 0.87, 0.62, a); }`
  });
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(5 + i * 1.5, 34), mat);
    p.position.set(8 + i * 7, 13, -6 + i * 4);
    p.rotation.z = 0.5; p.rotation.y = -0.35;
    p.layers.set(2);
    shafts.add(p);
  }
}
const birds = [];
{
  const mat = new THREE.MeshBasicMaterial({ color: 0x2c2a24, side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Group();
    const w1 = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.28), mat);
    const w2 = w1.clone();
    w1.position.x = -0.42; w2.position.x = 0.42;
    b.add(w1, w2);
    b.userData = { w1, w2, r: 34 + i * 9, h: 17 + i * 3.5, sp: 0.05 + Math.random() * 0.04, ph: Math.random() * 6.28 };
    scene.add(b); birds.push(b);
  }
}

/* ============================================================ audio */
let actx = null, master = null, muted = false;
function initAudio() {
  if (actx) return;
  actx = new (window.AudioContext || window.webkitAudioContext)();
  master = actx.createGain(); master.gain.value = 0.85; master.connect(actx.destination);
  /* wind */
  const len = actx.sampleRate * 4;
  const buf = actx.createBuffer(1, len, actx.sampleRate);
  const ch = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; ch[i] = last * 3.2; }
  const src = actx.createBufferSource(); src.buffer = buf; src.loop = true;
  const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
  const wg = actx.createGain(); wg.gain.value = 0.16;
  src.connect(lp).connect(wg).connect(master); src.start();
  /* hum */
  const hum = actx.createOscillator(); hum.frequency.value = 88; hum.type = 'sine';
  const hg = actx.createGain(); hg.gain.value = 0.014;
  hum.connect(hg).connect(master); hum.start();
  /* droplet plinks */
  const dly = actx.createDelay(0.6); dly.delayTime.value = 0.31;
  const fb = actx.createGain(); fb.gain.value = 0.3;
  dly.connect(fb).connect(dly); dly.connect(master);
  (function plink() {
    if (!muted) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = 900 + Math.random() * 1600;
      g.gain.setValueAtTime(0.05 + Math.random() * 0.04, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.35);
      o.connect(g); g.connect(master); g.connect(dly);
      o.start(); o.stop(actx.currentTime + 0.4);
    }
    setTimeout(plink, 500 + Math.random() * 2600);
  })();
}

/* ============================================================ interaction */
const ray = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let pdown = null;
renderer.domElement.addEventListener('pointerdown', e => { pdown = [e.clientX, e.clientY]; initAudio(); });
renderer.domElement.addEventListener('pointerup', e => {
  if (!pdown) return;
  const moved = Math.hypot(e.clientX - pdown[0], e.clientY - pdown[1]);
  pdown = null;
  if (moved > 6) return;
  const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = new THREE.Vector3();
  if (!ray.ray.intersectPlane(groundPlane, hit)) return;
  hit.x = THREE.MathUtils.clamp(hit.x, WALK_BOUNDS.x0, WALK_BOUNDS.x1);
  hit.z = THREE.MathUtils.clamp(hit.z, WALK_BOUNDS.z0, WALK_BOUNDS.z1);
  hit.y = 0;
  for (const o of OBSTACLES) {
    const dx = hit.x - o.x, dz = hit.z - o.z, d = Math.hypot(dx, dz);
    if (d < o.r) { hit.x = o.x + (dx / (d || 1)) * o.r; hit.z = o.z + (dz / (d || 1)) * o.r; }
  }
  player.target = hit.clone();
  marker.position.set(hit.x, 0.03, hit.z);
  marker.visible = true;
});

/* zoom slider */
const zoomr = document.getElementById('zoomr');
zoomr.addEventListener('input', () => {
  const dist = THREE.MathUtils.lerp(46, 14, zoomr.value / 100);
  const dir = camera.position.clone().sub(controls.target).normalize();
  camera.position.copy(controls.target).addScaledVector(dir, dist);
});
controls.addEventListener('change', () => {
  const d = camera.position.distanceTo(controls.target);
  zoomr.value = String(Math.round(((46 - d) / 32) * 100));
});

/* mode toggle */
let mode = 'after';
const mRain = document.getElementById('m-rain'), mAfter = document.getElementById('m-after');
function setMode(m) {
  mode = m;
  mRain.classList.toggle('on', m === 'rain');
  mAfter.classList.toggle('on', m === 'after');
}
mRain.addEventListener('click', () => setMode('rain'));
mAfter.addEventListener('click', () => setMode('after'));

/* buttons */
const btnSound = document.getElementById('btn-sound');
btnSound.addEventListener('click', () => {
  initAudio(); muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.85;
  btnSound.classList.toggle('on', !muted);
});
let paused = false;
const btnPause = document.getElementById('btn-pause');
btnPause.addEventListener('click', () => { paused = !paused; btnPause.classList.toggle('on', paused); });
document.getElementById('btn-full').addEventListener('click', () => {
  document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
});
const about = document.getElementById('about');
document.getElementById('btn-about').addEventListener('click', () => about.classList.add('open'));
document.getElementById('about-x').addEventListener('click', () => about.classList.remove('open'));
about.addEventListener('click', e => { if (e.target === about) about.classList.remove('open'); });

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ============================================================ loop */
const clock = new THREE.Clock();
let frames = 0, fpsT = 0;
const stats = document.getElementById('stats');
let booted = false;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (!paused) {
    /* wetness drifts with mode */
    const wantWet = mode === 'rain' ? 0.92 : 0.55;
    groundUniforms.uWet.value += (wantWet - groundUniforms.uWet.value) * Math.min(1, dt * 0.5);
    groundUniforms.uTime.value = t;
    rainGroup.visible = mode === 'rain';
    if (rainGroup.visible) {
      const p = rainPts.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) - dt * 17;
        if (y < 0) y += 26;
        p.setY(i, y);
      }
      p.needsUpdate = true;
    }
    const sd = dust.geometry.attributes.position;
    for (let i = 0; i < sd.count; i++) {
      let y = sd.getY(i) - dt * 0.18;
      if (y < 0.2) y += 14;
      sd.setY(i, y);
      sd.setX(i, sd.getX(i) + Math.sin(t * 0.4 + i) * dt * 0.05);
    }
    sd.needsUpdate = true;

    const spin = armillary.userData.spin;
    spin.rotation.y += dt * 0.22;
    spin.userData.rings[1].rotation.x += dt * 0.13;
    spin.userData.rings[2].rotation.z -= dt * 0.09;

    for (const tr of trees) tr.canopy.rotation.z = Math.sin(t * 0.8 + tr.phase) * 0.022;

    for (const b of birds) {
      const u = b.userData;
      const a = t * u.sp + u.ph;
      b.position.set(Math.cos(a) * u.r, u.h + Math.sin(t * 0.6 + u.ph) * 1.5, Math.sin(a) * u.r * 0.7);
      b.rotation.y = -a;
      const flap = Math.sin(t * 6 + u.ph) * 0.5;
      u.w1.rotation.z = flap; u.w2.rotation.z = -flap;
    }

    for (const p of people) {
      if (p.pause > 0) { p.pause -= dt; continue; }
      if (steer(p, dt, t)) { p.target = freePoint(); p.pause = 0.5 + Math.random() * 4.5; }
    }
    if (player.target) {
      if (steer(player, dt, t)) { player.target = null; marker.visible = false; }
    }
    if (marker.visible) {
      const s = 1 + Math.sin(t * 5) * 0.15;
      marker.scale.set(s, s, s);
      marker.material.opacity = 0.55 + Math.sin(t * 5) * 0.3;
    }
    bbT += dt;
  }

  controls.update();
  if (DBG !== 'noref') reflection.update();
  renderer.render(scene, camera);

  frames++;
  fpsT += dt;
  if (fpsT > 0.5) {
    stats.innerHTML = `<b>${Math.round(frames / fpsT)} fps</b> · high · three r160`;
    frames = 0; fpsT = 0;
  }
  if (!booted) { booted = true; setTimeout(() => document.getElementById('boot').classList.add('gone'), 350); }
}
setInterval(() => drawBillboard(bbT), 120);
tick();

/* deterministic RNG for skyline */
function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
