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
    constructor(scene, roadCurve = null) {
        this.scene = scene;
        this.roadCurve = roadCurve;

        this.cars = [];

        // Spawn settings
        this.baseSpawnInterval = 4; // seconds
        this.spawnTimer = 0;
        this.roadWidth = 12;
        this.roadLength = 280;

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

        // Car object pool
        this.carPool = new Map();
        this.initPool();

        this._tmpNormal = new THREE.Vector3();
        this._tmpLaneOffset = new THREE.Vector3();
        this._tmpTargetPos = new THREE.Vector3();
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
            hubcap: new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.25, metalness: 0.85 }),
            chrome: new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.12, metalness: 0.95 }),
            rubber: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.95 }),
            mirror: new THREE.MeshStandardMaterial({ color: 0xaaccdd, roughness: 0.05, metalness: 1.0 }),
            seatBlack: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }),
            headlightGlow: new THREE.MeshStandardMaterial({
                color: 0xffffaa, emissive: 0xffffaa, emissiveIntensity: 2
            }),
            taillightOn: new THREE.MeshStandardMaterial({
                color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.5
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
    }

    setDifficultyMultiplier(mult) {
        this.difficultyMultiplier = mult;
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
        const colors = [0xcc2222, 0x2255cc, 0x22aa44, 0xeeeeee, 0x222222, 0xccaa22, 0x8844aa, 0xdd6622, 0x44bbcc];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    // ─── IMPROVED VEHICLE MESHES ────────────────────────────────────

    createCarMesh(isStealth) {
        const group = new THREE.Group();
        const bodyColor = isStealth ? 0x111111 : this.getRandomCarColor();
        const bodyMat = new THREE.MeshStandardMaterial({
            color: bodyColor,
            roughness: isStealth ? 0.95 : 0.35,
            metalness: isStealth ? 0.1 : 0.55
        });
        const glassMat = isStealth ? this.sharedMaterials.glassStealth : this.sharedMaterials.glass;

        // Main body
        const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.85, 4), bodyMat);
        body.position.y = 0.72;
        body.castShadow = true;
        group.add(body);

        // Hood (sloped front)
        const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.15, 1.2), bodyMat);
        hood.position.set(0, 1.2, 1.2);
        hood.rotation.x = -0.12;
        group.add(hood);

        // Cabin
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.75, 2), bodyMat);
        cabin.position.set(0, 1.52, -0.3);
        cabin.castShadow = true;
        group.add(cabin);

        // Windshield (angled glass)
        const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 0.08), glassMat);
        windshield.position.set(0, 1.52, 0.7);
        windshield.rotation.x = 0.25;
        group.add(windshield);

        // Rear window
        const rearWindow = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 0.08), glassMat);
        rearWindow.position.set(0, 1.48, -1.3);
        rearWindow.rotation.x = -0.3;
        group.add(rearWindow);

        // Side windows (left + right)
        const sideWindowGeo = new THREE.BoxGeometry(0.06, 0.45, 1.4);
        const sideL = new THREE.Mesh(sideWindowGeo, glassMat);
        sideL.position.set(0.92, 1.52, -0.3);
        group.add(sideL);
        const sideR = new THREE.Mesh(sideWindowGeo, glassMat);
        sideR.position.set(-0.92, 1.52, -0.3);
        group.add(sideR);

        // Front bumper
        const bumperF = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.25, 0.2), this.sharedMaterials.chrome);
        bumperF.position.set(0, 0.4, 2.05);
        group.add(bumperF);

        // Rear bumper
        const bumperR = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.25, 0.2), this.sharedMaterials.chrome);
        bumperR.position.set(0, 0.4, -2.05);
        group.add(bumperR);

        // Grille
        const grille = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.05), this.sharedMaterials.rubber);
        grille.position.set(0, 0.65, 2.02);
        group.add(grille);

        // Side mirrors
        this.addSideMirrors(group, 1.05, 1.4, 0.55);

        // Turn signals (front)
        const signalGeo = new THREE.BoxGeometry(0.2, 0.12, 0.06);
        const sigL = new THREE.Mesh(signalGeo, this.sharedMaterials.turnSignal);
        sigL.position.set(0.8, 0.55, 2.02);
        group.add(sigL);
        const sigR = new THREE.Mesh(signalGeo, this.sharedMaterials.turnSignal);
        sigR.position.set(-0.8, 0.55, 2.02);
        group.add(sigR);

        this.addWheels(group, 1, 1.4, 0.35);
        if (!isStealth) this.addHeadlights(group, 2.05);
        this.addTaillights(group, isStealth, -2.05);

        return group;
    }

    createSedanMesh(isStealth) {
        const group = new THREE.Group();
        const bodyColor = isStealth ? 0x111111 : this.getRandomCarColor();
        const bodyMat = new THREE.MeshStandardMaterial({
            color: bodyColor,
            roughness: isStealth ? 0.95 : 0.3,
            metalness: isStealth ? 0.1 : 0.6
        });
        const glassMat = isStealth ? this.sharedMaterials.glassStealth : this.sharedMaterials.glass;

        // Lower, longer body
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.75, 4.6), bodyMat);
        body.position.y = 0.62;
        body.castShadow = true;
        group.add(body);

        // Hood
        const hood = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 1.5), bodyMat);
        hood.position.set(0, 1.05, 1.3);
        hood.rotation.x = -0.08;
        group.add(hood);

        // Cabin (sleek profile)
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 2.2), bodyMat);
        cabin.position.set(0, 1.35, -0.2);
        cabin.castShadow = true;
        group.add(cabin);

        // Trunk slope
        const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.3, 1), bodyMat);
        trunk.position.set(0, 1.0, -1.6);
        trunk.rotation.x = 0.2;
        group.add(trunk);

        // Windshield
        const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.65, 0.08), glassMat);
        windshield.position.set(0, 1.4, 0.9);
        windshield.rotation.x = 0.35;
        group.add(windshield);

        // Rear window
        const rearWin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 0.08), glassMat);
        rearWin.position.set(0, 1.3, -1.3);
        rearWin.rotation.x = -0.4;
        group.add(rearWin);

        // Side windows
        const sideGeo = new THREE.BoxGeometry(0.06, 0.42, 1.6);
        const sideL = new THREE.Mesh(sideGeo, glassMat);
        sideL.position.set(0.87, 1.38, -0.2);
        group.add(sideL);
        const sideR = new THREE.Mesh(sideGeo, glassMat);
        sideR.position.set(-0.87, 1.38, -0.2);
        group.add(sideR);

        // Chrome trim strip along sides
        const trimGeo = new THREE.BoxGeometry(0.04, 0.05, 3.8);
        const trimL = new THREE.Mesh(trimGeo, this.sharedMaterials.chrome);
        trimL.position.set(0.97, 0.68, 0);
        group.add(trimL);
        const trimR = new THREE.Mesh(trimGeo, this.sharedMaterials.chrome);
        trimR.position.set(-0.97, 0.68, 0);
        group.add(trimR);

        // Bumpers
        const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.22, 0.18), this.sharedMaterials.chrome);
        bumperF.position.set(0, 0.36, 2.35);
        group.add(bumperF);
        const bumperR = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.22, 0.18), this.sharedMaterials.chrome);
        bumperR.position.set(0, 0.36, -2.35);
        group.add(bumperR);

        // Grille
        const grille = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.05), this.sharedMaterials.rubber);
        grille.position.set(0, 0.55, 2.32);
        group.add(grille);

        // Side mirrors
        this.addSideMirrors(group, 1.0, 1.28, 0.6);

        // Turn signals
        const sigGeo = new THREE.BoxGeometry(0.18, 0.1, 0.06);
        const sigL = new THREE.Mesh(sigGeo, this.sharedMaterials.turnSignal);
        sigL.position.set(0.75, 0.5, 2.32);
        group.add(sigL);
        const sigR = new THREE.Mesh(sigGeo, this.sharedMaterials.turnSignal);
        sigR.position.set(-0.75, 0.5, 2.32);
        group.add(sigR);

        this.addWheels(group, 0.95, 1.6, 0.33);
        if (!isStealth) this.addHeadlights(group, 2.35);
        this.addTaillights(group, isStealth, -2.35);

        return group;
    }

    createSUVMesh(isStealth) {
        const group = new THREE.Group();
        const bodyColor = isStealth ? 0x111111 : this.getRandomCarColor();
        const bodyMat = new THREE.MeshStandardMaterial({
            color: bodyColor,
            roughness: isStealth ? 0.95 : 0.38,
            metalness: isStealth ? 0.1 : 0.5
        });
        const glassMat = isStealth ? this.sharedMaterials.glassStealth : this.sharedMaterials.glass;

        // Taller, wider body
        const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 4.3), bodyMat);
        body.position.y = 0.85;
        body.castShadow = true;
        group.add(body);

        // Hood
        const hood = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 1.3), bodyMat);
        hood.position.set(0, 1.48, 1.2);
        hood.rotation.x = -0.06;
        group.add(hood);

        // Tall cabin
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.85, 2.6), bodyMat);
        cabin.position.set(0, 1.82, -0.3);
        cabin.castShadow = true;
        group.add(cabin);

        // Windshield
        const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.75, 0.08), glassMat);
        windshield.position.set(0, 1.85, 1.0);
        windshield.rotation.x = 0.2;
        group.add(windshield);

        // Rear window
        const rearWin = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.6, 0.08), glassMat);
        rearWin.position.set(0, 1.8, -1.6);
        rearWin.rotation.x = -0.15;
        group.add(rearWin);

        // Side windows
        const sideGeo = new THREE.BoxGeometry(0.06, 0.5, 2.0);
        const sideL = new THREE.Mesh(sideGeo, glassMat);
        sideL.position.set(1.05, 1.85, -0.3);
        group.add(sideL);
        const sideR = new THREE.Mesh(sideGeo, glassMat);
        sideR.position.set(-1.05, 1.85, -0.3);
        group.add(sideR);

        // Roof rails
        const railGeo = new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6);
        railGeo.rotateX(Math.PI / 2);
        const railL = new THREE.Mesh(railGeo, this.sharedMaterials.chrome);
        railL.position.set(0.9, 2.28, -0.3);
        group.add(railL);
        const railR = new THREE.Mesh(railGeo, this.sharedMaterials.chrome);
        railR.position.set(-0.9, 2.28, -0.3);
        group.add(railR);

        // Bumpers
        const bumperF = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.3, 0.22), this.sharedMaterials.chrome);
        bumperF.position.set(0, 0.42, 2.2);
        group.add(bumperF);
        const bumperR = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.3, 0.22), this.sharedMaterials.chrome);
        bumperR.position.set(0, 0.42, -2.2);
        group.add(bumperR);

        // Bull bar / skid plate
        const skidPlate = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.35), this.sharedMaterials.rubber);
        skidPlate.position.set(0, 0.22, 2.3);
        group.add(skidPlate);

        // Grille (larger for SUV)
        const grille = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 0.05), this.sharedMaterials.rubber);
        grille.position.set(0, 0.7, 2.18);
        group.add(grille);

        // Side mirrors
        this.addSideMirrors(group, 1.18, 1.7, 0.7);

        // Wheel arch flares (subtle)
        const flareMat = bodyMat;
        const flareGeo = new THREE.BoxGeometry(0.12, 0.5, 0.9);
        const positions = [
            [1.15, 0.6, 1.4], [-1.15, 0.6, 1.4],
            [1.15, 0.6, -1.4], [-1.15, 0.6, -1.4]
        ];
        positions.forEach(p => {
            const flare = new THREE.Mesh(flareGeo, flareMat);
            flare.position.set(p[0], p[1], p[2]);
            group.add(flare);
        });

        this.addWheels(group, 1.1, 1.5, 0.4);
        if (!isStealth) this.addHeadlights(group, 2.2);
        this.addTaillights(group, isStealth, -2.2);

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
        const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.12, 20);
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

            const light = new THREE.SpotLight(0xffffee, 1.5, 25, 0.4, 0.5);
            light.position.set(0, 0.72, 1.22);
            light.target.position.set(0, 0, 15);
            group.add(light);
            group.add(light.target);
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
        const wheelGeo = new THREE.CylinderGeometry(radius, radius, 0.28, 20);
        const hubGeo = new THREE.CylinderGeometry(radius * 0.45, radius * 0.45, 0.3, 12);

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
        const headlightGeo = new THREE.SphereGeometry(0.13, 10, 10);

        const leftHeadlight = new THREE.Mesh(headlightGeo, this.sharedMaterials.headlightGlow);
        leftHeadlight.position.set(0.6, yPos, zPos);
        group.add(leftHeadlight);

        const rightHeadlight = new THREE.Mesh(headlightGeo, this.sharedMaterials.headlightGlow);
        rightHeadlight.position.set(-0.6, yPos, zPos);
        group.add(rightHeadlight);

        // Light beams
        const leftLight = new THREE.SpotLight(0xffffee, 2, 30, 0.4, 0.5);
        leftLight.position.set(0.6, yPos, zPos);
        leftLight.target.position.set(0.6, 0, zPos + 20);
        group.add(leftLight);
        group.add(leftLight.target);

        const rightLight = new THREE.SpotLight(0xffffee, 2, 30, 0.4, 0.5);
        rightLight.position.set(-0.6, yPos, zPos);
        rightLight.target.position.set(-0.6, 0, zPos + 20);
        group.add(rightLight);
        group.add(rightLight.target);
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
        if (this.spawnTimer >= spawnInterval) {
            this.spawnCar(elapsedTime);
            this.spawnTimer = 0;
        }

        // Update cooldown
        this.lastNearMiss += deltaTime;

        // Update each car
        for (let i = this.cars.length - 1; i >= 0; i--) {
            const car = this.cars[i];

            if (this.roadCurve) {
                // Move along the curved road
                const curveLength = this.roadCurve.getLength();
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

                // Get new position on curve
                const curvePoint = this.roadCurve.getPoint(car.curveT);
                const tangent = this.roadCurve.getTangent(car.curveT);

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
    }

    // ─── COLLISION DETECTION ───────────────────────────────────────

    checkCollision(playerBox) {
        for (const car of this.cars) {
            const carBox = this.getCarBoundingBox(car);

            if (this.boxesIntersect(playerBox, carBox)) {
                return { collision: true, isStealth: car.isStealth };
            }
        }
        return { collision: false };
    }

    checkNearMiss(playerNearMissBox, playerCollisionBox) {
        if (this.lastNearMiss < this.nearMissCooldown) return null;

        for (const car of this.cars) {
            if (car.hasTriggeredNearMiss) continue;

            const carBox = this.getCarBoundingBox(car);

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

        return {
            minX: pos.x - halfWidth,
            maxX: pos.x + halfWidth,
            minZ: pos.z - halfLength,
            maxZ: pos.z + halfLength
        };
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

        for (const car of this.cars) {
            const carBox = this.getCarBoundingBox(car);

            for (const newt of newts) {
                const newtPos = newt.mesh.position;
                const newtBox = {
                    minX: newtPos.x - 0.3,
                    maxX: newtPos.x + 0.3,
                    minZ: newtPos.z - 0.3,
                    maxZ: newtPos.z + 0.3
                };

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
    }
}
