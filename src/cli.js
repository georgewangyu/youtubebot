#!/usr/bin/env node

import { Command } from 'commander';
import { getEnv, getYouTubeApiKey, loadOAuthConfig, loadOAuthTokens } from './credentials.js';
import { findOutliers } from './finder.js';
import { buildAuthorizationUrl, DEFAULT_SCOPES, exchangeCodeForToken, refreshAccessToken } from './oauth.js';
import { printResults } from './output.js';
import { YouTubeClient } from './youtube.js';

const program = new Command();

function parseInteger(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) throw new Error(`Invalid integer: ${value}`);
    return parsed;
}

function parseFloatOption(value) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) throw new Error(`Invalid number: ${value}`);
    return parsed;
}

program
    .name('youtubebot')
    .description('YouTube outlier finder CLI for low-subscriber, high-view inspiration research')
    .version('0.1.0');

program
    .command('auth-url')
    .description('Generate a Google OAuth URL for YouTube account access')
    .option('--redirect-uri <uri>', 'Override redirect URI')
    .option('--scope <scopes>', 'Space-separated scopes', DEFAULT_SCOPES.join(' '))
    .option('--state <value>', 'Explicit OAuth state value')
    .action((options) => {
        try {
            const oauth = loadOAuthConfig({ redirectUri: options.redirectUri });
            const { url, state, scopes } = buildAuthorizationUrl({
                clientId: oauth.clientId,
                redirectUri: oauth.redirectUri,
                scopes: options.scope.trim().split(/\s+/),
                state: options.state,
            });

            console.log(`State: ${state}`);
            console.log(`Scopes: ${scopes.join(' ')}`);
            console.log(url);
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('exchange-code <code>')
    .description('Exchange a Google OAuth authorization code for YouTube tokens')
    .option('--redirect-uri <uri>', 'Override redirect URI')
    .action(async (code, options) => {
        try {
            const oauth = loadOAuthConfig({ redirectUri: options.redirectUri });
            const token = await exchangeCodeForToken({
                clientId: oauth.clientId,
                clientSecret: oauth.clientSecret,
                redirectUri: oauth.redirectUri,
                code,
            });

            console.log(JSON.stringify({
                token_type: token.token_type,
                expires_in: token.expires_in,
                scope: token.scope,
                has_access_token: Boolean(token.access_token),
                has_refresh_token: Boolean(token.refresh_token),
            }, null, 2));

            console.log('\nSuggested env additions:');
            if (token.access_token) console.log(`YOUTUBE_ACCESS_TOKEN=${token.access_token}`);
            if (token.refresh_token) console.log(`YOUTUBE_REFRESH_TOKEN=${token.refresh_token}`);
            if (!token.refresh_token) {
                console.log('\nNo refresh token returned. Re-run auth-url with prompt=consent behavior, or remove the app grant in your Google account and authorize again.');
            }
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('refresh-token')
    .description('Refresh the YouTube OAuth access token using YOUTUBE_REFRESH_TOKEN')
    .action(async () => {
        try {
            const oauth = loadOAuthConfig();
            const tokens = loadOAuthTokens();
            const token = await refreshAccessToken({
                clientId: oauth.clientId,
                clientSecret: oauth.clientSecret,
                refreshToken: tokens.refreshToken,
            });

            console.log(JSON.stringify({
                token_type: token.token_type,
                expires_in: token.expires_in,
                scope: token.scope,
                has_access_token: Boolean(token.access_token),
            }, null, 2));
            if (token.access_token) {
                console.log('\nSuggested env update:');
                console.log(`YOUTUBE_ACCESS_TOKEN=${token.access_token}`);
            }
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('me')
    .description('Show the OAuth-authenticated YouTube channel')
    .action(async () => {
        try {
            const tokens = loadOAuthTokens();
            let accessToken = tokens.accessToken;
            if (!accessToken && tokens.refreshToken) {
                const oauth = loadOAuthConfig();
                const refreshed = await refreshAccessToken({
                    clientId: oauth.clientId,
                    clientSecret: oauth.clientSecret,
                    refreshToken: tokens.refreshToken,
                });
                accessToken = refreshed.access_token;
            }
            if (!accessToken) {
                throw new Error('Missing credentials: YOUTUBE_ACCESS_TOKEN or YOUTUBE_REFRESH_TOKEN');
            }

            const client = new YouTubeClient({ accessToken });
            const channels = await client.fetchMyChannels();
            console.log(JSON.stringify(channels, null, 2));
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('find <query>')
    .description('Find YouTube videos that overperform a channel baseline or subscriber count')
    .option('--max-subs <number>', 'Maximum channel subscribers', parseInteger)
    .option('--min-subs <number>', 'Minimum channel subscribers', parseInteger, 0)
    .option('--min-views <number>', 'Minimum target video views', parseInteger)
    .option('--max-views <number>', 'Maximum target video views', parseInteger)
    .option('--days <number>', 'Only search videos published in the last N days', parseInteger, 30)
    .option('--max-search <number>', 'Maximum YouTube search results to inspect', parseInteger, 50)
    .option('--limit <number>', 'Maximum rows to print', parseInteger, 20)
    .option('--baseline-videos <number>', 'Recent channel uploads to use for baseline', parseInteger, 10)
    .option('--min-baseline-videos <number>', 'Minimum baseline videos needed for true outlier score', parseInteger, 3)
    .option('--baseline-method <method>', 'Baseline method: median or average', 'median')
    .option('--require-baseline', 'Hide rows that only have the subscriber-ratio fallback')
    .option('--min-outlier <number>', 'Minimum video/baseline multiplier', parseFloatOption)
    .option('--min-subscriber-ratio <number>', 'Minimum views/subscribers ratio', parseFloatOption)
    .option('--min-velocity <number>', 'Minimum views per day', parseFloatOption)
    .option('--type <type>', 'Content type filter: any, short, long', 'any')
    .option('--video-duration <duration>', 'YouTube search duration: any, short, medium, long')
    .option('--order <order>', 'YouTube search order: viewCount, relevance, date, rating', 'viewCount')
    .option('--sort <sort>', 'Sort: score, outlier, subscriber-ratio, views, velocity, date, subscribers', 'score')
    .option('--region <code>', 'YouTube regionCode', 'US')
    .option('--language <code>', 'YouTube relevanceLanguage', 'en')
    .option('--format <format>', 'Output format: table, json, jsonl', 'table')
    .option('--include-baseline-videos', 'Include baseline videos in JSON/JSONL output')
    .action(async (query, options) => {
        try {
            const results = await findOutliers({
                query,
                maxSubscribers: options.maxSubs,
                minSubscribers: options.minSubs,
                minViews: options.minViews,
                maxViews: options.maxViews,
                days: options.days,
                maxSearchResults: options.maxSearch,
                limit: options.limit,
                baselineVideos: options.baselineVideos,
                minBaselineVideos: options.minBaselineVideos,
                baselineMethod: options.baselineMethod,
                requireBaseline: Boolean(options.requireBaseline),
                minOutlierScore: options.minOutlier,
                minSubscriberRatio: options.minSubscriberRatio,
                minVelocity: options.minVelocity,
                contentType: options.type,
                videoDuration: options.videoDuration,
                order: options.order,
                sort: options.sort,
                regionCode: options.region,
                relevanceLanguage: options.language,
                includeBaselineVideos: Boolean(options.includeBaselineVideos),
            });
            printResults(results, options.format);
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('env')
    .description('Show resolved non-secret YouTube config state')
    .action(() => {
        console.log(JSON.stringify({
            hasYouTubeApiKey: Boolean(getYouTubeApiKey()),
            supportedApiKeyNames: ['YOUTUBE_API_KEY', 'YOUTUBE_DATA_API_KEY', 'GOOGLE_API_KEY'],
            hasOAuthClientId: Boolean(getEnv('YOUTUBE_CLIENT_ID') || getEnv('GOOGLE_CLIENT_ID')),
            hasOAuthClientSecret: Boolean(getEnv('YOUTUBE_CLIENT_SECRET') || getEnv('GOOGLE_CLIENT_SECRET')),
            hasOAuthAccessToken: Boolean(getEnv('YOUTUBE_ACCESS_TOKEN')),
            hasOAuthRefreshToken: Boolean(getEnv('YOUTUBE_REFRESH_TOKEN')),
            redirectUri: getEnv('YOUTUBE_REDIRECT_URI') || 'http://127.0.0.1:8788/callback',
            envFiles: [
                'youtubebot/.env',
                '~/.config/youtubebot/.env',
                'YOUTUBEBOT_ENV_FILE',
            ],
        }, null, 2));
    });

program.parse();
