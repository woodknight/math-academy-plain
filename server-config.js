export const DEFAULT_SERVER_SETTINGS = {
    maxCacheFiles: 384,
    maxPendingSpeech: 8,
    speechEnabled: true,
    registrationEnabled: true,
};

export function validateServerSettings(input) {
    const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };
    if (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.keys(input).some(key => !Object.hasOwn(DEFAULT_SERVER_SETTINGS, key))) invalid('Unknown server setting.');
    if (!Number.isInteger(input.maxCacheFiles) || input.maxCacheFiles < 0 || input.maxCacheFiles > 10000) invalid('The audio cache limit must be a whole number from 0 to 10,000.');
    if (!Number.isInteger(input.maxPendingSpeech) || input.maxPendingSpeech < 1 || input.maxPendingSpeech > 32) invalid('The speech queue limit must be a whole number from 1 to 32.');
    if (typeof input.speechEnabled !== 'boolean' || typeof input.registrationEnabled !== 'boolean') invalid('Choose whether speech and new profiles are enabled.');
    return { maxCacheFiles: input.maxCacheFiles, maxPendingSpeech: input.maxPendingSpeech,
        speechEnabled: input.speechEnabled, registrationEnabled: input.registrationEnabled };
}
