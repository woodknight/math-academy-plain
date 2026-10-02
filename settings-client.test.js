import test from 'node:test';
import assert from 'node:assert/strict';
import { SettingsClient, SETTINGS_STORAGE_KEY } from './settings-client.js';
import { DEFAULT_GAME_SETTINGS, normalizeGameSettings, validateGameSettings } from './game-settings.js';

const storage = () => {
    const values = new Map();
    return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
};
const player = (id, preferences = {}) => ({ id, preferences: normalizeGameSettings(preferences) });
const saved = body => ({ playerId: body.playerId, preferences: normalizeGameSettings(body.preferences) });
const deferred = () => {
    let resolve;
    return { promise: new Promise(done => { resolve = done; }), resolve: value => resolve(value) };
};

test('all supported game settings validate; malformed values and unknown fields are rejected', () => {
    for (const mode of ['addition', 'subtraction', 'mixed']) {
        for (const difficulty of ['adaptive', 'easy', 'medium', 'hard']) {
            for (const display of ['dots', 'numbers']) {
                for (const soundEnabled of [true, false]) {
                    const settings = { mode, difficulty, display, soundEnabled };
                    assert.deepEqual(validateGameSettings(settings), settings);
                }
            }
        }
    }
    for (const value of [null, [], {}, { mode: 'plus' }, { difficulty: 10 }, { display: 'number' },
        { soundEnabled: 'false' }, { soundEnabled: 0 }, { unknown: true }, JSON.parse('{"__proto__":{}}')]) {
        assert.throws(() => validateGameSettings(value), { status: 400 });
    }
    assert.deepEqual(normalizeGameSettings({ difficulty: 'invalid', soundEnabled: false }), { ...DEFAULT_GAME_SETTINGS, soundEnabled: false });
});

test('guest settings survive closing and reopening without any server request', async () => {
    const disk = storage();
    const client = new SettingsClient({ storage: disk, request: () => { throw new Error('Guest must not send preferences'); } });
    const selected = { mode: 'mixed', difficulty: 'hard', display: 'numbers', soundEnabled: false };
    await client.update(selected);
    const reopened = new SettingsClient({ storage: disk });
    await reopened.setPlayer(null);
    assert.deepEqual(reopened.settings, selected);
});

test('server profile settings restore on a new device, and switching players or logging out restores each owner', async () => {
    const disk = storage(), client = new SettingsClient({ storage: disk });
    await client.update({ mode: 'mixed' });
    const alice = player('alice', { mode: 'subtraction', display: 'numbers', difficulty: 'medium', soundEnabled: false });
    await client.setPlayer(alice);
    assert.deepEqual(client.settings, alice.preferences);
    await client.setPlayer(player('bob'));
    assert.deepEqual(client.settings, DEFAULT_GAME_SETTINGS);
    await client.setPlayer(null);
    assert.equal(client.settings.mode, 'mixed');
    const anotherDevice = new SettingsClient({ storage: storage() });
    await anotherDevice.setPlayer(alice);
    assert.deepEqual(anotherDevice.settings, alice.preferences);
});

test('offline changes persist before I/O, survive reopening, and patch only fields the player changed', async () => {
    const disk = storage(), sent = [];
    const client = new SettingsClient({ storage: disk, request: async body => {
        assert.equal(JSON.parse(disk.getItem(SETTINGS_STORAGE_KEY)).pending.alice.soundEnabled, false);
        throw new Error('Offline');
    } });
    await client.setPlayer(player('alice'));
    await client.update({ soundEnabled: false });
    assert.equal(client.settings.soundEnabled, false);
    assert.equal(client.hasPending(), true);
    const reopened = new SettingsClient({ storage: disk, request: async body => { sent.push(body); return saved(body); } });
    await reopened.setPlayer(player('alice', { difficulty: 'hard' }));
    assert.equal(reopened.settings.difficulty, 'hard');
    assert.equal(reopened.settings.soundEnabled, false);
    assert.deepEqual(sent, [{ playerId: 'alice', preferences: { soundEnabled: false } }]);
    assert.equal(reopened.hasPending(), false);
});

test('rapid changes during a save are serialized and the latest selection is saved', async () => {
    const held = deferred(), sent = [];
    const client = new SettingsClient({ storage: storage(), request: async body => {
        sent.push(body);
        if (sent.length === 1) await held.promise;
        return saved(body);
    } });
    await client.setPlayer(player('alice'));
    const first = client.update({ soundEnabled: false });
    client.update({ soundEnabled: true, difficulty: 'easy' });
    client.update({ difficulty: 'hard' });
    held.resolve();
    await first;
    assert.deepEqual(sent.map(body => body.preferences), [{ soundEnabled: false }, { soundEnabled: true, difficulty: 'hard' }]);
    assert.equal(client.settings.soundEnabled, true);
    assert.equal(client.settings.difficulty, 'hard');
    assert.equal(client.hasPending(), false);
});

test('pending changes stay with their player and a stale save response cannot affect another player', async () => {
    const held = deferred(), sent = [];
    const client = new SettingsClient({ storage: storage(), request: async body => {
        sent.push(body);
        if (sent.length === 1) await held.promise;
        return saved(body);
    } });
    await client.setPlayer(player('alice'));
    const first = client.update({ mode: 'subtraction' });
    await client.setPlayer(player('bob', { difficulty: 'hard' }));
    held.resolve(); await first;
    assert.equal(client.settings.difficulty, 'hard');
    assert.equal(client.settings.mode, 'addition');
    assert.deepEqual(client.pending.alice, { mode: 'subtraction' });
    assert.equal(sent.length, 1);
    await client.setPlayer(player('alice'));
    assert.equal(client.settings.mode, 'subtraction');
    assert.equal(client.hasPending(), false);
    assert.deepEqual(sent.map(body => body.playerId), ['alice', 'alice']);
});

test('expired and changed sessions retain settings for retry and notify the account handler', async () => {
    for (const error of [Object.assign(new Error('Expired'), { status: 401 }),
        Object.assign(new Error('Changed'), { status: 409, code: 'PLAYER_CHANGED' })]) {
        let reported;
        const client = new SettingsClient({ storage: storage(), request: async () => { throw error; }, onAuthError: value => { reported = value; } });
        await client.setPlayer(player('alice'));
        await client.update({ display: 'numbers' });
        assert.equal(reported, error);
        assert.deepEqual(client.pending.alice, { display: 'numbers' });
        client.request = async body => saved(body);
        await client.setPlayer(player('alice'));
        assert.equal(client.settings.display, 'numbers');
        assert.equal(client.hasPending(), false);
    }
});

test('corrupt or unavailable browser storage does not stop play or server saving', async () => {
    const corrupt = new SettingsClient({ storage: { getItem: () => '{broken' } });
    assert.deepEqual(corrupt.settings, DEFAULT_GAME_SETTINGS);
    const client = new SettingsClient({ storage: null, request: async body => saved(body) });
    await client.update({ soundEnabled: false });
    assert.equal(client.settings.soundEnabled, false);
    assert.match(client.storageError, /unavailable/);
    await client.setPlayer(player('alice'));
    await client.update({ difficulty: 'medium' });
    assert.equal(client.hasPending(), false);
    assert.equal(client.bases.alice.difficulty, 'medium');
});

test('unconfirmed responses retain the changed settings for a safe retry', async () => {
    const client = new SettingsClient({ storage: storage(), request: async () => ({ playerId: 'alice', preferences: DEFAULT_GAME_SETTINGS }) });
    await client.setPlayer(player('alice'));
    await client.update({ soundEnabled: false });
    assert.equal(client.settings.soundEnabled, false);
    assert.equal(client.hasPending(), true);
    assert.match(client.error, /not confirmed/);
    client.request = async body => saved(body);
    await client.sync();
    assert.equal(client.hasPending(), false);
});
