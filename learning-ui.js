import { learningSummary, FEATURE_LABELS } from './learning.js';

const $ = selector => document.querySelector(selector);
const percentage = (correct, count) => count ? `${Math.round(correct / count * 100)}%` : '—';
const seconds = ms => ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`;
export class LearningUI {
    constructor({ client, onOpen, onClose }) {
        Object.assign(this, { client, onOpen, onClose });
        $('#profile-learning').addEventListener('click', () => {
            $('#player-dialog').close();
            onOpen();
            $('#learning-dialog').showModal();
            this.render();
            client.setPlayer(client.playerId);
        });
        $('#learning-dialog [data-close-dialog]').addEventListener('click', () => $('#learning-dialog').close());
        $('#learning-dialog').addEventListener('close', onClose);
        $('#learning-retry').addEventListener('click', () => client.setPlayer(client.playerId));
        this.render();
    }
    render() {
        const summary = learningSummary(this.client.state), totals = summary.totals;
        $('#learning-question-count').textContent = totals.questions;
        $('#learning-first-correct').textContent = percentage(totals.firstCorrect, totals.questions);
        $('#learning-retries').textContent = totals.retryCorrect;
        $('#learning-revealed').textContent = totals.revealed;
        $('#learning-recommendation').textContent = summary.recommendation;
        const cells = values => values.map(value => { const td = document.createElement('td'); td.textContent = value; return td; });
        const rows = summary.skills.map(skill => {
            const row = document.createElement('tr');
            row.append(...cells([skill.label, skill.display === 'dots' ? 'Dots' : 'Numbers', skill.questions,
                skill.accuracy === null ? '—' : `${Math.round(skill.accuracy * 100)}%`, seconds(skill.speedMs), skill.status]));
            return row;
        });
        $('#learning-skills').replaceChildren(...rows);
        $('#learning-features').replaceChildren(...Object.entries(summary.features).map(([key, count]) => {
            const [tag, operation, display] = key.split(':'), row = document.createElement('tr');
            row.append(...cells([`${operation === 'addition' ? '+' : '−'} ${FEATURE_LABELS[tag]}`, display === 'dots' ? 'Dots' : 'Numbers', count.questions,
                percentage(count.firstCorrect, count.questions)]));
            return row;
        }));
        $('#learning-feature-section').hidden = !Object.keys(summary.features).length;
        $('#learning-status').textContent = this.client.error || (!this.client.playerId ? 'Guest progress lasts for this visit.'
            : this.client.ownPending().length ? `${this.client.ownPending().length} answers waiting to save.`
                : this.client.ready ? 'All learning progress saved.' : 'Loading learning progress…');
        $('#learning-retry').hidden = !this.client.error;
    }
}
