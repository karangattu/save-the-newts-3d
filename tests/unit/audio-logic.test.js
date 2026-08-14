import { describe, expect, test, beforeEach, vi } from 'vitest';
import { AudioManager } from '../../js/audio.js';

class MockParam {
    constructor(val = 0) {
        this.value = val;
    }
    setValueAtTime(val) { this.value = val; }
    linearRampToValueAtTime(val) { this.value = val; }
    exponentialRampToValueAtTime(val) { this.value = val; }
}

class MockNode {
    constructor() {
        this.frequency = new MockParam(440);
        this.gain = new MockParam(1);
        this.pan = new MockParam(0);
        this.Q = new MockParam(1);
        this.type = 'sine';
        this.buffer = null;
        this.loop = false;
    }
    connect(target) { return target; }
    disconnect() {}
    start() {}
    stop() {}
}

class MockAudioContext {
    constructor() {
        this.sampleRate = 44100;
        this.currentTime = 0;
        this.destination = new MockNode();
    }
    createGain() { return new MockNode(); }
    createOscillator() { return new MockNode(); }
    createBiquadFilter() { return new MockNode(); }
    createBufferSource() { return new MockNode(); }
    createStereoPanner() { return new MockNode(); }
    createBuffer(channels, length, sampleRate) {
        return {
            numberOfChannels: channels,
            length,
            sampleRate,
            getChannelData: () => new Float32Array(length)
        };
    }
}

describe('AudioManager logic', () => {
    let audioManager;

    beforeEach(() => {
        global.Audio = class {
            constructor() {
                this.loop = false;
                this.volume = 1;
                this.paused = true;
            }
            play() { this.paused = false; return Promise.resolve(); }
            pause() { this.paused = true; }
        };
        global.AudioContext = MockAudioContext;
        global.webkitAudioContext = MockAudioContext;

        audioManager = new AudioManager();
        audioManager.init();
    });

    test('initializes AudioContext and master gain', () => {
        expect(audioManager.isInitialized).toBe(true);
        expect(audioManager.masterGain).toBeDefined();
        expect(audioManager.masterGain.gain.value).toBe(0.5);
    });

    test('getNoiseBuffer caches buffers by duration', () => {
        const buf1 = audioManager.getNoiseBuffer(1.0);
        const buf2 = audioManager.getNoiseBuffer(1.0);
        expect(buf1).toBe(buf2);
        expect(buf1.length).toBe(44100);
    });

    test('playCarEngine generates vehicle specific frequency profiles and panner', () => {
        const car = { vehicleType: 'semi', isStealth: false };
        const sound = audioManager.playCarEngine(car);

        expect(sound).toBeDefined();
        expect(sound.vehicleType).toBe('semi');
        expect(sound.baseFreq).toBeLessThan(70);
        expect(sound.panner).toBeDefined();

        const moto = { vehicleType: 'motorcycle', isStealth: false };
        const motoSound = audioManager.playCarEngine(moto);
        expect(motoSound.baseFreq).toBeGreaterThan(120);

        audioManager.stopCarEngine(sound);
        audioManager.stopCarEngine(motoSound);
    });

    test('updateCarEngine applies distance attenuation and stereo panning', () => {
        const car = { vehicleType: 'sedan', isStealth: false };
        const sound = audioManager.playCarEngine(car);

        audioManager.updateCarEngine(sound, 2, 25, -0.75);
        expect(sound.gain.gain.value).toBeCloseTo(0.65);
        expect(sound.panner.pan.value).toBe(-0.75);

        audioManager.updateCarEngine(sound, 65, 25, 0.5);
        expect(sound.gain.gain.value).toBeCloseTo(0);
        expect(sound.panner.pan.value).toBe(0.5);

        audioManager.stopCarEngine(sound);
    });

    test('ambient generators and timers clean up on stopAmbient', () => {
        audioManager.startAmbient(1);
        expect(audioManager.frogInterval).toBeDefined();
        expect(audioManager.cricketInterval).toBeDefined();

        audioManager.startLowBatteryWarning();
        expect(audioManager.isLowBatteryPlaying).toBe(true);

        audioManager.stopAmbient();
        expect(audioManager.frogInterval).toBeNull();
        expect(audioManager.cricketInterval).toBeNull();
        expect(audioManager.isLowBatteryPlaying).toBe(false);
    });

    test('playRescueSound executes without errors', () => {
        expect(() => audioManager.playRescueSound()).not.toThrow();
        expect(() => audioManager.playNewtChirp()).not.toThrow();
        expect(() => audioManager.playFrogCroak()).not.toThrow();
        expect(() => audioManager.playOwlHoot()).not.toThrow();
        expect(() => audioManager.playFootstep(true)).not.toThrow();
    });
});
