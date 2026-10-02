export const DEFAULT_GAME_SETTINGS = Object.freeze({
    mode: 'addition', difficulty: 'adaptive', display: 'dots', soundEnabled: true,
});

const choices = {
    mode: ['addition', 'subtraction', 'mixed'],
    difficulty: ['adaptive', 'easy', 'medium', 'hard'],
    display: ['dots', 'numbers'],
};
const valid = (key, value) => key === 'soundEnabled' ? typeof value === 'boolean' : choices[key]?.includes(value);

// Tolerate missing/old browser data and profiles created before settings existed.
export function normalizeGameSettings(input) {
    const settings = { ...DEFAULT_GAME_SETTINGS };
    for (const key of Object.keys(settings)) if (valid(key, input?.[key])) settings[key] = input[key];
    return settings;
}

// Writes are patches: changing sound on one device must not reset difficulty.
export function validateGameSettings(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || !Object.keys(input).length
        || Object.entries(input).some(([key, value]) => !Object.hasOwn(DEFAULT_GAME_SETTINGS, key) || !valid(key, value))) {
        throw Object.assign(new Error('Choose valid game settings.'), { status: 400 });
    }
    return { ...input };
}
