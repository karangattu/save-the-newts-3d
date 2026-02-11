const { test, expect } = require('@playwright/test');

// Quick smoke tests for ambient audio behaviour
// - Integration: start game and assert Game invoked AudioManager.startAmbient(level: 1)
// - Unit-like: dynamically import AudioManager and assert different nodes/intervals for level 1 vs level 2

test.describe('Audio smoke tests', () => {
  test.beforeEach(async ({ page }) => {
    // Capture console for assertions
    page.on('console', (msg) => {
      // forward to test output for debugging
      // (Playwright will capture these automatically)
      // console.log(`[page:${msg.type()}] ${msg.text()}`);
    });
  });

  test('integration: starting the game triggers level 1 ambient', async ({ page }) => {
    await page.goto('http://localhost:3000', { waitUntil: 'load' });

    // Wait for the start button and click (user gesture required to initialize AudioContext)
    const startBtn = await page.waitForSelector('#start-button', { state: 'visible' });

    // Preparation: Click the first start button
    await startBtn.click();

    // Handle the video screen if it appears
    const skipBtn = await page.waitForSelector('#skip-video-btn', { state: 'visible', timeout: 5000 }).catch(() => null);
    if (skipBtn) {
      await skipBtn.click();
    }

    // Now we are at the "Click to Start" screen. 
    // This is the interaction that triggers the audio context and startAmbient().
    const clickToStart = await page.waitForSelector('#click-to-start-screen', { state: 'visible' });

    await Promise.all([
      page.waitForEvent('console', msg => msg.text().includes('AudioManager.startAmbient() - level: 1'), { timeout: 10000 }),
      clickToStart.click()
    ]);
  });

  test('unit: AudioManager creates different ambient nodes for level 1 vs level 2', async ({ page }) => {
    await page.goto('http://localhost:3000', { waitUntil: 'load' });

    // Dynamically import the AudioManager from the app and exercise it inside the page
    const result = await page.evaluate(async () => {
      // keep isolation from the game's running instance
      const mod = await import('/js/audio.js');
      const AudioManager = mod.AudioManager;
      const a1 = new AudioManager();
      a1.init();

      // Start level 1 ambient and sample state
      a1.startAmbient(1);
      // allow scheduled intervals / nodes to initialize
      await new Promise(r => setTimeout(r, 150));
      const level1 = {
        ambientNodeTypes: a1.ambientNodes.map(n => n && n.constructor && n.constructor.name).filter(Boolean),
        hasCricketInterval: !!a1.cricketInterval
      };
      a1.stopAmbient && a1.stopAmbient();

      // Start level 3 ambient and sample state
      const a2 = new AudioManager();
      a2.init();
      a2.startAmbient(3);
      await new Promise(r => setTimeout(r, 150));
      const level3 = {
        ambientNodeTypes: a2.ambientNodes.map(n => n && n.constructor && n.constructor.name).filter(Boolean),
        hasCricketInterval: !!a2.cricketInterval
      };
      a2.stopAmbient && a2.stopAmbient();

      return { level1, level3 };
    });

    // Expectations:
    // - Level 1 should have cricketInterval truthy
    // - Level 3 should include an AudioBufferSourceNode (rain)
    expect(result.level1.hasCricketInterval).toBeTruthy();
    expect(result.level3.ambientNodeTypes.length).toBeGreaterThan(0);

    const hasRainNode = result.level3.ambientNodeTypes.some(n => /AudioBufferSourceNode|AudioBufferSource/.test(n));
    expect(hasRainNode, 'expected rain AudioBufferSourceNode in level 3 ambientNodes').toBeTruthy();
  });
});
