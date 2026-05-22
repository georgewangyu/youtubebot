import { computeBaseline, scoreVideo } from './scoring.js';
import { YouTubeClient } from './youtube.js';

function publishedAfterFromDays(days) {
    if (!days) return undefined;
    const date = new Date(Date.now() - Number(days) * 86400000);
    return date.toISOString();
}

function formatNumber(value, digits = 2) {
    if (value === null || value === undefined || !Number.isFinite(value)) return null;
    return Number(value.toFixed(digits));
}

function matchesDuration(video, contentType) {
    if (!contentType || contentType === 'any') return true;
    if (!Number.isFinite(video.durationSeconds)) return true;
    if (contentType === 'short') return video.durationSeconds <= 90;
    if (contentType === 'long') return video.durationSeconds > 90;
    return true;
}

function sortResults(results, sort) {
    const key = sort || 'score';
    return results.sort((a, b) => {
        if (key === 'views') return b.views - a.views;
        if (key === 'date') return new Date(b.publishedAt) - new Date(a.publishedAt);
        if (key === 'velocity') return (b.viewsPerDay || 0) - (a.viewsPerDay || 0);
        if (key === 'subscribers') return a.subscribers - b.subscribers;
        if (key === 'subscriber-ratio') return (b.subscriberRatio || 0) - (a.subscriberRatio || 0);
        if (key === 'outlier') return (b.outlierScore || 0) - (a.outlierScore || 0);
        return (b.score || 0) - (a.score || 0);
    });
}

export async function findOutliers(options) {
    options = {
        maxSearchResults: 50,
        order: 'viewCount',
        contentType: 'any',
        baselineVideos: 10,
        minBaselineVideos: 3,
        baselineMethod: 'median',
        limit: 20,
        sort: 'score',
        ...options,
    };

    const client = options.client || new YouTubeClient();
    const publishedAfter = publishedAfterFromDays(options.days);
    const searchIds = await client.searchVideoIds({
        query: options.query,
        maxResults: options.maxSearchResults,
        order: options.order,
        publishedAfter,
        videoDuration: options.videoDuration,
        regionCode: options.regionCode,
        relevanceLanguage: options.relevanceLanguage,
    });

    const targetVideos = (await client.fetchVideos(searchIds))
        .filter((video) => matchesDuration(video, options.contentType));
    const channels = await client.fetchChannels(targetVideos.map((video) => video.channelId));
    const channelsById = new Map(channels.map((channel) => [channel.id, channel]));

    const candidates = targetVideos.filter((video) => {
        const channel = channelsById.get(video.channelId);
        if (!channel) return false;
        if (options.minSubscribers !== undefined && channel.subscribers < options.minSubscribers) return false;
        if (options.maxSubscribers !== undefined && channel.subscribers > options.maxSubscribers) return false;
        if (options.minViews !== undefined && video.views < options.minViews) return false;
        if (options.maxViews !== undefined && video.views > options.maxViews) return false;
        return true;
    });

    const results = [];
    const baselineCache = new Map();
    for (const video of candidates) {
        const channel = channelsById.get(video.channelId);
        let channelUploads = [];

        if (baselineCache.has(channel.id)) {
            channelUploads = baselineCache.get(channel.id);
        } else if (channel?.uploadsPlaylistId) {
            const uploadIds = await client.fetchRecentUploadIds(channel.uploadsPlaylistId, {
                maxVideos: options.baselineVideos + candidates.length,
                publishedAfter: options.baselinePublishedAfter,
            });
            channelUploads = (await client.fetchVideos(uploadIds))
                .filter((item) => Number.isFinite(item.views) && item.views > 0);
            baselineCache.set(channel.id, channelUploads);
        }

        const baselineVideos = channelUploads
            .filter((item) => item.id !== video.id)
            .slice(0, options.baselineVideos);
        const hasEnoughBaseline = baselineVideos.length >= options.minBaselineVideos;
        const baselineViews = hasEnoughBaseline ? computeBaseline(baselineVideos, options.baselineMethod) : null;
        if (options.requireBaseline && !baselineViews) continue;

        const score = scoreVideo({ video, channel, baselineViews });
        if (options.minOutlierScore !== undefined && (score.outlierScore || 0) < options.minOutlierScore) continue;
        if (options.minSubscriberRatio !== undefined && (score.subscriberRatio || 0) < options.minSubscriberRatio) continue;
        if (options.minVelocity !== undefined && (score.viewsPerDay || 0) < options.minVelocity) continue;

        results.push({
            platform: 'youtube',
            id: video.id,
            url: video.url,
            title: video.title,
            channel: channel.title || video.channelTitle,
            channelId: channel.id,
            channelUrl: channel.url,
            subscribers: channel.subscribers,
            hiddenSubscriberCount: channel.hiddenSubscriberCount,
            views: video.views,
            likes: video.likes,
            comments: video.comments,
            publishedAt: video.publishedAt,
            durationSeconds: video.durationSeconds,
            thumbnail: video.thumbnail,
            baselineViews: formatNumber(score.baselineViews, 0),
            baselineVideoCount: baselineVideos.length,
            outlierScore: formatNumber(score.outlierScore),
            subscriberRatio: formatNumber(score.subscriberRatio),
            viewsPerDay: formatNumber(score.viewsPerDay, 0),
            momentumScore: formatNumber(score.momentumScore),
            score: formatNumber(score.score),
            signalStrength: score.signalStrength,
            whyFlagged: buildWhyFlagged({ video, channel, score, baselineVideos }),
            baselineVideos: options.includeBaselineVideos ? baselineVideos.map((item) => ({
                id: item.id,
                url: item.url,
                title: item.title,
                views: item.views,
                publishedAt: item.publishedAt,
            })) : undefined,
        });
    }

    return sortResults(results, options.sort).slice(0, options.limit);
}

function buildWhyFlagged({ video, channel, score, baselineVideos }) {
    const parts = [];
    if (score.outlierScore) {
        parts.push(`${score.outlierScore.toFixed(1)}x channel baseline`);
    }
    if (score.subscriberRatio) {
        parts.push(`${score.subscriberRatio.toFixed(1)}x subscribers`);
    }
    parts.push(`${video.views.toLocaleString()} views`);
    parts.push(`${channel.subscribers.toLocaleString()} subscribers`);
    if (baselineVideos.length > 0) {
        parts.push(`${baselineVideos.length} baseline videos`);
    }
    return parts.join('; ');
}
