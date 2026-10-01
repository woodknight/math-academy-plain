import { DEFAULT_SERVER_SETTINGS } from './server-config.js';

const $ = selector => document.querySelector(selector);

export class AdminUI {
    constructor({ getPlayer, onOpen, onClose }) {
        this.getPlayer = getPlayer;
        this.onOpen = onOpen;
        this.generation = 0;
        $('#admin-open-settings').addEventListener('click', () => {
            if (this.getPlayer()?.role !== 'admin') return;
            $('#player-dialog').close();
            this.onOpen();
            $('#admin-dialog').showModal();
            this.load();
        });
        $('#admin-close').addEventListener('click', () => $('#admin-dialog').close());
        $('#admin-dialog').addEventListener('close', () => { this.generation++; onClose(); });
        $('#admin-form').addEventListener('submit', event => { event.preventDefault(); this.save(); });
        $('#admin-reload').addEventListener('click', () => this.load());
        $('#admin-defaults').addEventListener('click', () => {
            this.fill(DEFAULT_SERVER_SETTINGS);
            this.message('Defaults selected. Choose Save settings to apply them.');
        });
        this.setBusy(true);
    }

    async request(body) {
        let response;
        try {
            response = await fetch('/api/admin/settings', {
                method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
                headers: body ? { 'Content-Type': 'application/json' } : {},
                body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10_000),
            });
        } catch { throw new Error('Can’t reach the server. Your changes have not been confirmed. Try reloading settings when connected.'); }
        let data;
        try { data = await response.json(); } catch { throw new Error('Server settings are unavailable. Please try again.'); }
        if (!response.ok) throw Object.assign(new Error(data.error || 'Could not save settings.'), { status: response.status });
        return data;
    }

    setBusy(busy) {
        this.busy = busy;
        $('#admin-dialog').setAttribute('aria-busy', String(busy));
        document.querySelectorAll('#admin-form input, #admin-form button, #admin-reload').forEach(control => { control.disabled = busy; });
    }

    message(text, error = false) {
        const target = error ? $('#admin-error') : $('#admin-message');
        $('#admin-error').hidden = true;
        $('#admin-message').hidden = true;
        target.textContent = text;
        target.hidden = !text;
    }

    fill(settings) {
        $('#admin-cache-limit').value = settings.maxCacheFiles;
        $('#admin-queue-limit').value = settings.maxPendingSpeech;
        $('#admin-speech-enabled').checked = settings.speechEnabled;
        $('#admin-registration-enabled').checked = settings.registrationEnabled;
    }

    renderStatus(status, updatedAt) {
        const rows = status ? [
            ['Cached audio', `${status.cacheFiles} files · ${(status.cacheBytes / 1024 / 1024).toFixed(1)} MB`],
            ['Speech requests', `${status.queuedSpeech} queued or active`],
            ['Player accounts', String(status.players)],
            ['Uptime', `${Math.floor(status.uptimeSeconds / 60)} minutes`],
            ['Cache cleanup', status.cleanupError || (status.cleanupPending ? 'Waiting for active speech to finish' : 'Up to date')],
        ] : [];
        rows.push(['Settings saved', updatedAt ? new Date(updatedAt).toLocaleString() : 'Using defaults']);
        $('#admin-status-values').replaceChildren(...rows.flatMap(([label, value]) => {
            const term = document.createElement('dt');
            term.textContent = label;
            const detail = document.createElement('dd');
            detail.textContent = value;
            return [term, detail];
        }));
    }

    async load() {
        const generation = ++this.generation;
        this.setBusy(true);
        this.ready = false;
        this.message('');
        try {
            const data = await this.request();
            if (generation !== this.generation) return;
            this.revision = data.revision;
            this.fill(data.settings);
            this.renderStatus(data.status, data.updatedAt);
            this.ready = true;
            this.setBusy(false);
        } catch (error) {
            if (generation !== this.generation) return;
            this.message(error.message, true);
            // Keep the form disabled until current settings can be loaded.
            $('#admin-reload').disabled = false;
        }
    }

    async save() {
        if (this.busy || !this.ready) return;
        const generation = this.generation;
        const player = this.getPlayer();
        if (player?.role !== 'admin') { this.message('Log in as an admin before changing settings.', true); return; }
        const input = { playerId: player.id, revision: this.revision, settings: {
            maxCacheFiles: Number($('#admin-cache-limit').value), maxPendingSpeech: Number($('#admin-queue-limit').value),
            speechEnabled: $('#admin-speech-enabled').checked, registrationEnabled: $('#admin-registration-enabled').checked,
        } };
        this.setBusy(true);
        this.message('');
        try {
            const data = await this.request(input);
            if (generation !== this.generation) return;
            this.revision = data.revision;
            this.fill(data.settings);
            this.renderStatus(null, data.updatedAt);
            try {
                const current = await this.request();
                if (generation !== this.generation) return;
                this.renderStatus(current.status, current.updatedAt);
                this.message(current.status.cleanupPending ? 'Settings saved. Audio cache cleanup will finish after pending speech.' : 'Settings saved!');
            } catch {
                if (generation === this.generation) this.message('Settings saved. Reload to refresh server status.');
            }
        } catch (error) {
            if (generation !== this.generation) return;
            this.message(error.message, true);
            if ([401, 403, 409].includes(error.status)) this.ready = false;
        } finally {
            if (generation === this.generation) {
                this.setBusy(false);
                if (!this.ready) document.querySelectorAll('#admin-form input, #admin-form button').forEach(control => { control.disabled = true; });
            }
        }
    }
}
