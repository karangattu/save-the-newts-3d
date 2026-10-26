import { test, expect } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

test('offline score survives restart and syncs when connectivity returns', async ({ page, context }) => {
    let available = false;
    const remote = [];
    await page.route('https://*.supabase.co/**', async route => {
        if (!available) return route.fulfill({ status: 503, body: 'Unavailable' });
        if (route.request().method() === 'POST') remote.push(route.request().postDataJSON());
        return route.fulfill({ json: remote });
    });
    await page.goto('http://localhost:3000');
    await page.waitForFunction(() => !!window.__game);
    await context.setOffline(true);
    await page.evaluate(() => {
        const game = window.__game;
        game.ui.hideLoadingScreen();
        game.ui.hideVideoScreen();
        game.ui.hideClickToStartScreen();
        game.ui.hideStartScreen();
        game.totalScore = 21;
        game.elapsedTime = 92;
        game.gameOver('car');
    });
    await page.locator('#player-name').fill('Offline Ranger');
    await page.locator('#submit-score-btn').click();
    await expect(page.locator('#submit-status')).toContainText('Saved on this device');
    await expect(page.locator('#submit-score-btn')).toBeDisabled();
    expect(remote).toHaveLength(0);

    // Reload the actual app while its leaderboard service is still unavailable.
    await context.setOffline(false);
    await page.reload();
    await page.waitForFunction(() => !!window.__game);
    expect(await page.evaluate(() => window.__game.highScore)).toBe(21);
    await context.setOffline(true);
    await page.evaluate(() => window.__game.showLeaderboard());
    await expect(page.locator('#leaderboard-list')).toContainText('Offline — scores saved on this device');
    await expect(page.locator('#leaderboard-list')).toContainText('Offline Ranger');
    await expect(page.locator('.leaderboard-score')).toHaveText('21');

    available = true;
    await context.setOffline(false);
    await expect.poll(() => remote.length).toBe(1);
    expect(remote[0]).toMatchObject({ player_name: 'Offline Ranger', score: 21, time_survived: 92 });
    expect(remote[0]).not.toHaveProperty('pending');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('newtRescueLeaderboard'))[0].pending)).toBe(false);
});
