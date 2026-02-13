import * as THREE from 'three';

const _direction = new THREE.Vector3();
const _flashlightDir = new THREE.Vector3();
const _toPoint = new THREE.Vector3();
const _warmColor = new THREE.Color(0xffaa60);
const _normalColor = new THREE.Color(0xfff5e0);
const _coolColor = new THREE.Color(0xe0f0ff);

export class Flashlight {
    constructor(camera, scene, isMobile = false) {
        this.camera = camera;
        this.scene = scene;
        this.isMobile = isMobile;

        this.battery = 100;
        this.baseDrainRate = 2;
        this.drainMultiplier = 1;

        this.maxIntensity = isMobile ? 14 : 8;
        this.flickerThreshold = 20;
        this.isFlickering = false;
        this.flickerTimer = 0;

        this.isOn = true;

        this.externalDrainMultiplier = 1;

        this.rescuePulseTimer = 0;

        this.currentIntensity = this.maxIntensity;
        this.targetIntensity = this.maxIntensity;
        this.currentColorTemp = 0;
        this.qualityLevel = isMobile ? 1 : 3;

        this.init();
    }

    init() {
        this.spotlight = new THREE.SpotLight(0xfff5e0, this.maxIntensity);
        this.spotlight.angle = this.isMobile ? 0.6 : 0.5;
        this.spotlight.penumbra = this.isMobile ? 0.6 : 0.55;
        this.spotlight.decay = this.isMobile ? 1.0 : 1.3;
        this.spotlight.distance = this.isMobile ? 80 : 70;
        this.spotlight.castShadow = !this.isMobile;

        this.spotlight.shadow.mapSize.width = 512;
        this.spotlight.shadow.mapSize.height = 512;
        this.spotlight.shadow.camera.near = 1;
        this.spotlight.shadow.camera.far = 40;

        this.camera.add(this.spotlight);
        this.spotlight.position.set(0, 0, 0);

        this.target = new THREE.Object3D();
        this.scene.add(this.target);
        this.spotlight.target = this.target;

        this.scene.add(this.camera);

        this.fillLight = new THREE.PointLight(0xfff5e0, 0.8, 8);
        this.camera.add(this.fillLight);
        this.fillLight.position.set(0, 0, 0.5);

        this.outerGlow = new THREE.SpotLight(0xffe8c0, this.isMobile ? 3 : 2);
        this.outerGlow.angle = this.isMobile ? 0.85 : 0.75;
        this.outerGlow.penumbra = 1.0;
        this.outerGlow.decay = this.isMobile ? 1.8 : 2.0;
        this.outerGlow.distance = this.isMobile ? 35 : 30;
        this.outerGlow.castShadow = false;
        this.camera.add(this.outerGlow);
        this.outerGlow.position.set(0, 0, 0);
        this.outerGlow.target = this.target;

        if (!this.isMobile) {
            this.createVolumetricCone();
        }

        this.setQualityLevel(this.qualityLevel);
    }

    createVolumetricCone() {
        const coneLength = 15;
        const coneRadius = Math.tan(0.5) * coneLength;
        const coneGeo = new THREE.ConeGeometry(coneRadius, coneLength, 12, 1, true);
        coneGeo.rotateX(Math.PI / 2);
        coneGeo.translate(0, 0, -coneLength / 2);

        this.coneMaterial = new THREE.MeshBasicMaterial({
            color: 0xfff5e0,
            transparent: true,
            opacity: 0.035,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.FrontSide,
            fog: false
        });

        this.volumetricCone = new THREE.Mesh(coneGeo, this.coneMaterial);
        this.volumetricCone.frustumCulled = false;
        this.camera.add(this.volumetricCone);
    }

    update(deltaTime, elapsedTime) {
        const elapsedMinutes = elapsedTime / 60;
        this.drainMultiplier = 1 + elapsedMinutes * 0.2;

        if (this.isOn && this.battery > 0) {
            this.battery -= this.baseDrainRate * this.drainMultiplier * this.externalDrainMultiplier * deltaTime;
            if (this.battery < 0) this.battery = 0;
        }

        this.camera.getWorldDirection(_direction);
        this.target.position.copy(this.camera.position).add(_direction.multiplyScalar(10));

        this.targetIntensity = 0;
        if (this.isOn && this.battery > 0) {
            this.targetIntensity = (this.battery / 100) * this.maxIntensity;

            if (this.battery < this.flickerThreshold) {
                this.flickerTimer += deltaTime;
                const flickerNoise = Math.sin(this.flickerTimer * 25) * 0.3
                    + Math.sin(this.flickerTimer * 47) * 0.2
                    + Math.sin(this.flickerTimer * 13) * 0.15;
                const flickerFactor = 0.5 + flickerNoise * 0.5;

                if (Math.random() < 0.08) {
                    this.isFlickering = true;
                }

                if (this.isFlickering) {
                    this.targetIntensity *= flickerFactor > 0.1 ? flickerFactor : 0.1;
                    if (Math.random() < 0.25) {
                        this.isFlickering = false;
                    }
                }

                const t = deltaTime * 3;
                this.currentColorTemp += (1.0 - (this.battery / this.flickerThreshold) - this.currentColorTemp) * t;
            } else {
                this.currentColorTemp += (0 - this.currentColorTemp) * deltaTime * 5;
            }
        } else {
            this.currentColorTemp += (0 - this.currentColorTemp) * deltaTime * 5;
        }

        if (this.rescuePulseTimer > 0) {
            this.rescuePulseTimer -= deltaTime;
            if (this.rescuePulseTimer <= 0) {
                this.rescuePulseTimer = 0;
            } else {
                const pulseProgress = this.rescuePulseTimer / 0.35;
                const pulseTarget = this.maxIntensity * (1 + 0.8 * pulseProgress);
                if (pulseTarget > this.targetIntensity) this.targetIntensity = pulseTarget;
                this.currentColorTemp += (-0.3 - this.currentColorTemp) * pulseProgress * 0.5;
            }
        }

        const lerpSpeed = this.isFlickering ? 15 : 8;
        this.currentIntensity += (this.targetIntensity - this.currentIntensity) * deltaTime * lerpSpeed;

        this.spotlight.intensity = this.currentIntensity;

        const ct = this.currentColorTemp;
        if (ct > 0) {
            const clampedCt = ct > 1 ? 1 : ct;
            this.spotlight.color.copy(_normalColor).lerp(_warmColor, clampedCt);
        } else if (ct < 0) {
            const absCt = -ct > 1 ? 1 : -ct;
            this.spotlight.color.copy(_normalColor).lerp(_coolColor, absCt);
        } else {
            this.spotlight.color.copy(_normalColor);
        }

        this.fillLight.intensity = this.isOn && this.battery > 0 ? (this.battery / 100) * 0.8 : 0;
        this.fillLight.color.copy(this.spotlight.color);

        const glowBase = this.isMobile ? 3 : 2;
        const glowScale = this.qualityLevel <= 1 ? 0.45 : (this.qualityLevel === 2 ? 0.75 : 1);
        this.outerGlow.intensity = this.isOn && this.battery > 0
            ? (this.battery / 100) * glowBase * (this.currentIntensity / this.maxIntensity) * glowScale
            : 0;
        this.outerGlow.color.copy(this.spotlight.color);

        if (this.volumetricCone) {
            const baseOpacity = this.isOn && this.battery > 0
                ? 0.035 * (this.battery / 100) * (this.currentIntensity / this.maxIntensity)
                : 0;
            this.coneMaterial.opacity = this.qualityLevel <= 1 ? 0 : baseOpacity;
            this.coneMaterial.color.copy(this.spotlight.color);
            this.volumetricCone.visible = this.qualityLevel > 1 && baseOpacity > 0.001;
        }
    }

    setQualityLevel(level) {
        this.qualityLevel = Math.max(0, Math.min(3, level | 0));

        const shadowEnabled = !this.isMobile && this.qualityLevel >= 2;
        this.spotlight.castShadow = shadowEnabled;

        const shadowSize = this.qualityLevel <= 1 ? 256 : 512;
        this.spotlight.shadow.mapSize.width = shadowSize;
        this.spotlight.shadow.mapSize.height = shadowSize;

        this.outerGlow.distance = this.qualityLevel <= 1
            ? (this.isMobile ? 24 : 20)
            : (this.isMobile ? 35 : 30);

        if (this.volumetricCone) {
            this.volumetricCone.visible = this.qualityLevel > 1;
        }
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

    getSpotlight() {
        return this.spotlight;
    }

    isPointIlluminated(point) {
        if (!this.isOn || this.battery <= 0) return false;

        this.camera.getWorldDirection(_flashlightDir);

        _toPoint.subVectors(point, this.camera.position);
        const distance = _toPoint.length();

        if (distance > this.spotlight.distance) return false;

        _toPoint.divideScalar(distance);
        const angle = _flashlightDir.angleTo(_toPoint);
        return angle <= this.spotlight.angle;
    }

    setExternalDrainMultiplier(mult) {
        this.externalDrainMultiplier = mult;
    }

    pulseOnRescue() {
        this.rescuePulseTimer = 0.35;
    }

    reset() {
        this.battery = 100;
        this.drainMultiplier = 1;
        this.isFlickering = false;
        this.flickerTimer = 0;
        this.isOn = true;
        this.rescuePulseTimer = 0;
        this.currentIntensity = this.maxIntensity;
        this.targetIntensity = this.maxIntensity;
        this.currentColorTemp = 0;
        this.spotlight.intensity = this.maxIntensity;
        this.spotlight.color.setHex(0xfff5e0);
        this.fillLight.intensity = 0.8;
        this.outerGlow.intensity = this.isMobile ? 3 : 2;
        if (this.volumetricCone) {
            this.volumetricCone.visible = true;
            this.coneMaterial.opacity = 0.035;
        }
    }
}
