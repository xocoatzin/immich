import { Permission } from 'src/enum.js';
import { AccessRepository } from 'src/repositories/access.repository.js';
import { checkAccess } from 'src/utils/access.js';
import { AuthFactory } from 'test/factories/auth.factory.js';
import { IAccessRepositoryMock, newAccessRepositoryMock } from 'test/repositories/access.repository.mock.js';
import { newUuid } from 'test/small.factory.js';

describe(checkAccess.name, () => {
  let access: IAccessRepositoryMock;
  let repository: AccessRepository;
  const userId = newUuid();
  const auth = AuthFactory.create({ id: userId });

  beforeEach(() => {
    access = newAccessRepositoryMock();
    repository = access as unknown as AccessRepository;
  });

  describe('post permissions', () => {
    it('should grant PostCreate to any authenticated user', async () => {
      const ids = new Set([newUuid()]);

      await expect(checkAccess(repository, { auth, permission: Permission.PostCreate, ids })).resolves.toEqual(ids);
    });

    it('should check PostRead via post.checkReadAccess', async () => {
      const postId = newUuid();
      access.post.checkReadAccess.mockResolvedValue(new Set([postId]));

      const result = await checkAccess(repository, { auth, permission: Permission.PostRead, ids: [postId] });

      expect(result).toEqual(new Set([postId]));
      expect(access.post.checkReadAccess).toHaveBeenCalledWith(userId, new Set([postId]));
    });

    it('should check PostUpdate via post.checkOwnerAccess', async () => {
      const postId = newUuid();
      access.post.checkOwnerAccess.mockResolvedValue(new Set([postId]));

      const result = await checkAccess(repository, { auth, permission: Permission.PostUpdate, ids: [postId] });

      expect(result).toEqual(new Set([postId]));
      expect(access.post.checkOwnerAccess).toHaveBeenCalledWith(userId, new Set([postId]));
    });

    it('should check PostDelete via post.checkOwnerAccess', async () => {
      const postId = newUuid();
      access.post.checkOwnerAccess.mockResolvedValue(new Set([postId]));

      const result = await checkAccess(repository, { auth, permission: Permission.PostDelete, ids: [postId] });

      expect(result).toEqual(new Set([postId]));
      expect(access.post.checkOwnerAccess).toHaveBeenCalledWith(userId, new Set([postId]));
    });

    it('should check PostCommentCreate via post.checkReadAccess', async () => {
      const postId = newUuid();
      access.post.checkReadAccess.mockResolvedValue(new Set([postId]));

      const result = await checkAccess(repository, { auth, permission: Permission.PostCommentCreate, ids: [postId] });

      expect(result).toEqual(new Set([postId]));
      expect(access.post.checkReadAccess).toHaveBeenCalledWith(userId, new Set([postId]));
    });

    it('should check PostCommentDelete via comment owner or post owner access', async () => {
      const [commentId, otherCommentId] = [newUuid(), newUuid()];
      access.post.checkCommentOwnerAccess.mockResolvedValue(new Set([commentId]));
      access.post.checkCommentPostOwnerAccess.mockResolvedValue(new Set([otherCommentId]));

      const result = await checkAccess(repository, {
        auth,
        permission: Permission.PostCommentDelete,
        ids: [commentId, otherCommentId],
      });

      expect(result).toEqual(new Set([commentId, otherCommentId]));
      expect(access.post.checkCommentOwnerAccess).toHaveBeenCalledWith(userId, new Set([commentId, otherCommentId]));
      expect(access.post.checkCommentPostOwnerAccess).toHaveBeenCalledWith(userId, new Set([otherCommentId]));
    });

    it('should check PostLikeCreate via post.checkReadAccess', async () => {
      const postId = newUuid();
      access.post.checkReadAccess.mockResolvedValue(new Set([postId]));

      const result = await checkAccess(repository, { auth, permission: Permission.PostLikeCreate, ids: [postId] });

      expect(result).toEqual(new Set([postId]));
      expect(access.post.checkReadAccess).toHaveBeenCalledWith(userId, new Set([postId]));
    });

    it('should check PostLikeDelete via post.checkLikeOwnerAccess', async () => {
      const postId = newUuid();
      access.post.checkLikeOwnerAccess.mockResolvedValue(new Set([postId]));

      const result = await checkAccess(repository, { auth, permission: Permission.PostLikeDelete, ids: [postId] });

      expect(result).toEqual(new Set([postId]));
      expect(access.post.checkLikeOwnerAccess).toHaveBeenCalledWith(userId, new Set([postId]));
    });
  });
});
