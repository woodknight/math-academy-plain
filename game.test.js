import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, generateProblem, checkAnswer, questionText, solutionText, advanceTrail, TRAIL_START, TRAIL_END, REWARDS, CREATURES } from './game.js';

for (const [difficulty, limit] of Object.entries(LIMITS)) {
    for (const mode of ['addition', 'subtraction', 'mixed']) {
        test(`${difficulty} ${mode}: whole numbers within range, no negatives or repeats`, () => {
            let previous;
            for (let i = 0; i < 250; i++) {
                const problem = generateProblem(mode, difficulty, previous);
                for (const value of [problem.a, problem.b, problem.answer]) {
                    assert.ok(Number.isInteger(value) && value >= 0 && value <= limit);
                }
                assert.equal(problem.answer, problem.operation === 'addition' ? problem.a + problem.b : problem.a - problem.b);
                if (mode !== 'mixed') assert.equal(problem.operation, mode);
                if (previous) assert.notDeepEqual(problem, previous);
                previous = problem;
            }
        });
    }
}

test('mixed mode can choose either operation', () => {
    assert.equal(generateProblem('mixed', 'easy', null, () => 0.1).operation, 'addition');
    assert.equal(generateProblem('mixed', 'easy', null, () => 0.9).operation, 'subtraction');
});

test('generation supports zero and the maximum answer', () => {
    for (const [difficulty, limit] of Object.entries(LIMITS)) {
        assert.equal(generateProblem('addition', difficulty, null, () => 0).answer, 0);
        assert.equal(generateProblem('addition', difficulty, null, () => 0.999999).answer, limit);
        assert.equal(generateProblem('subtraction', difficulty, null, () => 0.999999).answer, 0);
    }
});

test('correct answers including zero are accepted immediately', () => {
    for (let answer = 0; answer <= 50; answer++) assert.equal(checkAnswer(String(answer), answer), 'correct');
});

test('multi-digit answers are not rejected after the first digit', () => {
    assert.equal(checkAnswer('1', 12), 'pending');
    assert.equal(checkAnswer('12', 12), 'correct');
    assert.equal(checkAnswer('13', 12), 'wrong');
    assert.equal(checkAnswer('1', 12, true), 'wrong');
    assert.equal(checkAnswer('6', 5), 'wrong');
});

test('blank or non-numeric inputs never count as an answer', () => {
    for (const value of ['', ' ', 'abc', '-1', '1.5']) {
        assert.equal(checkAnswer(value, 0), 'pending');
        assert.equal(checkAnswer(value, 0, true), 'pending');
    }
});

test('spoken questions and answers use clear operation words', () => {
    const addition = { a: 3, b: 2, operation: 'addition', answer: 5 };
    const subtraction = { a: 5, b: 2, operation: 'subtraction', answer: 3 };
    assert.equal(questionText(addition), 'What is 3 plus 2?');
    assert.equal(questionText(addition, true), '3 plus 2 equals 5. Well done!');
    assert.equal(questionText(subtraction), 'What is 5 minus 2?');
    assert.equal(questionText(subtraction, true), '5 minus 2 equals 3. Well done!');
    assert.equal(solutionText(addition), '3 plus 2 equals 5.');
    assert.equal(solutionText(subtraction), '5 minus 2 equals 3.');
});

test('mixed answers move one step each and can reverse direction without ending early', () => {
    let position = TRAIL_START;
    for (const [correct, expected] of [[true, 3], [false, 2], [false, 1], [true, 2]]) {
        const step = advanceTrail(position, correct, () => { throw new Error('No draw before an endpoint'); });
        assert.equal(step.position, expected);
        assert.equal(step.outcome, null);
        position = step.position;
    }
});

test('five net steps forward earn one random gift; two steps back trigger a creature', () => {
    assert.equal(TRAIL_END - TRAIL_START, 5);
    assert.equal(TRAIL_START, 2);
    for (const correct of [true, false]) {
        let position = TRAIL_START;
        let draws = 0;
        let step;
        const distance = correct ? 5 : 2;
        for (let index = 0; index < distance; index++) {
            step = advanceTrail(position, correct, () => { draws++; return .5; });
            position = step.position;
            if (index < distance - 1) {
                assert.equal(step.outcome, null);
                assert.equal(draws, 0);
            }
        }
        assert.equal(position, correct ? TRAIL_END : 0);
        assert.equal(step.outcome.type, correct ? 'reward' : 'creature');
        assert.equal(draws, 1);
        // Further input at an endpoint must not mint more prizes or move past the road.
        for (const answer of [true, false]) {
            assert.deepEqual(advanceTrail(position, answer, () => { throw new Error('Duplicate draw'); }), { position, outcome: null });
        }
    }
});

test('the creature waiting in this adventure is the one that gobbles Milo', () => {
    const encounter = CREATURES[12];
    const result = advanceTrail(1, false, () => { throw new Error('Do not draw a different creature'); }, encounter);
    assert.equal(result.outcome.item, encounter);
});

test('every reward and creature can be drawn at its endpoint', () => {
    for (const [items, position, correct] of [[REWARDS, TRAIL_END - 1, true], [CREATURES, 1, false]]) {
        assert.equal(new Set(items.map((item) => item.id)).size, items.length);
        items.forEach((item, index) => {
            assert.equal(advanceTrail(position, correct, () => (index + .5) / items.length).outcome.item, item);
        });
    }
});
