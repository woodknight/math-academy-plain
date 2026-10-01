import sharp from 'sharp';

export async function normalizeAvatarPhoto(value) {
    const invalid = () => { throw Object.assign(new Error('Use a cropped 256 × 256 JPG, PNG or WebP photo, under 150 KB.'), { status: 400 }); };
    if (value === '') return '';
    if (typeof value !== 'string' || value.length > 200_000) invalid();
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match) invalid();
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.toString('base64') !== match[2]) invalid();
    try {
        const image = sharp(bytes, { limitInputPixels: 256 * 256, failOn: 'error' });
        const metadata = await image.metadata();
        if (metadata.width !== 256 || metadata.height !== 256 || (metadata.pages ?? 1) !== 1
            || !['jpeg', 'png', 'webp'].includes(metadata.format)) invalid();
        // Decode, strip metadata and save only the final square avatar.
        const normalized = await image.rotate().resize(256, 256).jpeg({ quality: 85 }).toBuffer();
        return `data:image/jpeg;base64,${normalized.toString('base64')}`;
    } catch (error) {
        if (error.status) throw error;
        invalid();
    }
}
