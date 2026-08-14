export class AudioManager {
    constructor() {
        this.audioContext = null;
        this.isInitialized = false;
        
        this.masterGain = null;
        this.ambientNodes = [];
        this.cricketInterval = null;
        this.frogInterval = null;
        this.owlInterval = null;
        this.thunderInterval = null;

        if (typeof Audio !== 'undefined') {
            this.backgroundTrack = new Audio('assets/background_track.mp3');
            this.backgroundTrack.loop = true;
            this.backgroundTrack.volume = 0.12;

            this.videoMusic = new Audio('assets/video_music.mp3');
            this.videoMusic.loop = true;
            this.videoMusic.volume = 0.15;
        } else {
            this.backgroundTrack = { paused: true, play: () => Promise.resolve(), pause: () => {}, currentTime: 0 };
            this.videoMusic = { paused: true, play: () => Promise.resolve(), pause: () => {}, currentTime: 0 };
        }
        
        this.lowBatteryOscillator = null;
        this.lowBatteryGain = null;
        this.isLowBatteryPlaying = false;
        
        this.lastFootstepTime = 0;
        this.footstepInterval = 400;
        this._noiseBuffers = new Map();
    }
    
    init() {
        if (this.isInitialized) return;
        
        const AudioCtx = typeof window !== 'undefined'
            ? (window.AudioContext || window.webkitAudioContext)
            : (typeof AudioContext !== 'undefined' ? AudioContext : null);
        if (!AudioCtx) return;
        this.audioContext = new AudioCtx();
        
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = 0.5;
        this.masterGain.connect(this.audioContext.destination);
        
        this.isInitialized = true;
    }

    getNoiseBuffer(seconds = 1) {
        const key = Math.round(seconds * 10);
        if (this._noiseBuffers.has(key)) {
            return this._noiseBuffers.get(key);
        }
        if (!this.audioContext) return null;
        const length = Math.floor(this.audioContext.sampleRate * seconds);
        const buffer = this.audioContext.createBuffer(1, length, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        this._noiseBuffers.set(key, buffer);
        return buffer;
    }
    
    startAmbient(level = 1) {
        if (!this.isInitialized) return;

        if (this.backgroundTrack.paused) {
            this.backgroundTrack.play().catch(() => {});
        }

        this.createWindSound(level === 3 ? 0.14 : 0.04);

        if (level <= 2) {
            this.startCrickets(level === 1);
        }

        if (level === 1) {
            this.startFrogCroaking();
        }

        if (level === 2) {
            this.startDuskAmbient();
        }

        if (level === 3) {
            this.createRainSound();
            this.createStormWind();
        }
    }

    startVideoMusic() {
        this.videoMusic.currentTime = 0;
        this.videoMusic.play().catch(() => {});
    }

    stopVideoMusic() {
        this.videoMusic.pause();
        this.videoMusic.currentTime = 0;
    }
    
    startFrogCroaking() {
        if (!this.isInitialized) return;
        this.frogInterval = setInterval(() => {
            if (Math.random() < 0.45) {
                this.playFrogCroak();
            }
        }, 1100);
    }
    
    playFrogCroak() {
        if (!this.isInitialized) return;
        const now = this.audioContext.currentTime;
        const baseFreq = 820 + Math.random() * 120;
        
        const osc1 = this.audioContext.createOscillator();
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(baseFreq, now);
        osc1.frequency.exponentialRampToValueAtTime(baseFreq * 1.25, now + 0.08);
        osc1.frequency.exponentialRampToValueAtTime(baseFreq * 0.85, now + 0.16);

        const osc2 = this.audioContext.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(baseFreq * 2.1, now);
        osc2.frequency.exponentialRampToValueAtTime(baseFreq * 2.3, now + 0.08);
        osc2.frequency.exponentialRampToValueAtTime(baseFreq * 1.8, now + 0.16);

        const amOsc = this.audioContext.createOscillator();
        amOsc.type = 'sine';
        amOsc.frequency.setValueAtTime(50, now);

        const amGain = this.audioContext.createGain();
        amGain.gain.value = 0.5;
        amOsc.connect(amGain.gain);

        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1850, now);
        filter.Q.setValueAtTime(4.5, now);

        const gain1 = this.audioContext.createGain();
        gain1.gain.setValueAtTime(0.001, now);
        gain1.gain.exponentialRampToValueAtTime(0.045, now + 0.02);
        gain1.gain.exponentialRampToValueAtTime(0.02, now + 0.1);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain1);
        gain1.connect(this.masterGain);

        osc1.start(now);
        osc2.start(now);
        amOsc.start(now);
        osc1.stop(now + 0.2);
        osc2.stop(now + 0.2);
        amOsc.stop(now + 0.2);

        const osc3 = this.audioContext.createOscillator();
        osc3.type = 'sawtooth';
        osc3.frequency.setValueAtTime(baseFreq * 1.15, now + 0.14);
        osc3.frequency.exponentialRampToValueAtTime(baseFreq * 1.35, now + 0.22);
        osc3.frequency.exponentialRampToValueAtTime(baseFreq * 0.95, now + 0.32);

        const gain2 = this.audioContext.createGain();
        gain2.gain.setValueAtTime(0.001, now + 0.14);
        gain2.gain.exponentialRampToValueAtTime(0.05, now + 0.17);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc3.connect(filter);
        filter.connect(gain2);
        gain2.connect(this.masterGain);

        osc3.start(now + 0.14);
        osc3.stop(now + 0.36);
    }
    
    startDuskAmbient() {
        if (!this.isInitialized) return;
        this.owlInterval = setInterval(() => {
            if (Math.random() < 0.12) {
                this.playOwlHoot();
            }
        }, 5000);
    }
    
    playOwlHoot() {
        if (!this.isInitialized) return;
        const now = this.audioContext.currentTime;
        const basePitch = 240 + Math.random() * 20;

        const hoots = [
            { time: 0, dur: 0.22, pitch: basePitch },
            { time: 0.35, dur: 0.18, pitch: basePitch * 1.05 },
            { time: 0.65, dur: 0.18, pitch: basePitch * 1.02 },
            { time: 0.95, dur: 0.45, pitch: basePitch * 0.92 }
        ];

        hoots.forEach(({ time, dur, pitch }) => {
            const start = now + time;
            const osc = this.audioContext.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(pitch, start);
            osc.frequency.exponentialRampToValueAtTime(pitch * 0.96, start + dur);

            const oscHarmonic = this.audioContext.createOscillator();
            oscHarmonic.type = 'sine';
            oscHarmonic.frequency.setValueAtTime(pitch * 2, start);
            oscHarmonic.frequency.exponentialRampToValueAtTime(pitch * 1.92, start + dur);

            const filter = this.audioContext.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(550, start);

            const gain = this.audioContext.createGain();
            gain.gain.setValueAtTime(0.001, start);
            gain.gain.linearRampToValueAtTime(0.032, start + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

            const harmGain = this.audioContext.createGain();
            harmGain.gain.value = 0.2;

            osc.connect(gain);
            oscHarmonic.connect(harmGain);
            harmGain.connect(gain);
            gain.connect(filter);
            filter.connect(this.masterGain);

            osc.start(start);
            oscHarmonic.start(start);
            osc.stop(start + dur + 0.05);
            oscHarmonic.stop(start + dur + 0.05);
        });
    }
    
    createStormWind() {
        if (!this.isInitialized) return;
        const buffer = this.getNoiseBuffer(2);
        if (!buffer) return;
        
        const windNoise = this.audioContext.createBufferSource();
        windNoise.buffer = buffer;
        windNoise.loop = true;
        
        const bandPass = this.audioContext.createBiquadFilter();
        bandPass.type = 'bandpass';
        bandPass.frequency.value = 350;
        bandPass.Q.value = 2.0;
        
        const lfo = this.audioContext.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.18;
        const lfoGain = this.audioContext.createGain();
        lfoGain.gain.value = 220;
        lfo.connect(lfoGain);
        lfoGain.connect(bandPass.frequency);
        
        const windGain = this.audioContext.createGain();
        windGain.gain.value = 0.12;
        
        windNoise.connect(bandPass);
        bandPass.connect(windGain);
        windGain.connect(this.masterGain);
        
        windNoise.start();
        lfo.start();
        this.ambientNodes.push(windNoise, lfo);
    }
    
    createRainSound() {
        if (!this.isInitialized) return;
        const buffer = this.getNoiseBuffer(2);
        if (!buffer) return;
        
        const rainNoise = this.audioContext.createBufferSource();
        rainNoise.buffer = buffer;
        rainNoise.loop = true;
        
        const highPass = this.audioContext.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.value = 850;
        
        const lowPass = this.audioContext.createBiquadFilter();
        lowPass.type = 'lowpass';
        lowPass.frequency.value = 7500;
        
        const rainGain = this.audioContext.createGain();
        rainGain.gain.value = 0.14;
        
        rainNoise.connect(highPass);
        highPass.connect(lowPass);
        lowPass.connect(rainGain);
        rainGain.connect(this.masterGain);
        
        rainNoise.start();
        this.ambientNodes.push(rainNoise);
        
        this.thunderInterval = setInterval(() => {
            if (Math.random() < 0.12) {
                this.playThunder();
            }
        }, 7500);
    }
    
    playThunder() {
        if (!this.isInitialized) return;
        const now = this.audioContext.currentTime;
        const duration = 3.5;
        const buffer = this.getNoiseBuffer(duration);
        if (!buffer) return;
        
        const thunderSource = this.audioContext.createBufferSource();
        thunderSource.buffer = buffer;
        
        const lowPass = this.audioContext.createBiquadFilter();
        lowPass.type = 'lowpass';
        lowPass.frequency.setValueAtTime(160, now);
        lowPass.frequency.exponentialRampToValueAtTime(60, now + duration);
        
        const thunderGain = this.audioContext.createGain();
        thunderGain.gain.setValueAtTime(0.001, now);
        thunderGain.gain.exponentialRampToValueAtTime(0.38, now + 0.08);
        thunderGain.gain.exponentialRampToValueAtTime(0.15, now + 1.2);
        thunderGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        
        thunderSource.connect(lowPass);
        lowPass.connect(thunderGain);
        thunderGain.connect(this.masterGain);
        
        thunderSource.start(now);
    }
    
    createWindSound(volume = 0.05) {
        if (!this.isInitialized) return;
        const buffer = this.getNoiseBuffer(2);
        if (!buffer) return;

        const noise = this.audioContext.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;

        const lowPass = this.audioContext.createBiquadFilter();
        lowPass.type = 'lowpass';
        lowPass.frequency.value = 220;

        const windGain = this.audioContext.createGain();
        windGain.gain.value = volume;

        const lfo = this.audioContext.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.08;

        const lfoGain = this.audioContext.createGain();
        lfoGain.gain.value = volume * 0.4;

        lfo.connect(lfoGain);
        lfoGain.connect(windGain.gain);

        noise.connect(lowPass);
        lowPass.connect(windGain);
        windGain.connect(this.masterGain);

        noise.start();
        lfo.start();
        this.ambientNodes.push(noise, lfo);
    }
    
    startCrickets(isClearNight = false) {
        const chirpChance = isClearNight ? 0.4 : 0.2;
        const interval = isClearNight ? 450 : 850;
        
        this.cricketInterval = setInterval(() => {
            if (Math.random() < chirpChance) {
                this.playCricketChirp();
            }
        }, interval);
    }
    
    playCricketChirp() {
        if (!this.isInitialized) return;
        const now = this.audioContext.currentTime;
        const baseFreq = 4500 + Math.random() * 800;
        const pulseCount = 3 + Math.floor(Math.random() * 2);

        for (let i = 0; i < pulseCount; i++) {
            const start = now + i * 0.024;
            const osc = this.audioContext.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(baseFreq, start);
            
            const gain = this.audioContext.createGain();
            gain.gain.setValueAtTime(0.001, start);
            gain.gain.exponentialRampToValueAtTime(0.028, start + 0.004);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.018);
            
            osc.connect(gain);
            gain.connect(this.masterGain);
            
            osc.start(start);
            osc.stop(start + 0.02);
        }
    }
    
    playNewtChirp() {
        if (!this.isInitialized) return;
        const now = this.audioContext.currentTime;
        
        const osc = this.audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(420, now);
        osc.frequency.exponentialRampToValueAtTime(740, now + 0.12);
        
        const gain = this.audioContext.createGain();
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(0.18, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start(now);
        osc.stop(now + 0.25);
    }
    
    playNewtCrushSound() {
        if (!this.isInitialized) return;
        const now = this.audioContext.currentTime;
        
        const osc = this.audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.18);
        
        const oscGain = this.audioContext.createGain();
        oscGain.gain.setValueAtTime(0.24, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        
        const buffer = this.getNoiseBuffer(0.2);
        if (buffer) {
            const noise = this.audioContext.createBufferSource();
            noise.buffer = buffer;
            const filter = this.audioContext.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 600;
            const noiseGain = this.audioContext.createGain();
            noiseGain.gain.setValueAtTime(0.2, now);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

            noise.connect(filter);
            filter.connect(noiseGain);
            noiseGain.connect(this.masterGain);
            noise.start(now);
        }

        osc.connect(oscGain);
        oscGain.connect(this.masterGain);
        
        osc.start(now);
        osc.stop(now + 0.2);
    }
    
    playRescueSound() {
        if (!this.isInitialized) return;
        const now = this.audioContext.currentTime;
        const notes = [261.63, 329.63, 392.00, 523.25, 659.25];
        
        notes.forEach((freq, i) => {
            const osc = this.audioContext.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;

            const oscHarmonic = this.audioContext.createOscillator();
            oscHarmonic.type = 'triangle';
            oscHarmonic.frequency.value = freq * 2;
            
            const gain = this.audioContext.createGain();
            const start = now + i * 0.07;
            
            gain.gain.setValueAtTime(0.001, start);
            gain.gain.exponentialRampToValueAtTime(0.18, start + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);

            const harmGain = this.audioContext.createGain();
            harmGain.gain.value = 0.25;
            
            osc.connect(gain);
            oscHarmonic.connect(harmGain);
            harmGain.connect(gain);
            gain.connect(this.masterGain);
            
            osc.start(start);
            oscHarmonic.start(start);
            osc.stop(start + 0.4);
            oscHarmonic.stop(start + 0.4);
        });
    }
    
    playCarEngine(car) {
        if (!this.isInitialized || car.isStealth) return null;
        
        const osc = this.audioContext.createOscillator();
        let baseFreq, oscType, modFreq, modAmount, filterFreq;
        
        switch (car.vehicleType) {
            case 'motorcycle':
                oscType = 'sawtooth';
                baseFreq = 160 + Math.random() * 40;
                modFreq = 18;
                modAmount = 25;
                filterFreq = 750;
                break;
            case 'semi':
                oscType = 'sawtooth';
                baseFreq = 42 + Math.random() * 15;
                modFreq = 6;
                modAmount = 20;
                filterFreq = 220;
                break;
            case 'truck':
                oscType = 'sawtooth';
                baseFreq = 58 + Math.random() * 18;
                modFreq = 8;
                modAmount = 16;
                filterFreq = 280;
                break;
            case 'suv':
                oscType = 'sawtooth';
                baseFreq = 72 + Math.random() * 20;
                modFreq = 9;
                modAmount = 14;
                filterFreq = 320;
                break;
            default:
                oscType = 'sawtooth';
                baseFreq = 82 + Math.random() * 25;
                modFreq = 10;
                modAmount = 12;
                filterFreq = 350;
        }
        
        osc.type = oscType;
        osc.frequency.value = baseFreq;
        
        const modOsc = this.audioContext.createOscillator();
        modOsc.type = 'sine';
        modOsc.frequency.value = modFreq;
        
        const modGain = this.audioContext.createGain();
        modGain.gain.value = modAmount;
        modOsc.connect(modGain);
        modGain.connect(osc.frequency);
        
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = filterFreq;
        
        let panner = null;
        if (this.audioContext.createStereoPanner) {
            panner = this.audioContext.createStereoPanner();
        }

        const gain = this.audioContext.createGain();
        gain.gain.value = 0.001;
        
        osc.connect(filter);
        if (panner) {
            filter.connect(panner);
            panner.connect(gain);
        } else {
            filter.connect(gain);
        }
        gain.connect(this.masterGain);
        
        osc.start();
        modOsc.start();
        
        return {
            osc,
            modOsc,
            gain,
            panner,
            baseFreq,
            vehicleType: car.vehicleType
        };
    }
    
    updateCarEngine(engineSound, distance, carSpeed, pan = 0) {
        if (!engineSound) return;
        
        const maxDistance = 65;
        const minDistance = 2.5;
        
        let volume;
        if (distance <= minDistance) {
            volume = 0.65;
        } else {
            const normalizedDist = (distance - minDistance) / (maxDistance - minDistance);
            volume = Math.max(0, 1 - normalizedDist * normalizedDist) * 0.65;
        }
        engineSound.gain.gain.value = volume;
        
        const pitchMult = 1 + (carSpeed - 10) / 45;
        engineSound.osc.frequency.value = engineSound.baseFreq * pitchMult;

        if (engineSound.panner) {
            engineSound.panner.pan.value = Math.max(-1, Math.min(1, pan));
        }
    }
    
    stopCarEngine(engineSound) {
        if (!engineSound) return;
        
        const now = this.audioContext.currentTime;
        engineSound.gain.gain.linearRampToValueAtTime(0.001, now + 0.1);
        
        setTimeout(() => {
            try {
                engineSound.osc.stop();
                engineSound.modOsc.stop();
            } catch (e) {}
        }, 150);
    }
    
    playNearMissSound() {
        if (!this.isInitialized) return;
        const now = this.audioContext.currentTime;
        
        const buffer = this.getNoiseBuffer(0.35);
        if (buffer) {
            const noise = this.audioContext.createBufferSource();
            noise.buffer = buffer;
            const filter = this.audioContext.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(800, now);
            filter.frequency.exponentialRampToValueAtTime(200, now + 0.35);
            filter.Q.value = 1.2;

            const gain = this.audioContext.createGain();
            gain.gain.setValueAtTime(0.001, now);
            gain.gain.linearRampToValueAtTime(0.45, now + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.masterGain);
            noise.start(now);
        }
        
        const heartOsc = this.audioContext.createOscillator();
        heartOsc.type = 'sine';
        heartOsc.frequency.setValueAtTime(75, now);
        heartOsc.frequency.exponentialRampToValueAtTime(45, now + 0.15);
        
        const heartGain = this.audioContext.createGain();
        heartGain.gain.setValueAtTime(0.35, now);
        heartGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        
        heartOsc.connect(heartGain);
        heartGain.connect(this.masterGain);
        
        heartOsc.start(now);
        heartOsc.stop(now + 0.2);
    }
    
    startLowBatteryWarning() {
        if (!this.isInitialized || this.isLowBatteryPlaying) return;
        this.isLowBatteryPlaying = true;
        
        this.lowBatteryOscillator = this.audioContext.createOscillator();
        this.lowBatteryOscillator.type = 'sine';
        this.lowBatteryOscillator.frequency.value = 520;
        
        const lfo = this.audioContext.createOscillator();
        lfo.type = 'square';
        lfo.frequency.value = 2.5;
        
        this.lowBatteryGain = this.audioContext.createGain();
        this.lowBatteryGain.gain.value = 0;
        
        const lfoGain = this.audioContext.createGain();
        lfoGain.gain.value = 0.07;
        
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
            try { this.lowBatteryOscillator.stop(); } catch (e) {}
            this.lowBatteryOscillator = null;
        }
        if (this.lowBatteryLfo) {
            try { this.lowBatteryLfo.stop(); } catch (e) {}
            this.lowBatteryLfo = null;
        }
    }
    
    playGameOverSound() {
        if (!this.isInitialized) return;
        const now = this.audioContext.currentTime;
        
        const osc = this.audioContext.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(75, now + 0.9);
        
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1600, now);
        filter.frequency.exponentialRampToValueAtTime(150, now + 0.9);
        
        const gain = this.audioContext.createGain();
        gain.gain.setValueAtTime(0.28, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 1.0);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start(now);
        osc.stop(now + 1.05);
    }
    
    playCarHitSound() {
        if (!this.isInitialized) return;
        const now = this.audioContext.currentTime;
        const buffer = this.getNoiseBuffer(0.5);
        if (!buffer) return;

        const noise = this.audioContext.createBufferSource();
        noise.buffer = buffer;

        const lowPass = this.audioContext.createBiquadFilter();
        lowPass.type = 'lowpass';
        lowPass.frequency.setValueAtTime(450, now);

        const gain = this.audioContext.createGain();
        gain.gain.setValueAtTime(0.55, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        noise.connect(lowPass);
        lowPass.connect(gain);
        gain.connect(this.masterGain);

        noise.start(now);
    }
    
    playFallingSound() {
        if (!this.isInitialized) return;
        const now = this.audioContext.currentTime;
        
        const osc = this.audioContext.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(360, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 1.9);
        
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1800, now);
        filter.frequency.exponentialRampToValueAtTime(180, now + 1.9);
        
        const gain = this.audioContext.createGain();
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.32, now + 0.2);
        gain.gain.linearRampToValueAtTime(0.38, now + 1.4);
        gain.gain.linearRampToValueAtTime(0.001, now + 1.95);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start(now);
        osc.stop(now + 2.0);
        
        setTimeout(() => this.playSplashSound(), 1750);
    }
    
    playSplashSound() {
        if (!this.isInitialized) return;
        const now = this.audioContext.currentTime;
        const buffer = this.getNoiseBuffer(0.8);
        if (!buffer) return;

        const noise = this.audioContext.createBufferSource();
        noise.buffer = buffer;

        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(900, now);
        filter.frequency.exponentialRampToValueAtTime(200, now + 0.7);

        const gain = this.audioContext.createGain();
        gain.gain.setValueAtTime(0.48, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        noise.start(now);
    }
    
    playPredatorAttackSound(predatorType) {
        if (!this.isInitialized) return;
        const now = this.audioContext.currentTime;
        const isLion = predatorType === 'mountain lion';
        const baseFreq = isLion ? 280 : 110;

        const growlOsc = this.audioContext.createOscillator();
        growlOsc.type = 'sawtooth';
        growlOsc.frequency.setValueAtTime(baseFreq, now);
        growlOsc.frequency.exponentialRampToValueAtTime(baseFreq * 1.3, now + 0.15);
        growlOsc.frequency.exponentialRampToValueAtTime(baseFreq * 0.75, now + 0.45);
        
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = isLion ? 1400 : 500;
        filter.Q.value = 2.5;

        const lfo = this.audioContext.createOscillator();
        lfo.frequency.value = isLion ? 22 : 9;
        const lfoGain = this.audioContext.createGain();
        lfoGain.gain.value = 0.35;
        lfo.connect(lfoGain);

        const growlGain = this.audioContext.createGain();
        growlGain.gain.setValueAtTime(0.001, now);
        growlGain.gain.linearRampToValueAtTime(0.45, now + 0.06);
        growlGain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);

        growlOsc.connect(filter);
        filter.connect(growlGain);
        growlGain.connect(this.masterGain);

        growlOsc.start(now);
        lfo.start(now);
        growlOsc.stop(now + 1.0);
        lfo.stop(now + 1.0);

        setTimeout(() => this.playAttackImpact(), 650);
    }
    
    playAttackImpact() {
        if (!this.isInitialized) return;
        const now = this.audioContext.currentTime;
        const buffer = this.getNoiseBuffer(0.3);
        if (!buffer) return;

        const noise = this.audioContext.createBufferSource();
        noise.buffer = buffer;

        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 450;

        const gain = this.audioContext.createGain();
        gain.gain.setValueAtTime(0.55, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        noise.start(now);
    }
    
    playFootstep(isRunning = false) {
        if (!this.isInitialized) return;
        
        const now = performance.now();
        const interval = isRunning ? 250 : 400;
        
        if (now - this.lastFootstepTime < interval) return;
        this.lastFootstepTime = now;
        
        const audioNow = this.audioContext.currentTime;
        const buffer = this.getNoiseBuffer(0.09);
        if (!buffer) return;

        const noise = this.audioContext.createBufferSource();
        noise.buffer = buffer;

        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 350 + Math.random() * 200;
        filter.Q.value = 1.5;

        const gain = this.audioContext.createGain();
        gain.gain.setValueAtTime(0.08 + Math.random() * 0.04, audioNow);
        gain.gain.exponentialRampToValueAtTime(0.001, audioNow + 0.08);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        noise.start(audioNow);
    }
    
    playSquelch() {
        if (!this.isInitialized) return;
        const now = this.audioContext.currentTime;
        
        const osc = this.audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(750, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.06);
        
        const gain = this.audioContext.createGain();
        gain.gain.setValueAtTime(0.035, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start(now);
        osc.stop(now + 0.07);
    }
    
    playBreathing(intensity = 0.5) {
        if (!this.isInitialized) return;
        const now = this.audioContext.currentTime;
        const buffer = this.getNoiseBuffer(0.8);
        if (!buffer) return;

        const noise = this.audioContext.createBufferSource();
        noise.buffer = buffer;

        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 320;
        filter.Q.value = 2.2;

        const gain = this.audioContext.createGain();
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.024 * intensity, now + 0.35);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.78);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        noise.start(now);
    }
    
    stopAmbient() {
        this.backgroundTrack.pause();

        this.ambientNodes.forEach(node => {
            try { node.stop(); } catch (e) {}
        });
        this.ambientNodes = [];
        
        if (this.cricketInterval) {
            clearInterval(this.cricketInterval);
            this.cricketInterval = null;
        }
        
        if (this.frogInterval) {
            clearInterval(this.frogInterval);
            this.frogInterval = null;
        }
        
        if (this.owlInterval) {
            clearInterval(this.owlInterval);
            this.owlInterval = null;
        }
        
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
