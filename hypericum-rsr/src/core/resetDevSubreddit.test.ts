import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@devvit/web/server', () => ({
  reddit: {
    getCurrentUsername: vi.fn(),
    getNewPosts: vi.fn(),
    getHotPosts: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock('./purgeAllQueueData.js', () => ({
  purgeAllQueueData: vi.fn(),
}));

import { reddit } from '@devvit/web/server';

import { purgeAllQueueData } from './purgeAllQueueData.js';
import {
  DEV_RESET_SUBREDDIT,
  RSR_DASHBOARD_POST_TITLE,
  resetDevSubreddit,
} from './resetDevSubreddit.js';

function mockListing<T>(items: T[]) {
  return {
    all: vi.fn().mockResolvedValue(items),
  };
}

describe('resetDevSubreddit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(reddit.getCurrentUsername).mockResolvedValue('testuser');
    vi.mocked(reddit.remove).mockResolvedValue(undefined);
    vi.mocked(purgeAllQueueData).mockResolvedValue({
      deletedSignals: 3,
      deletedDrafts: 1,
      deletedInsights: 2,
      deletedEmbeddings: 3,
      deletedEngagements: 0,
    });
  });

  it('blocks reset outside the dev subreddit', async () => {
    await expect(resetDevSubreddit('some_other_sub')).rejects.toThrow(
      DEV_RESET_SUBREDDIT
    );
    expect(purgeAllQueueData).not.toHaveBeenCalled();
  });

  it('removes current-user posts, dashboard posts, and purges queue', async () => {
    vi.mocked(reddit.getNewPosts).mockReturnValue(
      mockListing([
        { id: 't3_user1', title: 'My eval post', authorName: 'testuser' },
        { id: 't3_other', title: 'Someone else', authorName: 'other' },
      ]) as never
    );
    vi.mocked(reddit.getHotPosts).mockReturnValue(
      mockListing([
        {
          id: 't3_dash',
          title: RSR_DASHBOARD_POST_TITLE,
          authorName: 'hypericum-rsr',
        },
      ]) as never
    );

    const result = await resetDevSubreddit(DEV_RESET_SUBREDDIT);

    expect(reddit.remove).toHaveBeenCalledTimes(2);
    expect(reddit.remove).toHaveBeenCalledWith('t3_user1', false);
    expect(reddit.remove).toHaveBeenCalledWith('t3_dash', false);
    expect(result.removedPosts).toBe(2);
    expect(result.skippedPosts).toBe(1);
    expect(result.deletedSignals).toBe(3);
    expect(purgeAllQueueData).toHaveBeenCalledOnce();
  });
});
