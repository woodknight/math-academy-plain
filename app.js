import { generateProblem, checkAnswer, questionText } from './game.js';

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
let round = 0;
let wrongTimer;
let audioContext;
let finishSpeech;

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

function playSound(correct) {
    if (!soundEnabled || !audioContext) return;
    const now = audioContext.currentTime;
    const notes = correct ? [523.25, 659.25, 783.99] : [145, 110];
    notes.forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const start = now + index * (correct ? 0.11 : 0.14);
        const duration = correct ? 0.25 : 0.17;
        oscillator.type = correct ? 'sine' : 'triangle';
        oscillator.frequency.setValueAtTime(frequency, start);
        if (!correct) oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.65, start + duration);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(correct ? 0.13 : 0.09, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.02);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
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
    clearTimeout(wrongTimer);
    stopSpeech();
    locked = false;
    answerInput.readOnly = false;
    answerInput.value = '';
    card.classList.remove('correct', 'wrong');
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
    locked = true;
    answerInput.readOnly = true;
    stopSpeech();
    const currentRound = round;
    if (result === 'correct') {
        card.classList.add('correct');
        correctCount++;
        $('#correct-count').textContent = correctCount;
        $('#encouragement').textContent = correctCount % 5 === 0 ? 'Look at you grow. Keep it up!' : 'One little win. One bigger smile.';
        showFeedback('That’s right! Nicely done.');
        playSound(true);
        await Promise.all([
            speak(questionText(problem, true)),
            new Promise((resolve) => setTimeout(resolve, 1600)),
        ]);
        if (round !== currentRound) return;
        questionNumber++;
        nextProblem();
    } else {
        card.classList.add('wrong');
        showFeedback('Not quite. Let’s try that again!');
        playSound(false);
        wrongTimer = setTimeout(() => {
            if (round !== currentRound) return;
            answerInput.value = '';
            answerInput.readOnly = false;
            locked = false;
            card.classList.remove('wrong');
        }, 650);
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
    speak(questionText(problem, locked && card.classList.contains('correct')));
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
    if (!value || value === mode) return;
    mode = value;
    updateButtons('#mode-options', 'mode', mode);
    unlockAudio();
    nextProblem();
});
$('#difficulty').addEventListener('change', (event) => {
    difficulty = event.target.value;
    unlockAudio();
    nextProblem();
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
        if (started) speak(questionText(problem, locked && card.classList.contains('correct')));
    } else {
        stopSpeech();
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
window.addEventListener('pagehide', stopSpeech);
renderProblem();
