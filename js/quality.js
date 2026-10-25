// quality.js - graphics presets for desktop, mobile web, and packaged Android.
//
// An Android APK ships every asset inside the app, so it can start on the full
// detail preset instead of the conservative mobile one. The adaptive quality
// controller in main.js still steps the preset down if the GPU cannot keep up.

const LOW_PROFILE = Object.freeze({
    name: 'mobile',
    qualityLevel: 1,
    highDetail: false,
    antialias: false,
    shadows: false,
    maxPixelRatio: 2,
    textureScale: 1
});

function createHighProfile(name, textureScale) {
    return {
        name,
        qualityLevel: 3,
        highDetail: true,
        antialias: true,
        shadows: true,
        maxPixelRatio: 2,
        textureScale
    };
}

function readQualityOverride(search) {
    try {
        return (new URLSearchParams(search || '').get('quality') || '').toLowerCase();
    } catch (error) {
        return '';
    }
}

export function resolveGraphicsProfile({ isMobile = false, userAgent = '', search = '' } = {}) {
    const override = readQualityOverride(search);

    if (override === 'low') {
        return { ...LOW_PROFILE, name: 'low-override' };
    }

    if (override === 'high') {
        return createHighProfile('high-override', isMobile ? 2 : 1);
    }

    if (!isMobile) {
        return createHighProfile('desktop', 1);
    }

    // Android WebView / APK builds get the maximum preset. Other mobile
    // browsers keep the conservative preset for battery and GPU headroom.
    if (/Android/i.test(userAgent)) {
        return createHighProfile('android', 2);
    }

    return LOW_PROFILE;
}
