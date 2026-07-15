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
YOUTUBE_EXPECTED_CHANNEL_ID=YOUR_CHANNEL_ID
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

The upload scope supports the current resumable uploader. If saved credentials
become invalid, run `node src/cli.js oauth-login`, complete authorization in the
browser, and paste the callback URL or code when prompted. Uploads default to
private visibility; unlisted/public uploads require `--confirm-release`.

When authorizing a Brand Account, Google may display an older Brand Account
name. Keep `YOUTUBE_EXPECTED_CHANNEL_ID` set so the CLI verifies the immutable
channel ID before saving credentials or starting an upload. Store the real ID
only in an ignored local `.env` or another private configuration source.
