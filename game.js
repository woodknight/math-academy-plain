export const LIMITS = { easy: 10, medium: 20, hard: 50 };

export const TRAIL_START = 3;
export const TRAIL_END = TRAIL_START + 10;
export const REWARDS = [
    { id: 'cake', name: 'a giant strawberry cake', label: 'Giant cake' },
    { id: 'car', name: 'a shiny little car', label: 'Little car' },
    { id: 'house', name: 'a dreamy little house', label: 'Dream house' },
    { id: 'rocket', name: 'your very own rocket', label: 'Rocket' },
    { id: 'bear', name: 'a cuddly teddy bear', label: 'Teddy bear' },
];
export const CREATURES = [
    { id: 'monster', name: 'a marshmallow monster', label: 'Marshmallow monster' },
    { id: 'dinosaur', name: 'a tiny dinosaur', label: 'Tiny dinosaur' },
    { id: 'frog', name: 'a very hungry frog', label: 'Hungry frog' },
    { id: 'yeti', name: 'a fluffy little yeti', label: 'Fluffy yeti' },
];

export function advanceTrail(position, correct, random = Math.random) {
    // A finished adventure cannot issue another prize or punishment.
    if (position <= 0 || position >= TRAIL_END) return { position, outcome: null };
    const next = position + (correct ? 1 : -1);
    const type = next === TRAIL_END ? 'reward' : next === 0 ? 'creature' : null;
    const choices = type === 'reward' ? REWARDS : CREATURES;
    return {
        position: next,
        outcome: type ? { type, item: choices[Math.floor(random() * choices.length)] } : null,
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
