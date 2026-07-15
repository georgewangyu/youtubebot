import { open, stat } from 'fs/promises';
import { extname, resolve } from 'path';

const UPLOAD_ROOT = 'https://www.googleapis.com/upload/youtube/v3/videos';
const CHUNK_GRANULARITY = 256 * 1024;

export function normalizeYouTubePrivacy(value) {
    const privacy = String(value || '').trim().toLowerCase();
    if (['private', 'unlisted', 'public'].includes(privacy)) return privacy;
    throw new Error(`Invalid YouTube privacy: ${value}. Use private, unlisted, or public.`);
}

export function buildYouTubeVideoResource({
    title,
    description = '',
    tags = [],
    categoryId = '22',
    privacy = 'private',
    madeForKids = false,
    containsSyntheticMedia = false,
    publishAt,
} = {}) {
    if (!String(title || '').trim()) throw new Error('YouTube video title is required.');
    const privacyStatus = normalizeYouTubePrivacy(privacy);
    if (publishAt && privacyStatus !== 'private') {
        throw new Error('YouTube scheduled publishAt uploads must start with privacy=private.');
    }
    const normalizedTags = Array.isArray(tags)
        ? tags.map((tag) => String(tag).trim()).filter(Boolean)
        : String(tags || '').split(',').map((tag) => tag.trim()).filter(Boolean);

    return {
        snippet: {
            title: String(title).trim(),
            description: String(description || ''),
            categoryId: String(categoryId || '22'),
            ...(normalizedTags.length ? { tags: normalizedTags } : {}),
        },
        status: {
            privacyStatus,
            selfDeclaredMadeForKids: Boolean(madeForKids),
            containsSyntheticMedia: Boolean(containsSyntheticMedia),
            ...(publishAt ? { publishAt: new Date(publishAt).toISOString() } : {}),
        },
    };
}

export async function inspectYouTubeVideoFile(filePath) {
    const path = resolve(String(filePath || ''));
    const details = await stat(path).catch(() => null);
    if (!details?.isFile()) throw new Error(`YouTube video file does not exist: ${path}`);
    if (!details.size) throw new Error(`YouTube video file is empty: ${path}`);

    const contentTypes = {
        '.mp4': 'video/mp4',
        '.mov': 'video/quicktime',
        '.webm': 'video/webm',
        '.mkv': 'video/x-matroska',
        '.avi': 'video/x-msvideo',
        '.mpeg': 'video/mpeg',
        '.mpg': 'video/mpeg',
    };
    return {
        path,
        size: details.size,
        contentType: contentTypes[extname(path).toLowerCase()] || 'application/octet-stream',
    };
}

export function normalizeYouTubeChunkSize(chunkSize = 8 * 1024 * 1024) {
    const value = Number(chunkSize);
    if (!Number.isSafeInteger(value) || value < CHUNK_GRANULARITY) {
        throw new Error(`YouTube upload chunks must be at least ${CHUNK_GRANULARITY} bytes.`);
    }
    return Math.floor(value / CHUNK_GRANULARITY) * CHUNK_GRANULARITY;
}

export async function initiateYouTubeResumableUpload({
    accessToken,
    fileSize,
    contentType,
    videoResource,
    fetchImpl = globalThis.fetch,
}) {
    if (!accessToken) throw new Error('Missing YouTube OAuth access token');
    const url = new URL(UPLOAD_ROOT);
    url.searchParams.set('uploadType', 'resumable');
    url.searchParams.set('part', Object.keys(videoResource).join(','));
    const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Length': String(fileSize),
            'X-Upload-Content-Type': contentType,
        },
        body: JSON.stringify(videoResource),
    });
    if (!response.ok) {
        throw new Error(`YouTube upload initialization failed: ${await formatYouTubeError(response)}`);
    }
    const uploadUrl = response.headers.get('location');
    if (!uploadUrl) throw new Error('YouTube upload initialization did not return a Location header.');
    return uploadUrl;
}

export async function uploadYouTubeVideoFile({
    uploadUrl,
    filePath,
    contentType,
    chunkSize,
    fetchImpl = globalThis.fetch,
}) {
    if (!uploadUrl) throw new Error('Missing YouTube resumable upload URL');
    const file = await inspectYouTubeVideoFile(filePath);
    const normalizedChunkSize = normalizeYouTubeChunkSize(chunkSize);
    const handle = await open(file.path, 'r');
    let nextByte = 0;
    let chunksUploaded = 0;

    try {
        while (nextByte < file.size) {
            const bytesToRead = Math.min(normalizedChunkSize, file.size - nextByte);
            const buffer = Buffer.allocUnsafe(bytesToRead);
            const { bytesRead } = await handle.read(buffer, 0, bytesToRead, nextByte);
            if (bytesRead !== bytesToRead) {
                throw new Error(`Could not read YouTube upload chunk; expected ${bytesToRead} bytes, got ${bytesRead}`);
            }
            const lastByte = nextByte + bytesRead - 1;
            const response = await fetchImpl(uploadUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': contentType || file.contentType,
                    'Content-Length': String(bytesRead),
                    'Content-Range': `bytes ${nextByte}-${lastByte}/${file.size}`,
                },
                body: buffer,
            });
            chunksUploaded += 1;

            if (response.status === 308) {
                const range = response.headers.get('range');
                const match = range?.match(/bytes=0-(\d+)/i);
                nextByte = match ? Number(match[1]) + 1 : lastByte + 1;
                continue;
            }
            if (!response.ok) {
                throw new Error(`YouTube video upload failed: ${await formatYouTubeError(response)}`);
            }
            const video = await response.json().catch(() => ({}));
            return {
                video,
                bytesUploaded: file.size,
                chunksUploaded,
                chunkSize: normalizedChunkSize,
            };
        }
    } finally {
        await handle.close();
    }

    throw new Error('YouTube upload ended without a completed video response.');
}

export async function uploadYouTubeVideo({
    accessToken,
    filePath,
    videoResource,
    chunkSize = 8 * 1024 * 1024,
    fetchImpl = globalThis.fetch,
}) {
    const file = await inspectYouTubeVideoFile(filePath);
    const uploadUrl = await initiateYouTubeResumableUpload({
        accessToken,
        fileSize: file.size,
        contentType: file.contentType,
        videoResource,
        fetchImpl,
    });
    return uploadYouTubeVideoFile({
        uploadUrl,
        filePath: file.path,
        contentType: file.contentType,
        chunkSize,
        fetchImpl,
    });
}

async function formatYouTubeError(response) {
    const json = await response.json().catch(() => null);
    return json?.error?.message || `${response.status} ${response.statusText}`;
}
