import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAuthorizationUrl, DEFAULT_SCOPES, parseOAuthCallbackInput } from '../src/oauth.js';

test('buildAuthorizationUrl includes offline upload consent params', () => {
    const { url, state, scopes } = buildAuthorizationUrl({
        clientId: 'client-123',
        redirectUri: 'http://127.0.0.1:8788/callback',
        state: 'state-123',
    });

    const parsed = new URL(url);
    assert.equal(parsed.origin + parsed.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
    assert.equal(parsed.searchParams.get('client_id'), 'client-123');
    assert.equal(parsed.searchParams.get('redirect_uri'), 'http://127.0.0.1:8788/callback');
    assert.equal(parsed.searchParams.get('response_type'), 'code');
    assert.equal(parsed.searchParams.get('access_type'), 'offline');
    assert.equal(parsed.searchParams.get('prompt'), 'consent');
    assert.equal(state, 'state-123');
    assert.deepEqual(scopes, DEFAULT_SCOPES);
    assert.match(parsed.searchParams.get('scope'), /youtube\.upload/);
});

test('parseOAuthCallbackInput accepts callback URLs and raw codes', () => {
    assert.deepEqual(
        parseOAuthCallbackInput('http://localhost/?code=abc123&state=state-123'),
        { code: 'abc123', state: 'state-123', error: '', errorDescription: '' },
    );
    assert.equal(parseOAuthCallbackInput('raw-code').code, 'raw-code');
});
