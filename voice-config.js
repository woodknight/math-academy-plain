import { fileURLToPath } from 'node:url';

export const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
export const MODEL_REVISION = '1939ad2a8e416c0acfeecc08a694d14ef25f2231';
export const MODEL_DIRECTORY = fileURLToPath(new URL('./.models/kokoro/', import.meta.url));
export const SPEECH_CACHE_DIRECTORY = fileURLToPath(new URL('./.cache/speech/', import.meta.url));
export const MODEL_FILES = [
    { path: 'config.json', bytes: 44, sha256: 'df34b4f930b23447cd4dc410fabfb42eb3f24e803e6c3f97d618fb359380a36f' },
    { path: 'tokenizer.json', bytes: 3497, sha256: '77a02c8e164413299b4b4c403b14f8e0e1c1b727db4d46a09d6327b861060a34' },
    { path: 'tokenizer_config.json', bytes: 113, sha256: 'be1cb066d6ef6b074b3f15e6a6dd21ac88ff3cdaedf325f0aaed686c70f75d20' },
    { path: 'onnx/model.onnx', bytes: 325532232, sha256: '8fbea51ea711f2af382e88c833d9e288c6dc82ce5e98421ea61c058ce21a34cb' },
];
