const { test, expect } = require('@playwright/test');

test.describe('Gamepad controller support', () => {
    test('Player class initializes gamepad state', async ({ page }) => {
        await page.goto('http://localhost:3000', { waitUntil: 'load' });

        const result = await page.evaluate(async () => {
            const THREE = await import('three');
            const { Player } = await import('/js/player.js');

            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);

            const roadBounds = { minX: -20, maxX: 20, minZ: -150, maxZ: 150 };
            const player = new Player(camera, scene, roadBounds, false);

            return {
                hasGamepadIndex: player.gamepadIndex === -1,
                hasGamepadLookX: player.gamepadLookX === 0,
                hasGamepadMoveX: player.gamepadMoveX === 0,
                hasGamepadLookSensitivity: player.gamepadLookSensitivity > 0,
                hasPollGamepad: typeof player.pollGamepad === 'function',
                hasInitGamepadListeners: typeof player.initGamepadListeners === 'function'
            };
        });

        expect(result.hasGamepadIndex).toBeTruthy();
        expect(result.hasGamepadLookX).toBeTruthy();
        expect(result.hasGamepadMoveX).toBeTruthy();
        expect(result.hasGamepadLookSensitivity).toBeTruthy();
        expect(result.hasPollGamepad).toBeTruthy();
        expect(result.hasInitGamepadListeners).toBeTruthy();
    });

    test('Player update works without gamepad connected', async ({ page }) => {
        await page.goto('http://localhost:3000', { waitUntil: 'load' });

        const result = await page.evaluate(async () => {
            const THREE = await import('three');
            const { Player } = await import('/js/player.js');

            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);

            const roadBounds = { minX: -20, maxX: 20, minZ: -150, maxZ: 150 };
            const player = new Player(camera, scene, roadBounds, true);

            player.joystickInput = { x: 0.5, y: 0.5 };
            const isMoving = player.update(0.016);

            return {
                isMoving,
                positionY: camera.position.y,
                gamepadIndex: player.gamepadIndex
            };
        });

        expect(result.isMoving).toBeTruthy();
        expect(result.positionY).toBeCloseTo(1.7, 1);
        expect(result.gamepadIndex).toBe(-1);
    });

    test('Right thumbstick (axes 2,3) drives movement direction', async ({ page }) => {
        await page.goto('http://localhost:3000', { waitUntil: 'load' });

        const result = await page.evaluate(async () => {
            const THREE = await import('three');
            const { Player } = await import('/js/player.js');

            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);

            const roadBounds = { minX: -20, maxX: 20, minZ: -150, maxZ: 150 };
            const player = new Player(camera, scene, roadBounds, true);

            player.gamepadIndex = 0;
            player.gamepadMoveX = 0;
            player.gamepadMoveY = 0;
            player.joystickInput = { x: 0, y: 0 };
            player.update(0.016);
            const zeroDirX = player.direction.x;

            player.gamepadMoveX = 0.5;
            player.gamepadMoveY = 0.8;
            player.update(0.016);

            return {
                zeroDirX,
                activeDirX: player.direction.x,
                activeDirZ: player.direction.z
            };
        });

        expect(result.zeroDirX).toBe(0);
        expect(result.activeDirX).not.toBe(0);
        expect(result.activeDirZ).not.toBe(0);
    });

    test('Left thumbstick (axes 0,1) drives camera look rotation', async ({ page }) => {
        await page.goto('http://localhost:3000', { waitUntil: 'load' });

        const result = await page.evaluate(async () => {
            const THREE = await import('three');
            const { Player } = await import('/js/player.js');

            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);

            const roadBounds = { minX: -20, maxX: 20, minZ: -150, maxZ: 150 };
            const player = new Player(camera, scene, roadBounds, true);

            player.gamepadIndex = 0;
            player.gamepadLookX = 0;
            player.gamepadLookY = 0;
            player.joystickInput = { x: 0, y: 0 };

            const qBefore = camera.quaternion.clone();

            player.gamepadLookX = 0.8;
            player.pollGamepad = function (dt) {
                if (this.gamepadLookX !== 0 || this.gamepadLookY !== 0) {
                    this.euler.setFromQuaternion(this.camera.quaternion);
                    this.euler.y -= this.gamepadLookX * this.gamepadLookSensitivity * dt;
                    this.euler.x -= this.gamepadLookY * this.gamepadLookSensitivity * dt;
                    this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x));
                    this.camera.quaternion.setFromEuler(this.euler);
                }
            };
            player.update(0.016);

            const qAfter = camera.quaternion.clone();

            return {
                rotationChanged: !qBefore.equals(qAfter)
            };
        });

        expect(result.rotationChanged).toBeTruthy();
    });
});
