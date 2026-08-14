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
