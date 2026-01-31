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
    }
    
    startAmbient() {
        if (!this.isInitialized) return;
        
        // Rain sound - filtered noise
        this.createRainSound();
        
        // Wind - low frequency filtered noise
        this.createWindSound();
        
        // Cricket chirps - randomized oscillators (less frequent in rain)
        this.startCrickets();
    }
    
    createRainSound() {
        // Create rain using filtered noise
        const bufferSize = 2 * this.audioContext.sampleRate;
        const noiseBuffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        
        // Main rain noise source
        const rainNoise = this.audioContext.createBufferSource();
        rainNoise.buffer = noiseBuffer;
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
            if (Math.random() < 0.1) { // 10% chance every few seconds
                this.playThunder();
            }
        }, 8000);
    }
    
    playThunder() {
        if (!this.isInitialized) return;
        
        const now = this.audioContext.currentTime;
        
        // Low rumbling noise for thunder
        const bufferSize = this.audioContext.sampleRate * 3;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            // Envelope for thunder - quick attack, long decay
            const env = Math.exp(-i / (bufferSize * 0.4)) * (1 - Math.exp(-i / 1000));
            data[i] = (Math.random() * 2 - 1) * env;
        }
        
        const thunderSource = this.audioContext.createBufferSource();
        thunderSource.buffer = buffer;
        
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
    
    createWindSound() {
        // Create noise using oscillator modulation
        const noiseGain = this.audioContext.createGain();
        noiseGain.gain.value = 0.05;
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
    
    startCrickets() {
        // Random cricket chirps (less frequent due to rain)
        this.cricketInterval = setInterval(() => {
            if (Math.random() < 0.15) { // Reduced from 0.3 due to rain
                this.playCricketChirp();
            }
        }, 800); // Less frequent
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
        
        // Add a small "splat" noise
        const bufferSize = this.audioContext.sampleRate * 0.1;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
        }
        
        const noiseSource = this.audioContext.createBufferSource();
        noiseSource.buffer = buffer;
        
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
        
        // Create engine sound nodes
        const osc = this.audioContext.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 80 + Math.random() * 40;
        
        // Modulator for engine rumble
        const modOsc = this.audioContext.createOscillator();
        modOsc.type = 'sine';
        modOsc.frequency.value = 8;
        
        const modGain = this.audioContext.createGain();
        modGain.gain.value = 10;
        
        modOsc.connect(modGain);
        modGain.connect(osc.frequency);
        
        // Filter
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 300;
        
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
            baseFreq: osc.frequency.value
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
        
        // Whoosh - filtered noise burst
        const bufferSize = this.audioContext.sampleRate * 0.3;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
        }
        
        const noiseSource = this.audioContext.createBufferSource();
        noiseSource.buffer = buffer;
        
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
        
        // Harsh noise burst for impact
        const bufferSize = this.audioContext.sampleRate * 0.5;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
        }
        
        const noiseSource = this.audioContext.createBufferSource();
        noiseSource.buffer = buffer;
        
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
        
        // Water splash - filtered noise burst
        const bufferSize = this.audioContext.sampleRate * 0.8;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            const env = Math.exp(-i / (bufferSize * 0.3)) * (1 - Math.exp(-i / 500));
            data[i] = (Math.random() * 2 - 1) * env;
        }
        
        const noiseSource = this.audioContext.createBufferSource();
        noiseSource.buffer = buffer;
        
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
        const bufferSize = this.audioContext.sampleRate * 1;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.5;
        }
        
        const noiseSource = this.audioContext.createBufferSource();
        noiseSource.buffer = buffer;
        
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
        
        // Violent impact noise
        const bufferSize = this.audioContext.sampleRate * 0.3;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.1));
        }
        
        const noiseSource = this.audioContext.createBufferSource();
        noiseSource.buffer = buffer;
        
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
        
        // Footstep on wet ground - short noise burst
        const bufferSize = this.audioContext.sampleRate * 0.08;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            // Quick attack, fast decay
            const env = Math.exp(-i / (bufferSize * 0.2));
            data[i] = (Math.random() * 2 - 1) * env;
        }
        
        const noiseSource = this.audioContext.createBufferSource();
        noiseSource.buffer = buffer;
        
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
        
        // Breathing - filtered noise with rhythm
        const bufferSize = this.audioContext.sampleRate * 0.8;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            // Breathing envelope
            const phase = i / bufferSize;
            const env = Math.sin(phase * Math.PI) * 0.5;
            data[i] = (Math.random() * 2 - 1) * env;
        }
        
        const noiseSource = this.audioContext.createBufferSource();
        noiseSource.buffer = buffer;
        
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
