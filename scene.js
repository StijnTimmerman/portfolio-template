import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

/* =============================================================================
   BACKGROUND 3D SCENE
   -----------------------------------------------------------------------------
   This is the animated WebGL background. It is built to be SWAPPABLE: you only
   need to touch two things to make it your own —

     1. CONFIG          — colors, fog, bloom strength.
     2. buildScene(...) — the actual objects + a per-frame update() callback.

   Everything below the "BOILERPLATE" line (renderer, scroll tracking, pointer
   parallax, resize, reduced-motion handling, WebGL fallback) keeps working
   regardless of what you put in buildScene(), so you can drop in any Three.js
   scene without rewiring the page.

   The default scene is intentionally simple and readable: a drifting particle
   field with a slowly rotating wireframe shape, lit by an additive glow. Use it
   as a starting point or delete its body and build your own.
   ========================================================================== */

const CONFIG = {
  background: 0x06060b, // page background behind the scene (match your CSS)
  fogDensity: 0.025, // 0 = no depth fade; higher = objects fade sooner
  bloom: 0.75, // glow strength (0 disables the bloom pass)
  colorA: 0x6a58e8, // primary accent
  colorB: 0x1ba8cc, // secondary accent
  particles: 1400, // particle count (auto-halved on small screens)
};

/* ┌──────────────────────────────────────────────────────────────────────────┐
   │  YOUR SCENE — replace everything inside buildScene().                      │
   │  Add meshes/points to `scene`, then return an object with update().        │
   │    update(time, scroll, pointer):                                          │
   │      time    — seconds since load                                          │
   │      scroll  — page scroll progress 0..1                                   │
   │      pointer — { x, y } smoothed cursor, each roughly -1..1                 │
   └──────────────────────────────────────────────────────────────────────────┘ */
function buildScene(scene, camera, opts) {
  const { small } = opts;
  const a = new THREE.Color(CONFIG.colorA);
  const b = new THREE.Color(CONFIG.colorB);

  // A rotating wireframe shape as the focal point.
  const shape = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.4, 1),
    new THREE.MeshBasicMaterial({ color: a, wireframe: true, transparent: true, opacity: 0.85 })
  );
  scene.add(shape);

  // A drifting particle field for depth.
  const count = small ? CONFIG.particles / 2 : CONFIG.particles;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 60;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 40;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
    const c = a.clone().lerp(b, Math.random());
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  dustGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  scene.add(dust);

  camera.position.set(0, 0, 18);

  return {
    update(t, scroll, pointer) {
      shape.rotation.x = t * 0.15 + pointer.y * 0.3;
      shape.rotation.y = t * 0.2 + pointer.x * 0.3;
      dust.rotation.y = t * 0.02;
      // Scroll dollies the camera in and nudges it with the cursor.
      camera.position.z = 18 - scroll * 9;
      camera.position.x += (pointer.x * 1.5 - camera.position.x) * 0.05;
      camera.position.y += (-pointer.y * 1.0 - camera.position.y) * 0.05;
      camera.lookAt(0, 0, 0);
    },
  };
}

/* ============================== BOILERPLATE ==============================
   You normally don't need to edit anything below this line.
   ======================================================================= */
const canvas = document.getElementById("bg-canvas");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const small = window.matchMedia("(max-width: 768px)").matches;

try {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.background);
  if (CONFIG.fogDensity > 0) scene.fog = new THREE.FogExp2(CONFIG.background, CONFIG.fogDensity);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 220);

  const view = buildScene(scene, camera, { small });

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (CONFIG.bloom > 0) {
    composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      small ? CONFIG.bloom * 0.7 : CONFIG.bloom, 0.85, 0.2
    ));
  }

  const pointer = { x: 0, y: 0 };
  let px = 0, py = 0, smooth = 0;
  if (!small && !reduceMotion) {
    window.addEventListener("pointermove", (e) => {
      pointer.x = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.y = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });
  }

  function scrollPct() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return max > 0 ? Math.min(Math.max((window.scrollY || 0) / max, 0), 1) : 0;
  }

  const clock = new THREE.Clock();
  function frame(scroll) {
    px += (pointer.x - px) * 0.045;
    py += (pointer.y - py) * 0.045;
    view.update(clock.getElapsedTime(), scroll, { x: px, y: py });
    composer.render();
  }

  function animate() {
    requestAnimationFrame(animate);
    smooth += (scrollPct() - smooth) * 0.06;
    frame(smooth);
  }

  if (reduceMotion) {
    // Still frame that only follows the scrollbar — respects the user's setting.
    frame(scrollPct());
    window.addEventListener("scroll", () => frame(scrollPct()), { passive: true });
  } else {
    animate();
  }
  canvas.classList.add("ready");

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.5 : 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    if (reduceMotion) frame(scrollPct());
  });
} catch (err) {
  // No WebGL → remove the canvas so the CSS fallback background shows through.
  canvas.remove();
}
