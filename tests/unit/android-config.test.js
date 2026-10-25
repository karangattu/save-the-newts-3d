import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Android packaging config', () => {
    test('Capacitor packages the staged www build', () => {
        const config = JSON.parse(readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));

        expect(config.appId).toBe('org.savethenewts');
        expect(config.appName).toBe('Save the Newts 3D');
        expect(config.webDir).toBe('www');
    });

    test('Gradle version can be overridden by the tagged release workflow', () => {
        const buildGradle = readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');

        expect(buildGradle).toContain('appVersionName');
        expect(buildGradle).toContain('appVersionCode');
        expect(buildGradle).toContain('versionName appVersionName');
        expect(buildGradle).toContain('versionCode appVersionCode');
    });

    test('tagged APK workflow builds for every tag and checks main', () => {
        const workflow = readFileSync(path.join(root, '.github/workflows/android-apk.yml'), 'utf8');

        expect(workflow).toContain('tags:');
        expect(workflow).toContain("git merge-base --is-ancestor");
        expect(workflow).toContain('assembleDebug');
        expect(workflow).toContain('softprops/action-gh-release');
    });
});
