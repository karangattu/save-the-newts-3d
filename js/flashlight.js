// flashlight.js - Flashlight with battery drain and flicker effect
import * as THREE from 'three';

export class Flashlight {
    constructor(camera, scene, isMobile = false) {
        this.camera = camera;
        this.scene = scene;
        this.isMobile = isMobile;
        
        // Battery properties
        this.battery = 100;
        this.baseDrainRate = 2; // % per second base rate
        this.drainMultiplier = 1;
        
        // Flashlight properties - brighter on mobile for visibility
        this.maxIntensity = isMobile ? 14 : 8;
        this.flickerThreshold = 20;
        this.isFlickering = false;
        this.flickerTimer = 0;
        
        // Toggle state
        this.isOn = true;

        // External difficulty drain multiplier (for endless mode)
        this.externalDrainMultiplier = 1;

        // Rescue pulse
        this.rescuePulseTimer = 0;

        this.init();
    }
    
    init() {
        // Main spotlight (flashlight beam) - wider angle on mobile
        this.spotlight = new THREE.SpotLight(0xffffee, this.maxIntensity);
        this.spotlight.angle = this.isMobile ? 0.6 : 0.5;
        this.spotlight.penumbra = this.isMobile ? 0.5 : 0.4;
        this.spotlight.decay = this.isMobile ? 1.2 : 1.5;
        this.spotlight.distance = this.isMobile ? 70 : 60;
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
        
        // Only drain battery if flashlight is on
        if (this.isOn && this.battery > 0) {
            this.battery -= this.baseDrainRate * this.drainMultiplier * this.externalDrainMultiplier * deltaTime;
            this.battery = Math.max(0, this.battery);
        }
        
        // Update spotlight target (points where camera is looking)
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        this.target.position.copy(this.camera.position).add(direction.multiplyScalar(10));
        
        // Calculate intensity based on battery and on/off state
        let intensity = 0;
        if (this.isOn && this.battery > 0) {
            intensity = (this.battery / 100) * this.maxIntensity;
            
            // Flicker effect when low battery
            if (this.battery < this.flickerThreshold) {
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
        }
        
        // Rescue pulse: briefly brighten then lerp back
        if (this.rescuePulseTimer > 0) {
            this.rescuePulseTimer -= deltaTime;
            if (this.rescuePulseTimer <= 0) {
                this.rescuePulseTimer = 0;
            } else {
                // Override intensity with pulse
                intensity = Math.max(intensity, this.maxIntensity * (1 + 0.5 * (this.rescuePulseTimer / 0.2)));
            }
        }

        this.spotlight.intensity = intensity;
        this.fillLight.intensity = this.isOn && this.battery > 0 ? (this.battery / 100) * 0.8 : 0;
    }
    
    toggle() {
        this.isOn = !this.isOn;
        return this.isOn;
    }
    
    setOn(state) {
        this.isOn = state;
    }
    
    getIsOn() {
        return this.isOn;
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
        // Only illuminate if flashlight is on and has battery
        if (!this.isOn || this.battery <= 0) return false;
        
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
    
    setExternalDrainMultiplier(mult) {
        this.externalDrainMultiplier = mult;
    }

    pulseOnRescue() {
        this.rescuePulseTimer = 0.2;
    }

    reset() {
        this.battery = 100;
        this.drainMultiplier = 1;
        this.isFlickering = false;
        this.flickerTimer = 0;
        this.isOn = true; // Reset to on
        this.rescuePulseTimer = 0;
        this.spotlight.intensity = this.maxIntensity;
        this.fillLight.intensity = 0.8;
    }
}
