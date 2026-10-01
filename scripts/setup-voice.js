import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { MODEL_ID, MODEL_REVISION, MODEL_DIRECTORY, MODEL_FILES } from '../voice-config.js';

async function validFile(filename, expected) {
    try {
        if ((await stat(filename)).size !== expected.bytes) return false;
        const hash = createHash('sha256');
        for await (const chunk of createReadStream(filename)) hash.update(chunk);
        return hash.digest('hex') === expected.sha256;
    } catch (error) {
        if (error.code === 'ENOENT') return false;
        throw error;
    }
}

for (const file of MODEL_FILES) {
    const target = join(MODEL_DIRECTORY, file.path);
    if (await validFile(target, file)) {
        console.log(`Verified ${file.path}`);
        continue;
    }
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.part`;
    try {
        console.log(`Downloading ${file.path} (${(file.bytes / 1048576).toFixed(1)} MB)…`);
        const response = await fetch(`https://huggingface.co/${MODEL_ID}/resolve/${MODEL_REVISION}/${file.path}`, {
            signal: AbortSignal.timeout(300000),
        });
        if (!response.ok || !response.body) throw new Error(`Model download failed: HTTP ${response.status}`);
        let bytes = 0;
        let lastProgress = 0;
        const hash = createHash('sha256');
        const verify = new Transform({
            transform(chunk, _encoding, callback) {
                bytes += chunk.length;
                hash.update(chunk);
                const progress = Math.floor(bytes / file.bytes * 5) * 20;
                if (file.bytes > 1048576 && progress > lastProgress) {
                    lastProgress = progress;
                    console.log(`${file.path}: ${Math.min(progress, 100)}%`);
                }
                callback(null, chunk);
            },
        });
        await pipeline(Readable.fromWeb(response.body), verify, createWriteStream(temporary, { flags: 'wx' }));
        if (bytes !== file.bytes || hash.digest('hex') !== file.sha256) throw new Error(`Incomplete or changed model file: ${file.path}`);
        await rename(temporary, target);
    } finally {
        await rm(temporary, { force: true });
    }
}
console.log('Local voice is installed. Speech generation can now run offline.');
