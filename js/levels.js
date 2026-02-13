// levels.js - Level management and scene generation for 3 levels
// All 3 levels share the same Alma Bridge Road curve (Lexington Reservoir area)
// Level 1: Clear night  |  Level 2: Just after sunset  |  Level 3: Rain & wind storm
import * as THREE from 'three';

export class LevelManager {
    constructor(scene, camera, renderer, isMobile = false) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.isMobile = isMobile;
        this.currentLevel = 1;

        this.roadWidth = 12;
        this.roadLength = 520;
        this.roadCurveExtents = {
            minX: -20,
            maxX: 20,
            minZ: -this.roadLength / 2,
            maxZ: this.roadLength / 2
        };

        this.levelObjects = [];
        this.roadCurve = null;
        this.dangerZones = null;
        this.roadBounds = null;

        // Rain system
        this.rain = null;
        this.rainGeometry = null;
        this.rainVelocities = null;

        // Wind for level 3
        this.windStrength = 0;
        this.windDirection = new THREE.Vector3(1, 0, 0.3);
        this.windTime = 0;

        this.splashParticles = [];
        this.puddlePositions = [];

        // Moths (SF-realistic, not fireflies)
        this.moths = [];

        // Frame skipping for performance
        this.rainUpdateCounter = 0;
        this.rainUpdateInterval = 3; // Update GPU buffer every 3 frames instead of every frame
        this.mothUpdateCounter = 0;

        this.qualityLevel = isMobile ? 1 : 3;
        this.rainActiveFraction = this.qualityLevel <= 1 ? 0.45 : 1;
    }

    setQualityLevel(level) {
        this.qualityLevel = Math.max(0, Math.min(3, level | 0));

        if (this.qualityLevel <= 1) {
            this.rainUpdateInterval = 5;
            this.rainActiveFraction = 0.45;
        } else if (this.qualityLevel === 2) {
            this.rainUpdateInterval = 4;
            this.rainActiveFraction = 0.7;
        } else {
            this.rainUpdateInterval = 3;
            this.rainActiveFraction = 1;
        }
    }

    getDensityScale() {
        if (this.qualityLevel <= 1) return 0.55;
        if (this.qualityLevel === 2) return 0.75;
        return 1;
    }

    getScaledCount(count) {
        return Math.max(1, Math.floor(count * this.getDensityScale()));
    }

    loadLevel(levelNum) {
        this.currentLevel = levelNum;
        this.clearLevel();

        if (levelNum === 1) {
            this.createLevel1();
        } else if (levelNum === 2) {
            this.createLevel2();
        } else if (levelNum === 3) {
            this.createLevel3();
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

        if (this.rain) {
            this.scene.remove(this.rain);
            this.rain = null;
        }

        this.splashParticles.forEach(splash => this.scene.remove(splash));
        this.splashParticles = [];
        this.moths = [];
        this.windStrength = 0;
    }

    // ==================== ALMA BRIDGE ROAD CURVE (same for all 3 levels) ====================
    createAlmaBridgeRoadCurve() {
        const roadLength = this.roadLength;
        // Expanded winding shape with multiple bends for longer exploration.
        const curvePoints = [
            new THREE.Vector3(-18, 0, -roadLength / 2),
            new THREE.Vector3(-6, 0, -220),
            new THREE.Vector3(14, 0, -180),
            new THREE.Vector3(24, 0, -140),
            new THREE.Vector3(8, 0, -100),
            new THREE.Vector3(-12, 0, -60),
            new THREE.Vector3(-24, 0, -20),
            new THREE.Vector3(-10, 0, 20),
            new THREE.Vector3(12, 0, 60),
            new THREE.Vector3(26, 0, 100),
            new THREE.Vector3(10, 0, 140),
            new THREE.Vector3(-14, 0, 180),
            new THREE.Vector3(-2, 0, 220),
            new THREE.Vector3(18, 0, 250),
            new THREE.Vector3(6, 0, roadLength / 2),
        ];

        this.roadCurveExtents = curvePoints.reduce((acc, point) => ({
            minX: Math.min(acc.minX, point.x),
            maxX: Math.max(acc.maxX, point.x),
            minZ: Math.min(acc.minZ, point.z),
            maxZ: Math.max(acc.maxZ, point.z)
        }), {
            minX: Infinity,
            maxX: -Infinity,
            minZ: Infinity,
            maxZ: -Infinity
        });

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

        // Newt crossing signs along road
        const signCount = Math.max(8, Math.floor(this.roadLength / 65));
        for (let i = 0; i < signCount; i++) {
            const t = 0.08 + (i * (0.84 / Math.max(1, signCount - 1)));
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
        const warningStart = -this.roadLength / 2 + 40;
        const warningEnd = this.roadLength / 2 - 40;
        for (let z = warningStart; z <= warningEnd; z += 55) {
            this.createWarningSign(20, z);
        }
    }

    // ==================== SHARED ROAD CREATION ====================
    createRoad(wetness = 0) {
        const roadWidth = this.roadWidth;
        this.createAlmaBridgeRoadCurve();

        const roadSegments = Math.max(250, Math.floor(this.roadLength * 0.8));
        const roadGeometry = this.createRibbonGeometry(this.roadCurve, roadWidth, roadSegments);
        const roadMaterial = new THREE.MeshStandardMaterial({
            color: wetness > 0 ? 0x1a1a1a : 0x2a2a2a,
            roughness: wetness > 0 ? 0.2 : 0.4,
            metalness: wetness > 0 ? 0.4 : 0.2,
            side: THREE.DoubleSide
        });

        const road = new THREE.Mesh(roadGeometry, roadMaterial);
        road.position.y = 0.01;
        road.receiveShadow = !this.isMobile;
        this.scene.add(road);
        this.levelObjects.push(road);

        this.createRoadMarkings(roadWidth);

        const roadLength = this.roadLength;
        const minX = this.roadCurveExtents.minX - 24;
        const maxX = this.roadCurveExtents.maxX + 24;
        this.roadBounds = {
            minX,
            maxX,
            minZ: -roadLength / 2 + 10,
            maxZ: roadLength / 2 - 10
        };
        this.dangerZones = { forest: -12, cliff: 14 };
    }

    createRoadMarkings(roadWidth) {
        const edgeLinePoints = [];
        const steps = Math.max(120, Math.floor(this.roadLength / 2));

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const point = this.roadCurve.getPoint(t);
            const tangent = this.roadCurve.getTangent(t);
            const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
            edgeLinePoints.push(point.clone().add(normal.clone().multiplyScalar(-roadWidth / 2 + 0.5)));
            edgeLinePoints.push(point.clone().add(normal.clone().multiplyScalar(roadWidth / 2 - 0.5)));
        }

        const leftEdgeCurve = new THREE.CatmullRomCurve3(edgeLinePoints.filter((_, i) => i % 2 === 0));
        const rightEdgeCurve = new THREE.CatmullRomCurve3(edgeLinePoints.filter((_, i) => i % 2 === 1));
        const lineMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });

        const leftLine = new THREE.Mesh(new THREE.TubeGeometry(leftEdgeCurve, steps, 0.08, 4, false), lineMaterial);
        leftLine.position.y = 0.02;
        this.scene.add(leftLine);
        this.levelObjects.push(leftLine);

        const rightLine = new THREE.Mesh(new THREE.TubeGeometry(rightEdgeCurve, steps, 0.08, 4, false), lineMaterial);
        rightLine.position.y = 0.02;
        this.scene.add(rightLine);
        this.levelObjects.push(rightLine);

        const dashMaterial = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.5 });
        for (let i = 0; i < steps; i += 6) {
            const t = i / steps;
            const t2 = Math.min((i + 3) / steps, 1);
            const point1 = this.roadCurve.getPoint(t);
            const point2 = this.roadCurve.getPoint(t2);
            const dashLength = point1.distanceTo(point2);
            const dash = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, dashLength), dashMaterial);
            dash.position.copy(point1.clone().add(point2).multiplyScalar(0.5));
            dash.position.y = 0.02;
            dash.lookAt(point2);
            this.scene.add(dash);
            this.levelObjects.push(dash);
        }
    }

    // ==================== SHARED ENVIRONMENT ====================
    createCliff() {
        const cliffLength = this.roadLength + 40;
        const cliffFace = new THREE.Mesh(
            new THREE.PlaneGeometry(cliffLength, 30),
            new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 1.0 })
        );
        cliffFace.rotation.y = -Math.PI / 2;
        cliffFace.position.set(28, -15, 0);
        this.scene.add(cliffFace);
        this.levelObjects.push(cliffFace);

        const water = new THREE.Mesh(
            new THREE.PlaneGeometry(110, cliffLength),
            new THREE.MeshStandardMaterial({ color: 0x1a3d5c, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.9 })
        );
        water.rotation.x = -Math.PI / 2;
        water.position.set(80, -28, 0);
        this.scene.add(water);
        this.levelObjects.push(water);
    }

    createGrass(color = 0x0a1a0a) {
        const grassGeo = new THREE.PlaneGeometry(90, this.roadLength + 40);
        const grassMat = new THREE.MeshStandardMaterial({ color: color, roughness: 1.0 });

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

    createTrees(count, side) {
        if (this.isMobile) count = Math.floor(count * 0.5);
        count = this.getScaledCount(count);
        const trunkGeo = new THREE.CylinderGeometry(0.3, 0.5, 1, 6);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x1a1510, roughness: 1 });
        const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
        const foliageGeo = new THREE.ConeGeometry(1, 1, 8);
        const foliageMat = new THREE.MeshStandardMaterial({ color: 0x0a1a0a, roughness: 1 });
        const foliageMesh = new THREE.InstancedMesh(foliageGeo, foliageMat, count);

        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();

        const roadHalfWidth = this.roadWidth / 2;
        const safeOffset = roadHalfWidth + 4; // keep foliage off the shoulder

        for (let i = 0; i < count; i++) {
            const roadZ = (Math.random() - 0.5) * (this.roadLength - 40);
            const roadData = this.getRoadDataAtZ(roadZ);
            const sideDir = side || (Math.random() > 0.5 ? 1 : -1);
            const lateral = safeOffset + Math.random() * 18;

            const basePos = roadData.point.clone().add(roadData.normal.clone().multiplyScalar(sideDir * lateral));
            const height = 5 + Math.random() * 10;
            const trunkH = height * 0.4;
            const radius = 2 + Math.random() * 3;

            position.copy(basePos);
            position.y = trunkH / 2;
            quaternion.identity();
            scale.set(1, trunkH, 1);
            matrix.compose(position, quaternion, scale);
            trunkMesh.setMatrixAt(i, matrix);

            position.copy(basePos);
            position.y = trunkH + (height * 0.35);
            scale.set(radius, height * 0.7, radius);
            matrix.compose(position, quaternion, scale);
            foliageMesh.setMatrixAt(i, matrix);
        }
        trunkMesh.instanceMatrix.needsUpdate = true;
        foliageMesh.instanceMatrix.needsUpdate = true;
        this.scene.add(trunkMesh, foliageMesh);
        this.levelObjects.push(trunkMesh, foliageMesh);
    }

    createUnderbrush(count = 60) {
        if (this.isMobile) count = Math.floor(count * 0.4);
        count = this.getScaledCount(count);
        const roadHalfWidth = this.roadWidth / 2;
        const safeOffset = roadHalfWidth + 3;

        for (let i = 0; i < count; i++) {
            const roadZ = (Math.random() - 0.5) * (this.roadLength - 60);
            const roadData = this.getRoadDataAtZ(roadZ);
            const lateral = safeOffset + Math.random() * 12;
            const basePos = roadData.point.clone().add(roadData.normal.clone().multiplyScalar(-1 * lateral));

            const fernGroup = new THREE.Group();
            const fronds = 3 + Math.floor(Math.random() * 3);
            for (let f = 0; f < fronds; f++) {
                const frond = new THREE.Mesh(
                    new THREE.ConeGeometry(0.3, 1.2, 4),
                    new THREE.MeshStandardMaterial({ color: 0x1a3a1a, roughness: 0.9 })
                );
                frond.rotation.x = -0.3 - Math.random() * 0.4;
                frond.rotation.y = (f / fronds) * Math.PI * 2;
                frond.position.y = 0.4;
                fernGroup.add(frond);
            }
            fernGroup.position.copy(basePos);
            fernGroup.scale.setScalar(0.5 + Math.random() * 0.3);
            this.scene.add(fernGroup);
            this.levelObjects.push(fernGroup);
        }
    }

    createMoths(count = 15) {
        if (this.isMobile) count = Math.floor(count * 0.5);
        count = this.getScaledCount(count);
        for (let i = 0; i < count; i++) {
            const mothGroup = new THREE.Group();
            const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8a7a6a, roughness: 0.8 });
            const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.04, 4, 6), bodyMat);
            mothGroup.add(body);

            const wingMat = new THREE.MeshStandardMaterial({ color: 0x9a8a7a, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
            const leftWing = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.04), wingMat);
            leftWing.position.set(0.03, 0, 0);
            leftWing.rotation.y = 0.3;
            mothGroup.add(leftWing);
            const rightWing = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.04), wingMat.clone());
            rightWing.position.set(-0.03, 0, 0);
            rightWing.rotation.y = -0.3;
            mothGroup.add(rightWing);

            const x = (Math.random() - 0.5) * 20;
            const y = 1.5 + Math.random() * 2;
            const z = (Math.random() - 0.5) * (this.roadLength - 60);
            mothGroup.position.set(x, y, z);

            this.scene.add(mothGroup);
            this.levelObjects.push(mothGroup);
            this.moths.push({
                mesh: mothGroup, leftWing, rightWing,
                basePos: mothGroup.position.clone(),
                phase: Math.random() * Math.PI * 2,
                speed: 2 + Math.random() * 3,
                radius: 0.3 + Math.random() * 0.5
            });
        }
    }

    createBananaSlugs(count = 8) {
        if (this.isMobile) count = Math.floor(count * 0.5);
        count = this.getScaledCount(count);
        for (let i = 0; i < count; i++) {
            const slugGroup = new THREE.Group();
            const body = new THREE.Mesh(
                new THREE.CapsuleGeometry(0.03, 0.15, 4, 8),
                new THREE.MeshStandardMaterial({ color: 0xcccc00, roughness: 0.3, metalness: 0.1 })
            );
            body.rotation.z = Math.PI / 2;
            body.position.y = 0.03;
            slugGroup.add(body);

            const antMat = new THREE.MeshStandardMaterial({ color: 0xaaaa00 });
            const antGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.04, 4);
            [0.01, -0.01].forEach(zOff => {
                const ant = new THREE.Mesh(antGeo, antMat);
                ant.position.set(0.09, 0.06, zOff);
                ant.rotation.z = -0.3;
                slugGroup.add(ant);
            });

            const side = Math.random() > 0.5 ? -1 : 1;
            slugGroup.position.set(side * (7 + Math.random() * 3), 0, (Math.random() - 0.5) * (this.roadLength - 90));
            slugGroup.rotation.y = Math.random() * Math.PI * 2;
            this.scene.add(slugGroup);
            this.levelObjects.push(slugGroup);
        }
    }

    // ==================== LEVEL 1: CLEAR NIGHT ====================
    createLevel1() {
        this.scene.background = new THREE.Color(0x050510);
        this.scene.fog = new THREE.FogExp2(0x050510, this.isMobile ? 0.018 : 0.012);

        this.createRoad(0);
        this.createGrass(0x0a1a0a);
        this.createCliff();
        this.createTrees(this.isMobile ? 50 : 100, -1);
        this.createUnderbrush(this.isMobile ? 20 : 50);
        this.createBananaSlugs(6);
        this.createMoths(this.isMobile ? 8 : 15);
        this.placeRoadSigns();
        this.createStars();
        this.createMoonlight(0.15);

        const ambient = new THREE.AmbientLight(0x1a1a2e, 0.3);
        this.scene.add(ambient);
        this.levelObjects.push(ambient);

        const hemi = new THREE.HemisphereLight(0x0a0a2e, 0x050510, 0.15);
        this.scene.add(hemi);
        this.levelObjects.push(hemi);
    }

    createStars() {
        const starCount = this.getScaledCount(this.isMobile ? 300 : 800);
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
        this.scene.background = new THREE.Color(0x0a0510);
        this.scene.fog = new THREE.FogExp2(0x0a0510, this.isMobile ? 0.025 : 0.018);

        this.createRoad(0);
        this.createGrass(0x0d1a0d);
        this.createCliff();
        this.createTrees(this.isMobile ? 60 : 120, -1);
        this.createUnderbrush(this.isMobile ? 25 : 60);
        this.createBananaSlugs(10);
        this.createMoths(this.isMobile ? 12 : 25);
        this.placeRoadSigns();
        this.createDuskSky();
        this.createMoonlight(0.08);

        const ambient = new THREE.AmbientLight(0x1a1020, 0.2);
        this.scene.add(ambient);
        this.levelObjects.push(ambient);

        const horizonLight = new THREE.DirectionalLight(0xff6633, 0.06);
        horizonLight.position.set(-50, 5, 0);
        this.scene.add(horizonLight);
        this.levelObjects.push(horizonLight);

        const hemi = new THREE.HemisphereLight(0x1a0820, 0x0a0510, 0.12);
        this.scene.add(hemi);
        this.levelObjects.push(hemi);
    }

    createDuskSky() {
        const horizon = new THREE.Mesh(
            new THREE.PlaneGeometry(400, 60),
            new THREE.MeshBasicMaterial({ color: 0x331122, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
        );
        horizon.position.set(-120, 15, 0);
        horizon.rotation.y = Math.PI / 2;
        this.scene.add(horizon);
        this.levelObjects.push(horizon);

        const starCount = this.getScaledCount(this.isMobile ? 100 : 300);
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
        this.scene.background = new THREE.Color(0x030308);
        this.scene.fog = new THREE.FogExp2(0x030308, this.isMobile ? 0.06 : 0.045);

        this.createRoad(1);
        this.createGrass(0x0d260d);
        this.createCliff();
        this.createTrees(this.isMobile ? 80 : 180, -1);
        this.createUnderbrush(this.isMobile ? 15 : 40);
        this.placeRoadSigns();
        this.createPuddles();
        this.createRain();
        this.createMoonlight(0.05);
        this.createStormReservoir();

        const ambient = new THREE.AmbientLight(0x111122, 0.12);
        this.scene.add(ambient);
        this.levelObjects.push(ambient);

        const hemi = new THREE.HemisphereLight(0x080818, 0x030308, 0.08);
        this.scene.add(hemi);
        this.levelObjects.push(hemi);

        this.windStrength = 1.0;
    }

    createStormReservoir() {
        const water = new THREE.Mesh(
            new THREE.PlaneGeometry(120, this.roadLength + 40, 20, 20),
            new THREE.MeshStandardMaterial({ color: 0x0a2a4c, roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.9 })
        );
        water.rotation.x = -Math.PI / 2;
        water.position.set(80, -28, 0);
        water.userData.isWater = true;
        this.scene.add(water);
        this.levelObjects.push(water);
    }

    createPuddles() {
        const puddleCount = this.getScaledCount(this.isMobile ? 16 : 32);
        for (let i = 0; i < puddleCount; i++) {
            const puddle = new THREE.Mesh(
                new THREE.CircleGeometry(0.5 + Math.random() * 1, 16),
                new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.1, metalness: 0.8, transparent: true, opacity: 0.7 })
            );
            puddle.rotation.x = -Math.PI / 2;
            puddle.position.set((Math.random() - 0.5) * 12, 0.02, (Math.random() - 0.5) * (this.roadLength - 40));
            puddle.scale.set(1 + Math.random(), 0.6 + Math.random() * 0.4, 1);
            this.scene.add(puddle);
            this.levelObjects.push(puddle);
        }
    }

    createRain() {
        const rainCount = this.getScaledCount(this.isMobile ? 3000 : 8000);
        this.rainGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(rainCount * 3);
        this.rainVelocities = new Float32Array(rainCount);
        for (let i = 0; i < rainCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 120;
            positions[i * 3 + 1] = Math.random() * 50;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 120;
            this.rainVelocities[i] = 0.5 + Math.random() * 0.5;
        }
        this.rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.rain = new THREE.Points(this.rainGeometry, new THREE.PointsMaterial({
            color: 0x8899aa, size: 0.1, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending
        }));
        this.scene.add(this.rain);
    }

    createMoonlight(intensity = 0.12) {
        const moonlight = new THREE.DirectionalLight(0x6666aa, intensity);
        moonlight.position.set(20, 50, 10);
        moonlight.castShadow = !this.isMobile;
        moonlight.shadow.mapSize.width = 512;
        moonlight.shadow.mapSize.height = 512;
        const d = 150;
        moonlight.shadow.camera.left = -d;
        moonlight.shadow.camera.right = d;
        moonlight.shadow.camera.top = d;
        moonlight.shadow.camera.bottom = -d;
        moonlight.shadow.camera.near = 0.5;
        moonlight.shadow.camera.far = 200;
        moonlight.shadow.bias = -0.001;
        this.scene.add(moonlight);
        this.levelObjects.push(moonlight);
    }

    // ==================== UPDATE METHODS ====================
    updateRain(deltaTime, cameraPosition) {
        if (!this.rain || !this.rainGeometry || this.currentLevel !== 3) return;

        // Skip frames to reduce GPU buffer upload frequency
        this.rainUpdateCounter++;
        const shouldUpdateGPU = this.rainUpdateCounter >= this.rainUpdateInterval;
        if (shouldUpdateGPU) {
            this.rainUpdateCounter = 0;
        }

        const positions = this.rainGeometry.attributes.position.array;
        const totalCount = positions.length / 3;
        const count = Math.max(1, Math.floor(totalCount * this.rainActiveFraction));

        this.windTime += deltaTime;
        const windGust = Math.sin(this.windTime * 0.5) * 0.5 + 0.5;
        const windX = (2 + windGust * 4) * this.windStrength;
        const windZ = Math.sin(this.windTime * 0.3) * 1.5 * this.windStrength;

        for (let i = 0; i < count; i++) {
            positions[i * 3 + 1] -= this.rainVelocities[i] * deltaTime * 35;
            positions[i * 3] += windX * deltaTime;
            positions[i * 3 + 2] += windZ * deltaTime;
            if (positions[i * 3 + 1] < 0) {
                positions[i * 3] = cameraPosition.x + (Math.random() - 0.5) * 120;
                positions[i * 3 + 1] = 40 + Math.random() * 10;
                positions[i * 3 + 2] = cameraPosition.z + (Math.random() - 0.5) * 120;
            }
        }

        // Only update GPU buffer every N frames
        if (shouldUpdateGPU) {
            this.rainGeometry.attributes.position.needsUpdate = true;
        }

        // Choppy storm water - also skip frames
        if (shouldUpdateGPU) {
            this.levelObjects.forEach(obj => {
                if (obj.userData && obj.userData.isWater && obj.geometry && obj.geometry.attributes.position) {
                    const wp = obj.geometry.attributes.position.array;
                    for (let i = 0; i < wp.length / 3; i++) {
                        wp[i * 3 + 2] = Math.sin(this.windTime * 2 + i * 0.3) * 0.3;
                    }
                    obj.geometry.attributes.position.needsUpdate = true;
                }
            });
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
        this.mothUpdateCounter++;
        const mothUpdateInterval = this.qualityLevel <= 1 ? 2 : 1;
        if (this.mothUpdateCounter % mothUpdateInterval !== 0) return;

        this.moths.forEach(moth => {
            moth.phase += deltaTime * moth.speed;
            moth.mesh.position.set(
                moth.basePos.x + Math.sin(moth.phase) * moth.radius,
                moth.basePos.y + Math.sin(moth.phase * 1.7) * 0.15,
                moth.basePos.z + Math.cos(moth.phase * 0.8) * moth.radius
            );
            const wingAngle = Math.sin(moth.phase * 15) * 0.5;
            moth.leftWing.rotation.y = 0.3 + wingAngle;
            moth.rightWing.rotation.y = -0.3 - wingAngle;
        });
    }

    getRoadDataAtZ(z) {
        if (!this.roadCurve) {
            return { point: new THREE.Vector3(0, 0, z), tangent: new THREE.Vector3(0, 0, 1), normal: new THREE.Vector3(1, 0, 0) };
        }
        let closestT = 0;
        let minZDiff = Infinity;
        for (let i = 0; i <= 100; i++) {
            const t = i / 100;
            const point = this.roadCurve.getPoint(t);
            const zDiff = Math.abs(point.z - z);
            if (zDiff < minZDiff) { minZDiff = zDiff; closestT = t; }
        }
        const point = this.roadCurve.getPoint(closestT);
        const tangent = this.roadCurve.getTangent(closestT);
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
        return { point, tangent, normal, t: closestT };
    }

    getCurrentLevel() { return this.currentLevel; }
    getWindStrength() { return this.currentLevel === 3 ? this.windStrength : 0; }
}
