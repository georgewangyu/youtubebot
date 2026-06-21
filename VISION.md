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
- Make OAuth scaffolding clearly future-facing, not a hidden upload product.
- Emit outputs that agents can inspect, save, and compare.

## Non-Goals

- Do not add account actions unless they support the outlier-finding thesis.
- Do not collapse YouTube, TikTok, and Instagram into one vague collector.
- Do not hide weak baseline data behind confident rankings.
