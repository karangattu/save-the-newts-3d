// main.js - Game loop, state management, and integration
import { GameScene } from './scene.js';
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
        this.state = 'menu'; // 'menu', 'playing', 'gameover'
        this.isMobile = false;
        
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
        
        // Create scene (pass mobile flag for optimizations)
        this.gameScene = new GameScene(this.isMobile);
        
        // Create player with mobile flag
        this.player = new Player(
            this.gameScene.camera,
            this.gameScene.scene,
            this.gameScene.roadBounds,
            this.isMobile
        );
        
        // Create flashlight (brighter on mobile)
        this.flashlight = new Flashlight(
            this.gameScene.camera,
            this.gameScene.scene,
            this.isMobile
        );
        
        // Create managers
        this.newtManager = new NewtManager(
            this.gameScene.scene,
            this.flashlight
        );
        
        this.carManager = new CarManager(this.gameScene.scene);
        this.audioManager = new AudioManager();
        this.leaderboard = new LeaderboardManager();
        this.predatorManager = new PredatorManager(this.gameScene.scene, this.gameScene.camera);
        
        // Show start screen
        this.ui.showStartScreen();
    }
    
    setupEventListeners() {
        // Start button
        this.ui.onStartClick(() => this.startGame());
        
        // Restart button
        this.ui.onRestartClick(() => this.startGame());
        
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
        
        // Rescue key (E)
        document.addEventListener('keydown', (e) => {
            if (e.code === 'KeyE' && this.state === 'playing') {
                this.attemptRescue();
            }
        });
        
        // Mobile rescue button
        const rescueButton = document.getElementById('rescue-button');
        if (rescueButton) {
            rescueButton.addEventListener('touchstart', (e) => {
                e.preventDefault();
                if (this.state === 'playing') {
                    this.attemptRescue();
                }
            });
        }
    }
    
    startGame() {
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
        this.ui.hideStartScreen();
        this.ui.hideGameOver();
        this.ui.showGameScreen();
        this.ui.updateBattery(100);
        this.ui.updateScore(0);
        this.ui.updateTime(0);
        this.ui.hideRescuePrompt();
        
        // Start ambient sounds
        this.audioManager.startAmbient();
        
        // Lock pointer (desktop only)
        if (!this.isMobile) {
            this.player.lock();
        }
        
        // Set state
        this.state = 'playing';
    }
    
    attemptRescue() {
        if (this.newtManager.canRescue()) {
            const rescued = this.newtManager.rescue();
            if (rescued) {
                this.audioManager.playRescueSound();
                this.ui.updateScore(this.newtManager.getRescuedCount());
                
                // Recharge battery on rescue
                this.flashlight.recharge(8); // +8% battery per newt
                this.ui.updateBattery(this.flashlight.getBattery());
                this.ui.showBatteryBoost();
            }
        }
    }
    
    gameOver(reason) {
        this.state = 'gameover';
        
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
        if (reason !== 'cliff' && reason !== 'mountain-lion' && reason !== 'bear') {
            this.audioManager.playGameOverSound();
        }
        
        // Unlock pointer
        this.player.unlock();
        
        // Reset camera rotation if fell
        this.gameScene.camera.rotation.z = 0;
        
        // Clear falling darkness
        this.ui.setFallingDarkness(0);
        
        // Update high score
        const score = this.newtManager.getRescuedCount();
        if (score > this.highScore) {
            this.highScore = score;
            localStorage.setItem('newtRescueHighScore', this.highScore);
        }
        
        // Show game over screen
        this.ui.showGameOver(reason, score, this.elapsedTime, this.highScore);
    }
    
    update(deltaTime) {
        if (this.state !== 'playing') return;
        
        // Update elapsed time
        this.elapsedTime += deltaTime;
        
        // Update rain and splashes
        this.gameScene.updateRain(deltaTime, this.player.getPosition());
        this.gameScene.updateSplashes(deltaTime, this.player.getPosition());
        
        // Update player
        const isMoving = this.player.update(deltaTime);
        
        // Play footsteps if moving
        if (isMoving) {
            this.audioManager.playFootstep();
        }
        
        // Check danger zones (cliff and forest)
        const dangerCheck = this.checkDangerZones();
        if (dangerCheck.inDanger) {
            this.handleDangerZone(dangerCheck);
            return;
        }
        
        // Update flashlight
        this.flashlight.update(deltaTime, this.elapsedTime);
        
        // Update newts (pass cars reference for reactive AI)
        this.newtManager.setCars(this.carManager.getCars());
        this.newtManager.update(
            deltaTime,
            this.elapsedTime,
            this.player.getPosition()
        );
        
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
        
        // Check for nearby newts (rescue prompt)
        if (this.newtManager.canRescue()) {
            this.ui.showRescuePrompt();
            
            // Play newt chirp occasionally
            if (Math.random() < 0.02) {
                this.audioManager.playNewtChirp();
            }
        } else {
            this.ui.hideRescuePrompt();
        }
        
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
            this.gameScene.triggerCameraShake(0.15);
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
        const dangerZones = this.gameScene.dangerZones;
        
        // Check cliff (right side) - warning zone then fall zone
        if (playerPos.x > dangerZones.cliff + 4) {
            // Past the edge - falling
            return { inDanger: true, type: 'cliff' };
        }
        
        // Check forest (left side) - deeper in = more dangerous
        if (playerPos.x < dangerZones.forest) {
            // Random chance of predator attack increases the deeper you go
            const depth = Math.abs(playerPos.x - dangerZones.forest);
            const attackChance = Math.min(0.02 + (depth * 0.01), 0.15); // Up to 15% per frame
            
            if (Math.random() < attackChance) {
                const predator = Math.random() < 0.5 ? 'mountain lion' : 'bear';
                return { inDanger: true, type: 'predator', predator };
            }
        }
        
        return { inDanger: false };
    }
    
    handleDangerZone(dangerInfo) {
        if (dangerInfo.type === 'cliff') {
            // Player at cliff edge - animate approach then fall
            this.state = 'falling';
            
            // First walk to edge, then fall
            this.animateCliffApproach(() => {
                this.audioManager.playFallingSound();
                this.animateFalling(() => {
                    this.gameOver('cliff');
                });
            });
        } else if (dangerInfo.type === 'predator') {
            // Predator attack - spawn and animate the predator
            this.state = 'attacked';
            const predator = dangerInfo.predator || 'mountain lion';
            
            // Spawn the predator in the forest
            const playerPos = this.player.getPosition();
            this.predatorManager.spawnPredator(predator, playerPos);
            
            // Play sound
            this.audioManager.playPredatorAttackSound(predator);
            
            // Animate attack toward player
            this.predatorManager.animateAttack(playerPos, 1200, () => {
                // Show attack screen then game over
                this.ui.triggerPredatorAttack(predator);
                setTimeout(() => {
                    this.predatorManager.removePredator();
                    this.gameOver(predator === 'mountain lion' ? 'mountain-lion' : 'bear');
                }, 500);
            });
        }
    }
    
    animateCliffApproach(callback) {
        // Player stumbles to the edge before falling
        this.player.unlock();
        
        const startPos = this.player.getPosition().clone();
        const edgeX = this.gameScene.dangerZones.cliff + 5; // Edge position
        const duration = 800; // Quick stumble
        const startTime = performance.now();
        
        const approach = () => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Stumble toward edge
            const easeProgress = progress * (2 - progress); // Ease out
            this.gameScene.camera.position.x = startPos.x + (edgeX - startPos.x) * easeProgress;
            
            // Camera shake while stumbling
            this.gameScene.camera.position.y = startPos.y + Math.sin(elapsed * 0.02) * 0.1;
            this.gameScene.camera.rotation.z = Math.sin(elapsed * 0.015) * 0.05;
            
            if (progress < 1) {
                requestAnimationFrame(approach);
            } else {
                // Brief pause at edge looking down
                this.gameScene.camera.rotation.x = 0.5; // Look down
                setTimeout(callback, 300);
            }
        };
        
        requestAnimationFrame(approach);
    }
    
    animateFalling(callback) {
        // Disable player controls
        this.player.unlock();
        
        const startY = this.player.getPosition().y;
        const fallDuration = 2000; // 2 seconds
        const startTime = performance.now();
        
        const fall = () => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(elapsed / fallDuration, 1);
            
            // Accelerating fall
            const fallDistance = progress * progress * 30;
            this.gameScene.camera.position.y = startY - fallDistance;
            
            // Spin slightly
            this.gameScene.camera.rotation.z = progress * Math.PI * 0.5;
            
            // Screen gets darker
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
                // Car was removed
                this.audioManager.stopCarEngine(sound);
                this.carEngineSounds.delete(car);
            } else {
                // Update sound based on distance
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
        
        // Save player name for next time
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
        
        // Calculate delta time
        const currentTime = performance.now() / 1000;
        const deltaTime = Math.min(currentTime - this.lastTime, 0.1); // Cap at 100ms
        this.lastTime = currentTime;
        
        // Update game logic
        this.update(deltaTime);
        
        // Render scene
        this.gameScene.render();
    }
}

// Start game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new Game();
});
