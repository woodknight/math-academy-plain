export const LIMITS = { easy: 10, medium: 20, hard: 50 };

import { REWARDS, CREATURES } from './adventures.js';
export { REWARDS, CREATURES } from './adventures.js';
export const TRAIL_START = 2;
export const TRAIL_END = TRAIL_START + 5;

export function advanceTrail(position, correct, random = Math.random, encounter = null) {
    // A finished adventure cannot issue another prize or punishment.
    if (position <= 0 || position >= TRAIL_END) return { position, outcome: null };
    const next = position + (correct ? 1 : -1);
    const type = next === TRAIL_END ? 'reward' : next === 0 ? 'creature' : null;
    const choices = type === 'reward' ? REWARDS : CREATURES;
    return {
        position: next,
        outcome: type ? { type, item: type === 'creature' && encounter ? encounter : choices[Math.floor(random() * choices.length)] } : null,
    };
}

export function generateProblem(mode, difficulty, previous = null, random = Math.random) {
    const limit = LIMITS[difficulty];
    const operation = mode === 'mixed' ? (random() < 0.5 ? 'addition' : 'subtraction') : mode;
    const choices = [];
    for (let a = 0; a <= limit; a++) {
        for (let b = 0; b <= limit; b++) {
            const answer = operation === 'addition' ? a + b : a - b;
            if (answer < 0 || answer > limit) continue;
            if (previous?.a === a && previous?.b === b && previous?.operation === operation) continue;
            choices.push({ a, b, operation, answer });
        }
    }
    return choices[Math.floor(random() * choices.length)];
}

export function checkAnswer(value, answer, submitted = false) {
    if (!/^\d+$/.test(value)) return 'pending';
    if (Number(value) === answer) return 'correct';
    return submitted || value.length >= String(answer).length ? 'wrong' : 'pending';
}

export function solutionText(problem) {
    const operation = problem.operation === 'addition' ? 'plus' : 'minus';
    return `${problem.a} ${operation} ${problem.b} equals ${problem.answer}.`;
}

export function questionText(problem, withAnswer = false) {
    const operation = problem.operation === 'addition' ? 'plus' : 'minus';
    return withAnswer
        ? `${solutionText(problem)} Well done!`
        : `What is ${problem.a} ${operation} ${problem.b}?`;
}
