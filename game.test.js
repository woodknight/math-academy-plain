import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, generateProblem, checkAnswer, questionText } from './game.js';

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
});
