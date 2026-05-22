# YouTube API Setup

1. Open Google Cloud Console.
2. Create or select a project.
3. Enable **YouTube Data API v3**.
4. Create an API key.
5. Restrict the key if desired, but make sure it can call YouTube Data API v3.
6. Add it to one of:

```env
YOUTUBE_API_KEY=...
```

Supported locations:

- `youtubebot/.env`
- `~/.config/youtubebot/.env`
- a file referenced by `YOUTUBEBOT_ENV_FILE`
- shell environment

Verify:

```bash
node src/cli.js env
```

Run a small query:

```bash
node src/cli.js find "ai tools" --max-search 5 --limit 5 --max-subs 100000
```
