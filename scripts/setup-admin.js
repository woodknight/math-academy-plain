import { fileURLToPath } from 'node:url';
import { PlayerStore } from '../player-store.js';

const store = new PlayerStore(process.env.PLAYER_DATA_DIR || fileURLToPath(new URL('../.data/', import.meta.url)));
await store.init();
const result = await store.bootstrapAdmin();
console.log(result ? `Admin account created: ${result.username}\nLogin details: ${result.credentialsPath}` : 'An admin account already exists. Its credentials were not changed.');
