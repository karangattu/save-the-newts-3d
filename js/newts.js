// newts.js - Procedural newt entities with spawning, AI, and rescue mechanics
import * as THREE from 'three';

export class NewtManager {
    constructor(scene, flashlight) {
        this.scene = scene;
        this.flashlight = flashlight;
        
        this.newts = [];
        this.rescuedCount = 0;
        
        // Spawn settings
        this.baseSpawnInterval = 3; // seconds
        this.spawnTimer = 0;
        this.roadWidth = 12;
        this.roadLength = 200;
        
        // Rescue settings
        this.rescueDistance = 3;
        this.nearbyNewt = null;
        
        // Reference to cars for reactive AI
        this.cars = [];
    }
    
    // Set cars reference for reactive AI
    setCars(cars) {
        this.cars = cars;
    }
    
    createNewtMesh() {
        const group = new THREE.Group();
        
        // Materials - California newt colors
        // Dark reddish-brown top
        const topMaterial = new THREE.MeshStandardMaterial({
            color: 0x8B2500,  // Dark reddish-brown
            roughness: 0.6,
            metalness: 0.2
        });
        
        // Bright orange underside
        const orangeMaterial = new THREE.MeshStandardMaterial({
            color: 0xFF6600,  // Bright orange
            roughness: 0.5,
            metalness: 0.1,
            emissive: 0x331100,
            emissiveIntensity: 0.2
        });
        
        // Body - elongated shape
        const bodyGeometry = new THREE.CapsuleGeometry(0.12, 0.5, 8, 16);
        const body = new THREE.Mesh(bodyGeometry, topMaterial);
        body.rotation.z = Math.PI / 2;
        body.position.y = 0.12;
        body.castShadow = true;
        group.add(body);
        
        // Orange belly (slightly flattened sphere under body)
        const bellyGeometry = new THREE.SphereGeometry(0.11, 12, 8);
        const belly = new THREE.Mesh(bellyGeometry, orangeMaterial);
        belly.scale.set(2.5, 0.4, 0.9);
        belly.position.set(0, 0.06, 0);
        group.add(belly);
        
        // Head - wider, flattened shape like in photo
        const headGeometry = new THREE.SphereGeometry(0.1, 12, 12);
        const head = new THREE.Mesh(headGeometry, topMaterial);
        head.scale.set(1.3, 0.8, 1.1);
        head.position.set(0.38, 0.12, 0);
        head.castShadow = true;
        group.add(head);
        
        // Orange chin/throat
        const chinGeometry = new THREE.SphereGeometry(0.08, 8, 8);
        const chin = new THREE.Mesh(chinGeometry, orangeMaterial);
        chin.scale.set(1.2, 0.5, 1);
        chin.position.set(0.4, 0.06, 0);
        group.add(chin);
        
        // Snout
        const snoutGeometry = new THREE.SphereGeometry(0.06, 8, 8);
        const snout = new THREE.Mesh(snoutGeometry, topMaterial);
        snout.scale.set(1.2, 0.7, 0.9);
        snout.position.set(0.48, 0.11, 0);
        group.add(snout);
        
        // Eyes - distinctive yellow-orange with dark pupils (like photo)
        const eyeWhiteGeometry = new THREE.SphereGeometry(0.035, 10, 10);
        const eyeMaterial = new THREE.MeshStandardMaterial({
            color: 0xFFAA00,  // Yellow-orange iris
            emissive: 0x664400,
            emissiveIntensity: 0.5,
            roughness: 0.3,
            metalness: 0.2
        });
        
        const leftEyeWhite = new THREE.Mesh(eyeWhiteGeometry, eyeMaterial);
        leftEyeWhite.position.set(0.42, 0.17, 0.07);
        group.add(leftEyeWhite);
        
        const rightEyeWhite = new THREE.Mesh(eyeWhiteGeometry, eyeMaterial);
        rightEyeWhite.position.set(0.42, 0.17, -0.07);
        group.add(rightEyeWhite);
        
        // Pupils - dark
        const pupilGeometry = new THREE.SphereGeometry(0.015, 8, 8);
        const pupilMaterial = new THREE.MeshStandardMaterial({
            color: 0x000000,
            roughness: 0.1,
            metalness: 0.5
        });
        
        const leftPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
        leftPupil.position.set(0.45, 0.17, 0.075);
        group.add(leftPupil);
        
        const rightPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
        rightPupil.position.set(0.45, 0.17, -0.075);
        group.add(rightPupil);
        
        // Tail - curved like in photo
        const tailSegments = 6;
        let tailX = -0.3;
        let tailY = 0.1;
        let tailRadius = 0.07;
        
        for (let i = 0; i < tailSegments; i++) {
            const segGeometry = new THREE.SphereGeometry(tailRadius, 8, 8);
            const tailSeg = new THREE.Mesh(segGeometry, topMaterial);
            tailSeg.scale.set(1.5, 0.8, 0.8);
            tailSeg.position.set(tailX, tailY, 0);
            tailSeg.castShadow = true;
            group.add(tailSeg);
            
            // Curve the tail slightly
            tailX -= 0.08;
            tailY -= 0.01;
            tailRadius *= 0.75;
        }
        
        // Legs with feet - bright orange like in photo
        const createLeg = (x, z, isBack, side) => {
            const legGroup = new THREE.Group();
            
            // Upper leg
            const upperLegGeometry = new THREE.CapsuleGeometry(0.025, 0.08, 4, 8);
            const upperLeg = new THREE.Mesh(upperLegGeometry, orangeMaterial);
            upperLeg.rotation.x = side * 0.8;
            upperLeg.rotation.z = isBack ? 0.3 : -0.3;
            upperLeg.position.set(0, 0, side * 0.04);
            legGroup.add(upperLeg);
            
            // Lower leg
            const lowerLegGeometry = new THREE.CapsuleGeometry(0.02, 0.06, 4, 8);
            const lowerLeg = new THREE.Mesh(lowerLegGeometry, orangeMaterial);
            lowerLeg.position.set(isBack ? 0.02 : -0.02, -0.04, side * 0.1);
            legGroup.add(lowerLeg);
            
            // Foot with toes
            const footGeometry = new THREE.SphereGeometry(0.025, 8, 8);
            const foot = new THREE.Mesh(footGeometry, orangeMaterial);
            foot.scale.set(1.5, 0.4, 1.2);
            foot.position.set(isBack ? 0.03 : -0.03, -0.06, side * 0.13);
            legGroup.add(foot);
            
            // Toes (4 small elongated spheres)
            for (let t = 0; t < 4; t++) {
                const toeGeometry = new THREE.CapsuleGeometry(0.008, 0.025, 4, 6);
                const toe = new THREE.Mesh(toeGeometry, orangeMaterial);
                const toeAngle = (t - 1.5) * 0.25;
                toe.rotation.z = isBack ? 0.5 : -0.5;
                toe.rotation.y = toeAngle;
                toe.position.set(
                    (isBack ? 0.05 : -0.05) + Math.sin(toeAngle) * 0.02,
                    -0.065,
                    side * 0.13 + (t - 1.5) * 0.015
                );
                legGroup.add(toe);
            }
            
            legGroup.position.set(x, 0.1, z);
            return legGroup;
        };
        
        // Front legs (positioned forward, splayed out like in photo)
        const frontRightLeg = createLeg(0.2, 0.08, false, 1);
        const frontLeftLeg = createLeg(0.2, -0.08, false, -1);
        group.add(frontRightLeg);
        group.add(frontLeftLeg);
        
        // Back legs (positioned back)
        const backRightLeg = createLeg(-0.15, 0.08, true, 1);
        const backLeftLeg = createLeg(-0.15, -0.08, true, -1);
        group.add(backRightLeg);
        group.add(backLeftLeg);
        
        // Scale up the whole newt a bit
        group.scale.set(1.2, 1.2, 1.2);
        
        // Store leg references for animation
        group.userData.legs = {
            frontRight: frontRightLeg,
            frontLeft: frontLeftLeg,
            backRight: backRightLeg,
            backLeft: backLeftLeg
        };
        
        return group;
    }
    
    spawnNewt() {
        const mesh = this.createNewtMesh();
        
        // Random spawn position at road edge
        const side = Math.random() > 0.5 ? 1 : -1;
        const startX = side * (this.roadWidth / 2 + 2);
        const targetX = -side * (this.roadWidth / 2 + 2);
        const z = (Math.random() - 0.5) * (this.roadLength - 40);
        
        mesh.position.set(startX, 0, z);
        
        // Face direction of travel
        if (side > 0) {
            mesh.rotation.y = Math.PI;
        }
        
        this.scene.add(mesh);
        
        const newt = {
            mesh: mesh,
            startX: startX,
            targetX: targetX,
            speed: 0.5 + Math.random() * 0.5,
            isIlluminated: false,
            illuminationTime: 0,
            walkCycle: Math.random() * Math.PI * 2, // Random start phase for variety
            // Reactive AI states
            state: 'crossing', // 'crossing', 'frozen', 'fleeing'
            frozenTimer: 0,
            fleeDirection: 0,
            originalSpeed: 0 // Store original speed
        };
        newt.originalSpeed = newt.speed;
        
        this.newts.push(newt);
    }
    
    // Check if newt is in car headlights
    isInHeadlights(newt) {
        for (const car of this.cars) {
            if (car.isStealth) continue; // Stealth cars have no headlights
            
            const carPos = car.mesh.position;
            const newtPos = newt.mesh.position;
            
            // Check if newt is in front of the car (within headlight range)
            const dx = newtPos.x - carPos.x;
            const dz = newtPos.z - carPos.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            // Headlight cone check - car direction matters
            const inFront = car.direction > 0 ? (dz > carPos.z) : (dz < carPos.z);
            const lateralDist = Math.abs(dx);
            
            // Within 15 units ahead, 3 units lateral spread
            if (inFront && distance < 15 && lateralDist < 3) {
                return true;
            }
        }
        return false;
    }
    
    // Check for nearby passing cars (for flee response)
    getNearbyCarThreat(newt) {
        for (const car of this.cars) {
            const carPos = car.mesh.position;
            const newtPos = newt.mesh.position;
            
            const dx = newtPos.x - carPos.x;
            const dz = newtPos.z - carPos.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            // Car passing very close (within 4 units)
            if (distance < 4) {
                return { car, dx, dz, distance };
            }
        }
        return null;
    }
    
    update(deltaTime, elapsedTime, playerPosition) {
        // Update spawn rate based on elapsed time
        const elapsedMinutes = elapsedTime / 60;
        const spawnInterval = this.baseSpawnInterval / (1 + elapsedMinutes * 0.3);
        
        // Spawn timer
        this.spawnTimer += deltaTime;
        if (this.spawnTimer >= spawnInterval) {
            this.spawnNewt();
            this.spawnTimer = 0;
        }
        
        this.nearbyNewt = null;
        let closestDistance = Infinity;
        
        // Update each newt
        for (let i = this.newts.length - 1; i >= 0; i--) {
            const newt = this.newts[i];
            
            // Reactive AI state machine
            const inHeadlights = this.isInHeadlights(newt);
            const nearbyThreat = this.getNearbyCarThreat(newt);
            
            // State transitions
            if (newt.state === 'crossing') {
                if (inHeadlights) {
                    // Freeze in headlights!
                    newt.state = 'frozen';
                    newt.frozenTimer = 0;
                    newt.speed = 0;
                } else if (nearbyThreat) {
                    // Flee from nearby car
                    newt.state = 'fleeing';
                    newt.frozenTimer = 0;
                    // Flee perpendicular to car direction
                    newt.fleeDirection = nearbyThreat.dx > 0 ? 1 : -1;
                    newt.speed = newt.originalSpeed * 2.5; // Run faster when scared
                }
            } else if (newt.state === 'frozen') {
                newt.frozenTimer += deltaTime;
                // Unfreeze after 1.5 seconds or when headlights pass
                if (!inHeadlights || newt.frozenTimer > 1.5) {
                    newt.state = 'crossing';
                    newt.speed = newt.originalSpeed;
                }
            } else if (newt.state === 'fleeing') {
                newt.frozenTimer += deltaTime;
                // Resume normal crossing after 1 second
                if (newt.frozenTimer > 1.0) {
                    newt.state = 'crossing';
                    newt.speed = newt.originalSpeed;
                }
            }
            
            // Movement based on state
            const direction = newt.targetX > newt.startX ? 1 : -1;
            
            if (newt.state === 'crossing') {
                // Normal movement towards target
                newt.mesh.position.x += direction * newt.speed * deltaTime;
            } else if (newt.state === 'fleeing') {
                // Move away from threat (laterally)
                newt.mesh.position.x += newt.fleeDirection * newt.speed * deltaTime;
            }
            // Frozen state: no movement
            
            // Animate walking cycle (only if moving)
            if (newt.speed > 0) {
                newt.walkCycle += deltaTime * newt.speed * 12;
            }
            
            // Get leg references
            const legs = newt.mesh.userData.legs;
            if (legs) {
                // Diagonal gait - front right + back left move together, then front left + back right
                const legSwing = 0.4; // Amount of rotation
                const phase = newt.walkCycle;
                
                // Front right and back left (in sync)
                legs.frontRight.rotation.x = Math.sin(phase) * legSwing;
                legs.frontRight.rotation.z = Math.sin(phase) * 0.15 - 0.2;
                legs.backLeft.rotation.x = Math.sin(phase) * legSwing;
                legs.backLeft.rotation.z = -Math.sin(phase) * 0.15 + 0.2;
                
                // Front left and back right (opposite phase)
                legs.frontLeft.rotation.x = Math.sin(phase + Math.PI) * legSwing;
                legs.frontLeft.rotation.z = Math.sin(phase + Math.PI) * 0.15 + 0.2;
                legs.backRight.rotation.x = Math.sin(phase + Math.PI) * legSwing;
                legs.backRight.rotation.z = -Math.sin(phase + Math.PI) * 0.15 - 0.2;
            }
            
            // Body bob and tail wiggle
            newt.mesh.position.y = Math.abs(Math.sin(newt.walkCycle * 2)) * 0.015;
            newt.mesh.rotation.y += Math.sin(newt.walkCycle * 0.5) * 0.002; // Subtle side-to-side
            
            // Check if illuminated
            newt.isIlluminated = this.flashlight.isPointIlluminated(newt.mesh.position);
            
            if (newt.isIlluminated) {
                newt.illuminationTime += deltaTime;
            }
            
            // Check distance to player for rescue
            const distance = playerPosition.distanceTo(newt.mesh.position);
            
            if (newt.isIlluminated && distance < this.rescueDistance) {
                if (distance < closestDistance) {
                    closestDistance = distance;
                    this.nearbyNewt = newt;
                }
            }
            
            // Remove if crossed road
            if ((direction > 0 && newt.mesh.position.x > newt.targetX) ||
                (direction < 0 && newt.mesh.position.x < newt.targetX)) {
                this.scene.remove(newt.mesh);
                this.newts.splice(i, 1);
            }
        }
    }
    
    canRescue() {
        return this.nearbyNewt !== null;
    }
    
    rescue() {
        if (!this.nearbyNewt) return false;
        
        // Remove the newt
        const index = this.newts.indexOf(this.nearbyNewt);
        if (index > -1) {
            this.scene.remove(this.nearbyNewt.mesh);
            this.newts.splice(index, 1);
            this.rescuedCount++;
            this.nearbyNewt = null;
            return true;
        }
        return false;
    }
    
    getRescuedCount() {
        return this.rescuedCount;
    }
    
    getNewts() {
        return this.newts;
    }
    
    crushNewt(newt) {
        const index = this.newts.indexOf(newt);
        if (index > -1) {
            // Create a "splat" effect at the position
            this.createSplatEffect(newt.mesh.position.clone());
            
            this.scene.remove(newt.mesh);
            this.newts.splice(index, 1);
            return true;
        }
        return false;
    }
    
    createSplatEffect(position) {
        // Create a flat splat mark on the road
        const splatGeometry = new THREE.CircleGeometry(0.4, 8);
        const splatMaterial = new THREE.MeshStandardMaterial({
            color: 0x442200,
            roughness: 0.9,
            transparent: true,
            opacity: 0.8
        });
        const splat = new THREE.Mesh(splatGeometry, splatMaterial);
        splat.rotation.x = -Math.PI / 2;
        splat.position.copy(position);
        splat.position.y = 0.02;
        this.scene.add(splat);
        
        // Fade out and remove after a few seconds
        setTimeout(() => {
            this.scene.remove(splat);
        }, 5000);
    }
    
    reset() {
        // Remove all newts
        this.newts.forEach(newt => {
            this.scene.remove(newt.mesh);
        });
        this.newts = [];
        this.rescuedCount = 0;
        this.spawnTimer = 0;
        this.nearbyNewt = null;
    }
}
