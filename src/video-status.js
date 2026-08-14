import { normalizeYouTubePrivacy } from './upload.js';

const MUTABLE_STATUS_FIELDS = [
    'license',
    'embeddable',
    'publicStatsViewable',
    'selfDeclaredMadeForKids',
    'containsSyntheticMedia',
];

export function buildYouTubeStatusUpdate(video, privacy) {
    if (!video?.id) throw new Error('A YouTube video resource with an ID is required.');
    if (!video.status) throw new Error(`YouTube video ${video.id} did not include status data.`);

    const privacyStatus = normalizeYouTubePrivacy(privacy);
    const status = { privacyStatus };
    for (const field of MUTABLE_STATUS_FIELDS) {
        if (video.status[field] !== undefined) status[field] = video.status[field];
    }
    if (privacyStatus === 'private' && video.status.publishAt) {
        status.publishAt = video.status.publishAt;
    }

    return { id: video.id, status };
}

export async function waitForYouTubePrivacy({
    client,
    videoId,
    privacy,
    attempts = 5,
    delayMs = 500,
    sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
    const expected = normalizeYouTubePrivacy(privacy);
    let video = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        video = await client.fetchVideo(videoId, { part: 'snippet,status' });
        if (video?.status?.privacyStatus === expected) return video;
        if (attempt < attempts) await sleep(delayMs * attempt);
    }
    throw new Error(`YouTube visibility verification failed: expected ${expected}, got ${video?.status?.privacyStatus || 'unknown'}.`);
}
