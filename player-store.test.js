import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PlayerStore } from './player-store.js';
import { createGameServer } from './server.js';
import { DEFAULT_GAME_SETTINGS } from './game-settings.js';

const alice = { username: 'Alice', name: 'Alice the explorer', password: 'test-password-alice' };
const bob = { username: 'bob', name: 'Bob', password: 'test-password-bob' };
async function setup(t) {
    const directory = await mkdtemp(join(tmpdir(), 'little-sums-players-test-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const store = new PlayerStore(directory);
    await store.init();
    return { store, directory };
}
const claim = (player, rewardId = 'gem', claimId = randomUUID()) => ({ playerId: player.id, rewardId, claimId });

test('game settings persist across restart and a login from a second device', async t => {
    const { store, directory } = await setup(t);
    const preferences = { mode: 'mixed', display: 'numbers', soundEnabled: false, difficulty: 'hard' };
    const first = await store.register({ ...alice, preferences });
    assert.deepEqual(first.player.preferences, preferences);
    await store.updatePreferences(first.token, { playerId: first.player.id, preferences: { mode: 'subtraction', difficulty: 'medium' } });
    const restarted = new PlayerStore(directory); await restarted.init();
    const login = await restarted.login(alice);
    assert.deepEqual(login.player.preferences, { ...preferences, mode: 'subtraction', difficulty: 'medium' });
    assert.deepEqual(restarted.profile(restarted.authenticate(first.token)).preferences, login.player.preferences);
});

test('legacy players get defaults and concurrent settings patches preserve other player data', async t => {
    const { store } = await setup(t);
    const first = await store.register(alice);
    delete store.state.players[0].preferences;
    assert.deepEqual(store.profile(store.authenticate(first.token)).preferences, DEFAULT_GAME_SETTINGS);
    await Promise.all([
        store.updatePreferences(first.token, { playerId: first.player.id, preferences: { soundEnabled: false } }),
        store.updatePreferences(first.token, { playerId: first.player.id, preferences: { difficulty: 'hard' } }),
        store.updateProfile(first.token, { playerId: first.player.id, name: 'Alice explorer' }),
        store.collect(first.token, claim(first.player)),
    ]);
    const profile = store.profile(store.authenticate(first.token));
    assert.deepEqual(profile.preferences, { ...DEFAULT_GAME_SETTINGS, soundEnabled: false, difficulty: 'hard' });
    assert.equal(profile.name, 'Alice explorer');
    assert.deepEqual(profile.treasures, { gem: 1 });
});

test('game settings reject invalid values, wrong owners and expired sessions; failed writes can retry', async t => {
    const { store } = await setup(t);
    const first = await store.register(alice), second = await store.register(bob);
    const input = { playerId: first.player.id, preferences: { mode: 'mixed' } };
    await assert.rejects(store.updatePreferences(second.token, input), { status: 409, code: 'PLAYER_CHANGED' });
    await assert.rejects(store.updatePreferences('invalid', input), { status: 401 });
    for (const preferences of [null, [], {}, { mode: 'divide' }, { display: 'number' }, { difficulty: 'impossible' }, { soundEnabled: 'false' }, { role: 'admin' }]) {
        await assert.rejects(store.updatePreferences(first.token, { ...input, preferences }), { status: 400 });
    }
    const path = store.path;
    store.path = join(store.directory, 'missing', 'players.json');
    await assert.rejects(store.updatePreferences(first.token, input));
    assert.deepEqual(store.profile(store.authenticate(first.token)).preferences, DEFAULT_GAME_SETTINGS);
    store.path = path;
    await store.updatePreferences(first.token, input);
    assert.equal(store.profile(store.authenticate(first.token)).preferences.mode, 'mixed');
    assert.deepEqual(store.profile(store.authenticate(second.token)).preferences, DEFAULT_GAME_SETTINGS);
    await store.logout(first.token);
    await assert.rejects(store.updatePreferences(first.token, input), { status: 401 });
});

test('profiles, hashed credentials, sessions, and stacked collections survive a store restart', async t => {
    const { store, directory } = await setup(t);
    const { player, token } = await store.register(alice);
    await store.collect(token, claim(player));
    await store.collect(token, claim(player));
    await store.collect(token, claim(player, 'cake'));
    const saved = await readFile(store.path, 'utf8');
    assert.ok(!saved.includes(alice.password));
    assert.ok(!saved.includes(token));
    assert.ok(!('passwordHash' in player));
    const restarted = new PlayerStore(directory);
    await restarted.init();
    assert.deepEqual(restarted.authenticate(token).treasures, { gem: 2, cake: 1 });
    const login = await restarted.login({ ...alice, username: 'ALICE' });
    assert.equal(login.player.id, player.id);
    assert.deepEqual(login.player.treasures, { gem: 2, cake: 1 });
});

test('concurrent reward requests stack without lost updates and replayed receipts do not duplicate prizes', async t => {
    const { store } = await setup(t);
    const { player, token } = await store.register(alice);
    const receipt = claim(player);
    await Promise.all(Array.from({ length: 12 }, () => store.collect(token, claim(player))));
    await Promise.all(Array.from({ length: 5 }, () => store.collect(token, receipt)));
    assert.equal(store.authenticate(token).treasures.gem, 13);
    await assert.rejects(store.collect(token, { ...receipt, rewardId: 'cake' }), { status: 409 });
    assert.deepEqual(store.authenticate(token).treasures, { gem: 13 });
});

test('users are isolated and invalid, expired, or logged-out sessions cannot collect', async t => {
    const { store } = await setup(t);
    const first = await store.register(alice);
    const second = await store.register(bob);
    await store.collect(first.token, claim(first.player));
    await assert.rejects(store.collect(second.token, claim(first.player)), { status: 409 });
    await assert.rejects(store.collect('invalid', claim(first.player)), { status: 401 });
    assert.deepEqual(store.authenticate(second.token).treasures, {});
    const renewed = await store.login(alice, first.token);
    assert.equal(store.authenticate(first.token), null);
    await store.logout(renewed.token);
    assert.equal(store.authenticate(renewed.token), null);
    await assert.rejects(store.collect(renewed.token, claim(first.player)), { status: 401 });
    assert.ok(store.authenticate(second.token));
    store.state.sessions[0].expiresAt = 0;
    assert.equal(store.authenticate(second.token), null);
});

test('invalid names, passwords, and treasure payloads are rejected; duplicate names are case-insensitive', async t => {
    const { store } = await setup(t);
    for (const input of [{ ...alice, username: '../alice' }, { ...alice, name: ' ' }, { ...alice, password: 'short' }, { ...alice, password: 'x'.repeat(129) }]) {
        await assert.rejects(store.register(input), { status: 400 });
    }
    const { player, token } = await store.register(alice);
    await assert.rejects(store.register({ ...alice, username: 'alice' }), { status: 409 });
    await assert.rejects(store.login({ ...alice, password: 'wrong-password' }), { status: 401 });
    await assert.rejects(store.login({ ...bob, username: 'unknown' }), { status: 401 });
    for (const input of [claim(player, '__proto__'), claim(player, 'monster'), { ...claim(player), claimId: 'not-a-receipt' }]) {
        await assert.rejects(store.collect(token, input), { status: 400 });
    }
    assert.deepEqual(store.authenticate(token).treasures, {});
});

test('failed disk writes leave the collection unchanged and the same receipt can safely retry', async t => {
    const { store } = await setup(t);
    const { player, token } = await store.register(alice);
    const receipt = claim(player);
    const path = store.path;
    store.path = join(store.directory, 'missing-directory', 'players.json');
    await assert.rejects(store.collect(token, receipt));
    assert.deepEqual(store.authenticate(token).treasures, {});
    store.path = path;
    await store.collect(token, receipt);
    await store.collect(token, receipt);
    assert.deepEqual(store.authenticate(token).treasures, { gem: 1 });
});

test('a corrupt store fails startup without overwriting saved data', async t => {
    const { directory, store } = await setup(t);
    await writeFile(store.path, '{ damaged data');
    await assert.rejects(new PlayerStore(directory).init());
    assert.equal(await readFile(store.path, 'utf8'), '{ damaged data');
});

async function serve(t, players) {
    const server = createGameServer({ players, speech: { audioFor: async () => Buffer.from('test-audio') } });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const base = `http://127.0.0.1:${server.address().port}`;
    return async (path = '', body, cookie, headers = {}) => {
        const response = await fetch(`${base}/api/player${path}`, {
            method: body === undefined ? 'GET' : 'POST',
            headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') };
    };
}

test('HTTP game settings restore on reopening and a second login, and enforce origin and ownership', async t => {
    const { store } = await setup(t), request = await serve(t, store);
    const registered = await request('/register', alice);
    const cookie = registered.cookie.split(';')[0];
    const input = { playerId: registered.data.player.id, preferences: { mode: 'mixed', difficulty: 'hard', display: 'numbers', soundEnabled: false } };
    assert.equal((await request('/preferences', input)).status, 401);
    assert.equal((await request('/preferences')).status, 405);
    assert.equal((await request('/preferences', input, cookie, { Origin: 'https://other.example' })).status, 403);
    assert.equal((await request('/preferences', { ...input, playerId: 'bob' }, cookie)).status, 409);
    assert.equal((await request('/preferences', { ...input, preferences: { soundEnabled: 'false' } }, cookie)).status, 400);
    assert.deepEqual((await request('/preferences', input, cookie)).data, { playerId: input.playerId, preferences: input.preferences });
    assert.deepEqual((await request('', undefined, cookie)).data.player.preferences, input.preferences);
    assert.deepEqual((await request('/login', alice)).data.player.preferences, input.preferences);
    const second = await request('/register', bob);
    assert.deepEqual(second.data.player.preferences, DEFAULT_GAME_SETTINGS);
    assert.equal((await request('/preferences', input, second.cookie.split(';')[0])).status, 409);
});

test('HTTP registration/login, cookie restoration after server restart, collection and logout work end to end', async t => {
    const { store, directory } = await setup(t);
    const request = await serve(t, store);
    assert.deepEqual((await request()).data, { player: null });
    const registered = await request('/register', alice);
    assert.equal(registered.status, 201);
    assert.match(registered.cookie, /HttpOnly; SameSite=Strict; Max-Age=2592000/);
    const cookie = registered.cookie.split(';')[0];
    const receipt = claim(registered.data.player, 'rocket');
    assert.equal((await request('/treasures', receipt)).status, 401);
    assert.deepEqual((await request('/treasures', receipt, cookie)).data.player.treasures, { rocket: 1 });
    assert.deepEqual((await request('/treasures', receipt, cookie)).data.player.treasures, { rocket: 1 });
    const restarted = new PlayerStore(directory);
    await restarted.init();
    const nextRequest = await serve(t, restarted);
    assert.deepEqual((await nextRequest('', undefined, cookie)).data.player.treasures, { rocket: 1 });
    assert.equal((await nextRequest('/logout', {}, cookie)).status, 200);
    assert.equal((await nextRequest('', undefined, cookie)).data.player, null);
    const loggedIn = await nextRequest('/login', alice);
    assert.equal(loggedIn.status, 200);
    assert.deepEqual(loggedIn.data.player.treasures, { rocket: 1 });
});

test('HTTP rejects cross-origin mutations, wrong methods, non-JSON, and throttles authentication attempts', async t => {
    const { store } = await setup(t);
    const request = await serve(t, store);
    assert.equal((await request('/register', alice, null, { Origin: 'https://other.example' })).status, 403);
    assert.equal((await request('/register', alice, null, { Origin: 'null' })).status, 403);
    assert.equal((await request('/login')).status, 405);
    assert.equal((await request('/register', alice, null, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await request('/unknown')).status, 404);
    for (let i = 0; i < 19; i++) assert.equal((await request('/login', {})).status, 400);
    assert.equal((await request('/login', alice)).status, 429);
});

test('profile edits persist name, username, avatar and birthday while preserving credentials and treasures', async t => {
    const { store, directory } = await setup(t);
    const { player, token } = await store.register(alice);
    await store.collect(token, claim(player));
    const before = structuredClone(store.authenticate(token));
    const updated = await store.updateProfile(token, {
        playerId: player.id, name: '  Alice astronaut  ', username: ' SPACE_ALICE ', avatar: 'rocket', birthday: '2018-05-17',
        password: 'not-a-password-change', treasures: { gem: 999 }, id: 'other-player',
    });
    assert.equal(updated.id, player.id);
    assert.equal(updated.name, 'Alice astronaut');
    assert.equal(updated.username, 'space_alice');
    assert.equal(updated.avatar, 'rocket');
    assert.equal(updated.birthday, '2018-05-17');
    assert.deepEqual(updated.treasures, { gem: 1 });
    assert.equal(store.authenticate(token).passwordHash, before.passwordHash);
    assert.deepEqual(store.authenticate(token).claims, before.claims);
    const restarted = new PlayerStore(directory);
    await restarted.init();
    assert.deepEqual(restarted.profile(restarted.authenticate(token)), updated);
    assert.deepEqual((await restarted.login({ ...alice, username: 'space_alice' })).player, updated);
    await assert.rejects(restarted.login(alice), { status: 401 });
    assert.equal((await restarted.updateProfile(token, { playerId: player.id, birthday: '' })).birthday, '');
});

test('profile editing validates dates, names and avatars and protects other users', async t => {
    const { store } = await setup(t);
    const first = await store.register(alice);
    const second = await store.register(bob);
    const input = { playerId: first.player.id };
    const before = store.profile(store.authenticate(first.token));
    for (const fields of [
        { birthday: '2019-02-29' }, { birthday: '2024-04-31' }, { birthday: '2024-2-9' },
        { birthday: '9999-01-01' }, { birthday: '0000-01-01' }, { birthday: null },
        { avatar: '<svg onload=alert(1)>' }, { name: '' }, { name: 'x'.repeat(41) }, { username: 'bad name' },
    ]) {
        await assert.rejects(store.updateProfile(first.token, { ...input, ...fields }), { status: 400 });
        assert.deepEqual(store.profile(store.authenticate(first.token)), before);
    }
    await assert.rejects(store.updateProfile(first.token, { ...input, username: 'BOB' }), { status: 409 });
    await assert.rejects(store.updateProfile(second.token, input), { status: 409, code: 'PLAYER_CHANGED' });
    await assert.rejects(store.updateProfile(null, input), { status: 401 });
    assert.equal((await store.updateProfile(first.token, { ...input, birthday: '2024-02-29' })).birthday, '2024-02-29');
    assert.deepEqual(store.profile(store.authenticate(second.token)), second.player);
});

test('legacy profiles get defaults and concurrent edits and treasure saves do not lose data', async t => {
    const { store, directory } = await setup(t);
    const { player, token } = await store.register(alice);
    delete store.state.players[0].avatar;
    delete store.state.players[0].birthday;
    await writeFile(store.path, JSON.stringify(store.state));
    const restarted = new PlayerStore(directory);
    await restarted.init();
    assert.equal(restarted.profile(restarted.authenticate(token)).avatar, 'bear');
    assert.equal(restarted.profile(restarted.authenticate(token)).birthday, '');
    await Promise.all([
        restarted.updateProfile(token, { playerId: player.id, avatar: 'penguin', birthday: '2016-02-29' }),
        restarted.collect(token, claim(player)),
        restarted.collect(token, claim(player)),
    ]);
    const saved = restarted.profile(restarted.authenticate(token));
    assert.equal(saved.avatar, 'penguin');
    assert.equal(saved.birthday, '2016-02-29');
    assert.deepEqual(saved.treasures, { gem: 2 });
});

test('HTTP profile editing requires the current player and persists new fields on later reads', async t => {
    const { store } = await setup(t);
    const request = await serve(t, store);
    const registered = await request('/register', alice);
    const cookie = registered.cookie.split(';')[0];
    const input = { playerId: registered.data.player.id, name: 'Alice star', avatar: 'unicorn', birthday: '2015-07-03' };
    assert.equal((await request('/profile', input)).status, 401);
    assert.equal((await request('/profile')).status, 405);
    assert.equal((await request('/profile', input, cookie, { Origin: 'https://other.example' })).status, 403);
    assert.equal((await request('/profile', { ...input, avatar: 'unknown' }, cookie)).status, 400);
    const updated = await request('/profile', input, cookie);
    assert.equal(updated.status, 200);
    assert.equal(updated.data.player.name, input.name);
    assert.equal(updated.data.player.avatar, input.avatar);
    assert.equal(updated.data.player.birthday, input.birthday);
    assert.deepEqual((await request('', undefined, cookie)).data.player, updated.data.player);
    const switched = await request('/register', bob);
    const blocked = await request('/profile', input, switched.cookie.split(';')[0]);
    assert.equal(blocked.status, 409);
    assert.equal(blocked.data.code, 'PLAYER_CHANGED');
});

test('failed profile writes preserve the previous profile and allow a safe retry', async t => {
    const { store } = await setup(t);
    const { player, token } = await store.register(alice);
    const path = store.path;
    const input = { playerId: player.id, name: 'Alice new', avatar: 'kitten' };
    store.path = join(store.directory, 'missing-directory', 'players.json');
    await assert.rejects(store.updateProfile(token, input));
    assert.deepEqual(store.profile(store.authenticate(token)), player);
    store.path = path;
    assert.equal((await store.updateProfile(token, input)).avatar, 'kitten');
});

test('avatar photos are decoded, normalized and persisted without exposing another player', async t => {
    const { default: sharp } = await import('sharp');
    const { store, directory } = await setup(t);
    const first = await store.register(alice);
    const second = await store.register(bob);
    const bytes = await sharp({ create: { width: 256, height: 256, channels: 3, background: '#abc123' } }).png().toBuffer();
    const photo = `data:image/png;base64,${bytes.toString('base64')}`;
    const saved = await store.updateProfile(first.token, { playerId: first.player.id, avatarPhoto: photo });
    assert.match(saved.avatarPhoto, /^data:image\/jpeg;base64,/);
    const metadata = await sharp(Buffer.from(saved.avatarPhoto.split(',')[1], 'base64')).metadata();
    assert.equal(metadata.width, 256); assert.equal(metadata.height, 256); assert.equal(metadata.exif, undefined);
    assert.equal(store.authenticate(second.token).avatarPhoto, '');
    const restarted = new PlayerStore(directory); await restarted.init();
    assert.equal(restarted.authenticate(first.token).avatarPhoto, saved.avatarPhoto);
    await assert.rejects(store.updateProfile(second.token, { playerId: first.player.id, avatarPhoto: photo }), { status: 409 });
    for (const avatarPhoto of ['https://example.com/avatar.jpg', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,YmFk', 'x'.repeat(200001)]) {
        await assert.rejects(store.updateProfile(first.token, { playerId: first.player.id, avatarPhoto }), { status: 400 });
    }
    const wrongSize = await sharp({ create: { width: 200, height: 200, channels: 3, background: '#fff' } }).png().toBuffer();
    await assert.rejects(store.updateProfile(first.token, { playerId: first.player.id, avatarPhoto: `data:image/png;base64,${wrongSize.toString('base64')}` }), { status: 400 });
    const retained = await store.updateProfile(first.token, { playerId: first.player.id, name: 'Photo explorer' });
    assert.equal(retained.avatarPhoto, saved.avatarPhoto);
    const removed = await store.updateProfile(first.token, { playerId: first.player.id, avatarPhoto: '' });
    assert.equal(removed.avatarPhoto, '');
});

test('treasure tiers stack independently and receipts cannot be replayed as upgraded prizes', async t => {
    const { store, directory } = await setup(t);
    const { player, token } = await store.register(alice);
    const legacy = claim(player);
    await store.collect(token, legacy);
    const silver = { ...claim(player), tier: 'silver' };
    await Promise.all([store.collect(token, silver), store.collect(token, silver)]);
    await store.collect(token, { ...claim(player), tier: 'gold' });
    await assert.rejects(store.collect(token, { ...legacy, tier: 'gold' }), { status: 409 });
    await assert.rejects(store.collect(token, { ...claim(player), tier: 'platinum' }), { status: 400 });
    const restarted = new PlayerStore(directory); await restarted.init();
    assert.deepEqual(restarted.authenticate(token).treasures, { gem: 1, 'gem:silver': 1, 'gem:gold': 1 });
});

test('HTTP accepts realistic cropped photos above the ordinary request limit and rejects oversized uploads', async t => {
    const { default: sharp } = await import('sharp');
    const { randomBytes } = await import('node:crypto');
    const { store } = await setup(t);
    const request = await serve(t, store);
    const registered = await request('/register', alice);
    const cookie = registered.cookie.split(';')[0];
    const jpeg = await sharp(randomBytes(256 * 256 * 3), { raw: { width: 256, height: 256, channels: 3 } }).jpeg({ quality: 88 }).toBuffer();
    const input = { playerId: registered.data.player.id, avatarPhoto: `data:image/jpeg;base64,${jpeg.toString('base64')}` };
    assert.ok(JSON.stringify(input).length > 16_384);
    const response = await request('/profile', input, cookie);
    assert.equal(response.status, 200);
    assert.match(response.data.player.avatarPhoto, /^data:image\/jpeg;base64,/);
    assert.equal((await request('', undefined, cookie)).data.player.avatarPhoto, response.data.player.avatarPhoto);
    assert.equal((await request('/profile', input, undefined)).status, 401);
    assert.equal((await request('/profile', { ...input, avatarPhoto: 'x'.repeat(260000) }, cookie)).status, 413);
    assert.equal((await request('/treasures', { ...claim(registered.data.player), padding: 'x'.repeat(20000) }, cookie)).status, 413);
});
