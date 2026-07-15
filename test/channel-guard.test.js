import assert from 'node:assert/strict';
import test from 'node:test';
import { assertExpectedYouTubeChannel } from '../src/channel-guard.js';

test('assertExpectedYouTubeChannel accepts the exact channel ID', () => {
    const channel = { id: 'UCexpected', customUrl: '@expected' };
    assert.equal(assertExpectedYouTubeChannel([channel], 'UCexpected'), channel);
});

test('assertExpectedYouTubeChannel blocks empty or mismatched grants', () => {
    assert.throws(
        () => assertExpectedYouTubeChannel([], 'UCexpected'),
        /Tokens were not saved and no upload was started/,
    );
    assert.throws(
        () => assertExpectedYouTubeChannel([{ id: 'UCwrong', customUrl: '@wrong' }], 'UCexpected'),
        /@wrong \(UCwrong\)/,
    );
});
