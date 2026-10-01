import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MODEL_DIRECTORY, MODEL_REVISION, SPEECH_CACHE_DIRECTORY } from './voice-config.js';

export class SpeechError extends Error {
    constructor(message, status = 503) {
        super(message);
        this.status = status;
    }
}

const smallNumbers = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty'];
const numberWord = (n) => n < 20 ? smallNumbers[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${smallNumbers[n % 10]}` : ''}`;

// Only the game's valid, non-negative arithmetic can request synthesis.
export function mathSpeech(text) {
    if (typeof text !== 'string' || text.length > 100) throw new SpeechError('Invalid number sentence.', 400);
    const question = /^What is (\d{1,2}) (plus|minus) (\d{1,2})\?$/.exec(text);
    const solution = /^(\d{1,2}) (plus|minus) (\d{1,2}) equals (\d{1,2})\.( Well done!)?$/.exec(text);
    const match = question ?? solution;
    if (!match) throw new SpeechError('Invalid number sentence.', 400);
    const a = Number(match[1]);
    const b = Number(match[3]);
    const answer = match[2] === 'plus' ? a + b : a - b;
    if (a > 50 || b > 50 || answer < 0 || answer > 50 || (solution && Number(match[4]) !== answer)) {
        throw new SpeechError('Invalid number sentence.', 400);
    }
    return question
        ? `What is ${numberWord(a)} ${match[2]} ${numberWord(b)}?`
        : `${numberWord(a)} ${match[2]} ${numberWord(b)} equals ${numberWord(answer)}.${match[5] ?? ''}`;
}

export function speechWav(samples, sampleRate) {
    if (!(samples instanceof Float32Array) || samples.length === 0 || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 48000 || samples.length > sampleRate * 20) {
        throw new SpeechError('Voice returned invalid audio.');
    }
    let first = -1;
    let last = 0;
    let peak = 0;
    for (let index = 0; index < samples.length; index++) {
        const value = Math.abs(samples[index]);
        if (!Number.isFinite(value)) throw new SpeechError('Voice returned invalid audio.');
        peak = Math.max(peak, value);
        if (value > .003) {
            if (first === -1) first = index;
            last = index;
        }
    }
    if (first === -1) throw new SpeechError('Voice returned silent audio.');
    first = Math.max(0, first - Math.round(sampleRate * .03));
    last = Math.min(samples.length, last + Math.round(sampleRate * .12) + 1);
    const length = last - first;
    const wav = Buffer.alloc(44 + length * 2);
    wav.write('RIFF', 0);
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(sampleRate, 24);
    wav.writeUInt32LE(sampleRate * 2, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(length * 2, 40);
    const gain = Math.min(1.3, .85 / peak);
    const fade = Math.round(sampleRate * .005);
    for (let index = 0; index < length; index++) {
        const envelope = Math.min(1, index / fade, (length - 1 - index) / fade);
        const value = Math.max(-1, Math.min(1, samples[first + index] * gain * envelope));
        wav.writeInt16LE(Math.round(value * 32767), 44 + index * 2);
    }
    return wav;
}

async function localEngine({ voice, speed }) {
    try {
        await access(join(MODEL_DIRECTORY, 'onnx/model.onnx'));
    } catch {
        throw new SpeechError('Local voice is not installed. Run npm run setup:voice.');
    }
    const [{ KokoroTTS }, { env, StyleTextToSpeech2Model, AutoTokenizer }] = await Promise.all([
        import('kokoro-js'), import('@huggingface/transformers'),
    ]);
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.cacheDir = join(SPEECH_CACHE_DIRECTORY, '../models');
    const [model, tokenizer] = await Promise.all([
        StyleTextToSpeech2Model.from_pretrained(MODEL_DIRECTORY, {
            local_files_only: true, dtype: 'fp32', device: 'cpu',
            session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 },
        }),
        AutoTokenizer.from_pretrained(MODEL_DIRECTORY, { local_files_only: true }),
    ]);
    const tts = new KokoroTTS(model, tokenizer);
    if (!tts.voices[voice]) throw new SpeechError(`Unknown local voice: ${voice}`);
    return { generate: (text) => tts.generate(text, { voice, speed }) };
}

export class SpeechService {
    constructor({ cacheDirectory = SPEECH_CACHE_DIRECTORY, voice = process.env.TTS_VOICE || 'af_heart', speed = Number(process.env.TTS_SPEED || .9), engineFactory = localEngine, maxPending = 8, maxCacheFiles = 384 } = {}) {
        if (!Number.isFinite(speed) || speed < .5 || speed > 1.5) throw new Error('TTS_SPEED must be between 0.5 and 1.5.');
        Object.assign(this, { cacheDirectory, voice, speed, engineFactory, maxPending, maxCacheFiles });
        this.pending = new Map();
        this.queued = 0;
        this.queue = Promise.resolve();
        this.enginePromise = null;
    }

    initialize() {
        this.enginePromise ??= this.engineFactory({ voice: this.voice, speed: this.speed }).catch((error) => {
            this.enginePromise = null;
            throw error;
        });
        return this.enginePromise;
    }

    audioFor(text) {
        const spoken = mathSpeech(text);
        const key = createHash('sha256').update(JSON.stringify([MODEL_REVISION, this.voice, this.speed, 'pcm16-v1', spoken])).digest('hex');
        if (this.pending.has(key)) return this.pending.get(key);
        const task = this.loadAudio(spoken, key).finally(() => this.pending.delete(key));
        this.pending.set(key, task);
        return task;
    }

    async loadAudio(spoken, key) {
        const filename = join(this.cacheDirectory, `${key}.wav`);
        try {
            const cached = await readFile(filename);
            if (cached.length > 44 && cached.toString('ascii', 0, 4) === 'RIFF' && cached.readUInt32LE(4) === cached.length - 8) {
                const now = new Date();
                await utimes(filename, now, now).catch(() => { });
                return cached;
            }
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
        if (this.queued >= this.maxPending) throw new SpeechError('Voice is busy. Try again shortly.', 429);
        this.queued++;
        const task = this.queue.then(async () => {
            const engine = await this.initialize();
            const audio = await engine.generate(spoken);
            const wav = speechWav(audio.audio, audio.sampling_rate);
            await mkdir(this.cacheDirectory, { recursive: true });
            const temporary = `${filename}.${randomUUID()}.tmp`;
            try {
                await writeFile(temporary, wav, { flag: 'wx' });
                await rename(temporary, filename);
            } finally {
                await rm(temporary, { force: true });
            }
            await this.pruneCache();
            return wav;
        });
        // Failed requests must not block the next synthesis job.
        this.queue = task.catch(() => { });
        try {
            return await task;
        } finally {
            this.queued--;
        }
    }

    async pruneCache() {
        let names;
        try { names = await readdir(this.cacheDirectory); }
        catch (error) { if (error.code === 'ENOENT') return; throw error; }
        const files = names.filter(name => /^[a-f0-9]{64}\.wav$/.test(name));
        if (files.length <= this.maxCacheFiles) return;
        const dates = await Promise.all(files.map(async name => ({ name, modified: (await stat(join(this.cacheDirectory, name))).mtimeMs })));
        dates.sort((a, b) => b.modified - a.modified);
        await Promise.all(dates.slice(this.maxCacheFiles).map(file => rm(join(this.cacheDirectory, file.name), { force: true })));
    }

    setLimits({ maxCacheFiles, maxPendingSpeech }) {
        this.maxCacheFiles = maxCacheFiles;
        this.maxPending = maxPendingSpeech;
        // Serialize cache cleanup with synthesis; in-flight audio remains playable.
        const trim = this.queue.then(() => this.pruneCache());
        this.queue = trim.catch(() => {});
        return trim;
    }

    async cacheStats() {
        let names;
        try { names = await readdir(this.cacheDirectory); }
        catch (error) { if (error.code === 'ENOENT') return { cacheFiles: 0, cacheBytes: 0 }; throw error; }
        const entries = await Promise.all(names.filter(name => /^[a-f0-9]{64}\.wav$/.test(name)).map(async name => {
            try { return await stat(join(this.cacheDirectory, name)); }
            catch (error) { if (error.code === 'ENOENT') return null; throw error; }
        }));
        return { cacheFiles: entries.filter(Boolean).length, cacheBytes: entries.reduce((total, entry) => total + (entry?.size ?? 0), 0) };
    }
}
