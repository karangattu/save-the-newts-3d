// scene.js - Three.js scene setup with road, environment, and camera shake
import * as THREE from 'three';

export class GameScene {
    constructor(isMobile = false) {
        this.scene = new THREE.Scene();
        this.camera = null;
        this.renderer = null;
        this.cameraShake = { intensity: 0, decay: 0.9 };
        this.cameraOffset = new THREE.Vector3();
        this.isMobile = isMobile;
        
        // Splash particles
        this.splashParticles = [];
        this.splashPool = [];
        this.maxSplashes = isMobile ? 30 : 60;
        this.rainUpdateAccumulator = 0;
        this.splashUpdateAccumulator = 0;
        
        // Road curve for curved road
        this.roadCurve = null;
        this.roadPath = null;
        
        // Smooth camera follow
        this.targetCameraPosition = new THREE.Vector3();
        this.cameraVelocity = new THREE.Vector3();
        
        this.init();
    }
    
    init() {
        // Create camera
        this.camera = new THREE.PerspectiveCamera(
            75, 
            window.innerWidth / window.innerHeight, 
            0.1, 
            1000
        );
        this.camera.position.set(0, 1.7, 0);
        
        // Create renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: !this.isMobile });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        const maxPixelRatio = this.isMobile ? 1.5 : 2;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
        this.renderer.shadowMap.enabled = !this.isMobile;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // Dark rainy night sky
        this.scene.background = new THREE.Color(0x030308);
        
        // Add fog for atmosphere and limiting visibility (denser for rain)
        this.scene.fog = new THREE.FogExp2(0x030308, this.isMobile ? 0.06 : 0.05);
        
        // Create environment
        this.createRoad();
        this.createGrass();
        this.createTrees();
        this.createStars();
        this.createRain();
        this.createPuddles();
        this.createMoonlight();
        
        // Ambient light (very dim for night)
        const ambient = new THREE.AmbientLight(0x111122, 0.15);
        this.scene.add(ambient);
        
        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize());
        
        // Append to container
        document.getElementById('game-container').appendChild(this.renderer.domElement);
    }
    
    createRoad() {
        // Larger road dimensions
        const roadWidth = 12;
        const roadLength = 280; // Increased from 200
        
        // Create a winding curved road path using CatmullRomCurve3
        // The road will wind left and right as it goes along Z
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
        
        // Create road geometry using extrusion along the curve
        const roadShape = new THREE.Shape();
        roadShape.moveTo(-roadWidth/2, 0);
        roadShape.lineTo(roadWidth/2, 0);
        roadShape.lineTo(roadWidth/2, 1);
        roadShape.lineTo(-roadWidth/2, 1);
        roadShape.lineTo(-roadWidth/2, 0);
        
        const extrudeSettings = {
            steps: 100,
            extrudePath: this.roadCurve,
            bevelEnabled: false
        };
        
        const roadGeometry = new THREE.ExtrudeGeometry(roadShape, extrudeSettings);
        const roadMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.3,
            metalness: 0.4,
            envMapIntensity: 0.8
        });
        
        const road = new THREE.Mesh(roadGeometry, roadMaterial);
        road.rotation.x = -Math.PI / 2;
        road.position.y = 0;
        road.receiveShadow = true;
        this.scene.add(road);
        this.roadMesh = road;
        
        // Create road markings along the curve
        this.createRoadMarkings(roadWidth);
        
        // Store road bounds for player movement (expanded for larger map)
        this.roadBounds = {
            minX: -35,
            maxX: 30,
            minZ: -roadLength/2 + 10,
            maxZ: roadLength/2 - 10
        };
        
        // Danger zones (relative to road center)
        this.dangerZones = {
            forest: -12,
            cliff: 14
        };
    }
    
    createRoadMarkings(roadWidth) {
        // Create edge lines along the curve
        const edgeLinePoints = [];
        const centerLinePoints = [];
        const steps = 100;
        
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const point = this.roadCurve.getPoint(t);
            const tangent = this.roadCurve.getTangent(t);
            const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
            
            // Left edge
            const leftPoint = point.clone().add(normal.clone().multiplyScalar(-roadWidth/2 + 0.5));
            edgeLinePoints.push(leftPoint);
            
            // Right edge  
            const rightPoint = point.clone().add(normal.clone().multiplyScalar(roadWidth/2 - 0.5));
            edgeLinePoints.push(rightPoint);
            
            // Center line (dashed - every other segment)
            if (i % 6 < 3) {
                const centerPoint = point.clone();
                centerLinePoints.push(centerPoint);
            }
        }
        
        // Create edge lines using TubeGeometry for smooth curves
        const leftEdgeCurve = new THREE.CatmullRomCurve3(
            edgeLinePoints.filter((_, i) => i % 2 === 0)
        );
        const rightEdgeCurve = new THREE.CatmullRomCurve3(
            edgeLinePoints.filter((_, i) => i % 2 === 1)
        );
        
        const lineMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.5
        });
        
        // Create thin tubes for edge lines
        const leftLineGeo = new THREE.TubeGeometry(leftEdgeCurve, 100, 0.08, 4, false);
        const leftLine = new THREE.Mesh(leftLineGeo, lineMaterial);
        leftLine.position.y = 0.02;
        this.scene.add(leftLine);
        
        const rightLineGeo = new THREE.TubeGeometry(rightEdgeCurve, 100, 0.08, 4, false);
        const rightLine = new THREE.Mesh(rightLineGeo, lineMaterial);
        rightLine.position.y = 0.02;
        this.scene.add(rightLine);
        
        // Create center dashed line
        const dashMaterial = new THREE.MeshStandardMaterial({
            color: 0xffcc00,
            roughness: 0.5
        });
        
        // Create dashed segments along the center
        for (let i = 0; i < 100; i += 6) {
            const t = i / 100;
            const t2 = Math.min((i + 3) / 100, 1);
            
            const point1 = this.roadCurve.getPoint(t);
            const point2 = this.roadCurve.getPoint(t2);
            
            const dashLength = point1.distanceTo(point2);
            const dashGeo = new THREE.BoxGeometry(0.15, 0.02, dashLength);
            const dash = new THREE.Mesh(dashGeo, dashMaterial);
            
            dash.position.copy(point1.clone().add(point2).multiplyScalar(0.5));
            dash.position.y = 0.02;
            dash.lookAt(point2);
            this.scene.add(dash);
        }
    }
    
    // Get the road center position and direction at a given Z coordinate
    getRoadDataAtZ(z) {
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
    
    createGrass() {
        const grassLength = 280; // Increased to match road
        
        // Left side - Forest floor (darker, more mysterious)
        const forestFloorGeometry = new THREE.PlaneGeometry(60, grassLength);
        const forestFloorMaterial = new THREE.MeshStandardMaterial({
            color: 0x0d260d,
            roughness: 1.0
        });
        
        const forestFloor = new THREE.Mesh(forestFloorGeometry, forestFloorMaterial);
        forestFloor.rotation.x = -Math.PI / 2;
        forestFloor.position.set(-40, -0.01, 0);
        forestFloor.receiveShadow = true;
        this.scene.add(forestFloor);
        
        // Right side - Cliff edge with rocky texture
        const cliffEdgeGeometry = new THREE.PlaneGeometry(20, grassLength);
        const cliffEdgeMaterial = new THREE.MeshStandardMaterial({
            color: 0x3d3d3d,
            roughness: 0.95
        });
        
        const cliffEdge = new THREE.Mesh(cliffEdgeGeometry, cliffEdgeMaterial);
        cliffEdge.rotation.x = -Math.PI / 2;
        cliffEdge.position.set(18, -0.01, 0);
        cliffEdge.receiveShadow = true;
        this.scene.add(cliffEdge);
        
        // Create the cliff face (vertical drop)
        this.createCliff();
        
        // Create the reservoir below
        this.createReservoir();
    }
    
    createCliff() {
        const cliffLength = 280; // Increased to match road
        
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
        
        // Add some rock formations on cliff edge
        const rockCount = this.isMobile ? 16 : 40;
        for (let i = 0; i < rockCount; i++) {
            const rockGeometry = new THREE.DodecahedronGeometry(0.3 + Math.random() * 0.5, 0);
            const rockMaterial = new THREE.MeshStandardMaterial({
                color: 0x555555,
                roughness: 0.9
            });
            const rock = new THREE.Mesh(rockGeometry, rockMaterial);
            rock.position.set(
                22 + Math.random() * 4,
                0.1,
                (Math.random() - 0.5) * 260
            );
            rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
            this.scene.add(rock);
        }
        
        // Warning signs along cliff edge
        for (let z = -120; z <= 120; z += 40) {
            this.createWarningSign(20, z);
        }
    }
    
    createWarningSign(x, z) {
        const poleGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8);
        const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 });
        const pole = new THREE.Mesh(poleGeometry, poleMaterial);
        pole.position.set(x, 0.6, z);
        this.scene.add(pole);
        
        const signGeometry = new THREE.PlaneGeometry(0.6, 0.4);
        const signMaterial = new THREE.MeshStandardMaterial({
            color: 0xffcc00,
            emissive: 0x332200,
            emissiveIntensity: 0.3
        });
        const sign = new THREE.Mesh(signGeometry, signMaterial);
        sign.position.set(x - 0.01, 1.1, z);
        sign.rotation.y = Math.PI / 2;
        this.scene.add(sign);
    }
    
    createReservoir() {
        // Water surface - larger to match map
        const waterGeometry = new THREE.PlaneGeometry(120, 280);
        const waterMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a3d5c,
            roughness: 0.1,
            metalness: 0.3,
            transparent: true,
            opacity: 0.9
        });
        
        const water = new THREE.Mesh(waterGeometry, waterMaterial);
        water.rotation.x = -Math.PI / 2;
        water.position.set(80, -28, 0);
        this.scene.add(water);
        
        // Subtle water glow for visibility
        const waterLight = new THREE.PointLight(0x1a5a8c, 0.5, 60);
        waterLight.position.set(50, -20, 0);
        this.scene.add(waterLight);
    }
    
    createTrees() {
        const treePositions = [];
        
        // Generate dense forest on LEFT side only (forest side) - larger map
        const treeCount = this.isMobile ? 90 : 200;
        for (let i = 0; i < treeCount; i++) {
            const x = -(15 + Math.random() * 50); // Only negative X (left side)
            const z = (Math.random() - 0.5) * 260; // Increased range
            treePositions.push({ x, z });
        }
        
        // Create tree silhouettes
        treePositions.forEach(pos => {
            const height = 5 + Math.random() * 10;
            const radius = 2 + Math.random() * 3;
            
            // Tree trunk
            const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.5, height * 0.4, 6);
            const trunkMaterial = new THREE.MeshStandardMaterial({
                color: 0x1a1510,
                roughness: 1
            });
            const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
            trunk.position.set(pos.x, height * 0.2, pos.z);
            this.scene.add(trunk);
            
            // Tree foliage (cone)
            const foliageGeometry = new THREE.ConeGeometry(radius, height * 0.7, 8);
            const foliageMaterial = new THREE.MeshStandardMaterial({
                color: 0x0a1a0a,
                roughness: 1
            });
            const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
            foliage.position.set(pos.x, height * 0.4 + height * 0.35, pos.z);
            this.scene.add(foliage);
        });
        
        // Add some bushes/undergrowth in forest for atmosphere
        const bushCount = this.isMobile ? 30 : 70;
        for (let i = 0; i < bushCount; i++) {
            const bushGeometry = new THREE.SphereGeometry(0.5 + Math.random() * 0.5, 6, 6);
            const bushMaterial = new THREE.MeshStandardMaterial({
                color: 0x0d1a0d,
                roughness: 1
            });
            const bush = new THREE.Mesh(bushGeometry, bushMaterial);
            bush.position.set(
                -(12 + Math.random() * 20),
                0.3,
                (Math.random() - 0.5) * 260
            );
            bush.scale.y = 0.6;
            this.scene.add(bush);
        }
    }
    
    createStars() {
        const starGeometry = new THREE.BufferGeometry();
        const starCount = this.isMobile ? 200 : 500;
        const positions = new Float32Array(starCount * 3);
        
        for (let i = 0; i < starCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI * 0.4; // Only upper hemisphere
            const radius = 150 + Math.random() * 50;
            
            positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = radius * Math.cos(phi) + 50;
            positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
        }
        
        starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const starMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.5,
            transparent: true,
            opacity: 0.8
        });
        
        const stars = new THREE.Points(starGeometry, starMaterial);
        this.scene.add(stars);
    }
    
    createRain() {
        // Rain particle system
        const rainCount = this.isMobile ? 6000 : 15000;
        const rainGeometry = new THREE.BufferGeometry();
        
        const positions = new Float32Array(rainCount * 3);
        const velocities = new Float32Array(rainCount);
        
        for (let i = 0; i < rainCount; i++) {
            // Spread rain over a large area around player
            positions[i * 3] = (Math.random() - 0.5) * 100;
            positions[i * 3 + 1] = Math.random() * 50;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 100;
            
            // Random fall speed
            velocities[i] = 0.5 + Math.random() * 0.5;
        }
        
        rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        // Store velocities for animation
        this.rainVelocities = velocities;
        this.rainGeometry = rainGeometry;
        
        const rainMaterial = new THREE.PointsMaterial({
            color: 0x8899aa,
            size: 0.1,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });
        
        this.rain = new THREE.Points(rainGeometry, rainMaterial);
        this.scene.add(this.rain);
    }
    
    updateRain(deltaTime, cameraPosition) {
        if (!this.rain) return;
        if (this.isMobile) {
            this.rainUpdateAccumulator += deltaTime;
            if (this.rainUpdateAccumulator < 1 / 30) {
                return;
            }
            deltaTime = this.rainUpdateAccumulator;
            this.rainUpdateAccumulator = 0;
        }
        
        const positions = this.rainGeometry.attributes.position.array;
        const rainCount = positions.length / 3;
        
        for (let i = 0; i < rainCount; i++) {
            // Fall down
            positions[i * 3 + 1] -= this.rainVelocities[i] * deltaTime * 30;
            
            // Add slight wind effect
            positions[i * 3] += deltaTime * 2;
            
            // Reset when hitting ground
            if (positions[i * 3 + 1] < 0) {
                positions[i * 3] = cameraPosition.x + (Math.random() - 0.5) * 100;
                positions[i * 3 + 1] = 40 + Math.random() * 10;
                positions[i * 3 + 2] = cameraPosition.z + (Math.random() - 0.5) * 100;
            }
        }
        
        this.rainGeometry.attributes.position.needsUpdate = true;
    }
    
    createPuddles() {
        // Random puddles on the road for realism - larger map
        const puddleCount = this.isMobile ? 14 : 28;
        for (let i = 0; i < puddleCount; i++) {
            const puddleGeometry = new THREE.CircleGeometry(0.5 + Math.random() * 1, 16);
            const puddleMaterial = new THREE.MeshStandardMaterial({
                color: 0x1a1a2e,
                roughness: 0.1,
                metalness: 0.8,
                transparent: true,
                opacity: 0.7
            });
            
            const puddle = new THREE.Mesh(puddleGeometry, puddleMaterial);
            puddle.rotation.x = -Math.PI / 2;
            puddle.position.set(
                (Math.random() - 0.5) * 10,
                0.02,
                (Math.random() - 0.5) * 260
            );
            puddle.scale.set(1 + Math.random(), 0.6 + Math.random() * 0.4, 1);
            this.scene.add(puddle);
        }
        
        // Some larger puddles near the road edges
        const edgePuddleCount = this.isMobile ? 6 : 12;
        for (let i = 0; i < edgePuddleCount; i++) {
            const puddleGeometry = new THREE.CircleGeometry(1.5 + Math.random() * 1.5, 16);
            const puddleMaterial = new THREE.MeshStandardMaterial({
                color: 0x151525,
                roughness: 0.05,
                metalness: 0.9,
                transparent: true,
                opacity: 0.6
            });
            
            const puddle = new THREE.Mesh(puddleGeometry, puddleMaterial);
            puddle.rotation.x = -Math.PI / 2;
            const side = Math.random() > 0.5 ? 1 : -1;
            puddle.position.set(
                side * (6 + Math.random() * 3),
                0.02,
                (Math.random() - 0.5) * 220
            );
            this.scene.add(puddle);
        }
        
        // Store puddle positions for splash effects
        this.puddlePositions = [];
        // Will be populated during gameplay for splash detection
    }
    
    // Create rain splash particle system
    createSplashParticle(x, z) {
        // Check if we have room for more splashes
        if (this.splashParticles.length >= this.maxSplashes) {
            // Reuse oldest splash
            const oldSplash = this.splashParticles.shift();
            oldSplash.position.set(x, 0.05, z);
            oldSplash.scale.set(0.1, 0.1, 0.1);
            oldSplash.material.opacity = 0.8;
            oldSplash.userData.life = 0;
            this.splashParticles.push(oldSplash);
            return;
        }
        
        // Create new splash ring
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
        if (this.isMobile) {
            this.splashUpdateAccumulator += deltaTime;
            if (this.splashUpdateAccumulator < 1 / 30) {
                return;
            }
            deltaTime = this.splashUpdateAccumulator;
            this.splashUpdateAccumulator = 0;
        }
        // Spawn new splashes near player (simulating rain hitting ground)
        const splashChance = this.isMobile ? 0.15 : 0.3;
        if (Math.random() < splashChance) {
            const x = cameraPosition.x + (Math.random() - 0.5) * 20;
            const z = cameraPosition.z + (Math.random() - 0.5) * 20;
            // Only splash on/near road
            if (Math.abs(x) < 8) {
                this.createSplashParticle(x, z);
            }
        }
        
        // Update existing splashes
        for (let i = this.splashParticles.length - 1; i >= 0; i--) {
            const splash = this.splashParticles[i];
            splash.userData.life += deltaTime;
            
            const progress = splash.userData.life / splash.userData.maxLife;
            
            // Expand and fade
            const scale = 0.1 + progress * 0.4;
            splash.scale.set(scale, scale, scale);
            splash.material.opacity = 0.8 * (1 - progress);
            
            // Remove when done
            if (splash.userData.life >= splash.userData.maxLife) {
                this.scene.remove(splash);
                this.splashParticles.splice(i, 1);
            }
        }
    }
    
    createMoonlight() {
        // Distant moonlight through clouds - very dim and blue-ish
        const moonlight = new THREE.DirectionalLight(0x6666aa, 0.08);
        moonlight.position.set(20, 50, 10);
        moonlight.castShadow = true;
        moonlight.shadow.mapSize.width = 512;
        moonlight.shadow.mapSize.height = 512;
        this.scene.add(moonlight);
    }
    
    triggerCameraShake(intensity = 0.15) {
        this.cameraShake.intensity = intensity;
    }
    
    updateCameraShake() {
        if (this.cameraShake.intensity > 0.001) {
            this.cameraOffset.set(
                (Math.random() - 0.5) * this.cameraShake.intensity,
                (Math.random() - 0.5) * this.cameraShake.intensity,
                (Math.random() - 0.5) * this.cameraShake.intensity
            );
            this.cameraShake.intensity *= this.cameraShake.decay;
        } else {
            this.cameraOffset.set(0, 0, 0);
        }
    }
    
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        const maxPixelRatio = this.isMobile ? 1.5 : 2;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
    }
    
    render() {
        this.updateCameraShake();
        
        // Apply camera shake offset
        const originalPosition = this.camera.position.clone();
        this.camera.position.add(this.cameraOffset);
        
        this.renderer.render(this.scene, this.camera);
        
        // Restore camera position
        this.camera.position.copy(originalPosition);
    }
}
