import { describe, expect, test } from 'vitest';
import { resolveGraphicsProfile } from '../../js/quality.js';

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

describe('graphics profile resolution', () => {
    test('Android gets full detail and 2x procedural textures', () => {
        const profile = resolveGraphicsProfile({
            isMobile: true,
            userAgent: ANDROID_UA,
            search: ''
        });

        expect(profile.name).toBe('android');
        expect(profile.qualityLevel).toBe(3);
        expect(profile.highDetail).toBe(true);
        expect(profile.antialias).toBe(true);
        expect(profile.shadows).toBe(true);
        expect(profile.textureScale).toBe(2);
    });

    test('non-Android mobile keeps the conservative preset', () => {
        const profile = resolveGraphicsProfile({
            isMobile: true,
            userAgent: IPHONE_UA,
            search: ''
        });

        expect(profile.name).toBe('mobile');
        expect(profile.qualityLevel).toBe(1);
        expect(profile.highDetail).toBe(false);
        expect(profile.antialias).toBe(false);
        expect(profile.shadows).toBe(false);
        expect(profile.textureScale).toBe(1);
    });

    test('desktop keeps full detail at standard texture size', () => {
        const profile = resolveGraphicsProfile({
            isMobile: false,
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
            search: ''
        });

        expect(profile.name).toBe('desktop');
        expect(profile.qualityLevel).toBe(3);
        expect(profile.highDetail).toBe(true);
        expect(profile.textureScale).toBe(1);
    });

    test('quality query parameter can force low or high detail', () => {
        const low = resolveGraphicsProfile({
            isMobile: true,
            userAgent: ANDROID_UA,
            search: '?quality=low'
        });
        expect(low.qualityLevel).toBe(1);
        expect(low.highDetail).toBe(false);

        const high = resolveGraphicsProfile({
            isMobile: true,
            userAgent: IPHONE_UA,
            search: '?quality=high'
        });
        expect(high.qualityLevel).toBe(3);
        expect(high.highDetail).toBe(true);
        expect(high.textureScale).toBe(2);
    });
});
