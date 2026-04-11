import { chromium } from '@playwright/test';

const siteUrl = process.env.PAGES_HEALTH_CHECK_URL;
const expectedRowCount = Number.parseInt(process.env.PAGES_HEALTH_CHECK_ROWS ?? '5', 10);
const healthCheckModule = `
import { UIManager } from './ui.js';
import { LeaderboardManager } from './leaderboard.js';

const ui = new UIManager();
const leaderboard = new LeaderboardManager();

ui.showStartScreen();

ui.onViewLeaderboard(async () => {
    ui.showLeaderboard(null);
    ui.showLeaderboardLoading();

    const result = await leaderboard.fetchTopScores(${expectedRowCount});
    if (result.success) {
        ui.renderLeaderboard(result.scores);
        return;
    }

    ui.showLeaderboardError(result.error);
});

ui.onCloseLeaderboard(() => ui.hideLeaderboard());
`;

if (!siteUrl) {
    throw new Error('PAGES_HEALTH_CHECK_URL is required');
}

if (!Number.isInteger(expectedRowCount) || expectedRowCount < 1) {
    throw new Error(`PAGES_HEALTH_CHECK_ROWS must be a positive integer. Received: ${process.env.PAGES_HEALTH_CHECK_ROWS}`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
    await page.route('**/js/main.js', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/javascript',
            body: healthCheckModule
        });
    });

    const response = await page.goto(siteUrl, { waitUntil: 'load', timeout: 30000 });

    if (!response) {
        throw new Error(`Navigation to ${siteUrl} did not produce an HTTP response.`);
    }

    if (!response.ok()) {
        throw new Error(`Expected successful navigation to ${siteUrl} but received HTTP ${response.status()}.`);
    }

    const leaderboardButton = page.locator('#view-leaderboard-btn');
    await leaderboardButton.waitFor({ state: 'visible', timeout: 10000 });
    await leaderboardButton.click();

    const leaderboardModal = page.locator('#leaderboard-modal');
    await leaderboardModal.waitFor({ state: 'visible', timeout: 10000 });

    const rowSelector = '#leaderboard-list .leaderboard-entry';
    const emptyStateSelector = '#leaderboard-list .leaderboard-empty';

    await page.waitForFunction(
        ({ rowSelector, emptyStateSelector, expectedRowCount }) => {
            if (document.querySelector(emptyStateSelector)) {
                return true;
            }

            return document.querySelectorAll(rowSelector).length === expectedRowCount;
        },
        { rowSelector, emptyStateSelector, expectedRowCount },
        { timeout: 20000 }
    );

    const emptyState = page.locator(emptyStateSelector);
    if (await emptyState.count()) {
        const message = (await emptyState.first().textContent())?.trim() || 'Leaderboard returned no rows.';
        throw new Error(message);
    }

    const rowCount = await page.locator(rowSelector).count();
    if (rowCount !== expectedRowCount) {
        throw new Error(`Expected ${expectedRowCount} leaderboard rows but found ${rowCount}.`);
    }

    console.log(`Leaderboard smoke check passed for ${siteUrl} with ${rowCount} rows.`);
} finally {
    await page.close();
    await browser.close();
}
