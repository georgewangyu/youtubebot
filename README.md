---
doc_schema: "doc-frontmatter-v1"
doc_id: "youtubebot/README"
doc_type: "readme"
doc_status: "active"
title: "youtubebot - YouTube Outlier Finder"
description: "CLI for finding low-subscriber, high-view YouTube videos using channel-baseline and subscriber-ratio scoring."
memory_eligible: false
memory_priority: "low"
doc_tags:
  - "domain:social-media"
  - "tool:youtubebot"
  - "type:readme"
---
# youtubebot - YouTube Outlier Finder

CLI for finding YouTube inspiration videos where a low-subscriber channel has a high-performing video.

## Related Bots

- TikTok counterpart: [`tiktokbot`](https://github.com/georgewangyu/tiktokbot) now supports TikTok Display API OAuth for George-owned account analytics, including recent-video pulls and own-account outlier ranking.
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

### OAuth For Future Account Actions

OAuth is required for account-backed actions such as uploads. Add:

```env
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
YOUTUBE_REDIRECT_URI=http://localhost
YOUTUBE_REFRESH_TOKEN=...
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
- OAuth is scaffolded for future upload/publishing features, but this version does not upload videos yet.
