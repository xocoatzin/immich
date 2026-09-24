import { describe, expect, it } from 'vitest';
import { ApiTag, Permission, PostVisibility, PostVisibilitySchema } from 'src/enum.js';

describe('PostVisibility', () => {
  it('has the expected values', () => {
    expect(Object.values(PostVisibility)).toEqual(['private', 'partners', 'specific', 'public']);
  });

  it('accepts each visibility value', () => {
    for (const visibility of Object.values(PostVisibility)) {
      expect(PostVisibilitySchema.safeParse(visibility).success).toBe(true);
    }
  });

  it('rejects unknown values', () => {
    expect(PostVisibilitySchema.safeParse('everyone').success).toBe(false);
    expect(PostVisibilitySchema.safeParse('').success).toBe(false);
    expect(PostVisibilitySchema.safeParse(undefined).success).toBe(false);
  });

  it('exposes the private value', () => {
    expect(PostVisibility.Private).toBe('private');
  });
});

describe('Post permissions', () => {
  it('defines post CRUD permissions', () => {
    expect(Permission.PostCreate).toBe('post.create');
    expect(Permission.PostRead).toBe('post.read');
    expect(Permission.PostUpdate).toBe('post.update');
    expect(Permission.PostDelete).toBe('post.delete');
  });

  it('defines post comment permissions', () => {
    expect(Permission.PostCommentCreate).toBe('postComment.create');
    expect(Permission.PostCommentDelete).toBe('postComment.delete');
  });

  it('defines post like permissions', () => {
    expect(Permission.PostLikeCreate).toBe('postLike.create');
    expect(Permission.PostLikeDelete).toBe('postLike.delete');
  });
});

describe('ApiTag.Posts', () => {
  it('is defined', () => {
    expect(ApiTag.Posts).toBe('Posts');
  });
});
