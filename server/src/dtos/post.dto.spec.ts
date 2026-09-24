import {
  PostCommentCreateSchema,
  PostCreateSchema,
  PostFeedSchema,
  PostUpdateSchema,
  PostValidateSchema,
  mapPost,
  mapPostComment,
} from 'src/dtos/post.dto.js';
import { PostVisibility } from 'src/enum.js';
import { newUuid } from 'test/small.factory.js';

describe('post DTOs', () => {
  describe('PostCreateSchema', () => {
    it('should accept a minimal post and default to private', () => {
      const result = PostCreateSchema.safeParse({ body: 'hello' });
      expect(result.success).toBe(true);
      expect(result.data?.visibility).toBe(PostVisibility.Private);
    });

    it('should reject an empty body', () => {
      expect(PostCreateSchema.safeParse({ body: '' }).success).toBe(false);
      expect(PostCreateSchema.safeParse({ body: ' '.repeat(3) }).success).toBe(false);
    });

    it('should trim the body', () => {
      const result = PostCreateSchema.safeParse({ body: '  hello  ' });
      expect(result.success).toBe(true);
      expect(result.data?.body).toBe('hello');
    });

    it('should reject a body over 10,000 characters', () => {
      expect(PostCreateSchema.safeParse({ body: 'x'.repeat(10_001) }).success).toBe(false);
    });

    it('should require exactly one of assetId or albumId per attachment', () => {
      const assetId = newUuid();
      const albumId = newUuid();
      expect(PostCreateSchema.safeParse({ body: 'x', attachments: [{ assetId }] }).success).toBe(true);
      expect(PostCreateSchema.safeParse({ body: 'x', attachments: [{ albumId }] }).success).toBe(true);
      expect(PostCreateSchema.safeParse({ body: 'x', attachments: [{ assetId, albumId }] }).success).toBe(false);
      expect(PostCreateSchema.safeParse({ body: 'x', attachments: [{}] }).success).toBe(false);
    });

    it('should reject more than 30 attachments', () => {
      const attachments = Array.from({ length: 31 }, () => ({ assetId: newUuid() }));
      expect(PostCreateSchema.safeParse({ body: 'x', attachments }).success).toBe(false);
    });

    it('should require a non-empty audience for specific visibility', () => {
      expect(PostCreateSchema.safeParse({ body: 'x', visibility: 'specific' }).success).toBe(false);
      expect(PostCreateSchema.safeParse({ body: 'x', visibility: 'specific', audience: [] }).success).toBe(false);
      expect(PostCreateSchema.safeParse({ body: 'x', visibility: 'specific', audience: [newUuid()] }).success).toBe(
        true,
      );
    });

    it('should reject more than 100 audience members', () => {
      const audience = Array.from({ length: 101 }, () => newUuid());
      expect(PostCreateSchema.safeParse({ body: 'x', visibility: 'specific', audience }).success).toBe(false);
    });
  });

  describe('PostUpdateSchema', () => {
    it('should accept a partial update', () => {
      expect(PostUpdateSchema.safeParse({ body: 'updated' }).success).toBe(true);
      expect(PostUpdateSchema.safeParse({}).success).toBe(true);
    });

    it('should require a non-empty audience when switching to specific visibility', () => {
      expect(PostUpdateSchema.safeParse({ visibility: 'specific' }).success).toBe(false);
      expect(PostUpdateSchema.safeParse({ visibility: 'specific', audience: [newUuid()] }).success).toBe(true);
      expect(PostUpdateSchema.safeParse({ visibility: 'private' }).success).toBe(true);
    });
  });

  describe('PostFeedSchema', () => {
    it('should default the limit to 20', () => {
      const result = PostFeedSchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data?.limit).toBe(20);
    });

    it('should accept a cursor', () => {
      const cursor = newUuid();
      const result = PostFeedSchema.safeParse({ cursor });
      expect(result.success).toBe(true);
      expect(result.data?.cursor).toBe(cursor);
    });

    it('should reject a non-UUID cursor', () => {
      expect(PostFeedSchema.safeParse({ cursor: 'not-a-uuid' }).success).toBe(false);
    });

    it('should reject out-of-range limits', () => {
      expect(PostFeedSchema.safeParse({ limit: 0 }).success).toBe(false);
      expect(PostFeedSchema.safeParse({ limit: 101 }).success).toBe(false);
      expect(PostFeedSchema.safeParse({ limit: 100 }).success).toBe(true);
    });

    it('should accept an asset id filter', () => {
      const assetId = newUuid();
      const result = PostFeedSchema.safeParse({ assetId });
      expect(result.success).toBe(true);
      expect(result.data?.assetId).toBe(assetId);
    });

    it('should reject a non-UUID asset id filter', () => {
      expect(PostFeedSchema.safeParse({ assetId: 'not-a-uuid' }).success).toBe(false);
    });
  });

  describe('PostValidateSchema', () => {
    it('should require a non-empty audience for specific visibility', () => {
      expect(PostValidateSchema.safeParse({ body: 'x', visibility: 'specific' }).success).toBe(false);
      expect(PostValidateSchema.safeParse({ body: 'x', visibility: 'specific', audience: [newUuid()] }).success).toBe(
        true,
      );
    });
  });

  describe('mapPost', () => {
    it('should convert string counts from the database to numbers', () => {
      // kysely types count(*) as number, but the pg driver returns strings at runtime
      const post = {
        id: newUuid(),
        ownerId: newUuid(),
        body: 'hello',
        visibility: PostVisibility.Private,
        likeCount: '3',
        commentCount: '7',
        createdAt: new Date(),
        updatedAt: new Date(),
        owner: { id: newUuid(), name: 'a', email: 'a@b.c' },
      };
      const result = mapPost(post as never, { isLiked: false, attachments: [], audience: [] });
      expect(result.likeCount).toBe(3);
      expect(result.commentCount).toBe(7);
    });

    it('should default missing counts to zero', () => {
      const post = {
        id: newUuid(),
        ownerId: newUuid(),
        body: 'hello',
        visibility: PostVisibility.Private,
        createdAt: new Date(),
        updatedAt: new Date(),
        owner: { id: newUuid(), name: 'a', email: 'a@b.c' },
      };
      const result = mapPost(post as never, { isLiked: true, attachments: [], audience: null });
      expect(result.likeCount).toBe(0);
      expect(result.commentCount).toBe(0);
      expect(result.isLiked).toBe(true);
      expect(result.audience).toBeNull();
    });
  });

  describe('PostCommentCreateSchema', () => {
    it('should accept a body without a parent', () => {
      const result = PostCommentCreateSchema.safeParse({ body: 'nice shot' });
      expect(result.success).toBe(true);
      expect(result.data?.parentId).toBeUndefined();
    });

    it('should accept a reply with a parent id', () => {
      const parentId = newUuid();
      const result = PostCommentCreateSchema.safeParse({ body: 'agreed', parentId });
      expect(result.success).toBe(true);
      expect(result.data?.parentId).toBe(parentId);
    });

    it('should reject an empty body', () => {
      expect(PostCommentCreateSchema.safeParse({ body: '' }).success).toBe(false);
      expect(PostCommentCreateSchema.safeParse({ body: ' '.repeat(3) }).success).toBe(false);
    });

    it('should reject a body over 5000 characters', () => {
      expect(PostCommentCreateSchema.safeParse({ body: 'x'.repeat(5001) }).success).toBe(false);
      expect(PostCommentCreateSchema.safeParse({ body: 'x'.repeat(5000) }).success).toBe(true);
    });

    it('should reject a non-UUID parent id', () => {
      expect(PostCommentCreateSchema.safeParse({ body: 'hi', parentId: 'not-a-uuid' }).success).toBe(false);
    });
  });

  describe('mapPostComment', () => {
    it('should map a comment row with its depth and author', () => {
      const userId = newUuid();
      const comment = {
        id: newUuid(),
        postId: newUuid(),
        parentId: null,
        userId,
        body: 'hello',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        updateId: newUuid(),
        user: { id: userId, name: 'a', email: 'a@b.c' },
      };
      const result = mapPostComment(comment as never, 2);
      expect(result.id).toBe(comment.id);
      expect(result.postId).toBe(comment.postId);
      expect(result.parentId).toBeNull();
      expect(result.depth).toBe(2);
      expect(result.body).toBe('hello');
      expect(result.createdAt).toEqual(comment.createdAt);
      expect(result.updatedAt).toEqual(comment.updatedAt);
      expect(result.user.id).toBe(userId);
      expect(result.user.name).toBe('a');
      expect(result.user.email).toBe('a@b.c');
    });
  });
});
