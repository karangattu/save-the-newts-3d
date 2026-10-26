// leaderboard.js - Supabase integration for 3d_newt_leaderboard
export class LeaderboardManager {
    constructor() {
        // Supabase configuration
        this.supabaseUrl = 'https://ovwktjjeoowlktdfbuuu.supabase.co';
        this.supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92d2t0amplb293bGt0ZGZidXV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NjcwODcsImV4cCI6MjA4MzM0MzA4N30.pl8T9J0cfgVd7bYt7N32Z9bEOxzIdAEJlS_NZ3h8ugk';
        this.tableName = '3d_newt_leaderboard';
        
        this.isLoading = false;
        this.cachedScores = null;
        this.cacheExpiry = 0;
        this.cacheDuration = 30000; // 30 seconds cache
        this.storageKey = 'newtRescueLeaderboard';
        this.syncPromise = null;
        window.addEventListener('online', () => this.syncPendingScores());
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') this.syncPendingScores();
        });
        setInterval(() => this.syncPendingScores(), 30000);
        this.syncPendingScores();
    }

    readLocalScores() {
        const scores = JSON.parse(localStorage.getItem(this.storageKey) || '[]');
        if (!Array.isArray(scores)) throw new Error('Invalid saved scores');
        return scores;
    }

    bestScores(scores, limit) {
        const best = new Map();
        for (const entry of scores) {
            if (!best.has(entry.player_name) || entry.score > best.get(entry.player_name).score) {
                best.set(entry.player_name, entry);
            }
        }
        return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
    }

    localLeaderboard(limit) {
        try {
            return { success: true, offline: true, scores: this.bestScores(this.readLocalScores(), limit) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    syncPendingScores() {
        if (this.syncPromise) return this.syncPromise;
        if (navigator.onLine === false) return Promise.resolve();
        this.syncPromise = Promise.resolve().then(() => this.flushPendingScores())
            .finally(() => { this.syncPromise = null; });
        return this.syncPromise;
    }

    async flushPendingScores() {
        try {
            let entry;
            while ((entry = this.readLocalScores().find(score => score.pending))) {
                const result = await this.uploadScore(entry);
                if (!result.success) break;
                // Re-read after the request so a newer score saved during upload stays queued.
                const scores = this.readLocalScores();
                const current = scores.find(score => score.player_name === entry.player_name);
                if (current && current.score === entry.score) current.pending = false;
                localStorage.setItem(this.storageKey, JSON.stringify(scores));
                this.cachedScores = null;
                this.cacheExpiry = 0;
            }
        } catch (error) {
            console.warn('Score sync deferred:', error.message);
        }
    }
    
    async fetchTopScores(limit = 5) {
        if (navigator.onLine === false) return this.localLeaderboard(limit);
        await this.syncPendingScores();
        // Return cached scores if still valid
        if (this.cachedScores && Date.now() < this.cacheExpiry) {
            return { success: true, scores: this.bestScores([...this.cachedScores, ...this.readLocalScores()], limit) };
        }
        
        this.isLoading = true;
        
        try {
            // Fetch a large batch to ensure we get enough unique players after deduplication
            const fetchLimit = Math.max(limit * 10, 50);
            const response = await fetch(
                `${this.supabaseUrl}/rest/v1/${this.tableName}?select=*&order=score.desc&limit=${fetchLimit}`,
                {
                    method: 'GET',
                    signal: AbortSignal.timeout(10000),
                    headers: {
                        'apikey': this.supabaseKey,
                        'Authorization': `Bearer ${this.supabaseKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const allScores = await response.json();
            
            // Deduplicate by player name - keep only highest score per player
            const playerBestScores = new Map();
            for (const score of allScores) {
                const existing = playerBestScores.get(score.player_name);
                if (!existing || score.score > existing.score) {
                    playerBestScores.set(score.player_name, score);
                }
            }
            
            // Convert back to array, sort by score, and take top entries
            const deduplicatedScores = Array.from(playerBestScores.values())
                .sort((a, b) => b.score - a.score)
                .slice(0, limit);
            
            // Cache the results
            this.cachedScores = deduplicatedScores;
            this.cacheExpiry = Date.now() + this.cacheDuration;
            
            this.isLoading = false;
            return { success: true, scores: this.bestScores([...deduplicatedScores, ...this.readLocalScores()], limit) };
            
        } catch (error) {
            this.isLoading = false;
            return this.localLeaderboard(limit);
        }
    }
    
    async submitScore(playerName, score, timeSurvived, deathReason) {
        if (!playerName || playerName.trim().length === 0) {
            return { success: false, error: 'Player name is required' };
        }
        
        // Sanitize player name
        const sanitizedName = playerName.trim().substring(0, 20);

        try {
            const scores = this.readLocalScores();
            const existing = scores.find(entry => entry.player_name === sanitizedName);
            if (!existing || score > existing.score) {
                const entry = {
                    player_name: sanitizedName, score, time_survived: Math.floor(timeSurvived),
                    death_reason: deathReason, created_at: new Date().toISOString(), pending: true
                };
                localStorage.setItem(this.storageKey, JSON.stringify([
                    ...scores.filter(item => item.player_name !== sanitizedName), entry
                ]));
            }
            await this.syncPendingScores();
            return { success: true, pending: this.readLocalScores().some(entry => entry.player_name === sanitizedName && entry.pending) };
        } catch (error) {
            return { success: false, error: 'Could not save score on this device: ' + error.message };
        }
    }

    async uploadScore(entry) {
        const { pending, ...payload } = entry;
        const { player_name: sanitizedName, score } = entry;
        
        this.isLoading = true;
        
        try {
            // First check if player already has a score
            const existingResponse = await fetch(
                `${this.supabaseUrl}/rest/v1/${this.tableName}?select=*&player_name=eq.${encodeURIComponent(sanitizedName)}&order=score.desc&limit=1`,
                {
                    method: 'GET',
                    signal: AbortSignal.timeout(10000),
                    headers: {
                        'apikey': this.supabaseKey,
                        'Authorization': `Bearer ${this.supabaseKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            if (!existingResponse.ok) {
                throw new Error(`HTTP error checking existing score! status: ${existingResponse.status}`);
            }
            
            const existingScores = await existingResponse.json();
            
            // If player has existing score and new score is not better, don't submit
            if (existingScores.length > 0 && existingScores[0].score >= score) {
                this.isLoading = false;
                return { success: true, message: 'Existing score is higher', data: existingScores[0] };
            }
            
            // Preserve the server's existing replace-by-name contract. The local copy
            // remains pending if the connection drops between deletion and insertion.
            if (existingScores.length > 0) {
                const deletion = await fetch(
                    `${this.supabaseUrl}/rest/v1/${this.tableName}?player_name=eq.${encodeURIComponent(sanitizedName)}`,
                    {
                        method: 'DELETE',
                        signal: AbortSignal.timeout(10000),
                        headers: {
                            'apikey': this.supabaseKey,
                            'Authorization': `Bearer ${this.supabaseKey}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                if (!deletion.ok) throw new Error(`HTTP error replacing score! status: ${deletion.status}`);
            }
            
            // Submit new score
            const response = await fetch(
                `${this.supabaseUrl}/rest/v1/${this.tableName}`,
                {
                    method: 'POST',
                    signal: AbortSignal.timeout(10000),
                    headers: {
                        'apikey': this.supabaseKey,
                        'Authorization': `Bearer ${this.supabaseKey}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify(payload)
                }
            );
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }
            
            const result = await response.json();
            
            // Invalidate cache
            this.cachedScores = null;
            this.cacheExpiry = 0;
            
            this.isLoading = false;
            return { success: true, data: result };
            
        } catch (error) {
            this.isLoading = false;
            return { success: false, error: error.message };
        }
    }
    
    async getPlayerRank(score) {
        try {
            // Get all unique players with scores higher than this one
            const response = await fetch(
                `${this.supabaseUrl}/rest/v1/${this.tableName}?select=player_name,score&order=score.desc`,
                {
                    method: 'GET',
                    headers: {
                        'apikey': this.supabaseKey,
                        'Authorization': `Bearer ${this.supabaseKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            if (!response.ok) {
                return null;
            }
            
            const allScores = await response.json();
            
            // Deduplicate by player name - keep only highest score per player
            const playerBestScores = new Map();
            for (const entry of allScores) {
                const existing = playerBestScores.get(entry.player_name);
                if (!existing || entry.score > existing.score) {
                    playerBestScores.set(entry.player_name, entry);
                }
            }
            
            // Count how many unique players have higher scores
            let rank = 1;
            for (const entry of playerBestScores.values()) {
                if (entry.score > score) {
                    rank++;
                }
            }
            
            return rank;
        } catch (error) {
            console.error('Error getting player rank:', error);
            return null;
        }
    }
    
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    formatDate(isoString) {
        const date = new Date(isoString);
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            year: 'numeric'
        });
    }
}
