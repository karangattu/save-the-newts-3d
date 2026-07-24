// levels.js - Level management and scene generation for 3 levels
// All 3 levels share the same Alma Bridge Road curve (Lexington Reservoir area)
// Level 1: Clear night  |  Level 2: Just after sunset  |  Level 3: Rain & wind storm
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export class LevelManager {
    constructor(scene, camera, renderer, isMobile = false) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.isMobile = isMobile;
        this.currentLevel = 1;

        this.levelObjects = [];
        this.roadCurve = null;
        this.dangerZones = null;
        this.roadBounds = null;

        // Quality scaling (1 = low, 2 = medium, 3 = high)
        this.qualityLevel = isMobile ? 1 : 3;
        this.rainUpdateInterval = 3;
        this.rainActiveFraction = 1;
        this.rainFrameCounter = 0;
        this.setQualityLevel(this.qualityLevel);

        // Rain system
        this.rain = null;
        this.rainGeometry = null;
        this.rainVelocities = null;

        // Wind for level 3
        this.windStrength = 0;
        this.weatherTime = 0;
        this.weatherTransition = null;
        this.targetFogDensity = 0;
        this.targetWindStrength = 0;
        this.windDirection = new THREE.Vector3(1, 0, 0.3);
        this.windTime = 0;

        this.splashParticles = [];
        this.puddlePositions = [];

        // Western Toads & Moths
        this.westernToads = [];
        this.moths = [];

        // Textures created for the active level (disposed on clear)
        this._levelTextures = [];

        // Scratch objects to avoid per-frame allocations
        this._scratchMatrix = new THREE.Matrix4();
        this._scratchQuat = new THREE.Quaternion();
        this._scratchEuler = new THREE.Euler();
        this._scratchPos = new THREE.Vector3();
        this._scratchScale = new THREE.Vector3();
    }

    setQualityLevel(level) {
        this.qualityLevel = Math.max(1, Math.min(3, level | 0));

        if (this.qualityLevel === 1) {
            this.rainUpdateInterval = 5;
            this.rainActiveFraction = 0.45;
        } else if (this.qualityLevel === 2) {
            this.rainUpdateInterval = 4;
            this.rainActiveFraction = 0.7;
        } else {
            this.rainUpdateInterval = 3;
            this.rainActiveFraction = 1;
        }

        this.applyRainQuality();
    }

    getScaledCount(count) {
        const scale = this.qualityLevel <= 1 ? 0.5 : (this.qualityLevel === 2 ? 0.7 : 1);
        return Math.max(1, Math.round(count * scale));
    }

    applyRainQuality() {
        if (!this.rainGeometry) return;
        const count = this.rainGeometry.attributes.position.count;
        const activeVertices = Math.floor((count * this.rainActiveFraction) / 2) * 2;
        this.rainGeometry.setDrawRange(0, activeVertices);
    }
    
    loadLevel(levelNum) {
        const previousBackground = this.scene.background && this.scene.background.isColor
            ? this.scene.background.clone()
            : null;
        const previousFogColor = this.scene.fog ? this.scene.fog.color.clone() : null;
        const previousFogDensity = this.scene.fog && this.scene.fog.isFogExp2
            ? this.scene.fog.density
            : 0;

        this.currentLevel = levelNum;
        document.body.dataset.level = String(levelNum);
        this.clearLevel();
        
        if (levelNum === 1) {
            this.createLevel1();
        } else if (levelNum === 2) {
            this.createLevel2();
        } else if (levelNum === 3) {
            this.createLevel3();
        }

        this.targetFogDensity = this.scene.fog && this.scene.fog.isFogExp2
            ? this.scene.fog.density
            : 0;
        this.targetWindStrength = this.windStrength;

        if (previousBackground && previousFogColor && this.scene.fog && this.scene.fog.isFogExp2) {
            const targetBackground = this.scene.background.clone();
            const targetFogColor = this.scene.fog.color.clone();
            this.scene.background.copy(previousBackground);
            this.scene.fog.color.copy(previousFogColor);
            this.scene.fog.density = previousFogDensity;
            this.windStrength = 0;

            let rainOpacity = 0;
            if (this.rain && this.rain.material) {
                rainOpacity = this.rain.material.opacity;
                this.rain.material.opacity = 0;
            }

            this.weatherTransition = {
                elapsed: 0,
                duration: 4,
                fromBackground: previousBackground,
                toBackground: targetBackground,
                fromFogColor: previousFogColor,
                toFogColor: targetFogColor,
                fromFogDensity: previousFogDensity,
                toFogDensity: this.targetFogDensity,
                rainOpacity
            };
        } else {
            this.weatherTransition = null;
        }
        
        return {
            roadCurve: this.roadCurve,
            dangerZones: this.dangerZones,
            roadBounds: this.roadBounds
        };
    }
    
    clearLevel() {
        this.levelObjects.forEach(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => m.dispose());
                } else {
                    obj.material.dispose();
                }
            }
            this.scene.remove(obj);
        });
        this.levelObjects = [];

        this._levelTextures.forEach(tex => tex.dispose());
        this._levelTextures = [];
        
        if (this.rain) {
            this.scene.remove(this.rain);
            this.rain = null;
        }
        
        this.splashParticles.forEach(splash => this.scene.remove(splash));
        this.splashParticles = [];
        this.westernToads = [];
        this.moths = [];
        this.mothBodies = null;
        this.mothLeftWings = null;
        this.mothRightWings = null;
        this._stormWater = null;
        this.windStrength = 0;
    }

    updateWeather(deltaTime) {
        this.weatherTime += deltaTime;

        if (this.weatherTransition) {
            const transition = this.weatherTransition;
            transition.elapsed += deltaTime;
            const linear = Math.min(transition.elapsed / transition.duration, 1);
            const blend = linear * linear * (3 - 2 * linear);

            this.scene.background.lerpColors(transition.fromBackground, transition.toBackground, blend);
            this.scene.fog.color.lerpColors(transition.fromFogColor, transition.toFogColor, blend);
            this.scene.fog.density = THREE.MathUtils.lerp(
                transition.fromFogDensity,
                transition.toFogDensity,
                blend
            );
            this.windStrength = this.targetWindStrength * blend;
            if (this.rain && this.rain.material) {
                this.rain.material.opacity = transition.rainOpacity * blend;
            }

            if (linear >= 1) this.weatherTransition = null;
            return;
        }

        if (this.scene.fog && this.scene.fog.isFogExp2 && this.targetFogDensity > 0) {
            const variation = this.currentLevel === 3
                ? Math.sin(this.weatherTime * 0.22) * 0.04
                : Math.sin(this.weatherTime * 0.08) * 0.015;
            this.scene.fog.density = this.targetFogDensity * (1 + variation);
        }
    }
    
    // ==================== ALMA BRIDGE ROAD CURVE (same for all 3 levels) ====================
    createAlmaBridgeRoadCurve() {
        const roadLength = 300;
        // S-curves matching Alma Bridge Rd near Lexington Reservoir from the map
        const curvePoints = [
            new THREE.Vector3(-15, 0, -roadLength / 2),
            new THREE.Vector3(-8,  0, -roadLength / 2 + 30),
            new THREE.Vector3(2,   0, -roadLength / 2 + 60),
            new THREE.Vector3(10,  0, -roadLength / 2 + 90),
            new THREE.Vector3(6,   0, -roadLength / 2 + 120),
            new THREE.Vector3(-2,  0, -roadLength / 2 + 150),
            new THREE.Vector3(-8,  0, -roadLength / 2 + 180),
            new THREE.Vector3(-4,  0, -roadLength / 2 + 210),
            new THREE.Vector3(5,   0, -roadLength / 2 + 240),
            new THREE.Vector3(12,  0, -roadLength / 2 + 270),
            new THREE.Vector3(8,   0, roadLength / 2),
        ];
        this.roadCurve = new THREE.CatmullRomCurve3(curvePoints);
        this.roadCurve.tension = 0.4;
        return this.roadCurve;
    }
    
    createRibbonGeometry(curve, width, segments = 200) {
        const vertices = [];
        const indices = [];
        const uvs = [];
        
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const point = curve.getPoint(t);
            const tangent = curve.getTangent(t);
            const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
            
            const leftPoint = point.clone().add(normal.clone().multiplyScalar(-width / 2));
            const rightPoint = point.clone().add(normal.clone().multiplyScalar(width / 2));
            
            vertices.push(leftPoint.x, leftPoint.y, leftPoint.z);
            vertices.push(rightPoint.x, rightPoint.y, rightPoint.z);
            uvs.push(0, t);
            uvs.push(1, t);
            
            if (i < segments) {
                const base = i * 2;
                indices.push(base, base + 1, base + 2);
                indices.push(base + 1, base + 3, base + 2);
            }
        }
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        return geometry;
    }

    // ==================== PROCEDURAL TEXTURES ====================
    // Asphalt with baked edge lines + center dashes. One canvas tile covers 15m
    // of road (texture repeats along its length), so paint one dash per tile.
    createAsphaltTexture(wetness = 0) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Base asphalt
        const base = wetness > 0 ? 18 : 26;
        ctx.fillStyle = `rgb(${base},${base},${base + 2})`;
        ctx.fillRect(0, 0, 256, 512);

        // Aggregate speckle
        for (let i = 0; i < 2600; i++) {
            const g = base + (Math.random() * 28 - 10);
            ctx.fillStyle = `rgba(${g | 0},${g | 0},${(g + 3) | 0},${0.35 + Math.random() * 0.4})`;
            ctx.fillRect(Math.random() * 256, Math.random() * 512, 1.5, 1.5);
        }

        // Darker tire-polished wheel tracks (lanes at ±3m, wheels ~±0.8m apart)
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        [[0.155, 0.075], [0.27, 0.075], [0.655, 0.075], [0.77, 0.075]].forEach(([u, w]) => {
            ctx.fillRect(u * 256, 0, w * 256, 512);
        });

        // Occasional cracks / tar snakes
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            let x = Math.random() * 256;
            ctx.moveTo(x, Math.random() * 512);
            for (let s = 0; s < 6; s++) {
                x += (Math.random() - 0.5) * 30;
                ctx.lineTo(x, Math.random() * 512);
            }
            ctx.stroke();
        }

        // White edge lines (0.5m in from each 6m edge => u = 0.5/12)
        const edgeU = (0.5 / 12) * 256;
        const lineW = Math.max(2, (0.15 / 12) * 256);
        ctx.fillStyle = wetness > 0 ? 'rgba(220,220,215,0.85)' : 'rgba(235,235,230,0.95)';
        ctx.fillRect(edgeU - lineW / 2, 0, lineW, 512);
        ctx.fillRect(256 - edgeU - lineW / 2, 0, lineW, 512);

        // Yellow center dash: 7.5m dash inside the 15m tile
        const dashW = Math.max(2.5, (0.15 / 12) * 256);
        ctx.fillStyle = wetness > 0 ? 'rgba(200,160,30,0.8)' : 'rgba(255,204,0,0.92)';
        ctx.fillRect(128 - dashW / 2, 0, dashW, 256);

        // Baked wear: faint repair strip, skid marks, and aggregate shadows.
        // These add visual richness without extra meshes or draw calls.
        ctx.fillStyle = wetness > 0 ? 'rgba(80,95,110,0.16)' : 'rgba(110,110,105,0.12)';
        ctx.fillRect(86, 0, 18, 512);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(42, 120, 8, 190);
        ctx.fillRect(205, 350, 7, 125);
        ctx.strokeStyle = 'rgba(210,210,200,0.18)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
            const y = 55 + i * 105;
            ctx.beginPath();
            ctx.moveTo(25, y);
            ctx.lineTo(65, y + 4);
            ctx.lineTo(100, y - 2);
            ctx.stroke();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 20); // 300m road / 15m tile
        texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        texture.colorSpace = THREE.SRGBColorSpace;
        this._levelTextures.push(texture);
        return texture;
    }

    createGrassTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#0a160a';
        ctx.fillRect(0, 0, 256, 256);

        // Mottled patches
        for (let i = 0; i < 900; i++) {
            const g = 14 + Math.random() * 22;
            ctx.fillStyle = `rgba(${(g * 0.5) | 0},${g | 0},${(g * 0.45) | 0},${0.25 + Math.random() * 0.5})`;
            const r = 2 + Math.random() * 7;
            ctx.beginPath();
            ctx.arc(Math.random() * 256, Math.random() * 256, r, 0, Math.PI * 2);
            ctx.fill();
        }

        // Grass blade strokes
        ctx.strokeStyle = 'rgba(30,52,26,0.5)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 700; i++) {
            const x = Math.random() * 256;
            const y = Math.random() * 256;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + (Math.random() - 0.5) * 3, y - 2 - Math.random() * 4);
            ctx.stroke();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(8, 30);
        texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        texture.colorSpace = THREE.SRGBColorSpace;
        this._levelTextures.push(texture);
        return texture;
    }

    createRockTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#3d3a38';
        ctx.fillRect(0, 0, 256, 256);

        // Layered sediment bands
        for (let y = 0; y < 256; y += 8 + Math.random() * 18) {
            const g = 45 + Math.random() * 30;
            ctx.fillStyle = `rgba(${g | 0},${(g * 0.95) | 0},${(g * 0.88) | 0},0.6)`;
            ctx.fillRect(0, y, 256, 4 + Math.random() * 10);
        }

        // Noise + vertical striations
        for (let i = 0; i < 1200; i++) {
            const g = 35 + Math.random() * 45;
            ctx.fillStyle = `rgba(${g | 0},${g | 0},${g | 0},${0.2 + Math.random() * 0.35})`;
            ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2 + Math.random() * 8);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(12, 2);
        texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        texture.colorSpace = THREE.SRGBColorSpace;
        this._levelTextures.push(texture);
        return texture;
    }

    // ==================== ROAD SIGNS ====================
    createStopSign(x, z, facingAngle = 0) {
        const group = new THREE.Group();
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 2.2, 8),
            new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6, roughness: 0.3 })
        );
        pole.position.y = 1.1;
        group.add(pole);

        // Octagonal stop sign
        const shape = new THREE.Shape();
        const sides = 8;
        const radius = 0.35;
        for (let i = 0; i < sides; i++) {
            const angle = (i / sides) * Math.PI * 2 - Math.PI / 8;
            const px = Math.cos(angle) * radius;
            const py = Math.sin(angle) * radius;
            if (i === 0) shape.moveTo(px, py); else shape.lineTo(px, py);
        }
        shape.closePath();
        const signGeo = new THREE.ShapeGeometry(shape);
        const signMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, emissive: 0x330000, emissiveIntensity: 0.3, roughness: 0.5, side: THREE.DoubleSide });
        const sign = new THREE.Mesh(signGeo, signMat);
        sign.position.y = 2.0;
        group.add(sign);

        // White border
        const innerShape = new THREE.Shape();
        const ir = 0.28;
        for (let i = 0; i < sides; i++) {
            const angle = (i / sides) * Math.PI * 2 - Math.PI / 8;
            const px = Math.cos(angle) * ir;
            const py = Math.sin(angle) * ir;
            if (i === 0) innerShape.moveTo(px, py); else innerShape.lineTo(px, py);
        }
        innerShape.closePath();
        const border = new THREE.Mesh(
            new THREE.ShapeGeometry(innerShape),
            new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222222, emissiveIntensity: 0.2, side: THREE.DoubleSide })
        );
        border.position.set(0, 2.0, 0.01);
        group.add(border);

        // Simplified STOP text bars
        const tb = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x444444, emissiveIntensity: 0.3 });
        [[-0.12, 2.03], [-0.12, 1.97], [-0.02, 2.04]].forEach(([x2, y2]) => {
            const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.01), tb);
            bar.position.set(x2, y2, 0.02);
            group.add(bar);
        });
        const vert = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.01), tb);
        vert.position.set(-0.02, 2.0, 0.02);
        group.add(vert);

        // Reflective strip on pole
        const strip = new THREE.Mesh(
            new THREE.CylinderGeometry(0.045, 0.045, 0.05, 8),
            new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 })
        );
        strip.position.y = 0.3;
        group.add(strip);

        group.position.set(x, 0, z);
        group.rotation.y = facingAngle;
        this.scene.add(group);
        this.levelObjects.push(group);
    }

    createNewtCrossingSign(x, z, facingAngle = 0) {
        const group = new THREE.Group();
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 2.2, 8),
            new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6, roughness: 0.3 })
        );
        pole.position.y = 1.1;
        group.add(pole);

        // Diamond warning sign
        const signGeo = new THREE.PlaneGeometry(0.6, 0.6);
        const signMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0x554400, emissiveIntensity: 0.4, roughness: 0.4, side: THREE.DoubleSide });
        const sign = new THREE.Mesh(signGeo, signMat);
        sign.position.y = 2.0;
        sign.rotation.z = Math.PI / 4;
        group.add(sign);

        // Newt silhouette on sign
        const newtMat = new THREE.MeshStandardMaterial({ color: 0x111111, side: THREE.DoubleSide });
        const newtBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.12, 4, 6), newtMat);
        newtBody.rotation.z = Math.PI / 2;
        newtBody.position.set(0, 2.0, 0.02);
        group.add(newtBody);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), newtMat);
        head.position.set(0.08, 2.0, 0.02);
        group.add(head);
        const tail = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4), newtMat);
        tail.rotation.z = Math.PI / 2;
        tail.position.set(-0.1, 2.0, 0.02);
        group.add(tail);
        [[0.04, 1.97], [-0.04, 1.97], [0.04, 2.03], [-0.04, 2.03]].forEach(([lx, ly]) => {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.04, 0.01), newtMat);
            leg.position.set(lx, ly, 0.02);
            group.add(leg);
        });

        // Sub-sign plate
        const subSign = new THREE.Mesh(
            new THREE.PlaneGeometry(0.5, 0.15),
            new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0x332200, emissiveIntensity: 0.3, roughness: 0.4, side: THREE.DoubleSide })
        );
        subSign.position.y = 1.55;
        group.add(subSign);

        const strip = new THREE.Mesh(
            new THREE.CylinderGeometry(0.045, 0.045, 0.05, 8),
            new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 })
        );
        strip.position.y = 0.3;
        group.add(strip);

        group.position.set(x, 0, z);
        group.rotation.y = facingAngle;
        this.scene.add(group);
        this.levelObjects.push(group);
    }

    createWarningSign(x, z) {
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8),
            new THREE.MeshStandardMaterial({ color: 0x444444 })
        );
        pole.position.set(x, 0.6, z);
        this.scene.add(pole);
        this.levelObjects.push(pole);
        const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(0.6, 0.4),
            new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0x332200, emissiveIntensity: 0.3 })
        );
        sign.position.set(x - 0.01, 1.1, z);
        sign.rotation.y = Math.PI / 2;
        this.scene.add(sign);
        this.levelObjects.push(sign);
    }

    placeRoadSigns() {
        if (!this.roadCurve) return;
        const roadWidth = 12;

        // Track sign groups so they can be merged into a handful of draw calls
        const signStart = this.levelObjects.length;

        // Newt crossing signs along road
        for (let i = 0; i < 6; i++) {
            const t = 0.1 + (i * 0.15);
            if (t > 0.95) break;
            const point = this.roadCurve.getPoint(t);
            const tangent = this.roadCurve.getTangent(t);
            const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
            const facingAngle = Math.atan2(tangent.x, tangent.z);
            const side = i % 2 === 0 ? -1 : 1;
            const signPos = point.clone().add(normal.clone().multiplyScalar(side * (roadWidth / 2 + 1.5)));
            this.createNewtCrossingSign(signPos.x, signPos.z, facingAngle + (side > 0 ? 0 : Math.PI));
        }

        // Stop signs near road ends
        const sp = this.roadCurve.getPoint(0.03);
        const st = this.roadCurve.getTangent(0.03);
        const sn = new THREE.Vector3(-st.z, 0, st.x).normalize();
        const sa = Math.atan2(st.x, st.z);
        const sp1 = sp.clone().add(sn.clone().multiplyScalar(roadWidth / 2 + 1.5));
        this.createStopSign(sp1.x, sp1.z, sa);

        const ep = this.roadCurve.getPoint(0.97);
        const et = this.roadCurve.getTangent(0.97);
        const en = new THREE.Vector3(-et.z, 0, et.x).normalize();
        const ea = Math.atan2(et.x, et.z);
        const sp2 = ep.clone().add(en.clone().multiplyScalar(-roadWidth / 2 - 1.5));
        this.createStopSign(sp2.x, sp2.z, ea + Math.PI);

        // Cliff warning signs
        for (let z = -120; z <= 120; z += 40) {
            this.createWarningSign(20, z);
        }

        this.mergeStaticObjects(this.levelObjects.splice(signStart));
    }

    // Merge a set of static groups/meshes into one mesh per material, removing
    // ~90 draw calls worth of road signs down to a small handful.
    mergeStaticObjects(objects) {
        const buckets = new Map(); // materialKey -> { material, geometries }
        const originalGeometries = new Set();
        const originalMaterials = new Set();

        objects.forEach(obj => {
            obj.updateMatrixWorld(true);
            obj.traverse(child => {
                if (!child.isMesh) return;
                const mat = child.material;
                const key = [
                    mat.color.getHex(), mat.emissive ? mat.emissive.getHex() : 0,
                    mat.emissiveIntensity || 0, mat.roughness, mat.metalness,
                    mat.side, !!mat.transparent, mat.opacity
                ].join('|');

                originalGeometries.add(child.geometry);
                originalMaterials.add(mat);
                const geo = child.geometry.clone().applyMatrix4(child.matrixWorld);
                if (!buckets.has(key)) buckets.set(key, { material: mat, geometries: [] });
                buckets.get(key).geometries.push(geo);
            });
            this.scene.remove(obj);
        });

        originalGeometries.forEach(g => g.dispose());

        const usedMaterials = new Set();
        buckets.forEach(({ material, geometries }) => {
            const merged = mergeGeometries(geometries, false);
            geometries.forEach(g => g.dispose());
            if (!merged) return;
            usedMaterials.add(material);
            const mesh = new THREE.Mesh(merged, material);
            this.scene.add(mesh);
            this.levelObjects.push(mesh);
        });

        // Dispose duplicate material instances not used by merged meshes
        originalMaterials.forEach(m => {
            if (!usedMaterials.has(m)) m.dispose();
        });
    }
    
    // ==================== SHARED ROAD CREATION ====================
    createRoad(wetness = 0) {
        const roadWidth = 12;
        this.createAlmaBridgeRoadCurve();
        this.precomputeRoadData();

        const roadGeometry = this.createRibbonGeometry(this.roadCurve, roadWidth, 250);
        const roadOptions = {
            map: this.createAsphaltTexture(wetness),
            roughness: wetness > 0 ? 0.2 : 0.55,
            metalness: wetness > 0 ? 0.28 : 0.05,
            side: THREE.DoubleSide
        };
        if (wetness > 0) {
            roadOptions.clearcoat = 0.85;
            roadOptions.clearcoatRoughness = 0.18;
            roadOptions.reflectivity = 0.75;
        }
        const roadMaterial = wetness > 0
            ? new THREE.MeshPhysicalMaterial(roadOptions)
            : new THREE.MeshStandardMaterial(roadOptions);

        const road = new THREE.Mesh(roadGeometry, roadMaterial);
        road.position.y = 0.01;
        road.receiveShadow = !this.isMobile;
        this.scene.add(road);
        this.levelObjects.push(road);

        this.createRoadReflectors(roadWidth);
        this.createDelineatorPosts(roadWidth);
        this.createRoadsideDecals();

        const roadLength = 300;
        this.roadBounds = {
            minX: -40,
            maxX: 35,
            minZ: -roadLength / 2 + 10,
            maxZ: roadLength / 2 - 10
        };
        this.dangerZones = { forest: -12, cliff: 14 };
    }

    // A few shared, low-poly roadside props provide scale and navigation cues.
    // Instancing keeps this to two draw calls and they are reused every level.
    createRoadsideDecals() {
        const count = this.getScaledCount(10);
        const geo = new THREE.BoxGeometry(0.08, 0.7, 0.35);
        const mat = new THREE.MeshStandardMaterial({
            color: 0xd85b27,
            emissive: 0x481508,
            emissiveIntensity: 0.45,
            roughness: 0.75
        });
        const mesh = new THREE.InstancedMesh(geo, mat, count);
        const matrix = new THREE.Matrix4();
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scale = new THREE.Vector3(1, 1, 1);
        for (let i = 0; i < count; i++) {
            const data = this.getRoadDataAtT(0.05 + (i / count) * 0.9);
            pos.copy(data.point).addScaledVector(data.normal, 7.2 + (i % 2) * 0.6);
            pos.y = 0.35;
            quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(data.tangent.x, data.tangent.z));
            matrix.compose(pos, quat, scale);
            mesh.setMatrixAt(i, matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        this.scene.add(mesh);
        this.levelObjects.push(mesh);
    }

    // Raised pavement markers ("Botts' dots") along both edge lines — they catch
    // the flashlight/headlights and make the night road readable. One instanced
    // mesh for the whole road => a single draw call.
    createRoadReflectors(roadWidth) {
        const spacing = 0.025; // ~7.5m along the curve
        const count = Math.floor(1 / spacing) * 2;
        const geo = new THREE.BoxGeometry(0.1, 0.025, 0.1);
        const mat = new THREE.MeshStandardMaterial({
            color: 0xbbbbbb,
            roughness: 0.15,
            metalness: 0.9,
            emissive: 0x2a2a22,
            emissiveIntensity: 0.6
        });
        const mesh = new THREE.InstancedMesh(geo, mat, count);
        mesh.receiveShadow = false;

        const matrix = this._scratchMatrix;
        const quat = this._scratchQuat.identity();
        const scale = this._scratchScale.set(1, 1, 1);
        const pos = this._scratchPos;

        let idx = 0;
        for (let side = -1; side <= 1 && idx < count; side += 2) {
            for (let i = 0; i < count / 2 && idx < count; i++) {
                const t = i * spacing;
                if (t > 1) break;
                const data = this.getRoadDataAtT(t);
                pos.copy(data.point).addScaledVector(data.normal, side * (roadWidth / 2 - 0.9));
                pos.y = 0.02;
                matrix.compose(pos, quat, scale);
                mesh.setMatrixAt(idx++, matrix);
            }
        }
        mesh.count = idx;
        mesh.instanceMatrix.needsUpdate = true;
        this.scene.add(mesh);
        this.levelObjects.push(mesh);
    }

    // White delineator posts with amber reflectors along the cliff edge — the
    // classic mountain-road cue, and a strong depth cue at night.
    createDelineatorPosts(roadWidth) {
        const spacing = 0.04; // ~12m
        const count = Math.floor(1 / spacing);

        const postGeo = new THREE.BoxGeometry(0.09, 1.0, 0.09);
        postGeo.translate(0, 0.5, 0);
        const postMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.6, metalness: 0.2 });
        const posts = new THREE.InstancedMesh(postGeo, postMat, count);

        const capGeo = new THREE.BoxGeometry(0.11, 0.14, 0.04);
        capGeo.translate(0, 0.88, 0);
        const capMat = new THREE.MeshStandardMaterial({
            color: 0xcc8833,
            emissive: 0xcc7722,
            emissiveIntensity: 0.55,
            roughness: 0.2,
            metalness: 0.6
        });
        const caps = new THREE.InstancedMesh(capGeo, capMat, count);

        const matrix = this._scratchMatrix;
        const quat = this._scratchQuat;
        const euler = this._scratchEuler;
        const scale = this._scratchScale.set(1, 1, 1);
        const pos = this._scratchPos;

        let idx = 0;
        for (let i = 0; i < count; i++) {
            const t = 0.02 + i * spacing;
            if (t > 0.98) break;
            const data = this.getRoadDataAtT(t);
            pos.copy(data.point).addScaledVector(data.normal, roadWidth / 2 + 1.2);
            pos.y = 0;
            euler.set(0, Math.atan2(data.tangent.x, data.tangent.z), 0);
            quat.setFromEuler(euler);
            matrix.compose(pos, quat, scale);
            posts.setMatrixAt(idx, matrix);
            caps.setMatrixAt(idx, matrix);
            idx++;
        }
        posts.count = idx;
        caps.count = idx;
        posts.instanceMatrix.needsUpdate = true;
        caps.instanceMatrix.needsUpdate = true;
        this.scene.add(posts, caps);
        this.levelObjects.push(posts, caps);
    }

    // O(1) lookup by curve parameter using the precomputed road table.
    getRoadDataAtT(t) {
        const data = this.precomputedRoadData;
        if (!data || data.length === 0) {
            return this.getRoadDataAtZ(0);
        }
        const idx = Math.max(0, Math.min(data.length - 1, Math.round(t * (data.length - 1))));
        return data[idx];
    }
    
    // ==================== SHARED ENVIRONMENT ====================
    createCliff() {
        const cliffLength = 300;
        const cliffFace = new THREE.Mesh(
            new THREE.PlaneGeometry(cliffLength, 30),
            new THREE.MeshStandardMaterial({ map: this.createRockTexture(), roughness: 1.0 })
        );
        cliffFace.rotation.y = -Math.PI / 2;
        cliffFace.position.set(28, -15, 0);
        this.scene.add(cliffFace);
        this.levelObjects.push(cliffFace);

        const water = new THREE.Mesh(
            new THREE.PlaneGeometry(100, 300),
            new THREE.MeshStandardMaterial({ color: 0x1a3d5c, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.9 })
        );
        water.rotation.x = -Math.PI / 2;
        water.position.set(80, -28, 0);
        this.scene.add(water);
        this.levelObjects.push(water);
    }

    createGrass(color = 0x0a1a0a) {
        const grassGeo = new THREE.PlaneGeometry(80, 300);
        const grassMat = new THREE.MeshStandardMaterial({
            map: this.createGrassTexture(),
            color: color,
            roughness: 1.0
        });

        const leftGrass = new THREE.Mesh(grassGeo, grassMat);
        leftGrass.rotation.x = -Math.PI / 2;
        leftGrass.position.set(-45, -0.01, 0);
        this.scene.add(leftGrass);
        this.levelObjects.push(leftGrass);

        const rightGrass = new THREE.Mesh(grassGeo, grassMat);
        rightGrass.rotation.x = -Math.PI / 2;
        rightGrass.position.set(45, -0.01, 0);
        this.scene.add(rightGrass);
        this.levelObjects.push(rightGrass);
    }

    // Two low-cost instanced layers break up the empty cliff side and give the
    // fog silhouettes at multiple depths to work against.
    createEnvironmentLayers() {
        const rockCount = this.getScaledCount(22);
        const rockGeo = new THREE.DodecahedronGeometry(1, 0);
        const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0.02 });
        const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);

        const matrix = this._scratchMatrix;
        const quat = this._scratchQuat;
        const euler = this._scratchEuler;
        const pos = this._scratchPos;
        const scale = this._scratchScale;
        const color = new THREE.Color();

        for (let i = 0; i < rockCount; i++) {
            const data = this.getRoadDataAtT((i + 0.5) / rockCount);
            pos.copy(data.point).addScaledVector(data.normal, 10 + Math.random() * 8);
            pos.y = 0.25 + Math.random() * 0.35;
            euler.set(Math.random() * 0.35, Math.random() * Math.PI, Math.random() * 0.25);
            quat.setFromEuler(euler);
            scale.set(0.7 + Math.random() * 1.4, 0.45 + Math.random() * 0.8, 0.8 + Math.random() * 1.8);
            matrix.compose(pos, quat, scale);
            rocks.setMatrixAt(i, matrix);
            const shade = 0.045 + Math.random() * 0.035;
            color.setRGB(shade, shade * 0.95, shade * 0.9);
            rocks.setColorAt(i, color);
        }
        rocks.instanceMatrix.needsUpdate = true;
        if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;

        const ridgeCount = this.getScaledCount(12);
        const ridgeGeo = new THREE.ConeGeometry(1, 1, 6);
        const ridgeMat = new THREE.MeshStandardMaterial({
            color: this.currentLevel === 2 ? 0x100912 : 0x05080c,
            roughness: 1,
            flatShading: true
        });
        const ridges = new THREE.InstancedMesh(ridgeGeo, ridgeMat, ridgeCount);
        for (let i = 0; i < ridgeCount; i++) {
            const data = this.getRoadDataAtT((i + 0.5) / ridgeCount);
            pos.copy(data.point).addScaledVector(data.normal, 50 + Math.random() * 35);
            const height = 14 + Math.random() * 18;
            pos.y = -10 + height * 0.5;
            quat.identity();
            scale.set(8 + Math.random() * 10, height, 8 + Math.random() * 9);
            matrix.compose(pos, quat, scale);
            ridges.setMatrixAt(i, matrix);
        }
        ridges.instanceMatrix.needsUpdate = true;

        // A second, very distant tree-line silhouette makes the road feel less
        // like a corridor. Flat cones are enough at this distance.
        const silhouetteCount = this.getScaledCount(18);
        const silhouetteGeo = new THREE.ConeGeometry(1, 1, 5);
        const silhouetteMat = new THREE.MeshBasicMaterial({
            color: this.currentLevel === 2 ? 0x1b1020 : 0x080d16,
            fog: true
        });
        const silhouettes = new THREE.InstancedMesh(silhouetteGeo, silhouetteMat, silhouetteCount);
        for (let i = 0; i < silhouetteCount; i++) {
            const data = this.getRoadDataAtT((i + 0.5) / silhouetteCount);
            pos.copy(data.point).addScaledVector(data.normal, 72 + (i % 3) * 8);
            const height = 10 + (i % 5) * 2.5;
            pos.y = height * 0.5 - 3;
            scale.set(7 + (i % 4), height, 7 + (i % 3));
            matrix.compose(pos, quat.identity(), scale);
            silhouettes.setMatrixAt(i, matrix);
        }
        silhouettes.instanceMatrix.needsUpdate = true;

        this.scene.add(rocks, ridges, silhouettes);
        this.levelObjects.push(rocks, ridges, silhouettes);
    }

    createTrees(count, side) {
        count = this.getScaledCount(count);
        const trunkGeo = new THREE.CylinderGeometry(0.3, 0.5, 1, 6);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x1a1510, roughness: 1 });
        const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
        const foliageGeo = new THREE.ConeGeometry(1, 1, 8);
        const foliageMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
        const foliageMesh = new THREE.InstancedMesh(foliageGeo, foliageMat, count);
        const foliageTopMesh = new THREE.InstancedMesh(foliageGeo, foliageMat, count);

        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        const color = new THREE.Color();

        for (let i = 0; i < count; i++) {
            const x = side * (20 + Math.random() * 35);
            const z = (Math.random() - 0.5) * 280;
            const height = 5 + Math.random() * 10;
            const trunkH = height * 0.4;
            const radius = 2 + Math.random() * 3;

            position.set(x, trunkH / 2, z);
            quaternion.identity();
            scale.set(1, trunkH, 1);
            matrix.compose(position, quaternion, scale);
            trunkMesh.setMatrixAt(i, matrix);

            // Lower canopy
            position.set(x, trunkH + height * 0.3, z);
            scale.set(radius, height * 0.55, radius);
            matrix.compose(position, quaternion, scale);
            foliageMesh.setMatrixAt(i, matrix);

            // Upper canopy (narrower, sits above lower cone)
            position.set(x, trunkH + height * 0.62, z);
            scale.set(radius * 0.65, height * 0.45, radius * 0.65);
            matrix.compose(position, quaternion, scale);
            foliageTopMesh.setMatrixAt(i, matrix);

            // Slight per-tree color variance (coastal redwood / douglas fir range)
            const g = 0.55 + Math.random() * 0.7;
            color.setRGB(0.04 * g, 0.10 * g, 0.045 * g);
            foliageMesh.setColorAt(i, color);
            color.multiplyScalar(1.15);
            foliageTopMesh.setColorAt(i, color);
        }
        trunkMesh.instanceMatrix.needsUpdate = true;
        foliageMesh.instanceMatrix.needsUpdate = true;
        foliageTopMesh.instanceMatrix.needsUpdate = true;
        if (foliageMesh.instanceColor) foliageMesh.instanceColor.needsUpdate = true;
        if (foliageTopMesh.instanceColor) foliageTopMesh.instanceColor.needsUpdate = true;
        this.scene.add(trunkMesh, foliageMesh, foliageTopMesh);
        this.levelObjects.push(trunkMesh, foliageMesh, foliageTopMesh);
    }

    // All ferns rendered as ONE instanced mesh (was ~200 separate meshes).
    createUnderbrush(count = 60) {
        count = this.getScaledCount(count);
        const frondsPerFern = 4;
        const total = count * frondsPerFern;

        const frondGeo = new THREE.ConeGeometry(0.3, 1.2, 4);
        frondGeo.translate(0, 0.5, 0); // pivot at frond base
        const frondMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
        const mesh = new THREE.InstancedMesh(frondGeo, frondMat, total);

        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const euler = new THREE.Euler();
        const scale = new THREE.Vector3();
        const color = new THREE.Color();

        let idx = 0;
        for (let i = 0; i < count; i++) {
            const x = -(15 + Math.random() * 30);
            const z = (Math.random() - 0.5) * 260;
            const fernScale = 0.5 + Math.random() * 0.3;
            const g = 0.8 + Math.random() * 0.5;

            for (let f = 0; f < frondsPerFern; f++) {
                position.set(x, 0, z);
                euler.set(-0.35 - Math.random() * 0.35, (f / frondsPerFern) * Math.PI * 2 + Math.random() * 0.4, 0, 'YXZ');
                quaternion.setFromEuler(euler);
                scale.setScalar(fernScale);
                matrix.compose(position, quaternion, scale);
                mesh.setMatrixAt(idx, matrix);
                color.setRGB(0.10 * g, 0.23 * g, 0.10 * g);
                mesh.setColorAt(idx, color);
                idx++;
            }
        }
        mesh.count = idx;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        this.scene.add(mesh);
        this.levelObjects.push(mesh);
    }

    // Moths rendered as 3 instanced meshes total (bodies + 2 wings) instead of
    // ~45 individual meshes; wings still flap by updating instance matrices.
    createMoths(count = 15) {
        count = this.getScaledCount(count);

        const bodyGeo = new THREE.CapsuleGeometry(0.02, 0.04, 4, 6);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8a7a6a, roughness: 0.8 });
        this.mothBodies = new THREE.InstancedMesh(bodyGeo, bodyMat, count);

        const wingGeo = new THREE.PlaneGeometry(0.06, 0.04);
        const wingMat = new THREE.MeshStandardMaterial({ color: 0x9a8a7a, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
        this.mothLeftWings = new THREE.InstancedMesh(wingGeo, wingMat, count);
        this.mothRightWings = new THREE.InstancedMesh(wingGeo, wingMat.clone(), count);

        // Moths flutter constantly; skip frustum culling on the small instanced sets
        this.mothBodies.frustumCulled = false;
        this.mothLeftWings.frustumCulled = false;
        this.mothRightWings.frustumCulled = false;

        this.scene.add(this.mothBodies, this.mothLeftWings, this.mothRightWings);
        this.levelObjects.push(this.mothBodies, this.mothLeftWings, this.mothRightWings);

        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * 20;
            const y = 1.5 + Math.random() * 2;
            const z = (Math.random() - 0.5) * 260;
            this.moths.push({
                index: i,
                basePos: new THREE.Vector3(x, y, z),
                phase: Math.random() * Math.PI * 2,
                speed: 2 + Math.random() * 3,
                radius: 0.3 + Math.random() * 0.5
            });
        }
        this.updateMoths(0);
    }

    createWesternToads(count = 8) {
        count = this.getScaledCount(count);
        for (let i = 0; i < count; i++) {
            const toadGroup = new THREE.Group();

            // Body (olive green / brownish speckled toad body)
            const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a5d32, roughness: 0.8, metalness: 0.05 });
            const body = new THREE.Mesh(
                new THREE.SphereGeometry(0.1, 8, 8),
                bodyMat
            );
            body.scale.set(1.2, 0.8, 1.4);
            body.position.y = 0.07;
            toadGroup.add(body);

            // Head
            const head = new THREE.Mesh(
                new THREE.SphereGeometry(0.07, 8, 8),
                bodyMat
            );
            head.scale.set(1.0, 0.7, 0.9);
            head.position.set(0, 0.08, 0.1);
            toadGroup.add(head);

            // Eyes
            const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 });
            [-0.04, 0.04].forEach(xOff => {
                const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), eyeMat);
                eye.position.set(xOff, 0.12, 0.14);
                toadGroup.add(eye);
            });

            // Yellow/cream stripe along the back characteristic of Western Toads
            const stripeMat = new THREE.MeshStandardMaterial({ color: 0xc8bc7d, roughness: 0.7 });
            const stripe = new THREE.Mesh(
                new THREE.BoxGeometry(0.015, 0.02, 0.22),
                stripeMat
            );
            stripe.position.set(0, 0.12, -0.01);
            toadGroup.add(stripe);

            const side = Math.random() > 0.5 ? -1 : 1;
            const startX = side * (7 + Math.random() * 3);
            const startZ = (Math.random() - 0.5) * 240;
            const direction = Math.random() * Math.PI * 2;

            toadGroup.position.set(startX, 0, startZ);
            toadGroup.rotation.y = direction;
            this.scene.add(toadGroup);
            this.levelObjects.push(toadGroup);

            this.westernToads.push({
                group: toadGroup,
                speed: 0.3 + Math.random() * 0.4,
                hopFreq: 2 + Math.random() * 2,
                direction: direction,
                phase: Math.random() * Math.PI * 2,
                minZ: -120,
                maxZ: 120
            });
        }
    }

    // ==================== LEVEL 1: CLEAR NIGHT ====================
    createLevel1() {
        this.scene.background = new THREE.Color(0x070714);
        this.scene.fog = new THREE.FogExp2(0x070714, this.isMobile ? 0.012 : 0.008);

        this.createRoad(0);
        this.createGrass(0x0a1a0a);
        this.createCliff();
        this.createEnvironmentLayers();
        this.createTrees(100, -1);
        this.createUnderbrush(50);
        this.createWesternToads(6);
        this.createMoths(15);
        this.placeRoadSigns();
        this.createStars();
        this.createMoonlight(0.3);

        const ambient = new THREE.AmbientLight(0x1a1a2e, 0.45);
        this.scene.add(ambient);
        this.levelObjects.push(ambient);

        // Cool sky glow vs warm ground bounce for subtle color depth
        const hemi = new THREE.HemisphereLight(0x25304d, 0x0c100c, 0.4);
        this.scene.add(hemi);
        this.levelObjects.push(hemi);
    }

    createStars() {
        const starCount = this.getScaledCount(800);
        const starGeo = new THREE.BufferGeometry();
        const positions = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI * 0.4;
            const r = 200 + Math.random() * 100;
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.cos(phi);
            positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        }
        starGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
            color: 0xffffff, size: 0.5, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending
        }));
        this.scene.add(stars);
        this.levelObjects.push(stars);
    }
    
    // ==================== LEVEL 2: JUST AFTER SUNSET ====================
    createLevel2() {
        this.scene.background = new THREE.Color(0x0d0714);
        this.scene.fog = new THREE.FogExp2(0x160b1b, this.isMobile ? 0.017 : 0.012);

        this.createRoad(0);
        this.createGrass(0x0d1a0d);
        this.createCliff();
        this.createEnvironmentLayers();
        this.createTrees(120, -1);
        this.createUnderbrush(60);
        this.createWesternToads(10);
        this.createMoths(25);
        this.placeRoadSigns();
        this.createDuskSky();
        this.createMoonlight(0.15);

        const ambient = new THREE.AmbientLight(0x1a1020, 0.35);
        this.scene.add(ambient);
        this.levelObjects.push(ambient);

        const hemi = new THREE.HemisphereLight(0x33203a, 0x0d0f0c, 0.35);
        this.scene.add(hemi);
        this.levelObjects.push(hemi);

        const horizonLight = new THREE.DirectionalLight(0xff6633, 0.35);
        horizonLight.position.set(-50, 5, 0);
        this.scene.add(horizonLight);
        this.levelObjects.push(horizonLight);
    }

    createDuskSky() {
        // Painted gradient: ember horizon fading to deep dusk blue
        const canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createLinearGradient(0, 256, 0, 0);
        grad.addColorStop(0, '#3a1622');
        grad.addColorStop(0.25, '#66284a');
        grad.addColorStop(0.55, '#2a1a3e');
        grad.addColorStop(1, '#0a0612');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 2, 256);
        const skyTex = new THREE.CanvasTexture(canvas);
        skyTex.colorSpace = THREE.SRGBColorSpace;
        this._levelTextures.push(skyTex);

        const horizon = new THREE.Mesh(
            new THREE.PlaneGeometry(400, 60),
            new THREE.MeshBasicMaterial({ map: skyTex, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, fog: false })
        );
        horizon.position.set(-120, 15, 0);
        horizon.rotation.y = Math.PI / 2;
        this.scene.add(horizon);
        this.levelObjects.push(horizon);

        const starCount = this.getScaledCount(300);
        const starGeo = new THREE.BufferGeometry();
        const positions = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI * 0.3;
            const r = 200 + Math.random() * 100;
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.cos(phi);
            positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        }
        starGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
            color: 0xeeddcc, size: 0.4, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending
        }));
        this.scene.add(stars);
        this.levelObjects.push(stars);
    }
    
    // ==================== LEVEL 3: RAIN & WIND STORM ====================
    createLevel3() {
        this.scene.background = new THREE.Color(0x040409);
        this.scene.fog = new THREE.FogExp2(0x080b12, this.isMobile ? 0.035 : 0.025);

        this.createRoad(1);
        this.createGrass(0x0d260d);
        this.createCliff();
        this.createEnvironmentLayers();
        this.createTrees(180, -1);
        this.createUnderbrush(40);
        this.placeRoadSigns();
        this.createPuddles();
        this.createRain();
        this.createMoonlight(0.12);
        this.createStormReservoir();

        const ambient = new THREE.AmbientLight(0x111122, 0.3);
        this.scene.add(ambient);
        this.levelObjects.push(ambient);

        const hemi = new THREE.HemisphereLight(0x1d2740, 0x0a0d0a, 0.3);
        this.scene.add(hemi);
        this.levelObjects.push(hemi);
        this.windStrength = 1.0;
    }

    createStormReservoir() {
        const water = new THREE.Mesh(
            new THREE.PlaneGeometry(120, 300, 20, 20),
            new THREE.MeshStandardMaterial({ color: 0x0a2a4c, roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.9 })
        );
        water.rotation.x = -Math.PI / 2;
        water.position.set(80, -28, 0);
        water.userData.isWater = true;
        this.scene.add(water);
        this.levelObjects.push(water);
        this._stormWater = water;
    }
    
    createPuddles() {
        const puddleCount = this.getScaledCount(32);
        const geo = new THREE.CircleGeometry(1, 16);
        geo.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshPhysicalMaterial({
            color: 0x151b2a,
            roughness: 0.08,
            metalness: 0.35,
            clearcoat: 1,
            clearcoatRoughness: 0.08,
            reflectivity: 0.9,
            transparent: true,
            opacity: 0.72
        });
        const mesh = new THREE.InstancedMesh(geo, mat, puddleCount);

        const matrix = new THREE.Matrix4();
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scale = new THREE.Vector3();

        for (let i = 0; i < puddleCount; i++) {
            pos.set((Math.random() - 0.5) * 12, 0.02, (Math.random() - 0.5) * 280);
            scale.set((0.5 + Math.random()) * (0.5 + Math.random() * 1), 1, (0.5 + Math.random()) * (0.6 + Math.random() * 0.4));
            matrix.compose(pos, quat, scale);
            mesh.setMatrixAt(i, matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        this.scene.add(mesh);
        this.levelObjects.push(mesh);
    }

    createRain() {
        const rainCount = this.getScaledCount(8000);
        this.rainGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(rainCount * 6);
        this.rainVelocities = new Float32Array(rainCount);
        for (let i = 0; i < rainCount; i++) {
            const offset = i * 6;
            const x = (Math.random() - 0.5) * 120;
            const y = Math.random() * 50;
            const z = (Math.random() - 0.5) * 120;
            positions[offset] = x;
            positions[offset + 1] = y;
            positions[offset + 2] = z;
            positions[offset + 3] = x - 0.12;
            positions[offset + 4] = y + 0.75;
            positions[offset + 5] = z;
            this.rainVelocities[i] = 0.5 + Math.random() * 0.5;
        }
        this.rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.rain = new THREE.LineSegments(this.rainGeometry, new THREE.LineBasicMaterial({
            color: 0x94a9bd, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending,
            depthWrite: false
        }));
        this.rain.frustumCulled = false;
        this.scene.add(this.rain);
        this.applyRainQuality();
    }

    createMoonlight(intensity = 0.12) {
        const moonlight = new THREE.DirectionalLight(0x6677bb, intensity);
        moonlight.position.set(20, 50, 10);
        // No shadow casting here: at night the flashlight is the only shadow source
        // that is perceptible, and skipping this pass removes a full scene render.
        moonlight.castShadow = false;
        this.scene.add(moonlight);
        this.levelObjects.push(moonlight);
    }
    
    // ==================== UPDATE METHODS ====================
    updateRain(deltaTime, cameraPosition) {
        if (!this.rain || !this.rainGeometry || this.currentLevel !== 3) return;

        const positions = this.rainGeometry.attributes.position.array;
        const count = this.rainVelocities.length;

        this.windTime += deltaTime;
        const windGust = Math.sin(this.windTime * 0.5) * 0.5 + 0.5;
        const windX = (2 + windGust * 4) * this.windStrength;
        const windZ = Math.sin(this.windTime * 0.3) * 1.5 * this.windStrength;

        // Sliced updates: each frame advances 1/interval of the particles by
        // interval * dt, keeping perceived speed identical while spreading cost.
        const interval = this.rainUpdateInterval || 1;
        this.rainFrameCounter = (this.rainFrameCounter + 1) % interval;
        const sliceSize = Math.ceil(count / interval);
        const start = this.rainFrameCounter * sliceSize;
        const end = Math.min(start + sliceSize, count);
        const dt = deltaTime * interval;

        for (let i = start; i < end; i++) {
            const offset = i * 6;
            const fall = this.rainVelocities[i] * dt * 35;
            positions[offset] += windX * dt;
            positions[offset + 1] -= fall;
            positions[offset + 2] += windZ * dt;
            positions[offset + 3] += windX * dt;
            positions[offset + 4] -= fall;
            positions[offset + 5] += windZ * dt;
            if (positions[offset + 1] < 0) {
                const x = cameraPosition.x + (Math.random() - 0.5) * 120;
                const y = 40 + Math.random() * 10;
                const z = cameraPosition.z + (Math.random() - 0.5) * 120;
                positions[offset] = x;
                positions[offset + 1] = y;
                positions[offset + 2] = z;
                positions[offset + 3] = x - 0.12 - windX * 0.02;
                positions[offset + 4] = y + 0.75;
                positions[offset + 5] = z - windZ * 0.02;
            }
        }
        this.rainGeometry.attributes.position.needsUpdate = true;

        // Choppy storm water (cache the mesh reference at level build time)
        if (this._stormWater) {
            const wp = this._stormWater.geometry.attributes.position.array;
            const wt = this.windTime * 2;
            for (let i = 0; i < wp.length / 3; i++) {
                wp[i * 3 + 2] = Math.sin(wt + i * 0.3) * 0.3;
            }
            this._stormWater.geometry.attributes.position.needsUpdate = true;
        }
    }
    
    createSplashParticle(x, z) {
        if (this.currentLevel !== 3) return;
        const maxSplashes = this.isMobile ? 30 : 60;
        if (this.splashParticles.length >= maxSplashes) {
            const old = this.splashParticles.shift();
            old.position.set(x, 0.05, z);
            old.scale.set(0.1, 0.1, 0.1);
            old.material.opacity = 0.8;
            old.userData.life = 0;
            this.splashParticles.push(old);
            return;
        }
        const splash = new THREE.Mesh(
            new THREE.RingGeometry(0.02, 0.08, 8),
            new THREE.MeshBasicMaterial({ color: 0x6688aa, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
        );
        splash.rotation.x = -Math.PI / 2;
        splash.position.set(x, 0.05, z);
        splash.userData.life = 0;
        splash.userData.maxLife = 0.4;
        this.scene.add(splash);
        this.splashParticles.push(splash);
    }
    
    updateSplashes(deltaTime, cameraPosition) {
        if (this.currentLevel !== 3) {
            this.splashParticles.forEach(s => this.scene.remove(s));
            this.splashParticles = [];
            return;
        }
        if (Math.random() < (this.isMobile ? 0.15 : 0.3)) {
            const x = cameraPosition.x + (Math.random() - 0.5) * 20;
            const z = cameraPosition.z + (Math.random() - 0.5) * 20;
            if (Math.abs(x) < 8) this.createSplashParticle(x, z);
        }
        for (let i = this.splashParticles.length - 1; i >= 0; i--) {
            const splash = this.splashParticles[i];
            splash.userData.life += deltaTime;
            const progress = splash.userData.life / splash.userData.maxLife;
            const scale = 0.1 + progress * 0.4;
            splash.scale.set(scale, scale, scale);
            splash.material.opacity = 0.8 * (1 - progress);
            if (splash.userData.life >= splash.userData.maxLife) {
                this.scene.remove(splash);
                this.splashParticles.splice(i, 1);
            }
        }
    }

    updateMoths(deltaTime) {
        if (!this.mothBodies) return;

        const matrix = this._scratchMatrix;
        const quat = this._scratchQuat;
        const euler = this._scratchEuler;
        const pos = this._scratchPos;
        const scale = this._scratchScale.set(1, 1, 1);

        for (let i = 0; i < this.moths.length; i++) {
            const moth = this.moths[i];
            moth.phase += deltaTime * moth.speed;

            const mx = moth.basePos.x + Math.sin(moth.phase) * moth.radius;
            const my = moth.basePos.y + Math.sin(moth.phase * 1.7) * 0.15;
            const mz = moth.basePos.z + Math.cos(moth.phase * 0.8) * moth.radius;

            // Body
            pos.set(mx, my, mz);
            quat.identity();
            matrix.compose(pos, quat, scale);
            this.mothBodies.setMatrixAt(moth.index, matrix);

            const wingAngle = Math.sin(moth.phase * 15) * 0.5;

            // Left wing
            pos.set(mx + 0.03, my, mz);
            euler.set(0, 0.3 + wingAngle, 0);
            quat.setFromEuler(euler);
            matrix.compose(pos, quat, scale);
            this.mothLeftWings.setMatrixAt(moth.index, matrix);

            // Right wing
            pos.set(mx - 0.03, my, mz);
            euler.set(0, -0.3 - wingAngle, 0);
            quat.setFromEuler(euler);
            matrix.compose(pos, quat, scale);
            this.mothRightWings.setMatrixAt(moth.index, matrix);
        }

        this.mothBodies.instanceMatrix.needsUpdate = true;
        this.mothLeftWings.instanceMatrix.needsUpdate = true;
        this.mothRightWings.instanceMatrix.needsUpdate = true;
    }

    updateWesternToads(deltaTime) {
        if (!this.westernToads || this.westernToads.length === 0) return;

        for (let i = 0; i < this.westernToads.length; i++) {
            const toad = this.westernToads[i];
            toad.phase += deltaTime * toad.hopFreq;

            // Move forward based on direction
            const dx = Math.sin(toad.direction) * toad.speed * deltaTime;
            const dz = Math.cos(toad.direction) * toad.speed * deltaTime;

            toad.group.position.x += dx;
            toad.group.position.z += dz;

            // Hop arc height animation
            const hopHeight = Math.max(0, Math.sin(toad.phase)) * 0.12;
            toad.group.position.y = hopHeight;

            // Wrap Z or steer away if wandering too far off-road margins
            if (toad.group.position.z < toad.minZ) toad.group.position.z = toad.maxZ;
            if (toad.group.position.z > toad.maxZ) toad.group.position.z = toad.minZ;

            // Turn around slightly when reaching bounds on sides
            if (Math.abs(toad.group.position.x) > 16 || Math.abs(toad.group.position.x) < 5) {
                toad.direction += Math.PI * 0.8;
                toad.group.rotation.y = toad.direction;
            }
        }
    }
    
    precomputeRoadData() {
        this.precomputedRoadData = [];
        if (!this.roadCurve) return;

        const steps = 300;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const point = this.roadCurve.getPoint(t);
            const tangent = this.roadCurve.getTangent(t);
            const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
            this.precomputedRoadData.push({
                point,
                tangent,
                normal,
                t
            });
        }
    }
    
    getRoadDataAtZ(z) {
        if (!this.roadCurve || !this.precomputedRoadData || this.precomputedRoadData.length === 0) {
            if (!this._fallbackRoadData) {
                this._fallbackRoadData = {
                    point: new THREE.Vector3(0, 0, z),
                    tangent: new THREE.Vector3(0, 0, 1),
                    normal: new THREE.Vector3(1, 0, 0),
                    t: 0
                };
            }
            this._fallbackRoadData.point.set(0, 0, z);
            return this._fallbackRoadData;
        }

        // Binary search — the precomputed table is monotonic in z
        const data = this.precomputedRoadData;
        let lo = 0;
        let hi = data.length - 1;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (data[mid].point.z <= z) {
                lo = mid;
            } else {
                hi = mid;
            }
        }
        return Math.abs(data[lo].point.z - z) <= Math.abs(data[hi].point.z - z)
            ? data[lo]
            : data[hi];
    }
    
    getCurrentLevel() { return this.currentLevel; }
    getWindStrength() { return this.currentLevel === 3 ? this.windStrength : 0; }
}
