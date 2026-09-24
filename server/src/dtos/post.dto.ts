import { createZodDto } from 'nestjs-zod';
import z from 'zod';
import type { PostRepository } from 'src/repositories/post.repository.js';
import { UserResponseSchema, mapUser } from 'src/dtos/user.dto.js';
import { PostVisibility, PostVisibilitySchema } from 'src/enum.js';
import { isoDatetimeToDate } from 'src/validation.js';

const PostAttachmentSchema = z
  .object({
    assetId: z.uuidv4().optional().describe('Asset ID'),
    albumId: z.uuidv4().optional().describe('Album ID'),
  })
  .refine((data) => Number(!!data.assetId) + Number(!!data.albumId) === 1, {
    error: 'Exactly one of assetId or albumId must be set',
  })
  .describe('Post attachment')
  .meta({ id: 'PostAttachmentDto' });

const PostAttachmentResponseSchema = z
  .object({
    assetId: z.uuidv4().nullable().describe('Asset ID'),
    albumId: z.uuidv4().nullable().describe('Album ID'),
    position: z.int().min(0).describe('Attachment position'),
  })
  .describe('Post attachment')
  .meta({ id: 'PostAttachmentResponseDto' });

const PostSchema = z.object({
  body: z.string().trim().min(1).max(10_000).describe('Post body (Markdown)'),
  visibility: PostVisibilitySchema.describe('Post visibility'),
  attachments: z.array(PostAttachmentSchema).max(30).optional().describe('Attachments in display order'),
  audience: z.array(z.uuidv4()).max(100).optional().describe('Audience user IDs (for specific visibility)'),
});

const checkAudience = (data: { visibility?: PostVisibility; audience?: string[] }) =>
  data.visibility !== PostVisibility.Specific || (data.audience && data.audience.length > 0);

const audienceRefinementParams = {
  error: 'Audience is required when visibility is specific',
  path: ['audience'],
};

const PostCreateAndValidateBase = PostSchema.extend({
  visibility: PostVisibilitySchema.default(PostVisibility.Private),
}).refine(checkAudience, audienceRefinementParams);

export const PostCreateSchema = PostCreateAndValidateBase.describe('Post create').meta({ id: 'PostCreateDto' });

export const PostUpdateSchema = PostSchema.partial()
  .refine(checkAudience, audienceRefinementParams)
  .describe('Post update')
  .meta({ id: 'PostUpdateDto' });

export const PostFeedSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20).describe('Maximum number of posts to return'),
    cursor: z.uuidv4().optional().describe('ID of the last post from the previous page'),
    assetId: z.uuidv4().optional().describe('Filter posts containing this asset ID (ignores other parameters)'),
  })
  .describe('Post feed')
  .meta({ id: 'PostFeedDto' });

const PostResponseSchema = z
  .object({
    id: z.uuidv4().describe('Post ID'),
    owner: UserResponseSchema.describe('Post owner'),
    body: z.string().describe('Post body (Markdown)'),
    visibility: PostVisibilitySchema.describe('Post visibility'),
    createdAt: isoDatetimeToDate.describe('Creation date'),
    updatedAt: isoDatetimeToDate.describe('Last update date'),
    likeCount: z.int().min(0).describe('Number of likes'),
    commentCount: z.int().min(0).describe('Number of comments'),
    isLiked: z.boolean().describe('Whether the requesting user liked the post'),
    attachments: z.array(PostAttachmentResponseSchema).describe('Attachments in display order'),
    audience: z.array(z.uuidv4()).nullish().describe('Audience user IDs (null unless viewed by the owner)'),
  })
  .describe('Post response')
  .meta({ id: 'PostResponseDto' });

const PostUpsertResponseSchema = PostResponseSchema.extend({
  warnings: z.array(z.string()).describe('Attachment/audience mismatch warnings'),
})
  .describe('Post upsert response')
  .meta({ id: 'PostUpsertResponseDto' });

export const PostValidateSchema = PostCreateAndValidateBase.describe('Post validate').meta({
  id: 'PostValidateDto',
});

const PostValidationResponseSchema = z
  .object({
    warnings: z.array(z.string()).describe('Attachment/audience mismatch warnings'),
  })
  .describe('Post validation response')
  .meta({ id: 'PostValidationResponseDto' });

export const PostCommentCreateSchema = z
  .object({
    body: z.string().trim().min(1).max(5000).describe('Comment body'),
    parentId: z.uuidv4().optional().describe('Parent comment ID for replies'),
  })
  .describe('Post comment create')
  .meta({ id: 'PostCommentCreateDto' });

const PostCommentParamSchema = z.object({
  id: z.uuidv4().describe('Post ID'),
  commentId: z.uuidv4().describe('Comment ID'),
});

const PostCommentResponseSchema = z
  .object({
    id: z.uuidv4().describe('Comment ID'),
    postId: z.uuidv4().describe('Post ID'),
    parentId: z.uuidv4().nullable().describe('Parent comment ID (null for top-level comments)'),
    depth: z.int().min(1).max(3).describe('Nesting depth (1 for top-level comments)'),
    body: z.string().describe('Comment body'),
    createdAt: isoDatetimeToDate.describe('Creation date'),
    updatedAt: isoDatetimeToDate.describe('Last update date'),
    user: UserResponseSchema.describe('Comment author'),
  })
  .describe('Post comment response')
  .meta({ id: 'PostCommentResponseDto' });

export type PostCommentWithUser = Awaited<ReturnType<PostRepository['getCommentsByPost']>>[number];

export const mapPostComment = (comment: PostCommentWithUser, depth: number): PostCommentResponseDto => ({
  id: comment.id,
  postId: comment.postId,
  parentId: comment.parentId,
  depth,
  body: comment.body,
  createdAt: comment.createdAt,
  updatedAt: comment.updatedAt,
  user: mapUser(comment.user),
});

export type PostWithDetails =
  | NonNullable<Awaited<ReturnType<PostRepository['getById']>>>
  | Awaited<ReturnType<PostRepository['getFeed']>>[number]
  | Awaited<ReturnType<PostRepository['getByAssetId']>>[number];

export const mapPost = (
  post: PostWithDetails,
  options: {
    isLiked: boolean;
    attachments: { assetId: string | null; albumId: string | null; position: number }[];
    audience: string[] | null;
  },
): PostResponseDto => ({
  id: post.id,
  owner: mapUser(post.owner),
  body: post.body,
  visibility: post.visibility,
  createdAt: post.createdAt,
  updatedAt: post.updatedAt,
  // Queries cast count(*) ::int, but coerce defensively so a hydrated row
  // without the cast can never leak a driver string into the API.
  likeCount: Number(post.likeCount ?? 0),
  commentCount: Number(post.commentCount ?? 0),
  isLiked: options.isLiked,
  attachments: options.attachments.map(({ assetId, albumId, position }) => ({ assetId, albumId, position })),
  audience: options.audience,
});

export class PostAttachmentDto extends createZodDto(PostAttachmentSchema) {}
export class PostCreateDto extends createZodDto(PostCreateSchema) {}
export class PostUpdateDto extends createZodDto(PostUpdateSchema) {}
export class PostFeedDto extends createZodDto(PostFeedSchema) {}
export class PostValidateDto extends createZodDto(PostValidateSchema) {}
export class PostResponseDto extends createZodDto(PostResponseSchema) {}
export class PostUpsertResponseDto extends createZodDto(PostUpsertResponseSchema) {}
export class PostValidationResponseDto extends createZodDto(PostValidationResponseSchema) {}
export class PostCommentCreateDto extends createZodDto(PostCommentCreateSchema) {}
export class PostCommentParamDto extends createZodDto(PostCommentParamSchema) {}
export class PostCommentResponseDto extends createZodDto(PostCommentResponseSchema) {}
