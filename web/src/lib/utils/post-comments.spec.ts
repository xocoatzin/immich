import { UserAvatarColor, type PostCommentResponseDto } from '@immich/sdk';
import { describe, expect, it } from 'vitest';
import { buildCommentTree } from '$lib/utils/post-comments';

const comment = (overrides: Partial<PostCommentResponseDto> = {}): PostCommentResponseDto => ({
  id: 'c1',
  postId: 'p1',
  parentId: null,
  depth: 1,
  body: 'hello',
  createdAt: '2026-09-24T10:00:00.000Z',
  updatedAt: '2026-09-24T10:00:00.000Z',
  user: {
    id: 'u1',
    name: 'User',
    email: 'user@example.com',
    profileImagePath: '',
    avatarColor: UserAvatarColor.Primary,
    profileChangedAt: '',
  },
  ...overrides,
});

describe('buildCommentTree', () => {
  it('returns top-level comments sorted oldest-first', () => {
    const tree = buildCommentTree([
      comment({ id: 'c2', createdAt: '2026-09-24T11:00:00.000Z' }),
      comment({ id: 'c1', createdAt: '2026-09-24T10:00:00.000Z' }),
    ]);
    expect(tree.map((node) => node.id)).toEqual(['c1', 'c2']);
  });

  it('nests replies under their parent', () => {
    const tree = buildCommentTree([
      comment({ id: 'c1' }),
      comment({ id: 'c2', parentId: 'c1', depth: 2, createdAt: '2026-09-24T11:00:00.000Z' }),
      comment({ id: 'c3', parentId: 'c2', depth: 3, createdAt: '2026-09-24T12:00:00.000Z' }),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children.map((node) => node.id)).toEqual(['c2']);
    expect(tree[0].children[0].children.map((node) => node.id)).toEqual(['c3']);
  });

  it('sorts children oldest-first', () => {
    const tree = buildCommentTree([
      comment({ id: 'c1' }),
      comment({ id: 'c3', parentId: 'c1', depth: 2, createdAt: '2026-09-24T12:00:00.000Z' }),
      comment({ id: 'c2', parentId: 'c1', depth: 2, createdAt: '2026-09-24T11:00:00.000Z' }),
    ]);
    expect(tree[0].children.map((node) => node.id)).toEqual(['c2', 'c3']);
  });

  it('treats comments with a missing parent as top-level', () => {
    const tree = buildCommentTree([comment({ id: 'c1', parentId: 'missing', depth: 2 })]);
    expect(tree.map((node) => node.id)).toEqual(['c1']);
  });

  it('handles an empty list', () => {
    expect(buildCommentTree([])).toEqual([]);
  });
});
