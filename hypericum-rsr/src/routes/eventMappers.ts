import type {
  OnCommentSubmitRequest,
  OnPostSubmitRequest,
  OnPostUpdateRequest,
  PostV2,
  SubredditV2,
  UserV2,
} from '@devvit/web/shared';

type PostEventPayload = {
  post?: PostV2 | undefined;
  author?: UserV2 | undefined;
  subreddit?: SubredditV2 | undefined;
};

import type { ContentEventInput } from '../core/processContentEvent.js';

function toMs(timestamp: number | undefined): number {
  if (!timestamp) {
    return Date.now();
  }
  return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
}

export function mapPostSubmit(
  body: PostEventPayload
): ContentEventInput | undefined {
  const post = body.post;
  const subreddit = body.subreddit?.name;
  if (!post?.id || !subreddit) {
    return undefined;
  }

  const text = [post.title, post.selftext].filter(Boolean).join('\n');
  return {
    contentId: post.id,
    contentType: 'post',
    eventType: 'submit',
    subreddit,
    author: body.author?.name ?? 'unknown',
    text,
    createdAt: toMs(post.createdAt),
    engagement: {
      score: post.score ?? 0,
      ...(post.numComments !== undefined
        ? { numComments: post.numComments }
        : {}),
    },
    ...(post.title ? { title: post.title } : {}),
    ...(post.permalink ? { permalink: post.permalink } : {}),
  };
}

export function mapPostUpdate(
  body: OnPostUpdateRequest | OnPostSubmitRequest
): ContentEventInput | undefined {
  const mapped = mapPostSubmit(body);
  if (!mapped) {
    return undefined;
  }
  return { ...mapped, eventType: 'update' };
}

export function mapCommentSubmit(
  body: OnCommentSubmitRequest
): ContentEventInput | undefined {
  const comment = body.comment;
  const subreddit = body.subreddit?.name;
  if (!comment?.id || !subreddit) {
    return undefined;
  }

  const postTitle = body.post?.title;
  const text = postTitle
    ? `${postTitle}\n${comment.body}`
    : comment.body;

  return {
    contentId: comment.id,
    contentType: 'comment',
    eventType: 'submit',
    subreddit,
    author: body.author?.name ?? comment.author ?? 'unknown',
    text,
    createdAt: toMs(comment.createdAt),
    engagement: {
      score: comment.score ?? 0,
    },
    ...(postTitle !== undefined ? { title: postTitle } : {}),
    ...(comment.permalink ? { permalink: comment.permalink } : {}),
  };
}
