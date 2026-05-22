# Scoring Notes

## Target Behavior

The goal is a 1of10/Yorby-like finder for inspiration videos:

- low subscriber count
- unusually high video views
- ideally unusually high relative to the creator's normal views
- agent-readable output

## Signals

### True Outlier Score

```text
target_video_views / channel_recent_upload_baseline_views
```

This is the strongest signal because it asks whether the video overperformed the creator's normal baseline.

### Subscriber Ratio

```text
target_video_views / channel_subscribers
```

This is useful for low-subscriber discovery, but weaker. It can find "small creator, big video" cases even when channel-baseline data is not available.

## Ranking Policy

Use true outlier score when baseline exists. Fall back to subscriber ratio only when needed, and label the row with `signalStrength: "subscriber_ratio"`.

## Open Questions

- Whether baseline should exclude Shorts when searching long-form, and vice versa.
- Whether a channel's pinned/viral historic uploads should be excluded from baseline.
- Whether the next version should cache channels/videos locally to reduce YouTube API quota usage.
