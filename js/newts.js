import * as THREE from 'three';

const _moveDir = new THREE.Vector3();
const _scaledDir = new THREE.Vector3();

export class NewtManager {
    constructor(scene, flashlight, roadCurve = null, isLowEnd = false) {
        this.scene = scene;
        this.flashlight = flashlight;
        this.roadCurve = roadCurve;
        this.isLowEnd = isLowEnd;

        this.newts = [];
        this.rescuedCount = 0;
        this.levelNewtsRescued = 0;

        // Spawn settings
        this.baseSpawnInterval = 3; // seconds
        this.spawnTimer = 0;
        this.roadWidth = 12;
        this.roadLength = 520;

        // Rescue settings
        this.rescueDistance = 1.5; // Auto-rescue distance

        // Speed multiplier (for endless mode)
        this.speedMultiplier = 1;

        // Rescue celebration particles
        this.rescueEffects = [];

        // Newt pooling to avoid runtime allocations
        this.newtPool = [];

        this.qualityLevel = isLowEnd ? 1 : 3;
        this.maxActiveNewts = isLowEnd ? 8 : 14;
        this.illuminationCheckInterval = isLowEnd ? 3 : 1;
        this.illuminationCheckCounter = 0;

        this._spawnDirection = new THREE.Vector3();

        // Reusable statics for getRoadDataAtZ to avoid per-call allocations
        this._rdPoint = new THREE.Vector3();
        this._rdTangent = new THREE.Vector3();
        this._rdNormal = new THREE.Vector3();
        this._rdResult = { point: null, tangent: null, normal: null, t: 0 };
        this._rdFallback = {
            point: new THREE.Vector3(),
            tangent: new THREE.Vector3(0, 0, 1),
            normal: new THREE.Vector3(1, 0, 0),
            t: 0
        };
    }

    setRoadCurve(roadCurve) {
        this.roadCurve = roadCurve;

        if (!roadCurve) return;

        let minZ = Infinity;
        let maxZ = -Infinity;
        for (let i = 0; i <= 120; i++) {
            const point = roadCurve.getPoint(i / 120);
            minZ = Math.min(minZ, point.z);
            maxZ = Math.max(maxZ, point.z);
        }

        this.roadLength = Math.max(280, maxZ - minZ);
    }

    createNewtMesh() {
        const group = new THREE.Group();

        const detail = this.qualityLevel <= 1 ? 6 : 8;
        const capsuleSegments = this.qualityLevel <= 1 ? 3 : 4;

        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0x5C1A0A,
            roughness: 0.6,
            metalness: 0.05
        });

        const bellyMaterial = new THREE.MeshStandardMaterial({
            color: 0xF07020,
            roughness: 0.6,
            metalness: 0.05
        });

        const bodyGeometry = new THREE.CapsuleGeometry(0.14, 0.5, capsuleSegments, detail);
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.rotation.z = Math.PI / 2;
        body.scale.set(1, 0.8, 1.2);
        body.position.set(0, 0.12, 0);
        group.add(body);

        const bellyGeometry = new THREE.CapsuleGeometry(0.13, 0.48, capsuleSegments, detail);
        const belly = new THREE.Mesh(bellyGeometry, bellyMaterial);
        belly.rotation.z = Math.PI / 2;
        belly.scale.set(1, 0.6, 1.15);
        belly.position.set(0, 0.06, 0);
        group.add(belly);

        const headGroup = new THREE.Group();

        const headGeometry = new THREE.SphereGeometry(0.14, detail, detail);
        const head = new THREE.Mesh(headGeometry, bodyMaterial);
        head.scale.set(1.2, 0.6, 1.15);
        headGroup.add(head);

        const headBellyGeometry = new THREE.SphereGeometry(0.13, detail, detail);
        const headBelly = new THREE.Mesh(headBellyGeometry, bellyMaterial);
        headBelly.scale.set(1.1, 0.5, 1.1);
        headBelly.position.set(0, -0.04, 0);
        headGroup.add(headBelly);

        headGroup.position.set(0.38, 0.12, 0);
        group.add(headGroup);

        const eyeGeometry = new THREE.SphereGeometry(0.035, 5, 5);
        const eyeMaterial = new THREE.MeshStandardMaterial({
            color: 0x222200,
            emissive: 0x000000,
            emissiveIntensity: 0
        });

        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial.clone());
        leftEye.position.set(0.42, 0.16, 0.1);
        leftEye.rotation.y = Math.PI / 8;
        group.add(leftEye);

        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial.clone());
        rightEye.position.set(0.42, 0.16, -0.1);
        rightEye.rotation.y = -Math.PI / 8;
        group.add(rightEye);

        group.userData.eyes = { left: leftEye, right: rightEye };

        const tailGeometry = new THREE.ConeGeometry(0.12, 0.65, detail);
        const tail = new THREE.Mesh(tailGeometry, bodyMaterial);
        tail.rotation.z = Math.PI / 2;
        tail.scale.set(1.0, 1.0, 0.35);

        const tailBellyGeometry = new THREE.ConeGeometry(0.11, 0.6, detail);
        const tailBelly = new THREE.Mesh(tailBellyGeometry, bellyMaterial);
        tailBelly.rotation.z = Math.PI / 2;
        tailBelly.scale.set(1.0, 1.0, 0.3);

        const tailGroup = new THREE.Group();
        tailGroup.position.set(-0.35, 0, 0);

        tail.position.set(-0.13, 0.11, 0);
        tailBelly.position.set(-0.1, 0.08, 0);
        tailGroup.add(tail);
        tailGroup.add(tailBelly);
        group.add(tailGroup);

        const createLeg = (x, z, isFront, isRight) => {
            const legGroup = new THREE.Group();
            legGroup.position.set(x, 0.1, z);

            const legMesh = new THREE.Mesh(
                new THREE.CapsuleGeometry(0.035, 0.16, 3, detail),
                bodyMaterial
            );
            legMesh.position.y = -0.07;
            legMesh.rotation.x = isRight ? -0.5 : 0.5;
            legMesh.rotation.z = isFront ? -0.2 : 0.2;

            const foot = new THREE.Mesh(
                new THREE.SphereGeometry(0.045, detail, detail),
                bellyMaterial
            );
            foot.scale.set(1.2, 0.4, 1.2);
            foot.position.set(isFront ? 0.02 : -0.02, -0.15, isRight ? 0.08 : -0.08);

            legGroup.add(legMesh);
            legGroup.add(foot);

            return legGroup;
        };

        const frontRightLeg = createLeg(0.2, 0.1, true, true);
        const frontLeftLeg = createLeg(0.2, -0.1, true, false);
        group.add(frontRightLeg);
        group.add(frontLeftLeg);

        const backRightLeg = createLeg(-0.15, 0.1, false, true);
        const backLeftLeg = createLeg(-0.15, -0.1, false, false);
        group.add(backRightLeg);
        group.add(backLeftLeg);

        group.scale.set(1.2, 1.2, 1.2);

        group.userData.legs = {
            frontRight: frontRightLeg,
            frontLeft: frontLeftLeg,
            backRight: backRightLeg,
            backLeft: backLeftLeg
        };
        group.userData.tail = tailGroup;
        group.userData.bodyMaterial = bodyMaterial;
        group.userData.bellyMaterial = bellyMaterial;

        return group;
    }

    getNewtFromPool() {
        if (this.newtPool.length > 0) {
            const mesh = this.newtPool.pop();
            mesh.visible = true;
            return mesh;
        }
        return this.createNewtMesh();
    }

    resetNewtAppearance(mesh) {
        mesh.rotation.set(0, 0, 0);

        const eyes = mesh.userData.eyes;
        if (eyes) {
            eyes.left.material.color.setHex(0x222200);
            eyes.left.material.emissive.setHex(0x000000);
            eyes.left.material.emissiveIntensity = 0;
            eyes.right.material.color.setHex(0x222200);
            eyes.right.material.emissive.setHex(0x000000);
            eyes.right.material.emissiveIntensity = 0;
        }

        if (mesh.userData.isBonus) {
            mesh.userData.bodyMaterial.color.setHex(0xA01010); // Darker red body
            mesh.userData.bellyMaterial.color.setHex(0xFF6347); // Tomato red belly
            mesh.userData.bodyMaterial.emissive.setHex(0x440000);
            mesh.userData.bellyMaterial.emissive.setHex(0x440000);
        } else {
            mesh.userData.bodyMaterial.color.setHex(0x5C1A0A);
            mesh.userData.bellyMaterial.color.setHex(0xF07020);
            mesh.userData.bodyMaterial.emissive.setHex(0x000000);
            mesh.userData.bellyMaterial.emissive.setHex(0x000000);
        }

        const legs = mesh.userData.legs;
        if (legs) {
            legs.frontRight.rotation.set(0, 0, 0);
            legs.frontLeft.rotation.set(0, 0, 0);
            legs.backRight.rotation.set(0, 0, 0);
            legs.backLeft.rotation.set(0, 0, 0);
        }

        if (mesh.userData.tail) {
            mesh.userData.tail.rotation.y = 0;
        }
    }

    releaseNewtMesh(mesh) {
        if (!mesh) return;
        mesh.visible = false;
        this.scene.remove(mesh);
        this.newtPool.push(mesh);
    }

    prewarmPool(count) {
        const targetCount = Math.max(0, count | 0);
        while (this.newtPool.length < targetCount) {
            const mesh = this.createNewtMesh();
            mesh.visible = false;
            this.newtPool.push(mesh);
        }
    }

    setQualityLevel(level) {
        this.qualityLevel = Math.max(0, Math.min(3, level | 0));
        this.maxActiveNewts = this.qualityLevel <= 1 ? 8 : (this.qualityLevel === 2 ? 11 : 14);
        this.illuminationCheckInterval = this.qualityLevel <= 1 ? 3 : (this.qualityLevel === 2 ? 2 : 1);
    }

    spawnNewt() {
        const mesh = this.getNewtFromPool();
        if (!mesh.parent) {
            this.scene.add(mesh);
        } else {
            mesh.visible = true;
        }
        mesh.userData.isBonus = Math.random() < 0.15; // 15% chance to be a bonus newt
        this.resetNewtAppearance(mesh);

        // Random spawn position at road edge along the curved road
        const side = Math.random() > 0.5 ? 1 : -1;
        const z = (Math.random() - 0.5) * (this.roadLength - 60);

        let startPosition, targetPosition, roadNormal;

        if (this.roadCurve) {
            const roadData = this.getRoadDataAtZ(z);
            const roadCenter = roadData.point;
            roadNormal = roadData.normal;

            const edgeOffset = roadNormal.clone().multiplyScalar(side * (this.roadWidth / 2 + 2));
            startPosition = roadCenter.clone().add(edgeOffset);

            const targetOffset = roadNormal.clone().multiplyScalar(-side * (this.roadWidth / 2 + 2));
            targetPosition = roadCenter.clone().add(targetOffset);
        } else {
            startPosition = new THREE.Vector3(side * (this.roadWidth / 2 + 2), 0, z);
            targetPosition = new THREE.Vector3(-side * (this.roadWidth / 2 + 2), 0, z);
            roadNormal = new THREE.Vector3(1, 0, 0);
        }

        mesh.position.copy(startPosition);

        this._spawnDirection.subVectors(targetPosition, startPosition).normalize();
        // Newt head is along local +X, so rotate to face movement direction
        mesh.rotation.y = Math.atan2(-this._spawnDirection.z, this._spawnDirection.x);

        const newt = {
            mesh: mesh,
            startPosition: startPosition.clone(),
            targetPosition: targetPosition.clone(),
            roadNormal: roadNormal.clone(),
            speed: (0.3 + Math.random() * 0.4) * this.speedMultiplier,
            isIlluminated: false,
            illuminationTime: 0,
            walkCycle: Math.random() * Math.PI * 2,
            pauseTimer: 0,
            isPaused: false,
            pauseDuration: 0,
            nextPauseIn: 2 + Math.random() * 4,
            isBonus: mesh.userData.isBonus
        };

        this.newts.push(newt);
    }

    getRoadDataAtZ(z) {
        if (!this.roadCurve) {
            if (!this._rdFallback) {
                this._rdFallback = {
                    point: new THREE.Vector3(),
                    tangent: new THREE.Vector3(0, 0, 1),
                    normal: new THREE.Vector3(1, 0, 0),
                    t: 0
                };
            }
            const fb = this._rdFallback;
            fb.point.set(0, 0, z);
            return fb;
        }

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
        this._rdPoint.copy(point);
        this._rdTangent.copy(tangent);
        this._rdNormal.set(-tangent.z, 0, tangent.x).normalize();

        const result = this._rdResult;
        result.point = this._rdPoint;
        result.tangent = this._rdTangent;
        result.normal = this._rdNormal;
        result.t = closestT;
        return result;
    }

    update(deltaTime, elapsedTime, playerPosition) {
        const elapsedMinutes = elapsedTime / 60;
        const spawnInterval = this.baseSpawnInterval / (1 + elapsedMinutes * 0.3);

        this.spawnTimer += deltaTime;
        if (this.spawnTimer >= spawnInterval) {
            if (this.newts.length < this.maxActiveNewts) {
                this.spawnNewt();
            }
            this.spawnTimer = 0;
        }

        this.illuminationCheckCounter++;
        const shouldCheckIllumination =
            this.illuminationCheckCounter % this.illuminationCheckInterval === 0;

        const rescuedNewts = [];

        for (let i = this.newts.length - 1; i >= 0; i--) {
            const newt = this.newts[i];

            if (newt.isPaused) {
                newt.pauseTimer += deltaTime;
                if (newt.pauseTimer >= newt.pauseDuration) {
                    newt.isPaused = false;
                    newt.pauseTimer = 0;
                    newt.nextPauseIn = 3 + Math.random() * 5;
                }
            } else {
                newt.nextPauseIn -= deltaTime;
                if (newt.nextPauseIn <= 0 && Math.random() < 0.3) {
                    newt.isPaused = true;
                    newt.pauseTimer = 0;
                    newt.pauseDuration = 0.5 + Math.random() * 1.5;
                } else if (newt.nextPauseIn <= 0) {
                    newt.nextPauseIn = 2 + Math.random() * 3;
                }
            }

            if (!newt.isPaused) {
                _moveDir.subVectors(newt.targetPosition, newt.mesh.position);
                const distanceToTarget = _moveDir.length();
                _moveDir.normalize();

                const moveDistance = newt.speed * deltaTime;
                _scaledDir.copy(_moveDir).multiplyScalar(moveDistance);
                newt.mesh.position.add(_scaledDir);
                newt.walkCycle += deltaTime * newt.speed * 12;

                if (distanceToTarget < 0.5 || newt.mesh.position.distanceTo(newt.startPosition) > newt.startPosition.distanceTo(newt.targetPosition)) {
                    this.releaseNewtMesh(newt.mesh);
                    this.newts.splice(i, 1);
                    continue;
                }
            }

            const legs = newt.mesh.userData.legs;
            if (legs && !newt.isPaused) {
                const phase = newt.walkCycle;
                const swingX = 0.35;
                const swingZ = 0.15;

                legs.frontRight.rotation.x = Math.sin(phase) * swingX;
                legs.frontRight.rotation.z = -0.2 + Math.cos(phase) * swingZ;

                legs.backLeft.rotation.x = Math.sin(phase) * swingX;
                legs.backLeft.rotation.z = 0.2 - Math.cos(phase) * swingZ;

                legs.frontLeft.rotation.x = Math.sin(phase + Math.PI) * swingX;
                legs.frontLeft.rotation.z = 0.2 - Math.cos(phase + Math.PI) * swingZ;

                legs.backRight.rotation.x = Math.sin(phase + Math.PI) * swingX;
                legs.backRight.rotation.z = -0.2 + Math.cos(phase + Math.PI) * swingZ;
            } else if (legs && newt.isPaused) {
                legs.frontRight.rotation.x *= 0.9;
                legs.frontLeft.rotation.x *= 0.9;
                legs.backRight.rotation.x *= 0.9;
                legs.backLeft.rotation.x *= 0.9;
            }

            const newtTail = newt.mesh.userData.tail;
            if (newtTail && !newt.isPaused) {
                newtTail.rotation.y = Math.sin(newt.walkCycle * 1.5) * 0.2;
            }

            newt.mesh.position.y = Math.abs(Math.sin(newt.walkCycle * 2)) * 0.01;
            if (!newt.isPaused) {
                // Face head toward movement direction (head is along local +X)
                newt.mesh.rotation.y = Math.atan2(-_moveDir.z, _moveDir.x) + Math.sin(newt.walkCycle * 0.7) * 0.01;
            }

            const isIlluminated = shouldCheckIllumination
                ? this.flashlight.isPointIlluminated(newt.mesh.position)
                : newt.isIlluminated;

            // Only update eye materials if illumination state changed
            if (newt.isIlluminated !== isIlluminated) {
                newt.isIlluminated = isIlluminated;

                // Update eye glow based on flashlight illumination
                const eyes = newt.mesh.userData.eyes;
                if (eyes) {
                    if (isIlluminated) {
                        eyes.left.material.color.setHex(0xDDAA20);
                        eyes.left.material.emissive.setHex(0xFFCC00);
                        eyes.left.material.emissiveIntensity = 0.8;
                        eyes.right.material.color.setHex(0xDDAA20);
                        eyes.right.material.emissive.setHex(0xFFCC00);
                        eyes.right.material.emissiveIntensity = 0.8;
                    } else {
                        eyes.left.material.color.setHex(0x222200);
                        eyes.left.material.emissive.setHex(0x000000);
                        eyes.left.material.emissiveIntensity = 0;
                        eyes.right.material.color.setHex(0x222200);
                        eyes.right.material.emissive.setHex(0x000000);
                        eyes.right.material.emissiveIntensity = 0;
                    }
                }
            }

            if (newt.isIlluminated) {
                newt.illuminationTime += deltaTime;
            }

            const dx = playerPosition.x - newt.mesh.position.x;
            const dz = playerPosition.z - newt.mesh.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);

            if (distance < this.rescueDistance) {
                if (newt.isBonus && this.flashlight && typeof this.flashlight.activateBonusBrightness === 'function') {
                    this.flashlight.activateBonusBrightness(5);
                }
                this.releaseNewtMesh(newt.mesh);
                this.newts.splice(i, 1);
                this.rescuedCount++;
                rescuedNewts.push(newt);
                continue;
            }
        }

        this.updateRescueEffects(deltaTime);

        return rescuedNewts;
    }

    setSpeedMultiplier(mult) {
        this.speedMultiplier = mult;
    }

    createRescueEffect(position, isBonus = false) {
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

            velocities.push(
                (Math.random() - 0.5) * 3,
                2 + Math.random() * 4,
                (Math.random() - 0.5) * 3
            );
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

        const material = new THREE.PointsMaterial({
            color: isBonus ? 0xff4444 : 0x44ff88,
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
                positions[vi] += effect.velocities[vi] * deltaTime;
                positions[vi + 1] += effect.velocities[vi + 1] * deltaTime;
                positions[vi + 2] += effect.velocities[vi + 2] * deltaTime;
                effect.velocities[vi + 1] -= 6 * deltaTime;
            }

            effect.geometry.attributes.position.needsUpdate = true;
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
            this.createSplatEffect(newt.mesh.position.clone());
            this.releaseNewtMesh(newt.mesh);
            this.newts.splice(index, 1);
            return true;
        }
        return false;
    }

    createSplatEffect(position) {
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

        setTimeout(() => {
            this.scene.remove(splat);
            splatGeometry.dispose();
            splatMaterial.dispose();
        }, 5000);
    }

    reset() {
        this.newts.forEach(newt => {
            this.releaseNewtMesh(newt.mesh);
        });
        this.newts = [];
        this.rescuedCount = 0;
        this.spawnTimer = 0;

        this.rescueEffects.forEach(effect => {
            this.scene.remove(effect.points);
            effect.geometry.dispose();
            effect.material.dispose();
        });
        this.rescueEffects = [];
    }
}
