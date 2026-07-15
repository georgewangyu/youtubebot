import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import test from 'node:test';
import {
    buildYouTubeVideoResource,
    initiateYouTubeResumableUpload,
    normalizeYouTubeChunkSize,
    uploadYouTubeVideoFile,
} from '../src/upload.js';

test('buildYouTubeVideoResource defaults to a safe private upload', () => {
    assert.deepEqual(buildYouTubeVideoResource({
        title: 'Video title',
        tags: 'ai, workflow',
        containsSyntheticMedia: true,
    }), {
        snippet: {
            title: 'Video title',
            description: '',
            categoryId: '22',
            tags: ['ai', 'workflow'],
        },
        status: {
            privacyStatus: 'private',
            selfDeclaredMadeForKids: false,
            containsSyntheticMedia: true,
        },
    });
    assert.throws(() => buildYouTubeVideoResource({ title: '' }), /title is required/);
    assert.throws(() => buildYouTubeVideoResource({
        title: 'Scheduled',
        privacy: 'public',
        publishAt: '2026-08-01T12:00:00Z',
    }), /must start with privacy=private/);
});

test('initiateYouTubeResumableUpload sends metadata and returns Location', async () => {
    let request = null;
    const uploadUrl = await initiateYouTubeResumableUpload({
        accessToken: 'access-token',
        fileSize: 1234,
        contentType: 'video/mp4',
        videoResource: buildYouTubeVideoResource({ title: 'Test' }),
        fetchImpl: async (url, options) => {
            request = { url: String(url), options };
            return new Response('', {
                status: 200,
                headers: { location: 'https://upload.youtube.test/session' },
            });
        },
    });
    assert.equal(uploadUrl, 'https://upload.youtube.test/session');
    assert.match(request.url, /uploadType=resumable/);
    assert.equal(request.options.headers.Authorization, 'Bearer access-token');
    assert.equal(request.options.headers['X-Upload-Content-Length'], '1234');
});

test('uploadYouTubeVideoFile follows resumable chunk ranges', async () => {
    const root = await mkdtemp(join(tmpdir(), 'youtubebot-upload-'));
    const filePath = join(root, 'video.mp4');
    const bytes = Buffer.alloc((512 * 1024) + 10, 7);
    await writeFile(filePath, bytes);
    const requests = [];
    try {
        const result = await uploadYouTubeVideoFile({
            uploadUrl: 'https://upload.youtube.test/session',
            filePath,
            chunkSize: 256 * 1024,
            fetchImpl: async (_url, options) => {
                requests.push(options);
                if (requests.length === 1) {
                    return new Response('', { status: 308, headers: { range: 'bytes=0-262143' } });
                }
                if (requests.length === 2) {
                    return new Response('', { status: 308, headers: { range: 'bytes=0-524287' } });
                }
                return new Response(JSON.stringify({ id: 'video-123', status: { privacyStatus: 'private' } }), {
                    status: 201,
                    headers: { 'content-type': 'application/json' },
                });
            },
        });
        assert.equal(result.video.id, 'video-123');
        assert.equal(result.chunksUploaded, 3);
        assert.equal(requests[0].headers['Content-Range'], `bytes 0-262143/${bytes.length}`);
        assert.equal(requests[2].headers['Content-Range'], `bytes 524288-${bytes.length - 1}/${bytes.length}`);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test('normalizeYouTubeChunkSize enforces 256 KiB granularity', () => {
    assert.equal(normalizeYouTubeChunkSize(300_000), 256 * 1024);
    assert.throws(() => normalizeYouTubeChunkSize(1000), /at least/);
});
