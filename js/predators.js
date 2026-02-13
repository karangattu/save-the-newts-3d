// predators.js - Mountain lion and bear 3D models and attack animations
import * as THREE from 'three';

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
    }

    prewarmPool() {
        if (this.predatorPool['mountain lion'].length === 0) {
            const lion = this.createMountainLion();
            lion.visible = false;
            this.scene.add(lion);
            this.predatorPool['mountain lion'].push(lion);
        }

        if (this.predatorPool.bear.length === 0) {
            const bear = this.createBear();
            bear.visible = false;
            this.scene.add(bear);
            this.predatorPool.bear.push(bear);
        }
    }

    acquirePredator(type) {
        const key = type === 'mountain lion' ? 'mountain lion' : 'bear';
        const pooled = this.predatorPool[key].pop();

        if (pooled) {
            pooled.visible = true;
            return pooled;
        }

        return key === 'mountain lion' ? this.createMountainLion() : this.createBear();
    }

    releasePredator(predator) {
        if (!predator) return;

        predator.visible = false;
        predator.position.set(0, 0, 0);
        predator.rotation.set(0, 0, 0);

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
        
        // Face the player
        this.activePredator.lookAt(playerPosition.x, 0, playerPosition.z);
        this.activePredator.rotation.y += Math.PI; // Flip to face player
        
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
        const legs = predator.userData.legs || [];
        
        // Animation phases: stalk -> pounce
        const stalkDuration = duration * 0.6;
        const pounceDuration = duration * 0.4;
        
        const animate = () => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            if (progress < 0.6) {
                // Stalking phase - slow approach
                const stalkProgress = progress / 0.6;
                const easeProgress = stalkProgress * stalkProgress; // Ease in
                
                predator.position.lerpVectors(startPosition, targetPosition, easeProgress * 0.5);
                
                // Leg animation - walking
                const walkCycle = elapsed * 0.01;
                legs.forEach((leg, i) => {
                    const offset = i * Math.PI / 2;
                    leg.rotation.x = Math.sin(walkCycle + offset) * 0.3;
                });
                
                // Low crouch
                predator.position.y = -0.1;
            } else {
                // Pounce phase - fast lunge
                const pounceProgress = (progress - 0.6) / 0.4;
                const easeProgress = 1 - Math.pow(1 - pounceProgress, 3); // Ease out
                
                const midPoint = startPosition.clone().lerp(targetPosition, 0.5);
                
                if (pounceProgress < 0.5) {
                    // Jump up
                    predator.position.lerpVectors(midPoint, targetPosition, easeProgress);
                    predator.position.y = Math.sin(pounceProgress * Math.PI) * 1.5;
                } else {
                    // Come down on target
                    predator.position.lerpVectors(midPoint, targetPosition, easeProgress);
                    predator.position.y = Math.sin(pounceProgress * Math.PI) * 1.5;
                }
                
                // Legs extended during pounce
                legs.forEach((leg, i) => {
                    if (i < 2) {
                        leg.rotation.x = -0.8; // Front legs forward
                    } else {
                        leg.rotation.x = 0.5; // Back legs back
                    }
                });
            }
            
            // Face target
            predator.lookAt(targetPosition.x, predator.position.y, targetPosition.z);
            predator.rotation.y += Math.PI;
            
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
