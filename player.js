import { REWARDS } from './adventures.js';
import { AVATARS, DEFAULT_AVATAR } from './profiles.js';
import { AdminUI } from './admin.js';
import { AvatarEditor } from './avatar-editor.js';
import { TIER_IDS, treasureKey, collectionItems } from './treasures.js';

const $ = selector => document.querySelector(selector);
const PENDING_KEY = 'little-sums-pending-treasures-v1';
const catalogue = new Map(REWARDS.map(item => [item.id, item]));

// randomUUID is restricted to secure origins; LAN games may use plain HTTP.
export function treasureReceiptId(source = globalThis.crypto) {
    if (source.randomUUID) return source.randomUUID();
    const bytes = source.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class PlayerUI {
    constructor({ sprite, onOpen, onClose }) {
        this.sprite = sprite;
        this.onOpen = onOpen;
        this.onClose = onClose;
        this.player = null;
        this.guestTreasures = {};
        this.connected = false;
        this.authMode = 'register';
        this.revision = 0;
        this.editing = false;
        this.adminUI = new AdminUI({ getPlayer: () => this.player, onOpen, onClose });
        this.pending = [];
        try {
            const saved = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
            if (Array.isArray(saved)) this.pending = saved.filter(item => item && catalogue.has(item.rewardId)
                && TIER_IDS.has(item.tier ?? 'classic') && typeof item.playerId === 'string' && /^[a-f0-9-]{36}$/i.test(item.claimId));
        } catch { /* The server remains the source of saved collections. */ }
        $('#treasure-box-art').append(sprite('chest'));
        $('#player-button').addEventListener('click', () => this.open('player-dialog'));
        $('#treasure-box').addEventListener('click', () => this.openBox());
        $('#choose-register').addEventListener('click', () => this.setAuthMode('register'));
        $('#choose-login').addEventListener('click', () => this.setAuthMode('login'));
        $('#player-form').addEventListener('submit', event => { event.preventDefault(); this.submit(); });
        $('#player-logout').addEventListener('click', () => this.logout());
        $('#profile-edit').addEventListener('click', () => this.beginEdit());
        $('#profile-cancel').addEventListener('click', () => this.cancelEdit());
        $('#profile-edit-form').addEventListener('submit', event => { event.preventDefault(); this.saveProfile(); });
        $('#avatar-options').replaceChildren(...AVATARS.map(avatar => {
            const label = document.createElement('label');
            label.className = 'avatar-option';
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'avatar';
            radio.value = avatar.id;
            radio.setAttribute('aria-label', avatar.label);
            const artwork = document.createElement('span');
            artwork.className = 'avatar-art';
            artwork.append(sprite(avatar.id));
            const caption = document.createElement('span');
            caption.className = 'avatar-label';
            caption.textContent = avatar.label;
            label.append(radio, artwork, caption);
            return label;
        }));
        this.avatarEditor = new AvatarEditor({ onError: message => this.error(message),
            onLoading: loading => { $('#profile-save').disabled = loading || !!this.busy; } });
        $('#avatar-options').addEventListener('change', () => this.avatarEditor.clear());
        const today = new Date();
        $('#edit-player-birthday').max = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        $('#profile-open-box').addEventListener('click', () => { $('#player-dialog').close(); this.openBox(); });
        $('#treasure-create-profile').addEventListener('click', () => { $('#treasure-dialog').close(); this.open('player-dialog'); });
        $('#retry-treasures').addEventListener('click', () => this.sync());
        $('#retry-player').addEventListener('click', () => this.init());
        window.addEventListener('online', () => this.connected ? this.sync() : this.init());
        for (const id of ['player-dialog', 'treasure-dialog']) {
            const dialog = $(`#${id}`);
            dialog.querySelector('[data-close-dialog]').addEventListener('click', () => dialog.close());
            dialog.addEventListener('close', () => {
                if (id === 'player-dialog') this.cancelEdit();
                this.onClose();
            });
            dialog.addEventListener('click', event => {
                const bounds = dialog.getBoundingClientRect();
                if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
            });
        }
        this.render();
    }

    async request(path = '', body) {
        let response;
        try {
            response = await fetch(`/api/player${path}`, {
                method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
                headers: body ? { 'Content-Type': 'application/json' } : {},
                body: body ? JSON.stringify(body) : undefined,
                signal: AbortSignal.timeout(10_000),
            });
        } catch {
            throw new Error('Can’t reach the server. Please try again when you’re connected.');
        }
        let data;
        try { data = await response.json(); }
        catch { throw new Error('The player service is unavailable. Please try again.'); }
        if (!response.ok) throw Object.assign(new Error(data.error || 'Could not save your player. Please try again.'), { status: response.status, code: data.code });
        return data.player;
    }

    async init() {
        if (this.busy) return;
        this.setBusy(true);
        this.error('');
        try {
            this.player = await this.request();
            this.revision++;
            this.connected = true;
            $('#retry-player').hidden = true;
            this.render();
            await this.sync();
        } catch (error) {
            this.connected = false;
            this.error(error.message);
            $('#retry-player').hidden = false;
            this.render();
        } finally { this.setBusy(false); }
    }

    open(id) {
        this.onOpen();
        $(`#${id}`).showModal();
    }

    openBox() {
        this.render();
        this.open('treasure-dialog');
        if (this.player) this.refresh();
    }

    async refresh() {
        if (this.busy) return;
        await this.sync();
        if (this.ownPending().length) return;
        const revision = this.revision;
        try {
            const profile = await this.request();
            // An older refresh must not replace a prize saved while it was in flight.
            if (revision !== this.revision) return;
            this.player = profile;
            this.revision++;
            this.connected = true;
            this.render();
            await this.sync();
        } catch {
            this.saveError = 'Couldn’t refresh your box. Your saved treasures are safe; try again when connected.';
            this.render();
        }
    }

    setAuthMode(mode) {
        this.authMode = mode;
        for (const value of ['register', 'login']) {
            const button = $(`#choose-${value}`);
            button.classList.toggle('selected', value === mode);
            button.setAttribute('aria-pressed', String(value === mode));
        }
        $('#player-name-field').hidden = mode === 'login';
        $('#player-name').required = mode === 'register';
        $('#player-password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
        $('#player-submit').textContent = mode === 'login' ? 'Log in' : 'Create my profile';
        this.error('');
    }

    setBusy(busy) {
        this.busy = busy;
        $('#player-dialog').setAttribute('aria-busy', String(busy));
        document.querySelectorAll('#player-form input, #player-form button, #profile-edit-form input, #profile-edit-form button, .player-auth-tabs button, #player-logout, #profile-edit, #profile-open-box, #admin-open-settings, #retry-player').forEach(control => { control.disabled = busy; });
        $('#profile-save').disabled = busy || !!this.avatarEditor?.loading;
    }

    error(message) {
        $('#player-error').textContent = message;
        $('#player-error').hidden = !message;
    }

    beginEdit() {
        if (this.busy || !this.player) return;
        this.revision++;
        this.editing = true;
        this.error('');
        this.avatarEditor.reset(this.player.avatarPhoto || '');
        $('#profile-saved').hidden = true;
        $('#edit-player-name').value = this.player.name;
        $('#edit-player-username').value = this.player.username;
        $('#edit-player-birthday').value = this.player.birthday || '';
        const avatar = this.player.avatar || DEFAULT_AVATAR;
        document.querySelectorAll('#avatar-options input').forEach(radio => { radio.checked = radio.value === avatar; });
        this.render();
        $('#edit-player-name').focus();
    }

    cancelEdit() {
        this.editing = false;
        this.avatarEditor?.clear();
        $('#profile-saved').hidden = true;
        this.error('');
        this.render();
    }

    async saveProfile() {
        if (this.busy || this.avatarEditor.loading || !this.player) return;
        const input = { playerId: this.player.id, name: $('#edit-player-name').value,
            username: $('#edit-player-username').value, birthday: $('#edit-player-birthday').value,
            avatarPhoto: this.avatarEditor.value(), avatar: $('#avatar-options input:checked')?.value || DEFAULT_AVATAR };
        this.setBusy(true);
        this.revision++;
        this.error('');
        try {
            await this.sync();
            if (this.player?.id !== input.playerId) throw new Error('Your login changed. Log in again before editing your profile.');
            this.player = await this.request('/profile', input);
            this.revision++;
            this.editing = false;
            this.render();
            $('#profile-saved').hidden = false;
        } catch (error) {
            if (error.status === 401 || error.code === 'PLAYER_CHANGED') {
                this.player = null;
                this.editing = false;
                this.revision++;
                this.setAuthMode('login');
                this.render();
            }
            this.error(error.message);
        } finally { this.setBusy(false); }
    }

    async submit() {
        if (this.busy) return;
        this.setBusy(true);
        this.error('');
        try {
            this.player = await this.request(`/${this.authMode}`, {
                name: $('#player-name').value, username: $('#player-username').value, password: $('#player-password').value,
            });
            this.connected = true;
            this.saveError = '';
            this.revision++;
            $('#retry-player').hidden = true;
            $('#player-password').value = '';
            this.render();
            await this.sync();
        } catch (error) { this.error(error.message); }
        finally { this.setBusy(false); }
    }

    async logout() {
        if (this.busy) return;
        this.setBusy(true);
        this.error('');
        try {
            const playerId = this.player?.id;
            await this.sync();
            if (this.player?.id !== playerId) throw new Error('Your login changed. Log in again to save your waiting treasures.');
            if (this.ownPending().length) throw new Error('Save your waiting treasures before logging out. Choose “Retry saving” when connected.');
            await this.request('/logout', {});
            this.player = null;
            this.revision++;
            this.saveError = '';
            this.guestTreasures = {};
            this.render();
            $('#player-dialog').close();
        } catch (error) { this.error(error.message); }
        finally { this.setBusy(false); }
    }

    ownPending() {
        return this.pending.filter(item => item.playerId === this.player?.id);
    }

    rememberPending() {
        try { localStorage.setItem(PENDING_KEY, JSON.stringify(this.pending)); }
        catch { /* Keep retrying in memory if browser storage is unavailable. */ }
    }

    collect(item) {
        this.revision++;
        if (!this.player) {
            const key = treasureKey(item.id, item.tier);
            this.guestTreasures[key] = (this.guestTreasures[key] || 0) + 1;
        } else {
            this.pending.push({ playerId: this.player.id, rewardId: item.id, tier: item.tier ?? 'classic', claimId: treasureReceiptId() });
            this.rememberPending();
        }
        this.render();
        return this.sync();
    }

    sync() {
        if (this.saving) return this.saving;
        this.saving = this.savePending().finally(() => { this.saving = null; });
        return this.saving;
    }

    async savePending() {
        let claim;
        while ((claim = this.ownPending()[0])) {
            try {
                const profile = await this.request('/treasures', claim);
                this.pending = this.pending.filter(item => item.claimId !== claim.claimId);
                this.rememberPending();
                if (this.player?.id === profile.id) this.player = profile;
                this.revision++;
                this.saveError = '';
                this.render();
            } catch (error) {
                this.saveError = error.message;
                if (error.status === 401 || error.status === 409) {
                    this.player = null;
                    this.revision++;
                    this.setAuthMode('login');
                    this.error('Your login changed or expired. Log in to the original profile to save its waiting treasures.');
                }
                this.render();
                break;
            }
        }
    }

    avatarNode() {
        if (!this.player.avatarPhoto) return this.sprite(this.player.avatar || DEFAULT_AVATAR);
        const image = document.createElement('img');
        image.src = this.player.avatarPhoto;
        image.alt = '';
        return image;
    }

    render() {
        const counts = { ...(this.player?.treasures ?? this.guestTreasures) };
        const pending = this.ownPending();
        for (const claim of pending) {
            const key = treasureKey(claim.rewardId, claim.tier);
            counts[key] = (counts[key] || 0) + 1;
        }
        const items = collectionItems(counts);
        const total = items.reduce((sum, item) => sum + item.count, 0);
        const title = this.player ? `${this.player.name}’s treasure box` : 'Your treasure box';
        $('#player-label').textContent = this.player ? this.player.name : 'Create profile / Log in';
        $('.player-avatar').replaceChildren(this.player ? this.avatarNode() : document.createTextNode('☺'));
        $('#player-button').setAttribute('aria-label', this.player ? `Player profile: ${this.player.name}` : 'Create profile or log in');
        $('#player-auth').hidden = !!this.player;
        $('#player-details').hidden = !this.player;
        $('#admin-open-settings').hidden = this.player?.role !== 'admin';
        $('#player-title').textContent = this.editing ? 'Edit your profile' : this.player ? `Hello, ${this.player.name}!` : 'Welcome, little explorer.';
        $('#player-summary').textContent = this.player ? `You’re logged in as ${this.player.username}. Your treasures are saved with your profile.` : '';
        $('#profile-avatar').replaceChildren(...(this.player ? [this.avatarNode()] : []));
        $('#profile-avatar').hidden = this.editing;
        $('#player-summary').hidden = this.editing;
        $('#profile-birthday').hidden = this.editing;
        $('#profile-birthday').textContent = this.player?.birthday
            ? `Birthday: ${new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${this.player.birthday}T00:00:00Z`))}` : 'Birthday not set';
        $('#profile-actions').hidden = this.editing;
        $('#profile-edit-form').hidden = !this.editing;
        $('#treasure-owner').textContent = title;
        $('#treasure-title').textContent = title;
        $('#treasure-count').textContent = `${total} collected · Open the box`;
        $('#treasure-summary').textContent = `${total} ${total === 1 ? 'treasure' : 'treasures'} · ${new Set(items.map(item => item.id)).size} of ${REWARDS.length} kinds discovered`;
        $('#treasure-empty').hidden = total > 0;
        $('#treasure-create-profile').hidden = !!this.player;
        $('#treasure-save-status').textContent = !this.connected ? 'Couldn’t load your profile. Open the player menu to reconnect.'
            : !this.player ? 'Guest play · Create a profile to keep future treasures.'
                : pending.length ? `${pending.length} waiting to save. ${this.saveError || 'Saving your treasures…'}`
                    : this.saveError || 'All treasures saved. Ready for your next visit!';
        $('#retry-treasures').hidden = !pending.length || !this.saveError;
        $('#treasure-panel-empty').hidden = total > 0;
        const tiles = items.map(item => {
            const tile = document.createElement('div');
            tile.className = 'treasure-stack';
            tile.dataset.tier = item.tier;
            tile.dataset.key = item.key;
            tile.setAttribute('aria-label', `${item.label}: ${item.count}`);
            const count = document.createElement('span');
            count.className = 'treasure-stack-count';
            count.textContent = `×${item.count}`;
            const label = document.createElement('span');
            label.className = 'treasure-stack-label';
            label.textContent = item.label;
            tile.append(count, this.sprite(item.id, 'reward', item.tier), label);
            return tile;
        });
        $('#treasure-items').replaceChildren(...tiles);
        $('#treasure-panel-items').replaceChildren(...tiles.map(tile => tile.cloneNode(true)));
    }
}
