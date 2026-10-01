// The server synthesizes speech; this module only fetches and plays WAV audio.
export class SpeechPlayer {
    constructor({ getContext, onError = () => { }, onStart = () => { }, fetchAudio = (...args) => fetch(...args), maxCache = 64, requestTimeout = 20000, playbackGrace = 2000 }) {
        Object.assign(this, { getContext, onError, onStart, fetchAudio, maxCache, requestTimeout, playbackGrace });
        this.cache = new Map();
        this.active = null;
    }

    load(text) {
        if (this.cache.has(text)) {
            const cached = this.cache.get(text);
            this.cache.delete(text);
            this.cache.set(text, cached);
            return cached;
        }
        const pending = (async () => {
            const response = await this.fetchAudio(`/api/speech?text=${encodeURIComponent(text)}`, {
                signal: AbortSignal.timeout(this.requestTimeout), cache: 'no-store',
            });
            if (!response.ok) throw new Error(`Voice request failed (${response.status}).`);
            return response.arrayBuffer();
        })();
        this.cache.set(text, pending);
        while (this.cache.size > this.maxCache) this.cache.delete(this.cache.keys().next().value);
        pending.catch(() => {
            if (this.cache.get(text) === pending) this.cache.delete(text);
        });
        return pending;
    }

    prepare(texts) {
        for (const text of new Set(texts)) this.load(text).catch(() => { });
    }

    stop() {
        this.active?.finish();
    }

    play(text) {
        this.stop();
        let resolve;
        const finished = new Promise(done => { resolve = done; });
        const job = { source: null, gain: null, timer: null, finished: false };
        job.finish = () => {
            if (job.finished) return;
            job.finished = true;
            clearTimeout(job.timer);
            if (job.source) {
                job.source.onended = null;
                try { job.source.stop(); } catch { /* Already ended. */ }
                job.source.disconnect();
                job.gain.disconnect();
            }
            if (this.active === job) this.active = null;
            resolve();
        };
        this.active = job;
        const timedOut = () => {
            if (this.active !== job) return;
            this.onError(new Error('Voice playback timed out.'));
            job.finish();
        };
        job.timer = setTimeout(timedOut, this.requestTimeout);
        (async () => {
            const context = this.getContext();
            if (!context) throw new Error('Audio playback is unavailable.');
            const bytes = await this.load(text);
            if (this.active !== job) return;
            // Decoding may detach its input, so preserve the cached WAV bytes.
            const buffer = await context.decodeAudioData(bytes.slice(0));
            if (this.active !== job) return;
            if (context.state === 'suspended') await context.resume();
            if (this.active !== job) return;
            job.source = context.createBufferSource();
            job.gain = context.createGain();
            job.source.buffer = buffer;
            job.gain.gain.value = .9;
            job.source.connect(job.gain);
            job.gain.connect(context.destination);
            job.source.onended = job.finish;
            clearTimeout(job.timer);
            job.timer = setTimeout(timedOut, buffer.duration * 1000 + this.playbackGrace);
            job.source.start();
            this.onStart();
        })().catch(error => {
            if (this.active !== job) return;
            this.cache.delete(text);
            this.onError(error);
            job.finish();
        });
        return finished;
    }
}
