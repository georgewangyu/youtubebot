#!/usr/bin/env node

import { Command } from 'commander';
import { spawn } from 'child_process';
import { stdin, stdout } from 'process';
import { createInterface } from 'readline/promises';
import { assertExpectedYouTubeChannel } from './channel-guard.js';
import { getDefaultEnvFilePath, getEnv, getYouTubeApiKey, loadOAuthConfig, loadOAuthTokens, writeEnvValues } from './credentials.js';
import { findOutliers } from './finder.js';
import { buildAuthorizationUrl, DEFAULT_SCOPES, exchangeCodeForToken, parseOAuthCallbackInput, refreshAccessToken } from './oauth.js';
import { printResults } from './output.js';
import { buildYouTubeVideoResource, inspectYouTubeVideoFile, uploadYouTubeVideo } from './upload.js';
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

function parseBoolean(value) {
    if (value === true || value === false) return value;
    return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
}

async function getOAuthAccessToken() {
    const oauth = loadOAuthConfig();
    const tokens = loadOAuthTokens();
    if (tokens.refreshToken) {
        try {
            const refreshed = await refreshAccessToken({
                clientId: oauth.clientId,
                clientSecret: oauth.clientSecret,
                refreshToken: tokens.refreshToken,
            });
            writeEnvValues(getDefaultEnvFilePath(), {
                YOUTUBE_ACCESS_TOKEN: refreshed.access_token,
            });
            return refreshed.access_token;
        } catch (error) {
            throw new Error(`${error.message}. Run "node src/cli.js oauth-login" to reauthorize the YouTube channel.`);
        }
    }
    if (tokens.accessToken) return tokens.accessToken;
    throw new Error('Missing YouTube OAuth credentials. Run "node src/cli.js oauth-login".');
}

async function verifyOAuthChannel(accessToken, expectedChannelId = getEnv('YOUTUBE_EXPECTED_CHANNEL_ID')) {
    const client = new YouTubeClient({ accessToken });
    const channels = await client.fetchMyChannels();
    const channel = assertExpectedYouTubeChannel(channels, expectedChannelId);
    return { channel, channels };
}

function openInBrowser(url) {
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.unref();
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
    .command('oauth-login')
    .description('Open Google OAuth in a browser, exchange the callback, and save YouTube tokens')
    .option('--redirect-uri <uri>', 'Override redirect URI')
    .option('--scope <scopes>', 'Space-separated scopes', DEFAULT_SCOPES.join(' '))
    .option('--state <value>', 'Explicit OAuth state value')
    .option('--env-file <path>', 'Env file to update', getDefaultEnvFilePath())
    .option('--expect-channel-id <id>', 'Refuse to save OAuth tokens for a different channel', getEnv('YOUTUBE_EXPECTED_CHANNEL_ID'))
    .option('--no-open', 'Print the authorization URL without opening a browser')
    .action(async (options) => {
        const rl = createInterface({ input: stdin, output: stdout });
        try {
            const oauth = loadOAuthConfig({ redirectUri: options.redirectUri });
            const auth = buildAuthorizationUrl({
                clientId: oauth.clientId,
                redirectUri: oauth.redirectUri,
                scopes: options.scope.trim().split(/\s+/),
                state: options.state,
            });
            console.log(`Redirect URI: ${oauth.redirectUri}`);
            console.log(`Scopes: ${auth.scopes.join(' ')}`);
            console.log(`State: ${auth.state}`);
            console.log(`\n${auth.url}`);
            if (options.open) openInBrowser(auth.url);

            const input = await rl.question('\nAuthorize the channel, then paste the callback URL or code: ');
            const callback = parseOAuthCallbackInput(input);
            if (callback.error) throw new Error(`Google OAuth callback error: ${callback.errorDescription || callback.error}`);
            if (!callback.code) throw new Error('No authorization code found in callback input');
            if (callback.state && callback.state !== auth.state) {
                throw new Error(`OAuth state mismatch. Expected ${auth.state}, got ${callback.state}`);
            }

            const token = await exchangeCodeForToken({
                clientId: oauth.clientId,
                clientSecret: oauth.clientSecret,
                redirectUri: oauth.redirectUri,
                code: callback.code,
            });
            const { channel } = await verifyOAuthChannel(token.access_token, options.expectChannelId);
            const existing = loadOAuthTokens();
            const target = writeEnvValues(options.envFile, {
                YOUTUBE_ACCESS_TOKEN: token.access_token,
                YOUTUBE_REFRESH_TOKEN: token.refresh_token || existing.refreshToken,
            });
            console.log(JSON.stringify({
                savedTo: target,
                scope: token.scope,
                hasAccessToken: Boolean(token.access_token),
                hasRefreshToken: Boolean(token.refresh_token || existing.refreshToken),
                authorizedChannel: channel,
            }, null, 2));
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exitCode = 1;
        } finally {
            rl.close();
        }
    });

program
    .command('exchange-code <code>')
    .description('Exchange a Google OAuth authorization code for YouTube tokens')
    .option('--redirect-uri <uri>', 'Override redirect URI')
    .option('--save', 'Save returned tokens to the local env file')
    .option('--env-file <path>', 'Env file to update', getDefaultEnvFilePath())
    .option('--expect-channel-id <id>', 'Refuse to save OAuth tokens for a different channel', getEnv('YOUTUBE_EXPECTED_CHANNEL_ID'))
    .option('--print-env', 'Print raw token env values to stdout')
    .action(async (code, options) => {
        try {
            const callback = parseOAuthCallbackInput(code);
            const oauth = loadOAuthConfig({ redirectUri: options.redirectUri });
            const token = await exchangeCodeForToken({
                clientId: oauth.clientId,
                clientSecret: oauth.clientSecret,
                redirectUri: oauth.redirectUri,
                code: callback.code,
            });

            console.log(JSON.stringify({
                token_type: token.token_type,
                expires_in: token.expires_in,
                scope: token.scope,
                has_access_token: Boolean(token.access_token),
                has_refresh_token: Boolean(token.refresh_token),
            }, null, 2));

            if (options.save) {
                const { channel } = await verifyOAuthChannel(token.access_token, options.expectChannelId);
                const existing = loadOAuthTokens();
                const target = writeEnvValues(options.envFile, {
                    YOUTUBE_ACCESS_TOKEN: token.access_token,
                    YOUTUBE_REFRESH_TOKEN: token.refresh_token || existing.refreshToken,
                });
                console.log(`\nSaved YouTube token values to ${target}`);
                console.log(`Authorized channel: ${channel?.customUrl || channel?.title || 'unknown'} (${channel?.id || 'no id'})`);
            } else if (options.printEnv) {
                console.log('\nSuggested env additions:');
                if (token.access_token) console.log(`YOUTUBE_ACCESS_TOKEN=${token.access_token}`);
                if (token.refresh_token) console.log(`YOUTUBE_REFRESH_TOKEN=${token.refresh_token}`);
            } else {
                console.log('\nToken values hidden. Use --save or --print-env.');
            }
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
    .option('--save', 'Save the refreshed access token to the local env file')
    .option('--env-file <path>', 'Env file to update', getDefaultEnvFilePath())
    .option('--print-env', 'Print the raw access token to stdout')
    .action(async (options) => {
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
            if (token.access_token && options.save) {
                const target = writeEnvValues(options.envFile, { YOUTUBE_ACCESS_TOKEN: token.access_token });
                console.log(`\nSaved refreshed access token to ${target}`);
            } else if (token.access_token && options.printEnv) {
                console.log('\nSuggested env update:');
                console.log(`YOUTUBE_ACCESS_TOKEN=${token.access_token}`);
            } else {
                console.log('\nAccess token hidden. Use --save or --print-env.');
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
            const accessToken = await getOAuthAccessToken();
            const client = new YouTubeClient({ accessToken });
            const channels = await client.fetchMyChannels();
            assertExpectedYouTubeChannel(channels, getEnv('YOUTUBE_EXPECTED_CHANNEL_ID'));
            console.log(JSON.stringify(channels, null, 2));
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('upload <file>')
    .description('Upload a video to the OAuth-authorized YouTube channel using a resumable session')
    .requiredOption('--title <title>', 'Video title')
    .option('--description <text>', 'Video description', '')
    .option('--tags <tags>', 'Comma-separated tags', '')
    .option('--category-id <id>', 'YouTube category ID', '22')
    .option('--privacy <status>', 'private, unlisted, or public', 'private')
    .option('--made-for-kids <bool>', 'Declare whether the video is made for kids', parseBoolean, false)
    .option('--contains-synthetic-media <bool>', 'Declare realistic altered or synthetic media', parseBoolean, false)
    .option('--publish-at <iso-date>', 'Schedule publication; privacy must be private')
    .option('--chunk-size-mb <number>', 'Resumable upload chunk size in MiB', parseInteger, 8)
    .option('--confirm-release', 'Confirm an unlisted/public upload was explicitly approved')
    .option('--dry-run', 'Validate the file and print metadata without creating an upload')
    .action(async (filePath, options) => {
        try {
            const videoResource = buildYouTubeVideoResource({
                title: options.title,
                description: options.description,
                tags: options.tags,
                categoryId: options.categoryId,
                privacy: options.privacy,
                madeForKids: options.madeForKids,
                containsSyntheticMedia: options.containsSyntheticMedia,
                publishAt: options.publishAt,
            });
            if (videoResource.status.privacyStatus !== 'private' && !options.confirmRelease) {
                throw new Error('Unlisted/public uploads require --confirm-release after the account owner approves the exact video and metadata.');
            }
            const file = await inspectYouTubeVideoFile(filePath);
            if (options.dryRun) {
                console.log(JSON.stringify({ dryRun: true, file, videoResource }, null, 2));
                return;
            }

            const accessToken = await getOAuthAccessToken();
            await verifyOAuthChannel(accessToken);
            const result = await uploadYouTubeVideo({
                accessToken,
                filePath: file.path,
                videoResource,
                chunkSize: options.chunkSizeMb * 1024 * 1024,
            });
            const id = result.video?.id || '';
            console.log(JSON.stringify({
                videoId: id,
                url: id ? `https://www.youtube.com/watch?v=${id}` : '',
                privacy: result.video?.status?.privacyStatus || videoResource.status.privacyStatus,
                bytesUploaded: result.bytesUploaded,
                chunksUploaded: result.chunksUploaded,
            }, null, 2));
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
