# YouTube OAuth Setup

OAuth is needed for account-backed actions such as uploading videos, setting metadata, setting thumbnails, and managing playlists. API keys are only for public read operations.

## Google Cloud Setup

1. Open Google Cloud Console.
2. Select the same project used for YouTube Data API v3, or create one.
3. Enable **YouTube Data API v3**.
4. Go to **APIs & Services** -> **OAuth consent screen**.
5. Configure the app as an external app for personal testing.
6. Add your Google account as a test user if the app is in testing mode.
7. Go to **APIs & Services** -> **Credentials**.
8. Click **Create credentials** -> **OAuth client ID**.
9. Choose **Desktop app**.
10. Save the client ID and client secret.

For desktop OAuth clients, the CLI defaults to `http://localhost`.

## Local Env

Add these to `youtubebot/.env`, `~/.config/youtubebot/.env`, or a file referenced by `YOUTUBEBOT_ENV_FILE`:

```env
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
YOUTUBE_REDIRECT_URI=http://localhost
```

## Authorize

Generate the consent URL:

```bash
node src/cli.js auth-url
```

Open the URL in a browser and approve access. The browser will redirect to a local URL that may show a connection error if no local server is running. That is fine. Copy the `code` value from the URL.

Exchange it:

```bash
node src/cli.js exchange-code '<code-from-url>'
```

Add the returned refresh token:

```env
YOUTUBE_REFRESH_TOKEN=...
```

Verify:

```bash
node src/cli.js me
```

## Default Scopes

```text
https://www.googleapis.com/auth/youtube.readonly
https://www.googleapis.com/auth/youtube.upload
```

The upload scope is included now so the saved refresh token can support future upload commands. The CLI does not upload videos yet.
