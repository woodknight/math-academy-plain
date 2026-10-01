import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerUI, treasureReceiptId } from './player.js';

test('treasure receipts also work on HTTP LAN origins without crypto.randomUUID', () => {
    const id = treasureReceiptId({ getRandomValues: bytes => bytes.fill(255) });
    assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
});

function uiFor(playerId = 'alice') {
    const ui = Object.create(PlayerUI.prototype);
    Object.assign(ui, {
        player: { id: playerId, treasures: {} }, pending: [], guestTreasures: {}, revision: 0,
        connected: true, render() {}, rememberPending() {}, error() {}, setAuthMode() {},
    });
    return ui;
}
const receipt = (playerId, claimId) => ({ playerId, claimId, rewardId: 'gem' });

test('failed reward saves retain their receipt and retries save it exactly once', async () => {
    const ui = uiFor();
    let saved = false;
    const received = [];
    ui.request = async (path, input) => {
        received.push(input.claimId);
        if (!saved) { saved = true; throw new Error('Response lost after server commit'); }
        return { id: 'alice', treasures: { gem: 1 } };
    };
    await ui.collect({ id: 'gem' });
    assert.equal(ui.pending.length, 1);
    assert.match(ui.saveError, /Response lost/);
    await ui.sync();
    assert.equal(ui.pending.length, 0);
    assert.equal(received.length, 2);
    assert.equal(received[0], received[1]);
    assert.deepEqual(ui.player.treasures, { gem: 1 });
});

test('a profile only retries its own waiting rewards when other players have pending receipts', async () => {
    const ui = uiFor();
    ui.pending = [receipt('bob', 'bob-claim'), receipt('alice', 'alice-claim')];
    const sent = [];
    ui.request = async (path, input) => { sent.push(input.playerId); return { id: 'alice', treasures: { gem: 1 } }; };
    await ui.sync();
    assert.deepEqual(sent, ['alice']);
    assert.deepEqual(ui.pending, [receipt('bob', 'bob-claim')]);
});

test('expired or changed sessions keep rewards for their original profile and require login', async () => {
    for (const status of [401, 409]) {
        const ui = uiFor();
        ui.pending = [receipt('alice', 'waiting')];
        let mode;
        ui.setAuthMode = value => { mode = value; };
        ui.request = async () => { throw Object.assign(new Error('Login expired'), { status }); };
        await ui.sync();
        assert.equal(ui.player, null);
        assert.equal(mode, 'login');
        assert.deepEqual(ui.pending, [receipt('alice', 'waiting')]);
        ui.player = { id: 'alice', treasures: {} };
        ui.request = async () => ({ id: 'alice', treasures: { gem: 1 } });
        await ui.sync();
        assert.deepEqual(ui.player.treasures, { gem: 1 });
        assert.equal(ui.pending.length, 0);
    }
});

test('an older box refresh cannot overwrite a reward collected while its request is in flight', async () => {
    const ui = uiFor();
    let release;
    let begun;
    const entered = new Promise(resolve => { begun = resolve; });
    const held = new Promise(resolve => { release = resolve; });
    ui.request = async path => {
        if (!path) { begun(); await held; return { id: 'alice', treasures: {} }; }
        return { id: 'alice', treasures: { gem: 1 } };
    };
    const refreshing = ui.refresh();
    await entered;
    await ui.collect({ id: 'gem' });
    release();
    await refreshing;
    assert.deepEqual(ui.player.treasures, { gem: 1 });
});

test('guest rewards stay in the visit and are not sent to player storage', async () => {
    const ui = uiFor();
    ui.player = null;
    ui.request = async () => { throw new Error('Guest play must not save player rewards'); };
    await ui.collect({ id: 'gem' });
    await ui.collect({ id: 'gem' });
    assert.deepEqual(ui.guestTreasures, { gem: 2 });
    assert.equal(ui.pending.length, 0);
});

test('offline premium receipts retain their tier across retries and guest tiers stay in separate stacks', async () => {
    const ui = uiFor();
    const sent = [];
    ui.request = async (path, input) => { sent.push({ ...input }); throw new Error('Offline'); };
    await ui.collect({ id: 'gem', tier: 'gold' });
    assert.equal(ui.pending[0].tier, 'gold');
    ui.request = async (path, input) => { sent.push({ ...input }); return { id: 'alice', treasures: { 'gem:gold': 1 } }; };
    await ui.sync();
    assert.deepEqual(sent[0], sent[1]);
    assert.deepEqual(ui.player.treasures, { 'gem:gold': 1 });
    ui.player = null;
    await ui.collect({ id: 'gem', tier: 'gold' });
    await ui.collect({ id: 'gem', tier: 'silver' });
    await ui.collect({ id: 'gem' });
    assert.deepEqual(ui.guestTreasures, { 'gem:gold': 1, 'gem:silver': 1, gem: 1 });
});
