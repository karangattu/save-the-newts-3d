import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { CarManager } from '../../js/cars.js';

describe('CarManager logic', () => {
    test('setQualityLevel updates maxCars for low-end devices', () => {
        const manager = Object.create(CarManager.prototype);
        manager.isLowEnd = true;

        manager.setQualityLevel(1);
        expect(manager.maxCars).toBe(6);

        manager.setQualityLevel(2);
        expect(manager.maxCars).toBe(8);

        manager.setQualityLevel(3);
        expect(manager.maxCars).toBe(9);
    });

    test('setQualityLevel updates maxCars for regular devices', () => {
        const manager = Object.create(CarManager.prototype);
        manager.isLowEnd = false;

        manager.setQualityLevel(1);
        expect(manager.maxCars).toBe(8);

        manager.setQualityLevel(2);
        expect(manager.maxCars).toBe(11);

        manager.setQualityLevel(3);
        expect(manager.maxCars).toBe(14);
    });

    test('boxesIntersect returns true for overlap and edge-touching', () => {
        const manager = Object.create(CarManager.prototype);
        const a = { minX: 0, maxX: 2, minZ: 0, maxZ: 2 };

        expect(manager.boxesIntersect(a, { minX: 1, maxX: 3, minZ: 1, maxZ: 3 })).toBe(true);
        expect(manager.boxesIntersect(a, { minX: 2, maxX: 4, minZ: 2, maxZ: 4 })).toBe(true);
        expect(manager.boxesIntersect(a, { minX: 2.01, maxX: 4, minZ: 2.01, maxZ: 4 })).toBe(false);
    });

    test('getCarBoundingBox uses larger bounds for semi than motorcycle', () => {
        const manager = Object.create(CarManager.prototype);

        const semi = manager.getCarBoundingBox({
            vehicleType: 'semi',
            mesh: { position: { x: 10, z: -5 } }
        });

        const motorcycle = manager.getCarBoundingBox({
            vehicleType: 'motorcycle',
            mesh: { position: { x: 10, z: -5 } }
        });

        expect(semi.maxX - semi.minX).toBeGreaterThan(motorcycle.maxX - motorcycle.minX);
        expect(semi.maxZ - semi.minZ).toBeGreaterThan(motorcycle.maxZ - motorcycle.minZ);
    });

    test('checkNearMiss triggers once when near miss occurs without collision', () => {
        const manager = Object.create(CarManager.prototype);
        manager.nearMissCooldown = 0.5;
        manager.lastNearMiss = 0.5;
        manager.cars = [{
            vehicleType: 'car',
            isStealth: true,
            hasTriggeredNearMiss: false,
            mesh: { position: { x: 0, z: 0 } }
        }];

        const nearMissBox = { minX: -2, maxX: 2, minZ: -3, maxZ: 3 };
        const collisionBox = { minX: 5, maxX: 6, minZ: 5, maxZ: 6 };

        const result = manager.checkNearMiss(nearMissBox, collisionBox);
        expect(result).toEqual({ nearMiss: true, isStealth: true });
        expect(manager.cars[0].hasTriggeredNearMiss).toBe(true);
        expect(manager.lastNearMiss).toBe(0);

        expect(manager.checkNearMiss(nearMissBox, collisionBox)).toBeNull();
    });

    test('Tesla car body mesh has correct forward orientation (front is at positive Z, rear is at negative Z)', () => {
        const manager = Object.create(CarManager.prototype);
        manager.sharedMaterials = {
            glass: new THREE.MeshBasicMaterial(),
            glassStealth: new THREE.MeshBasicMaterial(),
            rubber: new THREE.MeshBasicMaterial(),
            chrome: new THREE.MeshBasicMaterial(),
            headlightOff: new THREE.MeshBasicMaterial(),
            headlightGlow: new THREE.MeshBasicMaterial(),
            turnSignal: new THREE.MeshBasicMaterial(),
            taillightOff: new THREE.MeshBasicMaterial(),
            taillightOn: new THREE.MeshBasicMaterial(),
            wheel: new THREE.MeshBasicMaterial(),
            hubcap: new THREE.MeshBasicMaterial(),
            seatBlack: new THREE.MeshBasicMaterial(),
            mirror: new THREE.MeshBasicMaterial()
        };

        const group = manager.createCarMesh(false);

        const bodyMesh = group.children.find(child => child.geometry && child.geometry.type === 'ExtrudeGeometry');
        expect(bodyMesh).toBeDefined();

        const geometry = bodyMesh.geometry;
        const positionAttr = geometry.attributes.position;
        expect(positionAttr).toBeDefined();

        let maxZ = -Infinity;
        let minZ = Infinity;
        let maxZIndex = -1;
        let minZIndex = -1;

        for (let i = 0; i < positionAttr.count; i++) {
            const z = positionAttr.getZ(i);
            if (z > maxZ) {
                maxZ = z;
                maxZIndex = i;
            }
            if (z < minZ) {
                minZ = z;
                minZIndex = i;
            }
        }

        expect(maxZIndex).not.toBe(-1);
        expect(minZIndex).not.toBe(-1);

        const frontY = positionAttr.getY(maxZIndex);
        const rearY = positionAttr.getY(minZIndex);

        // Under correct orientation:
        // The front-most part of the body (max Z, which is the front lip) should be lower than
        // the rear-most part of the body (min Z, which is the rear bumper).
        expect(frontY).toBeLessThan(rearY);
    });
});