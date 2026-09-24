import request from 'supertest';
import { PostController } from 'src/controllers/post.controller.js';
import { PostService } from 'src/services/post.service.js';
import { errorDto } from 'test/medium/responses.js';
import { factory } from 'test/small.factory.js';
import { ControllerContext, controllerSetup, mockBaseService } from 'test/utils.js';

describe(PostController.name, () => {
  let ctx: ControllerContext;
  const service = mockBaseService(PostService);

  beforeAll(async () => {
    ctx = await controllerSetup(PostController, [{ provide: PostService, useValue: service }]);
    return () => ctx.close();
  });

  beforeEach(() => {
    service.resetAllMocks();
    ctx.reset();
  });

  describe('GET /posts', () => {
    it('should not require any parameters', async () => {
      const { status } = await request(ctx.getHttpServer()).get('/posts').query({});
      expect(status).toBe(200);
      expect(service.getFeed).toHaveBeenCalledWith(undefined, expect.objectContaining({ limit: 20 }));
    });

    it('should accept an asset id filter', async () => {
      const assetId = factory.uuid();
      const { status } = await request(ctx.getHttpServer()).get('/posts').query({ assetId });
      expect(status).toBe(200);
      expect(service.getFeed).toHaveBeenCalled();
    });

    it('should reject an invalid asset id filter', async () => {
      const { status, body } = await request(ctx.getHttpServer()).get('/posts').query({ assetId: 'invalid' });
      expect(status).toBe(400);
      expect(body).toEqual(errorDto.validationError([{ path: ['assetId'], message: 'Invalid UUID' }]));
    });

    it('should accept the limit as a query string', async () => {
      const { status } = await request(ctx.getHttpServer()).get('/posts').query({ limit: '10' });
      expect(status).toBe(200);
      expect(service.getFeed).toHaveBeenCalledWith(undefined, expect.objectContaining({ limit: 10 }));
    });

    it('should reject a limit below the minimum', async () => {
      const { status } = await request(ctx.getHttpServer()).get('/posts').query({ limit: '0' });
      expect(status).toBe(400);
    });

    it('should reject a limit above the maximum', async () => {
      const { status } = await request(ctx.getHttpServer()).get('/posts').query({ limit: '101' });
      expect(status).toBe(400);
    });

    it('should reject an invalid cursor', async () => {
      const { status, body } = await request(ctx.getHttpServer()).get('/posts').query({ cursor: 'invalid' });
      expect(status).toBe(400);
      expect(body).toEqual(errorDto.validationError([{ path: ['cursor'], message: 'Invalid UUID' }]));
    });

    it('should validate the limit', async () => {
      const { status, body } = await request(ctx.getHttpServer()).get('/posts').query({ limit: 'invalid' });
      expect(status).toBe(400);
      expect(body).toEqual(
        errorDto.validationError([{ path: ['limit'], message: 'Invalid input: expected number, received NaN' }]),
      );
    });
  });

  describe('POST /posts', () => {
    it('should require a body', async () => {
      const { status, body } = await request(ctx.getHttpServer()).post('/posts').send({});
      expect(status).toBe(400);
      expect(body).toEqual(
        errorDto.validationError([{ path: ['body'], message: 'Invalid input: expected string, received undefined' }]),
      );
    });

    it('should reject an empty body', async () => {
      const { status } = await request(ctx.getHttpServer())
        .post('/posts')
        .send({ body: ' '.repeat(3) });
      expect(status).toBe(400);
    });

    it('should reject an invalid visibility', async () => {
      const { status, body } = await request(ctx.getHttpServer())
        .post('/posts')
        .send({ body: 'hello', visibility: 'everyone' });
      expect(status).toBe(400);
      expect(body).toEqual(
        errorDto.validationError([
          { path: ['visibility'], message: expect.stringContaining('Invalid option: expected one of') },
        ]),
      );
    });

    it('should require an audience for specific visibility', async () => {
      const { status, body } = await request(ctx.getHttpServer())
        .post('/posts')
        .send({ body: 'hello', visibility: 'specific' });
      expect(status).toBe(400);
      expect(body).toEqual(
        errorDto.validationError([{ path: ['audience'], message: 'Audience is required when visibility is specific' }]),
      );
    });

    it('should accept a valid post', async () => {
      const { status } = await request(ctx.getHttpServer())
        .post('/posts')
        .send({ body: 'hello', visibility: 'private' });
      expect(status).toBe(201);
      expect(service.create).toHaveBeenCalled();
    });
  });

  describe('POST /posts/validate', () => {
    it('should require a body', async () => {
      const { status, body } = await request(ctx.getHttpServer()).post('/posts/validate').send({});
      expect(status).toBe(400);
      expect(body).toEqual(
        errorDto.validationError([{ path: ['body'], message: 'Invalid input: expected string, received undefined' }]),
      );
    });

    it('should accept a valid draft', async () => {
      const { status } = await request(ctx.getHttpServer())
        .post('/posts/validate')
        .send({ body: 'hello', visibility: 'public' });
      expect(status).toBe(200);
      expect(service.validate).toHaveBeenCalled();
    });
  });

  describe('GET /posts/:id', () => {
    it('should require a valid id', async () => {
      const { status, body } = await request(ctx.getHttpServer()).get('/posts/invalid');
      expect(status).toBe(400);
      expect(body).toEqual(errorDto.validationError([{ path: ['id'], message: 'Invalid UUID' }]));
    });

    it('should return the post', async () => {
      const { status } = await request(ctx.getHttpServer()).get(`/posts/${factory.uuid()}`);
      expect(status).toBe(200);
      expect(service.get).toHaveBeenCalled();
    });
  });

  describe('PATCH /posts/:id', () => {
    it('should require a valid id', async () => {
      const { status, body } = await request(ctx.getHttpServer()).patch('/posts/invalid').send({ body: 'updated' });
      expect(status).toBe(400);
      expect(body).toEqual(errorDto.validationError([{ path: ['id'], message: 'Invalid UUID' }]));
    });

    it('should accept an update', async () => {
      const { status } = await request(ctx.getHttpServer()).patch(`/posts/${factory.uuid()}`).send({ body: 'updated' });
      expect(status).toBe(200);
      expect(service.update).toHaveBeenCalled();
    });

    it('should accept an empty update as a no-op', async () => {
      const { status } = await request(ctx.getHttpServer()).patch(`/posts/${factory.uuid()}`).send({});
      expect(status).toBe(200);
      expect(service.update).toHaveBeenCalled();
    });
  });

  describe('DELETE /posts/:id', () => {
    it('should require a valid id', async () => {
      const { status, body } = await request(ctx.getHttpServer()).delete('/posts/invalid');
      expect(status).toBe(400);
      expect(body).toEqual(errorDto.validationError([{ path: ['id'], message: 'Invalid UUID' }]));
    });

    it('should delete the post', async () => {
      const { status } = await request(ctx.getHttpServer()).delete(`/posts/${factory.uuid()}`);
      expect(status).toBe(204);
      expect(service.delete).toHaveBeenCalled();
    });
  });

  describe('GET /posts/:id/comments', () => {
    it('should require a valid id', async () => {
      const { status, body } = await request(ctx.getHttpServer()).get('/posts/invalid/comments');
      expect(status).toBe(400);
      expect(body).toEqual(errorDto.validationError([{ path: ['id'], message: 'Invalid UUID' }]));
    });

    it('should list the comments', async () => {
      const { status } = await request(ctx.getHttpServer()).get(`/posts/${factory.uuid()}/comments`);
      expect(status).toBe(200);
      expect(service.getComments).toHaveBeenCalled();
    });
  });

  describe('POST /posts/:id/comments', () => {
    it('should require a valid id', async () => {
      const { status, body } = await request(ctx.getHttpServer()).post('/posts/invalid/comments').send({ body: 'hi' });
      expect(status).toBe(400);
      expect(body).toEqual(errorDto.validationError([{ path: ['id'], message: 'Invalid UUID' }]));
    });

    it('should require a body', async () => {
      const { status } = await request(ctx.getHttpServer()).post(`/posts/${factory.uuid()}/comments`).send({});
      expect(status).toBe(400);
      expect(service.createComment).not.toHaveBeenCalled();
    });

    it('should reject an empty body', async () => {
      const { status } = await request(ctx.getHttpServer())
        .post(`/posts/${factory.uuid()}/comments`)
        .send({ body: ' '.repeat(3) });
      expect(status).toBe(400);
    });

    it('should reject an invalid parent id', async () => {
      const { status, body } = await request(ctx.getHttpServer())
        .post(`/posts/${factory.uuid()}/comments`)
        .send({ body: 'hi', parentId: 'not-a-uuid' });
      expect(status).toBe(400);
      expect(body).toEqual(errorDto.validationError([{ path: ['parentId'], message: 'Invalid UUID' }]));
      expect(service.createComment).not.toHaveBeenCalled();
    });

    it('should create a comment', async () => {
      const postId = factory.uuid();
      const { status } = await request(ctx.getHttpServer())
        .post(`/posts/${postId}/comments`)
        .send({ body: 'nice shot' });
      expect(status).toBe(201);
      expect(service.createComment).toHaveBeenCalledWith(undefined, postId, { body: 'nice shot' });
    });

    it('should create a reply', async () => {
      const parentId = factory.uuid();
      const { status } = await request(ctx.getHttpServer())
        .post(`/posts/${factory.uuid()}/comments`)
        .send({ body: 'agreed', parentId });
      expect(status).toBe(201);
      expect(service.createComment).toHaveBeenCalled();
    });
  });

  describe('DELETE /posts/:id/comments/:commentId', () => {
    it('should require valid ids', async () => {
      const { status, body } = await request(ctx.getHttpServer()).delete('/posts/invalid/comments/invalid');
      expect(status).toBe(400);
      expect(body).toEqual(
        errorDto.validationError([
          { path: ['id'], message: 'Invalid UUID' },
          { path: ['commentId'], message: 'Invalid UUID' },
        ]),
      );
    });

    it('should delete the comment', async () => {
      const { status } = await request(ctx.getHttpServer()).delete(
        `/posts/${factory.uuid()}/comments/${factory.uuid()}`,
      );
      expect(status).toBe(204);
      expect(service.deleteComment).toHaveBeenCalled();
    });
  });
});
