import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

test.describe('Predator attack visibility', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    });

    test('both animals spawn in the player view regardless of look direction', async ({ page }) => {
        const results = await page.evaluate(async () => {
            const THREE = await import('three');
            const { PredatorManager } = await import('/js/predators.js');
            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.25, 600);
            camera.rotation.order = 'YXZ';
            const manager = new PredatorManager(scene, camera);
            await manager.modelsReady;
            const types = ['mountain lion', 'bear'];

            const results = types.map((type, index) => {
                camera.position.set(0, 1.7, 0);
                camera.rotation.set(0, index * Math.PI / 2, 0);
                const playerPosition = camera.position.clone();
                const predator = manager.spawnPredator(type, playerPosition);
                scene.updateMatrixWorld(true);

                const height = predator.userData.rig
                    ? predator.userData.rig.box.max.y
                    : (type === 'bear' ? 1.8 : 1.15);
                const center = predator.position.clone().add(new THREE.Vector3(0, height * 0.5, 0));
                const projected = center.project(camera);
                const forward = camera.getWorldDirection(new THREE.Vector3());
                const inFront = predator.position.clone().sub(playerPosition).dot(forward) > 0;

                manager.removePredator();
                return {
                    type,
                    inFront,
                    projected: projected.toArray(),
                    templateLoaded: !!manager.modelTemplates[type]
                };
            });
            manager.reset();
            return results;
        });

        for (const result of results) {
            expect(result.templateLoaded, `${result.type} model loads`).toBe(true);
            expect(result.inFront, `${result.type} spawns ahead of the player`).toBe(true);
            expect(Math.abs(result.projected[0]), `${result.type} stays in horizontal view`).toBeLessThan(0.9);
            expect(Math.abs(result.projected[1]), `${result.type} stays in vertical view`).toBeLessThan(0.9);
            expect(result.projected[2]).toBeGreaterThan(-1);
            expect(result.projected[2]).toBeLessThan(1);
        }
    });

    for (const type of ['mountain lion', 'bear']) {
        test(`${type} remains framed and stops before the near clip`, async ({ page }) => {
            const result = await page.evaluate(async (predatorType) => {
                const THREE = await import('three');
                const { PredatorManager } = await import('/js/predators.js');
                const scene = new THREE.Scene();
                const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.25, 600);
                camera.rotation.order = 'YXZ';
                const manager = new PredatorManager(scene, camera);
                await manager.modelsReady;
                camera.position.set(0, 1.7, 0);
                camera.rotation.set(-0.08, 0.8, 0);
                const target = camera.position.clone();
                const targetGround = target.clone().setY(0);
                const initialCameraRotation = camera.quaternion.clone();
                const predator = manager.spawnPredator(predatorType, target);
                const height = predator.userData.rig
                    ? predator.userData.rig.box.max.y
                    : (predatorType === 'bear' ? 1.8 : 1.15);
                const samples = [];
                let completed = false;

                await new Promise((resolve) => {
                    manager.animateAttack(target, 900, () => {
                        completed = true;
                    });

                    const sample = () => {
                        scene.updateMatrixWorld(true);
                        const center = predator.position.clone();
                        center.y += height * 0.55;
                        const projected = center.project(camera);
                        samples.push({
                            projected: projected.toArray(),
                            distance: predator.position.distanceTo(targetGround),
                            height: predator.position.y
                        });

                        if (completed) {
                            resolve();
                        } else {
                            requestAnimationFrame(sample);
                        }
                    };

                    requestAnimationFrame(sample);
                });

                const finalSample = samples[samples.length - 1];
                const result = {
                    completed,
                    sampleCount: samples.length,
                    allInView: samples.every(({ projected }) => (
                        Math.abs(projected[0]) < 1
                        && Math.abs(projected[1]) < 1
                        && projected[2] > -1
                        && projected[2] < 1
                    )),
                    finalDistance: finalSample.distance,
                    finalHeight: finalSample.height,
                    cameraTurn: camera.quaternion.angleTo(initialCameraRotation)
                };
                manager.reset();
                return result;
            }, type);

            expect(result.completed).toBe(true);
            expect(result.sampleCount).toBeGreaterThan(10);
            expect(result.allInView).toBe(true);
            expect(result.finalDistance).toBeGreaterThan(1.2);
            expect(result.finalHeight).toBeLessThan(0.5);
            expect(result.cameraTurn).toBeGreaterThan(0.2);
        });
    }
});
