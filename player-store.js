import { randomBytes, randomUUID, scrypt as deriveKey, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { REWARDS } from './adventures.js';
import { AVATARS, DEFAULT_AVATAR } from './profiles.js';
import { DEFAULT_SERVER_SETTINGS, validateServerSettings } from './server-config.js';
import { normalizeAvatarPhoto } from './avatar-service.js';
import { TIER_IDS, treasureKey } from './treasures.js';
import { createLearningState, applyAttempt, validateAttempt } from './learning.js';

const scrypt = promisify(deriveKey);
export const SESSION_SECONDS = 30 * 24 * 60 * 60;
const digest = value => createHash('sha256').update(value).digest('hex');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const usernames = /^[a-z0-9_-]{3,24}$/;
const rewardIds = new Set(REWARDS.map(item => item.id));
const avatarIds = new Set(AVATARS.map(item => item.id));

function profileDetails(input, previous = {}) {
    const fields = { name: previous.name, username: previous.username, avatar: previous.avatar ?? DEFAULT_AVATAR, avatarPhoto: previous.avatarPhoto ?? '', birthday: previous.birthday ?? '' };
    for (const field of Object.keys(fields)) if (Object.hasOwn(input, field)) fields[field] = input[field];
    if (typeof fields.name !== 'string' || !fields.name.trim() || fields.name.trim().length > 40) fail(400, 'Choose a player name with 1–40 characters.');
    fields.name = fields.name.trim();
    fields.username = typeof fields.username === 'string' ? fields.username.trim().toLowerCase() : '';
    if (!usernames.test(fields.username)) fail(400, 'Use 3–24 letters, numbers, underscores or hyphens for your username.');
    if (!avatarIds.has(fields.avatar)) fail(400, 'Choose an avatar from the list.');
    if (typeof fields.birthday !== 'string') fail(400, 'Choose a valid birthday or leave it blank.');
    if (fields.birthday !== '') {
        const date = new Date(`${fields.birthday}T00:00:00Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.birthday) || !Number.isFinite(date.getTime())
            || date.toISOString().slice(0, 10) !== fields.birthday || fields.birthday < '0001-01-01'
            || fields.birthday > new Date().toISOString().slice(0, 10)) {
            fail(400, 'Choose a real birthday that is not in the future.');
        }
    }
    return fields;
}

export class PlayerStore {
    constructor(directory) {
        this.directory = directory;
        this.path = join(directory, 'players.json');
        this.queue = Promise.resolve();
    }

    async init() {
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        try {
            this.state = JSON.parse(await readFile(this.path, 'utf8'));
            if (this.state.version !== 1 || !Array.isArray(this.state.players) || !Array.isArray(this.state.sessions)) {
                throw new Error('Unsupported player data format');
            }
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            this.state = { version: 1, players: [], sessions: [] };
            await this.mutate(() => {});
        }
    }

    // Commit a complete snapshot atomically; failed writes never update live state.
    mutate(change) {
        const operation = this.queue.then(async () => {
            const next = structuredClone(this.state);
            const result = change(next);
            next.sessions = next.sessions.filter(session => session.expiresAt > Date.now());
            const temporary = `${this.path}.${randomUUID()}.tmp`;
            try {
                await writeFile(temporary, JSON.stringify(next), { mode: 0o600, flush: true });
                await rename(temporary, this.path);
            } finally {
                await rm(temporary, { force: true });
            }
            this.state = next;
            return result;
        });
        this.queue = operation.catch(() => {});
        return operation;
    }

    profile(player) {
        return { id: player.id, username: player.username, name: player.name, avatar: player.avatar ?? DEFAULT_AVATAR,
            avatarPhoto: player.avatarPhoto ?? '', birthday: player.birthday ?? '', role: player.role === 'admin' ? 'admin' : 'player', treasures: { ...player.treasures } };
    }

    authenticate(token) {
        if (!token) return null;
        const session = this.state.sessions.find(item => item.hash === digest(token) && item.expiresAt > Date.now());
        return session ? this.state.players.find(player => player.id === session.playerId) ?? null : null;
    }

    requireAdmin(token) {
        const player = this.authenticate(token);
        if (!player) fail(401, 'Log in as an admin to manage server settings.');
        if (player.role !== 'admin') fail(403, 'Only an admin can manage server settings.');
        return player;
    }

    settings() {
        return { settings: { ...DEFAULT_SERVER_SETTINGS, ...this.state.serverSettings },
            revision: this.state.settingsRevision ?? 0, updatedAt: this.state.settingsUpdatedAt ?? null };
    }

    updateSettings(token, input) {
        return this.mutate(state => {
            const admin = this.requireAdmin(token);
            if (input.playerId !== admin.id) throw Object.assign(new Error('Your player changed. Log in again before changing settings.'), { status: 409, code: 'PLAYER_CHANGED' });
            if (!Number.isInteger(input.revision) || input.revision !== (state.settingsRevision ?? 0)) fail(409, 'Settings changed since you opened them. Reload settings and try again.');
            state.serverSettings = validateServerSettings(input.settings);
            state.settingsRevision = (state.settingsRevision ?? 0) + 1;
            state.settingsUpdatedAt = new Date().toISOString();
            state.settingsUpdatedBy = admin.id;
            return { settings: { ...state.serverSettings }, revision: state.settingsRevision, updatedAt: state.settingsUpdatedAt };
        });
    }

    async bootstrapAdmin() {
        if (this.state.players.some(player => player.role === 'admin')) return null;
        let username = 'admin';
        for (let suffix = 2; this.state.players.some(player => player.username === username); suffix++) username = `admin_${suffix}`;
        let password = randomBytes(24).toString('base64url');
        const credentialsPath = join(this.directory, 'admin-account.txt');
        let createdCredentials = false;
        try {
            // Recover interrupted setup using the existing private credentials.
            const saved = await readFile(credentialsPath, 'utf8');
            const savedUsername = saved.match(/^Username: ([a-z0-9_-]{3,24})$/m)?.[1];
            const savedPassword = saved.match(/^Password: ([A-Za-z0-9_-]{32})$/m)?.[1];
            if (!savedUsername || !savedPassword || this.state.players.some(player => player.username === savedUsername)) {
                throw new Error('Existing admin credentials cannot be restored safely. Keep the file and resolve the account conflict before starting.');
            }
            username = savedUsername;
            password = savedPassword;
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            await writeFile(credentialsPath, `Little Sums administrator\nUsername: ${username}\nPassword: ${password}\n\nLog in through the player menu, then open Server settings.\nKeep this file private.\n`, { mode: 0o600, flag: 'wx', flush: true });
            createdCredentials = true;
        }
        const salt = randomBytes(16).toString('hex');
        const passwordHash = (await scrypt(password, salt, 64)).toString('hex');
        try {
            await this.mutate(state => {
                if (state.players.some(player => player.role === 'admin' || player.username === username)) fail(409, 'Admin setup changed. Restart setup.');
                state.players.push({ id: randomUUID(), username, name: 'Server admin', avatar: 'robot', birthday: '', role: 'admin', salt, passwordHash,
                    treasures: {}, claims: {}, createdAt: new Date().toISOString() });
            });
        } catch (error) {
            if (createdCredentials) await rm(credentialsPath, { force: true });
            throw error;
        }
        return { username, credentialsPath };
    }

    credentials(input) {
        const username = typeof input.username === 'string' ? input.username.trim().toLowerCase() : '';
        if (!usernames.test(username)) fail(400, 'Use 3–24 letters, numbers, underscores or hyphens for your username.');
        if (typeof input.password !== 'string' || input.password.length < 8 || input.password.length > 128) {
            fail(400, 'Use a password with 8–128 characters.');
        }
        return { username, password: input.password };
    }

    newSession(state, playerId, oldToken) {
        const token = randomBytes(32).toString('hex');
        if (oldToken) state.sessions = state.sessions.filter(session => session.hash !== digest(oldToken));
        state.sessions.push({ hash: digest(token), playerId, expiresAt: Date.now() + SESSION_SECONDS * 1000 });
        return token;
    }

    async register(input, oldToken) {
        const { username, password } = this.credentials(input);
        const details = profileDetails({ ...input, avatarPhoto: await normalizeAvatarPhoto(input.avatarPhoto ?? '') });
        const salt = randomBytes(16).toString('hex');
        const passwordHash = (await scrypt(password, salt, 64)).toString('hex');
        return this.mutate(state => {
            if (state.serverSettings?.registrationEnabled === false) fail(403, 'New profiles are temporarily disabled. You can still log in or play as a guest.');
            if (state.players.some(player => player.username === username)) fail(409, 'That username is taken. Try another one.');
            const player = { id: randomUUID(), ...details, role: 'player', salt, passwordHash, treasures: {}, claims: {}, createdAt: new Date().toISOString() };
            state.players.push(player);
            return { player: this.profile(player), token: this.newSession(state, player.id, oldToken) };
        });
    }

    async login(input, oldToken) {
        const { username, password } = this.credentials(input);
        const player = this.state.players.find(item => item.username === username);
        const candidate = await scrypt(password, player?.salt ?? 'missing-player-salt', 64);
        const expected = player ? Buffer.from(player.passwordHash, 'hex') : Buffer.alloc(64);
        if (!player || expected.length !== candidate.length || !timingSafeEqual(candidate, expected)) fail(401, 'Username or password is incorrect.');
        return this.mutate(state => ({
            player: this.profile(state.players.find(item => item.id === player.id)),
            token: this.newSession(state, player.id, oldToken),
        }));
    }

    logout(token) {
        return this.mutate(state => { state.sessions = state.sessions.filter(session => session.hash !== digest(token || '')); });
    }

    async updateProfile(token, input) {
        const current = this.authenticate(token);
        if (!current) fail(401, 'Log in to edit your profile.');
        if (input.playerId !== current.id) throw Object.assign(new Error('Your player changed. Log in again before editing this profile.'), { status: 409, code: 'PLAYER_CHANGED' });
        if (Object.hasOwn(input, 'avatarPhoto')) input = { ...input, avatarPhoto: await normalizeAvatarPhoto(input.avatarPhoto) };
        return this.mutate(state => {
            const session = state.sessions.find(item => item.hash === digest(token || '') && item.expiresAt > Date.now());
            const player = session && state.players.find(item => item.id === session.playerId);
            if (!player) fail(401, 'Log in to edit your profile.');
            if (input.playerId !== player.id) throw Object.assign(new Error('Your player changed. Log in again before editing this profile.'), { status: 409, code: 'PLAYER_CHANGED' });
            const details = profileDetails(input, player);
            if (state.players.some(item => item.id !== player.id && item.username === details.username)) fail(409, 'That username is taken. Try another one.');
            Object.assign(player, details);
            return this.profile(player);
        });
    }

    async collect(token, input) {
        const tier = input.tier ?? 'classic';
        const key = treasureKey(input.rewardId, tier);
        if (!rewardIds.has(input.rewardId) || typeof input.claimId !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.claimId)) {
            fail(400, 'Invalid treasure.');
        }
        if (!TIER_IDS.has(tier)) fail(400, 'Invalid treasure upgrade.');
        return this.mutate(state => {
            const session = state.sessions.find(item => item.hash === digest(token || '') && item.expiresAt > Date.now());
            const player = session && state.players.find(item => item.id === session.playerId);
            if (!player) fail(401, 'Log in to save your treasures.');
            if (input.playerId !== player.id) fail(409, 'Your player changed. Log in to the original player to save this treasure.');
            if (Object.hasOwn(player.claims, input.claimId)) {
                if (player.claims[input.claimId] !== key) fail(409, 'This treasure has already been saved.');
            } else {
                player.claims[input.claimId] = key;
                player.treasures[key] = (player.treasures[key] || 0) + 1;
            }
            return this.profile(player);
        });
    }

    learning(token) {
        const player = this.authenticate(token);
        if (!player) fail(401, 'Log in to see your learning progress.');
        const learning = structuredClone(player.learning?.state ?? createLearningState());
        return { playerId: player.id, learning, revision: learning.revision };
    }

    async saveLearning(token, input) {
        if (!Array.isArray(input.attempts) || !input.attempts.length || input.attempts.length > 10) fail(400, 'Send 1–10 learning attempts.');
        const attempts = input.attempts.map(validateAttempt);
        return this.mutate(state => {
            const session = state.sessions.find(item => item.hash === digest(token || '') && item.expiresAt > Date.now());
            const player = session && state.players.find(item => item.id === session.playerId);
            if (!player) fail(401, 'Log in to save learning progress.');
            if (input.playerId !== player.id) throw Object.assign(new Error('Your player changed. Log in to the original player to save progress.'), { status: 409, code: 'PLAYER_CHANGED' });
            const learning = player.learning ??= { state: createLearningState(), receipts: {}, questions: {} };
            for (const attempt of attempts) {
                const fingerprint = digest(JSON.stringify(attempt));
                if (Object.hasOwn(learning.receipts, attempt.id)) {
                    if (learning.receipts[attempt.id] !== fingerprint) fail(409, 'This learning receipt has already been saved with different answers.');
                    continue;
                }
                const question = applyAttempt(learning.state, attempt, learning.questions[attempt.questionId]);
                const { attempts: detail, ...compact } = question;
                learning.questions[attempt.questionId] = compact;
                learning.receipts[attempt.id] = fingerprint;
            }
            return { playerId: player.id, learning: structuredClone(learning.state), revision: learning.state.revision,
                acceptedIds: attempts.map(attempt => attempt.id) };
        });
    }
}
