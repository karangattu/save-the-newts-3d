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
        lightColor: 0xffaa33,
        lightIntensity: 0.7,
        lightDistance: 4
    },
    bear: {
        url: 'assets/models/black-bear.glb',
        height: 1.8,
        lightColor: 0xff5533,
        lightIntensity: 1.0,
        lightDistance: 5
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
        const rig = rigStaticModel(this.modelTemplates[type], MODEL_SOURCES[type].height);
        inner.add(rig.inner);

        const config = MODEL_SOURCES[type];
        const light = new THREE.PointLight(config.lightColor, config.lightIntensity, config.lightDistance);
        light.position.set(0, config.height * 0.62, rig.box.max.z * 0.85 + 0.55);
        inner.add(light);

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

        // Position predator in the forest, facing player
        const spawnDistance = 8;
        const angle = Math.random() * Math.PI * 0.5 - Math.PI * 0.25; // Spread in front

        this.activePredator.position.set(
            playerPosition.x - spawnDistance,
            0,
            playerPosition.z + Math.sin(angle) * 3
        );

        // Both the GLB templates and the rotated primitives face +Z, so a plain
        // lookAt makes the predator face the player.
        this.activePredator.lookAt(playerPosition.x, 0, playerPosition.z);

        if (!this.activePredator.parent) {
            this.scene.add(this.activePredator);
        }

        return this.activePredator;
    }

    animateAttack(targetPosition, duration, onComplete) {
        if (!this.activePredator) return;

        const startPosition = this.activePredator.position.clone();
        const startTime = performance.now();
        const predator = this.activePredator;
        const inner = predator.userData.inner;
        const legs = predator.userData.legs || [];
        const rig = predator.userData.rig || null;

        const animate = () => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            if (progress < 0.6) {
                // Stalking phase - slow approach
                const stalkProgress = progress / 0.6;
                const easeProgress = stalkProgress * stalkProgress; // Ease in

                predator.position.lerpVectors(startPosition, targetPosition, easeProgress * 0.5);

                if (rig) {
                    applyAttackPose(rig, progress, elapsed);
                } else if (legs.length) {
                    // Leg animation - walking
                    const walkCycle = elapsed * 0.01;
                    legs.forEach((leg, i) => {
                        const offset = i * Math.PI / 2;
                        leg.rotation.x = Math.sin(walkCycle + offset) * 0.3;
                    });
                } else if (inner) {
                    // Low swagger for static GLB models
                    inner.rotation.z = Math.sin(elapsed * 0.012) * 0.06;
                }

                // Low crouch (the rig bends its own legs, so only dip shallowly)
                predator.position.y = rig ? -0.04 : -0.12;
            } else {
                // Pounce phase - fast lunge
                const pounceProgress = (progress - 0.6) / 0.4;
                const easeProgress = 1 - Math.pow(1 - pounceProgress, 3); // Ease out

                const midPoint = startPosition.clone().lerp(targetPosition, 0.5);

                predator.position.lerpVectors(midPoint, targetPosition, easeProgress);
                predator.position.y = Math.sin(pounceProgress * Math.PI) * 1.5;

                if (rig) {
                    applyAttackPose(rig, progress, elapsed);
                    // Strike punch: slight scale bump as the jaws land
                    const strike01 = THREE.MathUtils.clamp((progress - 0.76) / 0.2, 0, 1);
                    predator.scale.setScalar(1 + 0.14 * Math.sin(strike01 * Math.PI));
                } else if (legs.length) {
                    // Legs extended during pounce
                    legs.forEach((leg, i) => {
                        if (i < 2) {
                            leg.rotation.x = -0.8; // Front legs forward
                        } else {
                            leg.rotation.x = 0.5; // Back legs back
                        }
                    });
                } else if (inner) {
                    // Rear back before the hit
                    inner.rotation.z = 0;
                    inner.rotation.x = -Math.sin(pounceProgress * Math.PI) * 0.4;
                }
            }

            // Face target
            predator.lookAt(targetPosition.x, predator.position.y, targetPosition.z);

            if (progress < 1) {
                this.attackAnimationId = requestAnimationFrame(animate);
            } else {
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
