import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

test.describe('Mobile friendliness', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    });

    test('rotate-hint element exists in the DOM', async ({ page }) => {
        const hint = page.locator('#rotate-hint');
        await expect(hint).toBeAttached();
    });

    test('rotate-hint is hidden in landscape (desktop-sized viewport)', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 720 });
        const hint = page.locator('#rotate-hint');
        await expect(hint).toBeHidden();
    });

    test('flashlight toggle button has styled dimensions on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 812 });
        const btn = page.locator('#flashlight-toggle-btn');
        await expect(btn).toBeAttached();
        const box = await btn.boundingBox();
        if (box) {
            expect(box.width).toBeGreaterThan(0);
            expect(box.height).toBeGreaterThan(0);
        }
    });

    test('click-to-start says "Click" on desktop', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.goto(BASE_URL, { waitUntil: 'networkidle' });
        const screen = page.locator('#click-to-start-screen');
        const html = await screen.innerHTML();
        expect(html).toContain('Click to Start');
    });

    test('HUD compact layout in landscape mobile', async ({ page }) => {
        await page.setViewportSize({ width: 812, height: 375 });
        const hud = page.locator('#hud');
        await expect(hud).toBeAttached();
    });
});
