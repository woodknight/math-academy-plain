import { REWARDS } from './adventures.js';

export const TREASURE_TIERS = {
    easy: { id: 'classic', label: 'Classic', stars: 1 },
    medium: { id: 'silver', label: 'Silver', stars: 2 },
    hard: { id: 'gold', label: 'Golden', stars: 3 },
};
export const TIER_IDS = new Set(Object.values(TREASURE_TIERS).map(tier => tier.id));
const catalogue = new Map(REWARDS.map(item => [item.id, item]));

export function treasureKey(id, tier = 'classic') {
    return tier === 'classic' ? id : `${id}:${tier}`;
}

export function upgradeTreasure(item, difficulty) {
    const tier = TREASURE_TIERS[difficulty];
    if (!tier) throw new Error('Unknown treasure difficulty.');
    return { ...item, tier: tier.id, tierLabel: tier.label, stars: tier.stars,
        key: treasureKey(item.id, tier.id), label: tier.id === 'classic' ? item.label : `${tier.label} ${item.label}`,
        name: tier.id === 'classic' ? item.name : `a ${tier.label.toLowerCase()} ${item.label.toLowerCase()}` };
}

export function collectionItems(counts) {
    return Object.entries(counts).flatMap(([key, count]) => {
        const [id, tier = 'classic', extra] = key.split(':');
        const difficulty = Object.keys(TREASURE_TIERS).find(level => TREASURE_TIERS[level].id === tier);
        if (extra || !catalogue.has(id) || !difficulty || !Number.isSafeInteger(count) || count <= 0) return [];
        return [{ ...upgradeTreasure(catalogue.get(id), difficulty), count }];
    }).sort((a, b) => b.stars - a.stars || a.label.localeCompare(b.label));
}
