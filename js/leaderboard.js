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
            const response = await fetch(
                `${this.supabaseUrl}/rest/v1/${this.tableName}?select=*&order=score.desc&limit=${limit}`,
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
            
            const scores = await response.json();
            
            // Cache the results
            this.cachedScores = scores;
            this.cacheExpiry = Date.now() + this.cacheDuration;
            
            this.isLoading = false;
            return { success: true, scores };
            
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
            const response = await fetch(
                `${this.supabaseUrl}/rest/v1/${this.tableName}?select=count&score=gt.${score}`,
                {
                    method: 'GET',
                    headers: {
                        'apikey': this.supabaseKey,
                        'Authorization': `Bearer ${this.supabaseKey}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'count=exact'
                    }
                }
            );
            
            const countHeader = response.headers.get('content-range');
            if (countHeader) {
                const total = parseInt(countHeader.split('/')[1]);
                return total + 1; // Rank is number of higher scores + 1
            }
            
            return null;
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
