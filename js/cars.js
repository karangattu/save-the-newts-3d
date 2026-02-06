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
    constructor(scene, isMobile = false) {
        this.scene = scene;
        this.isMobile = isMobile;
        
        this.cars = [];
        this.difficultyMultiplier = 1.0; // Affects speed and spawn rate
        
        // Spawn settings
        this.baseSpawnInterval = isMobile ? 5.5 : 4.5; // seconds (slower for performance)
        this.spawnTimer = 0;
        this.maxCars = isMobile ? 4 : 8;
        this.roadWidth = 12;
        this.roadLength = 600;  // Longer road for exploration
        
        // Stealth car settings
        this.baseStealthChance = 0.1; // 10% base chance
        this.stealthChanceIncrease = 0.05; // increases after 2 minutes
        
        // Near-miss tracking
        this.lastNearMiss = 0;
        this.nearMissCooldown = 0.5; // seconds between near-miss triggers
        
        // Callback for newt crush events
        this.onNewtCrushed = null;
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
    
    setDifficultyMultiplier(multiplier) {
        this.difficultyMultiplier = multiplier;
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
    
    createCarMesh(isStealth) {
        const group = new THREE.Group();
        
        // Car colors
        const bodyColor = isStealth ? 0x111111 : this.getRandomCarColor();
        
        // Car body
        const bodyGeometry = new THREE.BoxGeometry(2, 1, 4);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: bodyColor,
            roughness: isStealth ? 0.95 : 0.4,
            metalness: isStealth ? 0.1 : 0.6
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.7;
        body.castShadow = true;
        group.add(body);
        
        // Cabin
        const cabinGeometry = new THREE.BoxGeometry(1.8, 0.8, 2);
        const cabinMaterial = new THREE.MeshStandardMaterial({
            color: isStealth ? 0x0a0a0a : 0x222233,
            roughness: 0.3,
            metalness: 0.1
        });
        const cabin = new THREE.Mesh(cabinGeometry, cabinMaterial);
        cabin.position.y = 1.5;
        cabin.castShadow = true;
        group.add(cabin);
        
        // Wheels
        const wheelGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 16);
        const wheelMaterial = new THREE.MeshStandardMaterial({
            color: 0x111111,
            roughness: 0.9
        });
        
        const wheelPositions = [
            { x: 0.9, z: 1.2 },
            { x: -0.9, z: 1.2 },
            { x: 0.9, z: -1.2 },
            { x: -0.9, z: -1.2 }
        ];
        
        wheelPositions.forEach(pos => {
            const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(pos.x, 0.35, pos.z);
            group.add(wheel);
        });
        
        // Headlights (only for non-stealth cars)
        if (!isStealth) {
            const headlightGeometry = new THREE.SphereGeometry(0.15, 8, 8);
            const headlightMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffaa,
                emissive: 0xffffaa,
                emissiveIntensity: 2
            });
            
            const leftHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
            leftHeadlight.position.set(0.6, 0.7, 2);
            group.add(leftHeadlight);
            
            const rightHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
            rightHeadlight.position.set(-0.6, 0.7, 2);
            group.add(rightHeadlight);
            
            // Headlight beams
            const leftLight = new THREE.SpotLight(0xffffee, 2, 30, 0.4, 0.5);
            leftLight.position.set(0.6, 0.7, 2);
            leftLight.target.position.set(0.6, 0, 20);
            group.add(leftLight);
            group.add(leftLight.target);
            
            const rightLight = new THREE.SpotLight(0xffffee, 2, 30, 0.4, 0.5);
            rightLight.position.set(-0.6, 0.7, 2);
            rightLight.target.position.set(-0.6, 0, 20);
            group.add(rightLight);
            group.add(rightLight.target);
        }
        
        // Taillights
        const taillightGeometry = new THREE.BoxGeometry(0.3, 0.2, 0.05);
        const taillightMaterial = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            emissive: isStealth ? 0x000000 : 0xff0000,
            emissiveIntensity: isStealth ? 0 : 0.5
        });
        
        const leftTaillight = new THREE.Mesh(taillightGeometry, taillightMaterial);
        leftTaillight.position.set(0.7, 0.7, -2);
        group.add(leftTaillight);
        
        const rightTaillight = new THREE.Mesh(taillightGeometry, taillightMaterial);
        rightTaillight.position.set(-0.7, 0.7, -2);
        group.add(rightTaillight);
        
        return group;
    }
    
    getRandomCarColor() {
        const colors = [
            0x3366cc, // Blue
            0xcc3333, // Red
            0x33cc33, // Green
            0xcccc33, // Yellow
            0xffffff, // White
            0x666666, // Gray
            0x8844aa  // Purple
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    createSedanMesh(isStealth) {
        const group = new THREE.Group();
        const bodyColor = isStealth ? 0x111111 : this.getRandomCarColor();
        
        // Longer, lower body
        const bodyGeometry = new THREE.BoxGeometry(1.8, 0.8, 4.5);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: bodyColor,
            roughness: isStealth ? 0.95 : 0.3,
            metalness: isStealth ? 0.1 : 0.7
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.6;
        body.castShadow = true;
        group.add(body);
        
        // Sloped cabin
        const cabinGeometry = new THREE.BoxGeometry(1.6, 0.7, 2.2);
        const cabinMaterial = new THREE.MeshStandardMaterial({
            color: isStealth ? 0x0a0a0a : 0x222233,
            roughness: 0.2
        });
        const cabin = new THREE.Mesh(cabinGeometry, cabinMaterial);
        cabin.position.y = 1.25;
        cabin.position.z = -0.3;
        group.add(cabin);
        
        this.addWheels(group, 0.8, 1.5);
        if (!isStealth) this.addHeadlights(group, 2.25);
        this.addTaillights(group, isStealth, -2.25);
        
        return group;
    }
    
    createSUVMesh(isStealth) {
        const group = new THREE.Group();
        const bodyColor = isStealth ? 0x111111 : this.getRandomCarColor();
        
        // Taller, boxy body
        const bodyGeometry = new THREE.BoxGeometry(2.2, 1.2, 4.2);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: bodyColor,
            roughness: isStealth ? 0.95 : 0.4,
            metalness: isStealth ? 0.1 : 0.5
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.9;
        body.castShadow = true;
        group.add(body);
        
        // Tall cabin
        const cabinGeometry = new THREE.BoxGeometry(2, 0.9, 2.8);
        const cabinMaterial = new THREE.MeshStandardMaterial({
            color: isStealth ? 0x0a0a0a : 0x222233,
            roughness: 0.2
        });
        const cabin = new THREE.Mesh(cabinGeometry, cabinMaterial);
        cabin.position.y = 1.85;
        cabin.position.z = -0.2;
        group.add(cabin);
        
        this.addWheels(group, 1, 1.4, 0.4);
        if (!isStealth) this.addHeadlights(group, 2.1);
        this.addTaillights(group, isStealth, -2.1);
        
        return group;
    }
    
    createTruckMesh(isStealth) {
        const group = new THREE.Group();
        const bodyColor = isStealth ? 0x111111 : this.getRandomCarColor();
        
        // Pickup truck cab
        const cabGeometry = new THREE.BoxGeometry(2, 1.1, 2);
        const cabMaterial = new THREE.MeshStandardMaterial({
            color: bodyColor,
            roughness: isStealth ? 0.95 : 0.4,
            metalness: isStealth ? 0.1 : 0.5
        });
        const cab = new THREE.Mesh(cabGeometry, cabMaterial);
        cab.position.set(0, 0.85, 1.2);
        cab.castShadow = true;
        group.add(cab);
        
        // Cabin windows
        const windowGeometry = new THREE.BoxGeometry(1.8, 0.7, 1.2);
        const windowMaterial = new THREE.MeshStandardMaterial({
            color: isStealth ? 0x0a0a0a : 0x222233,
            roughness: 0.2
        });
        const window = new THREE.Mesh(windowGeometry, windowMaterial);
        window.position.set(0, 1.65, 1.2);
        group.add(window);
        
        // Truck bed
        const bedGeometry = new THREE.BoxGeometry(2, 0.6, 2.5);
        const bed = new THREE.Mesh(bedGeometry, cabMaterial);
        bed.position.set(0, 0.7, -1);
        group.add(bed);
        
        // Bed walls
        const wallMaterial = new THREE.MeshStandardMaterial({
            color: bodyColor,
            roughness: 0.6
        });
        const backWall = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 0.1), wallMaterial);
        backWall.position.set(0, 1.15, -2.2);
        group.add(backWall);
        
        this.addWheels(group, 0.9, 1.5, 0.38);
        if (!isStealth) this.addHeadlights(group, 2.2);
        this.addTaillights(group, isStealth, -2.25);
        
        return group;
    }
    
    createSemiMesh(isStealth) {
        const group = new THREE.Group();
        const bodyColor = isStealth ? 0x111111 : this.getRandomCarColor();
        
        // Cab
        const cabGeometry = new THREE.BoxGeometry(2.4, 1.8, 2.5);
        const cabMaterial = new THREE.MeshStandardMaterial({
            color: bodyColor,
            roughness: isStealth ? 0.95 : 0.4,
            metalness: isStealth ? 0.1 : 0.5
        });
        const cab = new THREE.Mesh(cabGeometry, cabMaterial);
        cab.position.set(0, 1.4, 3);
        cab.castShadow = true;
        group.add(cab);
        
        // Cab roof
        const roofGeometry = new THREE.BoxGeometry(2.2, 0.6, 1.5);
        const roof = new THREE.Mesh(roofGeometry, cabMaterial);
        roof.position.set(0, 2.5, 3.2);
        group.add(roof);
        
        // Windows
        const windowGeometry = new THREE.BoxGeometry(2.2, 0.8, 0.8);
        const windowMaterial = new THREE.MeshStandardMaterial({
            color: isStealth ? 0x0a0a0a : 0x222233,
            roughness: 0.2
        });
        const window = new THREE.Mesh(windowGeometry, windowMaterial);
        window.position.set(0, 2.1, 3.8);
        group.add(window);
        
        // Trailer
        const trailerGeometry = new THREE.BoxGeometry(2.6, 2.8, 8);
        const trailerMaterial = new THREE.MeshStandardMaterial({
            color: isStealth ? 0x0a0a0a : 0xcccccc,
            roughness: 0.8
        });
        const trailer = new THREE.Mesh(trailerGeometry, trailerMaterial);
        trailer.position.set(0, 1.9, -2.5);
        trailer.castShadow = true;
        group.add(trailer);
        
        // Wheels - cab
        this.addWheels(group, 1.1, 0.8, 0.4, 3);
        // Wheels - trailer front
        this.addWheels(group, 1.2, 0.8, 0.4, -1);
        // Wheels - trailer back
        this.addWheels(group, 1.2, 0.8, 0.4, -3.5);
        
        if (!isStealth) this.addHeadlights(group, 4.25, 1);
        this.addTaillights(group, isStealth, -6.5);
        
        group.userData.isLarge = true;
        return group;
    }
    
    createMotorcycleMesh(isStealth) {
        const group = new THREE.Group();
        const bodyColor = isStealth ? 0x111111 : this.getRandomCarColor();
        
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: bodyColor,
            roughness: isStealth ? 0.95 : 0.3,
            metalness: isStealth ? 0.1 : 0.7
        });
        
        // Main body/tank
        const tankGeometry = new THREE.BoxGeometry(0.4, 0.3, 1);
        const tank = new THREE.Mesh(tankGeometry, bodyMaterial);
        tank.position.set(0, 0.7, 0.2);
        group.add(tank);
        
        // Seat
        const seatGeometry = new THREE.BoxGeometry(0.35, 0.15, 0.8);
        const seatMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 });
        const seat = new THREE.Mesh(seatGeometry, seatMaterial);
        seat.position.set(0, 0.8, -0.3);
        group.add(seat);
        
        // Handlebars
        const handleGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8);
        const handleMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const handles = new THREE.Mesh(handleGeometry, handleMaterial);
        handles.rotation.z = Math.PI / 2;
        handles.position.set(0, 1, 0.7);
        group.add(handles);
        
        // Front fork
        const forkGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8);
        const fork = new THREE.Mesh(forkGeometry, handleMaterial);
        fork.rotation.x = 0.3;
        fork.position.set(0, 0.5, 0.9);
        group.add(fork);
        
        // Wheels
        const wheelGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.15, 16);
        const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 });
        
        const frontWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        frontWheel.rotation.z = Math.PI / 2;
        frontWheel.position.set(0, 0.35, 1.1);
        group.add(frontWheel);
        
        const backWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        backWheel.rotation.z = Math.PI / 2;
        backWheel.position.set(0, 0.35, -0.7);
        group.add(backWheel);
        
        // Rider
        const riderMaterial = new THREE.MeshStandardMaterial({ color: 0x222222 });
        
        // Rider body
        const torsoGeometry = new THREE.CapsuleGeometry(0.15, 0.4, 4, 8);
        const torso = new THREE.Mesh(torsoGeometry, riderMaterial);
        torso.rotation.x = 0.4;
        torso.position.set(0, 1.1, 0);
        group.add(torso);
        
        // Rider head with helmet
        const helmetGeometry = new THREE.SphereGeometry(0.15, 8, 8);
        const helmetMaterial = new THREE.MeshStandardMaterial({ 
            color: isStealth ? 0x000000 : 0x222222,
            roughness: 0.3
        });
        const helmet = new THREE.Mesh(helmetGeometry, helmetMaterial);
        helmet.position.set(0, 1.4, 0.3);
        group.add(helmet);
        
        // Headlight
        if (!isStealth) {
            const headlightGeometry = new THREE.SphereGeometry(0.08, 8, 8);
            const headlightMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffaa,
                emissive: 0xffffaa,
                emissiveIntensity: 2
            });
            const headlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
            headlight.position.set(0, 0.7, 1.2);
            group.add(headlight);
            
            const light = new THREE.SpotLight(0xffffee, 1.5, 25, 0.4, 0.5);
            light.position.set(0, 0.7, 1.2);
            light.target.position.set(0, 0, 15);
            group.add(light);
            group.add(light.target);
        }
        
        // Taillight
        const taillightGeometry = new THREE.BoxGeometry(0.15, 0.1, 0.05);
        const taillightMaterial = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            emissive: isStealth ? 0x000000 : 0xff0000,
            emissiveIntensity: isStealth ? 0 : 0.5
        });
        const taillight = new THREE.Mesh(taillightGeometry, taillightMaterial);
        taillight.position.set(0, 0.6, -0.9);
        group.add(taillight);
        
        group.userData.isMotorcycle = true;
        return group;
    }
    
    addWheels(group, xOffset, zOffset, radius = 0.35, zPos = 0) {
        const wheelGeometry = new THREE.CylinderGeometry(radius, radius, 0.3, 16);
        const wheelMaterial = new THREE.MeshStandardMaterial({
            color: 0x111111,
            roughness: 0.9
        });
        
        const positions = [
            { x: xOffset, z: zPos + zOffset },
            { x: -xOffset, z: zPos + zOffset },
            { x: xOffset, z: zPos - zOffset },
            { x: -xOffset, z: zPos - zOffset }
        ];
        
        positions.forEach(pos => {
            const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(pos.x, radius, pos.z);
            group.add(wheel);
        });
    }
    
    addHeadlights(group, zPos, yPos = 0.7) {
        const headlightGeometry = new THREE.SphereGeometry(0.15, 8, 8);
        const headlightMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffaa,
            emissive: 0xffffaa,
            emissiveIntensity: 2
        });
        
        const leftHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
        leftHeadlight.position.set(0.6, yPos, zPos);
        group.add(leftHeadlight);
        
        const rightHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
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
        const taillightGeometry = new THREE.BoxGeometry(0.3, 0.2, 0.05);
        const taillightMaterial = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            emissive: isStealth ? 0x000000 : 0xff0000,
            emissiveIntensity: isStealth ? 0 : 0.5
        });
        
        const leftTaillight = new THREE.Mesh(taillightGeometry, taillightMaterial);
        leftTaillight.position.set(0.7, 0.7, zPos);
        group.add(leftTaillight);
        
        const rightTaillight = new THREE.Mesh(taillightGeometry, taillightMaterial);
        rightTaillight.position.set(-0.7, 0.7, zPos);
        group.add(rightTaillight);
    }
    
    spawnCar(elapsedTime) {
        // Determine if stealth car
        const elapsedMinutes = elapsedTime / 60;
        let stealthChance = this.baseStealthChance;
        if (elapsedMinutes > 2) {
            stealthChance += (elapsedMinutes - 2) * this.stealthChanceIncrease;
        }
        const isStealth = Math.random() < stealthChance;
        
        // Get random vehicle type
        const vehicleType = this.getRandomVehicleType();
        const mesh = this.createVehicleMesh(isStealth, vehicleType);
        
        // Random lane (-3 or 3 for two-lane road)
        const lane = Math.random() > 0.5 ? 3 : -3;
        
        // Direction based on lane (right lane goes forward, left goes back)
        const direction = lane > 0 ? -1 : 1;
        
        // Start position
        const startZ = direction > 0 ? -this.roadLength / 2 - 10 : this.roadLength / 2 + 10;
        
        mesh.position.set(lane, 0, startZ);
        
        // Rotate car to face direction of travel
        if (direction < 0) {
            mesh.rotation.y = Math.PI;
        }
        
        this.scene.add(mesh);
        
        // Speed varies by vehicle type
        let baseSpeed = 8;
        if (vehicleType === VEHICLE_TYPES.MOTORCYCLE) baseSpeed = 12;
        if (vehicleType === VEHICLE_TYPES.SEMI) baseSpeed = 6;
        if (vehicleType === VEHICLE_TYPES.TRUCK) baseSpeed = 7;
        
        // Apply difficulty multiplier
        const speed = (baseSpeed + Math.random() * 6) * this.difficultyMultiplier;
        
        const car = {
            mesh: mesh,
            lane: lane,
            direction: direction,
            speed: speed,
            isStealth: isStealth,
            hasTriggeredNearMiss: false,
            vehicleType: vehicleType
        };
        
        this.cars.push(car);
    }
    
    update(deltaTime, elapsedTime) {
        // Update spawn rate based on elapsed time
        const elapsedMinutes = elapsedTime / 60;
        const spawnInterval = this.baseSpawnInterval / (1 + elapsedMinutes * 0.15);
        
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
            
            // Move car
            car.mesh.position.z += car.direction * car.speed * deltaTime;
            
            // Remove if off-screen
            const removeZ = this.roadLength / 2 + 20;
            if (car.mesh.position.z > removeZ || car.mesh.position.z < -removeZ) {
                this.scene.remove(car.mesh);
                this.disposeCar(car);
                this.cars.splice(i, 1);
            }
        }
    }
    
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
            
            // Check if in near-miss zone but not collision
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
        
        // Adjust bounding box based on vehicle type
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
        // Remove all cars
        this.cars.forEach(car => {
            this.scene.remove(car.mesh);
            this.disposeCar(car);
        });
        this.cars = [];
        this.spawnTimer = 0;
        this.lastNearMiss = 999;
    }

    disposeCar(car) {
        // Dispose geometries and materials to free memory
        if (car.mesh) {
            car.mesh.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }
    }
}
