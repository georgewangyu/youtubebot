# YouTubeBot Vision

`youtubebot` should be a narrow YouTube outlier research CLI for finding
low-subscriber, high-view inspiration videos.

## Product Thesis

YouTube's public discovery and Data API make it possible to rank creator
outliers more reliably than on more constrained platforms. The product should
stay focused on explainable scoring and inspection, not broad creator-platform
automation.

## Goals

- Keep public research as the first-class path.
- Preserve channel-baseline outlier scoring before subscriber-ratio fallback.
- Keep a narrow, explicit OAuth upload lane for finished videos without turning
  the repo into a general creator-management suite.
- Emit outputs that agents can inspect, save, and compare.

## Non-Goals

- Do not expand account actions beyond finished-video upload and explicit
  authorized-channel identity checks.
- Do not collapse YouTube, TikTok, and Instagram into one vague collector.
- Do not hide weak baseline data behind confident rankings.
