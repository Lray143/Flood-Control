import * as THREE from 'three';
        import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

        // ─── RENDERER ────────────────────────────────────────────────────────
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        document.body.appendChild(renderer.domElement);
        if (window.lucide) {
            lucide.createIcons();
        }

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a121e);
        scene.fog = new THREE.FogExp2(0x0a121e, 0.0010);

        const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.5, 5000);
        camera.position.set(345, 400, 190.1);   // slightly offset Z prevents random rotation flip

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(345, 8, 190);     // center of 690x380 grid (Barangay 168 Google Maps boundary)
        controls.enableDamping = true;
        controls.maxPolarAngle = Math.PI / 2;
        controls.maxDistance = 500;           // limit max zoom-out to keep terrain filling the screen
        controls.minDistance = 30;            // prevent zooming too close
        controls.enableRotate = false;        // start in 2D — no rotation
        controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
        controls.update();

        // ─── LIGHTS ──────────────────────────────────────────────────────────
        scene.add(new THREE.HemisphereLight(0xc8e8ff, 0x8aaf70, 0.7));
        const sun = new THREE.DirectionalLight(0xfff5e0, 1.4);
        sun.position.set(345, 500, -100);
        sun.castShadow = true;
        sun.shadow.mapSize.set(4096, 4096);
        sun.shadow.camera.left = -360; sun.shadow.camera.right = 360;
        sun.shadow.camera.top = 210; sun.shadow.camera.bottom = -210;
        scene.add(sun);
        sun.target.position.set(345, 0, 190);
        scene.add(sun.target);
        scene.add(new THREE.DirectionalLight(0x8888ff, 0.3)).position.set(-80, 100, -80);

        // ─── GLOBALS ─────────────────────────────────────────────────────────
        let nx = 0, ny = 0, terrainElev = null;
        let terrainMesh, waterMesh, rainMesh;
        let origColors, elevColors;
        window.roadCells = [];              // flat vertex indices of road cells
        window.grassColors = null;           // Float32Array — grass colour for every vertex
        let is2DView = true, showElev = false, glassMode = false;
        let playing = false, simSpeed = 1, currentRain = 0, MAIN_BLOCK_ID = 0;
        let waterDepthTex, waterDepthData;
        let gridHelper = null;
        let buildingMeshes = [];   // refs to InstancedMeshes so X-Ray can hide them
        let treeMeshes = [];       // refs to tree InstancedMeshes for X-Ray and layer toggles

        let borderMesh = null;
        let zoneBorderLines = null;
        let zoneLabelsGroup = new THREE.Group();
        scene.add(zoneLabelsGroup);
        let zoneLabelSprites = {};
        let mapLabelsGroup = new THREE.Group();
        scene.add(mapLabelsGroup);
        let _lastTableUpdate = 0;

        // ─── LOAD TERRAIN ────────────────────────────────────────────────────
        fetch('/api/terrain?t=' + Date.now()).then(r => r.json()).then(d => {
            ny = d.shape[0]; nx = d.shape[1];
            MAIN_BLOCK_ID = d.main_blockage_id;
            terrainElev = new Float32Array(ny * nx);
            for (let i = 0; i < ny * nx; i++) terrainElev[i] = d.elevation[Math.floor(i / nx)][i % nx];
            window.zoneGrid = d.zone_grid ? new Int8Array(d.zone_grid.flat()) : null;
            window.zoneList = d.zones || [];
            window.borderMask = d.border_mask || null;

            buildTerrain(d);
            buildWater();
            buildRain();
            buildGrid();
            buildPipes(d.nodes, d.pipes);
            buildBuildings(d);
            buildTrees(d.trees);
            drawBorderLine(d);
            drawZoneBorders(d);
            buildZoneLabels(d.zones);
            buildMapLabels(d.map_labels);
            document.getElementById('loading').style.display = 'none';
        }).catch(err => {
            console.error('Initialization error:', err);
            const l = document.getElementById('loading');
            if (l) l.style.display = 'none';
        });

        // ─── BUILDERS ────────────────────────────────────────────────────────
        function buildGrid() {
            // GridHelper at Y=0 — we'll use depthTest:false so it always renders on top
            const gSize = Math.max(nx, ny);
            const gDiv = Math.max(10, Math.round(gSize / 10));
            gridHelper = new THREE.GridHelper(gSize, gDiv, 0xffffff, 0xffffff);
            gridHelper.position.set(nx * 0.5, 0, ny * 0.5);
            gridHelper.material.opacity = 0.18;
            gridHelper.material.transparent = true;
            gridHelper.material.depthTest = false;   // Always draw on top of terrain
            gridHelper.renderOrder = 2;
            const chkG = document.getElementById('chk-grid');
            gridHelper.visible = chkG ? chkG.checked : true;
            scene.add(gridHelper);
        }

        function buildTerrain(d) {
            const geo = new THREE.BufferGeometry();
            const pos = new Float32Array(ny * nx * 3);
            origColors = new Float32Array(ny * nx * 3);
            elevColors = new Float32Array(ny * nx * 3);
            window.roadCells = [];
            window.grassColors = new Float32Array(ny * nx * 3);
            window.roadColors = null;   // filled after origColors is complete (see below)

            let minE = 1e9, maxE = -1e9;
            for (let r = 0; r < ny; r++) {
                for (let c = 0; c < nx; c++) {
                    const i = r * nx + c;
                    const isInside = d.border_mask ? d.border_mask[r][c] : true;
                    if (isInside) {
                        if (terrainElev[i] < minE) minE = terrainElev[i];
                        if (terrainElev[i] > maxE) maxE = terrainElev[i];
                    }
                }
            }
            // Prevent divide by zero if flat
            if (maxE === minE) maxE = minE + 1.0;

            // Precompute anti-aliased smooth road coverage to eliminate pixelated/jagged edges
            const rawRoadAlpha = new Float32Array(ny * nx);
            for (let r = 0; r < ny; r++) {
                for (let c = 0; c < nx; c++) {
                    if (d.road_mask && d.road_mask[r][c] > 0) {
                        rawRoadAlpha[r * nx + c] = 1.0;
                    }
                }
            }
            const smoothRoadAlpha = new Float32Array(ny * nx);
            for (let r = 0; r < ny; r++) {
                const rPrev = Math.max(0, r - 1) * nx;
                const rCurr = r * nx;
                const rNext = Math.min(ny - 1, r + 1) * nx;
                for (let c = 0; c < nx; c++) {
                    const cPrev = Math.max(0, c - 1);
                    const cNext = Math.min(nx - 1, c + 1);
                    const val =
                        rawRoadAlpha[rPrev + cPrev] * 0.05 + rawRoadAlpha[rPrev + c] * 0.10 + rawRoadAlpha[rPrev + cNext] * 0.05 +
                        rawRoadAlpha[rCurr + cPrev] * 0.10 + rawRoadAlpha[rCurr + c] * 0.40 + rawRoadAlpha[rCurr + cNext] * 0.10 +
                        rawRoadAlpha[rNext + cPrev] * 0.05 + rawRoadAlpha[rNext + c] * 0.10 + rawRoadAlpha[rNext + cNext] * 0.05;
                    smoothRoadAlpha[rCurr + c] = Math.min(1.0, val * 1.5);
                }
            }

            for (let r = 0; r < ny; r++) {
                for (let c = 0; c < nx; c++) {
                    const i = r * nx + c;
                    pos[i * 3] = c;
                    pos[i * 3 + 1] = terrainElev[i];
                    pos[i * 3 + 2] = r;

                    const isInside = d.border_mask ? d.border_mask[r][c] : true;

                    // Store grass color for every cell
                    const grassCol = new THREE.Color();
                    if (!isInside) {
                        grassCol.setHex(0x8a9a70);
                    } else {
                        grassCol.setHSL(0.28, 0.35, 0.42 + Math.random() * 0.06);
                    }
                    window.grassColors[i * 3] = grassCol.r;
                    window.grassColors[i * 3 + 1] = grassCol.g;
                    window.grassColors[i * 3 + 2] = grassCol.b;

                    const col = new THREE.Color();
                    const alpha = smoothRoadAlpha[i];

                    if (!isInside) {
                        col.copy(grassCol);
                    } else if (alpha > 0.03) {
                        // Determine road hierarchy level (check current cell or adjacent road cells if on edge)
                        let lvl = (d.road_mask && d.road_mask[r][c]) ? Number(d.road_mask[r][c]) : 0;
                        if (lvl === 0 && d.road_mask) {
                            lvl = Math.max(
                                d.road_mask[Math.max(0, r - 1)][c] || 0,
                                d.road_mask[Math.min(ny - 1, r + 1)][c] || 0,
                                d.road_mask[r][Math.max(0, c - 1)] || 0,
                                d.road_mask[r][Math.min(nx - 1, c + 1)] || 0
                            );
                        }

                        // Natural, balanced asphalt palette (NOT pitch black)
                        const roadCol = new THREE.Color();
                        if (lvl >= 3) {
                            roadCol.setHex(0x444f5c); // Arterial asphalt (Deparo Rd, Samson Ave, Camarin Rd)
                        } else if (lvl === 2) {
                            roadCol.setHex(0x4e5b69); // Collector avenue (Kabatuhan Rd, Narra St, Alecon Drive)
                        } else {
                            roadCol.setHex(0x5a6774); // Subdivision street (BF Homes, Casimiro, Natividad, etc.)
                        }

                        // Smooth anti-aliased blend from grass to road
                        col.lerpColors(grassCol, roadCol, alpha);
                        window.roadCells.push(i);
                    } else {
                        col.copy(grassCol);
                    }
                    origColors.set([col.r, col.g, col.b], i * 3);

                    // Limit t to [0, 1] in case an outside cell is higher/lower than the barangay min/max
                    let t = (terrainElev[i] - minE) / (maxE - minE);
                    t = Math.max(0, Math.min(1, t));

                    if (!isInside) col.setHex(0x8a9a70);
                    else col.setHSL((1 - t) * 0.33, 1.0, 0.5);
                    elevColors.set([col.r, col.g, col.b], i * 3);
                }
            }

            // Snapshot the road colours BEFORE Three.js takes ownership of origColors as the
            // live GPU buffer. Writing to terrainMesh.geometry.attributes.color.array later
            // mutates origColors in place, so we need this independent copy to restore from.
            window.roadColors = new Float32Array(origColors);

            const indices = [];
            for (let r = 0; r < ny - 1; r++) {
                for (let c = 0; c < nx - 1; c++) {
                    const a = r * nx + c, b = r * nx + (c + 1), c1 = (r + 1) * nx + c, d1 = (r + 1) * nx + (c + 1);
                    indices.push(a, c1, b);
                    indices.push(b, c1, d1);
                }
            }

            const uvs = new Float32Array(ny * nx * 2);
            for (let r = 0; r < ny; r++) {
                for (let c = 0; c < nx; c++) {
                    const i = r * nx + c;
                    uvs[i * 2] = c / (nx - 1);
                    uvs[i * 2 + 1] = 1.0 - (r / (ny - 1));
                }
            }

            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
            geo.setIndex(indices);
            geo.setAttribute('color', new THREE.BufferAttribute(origColors, 3));
            geo.computeVertexNormals();

            // ── High-resolution smooth vector terrain textures ───────────────────────
            const texLoader = new THREE.TextureLoader();
            window.roadTexture = texLoader.load('/static/terrain_roads.png');
            window.roadTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
            window.roadTexture.minFilter = THREE.LinearMipmapLinearFilter;
            window.roadTexture.magFilter = THREE.LinearFilter;

            window.grassTexture = texLoader.load('/static/terrain_grass.png');
            window.grassTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
            window.grassTexture.minFilter = THREE.LinearMipmapLinearFilter;
            window.grassTexture.magFilter = THREE.LinearFilter;

            const mat = new THREE.MeshStandardMaterial({
                map: window.roadTexture,
                roughness: 0.90,
                metalness: 0.05,
                transparent: true,
                opacity: 1.0
            });
            terrainMesh = new THREE.Mesh(geo, mat);
            terrainMesh.receiveShadow = true;
            scene.add(terrainMesh);
        }

        function buildWater() {
            waterDepthData = new Float32Array(nx * ny);
            waterDepthTex = new THREE.DataTexture(waterDepthData, nx, ny, THREE.RedFormat, THREE.FloatType);
            waterDepthTex.magFilter = THREE.NearestFilter;
            waterDepthTex.minFilter = THREE.NearestFilter;
            waterDepthTex.needsUpdate = true;

            const geo = new THREE.BufferGeometry();
            const pos = new Float32Array(ny * nx * 3);
            const uvs = new Float32Array(ny * nx * 2);
            for (let r = 0; r < ny; r++) {
                for (let c = 0; c < nx; c++) {
                    const i = r * nx + c;
                    pos[i * 3] = c;
                    pos[i * 3 + 1] = terrainElev[i];
                    pos[i * 3 + 2] = r;
                    uvs[i * 2] = c / (nx - 1);
                    uvs[i * 2 + 1] = r / (ny - 1);
                }
            }

            const indices = [];
            for (let r = 0; r < ny - 1; r++) {
                for (let c = 0; c < nx - 1; c++) {
                    const a = r * nx + c, b = r * nx + (c + 1), c1 = (r + 1) * nx + c, d1 = (r + 1) * nx + (c + 1);
                    indices.push(a, c1, b);
                    indices.push(b, c1, d1);
                }
            }

            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
            geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
            geo.setIndex(indices);

            const wUni = {
                uTime: { value: 0 },
                uDepthTex: { value: waterDepthTex },
                uGridSize: { value: new THREE.Vector2(nx, ny) },
                uGlassMode: { value: 0.0 },
                uDeep: { value: new THREE.Color(0x0d47a1) },
                uShallow: { value: new THREE.Color(0x29b6f6) },
                uFoam: { value: new THREE.Color(0xdff2ff) },
            };
            window.wUni = wUni;

            const mat = new THREE.ShaderMaterial({
                uniforms: wUni, transparent: true, side: THREE.FrontSide,
                polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
                vertexShader: `
            varying vec3 vWorld;
            varying vec2 vUv;
            void main(){
                vUv = uv;
                vec4 wp = modelMatrix * vec4(position, 1.0);
                vWorld = wp.xyz;
                gl_Position = projectionMatrix * viewMatrix * wp;
            }
        `,
                fragmentShader: `
            uniform float uTime;
            uniform sampler2D uDepthTex;
            uniform vec2 uGridSize;
            uniform float uGlassMode;
            uniform vec3 uDeep, uShallow, uFoam;
            varying vec3 vWorld;
            varying vec2 vUv;

            // Smooth bilinear + Hermite filter to eliminate blocky square pixel edges
            float getSmoothDepth(vec2 uv) {
                vec2 texSize = uGridSize;
                vec2 pixel = uv * texSize - 0.5;
                vec2 f = fract(pixel);
                vec2 w = f * f * (3.0 - 2.0 * f);
                
                vec2 p00 = clamp((floor(pixel) + vec2(0.5, 0.5)) / texSize, vec2(0.0), vec2(1.0));
                vec2 p10 = clamp((floor(pixel) + vec2(1.5, 0.5)) / texSize, vec2(0.0), vec2(1.0));
                vec2 p01 = clamp((floor(pixel) + vec2(0.5, 1.5)) / texSize, vec2(0.0), vec2(1.0));
                vec2 p11 = clamp((floor(pixel) + vec2(1.5, 1.5)) / texSize, vec2(0.0), vec2(1.0));

                float d00 = texture2D(uDepthTex, p00).r;
                float d10 = texture2D(uDepthTex, p10).r;
                float d01 = texture2D(uDepthTex, p01).r;
                float d11 = texture2D(uDepthTex, p11).r;

                return mix(mix(d00, d10, w.x), mix(d01, d11, w.x), w.y);
            }

            void main(){
                float d = getSmoothDepth(vUv);
                if (d < 0.005) discard; 
                
                // Natural shoreline edge feathering: softens transition between water and dry land
                float shoreAlpha = smoothstep(0.005, 0.035, d);
                float maxAlpha = uGlassMode > 0.5 ? 0.20 : 0.85;
                float alpha = shoreAlpha * maxAlpha;
                if (alpha < 0.01) discard;

                float wave = (sin(vWorld.x * 0.8 + uTime * 2.5) + sin(vWorld.z * 0.7 - uTime * 1.8) + sin((vWorld.x + vWorld.z) * 0.5 + uTime * 1.2)) / 3.0;
                
                // Realistic water depth coloring: deeper water is deep ocean blue, shallow edges are turquoise
                float depthFactor = clamp(d / 0.6, 0.0, 1.0);
                vec3 col = mix(uShallow, uDeep, depthFactor);
                col = mix(col, uShallow, (wave + 1.0) * 0.25);
                
                if (wave > 0.75) {
                    col = mix(col, uFoam, (wave - 0.75) * 3.5);
                }
                
                gl_FragColor = vec4(col, alpha);
            }
        `
            });
            waterMesh = new THREE.Mesh(geo, mat);
            scene.add(waterMesh);
        }

        function buildRain() {
            const geo = new THREE.BufferGeometry();
            const count = 15000;
            const pos = new Float32Array(count * 3);
            for (let i = 0; i < count * 3; i++) pos[i] = Math.random();
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

            const mat = new THREE.ShaderMaterial({
                uniforms: {
                    uTime: { value: 0 }, uRain: { value: 0 },
                    uScale: { value: new THREE.Vector3(nx, 100, ny) }
                },
                transparent: true, depthWrite: false,
                vertexShader: `
            uniform float uTime;
            uniform vec3 uScale;
            void main(){
                vec3 p = position;
                p.y = fract(p.y - uTime*0.8);
                p *= uScale;
                gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
                gl_PointSize = 2.0;
            }
        `,
                fragmentShader: `
            uniform float uRain;
            void main(){
                if(uRain < 0.01) discard;
                gl_FragColor = vec4(0.8, 0.9, 1.0, 0.4 * min(1.0, uRain/100.0));
            }
        `
            });
            rainMesh = new THREE.Points(geo, mat);
            scene.add(rainMesh);
        }

        // ─── PIPE INTERACTION STATE ────────────────────────────────────────
        let selectedPipeId = null;
        let selectedPipeIds = new Set();
        let hoveredPipeId = null;
        let pipeMeshMap = {};   // pipe_id → { mesh, data, v1, v2, dist }
        let nodeMeshMap = {};   // node_id → mesh
        let pipeClickables = [];   // array of pipe meshes for raycasting
        let pipeFlowInstanced = null;
        let pipeFlowList = [];
        const pipeHoverTooltip = document.getElementById('pipe-hover-tooltip');

        // Color helper: blockage % → hex color (professional civil infrastructure palette)
        function blockageColor(pct) {
            if (pct >= 80) return 0xef4444;   // critical red
            if (pct >= 50) return 0xf97316;   // severe orange
            if (pct >= 20) return 0xf59e0b;   // warning amber
            return 0x38bdf8;                   // clear flow (sleek conduit cyan)
        }

        function buildPipes(nodes, pipes) {
            // Clean up existing flow instanced mesh if re-building
            if (pipeFlowInstanced) {
                scene.remove(pipeFlowInstanced);
                if (pipeFlowInstanced.geometry) pipeFlowInstanced.geometry.dispose();
                if (pipeFlowInstanced.material) pipeFlowInstanced.material.dispose();
                pipeFlowInstanced = null;
            }
            pipeFlowList = [];

            // ── Nodes (manholes) ──────────────────────────────────────────────
            const nGeoNormal = new THREE.SphereGeometry(1.4, 12, 12);
            const nGeoOutlet = new THREE.SphereGeometry(2.4, 16, 16);

            nodes.forEach(n => {
                const isOutlet = n.is_outlet;
                const mGeo = isOutlet ? nGeoOutlet : nGeoNormal;
                const nMat = new THREE.MeshStandardMaterial({
                    // Outlets: luminous cyan beacons; Normal manholes: bright platinum chrome with cyan emissive rim
                    color: isOutlet ? 0x00f2fe : 0xf8fafc,
                    emissive: isOutlet ? 0x00e5ff : 0x0284c7,
                    emissiveIntensity: isOutlet ? 1.0 : 0.45,
                    roughness: 0.25,
                    metalness: 0.8,
                });
                const m = new THREE.Mesh(mGeo, nMat);
                const nodeY = terrainElev[n.y * nx + n.x] - 0.4;   // sit crisp & proud on surface
                m.position.set(n.x, nodeY, n.y);
                m.userData = { isDrainNode: true, nodeId: n.id, isOutlet: isOutlet };
                scene.add(m);
                nodeMeshMap[n.id] = m;
            });

            // ── Pipes (cylinders, click-to-select) ───────────────────────────
            const nodeMap = {};
            nodes.forEach(n => nodeMap[n.id] = n);

            pipes.forEach(p => {
                const n1 = nodeMap[p.in], n2 = nodeMap[p.out];

                // Use actual terrain elevation at the node's grid cell.
                // Push pipes deep enough (6m) to avoid shallow valleys.
                const PIPE_DEPTH = 6.0;
                const y1 = terrainElev[Math.floor(n1.y) * nx + Math.floor(n1.x)] - PIPE_DEPTH;
                const y2 = terrainElev[Math.floor(n2.y) * nx + Math.floor(n2.x)] - PIPE_DEPTH;

                // Aggressively skip if ANY point along the pipe path comes near the surface.
                // Sample at 20 evenly-spaced points to catch sharp valleys between nodes.
                const PIPE_MARGIN = 1.0;
                let aboveGround = false;
                for (let i = 1; i < 20; i++) {
                    const t = i / 20.0;
                    const sx = Math.round(n1.x + t * (n2.x - n1.x));
                    const sy = Math.round(n1.y + t * (n2.y - n1.y));
                    const sc = Math.max(0, Math.min(nx - 1, sx));
                    const sr = Math.max(0, Math.min(ny - 1, sy));
                    const surfY = terrainElev[sr * nx + sc];
                    const pipeY = y1 + t * (y2 - y1);
                    if (pipeY > surfY - PIPE_MARGIN) { aboveGround = true; break; }
                }
                if (aboveGround) return;


                const v1 = new THREE.Vector3(n1.x, y1, n1.y);
                const v2 = new THREE.Vector3(n2.x, y2, n2.y);
                const dist = v1.distanceTo(v2);

                const pipeR = Math.max(p.diameter * 0.55, 0.45);
                const cyl = new THREE.CylinderGeometry(
                    pipeR,
                    pipeR,
                    dist, 8, 1, false
                );
                cyl.rotateX(Math.PI / 2);

                const pMat = new THREE.MeshStandardMaterial({
                    color: blockageColor(p.blockage * 100),
                    roughness: 0.5,
                    metalness: 0.3,
                    emissive: 0x000000,
                    emissiveIntensity: 0.0,
                });

                const mesh = new THREE.Mesh(cyl, pMat);
                mesh.position.copy(v1).lerp(v2, 0.5);
                mesh.lookAt(v2);

                mesh.userData = {
                    isPipe: true,
                    pipeId: p.id,
                    nodeIn: p.in,
                    nodeOut: p.out,
                    diameter: p.diameter,
                };
                mesh.castShadow = false;
                scene.add(mesh);

                pipeMeshMap[p.id] = { mesh, data: p, v1, v2, dist };
                pipeClickables.push(mesh);

                // Setup flow pulse particles for active water transport (continuous smooth stream)
                const numPulses = Math.max(3, Math.min(6, Math.round(dist / 11)));
                const phases = [];
                for (let k = 0; k < numPulses; k++) phases.push(k / numPulses);
                pipeFlowList.push({ id: p.id, data: p, v1, v2, dist, numPulses, phases });
            });

            // Single shared InstancedMesh for all pipe water flow streams (1 draw call = 0 lag)
            const totalPulses = pipeFlowList.reduce((acc, it) => acc + it.numPulses, 0);
            if (totalPulses > 0) {
                const flowGeo = new THREE.SphereGeometry(1.0, 10, 8);
                const flowMat = new THREE.MeshStandardMaterial({
                    // Ultra-visible bright white-cyan incandescent water pulse
                    color: 0xffffff,
                    emissive: 0x00ffff,
                    emissiveIntensity: 2.4,
                    roughness: 0.1,
                    metalness: 0.05,
                    transparent: true,
                    opacity: 0.95,
                    depthTest: !glassMode
                });
                pipeFlowInstanced = new THREE.InstancedMesh(flowGeo, flowMat, totalPulses);
                pipeFlowInstanced.renderOrder = glassMode ? 25 : 0;
                pipeFlowInstanced.castShadow = false;
                pipeFlowInstanced.receiveShadow = false;

                const initDummy = new THREE.Object3D();
                initDummy.position.set(0, -9999, 0);
                initDummy.scale.set(0, 0, 0);
                initDummy.updateMatrix();
                for (let i = 0; i < totalPulses; i++) {
                    pipeFlowInstanced.setMatrixAt(i, initDummy.matrix);
                }
                pipeFlowInstanced.instanceMatrix.needsUpdate = true;
                scene.add(pipeFlowInstanced);
            }
        }

        // Rebuild a pipe's cylinder geometry to reflect a new diameter immediately.
        // Three.js CylinderGeometry is immutable — we must dispose the old one and
        // replace it with a new one at the same position/orientation.
        function updatePipeDiameter(pipeId, newDiameter) {
            const entry = pipeMeshMap[pipeId];
            if (!entry) return;
            const { mesh } = entry;

            const r = Math.max(newDiameter / 2, 0.4);

            // Recover the pipe length: the cylinder was placed between two nodes.
            // After rotateX(PI/2) + lookAt(), the original cylinder height equals
            // the distance between the two node positions, which we stored in userData.
            const nIn = nodeMeshMap[entry.data.in];
            const nOut = nodeMeshMap[entry.data.out];
            let dist = 1.0;
            if (nIn && nOut) {
                dist = nIn.position.distanceTo(nOut.position);
            }

            const newGeo = new THREE.CylinderGeometry(r, r, dist, 8, 1, false);
            newGeo.rotateX(Math.PI / 2);

            mesh.geometry.dispose();          // free GPU memory
            mesh.geometry = newGeo;

            // Keep userData in sync
            mesh.userData.diameter = newDiameter;
            entry.data.diameter = newDiameter;
        }

        function buildBuildings(d) {
            // Filter buildings inside boundary
            const validBuildings = d.buildings.filter(b => {
                const bx = Math.round(b.x);
                const by = Math.round(b.y);
                if (d.border_mask && by >= 0 && by < d.border_mask.length && bx >= 0 && bx < d.border_mask[0].length) {
                    return d.border_mask[by][bx];
                }
                return true;
            });

            // 1. Box InstancedMesh for main structure walls
            const boxGeo = new THREE.BoxGeometry(1, 1, 1);
            boxGeo.translate(0, 0.5, 0); // origin at bottom
            const boxMat = new THREE.MeshStandardMaterial({
                roughness: 0.85,
                metalness: 0.05
            });
            const boxInstanced = new THREE.InstancedMesh(boxGeo, boxMat, validBuildings.length);
            boxInstanced.castShadow = true;
            boxInstanced.receiveShadow = true;

            // 2. Separate pitched (hip) roofs and clean flat parapet roofs
            const pitchedBuildings = validBuildings.filter(b => b.roof_type === 'hip');
            const flatBuildings = validBuildings.filter(b => b.roof_type !== 'hip');

            const hipGeo = new THREE.ConeGeometry(1, 1, 4);
            hipGeo.rotateY(Math.PI / 4);
            hipGeo.translate(0, 0.5, 0); // origin at bottom of hip roof
            const hipMat = new THREE.MeshStandardMaterial({
                roughness: 0.60,
                metalness: 0.15
            });
            const hipInstanced = new THREE.InstancedMesh(hipGeo, hipMat, pitchedBuildings.length);
            hipInstanced.castShadow = true;
            hipInstanced.receiveShadow = true;

            const flatRoofGeo = new THREE.BoxGeometry(1, 1, 1);
            flatRoofGeo.translate(0, 0.5, 0); // origin at bottom of roof slab
            const flatRoofMat = new THREE.MeshStandardMaterial({
                roughness: 0.65,
                metalness: 0.15
            });
            const flatInstanced = new THREE.InstancedMesh(flatRoofGeo, flatRoofMat, flatBuildings.length);
            flatInstanced.castShadow = true;
            flatInstanced.receiveShadow = true;

            const dummy = new THREE.Object3D();
            const color = new THREE.Color();

            validBuildings.forEach((b, i) => {
                const bx = Math.max(0, Math.min(nx - 1, Math.round(b.x)));
                const by = Math.max(0, Math.min(ny - 1, Math.round(b.y)));
                const b_elev = terrainElev[by * nx + bx];
                const w = b.width || 1.8;
                const d_len = b.depth || w;
                const h = b.height || 1.4;
                const rot = b.rot || 0;

                dummy.position.set(b.x, b_elev, b.y);
                dummy.rotation.set(0, rot, 0);
                dummy.scale.set(w, h, d_len);
                dummy.updateMatrix();

                boxInstanced.setMatrixAt(i, dummy.matrix);
                color.setStyle(b.color);
                boxInstanced.setColorAt(i, color);
            });

            pitchedBuildings.forEach((b, idx) => {
                const bx = Math.max(0, Math.min(nx - 1, Math.round(b.x)));
                const by = Math.max(0, Math.min(ny - 1, Math.round(b.y)));
                const b_elev = terrainElev[by * nx + bx];
                const w = (b.width || 1.8) * 1.05;
                const d_len = (b.depth || (b.width || 1.8)) * 1.05;
                const h = b.height || 1.4;
                const rot = b.rot || 0;
                const roofH = Math.max(0.35, Math.min(0.65, h * 0.35));

                dummy.position.set(b.x, b_elev + h, b.y);
                dummy.rotation.set(0, rot, 0);
                dummy.scale.set(w / Math.SQRT2, roofH, d_len / Math.SQRT2);
                dummy.updateMatrix();

                hipInstanced.setMatrixAt(idx, dummy.matrix);
                color.setStyle(b.roof_color);
                hipInstanced.setColorAt(idx, color);
            });

            flatBuildings.forEach((b, idx) => {
                const bx = Math.max(0, Math.min(nx - 1, Math.round(b.x)));
                const by = Math.max(0, Math.min(ny - 1, Math.round(b.y)));
                const b_elev = terrainElev[by * nx + bx];
                const w = (b.width || 1.8) * 1.04;
                const d_len = (b.depth || (b.width || 1.8)) * 1.04;
                const h = b.height || 1.4;
                const rot = b.rot || 0;
                const slabH = 0.16;

                dummy.position.set(b.x, b_elev + h, b.y);
                dummy.rotation.set(0, rot, 0);
                dummy.scale.set(w, slabH, d_len);
                dummy.updateMatrix();

                flatInstanced.setMatrixAt(idx, dummy.matrix);
                color.setStyle(b.roof_color);
                flatInstanced.setColorAt(idx, color);
            });

            scene.add(boxInstanced);
            buildingMeshes.push(boxInstanced);
            if (pitchedBuildings.length > 0) {
                scene.add(hipInstanced);
                buildingMeshes.push(hipInstanced);
            }
            if (flatBuildings.length > 0) {
                scene.add(flatInstanced);
                buildingMeshes.push(flatInstanced);
            }
        }

        function buildTrees(trees) {
            if (!trees || trees.length === 0) return;
            treeMeshes = [];

            // Filter trees inside valid grid bounds
            const validTrees = trees.filter(t => {
                const tx = Math.round(t.x);
                const ty = Math.round(t.y);
                return tx >= 0 && tx < nx && ty >= 0 && ty < ny;
            });

            if (validTrees.length === 0) return;

            // 1. Shared Trunk InstancedMesh (low-poly 5-sided tapered cylinder)
            const trunkGeo = new THREE.CylinderGeometry(0.12, 0.22, 1.0, 5);
            trunkGeo.translate(0, 0.5, 0); // origin at base of trunk
            const trunkMat = new THREE.MeshStandardMaterial({
                color: 0x4a3b2c,
                roughness: 0.90,
                metalness: 0.05
            });
            const trunkInstanced = new THREE.InstancedMesh(trunkGeo, trunkMat, validTrees.length);
            trunkInstanced.castShadow = true;
            trunkInstanced.receiveShadow = true;

            // 2. Separate InstancedMeshes for Crown variations
            const broadleafTrees = validTrees.filter(t => t.type === 'broadleaf');
            const pineTrees = validTrees.filter(t => t.type === 'pine');
            const palmTrees = validTrees.filter(t => t.type === 'palm');
            const blossomTrees = validTrees.filter(t => t.type === 'blossom');

            // Broadleaf Crown (Dodecahedron - low poly shade canopy)
            const broadleafGeo = new THREE.DodecahedronGeometry(1.0, 0);
            broadleafGeo.translate(0, 0.8, 0);
            const broadleafMat = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.08 });
            const broadleafInstanced = new THREE.InstancedMesh(broadleafGeo, broadleafMat, broadleafTrees.length);
            broadleafInstanced.castShadow = true;
            broadleafInstanced.receiveShadow = true;

            // Pine Crown (Cone - low poly spruce/cypress)
            const pineGeo = new THREE.ConeGeometry(1.0, 2.0, 5);
            pineGeo.translate(0, 1.0, 0);
            const pineMat = new THREE.MeshStandardMaterial({ roughness: 0.70, metalness: 0.08 });
            const pineInstanced = new THREE.InstancedMesh(pineGeo, pineMat, pineTrees.length);
            pineInstanced.castShadow = true;
            pineInstanced.receiveShadow = true;

            // Palm Crown (Tiered / Flared Tropical Palm Fronds)
            const palmGeo = new THREE.ConeGeometry(1.5, 0.6, 6);
            palmGeo.translate(0, 0.25, 0);
            const palmMat = new THREE.MeshStandardMaterial({ roughness: 0.65, metalness: 0.08 });
            const palmInstanced = new THREE.InstancedMesh(palmGeo, palmMat, palmTrees.length);
            palmInstanced.castShadow = true;
            palmInstanced.receiveShadow = true;

            // Blossom Crown (Flowering Golden / Coral Canopy)
            const blossomGeo = new THREE.DodecahedronGeometry(1.05, 0);
            blossomGeo.translate(0, 0.8, 0);
            const blossomMat = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.08 });
            const blossomInstanced = new THREE.InstancedMesh(blossomGeo, blossomMat, blossomTrees.length);
            blossomInstanced.castShadow = true;
            blossomInstanced.receiveShadow = true;

            const dummy = new THREE.Object3D();
            const color = new THREE.Color();

            // Populate Trunks
            validTrees.forEach((t, i) => {
                const tx = Math.max(0, Math.min(nx - 1, Math.round(t.x)));
                const ty = Math.max(0, Math.min(ny - 1, Math.round(t.y)));
                const elev = terrainElev ? (terrainElev[ty * nx + tx] || 0) : 0;
                const sc = t.scale || 1.0;
                const th = (t.trunk_h || 1.2) * sc;

                dummy.position.set(t.x, elev, t.y);
                dummy.rotation.set(0, t.rot || 0, 0);
                dummy.scale.set(sc * 0.9, th, sc * 0.9);
                dummy.updateMatrix();
                trunkInstanced.setMatrixAt(i, dummy.matrix);
            });

            // Helper for Crown placement
            function populateCrowns(list, instMesh) {
                list.forEach((t, idx) => {
                    const tx = Math.max(0, Math.min(nx - 1, Math.round(t.x)));
                    const ty = Math.max(0, Math.min(ny - 1, Math.round(t.y)));
                    const elev = terrainElev ? (terrainElev[ty * nx + tx] || 0) : 0;
                    const sc = t.scale || 1.0;
                    const th = (t.trunk_h || 1.2) * sc;
                    const cr = (t.crown_r || 1.4) * sc;
                    const ch = (t.crown_h || cr) * sc;

                    dummy.position.set(t.x, elev + th * 0.9, t.y);
                    dummy.rotation.set(0, t.rot || 0, 0);
                    dummy.scale.set(cr, ch, cr);
                    dummy.updateMatrix();

                    instMesh.setMatrixAt(idx, dummy.matrix);
                    color.setStyle(t.color);
                    instMesh.setColorAt(idx, color);
                });
            }

            populateCrowns(broadleafTrees, broadleafInstanced);
            populateCrowns(pineTrees, pineInstanced);
            populateCrowns(palmTrees, palmInstanced);
            populateCrowns(blossomTrees, blossomInstanced);

            scene.add(trunkInstanced);
            treeMeshes.push(trunkInstanced);

            if (broadleafTrees.length > 0) { scene.add(broadleafInstanced); treeMeshes.push(broadleafInstanced); }
            if (pineTrees.length > 0) { scene.add(pineInstanced); treeMeshes.push(pineInstanced); }
            if (palmTrees.length > 0) { scene.add(palmInstanced); treeMeshes.push(palmInstanced); }
            if (blossomTrees.length > 0) { scene.add(blossomInstanced); treeMeshes.push(blossomInstanced); }
        }

        // ─── POLLING & SYNC ──────────────────────────────────────────────────
        let pollTimer = null;
        let pollInFlight = false;
        let lastRenderedSimTime = -1.0;

        function scheduleNextPoll(delayMs = 50) {
            if (pollTimer) clearTimeout(pollTimer);
            pollTimer = setTimeout(pollState, delayMs);
        }

        function triggerImmediatePoll() {
            lastRenderedSimTime = -1.0;
            if (pollTimer) clearTimeout(pollTimer);
            pollInFlight = false;
            pollState();
        }

        async function pollState() {
            if (pollInFlight) return;
            pollInFlight = true;
            try {
                const res = await fetch('/api/state');
                const d = await res.json();

                // Drop out-of-order network responses that arrive late and cause flickering
                if (lastRenderedSimTime >= 0.0 && d.time < lastRenderedSimTime && (lastRenderedSimTime - d.time) < 15.0) {
                    return;
                }
                lastRenderedSimTime = d.time;

                document.getElementById('s-time').textContent = d.time_label;
                document.getElementById('s-flood').textContent = d.telemetry.flooded_cells;
                document.getElementById('s-depth').textContent = d.telemetry.max_depth.toFixed(2) + ' m';
                document.getElementById('s-vol').textContent = d.telemetry.total_vol_m3.toFixed(1) + ' m³';

                const errSpan = document.getElementById('s-err');
                errSpan.textContent = d.telemetry.mb_error_pct.toFixed(2) + '%';
                errSpan.style.color = d.telemetry.mb_error_pct > 1.0 ? '#e74c3c' : '#2ecc71';

                // Update Button States
                playing = d.running;
                const pBtn = document.getElementById('btn-play');
                const nextState = playing ? 'paused' : 'playing';
                if (pBtn.dataset.state !== nextState) {
                    pBtn.dataset.state = nextState;
                    pBtn.innerHTML = playing ? '<i data-lucide="pause"></i> Pause' : '<i data-lucide="play"></i> Play';
                    pBtn.className = playing ? 'paused' : '';
                    if (window.lucide) lucide.createIcons();
                }

                // Sync Speed State from Server
                if (d.speed && simSpeed !== d.speed) {
                    simSpeed = d.speed;
                    const sBtn = document.getElementById('btn-speed');
                    if (sBtn) {
                        sBtn.innerHTML = `<i data-lucide="fast-forward"></i> ${simSpeed}×`;
                        if (window.lucide) lucide.createIcons();
                    }
                }

                // Update Skip Overlay
                const overlay = document.getElementById('skip-overlay');
                if (d.skip_progress !== null) {
                    overlay.style.display = 'flex';
                    document.getElementById('skip-progress').textContent = (d.skip_progress * 100).toFixed(1) + '%';
                } else {
                    overlay.style.display = 'none';
                }

                // Update Sliders if not dragging
                currentRain = d.rainfall_mmhr;
                const rainDisplay = (currentRain % 1 === 0) ? Math.round(currentRain) : currentRain.toFixed(1);
                document.getElementById('val-rain').textContent = rainDisplay;
                const rb = document.getElementById('rain-badge');
                if (rb) rb.textContent = `${rainDisplay} mm/h`;
                document.getElementById('slider-rain').value = currentRain;

                // Snapshots dropdown
                const sel = document.getElementById('sel-snapshot');
                const currentOpts = Array.from(sel.options).map(o => o.value);
                if (d.snapshots.length === 0) {
                    sel.innerHTML = '<option value="">-- No Snapshots Yet --</option>';
                } else {
                    if (currentOpts.join() !== d.snapshots.map(s => s.time).join()) {
                        sel.innerHTML = d.snapshots.map(s => `<option value="${s.time}">${s.label}</option>`).join('');
                        sel.value = d.snapshots[d.snapshots.length - 1].time;
                    }
                }

                // Apply Water Depth — update geometry + DataTexture
                if (waterMesh && d.water_depth) {
                    const VISUAL_SCALE = 1.0;
                    const pos = waterMesh.geometry.attributes.position.array;
                    const flatDepth = d.water_depth;
                    const is2D = Array.isArray(flatDepth[0]);
                    const total = nx * ny;
                    let anyWet = false;
                    for (let i = 0; i < total; i++) {
                        const r = Math.floor(i / nx);
                        const c = i % nx;
                        const isInside = (window.borderMask && window.borderMask[r]) ? window.borderMask[r][c] : true;
                        const rawVal = isInside ? (is2D ? (flatDepth[r] ? flatDepth[r][c] : 0.0) : flatDepth[i]) : 0.0;
                        const val = (rawVal && rawVal > 0.0) ? rawVal : 0.0;
                        if (val > 0.005) anyWet = true;
                        waterDepthData[i] = val;
                        pos[i * 3 + 1] = terrainElev[i] + (val * VISUAL_SCALE);
                    }
                    waterDepthTex.needsUpdate = true;
                    waterMesh.geometry.attributes.position.needsUpdate = true;
                    // Respect the layer-visibility checkbox — don't override user's choice
                    const waterChk = document.getElementById('chk-water');
                    waterMesh.visible = anyWet && (!waterChk || waterChk.checked);
                }

                // ── Live pipe color update ───────────────────────────────────────
                if (d.pipes) {
                    d.pipes.forEach(p => {
                        const entry = pipeMeshMap[p.id];
                        if (!entry) return;
                        entry.data.blockage = p.blockage / 100.0;
                        entry.data.flow = p.flow;
                        updatePipeVisual(p.id);
                    });

                    // Update inspector panel if single pipe is selected
                    if (selectedPipeIds.size === 1) {
                        const pid = Array.from(selectedPipeIds)[0];
                        const p = d.pipes.find(x => x.id === pid);
                        if (p) {
                            document.getElementById('pi-block-pct').textContent = p.blockage.toFixed(1) + '%';
                            document.getElementById('pi-flow').textContent = p.flow >= 0
                                ? `${p.flow.toFixed(4)} m³/s`
                                : `⬆ ${Math.abs(p.flow).toFixed(4)} m³/s (rev)`;
                            // Update fill bar
                            const fill = document.getElementById('pi-fill');
                            fill.style.width = p.blockage + '%';
                            fill.style.background = p.blockage >= 80 ? '#e74c3c'
                                : p.blockage >= 50 ? '#e67e22'
                                    : p.blockage >= 20 ? '#f1c40f'
                                        : '#2ecc71';
                            // Keep slider in sync only if user isn't dragging
                            if (!piSliderDragging) {
                                document.getElementById('pi-slider').value = p.blockage;
                                document.getElementById('pi-blockage-val').textContent = p.blockage.toFixed(0) + '%';
                            }
                        }
                    } else if (selectedPipeIds.size > 1) {
                        // Multi-pipe stats in inspector panel
                        const selPipes = d.pipes.filter(x => selectedPipeIds.has(x.id));
                        if (selPipes.length > 0) {
                            const avgBlock = selPipes.reduce((acc, x) => acc + x.blockage, 0) / selPipes.length;
                            const totFlow = selPipes.reduce((acc, x) => acc + Math.abs(x.flow), 0);
                            document.getElementById('pi-block-pct').textContent = `${avgBlock.toFixed(1)}% (avg)`;
                            document.getElementById('pi-flow').textContent = `${totFlow.toFixed(4)} m³/s (total)`;
                            const fill = document.getElementById('pi-fill');
                            fill.style.width = avgBlock + '%';
                            fill.style.background = avgBlock >= 80 ? '#e74c3c' : avgBlock >= 50 ? '#e67e22' : avgBlock >= 20 ? '#f1c40f' : '#2ecc71';
                            if (!piSliderDragging) {
                                document.getElementById('pi-slider').value = avgBlock;
                                document.getElementById('pi-blockage-val').textContent = avgBlock.toFixed(0) + '%';
                            }
                        }
                    }
                }

                // ── Barangay SitRep Dashboard Update ─────────────────────────────
                if (d.sitrep) {
                    const s = d.sitrep;
                    const kpiRainDur = document.getElementById('kpi-rain-dur');
                    const kpiRainRate = document.getElementById('kpi-rain-rate');
                    const kpiBrgyPct = document.getElementById('kpi-brgy-pct');
                    const kpiBrgyCells = document.getElementById('kpi-brgy-cells');
                    const kpiFloodedCount = document.getElementById('kpi-flooded-count');
                    const kpiPeakDepth = document.getElementById('kpi-peak-depth');
                    const kpiPeakFt = document.getElementById('kpi-peak-ft');

                    if (kpiRainDur) kpiRainDur.textContent = s.rain_duration_label;
                    if (kpiRainRate) {
                        const rateDisplay = (d.rainfall_mmhr % 1 === 0) ? Math.round(d.rainfall_mmhr) : d.rainfall_mmhr.toFixed(1);
                        kpiRainRate.textContent = rateDisplay + ' mm/hr';
                    }
                    if (kpiBrgyPct) {
                        kpiBrgyPct.textContent = s.brgy_flooded_pct.toFixed(1) + '%';
                        kpiBrgyPct.style.color = s.brgy_flooded_pct > 30 ? '#ff6b6b' : (s.brgy_flooded_pct > 10 ? '#f1c40f' : '#ffffff');
                    }
                    if (kpiBrgyCells) kpiBrgyCells.textContent = s.brgy_flooded_cells.toLocaleString() + ' cells';
                    if (kpiFloodedCount) kpiFloodedCount.textContent = `${s.flooded_zones_count} / ${s.total_zones_count}`;
                    if (kpiPeakDepth) kpiPeakDepth.textContent = s.highest_peak_depth.toFixed(2) + ' m';
                    if (kpiPeakFt) kpiPeakFt.textContent = (s.highest_peak_depth * 3.28084).toFixed(1) + ' ft';

                    // Worst-hit area alert box
                    const worstEl = document.getElementById('worst-name');
                    const worstBadge = document.getElementById('worst-badge');
                    const worstBox = document.getElementById('worst-box');
                    if (worstEl && worstBadge) {
                        if (s.highest_peak_depth > 0.05) {
                            worstEl.textContent = s.worst_zone;
                            const matchZ = s.zones ? s.zones.find(z => z.name === s.worst_zone) : null;
                            if (worstBox && matchZ) {
                                worstBox.title = matchZ.name;
                            }
                            if (s.highest_peak_depth >= 0.80) {
                                worstBadge.className = 'badge badge-CRITICAL';
                                worstBadge.textContent = 'CRITICAL';
                            } else if (s.highest_peak_depth >= 0.30) {
                                worstBadge.className = 'badge badge-WARNING';
                                worstBadge.textContent = 'WARNING';
                            } else {
                                worstBadge.className = 'badge badge-ALERT';
                                worstBadge.textContent = 'ALERT';
                            }
                        } else {
                            worstEl.textContent = 'None';
                            worstBadge.className = 'badge badge-NORMAL';
                            worstBadge.textContent = 'SAFE';
                            if (worstBox) worstBox.onclick = null;
                        }
                    }

                    // Update Zones Table (throttled every 250ms for buttery-smooth FPS)
                    const now = Date.now();
                    if (now - _lastTableUpdate > 250) {
                        _lastTableUpdate = now;
                        window._currentZones = s.zones;
                        const tbody = document.getElementById('zone-table-body');
                        if (tbody && s.zones) {
                            let html = '';
                            s.zones.forEach(z => {
                                const badgeClass = `badge-${z.status}`;
                                const isSel = (window.currentSelectedZoneId === z.id) ? ' selected-zone' : '';
                                const peakColor = z.peak_depth >= 0.80 ? '#ff6b6b' : (z.peak_depth >= 0.30 ? '#e67e22' : (z.peak_depth >= 0.05 ? '#f1c40f' : '#dfe6ed'));
                                html += `
                            <tr class="zone-row${isSel}" data-zone-id="${z.id}">
                                <td>
                                    <span style="font-weight:600; font-size:12px; color:#ffffff;">${z.name}</span>
                                </td>
                                <td style="text-align:right; font-weight:700; color:${peakColor}; font-size:11.5px;">${z.peak_depth.toFixed(2)}m</td>
                                <td style="text-align:right; color:#85929e; font-size:11px;">${z.pct_flooded.toFixed(1)}%</td>
                                <td style="text-align:right;"><span class="badge ${badgeClass}">${z.status}</span></td>
                            </tr>
                        `;

                                // Update 3D Floating Sprite Label
                                updateZoneLabel(z.id, z.name, `${z.status} • Peak: ${z.peak_depth.toFixed(2)}m`, z.color);
                            });
                            tbody.innerHTML = html;
                        }
                    }
                }

            } catch (e) { /* server briefly unavailable */ }
            finally {
                pollInFlight = false;
                scheduleNextPoll(50);   // 20 fps polling — smooth real-time water
            }
        }
        scheduleNextPoll(800);

        // ─── PIPE INSPECTOR LOGIC ──────────────────────────────────────────────
        const piPanel = document.getElementById('pipe-inspector');
        const piSlider = document.getElementById('pi-slider');
        let piSliderDragging = false;
        let _terrainData = null;   // stored from /api/terrain call for raycasting

        // Raycaster setup
        const raycaster = new THREE.Raycaster();
        raycaster.params.Line = { threshold: 2 };
        const pointer = new THREE.Vector2();

        // Store terrain data when it loads (for pipe inspector coordinate display)
        const _origFetch = window._terrainFetchHook;

        function updateInspectorContent() {
            if (selectedPipeIds.size === 0) {
                piPanel.style.display = 'none';
                return;
            }

            if (selectedPipeIds.size === 1) {
                const pid = Array.from(selectedPipeIds)[0];
                selectedPipeId = pid;
                const entry = pipeMeshMap[pid];
                if (!entry) return;

                const p = entry.data;
                const titleEl = document.getElementById('pi-title-text');
                if (titleEl) titleEl.textContent = 'Pipe Inspector';
                document.getElementById('pi-id').textContent = `#${p.id}`;
                document.getElementById('pi-nodes').textContent = `${p.in} → ${p.out}`;
                document.getElementById('pi-diam').textContent = `${p.diameter.toFixed(2)} m`;
                document.getElementById('pi-block-pct').textContent = (p.blockage * 100).toFixed(1) + '%';
                document.getElementById('pi-flow').textContent = p.flow !== undefined ? `${p.flow.toFixed(4)} m³/s` : '—';
                piSlider.value = p.blockage * 100;
                document.getElementById('pi-blockage-val').textContent = (p.blockage * 100).toFixed(0) + '%';
                document.getElementById('pi-diam-input').value = p.diameter.toFixed(1);

                const fill = document.getElementById('pi-fill');
                const bPct = p.blockage * 100;
                fill.style.width = bPct + '%';
                fill.style.background = bPct >= 80 ? '#e74c3c' : bPct >= 50 ? '#e67e22' : bPct >= 20 ? '#f1c40f' : '#2ecc71';
            } else {
                selectedPipeId = Array.from(selectedPipeIds)[0];
                const count = selectedPipeIds.size;
                const entries = Array.from(selectedPipeIds).map(id => pipeMeshMap[id]).filter(Boolean);
                const pids = Array.from(selectedPipeIds);
                const idDisplay = pids.length <= 4 ? pids.map(id => `#${id}`).join(', ') : `${count} pipes (#${pids[0]}..#${pids[pids.length - 1]})`;

                const titleEl = document.getElementById('pi-title-text');
                if (titleEl) titleEl.textContent = `Multi-Select (${count} pipes)`;
                document.getElementById('pi-id').textContent = idDisplay;
                document.getElementById('pi-nodes').textContent = `${count} segments`;

                const diams = entries.map(e => e.data.diameter);
                const allSameDiam = diams.length > 0 && diams.every(d => Math.abs(d - diams[0]) < 1e-3);
                document.getElementById('pi-diam').textContent = allSameDiam ? `${diams[0].toFixed(2)} m` : `Varies (${Math.min(...diams).toFixed(1)}–${Math.max(...diams).toFixed(1)}m)`;
                document.getElementById('pi-diam-input').value = allSameDiam ? diams[0].toFixed(1) : (diams.reduce((a,b)=>a+b,0)/diams.length).toFixed(1);

                const blockages = entries.map(e => e.data.blockage * 100);
                const avgBlock = blockages.length > 0 ? (blockages.reduce((a,b)=>a+b,0) / blockages.length) : 0;
                const allSameBlock = blockages.length > 0 && blockages.every(b => Math.abs(b - blockages[0]) < 1e-1);
                document.getElementById('pi-block-pct').textContent = allSameBlock ? `${blockages[0].toFixed(0)}%` : `${avgBlock.toFixed(0)}% (avg)`;
                piSlider.value = avgBlock;
                document.getElementById('pi-blockage-val').textContent = avgBlock.toFixed(0) + '%';
                document.getElementById('pi-flow').textContent = '—';

                const fill = document.getElementById('pi-fill');
                fill.style.width = avgBlock + '%';
                fill.style.background = avgBlock >= 80 ? '#e74c3c' : avgBlock >= 50 ? '#e67e22' : avgBlock >= 20 ? '#f1c40f' : '#2ecc71';
            }
        }

        // Unified Pipe Visual Styler: handles normal, hovered, and selected states cleanly
        function updatePipeVisual(pipeId) {
            const entry = pipeMeshMap[pipeId];
            if (!entry) return;
            const isSelected = selectedPipeIds.has(pipeId);
            const isHovered = (hoveredPipeId === pipeId);
            const blk = entry.data.blockage !== undefined ? entry.data.blockage * 100 : 0;
            const col = new THREE.Color(blockageColor(blk));

            if (isHovered) {
                // Hover highlight: radial expansion (1.35x) + cyber cyan glow
                entry.mesh.scale.set(1.35, 1.35, 1.0);
                entry.mesh.renderOrder = 20;
                entry.mesh.material.depthTest = false;
                if (isSelected) {
                    entry.mesh.material.color.set(0xffffff);
                    entry.mesh.material.emissive.set(0xffffff);
                    entry.mesh.material.emissiveIntensity = 0.85;
                } else {
                    entry.mesh.material.color.set(0x5dade2);
                    entry.mesh.material.emissive.set(0x5dade2);
                    entry.mesh.material.emissiveIntensity = 0.55;
                }
            } else if (isSelected) {
                // Selected: prominent white highlight
                entry.mesh.scale.set(1.0, 1.0, 1.0);
                entry.mesh.renderOrder = glassMode ? 15 : 0;
                entry.mesh.material.depthTest = !glassMode;
                entry.mesh.material.color.set(0xffffff);
                entry.mesh.material.emissive.copy(col);
                entry.mesh.material.emissiveIntensity = 0.6;
            } else {
                // Normal: natural blockage color + water flow energy indicator
                entry.mesh.scale.set(1.0, 1.0, 1.0);
                entry.mesh.renderOrder = glassMode ? 12 : 0;
                entry.mesh.material.depthTest = !glassMode;
                entry.mesh.material.color.copy(col);
                const flowVal = entry.data.flow !== undefined ? entry.data.flow : 0;
                if (Math.abs(flowVal) > 0.0003) {
                    // Pipe carries stormwater: luminous aqua conduit glow
                    const flowGlow = Math.min(0.45, 0.18 + Math.abs(flowVal) * 0.25);
                    const flowEmissive = new THREE.Color(col).lerp(new THREE.Color(0x00e5ff), 0.5);
                    entry.mesh.material.emissive.copy(flowEmissive);
                    entry.mesh.material.emissiveIntensity = flowGlow;
                } else {
                    // Dry pipe: zero emissive glow
                    entry.mesh.material.emissive.copy(col);
                    entry.mesh.material.emissiveIntensity = 0.0;
                }
            }
        }

        function setHoveredPipe(pipeId) {
            if (!glassMode) pipeId = null;
            if (hoveredPipeId === pipeId) return;
            const prevId = hoveredPipeId;
            hoveredPipeId = pipeId;
            if (prevId !== null) updatePipeVisual(prevId);
            if (hoveredPipeId !== null) updatePipeVisual(hoveredPipeId);

            if (hoveredPipeId !== null) {
                renderer.domElement.style.cursor = 'pointer';
                const entry = pipeMeshMap[hoveredPipeId];
                if (entry && pipeHoverTooltip) {
                    const blkPct = (entry.data.blockage * 100).toFixed(0);
                    const diam = (entry.data.diameter || 0.8).toFixed(1);
                    const flow = entry.data.flow !== undefined ? entry.data.flow : 0;
                    const hexColor = blockageColor(parseFloat(blkPct));
                    const hexStr = '#' + hexColor.toString(16).padStart(6, '0');
                    const statusText = blkPct >= 80 ? 'CRITICAL' : blkPct >= 50 ? 'HEAVY' : blkPct >= 20 ? 'MODERATE' : 'CLEAR';

                    const phtId = document.getElementById('pht-id');
                    if (phtId) phtId.textContent = `PIPE #${hoveredPipeId}`;
                    const dot = document.getElementById('pht-dot');
                    if (dot) {
                        dot.style.background = hexStr;
                        dot.style.boxShadow = `0 0 6px ${hexStr}`;
                    }
                    const st = document.getElementById('pht-status-text');
                    if (st) {
                        st.textContent = statusText;
                        st.style.color = hexStr;
                    }
                    const diamEl = document.getElementById('pht-diam');
                    if (diamEl) diamEl.textContent = `${diam}m`;
                    const blockEl = document.getElementById('pht-block');
                    if (blockEl) blockEl.textContent = `${blkPct}%`;
                    const flowEl = document.getElementById('pht-flow');
                    if (flowEl) {
                        flowEl.textContent = flow >= 0 ? `${flow.toFixed(3)} m³/s` : `⬆ ${Math.abs(flow).toFixed(3)} m³/s`;
                    }
                    pipeHoverTooltip.style.display = 'block';
                }
            } else {
                renderer.domElement.style.cursor = 'default';
                if (pipeHoverTooltip) pipeHoverTooltip.style.display = 'none';
            }
        }

        function updateHoverTooltipPosition(clientX, clientY) {
            if (!pipeHoverTooltip || hoveredPipeId === null) return;
            const pw = 175, ph = 60;
            let lx = clientX + 12, ly = clientY + 12;
            if (lx + pw > window.innerWidth) lx = clientX - pw - 12;
            if (ly + ph > window.innerHeight) ly = window.innerHeight - ph - 12;
            pipeHoverTooltip.style.left = lx + 'px';
            pipeHoverTooltip.style.top = ly + 'px';
        }

        function togglePipeSelection(pipeId, isShift, screenX, screenY) {
            if (!glassMode) pipeId = null;
            if (pipeId === null) {
                // Deselect all
                const prev = Array.from(selectedPipeIds);
                selectedPipeIds.clear();
                selectedPipeId = null;
                prev.forEach(id => updatePipeVisual(id));
                piPanel.style.display = 'none';
                return;
            }

            if (isShift) {
                if (selectedPipeIds.has(pipeId)) {
                    selectedPipeIds.delete(pipeId);
                } else {
                    selectedPipeIds.add(pipeId);
                }
                updatePipeVisual(pipeId);
            } else {
                const prev = Array.from(selectedPipeIds);
                selectedPipeIds.clear();
                selectedPipeIds.add(pipeId);
                prev.forEach(id => updatePipeVisual(id));
                updatePipeVisual(pipeId);
            }

            if (selectedPipeIds.size > 0) {
                updateInspectorContent();
                // Don't show/move the panel while Shift is held (multi-select mode)
                if (!shiftInspectorHidden) {
                    if (screenX !== undefined && screenY !== undefined) {
                        showInspectorAt(screenX, screenY);
                    } else {
                        piPanel.style.display = 'block';
                    }
                }
            } else {
                piPanel.style.display = 'none';
                selectedPipeId = null;
            }
        }

        function selectPipe(pipeId) {
            togglePipeSelection(pipeId, false);
        }

        function showInspectorAt(screenX, screenY) {
            const panel = piPanel;
            panel.style.display = 'block';
            // Clamp so panel doesn't go off-screen
            const pw = 230, ph = 260;
            let lx = screenX + 14, ly = screenY - ph / 2;
            if (lx + pw > window.innerWidth) lx = screenX - pw - 14;
            if (ly < 8) ly = 8;
            if (ly + ph > window.innerHeight) ly = window.innerHeight - ph - 8;
            panel.style.left = lx + 'px';
            panel.style.top = ly + 'px';
        }

        let isPointerDown = false;
        let pointerDownPos = { x: 0, y: 0 };
        renderer.domElement.addEventListener('pointerdown', e => {
            isPointerDown = true;
            pointerDownPos.x = e.clientX;
            pointerDownPos.y = e.clientY;
        });

        window.addEventListener('pointerup', () => {
            isPointerDown = false;
        });

        // Hover detection on pointermove
        renderer.domElement.addEventListener('pointermove', e => {
            // Only allow pipe hover & tooltip in X-Ray mode
            if (!glassMode) {
                if (hoveredPipeId !== null) setHoveredPipe(null);
                return;
            }

            // Ignore hover when dragging camera
            if (isPointerDown) {
                const dragDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
                if (dragDist > 6) {
                    setHoveredPipe(null);
                    return;
                }
            }

            // Respect layer visibility
            const chkPipes = document.getElementById('chk-pipes');
            if (chkPipes && !chkPipes.checked) {
                setHoveredPipe(null);
                return;
            }

            const rect = renderer.domElement.getBoundingClientRect();
            pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(pointer, camera);

            const hits = raycaster.intersectObjects(pipeClickables, false);
            if (hits.length > 0) {
                const hit = hits[0];
                const pid = hit.object.userData.pipeId;
                setHoveredPipe(pid);
                updateHoverTooltipPosition(e.clientX, e.clientY);
            } else {
                setHoveredPipe(null);
            }
        });

        renderer.domElement.addEventListener('pointerleave', () => {
            setHoveredPipe(null);
        });

        // Click to select pipe, area, or landmark (Shift+Click for multiselect)
        renderer.domElement.addEventListener('click', e => {
            // Ignore clicks on UI panels
            if (e.target !== renderer.domElement) return;

            // Ignore mouse drags (orbit/pan)
            const dragDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
            if (dragDist > 6) return;

            const rect = renderer.domElement.getBoundingClientRect();
            pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(pointer, camera);

            // 1. Check if user clicked a Pipe (only in X-Ray mode)
            if (glassMode) {
                const hits = raycaster.intersectObjects(pipeClickables, false);
                if (hits.length > 0) {
                    const hit = hits[0];
                    const pid = hit.object.userData.pipeId;
                    // Sync shift-hide state from the actual event (covers held-shift-then-click)
                    if (e.shiftKey && !shiftInspectorHidden) {
                        shiftInspectorHidden = true;
                        piPanel.style.display = 'none';
                    }
                    togglePipeSelection(pid, e.shiftKey, e.clientX, e.clientY);
                    e.stopPropagation();
                    return;
                }
            }

            // Click on empty space — deselect all unless Shift is held
            if (!e.shiftKey) {
                togglePipeSelection(null, false);
            }
        });

        // Inspector controls
        document.getElementById('pi-close').onclick = () => togglePipeSelection(null, false);

        // ── Shift-key: hide inspector while multi-selecting, restore on release ──
        let shiftInspectorHidden = false;
        window.addEventListener('keydown', e => {
            if (e.key === 'Shift' && !shiftInspectorHidden && selectedPipeIds.size > 0) {
                shiftInspectorHidden = true;
                piPanel.style.display = 'none';
            }
        });
        window.addEventListener('keyup', e => {
            if (e.key === 'Shift' && shiftInspectorHidden) {
                shiftInspectorHidden = false;
                if (selectedPipeIds.size > 0) {
                    updateInspectorContent();
                    piPanel.style.display = 'block';
                }
            }
        });

        piSlider.addEventListener('mousedown', () => { piSliderDragging = true; });
        piSlider.addEventListener('mouseup', () => { piSliderDragging = false; });
        piSlider.addEventListener('touchend', () => { piSliderDragging = false; });

        piSlider.oninput = e => {
            const v = parseFloat(e.target.value);
            document.getElementById('pi-blockage-val').textContent = v.toFixed(0) + '%';
            if (selectedPipeIds.size === 1) {
                const pid = Array.from(selectedPipeIds)[0];
                if (pipeMeshMap[pid]) pipeMeshMap[pid].data.blockage = v / 100.0;
                fetch(`/api/pipe/${pid}/blockage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ blockage: v / 100.0 })
                });
            } else if (selectedPipeIds.size > 1) {
                const pids = Array.from(selectedPipeIds);
                pids.forEach(id => {
                    if (pipeMeshMap[id]) pipeMeshMap[id].data.blockage = v / 100.0;
                });
                fetch('/api/pipes/bulk_blockage', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pipe_ids: pids, blockage: v / 100.0 })
                });
            }
        };

        document.getElementById('pi-btn-clear').onclick = () => {
            if (selectedPipeIds.size === 0) return;
            piSlider.value = 0;
            document.getElementById('pi-blockage-val').textContent = '0%';
            const pids = Array.from(selectedPipeIds);
            pids.forEach(id => {
                if (pipeMeshMap[id]) pipeMeshMap[id].data.blockage = 0.0;
            });
            if (pids.length === 1) {
                fetch(`/api/pipe/${pids[0]}/blockage`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ blockage: 0.0 })
                });
            } else {
                fetch('/api/pipes/bulk_blockage', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pipe_ids: pids, blockage: 0.0 })
                });
            }
            updateInspectorContent();
        };

        document.getElementById('pi-btn-full').onclick = () => {
            if (selectedPipeIds.size === 0) return;
            piSlider.value = 100;
            document.getElementById('pi-blockage-val').textContent = '100%';
            const pids = Array.from(selectedPipeIds);
            pids.forEach(id => {
                if (pipeMeshMap[id]) pipeMeshMap[id].data.blockage = 1.0;
            });
            if (pids.length === 1) {
                fetch(`/api/pipe/${pids[0]}/blockage`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ blockage: 1.0 })
                });
            } else {
                fetch('/api/pipes/bulk_blockage', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pipe_ids: pids, blockage: 1.0 })
                });
            }
            updateInspectorContent();
        };

        // ─── BARANGAY & ZONE VISUALS (LINES & 3D LABELS) ─────────────────────
        function drawBorderLine(d) {
            if (d.brgy_border && d.brgy_border.length > 0) {
                const points = [];
                for (const pt of d.brgy_border) {
                    const c = Math.max(0, Math.min(nx - 1, Math.round(pt[0])));
                    const r = Math.max(0, Math.min(ny - 1, Math.round(pt[1])));
                    const elev = terrainElev ? (terrainElev[r * nx + c] + 1.8) : 10;
                    points.push(new THREE.Vector3(pt[0], elev, pt[1]));
                }
                const geo = new THREE.BufferGeometry().setFromPoints(points);
                const mat = new THREE.LineBasicMaterial({
                    color: 0xdc4c40,      // tasteful modern cartographic crimson
                    linewidth: 3,
                    transparent: true,
                    opacity: 0.95,
                    depthTest: false
                });
                borderMesh = new THREE.LineLoop(geo, mat);
                borderMesh.renderOrder = 10;
                borderMesh.userData = { isBorder: true };
                scene.add(borderMesh);
            } else if (d.border_mask) {
                const points = [];
                for (let r = 1; r < ny - 1; r++) {
                    for (let c = 1; c < nx - 1; c++) {
                        const inside = d.border_mask[r][c];
                        const neighbors = [
                            d.border_mask[r - 1][c], d.border_mask[r + 1][c],
                            d.border_mask[r][c - 1], d.border_mask[r][c + 1]
                        ];
                        if (inside && neighbors.includes(false)) {
                            const elev = terrainElev[r * nx + c] + 1.0;
                            points.push(new THREE.Vector3(c, elev, r));
                        }
                    }
                }
                if (points.length > 0) {
                    const geo = new THREE.BufferGeometry().setFromPoints(points);
                    const mat = new THREE.PointsMaterial({ color: 0xdc4c40, size: 2.0, sizeAttenuation: false });
                    borderMesh = new THREE.Points(geo, mat);
                    borderMesh.userData = { isBorder: true };
                    scene.add(borderMesh);
                }
            }
        }

        function drawZoneBorders(d) {
            if (!d.zone_borders || d.zone_borders.length === 0) return;
            const pts = d.zone_borders;
            // Each segment is [x1,z1, x2,z2] — we render both endpoints as points
            // Since WebGL ignores linewidth > 1, we use Points for guaranteed visibility.
            const segCount = pts.length / 4;
            const pointBuf = new Float32Array(segCount * 2 * 3); // 2 pts per seg, xyz each
            let pi = 0;
            for (let i = 0; i < segCount; i++) {
                const x1 = pts[i * 4], z1 = pts[i * 4 + 1];
                const x2 = pts[i * 4 + 2], z2 = pts[i * 4 + 3];
                const c1 = Math.max(0, Math.min(nx - 1, Math.round(x1)));
                const r1 = Math.max(0, Math.min(ny - 1, Math.round(z1)));
                const c2 = Math.max(0, Math.min(nx - 1, Math.round(x2)));
                const r2 = Math.max(0, Math.min(ny - 1, Math.round(z2)));
                const e1 = terrainElev ? (terrainElev[r1 * nx + c1] + 0.8) : 10;
                const e2 = terrainElev ? (terrainElev[r2 * nx + c2] + 0.8) : 10;
                pointBuf[pi++] = x1; pointBuf[pi++] = e1; pointBuf[pi++] = z1;
                pointBuf[pi++] = x2; pointBuf[pi++] = e2; pointBuf[pi++] = z2;
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(pointBuf, 3));
            const mat = new THREE.PointsMaterial({
                color: 0xd6ba70,      // soft warm champagne gold — elegant community dividing lines
                size: 1.8,
                sizeAttenuation: false,
                transparent: true,
                opacity: 0.82,
                depthTest: false       // always on top of terrain
            });
            zoneBorderLines = new THREE.Points(geo, mat);
            zoneBorderLines.renderOrder = 6;
            zoneBorderLines.userData = { isZoneBorder: true };
            scene.add(zoneBorderLines);
        }

        function createTextSprite(text, subtext, colorStr) {
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 160;
            const ctx = canvas.getContext('2d');

            function renderContent(title, sub, col) {
                ctx.clearRect(0, 0, 512, 160);

                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.lineJoin = 'round';
                ctx.miterLimit = 2;

                // Google Maps style: pure text with crisp dark halo, NO background box
                // 1. Area Title (larger, prominent)
                ctx.font = '700 38px "Spotify Mix", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
                ctx.strokeStyle = 'rgba(10, 18, 30, 0.96)';
                ctx.lineWidth = 8;
                ctx.strokeText(title, 256, 50);
                ctx.fillStyle = '#ffffff';
                ctx.fillText(title, 256, 50);

                // 2. Status & Peak Subtext
                const isAlert = sub && (sub.includes('Flooded') || sub.includes('Warning') || sub.includes('Danger'));
                const statusColor = col || (isAlert ? '#e74c3c' : '#5dade2');

                ctx.font = '600 24px "Spotify Mix", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
                ctx.strokeStyle = 'rgba(10, 18, 30, 0.96)';
                ctx.lineWidth = 6;
                ctx.strokeText(sub, 256, 106);
                ctx.fillStyle = statusColor;
                ctx.fillText(sub, 256, 106);
                ctx.restore();
            }

            renderContent(text, subtext, colorStr);

            const texture = new THREE.CanvasTexture(canvas);
            texture.minFilter = THREE.LinearFilter;
            const mat = new THREE.SpriteMaterial({
                map: texture,
                depthTest: false,
                transparent: true
            });
            const sprite = new THREE.Sprite(mat);
            sprite.scale.set(50, 15.6, 1);
            sprite.renderOrder = 10;
            return { sprite, canvas, ctx, texture, renderContent };
        }

        function buildZoneLabels(zones) {
            if (!zones) return;
            zoneLabelsGroup.clear();
            zoneLabelSprites = {};

            zones.forEach(z => {
                const lx = (z.bounds && z.bounds.length === 4) ? (z.bounds[0] + z.bounds[2]) * 0.5 : z.center_x;
                const ly = (z.bounds && z.bounds.length === 4) ? (z.bounds[1] + z.bounds[3]) * 0.5 : z.center_y;
                const r = Math.max(0, Math.min(ny - 1, Math.floor(ly)));
                const c = Math.max(0, Math.min(nx - 1, Math.floor(lx)));
                const elev = terrainElev ? (terrainElev[r * nx + c] || 10) : 10;

                const entry = createTextSprite(z.name, 'Normal • Peak 0.00m', z.color);
                entry.sprite.position.set(lx, elev + 24, ly);
                entry.sprite.userData = { isZoneLabel: true, zone: z };
                entry.sprite.userData.baseScale = entry.sprite.scale.clone();
                zoneLabelsGroup.add(entry.sprite);
                zoneLabelSprites[z.id] = entry;
            });
        }

        function updateZoneLabel(zId, text, subtext, color) {
            const entry = zoneLabelSprites[zId];
            if (!entry) return;
            entry.renderContent(text, subtext, color);
            entry.texture.needsUpdate = true;
        }

        function createMapLabelSprite(name, icon, type, color) {
            const isRoad = (type === 'road');
            const isHall = (type === 'hall');
            const isSchool = (type === 'school');
            const isCommercial = (type === 'commercial');

            // 2x Retina resolution for razor-sharp typography
            const scale = 2;
            const fontSize = isHall ? 22 : (isRoad ? 16.5 : 18);
            const canvasFontSize = fontSize * scale;

            // Measure text width
            const probe = document.createElement('canvas').getContext('2d');
            probe.font = `600 ${canvasFontSize}px "Spotify Mix", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
            const textW = probe.measureText(name).width;

            // Halo padding so the text outline is never clipped
            const haloWidth = 4.5 * scale;
            const padX = Math.ceil(haloWidth * 2);
            const padY = Math.ceil(haloWidth * 2);

            const canvasW = Math.ceil(textW + padX * 2);
            const canvasH = Math.ceil(canvasFontSize * 1.35 + padY * 2);

            const canvas = document.createElement('canvas');
            canvas.width = canvasW;
            canvas.height = canvasH;
            const ctx = canvas.getContext('2d');

            // 100% transparent background — NO boxes circling the names, pure text like Google Maps
            ctx.clearRect(0, 0, canvasW, canvasH);

            const centerX = canvasW / 2;
            const centerY = canvasH / 2;

            ctx.save();
            ctx.font = `600 ${canvasFontSize}px "Spotify Mix", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineJoin = 'round';
            ctx.miterLimit = 2;

            // Google Maps dark halo effect: crisp dark outline behind text for 100% legibility on any terrain
            ctx.strokeStyle = 'rgba(10, 18, 30, 0.95)';
            ctx.lineWidth = haloWidth;
            ctx.strokeText(name, centerX, centerY);

            // Clean cartographic text color
            if (isHall) {
                ctx.fillStyle = '#f9e79f'; // Civic gold
            } else if (isRoad) {
                ctx.fillStyle = '#e2e8f0'; // Clean street white/slate
            } else if (isSchool) {
                ctx.fillStyle = '#a9dfbf'; // Soft school green
            } else if (isCommercial) {
                ctx.fillStyle = '#f5cba7'; // Soft commercial peach
            } else {
                ctx.fillStyle = '#ffffff'; // Residential white
            }
            ctx.fillText(name, centerX, centerY);
            ctx.restore();

            const texture = new THREE.CanvasTexture(canvas);
            texture.minFilter = THREE.LinearFilter;
            const mat = new THREE.SpriteMaterial({
                map: texture,
                depthTest: false,
                depthWrite: false,
                transparent: true
            });
            const sprite = new THREE.Sprite(mat);

            // Google Maps minimalist world sizing (larger, easily readable by default)
            const aspect = canvasW / canvasH;
            const worldH = isHall ? 6.2 : (isRoad ? 4.3 : 4.8);
            const worldW = worldH * aspect;
            sprite.scale.set(worldW, worldH, 1);
            sprite.renderOrder = isHall ? 16 : (isRoad ? 12 : 14);

            return sprite;
        }

        function buildMapLabels(labels) {
            if (!labels) return;
            mapLabelsGroup.clear();

            labels.forEach(l => {
                const cx = l.x;
                const cy = l.y;
                const r = Math.max(0, Math.min(ny - 1, Math.floor(cy)));
                const c = Math.max(0, Math.min(nx - 1, Math.floor(cx)));
                const elev = terrainElev ? (terrainElev[r * nx + c] || 10) : 10;

                const sprite = createMapLabelSprite(l.name, l.icon, l.type, l.color);
                const yOffset = (l.type === 'hall') ? 18 : ((l.type === 'road') ? 4.5 : 11);
                sprite.position.set(cx, elev + yOffset, cy);
                sprite.userData = { isMapLabel: true, label: l };
                sprite.userData.baseScale = sprite.scale.clone();
                mapLabelsGroup.add(sprite);
            });
        }

        let cameraTween = null;

        function flyCameraTo(targetPos, targetLookAt, durationMs = 650) {
            const startPos = camera.position.clone();
            const startLookAt = controls.target.clone();
            const startTime = performance.now();

            cameraTween = {
                update: (now) => {
                    const elapsed = now - startTime;
                    const progress = Math.min(1.0, elapsed / durationMs);
                    // Smooth ease-out cubic curve
                    const ease = 1 - Math.pow(1 - progress, 3);

                    camera.position.lerpVectors(startPos, targetPos, ease);
                    controls.target.lerpVectors(startLookAt, targetLookAt, ease);
                    camera.lookAt(controls.target);

                    if (progress >= 1.0) {
                        camera.position.copy(targetPos);
                        controls.target.copy(targetLookAt);
                        controls.update();
                        cameraTween = null;
                    }
                }
            };
        }

        const _zonePulseTimers = {};

        function pulseZoneLabel(zoneId) {
            if (!zoneId) return;
            const entry = zoneLabelSprites[zoneId];
            if (!entry || !entry.sprite) return;

            // Cancel any in-progress pulse on this zone to prevent accumulation
            if (_zonePulseTimers[zoneId]) {
                clearInterval(_zonePulseTimers[zoneId]);
                delete _zonePulseTimers[zoneId];
            }

            // Always restore to canonical base scale before starting a new pulse
            const base = entry.sprite.userData.baseScale;
            if (!base) return;
            entry.sprite.scale.copy(base);
            entry.sprite.renderOrder = 20;

            let step = 0;
            const totalSteps = 24;
            _zonePulseTimers[zoneId] = setInterval(() => {
                step++;
                // Smooth sine pulse up to 1.35x and ease back to base
                const progress = step / totalSteps;
                const factor = 1.0 + 0.35 * Math.sin(progress * Math.PI);
                entry.sprite.scale.set(base.x * factor, base.y * factor, 1);
                if (step >= totalSteps) {
                    clearInterval(_zonePulseTimers[zoneId]);
                    delete _zonePulseTimers[zoneId];
                    entry.sprite.scale.copy(base);
                    entry.sprite.renderOrder = 10;
                }
            }, 25);
        }

        // ─── ZONE LABEL FRUSTUM VISIBILITY ───────────────────────────────────
        // Sprites outside (or near the edge of) the camera frustum render
        // at huge/distorted sizes when depthTest=false. Hide them proactively.
        const _labelTmpVec = new THREE.Vector3();
        function _updateZoneLabelVisibility() {
            if (!zoneLabelsGroup || !zoneLabelsGroup.visible) return;
            zoneLabelsGroup.children.forEach(sprite => {
                // If this label is actively pulsing, keep it visible
                const zid = sprite.userData?.zone?.id;
                if (zid && _zonePulseTimers[zid]) {
                    sprite.visible = true;
                    return;
                }
                // Project world position to NDC coords (-1..1 = on screen)
                _labelTmpVec.copy(sprite.position).project(camera);
                // Use a tight margin (1.1) — just enough to avoid edge distortion
                sprite.visible = _labelTmpVec.z <= 1.0 &&
                    _labelTmpVec.x >= -1.1 && _labelTmpVec.x <= 1.1 &&
                    _labelTmpVec.y >= -1.1 && _labelTmpVec.y <= 1.1;
            });
        }

        // ─── DYNAMIC ZOOM-BASED LABEL SCALING ────────────────────────────────
        // When the user zooms out, labels dynamically expand so names become
        // larger and prominently readable across the whole city overview.
        function _updateLabelZoomScales() {
            const refDist = 400.0;
            const groups = [mapLabelsGroup, zoneLabelsGroup];
            for (let g = 0; g < groups.length; g++) {
                const grp = groups[g];
                if (!grp || !grp.visible) continue;
                for (let i = 0; i < grp.children.length; i++) {
                    const sprite = grp.children[i];
                    const base = sprite.userData?.baseScale;
                    if (!base) continue;

                    // If zone label is pulsing, let the pulse timer handle it
                    const zid = sprite.userData?.zone?.id;
                    if (zid && _zonePulseTimers[zid]) continue;

                    const dist = camera.position.distanceTo(sprite.position);
                    // Power curve: makes labels appear bigger on screen as you zoom out (dist increases)
                    // and shrink gracefully when zooming in close.
                    const factor = Math.max(0.4, Math.min(3.5, Math.pow(dist / refDist, 1.45)));
                    sprite.scale.set(base.x * factor, base.y * factor, 1);
                }
            }
        }

        // ─── RENDER LOOP ─────────────────────────────────────────────────────
        const clock = new THREE.Clock();
        function animate() {
            requestAnimationFrame(animate);
            const dt = clock.getDelta();

            if (cameraTween) {
                cameraTween.update(performance.now());
            } else {
                controls.update();
            }

            if (window.wUni) window.wUni.uTime.value += dt;
            if (rainMesh) {
                rainMesh.material.uniforms.uTime.value += dt;
                rainMesh.material.uniforms.uRain.value = currentRain;
            }

            // ── Dynamic Pipe Water Flow Pulses (zero lag, continuous dt integration) ──
            if (pipeFlowInstanced && pipeFlowList.length > 0) {
                const chkPipes = document.getElementById('chk-pipes');
                const pipesVis = !chkPipes || chkPipes.checked;
                if (!pipesVis) {
                    if (pipeFlowInstanced.visible) pipeFlowInstanced.visible = false;
                } else {
                    if (!pipeFlowInstanced.visible) pipeFlowInstanced.visible = true;
                    const dummy = new THREE.Object3D();
                    let instIdx = 0;

                    for (let i = 0; i < pipeFlowList.length; i++) {
                        const item = pipeFlowList[i];
                        const flow = item.data.flow !== undefined ? item.data.flow : 0;
                        const isFlowing = Math.abs(flow) > 0.0003;

                        for (let p = 0; p < item.numPulses; p++) {
                            if (!isFlowing) {
                                dummy.position.set(0, -9999, 0);
                                dummy.scale.set(0, 0, 0);
                                dummy.updateMatrix();
                                pipeFlowInstanced.setMatrixAt(instIdx++, dummy.matrix);
                            } else {
                                // Flow speed scales smoothly with flow rate (1.5 to 6.5 m/s)
                                const speed = Math.max(1.5, Math.min(6.5, Math.abs(flow) * 14.0 + 1.5));
                                // Continuous dt integration: never stutters or jumps when flow value changes
                                item.phases[p] = (item.phases[p] + (speed * dt) / item.dist) % 1.0;
                                const phase = item.phases[p];

                                // Direction: positive flow is v1 -> v2, reverse backpressure is v2 -> v1
                                const fromV = flow >= 0 ? item.v1 : item.v2;
                                const toV = flow >= 0 ? item.v2 : item.v1;
                                dummy.position.copy(fromV).lerp(toV, phase);
                                dummy.lookAt(toV);

                                // Smooth entrance and exit envelope (emerges and disappears seamlessly at manholes)
                                const envelope = Math.pow(Math.sin(phase * Math.PI), 0.45);

                                // Distinct, high-visibility stream capsule sized to fill the pipe conduit cleanly
                                const r = Math.max(item.data.diameter * 0.55, 0.42) * envelope;
                                dummy.scale.set(r, r, r * 3.2);
                                dummy.updateMatrix();
                                pipeFlowInstanced.setMatrixAt(instIdx++, dummy.matrix);
                            }
                        }
                    }
                    pipeFlowInstanced.instanceMatrix.needsUpdate = true;
                }
            }

            // ── River Outfall Active Discharge Pulses ────────────────────────
            const nowTime = performance.now() * 0.001;
            Object.values(nodeMeshMap).forEach(m => {
                if (m.userData && m.userData.isOutlet) {
                    let discharge = 0;
                    for (let i = 0; i < pipeFlowList.length; i++) {
                        if (pipeFlowList[i].data.out === m.userData.nodeId) {
                            discharge += Math.max(0, pipeFlowList[i].data.flow || 0);
                        }
                    }
                    if (discharge > 0.0005) {
                        const pulse = 1.0 + 0.22 * Math.sin(nowTime * 5.5);
                        m.scale.set(pulse, pulse, pulse);
                        m.material.emissiveIntensity = 1.3 + 0.7 * Math.sin(nowTime * 5.5);
                    } else {
                        m.scale.set(1.0, 1.0, 1.0);
                        m.material.emissiveIntensity = 0.85;
                    }
                }
            });

            _updateLabelZoomScales();
            _updateZoneLabelVisibility();
            renderer.render(scene, camera);
        }
        animate();

        // ─── UI HANDLERS ─────────────────────────────────────────────────────
        document.getElementById('btn-play').onclick = () => fetch('/api/control', { method: 'POST' });

        document.getElementById('btn-speed').onclick = () => {
            const steps = [1, 2, 5, 10, 25, 50];
            const idx = steps.indexOf(simSpeed);
            simSpeed = steps[(idx + 1) % steps.length];
            document.getElementById('btn-speed').innerHTML = `<i data-lucide="fast-forward"></i> ${simSpeed}×`;
            if (window.lucide) lucide.createIcons();
            fetch('/api/speed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ multiplier: simSpeed }) });
        };

        document.getElementById('slider-rain').oninput = e => {
            const v = parseFloat(e.target.value);
            const displayVal = (v % 1 === 0) ? Math.round(v) : v.toFixed(1);
            document.getElementById('val-rain').textContent = displayVal;
            const rb = document.getElementById('rain-badge');
            if (rb) rb.textContent = `${displayVal} mm/h`;
            fetch('/api/rainfall', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mm_per_hr: v }) });
            document.getElementById('sel-scenario').value = 'none';
        };

        document.getElementById('slider-bulk').oninput = e => {
            const v = e.target.value;
            document.getElementById('val-bulk').textContent = v + '%';
        };

        document.getElementById('btn-bulk-apply').onclick = () => {
            const region = document.getElementById('sel-bulk-region').value;
            const blockVal = parseFloat(document.getElementById('slider-bulk').value) / 100.0;
            const pipeIds = [];

            // nx = 660, ny = 360
            Object.values(pipeMeshMap).forEach(entry => {
                const p = entry.data;
                const nIn = nodeMeshMap[p.in];
                const nOut = nodeMeshMap[p.out];
                if (!nIn || !nOut) return;

                // Midpoint of pipe (X = col, Z = row)
                const cx = (nIn.position.x + nOut.position.x) / 2.0;
                const cy = (nIn.position.z + nOut.position.z) / 2.0;

                let match = false;
                if (region === 'all') match = true;
                else if (region === 'east') match = cx > 330;
                else if (region === 'west') match = cx <= 330;
                else if (region === 'north') match = cy < 180;
                else if (region === 'south') match = cy >= 180;

                if (match) pipeIds.push(p.id);
            });

            if (pipeIds.length > 0) {
                fetch('/api/pipes/bulk_blockage', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pipe_ids: pipeIds, blockage: blockVal })
                });
                document.getElementById('sel-scenario').value = 'none';

                // Brief visual flash on button
                const btn = document.getElementById('btn-bulk-apply');
                const oldHtml = btn.innerHTML;
                btn.innerHTML = `<i data-lucide="check"></i> Applied to ${pipeIds.length} Pipes`;
                btn.style.background = '#2ecc71';
                if (window.lucide) lucide.createIcons();
                setTimeout(() => {
                    btn.innerHTML = oldHtml;
                    btn.style.background = '';
                    if (window.lucide) lucide.createIcons();
                }, 1500);
            }
        };

        // Bulk Diameter slider display
        document.getElementById('slider-bulk-diam').oninput = e => {
            document.getElementById('val-bulk-diam').textContent = parseFloat(e.target.value).toFixed(1) + 'm';
        };

        // Bulk Diameter Apply button
        document.getElementById('btn-bulk-diam-apply').onclick = () => {
            const region = document.getElementById('sel-bulk-region').value;
            const diamVal = parseFloat(document.getElementById('slider-bulk-diam').value);
            const pipeIds = [];

            Object.values(pipeMeshMap).forEach(entry => {
                const p = entry.data;
                const nIn = nodeMeshMap[p.in];
                const nOut = nodeMeshMap[p.out];
                if (!nIn || !nOut) return;
                const cx = (nIn.position.x + nOut.position.x) / 2.0;
                const cy = (nIn.position.z + nOut.position.z) / 2.0;
                let match = false;
                if (region === 'all') match = true;
                else if (region === 'east') match = cx > 330;
                else if (region === 'west') match = cx <= 330;
                else if (region === 'north') match = cy < 180;
                else if (region === 'south') match = cy >= 180;
                if (match) pipeIds.push(p.id);
            });

            if (pipeIds.length > 0) {
                fetch('/api/pipes/bulk_diameter', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pipe_ids: pipeIds, diameter: diamVal })
                }).then(() => {
                    // Immediately rebuild geometry for every affected pipe
                    pipeIds.forEach(id => updatePipeDiameter(id, diamVal));
                });
                const btn = document.getElementById('btn-bulk-diam-apply');
                const oldHtml = btn.innerHTML;
                btn.innerHTML = `<i data-lucide="check"></i> Set on ${pipeIds.length} Pipes`;
                btn.style.background = '#2ecc71';
                if (window.lucide) lucide.createIcons();
                setTimeout(() => {
                    btn.innerHTML = oldHtml;
                    btn.style.background = '';
                    if (window.lucide) lucide.createIcons();
                }, 1500);
            }
        };

        // Pipe diameter Set button (in inspector)
        document.getElementById('pi-btn-set-diam').onclick = () => {
            if (selectedPipeIds.size === 0) return;
            const d = parseFloat(document.getElementById('pi-diam-input').value);
            if (isNaN(d) || d < 0.1) return;
            const pids = Array.from(selectedPipeIds);
            if (pids.length === 1) {
                const pid = pids[0];
                fetch(`/api/pipe/${pid}/diameter`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ diameter: d })
                }).then(() => {
                    updatePipeDiameter(pid, d);
                    document.getElementById('pi-diam').textContent = `${d.toFixed(2)} m`;
                });
            } else {
                fetch('/api/pipes/bulk_diameter', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pipe_ids: pids, diameter: d })
                }).then(() => {
                    pids.forEach(id => updatePipeDiameter(id, d));
                    document.getElementById('pi-diam').textContent = `${d.toFixed(2)} m (${pids.length} pipes)`;
                });
            }
        };

        // Scenarios
        document.getElementById('sel-scenario').onchange = async e => {
            const v = e.target.value;
            if (v === 'none') return;
            let payload = {};
            if (v === 'light' || v === 's3') {
                payload = { scenario_id: 'light', rainfall_mm_hr: 2.5, duration_sim_hours: 24, pipe_blockage_pct: 20, reset_first: false };
            } else if (v === 'moderate') {
                payload = { scenario_id: 'moderate', rainfall_mm_hr: 5, duration_sim_hours: 12, pipe_blockage_pct: 40, reset_first: false };
            } else if (v === 'heavy' || v === 's1') {
                payload = { scenario_id: 'heavy', rainfall_mm_hr: 30, duration_sim_hours: 6, pipe_blockage_pct: 65, reset_first: false };
            } else if (v === 'typhoon' || v === 'typhone' || v === 's2') {
                payload = { scenario_id: 'typhoon', rainfall_mm_hr: 55, duration_sim_hours: 12, pipe_blockage_pct: 85, reset_first: false };
            } else if (v === 'super_typhoon' || v === 'super_typhone') {
                payload = { scenario_id: 'super_typhoon', rainfall_mm_hr: 100, duration_sim_hours: 12, pipe_blockage_pct: 100, reset_first: false };
            } else {
                return;
            }

            // Immediately reflect in UI slider and badges
            const rainVal = payload.rainfall_mm_hr;
            const displayVal = (rainVal % 1 === 0) ? Math.round(rainVal) : rainVal.toFixed(1);
            document.getElementById('val-rain').textContent = displayVal;
            const rb = document.getElementById('rain-badge');
            if (rb) rb.textContent = `${displayVal} mm/h`;
            document.getElementById('slider-rain').value = rainVal;

            try {
                await fetch('/api/scenario', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                triggerImmediatePoll();
            } catch (err) {
                console.error("Failed to apply scenario:", err);
            }
        };

        // Time Skips — helper
        async function doSkip(seconds) {
            const res = await fetch('/api/state');
            const d = await res.json();
            fetch('/api/timeskip', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_sim_seconds: d.time + seconds })
            });
        }

        // (Time Skip buttons hidden — handlers removed to prevent null reference errors)


        // Rewind
        document.getElementById('btn-rewind').onclick = async () => {
            const t = parseFloat(document.getElementById('sel-snapshot').value);
            if (isNaN(t)) return;
            await fetch('/api/rewind', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ time: t }) });
            triggerImmediatePoll();
        };

        document.getElementById('btn-reset').onclick = async () => {
            await fetch('/api/reset', { method: 'POST' });
            document.getElementById('sel-scenario').value = 'none';
            document.getElementById('val-rain').textContent = '0';
            const rb = document.getElementById('rain-badge');
            if (rb) rb.textContent = '0 mm/h';
            document.getElementById('slider-rain').value = 0;
            // Immediately switch play button to paused state — no wait for next poll
            playing = false;
            const pBtnR = document.getElementById('btn-play');
            pBtnR.dataset.state = 'playing';
            pBtnR.innerHTML = '<i data-lucide="play"></i> Play';
            pBtnR.className = '';
            if (window.lucide) lucide.createIcons();
            triggerImmediatePoll();
        };

        // View Toggles (Floating Google Maps Style Toolbar)
        const btnView = document.getElementById('btn-view');
        // Helper: swap the lucide icon on btn-view by replacing its <i> and forcing re-render
        function setBtnViewIcon(iconName) {
            btnView.innerHTML = `<i data-lucide="${iconName}"></i>`;
            if (window.lucide) lucide.createIcons({ nodes: [btnView] });
        }
        btnView.onclick = () => {
            is2DView = !is2DView;
            if (!is2DView) {
                // ── 3D mode: allow orbit rotation ────────────────────────────
                camera.position.set(345, 350, 560);
                controls.target.set(345, 0, 190);
                controls.enableRotate = true;
                controls.maxDistance = 620;           // allow comfortable distance for angled 3D view
                controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
                setBtnViewIcon('map');
                btnView.setAttribute('data-tooltip', 'Switch to 2D View');
                btnView.classList.add('active');
                document.getElementById('hint').textContent = 'Drag: rotate | Right-drag: pan | Scroll: zoom | Click pipe to configure (Shift+Click: multi-select)';
            } else {
                // ── 2D mode: top-down, pan-only ──────────────────────────────
                camera.position.set(345, 400, 190.1);
                controls.target.set(345, 0, 190);
                controls.enableRotate = false;
                controls.maxDistance = 500;           // limit 2D max zoom-out so background void is not visible
                controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
                setBtnViewIcon('box');
                btnView.setAttribute('data-tooltip', 'Switch to 3D View');
                btnView.classList.remove('active');
                document.getElementById('hint').textContent = 'Drag: pan | Scroll: zoom | Click pipe to inspect (Shift+Click: multi-select)';
            }
        };



        const btnElev = document.getElementById('btn-elev');
        btnElev.onclick = () => {
            showElev = !showElev;
            btnElev.classList.toggle('active', showElev);
            btnElev.setAttribute('data-tooltip', showElev ? 'Standard Texture' : 'Elevation Heatmap');
            if (terrainMesh) {
                if (showElev) {
                    terrainMesh.material.map = null;
                    terrainMesh.material.vertexColors = true;
                    terrainMesh.geometry.setAttribute('color', new THREE.BufferAttribute(elevColors, 3));
                } else {
                    terrainMesh.material.vertexColors = false;
                    const roadsOn = document.getElementById('chk-roads') ? document.getElementById('chk-roads').checked : true;
                    terrainMesh.material.map = roadsOn ? window.roadTexture : window.grassTexture;
                }
                terrainMesh.material.needsUpdate = true;
            }
        };

        const btnGlass = document.getElementById('btn-glass');
        btnGlass.onclick = () => {
            glassMode = !glassMode;
            btnGlass.classList.toggle('active', glassMode);
            btnGlass.innerHTML = glassMode ? '<i data-lucide="eye-off"></i>' : '<i data-lucide="eye"></i>';
            btnGlass.setAttribute('data-tooltip', glassMode ? 'Exit X-Ray' : 'Underground X-Ray');

            // When exiting X-Ray mode, immediately clear pipe hover, close inspector, and deselect pipes
            if (!glassMode) {
                setHoveredPipe(null);
                if (selectedPipeIds.size > 0 || selectedPipeId !== null) {
                    togglePipeSelection(null, false);
                }
                if (pipeHoverTooltip) pipeHoverTooltip.style.display = 'none';
                renderer.domElement.style.cursor = 'default';
            }

            // 1. Terrain transparency + depthWrite + needsUpdate
            if (terrainMesh) {
                terrainMesh.material.transparent = true;
                terrainMesh.material.opacity = glassMode ? 0.22 : 1.0;
                terrainMesh.material.depthWrite = !glassMode;
                terrainMesh.material.needsUpdate = true;
            }

            // 2. Translucent water in X-Ray mode so water never occludes pipes
            if (waterMesh && window.wUni && window.wUni.uGlassMode) {
                window.wUni.uGlassMode.value = glassMode ? 1.0 : 0.0;
                waterMesh.material.depthWrite = !glassMode;
            }

            // 3. Pipes and manhole nodes shine cleanly through transparent terrain & water
            const chkPipes = document.getElementById('chk-pipes');
            const pipesVisible = chkPipes ? chkPipes.checked : true;

            Object.values(pipeMeshMap).forEach(entry => {
                entry.mesh.visible = pipesVisible;
                updatePipeVisual(entry.data.id);
            });

            scene.children.filter(o => o.isMesh && o.userData && o.userData.isDrainNode).forEach(m => {
                m.material.depthTest = !glassMode;
                m.renderOrder = glassMode ? 12 : 0;
                m.visible = pipesVisible;
            });

            if (pipeFlowInstanced) {
                pipeFlowInstanced.material.depthTest = !glassMode;
                pipeFlowInstanced.renderOrder = glassMode ? 25 : 0;
                pipeFlowInstanced.visible = pipesVisible;
            }

            // 4. Respect layer checkboxes for buildings & trees without conflict
            const chkBuildings = document.getElementById('chk-buildings');
            const chkTrees = document.getElementById('chk-trees');
            const showBuildings = !glassMode && (!chkBuildings || chkBuildings.checked);
            const showTrees = !glassMode && (!chkTrees || chkTrees.checked);

            buildingMeshes.forEach(m => { m.visible = showBuildings; });
            treeMeshes.forEach(m => { m.visible = showTrees; });

            if (window.lucide) lucide.createIcons();
        };

        // ─── LAYER FILTER EXPAND / COLLAPSE ──────────────────────────────────
        const btnLayers = document.getElementById('btn-layers');
        const layersPopover = document.getElementById('layers-popover');
        const closeLayersBtn = document.getElementById('layers-popover-close');

        btnLayers.onclick = (e) => {
            e.stopPropagation();
            const isVisible = layersPopover.style.display === 'block';
            layersPopover.style.display = isVisible ? 'none' : 'block';
            btnLayers.classList.toggle('active', !isVisible);
            if (!isVisible && window.lucide) lucide.createIcons();
        };

        if (closeLayersBtn) {
            closeLayersBtn.onclick = (e) => {
                e.stopPropagation();
                layersPopover.style.display = 'none';
                btnLayers.classList.remove('active');
            };
        }

        document.addEventListener('click', (e) => {
            if (layersPopover && layersPopover.style.display === 'block') {
                if (!layersPopover.contains(e.target) && !btnLayers.contains(e.target)) {
                    layersPopover.style.display = 'none';
                    btnLayers.classList.remove('active');
                }
            }
        });

        const layerCheckboxIds = [
            'chk-buildings', 'chk-trees', 'chk-roads', 'chk-water',
            'chk-border', 'chk-zone-borders', 'chk-zone-labels', 'chk-map-labels', 'chk-pipes', 'chk-grid'
        ];

        document.getElementById('btn-layers-all').onclick = () => {
            layerCheckboxIds.forEach(id => {
                const el = document.getElementById(id);
                if (el && !el.checked) {
                    el.checked = true;
                    el.dispatchEvent(new Event('change'));
                }
            });
        };

        document.getElementById('btn-layers-none').onclick = () => {
            layerCheckboxIds.forEach(id => {
                const el = document.getElementById(id);
                if (el && el.checked) {
                    el.checked = false;
                    el.dispatchEvent(new Event('change'));
                }
            });
        };

        // ─── LAYER VISIBILITY ─────────────────────────────────────────────────
        document.getElementById('chk-buildings').onchange = e => {
            const show = e.target.checked && !glassMode;
            buildingMeshes.forEach(m => m.visible = show);
        };

        document.getElementById('chk-trees').onchange = e => {
            const show = e.target.checked && !glassMode;
            treeMeshes.forEach(m => m.visible = show);
        };

        document.getElementById('chk-roads').onchange = e => {
            if (!terrainMesh || !window.roadTexture || !window.grassTexture) return;
            if (!showElev) {
                terrainMesh.material.map = e.target.checked ? window.roadTexture : window.grassTexture;
                terrainMesh.material.needsUpdate = true;
            }
        };

        document.getElementById('chk-water').onchange = e => {
            if (waterMesh) waterMesh.visible = e.target.checked;
        };

        document.getElementById('chk-border').onchange = e => {
            if (borderMesh) borderMesh.visible = e.target.checked;
        };

        const chkZoneBorders = document.getElementById('chk-zone-borders');
        if (chkZoneBorders) {
            chkZoneBorders.onchange = e => {
                if (zoneBorderLines) zoneBorderLines.visible = e.target.checked;
            };
        }

        const chkZoneLabels = document.getElementById('chk-zone-labels');
        if (chkZoneLabels) {
            chkZoneLabels.onchange = e => {
                if (zoneLabelsGroup) zoneLabelsGroup.visible = e.target.checked;
            };
        }

        const chkMapLabels = document.getElementById('chk-map-labels');
        if (chkMapLabels) {
            chkMapLabels.onchange = e => {
                if (mapLabelsGroup) mapLabelsGroup.visible = e.target.checked;
            };
        }

        const sitrepToggleBtn = document.getElementById('sitrep-toggle-btn');
        const sitrepBody = document.getElementById('sitrep-body');
        const sitrepHeader = document.getElementById('sitrep-header');
        if (sitrepToggleBtn && sitrepBody) {
            sitrepToggleBtn.onclick = () => {
                const isHidden = sitrepBody.style.display === 'none';
                sitrepBody.style.display = isHidden ? 'block' : 'none';
                sitrepToggleBtn.innerHTML = isHidden ? '<i data-lucide="minus"></i>' : '<i data-lucide="plus"></i>';
                if (sitrepHeader) {
                    sitrepHeader.style.borderBottom = isHidden ? '1px solid rgba(255, 255, 255, 0.06)' : 'none';
                }
                if (window.lucide) lucide.createIcons();
            };
        }

        document.getElementById('chk-pipes').onchange = e => {
            const visible = e.target.checked;
            // Toggle node spheres
            scene.children.filter(o => o.isMesh && o.userData && o.userData.isDrainNode)
                .forEach(o => o.visible = visible);
            // Toggle pipe cylinders
            Object.values(pipeMeshMap).forEach(entry => {
                entry.mesh.visible = visible;
            });
            if (pipeFlowInstanced) pipeFlowInstanced.visible = visible;
            // Clear hover and close inspector if hidden
            if (!visible) {
                setHoveredPipe(null);
                if (selectedPipeId !== null) selectPipe(null);
            }
        };

        const chkGrid = document.getElementById('chk-grid');
        if (chkGrid) {
            chkGrid.onchange = e => {
                if (gridHelper) gridHelper.visible = e.target.checked;
            };
        }

        // Collapsible Left Panel Accordion Cards
        document.querySelectorAll('.collapsible-header').forEach(header => {
            header.addEventListener('click', () => {
                const card = header.closest('.collapsible-card');
                if (card) {
                    card.classList.toggle('open');
                    if (window.lucide) lucide.createIcons();
                }
            });
        });
        // Panel Toggle (Hide/Show Left Panel)
        document.getElementById('panel-toggle').addEventListener('click', () => {
            document.getElementById('ui').classList.toggle('panel-hidden');
            if (window.lucide) lucide.createIcons();
        });



        // Initial Lucide icon generation
        if (window.lucide) {
            lucide.createIcons();
        }
        window.addEventListener('DOMContentLoaded', () => {
            if (window.lucide) lucide.createIcons();
        });
