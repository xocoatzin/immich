import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthDto } from 'src/dtos/auth.dto.js';
import {
  PostAttachmentDto,
  PostCreateDto,
  PostFeedDto,
  PostResponseDto,
  PostUpdateDto,
  PostUpsertResponseDto,
  PostValidateDto,
  PostValidationResponseDto,
  PostWithDetails,
  mapPost,
} from 'src/dtos/post.dto.js';
import { AlbumUserRole, Permission, PostVisibility } from 'src/enum.js';
import { type PostUpdateDetails } from 'src/repositories/post.repository.js';
import { BaseService } from 'src/services/base.service.js';
import { findOrFail } from 'src/utils/misc.js';
import { setUnion } from 'src/utils/set.js';

@Injectable()
export class PostService extends BaseService {
  async create(auth: AuthDto, dto: PostCreateDto): Promise<PostUpsertResponseDto> {
    await this.requireAccess({ auth, permission: Permission.PostCreate, ids: [auth.user.id] });

    const attachments = dto.attachments ?? [];
    await this.requireAttachmentAccess(auth, attachments);

    const visibility = dto.visibility ?? PostVisibility.Private;
    const audience = visibility === PostVisibility.Specific ? await this.requireValidAudience(dto.audience) : [];

    const post = await this.postRepository.createWithDetails(
      { ownerId: auth.user.id, body: dto.body, visibility },
      attachments,
      new Set(audience),
    );

    const warnings = await this.getAttachmentWarnings(auth, { visibility, audience, attachments });

    return { ...(await this.toResponse(auth, post.id)), warnings };
  }

  async update(auth: AuthDto, id: string, dto: PostUpdateDto): Promise<PostUpsertResponseDto> {
    await this.requireAccess({ auth, permission: Permission.PostUpdate, ids: [id] });

    const current = await findOrFail(() => this.postRepository.getById(id), 'Post');
    const visibility = dto.visibility ?? current.visibility;

    // Resolve the effective audience before writing anything.
    let audience: string[];
    let audienceUpdate: PostUpdateDetails['audience'];
    if (visibility === PostVisibility.Specific) {
      if (dto.audience === undefined) {
        audience = await this.postRepository.getAudienceUserIds(id);
        if (audience.length === 0) {
          throw new BadRequestException('Audience is required when visibility is specific');
        }
        // keep the existing audience rows untouched
        audienceUpdate = undefined;
      } else {
        audience = await this.requireValidAudience(dto.audience);
        audienceUpdate = new Set(audience);
      }
    } else {
      audience = [];
      // Clear stale audience rows when switching away from specific; an audience
      // supplied alongside a non-specific visibility is ignored.
      audienceUpdate = dto.visibility === undefined ? undefined : null;
    }

    if (dto.attachments) {
      await this.requireAttachmentAccess(auth, dto.attachments);
    }

    await this.postRepository.updateWithDetails(id, {
      values: {
        ...(dto.body !== undefined && { body: dto.body }),
        ...(dto.visibility !== undefined && { visibility: dto.visibility }),
      },
      attachments: dto.attachments,
      audience: audienceUpdate,
    });

    const warnings = await this.getAttachmentWarnings(auth, {
      visibility,
      audience,
      attachments: dto.attachments ?? (await this.postRepository.getAttachments(id)),
    });

    return { ...(await this.toResponse(auth, id)), warnings };
  }

  async delete(auth: AuthDto, id: string): Promise<void> {
    await this.requireAccess({ auth, permission: Permission.PostDelete, ids: [id] });
    await this.postRepository.softDelete(id);
  }

  async get(auth: AuthDto, id: string): Promise<PostResponseDto> {
    await this.requireAccess({ auth, permission: Permission.PostRead, ids: [id] });
    const post = await findOrFail(() => this.postRepository.getById(id), 'Post');
    return this.toResponse(auth, post);
  }

  async getFeed(auth: AuthDto, dto: PostFeedDto): Promise<PostResponseDto[]> {
    const posts = await this.postRepository.getFeed(auth.user.id, { limit: dto.limit, cursor: dto.cursor });
    return this.toResponses(auth, posts);
  }

  async getByAssetId(auth: AuthDto, assetId: string): Promise<PostResponseDto[]> {
    await this.requireAccess({ auth, permission: Permission.AssetRead, ids: [assetId] });
    const posts = await this.postRepository.getByAssetId(auth.user.id, assetId);
    return this.toResponses(auth, posts);
  }

  async validate(auth: AuthDto, dto: PostValidateDto): Promise<PostValidationResponseDto> {
    await this.requireAccess({ auth, permission: Permission.PostCreate, ids: [auth.user.id] });
    const attachments = dto.attachments ?? [];
    await this.requireAttachmentAccess(auth, attachments);
    const visibility = dto.visibility ?? PostVisibility.Private;
    const audience = visibility === PostVisibility.Specific ? await this.requireValidAudience(dto.audience) : [];
    const warnings = await this.getAttachmentWarnings(auth, { visibility, audience, attachments });
    return { warnings };
  }

  private async toResponse(auth: AuthDto, postOrId: PostWithDetails | string): Promise<PostResponseDto> {
    const post =
      typeof postOrId === 'string' ? await findOrFail(() => this.postRepository.getById(postOrId), 'Post') : postOrId;
    const responses = await this.toResponses(auth, [post]);
    return responses[0];
  }

  private async toResponses(auth: AuthDto, posts: PostWithDetails[]): Promise<PostResponseDto[]> {
    if (posts.length === 0) {
      return [];
    }

    const postIds = new Set(posts.map((post) => post.id));
    const [attachments, likedIds, audienceRows] = await Promise.all([
      this.postRepository.getAttachmentsForPosts(postIds),
      this.postRepository.getLikedPostIds(auth.user.id, postIds),
      this.postRepository.getAudienceForPosts(postIds),
    ]);

    const attachmentsByPost = new Map<string, { assetId: string | null; albumId: string | null; position: number }[]>();
    for (const attachment of attachments) {
      const list = attachmentsByPost.get(attachment.postId) ?? [];
      list.push({ assetId: attachment.assetId, albumId: attachment.albumId, position: attachment.position });
      attachmentsByPost.set(attachment.postId, list);
    }

    const audienceByPost = new Map<string, string[]>();
    for (const row of audienceRows) {
      const list = audienceByPost.get(row.postId) ?? [];
      list.push(row.userId);
      audienceByPost.set(row.postId, list);
    }

    return posts.map((post) =>
      mapPost(post, {
        isLiked: likedIds.has(post.id),
        attachments: attachmentsByPost.get(post.id) ?? [],
        // audience is only visible to the owner (null = hidden from you)
        audience: post.ownerId === auth.user.id ? (audienceByPost.get(post.id) ?? []) : null,
      }),
    );
  }

  /** Block when the author cannot access an attachment at all. */
  private async requireAttachmentAccess(auth: AuthDto, attachments: PostAttachmentDto[]): Promise<void> {
    const assetIds = [
      ...new Set(attachments.map((attachment) => attachment.assetId).filter((id): id is string => !!id)),
    ];
    const albumIds = [
      ...new Set(attachments.map((attachment) => attachment.albumId).filter((id): id is string => !!id)),
    ];

    if (assetIds.length > 0) {
      await this.requireAccess({ auth, permission: Permission.AssetRead, ids: assetIds });
    }

    if (albumIds.length > 0) {
      await this.requireAccess({ auth, permission: Permission.AlbumRead, ids: albumIds });
    }
  }

  /**
   * Validate an explicitly supplied audience: non-empty, deduplicated, and every user exists.
   * Runs before any write so a bad audience fails fast instead of violating the FK mid-write.
   */
  private async requireValidAudience(audience: string[] | undefined): Promise<string[]> {
    if (!audience || audience.length === 0) {
      throw new BadRequestException('Audience is required when visibility is specific');
    }

    const ids = [...new Set(audience)];
    const existing = await this.userRepository.getExistingIds(new Set(ids));
    if (existing.size !== ids.length) {
      throw new BadRequestException('Audience contains unknown users');
    }

    return ids;
  }

  /**
   * Warn (don't block) when the post's audience can't view an attachment.
   * Attachments keep their own ACLs; posts never grant attachment access.
   */
  private async getAttachmentWarnings(
    auth: AuthDto,
    dto: {
      visibility: PostVisibility;
      audience: string[];
      attachments: { assetId?: string | null; albumId?: string | null }[];
    },
  ): Promise<string[]> {
    const attachments = dto.attachments;
    if (attachments.length === 0) {
      return [];
    }

    if (dto.visibility === PostVisibility.Private) {
      return [];
    }

    if (dto.visibility === PostVisibility.Public) {
      return ['Attachments keep their own visibility; only people with existing access to an attachment can view it.'];
    }

    let viewerIds: string[];
    if (dto.visibility === PostVisibility.Specific) {
      viewerIds = dto.audience.filter((id) => id !== auth.user.id);
    } else {
      const partners = await this.partnerRepository.getAll(auth.user.id);
      viewerIds = partners
        .filter((partner) => partner.sharedById === auth.user.id)
        .map((partner) => partner.sharedWithId);
    }

    if (viewerIds.length === 0) {
      return [];
    }

    const assetIds = new Set(attachments.map((attachment) => attachment.assetId).filter((id): id is string => !!id));
    const albumIds = new Set(attachments.map((attachment) => attachment.albumId).filter((id): id is string => !!id));

    // Check viewers in bounded-parallel chunks instead of one sequential loop.
    const viewerConcurrency = 10;
    let invisibleCount = 0;
    for (let index = 0; index < viewerIds.length; index += viewerConcurrency) {
      const chunk = viewerIds.slice(index, index + viewerConcurrency);
      const results = await Promise.all(
        chunk.map(async (viewerId) => {
          const [accessibleAssets, accessibleAlbums] = await Promise.all([
            this.getViewerAssetAccess(viewerId, assetIds),
            this.getViewerAlbumAccess(viewerId, albumIds),
          ]);
          return attachments.every(
            (attachment) =>
              (attachment.assetId && accessibleAssets.has(attachment.assetId)) ||
              (attachment.albumId && accessibleAlbums.has(attachment.albumId)),
          );
        }),
      );
      invisibleCount += results.filter((visible) => !visible).length;
    }

    if (invisibleCount === 0) {
      return [];
    }

    const audience = dto.visibility === PostVisibility.Specific ? 'the audience' : 'your partners';
    return [
      `${invisibleCount} ${invisibleCount === 1 ? 'person' : 'people'} in ${audience} cannot view every attachment; attachments are only visible to people who already have access to them.`,
    ];
  }

  private async getViewerAssetAccess(viewerId: string, assetIds: Set<string>): Promise<Set<string>> {
    if (assetIds.size === 0) {
      return new Set();
    }

    const [owned, partnered, viaAlbum] = await Promise.all([
      this.accessRepository.asset.checkOwnerAccess(viewerId, assetIds, false),
      this.accessRepository.asset.checkPartnerAccess(viewerId, assetIds),
      this.accessRepository.asset.checkAlbumAccess(viewerId, assetIds),
    ]);

    return setUnion(owned, partnered, viaAlbum);
  }

  private async getViewerAlbumAccess(viewerId: string, albumIds: Set<string>): Promise<Set<string>> {
    if (albumIds.size === 0) {
      return new Set();
    }

    const [owned, shared] = await Promise.all([
      this.accessRepository.album.checkOwnerAccess(viewerId, albumIds),
      this.accessRepository.album.checkSharedAlbumAccess(viewerId, albumIds, AlbumUserRole.Viewer),
    ]);

    return setUnion(owned, shared);
  }
}
