# youtubebot - YouTube Outlier Finder

CLI for finding YouTube inspiration videos where a low-subscriber channel has a high-performing video.

## Status

This repo is runnable today for public research and OAuth-backed video uploads.
Public outlier discovery remains the first-class research path; uploads use a
separate, explicit resumable workflow that defaults to private visibility.

## Related Bots

- TikTok counterpart: `tiktokbot` supports TikTok Display API OAuth for owned-account analytics, including recent-video pulls and own-account outlier ranking.
- The important platform difference: YouTube broad discovery is self-serve through YouTube Data API, while TikTok broad organic discovery remains gated behind Research API approval. `tiktokbot` uses Display API for authorized account data and manual/watchlist scoring for competitor research.

The scoring model combines the useful parts of the inspected inspiration projects:

- `open-outlier`: true channel-baseline multiplier
- `ytoutliers`: simple 1of10-style subscriber filtering and recent-upload baseline
- `content-intelligence`: `views / subscribers` fallback signal

## Architecture

```text
youtubebot/
|-- src/
|   |-- cli.js           # Unified CLI
|   |-- credentials.js   # .env + private token loader
|   |-- finder.js        # Search, filter, baseline fetch, rank
|   |-- oauth.js         # Google OAuth URL and token helpers
|   |-- output.js        # Table/JSON/JSONL output
|   |-- scoring.js       # Baseline, multiplier, velocity scoring
|   |-- upload.js        # Resumable YouTube video upload implementation
|   `-- youtube.js       # YouTube Data API client
|-- setup/
|   `-- YOUTUBE_API_SETUP.md
|-- research/
|   `-- SCORING_NOTES.md
|-- README.md
`-- .env.example
```

## Installation

```bash
npm install
```

## Validation

```bash
npm run env
npm test
```

## Credentials

### Public Research

Set one of these env vars in `youtubebot/.env`, `~/.config/youtubebot/.env`, a file referenced by `YOUTUBEBOT_ENV_FILE`, or the shell:

```env
YOUTUBE_API_KEY=...
```

Aliases also supported:

```env
YOUTUBE_DATA_API_KEY=...
GOOGLE_API_KEY=...
```

Check config:

```bash
node src/cli.js env
```

### OAuth For Account Actions

OAuth is required for account-backed actions such as uploads. Add:

```env
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
YOUTUBE_REDIRECT_URI=http://localhost
YOUTUBE_REFRESH_TOKEN=...
YOUTUBE_EXPECTED_CHANNEL_ID=YOUR_CHANNEL_ID
```

Generate a consent URL:

```bash
node src/cli.js auth-url
```

Paste the returned URL into a browser, approve access, copy the `code` query parameter from the redirect URL, then exchange it:

```bash
node src/cli.js exchange-code '<code-from-redirect-url>'
```

Verify the authenticated channel:

```bash
node src/cli.js me
```

If the saved refresh token is invalid, use the guided browser flow. It opens
Google authorization with both readonly and upload scopes, accepts the callback
URL or code, and saves tokens without printing them:

```bash
node src/cli.js oauth-login
```

`YOUTUBE_EXPECTED_CHANNEL_ID` is a safety lock. OAuth login, `me`, and real
uploads refuse to continue if Google authorizes a different primary or Brand
Account. Keep the real ID only in an ignored local `.env` or another private
configuration source; do not add account handles or IDs to this repository.

## Uploading Videos

Validate a private upload without creating anything on YouTube:

```bash
node src/cli.js upload ./final-video.mp4 \
  --title 'Video title' \
  --description 'Video description' \
  --tags 'ai,workflow' \
  --dry-run
```

Upload privately through YouTube's resumable upload protocol:

```bash
node src/cli.js upload ./final-video.mp4 \
  --title 'Video title' \
  --description 'Video description' \
  --tags 'ai,workflow' \
  --privacy private
```

Unlisted or public visibility requires explicit approval of the exact video
and metadata:

```bash
node src/cli.js upload ./final-video.mp4 \
  --title 'Approved video title' \
  --privacy unlisted \
  --confirm-release
```

The uploader supports MP4, MOV, WebM, MKV, AVI, and MPEG-style files, sends
8 MiB resumable chunks by default, and returns the created video ID and watch
URL. Useful metadata options include `--category-id`, `--made-for-kids`,
`--contains-synthetic-media`, and `--publish-at`. Scheduled uploads must begin
as private.

Google restricts uploads from unverified API projects created after July 28,
2020 to private viewing until the project passes a YouTube API compliance
audit. The browser/YouTube Studio remains the practical fallback for native
finishing or public release when that restriction applies.

## Usage

Find videos from channels under 10k subscribers, published in the last 30 days:

```bash
node src/cli.js find "kennedy videos" --max-subs 10000 --min-views 50000 --days 30
```

Prefer true channel-baseline outliers only:

```bash
node src/cli.js find "ai tools" --max-subs 10000 --min-outlier 5 --require-baseline
```

Search Shorts-like videos and emit JSON for an agent:

```bash
node src/cli.js find "desk setup" \
  --max-subs 20000 \
  --min-views 25000 \
  --type short \
  --video-duration short \
  --format json
```

Include baseline uploads for inspection:

```bash
node src/cli.js find "notion template" --max-subs 10000 --format json --include-baseline-videos
```

## Scoring

Primary signal:

```text
outlier_score = target_video_views / channel_recent_upload_baseline_views
```

Secondary signal:

```text
subscriber_ratio = target_video_views / channel_subscribers
```

Default ranking uses `outlier_score` when enough recent uploads are available. If not, it falls back to `subscriber_ratio` and marks `signalStrength` as `subscriber_ratio`.

## Notes

- Default baseline is the median of the latest 10 channel uploads, excluding the target video.
- Default minimum baseline count is 3 videos.
- `--require-baseline` removes weak subscriber-ratio-only rows.
- This repo is YouTube-only for now. TikTok/Instagram should use the same scorer with platform-specific collector adapters.
- OAuth-backed uploads use YouTube's resumable `videos.insert` flow and default
  to private visibility.

## Goals

- Keep breakout ranking explainable and inspectable.
- Preserve public research as the default path.
- Add future account actions only when they support the outlier-finding thesis.
