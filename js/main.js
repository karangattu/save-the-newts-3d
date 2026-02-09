// main.js - Game loop, state management, and integration
import * as THREE from 'three';
import { LevelManager } from './levels.js';
import { Player } from './player.js';
import { Flashlight } from './flashlight.js';
import { NewtManager } from './newts.js';
import { CarManager } from './cars.js';
import { AudioManager } from './audio.js';
import { UIManager } from './ui.js';
import { LeaderboardManager } from './leaderboard.js';
import { PredatorManager } from './predators.js';

class Game {
    constructor() {
        // Game state
        this.state = 'menu'; // 'menu', 'playing', 'gameover', 'loading'
        this.isMobile = false;
        this.isVisibilityPaused = false;

        // Level tracking
        this.currentLevel = 1;
        this.levelScore = 0; // Score within current level
        this.totalScore = 0; // Total across levels
        this.newtsForNextLevel = 3;

        // Timing
        this.clock = null;
        this.elapsedTime = 0;
        this.lastTime = 0;

        // High score
        this.highScore = parseInt(localStorage.getItem('newtRescueHighScore')) || 0;

        // Car engine sounds
        this.carEngineSounds = new Map();

        // Initialize systems
        this.initSystems();
        this.setupEventListeners();

        // Start render loop
        this.animate();
    }

    initSystems() {
        // Create UI first to detect mobile
        this.ui = new UIManager();
        this.isMobile = this.ui.getIsMobile();

        // Create scene renderer and camera first
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 1.7, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: !this.isMobile });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        const maxPixelRatio = this.isMobile ? 1.5 : 2;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
        this.renderer.shadowMap.enabled = !this.isMobile;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Create level manager
        this.levelManager = new LevelManager(this.scene, this.camera, this.renderer, this.isMobile);

        // Load level 1
        const levelData = this.levelManager.loadLevel(1);
        this.roadCurve = levelData.roadCurve;
        this.roadBounds = levelData.roadBounds;

        // Create player with mobile flag
        this.player = new Player(
            this.camera,
            this.scene,
            this.roadBounds,
            this.isMobile
        );

        // Create flashlight (brighter on mobile)
        this.flashlight = new Flashlight(
            this.camera,
            this.scene,
            this.isMobile
        );

        // Create managers
        this.newtManager = new NewtManager(
            this.scene,
            this.flashlight,
            this.roadCurve
        );

        this.carManager = new CarManager(this.scene, this.roadCurve);
        this.audioManager = new AudioManager();
        this.leaderboard = new LeaderboardManager();
        this.predatorManager = new PredatorManager(this.scene, this.camera);

        // Setup flashlight toggle callbacks
        this.setupFlashlightToggle();

        // Show start screen
        this.ui.showStartScreen();

        // Append renderer to container
        document.getElementById('game-container').appendChild(this.renderer.domElement);

        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize());
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        const maxPixelRatio = this.isMobile ? 1.5 : 2;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
    }

    setupFlashlightToggle() {
        // Desktop: F key
        this.player.setFlashlightToggleCallback(() => this.toggleFlashlight());

        // Mobile: button
        this.ui.onFlashlightToggle(() => this.toggleFlashlight());
    }

    toggleFlashlight() {
        if (this.state !== 'playing') return;

        const isOn = this.flashlight.toggle();

        // Update mobile button appearance
        this.ui.updateFlashlightButton(isOn);

        // Haptic feedback for mobile
        if (this.isMobile) {
            this.ui.hapticLight();
        }
    }

    setupEventListeners() {
        // Start button - now shows video first
        this.ui.onStartClick(() => this.showIntroVideo());

        // Video complete callback
        this.ui.onVideoComplete(() => this.startGameWithLoading());

        // Click to start callback
        this.ui.onClickToStart(() => this.finalizeGameStart());

        // Restart button
        this.ui.onRestartClick(() => this.restartGame());

        // Leaderboard buttons
        this.ui.onViewLeaderboard(() => this.showLeaderboard());
        this.ui.onCloseLeaderboard(() => this.ui.hideLeaderboard());
        this.ui.onSubmitScore(() => this.submitScore());

        // Pointer lock change (desktop only)
        if (!this.isMobile) {
            document.addEventListener('pointerlockchange', () => {
                if (!this.player.isLocked() && this.state === 'playing') {
                    // Player pressed ESC - pause or show menu
                }
            });
        }

        // Pause heavy updates when tab is hidden (mobile battery + CPU)
        document.addEventListener('visibilitychange', () => {
            this.isVisibilityPaused = document.hidden;
            if (this.isVisibilityPaused) {
                this.audioManager.stopAmbient();
                this.audioManager.stopLowBatteryWarning();
            } else if (this.state === 'playing') {
                this.audioManager.startAmbient(this.currentLevel);
            }
        });
    }

    showIntroVideo() {
        // Show the intro video screen
        this.ui.showVideoScreen();
    }

    async startGameWithLoading() {
        // Show loading screen
        this.ui.showLoadingScreen('Loading Game...');

        // Small delay for loading screen to render
        await new Promise(resolve => setTimeout(resolve, 800));

        // Show click to start screen (allows proper pointer lock on desktop)
        this.ui.showClickToStartScreen();
    }

    finalizeGameStart() {
        // Initialize audio context (requires user interaction)
        this.audioManager.init();

        // Reset all systems
        this.player.reset();
        this.flashlight.reset();
        this.newtManager.reset();
        this.carManager.reset();
        this.audioManager.reset();
        this.predatorManager.reset();

        // Clear car engine sounds
        this.carEngineSounds.clear();

        // Reset timing
        this.elapsedTime = 0;
        this.lastTime = performance.now() / 1000;

        // Update UI
        this.ui.hideGameOver();
        this.ui.updateBattery(100);
        this.ui.updateScore(0);
        this.ui.updateTime(0);
        this.ui.updateLevel(this.currentLevel);

        // Show mobile onboarding on first play
        if (this.isMobile && this.ui.isFirstPlay) {
            this.ui.showMobileOnboarding();
            this.ui.markAsPlayed();
        }

        // Haptic feedback for game start
        this.ui.hapticMedium();

        // Start ambient sounds for the current level (crickets in level 1, rain in level 2)
        this.audioManager.startAmbient(this.currentLevel);

        // Lock pointer (desktop only) - this MUST happen within user gesture
        if (!this.isMobile) {
            this.player.lock();
        }

        // Show level start poster
        this.ui.showLevelStartMessage(this.currentLevel);

        // Set state
        this.state = 'playing';
    }

    async startGame() {
        // This is called for restarting after game over - need full flow
        await this.startGameWithLoading();
    }

    async restartGame() {
        // Reset to level 1
        this.currentLevel = 1;
        this.levelScore = 0;
        this.totalScore = 0;
        this.newtsForNextLevel = 3;

        // Reset endless mode multipliers
        this.carManager.setDifficultyMultiplier(1);
        this.newtManager.setSpeedMultiplier(1);
        this.flashlight.setExternalDrainMultiplier(1);

        // Reload level 1
        const levelData = this.levelManager.loadLevel(1);
        this.roadCurve = levelData.roadCurve;
        this.roadBounds = levelData.roadBounds;

        // Update player bounds
        this.player.roadBounds = this.roadBounds;

        // Update managers with new road curve
        this.newtManager.setRoadCurve(this.roadCurve);
        this.carManager.setRoadCurve(this.roadCurve);

        // Show loading screen and then click to start
        await this.startGameWithLoading();
    }

    async loadNextLevel() {
        this.state = 'loading';
        this.currentLevel++;

        // Add to total score
        this.totalScore += this.levelScore;
        this.levelScore = 0;

        // Set newt requirements per level
        if (this.currentLevel === 2) {
            this.newtsForNextLevel = 5;
        } else if (this.currentLevel === 3) {
            this.newtsForNextLevel = 8;
        }

        // Endless mode: after level 3, continue on same scene with escalating difficulty
        if (this.currentLevel > 3) {
            const wave = this.currentLevel - 3;
            this.newtsForNextLevel = 8 + wave * 3;
            this.carManager.setDifficultyMultiplier(1 + wave * 0.15);
            this.newtManager.setSpeedMultiplier(1 + wave * 0.1);
            this.flashlight.setExternalDrainMultiplier(1 + wave * 0.1);

            this.newtManager.reset();
            this.carManager.reset();

            // Reset car engine sounds
            this.carEngineSounds.forEach((sound) => {
                this.audioManager.stopCarEngine(sound);
            });
            this.carEngineSounds.clear();

            // Update UI
            this.ui.updateLevel(this.currentLevel);
            this.ui.updateScore(this.totalScore);
            this.ui.showLevelStartMessage(this.currentLevel);

            this.state = 'playing';
            return;
        }

        // Normal level transition (level 1->2, 2->3)
        // Show loading screen
        this.ui.showLoadingScreen(`Loading Level ${this.currentLevel}...`);

        // Stop ambient audio
        this.audioManager.stopAmbient();

        // Small delay for loading screen to render
        await new Promise(resolve => setTimeout(resolve, 100));

        // Load new level
        const levelData = this.levelManager.loadLevel(this.currentLevel);
        this.roadCurve = levelData.roadCurve;
        this.roadBounds = levelData.roadBounds;

        // Update player
        this.player.reset();
        this.player.roadBounds = this.roadBounds;

        // Update managers
        this.newtManager.reset();
        this.newtManager.setRoadCurve(this.roadCurve);
        this.carManager.reset();
        this.carManager.setRoadCurve(this.roadCurve);

        // Reset flashlight
        this.flashlight.reset();

        // Reset car engine sounds
        this.carEngineSounds.forEach((sound) => {
            this.audioManager.stopCarEngine(sound);
        });
        this.carEngineSounds.clear();

        // Clear predator
        this.predatorManager.reset();

        // Small delay before starting
        await new Promise(resolve => setTimeout(resolve, 500));

        // Hide loading screen
        this.ui.hideLoadingScreen();

        // Update UI
        this.ui.updateLevel(this.currentLevel);
        this.ui.updateScore(this.totalScore);
        this.ui.showLevelStartMessage(this.currentLevel);

        // Resume ambient audio for the active level
        this.audioManager.startAmbient(this.currentLevel);

        // Set state back to playing
        this.state = 'playing';
    }

    gameOver(reason) {
        this.state = 'gameover';

        // Haptic feedback for game over
        this.ui.hapticError();

        // Stop audio
        this.audioManager.stopAmbient();

        // Stop car engine sounds
        this.carEngineSounds.forEach((sound) => {
            this.audioManager.stopCarEngine(sound);
        });
        this.carEngineSounds.clear();

        // Play appropriate sound
        if (reason === 'car' || reason === 'stealth-car') {
            this.audioManager.playCarHitSound();
        }
        // Falling and predator sounds already played before gameOver is called
        if (reason !== 'cliff' && reason !== 'mountain-lion' && reason !== 'bear' && reason !== 'trench') {
            this.audioManager.playGameOverSound();
        }

        // Unlock pointer
        this.player.unlock();

        // Reset camera rotation if fell
        this.camera.rotation.z = 0;

        // Clear falling darkness
        this.ui.setFallingDarkness(0);

        // Calculate final score
        const finalScore = this.totalScore + this.levelScore;

        // Update high score
        if (finalScore > this.highScore) {
            this.highScore = finalScore;
            localStorage.setItem('newtRescueHighScore', this.highScore);
        }

        // Show game over screen
        this.ui.showGameOver(reason, finalScore, this.elapsedTime, this.highScore, this.currentLevel);
    }

    update(deltaTime) {
        if (this.state === 'loading') return;
        if (this.state !== 'playing') return;

        // Update elapsed time
        this.elapsedTime += deltaTime;

        // Update rain/dust and splashes through level manager
        this.levelManager.updateRain(deltaTime, this.player.getPosition());
        this.levelManager.updateSplashes(deltaTime, this.player.getPosition());

        // Update moths
        this.levelManager.updateMoths(deltaTime);

        // Update player
        const isMoving = this.player.update(deltaTime);

        // Play footsteps if moving
        if (isMoving) {
            this.audioManager.playFootstep();
        }

        // Check danger zones based on level
        const dangerCheck = this.checkDangerZones();
        if (dangerCheck.inDanger) {
            this.handleDangerZone(dangerCheck);
            return;
        }

        // Update flashlight
        this.flashlight.update(deltaTime, this.elapsedTime);

        // Update newts
        const rescuedNewts = this.newtManager.update(
            deltaTime,
            this.elapsedTime,
            this.player.getPosition()
        );

        // Handle auto-rescued newts
        if (rescuedNewts && rescuedNewts.length > 0) {
            rescuedNewts.forEach((newt) => {
                this.audioManager.playRescueSound();
                this.ui.hapticSuccess();
                this.ui.showRescueFeedback();

                // Recharge battery on rescue
                this.flashlight.recharge(8); // +8% battery per newt
                this.ui.showBatteryBoost();

                // Rescue celebration particles
                if (newt.mesh) {
                    this.newtManager.createRescueEffect(newt.mesh.position);
                }
                this.flashlight.pulseOnRescue();
            });

            // Update score
            this.levelScore += rescuedNewts.length;
            const displayScore = this.totalScore + this.levelScore;
            this.ui.updateScore(displayScore);
            this.ui.updateBattery(this.flashlight.getBattery());

            // Check for level progression
            if (this.levelScore >= this.newtsForNextLevel) {
                this.loadNextLevel();
                return;
            }
        }

        // Update cars
        this.carManager.update(deltaTime, this.elapsedTime);

        // Check for cars crushing newts
        const crushedNewts = this.carManager.checkNewtCollisions(this.newtManager.getNewts());
        crushedNewts.forEach(newt => {
            this.newtManager.crushNewt(newt);
            this.audioManager.playNewtCrushSound();
        });

        // Update car engine sounds
        this.updateCarEngineSounds();

        // Check car collision
        const collisionResult = this.carManager.checkCollision(
            this.player.getCollisionBox()
        );
        if (collisionResult.collision) {
            this.gameOver(collisionResult.isStealth ? 'stealth-car' : 'car');
            return;
        }

        // Check near-miss
        const nearMissResult = this.carManager.checkNearMiss(
            this.player.getNearMissBox(),
            this.player.getCollisionBox()
        );
        if (nearMissResult) {
            this.audioManager.playNearMissSound();
            this.ui.triggerNearMissEffect();
            this.ui.hapticWarning();
        }

        // Check battery
        if (this.flashlight.isDead()) {
            this.gameOver('battery');
            return;
        }

        // Low battery warning
        if (this.flashlight.isLowBattery()) {
            this.audioManager.startLowBatteryWarning();
        } else {
            this.audioManager.stopLowBatteryWarning();
        }

        // Update UI
        this.ui.updateBattery(this.flashlight.getBattery());
        this.ui.updateTime(this.elapsedTime);
    }

    checkDangerZones() {
        const playerPos = this.player.getPosition();
        const dangerZones = this.levelManager.dangerZones;

        // Both levels use same danger zones: cliff and forest
        // Check cliff (right side)
        if (playerPos.x > dangerZones.cliff + 4) {
            return { inDanger: true, type: 'cliff' };
        }

        // Check forest (left side)
        if (playerPos.x < dangerZones.forest) {
            const depth = Math.abs(playerPos.x - dangerZones.forest);
            const attackChance = Math.min(0.02 + (depth * 0.01), 0.15);

            if (Math.random() < attackChance) {
                const predator = Math.random() < 0.5 ? 'mountain lion' : 'bear';
                return { inDanger: true, type: 'predator', predator };
            }
        }

        return { inDanger: false };
    }

    handleDangerZone(dangerInfo) {
        if (dangerInfo.type === 'cliff') {
            this.state = 'falling';
            this.animateCliffApproach(() => {
                this.audioManager.playFallingSound();
                this.animateFalling(() => {
                    this.gameOver('cliff');
                });
            });
        } else if (dangerInfo.type === 'predator') {
            this.state = 'attacked';
            const predator = dangerInfo.predator || 'mountain lion';

            const playerPos = this.player.getPosition();
            this.predatorManager.spawnPredator(predator, playerPos);

            this.audioManager.playPredatorAttackSound(predator);

            this.predatorManager.animateAttack(playerPos, 1200, () => {
                this.ui.triggerPredatorAttack(predator);
                setTimeout(() => {
                    this.predatorManager.removePredator();
                    this.gameOver(predator === 'mountain lion' ? 'mountain-lion' : 'bear');
                }, 500);
            });
        }
    }

    animateCliffApproach(callback) {
        this.player.unlock();

        const startPos = this.player.getPosition().clone();
        const edgeX = this.levelManager.dangerZones.cliff + 5;
        const duration = 800;
        const startTime = performance.now();

        const approach = () => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            const easeProgress = progress * (2 - progress);
            this.camera.position.x = startPos.x + (edgeX - startPos.x) * easeProgress;
            this.camera.position.y = startPos.y + Math.sin(elapsed * 0.02) * 0.1;
            this.camera.rotation.z = Math.sin(elapsed * 0.015) * 0.05;

            if (progress < 1) {
                requestAnimationFrame(approach);
            } else {
                this.camera.rotation.x = 0.5;
                setTimeout(callback, 300);
            }
        };

        requestAnimationFrame(approach);
    }

    animateFalling(callback) {
        this.player.unlock();

        const startY = this.player.getPosition().y;
        const fallDuration = 2000;
        const startTime = performance.now();

        const fall = () => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(elapsed / fallDuration, 1);

            const fallDistance = progress * progress * 30;
            this.camera.position.y = startY - fallDistance;
            this.camera.rotation.z = progress * Math.PI * 0.5;
            this.ui.setFallingDarkness(progress);

            if (progress < 1) {
                requestAnimationFrame(fall);
            } else {
                callback();
            }
        };

        requestAnimationFrame(fall);
    }

    updateCarEngineSounds() {
        const cars = this.carManager.getCars();
        const playerPos = this.player.getPosition();

        // Add sounds for new cars
        cars.forEach(car => {
            if (!this.carEngineSounds.has(car) && !car.isStealth) {
                const sound = this.audioManager.playCarEngine(car);
                if (sound) {
                    this.carEngineSounds.set(car, sound);
                }
            }
        });

        // Update existing sounds and remove old ones
        this.carEngineSounds.forEach((sound, car) => {
            if (!cars.includes(car)) {
                this.audioManager.stopCarEngine(sound);
                this.carEngineSounds.delete(car);
            } else {
                const distance = playerPos.distanceTo(car.mesh.position);
                this.audioManager.updateCarEngine(sound, distance, car.speed);
            }
        });
    }

    async showLeaderboard() {
        this.ui.showLeaderboard(null);
        this.ui.showLeaderboardLoading();

        const result = await this.leaderboard.fetchTopScores(5);

        if (result.success) {
            this.ui.renderLeaderboard(result.scores);
        } else {
            this.ui.showLeaderboardError(result.error);
        }
    }

    async submitScore() {
        const playerName = this.ui.getPlayerName();
        const gameData = this.ui.getLastGameData();

        if (!playerName) {
            this.ui.setSubmitStatus('Please enter your name', true);
            return;
        }

        if (!gameData) {
            this.ui.setSubmitStatus('No game data to submit', true);
            return;
        }

        this.ui.savePlayerName(playerName);
        this.ui.setSubmitButtonLoading(true);

        const result = await this.leaderboard.submitScore(
            playerName,
            gameData.score,
            gameData.time,
            gameData.reason
        );

        this.ui.setSubmitButtonLoading(false);

        if (result.success) {
            this.ui.setSubmitStatus('Score submitted successfully!');
            this.ui.disableScoreSubmission();
        } else {
            this.ui.setSubmitStatus('Failed to submit: ' + result.error, true);
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const currentTime = performance.now() / 1000;
        let deltaTime = Math.min(currentTime - this.lastTime, 0.1);

        if (this.smoothedDeltaTime === undefined) {
            this.smoothedDeltaTime = deltaTime;
        }
        this.smoothedDeltaTime = this.smoothedDeltaTime * 0.8 + deltaTime * 0.2;
        deltaTime = this.smoothedDeltaTime;

        this.lastTime = currentTime;

        if (this.isVisibilityPaused) {
            return;
        }

        this.update(deltaTime);

        // Render scene
        this.renderer.render(this.scene, this.camera);
    }
}

// Start game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new Game();
});
