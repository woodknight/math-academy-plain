export const LIMITS = { easy: 10, medium: 20, hard: 50 };

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

export function questionText(problem, withAnswer = false) {
  const operation = problem.operation === 'addition' ? 'plus' : 'minus';
  return withAnswer
    ? `${problem.a} ${operation} ${problem.b} equals ${problem.answer}. Well done!`
    : `What is ${problem.a} ${operation} ${problem.b}?`;
}
