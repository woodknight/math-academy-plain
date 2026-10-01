import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { LearningClient } from './learning-client.js';
import { createLearningState, applyAttempt } from './learning.js';

const answer = (overrides = {}) => ({ playerId: 'alice', id: randomUUID(), questionId: randomUUID(), index: 1,
    problem: { a: 3, b: 2, operation: 'addition' }, display: 'dots', practice: 'adaptive', answer: 5, activeMs: 4000, ...overrides });
const storage = () => { let value = null; return { getItem: () => value, setItem: (key, next) => { value = next; } }; };
const snapshot = (playerId, state = createLearningState(), acceptedIds = []) => ({ playerId, learning: structuredClone(state), revision: state.revision, acceptedIds });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('offline progress is optimistic and a reload and retry retains the same receipt', async () => {
    const disk = storage(), state = createLearningState();
    const client = new LearningClient({ storage: disk, request: async () => { throw new Error('Offline'); } });
    await client.setPlayer('alice');
    const attempt = answer(); client.record(attempt); await client.sync();
    assert.equal(client.state.totals.questions, 1);
    const reloaded = new LearningClient({ storage: disk, request: async body => {
        if (body) { for (const item of body.attempts) applyAttempt(state, item); return snapshot('alice', state, body.attempts.map(item => item.id)); }
        return snapshot('alice', state);
    } });
    await reloaded.setPlayer('alice');
    assert.equal(reloaded.pending.length, 0);
    assert.equal(reloaded.state.totals.questions, 1);
    assert.equal(reloaded.state.recent[0].attempts[0].id, attempt.id);
});
test('lost responses reconcile against saved answers without counting them twice', async () => {
    const state = createLearningState(); let fail = true;
    const client = new LearningClient({ storage: storage(), request: async body => {
        if (!body) return snapshot('alice', state);
        for (const item of body.attempts) applyAttempt(state, item);
        if (fail) throw new Error('Response lost');
        return snapshot('alice', state, body.attempts.map(item => item.id));
    } });
    await client.setPlayer('alice'); client.record(answer()); await client.sync();
    assert.equal(state.totals.questions, 1);
    fail = false; await client.setPlayer('alice');
    assert.equal(client.state.totals.questions, 1);
    assert.equal(client.pending.length, 0);
});
test('switching players keeps waiting records bound to their owner and ignores an older read', async () => {
    const held = deferred(), sent = [];
    const client = new LearningClient({ storage: storage(), request: async body => {
        if (body) { sent.push(body.playerId); throw new Error('Offline'); }
        return snapshot('alice');
    } });
    await client.setPlayer('alice'); client.record(answer()); await client.sync();
    client.request = async body => body ? snapshot(body.playerId, createLearningState(), body.attempts.map(item => item.id)) : held.promise;
    const old = client.setPlayer('alice');
    client.request = async () => snapshot('bob'); await client.setPlayer('bob');
    held.resolve(snapshot('alice')); await old;
    assert.equal(client.playerId, 'bob');
    assert.equal(client.state.totals.questions, 0);
    assert.equal(client.pending[0].playerId, 'alice');
    assert.equal(client.record(answer()), false);
    assert.deepEqual(sent, ['alice']);
});
test('answers arriving while a save is in flight replay over its acknowledged snapshot', async () => {
    const state = createLearningState(), held = deferred(); let first = true;
    const client = new LearningClient({ storage: storage(), request: async body => {
        if (!body) return snapshot('alice', state);
        for (const item of body.attempts) applyAttempt(state, item);
        const result = snapshot('alice', state, body.attempts.map(item => item.id));
        if (first) { first = false; await held.promise; }
        return result;
    } });
    await client.setPlayer('alice'); client.record(answer()); client.record(answer());
    assert.equal(client.state.totals.questions, 2);
    held.resolve(); await client.sync();
    assert.equal(client.state.totals.questions, 2);
    assert.equal(client.pending.length, 0);
});
test('expired sessions preserve waiting answers and invoke the account-change handler', async () => {
    let expired = false;
    const client = new LearningClient({ storage: storage(), request: async body => {
        if (!body) return snapshot('alice');
        throw Object.assign(new Error('Log in again'), { status: 401 });
    }, onAuthError: () => { expired = true; } });
    await client.setPlayer('alice'); client.record(answer()); await client.sync();
    assert.ok(expired);
    assert.equal(client.pending.length, 1);
});
test('guest progress is neither saved nor migrated into a newly logged-in account', async () => {
    let requests = 0;
    const client = new LearningClient({ storage: storage(), request: async () => { requests++; return snapshot('alice'); } });
    await client.setPlayer(null); client.record(answer({ playerId: null }));
    assert.equal(client.state.totals.questions, 1); assert.equal(requests, 0);
    await client.setPlayer('alice');
    assert.equal(client.state.totals.questions, 0); assert.equal(client.pending.length, 0);
    await client.setPlayer(null); assert.equal(client.state.totals.questions, 0);
});
test('a stale snapshot cannot replace a newer acknowledged learning revision', async () => {
    const state = createLearningState(); applyAttempt(state, answer());
    const client = new LearningClient({ storage: storage(), request: async () => snapshot('alice', state) });
    await client.setPlayer('alice');
    client.accept(snapshot('alice'), []);
    assert.equal(client.state.totals.questions, 1);
});
test('a retry older than the public recent list stays queued for server-side reconciliation', async () => {
    const client = new LearningClient({ storage: storage(), request: async body => {
        if (body) throw new Error('Offline');
        return snapshot('alice');
    } });
    const old = answer({ index: 2 });
    client.pending.push(old);
    await client.setPlayer('alice');
    assert.equal(client.pending.length, 1);
    assert.equal(client.state.totals.questions, 0);
    assert.match(client.error, /Offline/);
});
test('corrupt browser snapshots fall back to a usable empty profile', async () => {
    const disk = storage();
    disk.setItem('key', JSON.stringify({ bases: { alice: { version: 1, revision: 2, skills: {}, totals: {}, recent: [], features: {} } } }));
    const client = new LearningClient({ storage: disk, request: async () => { throw new Error('Offline'); } });
    await client.setPlayer('alice');
    assert.equal(client.state.totals.questions, 0);
});
