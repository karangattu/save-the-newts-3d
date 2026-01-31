// flashlight.js - Flashlight with battery drain and flicker effect
import * as THREE from 'three';

export class Flashlight {
    constructor(camera, scene) {
        this.camera = camera;
        this.scene = scene;
        
        // Battery properties
        this.battery = 100;
        this.baseDrainRate = 2; // % per second base rate
        this.drainMultiplier = 1;
        
        // Flashlight properties
        this.maxIntensity = 8;
        this.flickerThreshold = 20;
        this.isFlickering = false;
        this.flickerTimer = 0;
        
        this.init();
    }
    
    init() {
        // Main spotlight (flashlight beam)
        this.spotlight = new THREE.SpotLight(0xffffee, this.maxIntensity);
        this.spotlight.angle = 0.5;
        this.spotlight.penumbra = 0.4;
        this.spotlight.decay = 1.5;
        this.spotlight.distance = 60;
        this.spotlight.castShadow = true;
        
        // Shadow quality
        this.spotlight.shadow.mapSize.width = 1024;
        this.spotlight.shadow.mapSize.height = 1024;
        this.spotlight.shadow.camera.near = 0.5;
        this.spotlight.shadow.camera.far = 50;
        
        // Attach to camera
        this.camera.add(this.spotlight);
        this.spotlight.position.set(0, 0, 0);
        
        // Target for spotlight (points forward from camera)
        this.target = new THREE.Object3D();
        this.scene.add(this.target);
        this.spotlight.target = this.target;
        
        // Add camera to scene so spotlight moves with it
        this.scene.add(this.camera);
        
        // Small point light for close illumination
        this.fillLight = new THREE.PointLight(0xffffee, 0.8, 8);
        this.camera.add(this.fillLight);
        this.fillLight.position.set(0, 0, 0.5);
    }
    
    update(deltaTime, elapsedTime) {
        // Update drain multiplier based on elapsed time (gets harder)
        const elapsedMinutes = elapsedTime / 60;
        this.drainMultiplier = 1 + elapsedMinutes * 0.2;
        
        // Drain battery
        this.battery -= this.baseDrainRate * this.drainMultiplier * deltaTime;
        this.battery = Math.max(0, this.battery);
        
        // Update spotlight target (points where camera is looking)
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        this.target.position.copy(this.camera.position).add(direction.multiplyScalar(10));
        
        // Calculate intensity based on battery
        let intensity = (this.battery / 100) * this.maxIntensity;
        
        // Flicker effect when low battery
        if (this.battery < this.flickerThreshold && this.battery > 0) {
            this.flickerTimer += deltaTime;
            
            // Random flicker
            if (Math.random() < 0.1) {
                this.isFlickering = true;
            }
            
            if (this.isFlickering) {
                intensity *= Math.random() * 0.5 + 0.3;
                if (Math.random() < 0.3) {
                    this.isFlickering = false;
                }
            }
        }
        
        this.spotlight.intensity = intensity;
        this.fillLight.intensity = (this.battery / 100) * 0.8;
    }
    
    getBattery() {
        return this.battery;
    }
    
    isDead() {
        return this.battery <= 0;
    }
    
    isLowBattery() {
        return this.battery < this.flickerThreshold;
    }
    
    recharge(amount) {
        this.battery = Math.min(100, this.battery + amount);
    }
    
    // Get the spotlight for raycasting (newt detection)
    getSpotlight() {
        return this.spotlight;
    }
    
    // Check if a point is illuminated by the flashlight
    isPointIlluminated(point) {
        if (this.battery <= 0) return false;
        
        // Get flashlight direction
        const flashlightDir = new THREE.Vector3();
        this.camera.getWorldDirection(flashlightDir);
        
        // Get direction to point
        const toPoint = new THREE.Vector3();
        toPoint.subVectors(point, this.camera.position);
        const distance = toPoint.length();
        toPoint.normalize();
        
        // Check distance
        if (distance > this.spotlight.distance) return false;
        
        // Check angle
        const angle = flashlightDir.angleTo(toPoint);
        if (angle > this.spotlight.angle) return false;
        
        return true;
    }
    
    reset() {
        this.battery = 100;
        this.drainMultiplier = 1;
        this.isFlickering = false;
        this.flickerTimer = 0;
        this.spotlight.intensity = this.maxIntensity;
        this.fillLight.intensity = 0.3;
    }
}
