import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthDto } from 'src/dtos/auth.dto.js';
import { Endpoint, HistoryBuilder } from 'src/decorators.js';
import {
  PostCommentCreateDto,
  PostCommentParamDto,
  PostCommentResponseDto,
  PostCreateDto,
  PostFeedDto,
  PostResponseDto,
  PostUpdateDto,
  PostUpsertResponseDto,
  PostValidateDto,
  PostValidationResponseDto,
} from 'src/dtos/post.dto.js';
import { ApiTag, Permission } from 'src/enum.js';
import { Auth, Authenticated } from 'src/middleware/auth.guard.js';
import { PostService } from 'src/services/post.service.js';
import { UUIDParamDto } from 'src/validation.js';

@ApiTags(ApiTag.Posts)
@Controller('posts')
export class PostController {
  constructor(private service: PostService) {}

  @Get()
  @Authenticated({ permission: Permission.PostRead })
  @Endpoint({
    summary: 'Retrieve the post feed',
    description: 'Retrieve posts visible to the authenticated user, newest first.',
    history: new HistoryBuilder().added('v3.0.0').alpha('v3.0.0'),
  })
  getPosts(@Auth() auth: AuthDto, @Query() dto: PostFeedDto): Promise<PostResponseDto[]> {
    return this.service.getFeed(auth, dto);
  }

  @Post()
  @Authenticated({ permission: Permission.PostCreate })
  @Endpoint({
    summary: 'Create a post',
    description: 'Create a new post with Markdown body, visibility, and optional asset or album attachments.',
    history: new HistoryBuilder().added('v3.0.0').alpha('v3.0.0'),
  })
  createPost(@Auth() auth: AuthDto, @Body() dto: PostCreateDto): Promise<PostUpsertResponseDto> {
    return this.service.create(auth, dto);
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @Authenticated({ permission: Permission.PostCreate })
  @Endpoint({
    summary: 'Validate a post',
    description:
      'Validate a post draft without creating it. Returns warnings when the post audience is broader than the attachment access.',
    history: new HistoryBuilder().added('v3.0.0').alpha('v3.0.0'),
  })
  validatePost(@Auth() auth: AuthDto, @Body() dto: PostValidateDto): Promise<PostValidationResponseDto> {
    return this.service.validate(auth, dto);
  }

  @Get(':id')
  @Authenticated({ permission: Permission.PostRead })
  @Endpoint({
    summary: 'Retrieve a post',
    description: 'Retrieve a specific post by its ID.',
    history: new HistoryBuilder().added('v3.0.0').alpha('v3.0.0'),
  })
  getPost(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<PostResponseDto> {
    return this.service.get(auth, id);
  }

  @Patch(':id')
  @Authenticated({ permission: Permission.PostUpdate })
  @Endpoint({
    summary: 'Update a post',
    description: 'Update an existing post by its ID.',
    history: new HistoryBuilder().added('v3.0.0').alpha('v3.0.0'),
  })
  updatePost(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: PostUpdateDto,
  ): Promise<PostUpsertResponseDto> {
    return this.service.update(auth, id, dto);
  }

  @Delete(':id')
  @Authenticated({ permission: Permission.PostDelete })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Endpoint({
    summary: 'Delete a post',
    description: 'Delete a specific post by its ID.',
    history: new HistoryBuilder().added('v3.0.0').alpha('v3.0.0'),
  })
  deletePost(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<void> {
    return this.service.delete(auth, id);
  }

  @Get(':id/comments')
  @Authenticated({ permission: Permission.PostRead })
  @Endpoint({
    summary: 'List post comments',
    description: 'List comments on a post in depth-first threaded order, oldest first.',
    history: new HistoryBuilder().added('v3.0.0').alpha('v3.0.0'),
  })
  getPostComments(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<PostCommentResponseDto[]> {
    return this.service.getComments(auth, id);
  }

  @Post(':id/comments')
  @Authenticated({ permission: Permission.PostCommentCreate })
  @Endpoint({
    summary: 'Comment on a post',
    description: 'Create a comment on a post. Replies nest at most three levels deep.',
    history: new HistoryBuilder().added('v3.0.0').alpha('v3.0.0'),
  })
  createPostComment(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: PostCommentCreateDto,
  ): Promise<PostCommentResponseDto> {
    return this.service.createComment(auth, id, dto);
  }

  @Delete(':id/comments/:commentId')
  @Authenticated({ permission: Permission.PostCommentDelete })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Endpoint({
    summary: 'Delete a post comment',
    description: 'Delete a comment and its replies. The comment author or the post owner may delete it.',
    history: new HistoryBuilder().added('v3.0.0').alpha('v3.0.0'),
  })
  async deletePostComment(@Auth() auth: AuthDto, @Param() { id, commentId }: PostCommentParamDto): Promise<void> {
    await this.service.deleteComment(auth, id, commentId);
  }

  @Post(':id/likes')
  @Authenticated({ permission: Permission.PostLikeCreate })
  @Endpoint({
    summary: 'Like a post',
    description: 'Like a post. Liking a post that is already liked has no effect.',
    history: new HistoryBuilder().added('v3.0.0').alpha('v3.0.0'),
  })
  likePost(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<PostResponseDto> {
    return this.service.likePost(auth, id);
  }

  @Delete(':id/likes')
  @Authenticated({ permission: Permission.PostLikeDelete })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Endpoint({
    summary: 'Unlike a post',
    description: "Remove the authenticated user's like from a post.",
    history: new HistoryBuilder().added('v3.0.0').alpha('v3.0.0'),
  })
  async unlikePost(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<void> {
    await this.service.unlikePost(auth, id);
  }
}
