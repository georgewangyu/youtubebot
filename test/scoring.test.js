import assert from 'node:assert/strict';
import test from 'node:test';
import { computeBaseline, parseDurationSeconds, scoreVideo } from '../src/scoring.js';

test('computeBaseline uses median by default', () => {
    const baseline = computeBaseline([
        { views: 100 },
        { views: 300 },
        { views: 10000 },
    ]);
    assert.equal(baseline, 300);
});

test('parseDurationSeconds handles YouTube ISO durations', () => {
    assert.equal(parseDurationSeconds('PT1M30S'), 90);
    assert.equal(parseDurationSeconds('PT2H3M4S'), 7384);
});

test('scoreVideo keeps outlier score and subscriber ratio separate', () => {
    const score = scoreVideo({
        video: { views: 50000, publishedAt: '2026-01-01T00:00:00Z' },
        channel: { subscribers: 5000 },
        baselineViews: 2500,
        now: new Date('2026-01-06T00:00:00Z'),
    });

    assert.equal(score.outlierScore, 20);
    assert.equal(score.subscriberRatio, 10);
    assert.equal(score.signalStrength, 'baseline');
});
