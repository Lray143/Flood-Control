/**
 * 3D Floating Player Hero on Landing Page Hydrodynamic Water
 * Loads the 3D model with detailed face texture, sets up PBR lighting,
 * and synchronizes buoyancy, wave-tilt, drift, and splash interactions.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

(function () {
    const canvas = document.getElementById('floating-3d-canvas');
    if (!canvas) return;

    let width = window.innerWidth;
    let height = window.innerHeight;

    // ── THREE.JS SETUP ───────────────────────────────────────────────────────
    const scene = new THREE.Scene();

    // Orthographic camera for 1:1 pixel coordinate matching with 2D water canvas
    const camera = new THREE.OrthographicCamera(
        -width / 2, width / 2,
        height / 2, -height / 2,
        1, 2000
    );
    camera.position.set(0, 0, 500);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;

    // ── LIGHTING ─────────────────────────────────────────────────────────────
    // Ambient soft light to evenly illuminate textures
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.2);
    scene.add(ambientLight);

    // Warm key light
    const keyLight = new THREE.DirectionalLight(0xfff6ec, 2.6);
    keyLight.position.set(150, 300, 250);
    scene.add(keyLight);

    // Cool fill light
    const fillLight = new THREE.DirectionalLight(0xd8edff, 1.4);
    fillLight.position.set(-200, 150, 150);
    scene.add(fillLight);

    // Cyan hydro rim light (simulating glowing water reflection from below)
    const rimLight = new THREE.DirectionalLight(0x00f2fe, 2.4);
    rimLight.position.set(0, -180, 100);
    scene.add(rimLight);

    // ── RESCUE LIFEBUOY / SWIM RING (around waist) ──────────────────────────
    function createSwimRing() {
        const ringGeo = new THREE.TorusGeometry(32, 10, 24, 48);
        ringGeo.rotateX(Math.PI / 2);

        // Procedural nautical safety stripe texture
        const ringCanvas = document.createElement('canvas');
        ringCanvas.width = 512;
        ringCanvas.height = 128;
        const rctx = ringCanvas.getContext('2d');

        // Bright rescue orange-red
        rctx.fillStyle = '#ff3b30';
        rctx.fillRect(0, 0, 512, 128);

        // White reflective segments
        rctx.fillStyle = '#ffffff';
        rctx.fillRect(50, 0, 75, 128);
        rctx.fillRect(180, 0, 75, 128);
        rctx.fillRect(310, 0, 75, 128);
        rctx.fillRect(440, 0, 75, 128);

        // Subtle seam lines
        rctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        rctx.fillRect(0, 0, 512, 4);
        rctx.fillRect(0, 124, 512, 4);

        const ringTex = new THREE.CanvasTexture(ringCanvas);
        ringTex.wrapS = THREE.RepeatWrapping;

        const ringMat = new THREE.MeshStandardMaterial({
            map: ringTex,
            roughness: 0.35,
            metalness: 0.1
        });

        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.y = 2;
        return ringMesh;
    }

    // ── 3D PLAYER CONTAINER ──────────────────────────────────────────────────
    const playerGroup = new THREE.Group();
    scene.add(playerGroup);

    const swimRing = createSwimRing();
    playerGroup.add(swimRing);

    let isLoaded = false;
    let playerModel = null;

    // Load .GLB Model
    const loader = new GLTFLoader();
    loader.load(
        '/landing/models/player.glb',
        (gltf) => {
            playerModel = gltf.scene;

            // Tune materials so face and jersey textures are vivid and crisp
            playerModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    if (child.material) {
                        child.material.side = THREE.DoubleSide;
                        if (child.material.metalness !== undefined) {
                            child.material.metalness = 0.08;
                        }
                        if (child.material.roughness !== undefined) {
                            child.material.roughness = 0.65;
                        }
                        child.material.needsUpdate = true;
                    }
                }
            });

            // Model height is normalized ~1.0 unit (Y: -0.5 to +0.5).
            // New model is wider (X ±0.29). Scale to 185px so it looks full-bodied.
            const modelScale = 185;
            playerModel.scale.set(modelScale, modelScale, modelScale);

            // Sit the model so the waist/lower torso rests on the swim ring.
            // Head at +0.5 → at modelScale=185, head is 92px above center.
            // We raise by 40px so feet don't dip below the water surface.
            playerModel.position.set(0, 40, 0);

            playerGroup.add(playerModel);
            isLoaded = true;

            // Initial splash upon entering water
            if (window.HydroWater) {
                const initSurfaceY = window.HydroWater.getSurfaceY(playerScreenX);
                window.HydroWater.createSplash(playerScreenX, initSurfaceY, 8);
            }
        },
        undefined,
        (err) => {
            console.error('Failed to load 3D player model:', err);
        }
    );

    // ── BUOYANCY, WAVE SYNCHRONIZATION & INTERACTION ─────────────────────────
    let playerScreenX = width * 0.42;
    let driftSpeed = 0.36; // px per frame
    let bounceY = 0;
    let bounceVy = 0;
    let clickWobble = 0;
    let clickWobbleVy = 0;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartPlayerX = 0;
    let rippleTick = 0;

    function resize() {
        width = window.innerWidth;
        height = window.innerHeight;

        camera.left = -width / 2;
        camera.right = width / 2;
        camera.top = height / 2;
        camera.bottom = -height / 2;
        camera.updateProjectionMatrix();

        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }

    window.addEventListener('resize', resize);

    // ── INTERACTIVE MOUSE / TOUCH EVENTS ─────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const mouseCoord = new THREE.Vector2(-1000, -1000);

    function triggerBounceAndSplash() {
        bounceVy = -8.5;
        clickWobbleVy = 0.12; // Gentle front-facing celebratory wobble (never spins backward)
        if (window.HydroWater) {
            const surfaceY = window.HydroWater.getSurfaceY(playerScreenX);
            window.HydroWater.createSplash(playerScreenX, surfaceY, 15);
            window.HydroWater.createRipple(playerScreenX, surfaceY);
        }
    }

    window.addEventListener('pointerdown', (e) => {
        // Respect navigation buttons and interactive links
        if (e.target.closest('a, button, input, [role="button"]')) {
            return;
        }

        // Convert client coord to normalized device coord (-1 to +1)
        mouseCoord.x = (e.clientX / width) * 2 - 1;
        mouseCoord.y = -(e.clientY / height) * 2 + 1;

        raycaster.setFromCamera(mouseCoord, camera);
        const intersects = raycaster.intersectObjects(playerGroup.children, true);

        if (intersects.length > 0) {
            isDragging = true;
            dragStartX = e.clientX;
            dragStartPlayerX = playerScreenX;
            triggerBounceAndSplash();
        }
    });

    window.addEventListener('pointermove', (e) => {
        if (isDragging) {
            const deltaX = e.clientX - dragStartX;
            playerScreenX = dragStartPlayerX + deltaX;
            if (playerScreenX < 50) playerScreenX = 50;
            if (playerScreenX > width - 50) playerScreenX = width - 50;
        } else {
            // Check hover for cursor pointer style
            mouseCoord.x = (e.clientX / width) * 2 - 1;
            mouseCoord.y = -(e.clientY / height) * 2 + 1;
            raycaster.setFromCamera(mouseCoord, camera);
            const intersects = raycaster.intersectObjects(playerGroup.children, true);
            if (intersects.length > 0) {
                document.body.style.cursor = 'pointer';
            } else if (document.body.style.cursor === 'pointer') {
                document.body.style.cursor = '';
            }
        }
    });

    window.addEventListener('pointerup', () => {
        if (isDragging) {
            isDragging = false;
            document.body.style.cursor = '';
        }
    });

    // ── ANIMATION LOOP ───────────────────────────────────────────────────────
    function animate() {
        requestAnimationFrame(animate);

        if (!isDragging) {
            playerScreenX += driftSpeed;
            if (playerScreenX > width + 100) {
                playerScreenX = -100;
            }
        }

        let surfaceY = height - height / 6;
        let waveAngle = 0;
        let time = performance.now() * 0.001;

        if (window.HydroWater) {
            surfaceY = window.HydroWater.getSurfaceY(playerScreenX);
            waveAngle = window.HydroWater.getSurfaceAngle(playerScreenX);
            time = window.HydroWater.getTime();
        }

        // Buoyancy spring physics for click bounce
        if (bounceVy !== 0 || bounceY !== 0) {
            bounceY += bounceVy;
            bounceVy += 0.42; // water buoyancy gravity restoration
            if (bounceY >= 0) {
                bounceY = 0;
                bounceVy = 0;
                if (window.HydroWater) {
                    window.HydroWater.createSplash(playerScreenX, surfaceY, 6);
                    window.HydroWater.createRipple(playerScreenX, surfaceY);
                }
            }
        }

        // Front-facing damped spring wobble physics (always snaps back to center front)
        if (clickWobbleVy !== 0 || clickWobble !== 0) {
            clickWobble += clickWobbleVy;
            clickWobbleVy -= clickWobble * 0.16; // spring restoration pulling back to center
            clickWobbleVy *= 0.88; // damping friction
            if (Math.abs(clickWobble) < 0.002 && Math.abs(clickWobbleVy) < 0.002) {
                clickWobble = 0;
                clickWobbleVy = 0;
            }
        }

        // Gentle natural bobbing
        const naturalBob = Math.sin(time * 2.4) * 3.5;

        // Synchronize 3D position with screen coordinates
        playerGroup.position.x = playerScreenX - width / 2;
        playerGroup.position.y = (height / 2) - surfaceY + naturalBob + bounceY;

        // Wave pitch and roll (tilts naturally with water wave slope)
        playerGroup.rotation.z = -waveAngle * 0.85;
        playerGroup.rotation.x = Math.sin(time * 1.5) * 0.06;

        // Strictly front-facing yaw: micro-bobbing left/right (+- 12 deg max), never turning around
        const baseFrontYaw = Math.sin(time * 0.7) * 0.14;
        playerGroup.rotation.y = THREE.MathUtils.clamp(baseFrontYaw + clickWobble, -0.24, 0.24);

        // Periodic wake ripples as player floats
        rippleTick++;
        if (rippleTick % 32 === 0 && window.HydroWater) {
            window.HydroWater.createRipple(playerScreenX, surfaceY);
        }

        renderer.render(scene, camera);
    }

    animate();
})();
