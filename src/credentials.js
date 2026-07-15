import { existsSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

function loadEnvFile(filePath) {
    if (!filePath) return {};
    if (!existsSync(filePath)) return {};

    const loaded = {};
    for (const rawLine of readFileSync(filePath, 'utf8').split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#') || !line.includes('=')) continue;

        const [key, ...rest] = line.split('=');
        let value = rest.join('=').trim();
        if (value.length >= 2 && value[0] === value.at(-1) && (value[0] === '"' || value[0] === "'")) {
            value = value.slice(1, -1);
        }
        loaded[key.trim()] = value;
    }
    return loaded;
}

let fileVars = null;

function getFileVars() {
    if (fileVars) return fileVars;

    const dir = fileURLToPath(new URL('.', import.meta.url));
    const localEnv = resolve(dir, '..', '.env');
    const configEnv = resolve(homedir(), '.config/youtubebot/.env');
    const overrideEnv = process.env.YOUTUBEBOT_ENV_FILE;

    fileVars = {
        ...loadEnvFile(configEnv),
        ...loadEnvFile(overrideEnv),
        ...loadEnvFile(localEnv),
    };
    return fileVars;
}

export function getEnv(key) {
    return process.env[key] || getFileVars()[key] || '';
}

export function getDefaultEnvFilePath() {
    const dir = fileURLToPath(new URL('.', import.meta.url));
    return resolve(dir, '..', '.env');
}

export function getYouTubeApiKey() {
    return getEnv('YOUTUBE_API_KEY') || getEnv('YOUTUBE_DATA_API_KEY') || getEnv('GOOGLE_API_KEY');
}

export function loadOAuthConfig(overrides = {}) {
    return {
        clientId: overrides.clientId || getEnv('YOUTUBE_CLIENT_ID') || getEnv('GOOGLE_CLIENT_ID'),
        clientSecret: overrides.clientSecret || getEnv('YOUTUBE_CLIENT_SECRET') || getEnv('GOOGLE_CLIENT_SECRET'),
        redirectUri: overrides.redirectUri || getEnv('YOUTUBE_REDIRECT_URI') || 'http://127.0.0.1:8788/callback',
    };
}

export function loadOAuthTokens() {
    return {
        accessToken: getEnv('YOUTUBE_ACCESS_TOKEN'),
        refreshToken: getEnv('YOUTUBE_REFRESH_TOKEN'),
    };
}

export function requireEnv(keys) {
    const missing = keys.filter((key) => !getEnv(key));
    if (missing.length) {
        throw new Error(`Missing credentials: ${missing.join(', ')}`);
    }
}

export function requireYouTubeApiKey() {
    const apiKey = getYouTubeApiKey();
    if (!apiKey) {
        throw new Error('Missing credentials: set YOUTUBE_API_KEY in youtubebot/.env, ~/.config/youtubebot/.env, YOUTUBEBOT_ENV_FILE, or the shell');
    }
    return apiKey;
}

export function writeEnvValues(filePath, values) {
    const target = filePath || getDefaultEnvFilePath();
    const existing = existsSync(target) ? readFileSync(target, 'utf8') : '';
    const lines = existing ? existing.split('\n') : [];
    const pending = new Map(Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== ''));
    const output = lines.map((line) => {
        const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
        if (!match || !pending.has(match[1])) return line;
        const key = match[1];
        const value = pending.get(key);
        pending.delete(key);
        return `${key}=${escapeEnvValue(value)}`;
    });

    if (output.length && output.at(-1) !== '') output.push('');
    for (const [key, value] of pending) {
        output.push(`${key}=${escapeEnvValue(value)}`);
    }

    writeFileSync(target, output.join('\n').replace(/\n*$/, '\n'));
    fileVars = null;
    return target;
}

function escapeEnvValue(value) {
    const text = String(value);
    if (!text || /[\s"'#]/.test(text)) return JSON.stringify(text);
    return text;
}
