export function assertExpectedYouTubeChannel(channels, expectedChannelId) {
    const list = Array.isArray(channels) ? channels : [];
    if (!expectedChannelId) return list[0] || null;

    const match = list.find((channel) => channel.id === expectedChannelId);
    if (match) return match;

    const actual = list.length
        ? list.map((channel) => `${channel.customUrl || channel.title || 'unnamed'} (${channel.id || 'no id'})`).join(', ')
        : 'no YouTube channel';
    throw new Error(`OAuth channel mismatch: expected ${expectedChannelId}, but Google authorized ${actual}. Tokens were not saved and no upload was started.`);
}
