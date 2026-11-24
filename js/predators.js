// predators.js - Mountain lion and bear 3D models and attack animations
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { rigStaticModel, applyAttackPose, resetPose } from './predatorRig.js';

// Low-poly CC-BY 3.0 models from Poly Pizza ("Black bear" and "Cougar", Poly by Google).
// See README.md for attribution.
const MODEL_SOURCES = {
    'mountain lion': {
        url: 'assets/models/mountain-lion.glb',
        height: 1.15,
        lightColor: 0xffc27a,
        lightIntensity: 1.1,
        lightDistance: 6
    },
    bear: {
        url: 'assets/models/black-bear.glb',
        height: 1.8,
        lightColor: 0xff9b66,
        lightIntensity: 1.4,
        lightDistance: 7
    }
};

async function loadTemplate(loader, type) {
    const config = MODEL_SOURCES[type];
    const gltf = await loader.loadAsync(config.url);
    return gltf.scene;
}

export class PredatorManager {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.activePredator = null;
        this.attackAnimationId = null;
        this.predatorPool = {
            'mountain lion': [],
            bear: []
        };
        // Normalized template scenes, filled once the GLBs finish loading.
        this.modelTemplates = {
            'mountain lion': null,
            bear: null
        };
        this.modelsReady = this.loadModels();
    }

    async loadModels() {
        const loader = new GLTFLoader();
        await Promise.all(Object.keys(MODEL_SOURCES).map(async (type) => {
            try {
                this.modelTemplates[type] = await loadTemplate(loader, type);
            } catch (error) {
                console.warn(`Failed to load ${type} model, using fallback:`, error);
            }
        }));
    }

    prewarmPool() {
        // Kicks off loading (already started in the constructor) and tops up the
        // pool once both models are ready.
        this.modelsReady.then(() => {
            this.ensurePooled('mountain lion');
            this.ensurePooled('bear');
        });
    }

    ensurePooled(type) {
        if (!this.modelTemplates[type] || this.predatorPool[type].length > 0) return;

        const predator = this.createFromTemplate(type);
        predator.visible = false;
        this.scene.add(predator);
        this.predatorPool[type].push(predator);
    }

    createFromTemplate(type) {
        const wrapper = new THREE.Group();
        const inner = new THREE.Group();
        const rig = rigStaticModel(this.modelTemplates[type], MODEL_SOURCES[type].height, type);
        inner.add(rig.inner);

        const config = MODEL_SOURCES[type];
        const light = new THREE.PointLight(config.lightColor, config.lightIntensity, config.lightDistance);
        light.position.set(0, config.height * 0.62, rig.box.max.z * 0.85 + 0.55);
        inner.add(light);

        // Cool fill light keeps dark fur readable without flattening the night scene.
        const fill = new THREE.PointLight(0x9db9d6, type === 'bear' ? 8 : 5, 9);
        fill.position.set(-config.height * 0.9, config.height * 1.25, rig.box.max.z + 1);
        inner.add(fill);

        wrapper.add(inner);
        wrapper.userData.type = type;
        wrapper.userData.inner = inner;
        wrapper.userData.legs = [];
        wrapper.userData.rig = rig;
        return wrapper;
    }

    acquirePredator(type) {
        const key = type === 'mountain lion' ? 'mountain lion' : 'bear';
        const pooled = this.predatorPool[key].pop();

        if (pooled) {
            pooled.visible = true;
            return pooled;
        }

        // Fall back to primitive models if the GLB is not available (yet).
        return this.modelTemplates[key]
            ? this.createFromTemplate(key)
            : this.createPrimitive(key);
    }

    createPrimitive(type) {
        const primitive = type === 'mountain lion' ? this.createMountainLion() : this.createBear();

        // Primitive models are built head-first along +X; the attack code faces
        // predators with lookAt(), so rotate them to face +Z like the GLBs.
        const wrapper = new THREE.Group();
        const inner = new THREE.Group();
        primitive.rotation.y = -Math.PI / 2;
        inner.add(primitive);

        const config = MODEL_SOURCES[type];
        const fill = new THREE.PointLight(0x9db9d6, type === 'mountain lion' ? 5 : 8, 9);
        fill.position.set(-config.height * 0.9, config.height * 1.25, 2);
        inner.add(fill);

        wrapper.add(inner);
        wrapper.userData.type = type === 'mountain lion' ? 'mountain lion' : 'bear';
        wrapper.userData.inner = inner;
        wrapper.userData.legs = primitive.userData.legs || [];
        return wrapper;
    }

    releasePredator(predator) {
        if (!predator) return;

        predator.visible = false;
        predator.position.set(0, 0, 0);
        predator.rotation.set(0, 0, 0);
        predator.scale.setScalar(1);

        const inner = predator.userData.inner;
        if (inner) {
            inner.rotation.set(0, 0, 0);
            inner.position.set(0, 0, 0);
        }

        if (predator.userData.rig) {
            resetPose(predator.userData.rig);
        }

        const legs = predator.userData.legs || [];
        legs.forEach((leg) => {
            leg.rotation.x = 0;
        });

        if (!predator.parent) {
            this.scene.add(predator);
        }

        const key = predator.userData.type === 'mountain lion' ? 'mountain lion' : 'bear';
        this.predatorPool[key].push(predator);
    }

    createMountainLion() {
        const group = new THREE.Group();

        // Body color - tawny/tan
        const bodyColor = 0xb8860b;
        const darkColor = 0x8b7355;

        // Main body - elongated
        const bodyGeometry = new THREE.CapsuleGeometry(0.35, 1.2, 8, 16);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: bodyColor,
            roughness: 0.8
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.rotation.z = Math.PI / 2;
        body.position.set(0, 0.5, 0);
        group.add(body);

        // Head
        const headGeometry = new THREE.SphereGeometry(0.25, 12, 12);
        const head = new THREE.Mesh(headGeometry, bodyMaterial);
        head.position.set(0.8, 0.6, 0);
        head.scale.set(1.2, 1, 0.9);
        group.add(head);

        // Snout
        const snoutGeometry = new THREE.ConeGeometry(0.12, 0.25, 8);
        const snoutMaterial = new THREE.MeshStandardMaterial({ color: 0xdeb887 });
        const snout = new THREE.Mesh(snoutGeometry, snoutMaterial);
        snout.rotation.z = -Math.PI / 2;
        snout.position.set(1.05, 0.55, 0);
        group.add(snout);

        // Ears
        const earGeometry = new THREE.ConeGeometry(0.08, 0.15, 6);
        const earMaterial = new THREE.MeshStandardMaterial({ color: darkColor });

        const leftEar = new THREE.Mesh(earGeometry, earMaterial);
        leftEar.position.set(0.75, 0.85, -0.12);
        leftEar.rotation.x = -0.2;
        group.add(leftEar);

        const rightEar = new THREE.Mesh(earGeometry, earMaterial);
        rightEar.position.set(0.75, 0.85, 0.12);
        rightEar.rotation.x = 0.2;
        group.add(rightEar);

        // Eyes - glowing in dark
        const eyeGeometry = new THREE.SphereGeometry(0.04, 8, 8);
        const eyeMaterial = new THREE.MeshStandardMaterial({
            color: 0xffff00,
            emissive: 0xffaa00,
            emissiveIntensity: 2
        });

        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(0.95, 0.65, -0.1);
        group.add(leftEye);

        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.95, 0.65, 0.1);
        group.add(rightEye);

        // Legs
        const legGeometry = new THREE.CylinderGeometry(0.06, 0.05, 0.4, 8);
        const legMaterial = new THREE.MeshStandardMaterial({ color: bodyColor });

        // Front legs
        const frontLeftLeg = new THREE.Mesh(legGeometry, legMaterial);
        frontLeftLeg.position.set(0.4, 0.2, -0.2);
        group.add(frontLeftLeg);

        const frontRightLeg = new THREE.Mesh(legGeometry, legMaterial);
        frontRightLeg.position.set(0.4, 0.2, 0.2);
        group.add(frontRightLeg);

        // Back legs
        const backLeftLeg = new THREE.Mesh(legGeometry, legMaterial);
        backLeftLeg.position.set(-0.5, 0.2, -0.2);
        group.add(backLeftLeg);

        const backRightLeg = new THREE.Mesh(legGeometry, legMaterial);
        backRightLeg.position.set(-0.5, 0.2, 0.2);
        group.add(backRightLeg);

        // Long tail
        const tailGeometry = new THREE.CylinderGeometry(0.04, 0.02, 0.8, 8);
        const tail = new THREE.Mesh(tailGeometry, bodyMaterial);
        tail.position.set(-0.9, 0.5, 0);
        tail.rotation.z = Math.PI / 4;
        group.add(tail);

        // Add point light for dramatic effect
        const predatorLight = new THREE.PointLight(0xffaa00, 1, 5);
        predatorLight.position.set(0.9, 0.7, 0);
        group.add(predatorLight);

        group.userData.type = 'mountain lion';
        group.userData.legs = [frontLeftLeg, frontRightLeg, backLeftLeg, backRightLeg];

        return group;
    }

    createBear() {
        const group = new THREE.Group();

        // Body color - dark brown/black
        const bodyColor = 0x2d1f1a;
        const lightColor = 0x3d2f2a;

        // Main body - bulky
        const bodyGeometry = new THREE.SphereGeometry(0.6, 12, 12);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: bodyColor,
            roughness: 0.9
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.scale.set(1.3, 0.9, 1);
        body.position.set(0, 0.6, 0);
        group.add(body);

        // Rear body
        const rearGeometry = new THREE.SphereGeometry(0.5, 12, 12);
        const rear = new THREE.Mesh(rearGeometry, bodyMaterial);
        rear.position.set(-0.6, 0.55, 0);
        group.add(rear);

        // Head - rounder
        const headGeometry = new THREE.SphereGeometry(0.35, 12, 12);
        const head = new THREE.Mesh(headGeometry, bodyMaterial);
        head.position.set(0.7, 0.8, 0);
        group.add(head);

        // Snout
        const snoutGeometry = new THREE.CylinderGeometry(0.12, 0.15, 0.25, 8);
        const snoutMaterial = new THREE.MeshStandardMaterial({ color: lightColor });
        const snout = new THREE.Mesh(snoutGeometry, snoutMaterial);
        snout.rotation.z = Math.PI / 2;
        snout.position.set(1.0, 0.7, 0);
        group.add(snout);

        // Nose
        const noseGeometry = new THREE.SphereGeometry(0.06, 8, 8);
        const noseMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 });
        const nose = new THREE.Mesh(noseGeometry, noseMaterial);
        nose.position.set(1.15, 0.7, 0);
        group.add(nose);

        // Round ears
        const earGeometry = new THREE.SphereGeometry(0.1, 8, 8);

        const leftEar = new THREE.Mesh(earGeometry, bodyMaterial);
        leftEar.position.set(0.6, 1.1, -0.2);
        group.add(leftEar);

        const rightEar = new THREE.Mesh(earGeometry, bodyMaterial);
        rightEar.position.set(0.6, 1.1, 0.2);
        group.add(rightEar);

        // Eyes - smaller, glowing
        const eyeGeometry = new THREE.SphereGeometry(0.04, 8, 8);
        const eyeMaterial = new THREE.MeshStandardMaterial({
            color: 0xff6600,
            emissive: 0xff4400,
            emissiveIntensity: 2
        });

        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(0.9, 0.9, -0.15);
        group.add(leftEye);

        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.9, 0.9, 0.15);
        group.add(rightEye);

        // Thick legs
        const legGeometry = new THREE.CylinderGeometry(0.12, 0.1, 0.5, 8);
        const legMaterial = new THREE.MeshStandardMaterial({ color: bodyColor });

        // Front legs
        const frontLeftLeg = new THREE.Mesh(legGeometry, legMaterial);
        frontLeftLeg.position.set(0.3, 0.25, -0.3);
        group.add(frontLeftLeg);

        const frontRightLeg = new THREE.Mesh(legGeometry, legMaterial);
        frontRightLeg.position.set(0.3, 0.25, 0.3);
        group.add(frontRightLeg);

        // Back legs
        const backLeftLeg = new THREE.Mesh(legGeometry, legMaterial);
        backLeftLeg.position.set(-0.6, 0.25, -0.3);
        group.add(backLeftLeg);

        const backRightLeg = new THREE.Mesh(legGeometry, legMaterial);
        backRightLeg.position.set(-0.6, 0.25, 0.3);
        group.add(backRightLeg);

        // Small tail
        const tailGeometry = new THREE.SphereGeometry(0.08, 8, 8);
        const tail = new THREE.Mesh(tailGeometry, bodyMaterial);
        tail.position.set(-1.0, 0.5, 0);
        group.add(tail);

        // Add point light for dramatic effect
        const predatorLight = new THREE.PointLight(0xff4400, 1.5, 6);
        predatorLight.position.set(0.9, 0.9, 0);
        group.add(predatorLight);

        group.userData.type = 'bear';
        group.userData.legs = [frontLeftLeg, frontRightLeg, backLeftLeg, backRightLeg];

        return group;
    }

    spawnPredator(type, playerPosition) {
        // Remove any existing predator
        this.removePredator();

        this.activePredator = this.acquirePredator(type);
        const predator = this.activePredator;
        const isBear = predator.userData.type === 'bear';

        // Ambush from the player's view, not from a fixed world-space side. A
        // small offset keeps the animal three-quarter visible as it approaches.
        const forward = this.camera.getWorldDirection(new THREE.Vector3());
        forward.y = 0;
        if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
        forward.normalize();
        const right = new THREE.Vector3().crossVectors(forward, this.camera.up).normalize();
        const spawnDistance = isBear ? 6 : 6.8;

        predator.position.copy(playerPosition).setY(0);
        predator.position.addScaledVector(forward, spawnDistance);
        predator.position.addScaledVector(right, isBear ? -0.65 : 0.65);

        // Both the GLB templates and the rotated primitives face +Z, so a plain
        // lookAt makes the predator face the player.
        predator.lookAt(playerPosition.x, 0, playerPosition.z);

        if (!predator.parent) {
            this.scene.add(predator);
        }

        return predator;
    }

    animateAttack(targetPosition, duration, onComplete) {
        if (!this.activePredator) return;

        const startPosition = this.activePredator.position.clone();
        const targetGround = targetPosition.clone().setY(0);
        const approachDirection = targetGround.clone().sub(startPosition).setY(0).normalize();
        const isBear = this.activePredator.userData.type === 'bear';
        const rig = this.activePredator.userData.rig;
        const frontOffset = rig
            ? rig.box.max.z
            : (isBear ? 1.15 : 0.95);
        const stopDistance = Math.max(isBear ? 1.6 : 1.25, frontOffset + 0.6);
        const impactPosition = targetGround.clone().addScaledVector(approachDirection, -stopDistance);
        const approachPosition = startPosition.clone().lerp(impactPosition, 0.56);
        const impactHeight = isBear ? 0.12 : 0.32;
        const jumpHeight = isBear ? 0.42 : 0.95;
        const animalHeight = MODEL_SOURCES[this.activePredator.userData.type].height;

        const startTime = performance.now();
        const predator = this.activePredator;
        const inner = predator.userData.inner;
        const legs = predator.userData.legs || [];
        const cameraStartPosition = this.camera.position.clone();
        const cameraStartQuaternion = this.camera.quaternion.clone();
        const cameraTargetQuaternion = new THREE.Quaternion();
        const cameraFocus = new THREE.Vector3();
        let pounceProgress = 0;

        predator.scale.setScalar(1);

        const animate = () => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            if (progress < 0.62) {
                // Visible, measured approach with a smooth acceleration into the lunge.
                const stalkProgress = progress / 0.62;
                const easeProgress = stalkProgress * stalkProgress * (3 - 2 * stalkProgress);
                predator.position.lerpVectors(startPosition, approachPosition, easeProgress);
                predator.position.y = 0;

                if (rig) {
                    applyAttackPose(rig, progress, elapsed);
                } else if (legs.length) {
                    const walkCycle = elapsed * (isBear ? 0.008 : 0.011);
                    legs.forEach((leg, i) => {
                        leg.rotation.x = Math.sin(walkCycle + i * Math.PI / 2) * (isBear ? 0.22 : 0.3);
                    });
                } else if (inner) {
                    inner.rotation.z = Math.sin(elapsed * 0.012) * 0.04;
                }
            } else {
                // Fast lunge that stops outside the near clip instead of entering the camera.
                pounceProgress = (progress - 0.62) / 0.38;
                const easeProgress = 1 - Math.pow(1 - pounceProgress, 3);
                predator.position.lerpVectors(approachPosition, impactPosition, easeProgress);
                predator.position.y = impactHeight * easeProgress + Math.sin(pounceProgress * Math.PI) * jumpHeight;

                if (rig) {
                    applyAttackPose(rig, progress, elapsed);
                } else if (legs.length) {
                    legs.forEach((leg, i) => {
                        leg.rotation.x = i < 2 ? -0.8 : 0.5;
                    });
                } else if (inner) {
                    inner.rotation.z = 0;
                    inner.rotation.x = -Math.sin(pounceProgress * Math.PI) * (isBear ? 0.12 : 0.3);
                }
            }

            // Face target without pitching the animal's feet into the air.
            predator.lookAt(targetGround.x, predator.position.y, targetGround.z);

            // Cinematic reveal: turn toward the animal even if the player looked away.
            this.camera.position.copy(cameraStartPosition);
            cameraFocus.set(
                predator.position.x,
                animalHeight * 0.55 + predator.position.y * 0.2,
                predator.position.z
            );
            this.camera.lookAt(cameraFocus);
            cameraTargetQuaternion.copy(this.camera.quaternion);
            const revealProgress = THREE.MathUtils.smoothstep(progress, 0, 0.16);
            this.camera.quaternion.slerpQuaternions(
                cameraStartQuaternion,
                cameraTargetQuaternion,
                revealProgress
            );

            // Increasing shake through the lunge, settling as the animal makes contact.
            const lungeShake = pounceProgress > 0 ? Math.sin(pounceProgress * Math.PI) : 0;
            const strikeProgress = THREE.MathUtils.clamp((progress - 0.84) / 0.16, 0, 1);
            const strikeShake = progress > 0.84 ? Math.sin(strikeProgress * Math.PI) : 0;
            const shake = lungeShake * 0.012 + strikeShake * 0.035;
            this.camera.position.x += Math.sin(elapsed * 0.075) * shake;
            this.camera.position.y += Math.sin(elapsed * 0.093 + 1.4) * shake * 0.65;
            this.camera.rotateZ(Math.sin(elapsed * 0.061) * shake * 0.25);

            if (progress < 1) {
                this.attackAnimationId = requestAnimationFrame(animate);
            } else {
                this.attackAnimationId = null;
                if (onComplete) onComplete();
            }
        };

        animate();
    }

    removePredator() {
        if (this.attackAnimationId) {
            cancelAnimationFrame(this.attackAnimationId);
            this.attackAnimationId = null;
        }

        if (this.activePredator) {
            this.releasePredator(this.activePredator);
            this.activePredator = null;
        }
    }

    reset() {
        this.removePredator();
    }
}
