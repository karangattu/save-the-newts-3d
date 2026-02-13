const { test, expect } = require('@playwright/test');

test.describe('Level Start Posters', () => {
    test('should show level 1 poster at game start', async ({ page }) => {
        await page.goto('http://localhost:3000', { waitUntil: 'load' });

        await page.evaluate(async () => {
            const { UIManager } = await import('/js/ui.js');
            const ui = new UIManager();
            ui.showLevelStartMessage(1);
        });

        const poster = page.locator('#level-start-message');
        await expect(poster).toBeVisible();
        await expect(poster).toHaveClass(/level-1/);
        await expect(poster.locator('.level-badge')).toHaveText('Level 01');
        await expect(poster.locator('h2')).toHaveText('Clear Night');
    });

    test('poster should fade out after a few seconds', async ({ page }) => {
        await page.goto('http://localhost:3000', { waitUntil: 'load' });

        await page.evaluate(async () => {
            const { UIManager } = await import('/js/ui.js');
            const ui = new UIManager();
            ui.showLevelStartMessage(1);
        });

        const poster = page.locator('#level-start-message');
        await expect(poster).toBeVisible();

        // Wait for the poster to be removed (should take ~4 seconds total based on JS/CSS)
        await expect(poster).toBeHidden({ timeout: 10000 });
    });
});
