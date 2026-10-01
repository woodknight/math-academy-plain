import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { SpeechService } from './speech-service.js';

const files = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/index.html', ['index.html', 'text/html; charset=utf-8']],
    ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
    ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
    ['/game.js', ['game.js', 'text/javascript; charset=utf-8']],
    ['/adventures.js', ['adventures.js', 'text/javascript; charset=utf-8']],
    ['/adventure-art.js', ['adventure-art.js', 'text/javascript; charset=utf-8']],
    ['/speech.js', ['speech.js', 'text/javascript; charset=utf-8']],
    ['/trail.svg', ['trail.svg', 'image/svg+xml']],
]);
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '127.0.0.1';
const speech = new SpeechService();

createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' });
        response.end('Method not allowed');
        return;
    }
    const url = new URL(request.url || '/', `http://${host}:${port}`);
    const pathname = url.pathname;
    if (pathname === '/api/speech') {
        try {
            if (url.searchParams.getAll('text').length !== 1) throw Object.assign(new Error('Provide one number sentence.'), { status: 400 });
            const audio = await speech.audioFor(url.searchParams.get('text'));
            if (response.destroyed) return;
            response.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': audio.length, 'Cache-Control': 'no-store' });
            response.end(request.method === 'HEAD' ? undefined : audio);
        } catch (error) {
            if (response.destroyed) return;
            const status = error.status || 503;
            if (status === 503) console.error(`Local voice: ${error.message}`);
            response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ error: status === 400 ? 'Invalid number sentence.' : 'Voice is unavailable. Please try again.' }));
        }
        return;
    }
    const file = files.get(pathname);
    if (!file) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
    }
    try {
        const body = await readFile(new URL(file[0], import.meta.url));
        response.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-cache' });
        response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Unable to load page');
    }
}).listen(port, host, () => console.log(`Little Sums is running at http://${host}:${port}`));

speech.audioFor('What is 3 plus 2?')
    .then(() => console.log(`Local voice ready: Kokoro ${speech.voice} (CPU).`))
    .catch(error => console.error(`Local voice: ${error.message}`));
