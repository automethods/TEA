import {translate} from './locale.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Adapted from transport_logo_3d/web/logo-viewer.js for the TEA hero.
export async function startLogoViewer(viewport) {
  const status = viewport.querySelector('[role="status"]');
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    viewport.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.touches.ONE = null;
    controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;

    scene.add(new THREE.HemisphereLight(0xdce4ff, 0x605568, 1.8));
    const key = new THREE.DirectionalLight(0xffe1b5, 2.2);
    key.position.set(-8, 10, 12);
    scene.add(key);

    const gltf = await new GLTFLoader().loadAsync(new URL('../assets/models/transport-logo.glb', import.meta.url).href);
    const asset = gltf.scene;
    const hazardMaterials = new Set();
    const hazardGlows = [];
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 64;
    const glowContext = glowCanvas.getContext('2d');
    const glowGradient = glowContext.createRadialGradient(32, 32, 0, 32, 32, 32);
    glowGradient.addColorStop(0, 'rgba(255, 210, 90, 1)');
    glowGradient.addColorStop(0.2, 'rgba(255, 135, 0, 0.9)');
    glowGradient.addColorStop(0.55, 'rgba(255, 95, 0, 0.25)');
    glowGradient.addColorStop(1, 'rgba(255, 95, 0, 0)');
    glowContext.fillStyle = glowGradient;
    glowContext.fillRect(0, 0, 64, 64);
    const glowMaterial = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(glowCanvas), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    });
    asset.traverse(node => {
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (material?.name === 'Hazard amber lens') hazardMaterials.add(material);
      }
      if (node.isMesh && node.name.includes('hazard_indicator')) {
        node.geometry.computeBoundingBox();
        const glow = new THREE.Sprite(glowMaterial);
        node.geometry.boundingBox.getCenter(glow.position);
        const direction = node.name.includes('front') ? 1 : -1;
        glow.position.addScaledVector(new THREE.Vector3(-0.454, 0.880, 0.142), direction * 0.012);
        glow.scale.setScalar(0.12);
        hazardGlows.push(glow);
        node.add(glow);
      }
    });
    let hazardOn;
    // Blender's XY emblem plane becomes XZ in glTF. Stand it upright.
    asset.rotation.x = Math.PI / 2;
    asset.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(asset);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    asset.position.sub(center);
    const model = new THREE.Group();
    model.add(asset);
    scene.add(model);

    let fitDistance = 1;
    let automatic = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    let elapsed = 0;
    let visible = true;
    let dirty = true;
    let previousTime = 0;
    let lastRenderTime = 0;
    controls.addEventListener('change', () => { dirty = true; });
    function updateMotion() {
      viewport.dataset.motion = automatic ? 'running' : 'paused';
    }
    function reset() {
      const halfAngle = THREE.MathUtils.degToRad(camera.fov / 2);
      fitDistance = Math.max(size.y / (2 * Math.tan(halfAngle)),
        size.x / (2 * Math.tan(halfAngle) * camera.aspect)) * 1.02 + size.z * 0.5;
      controls.target.set(0, 0, 0);
      camera.position.set(fitDistance * 0.10, fitDistance * 0.14, fitDistance);
      controls.minDistance = fitDistance * 0.55;
      controls.maxDistance = fitDistance * 2.2;
      model.rotation.set(0, 0, 0);
      elapsed = 0;
      dirty = true;
      controls.update();
    }
    let width = 0, height = 0;
    function resize() {
      if (!viewport.clientWidth || !viewport.clientHeight) return;
      if (width === viewport.clientWidth && height === viewport.clientHeight) return;
      width = viewport.clientWidth;
      height = viewport.clientHeight;
      renderer.setSize(viewport.clientWidth, viewport.clientHeight);
      camera.aspect = viewport.clientWidth / viewport.clientHeight;
      camera.updateProjectionMatrix();
      reset();
    }
    new ResizeObserver(resize).observe(viewport);
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      dirty = true;
      previousTime = 0;
    }).observe(viewport);

    controls.addEventListener('start', () => {
      automatic = false;
      updateMotion();
    });
    viewport.addEventListener('keydown', event => {
      if (event.target !== viewport) return;
      const directions = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0],
        ArrowUp: [0, -0.12], ArrowDown: [0, 0.12] };
      if (!directions[event.key] && !['+', '=', '-'].includes(event.key)) return;
      event.preventDefault();
      automatic = false;
      updateMotion();
      const offset = camera.position.clone().sub(controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      if (directions[event.key]) {
        spherical.theta += directions[event.key][0];
        spherical.phi = THREE.MathUtils.clamp(spherical.phi + directions[event.key][1], 0.1, Math.PI - 0.1);
      } else {
        spherical.radius = THREE.MathUtils.clamp(spherical.radius * (event.key === '-' ? 1.1 : 0.9),
          controls.minDistance, controls.maxDistance);
      }
      camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
      controls.update();
    });
    renderer.setAnimationLoop(time => {
      if (!visible || document.hidden) { previousTime = 0; return; }
      if (time - lastRenderTime < 1000 / 30) return;
      lastRenderTime = time;
      const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.1) : 0;
      previousTime = time;
      const blink = Math.floor(time / 500) % 2 === 0;
      if (blink !== hazardOn) {
        hazardOn = blink;
        for (const material of hazardMaterials) material.emissiveIntensity = blink ? 16 : 0;
        for (const glow of hazardGlows) glow.visible = blink;
        viewport.dataset.hazards = blink ? 'on' : 'off';
        dirty = true;
      }
      if (automatic) {
        elapsed += delta;
        model.rotation.y = Math.sin(elapsed * 0.38) * 0.30;
        model.rotation.x = Math.sin(elapsed * 0.25) * 0.07;
        dirty = true;
      }
      controls.update();
      if (dirty) {
        renderer.render(scene, camera);
        dirty = false;
      }
    });
    renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      renderer.setAnimationLoop(null);
      viewport.dataset.loaded = 'false';
      status.textContent = translate('З’єднання з графікою перервано. Оновіть сторінку.');
    });
    updateMotion();
    resize();
    renderer.render(scene, camera);
    status.textContent = '';
    viewport.dataset.loaded = 'true';
    viewport.setAttribute('aria-busy', 'false');
  } catch (error) {
    viewport.dataset.loaded = 'false';
    status.textContent = translate('3D емблема недоступна.');
    viewport.setAttribute('aria-busy', 'false');
    console.error('Logo viewer:', error);
  }
}
