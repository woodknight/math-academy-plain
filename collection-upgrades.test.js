import test from 'node:test';
import assert from 'node:assert/strict';
import { cropRectangle } from './avatar-editor.js';
import { collectionItems, upgradeTreasure } from './treasures.js';
import { REWARDS } from './adventures.js';
import { RoundMusicPlayer, roundScore } from './round-music.js';

test('photo crop zooms and pans within landscape, portrait and square bounds', () => {
    assert.deepEqual(cropRectangle(800, 400), { x: 200, y: 0, side: 400 });
    assert.deepEqual(cropRectangle(400, 800, 2, 1, 0), { x: 200, y: 0, side: 200 });
    for (const [width, height] of [[400, 800], [800, 400], [256, 256]]) {
        for (const zoom of [1, 2, 3]) for (const x of [0, .5, 1]) for (const y of [0, .5, 1]) {
            const crop = cropRectangle(width, height, zoom, x, y);
            assert.ok(crop.x >= 0 && crop.y >= 0 && crop.x + crop.side <= width && crop.y + crop.side <= height);
        }
    }
});
test('higher difficulties upgrade prizes while keeping legacy and premium stacks separate', () => {
    const gem = REWARDS.find(item => item.id === 'gem');
    assert.equal(upgradeTreasure(gem, 'easy').key, 'gem');
    assert.equal(upgradeTreasure(gem, 'medium').key, 'gem:silver');
    assert.equal(upgradeTreasure(gem, 'hard').key, 'gem:gold');
    const items = collectionItems({ gem: 3, 'gem:silver': 2, 'gem:gold': 1, unknown: 99, 'gem:bad': 2, cake: -1 });
    assert.deepEqual(items.map(item => [item.key, item.count, item.stars]), [['gem:gold', 1, 3], ['gem:silver', 2, 2], ['gem', 3, 1]]);
});
test('win and loss tunes have distinct melodies and complete on audio ending; mute resolves immediately', async () => {
    assert.notDeepEqual(roundScore('reward'), roundScore('creature'));
    assert.ok(Math.max(...roundScore('reward').map(note => note.start + note.duration)) < 3);
    const oscillators = [];
    const parameter = { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
    const context = { state: 'running', currentTime: 0, destination: {},
        createOscillator() { const node = { frequency: parameter, start() {}, stop() {}, connect() {}, disconnect() {} }; oscillators.push(node); return node; },
        createGain() { return { gain: parameter, connect() {}, disconnect() {} }; } };
    const music = new RoundMusicPlayer(() => context);
    let done = false;
    const playing = music.play('reward').then(() => { done = true; });
    await Promise.resolve(); assert.equal(done, false);
    for (const oscillator of oscillators) oscillator.onended?.();
    await playing; assert.equal(done, true);
    const cancelled = music.play('creature');
    music.stop(); await cancelled;
    assert.equal(music.finish, null);
});
