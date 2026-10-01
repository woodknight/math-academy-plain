import { generateProblem, checkAnswer, questionText, solutionText, advanceTrail, TRAIL_START, TRAIL_END } from './game.js';
import { chooseAdventure, trailPoints, CREATURES } from './adventures.js';
import { landscapeArt, routeArt, gearArt, rewardArt, creatureArt } from './adventure-art.js';
import { SpeechPlayer } from './speech.js';
import { PlayerUI, treasureReceiptId } from './player.js';
import { AdaptiveScheduler, LearningClock, adventureRewardDifficulty } from './learning.js';
import { LearningClient } from './learning-client.js';
import { LearningUI } from './learning-ui.js';
import { TREASURE_TIERS, upgradeTreasure } from './treasures.js';
import { RoundMusicPlayer } from './round-music.js';

const $ = (selector) => document.querySelector(selector);
const answerInput = $('#answer');
const card = $('#game-card');
const feedback = $('#feedback');
const helpDialog = $('#help-dialog');
let mode = 'addition';
let difficulty = 'adaptive';
let display = 'dots';
let problem = { a: 3, b: 2, operation: 'addition', answer: 5 };
let started = false;
let soundEnabled = true;
let locked = false;
let correctCount = 0;
let questionNumber = 1;
let wrongAttempts = 0;
let revealingAnswer = false;
let showingNumericSolution = false;
let round = 0;
let questionSession;
let adventureDifficulty = null;
let learnerRevision = 0;
let learnerReady = Promise.resolve();
let learningUI;
let speechRevision = 0;
const learningClock = new LearningClock();
const scheduler = new AdaptiveScheduler();
const learningClient = new LearningClient({
    onChange: () => learningUI?.render(),
    onAuthError: error => {
        playerUI.player = null;
        playerUI.revision++;
        playerUI.setAuthMode('login');
        playerUI.error(error.message);
        playerUI.render();
    },
});
let audioContext;
const activeSounds = new Set();
const roundMusic = new RoundMusicPlayer(() => audioContext);
let roundMusicPlaying = false;
let trailPosition = TRAIL_START;
let trailOutcome = null;
let adventure = null;
let encounter = null;
let adventureNumber = 0;
const traveler = $('#traveler');
const trailScene = $('#trail-scene');
const journeyCard = $('#journey-card');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const speechPlayer = new SpeechPlayer({
    getContext: () => audioContext,
    onStart: () => { $('#voice-notice').hidden = true; },
    onError: () => {
        $('#voice-notice').textContent = 'Voice couldn’t play. Choose “Hear the question” to try again.';
        $('#voice-notice').hidden = false;
    },
});

function setLocked(value) {
    locked = value;
    if (value) learningClock.pause('locked'); else learningClock.resume('locked');
    answerInput.readOnly = value;
    document.querySelectorAll('.number-pad button, #mode-options button, #display-options button, #difficulty, #player-button').forEach((control) => {
        control.disabled = value;
    });
}

function sprite(id, kind = 'reward', tier = 'classic') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 120 120');
    svg.setAttribute('aria-hidden', 'true');
    svg.dataset.item = id;
    svg.dataset.tier = tier;
    // Artwork comes only from the local, fixed catalogues.
    svg.innerHTML = kind === 'creature' ? creatureArt(id) : rewardArt(id);
    if (kind === 'reward' && tier !== 'classic') {
        const color = tier === 'gold' ? '#e3ac28' : '#92afc8';
        const decor = `<circle cx="60" cy="60" r="55" fill="none" stroke="${color}" stroke-width="4" stroke-dasharray="3 5"/>`;
        const crown = tier === 'gold' ? '<path d="m40 18 2-14 10 8 8-11 8 11 10-8 2 14Z" fill="#ffd366" stroke="#b78220" stroke-width="2"/>' : '';
        svg.innerHTML = decor + svg.innerHTML + crown + `<path d="m101 20 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z" fill="${color}"/>`;
    }
    return svg;
}

function trailMessage(title, detail) {
    $('#journey-status').textContent = title;
    $('#journey-detail').textContent = detail;
}

function renderTrailPosition() {
    const points = trailPoints(adventure);
    const point = points[trailPosition];
    traveler.style.setProperty('--progress', `${point.x / 560 * 100}%`);
    traveler.style.bottom = `${100 - point.y / 300 * 100}%`;
    trailScene.style.setProperty('--prize-x', `${points[TRAIL_END].x / 560 * 100}%`);
    trailScene.style.setProperty('--reward-x', `${(points[TRAIL_END].x - 80) / 560 * 100}%`);
    trailScene.style.setProperty('--prize-bottom', `${100 - points[TRAIL_END].y / 300 * 100}%`);
    trailScene.style.setProperty('--encounter-x', `${points[0].x / 560 * 100}%`);
    trailScene.style.setProperty('--encounter-bottom', `${100 - points[0].y / 300 * 100}%`);
    trailScene.dataset.position = trailPosition;
    trailScene.setAttribute('aria-label', `${adventure.label}. Milo is at step ${trailPosition} of ${TRAIL_END}. ${TRAIL_END - trailPosition} steps to the gift, ${trailPosition} steps to the creature.`);
    $('#adventure-path').innerHTML = routeArt(adventure, trailPosition);
}

const playerUI = new PlayerUI({
    sprite,
    onOpen: openDialog,
    onClose: () => {
        updateDialogClock();
        if (started && !locked && !document.querySelector('dialog[open]')) speak(questionText(problem));
    },
    onPlayerChange: changeLearner,
});
learningUI = new LearningUI({ client: learningClient, onOpen: openDialog, onClose: () => {
    updateDialogClock();
    if (started && !locked) speak(questionText(problem));
} });

function openDialog() { learningClock.pause('dialog'); stopSpeech(); }
function updateDialogClock() {
    if (document.querySelector('dialog[open]')) learningClock.pause('dialog');
    else learningClock.resume('dialog');
}
// Covers dialogs opened by other controls too, including the administrator panel.
new MutationObserver(updateDialogClock).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
function changeLearner(player) {
    const revision = ++learnerRevision;
    round++;
    setLocked(true);
    stopSpeech();
    stopSounds();
    learnerReady = learningClient.setPlayer(player?.id ?? null).finally(() => {
        if (revision !== learnerRevision) return;
        difficulty = 'adaptive';
        $('#difficulty').value = difficulty;
        scheduler.reset();
        correctCount = 0;
        questionNumber = 1;
        adventureNumber = 0;
        $('#correct-count').textContent = '0';
        $('#encouragement').textContent = 'Every try helps your brain grow.';
        resetTrail();
        nextProblem();
    });
}

function questionDifficulty() {
    return adventureRewardDifficulty(null, problem);
}
function rewardDifficulty() { return difficulty === 'adaptive' ? adventureDifficulty ?? questionDifficulty() : difficulty; }
function recordAdventureDifficulty() {
    if (difficulty !== 'adaptive') return;
    adventureDifficulty = adventureRewardDifficulty(adventureDifficulty, problem);
    renderRewardTier();
}
function renderRewardTier() {
    const tier = TREASURE_TIERS[rewardDifficulty()];
    $('#reward-tier').textContent = '★'.repeat(tier.stars);
    $('#reward-tier').setAttribute('aria-label', `${tier.label} treasures for this adventure`);
}

function celebrate() {
    const colors = ['#e9a18c', '#a4bd87', '#e5c879', '#b9acd4'];
    $('#trail-confetti').replaceChildren(...Array.from({ length: 28 }, (_, index) => {
        const piece = document.createElement('i');
        piece.style.setProperty('--x', `${index / 28 * 100}%`);
        piece.style.setProperty('--color', colors[index % colors.length]);
        piece.style.setProperty('--delay', `${index % 7 * .06}s`);
        return piece;
    }));
}

async function moveMilo(correct) {
    const currentRound = round;
    const step = advanceTrail(trailPosition, correct, Math.random, encounter);
    trailPosition = step.position;
    trailOutcome = step.outcome;
    traveler.classList.remove('walking', 'backward', 'celebrating', 'eaten');
    // Restart the gait even when successive answers move in the same direction.
    void traveler.offsetWidth;
    traveler.classList.add('walking');
    traveler.classList.toggle('backward', !correct);
    trailScene.dataset.phase = 'moving';
    playSound(correct ? 'forward' : 'backward');
    renderTrailPosition();
    trailMessage(correct ? `${adventure.activity.verb} a little farther!` : 'Oops, a little step back!',
        `${TRAIL_END - trailPosition} ${TRAIL_END - trailPosition === 1 ? 'step' : 'steps'} to a surprise. ${trailPosition} ${trailPosition === 1 ? 'step' : 'steps'} to the hungry creature.`);
    await wait(750);
    if (round !== currentRound) return;
    traveler.classList.remove('walking', 'backward');
    if (!trailOutcome) {
        trailScene.dataset.phase = 'ready';
        return;
    }

    const { type } = trailOutcome;
    const item = type === 'reward' ? upgradeTreasure(trailOutcome.item, rewardDifficulty()) : trailOutcome.item;
    journeyCard.classList.add('finished');
    trailScene.setAttribute('aria-label', type === 'reward' ? `Milo reached the finish and received ${item.name}.` : `Milo reached the snack stop and was gobbled up by ${item.name}.`);
    if (type === 'reward') {
        trailScene.classList.add('reward');
        trailScene.dataset.phase = 'reward';
        $('#trail-prize').replaceChildren(sprite(item.id, 'reward', item.tier));
        traveler.classList.add('celebrating');
        playerUI.collect(item);
        celebrate();
        playSound('reward');
        trailMessage(`Hooray! You found ${item.name}!`, 'Enjoy your prize. A new adventure is coming!');
        showFeedback('You made it! A surprise for Milo!');
        if (!showingNumericSolution) $('#answer-hint').textContent = 'A new adventure starts after the celebration.';
        const celebrationAnimations = trailScene.getAnimations({ subtree: true })
            .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity);
        await Promise.all([
            flyTreasure(item, currentRound),
            ...celebrationAnimations.map((animation) => animation.finished.catch(() => { })),
        ]);
        return;
    } else {
        $('#trail-encounter').replaceChildren(sprite(item.id, 'creature'));
        journeyCard.classList.add('gobble');
        trailScene.classList.add('eating');
        trailScene.dataset.phase = 'eating';
        traveler.classList.add('eaten');
        playSound('punishment');
        trailMessage(`Nom nom! ${item.label} gobbled Milo!`, 'A silly little tumble. Milo will be back for another adventure.');
        if (!revealingAnswer) showFeedback('Gulp! Let’s give Milo a fresh start.');
        await wait(1100);
        if (round !== currentRound) return;
        trailScene.dataset.phase = 'eaten';
    }
    $('#answer-hint').textContent = 'A fresh adventure starts after the music.';
}

async function flyTreasure(item, currentRound) {
    await wait(650);
    if (round !== currentRound) return;
    const source = $('#trail-prize');
    const target = $('#treasure-box-art');
    const from = source.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const flight = document.createElement('div');
    flight.className = 'treasure-flight';
    flight.append(sprite(item.id, 'reward', item.tier));
    Object.assign(flight.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
    document.body.append(flight);
    source.style.visibility = 'hidden';
    trailScene.dataset.phase = 'collecting';
    try {
        const dx = to.left + to.width / 2 - from.left - from.width / 2;
        const dy = to.top + to.height / 2 - from.top - from.height / 2;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const frames = reduced ? [{ opacity: 1 }, { opacity: 0 }] : [
            { transform: 'translate(0, 0) scale(1.15) rotate(-8deg)', opacity: 1 },
            { transform: `translate(${dx * .35}px, ${Math.min(-90, dy * .2)}px) scale(1.35) rotate(12deg)`, opacity: 1, offset: .4 },
            { transform: `translate(${dx}px, ${dy}px) scale(.3) rotate(-15deg)`, opacity: .9 },
        ];
        if (flight.animate) await flight.animate(frames, { duration: reduced ? 180 : 1400, easing: 'cubic-bezier(.4,0,.3,1)' }).finished.catch(() => {});
        else await wait(180);
        if (round !== currentRound) return;
        target.classList.add('receiving');
        const tile = Array.from(document.querySelectorAll('#treasure-panel-items .treasure-stack')).find(tile => tile.dataset.key === item.key);
        tile?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        tile?.animate?.([{ backgroundColor: '#ffe5a0', transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 700 });
        await wait(reduced ? 150 : 700);
    } catch { /* A missing animation must never prevent the next adventure. */ }
    finally { flight.remove(); target.classList.remove('receiving'); }
}

async function playRoundMusic(outcome) {
    stopSpeech();
    learningClock.pause('music');
    roundMusicPlaying = true;
    trailScene.dataset.phase = outcome === 'reward' ? 'win-music' : 'loss-music';
    $('#answer-hint').textContent = outcome === 'reward' ? 'A little victory tune! Next adventure coming…' : 'A bouncy little sad tune. Let’s try a fresh adventure!';
    try {
        if (soundEnabled && audioContext?.state === 'running') await roundMusic.play(outcome);
        else await wait(650);
    } finally { roundMusicPlaying = false; learningClock.resume('music'); }
}

function resetTrail() {
    adventureDifficulty = null;
    adventure = chooseAdventure(adventure);
    encounter = CREATURES[Math.floor(Math.random() * CREATURES.length)];
    adventureNumber++;
    trailPosition = TRAIL_START;
    trailOutcome = null;
    traveler.classList.remove('walking', 'backward', 'celebrating', 'eaten');
    journeyCard.classList.remove('finished', 'gobble');
    trailScene.classList.remove('reward', 'eating');
    trailScene.dataset.phase = 'ready';
    trailScene.dataset.adventure = adventure.id;
    trailScene.dataset.motion = adventure.activity.id;
    trailScene.dataset.world = adventure.world.id;
    $('#adventure-landscape').innerHTML = landscapeArt(adventure);
    $('#milo-gear').innerHTML = gearArt(adventure.activity.id);
    $('#adventure-label').textContent = `ADVENTURE ${String(adventureNumber).padStart(2, '0')} · ${adventure.world.label.toUpperCase()}`;
    $('#journey-title').textContent = adventure.activity.label;
    $('#adventure-description').textContent = adventure.activity.detail;
    $('#trail-prize').replaceChildren(sprite('gift'));
    $('#trail-prize').style.removeProperty('visibility');
    renderRewardTier();
    $('#trail-encounter').replaceChildren(sprite(encounter.id, 'creature'));
    $('#trail-confetti').replaceChildren();
    $('#journey-again').hidden = true;
    $('#answer-hint').textContent = 'Type your answer or tap the numbers below.';
    trailMessage(`A surprise is ${TRAIL_END - TRAIL_START} steps away!`, `${TRAIL_START} steps back to the hungry creature. Let’s ${adventure.activity.verb.toLowerCase()}!`);
    // Start the next adventure at its actual origin before accepting another answer.
    traveler.style.transition = 'none';
    renderTrailPosition();
    void traveler.offsetWidth;
    traveler.style.removeProperty('transition');
}

function stopSpeech() {
    speechRevision++;
    speechPlayer.stop();
    learningClock.resume('speech');
}

function speak(text) {
    stopSpeech();
    if (roundMusicPlaying || !soundEnabled || !started || document.querySelector('dialog[open]')) return Promise.resolve();
    learningClock.pause('speech');
    const revision = speechRevision;
    return speechPlayer.play(text).finally(() => { if (revision === speechRevision) learningClock.resume('speech'); });
}

function prepareSpeech() {
    if (soundEnabled) speechPlayer.prepare([questionText(problem), solutionText(problem), questionText(problem, true)]);
}

function unlockAudio() {
    if (!soundEnabled) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    audioContext ??= new AudioContext();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => { });
}

function stopSounds() {
    roundMusic.stop();
    for (const oscillator of activeSounds) {
        oscillator.stop();
    }
    activeSounds.clear();
}

function playSound(effect) {
    if (!soundEnabled || !audioContext) return;
    const now = audioContext.currentTime;
    const tone = (frequency, delay, duration, volume, type = 'sine', endFrequency = frequency) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const start = now + delay;
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, start);
        oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(volume, start + .01);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        gain.gain.setValueAtTime(0, start + duration + .01);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        activeSounds.add(oscillator);
        oscillator.start(start);
        oscillator.stop(start + duration + .02);
        oscillator.onended = () => {
            activeSounds.delete(oscillator);
            oscillator.disconnect();
            gain.disconnect();
        };
    };

    switch (effect) {
        case 'forward':
            // Four soft, springy footsteps follow the walking animation.
            [260, 330, 290, 370].forEach((frequency, index) => {
                const watery = ['swim', 'boat'].includes(adventure.activity.id);
                const airy = adventure.activity.id === 'fly';
                const pitch = frequency * (watery ? 1.6 : airy ? 2 : 1);
                tone(pitch, .08 + index * .18, watery ? .12 : .07, .045, watery || airy ? 'sine' : 'triangle', pitch * .7);
            });
            break;
        case 'backward':
            [330, 290, 250, 210].forEach((frequency, index) => {
                const watery = ['swim', 'boat'].includes(adventure.activity.id);
                const pitch = frequency * (watery ? 1.6 : 1);
                tone(pitch, .08 + index * .18, .09, .045, watery ? 'sine' : 'triangle', pitch * .6);
            });
            break;
        case 'reward':
            // A bright fanfare and a final sparkle when the mystery gift opens.
            [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
                tone(frequency, index * .13, .3, .1);
            });
            [1318.51, 1567.98, 2093].forEach((frequency, index) => {
                tone(frequency, .6 + index * .08, .22, .045);
            });
            break;
        case 'punishment':
            // Cartoon chomps and a bouncy gulp, timed to the gobble and puff.
            [240, 220, 200].forEach((frequency, index) => {
                tone(frequency, .04 + index * .23, .15, .09, 'triangle', 80);
            });
            tone(130, .72, .28, .075, 'sine', 290);
            break;
        case 'correct':
            [523.25, 659.25, 783.99].forEach((frequency, index) => {
                tone(frequency, index * .11, .25, .09);
            });
            break;
        case 'wrong':
            [145, 110].forEach((frequency, index) => {
                tone(frequency, index * .14, .17, .065, 'triangle', frequency * .65);
            });
            break;
    }
}

function renderOperand(element, value, presentation = display) {
    element.replaceChildren();
    element.setAttribute('aria-label', `${value}${presentation === 'dots' ? ' dots' : ''}`);
    if (presentation === 'numbers' || value === 0) {
        element.textContent = value;
        return;
    }
    const grid = document.createElement('span');
    grid.className = 'dot-grid';
    grid.dataset.density = value > 20 ? 'high' : value > 5 ? 'medium' : 'low';
    grid.style.setProperty('--columns', value > 20 ? '7' : value > 5 ? '5' : value > 1 ? '2' : '1');
    grid.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < value; i++) {
        const dot = document.createElement('span');
        dot.className = 'dot';
        if (value === 3 && i === 0) dot.style.gridColumn = '1 / -1';
        grid.append(dot);
    }
    element.append(grid);
}

function renderProblem() {
    const presentation = showingNumericSolution ? 'numbers' : display;
    renderOperand($('#operand-first'), problem.a, presentation);
    renderOperand($('#operand-second'), problem.b, presentation);
    const addition = problem.operation === 'addition';
    $('#operator').textContent = addition ? '+' : '−';
    $('#operator').setAttribute('aria-label', addition ? 'plus' : 'minus');
    $('.equation').setAttribute('aria-label', showingNumericSolution ? solutionText(problem) : questionText(problem));
    $('#question-heading').textContent = addition ? 'How many altogether?' : 'How many are left?';
    $('#practice-title').textContent = mode === 'mixed' ? 'A little bit of both' : `A little ${mode}`;
    $('#question-number').textContent = String(questionNumber).padStart(2, '0');
}

async function flipToNumericSolution() {
    const equation = $('.equation');
    const animate = equation.animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let flipOut;
    if (animate) {
        flipOut = equation.animate([
            { transform: 'perspective(900px) rotateX(0deg)', opacity: 1 },
            { transform: 'perspective(900px) rotateX(-90deg)', opacity: .35 },
        ], { duration: 220, easing: 'ease-in', fill: 'forwards' });
        await flipOut.finished.catch(() => { });
    }
    // Reveal the numeric face without changing the selected mode for the next question.
    showingNumericSolution = true;
    renderProblem();
    if (animate) {
        const flipIn = equation.animate([
            { transform: 'perspective(900px) rotateX(90deg)', opacity: .35 },
            { transform: 'perspective(900px) rotateX(0deg)', opacity: 1 },
        ], { duration: 220, easing: 'ease-out' });
        flipOut.cancel();
        await flipIn.finished.catch(() => { });
    }
}

async function reviewDotsSolution(currentRound) {
    $('#answer-hint').textContent = 'Let’s see it as numbers.';
    await flipToNumericSolution();
    if (round !== currentRound) return;
    $('#answer-hint').textContent = soundEnabled ? 'Listen to the number sentence.' : 'Read the number sentence.';
    await speak(solutionText(problem));
    if (round !== currentRound) return;
    $('#answer-hint').textContent = 'Next question in 2 seconds.';
    await wait(2000);
}

function showFeedback(text) {
    $('#start-button').hidden = true;
    feedback.hidden = false;
    feedback.textContent = text;
}

function focusAnswer() {
    if (window.matchMedia('(pointer: fine)').matches && !document.querySelector('dialog[open]')) answerInput.focus({ preventScroll: true });
}

function startGame(readQuestion = true, timed = true) {
    unlockAudio();
    if (started) return;
    started = true;
    learningClock.reset(timed);
    learningClock.start();
    showFeedback('You’ve got this. Take your time!');
    if (readQuestion) speak(questionText(problem));
}

function nextProblem() {
    round++;
    stopSpeech();
    wrongAttempts = 0;
    revealingAnswer = false;
    showingNumericSolution = false;
    setLocked(false);
    answerInput.value = '';
    card.classList.remove('correct', 'wrong', 'revealed');
    $('.answer-caption').textContent = 'YOUR ANSWER';
    $('#answer-hint').textContent = 'Type your answer or tap the numbers below.';
    problem = difficulty === 'adaptive' ? scheduler.next(learningClient.state, mode, display).problem : generateProblem(mode, difficulty, problem);
    questionSession = { id: treasureReceiptId(), playerId: learningClient.playerId ?? null,
        problem: { a: problem.a, b: problem.b, operation: problem.operation }, display, practice: difficulty };
    learningClock.reset();
    if (started) learningClock.start();
    renderProblem();
    renderRewardTier();
    prepareSpeech();
    if (started) {
        showFeedback('You’ve got this. Take your time!');
        speak(questionText(problem));
    }
}

async function evaluate(submitted = false) {
    if (locked || !answerInput.value) return;
    const result = checkAnswer(answerInput.value, problem.answer, submitted);
    if (result === 'pending') return;
    const activeMs = learningClock.read();
    setLocked(true);
    stopSpeech();
    const currentRound = round;
    recordAdventureDifficulty();
    const movement = moveMilo(result === 'correct');
    learningClient.record({ ...questionSession, id: treasureReceiptId(), questionId: questionSession.id,
        index: wrongAttempts + 1, answer: Number(answerInput.value), activeMs,
        end: trailOutcome?.type === 'creature' ? 'adventure-ended' : null });
    if (result === 'correct') {
        card.classList.add('correct');
        correctCount++;
        $('#correct-count').textContent = correctCount;
        $('#encouragement').textContent = correctCount % 5 === 0 ? 'Look at you grow. Keep it up!' : 'One little win. One bigger smile.';
        showFeedback('That’s right! Nicely done.');
        playSound('correct');
        if (display === 'dots') {
            await Promise.all([movement, reviewDotsSolution(currentRound)]);
        } else {
            const answerSpeech = speak(questionText(problem, true));
            await Promise.all([wait(1600), movement, answerSpeech]);
        }
        if (round !== currentRound) return;
        if (trailOutcome?.type === 'reward') {
            await playRoundMusic('reward');
            if (round !== currentRound) return;
            resetTrail();
        }
        questionNumber++;
        nextProblem();
        focusAnswer();
    } else {
        card.classList.add('wrong');
        showFeedback('Not quite. Let’s try that again!');
        playSound('wrong');
        wrongAttempts++;
        if (wrongAttempts >= 3) {
            revealingAnswer = true;
            card.classList.remove('wrong');
            card.classList.add('revealed');
            answerInput.value = String(problem.answer);
            $('.answer-caption').textContent = 'CORRECT ANSWER';
            showFeedback(`The correct answer is ${problem.answer}. Let’s learn from it!`);
            $('#answer-hint').textContent = 'Next question in 3 seconds.';
            speak(solutionText(problem));
            await Promise.all([movement, wait(3000)]);
            if (round !== currentRound) return;
            if (trailOutcome) {
                await playRoundMusic(trailOutcome.type);
                if (round !== currentRound) return;
                resetTrail();
            }
            questionNumber++;
            nextProblem();
            focusAnswer();
            return;
        }
        await Promise.all([movement, wait(800)]);
        if (round !== currentRound) return;
        if (trailOutcome) {
            await playRoundMusic(trailOutcome.type);
            if (round !== currentRound) return;
            resetTrail();
            questionNumber++;
            nextProblem();
            focusAnswer();
            return;
        }
        speak(questionText(problem));
        answerInput.value = '';
        setLocked(false);
        card.classList.remove('wrong');
    }
}

function handleKey(key) {
    if (locked) return;
    startGame(false, false);
    if (key === 'Backspace') {
        answerInput.value = answerInput.value.slice(0, -1);
    } else if (key === 'Enter') {
        evaluate(true);
    } else if (/^\d$/.test(key)) {
        answerInput.value = (answerInput.value + key).replace(/^0+(?=\d)/, '').slice(0, 2);
        evaluate();
    }
}

$('#start-button').addEventListener('click', () => { startGame(); focusAnswer(); });
$('#listen-button').addEventListener('click', () => {
    startGame(false);
    speak(revealingAnswer || showingNumericSolution ? solutionText(problem) : questionText(problem, locked && card.classList.contains('correct')));
});
answerInput.addEventListener('input', () => {
    startGame(false, false);
    answerInput.value = answerInput.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 2);
    evaluate();
});
answerInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); handleKey('Enter'); }
    if (event.key === 'Escape' && !locked) answerInput.value = '';
});
document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || document.querySelector('dialog[open]')) return;
    if (event.target.closest('input, select, textarea, [contenteditable="true"]')) return;
    if (/^\d$/.test(event.key) || event.key === 'Backspace' || (event.key === 'Enter' && event.target === document.body)) {
        event.preventDefault();
        handleKey(event.key);
        focusAnswer();
    }
});
$('.number-pad').addEventListener('click', (event) => {
    const key = event.target.closest('[data-key]')?.dataset.key;
    if (key) handleKey(key);
});

function updateButtons(group, attribute, selected) {
    document.querySelectorAll(`${group} button`).forEach((button) => {
        const active = button.dataset[attribute] === selected;
        button.classList.toggle('selected', active);
        button.setAttribute('aria-pressed', String(active));
    });
}

$('#mode-options').addEventListener('click', (event) => {
    const value = event.target.closest('[data-mode]')?.dataset.mode;
    if (locked || !value || value === mode) return;
    mode = value;
    updateButtons('#mode-options', 'mode', mode);
    unlockAudio();
    nextProblem();
});
$('#difficulty').addEventListener('change', (event) => {
    if (locked) return;
    difficulty = event.target.value;
    resetTrail();
    unlockAudio();
    nextProblem();
});
$('#journey-again').addEventListener('click', () => {
    if (revealingAnswer || trailOutcome?.type !== 'creature' || $('#journey-again').hidden) return;
    resetTrail();
    round++;
    stopSpeech();
    answerInput.value = '';
    card.classList.remove('wrong');
    setLocked(false);
    showFeedback('A fresh start. You’ve got this!');
    speak(questionText(problem));
    focusAnswer();
});
$('#display-options').addEventListener('click', (event) => {
    const value = event.target.closest('[data-display]')?.dataset.display;
    if (locked || !value || value === display) return;
    display = value;
    updateButtons('#display-options', 'display', display);
    if (difficulty === 'adaptive' || wrongAttempts) { nextProblem(); return; }
    questionSession.display = display;
    learningClock.reset();
    if (started) learningClock.start();
    renderProblem();
});
$('#sound-toggle').addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    $('#sound-toggle').setAttribute('aria-pressed', String(soundEnabled));
    $('#sound-toggle').setAttribute('aria-label', soundEnabled ? 'Sound on' : 'Sound off');
    $('#sound-toggle span').textContent = soundEnabled ? 'Sound on' : 'Sound off';
    $('#sound-toggle use').setAttribute('href', soundEnabled ? '#i-sound' : '#i-mute');
    if (soundEnabled) {
        unlockAudio();
        if (started) speak(revealingAnswer || showingNumericSolution ? solutionText(problem) : questionText(problem, locked && card.classList.contains('correct')));
    } else {
        stopSpeech();
        $('#voice-notice').hidden = true;
        stopSounds();
        audioContext?.suspend().catch(() => { });
    }
});
$('#help-button').addEventListener('click', () => { openDialog(); helpDialog.showModal(); });
$('#close-help').addEventListener('click', () => helpDialog.close());
$('#help-done').addEventListener('click', () => helpDialog.close());
helpDialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        event.preventDefault();
        helpDialog.close();
    }
});
helpDialog.addEventListener('click', (event) => {
    const bounds = helpDialog.getBoundingClientRect();
    if (event.target === helpDialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) helpDialog.close();
});
helpDialog.addEventListener('close', () => {
    updateDialogClock();
    if (started && !locked) speak(questionText(problem));
});
document.addEventListener('visibilitychange', () => {
    if (document.hidden) learningClock.pause('background'); else learningClock.resume('background');
});
window.addEventListener('online', () => learningClient.setPlayer(learningClient.playerId));
window.addEventListener('pagehide', () => { learningClock.pause('background'); stopSpeech(); stopSounds(); });
window.addEventListener('pageshow', () => { if (!document.hidden) learningClock.resume('background'); });
if (document.hidden) learningClock.pause('background');
renderProblem();
resetTrail();
setLocked(true);
await playerUI.init();
if (learningClient.playerId === undefined) changeLearner(playerUI.player);
await learnerReady;
setLocked(false);
prepareSpeech();
