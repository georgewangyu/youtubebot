import { randomBytes } from 'crypto';

export const DEFAULT_SCOPES = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/youtube.upload',
];

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export function buildAuthorizationUrl({
    clientId,
    redirectUri,
    scopes = DEFAULT_SCOPES,
    state,
    accessType = 'offline',
    prompt = 'consent',
}) {
    if (!clientId) throw new Error('Missing credentials: YOUTUBE_CLIENT_ID');
    if (!redirectUri) throw new Error('Missing credentials: YOUTUBE_REDIRECT_URI');

    const resolvedState = state || randomBytes(16).toString('hex');
    const url = new URL(AUTH_URL);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', scopes.join(' '));
    url.searchParams.set('state', resolvedState);
    url.searchParams.set('access_type', accessType);
    url.searchParams.set('prompt', prompt);

    return { url: url.toString(), state: resolvedState, scopes };
}

export function parseOAuthCallbackInput(input) {
    const value = String(input || '').trim();
    if (!value) return { code: '', state: '', error: '', errorDescription: '' };
    try {
        const url = new URL(value);
        return {
            code: url.searchParams.get('code') || '',
            state: url.searchParams.get('state') || '',
            error: url.searchParams.get('error') || '',
            errorDescription: url.searchParams.get('error_description') || '',
        };
    } catch {
        return { code: value, state: '', error: '', errorDescription: '' };
    }
}

export async function exchangeCodeForToken({ clientId, clientSecret, redirectUri, code }) {
    if (!clientId) throw new Error('Missing credentials: YOUTUBE_CLIENT_ID');
    if (!clientSecret) throw new Error('Missing credentials: YOUTUBE_CLIENT_SECRET');
    if (!redirectUri) throw new Error('Missing credentials: YOUTUBE_REDIRECT_URI');
    if (!code) throw new Error('Missing authorization code');

    return postTokenRequest({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
        grant_type: 'authorization_code',
    });
}

export async function refreshAccessToken({ clientId, clientSecret, refreshToken }) {
    if (!clientId) throw new Error('Missing credentials: YOUTUBE_CLIENT_ID');
    if (!clientSecret) throw new Error('Missing credentials: YOUTUBE_CLIENT_SECRET');
    if (!refreshToken) throw new Error('Missing credentials: YOUTUBE_REFRESH_TOKEN');

    return postTokenRequest({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
    });
}

async function postTokenRequest(body) {
    const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(body),
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = json.error_description || json.error || `${response.status} ${response.statusText}`;
        throw new Error(`Google OAuth token error: ${message}`);
    }
    return json;
}
