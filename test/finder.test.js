import assert from 'node:assert/strict';
import test from 'node:test';
import { findOutliers } from '../src/finder.js';

function video(id, views, durationSeconds) {
    return {
        id,
        url: `https://www.youtube.com/watch?v=${id}`,
        channelId: 'channel',
        title: id,
        views,
        durationSeconds,
        publishedAt: '2026-09-18T00:00:00Z',
    };
}

test('outlier baseline compares a Short only with Shorts from the same channel', async () => {
    const target = video('target', 10000, 45);
    const uploads = [
        target,
        video('long-1', 100000, 300),
        video('short-1', 1000, 30),
        video('long-2', 200000, 240),
        video('short-2', 2000, 60),
        video('short-3', 3000, 90),
    ];
    const client = {
        searchVideoIds: async () => ['target'],
        fetchVideos: async (ids) => ids.length === 1 && ids[0] === 'target' ? [target] : uploads,
        fetchChannels: async () => [{ id: 'channel', title: 'Channel', subscribers: 100, uploadsPlaylistId: 'uploads' }],
        fetchRecentUploadIds: async () => uploads.map((item) => item.id),
    };

    const [result] = await findOutliers({ client, contentType: 'short', requireBaseline: true, includeBaselineVideos: true });
    assert.equal(result.baselineVideoCount, 3);
    assert.equal(result.baselineViews, 2000);
    assert.equal(result.outlierScore, 5);
    assert.deepEqual(result.baselineVideos.map((item) => item.id), ['short-1', 'short-2', 'short-3']);
});
