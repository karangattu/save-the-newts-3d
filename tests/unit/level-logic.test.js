import { describe, expect, test } from 'vitest';
import { LevelManager } from '../../js/levels.js';

describe('LevelManager logic', () => {
    test('setQualityLevel updates rain update interval and active fraction', () => {
        const manager = Object.create(LevelManager.prototype);

        manager.setQualityLevel(1);
        expect(manager.rainUpdateInterval).toBe(5);
        expect(manager.rainActiveFraction).toBe(0.45);

        manager.setQualityLevel(2);
        expect(manager.rainUpdateInterval).toBe(4);
        expect(manager.rainActiveFraction).toBe(0.7);

        manager.setQualityLevel(3);
        expect(manager.rainUpdateInterval).toBe(3);
        expect(manager.rainActiveFraction).toBe(1);
    });

    test('getScaledCount uses density scale by quality level', () => {
        const manager = Object.create(LevelManager.prototype);

        manager.qualityLevel = 1;
        expect(manager.getScaledCount(10)).toBe(5);

        manager.qualityLevel = 2;
        expect(manager.getScaledCount(10)).toBe(7);

        manager.qualityLevel = 3;
        expect(manager.getScaledCount(10)).toBe(10);
    });

    test('getRoadDataAtZ returns fallback vectors when road curve is missing', () => {
        const manager = Object.create(LevelManager.prototype);
        manager.roadCurve = null;

        const data = manager.getRoadDataAtZ(12);
        expect(data.point.z).toBe(12);
        expect(data.normal.x).toBe(1);
        expect(data.tangent.z).toBe(1);
    });

    test('getWindStrength only returns wind in level 3', () => {
        const manager = Object.create(LevelManager.prototype);
        manager.windStrength = 0.9;

        manager.currentLevel = 2;
        expect(manager.getWindStrength()).toBe(0);

        manager.currentLevel = 3;
        expect(manager.getWindStrength()).toBe(0.9);
    });
});