import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { SpeechService } from './speech-service.js';
import { PlayerStore, SESSION_SECONDS } from './player-store.js';
import { validateServerSettings } from './server-config.js';

const files = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/index.html', ['index.html', 'text/html; charset=utf-8']],
    ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
    ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
    ['/player.js', ['player.js', 'text/javascript; charset=utf-8']],
    ['/profiles.js', ['profiles.js', 'text/javascript; charset=utf-8']],
    ['/admin.js', ['admin.js', 'text/javascript; charset=utf-8']],
    ['/server-config.js', ['server-config.js', 'text/javascript; charset=utf-8']],
    ['/avatar-editor.js', ['avatar-editor.js', 'text/javascript; charset=utf-8']],
    ['/treasures.js', ['treasures.js', 'text/javascript; charset=utf-8']],
    ['/round-music.js', ['round-music.js', 'text/javascript; charset=utf-8']],
    ['/game.js', ['game.js', 'text/javascript; charset=utf-8']],
    ['/adventures.js', ['adventures.js', 'text/javascript; charset=utf-8']],
    ['/adventure-art.js', ['adventure-art.js', 'text/javascript; charset=utf-8']],
    ['/speech.js', ['speech.js', 'text/javascript; charset=utf-8']],
    ['/trail.svg', ['trail.svg', 'image/svg+xml']],
]);

function json(response, status, body, headers = {}) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    response.end(JSON.stringify(body));
}

async function readJson(request, limit = 16_384) {
    if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
        throw Object.assign(new Error('Send JSON data.'), { status: 415 });
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        size += chunk.length;
        if (size > limit) throw Object.assign(new Error('Request is too large.'), { status: 413 });
        chunks.push(chunk);
    }
    try {
        const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error();
        return input;
    } catch {
        throw Object.assign(new Error('Invalid JSON data.'), { status: 400 });
    }
}

function checkOrigin(request) {
    if (!request.headers.origin) return;
    let origin;
    try { origin = new URL(request.headers.origin); } catch { /* Reject opaque origins. */ }
    if (!origin || origin.host !== request.headers.host || !['http:', 'https:'].includes(origin.protocol)) {
        throw Object.assign(new Error('Use the game page to make this request.'), { status: 403 });
    }
}

export function createGameServer({ players, speech, secureCookies = false }) {
    const authAttempts = new Map();
    const startedAt = Date.now();
    let cleanupPending = 0;
    let cleanupError = '';
    const applyLimits = settings => {
        if (!speech.setLimits) return;
        cleanupPending++;
        speech.setLimits(settings).then(() => { cleanupError = ''; }).catch(error => {
            cleanupError = 'Audio cache cleanup failed. Check server logs.';
            console.error('Audio cache cleanup:', error);
        }).finally(() => { cleanupPending--; });
    };
    applyLimits(players.settings().settings);
    return createServer(async (request, response) => {
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('Referrer-Policy', 'no-referrer');
        const pathname = new URL(request.url || '/', 'http://localhost').pathname;
        const token = request.headers.cookie?.match(/(?:^|;\s*)little_sums_session=([a-f0-9]{64})(?:;|$)/)?.[1];
        if (pathname.startsWith('/api/admin')) {
            try {
                players.requireAdmin(token);
                if (pathname !== '/api/admin/settings') { json(response, 404, { error: 'Not found.' }); return; }
                if (!['GET', 'POST'].includes(request.method)) { json(response, 405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' }); return; }
                if (request.method === 'POST') {
                    checkOrigin(request);
                    const updated = await players.updateSettings(token, await readJson(request));
                    applyLimits(updated.settings);
                    json(response, 200, { ...updated, cleanupPending: cleanupPending > 0 });
                } else {
                    const cache = speech.cacheStats ? await speech.cacheStats() : { cacheFiles: 0, cacheBytes: 0 };
                    // Recheck after asynchronous I/O in case the session was logged out.
                    players.requireAdmin(token);
                    json(response, 200, { ...players.settings(), status: { ...cache, queuedSpeech: speech.queued || 0,
                        players: players.state.players.length, uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
                        cleanupPending: cleanupPending > 0, cleanupError } });
                }
            } catch (error) {
                if (!error.status) console.error('Server settings:', error);
                json(response, error.status || 500, { error: error.status ? error.message : 'Could not save server settings. Please try again.', code: error.status ? error.code : undefined });
            }
            return;
        }
        if (pathname.startsWith('/api/player')) {
            const cookie = (value, maxAge) => `little_sums_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureCookies || request.socket.encrypted ? '; Secure' : ''}`;
            try {
                if (pathname === '/api/player' && request.method === 'GET') {
                    const player = players.authenticate(token);
                    json(response, 200, { player: player ? players.profile(player) : null });
                    return;
                }
                const routes = ['/api/player/register', '/api/player/login', '/api/player/logout', '/api/player/treasures', '/api/player/profile'];
                if (!routes.includes(pathname)) { json(response, 404, { error: 'Not found.' }); return; }
                if (request.method !== 'POST') { json(response, 405, { error: 'Method not allowed.' }, { Allow: 'POST' }); return; }
                checkOrigin(request);
                if (pathname.endsWith('/login') || pathname.endsWith('/register')) {
                    const now = Date.now();
                    for (const [key, value] of authAttempts) if (value.until <= now) authAttempts.delete(key);
                    const address = request.socket.remoteAddress;
                    const attempt = authAttempts.get(address) ?? { count: 0, until: now + 15 * 60 * 1000 };
                    if (attempt.count >= 20 || (authAttempts.size >= 10_000 && !authAttempts.has(address))) {
                        json(response, 429, { error: 'Too many login attempts. Please try again in 15 minutes.' }); return;
                    }
                    attempt.count++;
                    authAttempts.set(address, attempt);
                }
                const input = await readJson(request, pathname.endsWith('/profile') ? 256_000 : 16_384);
                if (pathname.endsWith('/register') || pathname.endsWith('/login')) {
                    const result = pathname.endsWith('/register') ? await players.register(input, token) : await players.login(input, token);
                    json(response, pathname.endsWith('/register') ? 201 : 200, { player: result.player }, { 'Set-Cookie': cookie(result.token, SESSION_SECONDS) });
                } else if (pathname.endsWith('/logout')) {
                    await players.logout(token);
                    json(response, 200, { player: null }, { 'Set-Cookie': cookie('', 0) });
                } else if (pathname.endsWith('/profile')) {
                    json(response, 200, { player: await players.updateProfile(token, input) });
                } else {
                    json(response, 200, { player: await players.collect(token, input) });
                }
            } catch (error) {
                if (!error.status) console.error('Player storage:', error);
                json(response, error.status || 500, { error: error.status ? error.message : 'Could not save player data. Please try again.', code: error.status ? error.code : undefined });
            }
            return;
        }
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            response.writeHead(405, { Allow: 'GET, HEAD' });
            response.end('Method not allowed');
            return;
        }
        const url = new URL(request.url || '/', 'http://localhost');
        if (pathname === '/api/speech') {
            try {
                if (!players.settings().settings.speechEnabled) throw Object.assign(new Error('Spoken questions are disabled by the admin.'), { status: 503 });
                if (url.searchParams.getAll('text').length !== 1) throw Object.assign(new Error('Provide one number sentence.'), { status: 400 });
                const audio = await speech.audioFor(url.searchParams.get('text'));
                if (response.destroyed) return;
                response.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': audio.length, 'Cache-Control': 'no-store' });
                response.end(request.method === 'HEAD' ? undefined : audio);
            } catch (error) {
                if (response.destroyed) return;
                const status = error.status || 503;
                if (status === 503) console.error(`Local voice: ${error.message}`);
                response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ error: status === 400 ? 'Invalid number sentence.' : 'Voice is unavailable. Please try again.' }));
            }
            return;
        }
        const file = files.get(pathname);
        if (!file) { response.writeHead(404); response.end('Not found'); return; }
        try {
            const body = await readFile(new URL(file[0], import.meta.url));
            response.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-cache' });
            response.end(request.method === 'HEAD' ? undefined : body);
        } catch {
            response.writeHead(500);
            response.end('Unable to load page');
        }
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const port = Number(process.env.PORT || 5173);
    const host = process.env.HOST || '127.0.0.1';
    const players = new PlayerStore(process.env.PLAYER_DATA_DIR || fileURLToPath(new URL('.data/', import.meta.url)));
    await players.init();
    const admin = await players.bootstrapAdmin();
    if (admin) console.log(`Admin account created: ${admin.username}. Login details: ${admin.credentialsPath}`);
    const settings = validateServerSettings(players.settings().settings);
    const speech = new SpeechService({ maxCacheFiles: settings.maxCacheFiles, maxPending: settings.maxPendingSpeech });
    const server = createGameServer({ players, speech, secureCookies: process.env.COOKIE_SECURE === '1' });
    server.listen(port, host, () => console.log(`Little Sums is running at http://${host}:${server.address().port}`));
    if (settings.speechEnabled) speech.audioFor('What is 3 plus 2?')
        .then(() => console.log(`Local voice ready: Kokoro ${speech.voice} (CPU).`))
        .catch(error => console.error(`Local voice: ${error.message}`));
}
