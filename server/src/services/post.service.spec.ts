import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PostVisibility, UserAvatarColor } from 'src/enum.js';
import { PartnerRepository } from 'src/repositories/partner.repository.js';
import { PostRepository } from 'src/repositories/post.repository.js';
import { PostService } from 'src/services/post.service.js';
import { AuthFactory } from 'test/factories/auth.factory.js';
import { newUuid } from 'test/small.factory.js';
import { ServiceMocks, newTestService } from 'test/utils.js';

type PostRow = NonNullable<Awaited<ReturnType<PostRepository['getById']>>>;
type PartnerRow = Awaited<ReturnType<PartnerRepository['getAll']>>[number];

const newPostRow = (ownerId: string, overrides: Partial<PostRow> = {}): PostRow =>
  ({
    id: newUuid(),
    ownerId,
    owner: {
      id: ownerId,
      email: 'post@test.com',
      name: 'Post Owner',
      avatarColor: UserAvatarColor.Primary,
      profileChangedAt: new Date().toISOString(),
      profileImagePath: '',
    },
    body: 'post body',
    visibility: PostVisibility.Private,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    updateId: newUuid(),
    likeCount: 0,
    commentCount: 0,
    ...overrides,
  }) as PostRow;

const newPartnerRow = (sharedById: string, sharedWithId: string): PartnerRow =>
  ({ sharedById, sharedWithId }) as PartnerRow;

type CommentRow = NonNullable<Awaited<ReturnType<PostRepository['getCommentById']>>>;

const newCommentRow = (postId: string, userId: string, overrides: Record<string, unknown> = {}): CommentRow =>
  ({
    id: newUuid(),
    postId,
    parentId: null,
    userId,
    body: 'comment body',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    updateId: newUuid(),
    user: {
      id: userId,
      email: 'comment@test.com',
      name: 'Commenter',
      avatarColor: UserAvatarColor.Primary,
      profileChangedAt: new Date().toISOString(),
      profileImagePath: '',
    },
    ...overrides,
  }) as CommentRow;

const mockEmptyHydration = (mocks: ServiceMocks) => {
  mocks.post.getAttachmentsForPosts.mockResolvedValue([]);
  mocks.post.getLikedPostIds.mockResolvedValue(new Set());
  mocks.post.getAudienceForPosts.mockResolvedValue([]);
};

const mockAssetAccess = (mocks: ServiceMocks, accessibleIds: Set<string>) => {
  mocks.access.asset.checkOwnerAccess.mockResolvedValue(accessibleIds);
  mocks.access.asset.checkAlbumAccess.mockResolvedValue(new Set());
  mocks.access.asset.checkPartnerAccess.mockResolvedValue(new Set());
};

describe(PostService.name, () => {
  let sut: PostService;
  let mocks: ServiceMocks;

  beforeEach(() => {
    ({ sut, mocks } = newTestService(PostService));
  });

  it('should work', () => {
    expect(sut).toBeDefined();
  });

  describe('create', () => {
    it('should create a private post', async () => {
      const userId = newUuid();
      const postId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const row = newPostRow(userId, { id: postId });

      mocks.post.createWithDetails.mockResolvedValue({ id: postId } as Awaited<
        ReturnType<PostRepository['createWithDetails']>
      >);
      mocks.post.getById.mockResolvedValue(row);
      mockEmptyHydration(mocks);

      const result = await sut.create(auth, { body: 'hello', visibility: PostVisibility.Private });

      expect(mocks.post.createWithDetails).toHaveBeenCalledWith(
        { ownerId: userId, body: 'hello', visibility: PostVisibility.Private },
        [],
        new Set(),
      );
      expect(result.id).toBe(postId);
      expect(result.body).toBe('post body');
      expect(result.warnings).toEqual([]);
    });

    it('should default to private visibility when omitted', async () => {
      const userId = newUuid();
      const postId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const row = newPostRow(userId, { id: postId });

      mocks.post.createWithDetails.mockResolvedValue({ id: postId } as Awaited<
        ReturnType<PostRepository['createWithDetails']>
      >);
      mocks.post.getById.mockResolvedValue(row);
      mockEmptyHydration(mocks);

      await sut.create(auth, { body: 'hello' } as Parameters<PostService['create']>[1]);

      expect(mocks.post.createWithDetails).toHaveBeenCalledWith(
        { ownerId: userId, body: 'hello', visibility: PostVisibility.Private },
        [],
        new Set(),
      );
    });

    it('should set the audience for specific visibility', async () => {
      const userId = newUuid();
      const audienceId = newUuid();
      const postId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const row = newPostRow(userId, { id: postId, visibility: PostVisibility.Specific });

      mocks.post.createWithDetails.mockResolvedValue({ id: postId } as Awaited<
        ReturnType<PostRepository['createWithDetails']>
      >);
      mocks.user.getExistingIds.mockResolvedValue(new Set([audienceId]));
      mocks.post.getById.mockResolvedValue(row);
      mocks.post.getAudienceForPosts.mockResolvedValue([{ postId, userId: audienceId }]);
      mocks.post.getAttachmentsForPosts.mockResolvedValue([]);
      mocks.post.getLikedPostIds.mockResolvedValue(new Set());

      const result = await sut.create(auth, {
        body: 'hello',
        visibility: PostVisibility.Specific,
        audience: [audienceId],
      });

      expect(mocks.post.createWithDetails).toHaveBeenCalledWith(
        { ownerId: userId, body: 'hello', visibility: PostVisibility.Specific },
        [],
        new Set([audienceId]),
      );
      expect(result.audience).toEqual([audienceId]);
    });

    it('should reject an unknown audience member without creating the post', async () => {
      const auth = AuthFactory.create();
      const audienceId = newUuid();

      mocks.user.getExistingIds.mockResolvedValue(new Set());

      await expect(
        sut.create(auth, { body: 'hello', visibility: PostVisibility.Specific, audience: [audienceId] }),
      ).rejects.toThrow(BadRequestException);
      expect(mocks.post.createWithDetails).not.toHaveBeenCalled();
    });

    it('should reject specific visibility without an audience at the service level', async () => {
      const auth = AuthFactory.create();

      await expect(
        sut.create(auth, { body: 'hello', visibility: PostVisibility.Specific } as Parameters<
          PostService['create']
        >[1]),
      ).rejects.toThrow(BadRequestException);
      expect(mocks.post.createWithDetails).not.toHaveBeenCalled();
    });

    it('should require access to attached assets', async () => {
      const auth = AuthFactory.create();
      const assetId = newUuid();

      mockAssetAccess(mocks, new Set());

      await expect(
        sut.create(auth, { body: 'hello', visibility: PostVisibility.Private, attachments: [{ assetId }] }),
      ).rejects.toThrow();
      expect(mocks.post.createWithDetails).not.toHaveBeenCalled();
    });

    it('should require access to attached albums', async () => {
      const auth = AuthFactory.create();
      const albumId = newUuid();

      mocks.access.album.checkOwnerAccess.mockResolvedValue(new Set());
      mocks.access.album.checkSharedAlbumAccess.mockResolvedValue(new Set());

      await expect(
        sut.create(auth, { body: 'hello', visibility: PostVisibility.Private, attachments: [{ albumId }] }),
      ).rejects.toThrow();
      expect(mocks.post.createWithDetails).not.toHaveBeenCalled();
    });

    it('should create a post with attachments when access is granted', async () => {
      const userId = newUuid();
      const postId = newUuid();
      const assetId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const row = newPostRow(userId, { id: postId });

      mockAssetAccess(mocks, new Set([assetId]));
      mocks.post.createWithDetails.mockResolvedValue({ id: postId } as Awaited<
        ReturnType<PostRepository['createWithDetails']>
      >);
      mocks.post.getById.mockResolvedValue(row);
      mocks.post.getAttachmentsForPosts.mockResolvedValue([
        { id: newUuid(), postId, assetId, albumId: null, position: 0 },
      ]);
      mocks.post.getLikedPostIds.mockResolvedValue(new Set());
      mocks.post.getAudienceForPosts.mockResolvedValue([]);

      const result = await sut.create(auth, {
        body: 'hello',
        visibility: PostVisibility.Private,
        attachments: [{ assetId }],
      });

      expect(mocks.post.createWithDetails).toHaveBeenCalledWith(
        { ownerId: userId, body: 'hello', visibility: PostVisibility.Private },
        [{ assetId }],
        new Set(),
      );
      expect(result.attachments).toEqual([{ assetId, albumId: null, position: 0 }]);
      expect(result.warnings).toEqual([]);
    });

    it('should warn when a partner cannot view an attachment', async () => {
      const userId = newUuid();
      const partnerId = newUuid();
      const postId = newUuid();
      const assetId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const row = newPostRow(userId, { id: postId, visibility: PostVisibility.Partners });

      mocks.access.asset.checkOwnerAccess.mockImplementation((callerId: string) =>
        Promise.resolve(callerId === userId ? new Set([assetId]) : new Set<string>()),
      );
      mocks.access.asset.checkAlbumAccess.mockResolvedValue(new Set());
      mocks.access.asset.checkPartnerAccess.mockResolvedValue(new Set());
      mocks.partner.getAll.mockResolvedValue([newPartnerRow(userId, partnerId)]);
      mocks.post.createWithDetails.mockResolvedValue({ id: postId } as Awaited<
        ReturnType<PostRepository['createWithDetails']>
      >);
      mocks.post.getById.mockResolvedValue(row);
      mockEmptyHydration(mocks);

      const result = await sut.create(auth, {
        body: 'hello',
        visibility: PostVisibility.Partners,
        attachments: [{ assetId }],
      });

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatch(/1 person in your partners/);
    });

    it('should not warn when every partner can view the attachments', async () => {
      const userId = newUuid();
      const partnerId = newUuid();
      const postId = newUuid();
      const assetId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const row = newPostRow(userId, { id: postId, visibility: PostVisibility.Partners });

      mockAssetAccess(mocks, new Set([assetId]));
      mocks.partner.getAll.mockResolvedValue([newPartnerRow(userId, partnerId)]);
      mocks.post.createWithDetails.mockResolvedValue({ id: postId } as Awaited<
        ReturnType<PostRepository['createWithDetails']>
      >);
      mocks.post.getById.mockResolvedValue(row);
      mockEmptyHydration(mocks);

      const result = await sut.create(auth, {
        body: 'hello',
        visibility: PostVisibility.Partners,
        attachments: [{ assetId }],
      });

      expect(result.warnings).toEqual([]);
    });

    it('should warn generically for public posts with attachments', async () => {
      const userId = newUuid();
      const postId = newUuid();
      const assetId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const row = newPostRow(userId, { id: postId, visibility: PostVisibility.Public });

      mockAssetAccess(mocks, new Set([assetId]));
      mocks.post.createWithDetails.mockResolvedValue({ id: postId } as Awaited<
        ReturnType<PostRepository['createWithDetails']>
      >);
      mocks.post.getById.mockResolvedValue(row);
      mockEmptyHydration(mocks);

      const result = await sut.create(auth, {
        body: 'hello',
        visibility: PostVisibility.Public,
        attachments: [{ assetId }],
      });

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatch(/keep their own visibility/);
    });

    it('should warn when an audience member cannot view an attachment', async () => {
      const userId = newUuid();
      const strangerId = newUuid();
      const postId = newUuid();
      const assetId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const row = newPostRow(userId, { id: postId, visibility: PostVisibility.Specific });

      mocks.access.asset.checkOwnerAccess.mockImplementation((callerId: string) =>
        Promise.resolve(callerId === userId ? new Set([assetId]) : new Set<string>()),
      );
      mocks.access.asset.checkAlbumAccess.mockResolvedValue(new Set());
      mocks.access.asset.checkPartnerAccess.mockResolvedValue(new Set());
      mocks.user.getExistingIds.mockResolvedValue(new Set([strangerId]));
      mocks.post.createWithDetails.mockResolvedValue({ id: postId } as Awaited<
        ReturnType<PostRepository['createWithDetails']>
      >);
      mocks.post.getById.mockResolvedValue(row);
      mocks.post.getAudienceForPosts.mockResolvedValue([{ postId, userId: strangerId }]);
      mocks.post.getAttachmentsForPosts.mockResolvedValue([]);
      mocks.post.getLikedPostIds.mockResolvedValue(new Set());

      const result = await sut.create(auth, {
        body: 'hello',
        visibility: PostVisibility.Specific,
        audience: [strangerId],
        attachments: [{ assetId }],
      });

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatch(/1 person in the audience/);
      expect(mocks.partner.getAll).not.toHaveBeenCalled();
    });

    it('should warn when a partner cannot view an album attachment', async () => {
      const userId = newUuid();
      const partnerId = newUuid();
      const postId = newUuid();
      const albumId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const row = newPostRow(userId, { id: postId, visibility: PostVisibility.Partners });

      // the author can access the album; the partner cannot
      mocks.access.album.checkOwnerAccess.mockImplementation((callerId: string) =>
        Promise.resolve(callerId === userId ? new Set([albumId]) : new Set<string>()),
      );
      mocks.access.album.checkSharedAlbumAccess.mockResolvedValue(new Set());
      mocks.partner.getAll.mockResolvedValue([newPartnerRow(userId, partnerId)]);
      mocks.post.createWithDetails.mockResolvedValue({ id: postId } as Awaited<
        ReturnType<PostRepository['createWithDetails']>
      >);
      mocks.post.getById.mockResolvedValue(row);
      mockEmptyHydration(mocks);

      const result = await sut.create(auth, {
        body: 'hello',
        visibility: PostVisibility.Partners,
        attachments: [{ albumId }],
      });

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatch(/1 person in your partners/);
    });

    it('should only warn about partners the author shares with', async () => {
      const userId = newUuid();
      const outgoingId = newUuid();
      const incomingId = newUuid();
      const postId = newUuid();
      const assetId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const row = newPostRow(userId, { id: postId, visibility: PostVisibility.Partners });

      // the author can view the asset; neither partner can
      mocks.access.asset.checkOwnerAccess.mockImplementation((callerId: string) =>
        Promise.resolve(callerId === userId ? new Set([assetId]) : new Set<string>()),
      );
      mocks.access.asset.checkAlbumAccess.mockResolvedValue(new Set());
      mocks.access.asset.checkPartnerAccess.mockResolvedValue(new Set());
      mocks.partner.getAll.mockResolvedValue([newPartnerRow(userId, outgoingId), newPartnerRow(incomingId, userId)]);
      mocks.post.createWithDetails.mockResolvedValue({ id: postId } as Awaited<
        ReturnType<PostRepository['createWithDetails']>
      >);
      mocks.post.getById.mockResolvedValue(row);
      mockEmptyHydration(mocks);

      const result = await sut.create(auth, {
        body: 'hello',
        visibility: PostVisibility.Partners,
        attachments: [{ assetId }],
      });

      // only the outgoing partner is a viewer; the incoming one shares with the author
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatch(/1 person in your partners/);
    });

    it('should exclude the author from audience viewer checks', async () => {
      const userId = newUuid();
      const strangerId = newUuid();
      const postId = newUuid();
      const assetId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const row = newPostRow(userId, { id: postId, visibility: PostVisibility.Specific });

      // the author always has access (required to attach), so the warning message
      // alone cannot pin the self-exclusion filter — record the viewer checks instead
      const viewerChecks: string[] = [];
      mocks.access.asset.checkOwnerAccess.mockImplementation(
        (callerId: string, _ids: Set<string>, skipPartnerCheck?: boolean) => {
          if (skipPartnerCheck === false) {
            viewerChecks.push(callerId);
          }
          return Promise.resolve(callerId === userId ? new Set([assetId]) : new Set<string>());
        },
      );
      mocks.access.asset.checkAlbumAccess.mockResolvedValue(new Set());
      mocks.access.asset.checkPartnerAccess.mockResolvedValue(new Set());
      mocks.user.getExistingIds.mockResolvedValue(new Set([userId, strangerId]));
      mocks.post.createWithDetails.mockResolvedValue({ id: postId } as Awaited<
        ReturnType<PostRepository['createWithDetails']>
      >);
      mocks.post.getById.mockResolvedValue(row);
      mockEmptyHydration(mocks);

      const result = await sut.create(auth, {
        body: 'hello',
        visibility: PostVisibility.Specific,
        audience: [userId, strangerId],
        attachments: [{ assetId }],
      });

      expect(viewerChecks).toEqual([strangerId]);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatch(/1 person in the audience/);
    });

    it('should count every viewer that cannot view an attachment', async () => {
      const userId = newUuid();
      const partnerWithAccess = newUuid();
      const partnerWithoutAccess = newUuid();
      const postId = newUuid();
      const assetId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const row = newPostRow(userId, { id: postId, visibility: PostVisibility.Partners });

      mocks.access.asset.checkOwnerAccess.mockImplementation((callerId: string) =>
        Promise.resolve(callerId === userId || callerId === partnerWithAccess ? new Set([assetId]) : new Set<string>()),
      );
      mocks.access.asset.checkAlbumAccess.mockResolvedValue(new Set());
      mocks.access.asset.checkPartnerAccess.mockResolvedValue(new Set());
      mocks.partner.getAll.mockResolvedValue([
        newPartnerRow(userId, partnerWithAccess),
        newPartnerRow(userId, partnerWithoutAccess),
      ]);
      mocks.post.createWithDetails.mockResolvedValue({ id: postId } as Awaited<
        ReturnType<PostRepository['createWithDetails']>
      >);
      mocks.post.getById.mockResolvedValue(row);
      mockEmptyHydration(mocks);

      const result = await sut.create(auth, {
        body: 'hello',
        visibility: PostVisibility.Partners,
        attachments: [{ assetId }],
      });

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatch(/1 person in your partners/);
    });
  });

  describe('update', () => {
    it('should update a post', async () => {
      const userId = newUuid();
      const postId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const row = newPostRow(userId, { id: postId });

      mocks.access.post.checkOwnerAccess.mockResolvedValue(new Set([postId]));
      mocks.post.getById.mockResolvedValue(row);
      mocks.post.getAttachments.mockResolvedValue([]);
      mocks.post.updateWithDetails.mockResolvedValue();
      mockEmptyHydration(mocks);

      const result = await sut.update(auth, postId, { body: 'updated' });

      expect(mocks.post.updateWithDetails).toHaveBeenCalledWith(postId, {
        values: { body: 'updated' },
        attachments: undefined,
        audience: undefined,
      });
      expect(result.warnings).toEqual([]);
    });

    it('should update a post with no fields', async () => {
      const userId = newUuid();
      const postId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const row = newPostRow(userId, { id: postId });

      mocks.access.post.checkOwnerAccess.mockResolvedValue(new Set([postId]));
      mocks.post.getById.mockResolvedValue(row);
      mocks.post.getAttachments.mockResolvedValue([]);
      mocks.post.updateWithDetails.mockResolvedValue();
      mockEmptyHydration(mocks);

      const result = await sut.update(auth, postId, {});

      expect(mocks.post.updateWithDetails).toHaveBeenCalledWith(postId, {
        values: {},
        attachments: undefined,
        audience: undefined,
      });
      expect(result.id).toBe(postId);
    });

    it('should clear the audience when switching away from specific visibility', async () => {
      const userId = newUuid();
      const postId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const row = newPostRow(userId, { id: postId, visibility: PostVisibility.Specific });

      mocks.access.post.checkOwnerAccess.mockResolvedValue(new Set([postId]));
      mocks.post.getById.mockResolvedValue(row);
      mocks.post.updateWithDetails.mockResolvedValue();
      mocks.post.getAttachments.mockResolvedValue([]);
      mockEmptyHydration(mocks);

      await sut.update(auth, postId, { visibility: PostVisibility.Private });

      expect(mocks.post.updateWithDetails).toHaveBeenCalledWith(postId, {
        values: { visibility: PostVisibility.Private },
        attachments: undefined,
        audience: null,
      });
    });

    it('should replace the audience when switching to specific visibility', async () => {
      const userId = newUuid();
      const postId = newUuid();
      const audienceId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const row = newPostRow(userId, { id: postId, visibility: PostVisibility.Private });

      mocks.access.post.checkOwnerAccess.mockResolvedValue(new Set([postId]));
      mocks.post.getById.mockResolvedValue(row);
      mocks.user.getExistingIds.mockResolvedValue(new Set([audienceId]));
      mocks.post.updateWithDetails.mockResolvedValue();
      mocks.post.getAttachments.mockResolvedValue([]);
      mockEmptyHydration(mocks);

      await sut.update(auth, postId, { visibility: PostVisibility.Specific, audience: [audienceId] });

      expect(mocks.post.updateWithDetails).toHaveBeenCalledWith(postId, {
        values: { visibility: PostVisibility.Specific },
        attachments: undefined,
        audience: new Set([audienceId]),
      });
    });

    it('should update the audience without changing visibility', async () => {
      const userId = newUuid();
      const postId = newUuid();
      const audienceId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const row = newPostRow(userId, { id: postId, visibility: PostVisibility.Specific });

      mocks.access.post.checkOwnerAccess.mockResolvedValue(new Set([postId]));
      mocks.post.getById.mockResolvedValue(row);
      mocks.user.getExistingIds.mockResolvedValue(new Set([audienceId]));
      mocks.post.updateWithDetails.mockResolvedValue();
      mocks.post.getAttachments.mockResolvedValue([]);
      mockEmptyHydration(mocks);

      await sut.update(auth, postId, { audience: [audienceId] });

      expect(mocks.post.updateWithDetails).toHaveBeenCalledWith(postId, {
        values: {},
        attachments: undefined,
        audience: new Set([audienceId]),
      });
    });

    it('should keep the existing audience when updating a specific post without an audience', async () => {
      const userId = newUuid();
      const postId = newUuid();
      const audienceId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const row = newPostRow(userId, { id: postId, visibility: PostVisibility.Specific });

      mocks.access.post.checkOwnerAccess.mockResolvedValue(new Set([postId]));
      mocks.post.getById.mockResolvedValue(row);
      mocks.post.getAudienceUserIds.mockResolvedValue([audienceId]);
      mocks.post.updateWithDetails.mockResolvedValue();
      mocks.post.getAttachments.mockResolvedValue([]);
      mockEmptyHydration(mocks);

      await sut.update(auth, postId, { body: 'updated' });

      expect(mocks.post.updateWithDetails).toHaveBeenCalledWith(postId, {
        values: { body: 'updated' },
        attachments: undefined,
        audience: undefined,
      });
      expect(mocks.post.getAudienceUserIds).toHaveBeenCalledWith(postId);
    });

    it('should reject switching to specific visibility without an audience', async () => {
      const userId = newUuid();
      const postId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const row = newPostRow(userId, { id: postId, visibility: PostVisibility.Private });

      mocks.access.post.checkOwnerAccess.mockResolvedValue(new Set([postId]));
      mocks.post.getById.mockResolvedValue(row);
      mocks.post.getAudienceUserIds.mockResolvedValue([]);

      await expect(sut.update(auth, postId, { visibility: PostVisibility.Specific })).rejects.toThrow(
        BadRequestException,
      );
      expect(mocks.post.updateWithDetails).not.toHaveBeenCalled();
    });

    it('should reject an empty audience on a specific post', async () => {
      const userId = newUuid();
      const postId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const row = newPostRow(userId, { id: postId, visibility: PostVisibility.Specific });

      mocks.access.post.checkOwnerAccess.mockResolvedValue(new Set([postId]));
      mocks.post.getById.mockResolvedValue(row);

      await expect(sut.update(auth, postId, { audience: [] })).rejects.toThrow(BadRequestException);
      expect(mocks.post.updateWithDetails).not.toHaveBeenCalled();
    });

    it('should ignore the audience when visibility is not specific', async () => {
      const userId = newUuid();
      const postId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const row = newPostRow(userId, { id: postId, visibility: PostVisibility.Private });

      mocks.access.post.checkOwnerAccess.mockResolvedValue(new Set([postId]));
      mocks.post.getById.mockResolvedValue(row);
      mocks.post.updateWithDetails.mockResolvedValue();
      mocks.post.getAttachments.mockResolvedValue([]);
      mockEmptyHydration(mocks);

      await sut.update(auth, postId, { audience: [newUuid()] });

      expect(mocks.post.updateWithDetails).toHaveBeenCalledWith(postId, {
        values: {},
        attachments: undefined,
        audience: undefined,
      });
      expect(mocks.user.getExistingIds).not.toHaveBeenCalled();
    });

    it('should require access to new attachments on update', async () => {
      const userId = newUuid();
      const postId = newUuid();
      const assetId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const row = newPostRow(userId, { id: postId });

      mocks.access.post.checkOwnerAccess.mockResolvedValue(new Set([postId]));
      mocks.post.getById.mockResolvedValue(row);
      mockAssetAccess(mocks, new Set());

      await expect(sut.update(auth, postId, { attachments: [{ assetId }] })).rejects.toThrow();
      expect(mocks.post.updateWithDetails).not.toHaveBeenCalled();
    });

    it('should replace attachments on update when access is granted', async () => {
      const userId = newUuid();
      const postId = newUuid();
      const assetId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const row = newPostRow(userId, { id: postId });

      mocks.access.post.checkOwnerAccess.mockResolvedValue(new Set([postId]));
      mocks.post.getById.mockResolvedValue(row);
      mockAssetAccess(mocks, new Set([assetId]));
      mocks.post.updateWithDetails.mockResolvedValue();
      mockEmptyHydration(mocks);

      await sut.update(auth, postId, { attachments: [{ assetId }] });

      expect(mocks.post.updateWithDetails).toHaveBeenCalledWith(postId, {
        values: {},
        attachments: [{ assetId }],
        audience: undefined,
      });
    });

    it('should warn about existing attachments the audience cannot view', async () => {
      const userId = newUuid();
      const partnerId = newUuid();
      const postId = newUuid();
      const assetId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const row = newPostRow(userId, { id: postId, visibility: PostVisibility.Partners });

      mocks.access.post.checkOwnerAccess.mockResolvedValue(new Set([postId]));
      mocks.post.getById.mockResolvedValue(row);
      mocks.access.asset.checkOwnerAccess.mockImplementation((callerId: string) =>
        Promise.resolve(callerId === userId ? new Set([assetId]) : new Set<string>()),
      );
      mocks.access.asset.checkAlbumAccess.mockResolvedValue(new Set());
      mocks.access.asset.checkPartnerAccess.mockResolvedValue(new Set());
      mocks.partner.getAll.mockResolvedValue([newPartnerRow(userId, partnerId)]);
      mocks.post.updateWithDetails.mockResolvedValue();
      mocks.post.getAttachments.mockResolvedValue([{ id: newUuid(), postId, assetId, albumId: null, position: 0 }]);
      mockEmptyHydration(mocks);

      const result = await sut.update(auth, postId, { body: 'updated' });

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatch(/1 person in your partners/);
    });

    it('should throw when the user is not the owner', async () => {
      const auth = AuthFactory.create();
      const postId = newUuid();

      mocks.access.post.checkOwnerAccess.mockResolvedValue(new Set());

      await expect(sut.update(auth, postId, { body: 'updated' })).rejects.toThrow();
      expect(mocks.post.updateWithDetails).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should soft delete a post', async () => {
      const auth = AuthFactory.create();
      const postId = newUuid();

      mocks.access.post.checkOwnerAccess.mockResolvedValue(new Set([postId]));
      mocks.post.softDelete.mockResolvedValue();

      await sut.delete(auth, postId);

      expect(mocks.post.softDelete).toHaveBeenCalledWith(postId);
    });
  });

  describe('get', () => {
    it('should return a hydrated post with the audience for the owner', async () => {
      const userId = newUuid();
      const postId = newUuid();
      const audienceId = newUuid();
      const assetId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const row = newPostRow(userId, { id: postId, likeCount: 2, commentCount: 3 });

      mocks.access.post.checkReadAccess.mockResolvedValue(new Set([postId]));
      mocks.post.getById.mockResolvedValue(row);
      mocks.post.getAttachmentsForPosts.mockResolvedValue([
        { id: newUuid(), postId, assetId, albumId: null, position: 0 },
      ]);
      mocks.post.getLikedPostIds.mockResolvedValue(new Set([postId]));
      mocks.post.getAudienceForPosts.mockResolvedValue([{ postId, userId: audienceId }]);

      const result = await sut.get(auth, postId);

      expect(result.id).toBe(postId);
      expect(result.owner.id).toBe(userId);
      expect(result.likeCount).toBe(2);
      expect(result.commentCount).toBe(3);
      expect(result.isLiked).toBe(true);
      expect(result.attachments).toEqual([{ assetId, albumId: null, position: 0 }]);
      expect(result.audience).toEqual([audienceId]);
    });

    it('should hide the audience from non-owners', async () => {
      const ownerId = newUuid();
      const viewerId = newUuid();
      const postId = newUuid();
      const auth = AuthFactory.create({ id: viewerId });
      const row = newPostRow(ownerId, { id: postId });

      mocks.access.post.checkReadAccess.mockResolvedValue(new Set([postId]));
      mocks.post.getById.mockResolvedValue(row);
      mocks.post.getAttachmentsForPosts.mockResolvedValue([]);
      mocks.post.getLikedPostIds.mockResolvedValue(new Set());
      mocks.post.getAudienceForPosts.mockResolvedValue([{ postId, userId: newUuid() }]);

      const result = await sut.get(auth, postId);

      expect(result.audience).toBeNull();
      expect(result.isLiked).toBe(false);
    });
  });

  describe('getFeed', () => {
    it('should return hydrated feed posts', async () => {
      const userId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const first = newPostRow(userId);
      const second = newPostRow(newUuid());

      mocks.post.getFeed.mockResolvedValue([first, second]);
      mocks.post.getAttachmentsForPosts.mockResolvedValue([]);
      mocks.post.getLikedPostIds.mockResolvedValue(new Set([second.id]));
      mocks.post.getAudienceForPosts.mockResolvedValue([]);

      const results = await sut.getFeed(auth, { limit: 20 });

      expect(results).toHaveLength(2);
      expect(results[0].isLiked).toBe(false);
      expect(results[1].isLiked).toBe(true);
      expect(mocks.post.getFeed).toHaveBeenCalledWith(userId, { limit: 20, cursor: undefined });
    });

    it('should pass the cursor through to the repository', async () => {
      const userId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const cursor = newUuid();

      mocks.post.getFeed.mockResolvedValue([]);
      mockEmptyHydration(mocks);

      await sut.getFeed(auth, { limit: 20, cursor });

      expect(mocks.post.getFeed).toHaveBeenCalledWith(userId, { limit: 20, cursor });
    });

    it('should delegate to getByAssetId when an asset filter is set', async () => {
      const userId = newUuid();
      const assetId = newUuid();
      const auth = AuthFactory.create({ id: userId });

      mockAssetAccess(mocks, new Set([assetId]));
      mocks.post.getByAssetId.mockResolvedValue([]);
      mockEmptyHydration(mocks);

      await sut.getFeed(auth, { limit: 20, assetId });

      expect(mocks.post.getByAssetId).toHaveBeenCalledWith(userId, assetId);
      expect(mocks.post.getFeed).not.toHaveBeenCalled();
    });
  });

  describe('getByAssetId', () => {
    it('should return posts for an asset the user can read', async () => {
      const userId = newUuid();
      const assetId = newUuid();
      const auth = AuthFactory.create({ id: userId });

      mockAssetAccess(mocks, new Set([assetId]));
      mocks.post.getByAssetId.mockResolvedValue([]);
      mockEmptyHydration(mocks);

      const results = await sut.getByAssetId(auth, assetId);

      expect(results).toEqual([]);
      expect(mocks.post.getByAssetId).toHaveBeenCalledWith(userId, assetId);
    });

    it('should throw for an asset the user cannot read', async () => {
      const auth = AuthFactory.create();
      const assetId = newUuid();

      mockAssetAccess(mocks, new Set());

      await expect(sut.getByAssetId(auth, assetId)).rejects.toThrow();
      expect(mocks.post.getByAssetId).not.toHaveBeenCalled();
    });
  });

  describe('validate', () => {
    it('should return warnings without creating a post', async () => {
      const userId = newUuid();
      const partnerId = newUuid();
      const assetId = newUuid();
      const auth = AuthFactory.create({ id: userId });

      mocks.access.asset.checkOwnerAccess.mockImplementation((callerId: string) =>
        Promise.resolve(callerId === userId ? new Set([assetId]) : new Set<string>()),
      );
      mocks.access.asset.checkAlbumAccess.mockResolvedValue(new Set());
      mocks.access.asset.checkPartnerAccess.mockResolvedValue(new Set());
      mocks.partner.getAll.mockResolvedValue([newPartnerRow(userId, partnerId)]);

      const result = await sut.validate(auth, {
        body: 'hello',
        visibility: PostVisibility.Partners,
        attachments: [{ assetId }],
      });

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatch(/1 person in your partners/);
      expect(mocks.post.createWithDetails).not.toHaveBeenCalled();
    });

    it('should not warn when there are no partners', async () => {
      const userId = newUuid();
      const assetId = newUuid();
      const auth = AuthFactory.create({ id: userId });

      mockAssetAccess(mocks, new Set([assetId]));
      mocks.partner.getAll.mockResolvedValue([]);

      const result = await sut.validate(auth, {
        body: 'hello',
        visibility: PostVisibility.Partners,
        attachments: [{ assetId }],
      });

      expect(result.warnings).toEqual([]);
    });

    it('should reject specific visibility without an audience', async () => {
      const auth = AuthFactory.create();

      await expect(
        sut.validate(auth, { body: 'hello', visibility: PostVisibility.Specific } as Parameters<
          PostService['validate']
        >[1]),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getComments', () => {
    it('should return comments in threaded order with depths', async () => {
      const userId = newUuid();
      const postId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const base = Date.now();
      const first = newCommentRow(postId, userId, { createdAt: new Date(base) });
      const reply = newCommentRow(postId, newUuid(), { parentId: first.id, createdAt: new Date(base + 2000) });
      const second = newCommentRow(postId, newUuid(), { createdAt: new Date(base + 1000) });

      mocks.access.post.checkReadAccess.mockResolvedValue(new Set([postId]));
      // Deliberately scrambled: the service must sort oldest-first, then group depth-first.
      mocks.post.getCommentsByPost.mockResolvedValue([reply, second, first]);

      const results = await sut.getComments(auth, postId);

      expect(results).toHaveLength(3);
      expect(results.map(({ id }) => id)).toEqual([first.id, reply.id, second.id]);
      expect(results.map(({ depth }) => depth)).toEqual([1, 2, 1]);
      expect(results[1].parentId).toBe(first.id);
      expect(mocks.post.getCommentsByPost).toHaveBeenCalledWith(postId);
    });

    it('should return an empty list when there are no comments', async () => {
      const postId = newUuid();
      const auth = AuthFactory.create();

      mocks.access.post.checkReadAccess.mockResolvedValue(new Set([postId]));
      mocks.post.getCommentsByPost.mockResolvedValue([]);

      await expect(sut.getComments(auth, postId)).resolves.toEqual([]);
    });

    it('should reject when the post is not readable', async () => {
      const auth = AuthFactory.create();

      mocks.access.post.checkReadAccess.mockResolvedValue(new Set());

      await expect(sut.getComments(auth, newUuid())).rejects.toThrow(BadRequestException);
    });
  });

  describe('createComment', () => {
    it('should create a top-level comment', async () => {
      const userId = newUuid();
      const postId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const created = { id: newUuid() } as Awaited<ReturnType<PostRepository['createComment']>>;

      mocks.access.post.checkReadAccess.mockResolvedValue(new Set([postId]));
      mocks.post.createComment.mockResolvedValue(created);
      mocks.post.getCommentById.mockResolvedValue(newCommentRow(postId, userId, { id: created.id, body: 'hello' }));

      const result = await sut.createComment(auth, postId, { body: 'hello' });

      expect(mocks.post.createComment).toHaveBeenCalledWith({ postId, userId, body: 'hello', parentId: null });
      expect(result.depth).toBe(1);
      expect(result.parentId).toBeNull();
      expect(result.user.id).toBe(userId);
    });

    it('should create a reply within the nesting limit', async () => {
      const userId = newUuid();
      const postId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const parentId = newUuid();
      const created = { id: newUuid() } as Awaited<ReturnType<PostRepository['createComment']>>;

      mocks.access.post.checkReadAccess.mockResolvedValue(new Set([postId]));
      mocks.post.getCommentById.mockImplementation((id: string) =>
        Promise.resolve(
          id === parentId
            ? newCommentRow(postId, newUuid(), { id: parentId })
            : newCommentRow(postId, userId, { id: created.id, parentId, body: 'reply' }),
        ),
      );
      mocks.post.createComment.mockResolvedValue(created);

      const result = await sut.createComment(auth, postId, { body: 'reply', parentId });

      expect(mocks.post.createComment).toHaveBeenCalledWith({ postId, userId, body: 'reply', parentId });
      expect(result.depth).toBe(2);
    });

    it('should allow a reply at exactly the maximum depth', async () => {
      const userId = newUuid();
      const postId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const parentId = newUuid();
      const grandparentId = newUuid();
      const created = { id: newUuid() } as Awaited<ReturnType<PostRepository['createComment']>>;

      mocks.access.post.checkReadAccess.mockResolvedValue(new Set([postId]));
      mocks.post.getCommentById.mockImplementation((id: string) =>
        Promise.resolve(
          id === parentId
            ? newCommentRow(postId, newUuid(), { id: parentId, parentId: grandparentId })
            : id === grandparentId
              ? newCommentRow(postId, newUuid(), { id: grandparentId, parentId: null })
              : newCommentRow(postId, userId, { id: created.id, parentId, body: 'depth three' }),
        ),
      );
      mocks.post.createComment.mockResolvedValue(created);

      const result = await sut.createComment(auth, postId, { body: 'depth three', parentId });

      expect(result.depth).toBe(3);
      expect(mocks.post.createComment).toHaveBeenCalledWith({
        postId,
        userId,
        body: 'depth three',
        parentId,
      });
    });

    it('should reject a reply to a deleted parent', async () => {
      const postId = newUuid();
      const auth = AuthFactory.create();

      mocks.access.post.checkReadAccess.mockResolvedValue(new Set([postId]));
      mocks.post.getCommentById.mockResolvedValue(undefined);

      await expect(sut.createComment(auth, postId, { body: 'reply', parentId: newUuid() })).rejects.toThrow(
        BadRequestException,
      );
      expect(mocks.post.createComment).not.toHaveBeenCalled();
    });

    it('should reject a reply to a comment on another post', async () => {
      const userId = newUuid();
      const postId = newUuid();
      const auth = AuthFactory.create({ id: userId });

      mocks.access.post.checkReadAccess.mockResolvedValue(new Set([postId]));
      mocks.post.getCommentById.mockResolvedValue(newCommentRow(newUuid(), newUuid()));

      await expect(sut.createComment(auth, postId, { body: 'reply', parentId: newUuid() })).rejects.toThrow(
        NotFoundException,
      );
      expect(mocks.post.createComment).not.toHaveBeenCalled();
    });

    it('should reject nesting beyond three levels', async () => {
      const userId = newUuid();
      const postId = newUuid();
      const auth = AuthFactory.create({ id: userId });
      const parentId = newUuid();
      const midId = newUuid();
      const grandparentId = newUuid();

      mocks.access.post.checkReadAccess.mockResolvedValue(new Set([postId]));
      mocks.post.getCommentById.mockImplementation((id: string) => {
        const parentOf = id === parentId ? midId : id === midId ? grandparentId : null;
        return Promise.resolve(newCommentRow(postId, newUuid(), { id, parentId: parentOf }));
      });

      await expect(sut.createComment(auth, postId, { body: 'too deep', parentId })).rejects.toThrow(
        BadRequestException,
      );
      expect(mocks.post.createComment).not.toHaveBeenCalled();
    });

    it('should reject when the post is not readable', async () => {
      const auth = AuthFactory.create();

      mocks.access.post.checkReadAccess.mockResolvedValue(new Set());

      await expect(sut.createComment(auth, newUuid(), { body: 'hello' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteComment', () => {
    it('should delete a comment the user may delete', async () => {
      const userId = newUuid();
      const postId = newUuid();
      const commentId = newUuid();
      const auth = AuthFactory.create({ id: userId });

      mocks.post.getCommentById.mockResolvedValue(newCommentRow(postId, userId, { id: commentId }));
      mocks.access.post.checkCommentOwnerAccess.mockResolvedValue(new Set([commentId]));
      mocks.access.post.checkCommentPostOwnerAccess.mockResolvedValue(new Set());
      mocks.post.softDeleteComment.mockResolvedValue(undefined);

      await sut.deleteComment(auth, postId, commentId);

      expect(mocks.post.softDeleteComment).toHaveBeenCalledWith(commentId);
    });

    it('should let the post owner delete a comment', async () => {
      const userId = newUuid();
      const postId = newUuid();
      const commentId = newUuid();
      const auth = AuthFactory.create({ id: userId });

      mocks.post.getCommentById.mockResolvedValue(newCommentRow(postId, newUuid(), { id: commentId }));
      mocks.access.post.checkCommentOwnerAccess.mockResolvedValue(new Set());
      mocks.access.post.checkCommentPostOwnerAccess.mockResolvedValue(new Set([commentId]));
      mocks.post.softDeleteComment.mockResolvedValue(undefined);

      await sut.deleteComment(auth, postId, commentId);

      expect(mocks.post.softDeleteComment).toHaveBeenCalledWith(commentId);
    });

    it('should reject a comment on another post', async () => {
      const postId = newUuid();
      const auth = AuthFactory.create();

      mocks.post.getCommentById.mockResolvedValue(newCommentRow(newUuid(), newUuid()));

      await expect(sut.deleteComment(auth, postId, newUuid())).rejects.toThrow(NotFoundException);
      expect(mocks.post.softDeleteComment).not.toHaveBeenCalled();
    });

    it('should reject when the user may not delete the comment', async () => {
      const postId = newUuid();
      const commentId = newUuid();
      const auth = AuthFactory.create();

      mocks.post.getCommentById.mockResolvedValue(newCommentRow(postId, newUuid(), { id: commentId }));
      mocks.access.post.checkCommentOwnerAccess.mockResolvedValue(new Set());
      mocks.access.post.checkCommentPostOwnerAccess.mockResolvedValue(new Set());

      await expect(sut.deleteComment(auth, postId, commentId)).rejects.toThrow(BadRequestException);
      expect(mocks.post.softDeleteComment).not.toHaveBeenCalled();
    });
  });
});
