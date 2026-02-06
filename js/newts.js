// newts.js - Procedural newt entities with spawning, AI, and rescue mechanics
import * as THREE from 'three';

export class NewtManager {
    constructor(scene, flashlight, roadCurve = null) {
        this.scene = scene;
        this.flashlight = flashlight;
        this.roadCurve = roadCurve;

        this.newts = [];
        this.rescuedCount = 0;
        this.levelNewtsRescued = 0;

        // Spawn settings
        this.baseSpawnInterval = 3; // seconds
        this.spawnTimer = 0;
        this.roadWidth = 12;
        this.roadLength = 280; // Increased from 200

        // Rescue settings
        this.rescueDistance = 1.5; // Auto-rescue distance

        // Speed multiplier (for endless mode)
        this.speedMultiplier = 1;

        // Rescue celebration particles
        this.rescueEffects = [];
    }
    
    setRoadCurve(roadCurve) {
        this.roadCurve = roadCurve;
    }

    createNewtMesh() {
        const group = new THREE.Group();

        // Materials - California newt (Taricha torosa) accurate colors
        // Rich chocolate-mahogany brown dorsal, slightly glossy wet skin
        const topMaterial = new THREE.MeshStandardMaterial({
            color: 0x5C1A0A,  // Deep chocolate-mahogany brown
            roughness: 0.35,
            metalness: 0.15
        });

        // Vivid warm orange ventral/underside and legs
        const orangeMaterial = new THREE.MeshStandardMaterial({
            color: 0xF07020,  // Warm vivid orange
            roughness: 0.4,
            metalness: 0.1,
            emissive: 0x401000,
            emissiveIntensity: 0.25
        });

        // Orange-brown transition for side stripe edging
        const edgeMaterial = new THREE.MeshStandardMaterial({
            color: 0xC04010,  // Reddish-orange transition
            roughness: 0.4,
            metalness: 0.1
        });

        // === BODY - wider, flatter, more robust ===
        // Main dorsal body (flattened capsule)
        const bodyGeometry = new THREE.CapsuleGeometry(0.14, 0.5, 8, 16);
        const body = new THREE.Mesh(bodyGeometry, topMaterial);
        body.rotation.z = Math.PI / 2;
        body.scale.set(1, 0.7, 1.15); // Flattened, wider
        body.position.y = 0.11;
        body.castShadow = true;
        group.add(body);

        // Orange belly (wide flat underside)
        const bellyGeometry = new THREE.SphereGeometry(0.13, 12, 8);
        const belly = new THREE.Mesh(bellyGeometry, orangeMaterial);
        belly.scale.set(2.6, 0.3, 1.1);
        belly.position.set(0, 0.04, 0);
        group.add(belly);

        // Orange side-stripes (where brown meets orange on each flank)
        const sideStripeGeo = new THREE.CapsuleGeometry(0.04, 0.5, 4, 8);
        const leftStripe = new THREE.Mesh(sideStripeGeo, edgeMaterial);
        leftStripe.rotation.z = Math.PI / 2;
        leftStripe.scale.set(1, 0.5, 1);
        leftStripe.position.set(0, 0.07, 0.12);
        group.add(leftStripe);

        const rightStripe = new THREE.Mesh(sideStripeGeo, edgeMaterial);
        rightStripe.rotation.z = Math.PI / 2;
        rightStripe.scale.set(1, 0.5, 1);
        rightStripe.position.set(0, 0.07, -0.12);
        group.add(rightStripe);

        // === HEAD - wide, blunt, toad-like, wider than neck ===
        const headGeometry = new THREE.SphereGeometry(0.12, 12, 12);
        const head = new THREE.Mesh(headGeometry, topMaterial);
        head.scale.set(1.2, 0.65, 1.4); // Very wide and flat
        head.position.set(0.38, 0.1, 0);
        head.castShadow = true;
        group.add(head);

        // Orange throat/chin - large and prominent
        const chinGeometry = new THREE.SphereGeometry(0.1, 10, 8);
        const chin = new THREE.Mesh(chinGeometry, orangeMaterial);
        chin.scale.set(1.1, 0.4, 1.3);
        chin.position.set(0.4, 0.04, 0);
        group.add(chin);

        // Blunt rounded snout
        const snoutGeometry = new THREE.SphereGeometry(0.07, 10, 10);
        const snout = new THREE.Mesh(snoutGeometry, topMaterial);
        snout.scale.set(1.0, 0.6, 1.1);
        snout.position.set(0.5, 0.1, 0);
        group.add(snout);

        // Snout orange underside
        const snoutBelly = new THREE.Mesh(
            new THREE.SphereGeometry(0.05, 8, 8),
            orangeMaterial
        );
        snoutBelly.scale.set(1.0, 0.4, 1.0);
        snoutBelly.position.set(0.5, 0.05, 0);
        group.add(snoutBelly);

        // Small nostrils
        const nostrilGeo = new THREE.SphereGeometry(0.012, 6, 6);
        const nostrilMat = new THREE.MeshStandardMaterial({ color: 0x1a0a05, roughness: 0.8 });
        const leftNostril = new THREE.Mesh(nostrilGeo, nostrilMat);
        leftNostril.position.set(0.56, 0.11, 0.03);
        group.add(leftNostril);
        const rightNostril = new THREE.Mesh(nostrilGeo, nostrilMat);
        rightNostril.position.set(0.56, 0.11, -0.03);
        group.add(rightNostril);

        // === EYES - very prominent, bulging, golden-yellow ===
        // Eye sockets (slight bump on head)
        const eyeSocketGeo = new THREE.SphereGeometry(0.04, 10, 10);

        // Left eye assembly
        const leftSocket = new THREE.Mesh(eyeSocketGeo, topMaterial);
        leftSocket.scale.set(1.1, 1, 1.1);
        leftSocket.position.set(0.42, 0.16, 0.09);
        group.add(leftSocket);

        const eyeGeo = new THREE.SphereGeometry(0.038, 12, 12);
        const eyeMaterial = new THREE.MeshStandardMaterial({
            color: 0xDDAA20,  // Golden-yellow like photo
            emissive: 0x886600,
            emissiveIntensity: 0.6,
            roughness: 0.15,
            metalness: 0.3
        });

        const leftEye = new THREE.Mesh(eyeGeo, eyeMaterial);
        leftEye.position.set(0.43, 0.18, 0.095);
        group.add(leftEye);

        const rightSocket = new THREE.Mesh(eyeSocketGeo, topMaterial);
        rightSocket.scale.set(1.1, 1, 1.1);
        rightSocket.position.set(0.42, 0.16, -0.09);
        group.add(rightSocket);

        const rightEye = new THREE.Mesh(eyeGeo, eyeMaterial);
        rightEye.position.set(0.43, 0.18, -0.095);
        group.add(rightEye);

        // Large round pupils
        const pupilGeo = new THREE.SphereGeometry(0.02, 10, 10);
        const pupilMaterial = new THREE.MeshStandardMaterial({
            color: 0x050505,
            roughness: 0.05,
            metalness: 0.6
        });

        const leftPupil = new THREE.Mesh(pupilGeo, pupilMaterial);
        leftPupil.position.set(0.46, 0.185, 0.1);
        group.add(leftPupil);

        const rightPupil = new THREE.Mesh(pupilGeo, pupilMaterial);
        rightPupil.position.set(0.46, 0.185, -0.1);
        group.add(rightPupil);

        // === TAIL - thick at base, tapers, curls, with orange underside ===
        const tailSegments = 8;
        let tailX = -0.3;
        let tailY = 0.09;
        let tailZ = 0;
        let tailRadius = 0.09; // Thicker base

        for (let i = 0; i < tailSegments; i++) {
            const t = i / (tailSegments - 1);
            // Dorsal (top) part
            const segGeo = new THREE.SphereGeometry(tailRadius, 8, 8);
            const tailSeg = new THREE.Mesh(segGeo, topMaterial);
            tailSeg.scale.set(1.4, 0.65, 0.85);
            tailSeg.position.set(tailX, tailY, tailZ);
            tailSeg.castShadow = true;
            group.add(tailSeg);

            // Orange underside of tail
            if (tailRadius > 0.03) {
                const underGeo = new THREE.SphereGeometry(tailRadius * 0.7, 6, 6);
                const underSeg = new THREE.Mesh(underGeo, edgeMaterial);
                underSeg.scale.set(1.2, 0.4, 0.8);
                underSeg.position.set(tailX, tailY - tailRadius * 0.3, tailZ);
                group.add(underSeg);
            }

            // Curve the tail with a slight S-curve like in photo
            tailX -= 0.07;
            tailY -= 0.005;
            tailZ += Math.sin(t * Math.PI * 0.8) * 0.015; // slight lateral curve
            tailRadius *= 0.78;
        }

        // === LEGS - thicker, more splayed, with longer distinct toes ===
        const createLeg = (attachX, attachZ, isBack, side) => {
            const legGroup = new THREE.Group();

            // Upper limb - thicker
            const upperGeo = new THREE.CapsuleGeometry(0.032, 0.09, 4, 8);
            const upper = new THREE.Mesh(upperGeo, orangeMaterial);
            upper.rotation.x = side * 0.9;
            upper.rotation.z = isBack ? 0.35 : -0.35;
            upper.position.set(0, -0.01, side * 0.05);
            legGroup.add(upper);

            // Lower limb
            const lowerGeo = new THREE.CapsuleGeometry(0.025, 0.07, 4, 8);
            const lower = new THREE.Mesh(lowerGeo, orangeMaterial);
            lower.rotation.x = side * 0.3;
            lower.position.set(isBack ? 0.02 : -0.02, -0.05, side * 0.11);
            legGroup.add(lower);

            // Palm/foot pad
            const padGeo = new THREE.SphereGeometry(0.028, 8, 8);
            const pad = new THREE.Mesh(padGeo, orangeMaterial);
            pad.scale.set(1.4, 0.35, 1.3);
            pad.position.set(isBack ? 0.03 : -0.03, -0.07, side * 0.14);
            legGroup.add(pad);

            // Toes - 4 front, 5 back (accurate to California newt)
            const toeCount = isBack ? 5 : 4;
            for (let t = 0; t < toeCount; t++) {
                const toeLen = 0.025 + (isBack ? 0.008 : 0.005);
                const toeGeo = new THREE.CapsuleGeometry(0.009, toeLen, 4, 6);
                const toe = new THREE.Mesh(toeGeo, orangeMaterial);
                const spread = toeCount === 5 ? (t - 2) : (t - 1.5);
                const toeAngle = spread * 0.3;
                toe.rotation.z = isBack ? 0.4 : -0.4;
                toe.rotation.y = toeAngle;
                toe.position.set(
                    (isBack ? 0.055 : -0.055) + Math.sin(toeAngle) * 0.015,
                    -0.075,
                    side * 0.14 + spread * 0.016
                );
                legGroup.add(toe);
            }

            legGroup.position.set(attachX, 0.1, attachZ);
            return legGroup;
        };

        // Front legs - splayed forward and outward
        const frontRightLeg = createLeg(0.22, 0.1, false, 1);
        const frontLeftLeg = createLeg(0.22, -0.1, false, -1);
        group.add(frontRightLeg);
        group.add(frontLeftLeg);

        // Back legs - splayed backward and outward
        const backRightLeg = createLeg(-0.17, 0.1, true, 1);
        const backLeftLeg = createLeg(-0.17, -0.1, true, -1);
        group.add(backRightLeg);
        group.add(backLeftLeg);

        // Scale up the whole newt
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

        // Random spawn position at road edge along the curved road
        const side = Math.random() > 0.5 ? 1 : -1; // 1 = right side, -1 = left side
        const z = (Math.random() - 0.5) * (this.roadLength - 60);
        
        let startPosition, targetPosition, roadNormal;
        
        if (this.roadCurve) {
            // Find position on road curve for this Z
            const roadData = this.getRoadDataAtZ(z);
            const roadCenter = roadData.point;
            roadNormal = roadData.normal;
            
            // Calculate start position at road edge
            const edgeOffset = roadNormal.clone().multiplyScalar(side * (this.roadWidth / 2 + 2));
            startPosition = roadCenter.clone().add(edgeOffset);
            
            // Calculate target position on opposite side
            const targetOffset = roadNormal.clone().multiplyScalar(-side * (this.roadWidth / 2 + 2));
            targetPosition = roadCenter.clone().add(targetOffset);
        } else {
            // Fallback for straight road
            startPosition = new THREE.Vector3(side * (this.roadWidth / 2 + 2), 0, z);
            targetPosition = new THREE.Vector3(-side * (this.roadWidth / 2 + 2), 0, z);
            roadNormal = new THREE.Vector3(1, 0, 0);
        }

        mesh.position.copy(startPosition);

        // Face direction of travel (across the road)
        const direction = new THREE.Vector3().subVectors(targetPosition, startPosition).normalize();
        mesh.rotation.y = Math.atan2(direction.x, direction.z);

        this.scene.add(mesh);

        const newt = {
            mesh: mesh,
            startPosition: startPosition.clone(),
            targetPosition: targetPosition.clone(),
            roadNormal: roadNormal.clone(),
            speed: (0.3 + Math.random() * 0.4) * this.speedMultiplier, // Slower, more realistic speed (0.3-0.7)
            isIlluminated: false,
            illuminationTime: 0,
            walkCycle: Math.random() * Math.PI * 2, // Random start phase for variety
            // Natural behavior
            pauseTimer: 0,
            isPaused: false,
            pauseDuration: 0,
            nextPauseIn: 2 + Math.random() * 4 // Random time until first pause (2-6 sec)
        };

        this.newts.push(newt);
    }
    
    // Helper method to get road data at a specific Z coordinate
    getRoadDataAtZ(z) {
        if (!this.roadCurve) {
            return {
                point: new THREE.Vector3(0, 0, z),
                tangent: new THREE.Vector3(0, 0, 1),
                normal: new THREE.Vector3(1, 0, 0)
            };
        }
        
        // Find the closest point on the curve to this Z
        let closestT = 0;
        let minZDiff = Infinity;
        
        for (let i = 0; i <= 100; i++) {
            const t = i / 100;
            const point = this.roadCurve.getPoint(t);
            const zDiff = Math.abs(point.z - z);
            if (zDiff < minZDiff) {
                minZDiff = zDiff;
                closestT = t;
            }
        }
        
        const point = this.roadCurve.getPoint(closestT);
        const tangent = this.roadCurve.getTangent(closestT);
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
        
        return { point, tangent, normal, t: closestT };
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

        const rescuedNewts = [];

        // Update each newt
        for (let i = this.newts.length - 1; i >= 0; i--) {
            const newt = this.newts[i];

            // Natural pause behavior - newts occasionally stop while crossing
            if (newt.isPaused) {
                newt.pauseTimer += deltaTime;
                if (newt.pauseTimer >= newt.pauseDuration) {
                    // Resume movement
                    newt.isPaused = false;
                    newt.pauseTimer = 0;
                    newt.nextPauseIn = 3 + Math.random() * 5; // Next pause in 3-8 seconds
                }
            } else {
                newt.nextPauseIn -= deltaTime;
                if (newt.nextPauseIn <= 0 && Math.random() < 0.3) {
                    // Random chance to pause (30% when timer expires)
                    newt.isPaused = true;
                    newt.pauseTimer = 0;
                    newt.pauseDuration = 0.5 + Math.random() * 1.5; // Pause for 0.5-2 seconds
                } else if (newt.nextPauseIn <= 0) {
                    // Reset timer if didn't pause
                    newt.nextPauseIn = 2 + Math.random() * 3;
                }
            }

            // Movement - newts cross perpendicular to road direction
            if (!newt.isPaused) {
                // Calculate direction to target
                const moveDir = new THREE.Vector3().subVectors(newt.targetPosition, newt.mesh.position);
                const distanceToTarget = moveDir.length();
                moveDir.normalize();
                
                // Move towards target
                const moveDistance = newt.speed * deltaTime;
                newt.mesh.position.add(moveDir.clone().multiplyScalar(moveDistance));
                
                // Animate walking cycle when moving
                newt.walkCycle += deltaTime * newt.speed * 12;
                
                // Check if crossed road (reached or passed target)
                if (distanceToTarget < 0.5 || newt.mesh.position.distanceTo(newt.startPosition) > newt.startPosition.distanceTo(newt.targetPosition)) {
                    this.scene.remove(newt.mesh);
                    this.newts.splice(i, 1);
                    continue;
                }
            }

            // Get leg references
            const legs = newt.mesh.userData.legs;
            if (legs) {
                // Diagonal gait - front right + back left move together, then front left + back right
                const legSwing = newt.isPaused ? 0 : 0.4; // No leg movement when paused
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

            // Check distance to player for auto-rescue (use horizontal distance only)
            const dx = playerPosition.x - newt.mesh.position.x;
            const dz = playerPosition.z - newt.mesh.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);

            if (distance < this.rescueDistance) {
                // Auto-rescue!
                this.scene.remove(newt.mesh);
                this.newts.splice(i, 1);
                this.rescuedCount++;
                rescuedNewts.push(newt);
                continue;
            }

        }

        // Update rescue celebration particles
        this.updateRescueEffects(deltaTime);

        return rescuedNewts;
    }

    setSpeedMultiplier(mult) {
        this.speedMultiplier = mult;
    }

    createRescueEffect(position) {
        // Pool max 5 effects (reuse oldest)
        if (this.rescueEffects.length >= 5) {
            const oldest = this.rescueEffects.shift();
            this.scene.remove(oldest.points);
            oldest.geometry.dispose();
        }

        const count = 20;
        const positions = new Float32Array(count * 3);
        const velocities = [];

        for (let i = 0; i < count; i++) {
            positions[i * 3] = position.x;
            positions[i * 3 + 1] = position.y + 0.2;
            positions[i * 3 + 2] = position.z;

            // Random velocities: hemisphere (upward bias + outward spread)
            velocities.push(
                (Math.random() - 0.5) * 3,  // x
                2 + Math.random() * 4,        // y (upward)
                (Math.random() - 0.5) * 3     // z
            );
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

        const material = new THREE.PointsMaterial({
            color: 0x44ff88,
            size: 0.15,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const points = new THREE.Points(geometry, material);
        this.scene.add(points);

        this.rescueEffects.push({
            points,
            geometry,
            material,
            velocities,
            life: 0,
            maxLife: 1.0
        });
    }

    updateRescueEffects(deltaTime) {
        for (let i = this.rescueEffects.length - 1; i >= 0; i--) {
            const effect = this.rescueEffects[i];
            effect.life += deltaTime;

            if (effect.life >= effect.maxLife) {
                this.scene.remove(effect.points);
                effect.geometry.dispose();
                effect.material.dispose();
                this.rescueEffects.splice(i, 1);
                continue;
            }

            const positions = effect.geometry.attributes.position.array;
            const count = positions.length / 3;

            for (let j = 0; j < count; j++) {
                const vi = j * 3;
                // Apply velocity
                positions[vi] += effect.velocities[vi] * deltaTime;
                positions[vi + 1] += effect.velocities[vi + 1] * deltaTime;
                positions[vi + 2] += effect.velocities[vi + 2] * deltaTime;

                // Apply gravity
                effect.velocities[vi + 1] -= 6 * deltaTime;
            }

            effect.geometry.attributes.position.needsUpdate = true;

            // Fade opacity
            effect.material.opacity = 1.0 - (effect.life / effect.maxLife);
        }
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

        // Clean up rescue effects
        this.rescueEffects.forEach(effect => {
            this.scene.remove(effect.points);
            effect.geometry.dispose();
            effect.material.dispose();
        });
        this.rescueEffects = [];
    }
}
