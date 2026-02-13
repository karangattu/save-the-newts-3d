import { describe, expect, test } from 'vitest';
import { NewtManager } from '../../js/newts.js';

describe('NewtManager logic', () => {
    test('setQualityLevel updates max active newts and illumination interval', () => {
        const manager = Object.create(NewtManager.prototype);

        manager.setQualityLevel(0);
        expect(manager.maxActiveNewts).toBe(8);
        expect(manager.illuminationCheckInterval).toBe(3);

        manager.setQualityLevel(2);
        expect(manager.maxActiveNewts).toBe(11);
        expect(manager.illuminationCheckInterval).toBe(2);

        manager.setQualityLevel(3);
        expect(manager.maxActiveNewts).toBe(14);
        expect(manager.illuminationCheckInterval).toBe(1);
    });

    test('getRoadDataAtZ returns fallback data when road curve is missing', () => {
        const manager = Object.create(NewtManager.prototype);
        manager.roadCurve = null;

        const data = manager.getRoadDataAtZ(42);
        expect(data.point.z).toBe(42);
        expect(data.normal.x).toBe(1);
        expect(data.tangent.z).toBe(1);
    });

    test('update uses elapsed-time spawn scaling', () => {
        let spawnCalls = 0;
        const manager = Object.create(NewtManager.prototype);
        manager.baseSpawnInterval = 3;
        manager.spawnTimer = 0;
        manager.maxActiveNewts = 10;
        manager.newts = [];
        manager.spawnNewt = () => {
            spawnCalls += 1;
        };
        manager.illuminationCheckCounter = 0;
        manager.illuminationCheckInterval = 1;
        manager.updateRescueEffects = () => {};

        manager.update(1.9, 120, { x: 0, z: 0 });
        expect(spawnCalls).toBe(1);
        expect(manager.spawnTimer).toBe(0);

        manager.update(1.0, 120, { x: 0, z: 0 });
        expect(spawnCalls).toBe(1);
    });
});