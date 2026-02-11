import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

test.describe('Newt animation and movement', () => {
    test('newts cross from one side to the other side of the road', async ({ page }) => {
        await page.goto(BASE_URL, { waitUntil: 'networkidle' });

        const result = await page.evaluate(async () => {
            const { NewtManager } = await import('./js/newts.js');
            const THREE = await import('three');

            const scene = new THREE.Scene();
            const flashlight = { isPointIlluminated: () => false };
            const mgr = new NewtManager(scene, flashlight);

            mgr.spawnNewt();
            const newt = mgr.newts[0];

            const startSide = Math.sign(newt.startPosition.x);
            const targetSide = Math.sign(newt.targetPosition.x);
            const crossesRoad = startSide !== 0 && targetSide !== 0 && startSide !== targetSide;

            return { startSide, targetSide, crossesRoad };
        });

        expect(result.crossesRoad).toBe(true);
    });

    test('newt mesh has tail reference in userData', async ({ page }) => {
        await page.goto(BASE_URL, { waitUntil: 'networkidle' });

        const hasTail = await page.evaluate(async () => {
            const { NewtManager } = await import('./js/newts.js');
            const THREE = await import('three');

            const scene = new THREE.Scene();
            const flashlight = { isPointIlluminated: () => false };
            const mgr = new NewtManager(scene, flashlight);

            const mesh = mgr.createNewtMesh();
            return mesh.userData.tail !== undefined;
        });

        expect(hasTail).toBe(true);
    });

    test('leg animation applies X rotation during movement', async ({ page }) => {
        await page.goto(BASE_URL, { waitUntil: 'networkidle' });

        const result = await page.evaluate(async () => {
            const { NewtManager } = await import('./js/newts.js');
            const THREE = await import('three');

            const scene = new THREE.Scene();
            const flashlight = { isPointIlluminated: () => false };
            const mgr = new NewtManager(scene, flashlight);

            mgr.spawnNewt();
            const newt = mgr.newts[0];
            const legs = newt.mesh.userData.legs;

            const initialFR = legs.frontRight.rotation.x;

            const playerPos = new THREE.Vector3(999, 0, 999);
            for (let i = 0; i < 10; i++) {
                mgr.update(0.016, i * 0.016, playerPos);
            }

            const afterFR = legs.frontRight.rotation.x;
            return { initialFR, afterFR, changed: Math.abs(afterFR - initialFR) > 0.01 };
        });

        expect(result.changed).toBe(true);
    });
});
