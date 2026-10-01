export const ACTIVITIES = [
    { id: 'walk', label: 'Winding trail', verb: 'Walk', detail: 'Follow the little trail to a big surprise.' },
    { id: 'stairs', label: 'Grand staircase', verb: 'Climb', detail: 'Up a stair, one answer at a time.' },
    { id: 'wall', label: 'Climbing wall', verb: 'Climb', detail: 'Find a handhold and climb a little higher.' },
    { id: 'ladder', label: 'Sky ladder', verb: 'Climb', detail: 'One rung closer to something lovely.' },
    { id: 'mountain', label: 'Mountain hike', verb: 'Hike', detail: 'Little hikers can reach great heights.' },
    { id: 'swim', label: 'Splashy swim', verb: 'Swim', detail: 'A little splash brings the surprise closer.' },
    { id: 'jump', label: 'Stepping stones', verb: 'Hop', detail: 'Hop from stone to stone. You can do it!' },
    { id: 'rope', label: 'Rope bridge', verb: 'Cross', detail: 'Steady steps across a wobbly bridge.' },
    { id: 'ski', label: 'Ski adventure', verb: 'Ski', detail: 'Glide down the slope to your mystery gift.' },
    { id: 'fly', label: 'Balloon flight', verb: 'Fly', detail: 'Float through the clouds, one answer at a time.' },
    { id: 'boat', label: 'Canoe voyage', verb: 'Paddle', detail: 'Paddle your little boat toward a surprise.' },
    { id: 'tunnel', label: 'Secret tunnel', verb: 'Explore', detail: 'Put on your headlamp. Let’s explore!' },
];

export const WORLDS = [
    { id: 'forest', label: 'Woodland', sky: '#eff3e1', ground: '#bdd1a7', hill: '#d9e5c3', path: '#e6cc9e', accent: '#d69771', ink: '#5b7053', water: '#a6cec4' },
    { id: 'candy', label: 'Candyland', sky: '#fff0ef', ground: '#e5c5df', hill: '#f3d6df', path: '#f4cf9e', accent: '#de8da4', ink: '#9a6c8c', water: '#c9c4e9' },
    { id: 'space', label: 'Starlight', sky: '#414761', ground: '#8c87af', hill: '#636789', path: '#bdc5dc', accent: '#efc984', ink: '#f9edc9', water: '#6d99ba' },
    { id: 'snow', label: 'Snowy peaks', sky: '#e8f3f8', ground: '#cfdfdf', hill: '#f8fcff', path: '#f8f4dc', accent: '#89b7c1', ink: '#5c7c8b', water: '#a3d4e5' },
    { id: 'beach', label: 'Sunny islands', sky: '#e8f6f5', ground: '#efdab2', hill: '#c8e7dc', path: '#ffeac0', accent: '#e3aa76', ink: '#577f7c', water: '#8fcaca' },
];

export const ADVENTURES = WORLDS.flatMap((world) => ACTIVITIES.map((activity) => ({
    id: `${world.id}-${activity.id}`, world, activity,
    label: `${world.label} · ${activity.label}`,
})));

export function chooseAdventure(previous = null, random = Math.random) {
    const choices = ADVENTURES.filter((adventure) => adventure.id !== previous?.id);
    return choices[Math.floor(random() * choices.length)];
}

export function trailPoints(adventure) {
    return Array.from({ length: 8 }, (_, index) => {
        let y;
        switch (adventure.activity.id) {
            case 'stairs': y = 252 - index * 13; break;
            case 'wall': y = 250 - index * 13 + (index % 2 ? -5 : 0); break;
            case 'ladder': y = 250 - index * 14; break;
            case 'mountain': y = 250 - index * 13 + (index % 2 ? -4 : 0); break;
            case 'swim': y = 224 + Math.sin(index * 1.3) * 7; break;
            case 'jump': y = 236 - (index % 3) * 16; break;
            case 'rope': y = 218 + Math.sin(index / 7 * Math.PI) * 25; break;
            case 'ski': y = 159 + index * 13; break;
            case 'fly': y = 226 - index * 8 + Math.sin(index) * 7; break;
            case 'boat': y = 236 + Math.sin(index) * 5; break;
            case 'tunnel': y = 245 - Math.sin(index) * 5; break;
            default: y = 240 + Math.sin(index * .9) * 7;
        }
        return { x: 70 + index * 60, y: Math.round(y) };
    });
}

const rewardNames = [
    ['cake', 'Giant cake'], ['car', 'Little car'], ['house', 'Dream house'], ['rocket', 'Rocket'], ['bear', 'Teddy bear'],
    ['castle', 'Fairytale castle'], ['bicycle', 'Bicycle'], ['train', 'Toy train'], ['airplane', 'Airplane'], ['helicopter', 'Helicopter'],
    ['boat', 'Sailboat'], ['submarine', 'Submarine'], ['balloon', 'Hot-air balloon'], ['spaceship', 'Spaceship'], ['robot', 'Friendly robot'],
    ['crown', 'Royal crown'], ['chest', 'Treasure chest'], ['gem', 'Giant gemstone'], ['trophy', 'Golden trophy'], ['medal', 'Star medal'],
    ['guitar', 'Guitar'], ['piano', 'Piano'], ['drum', 'Drum kit'], ['violin', 'Violin'], ['trumpet', 'Trumpet'],
    ['icecream', 'Ice cream'], ['cupcake', 'Cupcake'], ['donut', 'Rainbow donut'], ['pizza', 'Pizza party'], ['burger', 'Big burger'],
    ['pancakes', 'Pancake tower'], ['chocolate', 'Chocolate'], ['cookie', 'Giant cookie'], ['lollipop', 'Lollipop'], ['fruit', 'Fruit basket'],
    ['puppy', 'Playful puppy'], ['kitten', 'Little kitten'], ['bunny', 'Pet bunny'], ['pony', 'Little pony'], ['penguin', 'Penguin pal'], ['duckling', 'Duckling'],
    ['treehouse', 'Treehouse'], ['tent', 'Cozy tent'], ['ferris', 'Ferris wheel'], ['carousel', 'Carousel'], ['slide', 'Water slide'], ['swings', 'Garden swings'],
    ['telescope', 'Telescope'], ['camera', 'Camera'], ['paints', 'Paint set'], ['books', 'Storybooks'], ['skateboard', 'Skateboard'], ['skates', 'Roller skates'],
    ['kite', 'Flying kite'], ['unicorn', 'Unicorn plush'], ['console', 'Game console'], ['computer', 'Computer'], ['wand', 'Magic wand'], ['flowers', 'Flower bouquet'], ['rainbow', 'Rainbow maker'],
];
const rewardPhrases = { airplane: 'an airplane', icecream: 'an ice cream', chocolate: 'some chocolate', swings: 'a garden swing set', books: 'some storybooks', skates: 'a pair of roller skates' };
export const REWARDS = rewardNames.map(([id, label]) => ({ id, label, name: rewardPhrases[id] ?? `a ${label.toLowerCase()}` }));

const creatureNames = [
    ['monster', 'Marshmallow monster'], ['dinosaur', 'Tiny dinosaur'], ['frog', 'Hungry frog'], ['yeti', 'Fluffy yeti'], ['dragon', 'Baby dragon'],
    ['octopus', 'Wiggly octopus'], ['whale', 'Bubble whale'], ['shark', 'Smiley shark'], ['crocodile', 'Little crocodile'], ['hippo', 'Hungry hippo'],
    ['bear', 'Sleepy bear'], ['lion', 'Fluffy lion'], ['tiger', 'Stripy tiger'], ['fox', 'Little fox'], ['wolf', 'Moon wolf'],
    ['raccoon', 'Masked raccoon'], ['panda', 'Panda pal'], ['koala', 'Cuddly koala'], ['rabbit', 'Bouncy rabbit'], ['cat', 'Mischievous cat'],
    ['dog', 'Playful dog'], ['hamster', 'Cheeky hamster'], ['hedgehog', 'Prickly hedgehog'], ['bat', 'Flappy bat'], ['owl', 'Wide-eyed owl'],
    ['penguin', 'Round penguin'], ['seal', 'Silly seal'], ['walrus', 'Whiskered walrus'], ['turtle', 'Little turtle'], ['snail', 'Speedy snail'],
    ['crab', 'Clacky crab'], ['lobster', 'Little lobster'], ['starfish', 'Starfish friend'], ['jellyfish', 'Jiggly jellyfish'], ['pufferfish', 'Puffy fish'],
    ['anglerfish', 'Lantern fish'], ['manta', 'Fluttering ray'], ['serpent', 'Sea serpent'], ['unicorn', 'Hungry unicorn'], ['griffin', 'Baby griffin'],
    ['cyclops', 'One-eyed monster'], ['alien', 'Three-eyed alien'], ['robot', 'Snack robot'], ['mimic', 'Treasure mimic'], ['pumpkin', 'Pumpkin monster'],
    ['cactus', 'Cactus buddy'], ['mushroom', 'Mushroom monster'], ['slime', 'Jelly slime'], ['cloud', 'Cloud puff'], ['snowman', 'Snowy snowman'],
    ['duck', 'Hungry duck'], ['elephant', 'Tiny elephant'], ['bison', 'Shaggy bison'], ['deer', 'Little deer'], ['goat', 'Bearded goat'],
    ['moose', 'Merry moose'], ['kangaroo', 'Pocket kangaroo'], ['monkey', 'Cheeky monkey'], ['giraffe', 'Little giraffe'], ['zebra', 'Zigzag zebra'],
];
export const CREATURES = creatureNames.map(([id, label]) => ({ id, label, name: `a ${label.toLowerCase()}` }));
