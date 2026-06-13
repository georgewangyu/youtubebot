# YouTubeBot Agent Instructions

## Mission

`youtubebot` is a narrow CLI for finding low-subscriber, high-view YouTube
outliers. Keep the repo focused on ranking and inspection, not broad creator
platform scope creep.

## Working Rules

1. Preserve the distinction between public research and future OAuth-backed
   account actions.
2. Keep scoring explainable: baseline outlier score first, subscriber-ratio as
   fallback.
3. Prefer lightweight CLI validation over broad product abstraction.

## Validation

```bash
npm run env
npm test
```
