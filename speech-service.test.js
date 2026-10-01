import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mathSpeech, SpeechService, speechWav } from './speech-service.js';

const tone = () => ({ audio: Float32Array.from({ length: 2400 }, (_, i) => Math.sin(i * .08) * .6), sampling_rate: 24000 });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function cacheFor(t) {
    const directory = await mkdtemp(join(tmpdir(), 'little-sums-voice-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    return directory;
}

test('voice reads number words for every supported question and correct solution', () => {
    assert.equal(mathSpeech('What is 3 plus 2?'), 'What is three plus two?');
    assert.equal(mathSpeech('50 minus 24 equals 26.'), 'fifty minus twenty four equals twenty six.');
    assert.equal(mathSpeech('0 plus 0 equals 0. Well done!'), 'zero plus zero equals zero. Well done!');
    for (let a=0;a<=50;a++) for (let b=0;b<=50;b++) for (const operation of ['plus','minus']) {
        const result = operation === 'plus' ? a+b : a-b;
        if (result < 0 || result > 50) continue;
        assert.ok(!/\d/.test(mathSpeech(`What is ${a} ${operation} ${b}?`)));
        assert.ok(!/\d/.test(mathSpeech(`${a} ${operation} ${b} equals ${result}.`)));
    }
});

test('arbitrary text, out-of-range questions, negative results, and incorrect solutions are rejected', () => {
    for (const text of [null, '', 'Hello there', 'What is 99 plus 1?', 'What is 50 plus 1?', 'What is 1 minus 2?', '3 plus 2 equals 6.', '3 plus 2 equals 5. Extra words.', 'x'.repeat(101)]) {
        assert.throws(() => mathSpeech(text), { status: 400 });
    }
});

test('audio is standard mono PCM WAV, trimmed and below clipping level', () => {
    const samples = new Float32Array(24000);
    samples.set(tone().audio, 12000);
    const wav = speechWav(samples, 24000);
    assert.equal(wav.toString('ascii',0,4), 'RIFF');
    assert.equal(wav.toString('ascii',8,16), 'WAVEfmt ');
    assert.equal(wav.readUInt16LE(20), 1);
    assert.equal(wav.readUInt16LE(22), 1);
    assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.readUInt32LE(24), 24000);
    assert.equal(wav.readUInt32LE(4)+8, wav.length);
    assert.equal(wav.readUInt32LE(40)+44, wav.length);
    assert.ok(wav.length < 24000, 'long lead-in and trailing silence are removed');
    for (let i=44;i<wav.length;i+=2) assert.ok(Math.abs(wav.readInt16LE(i)) <= 27853);
    for (const bad of [new Float32Array(), new Float32Array(10), Float32Array.of(NaN), Float32Array.of(Infinity)]) assert.throws(() => speechWav(bad,24000));
});

test('requests share synthesis, serialize model use, and reuse audio across server restarts', async t => {
    const cacheDirectory = await cacheFor(t);
    let calls = 0;
    let active = 0;
    let peak = 0;
    const service = new SpeechService({ cacheDirectory, engineFactory: async () => ({ generate: async text => {
        assert.ok(!/\d/.test(text));
        calls++; peak=Math.max(peak, ++active);
        await pause(5); active--;
        return tone();
    } }) });
    const [first, repeat, second] = await Promise.all([service.audioFor('What is 3 plus 2?'), service.audioFor('What is 3 plus 2?'), service.audioFor('3 plus 2 equals 5.')]);
    assert.equal(calls, 2);
    assert.equal(peak, 1);
    assert.deepEqual(first, repeat);
    assert.ok(second.length > 44);
    const restarted = new SpeechService({ cacheDirectory, engineFactory: async () => { throw new Error('Cache must avoid synthesis'); } });
    assert.deepEqual(await restarted.audioFor('What is 3 plus 2?'), first);
});

test('a failed synthesis does not stop subsequent requests', async t => {
    let calls = 0;
    const service = new SpeechService({ cacheDirectory: await cacheFor(t), engineFactory: async () => ({ generate: async () => {
        if (++calls === 1) throw new Error('temporary synthesis failure');
        return tone();
    } }) });
    const outcomes = await Promise.allSettled([service.audioFor('What is 1 plus 1?'), service.audioFor('What is 2 plus 2?')]);
    assert.equal(outcomes[0].status, 'rejected');
    assert.equal(outcomes[1].status, 'fulfilled');
    assert.equal(service.queued, 0);
});

test('a full synthesis queue rejects extra work while allowing the active request to finish', async t => {
    let release;
    let entered;
    const begun = new Promise(resolve => { entered=resolve; });
    const held = new Promise(resolve => { release=resolve; });
    const service = new SpeechService({ cacheDirectory: await cacheFor(t), maxPending: 1, engineFactory: async () => ({ generate: async () => {
        entered(); await held; return tone();
    } }) });
    const first = service.audioFor('What is 1 plus 1?');
    await begun;
    await assert.rejects(service.audioFor('What is 2 plus 2?'), { status: 429 });
    release();
    assert.ok((await first).length > 44);
});

test('corrupted cached audio is regenerated and the disk cache stays bounded', async t => {
    const cacheDirectory = await cacheFor(t);
    let calls=0;
    const service = new SpeechService({ cacheDirectory, maxCacheFiles: 2, engineFactory: async () => ({ generate: async () => { calls++; await pause(5); return tone(); } }) });
    await service.audioFor('What is 1 plus 1?');
    await writeFile(join(cacheDirectory,(await readdir(cacheDirectory))[0]), Buffer.from('broken WAV'));
    await service.audioFor('What is 1 plus 1?');
    assert.equal(calls,2);
    await service.audioFor('What is 2 plus 2?');
    await service.audioFor('What is 3 plus 3?');
    assert.equal((await readdir(cacheDirectory)).length,2);
});

test('different voices and rates use different cache entries', async t => {
    const cacheDirectory = await cacheFor(t);
    const configurations=[];
    const factory = async options => { configurations.push(options); return { generate: async () => tone() }; };
    for (const [voice,speed] of [['af_heart',.9],['af_bella',.9],['af_heart',1]]) {
        await new SpeechService({ cacheDirectory, voice, speed, engineFactory: factory }).audioFor('What is 3 plus 2?');
    }
    assert.equal(configurations.length,3);
});
