import { trailPoints } from './adventures.js';

const path = (d, fill = 'none', extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;
const rect = (x, y, width, height, fill, radius = 5, extra = '') => `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" ${extra}/>`;
const circle = (x, y, radius, fill, extra = '') => `<circle cx="${x}" cy="${y}" r="${radius}" fill="${fill}" ${extra}/>`;
const ellipse = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
const line = (d, color = '#796e62', width = 3) => path(d, 'none', `stroke="${color}" stroke-width="${width}"`);
const group = (markup, transform) => `<g transform="${transform}">${markup}</g>`;
const star = (x, y, size, color) => path(`M${x} ${y-size}l${size*.3} ${size*.65} ${size*.7} ${size*.1}-${size*.5} ${size*.5} ${size*.12} ${size*.7}-${size*.62}-${size*.33}-${size*.62} ${size*.33} ${size*.12}-${size*.7}-${size*.5}-${size*.5} ${size*.7}-${size*.1}Z`, color);
const face = (x = 60, y = 66) => circle(x-9, y, 2, '#544a46', 'stroke="none"') + circle(x+9, y, 2, '#544a46', 'stroke="none"') + path(`M${x-5} ${y+7}q5 5 10 0`);

export function landscapeArt(adventure) {
    const w = adventure.world;
    let art = rect(0, 0, 560, 300, w.sky, 0, 'stroke="none"');
    art += path('M0 196Q100 99 235 183Q409 90 560 185V300H0Z', w.hill, 'stroke="none"');
    art += path('M0 241Q115 185 262 230Q407 173 560 237V300H0Z', w.ground, 'stroke="none"');
    switch (w.id) {
        case 'forest':
            art += circle(435, 46, 23, '#f6dda0', 'stroke="none"');
            for (const [x, y, scale] of [[32, 180, 1], [526, 158, .8]]) art += group(line('M0 0V-65', '#8c9773', 5) + path('M-30-40Q-47-87-15-91Q4-112 23-88Q52-82 33-37Q0-17-30-40', '#a4bc88', 'stroke="none"'), `translate(${x} ${y}) scale(${scale})`);
            for (const x of [30, 139, 289, 430, 525]) art += line(`M${x} 284v-9`, '#8ea375', 2) + circle(x, 272, 5, x % 2 ? '#e8a896' : '#fff4d0', 'stroke="none"');
            art += path('M95 65c-22 0-20-23-5-23 7-23 35-19 39-3 22-2 25 26 8 26Z', '#fffdf3', 'stroke="none"');
            break;
        case 'candy':
            art += path('M0 173 75 96 142 180 246 113 311 187 438 100 560 179', '#f5dee4', 'stroke="none"');
            for (const [x, y, color] of [[35, 151, '#dfa8bd'], [510, 138, '#b6c8a3'], [393, 100, '#eac391']]) art += line(`M${x} ${y+35}V${y-15}`, '#b79b87', 5) + circle(x, y-23, 22, color, 'stroke="none"') + path(`M${x-10} ${y-25}q19-16 20 6q-8 13-14 1`, 'none', 'stroke="#fff4e5" stroke-width="4"');
            art += path('M88 61c-22-5-16-28 1-24 13-24 39-8 30 7 19 18-7 31-18 19Z', '#fff9f5', 'stroke="none"');
            for (const [x, y] of [[102, 280], [300, 283], [471, 275]]) art += rect(x, y, 20, 9, '#e6ae98', 4, 'stroke="none"') + line(`M${x+4} ${y+1}v7m7-7v7`, '#fff0d2', 2);
            break;
        case 'space':
            for (let i = 0; i < 24; i++) art += star(20 + i * 22 % 525, 20 + i * 31 % 105, i % 3 + 2, '#eee8c5');
            art += ellipse(436, 55, 48, 12, 'none', 'stroke="#d4c5e4" stroke-width="7" transform="rotate(-20 436 55)"') + circle(436, 55, 24, '#c5b3d4', 'stroke="none"');
            art += circle(92, 56, 20, '#e4d3a2', 'stroke="none"') + circle(85, 49, 5, '#cfbd91', 'stroke="none"') + circle(101, 61, 4, '#cfbd91', 'stroke="none"');
            for (const [x, y] of [[37, 282], [314, 278], [523, 275]]) art += ellipse(x, y, 22, 7, '#797b9e', 'stroke="none"') + ellipse(x-3, y-2, 13, 3, '#a5a0c1', 'stroke="none"');
            break;
        case 'snow':
            art += path('M0 193 100 69 189 185 311 61 435 190 501 91 560 188Z', '#b4d0dc', 'stroke="none"');
            art += path('m66 111 34-42 35 45-24-5-11 13-13-13Zm205-4 40-46 39 49-27-11-13 14-12-14Z', '#fcffff', 'stroke="none"');
            for (const x of [27, 525]) art += path(`M${x} 108l-23 41h10l-17 31h60l-18-31h11Z`, '#91b1a1', 'stroke="none"') + line(`M${x} 177v21`, '#8f9e99', 4);
            for (let i = 0; i < 16; i++) art += circle(20+i*33, 20+i*17%90, 2, '#ffffff', 'stroke="none"');
            break;
        case 'beach':
            art += rect(0, 175, 560, 125, '#b6dfd8', 0, 'stroke="none"') + path('M0 266Q76 219 176 271Q345 230 560 280V300H0Z', '#f2ddb5', 'stroke="none"');
            art += circle(435, 44, 23, '#f6dda0', 'stroke="none"');
            for (const [x, y] of [[28, 175], [525, 172]]) art += line(`M${x} ${y}q17-31 5-70`, '#b2967b', 6) + path(`M${x+5} ${y-65}q-39-39-40 2q16-13 40-2q4-45 30-21q-21 6-30 21q47-18 42 17q-20-18-42-17Z`, '#92ba95', 'stroke="none"');
            art += star(180, 284, 10, '#e9aa98') + path('M390 286q0-22 24-22l-2 22Z', '#e9c3a7', 'stroke="none"') + line('M395 283l12-15m-6 16 10-14', '#d5aa90', 2);
            break;
    }
    return art;
}

export function routeArt(adventure, position) {
    const points = trailPoints(adventure);
    const w = adventure.world;
    const route = points.map((p) => `${p.x},${p.y}`).join(' ');
    const polyline = (color, width, extra = '') => `<polyline points="${route}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
    let art = '';
    switch (adventure.activity.id) {
        case 'stairs':
            art = points.map((p) => rect(p.x-30, p.y, 60, 300-p.y, w.path, 2, 'stroke="#b8a98c" stroke-width="2"') + line(`M${p.x-24} ${p.y+6}h46`, '#fff3d4', 3)).join('');
            break;
        case 'wall':
            art = rect(27, 101, 505, 199, w.hill, 7, 'stroke="#b5b0a1" stroke-width="2"');
            for (let row = 0; row < 6; row++) for (let col = 0; col < 9; col++) art += rect(31+col*62-(row%2?25:0), 106+row*33, 59, 29, row%2 ? w.ground : w.hill, 3, 'stroke="#ffffff44"');
            art += points.map((p, i) => path(`M${p.x-10} ${p.y+2}l7-7 12 1 4 7Z`, i%2 ? w.accent : '#96b6b8', 'stroke="#798b80" stroke-width="2"')).join('');
            break;
        case 'ladder':
            art = group(polyline('#b19978', 7), 'translate(0 8)') + group(polyline('#b19978', 7), 'translate(0 -22)');
            for (let i = 0; i < 15; i++) { const x = 70+i*30; const y = 250-i*7; art += line(`M${x} ${y+8}v-30`, w.path, 7); }
            break;
        case 'mountain':
            art = path(`M15 300L${points.map(p=>`${p.x} ${p.y+9}`).join(' ')}L545 300Z`, w.ground, 'stroke="#95a382" stroke-width="2"') + polyline(w.path, 10) + polyline('#adab89', 2, 'stroke-dasharray="3 8"');
            art += points.map((p, i) => path(`M${p.x+18} ${p.y+12}l12-12 16 12Z`, i%2 ? w.hill : w.accent, 'stroke="none"')).join('');
            break;
        case 'swim':
        case 'boat':
            art = path('M0 211q35-13 70 0t70 0t70 0t70 0t70 0t70 0t70 0t70 0V300H0Z', w.water, 'stroke="none"');
            for (let row = 0; row < 3; row++) art += line(`M12 ${235+row*22}q25-9 50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0t50 0`, '#eef9ed88', 3);
            if (adventure.activity.id === 'swim') art += points.map(p=>circle(p.x, p.y+11, 8, '#fff4c2', 'stroke="#d4bc85" stroke-width="2"')).join('');
            break;
        case 'jump':
            art = points.map((p,i) => path(`M${p.x-17} ${p.y+7}l3-16 20-6 15 14-5 10Z`, i%2 ? w.path : w.hill, 'stroke="#a8a48d" stroke-width="2"')).join('');
            break;
        case 'rope':
            art = group(polyline('#9a886b', 3), 'translate(0 -22)') + group(polyline('#9a886b', 3), 'translate(0 6)');
            art += points.map(p=>rect(p.x-24, p.y-1, 48, 8, w.path, 2, 'stroke="#a38d72" stroke-width="2"') + line(`M${p.x-15} ${p.y}v-23m30 23v-23`, '#b9a683', 2)).join('');
            art += line('M43 230v-57m474 57v-57', '#8f876c', 6);
            break;
        case 'ski':
            art = path('M0 139 560 260v40H0Z', '#eff9f9', 'stroke="none"') + polyline('#c5dcdc', 15) + group(polyline('#ffffff', 3), 'translate(0 -4)') + group(polyline('#ffffff', 3), 'translate(0 4)');
            art += line('M38 162v-45m483 138v-47', '#9aacaa', 3) + path('m38 119 23 6-23 8Zm483 91 24 6-24 8Z', w.accent, 'stroke="none"');
            break;
        case 'fly':
            art = polyline('#ffffff99', 2, 'stroke-dasharray="3 10"');
            art += points.map(p=>ellipse(p.x, p.y+9, 22, 8, '#fffdf0', 'stroke="none"') + circle(p.x-5, p.y+4, 9, '#fffdf0', 'stroke="none"')).join('');
            break;
        case 'tunnel':
            for (const x of [34, 212, 390]) art += path(`M${x} 259V171q68-81 136 0v88h-21v-69q-47-57-94 0v69Z`, w.accent, 'stroke="#a39989" stroke-width="2"');
            art += polyline(w.path, 18) + polyline('#b9a88b', 2, 'stroke-dasharray="3 9"');
            break;
        default:
            art = polyline('#d0c09a', 27) + polyline(w.path, 23) + polyline('#b9a580', 2, 'stroke-dasharray="4 10"');
    }
    art += points.map((p, index) => circle(p.x, p.y+2, index === position ? 7 : 5, index === position ? '#85a676' : '#fff3d6', `class="trail-marker${index === position ? ' current' : ''}" stroke="${index === position ? '#fffdf2' : '#bdaf92'}" stroke-width="2"`)).join('');
    art += `<g fill="${w.ink}" stroke="none" font-family="sans-serif" font-size="9" font-weight="700" text-anchor="middle" letter-spacing="1"><text x="70" y="${points[0].y+30}">SNACK STOP</text><text x="190" y="${points[2].y+30}">START</text><text x="490" y="${points[7].y+30}">SURPRISE</text></g>`;
    return art;
}

export function gearArt(motion) {
    switch (motion) {
        case 'walk': return line('M79 71l-5 51', '#a78c6a', 4);
        case 'stairs': return rect(28, 110, 19, 11, '#bf967e') + rect(53, 110, 19, 11, '#bf967e');
        case 'wall': return path('M32 83h35v9H32Z', '#a9bb8b') + line('M40 91l10 10 10-10', '#b79d78', 3) + circle(22, 88, 5, '#aec58f') + circle(77, 89, 5, '#aec58f');
        case 'ladder': return circle(23, 89, 5, '#e4c080') + circle(77, 90, 5, '#e4c080') + line('M43 82h15', '#c39472', 5);
        case 'mountain': return line('M19 69l5 54m53-54-5 54', '#8c8c73', 3) + path('M16 67h8m49 0h8', 'none', 'stroke="#c09c78" stroke-width="5"');
        case 'swim': return rect(30, 36, 17, 11, '#aedcdd', 5) + rect(53, 36, 17, 11, '#aedcdd', 5) + line('M47 41h6m-32-2h9m40 0h9', '#658d8d', 2);
        case 'jump': return path('M25 115h23l-4 10H22Zm28 0h25l3 10H55Z', '#e6c987') + line('M27 123h15m18 0h16', '#b6a378', 2);
        case 'rope': return line('M29 79h42m-21 0v26', '#b5a17b', 5) + circle(50, 88, 6, '#eee2b2');
        case 'ski': return line('M11 125h78m-71-8h64', '#92b4b5', 5) + line('M15 63l8 60m62-60-8 60', '#988d78', 2);
        case 'fly': return line('M35 27 19-23m31 50v-58m15 58 18-48', '#a39a84', 2) + ellipse(17, -29, 14, 18, '#e5aaa2') + ellipse(50, -38, 14, 19, '#f0d292') + ellipse(84, -25, 14, 18, '#a9c6ba');
        case 'boat': return path('M9 110q41 17 82 0l-11 17H22Z', '#deb68b') + line('M75 66 27 122', '#9a8b72', 4) + path('m21 111 11 10-10 12-11-10Z', '#edc89b');
        case 'tunnel': return path('M23 23q27-36 54 0Z', '#e5c991') + rect(43, 9, 15, 13, '#f5edb1') + path('m58 14 29-6v25l-29-12Z', '#fff8ba55', 'stroke="none"');
        default: return '';
    }
}

const gold = '#eccb86';
const rose = '#e6a5a4';
const mint = '#a9c7b5';
const blue = '#adc9d6';
const cream = '#fff0d1';
const brown = '#cfaa84';
const wheels = (x1 = 31, x2 = 88, y = 96) => circle(x1, y, 10, '#6b625b') + circle(x2, y, 10, '#6b625b') + circle(x1, y, 4, cream, 'stroke="none"') + circle(x2, y, 4, cream, 'stroke="none"');

// Each entry has its own object geometry; these are not palette-only variants.
const rewardShapes = {
    castle: rect(30, 48, 60, 58, cream) + rect(14, 37, 24, 70, rose) + rect(82, 37, 24, 70, rose) + path('M10 38 26 13 42 38Zm68 0 16-25 16 25Z', gold) + path('M47 105V82a13 13 0 0 1 26 0v23Z', mint) + rect(48, 52, 10, 13, blue) + rect(66, 52, 10, 13, blue) + line('M60 46V15') + path('m60 15 19 6-19 7Z', rose),
    bicycle: circle(27, 86, 21, cream) + circle(92, 86, 21, cream) + path('m27 86 19-30 20 30Zm19-30h34l-14 30m14-30 12 30m-46-30-5-9', 'none', 'stroke="#92b1ae" stroke-width="5"') + line('M35 46h16m29 11V43h10'),
    train: rect(13, 57, 84, 37, mint) + rect(48, 31, 38, 44, mint) + rect(57, 39, 20, 19, cream) + rect(25, 41, 14, 16, brown) + path('M9 94h99L98 80H12Z', rose) + wheels(31, 80, 99) + circle(31, 26, 6, '#e6dfd2', 'stroke="none"') + circle(39, 17, 9, '#e6dfd2', 'stroke="none"'),
    airplane: path('M51 20q9-19 18 0v32l42 22v12L69 75v22l14 9v8l-23-5-23 5v-8l14-9V75L9 86V74l42-22Z', blue) + rect(54, 20, 12, 17, cream) + line('M51 67h18', '#e0988c', 5),
    helicopter: ellipse(62, 67, 32, 23, mint) + path('M34 57 10 46v27l25-3', mint) + path('M66 45v31h22Q87 48 66 45Z', cream) + line('M61 44V29m-35 0h70m-51 63v9m33-9v9m-43 0h61', '#8a9a94', 4) + face(51, 68),
    boat: path('M12 81h96l-18 27H31Z', brown) + line('M60 81V15') + path('M57 22 23 71h34Zm8 8v41h31Z', cream) + path('m60 15 18 5-18 7Z', rose) + line('M6 111q13-9 26 0t26 0t26 0t26 0', '#9dc3c3'),
    submarine: rect(12, 51, 89, 41, gold, 20) + rect(43, 38, 31, 15, gold) + line('M56 37V22h16', '#94a9a2', 5) + circle(39, 72, 10, blue) + circle(74, 72, 10, blue) + path('M102 58h10v25h-10', rose) + circle(105, 33, 5, blue, 'stroke="none"'),
    balloon: path('M23 45c0-45 74-45 74 0 0 20-24 43-37 43S23 65 23 45Z', rose) + path('M47 14q-20 40 13 74m13-74q20 40-13 74', cream) + line('M40 77l9 22m31-22-9 22') + rect(45, 95, 30, 20, brown),
    spaceship: path('M15 67q45-25 90 0l-7 20H22Z', blue) + path('M34 59q1-42 52 0Z', '#d1e4df') + ellipse(60, 72, 46, 12, mint) + circle(32, 77, 4, gold) + circle(60, 81, 4, rose) + circle(87, 77, 4, gold) + path('m44 98-8 13m40-13 8 13', 'none', 'stroke="#d8c59a" stroke-width="4"'),
    robot: rect(29, 22, 62, 44, blue, 10) + rect(36, 71, 48, 31, mint) + rect(13, 74, 14, 24, gold) + rect(93, 74, 14, 24, gold) + rect(37, 104, 17, 12, blue) + rect(66, 104, 17, 12, blue) + line('M60 22V12') + circle(60, 9, 5, rose) + face(60, 41) + circle(60, 86, 7, rose),
    crown: path('m17 88-8-51 27 18 24-32 24 32 27-18-8 51Z', gold) + rect(17, 87, 86, 18, gold) + circle(11, 32, 5, rose) + circle(60, 19, 5, mint) + circle(109, 32, 5, rose) + path('m60 65 9 10-9 10-9-10Z', rose),
    chest: rect(18, 59, 85, 45, brown) + path('M18 58V45q0-32 43-32t42 32v13Z', gold) + line('M30 26v76m60-76v76', '#b29269', 5) + rect(51, 54, 18, 23, gold) + circle(60, 64, 3, '#78614e') + star(102, 24, 8, gold),
    gem: path('M14 45 33 19h54l19 26-46 62Z', '#b7abd4') + path('M14 45h92M33 19l13 26 14 62 15-62 12-26M46 45l14-26 15 26', 'none', 'stroke="#f0e8fa"') + star(105, 96, 8, gold),
    trophy: path('M32 20h56v36c0 28-56 28-56 0Z', gold) + path('M31 29H13v18q0 25 25 22m51-40h18v18q0 25-25 22', 'none', 'stroke="#c6a565" stroke-width="5"') + rect(54, 78, 12, 22, gold) + rect(35, 101, 50, 13, brown) + star(60, 46, 13, cream),
    medal: path('m33 9 27 32 27-32v25L60 63 33 34Z', blue) + circle(60, 79, 31, gold) + circle(60, 79, 24, '#f4d997') + star(60, 79, 17, cream),
    guitar: path('M49 50c-33-16-44 18-28 29-12 29 27 50 43 27 28 4 35-33 15-39l-13-17Z', brown) + path('m50 59 26-44 13 8-26 44Z', gold) + rect(76, 8, 17, 21, brown, 3, 'transform="rotate(30 84 18)"') + circle(51, 80, 11, '#776051') + line('M43 96 81 25m-44 75h24', cream, 2),
    piano: rect(15, 29, 90, 71, '#75808a') + rect(19, 58, 82, 28, cream, 2) + line('M25 86V58m11 28V58m11 28V58m11 28V58m11 28V58m11 28V58m11 28V58', '#9d9688', 2) + [30,41,63,74,85].map(x=>rect(x,58,6,17,'#675e58',1)).join('') + line('M25 100v14m70-14v14', '#75685c', 6),
    drum: ellipse(60, 46, 37, 11, cream) + path('M23 46v49c0 17 74 17 74 0V46', rose) + ellipse(60, 95, 37, 11, rose) + line('M28 57 43 94 60 57 77 94 93 57', cream, 3) + line('M25 27 86 9m9 23L35 8', brown, 4),
    violin: path('M48 46c-25-12-29 10-14 21-22 31 36 61 47 29 12-22-3-23-12-34 15-18-3-27-21-16Z', '#d8a176') + path('M52 55 68 11l12 4-14 44Z', brown) + circle(76, 9, 6, brown) + line('M53 72q-10 5-6 19m19-20q10 5 6 17m-8-46L54 97', '#795d49', 2) + line('M101 23 87 110', '#a58d6c', 4),
    trumpet: path('M18 76h58q20 0 22-17l13-12v49l-13-11q-9 15-30 15H31Q6 99 18 76Z', gold) + path('M22 75V60h54v15', gold) + line('M41 60V42m15 18V42m15 18V42m-34 0h9m6 0h9m6 0h9', '#c3a16c', 4) + rect(7, 69, 16, 11, gold),
    icecream: path('M35 68h50l-25 47Z', brown) + line('M43 80 68 97m-19-17 19 9m-25 6 20-15', '#efca9e', 2) + circle(40, 58, 20, rose) + circle(80, 58, 20, mint) + circle(60, 31, 22, cream) + circle(59, 10, 6, rose),
    cupcake: path('m28 61 11 44h42l11-44Z', gold) + path('M28 63C1 57 19 32 37 36c-4-28 46-31 47-4 22 1 28 32 8 33Z', rose) + line('M42 76l4 23m15-23v23m16-23-4 23', '#c5a273', 2) + circle(60, 18, 7, '#d88886'),
    donut: circle(60, 65, 44, brown) + path('M17 66c-2-56 88-57 87 0-5 22-12 4-22 10-12 24-21 0-34 8-25 13-16-13-31-18Z', rose) + circle(60, 62, 16, cream) + line('M31 40l5 7m40-11 6 4m5 23-8 2m-51-4 7 4M54 88h9', '#faf0c4', 4),
    pizza: path('M60 15 10 104h100Z', gold) + path('M10 104q49-18 100 0', 'none', 'stroke="#d6a67a" stroke-width="12"') + circle(60, 52, 9, rose) + circle(40, 83, 9, rose) + circle(81, 85, 9, rose) + path('m54 76 8-6m-7-33 7 2m-10 57 9-3', 'none', 'stroke="#99b88a" stroke-width="4"'),
    burger: path('M16 51c0-52 88-52 88 0Z', gold) + rect(13, 52, 94, 10, mint) + rect(15, 65, 90, 15, '#a37e64') + path('m13 64 20 9 17-9 20 9 18-9 19 9', gold) + rect(16, 87, 88, 19, gold, 10) + line('M34 31l3 3m22-11 2 4m19 7 3-1', cream, 3),
    pancakes: [93,81,69,57].map(y=>ellipse(60,y,43,9,brown) + ellipse(60,y-4,43,8,gold)).join('') + path('M21 49q40-17 80 0v8c0 16-18 6-18 1-11 15-18 1-24 4-22 16-18-6-30-2Z', '#c49a75') + rect(46, 33, 28, 16, cream) + circle(85, 32, 6, '#bc8eb5'),
    chocolate: rect(24, 13, 73, 94, '#aa7f64') + [27,49,71].flatMap(x=>[18,39,60].map(y=>rect(x,y,20,18,'#bb9275',2))).join('') + path('M18 81h84v29H18Z', rose) + path('m20 80 23-17-5 18 16-16 5 16 24-16-2 16 17-11v12', cream),
    cookie: circle(60, 64, 43, gold) + [[32,48],[64,33],[82,56],[48,79],[76,87],[35,91]].map(([x,y])=>circle(x,y,5,'#98735c')).join('') + face(62, 60),
    lollipop: line('M60 72v42', brown, 7) + circle(60, 44, 34, rose) + path('M60 44c-4-19 24-20 19 0-7 32-59 21-49-10 10-34 60-31 61 7', 'none', 'stroke="#fff0d1" stroke-width="6"') + path('m60 87-17-9v16Zm0 0 17-9v16Z', mint),
    fruit: ellipse(60, 77, 45, 25, brown) + path('M15 65q45 19 90 0l-11 38H26Z', gold) + circle(39, 49, 17, rose) + circle(80, 49, 18, gold) + path('M52 58q-7-39 9-40 20 3 9 40Z', mint) + path('M35 34q8-16 18-11m22 10q-7-13 1-19', 'none', 'stroke="#96af82" stroke-width="4"') + line('M33 84v16m17-15v17m18-17v17m17-18v16', '#b29170', 2),
    puppy: ellipse(60, 81, 25, 26, brown) + ellipse(36, 39, 12, 24, '#b88e73') + ellipse(84, 39, 12, 24, '#b88e73') + circle(60, 46, 25, brown) + ellipse(60, 55, 13, 10, cream) + face(60, 45) + circle(60, 53, 4, '#756151') + line('M46 102v10m28-10v10', brown, 11) + path('M86 86q28-11 17-25', 'none', 'stroke="#b88e73" stroke-width="8"'),
    kitten: ellipse(60, 83, 25, 27, '#cbb3aa') + path('m35 43 0-31 22 16m29 15V12L64 28', '#cbb3aa') + circle(60, 47, 27, '#cbb3aa') + face(60, 46) + path('m56 54 4 4 4-4Z', rose) + line('M25 54h18m-17 8 17-2m34-6h18m-18 6 17 2', '#a38d82', 2) + path('M83 94q31 13 22-20', 'none', 'stroke="#cbb3aa" stroke-width="9"'),
    bunny: ellipse(60, 82, 25, 28, cream) + ellipse(43, 27, 9, 24, cream) + ellipse(78, 25, 9, 24, cream) + ellipse(43, 25, 4, 15, rose, 'stroke="none"') + ellipse(78, 23, 4, 15, rose, 'stroke="none"') + ellipse(60, 55, 26, 23, cream) + face(60, 53) + circle(60, 61, 3, rose) + circle(89, 91, 10, cream),
    pony: ellipse(56, 75, 32, 18, brown) + path('M72 78V35q5-22 22-9l9 24-21 14v20Z', brown) + path('M73 37q-16 12-7 37l-14-5 9-39Z', rose) + path('m82 26 4-15 10 17', brown) + circle(89, 43, 3, '#544a46') + line('M36 88v22m28-22v22m17-22v22', brown, 8) + path('M26 68q-27-3-16 25', 'none', 'stroke="#c18d7e" stroke-width="9"'),
    penguin: ellipse(60, 64, 30, 45, '#8b9ea7') + ellipse(60, 77, 22, 30, cream) + ellipse(28, 78, 8, 23, '#8b9ea7', 'transform="rotate(25 28 78)"') + ellipse(92, 78, 8, 23, '#8b9ea7', 'transform="rotate(-25 92 78)"') + face(60, 42) + path('m53 52 7 9 7-9Z', gold) + ellipse(43, 109, 13, 5, gold) + ellipse(77, 109, 13, 5, gold),
    duckling: ellipse(58, 81, 35, 24, gold) + circle(76, 42, 23, gold) + path('m94 47 20 7-20 7Z', '#dfb085') + circle(82, 38, 3, '#544a46') + path('M23 66 9 55l8 31m26-2q16 14 28-2', gold) + line('M45 105v8m27-8v8', '#c9a16f', 4),
    treehouse: path('M10 57q-12-35 17-40 13-25 32-5 25-18 33 8 29 8 16 42Z', mint) + line('M37 73v40m45-40v40', brown, 8) + rect(25, 44, 72, 38, cream) + path('m19 45 42-31 42 31Z', rose) + rect(52, 56, 18, 26, mint) + line('M45 83v31m27-31v31m-27-5h27m-27-12h27', brown, 3),
    tent: path('M13 106 58 22l48 84Z', mint) + path('m58 22 18 84h30Zm-45 84 45-64 18 64Z', cream) + line('M58 23V12m-45 94-7 7m100-7 7 7', brown, 3) + path('m57 13 24 4-24 8Z', rose),
    ferris: circle(60, 52, 37, cream) + circle(60, 52, 7, gold) + line('M60 15v74M23 52h74M34 26l52 52m0-52L34 78m26-25-24 62m24-62 24 62m-51 0h54', '#a3b9b0', 3) + [[60,12],[96,43],[81,81],[39,81],[24,43]].map(([x,y],i)=>rect(x-9,y,18,15,i%2?mint:rose)).join(''),
    carousel: path('M12 41 60 11l48 30Z', rose) + rect(14, 42, 92, 9, gold) + line('M24 51v47m72-47v47m-36-47v47', brown, 4) + rect(10, 99, 100, 12, mint) + path('M32 80q0-22 22-14l12-15 11 10-11 14v17H38Z', cream) + line('M43 85v10m18-10v10', '#b89e86', 3),
    slide: line('M28 26v87m23-87v87m-23-8h23m-23-15h23m-23-15h23m-23-15h23m-23-15h23', '#9eaf9e', 4) + path('M43 27c33 0 20 62 61 62v17C48 106 67 43 43 43Z', blue) + path('M6 109q15-10 30 0t30 0t30 0t24 0', 'none', 'stroke="#9fc6c7" stroke-width="4"'),
    swings: line('M23 18 6 109m87-91 21 91M23 18h70', '#a3b493', 6) + line('M42 21v57m32-57v57') + rect(34, 79, 50, 10, brown) + circle(59, 100, 8, rose, 'stroke="none"'),
    telescope: path('m24 52 63-32 10 21-63 32Z', blue) + path('m85 16 10-4 14 32-10 5Z', mint) + line('M56 62v18m0 0-26 32m26-32 24 32m-24-32v34', '#ab9680', 4) + circle(30, 64, 8, cream),
    camera: rect(13, 36, 94, 65, blue, 12) + rect(25, 25, 25, 13, rose) + rect(72, 26, 18, 11, brown) + circle(62, 69, 26, '#849ca8') + circle(62, 69, 18, '#d9e8e5') + circle(57, 64, 5, cream, 'stroke="none"') + rect(86, 46, 11, 7, cream),
    paints: ellipse(51, 67, 42, 36, cream) + circle(75, 75, 10, '#faf9f6') + [[27,50,rose],[48,39,gold],[71,47,mint],[26,77,blue]].map(([x,y,c])=>circle(x,y,9,c)).join('') + line('M81 103 104 29', brown, 7) + path('m98 43-6-10 11-22 6 21Z', '#b5a3c7'),
    books: rect(18, 82, 85, 22, mint) + rect(24, 56, 78, 22, rose) + rect(17, 28, 83, 23, gold) + rect(25, 87, 75, 11, cream, 2) + rect(31, 61, 68, 11, cream, 2) + rect(24, 33, 73, 11, cream, 2) + line('M91 62v20l-6-5-6 5V62', '#c69288', 3),
    skateboard: path('M15 63q4-14 18-10l63-1q16-3 15 11c-1 13-84 18-96 0Z', mint) + circle(35, 84, 9, brown) + circle(88, 83, 9, brown) + star(64, 62, 12, gold),
    skates: path('M14 32h34v41l16 5v19H10V77h4Z', rose) + path('M67 22h30v40l16 5v21H64V66h3Z', blue) + line('M16 44h26m-26 9h26m-26 9h26m28-28h24m-24 9h24m-24 9h24', cream, 3) + [20,48].map(x=>circle(x,107,7,brown)).join('') + [74,103].map(x=>circle(x,98,7,brown)).join(''),
    kite: path('M57 9 99 43 58 78 16 43Z', rose) + path('m57 9 1 69 41-35Z', gold) + line('M16 43h83m-41 35q-25 11 4 18t-3 21', '#aa9d85', 2) + path('m57 98-10-5v10Zm0 0 10-5v10Z', mint),
    unicorn: ellipse(54, 81, 27, 22, cream) + path('M71 82V47q4-26 25-12l7 23-22 11v18Z', cream) + path('m86 33 6-23 8 24Z', gold) + path('M75 44q-18 8-12 25l-16-6 17-25Z', '#c8b1d4') + line('M37 98v14m29-14v14m17-14v14', cream, 8) + path('M27 75q-24-13-18 18', 'none', 'stroke="#c8b1d4" stroke-width="8"') + circle(93, 46, 3, '#544a46'),
    console: path('M26 40h68c20 0 30 60 10 59L82 80H38L16 99c-21 1-12-59 10-59Z', '#b9b2ce') + line('M30 55v24m-12-12h24', '#75677f', 5) + circle(87, 57, 5, rose) + circle(97, 69, 5, mint) + circle(76, 70, 5, gold) + rect(50, 60, 20, 12, cream),
    computer: rect(14, 18, 92, 63, blue) + rect(22, 26, 76, 46, '#e0efdf') + line('M60 82v18m-19 1h38', '#91a3a5', 5) + rect(11, 105, 79, 10, cream) + ellipse(105, 109, 7, 9, rose) + face(60, 47),
    wand: line('M28 107 76 41', '#ac9fc4', 9) + star(84, 32, 25, gold) + star(22, 31, 9, rose) + star(108, 83, 9, mint) + line('m20 72 9 1m-4-6-1 12', '#d6bf83', 2),
    flowers: path('m26 71 34 43 34-43Z', gold) + line('M37 74 44 44m16 30V32m23 42-8-32', '#91ad89', 4) + [[43,39,rose],[61,24,'#c9b6d7'],[79,41,gold]].map(([x,y,c])=>[[-9,0],[9,0],[0,-9],[0,9]].map(([dx,dy])=>circle(x+dx,y+dy,9,c)).join('')+circle(x,y,6,cream)).join('') + path('m60 89-15-7v15Zm0 0 15-7v15Z', rose),
    rainbow: path('M12 81a48 48 0 0 1 96 0', 'none', 'stroke="#e7aca5" stroke-width="12"') + path('M25 81a35 35 0 0 1 70 0', 'none', 'stroke="#ecd199" stroke-width="12"') + path('M38 81a22 22 0 0 1 44 0', 'none', 'stroke="#aecab5" stroke-width="12"') + ellipse(22, 89, 20, 12, cream) + ellipse(98, 89, 20, 12, cream) + face(22, 87) + face(98, 87),
};

export function rewardArt(id) {
    if (['gift', 'cake', 'car', 'house', 'rocket', 'bear'].includes(id)) return `<use href="trail.svg#${id}"/>`;
    if (!rewardShapes[id]) throw new Error(`Missing reward artwork: ${id}`);
    return ellipse(60, 112, 40, 4, '#544a4614', 'stroke="none"') + rewardShapes[id];
}

const roundBody = (color = mint) => rect(25, 23, 70, 84, color, 29) + ellipse(34, 105, 13, 7, color) + ellipse(86, 105, 13, 7, color);
const roundEars = (color, size = 13) => circle(28, 26, size, color) + circle(92, 26, size, color);
const pointedEars = (color) => path('m26 42-4-32 29 19m44 13 4-32-29 19', color);
const whiskers = () => line('M13 65h17m-16 8 17-4m59-4h17m-18 4 17 4', '#8b7c73', 2);
const wingPair = (color) => path('M30 61C-9 27 3 94 30 87m60-26c39-34 27 33 0 26', color);
const tentacles = (color, count = 6) => Array.from({ length: count }, (_, i) => line(`M${25+i*70/(count-1)} 82q${i%2?16:-16} 20 0 28`, color, 7)).join('');

const creatureShapes = {
    dragon: path('M34 53 11 33 9 82l24-8m51-21 25-20 2 49-24-8', '#c9b3d9') + path('m30 33 5-24 19 18m35 6L84 9 66 27', gold) + roundBody('#b8a5ce') + path('M91 97q29-9 17-34l-4 20-15 7', '#b8a5ce'),
    octopus: tentacles('#b8a9d3', 8) + ellipse(60, 53, 35, 35, '#c2b2db') + circle(20, 82, 6, '#ddbfdd') + circle(99, 84, 6, '#ddbfdd'),
    whale: path('M30 78 6 55 7 92l27-2', '#9abcca') + ellipse(69, 70, 40, 35, blue) + path('m65 89-19 24 31-12', blue) + line('M61 30V12m0 8-12-6m12 6 12-6', '#b6d6dc', 3),
    shark: path('M28 91 7 104 10 65l24 6m13-21 12-33 15 29', '#9cbbc8') + path('M25 94c-6-39 53-61 86-18-12 42-51 39-86 18Z', '#a9c6d2') + path('m75 100 15 11 5-21', '#91aebf'),
    crocodile: path('M30 99 7 90 19 68l25 10', mint) + rect(30, 22, 62, 82, mint, 22) + rect(17, 45, 87, 39, '#b6cf9b', 17) + path('m36 24 9-12 10 12m10 0 10-12 9 13', gold) + rect(31, 99, 20, 13, mint) + rect(75, 99, 20, 13, mint),
    hippo: roundEars('#b3aabf', 10) + roundBody('#b3aabf') + ellipse(60, 76, 39, 28, '#c8bfce') + circle(44, 57, 4, '#9e92a8') + circle(76, 57, 4, '#9e92a8'),
    bear: roundEars(brown) + roundBody(brown) + ellipse(60, 75, 31, 29, '#eed2ac') + circle(60, 60, 6, '#89745f'),
    lion: circle(60, 53, 50, '#c59973') + path('m18 31-9 18 11 13-7 22 22 3 9 19 16-10 15 10 10-19 22-3-7-22 11-13-9-18', '#c59973') + roundEars(gold, 10) + roundBody(gold),
    tiger: roundEars('#d5ab7e', 11) + roundBody(gold) + path('M26 45h18l-14 8m64-8H77l13 8M30 63h11m53 0H81M48 24l5 16m16-16-4 16m-7-17v15', 'none', 'stroke="#967660" stroke-width="5"'),
    fox: pointedEars('#d6a27d') + path('M26 104 17 52 32 23h56l15 29-9 52Z', '#d6a27d') + path('m18 62 24-7 18 17 18-17 24 7-13 27H31Z', cream) + path('M96 88q25 20 13-31l-13 19', '#d6a27d'),
    wolf: pointedEars('#a6b1b9') + path('M23 101 15 72l10-12-4-16 19-21h40l19 21-4 16 10 12-8 29-17 8-20-8-20 8Z', '#a6b1b9') + path('m30 66 30 9 30-9-15 30H45Z', cream),
    raccoon: roundEars('#a6a9a4', 10) + roundBody('#b9beb5') + path('M27 34q33 20 66 0v26q-33-17-66 0Z', '#7d817d') + path('M91 100q28-5 12-32', 'none', 'stroke="#858b83" stroke-width="11"') + line('M104 77l-9 3m10 10-10 3', '#d8dccd', 4),
    panda: roundEars('#707d76', 12) + roundBody('#eee9d9') + ellipse(42, 42, 14, 16, '#778279') + ellipse(79, 42, 14, 16, '#778279') + rect(25, 95, 20, 16, '#778279') + rect(75, 95, 20, 16, '#778279'),
    koala: roundEars('#adb6bb', 23) + circle(28, 26, 14, '#d8d5d0') + circle(92, 26, 14, '#d8d5d0') + roundBody('#b8c0c4') + ellipse(60, 59, 10, 15, '#7d898b'),
    rabbit: ellipse(39, 21, 11, 23, cream) + ellipse(83, 21, 11, 23, cream) + ellipse(39, 20, 4, 14, rose) + ellipse(83, 20, 4, 14, rose) + group(roundBody(cream), 'translate(0 8) scale(1 .95)') + circle(104, 91, 12, cream),
    cat: pointedEars('#c5b4ba') + roundBody('#c5b4ba') + whiskers() + path('M89 104q36-3 17-30', 'none', 'stroke="#c5b4ba" stroke-width="9"'),
    dog: ellipse(28, 39, 13, 29, '#b99678', 'transform="rotate(15 28 39)"') + ellipse(92, 39, 13, 29, '#b99678', 'transform="rotate(-15 92 39)"') + roundBody('#dfc7a5') + ellipse(36, 37, 12, 16, brown) + circle(60, 60, 6, '#9e7e63'),
    hamster: roundEars(gold, 10) + roundBody(gold) + circle(25, 73, 18, '#f0d3aa') + circle(95, 73, 18, '#f0d3aa') + rect(50, 53, 20, 13, cream, 3) + line('M60 53v13', '#b4a18a', 2),
    hedgehog: path('M9 83 4 64 17 60 8 44 24 43 23 24 39 30 45 12 59 23 72 10 80 29 96 24 96 42 112 44 103 59 117 68 107 86 94 109H26Z', '#a18a7a') + ellipse(60, 73, 38, 34, '#e3c9aa'),
    bat: path('M29 58 4 30 2 94l15-9 13 17 13-16m48-28 25-28 2 64-15-9-13 17-13-16', '#aa9cbd') + pointedEars('#b9a9ca') + roundBody('#b9a9ca'),
    owl: ellipse(60, 66, 37, 43, '#baa38b') + path('m26 35-2-25 24 16m46 9 2-25-24 16', '#baa38b') + ellipse(31, 75, 10, 24, '#ab947d') + ellipse(89, 75, 10, 24, '#ab947d') + circle(41, 43, 20, cream) + circle(79, 43, 20, cream) + line('M36 108h13m22 0h13', gold, 5),
    penguin: wingPair('#8da1af') + ellipse(60, 65, 33, 45, '#8da1af') + ellipse(60, 78, 25, 31, cream) + ellipse(41, 108, 16, 6, gold) + ellipse(79, 108, 16, 6, gold) + path('m54 60 6 9 6-9Z', gold),
    seal: ellipse(59, 73, 44, 31, '#b8c9c9') + circle(71, 45, 28, '#b8c9c9') + path('M24 78 5 60l-1 37 25-3m59-7 24 15-31 8', '#a4bdbd') + whiskers(),
    walrus: ellipse(60, 70, 41, 37, '#b7a394') + ellipse(60, 61, 31, 18, '#d4c0aa') + wingPair('#b7a394') + path('M38 69v32l9-27m35-5v32l-9-27', cream) + whiskers(),
    turtle: ellipse(61, 76, 48, 32, '#a3b992') + circle(60, 50, 29, '#bbd1a6') + path('M22 70 9 98l24-7m66-21 12 28-24-7', '#bbd1a6') + path('M24 82 39 68l22 6 23-6 15 14M36 98l9-14m41 14-9-14', 'none', 'stroke="#849d78" stroke-width="3"'),
    snail: circle(42, 75, 33, gold) + path('M31 70c-8 15 27 25 28 3 1-24-42-29-43-2', 'none', 'stroke="#c0a581" stroke-width="5"') + path('M45 103q-2-40 30-43 27 6 32 42Z', mint) + line('M75 52V26m20 27V30', '#9cb6a3', 6) + circle(75, 24, 10, cream) + circle(95, 29, 9, cream),
    crab: ellipse(60, 77, 35, 30, '#dfa997') + line('M28 78 11 85m20 5-19 11m27-4-17 12m70-31 17 7m-20 5 19 11m-27-4 17 12', '#d29c87', 5) + path('M23 66C-6 48 7 24 23 24l-7 20 16-16q14 24-9 38m74 0c29-18 16-42 0-42l7 20-16-16q-14 24 9 38', '#e6b49d') + line('M41 58V35m38 23V35', '#d29c87', 5),
    lobster: rect(39, 43, 42, 62, rose, 19) + ellipse(21, 40, 14, 24, '#d79a96') + ellipse(99, 40, 14, 24, '#d79a96') + line('M28 48 43 66m49-18L77 66m-34 15L19 90m24 1-23 15m57-25 24 9m-24 1 23 15', '#d39a95', 5) + path('M40 102 26 115l34-4 34 4-14-13Z', rose) + line('M41 94h38', '#b27d7e', 3),
    starfish: path('M60 8 76 40l35 3-24 29 10 37-37-18-37 18 10-37L9 43l35-3Z', '#edc093') + circle(43, 34, 3, '#daaa83', 'stroke="none"') + circle(92, 88, 3, '#daaa83', 'stroke="none"'),
    jellyfish: tentacles('#b7afce', 7) + path('M19 77C-4 6 124 6 101 77l-13-8-13 11-15-11-15 11-13-11Z', '#cfc2de'),
    pufferfish: path('M10 68 2 56l18-2-6-18 19 2 1-23 19 10 13-18 11 22 21-7-1 21 20 2-10 19 10 14-20 6-1 19-21-5-11 17-15-16-20 7-1-21-18-3 8-18Z', gold) + ellipse(61, 68, 42, 36, '#f0d394'),
    anglerfish: ellipse(61, 72, 42, 37, '#b2b6c9') + path('m23 66-20-9 2 37 25-10m34-53Q59-2 93 9', 'none', 'stroke="#8f98af" stroke-width="6"') + circle(98, 11, 10, gold) + path('m56 34 8-20 13 23', '#98a1b8'),
    manta: path('M60 28C20 30 2 49 3 78l27-11 15 28 15 7 15-7 15-28 27 11c1-29-17-48-57-50Z', '#a4c1c5') + line('M60 101q-9 11 7 14', '#85a5aa', 5),
    serpent: path('M19 105c-14-23 28-47 49-29 15 15 37 7 25-11 32 10 23 44-10 44-18 0-22-29-40-17l-15 16Z', mint) + ellipse(62, 48, 30, 31, '#b9caa5') + path('m51 24 6-15 9 12m10 10 9-14 3 24', gold),
    unicorn: pointedEars(cream) + path('M31 104 27 51q-6-24 29-23h14q32 11 23 39l-12 37Z', cream) + path('m53 29 9-28 8 28Z', gold) + path('M31 31 18 49l11 43 12-31-4-26m54 13 13 18-9 37-13-25', '#c5b1d3'),
    griffin: path('M28 68 4 30 1 88l16-8 9 18m64-30 26-38 3 58-16-8-9 18', gold) + roundBody('#d8b68b') + path('m25 32 18-20 17 10 17-10 18 20', cream) + path('M44 52h32l-16 22Z', gold),
    cyclops: path('m31 32 4-25 17 18m37 7-4-25-17 18', rose) + roundBody('#b6c8a7') + circle(60, 45, 23, cream),
    alien: path('M29 98V53c-30-33 92-58 65-3v48q-11 23-23 5-11 21-23 0-12 18-19-5Z', '#b0c2d5') + line('M34 24 25 6m61 18L96 6', '#9bacbd', 4) + circle(22, 5, 6, rose) + circle(99, 5, 6, gold),
    robot: rect(21, 18, 78, 85, '#b6c5cc', 12) + rect(7, 49, 14, 43, '#9eb0ba') + rect(99, 49, 14, 43, '#9eb0ba') + rect(24, 99, 22, 16, '#9eb0ba') + rect(74, 99, 22, 16, '#9eb0ba') + line('M60 17V5') + circle(60, 5, 6, gold) + [31,89].flatMap(x=>[27,94].map(y=>circle(x,y,3,cream))).join(''),
    mimic: rect(14, 54, 92, 52, brown) + path('M14 53V32q46-38 92 0v21Z', gold) + line('M28 20v83m64-83v83', '#a27c59', 5) + path('M28 104 19 115h20m53-11 9 11H81', rose),
    pumpkin: ellipse(60, 70, 42, 41, '#e1b080') + ellipse(60, 70, 25, 41, '#edbf8b') + path('M54 31q-6-18 9-24l7 4-6 20Z', '#9bb485') + line('M70 24q31-18 35 3q1 18-16 7', '#9bb485', 4),
    cactus: rect(34, 14, 51, 99, '#a8c199', 24) + path('M34 76H16V39h-12v41q0 17 31 13m50-17h19V39h12v41q0 17-31 13', '#a8c199') + line('M44 27v16m31 45v14m-37-40h6m-33-13h6m93 10h6', '#779d77', 2) + circle(59, 16, 8, rose),
    mushroom: rect(37, 41, 47, 72, cream, 17) + path('M7 49q8-78 106 0Z', rose) + circle(31, 33, 8, cream) + circle(66, 23, 9, cream) + circle(95, 36, 7, cream),
    slime: path('M9 94q-11-38 18-53l7-20 11 19q31-36 49-1 24 7 18 51 1 29-23 18l-17 7-15-9-15 10-15-8Q8 116 9 94Z', '#b6d4bd') + ellipse(32, 57, 10, 5, '#e1efcf', 'stroke="none"'),
    cloud: path('M25 103C3 111-5 85 12 73C-8 55 6 31 25 36C15 9 45 1 59 20C73 3 108 13 99 35C123 33 128 61 108 70C128 89 108 112 93 103C79 119 64 112 59 104C45 119 30 113 25 103Z', '#edf0e6'),
    snowman: circle(60, 81, 37, '#eef3ef') + circle(60, 44, 28, '#eef3ef') + rect(28, 21, 64, 8, '#98aeb2') + rect(40, 2, 40, 21, '#98aeb2') + line('M24 71 5 54m91 17 19-17', brown, 4) + path('M32 66h58v11H32Zm51 10h10v21H83Z', rose),
    duck: ellipse(60, 79, 40, 30, gold) + circle(60, 44, 31, gold) + path('M33 64h54l-9 21H42Z', '#dda47b') + ellipse(39, 109, 18, 5, '#dda47b') + ellipse(81, 109, 18, 5, '#dda47b') + path('m48 17 6-9 9 7', gold),
    elephant: ellipse(25, 49, 23, 35, '#afbfc1') + ellipse(95, 49, 23, 35, '#afbfc1') + roundBody('#bac9cb') + path('M55 55c-4 8 4 20 16 9 16-7 15 13 27 7v-11c-13 1-10-18-25-13-8 4-9-2-8-3Z', '#b5c6c8'),
    bison: path('M28 40Q-1 5 5 51l23 4m64-15Q121 5 115 51l-23 4', cream) + roundBody('#af947a') + path('m25 36 8-22 16 7 12-15 13 15 17-6 6 22-22 19-27-1Z', '#8c796a') + ellipse(60, 72, 30, 25, brown),
    deer: pointedEars(brown) + line('M37 26 23 8m9 11-17-2m13-3 4-12m51 24L97 8m-9 11 17-2m-13-3-4-12', '#a59175', 5) + roundBody(brown) + ellipse(60, 73, 28, 26, cream),
    goat: pointedEars('#d1cbbb') + path('M35 32C6 0 45-1 46 26m39 6C114 0 75-1 74 26', '#b6a58c') + roundBody('#d1cbbb') + path('m48 104 12 15 12-15Z', cream) + line('M44 59h32', '#b4a991', 3),
    moose: path('M33 33 8 23 4 7l12 7 2-11 9 17 13 4m47 9 25-10 4-16-12 7-2-11-9 17-13 4', gold) + roundBody('#bca489') + ellipse(60, 73, 34, 30, '#d6c0a2'),
    kangaroo: ellipse(37, 23, 8, 23, brown, 'transform="rotate(-19 37 23)"') + ellipse(83, 23, 8, 23, brown, 'transform="rotate(19 83 23)"') + roundBody(brown) + path('M92 90q27 18 25-23-8 25-23 9', brown) + path('M40 96q20 22 40 0v18H40Z', '#e3c9a3'),
    monkey: roundEars(brown, 19) + roundBody('#bca086') + ellipse(60, 62, 31, 36, '#ebd2b0') + path('M91 97q35 17 19-28-10-18-16 0', 'none', 'stroke="#bca086" stroke-width="7"'),
    giraffe: rect(33, 26, 54, 87, gold, 23) + line('M43 28V9m34 19V9', '#be986f', 7) + circle(43, 7, 7, brown) + circle(77, 7, 7, brown) + pointedEars(gold) + [[39,66],[79,87],[48,105],[83,31]].map(([x,y])=>rect(x,y,10,9,brown,3)).join(''),
    zebra: pointedEars(cream) + roundBody(cream) + path('M45 23h30l-8 19H52Z', '#7f8581') + line('M27 47h15m-15 14h11m55-14H78m15 14H82m-47 42 4-13m36 13-4-13', '#8c918a', 5),
};

export function creatureArt(id) {
    if (['monster', 'dinosaur', 'frog', 'yeti'].includes(id)) return `<use href="trail.svg#${id}"/>`;
    if (!creatureShapes[id]) throw new Error(`Missing creature artwork: ${id}`);
    let art = creatureShapes[id];
    const eyeY = ['snail', 'mushroom'].includes(id) ? 60 : 43;
    if (id === 'cyclops') art += circle(60, 43, 13, '#6e705f') + circle(63, 40, 4, cream, 'stroke="none"');
    else {
        const eyes = id === 'alien' ? [35, 60, 85] : [43, 77];
        art += eyes.map(x=>circle(x, eyeY, id==='alien'?8:9, cream) + circle(x+1, eyeY+1, 3, '#544a46') + circle(x+2, eyeY, 1, '#ffffff', 'stroke="none"')).join('');
    }
    const mouthY = ['mushroom', 'snail'].includes(id) ? 89 : 80;
    art += ellipse(60, mouthY, 23, 19, '#766879') + ellipse(60, mouthY+12, 12, 5, '#e9aab8', 'stroke="none"');
    if (['dragon','shark','crocodile','tiger','wolf','bat','anglerfish','serpent','griffin','mimic','pumpkin','robot'].includes(id)) art += path(`m43 ${mouthY-13} 6 10 5-13m12 0 5 13 6-10`, cream, 'stroke="none"');
    art += line(`M25 ${mouthY-16}h6m58 0h6`, '#e2a9aa', 4);
    return art;
}
