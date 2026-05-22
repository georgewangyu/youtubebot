import { getYouTubeApiKey } from './credentials.js';
import { parseDurationSeconds, toNumber } from './scoring.js';

const API_ROOT = 'https://www.googleapis.com/youtube/v3';

function chunk(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

export class YouTubeClient {
    constructor({ apiKey, accessToken } = {}) {
        this.apiKey = apiKey || getYouTubeApiKey();
        this.accessToken = accessToken || '';
        if (!this.apiKey && !this.accessToken) {
            throw new Error('Missing credentials: set YOUTUBE_API_KEY for public reads or YOUTUBE_ACCESS_TOKEN for OAuth reads');
        }
    }

    async request(resource, params = {}) {
        const url = new URL(`${API_ROOT}/${resource}`);
        const requestParams = this.apiKey ? { ...params, key: this.apiKey } : params;
        for (const [key, value] of Object.entries(requestParams)) {
            if (value === undefined || value === null || value === '') continue;
            url.searchParams.set(key, String(value));
        }

        const headers = {};
        if (this.accessToken) {
            headers.Authorization = `Bearer ${this.accessToken}`;
        }

        const response = await fetch(url, { headers });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
            const message = json?.error?.message || `${response.status} ${response.statusText}`;
            throw new Error(`YouTube API error for ${resource}: ${message}`);
        }
        return json;
    }

    async fetchMyChannels() {
        const page = await this.request('channels', {
            part: 'snippet,statistics,contentDetails',
            mine: true,
            maxResults: 50,
        });
        return (page.items || []).map(mapChannel);
    }

    async searchVideoIds({
        query,
        maxResults = 50,
        order = 'viewCount',
        publishedAfter,
        videoDuration,
        regionCode = 'US',
        relevanceLanguage = 'en',
    }) {
        const ids = [];
        let pageToken = null;

        while (ids.length < maxResults) {
            const pageSize = Math.min(50, maxResults - ids.length);
            const page = await this.request('search', {
                part: 'snippet',
                type: 'video',
                q: query,
                maxResults: pageSize,
                order,
                pageToken,
                publishedAfter,
                videoDuration,
                regionCode,
                relevanceLanguage,
            });

            for (const item of page.items || []) {
                if (item.id?.videoId) ids.push(item.id.videoId);
            }
            pageToken = page.nextPageToken;
            if (!pageToken) break;
        }

        return unique(ids);
    }

    async fetchVideos(videoIds) {
        const videos = [];
        for (const batch of chunk(unique(videoIds), 50)) {
            const page = await this.request('videos', {
                part: 'snippet,statistics,contentDetails',
                id: batch.join(','),
                maxResults: 50,
            });
            videos.push(...(page.items || []).map(mapVideo));
        }
        return videos;
    }

    async fetchChannels(channelIds) {
        const channels = [];
        for (const batch of chunk(unique(channelIds), 50)) {
            const page = await this.request('channels', {
                part: 'snippet,statistics,contentDetails',
                id: batch.join(','),
                maxResults: 50,
            });
            channels.push(...(page.items || []).map(mapChannel));
        }
        return channels;
    }

    async fetchRecentUploadIds(uploadsPlaylistId, { maxVideos = 12, publishedAfter } = {}) {
        const ids = [];
        let pageToken = null;

        while (ids.length < maxVideos) {
            const pageSize = Math.min(50, maxVideos - ids.length);
            const page = await this.request('playlistItems', {
                part: 'snippet,contentDetails',
                playlistId: uploadsPlaylistId,
                maxResults: pageSize,
                pageToken,
            });

            for (const item of page.items || []) {
                const videoId = item.contentDetails?.videoId;
                const publishedAt = item.contentDetails?.videoPublishedAt || item.snippet?.publishedAt;
                if (publishedAfter && publishedAt && new Date(publishedAt) < new Date(publishedAfter)) {
                    continue;
                }
                if (videoId) ids.push(videoId);
            }

            pageToken = page.nextPageToken;
            if (!pageToken) break;
        }

        return unique(ids).slice(0, maxVideos);
    }
}

function mapVideo(item) {
    const snippet = item.snippet || {};
    const stats = item.statistics || {};
    const details = item.contentDetails || {};

    return {
        id: item.id,
        url: `https://www.youtube.com/watch?v=${item.id}`,
        title: snippet.title || '',
        description: snippet.description || '',
        channelId: snippet.channelId || '',
        channelTitle: snippet.channelTitle || '',
        publishedAt: snippet.publishedAt || '',
        views: toNumber(stats.viewCount),
        likes: toNumber(stats.likeCount),
        comments: toNumber(stats.commentCount),
        duration: details.duration || '',
        durationSeconds: parseDurationSeconds(details.duration),
        thumbnail: snippet.thumbnails?.maxres?.url || snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || '',
    };
}

function mapChannel(item) {
    const snippet = item.snippet || {};
    const stats = item.statistics || {};
    const contentDetails = item.contentDetails || {};

    return {
        id: item.id,
        url: `https://www.youtube.com/channel/${item.id}`,
        title: snippet.title || '',
        customUrl: snippet.customUrl || '',
        subscribers: toNumber(stats.subscriberCount),
        hiddenSubscriberCount: Boolean(stats.hiddenSubscriberCount),
        videoCount: toNumber(stats.videoCount),
        viewCount: toNumber(stats.viewCount),
        uploadsPlaylistId: contentDetails.relatedPlaylists?.uploads || '',
    };
}
