// cars.js - Car traffic with normal and stealth variants, collision detection
import * as THREE from 'three';

// Vehicle types
const VEHICLE_TYPES = {
    CAR: 'car',
    SEDAN: 'sedan',
    SUV: 'suv',
    TRUCK: 'truck',
    SEMI: 'semi',
    MOTORCYCLE: 'motorcycle'
};

export class CarManager {
    constructor(scene, roadCurve = null, options = {}) {
        this.scene = scene;
        this.roadCurve = roadCurve;
        this.isLowEnd = !!options.isLowEnd;
        this.enableDynamicLights = options.enableDynamicLights !== false;

        this.cars = [];

        // Spawn settings
        this.baseSpawnInterval = 4; // seconds
        this.spawnTimer = 0;
        this.roadWidth = 12;
        this.roadLength = 520;

        // Stealth car settings
        this.baseStealthChance = 0.1;
        this.stealthChanceIncrease = 0.05;

        // Near-miss tracking
        this.lastNearMiss = 0;
        this.nearMissCooldown = 0.5;

        // Callback for newt crush events
        this.onNewtCrushed = null;

        // Difficulty multiplier (for endless mode)
        this.difficultyMultiplier = 1;

        // Shared materials to reduce draw calls
        this.sharedMaterials = this.createSharedMaterials();

        this.qualityLevel = this.isLowEnd ? 1 : 3;
        this.maxCars = this.isLowEnd ? 7 : 14;

        // Car object pool
        this.carPool = new Map();
        this.initPool();

        this._tmpNormal = new THREE.Vector3();
        this._tmpLaneOffset = new THREE.Vector3();
        this._tmpTargetPos = new THREE.Vector3();
        this._tmpCurvePoint = new THREE.Vector3();
        this._tmpTangent = new THREE.Vector3();

        // Scratch collision boxes (avoid per-frame allocations)
        this._carBox = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
        this._carBox2 = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
        this._newtBox = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };

        // Cached curve length (getLength() is expensive — do not call per frame)
        this._curveLength = roadCurve ? roadCurve.getLength() : 0;

        // Shared glow texture + points cloud for head/taillight halos
        this._glowTexture = this.createGlowTexture();
        this.lightGlows = null;
        this.lightGlowPositions = null;
        this.initLightGlows();
    }

    createGlowTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);
        const texture = new THREE.CanvasTexture(canvas);
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }

    // One Points cloud for every vehicle light halo => 2 extra draw calls total
    // instead of per-car sprites.
    initLightGlows() {
        const maxPoints = 32 * 3; // two headlights and one taillight per vehicle
        this.lightGlowPositions = new Float32Array(maxPoints * 3);
        const colors = new Float32Array(maxPoints * 3);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(this.lightGlowPositions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const material = new THREE.PointsMaterial({
            size: 1.6,
            map: this._glowTexture,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true
        });
        this.lightGlows = new THREE.Points(geometry, material);
        this.lightGlows.frustumCulled = false;
        this.lightGlows.geometry.setDrawRange(0, 0);
        this.scene.add(this.lightGlows);
    }

    createSharedMaterials() {
        return {
            glass: new THREE.MeshStandardMaterial({
                color: 0x88ccee, transparent: true, opacity: 0.3,
                roughness: 0.05, metalness: 0.9
            }),
            glassStealth: new THREE.MeshStandardMaterial({
                color: 0x111118, transparent: true, opacity: 0.55,
                roughness: 0.05, metalness: 0.9
            }),
            wheel: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.85 }),
            hubcap: new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.35, metalness: 0.9 }),
            chrome: new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.12, metalness: 0.95 }),
            rubber: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.95 }),
            mirror: new THREE.MeshStandardMaterial({ color: 0xaaccdd, roughness: 0.05, metalness: 1.0 }),
            seatBlack: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }),
            headlightGlow: new THREE.MeshStandardMaterial({
                color: 0xf5f8ff, emissive: 0xe8f0ff, emissiveIntensity: 2.2
            }),
            headlightOff: new THREE.MeshStandardMaterial({
                color: 0x333340, roughness: 0.3, metalness: 0.6
            }),
            taillightOn: new THREE.MeshStandardMaterial({
                color: 0xff1a1a, emissive: 0xff0000, emissiveIntensity: 1.1
            }),
            taillightOff: new THREE.MeshStandardMaterial({
                color: 0x440000, emissive: 0x000000, emissiveIntensity: 0
            }),
            turnSignal: new THREE.MeshStandardMaterial({
                color: 0xffaa00, emissive: 0xffaa00, emissiveIntensity: 0.3
            })
        };
    }

    setRoadCurve(roadCurve) {
        this.roadCurve = roadCurve;
        this._curveLength = roadCurve ? roadCurve.getLength() : 0;
    }

    setDifficultyMultiplier(mult) {
        this.difficultyMultiplier = mult;
    }

    setQualityLevel(level) {
        this.qualityLevel = Math.max(0, Math.min(3, level | 0));

        if (this.qualityLevel <= 1) {
            this.maxCars = this.isLowEnd ? 6 : 8;
        } else if (this.qualityLevel === 2) {
            this.maxCars = this.isLowEnd ? 8 : 11;
        } else {
            this.maxCars = this.isLowEnd ? 9 : 14;
        }

        const showDynamicHeadlights = this.enableDynamicLights && this.qualityLevel >= 2;
        if (this.carPool) {
            this.carPool.forEach(pool => {
                pool.meshes.forEach(mesh => {
                    mesh.traverse(child => {
                        if (child.userData.carHeadlight) {
                            child.visible = showDynamicHeadlights;
                        }
                    });
                });
            });
        }
    }

    initPool() {
        const types = Object.values(VEHICLE_TYPES);
        for (const type of types) {
            const pool = { meshes: [], available: [] };
            for (let i = 0; i < 3; i++) {
                const mesh = this.createVehicleMesh(false, type);
                mesh.visible = false;
                this.scene.add(mesh);
                pool.meshes.push(mesh);
                pool.available.push(mesh);
            }
            // Pre-create 1 stealth variant per type
            const stealthMesh = this.createVehicleMesh(true, type);
            stealthMesh.visible = false;
            stealthMesh.userData.isStealth = true;
            this.scene.add(stealthMesh);
            pool.meshes.push(stealthMesh);
            pool.available.push(stealthMesh);
            this.carPool.set(type, pool);
        }
    }

    acquireFromPool(vehicleType, isStealth) {
        const pool = this.carPool.get(vehicleType);
        if (pool) {
            const idx = pool.available.findIndex(m => !!m.userData.isStealth === isStealth);
            if (idx !== -1) {
                const mesh = pool.available.splice(idx, 1)[0];
                mesh.visible = true;
                return mesh;
            }
        }
        const mesh = this.createVehicleMesh(isStealth, vehicleType);
        if (isStealth) mesh.userData.isStealth = true;
        this.scene.add(mesh);
        if (pool) pool.meshes.push(mesh);
        return mesh;
    }

    releaseToPool(car) {
        car.mesh.visible = false;
        const pool = this.carPool.get(car.vehicleType);
        if (pool) {
            pool.available.push(car.mesh);
        } else {
            this.scene.remove(car.mesh);
        }
    }

    getRandomVehicleType() {
        // Full traffic mix — cars/SUVs are Model 3 / Y / X family, truck is
        // Cybertruck-style, semi is Tesla Semi-style, plus motorcycles.
        const rand = Math.random();
        if (rand < 0.32) return VEHICLE_TYPES.CAR;      // Model 3
        if (rand < 0.52) return VEHICLE_TYPES.SEDAN;    // Model 3 variant
        if (rand < 0.70) return VEHICLE_TYPES.SUV;      // Model Y / X
        if (rand < 0.85) return VEHICLE_TYPES.TRUCK;    // Cybertruck-style
        if (rand < 0.92) return VEHICLE_TYPES.SEMI;     // Tesla Semi-style
        return VEHICLE_TYPES.MOTORCYCLE;
    }

    createVehicleMesh(isStealth, vehicleType) {
        switch (vehicleType) {
            case VEHICLE_TYPES.MOTORCYCLE:
                return this.createMotorcycleMesh(isStealth);
            case VEHICLE_TYPES.TRUCK:
                return this.createTruckMesh(isStealth);
            case VEHICLE_TYPES.SEMI:
                return this.createSemiMesh(isStealth);
            case VEHICLE_TYPES.SUV:
                return this.createSUVMesh(isStealth);
            case VEHICLE_TYPES.SEDAN:
                return this.createSedanMesh(isStealth);
            default:
                return this.createCarMesh(isStealth);
        }
    }

    getRandomCarColor() {
        // Tesla-style palette: white, black, red, blue, silver, gray, midnight
        const colors = [0xf2f2f2, 0x1a1a1a, 0xb91c1c, 0x3e6ae1, 0xc5c9ce, 0x5c5e62, 0x1e3a5f, 0x8b7355];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    createBodyMaterial(isStealth, color) {
        return new THREE.MeshStandardMaterial({
            color: isStealth ? 0x111111 : color,
            roughness: isStealth ? 0.92 : 0.22,
            metalness: isStealth ? 0.15 : 0.72
        });
    }

    // Side-profile points [lengthZ, heightY] → smooth extruded body (Tesla silhouette)
    createSleekBodyGeometry(profile, width, bottomY = 0.28) {
        const shape = new THREE.Shape();
        shape.moveTo(profile[0][0], profile[0][1]);
        for (let i = 1; i < profile.length; i++) {
            shape.lineTo(profile[i][0], profile[i][1]);
        }
        shape.closePath();

        const geo = new THREE.ExtrudeGeometry(shape, {
            depth: width,
            bevelEnabled: true,
            bevelThickness: 0.07,
            bevelSize: 0.06,
            bevelSegments: 3,
            curveSegments: 1
        });
        // Shape XY = length/height, extrude Z = width → map to X=width, Y=height, Z=length
        geo.rotateY(-Math.PI / 2);
        geo.computeBoundingBox();
        const bb = geo.boundingBox;
        geo.translate(
            -(bb.min.x + bb.max.x) * 0.5,
            bottomY - bb.min.y,
            -(bb.min.z + bb.max.z) * 0.5
        );
        return geo;
    }

    addGlassCabin(group, glassMat, opts) {
        const {
            width = 1.7,
            height = 0.42,
            length = 1.7,
            y = 1.2,
            z = -0.15,
            roofY = 1.42
        } = opts;

        // Side glass ribbons
        const sideGeo = new THREE.BoxGeometry(0.05, height, length);
        const sideL = new THREE.Mesh(sideGeo, glassMat);
        sideL.position.set(width * 0.5, y, z);
        group.add(sideL);
        const sideR = new THREE.Mesh(sideGeo, glassMat);
        sideR.position.set(-width * 0.5, y, z);
        group.add(sideR);

        // Windshield (steep EV rake)
        const windshield = new THREE.Mesh(new THREE.BoxGeometry(width * 0.92, height * 1.05, 0.06), glassMat);
        windshield.position.set(0, y + 0.02, z + length * 0.48);
        windshield.rotation.x = 0.42;
        group.add(windshield);

        // Rear glass (fastback)
        const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(width * 0.88, height * 0.9, 0.06), glassMat);
        rearGlass.position.set(0, y - 0.02, z - length * 0.48);
        rearGlass.rotation.x = -0.48;
        group.add(rearGlass);

        // Glass roof strip
        const roof = new THREE.Mesh(new THREE.BoxGeometry(width * 0.72, 0.04, length * 0.7), glassMat);
        roof.position.set(0, roofY, z);
        group.add(roof);
    }

    addTeslaFront(group, bodyMat, zPos, yPos = 0.52) {
        // Closed fascia (no open grille) — signature EV front
        const fascia = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.28, 0.08), bodyMat);
        fascia.position.set(0, yPos, zPos);
        group.add(fascia);

        // Subtle lower air intake
        const intake = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 0.06), this.sharedMaterials.rubber);
        intake.position.set(0, yPos - 0.22, zPos + 0.01);
        group.add(intake);

        // Body-colored bumper lip
        const lip = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.1, 0.18), bodyMat);
        lip.position.set(0, 0.28, zPos + 0.02);
        group.add(lip);
    }

    addTeslaLights(group, isStealth, frontZ, rearZ, yLight = 0.58) {
        // Thin horizontal LED headlight bars
        const headMat = isStealth ? this.sharedMaterials.headlightOff : this.sharedMaterials.headlightGlow;
        const barGeo = new THREE.BoxGeometry(0.52, 0.055, 0.07);
        const leftBar = new THREE.Mesh(barGeo, headMat);
        leftBar.position.set(0.62, yLight, frontZ);
        group.add(leftBar);
        const rightBar = new THREE.Mesh(barGeo, headMat);
        rightBar.position.set(-0.62, yLight, frontZ);
        group.add(rightBar);

        // Amber corner markers
        const markerGeo = new THREE.BoxGeometry(0.12, 0.05, 0.05);
        const mL = new THREE.Mesh(markerGeo, this.sharedMaterials.turnSignal);
        mL.position.set(0.95, yLight, frontZ - 0.02);
        group.add(mL);
        const mR = new THREE.Mesh(markerGeo, this.sharedMaterials.turnSignal);
        mR.position.set(-0.95, yLight, frontZ - 0.02);
        group.add(mR);

        if (!isStealth && this.enableDynamicLights && this.qualityLevel >= 2) {
            const light = new THREE.SpotLight(0xf5f8ff, 2.5, 25, 0.5, 0.6);
            light.position.set(0, yLight, frontZ);
            light.target.position.set(0, 0, frontZ + 20);
            light.castShadow = false;
            light.userData.carHeadlight = true;
            group.add(light);
            group.add(light.target);
        }

        // Continuous red taillight bar
        const tailMat = isStealth ? this.sharedMaterials.taillightOff : this.sharedMaterials.taillightOn;
        const tailBar = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.06, 0.06), tailMat);
        tailBar.position.set(0, yLight + 0.08, rearZ);
        group.add(tailBar);
    }

    addAeroWheels(group, xOffset, zOffset, radius = 0.34, zPos = 0) {
        const wheelGeo = new THREE.CylinderGeometry(radius, radius, 0.26, 12);
        // Large disc hubcap for aero look
        const hubGeo = new THREE.CylinderGeometry(radius * 0.72, radius * 0.72, 0.28, 12);
        const ringGeo = new THREE.TorusGeometry(radius * 0.55, 0.025, 6, 16);

        const positions = [
            { x: xOffset, z: zPos + zOffset },
            { x: -xOffset, z: zPos + zOffset },
            { x: xOffset, z: zPos - zOffset },
            { x: -xOffset, z: zPos - zOffset }
        ];

        positions.forEach(pos => {
            const wheel = new THREE.Mesh(wheelGeo, this.sharedMaterials.wheel);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(pos.x, radius, pos.z);
            group.add(wheel);

            const hub = new THREE.Mesh(hubGeo, this.sharedMaterials.hubcap);
            hub.rotation.z = Math.PI / 2;
            hub.position.set(pos.x, radius, pos.z);
            group.add(hub);

            const ring = new THREE.Mesh(ringGeo, this.sharedMaterials.chrome);
            ring.rotation.y = Math.PI / 2;
            ring.position.set(pos.x + (pos.x > 0 ? 0.02 : -0.02), radius, pos.z);
            group.add(ring);
        });
    }

    // ─── TESLA-STYLE VEHICLE MESHES ─────────────────────────────────

    createCarMesh(isStealth) {
        // Tesla Model 3 — sleek fastback sedan, closed nose, glass roof, aero wheels.
        const group = new THREE.Group();
        const bodyMat = this.createBodyMaterial(isStealth, this.getRandomCarColor());
        const glassMat = isStealth ? this.sharedMaterials.glassStealth : this.sharedMaterials.glass;

        const profile = [
            [-2.10, 0.18], // rear bottom
            [2.10, 0.18],  // front bottom
            [2.18, 0.32],  // front lip (low Model 3 nose)
            [2.10, 0.55],  // closed nose — no grille
            [1.60, 0.72],  // frunk / hood leading edge
            [0.75, 0.80],  // hood / cowl
            [0.20, 1.26],  // windshield base → A-pillar
            [-0.60, 1.36], // glass roof peak
            [-1.30, 1.12], // fastback rear glass
            [-1.80, 0.78], // short decklid + ducktail
            [-2.18, 0.48], // rear bumper
            [-2.10, 0.18]
        ];

        const body = new THREE.Mesh(this.createSleekBodyGeometry(profile, 1.95, 0.26), bodyMat);
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        // Panoramic glass: windshield + roof in one continuous canopy
        this.addGlassCabin(group, glassMat, {
            width: 1.78, height: 0.4, length: 1.65, y: 1.12, z: -0.12, roofY: 1.38
        });
        // Extra-long roof glass strip — signature Model 3 canopy
        const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.035, 1.55), glassMat);
        canopy.position.set(0, 1.40, -0.25);
        canopy.rotation.x = -0.06;
        group.add(canopy);

        this.addTeslaFront(group, bodyMat, 2.13, 0.50);
        this.addModel3Headlights(group, isStealth);
        this.addModel3Details(group, bodyMat, glassMat);
        this.addSideMirrors(group, 1.0, 1.16, 0.55);
        this.addAeroWheels(group, 0.98, 1.35, 0.34);
        this.addTeslaLights(group, isStealth, 2.12, -2.14, 0.58);

        group.userData.isModel3 = true;
        return group;
    }

    // Model 3 swept-eye LED headlights + flush handles + repeater cameras.
    addModel3Headlights(group, isStealth) {
        const headMat = isStealth ? this.sharedMaterials.headlightOff : this.sharedMaterials.headlightGlow;
        // Angled teardrop lenses sweeping back from the nose
        const lensGeo = new THREE.BoxGeometry(0.28, 0.07, 0.55);
        const leftLens = new THREE.Mesh(lensGeo, headMat);
        leftLens.position.set(0.72, 0.68, 1.88);
        leftLens.rotation.y = -0.38;
        leftLens.rotation.z = 0.08;
        group.add(leftLens);
        const rightLens = new THREE.Mesh(lensGeo, headMat);
        rightLens.position.set(-0.72, 0.68, 1.88);
        rightLens.rotation.y = 0.38;
        rightLens.rotation.z = -0.08;
        group.add(rightLens);
    }

    addModel3Details(group, bodyMat, glassMat) {
        // Flush door handles — thin dark blades sitting proud of the body
        const handleGeo = new THREE.BoxGeometry(0.03, 0.035, 0.22);
        const handleMat = this.sharedMaterials.rubber;
        const handlePositions = [
            [0.985, 0.82, 0.45], [-0.985, 0.82, 0.45],
            [0.985, 0.82, -0.45], [-0.985, 0.82, -0.45]
        ];
        for (const [x, y, z] of handlePositions) {
            const handle = new THREE.Mesh(handleGeo, handleMat);
            handle.position.set(x, y, z);
            group.add(handle);
        }

        // Side repeater cameras on front fenders
        const camGeo = new THREE.BoxGeometry(0.05, 0.06, 0.16);
        const camL = new THREE.Mesh(camGeo, this.sharedMaterials.rubber);
        camL.position.set(1.0, 0.88, 0.78);
        group.add(camL);
        const camR = new THREE.Mesh(camGeo, this.sharedMaterials.rubber);
        camR.position.set(-1.0, 0.88, 0.78);
        group.add(camR);

        // Door shut lines (subtle dark seams)
        const seamGeo = new THREE.BoxGeometry(0.012, 0.5, 0.02);
        for (const side of [0.978, -0.978]) {
            for (const z of [0.05, -0.75]) {
                const seam = new THREE.Mesh(seamGeo, this.sharedMaterials.rubber);
                seam.position.set(side, 0.68, z);
                group.add(seam);
            }
        }

        // Rear diffuser + license recess
        const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 0.1), this.sharedMaterials.rubber);
        diffuser.position.set(0, 0.30, -2.14);
        group.add(diffuser);
        const plate = new THREE.Mesh(
            new THREE.BoxGeometry(0.44, 0.12, 0.03),
            new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5 })
        );
        plate.position.set(0, 0.52, -2.16);
        group.add(plate);
    }

    createSedanMesh(isStealth) {
        // Model 3 long-range variant — stretched Tesla sedan proportions
        const group = new THREE.Group();
        const bodyMat = this.createBodyMaterial(isStealth, this.getRandomCarColor());
        const glassMat = isStealth ? this.sharedMaterials.glassStealth : this.sharedMaterials.glass;

        const profile = [
            [-2.35, 0.16],
            [2.35, 0.16],
            [2.42, 0.32],
            [2.32, 0.54],
            [1.75, 0.70],
            [0.85, 0.76],
            [0.28, 1.22],
            [-0.7, 1.30],
            [-1.55, 1.05],
            [-2.05, 0.72],
            [-2.42, 0.46],
            [-2.35, 0.16]
        ];

        const body = new THREE.Mesh(this.createSleekBodyGeometry(profile, 1.9, 0.24), bodyMat);
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        this.addGlassCabin(group, glassMat, {
            width: 1.72, height: 0.38, length: 1.85, y: 1.08, z: -0.15, roofY: 1.34
        });
        this.addTeslaFront(group, bodyMat, 2.35, 0.48);
        this.addSideMirrors(group, 0.98, 1.12, 0.6);
        this.addAeroWheels(group, 0.95, 1.55, 0.33);
        this.addTeslaLights(group, isStealth, 2.38, -2.38, 0.54);

        return group;
    }

    createSUVMesh(isStealth) {
        // Crossover hatch — Model Y proportions
        const group = new THREE.Group();
        const bodyMat = this.createBodyMaterial(isStealth, this.getRandomCarColor());
        const glassMat = isStealth ? this.sharedMaterials.glassStealth : this.sharedMaterials.glass;

        const profile = [
            [-2.15, 0.22],
            [2.15, 0.22],
            [2.22, 0.38],
            [2.12, 0.68],
            [1.55, 0.88],
            [0.75, 0.94],
            [0.25, 1.48],
            [-0.7, 1.55],
            [-1.45, 1.38],
            [-1.95, 0.95],
            [-2.22, 0.55],
            [-2.15, 0.22]
        ];

        const body = new THREE.Mesh(this.createSleekBodyGeometry(profile, 2.1, 0.32), bodyMat);
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        this.addGlassCabin(group, glassMat, {
            width: 1.95, height: 0.48, length: 1.9, y: 1.28, z: -0.2, roofY: 1.58
        });
        this.addTeslaFront(group, bodyMat, 2.15, 0.58);

        // Subtle black lower cladding (crossover)
        const cladding = new THREE.Mesh(
            new THREE.BoxGeometry(2.12, 0.14, 3.8),
            this.sharedMaterials.rubber
        );
        cladding.position.set(0, 0.38, 0);
        group.add(cladding);

        this.addSideMirrors(group, 1.1, 1.32, 0.65);
        this.addAeroWheels(group, 1.05, 1.45, 0.38);
        this.addTeslaLights(group, isStealth, 2.18, -2.18, 0.62);

        // Model X cues: falcon-door vertical seams + rear spoiler lip
        const falconGeo = new THREE.BoxGeometry(0.012, 0.62, 0.02);
        for (const side of [1.058, -1.058]) {
            for (const z of [0.1, -0.9]) {
                const seam = new THREE.Mesh(falconGeo, this.sharedMaterials.rubber);
                seam.position.set(side, 1.0, z);
                group.add(seam);
            }
        }
        const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.28), bodyMat);
        spoiler.position.set(0, 1.52, -2.05);
        spoiler.rotation.x = -0.1;
        group.add(spoiler);

        group.userData.isModelYX = true;
        return group;
    }

    createTruckMesh(isStealth) {
        // Cybertruck-style angular EV pickup — stainless wedge, LED bar, vault bed.
        const group = new THREE.Group();
        const stainlessColor = isStealth ? 0x111111 : 0xb9bdc2;
        const bodyMat = new THREE.MeshStandardMaterial({
            color: stainlessColor,
            roughness: isStealth ? 0.95 : 0.32,
            metalness: isStealth ? 0.1 : 0.85
        });
        const glassMat = isStealth ? this.sharedMaterials.glassStealth : this.sharedMaterials.glass;

        // Angular wedge body (flat panels, sharp crease)
        const profile = [
            [-2.5, 0.30],
            [2.45, 0.30],
            [2.50, 0.55],
            [1.90, 0.80],
            [0.60, 0.95],
            [0.10, 1.55],
            [-1.10, 1.62],
            [-1.30, 1.10],
            [-2.30, 1.02],
            [-2.55, 0.60],
            [-2.50, 0.30]
        ];
        const body = new THREE.Mesh(this.createSleekBodyGeometry(profile, 2.05, 0.34), bodyMat);
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        // Angular windshield plane (single flat sheet)
        const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.62, 0.06), glassMat);
        windshield.position.set(0, 1.28, 0.62);
        windshield.rotation.x = 0.62;
        group.add(windshield);

        // Side glass (triangular-ish slabs)
        const sideGeo = new THREE.BoxGeometry(0.05, 0.42, 1.1);
        const sideL = new THREE.Mesh(sideGeo, glassMat);
        sideL.position.set(1.03, 1.22, -0.15);
        group.add(sideL);
        const sideR = new THREE.Mesh(sideGeo, glassMat);
        sideR.position.set(-1.03, 1.22, -0.15);
        group.add(sideR);

        // Vault tonneau cover (flat bed lid)
        const vault = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 2.2), bodyMat);
        vault.position.set(0, 1.06, -1.35);
        vault.rotation.x = 0.06;
        group.add(vault);

        // Closed nose + full-width LED bar (no grille on an EV truck)
        this.addTeslaFront(group, bodyMat, 2.45, 0.55);
        this.addTeslaLights(group, isStealth, 2.48, -2.55, 0.62);

        // Black lower armor cladding instead of chrome
        const armor = new THREE.Mesh(
            new THREE.BoxGeometry(2.07, 0.16, 4.4),
            this.sharedMaterials.rubber
        );
        armor.position.set(0, 0.40, 0);
        group.add(armor);

        this.addSideMirrors(group, 1.08, 1.35, 0.75);
        this.addAeroWheels(group, 1.02, 1.6, 0.42);

        group.userData.isCybertruck = true;
        return group;
    }

    createSemiMesh(isStealth) {
        const group = new THREE.Group();
        const bodyColor = isStealth ? 0x111111 : this.getRandomCarColor();
        const cabMat = new THREE.MeshStandardMaterial({
            color: bodyColor,
            roughness: isStealth ? 0.95 : 0.35,
            metalness: isStealth ? 0.1 : 0.5
        });
        const glassMat = isStealth ? this.sharedMaterials.glassStealth : this.sharedMaterials.glass;

        // Cab body
        const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.7, 2.5), cabMat);
        cab.position.set(0, 1.35, 3);
        cab.castShadow = true;
        group.add(cab);

        // Cab roof / air deflector
        const deflector = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.7, 1.3), cabMat);
        deflector.position.set(0, 2.5, 3.3);
        group.add(deflector);
        // Deflector sloped front
        const deflSlope = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 0.8), cabMat);
        deflSlope.position.set(0, 2.88, 3.0);
        deflSlope.rotation.x = 0.5;
        group.add(deflSlope);

        // Windshield
        const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.85, 0.08), glassMat);
        windshield.position.set(0, 2.1, 4.28);
        windshield.rotation.x = 0.12;
        group.add(windshield);

        // Side windows
        const sideGeo = new THREE.BoxGeometry(0.06, 0.65, 1.6);
        const sideL = new THREE.Mesh(sideGeo, glassMat);
        sideL.position.set(1.22, 2.0, 3);
        group.add(sideL);
        const sideR = new THREE.Mesh(sideGeo, glassMat);
        sideR.position.set(-1.22, 2.0, 3);
        group.add(sideR);

        // Tesla Semi: body-color aero bumper, closed nose (no grille, no diesel parts)
        const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.4, 0.3), cabMat);
        bumper.position.set(0, 0.5, 4.35);
        group.add(bumper);

        // Closed aero panel + thin lower intake
        const aeroPanel = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 0.06), cabMat);
        aeroPanel.position.set(0, 0.95, 4.28);
        group.add(aeroPanel);
        const intake = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.06), this.sharedMaterials.rubber);
        intake.position.set(0, 0.62, 4.30);
        group.add(intake);

        // Aero side skirts instead of fuel tanks
        const skirtGeo = new THREE.BoxGeometry(0.25, 0.5, 1.8);
        const skirtL = new THREE.Mesh(skirtGeo, cabMat);
        skirtL.position.set(1.30, 0.5, 2.2);
        group.add(skirtL);
        const skirtR = new THREE.Mesh(skirtGeo, cabMat);
        skirtR.position.set(-1.30, 0.5, 2.2);
        group.add(skirtR);

        // Flush steps
        const stepGeo = new THREE.BoxGeometry(0.3, 0.08, 0.6);
        const stepL = new THREE.Mesh(stepGeo, this.sharedMaterials.rubber);
        stepL.position.set(1.25, 0.3, 3.5);
        group.add(stepL);
        const stepR = new THREE.Mesh(stepGeo, this.sharedMaterials.rubber);
        stepR.position.set(-1.25, 0.3, 3.5);
        group.add(stepR);

        // Camera pods instead of large diesel mirrors (Tesla Semi has no big mirrors)
        const podGeo = new THREE.BoxGeometry(0.18, 0.1, 0.3);
        const podL = new THREE.Mesh(podGeo, this.sharedMaterials.rubber);
        podL.position.set(1.30, 2.1, 3.8);
        group.add(podL);
        const podR = new THREE.Mesh(podGeo, this.sharedMaterials.rubber);
        podR.position.set(-1.30, 2.1, 3.8);
        group.add(podR);

        // Trailer
        const trailerMat = new THREE.MeshStandardMaterial({
            color: isStealth ? 0x0a0a0a : 0xcccccc,
            roughness: 0.8
        });
        const trailer = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.8, 8), trailerMat);
        trailer.position.set(0, 1.9, -2.5);
        trailer.castShadow = true;
        group.add(trailer);

        // Trailer underframe
        const frame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 8), this.sharedMaterials.rubber);
        frame.position.set(0, 0.4, -2.5);
        group.add(frame);

        // Mud flaps behind trailer wheels
        const flapGeo = new THREE.BoxGeometry(0.5, 0.4, 0.05);
        const flapL = new THREE.Mesh(flapGeo, this.sharedMaterials.rubber);
        flapL.position.set(1.2, 0.35, -4.2);
        group.add(flapL);
        const flapR = new THREE.Mesh(flapGeo, this.sharedMaterials.rubber);
        flapR.position.set(-1.2, 0.35, -4.2);
        group.add(flapR);

        // Rear reflectors
        const reflGeo = new THREE.BoxGeometry(0.2, 0.2, 0.04);
        const reflMat = new THREE.MeshStandardMaterial({
            color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 0.2
        });
        const reflL = new THREE.Mesh(reflGeo, reflMat);
        reflL.position.set(1.1, 1.0, -6.52);
        group.add(reflL);
        const reflR = new THREE.Mesh(reflGeo, reflMat);
        reflR.position.set(-1.1, 1.0, -6.52);
        group.add(reflR);

        // Wheels - cab
        this.addWheels(group, 1.1, 0.8, 0.42, 3);
        // Wheels - trailer front
        this.addWheels(group, 1.2, 0.8, 0.42, -1);
        // Wheels - trailer back
        this.addWheels(group, 1.2, 0.8, 0.42, -3.5);

        this.addTeslaLights(group, isStealth, 4.32, -6.52, 0.95);

        group.userData.isLarge = true;
        return group;
    }

    // Helper: realistic spoked wheel with tire, rim, spokes, brake disc + caliper.
    addMotoWheel(group, z, radius = 0.35) {
        const y = radius;
        // Tire (torus) — axle along X
        const tire = new THREE.Mesh(
            new THREE.TorusGeometry(radius - 0.075, 0.075, 10, 22),
            this.sharedMaterials.wheel
        );
        tire.rotation.y = Math.PI / 2;
        tire.position.set(0, y, z);
        tire.castShadow = true;
        group.add(tire);

        // Rim ring
        const rim = new THREE.Mesh(
            new THREE.TorusGeometry(radius * 0.52, 0.022, 8, 20),
            this.sharedMaterials.hubcap
        );
        rim.rotation.y = Math.PI / 2;
        rim.position.set(0, y, z);
        group.add(rim);

        // Spokes (5 thin blades in the YZ plane)
        const spokeLen = radius * 0.95;
        const spokeGeo = new THREE.BoxGeometry(0.022, spokeLen, 0.035);
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            const spoke = new THREE.Mesh(spokeGeo, this.sharedMaterials.hubcap);
            spoke.position.set(0, y, z);
            spoke.rotation.x = a;
            // Offset so each spoke runs hub → rim instead of through the hub
            spoke.translateY(spokeLen * 0.5 - 0.03);
            group.add(spoke);
        }

        // Hub
        const hub = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 0.09, 10),
            this.sharedMaterials.hubcap
        );
        hub.rotation.z = Math.PI / 2;
        hub.position.set(0, y, z);
        group.add(hub);

        // Brake disc (steel) + caliper (dark) on the left side
        const disc = new THREE.Mesh(
            new THREE.CylinderGeometry(radius * 0.42, radius * 0.42, 0.02, 18),
            this.sharedMaterials.chrome
        );
        disc.rotation.z = Math.PI / 2;
        disc.position.set(0.055, y, z);
        group.add(disc);
        const caliper = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 0.1, 0.07),
            this.sharedMaterials.rubber
        );
        caliper.position.set(0.055, y + radius * 0.3, z - radius * 0.18);
        group.add(caliper);
    }

    createMotorcycleMesh(isStealth) {
        // Realistic sport-touring motorcycle with rider — spoked wheels, fairing,
        // sculpted tank/tail, detailed engine + exhaust, articulated rider.
        const group = new THREE.Group();
        const bodyColor = isStealth ? 0x111111 : this.getRandomCarColor();
        const bodyMat = new THREE.MeshStandardMaterial({
            color: bodyColor,
            roughness: isStealth ? 0.95 : 0.25,
            metalness: isStealth ? 0.1 : 0.75
        });
        const darkPlastic = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.6, metalness: 0.2 });
        const glassMat = isStealth ? this.sharedMaterials.glassStealth : this.sharedMaterials.glass;

        // ── Wheels (tire + rim + spokes + brake hardware) ──
        this.addMotoWheel(group, 1.1, 0.35);
        this.addMotoWheel(group, -0.7, 0.35);

        // ── Front end: dual forks, triple clamp, fender ──
        const forkOuterGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.5, 8);
        const forkInnerGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.35, 8);
        for (const side of [0.09, -0.09]) {
            const lower = new THREE.Mesh(forkOuterGeo, darkPlastic);
            lower.position.set(side, 0.42, 1.02);
            lower.rotation.x = 0.32;
            group.add(lower);
            const stanchion = new THREE.Mesh(forkInnerGeo, this.sharedMaterials.chrome);
            stanchion.position.set(side, 0.72, 0.90);
            stanchion.rotation.x = 0.32;
            group.add(stanchion);
        }
        // Triple clamp + steering stem
        const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.12), darkPlastic);
        clamp.position.set(0, 0.94, 0.80);
        group.add(clamp);

        // Front fender hugging the tire (curved segment)
        const fenderGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.16, 12, 1, true, -0.5, 1.1);
        const fenderF = new THREE.Mesh(fenderGeo, bodyMat);
        fenderF.rotation.z = Math.PI / 2;
        fenderF.rotation.y = Math.PI / 2;
        fenderF.position.set(0, 0.35, 1.1);
        group.add(fenderF);

        // ── Fairing: nose cone + side panels + windscreen ──
        const nose = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.42), bodyMat);
        nose.position.set(0, 0.78, 1.02);
        nose.rotation.x = 0.28;
        nose.castShadow = true;
        group.add(nose);
        for (const side of [0.20, -0.20]) {
            const panel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.7), bodyMat);
            panel.position.set(side, 0.62, 0.68);
            panel.rotation.x = 0.12;
            panel.castShadow = true;
            group.add(panel);
            // Fairing vent (dark inset)
            const vent = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.3), darkPlastic);
            vent.position.set(side + (side > 0 ? 0.035 : -0.035), 0.60, 0.68);
            group.add(vent);
        }
        // Clear windscreen
        const screen = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.34), glassMat);
        screen.position.set(0, 1.02, 0.86);
        screen.rotation.x = -0.55;
        group.add(screen);

        // ── Frame: twin spars + swingarm + chain ──
        for (const side of [0.09, -0.09]) {
            const spar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 1.1), darkPlastic);
            spar.position.set(side, 0.68, 0.05);
            spar.rotation.x = -0.08;
            group.add(spar);
            // Swingarm blade pivot → rear axle
            const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.95), darkPlastic);
            arm.position.set(side * 1.6, 0.38, -0.28);
            group.add(arm);
        }
        // Rear shock
        const shock = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 8), this.sharedMaterials.turnSignal);
        shock.position.set(0, 0.55, -0.45);
        shock.rotation.x = 0.5;
        group.add(shock);
        // Chain (left side) + sprockets
        const chain = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.85), this.sharedMaterials.rubber);
        chain.position.set(-0.12, 0.36, -0.28);
        group.add(chain);
        const sprocket = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 12), this.sharedMaterials.hubcap);
        sprocket.rotation.z = Math.PI / 2;
        sprocket.position.set(-0.12, 0.35, -0.7);
        group.add(sprocket);

        // ── Sculpted fuel tank + cap ──
        const tankGeo = new THREE.SphereGeometry(0.5, 14, 12);
        const tank = new THREE.Mesh(tankGeo, bodyMat);
        tank.scale.set(0.46, 0.30, 0.85);
        tank.position.set(0, 0.82, 0.15);
        tank.castShadow = true;
        group.add(tank);
        // Knee dents (dark scallops each side)
        for (const side of [0.20, -0.20]) {
            const dent = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), darkPlastic);
            dent.scale.set(0.4, 0.7, 1.2);
            dent.position.set(side, 0.76, 0.05);
            group.add(dent);
        }
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 10), this.sharedMaterials.chrome);
        cap.position.set(0, 0.965, 0.22);
        group.add(cap);

        // ── Engine: crankcase + cooling fins + radiator + exhaust ──
        const crank = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, 0.45), this.sharedMaterials.hubcap);
        crank.position.set(0, 0.42, 0.15);
        group.add(crank);
        for (let i = 0; i < 4; i++) {
            const fin = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.02, 0.4), darkPlastic);
            fin.position.set(0, 0.36 + i * 0.055, 0.15);
            group.add(fin);
        }
        const radiator = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 0.06), darkPlastic);
        radiator.position.set(0, 0.52, 0.62);
        radiator.rotation.x = 0.25;
        group.add(radiator);
        // Headers → collector → muffler (right side)
        for (const side of [0.08, -0.08]) {
            const header = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.5, 8), this.sharedMaterials.chrome);
            header.position.set(side, 0.38, 0.42);
            header.rotation.x = 1.1;
            group.add(header);
        }
        const midPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 8), this.sharedMaterials.chrome);
        midPipe.rotation.x = Math.PI / 2;
        midPipe.position.set(0.16, 0.30, -0.15);
        group.add(midPipe);
        const mufflerGeo = new THREE.CylinderGeometry(0.055, 0.065, 0.55, 10);
        mufflerGeo.rotateX(Math.PI / 2);
        const muffler = new THREE.Mesh(mufflerGeo, this.sharedMaterials.chrome);
        muffler.position.set(0.24, 0.34, -0.62);
        group.add(muffler);
        const tipGeo = new THREE.CylinderGeometry(0.058, 0.058, 0.05, 10);
        tipGeo.rotateX(Math.PI / 2);
        const tip = new THREE.Mesh(tipGeo, darkPlastic);
        tip.position.set(0.24, 0.34, -0.90);
        group.add(tip);

        // ── Seat + tail unit ──
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.09, 0.5), this.sharedMaterials.seatBlack);
        seat.position.set(0, 0.86, -0.30);
        group.add(seat);
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.28), this.sharedMaterials.seatBlack);
        pad.position.set(0, 0.90, -0.60);
        group.add(pad);
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.5), bodyMat);
        tail.position.set(0, 0.92, -0.72);
        tail.rotation.x = -0.18;
        tail.castShadow = true;
        group.add(tail);
        // Rear hugger fender over the wheel
        const hugger = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.4), darkPlastic);
        hugger.position.set(0, 0.62, -0.70);
        group.add(hugger);

        // ── Controls: clip-ons, grips, levers, mirrors, pegs ──
        for (const side of [1, -1]) {
            const clip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8), darkPlastic);
            clip.rotation.z = Math.PI / 2;
            clip.rotation.y = side * 0.35;
            clip.position.set(side * 0.24, 0.98, 0.72);
            group.add(clip);
            const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.14, 8), this.sharedMaterials.rubber);
            grip.rotation.z = Math.PI / 2;
            grip.position.set(side * 0.38, 0.98, 0.66);
            group.add(grip);
            // Brake/clutch lever
            const lever = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.015, 0.03), this.sharedMaterials.chrome);
            lever.position.set(side * 0.32, 0.96, 0.76);
            lever.rotation.y = side * 0.3;
            group.add(lever);
            // Mirror stalk + head
            const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), darkPlastic);
            stalk.position.set(side * 0.26, 1.10, 0.74);
            stalk.rotation.z = side * -0.4;
            group.add(stalk);
            const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.04), darkPlastic);
            mirror.position.set(side * 0.32, 1.20, 0.74);
            group.add(mirror);
            const mirrorGlass = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.01), this.sharedMaterials.mirror);
            mirrorGlass.position.set(side * 0.32, 1.20, 0.765);
            group.add(mirrorGlass);
            // Foot peg + boot anchor
            const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 8), this.sharedMaterials.rubber);
            peg.rotation.z = Math.PI / 2;
            peg.position.set(side * 0.22, 0.32, -0.15);
            group.add(peg);
        }

        // ── Rider: leathers, limbs to bars/pegs, helmet with visor ──
        const leatherMat = new THREE.MeshStandardMaterial({ color: isStealth ? 0x0a0a0a : 0x1d1d20, roughness: 0.7 });
        // Hips on seat
        const hips = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.3), leatherMat);
        hips.position.set(0, 0.95, -0.32);
        group.add(hips);
        // Thighs (hips → knees hugging tank) + shins (knees → pegs) + boots
        for (const side of [0.13, -0.13]) {
            const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.28, 4, 8), leatherMat);
            thigh.position.set(side, 0.86, -0.02);
            thigh.rotation.x = 1.25;
            thigh.rotation.z = side > 0 ? -0.25 : 0.25;
            group.add(thigh);
            const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.26, 4, 8), leatherMat);
            shin.position.set(side * 1.35, 0.58, -0.10);
            shin.rotation.x = 0.25;
            group.add(shin);
            const boot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.26), this.sharedMaterials.rubber);
            boot.position.set(side * 1.4, 0.33, -0.12);
            group.add(boot);
        }
        // Torso leaning into the wind
        const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.36, 4, 10), leatherMat);
        torso.rotation.x = 0.85;
        torso.position.set(0, 1.18, -0.02);
        torso.castShadow = true;
        group.add(torso);
        // Race hump behind the neck
        const hump = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), leatherMat);
        hump.scale.set(1, 0.7, 1.3);
        hump.position.set(0, 1.28, -0.28);
        group.add(hump);
        // Shoulders + arms bent to the clip-ons + gloves
        for (const side of [0.19, -0.19]) {
            const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), leatherMat);
            shoulder.position.set(side, 1.28, 0.12);
            group.add(shoulder);
            const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.24, 4, 8), leatherMat);
            upperArm.position.set(side, 1.16, 0.32);
            upperArm.rotation.x = 0.9;
            group.add(upperArm);
            const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.26, 4, 8), leatherMat);
            forearm.position.set(side * 1.45, 1.04, 0.55);
            forearm.rotation.x = 1.15;
            forearm.rotation.z = side > 0 ? -0.35 : 0.35;
            group.add(forearm);
            const glove = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), this.sharedMaterials.rubber);
            glove.position.set(side * 1.95, 0.99, 0.66);
            group.add(glove);
        }

        // Helmet (chin bar + visor + spoiler)
        const helmetMat = new THREE.MeshStandardMaterial({
            color: isStealth ? 0x050505 : (Math.random() > 0.5 ? 0x222222 : bodyColor),
            roughness: 0.25, metalness: 0.3
        });
        const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 12), helmetMat);
        helmet.position.set(0, 1.44, 0.28);
        helmet.castShadow = true;
        group.add(helmet);
        const chinBar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.16), helmetMat);
        chinBar.position.set(0, 1.37, 0.38);
        group.add(chinBar);
        const visorMat = isStealth ? this.sharedMaterials.glassStealth : this.sharedMaterials.glass;
        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.09, 0.06), visorMat);
        visor.position.set(0, 1.44, 0.415);
        visor.rotation.x = -0.15;
        group.add(visor);
        const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.08), helmetMat);
        spoiler.position.set(0, 1.50, 0.14);
        spoiler.rotation.x = 0.4;
        group.add(spoiler);

        // Dual LED headlights in the nose
        if (!isStealth) {
            for (const side of [0.09, -0.09]) {
                const lamp = new THREE.Mesh(
                    new THREE.SphereGeometry(0.055, 10, 10),
                    this.sharedMaterials.headlightGlow
                );
                lamp.position.set(side, 0.76, 1.22);
                lamp.scale.set(1, 0.7, 0.6);
                group.add(lamp);
            }
            // Front turn signals on stalks
            for (const side of [0.22, -0.22]) {
                const signal = new THREE.Mesh(
                    new THREE.BoxGeometry(0.06, 0.05, 0.04),
                    this.sharedMaterials.turnSignal
                );
                signal.position.set(side, 0.82, 0.98);
                group.add(signal);
            }

            if (this.enableDynamicLights && this.qualityLevel >= 2) {
                const light = new THREE.SpotLight(0xffffee, 1.5, 25, 0.4, 0.5);
                light.position.set(0, 0.76, 1.22);
                light.target.position.set(0, 0, 15);
                light.userData.carHeadlight = true;
                group.add(light);
                group.add(light.target);
            }
        }

        // LED taillight strip + rear signals + plate
        const tailMat = isStealth ? this.sharedMaterials.taillightOff : this.sharedMaterials.taillightOn;
        const taillight = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.04), tailMat);
        taillight.position.set(0, 0.92, -0.975);
        group.add(taillight);
        for (const side of [0.14, -0.14]) {
            const signal = new THREE.Mesh(
                new THREE.BoxGeometry(0.05, 0.04, 0.03),
                this.sharedMaterials.turnSignal
            );
            signal.position.set(side, 0.86, -0.96);
            group.add(signal);
        }
        const plate = new THREE.Mesh(
            new THREE.BoxGeometry(0.15, 0.1, 0.02),
            new THREE.MeshStandardMaterial({ color: 0xffffee, roughness: 0.5 })
        );
        plate.position.set(0, 0.72, -0.96);
        plate.rotation.x = -0.2;
        group.add(plate);

        group.userData.isMotorcycle = true;
        return group;
    }

    // ─── HELPER METHODS ────────────────────────────────────────────

    addSideMirrors(group, xOffset, yPos, zPos) {
        const armGeo = new THREE.BoxGeometry(0.3, 0.04, 0.04);
        const faceGeo = new THREE.BoxGeometry(0.06, 0.14, 0.12);

        // Left mirror
        const armL = new THREE.Mesh(armGeo, this.sharedMaterials.rubber);
        armL.position.set(xOffset + 0.15, yPos, zPos);
        group.add(armL);
        const faceL = new THREE.Mesh(faceGeo, this.sharedMaterials.mirror);
        faceL.position.set(xOffset + 0.32, yPos - 0.04, zPos);
        group.add(faceL);

        // Right mirror
        const armR = new THREE.Mesh(armGeo, this.sharedMaterials.rubber);
        armR.position.set(-xOffset - 0.15, yPos, zPos);
        group.add(armR);
        const faceR = new THREE.Mesh(faceGeo, this.sharedMaterials.mirror);
        faceR.position.set(-xOffset - 0.32, yPos - 0.04, zPos);
        group.add(faceR);
    }

    addWheels(group, xOffset, zOffset, radius = 0.35, zPos = 0) {
        const wheelGeo = new THREE.CylinderGeometry(radius, radius, 0.28, 10);
        const hubGeo = new THREE.CylinderGeometry(radius * 0.45, radius * 0.45, 0.3, 8);

        const positions = [
            { x: xOffset, z: zPos + zOffset },
            { x: -xOffset, z: zPos + zOffset },
            { x: xOffset, z: zPos - zOffset },
            { x: -xOffset, z: zPos - zOffset }
        ];

        positions.forEach(pos => {
            // Tire
            const wheel = new THREE.Mesh(wheelGeo, this.sharedMaterials.wheel);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(pos.x, radius, pos.z);
            group.add(wheel);

            // Hubcap
            const hub = new THREE.Mesh(hubGeo, this.sharedMaterials.hubcap);
            hub.rotation.z = Math.PI / 2;
            hub.position.set(pos.x, radius, pos.z);
            group.add(hub);
        });
    }

    addHeadlights(group, zPos, yPos = 0.7) {
        const headlightGeo = new THREE.SphereGeometry(0.13, 8, 8);

        const leftHeadlight = new THREE.Mesh(headlightGeo, this.sharedMaterials.headlightGlow);
        leftHeadlight.position.set(0.6, yPos, zPos);
        group.add(leftHeadlight);

        const rightHeadlight = new THREE.Mesh(headlightGeo, this.sharedMaterials.headlightGlow);
        rightHeadlight.position.set(-0.6, yPos, zPos);
        group.add(rightHeadlight);

        // Only add a single SpotLight on high quality (not one per headlight)
        if (this.enableDynamicLights && this.qualityLevel >= 2) {
            const light = new THREE.SpotLight(0xffffee, 2.5, 25, 0.5, 0.6);
            light.position.set(0, yPos, zPos);
            light.target.position.set(0, 0, zPos + 20);
            light.castShadow = false;
            light.userData.carHeadlight = true;
            group.add(light);
            group.add(light.target);
        }
    }

    addTaillights(group, isStealth, zPos) {
        const taillightGeo = new THREE.BoxGeometry(0.28, 0.18, 0.05);
        const mat = isStealth ? this.sharedMaterials.taillightOff : this.sharedMaterials.taillightOn;

        const leftTaillight = new THREE.Mesh(taillightGeo, mat);
        leftTaillight.position.set(0.7, 0.7, zPos);
        group.add(leftTaillight);

        const rightTaillight = new THREE.Mesh(taillightGeo, mat);
        rightTaillight.position.set(-0.7, 0.7, zPos);
        group.add(rightTaillight);
    }

    // ─── SPAWNING & MOVEMENT ───────────────────────────────────────

    spawnCar(elapsedTime) {
        // Determine if stealth car
        const elapsedMinutes = elapsedTime / 60;
        let stealthChance = this.baseStealthChance;
        if (elapsedMinutes > 2) {
            stealthChance += (elapsedMinutes - 2) * this.stealthChanceIncrease;
        }
        stealthChance *= this.difficultyMultiplier;
        const isStealth = Math.random() < stealthChance;

        // Get random vehicle type
        const vehicleType = this.getRandomVehicleType();
        const mesh = this.acquireFromPool(vehicleType, isStealth);

        // Random lane (-3 or 3 for two-lane road)
        const lane = Math.random() > 0.5 ? 3 : -3;

        // Direction based on lane
        const direction = lane > 0 ? 1 : -1;

        // Start at either end of the road curve
        let startT, startPoint, startTangent;
        if (direction > 0) {
            startT = 0;
        } else {
            startT = 1;
        }

        if (this.roadCurve) {
            startPoint = this.roadCurve.getPoint(startT);
            startTangent = this.roadCurve.getTangent(startT);
        } else {
            startPoint = new THREE.Vector3(0, 0, direction > 0 ? -this.roadLength / 2 : this.roadLength / 2);
            startTangent = new THREE.Vector3(0, 0, direction > 0 ? 1 : -1);
        }

        // Calculate lane offset (perpendicular to road direction)
        const normal = new THREE.Vector3(-startTangent.z, 0, startTangent.x).normalize();
        const laneOffset = normal.clone().multiplyScalar(lane);
        const finalPosition = startPoint.clone().add(laneOffset);

        mesh.position.copy(finalPosition);

        // Rotate car to face direction of travel
        const angle = Math.atan2(startTangent.x, startTangent.z);
        mesh.rotation.y = angle + (direction > 0 ? 0 : Math.PI);

        // Speed varies by vehicle type
        let baseSpeed = 8;
        if (vehicleType === VEHICLE_TYPES.MOTORCYCLE) baseSpeed = 12;
        if (vehicleType === VEHICLE_TYPES.SEMI) baseSpeed = 6;
        if (vehicleType === VEHICLE_TYPES.TRUCK) baseSpeed = 7;

        const car = {
            mesh: mesh,
            lane: lane,
            direction: direction,
            speed: baseSpeed + Math.random() * 6,
            isStealth: isStealth,
            hasTriggeredNearMiss: false,
            vehicleType: vehicleType,
            curveT: startT,
            targetPosition: finalPosition.clone()
        };

        this.cars.push(car);
    }

    update(deltaTime, elapsedTime) {
        // Update spawn rate based on elapsed time
        const elapsedMinutes = elapsedTime / 60;
        const spawnInterval = this.baseSpawnInterval / ((1 + elapsedMinutes * 0.15) * this.difficultyMultiplier);

        // Spawn timer
        this.spawnTimer += deltaTime;
        if (this.spawnTimer >= spawnInterval && this.cars.length < this.maxCars) {
            this.spawnCar(elapsedTime);
            this.spawnTimer = 0;
        }

        // Update cooldown
        this.lastNearMiss += deltaTime;

        // Update each car
        for (let i = this.cars.length - 1; i >= 0; i--) {
            const car = this.cars[i];

            if (this.roadCurve) {
                // Move along the curved road (cached length — getLength() is costly)
                const curveLength = this._curveLength || (this._curveLength = this.roadCurve.getLength());
                const moveDistance = car.speed * deltaTime;
                const tDelta = moveDistance / curveLength;

                // Update curve position
                car.curveT += car.direction * tDelta;

                // Check if car reached end of road
                if (car.curveT > 1 || car.curveT < 0) {
                    this.releaseToPool(car);
                    this.cars.splice(i, 1);
                    continue;
                }

                // Get new position on curve (scratch vectors, no allocation)
                const curvePoint = this.roadCurve.getPoint(car.curveT, this._tmpCurvePoint);
                const tangent = this.roadCurve.getTangent(car.curveT, this._tmpTangent);

                // Calculate lane offset
                this._tmpNormal.set(-tangent.z, 0, tangent.x).normalize();
                this._tmpLaneOffset.copy(this._tmpNormal).multiplyScalar(car.lane);
                this._tmpTargetPos.copy(curvePoint).add(this._tmpLaneOffset);

                // Smooth movement
                car.mesh.position.lerp(this._tmpTargetPos, 0.3);

                // Smooth rotation
                const targetAngle = Math.atan2(tangent.x, tangent.z) + (car.direction > 0 ? 0 : Math.PI);
                const currentRotation = car.mesh.rotation.y;

                let angleDiff = targetAngle - currentRotation;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                car.mesh.rotation.y = currentRotation + angleDiff * 0.1;

            } else {
                // Fallback: straight road movement
                car.mesh.position.z += car.direction * car.speed * deltaTime;

                const removeZ = this.roadLength / 2 + 20;
                if (car.mesh.position.z > removeZ || car.mesh.position.z < -removeZ) {
                    this.releaseToPool(car);
                    this.cars.splice(i, 1);
                }
            }
        }

        this.updateLightGlows();
    }

    // Position the shared glow points at each active car's head/taillights.
    updateLightGlows() {
        if (!this.lightGlows) return;

        const positions = this.lightGlowPositions;
        const colors = this.lightGlows.geometry.attributes.color.array;
        const maxPoints = positions.length / 3;
        let idx = 0;

        for (let i = 0; i < this.cars.length; i++) {
            const car = this.cars[i];
            if (car.isStealth) continue;

            const mesh = car.mesh;
            const isSemi = car.vehicleType === VEHICLE_TYPES.SEMI;
            const isMoto = car.vehicleType === VEHICLE_TYPES.MOTORCYCLE;
            const isTruck = car.vehicleType === VEHICLE_TYPES.TRUCK;
            const isSUV = car.vehicleType === VEHICLE_TYPES.SUV;
            const isSedan = car.vehicleType === VEHICLE_TYPES.SEDAN;
            const frontZ = isSemi ? 4.32 : (isMoto ? 1.2 : (isTruck ? 2.48 : (isSUV ? 2.18 : (isSedan ? 2.38 : 2.12))));
            const backZ = isSemi ? -6.52 : (isMoto ? -0.95 : (isTruck ? -2.55 : (isSUV ? -2.18 : (isSedan ? -2.38 : -2.14))));
            const y = isSemi ? 0.9 : 0.7;
            const headlightOffsets = isMoto ? [0] : [-0.62, 0.62];
            if (idx + headlightOffsets.length + 1 > maxPoints) break;

            // Headlight halos (warm white) — at the car's local front corners
            const sin = Math.sin(mesh.rotation.y);
            const cos = Math.cos(mesh.rotation.y);
            for (const side of headlightOffsets) {
                positions[idx * 3] = mesh.position.x + cos * side + sin * frontZ;
                positions[idx * 3 + 1] = y;
                positions[idx * 3 + 2] = mesh.position.z - sin * side + cos * frontZ;
                colors[idx * 3] = 1.0;
                colors[idx * 3 + 1] = 0.93;
                colors[idx * 3 + 2] = 0.75;
                idx++;
            }

            // Taillight halo (red) — at the car's local rear
            positions[idx * 3] = mesh.position.x + sin * backZ;
            positions[idx * 3 + 1] = y;
            positions[idx * 3 + 2] = mesh.position.z + cos * backZ;
            colors[idx * 3] = 1.0;
            colors[idx * 3 + 1] = 0.12;
            colors[idx * 3 + 2] = 0.08;
            idx++;
        }

        this.lightGlows.geometry.setDrawRange(0, idx);
        this.lightGlows.geometry.attributes.position.needsUpdate = true;
        this.lightGlows.geometry.attributes.color.needsUpdate = true;
    }

    // ─── COLLISION DETECTION ───────────────────────────────────────

    // Writes a car's bounds into `out` (no allocation in hot loops).
    fillCarBox(car, out) {
        const pos = car.mesh.position;

        let halfWidth = 1;
        let halfLength = 2;

        if (car.vehicleType === VEHICLE_TYPES.MOTORCYCLE) {
            halfWidth = 0.3;
            halfLength = 1;
        } else if (car.vehicleType === VEHICLE_TYPES.SEMI) {
            halfWidth = 1.3;
            halfLength = 6.5;
        } else if (car.vehicleType === VEHICLE_TYPES.TRUCK) {
            halfWidth = 1;
            halfLength = 2.5;
        } else if (car.vehicleType === VEHICLE_TYPES.SUV) {
            halfWidth = 1.1;
            halfLength = 2.1;
        }

        out.minX = pos.x - halfWidth;
        out.maxX = pos.x + halfWidth;
        out.minZ = pos.z - halfLength;
        out.maxZ = pos.z + halfLength;
        return out;
    }

    _scratchCarBox() {
        if (!this._carBox) this._carBox = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
        return this._carBox;
    }

    checkCollision(playerBox) {
        const carBox = this._scratchCarBox();
        for (const car of this.cars) {
            if (this.boxesIntersect(playerBox, this.fillCarBox(car, carBox))) {
                return { collision: true, isStealth: car.isStealth };
            }
        }
        return { collision: false };
    }

    checkNearMiss(playerNearMissBox, playerCollisionBox) {
        if (this.lastNearMiss < this.nearMissCooldown) return null;

        const carBox = this._scratchCarBox();
        for (const car of this.cars) {
            if (car.hasTriggeredNearMiss) continue;

            this.fillCarBox(car, carBox);

            if (this.boxesIntersect(playerNearMissBox, carBox) &&
                !this.boxesIntersect(playerCollisionBox, carBox)) {
                car.hasTriggeredNearMiss = true;
                this.lastNearMiss = 0;
                return { nearMiss: true, isStealth: car.isStealth };
            }
        }
        return null;
    }

    getCarBoundingBox(car) {
        return this.fillCarBox(car, {
            minX: 0, maxX: 0, minZ: 0, maxZ: 0
        });
    }

    boxesIntersect(box1, box2) {
        return !(box1.maxX < box2.minX || box1.minX > box2.maxX ||
            box1.maxZ < box2.minZ || box1.minZ > box2.maxZ);
    }

    getCars() {
        return this.cars;
    }

    checkNewtCollisions(newts) {
        const crushedNewts = [];
        const carBox = this._carBox;
        const newtBox = this._newtBox;

        for (const car of this.cars) {
            this.fillCarBox(car, carBox);

            for (const newt of newts) {
                const newtPos = newt.mesh.position;
                newtBox.minX = newtPos.x - 0.3;
                newtBox.maxX = newtPos.x + 0.3;
                newtBox.minZ = newtPos.z - 0.3;
                newtBox.maxZ = newtPos.z + 0.3;

                if (this.boxesIntersect(carBox, newtBox)) {
                    crushedNewts.push(newt);
                }
            }
        }

        return crushedNewts;
    }

    reset() {
        this.cars.forEach(car => {
            this.releaseToPool(car);
        });
        this.cars = [];
        this.spawnTimer = 0;
        this.lastNearMiss = 0;
        if (this.lightGlows) {
            this.lightGlows.geometry.setDrawRange(0, 0);
        }
    }
}
