import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { LeaderboardManager } from '../../js/leaderboard.js';

let storage;
let online;
let events;
let remote;
let failUploads;
let manager;

beforeEach(() => {
    vi.useFakeTimers();
    storage = new Map();
    online = false;
    events = new EventTarget();
    remote = [];
    failUploads = false;
    vi.stubGlobal('window', events);
    vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
    vi.stubGlobal('navigator', { get onLine() { return online; } });
    vi.stubGlobal('localStorage', {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value)
    });
    // Exercise the manager against an in-memory HTTP boundary, never the live leaderboard.
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
        if (!online) throw new TypeError('Offline');
        const nameFilter = new URL(url).searchParams.get('player_name');
        if (options.method === 'DELETE') {
            remote = remote.filter(entry => entry.player_name !== nameFilter.slice(3));
            return new Response(null, { status: 204 });
        }
        if (options.method === 'POST') {
            if (failUploads) return new Response('Unavailable', { status: 503 });
            const entry = JSON.parse(options.body);
            if (remote.some(item => item.player_name === entry.player_name)) return new Response('Duplicate player', { status: 409 });
            remote.push(entry);
            return Response.json([entry]);
        }
        return Response.json(remote.filter(entry => !nameFilter || entry.player_name === nameFilter.slice(3)));
    }));
    manager = new LeaderboardManager();
});

afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('offline leaderboard', () => {
    test('keeps the best named score on disk and displays it after restarting offline', async () => {
        expect(await manager.submitScore('  Newt Fan  ', 12, 61.8, 'Traffic')).toMatchObject({ success: true, pending: true });
        await manager.submitScore('Newt Fan', 3, 10, 'Traffic');
        manager = new LeaderboardManager();
        expect(await manager.fetchTopScores()).toMatchObject({
            success: true, offline: true,
            scores: [{ player_name: 'Newt Fan', score: 12, time_survived: 61, death_reason: 'Traffic' }]
        });
    });

    test('automatically syncs on reconnect and retains local scores afterwards', async () => {
        await manager.submitScore('Ranger', 21, 92, 'Traffic');
        online = true;
        events.dispatchEvent(new Event('online'));
        await vi.waitFor(() => expect(remote).toHaveLength(1));
        expect(remote[0]).toMatchObject({ player_name: 'Ranger', score: 21 });
        await manager.syncPendingScores();
        online = false;
        manager = new LeaderboardManager();
        expect((await manager.fetchTopScores()).scores[0].score).toBe(21);
        online = true;
        await manager.syncPendingScores();
        expect(remote).toHaveLength(1);
    });

    test('retains failed uploads across restart and retries at startup', async () => {
        online = true;
        failUploads = true;
        expect(await manager.submitScore('Ranger', 18, 75, 'Traffic')).toMatchObject({ success: true, pending: true });
        failUploads = false;
        manager = new LeaderboardManager();
        await manager.syncPendingScores();
        expect(remote).toHaveLength(1);
        expect(remote[0].score).toBe(18);
    });

    test('does not replace a higher remote score', async () => {
        remote.push({ player_name: 'Ranger', score: 50, time_survived: 100, death_reason: 'Traffic' });
        await manager.submitScore('Ranger', 10, 30, 'Traffic');
        online = true;
        await manager.syncPendingScores();
        expect(remote).toHaveLength(1);
        expect((await manager.fetchTopScores()).scores[0].score).toBe(50);
    });

    test('retries a reachable-network outage without requiring a new online event', async () => {
        online = true;
        failUploads = true;
        await manager.submitScore('Ranger', 16, 60, 'Traffic');
        failUploads = false;
        await vi.advanceTimersByTimeAsync(30000);
        expect(remote).toHaveLength(1);
    });

    test('replaces a lower remote score using the existing server contract', async () => {
        remote.push({ player_name: 'Ranger', score: 4, time_survived: 20, death_reason: 'Traffic' });
        await manager.submitScore('Ranger', 25, 100, 'Traffic');
        online = true;
        await manager.syncPendingScores();
        expect(remote).toHaveLength(1);
        expect(remote[0].score).toBe(25);
    });

    test('reports a storage failure rather than claiming the score is saved', async () => {
        localStorage.setItem = () => { throw new Error('Storage full'); };
        expect(await manager.submitScore('Ranger', 20, 60, 'Traffic')).toMatchObject({ success: false });
    });
});
