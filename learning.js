// Shared, deterministic learning rules. No browser or server dependencies.
export const LEARNING_RULES = Object.freeze({
    limit: 50, initialLimit: 5, step: .35, smallerWeight: .35, exchangeWeight: .75,
    zeroDiscount: .75, doublesDiscount: .25, baselineWindow: 20, baselineSamples: 5,
    baselineDistance: .5, fluentRatio: 1.25, unlockWindow: 10, unlockCorrect: 8,
    recentLimit: 200, repeatWindow: 5, selectionTolerance: .015, targets: { normal: .85, weak: .9, challenge: .7 },
});
export const SKILLS = {
    addition: 'Addition', carry: 'Addition with carrying',
    subtraction: 'Subtraction', borrow: 'Subtraction with borrowing',
};
export const DISPLAYS = ['dots', 'numbers'];
export const FEATURE_LABELS = { within5: 'Within 5', within10: '6–10', within20: '11–20', within50: '21–50', zero: 'Using zero', doubles: 'Matching addends' };
export const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const sigmoid = value => 1 / (1 + Math.exp(-value));
const logit = value => Math.log(value / (1 - value));
export function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function problemFeatures(problem) {
    const { a, b, operation } = problem;
    const answer = operation === 'addition' ? a + b : a - b;
    const exchange = operation === 'addition' ? a % 10 + b % 10 >= 10 : a % 10 < b % 10;
    const maximum = Math.max(a, b, answer), zero = a === 0 || b === 0 || answer === 0;
    const doubles = operation === 'addition' && a === b;
    return { answer, maximum, zero, doubles, exchange,
        skill: exchange ? operation === 'addition' ? 'carry' : 'borrow' : operation,
        range: maximum <= 5 ? 'within5' : maximum <= 10 ? 'within10' : maximum <= 20 ? 'within20' : 'within50',
        difficulty: Math.log2(1 + maximum) + LEARNING_RULES.smallerWeight * Math.log2(1 + Math.min(a, b))
            + (exchange ? LEARNING_RULES.exchangeWeight : 0) - (zero ? LEARNING_RULES.zeroDiscount : 0)
            - (doubles ? LEARNING_RULES.doublesDiscount : 0) };
}
export function problemKey(problem) {
    const { a, b, operation } = problem;
    return operation === 'addition' ? `+${Math.min(a, b)},${Math.max(a, b)}` : `-${a},${b}`;
}
export function adventureRewardDifficulty(previous, problem) {
    const maximum = problemFeatures(problem).maximum;
    const current = maximum <= 10 ? 'easy' : maximum <= 20 ? 'medium' : 'hard';
    const ranks = ['easy', 'medium', 'hard'];
    return previous === null || ranks.indexOf(current) < ranks.indexOf(previous) ? current : previous;
}
const catalogue = [];
for (const operation of ['addition', 'subtraction']) {
    for (let a = 0; a <= LEARNING_RULES.limit; a++) for (let b = 0; b <= LEARNING_RULES.limit; b++) {
        const features = problemFeatures({ a, b, operation });
        if (features.answer >= 0 && features.answer <= LEARNING_RULES.limit) {
            catalogue.push({ a, b, operation, answer: features.answer, ...features });
        }
    }
}
const initialAbility = skill => {
    const choices = catalogue.filter(p => p.skill === skill && !p.zero &&
        (p.exchange || p.maximum <= LEARNING_RULES.initialLimit));
    const difficulty = skill === 'carry' || skill === 'borrow'
        ? Math.min(...choices.map(p => p.difficulty)) : median(choices.map(p => p.difficulty));
    return difficulty + logit(LEARNING_RULES.targets.normal);
};
export function createLearningState() {
    const skills = {};
    for (const skill of Object.keys(SKILLS)) for (const display of DISPLAYS) {
        skills[`${skill}:${display}`] = { ability: initialAbility(skill), questions: 0, firstCorrect: 0,
            retryCorrect: 0, revealed: 0, recent: [], timed: [], unlocked: skill === 'addition' || skill === 'subtraction' };
    }
    return { version: 1, revision: 0, totals: { questions: 0, firstCorrect: 0, retryCorrect: 0, revealed: 0, attempts: 0 },
        skills, features: {}, recent: [] };
}
export function speedBaseline(state, skill, display, difficulty) {
    const times = state.skills[`${skill}:${display}`].timed
        .filter(item => Math.abs(item.difficulty - difficulty) <= LEARNING_RULES.baselineDistance)
        .slice(-LEARNING_RULES.baselineWindow).map(item => item.activeMs);
    return times.length >= LEARNING_RULES.baselineSamples ? median(times) : null;
}
export function predictedCorrect(state, problem, display) {
    const features = problemFeatures(problem);
    return sigmoid(state.skills[`${features.skill}:${display}`].ability - features.difficulty);
}

export function validateAttempt(input) {
    const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
    if (!input || typeof input !== 'object' || !uuidPattern.test(input.id) || !uuidPattern.test(input.questionId)) fail('Invalid learning receipt.');
    const { a, b, operation } = input.problem ?? {};
    if (!['addition', 'subtraction'].includes(operation) || ![a, b].every(value => Number.isInteger(value) && value >= 0 && value <= 50)) fail('Invalid learning problem.');
    const answer = operation === 'addition' ? a + b : a - b;
    if (answer < 0 || answer > 50) fail('Invalid learning problem.');
    if (!DISPLAYS.includes(input.display) || !['adaptive', 'easy', 'medium', 'hard'].includes(input.practice)
        || !Number.isInteger(input.index) || input.index < 1 || input.index > 3
        || !Number.isInteger(input.answer) || input.answer < 0 || input.answer > 99
        || (input.activeMs !== null && (!Number.isFinite(input.activeMs) || input.activeMs <= 0 || input.activeMs > 86_400_000))
        || ![null, 'adventure-ended'].includes(input.end ?? null)) fail('Invalid learning attempt.');
    const limits = { easy: 10, medium: 20, hard: 50, adaptive: 50 };
    if (Math.max(a, b, answer) > limits[input.practice]) fail('Problem exceeds the selected practice range.');
    return { id: input.id, questionId: input.questionId, index: input.index,
        problem: { a, b, operation }, display: input.display, practice: input.practice,
        answer: input.answer, activeMs: input.activeMs, end: input.end ?? null };
}

// Mutates a private snapshot. The store commits it atomically; the client uses a clone.
// knownQuestion lets a late retry update totals after its detail aged out of the recent list.
export function applyAttempt(state, input, knownQuestion = null) {
    const attempt = validateAttempt(input);
    if (state.recent.some(q => q.attempts.some(a => a.id === attempt.id))) return null;
    let question = state.recent.find(q => q.id === attempt.questionId);
    if (!question && knownQuestion) question = { ...structuredClone(knownQuestion), attempts: [] };
    const features = problemFeatures(attempt.problem), correct = attempt.answer === features.answer;
    const model = state.skills[`${features.skill}:${attempt.display}`];
    if (question) {
        if (question.lastIndex + 1 !== attempt.index || question.result !== 'retrying'
            || JSON.stringify(question.problem) !== JSON.stringify(attempt.problem)
            || question.display !== attempt.display || question.practice !== attempt.practice) {
            throw Object.assign(new Error('This question changed or has already finished.'), { status: 409, code: 'QUESTION_CHANGED' });
        }
    } else {
        if (attempt.index !== 1) throw Object.assign(new Error('Save the first attempt before its retries.'), { status: 409, code: 'ATTEMPT_ORDER' });
        const baseline = speedBaseline(state, features.skill, attempt.display, features.difficulty);
        const fluent = baseline !== null && attempt.activeMs !== null && attempt.activeMs <= baseline * LEARNING_RULES.fluentRatio;
        const prediction = predictedCorrect(state, attempt.problem, attempt.display);
        if (!correct || fluent) model.ability += LEARNING_RULES.step * ((correct ? 1 : 0) - prediction);
        model.questions++;
        model.firstCorrect += Number(correct);
        model.recent.push({ correct, difficulty: features.difficulty, activeMs: attempt.activeMs, fluent });
        model.recent = model.recent.slice(-LEARNING_RULES.baselineWindow);
        if (features.skill === 'addition' || features.skill === 'subtraction') {
            const recent = model.recent.slice(-LEARNING_RULES.unlockWindow);
            if (recent.length === LEARNING_RULES.unlockWindow && recent.filter(q => q.correct).length >= LEARNING_RULES.unlockCorrect) {
                state.skills[`${features.skill === 'addition' ? 'carry' : 'borrow'}:${attempt.display}`].unlocked = true;
            }
        }
        if (correct && attempt.activeMs !== null) {
            model.timed.push({ difficulty: features.difficulty, activeMs: attempt.activeMs });
            // Keep several difficulty neighborhoods, not just the last 20 answers globally.
            model.timed = model.timed.slice(-LEARNING_RULES.recentLimit);
        }
        state.totals.questions++;
        state.totals.firstCorrect += Number(correct);
        for (const tag of [features.range, ...(features.zero ? ['zero'] : []), ...(features.doubles ? ['doubles'] : [])]) {
            const count = state.features[`${tag}:${attempt.problem.operation}:${attempt.display}`] ??= { questions: 0, firstCorrect: 0 };
            count.questions++;
            count.firstCorrect += Number(correct);
        }
        question = { id: attempt.questionId, problem: attempt.problem, display: attempt.display, practice: attempt.practice,
            skill: features.skill, difficulty: features.difficulty, firstCorrect: correct, activeMs: attempt.activeMs,
            baseline, fluent, lastIndex: 0, result: 'retrying', attempts: [] };
    }
    if (!question.firstCorrect && correct) { model.retryCorrect++; state.totals.retryCorrect++; }
    const revealed = !correct && attempt.index === 3;
    if (revealed) { model.revealed++; state.totals.revealed++; }
    question.lastIndex = attempt.index;
    question.result = correct ? 'correct' : revealed ? 'revealed' : attempt.end === 'adventure-ended' ? 'adventure-ended' : 'retrying';
    question.attempts.push({ id: attempt.id, answer: attempt.answer, activeMs: attempt.activeMs });
    if (!state.recent.includes(question)) state.recent.push(question);
    state.recent = state.recent.slice(-LEARNING_RULES.recentLimit);
    state.totals.attempts++;
    state.revision++;
    return question;
}

function unlocked(state, skill, display) {
    const basic = skill === 'carry' ? 'addition' : skill === 'borrow' ? 'subtraction' : null;
    if (!basic) return true;
    const recent = state.skills[`${basic}:${display}`].recent.slice(-LEARNING_RULES.unlockWindow);
    return state.skills[`${skill}:${display}`].unlocked === true ||
        (recent.length === LEARNING_RULES.unlockWindow && recent.filter(q => q.correct).length >= LEARNING_RULES.unlockCorrect);
}
export function weakSkills(state, operation, display) {
    return Object.keys(SKILLS).filter(skill => (operation === 'addition' ? ['addition', 'carry'] : ['subtraction', 'borrow']).includes(skill)
        && unlocked(state, skill, display) && state.skills[`${skill}:${display}`].recent.length >= LEARNING_RULES.baselineSamples)
        .filter(skill => {
            const recent = state.skills[`${skill}:${display}`].recent;
            return recent.filter(q => q.correct).length / recent.length < LEARNING_RULES.targets.normal;
        }).sort((a, b) => {
            const rate = skill => { const recent = state.skills[`${skill}:${display}`].recent; return recent.filter(q => q.correct).length / recent.length; };
            return rate(a) - rate(b);
        });
}
function weakTargets(state, operation, display) {
    const features = Object.entries(state.features).filter(([key, count]) => key.endsWith(`:${operation}:${display}`)
        && count.questions >= LEARNING_RULES.baselineSamples && count.firstCorrect / count.questions < LEARNING_RULES.targets.normal)
        .map(([key, count]) => ({ feature: key.split(':')[0], accuracy: count.firstCorrect / count.questions }));
    const skills = weakSkills(state, operation, display).map(skill => {
        const recent = state.skills[`${skill}:${display}`].recent;
        return { skill, accuracy: recent.filter(q => q.correct).length / recent.length };
    });
    return [...features, ...skills].sort((a, b) => a.accuracy - b.accuracy);
}
const matchesTarget = (problem, target) => target.skill ? problem.skill === target.skill
    : target.feature === 'zero' ? problem.zero : target.feature === 'doubles' ? problem.doubles : problem.range === target.feature;
function shuffle(values, random) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.min(i, Math.floor(random() * (i + 1)));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}
export class AdaptiveScheduler {
    constructor(random = Math.random) { this.random = random; this.reset(); }
    reset() { this.slots = []; this.operations = []; this.history = []; this.mode = null; }
    next(state, mode, display) {
        if (this.mode !== mode) { this.slots = []; this.operations = []; this.mode = mode; }
        if (!this.slots.length) {
            this.slots = shuffle(['normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'weak', 'weak', 'weak', 'challenge'], this.random);
            this.operations = shuffle(['addition', 'addition', 'addition', 'addition', 'addition', 'subtraction', 'subtraction', 'subtraction', 'subtraction', 'subtraction'], this.random);
        }
        let kind = this.slots.shift();
        const balancedOperation = this.operations.shift();
        const operation = mode === 'mixed' ? balancedOperation : mode;
        const available = catalogue.filter(p => p.operation === operation && unlocked(state, p.skill, display)
            && (state.skills[`${p.skill}:${display}`].questions >= LEARNING_RULES.baselineSamples || p.exchange || p.maximum <= LEARNING_RULES.initialLimit)
            && !this.history.includes(problemKey(p)));
        const weaknesses = weakTargets(state, operation, display).filter(target => available.some(p => matchesTarget(p, target)));
        if (kind === 'weak' && !weaknesses.length) kind = 'normal';
        const target = LEARNING_RULES.targets[kind];
        const candidates = available.filter(p => kind !== 'weak' || matchesTarget(p, weaknesses[0]));
        const distances = candidates.map(p => Math.abs(predictedCorrect(state, p, display) - target));
        const best = Math.min(...distances);
        const nearby = candidates.filter((_, index) => distances[index] <= best + LEARNING_RULES.selectionTolerance);
        const selected = nearby[Math.min(nearby.length - 1, Math.floor(this.random() * nearby.length))];
        if (!selected) throw new Error('No adaptive problem available.');
        this.history.push(problemKey(selected));
        this.history = this.history.slice(-LEARNING_RULES.repeatWindow);
        return { problem: { a: selected.a, b: selected.b, operation, answer: selected.answer }, kind, target, skill: selected.skill };
    }
}

export function learningSummary(state) {
    const skills = Object.entries(state.skills).map(([key, model]) => {
        const [skill, display] = key.split(':'), recent = model.recent;
        const accuracy = recent.length ? recent.filter(q => q.correct).length / recent.length : null;
        const fluent = recent.filter(q => q.correct && q.fluent).length;
        return { key, skill, display, label: SKILLS[skill], questions: model.questions, accuracy,
            speedMs: median(model.timed.slice(-20).map(q => q.activeMs)),
            status: recent.length < LEARNING_RULES.baselineSamples ? 'Learning about you'
                : accuracy >= LEARNING_RULES.targets.normal && fluent >= LEARNING_RULES.baselineSamples ? 'Growing confident' : 'Keep practising' };
    });
    const weakest = skills.filter(s => s.questions >= LEARNING_RULES.baselineSamples && s.accuracy < LEARNING_RULES.targets.normal).sort((a, b) => a.accuracy - b.accuracy)[0];
    const feature = Object.entries(state.features).filter(([, count]) => count.questions >= LEARNING_RULES.baselineSamples && count.firstCorrect / count.questions < LEARNING_RULES.targets.normal)
        .sort((a, b) => a[1].firstCorrect / a[1].questions - b[1].firstCorrect / b[1].questions)[0];
    const [tag, operation, display] = feature?.[0].split(':') ?? [];
    return { totals: state.totals, skills, features: state.features,
        recommendation: feature && (!weakest || feature[1].firstCorrect / feature[1].questions <= weakest.accuracy)
            ? `Try a little more ${operation} practice: ${FEATURE_LABELS[tag].toLowerCase()}, with ${display}.`
            : weakest ? `Try a few more ${weakest.label.toLowerCase()} questions with ${weakest.display}.`
            : state.totals.questions < 10 ? 'We’re learning about your pace. Keep exploring a few gentle questions.'
                : 'Keep practising at your own pace. A few new challenges will appear as you grow confident.' };
}

// A monotonic clock with overlapping pause reasons; wall-clock changes cannot alter results.
export class LearningClock {
    constructor(now = () => performance.now()) { this.now = now; this.reasons = new Set(); this.reset(); }
    reset(valid = true) { this.elapsed = 0; this.since = null; this.valid = valid; this.running = false; }
    accrue() { if (this.since !== null) this.elapsed += Math.max(0, this.now() - this.since); this.since = null; }
    update() { this.accrue(); if (this.running && !this.reasons.size) this.since = this.now(); }
    start() { this.running = true; this.update(); }
    pause(reason) { this.reasons.add(reason); this.update(); }
    resume(reason) { this.reasons.delete(reason); this.update(); }
    read() { this.update(); return this.valid && this.elapsed > 0 ? Math.min(this.elapsed, 86_400_000) : null; }
}
