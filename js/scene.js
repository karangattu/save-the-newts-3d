// scene.js - Three.js scene setup with road, environment, and camera shake
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Shared materials (created once, reused everywhere)
const SHARED_MATERIALS = {
    road: null,
    roadLine: null,
    roadDash: null,
    metal: null,
    wood: null,
    rock: null,
    darkGreen: null,
    trunk: null,
    foliage: null,
    bush: null
};

function initSharedMaterials() {
    if (SHARED_MATERIALS.road) return; // Already initialized
    
    SHARED_MATERIALS.road = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a, roughness: 0.3, metalness: 0.4
    });
    SHARED_MATERIALS.roadLine = new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.5
    });
    SHARED_MATERIALS.roadDash = new THREE.MeshStandardMaterial({
        color: 0xffcc00, roughness: 0.5
    });
    SHARED_MATERIALS.metal = new THREE.MeshStandardMaterial({
        color: 0x666666, metalness: 0.6, roughness: 0.4
    });
    SHARED_MATERIALS.wood = new THREE.MeshStandardMaterial({
        color: 0x4a3526, roughness: 0.9
    });
    SHARED_MATERIALS.rock = new THREE.MeshStandardMaterial({
        color: 0x555555, roughness: 0.9
    });
    SHARED_MATERIALS.darkGreen = new THREE.MeshStandardMaterial({
        color: 0x333333, roughness: 0.8
    });
    SHARED_MATERIALS.trunk = new THREE.MeshStandardMaterial({
        color: 0x1a1510, roughness: 1
    });
    SHARED_MATERIALS.foliage = new THREE.MeshStandardMaterial({
        color: 0x0a1a0a, roughness: 1
    });
    SHARED_MATERIALS.bush = new THREE.MeshStandardMaterial({
        color: 0x0d1a0d, roughness: 1
    });
}

export class GameScene {
    constructor(isMobile = false) {
        initSharedMaterials();
        this.scene = new THREE.Scene();
        this.camera = null;
        this.renderer = null;
        this.cameraShake = { intensity: 0, decay: 0.9 };
        this.cameraOffset = new THREE.Vector3();
        this.isMobile = isMobile;
        
        // Splash particles
        this.splashParticles = [];
        this.splashPool = [];
        this.maxSplashes = isMobile ? 8 : 15;  // Further reduced for performance
        this.rainUpdateAccumulator = 0;
        this.splashUpdateAccumulator = 0;
        this.updateFrameCounter = 0;  // Throttle updates
        
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
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: !this.isMobile,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        const maxPixelRatio = this.isMobile ? 1.5 : 2;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
        this.renderer.shadowMap.enabled = false;  // Disabled for performance
        
        // Dark rainy night sky
        this.scene.background = new THREE.Color(0x030308);
        
        // Add fog for atmosphere (reduced density for performance)
        this.scene.fog = new THREE.FogExp2(0x030308, this.isMobile ? 0.04 : 0.03);
        
        // Create environment
        this.createRoad();
        this.createGrass();
        this.createTrees();
        this.createStars();
        // Rain removed for performance
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
        // Road dimensions - MUCH LONGER for exploration
        const roadWidth = 12;
        const roadLength = 600;  // 3x longer for exploration
        
        // Create curved road using multiple segments
        this.createCurvedRoad(roadWidth, roadLength);
        
        // Add interesting roadside objects
        this.createRoadsideObjects(roadLength);
        
        // Store road bounds for player movement - extended for longer map
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
    
    createCurvedRoad(roadWidth, roadLength) {
        // OPTIMIZED: Merge all road segments into single geometries
        const segmentLength = 50;  // Larger segments, fewer objects
        const numSegments = Math.ceil(roadLength / segmentLength);
        
        const roadGeometries = [];
        const leftLineGeometries = [];
        const rightLineGeometries = [];
        
        // Collect all geometries
        for (let i = 0; i < numSegments; i++) {
            const z = -roadLength/2 + i * segmentLength + segmentLength/2;
            
            // Main road segment
            const roadGeometry = new THREE.PlaneGeometry(roadWidth, segmentLength + 0.5);
            roadGeometry.rotateX(-Math.PI / 2);
            roadGeometry.translate(0, 0, z);
            roadGeometries.push(roadGeometry);
            
            // Edge lines
            const leftLineGeometry = new THREE.PlaneGeometry(0.3, segmentLength + 0.5);
            leftLineGeometry.rotateX(-Math.PI / 2);
            leftLineGeometry.translate(-roadWidth/2 + 0.5, 0.01, z);
            leftLineGeometries.push(leftLineGeometry);
            
            const rightLineGeometry = new THREE.PlaneGeometry(0.3, segmentLength + 0.5);
            rightLineGeometry.rotateX(-Math.PI / 2);
            rightLineGeometry.translate(roadWidth/2 - 0.5, 0.01, z);
            rightLineGeometries.push(rightLineGeometry);
        }
        
        // Merge and create single meshes
        const mergedRoad = new THREE.Mesh(mergeGeometries(roadGeometries), SHARED_MATERIALS.road);
        mergedRoad.receiveShadow = true;
        this.scene.add(mergedRoad);
        this.roadMesh = mergedRoad;
        
        const mergedLeftLine = new THREE.Mesh(mergeGeometries(leftLineGeometries), SHARED_MATERIALS.roadLine);
        this.scene.add(mergedLeftLine);
        
        const mergedRightLine = new THREE.Mesh(mergeGeometries(rightLineGeometries), SHARED_MATERIALS.roadLine);
        this.scene.add(mergedRightLine);
        
        // Center dashed lines - merge into single geometry
        const dashGeometries = [];
        for (let z = -roadLength/2; z < roadLength/2; z += 8) {  // Wider spacing
            const dashGeometry = new THREE.PlaneGeometry(0.2, 3);
            dashGeometry.rotateX(-Math.PI / 2);
            dashGeometry.translate(0, 0.01, z);
            dashGeometries.push(dashGeometry);
        }
        const mergedDashes = new THREE.Mesh(mergeGeometries(dashGeometries), SHARED_MATERIALS.roadDash);
        this.scene.add(mergedDashes);
    }
    
    createRoadsideObjects(roadLength) {
        // Street lamps along the road
        this.createStreetLamps(roadLength);
        
        // Guard rails on cliff side
        this.createGuardRails(roadLength);
        
        // Mile markers
        this.createMileMarkers(roadLength);
        
        // Benches and rest areas
        this.createRestAreas(roadLength);
        
        // Fallen logs and natural debris
        this.createNaturalDebris(roadLength);
        
        // Road signs
        this.createRoadSigns(roadLength);
        
        // Mailboxes (abandoned)
        this.createMailboxes(roadLength);
        
        // Old cars/vehicles (removed for performance)
        // this.createAbandonedVehicles(roadLength);
    }
    
    createStreetLamps(roadLength) {
        // OPTIMIZED: Fewer lamps, no dynamic lights, merged geometries
        const lampSpacing = 150;  // Even wider spacing for performance
        const lampCount = Math.floor(roadLength / lampSpacing);
        
        const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const lampHeadMaterial = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
        
        // Merge pole geometries
        const poleGeometries = [];
        const armGeometries = [];
        const headGeometries = [];
        
        for (let i = 0; i < lampCount; i++) {
            const z = -roadLength/2 + i * lampSpacing + 40;
            const side = i % 2 === 0 ? -1 : 1;
            const x = side * 7.5;
            
            // Lamp pole
            const poleGeometry = new THREE.CylinderGeometry(0.08, 0.1, 4, 6);
            poleGeometry.translate(x, 2, z);
            poleGeometries.push(poleGeometry);
            
            // Lamp arm
            const armGeometry = new THREE.CylinderGeometry(0.04, 0.04, 1.5, 6);
            armGeometry.rotateZ(Math.PI / 2 * -side);
            armGeometry.translate(x - side * 0.5, 3.8, z);
            armGeometries.push(armGeometry);
            
            // Lamp head
            const lampHeadGeometry = new THREE.CylinderGeometry(0.2, 0.15, 0.3, 6);
            lampHeadGeometry.translate(x - side * 1.2, 3.7, z);
            headGeometries.push(lampHeadGeometry);
        }
        
        if (poleGeometries.length > 0) {
            const mergedPoles = new THREE.Mesh(mergeGeometries(poleGeometries), poleMaterial);
            mergedPoles.castShadow = true;
            this.scene.add(mergedPoles);
            
            const mergedArms = new THREE.Mesh(mergeGeometries(armGeometries), poleMaterial);
            this.scene.add(mergedArms);
            
            const mergedHeads = new THREE.Mesh(mergeGeometries(headGeometries), lampHeadMaterial);
            this.scene.add(mergedHeads);
        }
    }
    
    createGuardRails(roadLength) {
        // OPTIMIZED: Merge all posts and rails into single geometries
        const postGeometries = [];
        const railGeometries = [];
        
        // Guard rail posts - wider spacing
        for (let z = -roadLength/2 + 5; z < roadLength/2 - 5; z += 8) {
            const postGeometry = new THREE.BoxGeometry(0.08, 0.8, 0.08);
            postGeometry.translate(7, 0.4, z);
            postGeometries.push(postGeometry);
        }
        
        // Horizontal rail sections
        for (let z = -roadLength/2 + 20; z < roadLength/2 - 20; z += 40) {
            const railGeometry = new THREE.BoxGeometry(0.05, 0.3, 40);
            railGeometry.translate(7, 0.5, z);
            railGeometries.push(railGeometry);
        }
        
        if (postGeometries.length > 0) {
            const mergedPosts = new THREE.Mesh(mergeGeometries(postGeometries), SHARED_MATERIALS.metal);
            this.scene.add(mergedPosts);
        }
        if (railGeometries.length > 0) {
            const mergedRails = new THREE.Mesh(mergeGeometries(railGeometries), SHARED_MATERIALS.metal);
            this.scene.add(mergedRails);
        }
    }
    
    createMileMarkers(roadLength) {
        // OPTIMIZED: Merged geometries for mile markers
        const markerMaterial = new THREE.MeshStandardMaterial({
            color: 0x228833,
            roughness: 0.7
        });
        const reflectorMaterial = new THREE.MeshStandardMaterial({
            color: 0xffff00,
            emissive: 0x444400,
            emissiveIntensity: 0.5
        });
        
        const postGeometries = [];
        const reflectorGeometries = [];
        
        const markerCount = Math.floor(roadLength / 150);  // Wider spacing
        for (let i = 0; i < markerCount; i++) {
            const z = -roadLength/2 + i * 150 + 75;
            
            const postGeometry = new THREE.BoxGeometry(0.15, 1, 0.1);
            postGeometry.translate(-7.5, 0.5, z);
            postGeometries.push(postGeometry);
            
            const reflectorGeometry = new THREE.BoxGeometry(0.12, 0.12, 0.02);
            reflectorGeometry.translate(-7.5, 0.8, z + 0.06);
            reflectorGeometries.push(reflectorGeometry);
        }
        
        if (postGeometries.length > 0) {
            const mergedPosts = new THREE.Mesh(mergeGeometries(postGeometries), markerMaterial);
            this.scene.add(mergedPosts);
            
            const mergedReflectors = new THREE.Mesh(mergeGeometries(reflectorGeometries), reflectorMaterial);
            this.scene.add(mergedReflectors);
        }
    }
    
    createRestAreas(roadLength) {
        // OPTIMIZED: Fewer rest areas, simpler geometry
        const restAreaPositions = [0];  // Just one rest area in the middle
        const padMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
        
        restAreaPositions.forEach((z, index) => {
            if (z < -roadLength/2 + 20 || z > roadLength/2 - 20) return;
            
            const x = -9;
            
            // Concrete pad
            const padGeometry = new THREE.BoxGeometry(3, 0.1, 4);
            const pad = new THREE.Mesh(padGeometry, padMaterial);
            pad.position.set(x, 0.05, z);
            this.scene.add(pad);
            
            // Simple bench (merged into one mesh)
            this.createBench(x, z);
        });
    }
    
    createBench(x, z) {
        const woodMaterial = new THREE.MeshStandardMaterial({
            color: 0x4a3526,
            roughness: 0.9
        });
        const metalMaterial = new THREE.MeshStandardMaterial({
            color: 0x333333,
            metalness: 0.5
        });
        
        // Bench seat
        const seatGeometry = new THREE.BoxGeometry(1.5, 0.08, 0.4);
        const seat = new THREE.Mesh(seatGeometry, woodMaterial);
        seat.position.set(x, 0.5, z);
        this.scene.add(seat);
        
        // Bench backrest
        const backGeometry = new THREE.BoxGeometry(1.5, 0.5, 0.08);
        const back = new THREE.Mesh(backGeometry, woodMaterial);
        back.position.set(x, 0.75, z - 0.2);
        back.rotation.x = 0.1;
        this.scene.add(back);
        
        // Bench legs
        const legGeometry = new THREE.BoxGeometry(0.08, 0.5, 0.4);
        [-0.6, 0.6].forEach(offset => {
            const leg = new THREE.Mesh(legGeometry, metalMaterial);
            leg.position.set(x + offset, 0.25, z);
            this.scene.add(leg);
        });
    }
    
    createNaturalDebris(roadLength) {
        // OPTIMIZED: Reduced count, merged geometries by type
        const debrisCount = this.isMobile ? 4 : 8;  // Further reduced for performance
        
        const branchGeometries = [];
        const rockGeometries = [];
        const logGeometries = [];
        
        const branchMaterial = new THREE.MeshStandardMaterial({ color: 0x3d2817 });
        const logMaterial = new THREE.MeshStandardMaterial({ color: 0x2d1f14 });
        
        for (let i = 0; i < debrisCount; i++) {
            const z = (Math.random() - 0.5) * (roadLength - 40);
            const side = Math.random() > 0.5 ? -1 : 1;
            const x = side * (8 + Math.random() * 6);
            
            const type = Math.random();
            
            if (type < 0.4) {
                const branchGeometry = new THREE.CylinderGeometry(0.05, 0.08, 1.5, 5);
                branchGeometry.rotateZ(Math.PI / 2);
                branchGeometry.rotateY(Math.random() * Math.PI);
                branchGeometry.translate(x, 0.1, z);
                branchGeometries.push(branchGeometry);
            } else if (type < 0.7) {
                const rockGeometry = new THREE.DodecahedronGeometry(0.2, 0);
                rockGeometry.translate(x, 0.1, z);
                rockGeometries.push(rockGeometry);
            } else {
                const logGeometry = new THREE.CylinderGeometry(0.2, 0.25, 2.5, 6);
                logGeometry.rotateZ(Math.PI / 2);
                logGeometry.translate(x, 0.2, z);
                logGeometries.push(logGeometry);
            }
        }
        
        if (branchGeometries.length > 0) {
            const mergedBranches = new THREE.Mesh(mergeGeometries(branchGeometries), branchMaterial);
            this.scene.add(mergedBranches);
        }
        if (rockGeometries.length > 0) {
            const mergedRocks = new THREE.Mesh(mergeGeometries(rockGeometries), SHARED_MATERIALS.rock);
            this.scene.add(mergedRocks);
        }
        if (logGeometries.length > 0) {
            const mergedLogs = new THREE.Mesh(mergeGeometries(logGeometries), logMaterial);
            this.scene.add(mergedLogs);
        }
    }
    
    createRoadSigns(roadLength) {
        // OPTIMIZED: Fewer signs (only 1 for performance)
        const signPositions = [
            { z: 0, type: 'wildlife', side: -1 }
        ];
        
        const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x666666 });
        
        signPositions.forEach(signData => {
            if (signData.z < -roadLength/2 + 20 || signData.z > roadLength/2 - 20) return;
            
            const x = signData.side * 8;
            
            // Sign pole
            const poleGeometry = new THREE.CylinderGeometry(0.04, 0.04, 2.5, 6);
            const pole = new THREE.Mesh(poleGeometry, poleMaterial);
            pole.position.set(x, 1.25, signData.z);
            this.scene.add(pole);
            
            // Sign face
            let signColor, signShape;
            switch(signData.type) {
                case 'speed':
                    signColor = 0xffffff;
                    signShape = new THREE.CircleGeometry(0.35, 16);
                    break;
                case 'curve':
                    signColor = 0xffcc00;
                    signShape = new THREE.PlaneGeometry(0.6, 0.6);
                    break;
                case 'wildlife':
                    signColor = 0xffcc00;
                    signShape = new THREE.PlaneGeometry(0.6, 0.6);
                    break;
            }
            
            const signMaterial = new THREE.MeshStandardMaterial({
                color: signColor,
                roughness: 0.5,
                emissive: signColor,
                emissiveIntensity: 0.1
            });
            const sign = new THREE.Mesh(signShape, signMaterial);
            sign.position.set(x, 2.3, signData.z);
            sign.rotation.y = signData.side > 0 ? -Math.PI / 2 : Math.PI / 2;
            this.scene.add(sign);
        });
    }
    
    createMailboxes(roadLength) {
        // OPTIMIZED: Fewer mailboxes, merged geometries
        const mailboxCount = this.isMobile ? 1 : 2;  // Further reduced for performance
        const postMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3520 });
        const postGeometries = [];
        
        for (let i = 0; i < mailboxCount; i++) {
            const z = -roadLength/2 + 100 + i * (roadLength / mailboxCount);
            const x = -8.5;
            
            const postGeometry = new THREE.BoxGeometry(0.1, 1.2, 0.1);
            postGeometry.translate(x, 0.6, z);
            postGeometries.push(postGeometry);
            
            // Mailbox body (individual due to different colors)
            const bodyGeometry = new THREE.BoxGeometry(0.25, 0.2, 0.4);
            const bodyMaterial = new THREE.MeshStandardMaterial({
                color: i % 2 === 0 ? 0x333333 : 0x8b0000,
                roughness: 0.8
            });
            const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
            body.position.set(x, 1.15, z);
            body.rotation.z = (Math.random() - 0.5) * 0.15;
            this.scene.add(body);
        }
        
        if (postGeometries.length > 0) {
            const mergedPosts = new THREE.Mesh(mergeGeometries(postGeometries), postMaterial);
            this.scene.add(mergedPosts);
        }
    }
    
    createAbandonedVehicles(roadLength) {
        // A few abandoned vehicles for atmosphere
        const vehiclePositions = [
            { z: -180, x: -10, rotation: 0.3 },
            { z: 120, x: 9, rotation: -0.2 }
        ];
        
        vehiclePositions.forEach(pos => {
            if (pos.z < -roadLength/2 + 30 || pos.z > roadLength/2 - 30) return;
            
            // Simple car shape
            const bodyMaterial = new THREE.MeshStandardMaterial({
                color: Math.random() > 0.5 ? 0x2a2a2a : 0x3d2a1a,
                roughness: 0.9
            });
            
            // Car body
            const bodyGeometry = new THREE.BoxGeometry(2, 0.8, 4);
            const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
            body.position.set(pos.x, 0.5, pos.z);
            body.rotation.y = pos.rotation;
            this.scene.add(body);
            
            // Car top
            const topGeometry = new THREE.BoxGeometry(1.6, 0.6, 2);
            const top = new THREE.Mesh(topGeometry, bodyMaterial);
            top.position.set(pos.x, 1.1, pos.z);
            top.rotation.y = pos.rotation;
            this.scene.add(top);
            
            // Windows (dark)
            const windowMaterial = new THREE.MeshStandardMaterial({
                color: 0x111111,
                roughness: 0.2
            });
            const windowGeometry = new THREE.PlaneGeometry(1.4, 0.4);
            
            // Front window
            const frontWindow = new THREE.Mesh(windowGeometry, windowMaterial);
            frontWindow.position.set(
                pos.x + Math.sin(pos.rotation) * 0.8,
                1.1,
                pos.z + Math.cos(pos.rotation) * 0.8
            );
            frontWindow.rotation.y = pos.rotation;
            this.scene.add(frontWindow);
        });
    }
    
    createGrass() {
        const grassLength = 600;  // Match the longer road
        
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
        
        // Additional grass patches along the road shoulders
        const shoulderMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a3d1a,
            roughness: 0.95
        });
        
        // Left shoulder
        const leftShoulderGeometry = new THREE.PlaneGeometry(3, grassLength);
        const leftShoulder = new THREE.Mesh(leftShoulderGeometry, shoulderMaterial);
        leftShoulder.rotation.x = -Math.PI / 2;
        leftShoulder.position.set(-7.5, -0.005, 0);
        this.scene.add(leftShoulder);
        
        // Right shoulder  
        const rightShoulderGeometry = new THREE.PlaneGeometry(3, grassLength);
        const rightShoulder = new THREE.Mesh(rightShoulderGeometry, shoulderMaterial);
        rightShoulder.rotation.x = -Math.PI / 2;
        rightShoulder.position.set(7.5, -0.005, 0);
        this.scene.add(rightShoulder);
        
        // Create the cliff face (vertical drop)
        this.createCliff();
        
        // Create the reservoir below
        this.createReservoir();
    }
    
    createCliff() {
        const cliffLength = 600;  // Match longer road
        
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
        
        // OPTIMIZED: Use InstancedMesh for rocks, reduced count
        const rockCount = this.isMobile ? 4 : 8;  // Further reduced for performance
        const rockGeometry = new THREE.DodecahedronGeometry(0.4, 0);
        const rockMesh = new THREE.InstancedMesh(rockGeometry, SHARED_MATERIALS.rock, rockCount);
        
        const dummy = new THREE.Object3D();
        for (let i = 0; i < rockCount; i++) {
            dummy.position.set(
                18 + Math.random() * 3,
                0.1,
                (Math.random() - 0.5) * 560
            );
            dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
            dummy.scale.setScalar(0.5 + Math.random() * 1);
            dummy.updateMatrix();
            rockMesh.setMatrixAt(i, dummy.matrix);
        }
        rockMesh.instanceMatrix.needsUpdate = true;
        this.scene.add(rockMesh);
        
        // Warning signs along cliff edge - fewer signs
        for (let z = -280; z <= 280; z += 200) {  // Even wider spacing
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
        // Water surface - larger for longer map
        const waterGeometry = new THREE.PlaneGeometry(100, 600);
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
        
        // OPTIMIZED: Single water light instead of multiple
        const waterLight = new THREE.PointLight(0x1a5a8c, 0.5, 100);
        waterLight.position.set(40, -20, 0);
        this.scene.add(waterLight);
    }
    
    createTrees() {
        // OPTIMIZED: Significantly fewer trees, using InstancedMesh
        const treeCount = this.isMobile ? 15 : 30;  // Further reduced for performance
        
        // Create instanced meshes for trunks and foliage
        const trunkGeometry = new THREE.CylinderGeometry(0.35, 0.5, 4, 5);
        const foliageGeometry = new THREE.ConeGeometry(3, 6, 6);
        
        const trunkMesh = new THREE.InstancedMesh(trunkGeometry, SHARED_MATERIALS.trunk, treeCount);
        const foliageMesh = new THREE.InstancedMesh(foliageGeometry, SHARED_MATERIALS.foliage, treeCount);
        
        const dummy = new THREE.Object3D();
        
        for (let i = 0; i < treeCount; i++) {
            const x = -(12 + Math.random() * 40);
            const z = (Math.random() - 0.5) * 560;
            const scale = 0.6 + Math.random() * 0.8;
            
            // Trunk
            dummy.position.set(x, 2 * scale, z);
            dummy.scale.set(scale, scale, scale);
            dummy.updateMatrix();
            trunkMesh.setMatrixAt(i, dummy.matrix);
            
            // Foliage
            dummy.position.set(x, 5 * scale, z);
            dummy.scale.set(scale, scale + Math.random() * 0.3, scale);
            dummy.updateMatrix();
            foliageMesh.setMatrixAt(i, dummy.matrix);
        }
        
        trunkMesh.instanceMatrix.needsUpdate = true;
        foliageMesh.instanceMatrix.needsUpdate = true;
        
        this.scene.add(trunkMesh);
        this.scene.add(foliageMesh);
        
        // OPTIMIZED: Fewer bushes using InstancedMesh
        const bushCount = this.isMobile ? 4 : 8;  // Further reduced for performance
        const bushGeometry = new THREE.SphereGeometry(0.6, 5, 4);
        const bushMesh = new THREE.InstancedMesh(bushGeometry, SHARED_MATERIALS.bush, bushCount);
        
        for (let i = 0; i < bushCount; i++) {
            dummy.position.set(
                -(10 + Math.random() * 15),
                0.3,
                (Math.random() - 0.5) * 560
            );
            dummy.scale.set(1, 0.6, 1);
            dummy.updateMatrix();
            bushMesh.setMatrixAt(i, dummy.matrix);
        }
        
        bushMesh.instanceMatrix.needsUpdate = true;
        this.scene.add(bushMesh);
    }
    
    createStars() {
        const starGeometry = new THREE.BufferGeometry();
        const starCount = this.isMobile ? 50 : 100;
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
        // OPTIMIZED: Reduced rain particle count significantly
        const rainCount = this.isMobile ? 1500 : 3000;  // Reduced for smoother FPS
        const rainGeometry = new THREE.BufferGeometry();
        
        const positions = new Float32Array(rainCount * 3);
        const velocities = new Float32Array(rainCount);
        
        for (let i = 0; i < rainCount; i++) {
            // Spread rain over a large area around player
            positions[i * 3] = (Math.random() - 0.5) * 80;
            positions[i * 3 + 1] = Math.random() * 40;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 80;
            
            // Random fall speed
            velocities[i] = 0.5 + Math.random() * 0.5;
        }
        
        rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        // Store velocities for animation
        this.rainVelocities = velocities;
        this.rainGeometry = rainGeometry;
        
        const rainMaterial = new THREE.PointsMaterial({
            color: 0x8899aa,
            size: 0.12,  // Slightly larger to compensate for fewer particles
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });
        
        this.rain = new THREE.Points(rainGeometry, rainMaterial);
        this.scene.add(this.rain);
    }
    
    updateRain(deltaTime, cameraPosition) {
        if (!this.rain) return;
        
        // Throttle updates - only update every other frame
        this.updateFrameCounter++;
        if (this.updateFrameCounter % 2 !== 0 && !this.isMobile) {
            return;
        }
        
        if (this.isMobile) {
            this.rainUpdateAccumulator += deltaTime;
            if (this.rainUpdateAccumulator < 1 / 20) {  // Slower mobile updates
                return;
            }
            deltaTime = this.rainUpdateAccumulator;
            this.rainUpdateAccumulator = 0;
        }
        
        const positions = this.rainGeometry.attributes.position.array;
        const rainCount = positions.length / 3;
        const speed = deltaTime * 30;
        const windSpeed = deltaTime * 2;
        
        // Batch update for better cache performance
        for (let i = 0; i < rainCount; i++) {
            const idx = i * 3;
            
            // Fall down
            positions[idx + 1] -= this.rainVelocities[i] * speed;
            
            // Add slight wind effect
            positions[idx] += windSpeed;
            
            // Reset when hitting ground
            if (positions[idx + 1] < 0) {
                positions[idx] = cameraPosition.x + (Math.random() - 0.5) * 100;
                positions[idx + 1] = 40 + Math.random() * 10;
                positions[idx + 2] = cameraPosition.z + (Math.random() - 0.5) * 100;
            }
        }
        
        this.rainGeometry.attributes.position.needsUpdate = true;
    }
    
    createPuddles() {
        // OPTIMIZED: Merged puddle geometries, reduced counts
        const puddleGeometries = [];
        const edgePuddleGeometries = [];
        
        const puddleMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a2e,
            roughness: 0.1,
            metalness: 0.8,
            transparent: true,
            opacity: 0.7
        });
        
        const edgePuddleMaterial = new THREE.MeshStandardMaterial({
            color: 0x151525,
            roughness: 0.05,
            metalness: 0.9,
            transparent: true,
            opacity: 0.6
        });
        
        // Road puddles - reduced count
        const puddleCount = this.isMobile ? 6 : 12;  // Further reduced for performance
        for (let i = 0; i < puddleCount; i++) {
            const puddleGeometry = new THREE.CircleGeometry(0.8 + Math.random() * 0.8, 6);  // Even fewer segments
            puddleGeometry.rotateX(-Math.PI / 2);
            puddleGeometry.translate(
                (Math.random() - 0.5) * 10,
                0.02,
                (Math.random() - 0.5) * 560
            );
            puddleGeometries.push(puddleGeometry);
        }
        
        // Edge puddles - reduced count
        const edgePuddleCount = this.isMobile ? 3 : 6;  // Further reduced for performance
        for (let i = 0; i < edgePuddleCount; i++) {
            const puddleGeometry = new THREE.CircleGeometry(1.8, 8);  // Fewer segments
            puddleGeometry.rotateX(-Math.PI / 2);
            const side = Math.random() > 0.5 ? 1 : -1;
            puddleGeometry.translate(
                side * (6 + Math.random() * 3),
                0.02,
                (Math.random() - 0.5) * 500
            );
            edgePuddleGeometries.push(puddleGeometry);
        }
        
        // Create merged meshes
        if (puddleGeometries.length > 0) {
            const mergedPuddles = new THREE.Mesh(mergeGeometries(puddleGeometries), puddleMaterial);
            this.scene.add(mergedPuddles);
        }
        if (edgePuddleGeometries.length > 0) {
            const mergedEdgePuddles = new THREE.Mesh(mergeGeometries(edgePuddleGeometries), edgePuddleMaterial);
            this.scene.add(mergedEdgePuddles);
        }
        
        // Store puddle positions for splash effects
        this.puddlePositions = [];
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
            if (this.splashUpdateAccumulator < 1 / 20) {  // Slower updates
                return;
            }
            deltaTime = this.splashUpdateAccumulator;
            this.splashUpdateAccumulator = 0;
        }
        // Spawn new splashes near player (reduced rate)
        const splashChance = this.isMobile ? 0.05 : 0.1;  // Significantly reduced
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
        moonlight.castShadow = false;  // Disabled for performance
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
