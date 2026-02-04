// ui.js - HUD and UI management
export class UIManager {
    constructor() {
        // Get DOM elements
        this.startScreen = document.getElementById('start-screen');
        this.gameoverScreen = document.getElementById('gameover-screen');
        this.hud = document.getElementById('hud');
        this.vignette = document.getElementById('vignette');
        this.mobileControls = document.getElementById('mobile-controls');

        // HUD elements
        this.batteryFill = document.getElementById('battery-fill');
        this.batteryPercent = document.getElementById('battery-percent');
        this.scoreElement = document.getElementById('score');
        this.timeElement = document.getElementById('time');
        this.timeElement = document.getElementById('time');


        // Game over elements
        this.gameoverTitle = document.getElementById('gameover-title');
        this.gameoverReason = document.getElementById('gameover-reason');
        this.finalScore = document.getElementById('final-score');
        this.finalTime = document.getElementById('final-time');
        this.highScoreElement = document.getElementById('high-score');

        // Leaderboard elements
        this.leaderboardModal = document.getElementById('leaderboard-modal');
        this.leaderboardList = document.getElementById('leaderboard-list');
        this.playerNameInput = document.getElementById('player-name');
        this.submitScoreBtn = document.getElementById('submit-score-btn');
        this.submitStatus = document.getElementById('submit-status');
        this.leaderboardBtn = document.getElementById('leaderboard-btn');
        this.viewLeaderboardBtn = document.getElementById('view-leaderboard-btn');
        this.closeLeaderboardBtn = document.getElementById('close-leaderboard-btn');

        // Buttons
        this.startButton = document.getElementById('start-button');
        this.restartButton = document.getElementById('restart-button');

        // Mobile detection
        this.isMobile = this.detectMobile();

        // Haptic support detection
        this.hasHaptics = 'vibrate' in navigator;

        this.flashlightIcon = '<i class="fas fa-lightbulb" aria-hidden="true"></i>';

        // First time player check for onboarding
        this.isFirstPlay = !localStorage.getItem('newtRescuePlayed');



        // Store last game data for submission
        this.lastGameData = null;

        // Create battery boost indicator
        this.createBatteryBoostIndicator();
        this.createFlashlightToggle();

        // Load saved player name
        const savedName = localStorage.getItem('newtRescuePlayerName');
        if (savedName && this.playerNameInput) {
            this.playerNameInput.value = savedName;
        }
    }

    detectMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
            (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) ||
            ('ontouchstart' in window);
    }

    createBatteryBoostIndicator() {
        const boost = document.createElement('div');
        boost.id = 'battery-boost';
        boost.innerHTML = '+8% <i class="fas fa-battery-full"></i>';
        document.body.appendChild(boost);
        this.batteryBoost = boost;

        this.createRescueFeedback();
    }

    createFlashlightToggle() {
        const toggle = document.createElement('button');
        toggle.id = 'flashlight-toggle';
        toggle.type = 'button';
        toggle.classList.add('hidden');

        const mobileButtons = document.getElementById('mobile-buttons');
        if (this.isMobile && mobileButtons) {
            mobileButtons.appendChild(toggle);
        } else {
            document.body.appendChild(toggle);
        }

        this.flashlightToggle = toggle;
    }

    createRescueFeedback() {
        const feedback = document.createElement('div');
        feedback.id = 'rescue-feedback';
        feedback.innerHTML = '<i class="fas fa-frog"></i> Newt Rescued!';
        document.body.appendChild(feedback);
        this.rescueFeedback = feedback;
    }

    showRescueFeedback() {
        if (this.rescueFeedback) {
            this.rescueFeedback.classList.remove('show');
            void this.rescueFeedback.offsetWidth;
            this.rescueFeedback.classList.add('show');
        }
    }

    showStartScreen() {
        this.startScreen.classList.remove('hidden');
        this.gameoverScreen.classList.add('hidden');
        this.hud.classList.add('hidden');
    }

    hideStartScreen() {
        this.startScreen.classList.add('hidden');
    }

    showGameScreen() {
        this.hud.classList.remove('hidden');
        if (this.isMobile) {
            this.mobileControls.classList.remove('hidden');
        }
        if (this.flashlightToggle) {
            this.flashlightToggle.classList.remove('hidden');
        }
    }

    hideGameScreen() {
        this.hud.classList.add('hidden');
        if (this.mobileControls) {
            this.mobileControls.classList.add('hidden');
        }
        if (this.flashlightToggle) {
            this.flashlightToggle.classList.add('hidden');
        }
    }

    showGameOver(reason, score, time, highScore) {
        this.gameoverScreen.classList.remove('hidden');
        this.hud.classList.add('hidden');

        // Hide mobile controls
        if (this.mobileControls) {
            this.mobileControls.classList.add('hidden');
        }

        // Store game data for leaderboard submission
        this.lastGameData = { score, time, reason };

        // Reset submission UI
        if (this.submitScoreBtn) {
            this.submitScoreBtn.disabled = false;
            this.submitScoreBtn.innerHTML = '<i class="fas fa-trophy"></i> Submit Score';
        }
        if (this.submitStatus) {
            this.submitStatus.textContent = '';
            this.submitStatus.className = '';
        }

        // Set reason text based on death type
        if (reason === 'battery') {
            this.gameoverTitle.innerHTML = '<i class="fas fa-battery-empty"></i> Battery Dead!';
            this.gameoverReason.textContent = 'Your flashlight ran out of power.';
        } else if (reason === 'car') {
            this.gameoverTitle.innerHTML = '<i class="fas fa-car-burst"></i> Hit by Vehicle!';
            this.gameoverReason.textContent = 'You were struck by a vehicle.';
        } else if (reason === 'stealth-car') {
            this.gameoverTitle.innerHTML = '<i class="fas fa-ghost"></i> Stealth Vehicle!';
            this.gameoverReason.textContent = 'A silent vehicle came out of nowhere!';
        } else if (reason === 'cliff') {
            this.gameoverTitle.innerHTML = '<i class="fas fa-water"></i> Drowned!';
            this.gameoverReason.textContent = 'You fell off the cliff into the reservoir below.';
        } else if (reason === 'mountain-lion') {
            this.gameoverTitle.innerHTML = '<i class="fas fa-paw"></i> Mountain Lion Attack!';
            this.gameoverReason.textContent = 'A mountain lion ambushed you in the dark forest.';
        } else if (reason === 'bear') {
            this.gameoverTitle.innerHTML = '<i class="fas fa-paw"></i> Bear Attack!';
            this.gameoverReason.textContent = 'A bear attacked you in the dense woods.';
        }

        // Set stats
        this.finalScore.textContent = score;
        this.finalTime.textContent = this.formatTime(time);
        this.highScoreElement.textContent = highScore;
    }

    hideGameOver() {
        this.gameoverScreen.classList.add('hidden');
    }

    updateBattery(percent) {
        // Update bar width
        this.batteryFill.style.width = `${percent}%`;

        // Update text
        this.batteryPercent.textContent = `${Math.round(percent)}%`;

        // Update color class
        this.batteryFill.classList.remove('medium', 'low');
        if (percent < 20) {
            this.batteryFill.classList.add('low');
        } else if (percent < 50) {
            this.batteryFill.classList.add('medium');
        }
    }

    updateScore(score) {
        this.scoreElement.textContent = score;
    }

    updateTime(seconds) {
        this.timeElement.textContent = this.formatTime(seconds);
    }

    setFlashlightToggle(enabled) {
        if (!this.flashlightToggle) return;
        const label = enabled ? 'Turn off flashlight' : 'Turn on flashlight';
        this.flashlightToggle.innerHTML = enabled
            ? `${this.flashlightIcon} Turn Off`
            : `${this.flashlightIcon} Turn On`;
        this.flashlightToggle.setAttribute('aria-label', label);
        this.flashlightToggle.classList.toggle('off', !enabled);
        this.flashlightToggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }



    triggerNearMissEffect() {
        this.vignette.classList.add('active');

        // Remove class after animation
        setTimeout(() => {
            this.vignette.classList.remove('active');
        }, 300);
    }

    showBatteryBoost() {
        if (this.batteryBoost) {
            this.batteryBoost.classList.remove('show');
            // Force reflow to restart animation
            void this.batteryBoost.offsetWidth;
            this.batteryBoost.classList.add('show');
        }
    }

    triggerPredatorAttack(predatorType) {
        // Create predator attack overlay
        const overlay = document.createElement('div');
        overlay.id = 'predator-attack';
        overlay.innerHTML = `
            <div class="predator-icon">
                <i class="fas fa-paw"></i>
            </div>
            <div class="predator-name">${predatorType.toUpperCase()}!</div>
        `;
        document.body.appendChild(overlay);

        // Animate in
        setTimeout(() => overlay.classList.add('active'), 50);

        // Remove after game over shows
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 1500);
    }

    setFallingDarkness(progress) {
        // Create or get falling overlay
        let overlay = document.getElementById('falling-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'falling-overlay';
            document.body.appendChild(overlay);
        }

        overlay.style.opacity = progress;

        // Remove when done
        if (progress <= 0) {
            overlay.style.opacity = '0';
        }
    }

    // Leaderboard methods
    showLeaderboard(scores) {
        this.leaderboardModal.classList.remove('hidden');
        this.renderLeaderboard(scores);
    }

    hideLeaderboard() {
        this.leaderboardModal.classList.add('hidden');
    }

    renderLeaderboard(scores) {
        if (!scores || scores.length === 0) {
            this.leaderboardList.innerHTML = '<p class="leaderboard-empty">No scores yet. Be the first!</p>';
            return;
        }

        const rankClasses = ['gold', 'silver', 'bronze', '', ''];
        const rankIcons = ['🥇', '🥈', '🥉', '4', '5'];

        let html = '';
        scores.forEach((entry, index) => {
            const rankClass = rankClasses[index] || '';
            html += `
                <div class="leaderboard-entry">
                    <div class="leaderboard-rank ${rankClass}">${index + 1}</div>
                    <div class="leaderboard-info">
                        <div class="leaderboard-name">${this.escapeHtml(entry.player_name)}</div>
                        <div class="leaderboard-details">
                            ${this.formatTime(entry.time_survived)} survived
                        </div>
                    </div>
                    <div class="leaderboard-score">${entry.score}</div>
                </div>
            `;
        });

        this.leaderboardList.innerHTML = html;
    }

    showLeaderboardLoading() {
        this.leaderboardList.innerHTML = '<p class="loading"><i class="fas fa-spinner fa-spin"></i> Loading...</p>';
    }

    showLeaderboardError(message) {
        this.leaderboardList.innerHTML = `<p class="leaderboard-empty">Error: ${message}</p>`;
    }

    setSubmitStatus(message, isError = false) {
        if (this.submitStatus) {
            this.submitStatus.textContent = message;
            this.submitStatus.className = isError ? 'error' : 'success';
        }
    }

    setSubmitButtonLoading(loading) {
        if (this.submitScoreBtn) {
            if (loading) {
                this.submitScoreBtn.disabled = true;
                this.submitScoreBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
            } else {
                this.submitScoreBtn.disabled = false;
                this.submitScoreBtn.innerHTML = '<i class="fas fa-trophy"></i> Submit Score';
            }
        }
    }

    disableScoreSubmission() {
        if (this.submitScoreBtn) {
            this.submitScoreBtn.disabled = true;
            this.submitScoreBtn.innerHTML = '<i class="fas fa-check"></i> Submitted!';
        }
    }

    getPlayerName() {
        return this.playerNameInput ? this.playerNameInput.value.trim() : '';
    }

    savePlayerName(name) {
        localStorage.setItem('newtRescuePlayerName', name);
    }

    getLastGameData() {
        return this.lastGameData;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    onSubmitScore(callback) {
        if (this.submitScoreBtn) {
            this.submitScoreBtn.addEventListener('click', callback);
        }
    }

    onViewLeaderboard(callback) {
        if (this.leaderboardBtn) {
            this.leaderboardBtn.addEventListener('click', callback);
        }
        if (this.viewLeaderboardBtn) {
            this.viewLeaderboardBtn.addEventListener('click', callback);
        }
    }

    onCloseLeaderboard(callback) {
        if (this.closeLeaderboardBtn) {
            this.closeLeaderboardBtn.addEventListener('click', callback);
        }
    }

    getIsMobile() {
        return this.isMobile;
    }

    // Haptic feedback methods
    hapticLight() {
        if (this.hasHaptics && this.isMobile) {
            navigator.vibrate(10);
        }
    }

    hapticMedium() {
        if (this.hasHaptics && this.isMobile) {
            navigator.vibrate(25);
        }
    }

    hapticHeavy() {
        if (this.hasHaptics && this.isMobile) {
            navigator.vibrate(50);
        }
    }

    hapticSuccess() {
        if (this.hasHaptics && this.isMobile) {
            navigator.vibrate([20, 50, 30]); // Short-pause-longer pattern
        }
    }

    hapticWarning() {
        if (this.hasHaptics && this.isMobile) {
            navigator.vibrate([50, 30, 50]); // Two quick pulses
        }
    }

    hapticError() {
        if (this.hasHaptics && this.isMobile) {
            navigator.vibrate([100, 50, 100, 50, 100]); // Three strong pulses
        }
    }

    // Mobile onboarding
    showMobileOnboarding() {
        if (!this.isMobile || !this.isFirstPlay) return;

        const overlay = document.createElement('div');
        overlay.id = 'mobile-onboarding';
        overlay.innerHTML = `
            <div class="onboarding-content">
                <h2>Quick Guide</h2>
                <div class="onboarding-tips">
                    <div class="tip">
                        <div class="tip-icon"><i class="fas fa-hand-pointer"></i></div>
                        <div class="tip-text">
                            <strong>Move</strong>
                            <span>Drag the joystick</span>
                        </div>
                    </div>
                    <div class="tip">
                        <div class="tip-icon"><i class="fas fa-hand-sparkles"></i></div>
                        <div class="tip-text">
                            <strong>Look Around</strong>
                            <span>Swipe right side of screen</span>
                        </div>
                    </div>
                    <div class="tip">
                        <div class="tip-icon"><i class="fas fa-frog"></i></div>
                        <div class="tip-text">
                            <strong>Rescue Newts</strong>
                            <span>Walk over newts</span>

                        </div>
                    </div>
                </div>
                <button id="onboarding-dismiss">Got it!</button>
            </div>
        `;
        document.body.appendChild(overlay);

        const dismissBtn = document.getElementById('onboarding-dismiss');
        dismissBtn.addEventListener('click', () => {
            this.hapticLight();
            overlay.classList.add('fade-out');
            setTimeout(() => {
                overlay.remove();
            }, 300);
        });

        // Also dismiss on tap outside
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                dismissBtn.click();
            }
        });
    }

    markAsPlayed() {
        localStorage.setItem('newtRescuePlayed', 'true');
        this.isFirstPlay = false;
    }

    onStartClick(callback) {
        this.startButton.addEventListener('click', callback);
    }

    onRestartClick(callback) {
        this.restartButton.addEventListener('click', callback);
    }

    onFlashlightToggle(callback) {
        if (this.flashlightToggle) {
            this.flashlightToggle.addEventListener('click', callback);
        }
    }
}
