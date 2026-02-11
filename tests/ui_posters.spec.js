const { test, expect } = require('@playwright/test');

test.describe('Level Start Posters', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the game
        await page.goto('http://localhost:3000');

        // Bypass intro video and loading
        const startButton = page.locator('#start-button >> visible=true').first();
        await startButton.waitFor({ state: 'visible' });
        await startButton.click();

        // Skip video if present - wait for it to be visible first to avoid race
        const skipButton = page.locator('#skip-video-btn');
        await skipButton.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null);
        if (await skipButton.isVisible()) {
            await skipButton.click();
        }

        // Click to start
        const clickToStart = page.locator('#click-to-start-screen');
        await clickToStart.waitFor({ state: 'visible', timeout: 10000 });
        await clickToStart.click();
    });

    test('should show level 1 poster at game start', async ({ page }) => {
        const poster = page.locator('#level-start-message');
        await expect(poster).toBeVisible();
        await expect(poster).toHaveClass(/level-1/);
        await expect(poster.locator('.level-badge')).toHaveText('Level 01');
        await expect(poster.locator('h2')).toHaveText('Clear Night');
    });

    test('poster should fade out after a few seconds', async ({ page }) => {
        const poster = page.locator('#level-start-message');
        await expect(poster).toBeVisible();

        // Wait for the poster to be removed (should take ~4 seconds total based on JS/CSS)
        await expect(poster).toBeHidden({ timeout: 10000 });
    });
});
