import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createLearningState, problemFeatures, problemKey, applyAttempt, validateAttempt,
    speedBaseline, AdaptiveScheduler, LearningClock, weakSkills, learningSummary, adventureRewardDifficulty } from './learning.js';

export const attempt = (overrides = {}) => ({ id: randomUUID(), questionId: randomUUID(), index: 1,
    problem: { a: 3, b: 2, operation: 'addition' }, display: 'dots', practice: 'adaptive', answer: 5, activeMs: 4000, ...overrides });
const seededRandom = () => { let seed = 42; return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; }; };

test('features classify decimal carrying, borrowing, zero and matching addends', () => {
    assert.equal(problemFeatures({ a: 8, b: 7, operation: 'addition' }).skill, 'carry');
    assert.equal(problemFeatures({ a: 20, b: 1, operation: 'subtraction' }).skill, 'borrow');
    assert.equal(problemFeatures({ a: 20, b: 10, operation: 'subtraction' }).skill, 'subtraction');
    const features = problemFeatures({ a: 2, b: 2, operation: 'addition' });
    assert.equal(features.doubles, true);
    assert.equal(features.difficulty, Math.log2(5) + .35 * Math.log2(3) - .25);
    assert.equal(problemFeatures({ a: 3, b: 3, operation: 'subtraction' }).zero, true);
    assert.equal(problemKey({ a: 3, b: 2, operation: 'addition' }), problemKey({ a: 2, b: 3, operation: 'addition' }));
});

test('large numbers do not make adding or subtracting zero an advanced problem', () => {
    for (const operation of ['addition', 'subtraction']) {
        const basic = problemFeatures({ a: 5, b: 0, operation });
        for (const a of [10, 20, 30, 50]) {
            const features = problemFeatures({ a, b: 0, operation });
            assert.equal(features.difficulty, basic.difficulty);
            assert.equal(features.maximum, a);
            assert.equal(features.answer, a);
            if (operation === 'addition') assert.equal(problemFeatures({ a: 0, b: a, operation }).difficulty, basic.difficulty);
        }
    }
    assert.ok(problemFeatures({ a: 30, b: 1, operation: 'addition' }).difficulty
        > problemFeatures({ a: 30, b: 0, operation: 'addition' }).difficulty);
});
test('each question updates mastery once; a retry records recovery without inflating accuracy', () => {
    const state = createLearningState(), first = attempt({ answer: 4 });
    applyAttempt(state, first);
    const ability = state.skills['addition:dots'].ability;
    applyAttempt(state, { ...first, id: randomUUID(), index: 2, answer: 5 });
    assert.equal(state.skills['addition:dots'].ability, ability);
    assert.deepEqual(state.totals, { questions: 1, firstCorrect: 0, retryCorrect: 1, revealed: 0, attempts: 2 });
    assert.equal(applyAttempt(state, first), null);
    assert.equal(state.revision, 2);
    assert.throws(() => applyAttempt(state, { ...first, id: randomUUID(), index: 3 }), { status: 409 });
});
test('third misses and adventure endings are distinct and cannot accept another retry', () => {
    const state = createLearningState(), first = attempt({ answer: 9 });
    applyAttempt(state, first);
    applyAttempt(state, { ...first, id: randomUUID(), index: 2 });
    applyAttempt(state, { ...first, id: randomUUID(), index: 3 });
    assert.equal(state.recent[0].result, 'revealed');
    assert.equal(state.totals.revealed, 1);
    const ended = attempt({ answer: 9, end: 'adventure-ended' });
    applyAttempt(state, ended);
    assert.equal(state.recent[1].result, 'adventure-ended');
    assert.throws(() => applyAttempt(state, { ...ended, id: randomUUID(), index: 2 }), { status: 409 });
});
test('individual speed baseline excludes the current answer and distant difficulty', () => {
    const state = createLearningState(), difficulty = problemFeatures(attempt().problem).difficulty;
    const initial = state.skills['addition:dots'].ability;
    for (let i = 0; i < 5; i++) applyAttempt(state, attempt());
    assert.equal(state.skills['addition:dots'].ability, initial);
    assert.equal(speedBaseline(state, 'addition', 'dots', difficulty), 4000);
    applyAttempt(state, attempt({ activeMs: 6000 }));
    assert.equal(state.skills['addition:dots'].ability, initial);
    applyAttempt(state, attempt({ activeMs: 3000 }));
    assert.ok(state.skills['addition:dots'].ability > initial);
    assert.equal(speedBaseline(state, 'addition', 'numbers', difficulty), null);
    assert.equal(speedBaseline(state, 'addition', 'dots', difficulty + 1), null);
});
test('operations and presentations do not share evidence or speed', () => {
    const state = createLearningState(), initial = structuredClone(state.skills);
    applyAttempt(state, attempt({ answer: 9 }));
    for (const key of ['addition:numbers', 'subtraction:dots', 'carry:dots', 'borrow:dots']) assert.deepEqual(state.skills[key], initial[key]);
    assert.equal(state.features['within5:addition:dots'].questions, 1);
    assert.equal(learningSummary(state).skills[0].status, 'Learning about you');
});
test('adaptive cold start is within five, excludes five recent equivalent problems and balances mixed operations', () => {
    const state = createLearningState(), scheduler = new AdaptiveScheduler(seededRandom()), recent = [], operations = [];
    for (let i = 0; i < 30; i++) {
        const { problem } = scheduler.next(state, 'mixed', 'dots');
        assert.ok(problemFeatures(problem).maximum <= 5);
        assert.ok(!recent.includes(problemKey(problem)));
        operations.push(problem.operation);
        recent.push(problemKey(problem)); if (recent.length > 5) recent.shift();
    }
    for (let i = 0; i < 30; i += 10) assert.equal(operations.slice(i, i + 10).filter(o => o === 'addition').length, 5);
});

test('extended adaptive play keeps zero facts occasional while ability grows', () => {
    for (const mode of ['addition', 'subtraction', 'mixed']) for (const display of ['dots', 'numbers']) {
        const state = createLearningState(), scheduler = new AdaptiveScheduler(seededRandom()), recent = [];
        const initial = state.skills[`addition:${display}`].ability;
        let maximum = 0;
        for (let i = 0; i < 200; i++) {
            const { problem } = scheduler.next(state, mode, display), features = problemFeatures(problem);
            maximum = Math.max(maximum, features.maximum);
            recent.push(features.zero);
            if (recent.length > 5) recent.shift();
            assert.ok(recent.filter(Boolean).length <= 1, `${mode}/${display}: zero facts dominate at question ${i + 1}`);
            applyAttempt(state, attempt({ problem, display, answer: problem.answer }));
        }
        assert.ok(maximum > 5);
        if (mode !== 'subtraction') assert.ok(state.skills[`addition:${display}`].ability > initial);
    }
});

test('very low ability still offers varied basic problems without exhausting the pool', () => {
    for (const mode of ['addition', 'subtraction', 'mixed']) {
        const state = createLearningState(), scheduler = new AdaptiveScheduler(seededRandom()), recent = [];
        state.skills['addition:dots'].ability = -20;
        state.skills['subtraction:dots'].ability = -20;
        for (let i = 0; i < 30; i++) {
            const { problem } = scheduler.next(state, mode, 'dots');
            assert.ok(problemFeatures(problem).maximum <= 5);
            assert.ok(!recent.some(p => problemKey(p) === problemKey(problem)));
            recent.push(problem);
            if (recent.length > 5) recent.shift();
            assert.ok(recent.filter(p => problemFeatures(p).zero).length <= 1);
        }
    }
});
test('weakness schedules contain six ordinary, three targeted and one challenge question', () => {
    const state = createLearningState();
    for (let i = 0; i < 5; i++) applyAttempt(state, attempt({ answer: 9 }));
    assert.deepEqual(weakSkills(state, 'addition', 'dots'), ['addition']);
    const scheduler = new AdaptiveScheduler(seededRandom()), counts = {};
    for (let i = 0; i < 10; i++) { const selected = scheduler.next(state, 'addition', 'dots'); counts[selected.kind] = (counts[selected.kind] ?? 0) + 1; }
    assert.deepEqual(counts, { normal: 6, weak: 3, challenge: 1 });
});
test('carrying is introduced after stable basics and remains available after a later setback', () => {
    const state = createLearningState();
    const carry = { a: 9, b: 1, operation: 'addition' };
    // The scheduler cannot choose carrying before ten basic observations.
    const before = new AdaptiveScheduler(seededRandom());
    for (let i = 0; i < 30; i++) assert.notEqual(before.next(state, 'addition', 'dots').skill, 'carry');
    for (let i = 0; i < 10; i++) applyAttempt(state, attempt());
    state.skills['carry:dots'].ability = problemFeatures(carry).difficulty + Math.log(.85 / .15);
    state.skills['addition:dots'].ability = -20;
    const after = new AdaptiveScheduler(seededRandom());
    assert.equal(after.next(state, 'addition', 'dots').skill, 'carry');
    for (let i = 0; i < 10; i++) applyAttempt(state, attempt({ answer: 99 }));
    assert.equal(state.skills['carry:dots'].unlocked, true);
});
test('weak zero patterns are targeted without mixing subtraction evidence into addition', () => {
    const state = createLearningState();
    for (let i = 0; i < 8; i++) applyAttempt(state, attempt());
    for (let i = 0; i < 5; i++) applyAttempt(state, attempt({ problem: { a: 4, b: 0, operation: 'addition' }, answer: 99 }));
    const scheduler = new AdaptiveScheduler(seededRandom());
    const questions = Array.from({ length: 10 }, () => scheduler.next(state, 'addition', 'dots'));
    const weak = questions.filter(q => q.kind === 'weak');
    assert.equal(weak.length, 3);
    assert.ok(weak.every(q => problemFeatures(q.problem).zero));
    assert.equal(state.features['zero:subtraction:dots'], undefined);
});
test('manual advanced mistakes cannot bypass prerequisite skills or strand adaptive selection', () => {
    const state = createLearningState(), scheduler = new AdaptiveScheduler(seededRandom());
    for (let i = 0; i < 6; i++) applyAttempt(state, attempt({ problem: { a: 28, b: 9, operation: 'addition' }, answer: 99, practice: 'hard' }));
    for (let i = 0; i < 30; i++) {
        const selected = scheduler.next(state, 'addition', 'dots');
        assert.equal(selected.skill, 'addition');
        assert.ok(problemFeatures(selected.problem).maximum <= 5);
    }
});
test('adaptive treasure grade follows the least demanding assessed question, including reductions', () => {
    const problem = maximum => ({ a: maximum, b: 0, operation: 'addition' });
    let grade = null;
    for (const maximum of [50, 30, 20, 40, 11]) grade = adventureRewardDifficulty(grade, problem(maximum));
    assert.equal(grade, 'medium');
    grade = adventureRewardDifficulty(grade, problem(10));
    assert.equal(grade, 'easy');
    assert.equal(adventureRewardDifficulty(grade, problem(50)), 'easy');
    assert.equal(adventureRewardDifficulty(null, problem(21)), 'hard');
});
test('fluent accurate answers raise continuous ability and repeated mistakes reduce it', () => {
    const state = createLearningState(), scheduler = new AdaptiveScheduler(seededRandom());
    const initial = state.skills['addition:dots'].ability;
    for (let i = 0; i < 80; i++) {
        const { problem } = scheduler.next(state, 'addition', 'dots');
        applyAttempt(state, attempt({ problem, answer: problem.answer }));
    }
    const higher = state.skills['addition:dots'].ability;
    assert.ok(higher > initial + .5);
    for (let i = 0; i < 10; i++) applyAttempt(state, attempt({ answer: 99 }));
    assert.ok(state.skills['addition:dots'].ability < higher);
});
test('recent details stay bounded while lifetime counts and late retries remain accurate', () => {
    const state = createLearningState(), first = attempt({ answer: 9 });
    const compact = { ...applyAttempt(state, first) }; delete compact.attempts;
    for (let i = 0; i < 205; i++) applyAttempt(state, attempt());
    assert.equal(state.recent.length, 200);
    applyAttempt(state, { ...first, id: randomUUID(), index: 2, answer: 5 }, compact);
    assert.equal(state.totals.questions, 206);
    assert.equal(state.totals.retryCorrect, 1);
});
test('malformed receipts and invalid or out-of-range problems are rejected', () => {
    for (const fields of [{ id: 'bad' }, { index: 0 }, { index: 4 }, { activeMs: -1 }, { activeMs: NaN },
        { display: 'fake' }, { practice: 'fake' }, { answer: 100 }, { problem: { a: 1, b: 2, operation: 'subtraction' } },
        { problem: { a: 30, b: 30, operation: 'addition' } }, { practice: 'easy', problem: { a: 8, b: 8, operation: 'addition' } }]) {
        assert.throws(() => validateAttempt(attempt(fields)), { status: 400 });
    }
});
test('thinking clock excludes overlapping audio, feedback, dialogs and background pauses', () => {
    let now = 0; const clock = new LearningClock(() => now);
    clock.start(); now = 1000; clock.pause('speech');
    now = 2000; clock.pause('dialog'); now = 5000; clock.resume('speech');
    now = 9000; clock.resume('dialog'); now = 11000; clock.pause('locked');
    now = 20000; clock.pause('background'); clock.resume('locked');
    now = 30000; clock.resume('background'); now = 31000;
    assert.equal(clock.read(), 4000);
    clock.reset(false); clock.start(); now += 1000; assert.equal(clock.read(), null);
});
