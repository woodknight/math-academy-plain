// Original, short melodies: a bright major celebration and a jaunty minor retry.
export function roundScore(outcome) {
    const win = outcome === 'reward';
    const melody = win ? [72, 76, 79, 76, 81, 79, 84, 83, 84] : [76, 75, 72, 71, 69, 72, 71, 68, 69];
    return melody.map((midi, index) => ({ midi, start: index * .28, duration: index === 8 ? .62 : .23 }))
        .concat([0, 1, 2, 3, 4].map(index => ({ midi: (win ? [48, 55] : [45, 52])[index % 2], start: index * .56, duration: .43, bass: true })));
}
export class RoundMusicPlayer {
    constructor(getContext) { this.getContext = getContext; }
    play(outcome) {
        this.stop();
        const context = this.getContext();
        if (!context || context.state !== 'running') return Promise.resolve();
        return new Promise(resolve => {
            const nodes = new Set();
            let timer;
            const finish = () => {
                if (this.finish !== finish) return;
                this.finish = null;
                clearTimeout(timer);
                for (const { oscillator, gain } of nodes) {
                    oscillator.onended = null;
                    try { oscillator.stop(); } catch { /* Already ended. */ }
                    oscillator.disconnect(); gain.disconnect();
                }
                nodes.clear(); resolve();
            };
            this.finish = finish;
            try {
                for (const note of roundScore(outcome)) {
                    const oscillator = context.createOscillator();
                    const gain = context.createGain();
                    const node = { oscillator, gain };
                    nodes.add(node);
                    const start = context.currentTime + .03 + note.start;
                    oscillator.type = note.bass ? 'sine' : 'triangle';
                    oscillator.frequency.setValueAtTime(440 * 2 ** ((note.midi - 69) / 12), start);
                    gain.gain.setValueAtTime(0, start);
                    gain.gain.linearRampToValueAtTime(note.bass ? .07 : .11, start + .015);
                    gain.gain.exponentialRampToValueAtTime(.001, start + note.duration);
                    oscillator.connect(gain); gain.connect(context.destination);
                    oscillator.onended = () => {
                        nodes.delete(node); oscillator.disconnect(); gain.disconnect();
                        if (!nodes.size) finish();
                    };
                    oscillator.start(start); oscillator.stop(start + note.duration + .03);
                }
                timer = setTimeout(finish, 4500);
            } catch { finish(); }
        });
    }
    stop() { this.finish?.(); }
}
