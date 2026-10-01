import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PlayerStore } from './player-store.js';
import { createGameServer } from './server.js';

const answer = (overrides = {}) => ({ id: randomUUID(), questionId: randomUUID(), index: 1,
    problem: { a: 3, b: 2, operation: 'addition' }, display: 'dots', practice: 'adaptive', answer: 5, activeMs: 4000, ...overrides });
async function setup(t) {
    const directory = await mkdtemp(join(tmpdir(), 'little-sums-learning-test-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const store = new PlayerStore(directory); await store.init();
    const alice = await store.register({ username: 'alice', name: 'Alice', password: 'alice-password' });
    const input = (...attempts) => ({ playerId: alice.player.id, attempts });
    return { directory, store, alice, input };
}
test('learning receipts survive restart and replays never change totals or allow altered content', async t => {
    const { directory, store, alice, input } = await setup(t), first = answer({ answer: 9 });
    const second = { ...first, id: randomUUID(), index: 2, answer: 5 };
    await store.saveLearning(alice.token, input(first, second));
    const restarted = new PlayerStore(directory); await restarted.init();
    const result = await restarted.saveLearning(alice.token, input(first, second));
    assert.equal(result.learning.totals.questions, 1);
    assert.equal(result.learning.totals.retryCorrect, 1);
    assert.equal(result.revision, 2);
    await assert.rejects(restarted.saveLearning(alice.token, input({ ...first, answer: 8 })), { status: 409 });
    assert.equal(restarted.learning(alice.token).revision, 2);
    assert.ok(!('learning' in restarted.profile(restarted.authenticate(alice.token))));
});
test('concurrent learning, profile and treasure writes preserve each other and isolate players', async t => {
    const { store, alice, input } = await setup(t);
    const bob = await store.register({ username: 'bob', name: 'Bob', password: 'bob-password' });
    await Promise.all([
        ...Array.from({ length: 10 }, () => store.saveLearning(alice.token, input(answer()))),
        store.updateProfile(alice.token, { playerId: alice.player.id, name: 'Alice astronaut' }),
        store.collect(alice.token, { playerId: alice.player.id, rewardId: 'gem', claimId: randomUUID() }),
    ]);
    assert.equal(store.learning(alice.token).learning.totals.questions, 10);
    assert.equal(store.authenticate(alice.token).name, 'Alice astronaut');
    assert.equal(store.authenticate(alice.token).treasures.gem, 1);
    assert.equal(store.learning(bob.token).learning.totals.questions, 0);
    await assert.rejects(store.saveLearning(bob.token, input(answer())), { status: 409, code: 'PLAYER_CHANGED' });
    await assert.rejects(store.saveLearning('invalid', input(answer())), { status: 401 });
});
test('old profiles start empty and failed writes or invalid batches leave learning unchanged', async t => {
    const { store, directory, alice, input } = await setup(t);
    await writeFile(store.path, JSON.stringify(store.state));
    const restarted = new PlayerStore(directory); await restarted.init();
    assert.equal(restarted.learning(alice.token).revision, 0);
    const path = restarted.path, first = answer();
    restarted.path = join(directory, 'missing', 'players.json');
    await assert.rejects(restarted.saveLearning(alice.token, input(first)));
    assert.equal(restarted.learning(alice.token).revision, 0);
    restarted.path = path;
    await assert.rejects(restarted.saveLearning(alice.token, input(first, { ...answer(), index: 2 })), { status: 409 });
    assert.equal(restarted.learning(alice.token).revision, 0);
    await restarted.saveLearning(alice.token, input(first));
    assert.equal(restarted.learning(alice.token).revision, 1);
});
test('archived first attempts still deduplicate and late retries update recovery without replaying mastery', async t => {
    const { store, alice, input } = await setup(t), first = answer({ answer: 9 });
    await store.saveLearning(alice.token, input(first));
    for (let i = 0; i < 21; i++) await store.saveLearning(alice.token, input(...Array.from({ length: 10 }, () => answer())));
    const before = store.learning(alice.token).learning;
    const second = { ...first, id: randomUUID(), index: 2, answer: 5 };
    const result = await store.saveLearning(alice.token, input(first, second));
    assert.equal(result.learning.totals.questions, 211);
    assert.equal(result.learning.totals.retryCorrect, 1);
    assert.equal(result.learning.recent.length, 200);
    assert.equal(result.learning.skills['addition:dots'].ability, before.skills['addition:dots'].ability);
    const disk = JSON.parse(await readFile(store.path, 'utf8'));
    assert.equal(Object.keys(disk.players[0].learning.receipts).length, 212);
});
test('learning HTTP endpoints enforce ownership, origin, methods and server-computed correctness', async t => {
    const { store, alice } = await setup(t);
    const server = createGameServer({ players: store, speech: { audioFor: async () => Buffer.from('audio') } });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const url = `http://127.0.0.1:${server.address().port}/api/player/learning`;
    const call = async (method, body, token = alice.token, extra = {}) => {
        const response = await fetch(url, { method, headers: { Cookie: `little_sums_session=${token}`, 'Content-Type': 'application/json', ...extra },
            body: body === undefined ? undefined : JSON.stringify(body) });
        return { status: response.status, data: await response.json() };
    };
    assert.equal((await call('GET')).data.learning.totals.questions, 0);
    assert.equal((await call('GET', undefined, 'invalid')).status, 401);
    assert.equal((await call('PUT', {})).status, 405);
    const input = { playerId: alice.player.id, attempts: [answer({ answer: 9, correct: true })] };
    assert.equal((await call('POST', input, alice.token, { Origin: 'https://other.example' })).status, 403);
    assert.equal((await call('POST', { ...input, playerId: 'bob' })).status, 409);
    assert.equal((await call('POST', { ...input, attempts: [answer({ problem: { a: 1, b: 9, operation: 'subtraction' } })] })).status, 400);
    const result = await call('POST', input);
    assert.equal(result.status, 200);
    assert.equal(result.data.learning.totals.firstCorrect, 0);
    assert.deepEqual(result.data.acceptedIds, [input.attempts[0].id]);
    assert.equal((await call('POST', input)).data.revision, 1);
    assert.equal((await call('GET')).data.learning.totals.questions, 1);
});
