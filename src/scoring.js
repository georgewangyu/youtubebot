export function toNumber(value, fallback = 0) {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function median(values) {
    const nums = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
    if (nums.length === 0) return null;
    const mid = Math.floor(nums.length / 2);
    if (nums.length % 2 === 1) return nums[mid];
    return (nums[mid - 1] + nums[mid]) / 2;
}

export function average(values) {
    const nums = values.filter((value) => Number.isFinite(value));
    if (nums.length === 0) return null;
    return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

export function parseDurationSeconds(isoDuration) {
    if (!isoDuration) return null;
    const match = isoDuration.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    if (!match) return null;
    const [, days, hours, minutes, seconds] = match;
    return (
        toNumber(days) * 86400 +
        toNumber(hours) * 3600 +
        toNumber(minutes) * 60 +
        toNumber(seconds)
    );
}

export function ageDays(publishedAt, now = new Date()) {
    const published = new Date(publishedAt);
    if (Number.isNaN(published.getTime())) return null;
    return Math.max((now.getTime() - published.getTime()) / 86400000, 0.01);
}

export function computeBaseline(videos, method = 'median') {
    const views = videos
        .map((video) => video.views)
        .filter((value) => Number.isFinite(value) && value > 0);
    if (method === 'average') return average(views);
    return median(views);
}

export function scoreVideo({ video, channel, baselineViews, now = new Date() }) {
    const days = ageDays(video.publishedAt, now);
    const viewsPerDay = days ? video.views / days : null;
    const outlierScore = baselineViews && baselineViews > 0 ? video.views / baselineViews : null;
    const subscriberRatio = channel.subscribers > 0 ? video.views / channel.subscribers : null;

    const velocityBoost = viewsPerDay && viewsPerDay > 0 ? Math.max(1, Math.log10(viewsPerDay)) : 1;
    const momentumScore = outlierScore ? outlierScore * velocityBoost : null;
    const fallbackScore = subscriberRatio;
    const score = outlierScore ?? fallbackScore ?? 0;

    return {
        score,
        outlierScore,
        subscriberRatio,
        momentumScore,
        baselineViews,
        viewsPerDay,
        ageDays: days,
        signalStrength: outlierScore ? 'baseline' : 'subscriber_ratio',
    };
}
