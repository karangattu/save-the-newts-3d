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
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 64);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }

    // One Points cloud for every vehicle light halo => 2 extra draw calls total
    // instead of per-car sprites.
    initLightGlows() {
        const maxPoints = 32 * 2; // generous capacity, draw range trims it
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
        const rand = Math.random();
        if (rand < 0.30) return VEHICLE_TYPES.CAR;
        if (rand < 0.50) return VEHICLE_TYPES.SEDAN;
        if (rand < 0.70) return VEHICLE_TYPES.SUV;
        if (rand < 0.85) return VEHICLE_TYPES.TRUCK;
        if (rand < 0.92) return VEHICLE_TYPES.SEMI;
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
        // Compact hatchback — Model 3 proportions
        const group = new THREE.Group();
        const bodyMat = this.createBodyMaterial(isStealth, this.getRandomCarColor());
        const glassMat = isStealth ? this.sharedMaterials.glassStealth : this.sharedMaterials.glass;

        const profile = [
            [-2.05, 0.18], // rear bottom
            [2.05, 0.18],  // front bottom
            [2.12, 0.34],  // front lip
            [2.05, 0.58],  // closed nose
            [1.55, 0.74],  // hood
            [0.72, 0.80],  // cowl
            [0.22, 1.28],  // A-pillar / roof front
            [-0.55, 1.34], // roof
            [-1.25, 1.12], // fastback
            [-1.75, 0.78], // deck
            [-2.12, 0.50], // rear bumper
            [-2.05, 0.18]
        ];

        const body = new THREE.Mesh(this.createSleekBodyGeometry(profile, 1.95, 0.26), bodyMat);
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        this.addGlassCabin(group, glassMat, {
            width: 1.78, height: 0.4, length: 1.65, y: 1.12, z: -0.12, roofY: 1.38
        });
        this.addTeslaFront(group, bodyMat, 2.08, 0.52);
        this.addSideMirrors(group, 1.0, 1.18, 0.55);
        this.addAeroWheels(group, 0.98, 1.35, 0.34);
        this.addTeslaLights(group, isStealth, 2.1, -2.1, 0.58);

        return group;
    }

    createSedanMesh(isStealth) {
        // Longer grand tourer — Model S proportions
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

        return group;
    }

    createTruckMesh(isStealth) {
        const group = new THREE.Group();
        const bodyColor = isStealth ? 0x111111 : this.getRandomCarColor();
        const bodyMat = new THREE.MeshStandardMaterial({
            color: bodyColor,
            roughness: isStealth ? 0.95 : 0.4,
            metalness: isStealth ? 0.1 : 0.5
        });
        const glassMat = isStealth ? this.sharedMaterials.glassStealth : this.sharedMaterials.glass;

        // Pickup cab body
        const cab = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.1, 2.2), bodyMat);
        cab.position.set(0, 0.9, 1.3);
        cab.castShadow = true;
        group.add(cab);

        // Cabin top
        const cabTop = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.75, 1.6), bodyMat);
        cabTop.position.set(0, 1.72, 1.2);
        cabTop.castShadow = true;
        group.add(cabTop);

        // Windshield
        const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.65, 0.08), glassMat);
        windshield.position.set(0, 1.72, 2.02);
        windshield.rotation.x = 0.18;
        group.add(windshield);

        // Rear cab window
        const rearWin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.45, 0.08), glassMat);
        rearWin.position.set(0, 1.68, 0.38);
        group.add(rearWin);

        // Side windows
        const sideGeo = new THREE.BoxGeometry(0.06, 0.45, 1.0);
        const sideL = new THREE.Mesh(sideGeo, glassMat);
        sideL.position.set(1.0, 1.72, 1.2);
        group.add(sideL);
        const sideR = new THREE.Mesh(sideGeo, glassMat);
        sideR.position.set(-1.0, 1.72, 1.2);
        group.add(sideR);

        // Truck bed
        const bed = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.55, 2.8), bodyMat);
        bed.position.set(0, 0.68, -1.1);
        group.add(bed);

        // Bed side walls
        const wallMat = bodyMat;
        const wallGeoSide = new THREE.BoxGeometry(0.1, 0.55, 2.8);
        const wallL = new THREE.Mesh(wallGeoSide, wallMat);
        wallL.position.set(1.05, 1.2, -1.1);
        group.add(wallL);
        const wallR = new THREE.Mesh(wallGeoSide, wallMat);
        wallR.position.set(-1.05, 1.2, -1.1);
        group.add(wallR);

        // Tailgate
        const tailgate = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.55, 0.1), wallMat);
        tailgate.position.set(0, 1.2, -2.5);
        group.add(tailgate);

        // Bed rail caps (chrome)
        const railCapGeo = new THREE.BoxGeometry(0.14, 0.06, 2.8);
        const railCapL = new THREE.Mesh(railCapGeo, this.sharedMaterials.chrome);
        railCapL.position.set(1.05, 1.5, -1.1);
        group.add(railCapL);
        const railCapR = new THREE.Mesh(railCapGeo, this.sharedMaterials.chrome);
        railCapR.position.set(-1.05, 1.5, -1.1);
        group.add(railCapR);

        // Front bumper
        const bumperF = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.28, 0.2), this.sharedMaterials.chrome);
        bumperF.position.set(0, 0.42, 2.45);
        group.add(bumperF);

        // Grille
        const grille = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.4, 0.06), this.sharedMaterials.rubber);
        grille.position.set(0, 0.7, 2.42);
        group.add(grille);

        // Step bars
        const stepGeo = new THREE.BoxGeometry(0.2, 0.08, 1.6);
        const stepL = new THREE.Mesh(stepGeo, this.sharedMaterials.chrome);
        stepL.position.set(1.15, 0.3, 0.4);
        group.add(stepL);
        const stepR = new THREE.Mesh(stepGeo, this.sharedMaterials.chrome);
        stepR.position.set(-1.15, 0.3, 0.4);
        group.add(stepR);

        // Side mirrors
        this.addSideMirrors(group, 1.12, 1.6, 1.8);

        this.addWheels(group, 1.0, 1.6, 0.4);
        if (!isStealth) this.addHeadlights(group, 2.45);
        this.addTaillights(group, isStealth, -2.55);

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

        // Front bumper (heavy)
        const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.4, 0.3), this.sharedMaterials.chrome);
        bumper.position.set(0, 0.5, 4.35);
        group.add(bumper);

        // Big grille
        const grille = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 0.06), this.sharedMaterials.rubber);
        grille.position.set(0, 0.9, 4.28);
        group.add(grille);

        // Fuel tanks (side cylinders)
        const tankGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.8, 10);
        tankGeo.rotateX(Math.PI / 2);
        const tankL = new THREE.Mesh(tankGeo, this.sharedMaterials.chrome);
        tankL.position.set(1.35, 0.5, 2.2);
        group.add(tankL);
        const tankR = new THREE.Mesh(tankGeo, this.sharedMaterials.chrome);
        tankR.position.set(-1.35, 0.5, 2.2);
        group.add(tankR);

        // Steps on cab
        const stepGeo = new THREE.BoxGeometry(0.3, 0.08, 0.6);
        const stepL = new THREE.Mesh(stepGeo, this.sharedMaterials.chrome);
        stepL.position.set(1.25, 0.3, 3.5);
        group.add(stepL);
        const stepR = new THREE.Mesh(stepGeo, this.sharedMaterials.chrome);
        stepR.position.set(-1.25, 0.3, 3.5);
        group.add(stepR);

        // Side mirrors (large)
        const mirrorArmGeo = new THREE.BoxGeometry(0.6, 0.05, 0.05);
        const mirrorFaceGeo = new THREE.BoxGeometry(0.08, 0.3, 0.25);
        const mirrorArmL = new THREE.Mesh(mirrorArmGeo, this.sharedMaterials.rubber);
        mirrorArmL.position.set(1.5, 2.1, 3.8);
        group.add(mirrorArmL);
        const mirrorFaceL = new THREE.Mesh(mirrorFaceGeo, this.sharedMaterials.mirror);
        mirrorFaceL.position.set(1.8, 2.0, 3.8);
        group.add(mirrorFaceL);
        const mirrorArmR = new THREE.Mesh(mirrorArmGeo, this.sharedMaterials.rubber);
        mirrorArmR.position.set(-1.5, 2.1, 3.8);
        group.add(mirrorArmR);
        const mirrorFaceR = new THREE.Mesh(mirrorFaceGeo, this.sharedMaterials.mirror);
        mirrorFaceR.position.set(-1.8, 2.0, 3.8);
        group.add(mirrorFaceR);

        // Exhaust stacks (vertical pipes)
        const exhaustGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.2, 8);
        const exhaustL = new THREE.Mesh(exhaustGeo, this.sharedMaterials.chrome);
        exhaustL.position.set(1.1, 2.8, 2);
        group.add(exhaustL);
        const exhaustR = new THREE.Mesh(exhaustGeo, this.sharedMaterials.chrome);
        exhaustR.position.set(-1.1, 2.8, 2);
        group.add(exhaustR);

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

        if (!isStealth) this.addHeadlights(group, 4.35, 0.9);
        this.addTaillights(group, isStealth, -6.52);

        group.userData.isLarge = true;
        return group;
    }

    createMotorcycleMesh(isStealth) {
        const group = new THREE.Group();
        const bodyColor = isStealth ? 0x111111 : this.getRandomCarColor();
        const bodyMat = new THREE.MeshStandardMaterial({
            color: bodyColor,
            roughness: isStealth ? 0.95 : 0.25,
            metalness: isStealth ? 0.1 : 0.75
        });

        // Frame tube (main spine)
        const frameGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8);
        frameGeo.rotateX(Math.PI / 2);
        const frame = new THREE.Mesh(frameGeo, this.sharedMaterials.rubber);
        frame.position.set(0, 0.6, 0.1);
        frame.rotation.x = 0.15;
        group.add(frame);

        // Fuel tank (rounded shape)
        const tankGeo = new THREE.BoxGeometry(0.45, 0.3, 0.9);
        const tank = new THREE.Mesh(tankGeo, bodyMat);
        tank.position.set(0, 0.78, 0.2);
        group.add(tank);

        // Tank highlight strip
        const stripGeo = new THREE.BoxGeometry(0.06, 0.32, 0.85);
        const stripMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
        const strip = new THREE.Mesh(stripGeo, stripMat);
        strip.position.set(0, 0.78, 0.2);
        group.add(strip);

        // Engine block
        const engineGeo = new THREE.BoxGeometry(0.55, 0.25, 0.4);
        const engine = new THREE.Mesh(engineGeo, this.sharedMaterials.chrome);
        engine.position.set(0, 0.42, 0);
        group.add(engine);

        // Exhaust pipe
        const exhaustGeo = new THREE.CylinderGeometry(0.04, 0.035, 1.2, 8);
        exhaustGeo.rotateX(Math.PI / 2);
        const exhaust = new THREE.Mesh(exhaustGeo, this.sharedMaterials.chrome);
        exhaust.position.set(0.25, 0.33, -0.3);
        group.add(exhaust);
        // Exhaust tip
        const tipGeo = new THREE.CylinderGeometry(0.05, 0.04, 0.15, 8);
        tipGeo.rotateX(Math.PI / 2);
        const tip = new THREE.Mesh(tipGeo, this.sharedMaterials.chrome);
        tip.position.set(0.25, 0.33, -0.9);
        group.add(tip);

        // Seat
        const seatGeo = new THREE.BoxGeometry(0.32, 0.12, 0.85);
        const seat = new THREE.Mesh(seatGeo, this.sharedMaterials.seatBlack);
        seat.position.set(0, 0.82, -0.35);
        group.add(seat);

        // Handlebars
        const handleGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.75, 8);
        const handles = new THREE.Mesh(handleGeo, this.sharedMaterials.rubber);
        handles.rotation.z = Math.PI / 2;
        handles.position.set(0, 1.0, 0.72);
        group.add(handles);

        // Handlebar grips
        const gripGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.15, 8);
        const gripL = new THREE.Mesh(gripGeo, this.sharedMaterials.rubber);
        gripL.rotation.z = Math.PI / 2;
        gripL.position.set(0.38, 1.0, 0.72);
        group.add(gripL);
        const gripR = new THREE.Mesh(gripGeo, this.sharedMaterials.rubber);
        gripR.rotation.z = Math.PI / 2;
        gripR.position.set(-0.38, 1.0, 0.72);
        group.add(gripR);

        // Front fork
        const forkGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.65, 8);
        const fork = new THREE.Mesh(forkGeo, this.sharedMaterials.chrome);
        fork.rotation.x = 0.3;
        fork.position.set(0, 0.55, 0.9);
        group.add(fork);

        // Fender (front)
        const fenderFGeo = new THREE.BoxGeometry(0.15, 0.06, 0.5);
        const fenderF = new THREE.Mesh(fenderFGeo, bodyMat);
        fenderF.position.set(0, 0.7, 1.1);
        group.add(fenderF);

        // Fender (rear)
        const fenderRGeo = new THREE.BoxGeometry(0.15, 0.06, 0.45);
        const fenderR = new THREE.Mesh(fenderRGeo, bodyMat);
        fenderR.position.set(0, 0.65, -0.7);
        group.add(fenderR);

        // Wheels (detailed with spokes implied by higher segments)
        const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.12, 12);
        const wheelMat = this.sharedMaterials.wheel;

        const frontWheel = new THREE.Mesh(wheelGeo, wheelMat);
        frontWheel.rotation.z = Math.PI / 2;
        frontWheel.position.set(0, 0.35, 1.1);
        group.add(frontWheel);
        // Front hub
        const hubGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.14, 12);
        const frontHub = new THREE.Mesh(hubGeo, this.sharedMaterials.hubcap);
        frontHub.rotation.z = Math.PI / 2;
        frontHub.position.set(0, 0.35, 1.1);
        group.add(frontHub);

        const backWheel = new THREE.Mesh(wheelGeo, wheelMat);
        backWheel.rotation.z = Math.PI / 2;
        backWheel.position.set(0, 0.35, -0.7);
        group.add(backWheel);
        // Rear hub
        const rearHub = new THREE.Mesh(hubGeo, this.sharedMaterials.hubcap);
        rearHub.rotation.z = Math.PI / 2;
        rearHub.position.set(0, 0.35, -0.7);
        group.add(rearHub);

        // Rider
        const riderMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });

        // Lower body/legs
        const legsGeo = new THREE.BoxGeometry(0.3, 0.2, 0.5);
        const legs = new THREE.Mesh(legsGeo, riderMat);
        legs.position.set(0, 0.88, -0.1);
        group.add(legs);

        // Torso
        const torsoGeo = new THREE.CapsuleGeometry(0.14, 0.38, 4, 8);
        const torso = new THREE.Mesh(torsoGeo, riderMat);
        torso.rotation.x = 0.35;
        torso.position.set(0, 1.12, 0.05);
        group.add(torso);

        // Helmet
        const helmetGeo = new THREE.SphereGeometry(0.16, 10, 10);
        const helmetMat = new THREE.MeshStandardMaterial({
            color: isStealth ? 0x050505 : (Math.random() > 0.5 ? 0x222222 : bodyColor),
            roughness: 0.25, metalness: 0.3
        });
        const helmet = new THREE.Mesh(helmetGeo, helmetMat);
        helmet.position.set(0, 1.42, 0.32);
        group.add(helmet);

        // Visor
        const visorGeo = new THREE.BoxGeometry(0.28, 0.1, 0.08);
        const visorMat = isStealth ? this.sharedMaterials.glassStealth : this.sharedMaterials.glass;
        const visor = new THREE.Mesh(visorGeo, visorMat);
        visor.position.set(0, 1.4, 0.47);
        group.add(visor);

        // Headlight
        if (!isStealth) {
            const headlightGeo = new THREE.SphereGeometry(0.08, 10, 10);
            const headlight = new THREE.Mesh(headlightGeo, this.sharedMaterials.headlightGlow);
            headlight.position.set(0, 0.72, 1.22);
            group.add(headlight);

            if (this.enableDynamicLights && this.qualityLevel >= 2) {
                const light = new THREE.SpotLight(0xffffee, 1.5, 25, 0.4, 0.5);
                light.position.set(0, 0.72, 1.22);
                light.target.position.set(0, 0, 15);
                light.userData.carHeadlight = true;
                group.add(light);
                group.add(light.target);
            }
        }

        // Taillight
        const taillightGeo = new THREE.BoxGeometry(0.15, 0.1, 0.05);
        const tailMat = isStealth ? this.sharedMaterials.taillightOff : this.sharedMaterials.taillightOn;
        const taillight = new THREE.Mesh(taillightGeo, tailMat);
        taillight.position.set(0, 0.62, -0.95);
        group.add(taillight);

        // License plate (tiny detail)
        const plateGeo = new THREE.BoxGeometry(0.15, 0.08, 0.02);
        const plateMat = new THREE.MeshStandardMaterial({ color: 0xffffee, roughness: 0.5 });
        const plate = new THREE.Mesh(plateGeo, plateMat);
        plate.position.set(0, 0.52, -0.96);
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

        for (let i = 0; i < this.cars.length && idx + 2 <= maxPoints; i++) {
            const car = this.cars[i];
            if (car.isStealth) continue;

            const mesh = car.mesh;
            const isSemi = car.vehicleType === VEHICLE_TYPES.SEMI;
            const isMoto = car.vehicleType === VEHICLE_TYPES.MOTORCYCLE;
            const frontZ = isSemi ? 4.3 : (isMoto ? 1.2 : 2.3);
            const backZ = isSemi ? -6.5 : (isMoto ? -0.95 : -2.3);
            const y = isSemi ? 0.9 : 0.7;

            // Headlight halo (warm white) — at the car's local front
            positions[idx * 3] = mesh.position.x + Math.sin(mesh.rotation.y) * frontZ;
            positions[idx * 3 + 1] = y;
            positions[idx * 3 + 2] = mesh.position.z + Math.cos(mesh.rotation.y) * frontZ;
            colors[idx * 3] = 1.0;
            colors[idx * 3 + 1] = 0.93;
            colors[idx * 3 + 2] = 0.75;
            idx++;

            // Taillight halo (red) — at the car's local rear
            positions[idx * 3] = mesh.position.x + Math.sin(mesh.rotation.y) * backZ;
            positions[idx * 3 + 1] = y;
            positions[idx * 3 + 2] = mesh.position.z + Math.cos(mesh.rotation.y) * backZ;
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
