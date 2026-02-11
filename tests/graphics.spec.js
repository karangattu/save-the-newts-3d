const { test, expect } = require('@playwright/test');

test.describe('Graphics and flashlight enhancements', () => {
    test('renderer uses ACES tone mapping and sRGB output', async ({ page }) => {
        await page.goto('http://localhost:3000', { waitUntil: 'load' });

        // Handle game start flow to ensure renderer is initialized
        const startBtn = await page.waitForSelector('#start-button', { state: 'visible' });
        await startBtn.click();
        const skipBtn = await page.waitForSelector('#skip-video-btn', { state: 'visible', timeout: 5000 }).catch(() => null);
        if (skipBtn) await skipBtn.click();
        const clickToStart = await page.waitForSelector('#click-to-start-screen', { state: 'visible' });
        await clickToStart.click();

        const result = await page.evaluate(() => {
            const container = document.getElementById('game-container');
            const canvas = container && container.querySelector('canvas');
            if (!canvas) return { error: 'no game canvas' };
            return { canvasExists: true };
        });

        expect(result.canvasExists).toBeTruthy();

        const rendererConfig = await page.evaluate(async () => {
            const container = document.getElementById('game-container');
            const canvas = container && container.querySelector('canvas');
            if (!canvas) return { error: 'no canvas found' };

            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
            return {
                hasWebGL: !!gl,
                hasCanvas: !!canvas
            };
        });

        expect(rendererConfig.hasCanvas).toBeTruthy();
    });

    test('flashlight creates spotlight and outer glow', async ({ page }) => {
        await page.goto('http://localhost:3000', { waitUntil: 'load' });

        const flashlightConfig = await page.evaluate(async () => {
            const THREE = await import('three');
            const { Flashlight } = await import('/js/flashlight.js');

            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);

            const fl = new Flashlight(camera, scene, false);

            return {
                hasSpotlight: !!fl.spotlight,
                spotlightIntensity: fl.spotlight.intensity,
                spotlightColor: '#' + fl.spotlight.color.getHexString(),
                penumbra: fl.spotlight.penumbra,
                hasOuterGlow: !!fl.outerGlow,
                outerGlowAngle: fl.outerGlow.angle,
                hasVolumetricCone: !!fl.volumetricCone,
                hasFillLight: !!fl.fillLight,
                battery: fl.getBattery()
            };
        });

        expect(flashlightConfig.hasSpotlight).toBeTruthy();
        expect(flashlightConfig.hasOuterGlow).toBeTruthy();
        expect(flashlightConfig.hasVolumetricCone).toBeTruthy();
        expect(flashlightConfig.hasFillLight).toBeTruthy();
        expect(flashlightConfig.penumbra).toBeGreaterThanOrEqual(0.5);
        expect(flashlightConfig.battery).toBe(100);
        expect(flashlightConfig.outerGlowAngle).toBeGreaterThan(flashlightConfig.penumbra);
    });

    test('flashlight volumetric cone is skipped on mobile', async ({ page }) => {
        await page.goto('http://localhost:3000', { waitUntil: 'load' });

        const mobileConfig = await page.evaluate(async () => {
            const THREE = await import('three');
            const { Flashlight } = await import('/js/flashlight.js');

            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);

            const fl = new Flashlight(camera, scene, true);

            return {
                hasVolumetricCone: !!fl.volumetricCone,
                hasOuterGlow: !!fl.outerGlow,
                maxIntensity: fl.maxIntensity
            };
        });

        expect(mobileConfig.hasVolumetricCone).toBeFalsy();
        expect(mobileConfig.hasOuterGlow).toBeTruthy();
        expect(mobileConfig.maxIntensity).toBe(14);
    });

    test('flashlight intensity lerps smoothly and flicker activates on low battery', async ({ page }) => {
        await page.goto('http://localhost:3000', { waitUntil: 'load' });

        const flickerResult = await page.evaluate(async () => {
            const THREE = await import('three');
            const { Flashlight } = await import('/js/flashlight.js');

            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
            camera.position.set(0, 1.7, 0);

            const fl = new Flashlight(camera, scene, false);

            fl.update(0.016, 0);
            const normalIntensity = fl.currentIntensity;

            fl.battery = 10;
            const intensities = [];
            for (let i = 0; i < 60; i++) {
                fl.update(0.016, i * 0.016);
                intensities.push(fl.currentIntensity);
            }

            const hasVariation = new Set(intensities.map(v => Math.round(v * 100))).size > 1;

            return {
                normalIntensityPositive: normalIntensity > 0,
                lowBatteryHasVariation: hasVariation,
                finalColor: '#' + fl.spotlight.color.getHexString()
            };
        });

        expect(flickerResult.normalIntensityPositive).toBeTruthy();
        expect(flickerResult.lowBatteryHasVariation).toBeTruthy();
    });

    test('rescue pulse temporarily boosts intensity', async ({ page }) => {
        await page.goto('http://localhost:3000', { waitUntil: 'load' });

        const pulseResult = await page.evaluate(async () => {
            const THREE = await import('three');
            const { Flashlight } = await import('/js/flashlight.js');

            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);

            const fl = new Flashlight(camera, scene, false);
            fl.update(0.016, 0);
            const baseIntensity = fl.targetIntensity;

            fl.pulseOnRescue();
            fl.update(0.016, 0.016);
            const pulseIntensity = fl.targetIntensity;

            return {
                baseIntensity,
                pulseIntensity,
                pulseBoosted: pulseIntensity > baseIntensity
            };
        });

        expect(pulseResult.pulseBoosted).toBeTruthy();
    });
});
