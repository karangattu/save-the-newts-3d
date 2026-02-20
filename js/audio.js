// audio.js - Procedural audio using Web Audio API oscillators
export class AudioManager {
    constructor() {
        this.audioContext = null;
        this.isInitialized = false;
        
        // Master volume
        this.masterGain = null;
        
        // Ambient nodes
        this.ambientNodes = [];
        this.cricketInterval = null;
        
        // Low battery warning
        this.lowBatteryOscillator = null;
        this.lowBatteryGain = null;
        this.isLowBatteryPlaying = false;
        
        // Footstep state
        this.lastFootstepTime = 0;
        this.footstepInterval = 400; // ms between footsteps

        // Pre-allocated audio buffers (created once in init())
        this._footstepBuffer = null;
        this._crushNoiseBuffer = null;
        this._nearMissBuffer = null;
        this._carHitBuffer = null;
        this._splashBuffer = null;
        this._thunderBuffer = null;
        this._attackImpactBuffer = null;
        this._predatorNoiseBuffer = null;
        this._breathingBuffer = null;
        this._stormWindBuffer = null;
        this._rainNoiseBuffer = null;
    }
    
    init() {
        if (this.isInitialized) return;
        
        // Create audio context (requires user interaction)
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Master gain
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = 0.5;
        this.masterGain.connect(this.audioContext.destination);
        
        this.isInitialized = true;

        // Pre-create all noise buffers once to avoid GC pressure during gameplay
        this._preAllocateBuffers();
    }

    _preAllocateBuffers() {
        const sr = this.audioContext.sampleRate;

        this._footstepBuffer = this._createNoiseBuffer(Math.ceil(sr * 0.08), (i, len) =>
            Math.exp(-i / (len * 0.2))
        );
        this._crushNoiseBuffer = this._createNoiseBuffer(Math.ceil(sr * 0.1), (i, len) =>
            Math.exp(-i / (len * 0.3))
        );
        this._nearMissBuffer = this._createNoiseBuffer(Math.ceil(sr * 0.3), (i, len) =>
            Math.exp(-i / (len * 0.3))
        );
        this._carHitBuffer = this._createNoiseBuffer(Math.ceil(sr * 0.5), (i, len) =>
            Math.exp(-i / (len * 0.2))
        );
        this._splashBuffer = this._createNoiseBuffer(Math.ceil(sr * 0.8), (i, len) =>
            Math.exp(-i / (len * 0.3)) * (1 - Math.exp(-i / 500))
        );
        this._thunderBuffer = this._createNoiseBuffer(Math.ceil(sr * 3), (i, len) =>
            Math.exp(-i / (len * 0.4)) * (1 - Math.exp(-i / 1000))
        );
        this._attackImpactBuffer = this._createNoiseBuffer(Math.ceil(sr * 0.3), (i, len) =>
            Math.exp(-i / (len * 0.1))
        );
        this._predatorNoiseBuffer = this._createNoiseBuffer(Math.ceil(sr * 1), () => 0.5);
        this._breathingBuffer = this._createNoiseBuffer(Math.ceil(sr * 0.8), (i, len) =>
            Math.sin((i / len) * Math.PI) * 0.5
        );
        this._stormWindBuffer = this._createNoiseBuffer(Math.ceil(sr * 2), () => 1);
        this._rainNoiseBuffer = this._createNoiseBuffer(Math.ceil(sr * 2), () => 1);
    }

    _createNoiseBuffer(size, envelopeFn) {
        const buffer = this.audioContext.createBuffer(1, size, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < size; i++) {
            data[i] = (Math.random() * 2 - 1) * envelopeFn(i, size);
        }
        return buffer;
    }
    
    startAmbient(level = 1) {
        if (!this.isInitialized) return;

        // Wind - low frequency filtered noise (all levels, louder in storm)
        this.createWindSound(level === 3 ? 0.12 : 0.05);

        // Cricket chirps (more frequent in clear night, fewer at dusk, none in storm)
        if (level <= 2) {
            this.startCrickets(level === 1);
        }

        // Level 1: Frog croaking (Pacific tree frogs - realistic for SF area)
        if (level === 1) {
            this.startFrogCroaking();
        }

        // Level 2: Dusk ambient - owl hoots and distant coyotes
        if (level === 2) {
            this.startDuskAmbient();
        }

        // Level 3: Rain and storm
        if (level === 3) {
            this.createRainSound();
            this.createStormWind();
        }
    }
    
    startFrogCroaking() {
        if (!this.isInitialized) return;
        // Pacific tree frog "ribbit" - reduced frequency for performance
        this.frogInterval = setInterval(() => {
            if (Math.random() < 0.3) {
                this.playFrogCroak();
            }
        }, 1800); // Increased interval to reduce GC pressure
    }
    
    playFrogCroak() {
        if (!this.isInitialized) return;
        const now = this.audioContext.currentTime;
        
        // Two-tone "rib-bit" pattern
        const osc1 = this.audioContext.createOscillator();
        osc1.type = 'sine';
        const baseFreq = 800 + Math.random() * 400;
        osc1.frequency.setValueAtTime(baseFreq, now);
        osc1.frequency.linearRampToValueAtTime(baseFreq * 1.2, now + 0.06);
        osc1.frequency.linearRampToValueAtTime(baseFreq * 0.8, now + 0.12);
        
        // Second tone (the "bit")
        const osc2 = this.audioContext.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(baseFreq * 1.3, now + 0.15);
        osc2.frequency.linearRampToValueAtTime(baseFreq * 1.1, now + 0.25);
        
        const gain1 = this.audioContext.createGain();
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(0.04, now + 0.02);
        gain1.gain.linearRampToValueAtTime(0.04, now + 0.1);
        gain1.gain.linearRampToValueAtTime(0, now + 0.13);
        
        const gain2 = this.audioContext.createGain();
        gain2.gain.setValueAtTime(0, now);
        gain2.gain.setValueAtTime(0, now + 0.14);
        gain2.gain.linearRampToValueAtTime(0.035, now + 0.17);
        gain2.gain.linearRampToValueAtTime(0.035, now + 0.22);
        gain2.gain.linearRampToValueAtTime(0, now + 0.28);
        
        // Slight distortion for organic feel
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = baseFreq;
        filter.Q.value = 3;
        
        osc1.connect(gain1);
        gain1.connect(filter);
        osc2.connect(gain2);
        gain2.connect(filter);
        filter.connect(this.masterGain);
        
        osc1.start(now);
        osc1.stop(now + 0.15);
        osc2.start(now + 0.15);
        osc2.stop(now + 0.3);
    }
    
    startDuskAmbient() {
        if (!this.isInitialized) return;
        // Occasional owl hoot
        this.owlInterval = setInterval(() => {
            if (Math.random() < 0.08) {
                this.playOwlHoot();
            }
        }, 6000);
    }
    
    playOwlHoot() {
        if (!this.isInitialized) return;
        const now = this.audioContext.currentTime;
        
        // Great horned owl "hoo-hoo-hooo" - common in Santa Cruz Mtns
        const osc = this.audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.linearRampToValueAtTime(260, now + 0.3);
        osc.frequency.setValueAtTime(280, now + 0.5);
        osc.frequency.linearRampToValueAtTime(250, now + 0.9);
        osc.frequency.setValueAtTime(270, now + 1.1);
        osc.frequency.linearRampToValueAtTime(220, now + 1.8);
        
        const gain = this.audioContext.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.025, now + 0.05);
        gain.gain.linearRampToValueAtTime(0.02, now + 0.25);
        gain.gain.linearRampToValueAtTime(0, now + 0.35);
        gain.gain.linearRampToValueAtTime(0.025, now + 0.5);
        gain.gain.linearRampToValueAtTime(0.02, now + 0.8);
        gain.gain.linearRampToValueAtTime(0, now + 0.95);
        gain.gain.linearRampToValueAtTime(0.03, now + 1.1);
        gain.gain.linearRampToValueAtTime(0.015, now + 1.7);
        gain.gain.linearRampToValueAtTime(0, now + 2.0);
        
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400;
        
        osc.connect(gain);
        gain.connect(filter);
        filter.connect(this.masterGain);
        
        osc.start(now);
        osc.stop(now + 2.0);
    }
    
    createStormWind() {
        if (!this.isInitialized) return;
        
        const windNoise = this.audioContext.createBufferSource();
        windNoise.buffer = this._stormWindBuffer;
        windNoise.loop = true;
        
        const bandPass = this.audioContext.createBiquadFilter();
        bandPass.type = 'bandpass';
        bandPass.frequency.value = 400;
        bandPass.Q.value = 1.5;
        
        // LFO for wind gusts
        const lfo = this.audioContext.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.15;
        const lfoGain = this.audioContext.createGain();
        lfoGain.gain.value = 0.08;
        lfo.connect(lfoGain);
        
        const windGain = this.audioContext.createGain();
        windGain.gain.value = 0.1;
        lfoGain.connect(windGain.gain);
        
        windNoise.connect(bandPass);
        bandPass.connect(windGain);
        windGain.connect(this.masterGain);
        
        windNoise.start();
        lfo.start();
        this.ambientNodes.push(windNoise, lfo);
    }
    
    createRainSound() {
        const rainNoise = this.audioContext.createBufferSource();
        rainNoise.buffer = this._rainNoiseBuffer;
        rainNoise.loop = true;
        
        // High-pass filter to get that rain "hiss"
        const highPass = this.audioContext.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.value = 1000;
        
        // Band-pass for rain character
        const bandPass = this.audioContext.createBiquadFilter();
        bandPass.type = 'bandpass';
        bandPass.frequency.value = 3000;
        bandPass.Q.value = 0.5;
        
        // Gain
        const rainGain = this.audioContext.createGain();
        rainGain.gain.value = 0.15;
        
        rainNoise.connect(highPass);
        highPass.connect(bandPass);
        bandPass.connect(rainGain);
        rainGain.connect(this.masterGain);
        
        rainNoise.start();
        this.ambientNodes.push(rainNoise);
        
        // Add occasional thunder rumble
        this.thunderInterval = setInterval(() => {
            if (Math.random() < 0.08) { // Reduced chance to avoid buffer allocation spikes
                this.playThunder();
            }
        }, 10000); // Increased interval to reduce performance impact
    }
    
    playThunder() {
        if (!this.isInitialized) return;
        
        const now = this.audioContext.currentTime;
        
        const thunderSource = this.audioContext.createBufferSource();
        thunderSource.buffer = this._thunderBuffer;
        
        // Low pass for rumble
        const lowPass = this.audioContext.createBiquadFilter();
        lowPass.type = 'lowpass';
        lowPass.frequency.value = 150;
        
        const thunderGain = this.audioContext.createGain();
        thunderGain.gain.value = 0.3;
        
        thunderSource.connect(lowPass);
        lowPass.connect(thunderGain);
        thunderGain.connect(this.masterGain);
        
        thunderSource.start(now);
    }
    
    createWindSound(volume = 0.05) {
        // Create noise using oscillator modulation
        const noiseGain = this.audioContext.createGain();
        noiseGain.gain.value = volume;
        noiseGain.connect(this.masterGain);
        
        // Low frequency oscillator for wind effect
        const windOsc = this.audioContext.createOscillator();
        windOsc.type = 'sine';
        windOsc.frequency.value = 80;
        
        // Modulate with another oscillator for variation
        const modOsc = this.audioContext.createOscillator();
        modOsc.type = 'sine';
        modOsc.frequency.value = 0.2;
        
        const modGain = this.audioContext.createGain();
        modGain.gain.value = 30;
        
        modOsc.connect(modGain);
        modGain.connect(windOsc.frequency);
        
        // Low pass filter
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 200;
        
        windOsc.connect(filter);
        filter.connect(noiseGain);
        
        windOsc.start();
        modOsc.start();
        
        this.ambientNodes.push(windOsc, modOsc);
    }
    
    startCrickets(isClearNight = false) {
        // Random cricket chirps - reduced frequency for better performance
        const chirpChance = isClearNight ? 0.25 : 0.12;
        const interval = isClearNight ? 800 : 1200; // Reduced frequency to avoid GC pressure

        this.cricketInterval = setInterval(() => {
            if (Math.random() < chirpChance) {
                this.playCricketChirp();
            }
        }, interval);
    }
    
    playCricketChirp() {
        if (!this.isInitialized) return;
        
        const now = this.audioContext.currentTime;
        
        // Cricket chirp - high frequency short burst
        const osc = this.audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 4000 + Math.random() * 2000;
        
        const gain = this.audioContext.createGain();
        gain.gain.value = 0;
        
        // Chirp envelope
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.03, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start(now);
        osc.stop(now + 0.1);
        
        // Sometimes do multiple chirps
        if (Math.random() < 0.5) {
            const osc2 = this.audioContext.createOscillator();
            osc2.type = 'sine';
            osc2.frequency.value = osc.frequency.value * 1.1;
            
            const gain2 = this.audioContext.createGain();
            gain2.gain.setValueAtTime(0, now + 0.06);
            gain2.gain.linearRampToValueAtTime(0.02, now + 0.07);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            
            osc2.connect(gain2);
            gain2.connect(this.masterGain);
            
            osc2.start(now + 0.06);
            osc2.stop(now + 0.15);
        }
    }
    
    playNewtChirp() {
        if (!this.isInitialized) return;
        
        const now = this.audioContext.currentTime;
        
        // Newt chirp - sine wave glide from 400Hz to 600Hz
        const osc = this.audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(600, now + 0.15);
        
        const gain = this.audioContext.createGain();
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start(now);
        osc.stop(now + 0.25);
    }
    
    playNewtCrushSound() {
        if (!this.isInitialized) return;
        
        const now = this.audioContext.currentTime;
        
        // Sad squish sound - quick descending tone with noise
        const osc = this.audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.15);
        
        const oscGain = this.audioContext.createGain();
        oscGain.gain.setValueAtTime(0.2, now);
        oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        
        osc.connect(oscGain);
        oscGain.connect(this.masterGain);
        
        osc.start(now);
        osc.stop(now + 0.2);
        
        // Reuse pre-allocated crush noise buffer
        const noiseSource = this.audioContext.createBufferSource();
        noiseSource.buffer = this._crushNoiseBuffer;
        
        const noiseGain = this.audioContext.createGain();
        noiseGain.gain.value = 0.15;
        
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 500;
        
        noiseSource.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.masterGain);
        
        noiseSource.start(now);
    }
    
    playRescueSound() {
        if (!this.isInitialized) return;
        
        const now = this.audioContext.currentTime;
        
        // Ascending arpeggio C-E-G
        const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
        
        notes.forEach((freq, i) => {
            const osc = this.audioContext.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;
            
            const gain = this.audioContext.createGain();
            const startTime = now + i * 0.08;
            
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.2, startTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.15);
            
            osc.connect(gain);
            gain.connect(this.masterGain);
            
            osc.start(startTime);
            osc.stop(startTime + 0.2);
        });
    }
    
    playCarEngine(car) {
        if (!this.isInitialized || car.isStealth) return null;
        
        // Create engine sound nodes with vehicle-specific characteristics
        const osc = this.audioContext.createOscillator();
        
        // Vehicle-specific sound profiles
        let baseFreq, oscType, modFreq, modAmount, filterFreq;
        
        switch (car.vehicleType) {
            case 'motorcycle':
                // High-pitched whine
                oscType = 'triangle';
                baseFreq = 150 + Math.random() * 50; // 150-200Hz
                modFreq = 15;
                modAmount = 20;
                filterFreq = 800;
                break;
            case 'semi':
                // Deep rumbling diesel
                oscType = 'sawtooth';
                baseFreq = 40 + Math.random() * 20; // 40-60Hz
                modFreq = 4;
                modAmount = 15;
                filterFreq = 200;
                break;
            case 'truck':
                // Lower truck rumble
                oscType = 'sawtooth';
                baseFreq = 60 + Math.random() * 20; // 60-80Hz
                modFreq = 5;
                modAmount = 12;
                filterFreq = 250;
                break;
            case 'suv':
                // Slightly deeper than car
                oscType = 'sawtooth';
                baseFreq = 70 + Math.random() * 30; // 70-100Hz
                modFreq = 7;
                modAmount = 10;
                filterFreq = 280;
                break;
            default: // car, sedan
                oscType = 'sawtooth';
                baseFreq = 80 + Math.random() * 40; // 80-120Hz
                modFreq = 8;
                modAmount = 10;
                filterFreq = 300;
        }
        
        osc.type = oscType;
        osc.frequency.value = baseFreq;
        
        // Modulator for engine rumble
        const modOsc = this.audioContext.createOscillator();
        modOsc.type = 'sine';
        modOsc.frequency.value = modFreq;
        
        const modGain = this.audioContext.createGain();
        modGain.gain.value = modAmount;
        
        modOsc.connect(modGain);
        modGain.connect(osc.frequency);
        
        // Filter
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = filterFreq;
        
        // Gain with distance attenuation
        const gain = this.audioContext.createGain();
        gain.gain.value = 0.15;
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start();
        modOsc.start();
        
        return {
            osc: osc,
            modOsc: modOsc,
            gain: gain,
            baseFreq: baseFreq,
            vehicleType: car.vehicleType
        };
    }
    
    updateCarEngine(engineSound, distance, carSpeed) {
        if (!engineSound) return;
        
        // Distance attenuation - louder as cars get closer
        const maxDistance = 60;
        const minDistance = 3; // Distance at which volume is maximum
        
        // Use inverse square falloff for more realistic sound attenuation
        // Cars get much louder as they approach
        let volume;
        if (distance <= minDistance) {
            volume = 0.6; // Maximum volume when very close
        } else {
            // Quadratic falloff for more dramatic distance effect
            const normalizedDist = (distance - minDistance) / (maxDistance - minDistance);
            volume = Math.max(0, 1 - normalizedDist * normalizedDist) * 0.6;
        }
        engineSound.gain.gain.value = volume;
        
        // Doppler-like pitch shift based on speed
        const pitchMult = 1 + (carSpeed - 10) / 50;
        engineSound.osc.frequency.value = engineSound.baseFreq * pitchMult;
    }
    
    stopCarEngine(engineSound) {
        if (!engineSound) return;
        
        const now = this.audioContext.currentTime;
        engineSound.gain.gain.linearRampToValueAtTime(0, now + 0.1);
        
        setTimeout(() => {
            engineSound.osc.stop();
            engineSound.modOsc.stop();
        }, 150);
    }
    
    playNearMissSound() {
        if (!this.isInitialized) return;
        
        const now = this.audioContext.currentTime;
        
        // Reuse pre-allocated near-miss buffer
        const noiseSource = this.audioContext.createBufferSource();
        noiseSource.buffer = this._nearMissBuffer;
        
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1000;
        filter.Q.value = 0.5;
        
        const gain = this.audioContext.createGain();
        gain.gain.value = 0.4;
        
        noiseSource.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        
        noiseSource.start(now);
        
        // Heartbeat thump
        const heartOsc = this.audioContext.createOscillator();
        heartOsc.type = 'sine';
        heartOsc.frequency.value = 60;
        
        const heartGain = this.audioContext.createGain();
        heartGain.gain.setValueAtTime(0.3, now);
        heartGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        
        heartOsc.connect(heartGain);
        heartGain.connect(this.masterGain);
        
        heartOsc.start(now);
        heartOsc.stop(now + 0.2);
    }
    
    startLowBatteryWarning() {
        if (!this.isInitialized || this.isLowBatteryPlaying) return;
        
        this.isLowBatteryPlaying = true;
        
        // Pulsing square wave beep
        this.lowBatteryOscillator = this.audioContext.createOscillator();
        this.lowBatteryOscillator.type = 'square';
        this.lowBatteryOscillator.frequency.value = 440;
        
        // LFO for pulsing
        const lfo = this.audioContext.createOscillator();
        lfo.type = 'square';
        lfo.frequency.value = 2;
        
        this.lowBatteryGain = this.audioContext.createGain();
        this.lowBatteryGain.gain.value = 0;
        
        const lfoGain = this.audioContext.createGain();
        lfoGain.gain.value = 0.08;
        
        lfo.connect(lfoGain);
        lfoGain.connect(this.lowBatteryGain.gain);
        
        this.lowBatteryOscillator.connect(this.lowBatteryGain);
        this.lowBatteryGain.connect(this.masterGain);
        
        this.lowBatteryOscillator.start();
        lfo.start();
        
        this.lowBatteryLfo = lfo;
    }
    
    stopLowBatteryWarning() {
        if (!this.isLowBatteryPlaying) return;
        
        this.isLowBatteryPlaying = false;
        
        if (this.lowBatteryOscillator) {
            this.lowBatteryOscillator.stop();
            this.lowBatteryOscillator = null;
        }
        if (this.lowBatteryLfo) {
            this.lowBatteryLfo.stop();
            this.lowBatteryLfo = null;
        }
    }
    
    playGameOverSound() {
        if (!this.isInitialized) return;
        
        const now = this.audioContext.currentTime;
        
        // Descending tone sweep
        const osc = this.audioContext.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.8);
        
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2000, now);
        filter.frequency.exponentialRampToValueAtTime(200, now + 0.8);
        
        const gain = this.audioContext.createGain();
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0, now + 1);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start(now);
        osc.stop(now + 1);
    }
    
    playCarHitSound() {
        if (!this.isInitialized) return;
        
        const now = this.audioContext.currentTime;
        
        // Reuse pre-allocated car hit buffer
        const noiseSource = this.audioContext.createBufferSource();
        noiseSource.buffer = this._carHitBuffer;
        
        const gain = this.audioContext.createGain();
        gain.gain.value = 0.5;
        
        noiseSource.connect(gain);
        gain.connect(this.masterGain);
        
        noiseSource.start(now);
    }
    
    playFallingSound() {
        if (!this.isInitialized) return;
        
        const now = this.audioContext.currentTime;
        
        // Falling wind whoosh - descending pitch
        const osc = this.audioContext.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 2);
        
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2000, now);
        filter.frequency.exponentialRampToValueAtTime(200, now + 2);
        
        const gain = this.audioContext.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.2);
        gain.gain.linearRampToValueAtTime(0.4, now + 1.5);
        gain.gain.linearRampToValueAtTime(0, now + 2);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start(now);
        osc.stop(now + 2.1);
        
        // Water splash at the end
        setTimeout(() => this.playSplashSound(), 1800);
    }
    
    playSplashSound() {
        if (!this.isInitialized) return;
        
        const now = this.audioContext.currentTime;
        
        // Reuse pre-allocated splash buffer
        const noiseSource = this.audioContext.createBufferSource();
        noiseSource.buffer = this._splashBuffer;
        
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;
        
        const gain = this.audioContext.createGain();
        gain.gain.value = 0.5;
        
        noiseSource.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        
        noiseSource.start(now);
    }
    
    playPredatorAttackSound(predatorType) {
        if (!this.isInitialized) return;
        
        const now = this.audioContext.currentTime;
        
        // Predator growl/roar
        const growlOsc = this.audioContext.createOscillator();
        growlOsc.type = 'sawtooth';
        
        // Mountain lion: higher pitched scream, Bear: lower growl
        const baseFreq = predatorType === 'mountain lion' ? 300 : 120;
        growlOsc.frequency.setValueAtTime(baseFreq, now);
        growlOsc.frequency.setValueAtTime(baseFreq * 1.2, now + 0.1);
        growlOsc.frequency.setValueAtTime(baseFreq * 0.8, now + 0.3);
        growlOsc.frequency.setValueAtTime(baseFreq * 1.1, now + 0.5);
        
        // Add noise for texture
        const noiseSource = this.audioContext.createBufferSource();
        noiseSource.buffer = this._predatorNoiseBuffer;
        
        // Filter the growl
        const growlFilter = this.audioContext.createBiquadFilter();
        growlFilter.type = 'lowpass';
        growlFilter.frequency.value = predatorType === 'mountain lion' ? 1500 : 600;
        
        // Tremolo for growl variation
        const lfo = this.audioContext.createOscillator();
        lfo.frequency.value = predatorType === 'mountain lion' ? 20 : 8;
        const lfoGain = this.audioContext.createGain();
        lfoGain.gain.value = 0.3;
        lfo.connect(lfoGain);
        
        const growlGain = this.audioContext.createGain();
        lfoGain.connect(growlGain.gain);
        growlGain.gain.value = 0.4;
        
        // Envelope
        const envGain = this.audioContext.createGain();
        envGain.gain.setValueAtTime(0, now);
        envGain.gain.linearRampToValueAtTime(1, now + 0.05);
        envGain.gain.setValueAtTime(1, now + 0.6);
        envGain.gain.exponentialRampToValueAtTime(0.01, now + 1);
        
        growlOsc.connect(growlFilter);
        growlFilter.connect(growlGain);
        noiseSource.connect(growlGain);
        growlGain.connect(envGain);
        envGain.connect(this.masterGain);
        
        growlOsc.start(now);
        lfo.start(now);
        noiseSource.start(now);
        
        growlOsc.stop(now + 1);
        lfo.stop(now + 1);
        noiseSource.stop(now + 1);
        
        // Attack sound after growl
        setTimeout(() => this.playAttackImpact(), 700);
    }
    
    playAttackImpact() {
        if (!this.isInitialized) return;
        
        const now = this.audioContext.currentTime;
        
        // Reuse pre-allocated attack impact buffer
        const noiseSource = this.audioContext.createBufferSource();
        noiseSource.buffer = this._attackImpactBuffer;
        
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 500;
        
        const gain = this.audioContext.createGain();
        gain.gain.value = 0.6;
        
        noiseSource.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        
        noiseSource.start(now);
    }
    
    playFootstep(isRunning = false) {
        if (!this.isInitialized) return;
        
        const now = performance.now();
        const interval = isRunning ? 250 : 400;
        
        if (now - this.lastFootstepTime < interval) return;
        this.lastFootstepTime = now;
        
        const audioNow = this.audioContext.currentTime;
        
        // Reuse pre-allocated footstep buffer
        const noiseSource = this.audioContext.createBufferSource();
        noiseSource.buffer = this._footstepBuffer;
        
        // Low pass for muffled wet ground sound
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400 + Math.random() * 200;
        
        const gain = this.audioContext.createGain();
        gain.gain.value = 0.08 + Math.random() * 0.04;
        
        noiseSource.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        
        noiseSource.start(audioNow);
        
        // Add a subtle squelch for wet ground
        if (Math.random() < 0.3) {
            this.playSquelch();
        }
    }
    
    playSquelch() {
        if (!this.isInitialized) return;
        
        const now = this.audioContext.currentTime;
        
        // High frequency squelch
        const osc = this.audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.05);
        
        const gain = this.audioContext.createGain();
        gain.gain.setValueAtTime(0.03, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start(now);
        osc.stop(now + 0.06);
    }
    
    playBreathing(intensity = 0.5) {
        if (!this.isInitialized) return;
        
        const now = this.audioContext.currentTime;
        
        // Reuse pre-allocated breathing buffer
        const noiseSource = this.audioContext.createBufferSource();
        noiseSource.buffer = this._breathingBuffer;
        
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 300;
        filter.Q.value = 2;
        
        const gain = this.audioContext.createGain();
        gain.gain.value = 0.02 * intensity;
        
        noiseSource.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        
        noiseSource.start(now);
    }
    
    stopAmbient() {
        // Stop ambient oscillators
        this.ambientNodes.forEach(node => {
            try {
                node.stop();
            } catch (e) {}
        });
        this.ambientNodes = [];
        
        // Stop cricket interval
        if (this.cricketInterval) {
            clearInterval(this.cricketInterval);
            this.cricketInterval = null;
        }
        
        // Stop frog interval
        if (this.frogInterval) {
            clearInterval(this.frogInterval);
            this.frogInterval = null;
        }
        
        // Stop owl interval
        if (this.owlInterval) {
            clearInterval(this.owlInterval);
            this.owlInterval = null;
        }
        
        // Stop thunder interval
        if (this.thunderInterval) {
            clearInterval(this.thunderInterval);
            this.thunderInterval = null;
        }
        
        this.stopLowBatteryWarning();
    }
    
    reset() {
        this.stopAmbient();
    }
}