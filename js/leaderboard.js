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
    }
    
    async fetchTopScores(limit = 5) {
        // Return cached scores if still valid
        if (this.cachedScores && Date.now() < this.cacheExpiry) {
            return { success: true, scores: this.cachedScores };
        }
        
        this.isLoading = true;
        
        try {
            // Fetch a large batch to ensure we get enough unique players after deduplication
            const fetchLimit = Math.max(limit * 10, 50);
            const response = await fetch(
                `${this.supabaseUrl}/rest/v1/${this.tableName}?select=*&order=score.desc&limit=${fetchLimit}`,
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
            return { success: true, scores: deduplicatedScores };
            
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
            this.isLoading = false;
            return { success: false, error: error.message };
        }
    }
    
    async submitScore(playerName, score, timeSurvived, deathReason) {
        if (!playerName || playerName.trim().length === 0) {
            return { success: false, error: 'Player name is required' };
        }
        
        // Sanitize player name
        const sanitizedName = playerName.trim().substring(0, 20);
        
        this.isLoading = true;
        
        try {
            // First check if player already has a score
            const existingResponse = await fetch(
                `${this.supabaseUrl}/rest/v1/${this.tableName}?select=*&player_name=eq.${encodeURIComponent(sanitizedName)}&order=score.desc&limit=1`,
                {
                    method: 'GET',
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
            
            // Delete old score if exists
            if (existingScores.length > 0) {
                await fetch(
                    `${this.supabaseUrl}/rest/v1/${this.tableName}?player_name=eq.${encodeURIComponent(sanitizedName)}`,
                    {
                        method: 'DELETE',
                        headers: {
                            'apikey': this.supabaseKey,
                            'Authorization': `Bearer ${this.supabaseKey}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
            }
            
            // Submit new score
            const response = await fetch(
                `${this.supabaseUrl}/rest/v1/${this.tableName}`,
                {
                    method: 'POST',
                    headers: {
                        'apikey': this.supabaseKey,
                        'Authorization': `Bearer ${this.supabaseKey}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify({
                        player_name: sanitizedName,
                        score: score,
                        time_survived: Math.floor(timeSurvived),
                        death_reason: deathReason,
                        created_at: new Date().toISOString()
                    })
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
            console.error('Error submitting score:', error);
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