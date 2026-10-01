import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeechPlayer } from './speech.js';
const flush = () => new Promise(resolve => setImmediate(resolve));
const bytes = () => new Uint8Array([1,2,3,4]).buffer;
const response = () => ({ ok: true, arrayBuffer: async () => bytes() });
function context(duration=1) {
    const sources=[];
    const ctx = {
        state:'running', destination:{}, sources,
        async decodeAudioData(data) { assert.ok(data instanceof ArrayBuffer); return { duration }; },
        async resume() { ctx.state='running'; },
        createGain() { return { gain:{ value:1 }, connect() {}, disconnect() {} }; },
        createBufferSource() {
            const source={ buffer:null, onended:null, starts:0, stops:0, connect() {}, disconnect() {}, start() { this.starts++; }, stop() { this.stops++; } };
            sources.push(source); return source;
        },
    };
    return ctx;
}

test('prefetched audio is reused and playback resolves on the actual end event', async () => {
    const ctx=context();
    let requests=0;
    const player=new SpeechPlayer({ getContext:()=>ctx, fetchAudio:async url=>{ requests++; assert.match(url,/^\/api\/speech\?text=/); return response(); } });
    player.prepare(['What is 3 plus 2?','What is 3 plus 2?']);
    await flush();
    let ended=false;
    const playing=player.play('What is 3 plus 2?').then(()=>{ ended=true; });
    await flush();
    assert.equal(requests,1);
    assert.equal(ctx.sources[0].starts,1);
    assert.equal(ended,false);
    ctx.sources[0].onended();
    await playing;
    assert.equal(ended,true);
    assert.equal(player.active,null);
});

test('stopping or replacing speech prevents delayed fetches from starting obsolete audio', async () => {
    const ctx=context();
    let release;
    const delayed=new Promise(resolve=>{ release=resolve; });
    const player=new SpeechPlayer({ getContext:()=>ctx, fetchAudio:async url=>url.includes('old') ? delayed : response() });
    const old=player.play('old');
    const current=player.play('new');
    await old;
    await flush();
    assert.equal(ctx.sources.length,1);
    release(response());
    await flush();
    assert.equal(ctx.sources.length,1);
    player.stop();
    await current;
    assert.equal(ctx.sources[0].stops,1);
});

test('decode failures unlock playback and retry with a fresh request', async () => {
    const ctx=context();
    let decodes=0;
    let requests=0;
    const notices=[];
    ctx.decodeAudioData=async()=>{ if(++decodes===1)throw new Error('bad audio'); return { duration:1 }; };
    const player=new SpeechPlayer({ getContext:()=>ctx, onError:e=>notices.push(e), fetchAudio:async()=>{ requests++; return response(); } });
    await player.play('same question');
    assert.equal(notices.length,1);
    const retry=player.play('same question');
    await flush();
    assert.equal(requests,2);
    ctx.sources[0].onended();
    await retry;
});

test('HTTP failures do not hang playback and can be retried', async () => {
    const notices=[];
    let requests=0;
    const player=new SpeechPlayer({ getContext:()=>context(), onError:e=>notices.push(e), fetchAudio:async()=>({ ok:false,status:++requests===1 ? 503 : 429 }) });
    await player.play('retry');
    await player.play('retry');
    assert.equal(requests,2);
    assert.equal(notices.length,2);
});

test('missing playback completion has a bounded timeout', async () => {
    const ctx=context(.005);
    const notices=[];
    const player=new SpeechPlayer({ getContext:()=>ctx, onError:e=>notices.push(e), playbackGrace:10, fetchAudio:async()=>response() });
    await player.play('timeout');
    assert.equal(notices.length,1);
    assert.equal(player.active,null);
    assert.equal(ctx.sources[0].stops,1);
});

test('audio caching is bounded and suspended contexts resume before playing', async () => {
    const ctx=context();
    ctx.state='suspended';
    let requests=0;
    const player=new SpeechPlayer({ getContext:()=>ctx, maxCache:2, fetchAudio:async()=>{ requests++; return response(); } });
    await player.load('one'); await player.load('two'); await player.load('three'); await player.load('one');
    assert.equal(requests,4);
    assert.equal(player.cache.size,2);
    const playing=player.play('one');
    await flush();
    assert.equal(ctx.state,'running');
    ctx.sources[0].onended();
    await playing;
});
