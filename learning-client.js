import { createLearningState, applyAttempt, validateAttempt } from './learning.js';

export const LEARNING_STORAGE_KEY = 'little-sums-learning-v1';
export class LearningClient {
    constructor({ storage, request = learningRequest, onChange = () => {}, onAuthError = () => {} } = {}) {
        Object.assign(this, { request, onChange, onAuthError });
        try { this.storage = storage === undefined ? globalThis.localStorage : storage; } catch { this.storage = null; }
        this.playerId = undefined;
        this.epoch = 0;
        this.pending = [];
        this.bases = {};
        this.guest = createLearningState();
        this.state = this.guest;
        this.ready = false;
        this.error = '';
        try {
            const saved = JSON.parse(this.storage?.getItem(LEARNING_STORAGE_KEY) || '{}');
            if (Array.isArray(saved.pending)) this.pending = saved.pending.filter(item => {
                try { validateAttempt(item); return typeof item.playerId === 'string'; } catch { return false; }
            });
            if (saved.bases && typeof saved.bases === 'object' && !Array.isArray(saved.bases)) {
                for (const [id, state] of Object.entries(saved.bases)) {
                    if (state?.version === 1 && Number.isInteger(state.revision) && state.features && state.totals && Array.isArray(state.recent)
                        && Object.keys(createLearningState().skills).every(key => Number.isFinite(state.skills?.[key]?.ability)
                            && Array.isArray(state.skills[key].recent) && Array.isArray(state.skills[key].timed))) this.bases[id] = state;
                }
            }
        } catch { /* Start clean if browser storage is unavailable or corrupt. */ }
    }
    persist() {
        try { this.storage?.setItem(LEARNING_STORAGE_KEY, JSON.stringify({ pending: this.pending, bases: this.bases })); }
        catch { this.error = 'Browser storage is unavailable. Keep this page open until your progress is saved.'; }
    }
    ownPending() { return this.pending.filter(item => item.playerId === this.playerId); }
    rebuild() {
        if (!this.playerId) this.state = this.guest;
        else {
            this.state = structuredClone(this.bases[this.playerId] ?? createLearningState());
            for (const attempt of this.ownPending()) {
                try { applyAttempt(this.state, attempt); }
                catch (error) {
                    // A very old question may no longer be in the public recent list.
                    // Keep its receipt queued; the server retains its compact question index.
                    if (error.status !== 409) throw error;
                }
            }
        }
        this.onChange();
    }
    async setPlayer(playerId) {
        const changed = this.playerId !== playerId;
        this.playerId = playerId;
        const epoch = ++this.epoch;
        if (changed && playerId === null) this.guest = createLearningState();
        this.ready = !playerId;
        this.error = '';
        this.rebuild();
        if (!playerId) return;
        try {
            const result = await this.request();
            if (this.epoch !== epoch) return;
            if (result.playerId !== playerId) throw Object.assign(new Error('Your player changed. Reconnect to save progress.'), { status: 409, code: 'PLAYER_CHANGED' });
            this.accept(result, []);
            this.ready = true;
            await this.sync();
        } catch (error) {
            if (this.epoch !== epoch) return;
            this.error = error.message;
            this.ready = !!this.bases[playerId];
            if (error.status === 401 || error.code === 'PLAYER_CHANGED') this.onAuthError(error);
            this.onChange();
        }
    }
    record(attempt) {
        // The owner is captured when the question is created, never after a network wait.
        if (attempt.playerId !== this.playerId) return false;
        const valid = { ...validateAttempt(attempt), playerId: attempt.playerId };
        if (!this.playerId) {
            applyAttempt(this.guest, valid);
            this.state = this.guest;
            this.onChange();
        } else {
            this.pending.push(valid);
            this.persist();
            this.rebuild();
            this.sync();
        }
        return true;
    }
    accept(result, acceptedIds) {
        if (result.playerId !== this.playerId) return;
        const accepted = new Set(acceptedIds);
        this.pending = this.pending.filter(item => item.playerId !== this.playerId || !accepted.has(item.id));
        if (!this.bases[this.playerId] || result.revision >= this.bases[this.playerId].revision) {
            this.bases[this.playerId] = result.learning;
        }
        this.error = '';
        this.ready = true;
        this.persist();
        this.rebuild();
    }
    sync() {
        if (!this.playerId) return Promise.resolve();
        if (this.saving?.epoch === this.epoch) return this.saving.promise;
        const epoch = this.epoch, playerId = this.playerId;
        const promise = (async () => {
            while (epoch === this.epoch && this.ownPending().length) {
                const batch = this.ownPending().slice(0, 10);
                try {
                    const result = await this.request({ playerId, attempts: batch.map(({ playerId: owner, ...attempt }) => attempt) });
                    if (epoch !== this.epoch) return;
                    if (result.playerId !== playerId || !Array.isArray(result.acceptedIds)
                        || !batch.every(item => result.acceptedIds.includes(item.id))) throw new Error('Progress was not confirmed. Please retry saving.');
                    this.accept(result, result.acceptedIds);
                } catch (error) {
                    if (epoch !== this.epoch) return;
                    this.error = error.message;
                    if (error.status === 401 || error.code === 'PLAYER_CHANGED') this.onAuthError(error);
                    this.onChange();
                    break;
                }
            }
        })().finally(() => { if (this.saving?.epoch === epoch) this.saving = null; });
        this.saving = { epoch, promise };
        return promise;
    }
}

async function learningRequest(body) {
    let response;
    try {
        response = await fetch('/api/player/learning', { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
            headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(10_000) });
    } catch { throw new Error('Couldn’t save learning progress. We’ll try again when connected.'); }
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || 'Couldn’t load learning progress.'), { status: response.status, code: data.code });
    return data;
}
