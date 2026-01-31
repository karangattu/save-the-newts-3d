// scene.js - Three.js scene setup with road, environment, and camera shake
import * as THREE from 'three';

export class GameScene {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = null;
        this.renderer = null;
        this.cameraShake = { intensity: 0, decay: 0.9 };
        this.cameraOffset = new THREE.Vector3();
        
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
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // Dark rainy night sky
        this.scene.background = new THREE.Color(0x030308);
        
        // Add fog for atmosphere and limiting visibility (denser for rain)
        this.scene.fog = new THREE.FogExp2(0x030308, 0.05);
        
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
        // Road dimensions
        const roadWidth = 12;
        const roadLength = 200;
        
        // Main road surface
        const roadGeometry = new THREE.PlaneGeometry(roadWidth, roadLength);
        const roadMaterial = new THREE.MeshStandardMaterial({
            color: 0x222222,
            roughness: 0.9,
            metalness: 0.1
        });
        const road = new THREE.Mesh(roadGeometry, roadMaterial);
        road.rotation.x = -Math.PI / 2;
        road.position.y = 0;
        road.receiveShadow = true;
        this.scene.add(road);
        
        // Road edge lines (white)
        const lineGeometry = new THREE.PlaneGeometry(0.3, roadLength);
        const lineMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.5
        });
        
        const leftLine = new THREE.Mesh(lineGeometry, lineMaterial);
        leftLine.rotation.x = -Math.PI / 2;
        leftLine.position.set(-roadWidth/2 + 0.5, 0.01, 0);
        this.scene.add(leftLine);
        
        const rightLine = new THREE.Mesh(lineGeometry, lineMaterial);
        rightLine.rotation.x = -Math.PI / 2;
        rightLine.position.set(roadWidth/2 - 0.5, 0.01, 0);
        this.scene.add(rightLine);
        
        // Center dashed lines (yellow)
        const dashMaterial = new THREE.MeshStandardMaterial({
            color: 0xffcc00,
            roughness: 0.5
        });
        
        for (let z = -roadLength/2; z < roadLength/2; z += 6) {
            const dash = new THREE.Mesh(
                new THREE.PlaneGeometry(0.2, 3),
                dashMaterial
            );
            dash.rotation.x = -Math.PI / 2;
            dash.position.set(0, 0.01, z);
            this.scene.add(dash);
        }
        
        // Store road bounds for player movement
        // Extended bounds to allow entering danger zones
        this.roadBounds = {
            minX: -25,  // Deep into forest (danger zone starts at -15)
            maxX: 20,   // Over the cliff edge (danger zone starts at 12)
            minZ: -roadLength/2 + 10,
            maxZ: roadLength/2 - 10
        };
        
        // Danger zones
        this.dangerZones = {
            forest: -12,    // X position where forest danger begins
            cliff: 14       // X position where cliff danger begins
        };
    }
    
    createGrass() {
        const grassLength = 200;
        
        // Left side - Forest floor (darker, more mysterious)
        const forestFloorGeometry = new THREE.PlaneGeometry(50, grassLength);
        const forestFloorMaterial = new THREE.MeshStandardMaterial({
            color: 0x0d260d,
            roughness: 1.0
        });
        
        const forestFloor = new THREE.Mesh(forestFloorGeometry, forestFloorMaterial);
        forestFloor.rotation.x = -Math.PI / 2;
        forestFloor.position.set(-31, -0.01, 0);
        forestFloor.receiveShadow = true;
        this.scene.add(forestFloor);
        
        // Right side - Cliff edge with rocky texture
        const cliffEdgeGeometry = new THREE.PlaneGeometry(15, grassLength);
        const cliffEdgeMaterial = new THREE.MeshStandardMaterial({
            color: 0x3d3d3d,
            roughness: 0.95
        });
        
        const cliffEdge = new THREE.Mesh(cliffEdgeGeometry, cliffEdgeMaterial);
        cliffEdge.rotation.x = -Math.PI / 2;
        cliffEdge.position.set(13.5, -0.01, 0);
        cliffEdge.receiveShadow = true;
        this.scene.add(cliffEdge);
        
        // Create the cliff face (vertical drop)
        this.createCliff();
        
        // Create the reservoir below
        this.createReservoir();
    }
    
    createCliff() {
        const cliffLength = 200;
        
        // Cliff face - vertical wall
        const cliffGeometry = new THREE.PlaneGeometry(cliffLength, 30);
        const cliffMaterial = new THREE.MeshStandardMaterial({
            color: 0x4a4a4a,
            roughness: 1.0
        });
        
        const cliffFace = new THREE.Mesh(cliffGeometry, cliffMaterial);
        cliffFace.rotation.y = -Math.PI / 2;
        cliffFace.position.set(21, -15, 0);
        this.scene.add(cliffFace);
        
        // Add some rock formations on cliff edge
        for (let i = 0; i < 30; i++) {
            const rockGeometry = new THREE.DodecahedronGeometry(0.3 + Math.random() * 0.5, 0);
            const rockMaterial = new THREE.MeshStandardMaterial({
                color: 0x555555,
                roughness: 0.9
            });
            const rock = new THREE.Mesh(rockGeometry, rockMaterial);
            rock.position.set(
                18 + Math.random() * 3,
                0.1,
                (Math.random() - 0.5) * 180
            );
            rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
            this.scene.add(rock);
        }
        
        // Warning signs along cliff edge
        for (let z = -80; z <= 80; z += 40) {
            this.createWarningSign(15, z);
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
        // Water surface
        const waterGeometry = new THREE.PlaneGeometry(100, 200);
        const waterMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a3d5c,
            roughness: 0.1,
            metalness: 0.3,
            transparent: true,
            opacity: 0.9
        });
        
        const water = new THREE.Mesh(waterGeometry, waterMaterial);
        water.rotation.x = -Math.PI / 2;
        water.position.set(70, -28, 0);
        this.scene.add(water);
        
        // Subtle water glow for visibility
        const waterLight = new THREE.PointLight(0x1a5a8c, 0.5, 50);
        waterLight.position.set(40, -20, 0);
        this.scene.add(waterLight);
    }
    
    createTrees() {
        const treePositions = [];
        
        // Generate dense forest on LEFT side only (forest side)
        for (let i = 0; i < 150; i++) {
            const x = -(12 + Math.random() * 40); // Only negative X (left side)
            const z = (Math.random() - 0.5) * 180;
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
        for (let i = 0; i < 50; i++) {
            const bushGeometry = new THREE.SphereGeometry(0.5 + Math.random() * 0.5, 6, 6);
            const bushMaterial = new THREE.MeshStandardMaterial({
                color: 0x0d1a0d,
                roughness: 1
            });
            const bush = new THREE.Mesh(bushGeometry, bushMaterial);
            bush.position.set(
                -(10 + Math.random() * 15),
                0.3,
                (Math.random() - 0.5) * 180
            );
            bush.scale.y = 0.6;
            this.scene.add(bush);
        }
    }
    
    createStars() {
        const starGeometry = new THREE.BufferGeometry();
        const starCount = 500;
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
        const rainCount = 15000;
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
        // Random puddles on the road for realism
        for (let i = 0; i < 20; i++) {
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
                (Math.random() - 0.5) * 180
            );
            puddle.scale.set(1 + Math.random(), 0.6 + Math.random() * 0.4, 1);
            this.scene.add(puddle);
        }
        
        // Some larger puddles near the road edges
        for (let i = 0; i < 8; i++) {
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
                (Math.random() - 0.5) * 150
            );
            this.scene.add(puddle);
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
