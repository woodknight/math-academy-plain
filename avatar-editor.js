// Coordinates are bounded to the original image, so the crop never has blank edges.
export function cropRectangle(width, height, zoom = 1, x = .5, y = .5) {
    const side = Math.min(width, height) / Math.max(1, Math.min(3, zoom));
    return { x: (width - side) * Math.max(0, Math.min(1, x)),
        y: (height - side) * Math.max(0, Math.min(1, y)), side };
}

export class AvatarEditor {
    constructor({ onError, onLoading }) {
        this.canvas = document.querySelector('#avatar-crop');
        this.onError = onError;
        this.onLoading = onLoading;
        this.input = document.querySelector('#avatar-upload');
        this.controls = ['zoom', 'x', 'y'].map(id => document.querySelector(`#avatar-${id}`));
        this.input.addEventListener('change', () => this.load(this.input.files[0]));
        this.controls.forEach(control => control.addEventListener('input', () => this.draw()));
        document.querySelector('#avatar-remove').addEventListener('click', () => this.clear());
        this.canvas.addEventListener('pointerdown', event => {
            if (!this.image) return;
            this.drag = { x: event.clientX, y: event.clientY, left: +this.controls[1].value, top: +this.controls[2].value };
            this.canvas.setPointerCapture(event.pointerId);
        });
        this.canvas.addEventListener('pointermove', event => {
            if (!this.drag || !this.image) return;
            const crop = this.rectangle();
            const scale = crop.side / this.canvas.getBoundingClientRect().width;
            const clamp = value => Math.max(0, Math.min(1, value));
            if (this.image.width > crop.side) this.controls[1].value = clamp(this.drag.left - (event.clientX - this.drag.x) * scale / (this.image.width - crop.side));
            if (this.image.height > crop.side) this.controls[2].value = clamp(this.drag.top - (event.clientY - this.drag.y) * scale / (this.image.height - crop.side));
            this.draw();
        });
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => this.canvas.addEventListener(type, () => { this.drag = null; }));
        this.reset('');
    }
    reset(photo) {
        this.generation = (this.generation || 0) + 1;
        this.loading = false;
        this.onLoading(false);
        this.image = null;
        this.photo = photo;
        this.input.value = '';
        this.controls[0].value = 1;
        this.controls[1].value = this.controls[2].value = .5;
        document.querySelector('#avatar-crop-controls').hidden = true;
        const preview = document.querySelector('#avatar-photo-preview');
        preview.hidden = !photo;
        preview.src = photo || '';
        document.querySelector('#avatar-remove').hidden = !photo;
    }
    clear() { this.reset(''); }
    async load(file) {
        if (!file) return;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
            this.onError('Choose a JPG, PNG or WebP photo under 10 MB.');
            this.input.value = '';
            return;
        }
        const generation = ++this.generation;
        this.loading = true;
        this.onLoading(true);
        this.onError('');
        const url = URL.createObjectURL(file);
        try {
            const image = new Image();
            image.src = url;
            await image.decode();
            if (generation !== this.generation) return;
            this.image = image;
            this.controls[0].value = 1;
            this.controls[1].value = this.controls[2].value = .5;
            document.querySelector('#avatar-photo-preview').hidden = true;
            document.querySelector('#avatar-crop-controls').hidden = false;
            document.querySelector('#avatar-remove').hidden = false;
            this.draw();
        } catch {
            if (generation === this.generation) this.onError('This photo could not be opened. Try another image.');
        } finally {
            URL.revokeObjectURL(url);
            if (generation === this.generation) { this.loading = false; this.onLoading(false); }
        }
    }
    rectangle() { return cropRectangle(this.image.width, this.image.height, ...this.controls.map(control => +control.value)); }
    draw() {
        if (!this.image) return;
        const { x, y, side } = this.rectangle();
        const ctx = this.canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, 256, 256);
        ctx.drawImage(this.image, x, y, side, side, 0, 0, 256, 256);
        this.photo = this.canvas.toDataURL('image/jpeg', .88);
    }
    value() { return this.photo; }
}
