const { test, expect } = require('@playwright/test');
const fs = require('fs/promises');
const path = require('path');

test.describe('Graphics and flashlight enhancements', () => {
    test('renderer uses ACES tone mapping and sRGB output', async () => {
        const mainJsPath = path.resolve(__dirname, '../js/main.js');
        const mainJsSource = await fs.readFile(mainJsPath, 'utf8');

        expect(mainJsSource).toContain('THREE.ACESFilmicToneMapping');
        expect(mainJsSource).toContain('THREE.SRGBColorSpace');
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

    test('newts have species-specific high-quality graphics and eye glow behaviors', async ({ page }) => {
        await page.goto('http://localhost:3000', { waitUntil: 'load' });

        const config = await page.evaluate(async () => {
            const THREE = await import('three');
            const { NewtManager } = await import('/js/newts.js');

            const scene = new THREE.Scene();
            const flashlight = { isPointIlluminated: () => true };
            const manager = new NewtManager(scene, flashlight, null, false);
            
            const californiaNewt = manager.createNewtMesh();
            const redBelliedNewt = manager.createNewtMesh();
            redBelliedNewt.userData.isBonus = true;

            manager.resetNewtAppearance(californiaNewt);
            manager.resetNewtAppearance(redBelliedNewt);

            const caliEyes = californiaNewt.userData.eyes;
            const rbEyes = redBelliedNewt.userData.eyes;

            const hasCaliPupil = caliEyes && caliEyes.left.children.length === 1;
            const hasRbPupil = rbEyes && rbEyes.left.children.length === 1;

            // Trigger illumination updates
            const mockCaliNewtObj = {
                mesh: californiaNewt,
                walkCycle: 0,
                isIlluminated: false,
                illuminationTime: 0,
                isPaused: true,
                pauseTimer: 0,
                pauseDuration: 999,
                nextPauseIn: 999
            };
            const mockRbNewtObj = {
                mesh: redBelliedNewt,
                walkCycle: 0,
                isIlluminated: false,
                illuminationTime: 0,
                isPaused: true,
                pauseTimer: 0,
                pauseDuration: 999,
                nextPauseIn: 999
            };

            manager.newts = [mockCaliNewtObj, mockRbNewtObj];
            // Pass true to force illumination check
            manager.update(0.016, 0.016, new THREE.Vector3(0, 0, 0));

            const caliEyelids = californiaNewt.userData.eyelids;
            const rbEyelids = redBelliedNewt.userData.eyelids;

            return {
                caliBodyColor: '#' + californiaNewt.userData.bodyMaterial.color.getHexString(),
                caliBellyColor: '#' + californiaNewt.userData.bellyMaterial.color.getHexString(),
                caliEyeColor: '#' + caliEyes.left.material.color.getHexString(),
                hasCaliBump: !!californiaNewt.userData.bodyMaterial.bumpMap,
                hasCaliPupil,
                caliEyelidColor: '#' + caliEyelids.left.material.color.getHexString(),
                caliEyelidZ: caliEyelids.left.position.z,

                rbBodyColor: '#' + redBelliedNewt.userData.bodyMaterial.color.getHexString(),
                rbBellyColor: '#' + redBelliedNewt.userData.bellyMaterial.color.getHexString(),
                rbEyeColor: '#' + rbEyes.left.material.color.getHexString(),
                hasRbBump: !!redBelliedNewt.userData.bodyMaterial.bumpMap,
                hasRbPupil,
                rbEyelidColor: '#' + rbEyelids.left.material.color.getHexString(),
                rbEyelidZ: rbEyelids.left.position.z,

                caliEmissiveHex: '#' + caliEyes.left.material.emissive.getHexString(),
                rbEmissiveHex: '#' + rbEyes.left.material.emissive.getHexString()
            };
        });

        expect(config.caliBodyColor.toLowerCase()).toBe('#643216');
        expect(config.caliBellyColor.toLowerCase()).toBe('#ffaa00');
        expect(config.caliEyeColor.toLowerCase()).toBe('#ddaa20');
        expect(config.hasCaliBump).toBeTruthy();
        expect(config.hasCaliPupil).toBeTruthy();
        expect(config.caliEyelidColor.toLowerCase()).toBe('#ffaa00');
        expect(config.caliEyelidZ).toBeCloseTo(0.165, 3);

        expect(config.rbBodyColor.toLowerCase()).toBe('#16181a');
        expect(config.rbBellyColor.toLowerCase()).toBe('#ff3300');
        expect(config.rbEyeColor.toLowerCase()).toBe('#0f0c0b');
        expect(config.hasRbBump).toBeTruthy();
        expect(config.hasRbPupil).toBeTruthy();
        expect(config.rbEyelidColor.toLowerCase()).toBe('#16181a');
        expect(config.rbEyelidZ).toBeCloseTo(0.135, 3);

        // California eyes should be glowing/emissive
        expect(config.caliEmissiveHex.toLowerCase()).toBe('#ffcc00');
        expect(config.rbEmissiveHex.toLowerCase()).toBe('#000000');
    });

    test('high resolution textures with anisotropic filtering and mipmaps are generated', async ({ page }) => {
        await page.goto('http://localhost:3000', { waitUntil: 'load' });

        const texturesInfo = await page.evaluate(async () => {
            const THREE = await import('three');
            const { LevelManager } = await import('/js/levels.js');
            const { CarManager } = await import('/js/cars.js');
            const { NewtManager } = await import('/js/newts.js');

            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(75, 1, 0.25, 600);
            const renderer = window.__game ? window.__game.renderer : { capabilities: { getMaxAnisotropy: () => 16 } };

            const levelMgr = new LevelManager(scene, camera, renderer, false);
            const asphalt = levelMgr.createAsphaltTexture();
            const grass = levelMgr.createGrassTexture();
            const rock = levelMgr.createRockTexture();

            const carMgr = new CarManager(scene, null, {});
            const glow = carMgr.createGlowTexture();

            const newtMgr = new NewtManager(scene, { isPointIlluminated: () => true }, null, false);
            const newtMesh = newtMgr.createNewtMesh();
            const bumpMap = newtMesh.userData.bodyMaterial.bumpMap;

            return {
                asphaltWidth: asphalt.image.width,
                asphaltHeight: asphalt.image.height,
                asphaltMipmaps: asphalt.generateMipmaps,
                asphaltAnisotropy: asphalt.anisotropy,

                grassWidth: grass.image.width,
                grassHeight: grass.image.height,
                grassMipmaps: grass.generateMipmaps,

                rockWidth: rock.image.width,
                rockHeight: rock.image.height,
                rockMipmaps: rock.generateMipmaps,

                glowWidth: glow.image.width,
                glowHeight: glow.image.height,

                bumpWidth: bumpMap ? bumpMap.image.width : 0,
                bumpHeight: bumpMap ? bumpMap.image.height : 0
            };
        });

        expect(texturesInfo.asphaltWidth).toBe(512);
        expect(texturesInfo.asphaltHeight).toBe(1024);
        expect(texturesInfo.asphaltMipmaps).toBe(true);
        expect(texturesInfo.asphaltAnisotropy).toBeGreaterThanOrEqual(1);

        expect(texturesInfo.grassWidth).toBe(512);
        expect(texturesInfo.grassHeight).toBe(512);
        expect(texturesInfo.grassMipmaps).toBe(true);

        expect(texturesInfo.rockWidth).toBe(512);
        expect(texturesInfo.rockHeight).toBe(512);
        expect(texturesInfo.rockMipmaps).toBe(true);

        expect(texturesInfo.glowWidth).toBe(128);
        expect(texturesInfo.glowHeight).toBe(128);

        expect(texturesInfo.bumpWidth).toBe(256);
        expect(texturesInfo.bumpHeight).toBe(256);
    });

    test('high quality flashlight shadow resolution and bias settings', async ({ page }) => {
        await page.goto('http://localhost:3000', { waitUntil: 'load' });

        const shadowInfo = await page.evaluate(async () => {
            const THREE = await import('three');
            const { Flashlight } = await import('/js/flashlight.js');

            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(75, 1, 0.25, 600);
            const fl = new Flashlight(camera, scene, false);
            fl.setQualityLevel(3);

            return {
                shadowWidth: fl.spotlight.shadow.mapSize.width,
                shadowHeight: fl.spotlight.shadow.mapSize.height,
                shadowBias: fl.spotlight.shadow.bias,
                shadowNormalBias: fl.spotlight.shadow.normalBias,
                shadowNear: fl.spotlight.shadow.camera.near
            };
        });

        expect(shadowInfo.shadowWidth).toBe(1024);
        expect(shadowInfo.shadowHeight).toBe(1024);
        expect(shadowInfo.shadowBias).toBeLessThan(0);
        expect(shadowInfo.shadowNormalBias).toBeGreaterThan(0);
        expect(shadowInfo.shadowNear).toBe(0.5);
    });

    test('Mona Sans font is loaded in index.html and applied to body and buttons', async ({ page }) => {
        await page.goto('http://localhost:3000', { waitUntil: 'load' });

        const fontDetails = await page.evaluate(() => {
            const fontLink = document.querySelector('link[href*="Mona+Sans"]');
            const bodyFont = window.getComputedStyle(document.body).fontFamily;
            const buttonFont = window.getComputedStyle(document.querySelector('#start-button')).fontFamily;

            return {
                hasFontLink: !!fontLink,
                bodyFont,
                buttonFont
            };
        });

        expect(fontDetails.hasFontLink).toBe(true);
        expect(fontDetails.bodyFont.toLowerCase()).toContain('mona sans');
        expect(fontDetails.buttonFont.toLowerCase()).toContain('mona sans');
    });
});
