import { normalizeGameSettings, validateGameSettings } from './game-settings.js';

export const SETTINGS_STORAGE_KEY = 'little-sums-game-settings-v1';

export class SettingsClient {
    constructor({ storage, request = settingsRequest, onChange = () => {}, onAuthError = () => {} } = {}) {
        Object.assign(this, { request, onChange, onAuthError });
        try { this.storage = storage === undefined ? globalThis.localStorage : storage; } catch { this.storage = null; }
        this.guest = normalizeGameSettings();
        this.bases = Object.create(null);
        this.pending = Object.create(null);
        this.playerId = null;
        this.epoch = 0;
        this.error = '';
        this.storageError = '';
        try {
            const saved = JSON.parse(this.storage?.getItem(SETTINGS_STORAGE_KEY) || '{}');
            this.guest = normalizeGameSettings(saved.guest);
            for (const [id, settings] of Object.entries(saved.bases || {})) this.bases[id] = normalizeGameSettings(settings);
            for (const [id, patch] of Object.entries(saved.pending || {})) {
                try { this.pending[id] = validateGameSettings(patch); } catch { /* Ignore corrupt entries. */ }
            }
        } catch { /* Storage may be unavailable or contain invalid JSON. */ }
        this.settings = { ...this.guest };
    }

    persist() {
        try {
            if (!this.storage) throw new Error();
            this.storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ guest: this.guest, bases: this.bases, pending: this.pending }));
            this.storageError = '';
        } catch { this.storageError = 'Browser storage is unavailable. Keep this page open until your settings are saved.'; }
    }

    setPlayer(player) {
        this.playerId = player?.id ?? null;
        this.epoch++;
        this.error = '';
        if (player) this.bases[player.id] = normalizeGameSettings(player.preferences);
        this.settings = player
            ? { ...this.bases[player.id], ...this.pending[player.id] }
            : { ...this.guest };
        this.persist();
        this.onChange();
        return this.sync();
    }

    update(input) {
        const patch = validateGameSettings(input);
        Object.assign(this.settings, patch);
        if (this.playerId) this.pending[this.playerId] = { ...this.pending[this.playerId], ...patch };
        else this.guest = { ...this.settings };
        // Save locally before starting I/O, so closing the page keeps the retry.
        this.persist();
        this.onChange();
        return this.sync();
    }

    hasPending() { return !!this.playerId && !!Object.keys(this.pending[this.playerId] || {}).length; }

    sync() {
        if (!this.hasPending()) return Promise.resolve();
        if (this.saving?.epoch === this.epoch) return this.saving.promise;
        const epoch = this.epoch, playerId = this.playerId;
        const promise = (async () => {
            while (epoch === this.epoch && this.hasPending()) {
                const patch = { ...this.pending[playerId] };
                try {
                    const result = await this.request({ playerId, preferences: patch });
                    if (epoch !== this.epoch) return;
                    if (result.playerId !== playerId) throw Object.assign(new Error('Your player changed. Log in again to save settings.'), { code: 'PLAYER_CHANGED' });
                    validateGameSettings(result.preferences);
                    if (!Object.entries(patch).every(([key, value]) => result.preferences[key] === value)) {
                        throw new Error('Game settings were not confirmed. Please retry saving.');
                    }
                    this.bases[playerId] = normalizeGameSettings(result.preferences);
                    for (const [key, value] of Object.entries(patch)) {
                        if (this.pending[playerId][key] === value) delete this.pending[playerId][key];
                    }
                    if (!Object.keys(this.pending[playerId]).length) delete this.pending[playerId];
                    this.error = '';
                    this.persist();
                    this.onChange();
                } catch (error) {
                    if (epoch !== this.epoch) return;
                    this.error = error.message;
                    this.onChange();
                    if (error.status === 401 || error.code === 'PLAYER_CHANGED') this.onAuthError(error);
                    return;
                }
            }
        })().finally(() => { if (this.saving?.epoch === epoch) this.saving = null; });
        this.saving = { epoch, promise };
        return promise;
    }
}

async function settingsRequest(body) {
    let response;
    try {
        response = await fetch('/api/player/preferences', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
            signal: AbortSignal.timeout(10_000), keepalive: true });
    } catch { throw new Error('Couldn’t save game settings. We’ll retry when you’re connected.'); }
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || 'Couldn’t save game settings.'), { status: response.status, code: data.code });
    return data;
}
