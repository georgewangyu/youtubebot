import assert from 'node:assert/strict';
import test from 'node:test';
import { buildYouTubeStatusUpdate } from '../src/video-status.js';
import { YouTubeClient } from '../src/youtube.js';

test('buildYouTubeStatusUpdate preserves mutable status fields without read-only fields', () => {
    const update = buildYouTubeStatusUpdate({
        id: 'video-123',
        status: {
            uploadStatus: 'processed',
            privacyStatus: 'private',
            publishAt: '2026-09-01T12:00:00Z',
            license: 'youtube',
            embeddable: true,
            publicStatsViewable: true,
            selfDeclaredMadeForKids: false,
            containsSyntheticMedia: false,
        },
    }, 'public');

    assert.deepEqual(update, {
        id: 'video-123',
        status: {
            privacyStatus: 'public',
            license: 'youtube',
            embeddable: true,
            publicStatsViewable: true,
            selfDeclaredMadeForKids: false,
            containsSyntheticMedia: false,
        },
    });
    assert.equal('uploadStatus' in update.status, false);
    assert.equal('publishAt' in update.status, false);
});

test('buildYouTubeStatusUpdate preserves scheduling only for private status', () => {
    const update = buildYouTubeStatusUpdate({
        id: 'video-123',
        status: { privacyStatus: 'private', publishAt: '2026-09-01T12:00:00Z' },
    }, 'private');
    assert.equal(update.status.publishAt, '2026-09-01T12:00:00Z');
});

test('YouTubeClient issues videos.update as an authenticated PUT and can verify it', async () => {
    const requests = [];
    const client = new YouTubeClient({
        accessToken: 'access-token',
        fetchImpl: async (url, options) => {
            requests.push({ url: String(url), options });
            return new Response(JSON.stringify({
                id: 'video-123',
                status: { privacyStatus: 'public' },
            }), { status: 200, headers: { 'content-type': 'application/json' } });
        },
    });
    const resource = { id: 'video-123', status: { privacyStatus: 'public' } };
    await client.updateVideoStatus(resource);

    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /\/youtube\/v3\/videos\?part=status$/);
    assert.equal(requests[0].options.method, 'PUT');
    assert.equal(requests[0].options.headers.Authorization, 'Bearer access-token');
    assert.deepEqual(JSON.parse(requests[0].options.body), resource);
});
