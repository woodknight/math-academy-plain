import test from 'node:test';
import assert from 'node:assert/strict';
import { ADVENTURES, ACTIVITIES, WORLDS, REWARDS, CREATURES, chooseAdventure, trailPoints } from './adventures.js';
import { landscapeArt, routeArt, gearArt, rewardArt, creatureArt } from './adventure-art.js';

test('at least 50 adventures, rewards, and creatures have unique identities and artwork', () => {
    const artwork = [a => landscapeArt(a) + routeArt(a, 2), r => rewardArt(r.id), c => creatureArt(c.id)];
    [ADVENTURES, REWARDS, CREATURES].forEach((items, index) => {
        assert.ok(items.length >= 50);
        assert.equal(new Set(items.map(item => item.id)).size, items.length);
        assert.equal(new Set(items.map(item => item.label)).size, items.length);
        // Ignore palette information: every entry must still have distinct geometry.
        const drawings = items.map(item => artwork[index](item).replace(/#[0-9a-f]{3,8}/gi, '#color'));
        assert.equal(new Set(drawings).size, items.length);
        assert.ok(drawings.every(drawing => drawing.length > 20 && !/undefined|NaN/.test(drawing)));
    });
});

test('all 12 traversal methods appear in all 5 worlds and each has equipment', () => {
    assert.equal(ACTIVITIES.length, 12);
    assert.equal(WORLDS.length, 5);
    for (const activity of ACTIVITIES) {
        assert.equal(ADVENTURES.filter(a => a.activity.id === activity.id).length, WORLDS.length);
        assert.ok(gearArt(activity.id).length > 0);
    }
});

test('every adventure is reachable by the draw and adjacent rounds do not repeat', () => {
    ADVENTURES.forEach((adventure, index) => {
        assert.equal(chooseAdventure(null, () => (index + .5) / ADVENTURES.length), adventure);
        for (const random of [0, .5, .999999]) {
            assert.notEqual(chooseAdventure(adventure, () => random).id, adventure.id);
        }
    });
});

test('every path has eight valid footholds and real elevation for climbing and skiing', () => {
    for (const adventure of ADVENTURES) {
        const points = trailPoints(adventure);
        assert.equal(points.length, 8);
        points.forEach((point, index) => {
            assert.ok(point.x >= 60 && point.x <= 500 && point.y >= 145 && point.y <= 260);
            if (index) assert.ok(point.x > points[index-1].x);
        });
        if (['stairs', 'wall', 'ladder', 'mountain'].includes(adventure.activity.id)) assert.ok(points[0].y > points[7].y);
        if (adventure.activity.id === 'ski') assert.ok(points[0].y < points[7].y);
    }
});
