import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PlayerStore } from './player-store.js';
import { createGameServer } from './server.js';
import { SpeechService } from './speech-service.js';
import { DEFAULT_SERVER_SETTINGS, validateServerSettings } from './server-config.js';

const child = { username: 'child', name: 'Child', password: 'child-test-password' };
async function setup(t) {
    const directory = await mkdtemp(join(tmpdir(), 'little-sums-admin-test-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const players = new PlayerStore(directory);
    await players.init();
    return { directory, players };
}
async function administrator(players) {
    const setup = await players.bootstrapAdmin();
    const file = await readFile(setup.credentialsPath, 'utf8');
    const username = file.match(/^Username: (.+)$/m)[1];
    const password = file.match(/^Password: (.+)$/m)[1];
    const session = await players.login({ username, password });
    return { ...session, username, password, credentialsPath: setup.credentialsPath };
}
const settingsInput = (admin, settings = {}, revision = 0) => ({ playerId: admin.player.id, revision, settings: { ...DEFAULT_SERVER_SETTINGS, ...settings } });

test('admin bootstrap generates private credentials, persists its role, and does not rotate on restart', async t => {
    const { directory, players } = await setup(t);
    const admin = await administrator(players);
    assert.equal(admin.player.role, 'admin');
    assert.ok(admin.password.length >= 32);
    assert.equal((await stat(admin.credentialsPath)).mode & 0o777, 0o600);
    assert.equal((await stat(players.path)).mode & 0o777, 0o600);
    assert.ok(!(await readFile(players.path, 'utf8')).includes(admin.password));
    const restarted = new PlayerStore(directory);
    await restarted.init();
    assert.equal(await restarted.bootstrapAdmin(), null);
    assert.equal(restarted.requireAdmin(admin.token).id, admin.player.id);
    assert.equal((await restarted.login({ username: admin.username, password: admin.password })).player.role, 'admin');
});

test('normal users cannot assign themselves admin roles, even with the admin username or profile edits', async t => {
    const { players } = await setup(t);
    const ordinary = await players.register({ ...child, username: 'admin', role: 'admin' });
    assert.equal(ordinary.player.role, 'player');
    const edited = await players.updateProfile(ordinary.token, { playerId: ordinary.player.id, role: 'admin', name: 'Pretend admin' });
    assert.equal(edited.role, 'player');
    const actual = await administrator(players);
    assert.equal(actual.username, 'admin_2');
    assert.throws(() => players.requireAdmin(ordinary.token), { status: 403 });
    await assert.rejects(players.updateSettings(ordinary.token, settingsInput(actual)), { status: 403 });
    assert.throws(() => players.requireAdmin(null), { status: 401 });
    await players.logout(actual.token);
    await assert.rejects(players.updateSettings(actual.token, settingsInput(actual)), { status: 401 });
});

test('settings persist across restarts, require the current admin, and reject stale updates', async t => {
    const { directory, players } = await setup(t);
    const admin = await administrator(players);
    const input = settingsInput(admin, { maxCacheFiles: 2, maxPendingSpeech: 3, speechEnabled: false, registrationEnabled: false });
    const saved = await players.updateSettings(admin.token, input);
    assert.equal(saved.revision, 1);
    assert.deepEqual(saved.settings, input.settings);
    assert.equal(players.state.settingsUpdatedBy, admin.player.id);
    await assert.rejects(players.updateSettings(admin.token, input), { status: 409 });
    await assert.rejects(players.updateSettings(admin.token, { ...input, revision: 1, playerId: 'other-player' }), { status: 409, code: 'PLAYER_CHANGED' });
    const restarted = new PlayerStore(directory);
    await restarted.init();
    assert.deepEqual(restarted.settings(), saved);
    await assert.rejects(restarted.register(child), { status: 403 });
    assert.equal((await restarted.login({ username: admin.username, password: admin.password })).player.role, 'admin');
    await restarted.updateSettings(admin.token, settingsInput(admin, {}, 1));
    assert.equal((await restarted.register(child)).player.role, 'player');
});

test('invalid settings and failed disk writes preserve the last saved configuration', async t => {
    const { players } = await setup(t);
    const admin = await administrator(players);
    for (const fields of [
        { maxCacheFiles: -1 }, { maxCacheFiles: 10001 }, { maxCacheFiles: 1.5 }, { maxCacheFiles: '384' },
        { maxPendingSpeech: 0 }, { maxPendingSpeech: 33 }, { speechEnabled: 'false' }, { registrationEnabled: null },
        { directory: '/another/path' },
    ]) {
        await assert.rejects(players.updateSettings(admin.token, settingsInput(admin, fields)), { status: 400 });
    }
    assert.throws(() => validateServerSettings(null), { status: 400 });
    assert.throws(() => validateServerSettings([]), { status: 400 });
    assert.equal(validateServerSettings({ ...DEFAULT_SERVER_SETTINGS, maxCacheFiles: 0 }).maxCacheFiles, 0);
    const path = players.path;
    players.path = join(players.directory, 'missing-directory', 'players.json');
    await assert.rejects(players.updateSettings(admin.token, settingsInput(admin, { maxCacheFiles: 0 })));
    players.path = path;
    assert.equal(players.settings().revision, 0);
    assert.deepEqual(players.settings().settings, DEFAULT_SERVER_SETTINGS);
    assert.equal((await players.updateSettings(admin.token, settingsInput(admin, { maxCacheFiles: 0 }))).revision, 1);
});

async function serve(t, players, speech) {
    const server = createGameServer({ players, speech });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const base = `http://127.0.0.1:${server.address().port}`;
    return async (path, { body, token, method, origin } = {}) => {
        const response = await fetch(`${base}${path}`, {
            method: method || (body ? 'POST' : 'GET'),
            headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: `little_sums_session=${token}` } : {}), ...(origin ? { Origin: origin } : {}) },
            body: body ? JSON.stringify(body) : undefined,
        });
        const content = await response.text();
        return { status: response.status, data: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(content) : content };
    };
}
const tone = () => ({ audio: Float32Array.from({ length: 2400 }, (_, i) => Math.sin(i * .08) * .6), sampling_rate: 24000 });

test('admin API enforces roles and origin checks and applies cache, speech, queue and registration settings', async t => {
    const { directory, players } = await setup(t);
    const admin = await administrator(players);
    const ordinary = await players.register(child);
    const speech = new SpeechService({ cacheDirectory: join(directory, 'speech'), engineFactory: async () => ({ generate: async () => tone() }) });
    const request = await serve(t, players, speech);
    assert.equal((await request('/api/admin/settings')).status, 401);
    assert.equal((await request('/api/admin/settings', { token: ordinary.token })).status, 403);
    assert.equal((await request('/.data/admin-account.txt')).status, 404);
    assert.equal((await request('/.data/players.json')).status, 404);
    assert.equal((await request('/api/admin/settings', { token: admin.token, method: 'DELETE' })).status, 405);
    const input = settingsInput(admin, { maxCacheFiles: 1, maxPendingSpeech: 2, speechEnabled: false, registrationEnabled: false });
    assert.equal((await request('/api/admin/settings', { token: admin.token, body: input, origin: 'https://other.example' })).status, 403);
    assert.equal((await request('/api/admin/settings', { token: ordinary.token, body: input })).status, 403);
    const saved = await request('/api/admin/settings', { token: admin.token, body: input });
    assert.equal(saved.status, 200);
    assert.equal(speech.maxCacheFiles, 1);
    assert.equal(speech.maxPending, 2);
    assert.equal((await request('/api/speech?text=What%20is%201%20plus%201%3F')).status, 503);
    assert.equal((await request('/api/player/register', { body: { ...child, username: 'another_child' } })).status, 403);
    assert.equal((await request('/api/player/login', { body: child })).status, 200);
    const current = await request('/api/admin/settings', { token: admin.token });
    assert.equal(current.status, 200);
    assert.equal(current.data.status.players, 2);
    assert.equal(current.data.status.cacheFiles, 0);
    assert.deepEqual(current.data.settings, input.settings);
    assert.equal(current.data.revision, 1);
    assert.equal((await request('/api/admin/settings', { token: admin.token, body: input })).status, 409);
    assert.equal((await request('/api/admin/settings', { token: admin.token, body: settingsInput(admin, {}, 1) })).status, 200);
    assert.equal((await request('/api/speech?text=What%20is%201%20plus%201%3F')).status, 200);
});

test('saved limits are applied to a fresh server and cache files shrink immediately after its queue drains', async t => {
    const { directory, players } = await setup(t);
    const admin = await administrator(players);
    const cacheDirectory = join(directory, 'speech');
    const speech = new SpeechService({ cacheDirectory, engineFactory: async () => ({ generate: async () => tone() }) });
    for (const n of [1, 2, 3, 4]) await speech.audioFor(`What is ${n} plus 1?`);
    assert.equal((await speech.cacheStats()).cacheFiles, 4);
    await players.updateSettings(admin.token, settingsInput(admin, { maxCacheFiles: 1, maxPendingSpeech: 2 }));
    const restarted = new PlayerStore(directory);
    await restarted.init();
    const freshSpeech = new SpeechService({ cacheDirectory, engineFactory: async () => ({ generate: async () => tone() }) });
    const request = await serve(t, restarted, freshSpeech);
    await freshSpeech.queue;
    assert.equal(freshSpeech.maxPending, 2);
    assert.equal((await freshSpeech.cacheStats()).cacheFiles, 1);
    assert.equal((await request('/api/admin/settings', { token: admin.token })).data.settings.maxCacheFiles, 1);
});

test('lowering limits during synthesis preserves active audio and rejects new work above the queue limit', async t => {
    const { directory } = await setup(t);
    let release;
    let entered;
    const begun = new Promise(resolve => { entered = resolve; });
    const held = new Promise(resolve => { release = resolve; });
    const speech = new SpeechService({ cacheDirectory: join(directory, 'speech'), maxPending: 3, engineFactory: async () => ({ generate: async () => { entered(); await held; return tone(); } }) });
    const active = speech.audioFor('What is 1 plus 1?');
    await begun;
    const cleanup = speech.setLimits({ maxCacheFiles: 0, maxPendingSpeech: 1 });
    await assert.rejects(speech.audioFor('What is 2 plus 1?'), { status: 429 });
    release();
    assert.ok((await active).length > 44);
    await cleanup;
    assert.deepEqual(await speech.cacheStats(), { cacheFiles: 0, cacheBytes: 0 });
    assert.ok((await speech.audioFor('What is 2 plus 1?')).length > 44);
    assert.equal((await speech.cacheStats()).cacheFiles, 0);
});

test('interrupted admin setup restores its private credentials without changing existing players', async t => {
    const { players, directory } = await setup(t);
    const ordinary = await players.register(child);
    const admin = await administrator(players);
    const privateFile = await readFile(admin.credentialsPath, 'utf8');
    await players.mutate(state => {
        state.players = state.players.filter(player => player.id !== admin.player.id);
        state.sessions = state.sessions.filter(session => session.playerId !== admin.player.id);
    });
    const restarted = new PlayerStore(directory);
    await restarted.init();
    const restored = await restarted.bootstrapAdmin();
    assert.equal(restored.username, admin.username);
    assert.equal(await readFile(admin.credentialsPath, 'utf8'), privateFile);
    assert.equal((await restarted.login({ username: admin.username, password: admin.password })).player.role, 'admin');
    assert.deepEqual(restarted.profile(restarted.authenticate(ordinary.token)), ordinary.player);
});

test('orphaned admin credentials never promote an ordinary account with the same username', async t => {
    const { players } = await setup(t);
    const admin = await administrator(players);
    await players.mutate(state => { state.players[0].role = 'player'; });
    await assert.rejects(players.bootstrapAdmin(), /cannot be restored safely/);
    assert.equal(players.profile(players.authenticate(admin.token)).role, 'player');
    assert.throws(() => players.requireAdmin(admin.token), { status: 403 });
});
