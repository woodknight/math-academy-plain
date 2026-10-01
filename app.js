import { generateProblem, checkAnswer, questionText, solutionText, advanceTrail, TRAIL_START, TRAIL_END } from './game.js';

const $ = (selector) => document.querySelector(selector);
const answerInput = $('#answer');
const card = $('#game-card');
const feedback = $('#feedback');
const helpDialog = $('#help-dialog');
let mode = 'addition';
let difficulty = 'easy';
let display = 'dots';
let problem = { a: 3, b: 2, operation: 'addition', answer: 5 };
let started = false;
let soundEnabled = true;
let locked = false;
let correctCount = 0;
let questionNumber = 1;
let wrongAttempts = 0;
let revealingAnswer = false;
let round = 0;
let audioContext;
const activeSounds = new Set();
let finishSpeech;
let trailPosition = TRAIL_START;
let trailOutcome = null;
const treasures = [];
const traveler = $('#traveler');
const trailScene = $('#trail-scene');
const journeyCard = $('#journey-card');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function setLocked(value) {
    locked = value;
    answerInput.readOnly = value;
    document.querySelectorAll('.number-pad button, #mode-options button, #difficulty').forEach((control) => {
        control.disabled = value;
    });
}

function sprite(id) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 120 120');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `trail.svg#${id}`);
    svg.append(use);
    return svg;
}

function trailMessage(title, detail) {
    $('#journey-status').textContent = title;
    $('#journey-detail').textContent = detail;
}

function renderTrailPosition() {
    traveler.style.setProperty('--progress', `${trailPosition / TRAIL_END * 100}%`);
    trailScene.style.setProperty('--start-progress', `${TRAIL_START / TRAIL_END * 100}%`);
    trailScene.dataset.position = trailPosition;
    trailScene.setAttribute('aria-label', `Milo is at step ${trailPosition} of ${TRAIL_END}. ${TRAIL_END - trailPosition} steps to the gift, ${trailPosition} steps to the creature.`);
    $('#trail-markers').replaceChildren(...Array.from({ length: TRAIL_END + 1 }, (_, index) => {
        const marker = document.createElement('span');
        marker.className = `trail-marker${index === trailPosition ? ' current' : ''}${index === TRAIL_START ? ' start' : ''}`;
        return marker;
    }));
}

function renderTreasures() {
    $('#treasure-count').textContent = `${treasures.length} collected`;
    $('#treasure-items').replaceChildren(...treasures.slice(-3).map((item) => {
        const chip = document.createElement('span');
        chip.className = 'treasure-chip';
        const label = document.createElement('span');
        label.textContent = item.label;
        chip.append(sprite(item.id), label);
        return chip;
    }));
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
    const step = advanceTrail(trailPosition, correct);
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
    trailMessage(correct ? 'A little step forward!' : 'Oops, a little step back!',
        `${TRAIL_END - trailPosition} ${TRAIL_END - trailPosition === 1 ? 'step' : 'steps'} to a surprise. ${trailPosition} ${trailPosition === 1 ? 'step' : 'steps'} from Munchy Meadow.`);
    await wait(750);
    traveler.classList.remove('walking', 'backward');
    if (!trailOutcome) {
        trailScene.dataset.phase = 'ready';
        return;
    }

    const { type, item } = trailOutcome;
    journeyCard.classList.add('finished');
    trailScene.setAttribute('aria-label', type === 'reward' ? `Milo reached the finish and received ${item.name}.` : `Milo reached Munchy Meadow and was gobbled up by ${item.name}.`);
    if (type === 'reward') {
        trailScene.classList.add('reward');
        trailScene.dataset.phase = 'reward';
        $('#trail-prize').replaceChildren(sprite(item.id));
        traveler.classList.add('celebrating');
        treasures.push(item);
        renderTreasures();
        celebrate();
        playSound('reward');
        trailMessage(`Hooray! You found ${item.name}!`, 'Enjoy your prize. A new adventure is coming!');
        showFeedback('You made it! A surprise for Milo!');
        $('#answer-hint').textContent = 'A new adventure starts after the celebration.';
        const celebrationAnimations = trailScene.getAnimations({ subtree: true })
            .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity);
        await Promise.all([
            wait(900),
            ...celebrationAnimations.map((animation) => animation.finished.catch(() => { })),
        ]);
        return;
    } else {
        $('#trail-encounter').replaceChildren(sprite(item.id));
        journeyCard.classList.add('gobble');
        trailScene.classList.add('eating');
        trailScene.dataset.phase = 'eating';
        traveler.classList.add('eaten');
        playSound('punishment');
        trailMessage(`Nom nom! ${item.label} gobbled Milo!`, 'A silly little tumble. Milo will be back for another adventure.');
        if (!revealingAnswer) showFeedback('Gulp! Let’s give Milo a fresh start.');
        await wait(1100);
        trailScene.dataset.phase = 'eaten';
    }
    if (!revealingAnswer) {
        $('#journey-again').hidden = false;
        $('#answer-hint').textContent = 'Choose “Let’s go again” to start a new adventure.';
    }
}

function resetTrail() {
    trailPosition = TRAIL_START;
    trailOutcome = null;
    traveler.classList.remove('walking', 'backward', 'celebrating', 'eaten');
    journeyCard.classList.remove('finished', 'gobble');
    trailScene.classList.remove('reward', 'eating');
    trailScene.dataset.phase = 'ready';
    $('#trail-prize').replaceChildren(sprite('gift'));
    $('#trail-encounter').replaceChildren(sprite('monster'));
    $('#trail-confetti').replaceChildren();
    $('#journey-again').hidden = true;
    $('#answer-hint').textContent = 'Type your answer or tap the numbers below.';
    trailMessage(`A surprise is ${TRAIL_END - TRAIL_START} steps away!`, `${TRAIL_START} steps back to Munchy Meadow. Keep Milo moving toward the gift.`);
    // Start the next adventure at its actual origin before accepting another answer.
    traveler.style.transition = 'none';
    renderTrailPosition();
    void traveler.offsetWidth;
    traveler.style.removeProperty('transition');
}

function stopSpeech() {
    finishSpeech?.();
    window.speechSynthesis?.cancel();
}

function speak(text) {
    stopSpeech();
    if (!soundEnabled || !started || helpDialog.open || !('speechSynthesis' in window)) return Promise.resolve();
    return new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 0.85;
        utterance.pitch = 1.08;
        const voices = window.speechSynthesis.getVoices();
        utterance.voice = voices.find((voice) => voice.lang === 'en-US' && voice.localService)
            ?? voices.find((voice) => voice.lang.startsWith('en')) ?? null;
        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            clearTimeout(timeout);
            if (finishSpeech === finish) finishSpeech = undefined;
            resolve();
        };
        // Some speech engines omit completion events when no voice is available.
        const timeout = setTimeout(() => { finish(); window.speechSynthesis.cancel(); }, 6500);
        finishSpeech = finish;
        utterance.onend = finish;
        utterance.onerror = finish;
        window.speechSynthesis.speak(utterance);
    });
}

function unlockAudio() {
    if (!soundEnabled) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    audioContext ??= new AudioContext();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => { });
}

function stopSounds() {
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
                tone(frequency, .08 + index * .18, .07, .045, 'triangle', frequency * .7);
            });
            break;
        case 'backward':
            [330, 290, 250, 210].forEach((frequency, index) => {
                tone(frequency, .08 + index * .18, .09, .045, 'triangle', frequency * .6);
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

function renderOperand(element, value) {
    element.replaceChildren();
    element.setAttribute('aria-label', `${value}${display === 'dots' ? ' dots' : ''}`);
    if (display === 'numbers' || value === 0) {
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
    renderOperand($('#operand-first'), problem.a);
    renderOperand($('#operand-second'), problem.b);
    const addition = problem.operation === 'addition';
    $('#operator').textContent = addition ? '+' : '−';
    $('#operator').setAttribute('aria-label', addition ? 'plus' : 'minus');
    $('.equation').setAttribute('aria-label', questionText(problem));
    $('#question-heading').textContent = addition ? 'How many altogether?' : 'How many are left?';
    $('#practice-title').textContent = mode === 'mixed' ? 'A little bit of both' : `A little ${mode}`;
    $('#question-number').textContent = String(questionNumber).padStart(2, '0');
}

function showFeedback(text) {
    $('#start-button').hidden = true;
    feedback.hidden = false;
    feedback.textContent = text;
}

function focusAnswer() {
    if (window.matchMedia('(pointer: fine)').matches && !helpDialog.open) answerInput.focus({ preventScroll: true });
}

function startGame(readQuestion = true) {
    unlockAudio();
    if (started) return;
    started = true;
    showFeedback('You’ve got this. Take your time!');
    if (readQuestion) speak(questionText(problem));
}

function nextProblem() {
    round++;
    stopSpeech();
    wrongAttempts = 0;
    revealingAnswer = false;
    setLocked(false);
    answerInput.value = '';
    card.classList.remove('correct', 'wrong', 'revealed');
    $('.answer-caption').textContent = 'YOUR ANSWER';
    $('#answer-hint').textContent = 'Type your answer or tap the numbers below.';
    problem = generateProblem(mode, difficulty, problem);
    renderProblem();
    if (started) {
        showFeedback('You’ve got this. Take your time!');
        speak(questionText(problem));
    }
}

async function evaluate(submitted = false) {
    if (locked || !answerInput.value) return;
    const result = checkAnswer(answerInput.value, problem.answer, submitted);
    if (result === 'pending') return;
    setLocked(true);
    stopSpeech();
    const currentRound = round;
    const movement = moveMilo(result === 'correct');
    if (result === 'correct') {
        card.classList.add('correct');
        correctCount++;
        $('#correct-count').textContent = correctCount;
        $('#encouragement').textContent = correctCount % 5 === 0 ? 'Look at you grow. Keep it up!' : 'One little win. One bigger smile.';
        showFeedback('That’s right! Nicely done.');
        playSound('correct');
        const answerSpeech = speak(questionText(problem, true));
        await Promise.all([
            wait(1600),
            movement,
        ]);
        if (!trailOutcome) await answerSpeech;
        if (round !== currentRound) return;
        if (trailOutcome?.type === 'reward') resetTrail();
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
            if (trailOutcome) resetTrail();
            questionNumber++;
            nextProblem();
            focusAnswer();
            return;
        }
        await Promise.all([movement, wait(800)]);
        if (round !== currentRound) return;
        speak(questionText(problem));
        if (trailOutcome) return;
        answerInput.value = '';
        setLocked(false);
        card.classList.remove('wrong');
    }
}

function handleKey(key) {
    if (locked) return;
    startGame(false);
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
    speak(revealingAnswer ? solutionText(problem) : questionText(problem, locked && card.classList.contains('correct')));
});
answerInput.addEventListener('input', () => {
    startGame(false);
    answerInput.value = answerInput.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 2);
    evaluate();
});
answerInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); handleKey('Enter'); }
    if (event.key === 'Escape' && !locked) answerInput.value = '';
});
document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || helpDialog.open) return;
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
    if (!value || value === display) return;
    display = value;
    updateButtons('#display-options', 'display', display);
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
        if (started) speak(revealingAnswer ? solutionText(problem) : questionText(problem, locked && card.classList.contains('correct')));
    } else {
        stopSpeech();
        stopSounds();
        audioContext?.suspend().catch(() => { });
    }
});
$('#help-button').addEventListener('click', () => { stopSpeech(); helpDialog.showModal(); });
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
    if (started && !locked) speak(questionText(problem));
});
window.addEventListener('pagehide', () => { stopSpeech(); stopSounds(); });
renderProblem();
resetTrail();
