// levels.js - Level management and scene generation for multiple levels
import * as THREE from 'three';

export class LevelManager {
    constructor(scene, camera, renderer, isMobile = false) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.isMobile = isMobile;
        this.currentLevel = 1;
        
        // Store level objects for cleanup
        this.levelObjects = [];
        this.roadCurve = null;
        this.dangerZones = null;
        this.roadBounds = null;
        
        // Rain system references
        this.rain = null;
        this.rainGeometry = null;
        this.rainVelocities = null;
        
        // Splash particles
        this.splashParticles = [];
        
        // Puddle positions for splashes
        this.puddlePositions = [];
    }
    
    loadLevel(levelNum) {
        this.currentLevel = levelNum;
        this.clearLevel();
        
        if (levelNum === 1) {
            this.createLevel1();
        } else if (levelNum === 2) {
            this.createLevel2();
        }
        
        return {
            roadCurve: this.roadCurve,
            dangerZones: this.dangerZones,
            roadBounds: this.roadBounds
        };
    }
    
    clearLevel() {
        // Remove all level objects
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
        
        // Remove rain
        if (this.rain) {
            this.scene.remove(this.rain);
            this.rain = null;
        }
        
        // Remove splash particles
        this.splashParticles.forEach(splash => this.scene.remove(splash));
        this.splashParticles = [];
    }
    
    // Helper method to create a flat ribbon geometry following a curve
    createRibbonGeometry(curve, width, segments = 100) {
        const vertices = [];
        const indices = [];
        const uvs = [];
        
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const point = curve.getPoint(t);
            const tangent = curve.getTangent(t);
            const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
            
            // Create two vertices for left and right edges of the road
            const leftPoint = point.clone().add(normal.clone().multiplyScalar(-width / 2));
            const rightPoint = point.clone().add(normal.clone().multiplyScalar(width / 2));
            
            vertices.push(leftPoint.x, leftPoint.y, leftPoint.z);
            vertices.push(rightPoint.x, rightPoint.y, rightPoint.z);
            
            // UV coordinates for texture mapping
            uvs.push(0, t);
            uvs.push(1, t);
            
            // Create triangles (two triangles per road segment)
            if (i < segments) {
                const base = i * 2;
                // First triangle
                indices.push(base, base + 1, base + 2);
                // Second triangle
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
    
    // ==================== LEVEL 1: CLEAR NIGHT (NO RAIN) ====================
    createLevel1() {
        // Clear night sky
        this.scene.background = new THREE.Color(0x050510);
        this.scene.fog = new THREE.FogExp2(0x050510, this.isMobile ? 0.02 : 0.015);
        
        this.createLevel1Road();
        this.createLevel1Environment();
        // No rain in level 1
        this.createMoonlight();
        
        // Ambient light - slightly brighter since no rain
        const ambient = new THREE.AmbientLight(0x1a1a2e, 0.3);
        this.scene.add(ambient);
        this.levelObjects.push(ambient);
    }
    
    createLevel1Road() {
        const roadWidth = 12;
        const roadLength = 280;
        
        // Winding curved road - clear night
        const curvePoints = [
            new THREE.Vector3(-2, 0, -roadLength/2),
            new THREE.Vector3(3, 0, -roadLength/2 + 50),
            new THREE.Vector3(-4, 0, -roadLength/2 + 100),
            new THREE.Vector3(2, 0, -roadLength/2 + 150),
            new THREE.Vector3(-3, 0, -roadLength/2 + 200),
            new THREE.Vector3(1, 0, roadLength/2)
        ];
        
        this.roadCurve = new THREE.CatmullRomCurve3(curvePoints);
        this.roadCurve.tension = 0.5;
        
        // Create road as a ribbon geometry (flat surface following the curve)
        const roadGeometry = this.createRibbonGeometry(this.roadCurve, roadWidth, 200);
        const roadMaterial = new THREE.MeshStandardMaterial({
            color: 0x2a2a2a,
            roughness: 0.4,
            metalness: 0.2,
            side: THREE.DoubleSide
        });
        
        const road = new THREE.Mesh(roadGeometry, roadMaterial);
        road.position.y = 0.01; // Slightly above ground to prevent z-fighting
        road.receiveShadow = false; // Disable shadows on road to prevent artifacts
        this.scene.add(road);
        this.levelObjects.push(road);
        
        this.createRoadMarkings(roadWidth);
        // No puddles in level 1 (clear night)
        
        this.roadBounds = {
            minX: -35,
            maxX: 30,
            minZ: -roadLength/2 + 10,
            maxZ: roadLength/2 - 10
        };
        
        this.dangerZones = {
            forest: -12,
            cliff: 14
        };
    }
    
    createLevel1Environment() {
        // Simple grass on both sides - fewer trees for performance
        const grassGeo = new THREE.PlaneGeometry(80, 280);
        const grassMat = new THREE.MeshStandardMaterial({ 
            color: 0x0a1a0a, 
            roughness: 1.0 
        });
        
        // Left grass
        const leftGrass = new THREE.Mesh(grassGeo, grassMat);
        leftGrass.rotation.x = -Math.PI / 2;
        leftGrass.position.set(-45, -0.01, 0);
        this.scene.add(leftGrass);
        this.levelObjects.push(leftGrass);
        
        // Right grass
        const rightGrass = new THREE.Mesh(grassGeo, grassMat);
        rightGrass.rotation.x = -Math.PI / 2;
        rightGrass.position.set(45, -0.01, 0);
        this.scene.add(rightGrass);
        this.levelObjects.push(rightGrass);
        
        // Cliff on right side
        this.createCliff();
        
        // Fewer trees than level 2 for performance
        this.createTrees(this.isMobile ? 40 : 80, -1); // Left side only
        
        // Warning signs along cliff edge
        for (let z = -120; z <= 120; z += 40) {
            this.createWarningSign(20, z);
        }
    }
    
    // ==================== LEVEL 2: RAINY ROAD ====================
    createLevel2() {
        // Dark rainy night sky
        this.scene.background = new THREE.Color(0x030308);
        this.scene.fog = new THREE.FogExp2(0x030308, this.isMobile ? 0.06 : 0.05);
        
        this.createLevel2Road();
        this.createLevel2Environment();
        this.createRain();
        this.createMoonlight();
        
        // Ambient light
        const ambient = new THREE.AmbientLight(0x111122, 0.15);
        this.scene.add(ambient);
        this.levelObjects.push(ambient);
    }
    
    createLevel2Road() {
        const roadWidth = 12;
        const roadLength = 280;
        
        // Winding curved road
        const curvePoints = [
            new THREE.Vector3(2, 0, -roadLength/2),
            new THREE.Vector3(-3, 0, -roadLength/2 + 40),
            new THREE.Vector3(4, 0, -roadLength/2 + 90),
            new THREE.Vector3(-2, 0, -roadLength/2 + 140),
            new THREE.Vector3(3, 0, -roadLength/2 + 190),
            new THREE.Vector3(0, 0, roadLength/2)
        ];
        
        this.roadCurve = new THREE.CatmullRomCurve3(curvePoints);
        this.roadCurve.tension = 0.5;
        
        // Create road as a ribbon geometry (flat surface following the curve)
        const roadGeometry = this.createRibbonGeometry(this.roadCurve, roadWidth, 200);
        const roadMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.3,
            metalness: 0.4,
            side: THREE.DoubleSide
        });
        
        const road = new THREE.Mesh(roadGeometry, roadMaterial);
        road.position.y = 0.01; // Slightly above ground to prevent z-fighting
        road.receiveShadow = true;
        this.scene.add(road);
        this.levelObjects.push(road);
        
        this.createRoadMarkings(roadWidth);
        
        this.roadBounds = {
            minX: -35,
            maxX: 30,
            minZ: -roadLength/2 + 10,
            maxZ: roadLength/2 - 10
        };
        
        // Same danger zones
        this.dangerZones = {
            forest: -12,
            cliff: 14
        };
    }
    
    createLevel2Environment() {
        // Forest floor (left)
        const forestFloor = new THREE.Mesh(
            new THREE.PlaneGeometry(60, 280),
            new THREE.MeshStandardMaterial({ color: 0x0d260d, roughness: 1.0 })
        );
        forestFloor.rotation.x = -Math.PI / 2;
        forestFloor.position.set(-40, -0.01, 0);
        this.scene.add(forestFloor);
        this.levelObjects.push(forestFloor);
        
        // Cliff edge (right)
        const cliffEdge = new THREE.Mesh(
            new THREE.PlaneGeometry(20, 280),
            new THREE.MeshStandardMaterial({ color: 0x3d3d3d, roughness: 0.95 })
        );
        cliffEdge.rotation.x = -Math.PI / 2;
        cliffEdge.position.set(18, -0.01, 0);
        this.scene.add(cliffEdge);
        this.levelObjects.push(cliffEdge);
        
        // Cliff face
        const cliffFace = new THREE.Mesh(
            new THREE.PlaneGeometry(280, 30),
            new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 1.0 })
        );
        cliffFace.rotation.y = -Math.PI / 2;
        cliffFace.position.set(28, -15, 0);
        this.scene.add(cliffFace);
        this.levelObjects.push(cliffFace);
        
        // Reservoir water
        const water = new THREE.Mesh(
            new THREE.PlaneGeometry(120, 280),
            new THREE.MeshStandardMaterial({
                color: 0x1a3d5c,
                roughness: 0.1,
                metalness: 0.3,
                transparent: true,
                opacity: 0.9
            })
        );
        water.rotation.x = -Math.PI / 2;
        water.position.set(80, -28, 0);
        this.scene.add(water);
        this.levelObjects.push(water);
        
        // Trees
        this.createTrees(200, -1);
        
        // Warning signs
        for (let z = -120; z <= 120; z += 40) {
            this.createWarningSign(20, z);
        }
        
        // Create puddles for rainy level
        this.createPuddles();
    }
    
    createCliff() {
        const cliffLength = 280;
        
        // Cliff face - vertical wall
        const cliffGeometry = new THREE.PlaneGeometry(cliffLength, 30);
        const cliffMaterial = new THREE.MeshStandardMaterial({
            color: 0x4a4a4a,
            roughness: 1.0
        });
        
        const cliffFace = new THREE.Mesh(cliffGeometry, cliffMaterial);
        cliffFace.rotation.y = -Math.PI / 2;
        cliffFace.position.set(28, -15, 0);
        this.scene.add(cliffFace);
        this.levelObjects.push(cliffFace);
        
        // Reservoir water below
        const water = new THREE.Mesh(
            new THREE.PlaneGeometry(80, 280),
            new THREE.MeshStandardMaterial({
                color: 0x1a3d5c,
                roughness: 0.1,
                metalness: 0.3,
                transparent: true,
                opacity: 0.9
            })
        );
        water.rotation.x = -Math.PI / 2;
        water.position.set(80, -28, 0);
        this.scene.add(water);
        this.levelObjects.push(water);
    }
    
    // ==================== SHARED METHODS ====================
    
    createRoadMarkings(roadWidth) {
        const edgeLinePoints = [];
        const steps = 100;
        
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const point = this.roadCurve.getPoint(t);
            const tangent = this.roadCurve.getTangent(t);
            const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
            
            edgeLinePoints.push(point.clone().add(normal.clone().multiplyScalar(-roadWidth/2 + 0.5)));
            edgeLinePoints.push(point.clone().add(normal.clone().multiplyScalar(roadWidth/2 - 0.5)));
        }
        
        const leftEdgeCurve = new THREE.CatmullRomCurve3(
            edgeLinePoints.filter((_, i) => i % 2 === 0)
        );
        const rightEdgeCurve = new THREE.CatmullRomCurve3(
            edgeLinePoints.filter((_, i) => i % 2 === 1)
        );
        
        const lineMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
        
        const leftLine = new THREE.Mesh(
            new THREE.TubeGeometry(leftEdgeCurve, 100, 0.08, 4, false),
            lineMaterial
        );
        leftLine.position.y = 0.02;
        this.scene.add(leftLine);
        this.levelObjects.push(leftLine);
        
        const rightLine = new THREE.Mesh(
            new THREE.TubeGeometry(rightEdgeCurve, 100, 0.08, 4, false),
            lineMaterial
        );
        rightLine.position.y = 0.02;
        this.scene.add(rightLine);
        this.levelObjects.push(rightLine);
        
        // Dashed center line
        const dashMaterial = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.5 });
        
        for (let i = 0; i < 100; i += 6) {
            const t = i / 100;
            const t2 = Math.min((i + 3) / 100, 1);
            
            const point1 = this.roadCurve.getPoint(t);
            const point2 = this.roadCurve.getPoint(t2);
            
            const dashLength = point1.distanceTo(point2);
            const dash = new THREE.Mesh(
                new THREE.BoxGeometry(0.15, 0.02, dashLength),
                dashMaterial
            );
            dash.position.copy(point1.clone().add(point2).multiplyScalar(0.5));
            dash.position.y = 0.02;
            dash.lookAt(point2);
            this.scene.add(dash);
            this.levelObjects.push(dash);
        }
    }
    
    createPuddles() {
        const puddleCount = this.isMobile ? 14 : 28;
        
        for (let i = 0; i < puddleCount; i++) {
            const puddle = new THREE.Mesh(
                new THREE.CircleGeometry(0.5 + Math.random() * 1, 16),
                new THREE.MeshStandardMaterial({
                    color: 0x1a1a2e,
                    roughness: 0.1,
                    metalness: 0.8,
                    transparent: true,
                    opacity: 0.7
                })
            );
            puddle.rotation.x = -Math.PI / 2;
            puddle.position.set(
                (Math.random() - 0.5) * 10,
                0.02,
                (Math.random() - 0.5) * 260
            );
            puddle.scale.set(1 + Math.random(), 0.6 + Math.random() * 0.4, 1);
            this.scene.add(puddle);
            this.levelObjects.push(puddle);
        }
    }
    
    createTrees(count, side) {
        const treeCount = this.isMobile ? Math.floor(count * 0.5) : count;
        
        for (let i = 0; i < treeCount; i++) {
            // Spawn trees further from road edge (20-55 instead of 15-50)
            const x = side * (20 + Math.random() * 35);
            const z = (Math.random() - 0.5) * 260;
            const height = 5 + Math.random() * 10;
            const radius = 2 + Math.random() * 3;
            
            // Trunk
            const trunk = new THREE.Mesh(
                new THREE.CylinderGeometry(0.3, 0.5, height * 0.4, 6),
                new THREE.MeshStandardMaterial({ color: 0x1a1510, roughness: 1 })
            );
            trunk.position.set(x, height * 0.2, z);
            this.scene.add(trunk);
            this.levelObjects.push(trunk);
            
            // Foliage
            const foliage = new THREE.Mesh(
                new THREE.ConeGeometry(radius, height * 0.7, 8),
                new THREE.MeshStandardMaterial({ color: 0x0a1a0a, roughness: 1 })
            );
            foliage.position.set(x, height * 0.4 + height * 0.35, z);
            this.scene.add(foliage);
            this.levelObjects.push(foliage);
        }
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
            new THREE.MeshStandardMaterial({
                color: 0xffcc00,
                emissive: 0x332200,
                emissiveIntensity: 0.3
            })
        );
        sign.position.set(x - 0.01, 1.1, z);
        sign.rotation.y = Math.PI / 2;
        this.scene.add(sign);
        this.levelObjects.push(sign);
    }
    
    createRain() {
        const rainCount = this.isMobile ? 6000 : 15000;
        this.rainGeometry = new THREE.BufferGeometry();
        
        const positions = new Float32Array(rainCount * 3);
        this.rainVelocities = new Float32Array(rainCount);
        
        for (let i = 0; i < rainCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 100;
            positions[i * 3 + 1] = Math.random() * 50;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 100;
            this.rainVelocities[i] = 0.5 + Math.random() * 0.5;
        }
        
        this.rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const rainMaterial = new THREE.PointsMaterial({
            color: 0x8899aa,
            size: 0.1,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });
        
        this.rain = new THREE.Points(this.rainGeometry, rainMaterial);
        this.scene.add(this.rain);
    }
    
    createDustParticles() {
        // Dust/fog particles for construction zone atmosphere
        const dustCount = this.isMobile ? 1000 : 3000;
        this.rainGeometry = new THREE.BufferGeometry();
        
        const positions = new Float32Array(dustCount * 3);
        this.rainVelocities = new Float32Array(dustCount);
        
        for (let i = 0; i < dustCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 80;
            positions[i * 3 + 1] = Math.random() * 20;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 100;
            this.rainVelocities[i] = 0.1 + Math.random() * 0.2;
        }
        
        this.rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const dustMaterial = new THREE.PointsMaterial({
            color: 0x8a8a6a,
            size: 0.2,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending
        });
        
        this.rain = new THREE.Points(this.rainGeometry, dustMaterial);
        this.scene.add(this.rain);
    }
    
    createMoonlight() {
        const moonlight = new THREE.DirectionalLight(0x6666aa, 0.12);
        moonlight.position.set(20, 50, 10);
        moonlight.castShadow = true;
        moonlight.shadow.mapSize.width = 1024;
        moonlight.shadow.mapSize.height = 1024;
        
        // Configure shadow camera to cover the road area properly
        const d = 150;
        moonlight.shadow.camera.left = -d;
        moonlight.shadow.camera.right = d;
        moonlight.shadow.camera.top = d;
        moonlight.shadow.camera.bottom = -d;
        moonlight.shadow.camera.near = 0.5;
        moonlight.shadow.camera.far = 200;
        
        // Reduce shadow bias to prevent artifacts
        moonlight.shadow.bias = -0.001;
        
        this.scene.add(moonlight);
        this.levelObjects.push(moonlight);
    }
    
    createConstructionLighting() {
        // Work lights along the construction zone
        for (let z = -100; z <= 100; z += 50) {
            // Light pole
            const pole = new THREE.Mesh(
                new THREE.CylinderGeometry(0.1, 0.1, 6),
                new THREE.MeshStandardMaterial({ color: 0x444444 })
            );
            pole.position.set(-18, 3, z);
            this.scene.add(pole);
            this.levelObjects.push(pole);
            
            // Light fixture
            const fixture = new THREE.Mesh(
                new THREE.BoxGeometry(0.8, 0.4, 0.4),
                new THREE.MeshStandardMaterial({ color: 0x222222 })
            );
            fixture.position.set(-18, 6, z);
            this.scene.add(fixture);
            this.levelObjects.push(fixture);
            
            // Spot light
            const spotLight = new THREE.SpotLight(0xffaa00, 2);
            spotLight.position.set(-18, 6, z);
            spotLight.target.position.set(0, 0, z);
            spotLight.angle = Math.PI / 4;
            spotLight.penumbra = 0.5;
            spotLight.distance = 40;
            this.scene.add(spotLight);
            this.scene.add(spotLight.target);
            this.levelObjects.push(spotLight);
            this.levelObjects.push(spotLight.target);
        }
    }
    
    // Update methods for particles
    updateRain(deltaTime, cameraPosition) {
        if (!this.rain || !this.rainGeometry) return;
        
        const positions = this.rainGeometry.attributes.position.array;
        const count = positions.length / 3;
        
        for (let i = 0; i < count; i++) {
            if (this.currentLevel === 2) {
                // Rain falls down
                positions[i * 3 + 1] -= this.rainVelocities[i] * deltaTime * 30;
                positions[i * 3] += deltaTime * 2; // Wind
                
                if (positions[i * 3 + 1] < 0) {
                    positions[i * 3] = cameraPosition.x + (Math.random() - 0.5) * 100;
                    positions[i * 3 + 1] = 40 + Math.random() * 10;
                    positions[i * 3 + 2] = cameraPosition.z + (Math.random() - 0.5) * 100;
                }
            } else {
                // Level 1 - no rain particles
                // Just hide them below ground
                positions[i * 3 + 1] = -100;
            }
        }
        
        this.rainGeometry.attributes.position.needsUpdate = true;
    }
    
    createSplashParticle(x, z) {
        if (this.currentLevel !== 2) return; // Only splashes in level 2 (rainy)
        
        const maxSplashes = this.isMobile ? 30 : 60;
        
        if (this.splashParticles.length >= maxSplashes) {
            const oldSplash = this.splashParticles.shift();
            oldSplash.position.set(x, 0.05, z);
            oldSplash.scale.set(0.1, 0.1, 0.1);
            oldSplash.material.opacity = 0.8;
            oldSplash.userData.life = 0;
            this.splashParticles.push(oldSplash);
            return;
        }
        
        const geometry = new THREE.RingGeometry(0.02, 0.08, 8);
        const material = new THREE.MeshBasicMaterial({
            color: 0x6688aa,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        
        const splash = new THREE.Mesh(geometry, material);
        splash.rotation.x = -Math.PI / 2;
        splash.position.set(x, 0.05, z);
        splash.userData.life = 0;
        splash.userData.maxLife = 0.4;
        
        this.scene.add(splash);
        this.splashParticles.push(splash);
    }
    
    updateSplashes(deltaTime, cameraPosition) {
        if (this.currentLevel !== 2) {
            // Clear any existing splashes when switching levels
            this.splashParticles.forEach(splash => this.scene.remove(splash));
            this.splashParticles = [];
            return;
        }
        
        // Spawn new splashes
        if (Math.random() < (this.isMobile ? 0.15 : 0.3)) {
            const x = cameraPosition.x + (Math.random() - 0.5) * 20;
            const z = cameraPosition.z + (Math.random() - 0.5) * 20;
            if (Math.abs(x) < 8) {
                this.createSplashParticle(x, z);
            }
        }
        
        // Update existing splashes
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
    
    getRoadDataAtZ(z) {
        if (!this.roadCurve) {
            return {
                point: new THREE.Vector3(0, 0, z),
                tangent: new THREE.Vector3(0, 0, 1),
                normal: new THREE.Vector3(1, 0, 0)
            };
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
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
        
        return { point, tangent, normal, t: closestT };
    }
    
    getCurrentLevel() {
        return this.currentLevel;
    }
}
