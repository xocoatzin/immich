import { Injectable } from '@nestjs/common';
import { type Insertable, type Kysely, type NotNull, type Transaction, type Updateable, sql } from 'kysely';
import { jsonObjectFrom } from 'kysely/helpers/postgres';
import { InjectKysely } from 'nestjs-kysely';
import { columns } from 'src/database.js';
import { ChunkedArray, ChunkedSet, DummyValue, GenerateSql } from 'src/decorators.js';
import { PostVisibility } from 'src/enum.js';
import { DB } from 'src/schema/index.js';
import { PostTable } from 'src/schema/tables/post.table.js';
import { asUuid } from 'src/utils/database.js';

export interface PostAttachmentInput {
  assetId?: string | null;
  albumId?: string | null;
}

export interface PostUpdateDetails {
  values: Updateable<PostTable>;
  /** undefined = keep existing attachments */
  attachments?: PostAttachmentInput[];
  /** undefined = keep, null = clear, set = replace */
  audience?: Set<string> | null;
}

export interface PostFeedOptions {
  /** maximum number of posts to return */
  limit: number;
  /** id of the last post from the previous page */
  cursor?: string;
}

@Injectable()
export class PostRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  @GenerateSql({ params: [{ ownerId: DummyValue.UUID, body: DummyValue.STRING }] })
  @GenerateSql({ params: [DummyValue.UUID] })
  getById(id: string) {
    return this.db
      .selectFrom('post')
      .innerJoin('user as owner', (join) =>
        join.onRef('owner.id', '=', 'post.ownerId').on('owner.deletedAt', 'is', null),
      )
      .selectAll('post')
      .select((eb) => [
        jsonObjectFrom(eb.selectFrom('user').select(columns.user).whereRef('user.id', '=', 'post.ownerId')).as('owner'),
        eb
          .selectFrom('post_like')
          .select(sql<number>`${eb.fn.countAll()}::int`.as('likeCount'))
          .whereRef('post_like.postId', '=', 'post.id')
          .as('likeCount'),
        eb
          .selectFrom('post_comment')
          .select(sql<number>`${eb.fn.countAll()}::int`.as('commentCount'))
          .whereRef('post_comment.postId', '=', 'post.id')
          .where('post_comment.deletedAt', 'is', null)
          .as('commentCount'),
      ])
      .$narrowType<{ owner: NotNull }>()
      .where('post.id', '=', asUuid(id))
      .where('post.deletedAt', 'is', null)
      .executeTakeFirst();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  async softDelete(id: string) {
    await this.db.updateTable('post').set({ deletedAt: new Date() }).where('post.id', '=', asUuid(id)).execute();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  async restore(id: string) {
    await this.db.updateTable('post').set({ deletedAt: null }).where('post.id', '=', asUuid(id)).execute();
  }

  /**
   * Paginated feed of posts visible to `userId`, newest first.
   * Visibility logic mirrors `AccessRepository.post.checkReadAccess`.
   */
  @GenerateSql({ params: [DummyValue.UUID, { limit: 10 }] })
  async getFeed(userId: string, options: PostFeedOptions) {
    let query = this.db
      .selectFrom('post')
      .innerJoin('user as owner', (join) =>
        join.onRef('owner.id', '=', 'post.ownerId').on('owner.deletedAt', 'is', null),
      )
      .leftJoin('post_audience as audience', (join) =>
        join.onRef('audience.postId', '=', 'post.id').on('audience.userId', '=', asUuid(userId)),
      )
      .leftJoin('partner', (join) =>
        join.onRef('partner.sharedById', '=', 'post.ownerId').on('partner.sharedWithId', '=', asUuid(userId)),
      )
      .selectAll('post')
      .select((eb) => [
        jsonObjectFrom(eb.selectFrom('user').select(columns.user).whereRef('user.id', '=', 'post.ownerId')).as('owner'),
        eb
          .selectFrom('post_like')
          .select(sql<number>`${eb.fn.countAll()}::int`.as('likeCount'))
          .whereRef('post_like.postId', '=', 'post.id')
          .as('likeCount'),
        eb
          .selectFrom('post_comment')
          .select(sql<number>`${eb.fn.countAll()}::int`.as('commentCount'))
          .whereRef('post_comment.postId', '=', 'post.id')
          .where('post_comment.deletedAt', 'is', null)
          .as('commentCount'),
      ])
      .$narrowType<{ owner: NotNull }>()
      .where('post.deletedAt', 'is', null)
      .where((eb) =>
        eb.or([
          eb('post.ownerId', '=', userId),
          eb('post.visibility', '=', sql.lit(PostVisibility.Public)),
          eb.and([
            eb('post.visibility', '=', sql.lit(PostVisibility.Partners)),
            eb('partner.sharedById', 'is not', null),
          ]),
          eb.and([eb('post.visibility', '=', sql.lit(PostVisibility.Specific)), eb('audience.userId', 'is not', null)]),
        ]),
      );

    if (options.cursor) {
      const cursor = await this.db
        .selectFrom('post')
        .select(['post.createdAt', 'post.id'])
        .where('post.id', '=', asUuid(options.cursor))
        .executeTakeFirst();
      if (cursor) {
        query = query.where((eb) =>
          eb.or([
            eb('post.createdAt', '<', cursor.createdAt),
            eb.and([eb('post.createdAt', '=', cursor.createdAt), eb('post.id', '<', cursor.id)]),
          ]),
        );
      }
    }

    return query.orderBy('post.createdAt', 'desc').orderBy('post.id', 'desc').limit(options.limit).execute();
  }

  /**
   * Posts containing `assetId` that are visible to `userId`, newest first.
   * Used by the asset info panel.
   */
  @GenerateSql({ params: [DummyValue.UUID, DummyValue.UUID] })
  getByAssetId(userId: string, assetId: string) {
    return this.db
      .selectFrom('post')
      .innerJoin('user as owner', (join) =>
        join.onRef('owner.id', '=', 'post.ownerId').on('owner.deletedAt', 'is', null),
      )
      .leftJoin('post_audience as audience', (join) =>
        join.onRef('audience.postId', '=', 'post.id').on('audience.userId', '=', asUuid(userId)),
      )
      .leftJoin('partner', (join) =>
        join.onRef('partner.sharedById', '=', 'post.ownerId').on('partner.sharedWithId', '=', asUuid(userId)),
      )
      .innerJoin('post_attachment', (join) =>
        join.onRef('post_attachment.postId', '=', 'post.id').on('post_attachment.assetId', '=', asUuid(assetId)),
      )
      .selectAll('post')
      .select((eb) => [
        jsonObjectFrom(eb.selectFrom('user').select(columns.user).whereRef('user.id', '=', 'post.ownerId')).as('owner'),
        eb
          .selectFrom('post_like')
          .select(sql<number>`${eb.fn.countAll()}::int`.as('likeCount'))
          .whereRef('post_like.postId', '=', 'post.id')
          .as('likeCount'),
        eb
          .selectFrom('post_comment')
          .select(sql<number>`${eb.fn.countAll()}::int`.as('commentCount'))
          .whereRef('post_comment.postId', '=', 'post.id')
          .where('post_comment.deletedAt', 'is', null)
          .as('commentCount'),
      ])
      .$narrowType<{ owner: NotNull }>()
      .where('post.deletedAt', 'is', null)
      .where((eb) =>
        eb.or([
          eb('post.ownerId', '=', userId),
          eb('post.visibility', '=', sql.lit(PostVisibility.Public)),
          eb.and([
            eb('post.visibility', '=', sql.lit(PostVisibility.Partners)),
            eb('partner.sharedById', 'is not', null),
          ]),
          eb.and([eb('post.visibility', '=', sql.lit(PostVisibility.Specific)), eb('audience.userId', 'is not', null)]),
        ]),
      )
      .orderBy('post.createdAt', 'desc')
      .orderBy('post.id', 'desc')
      .execute();
  }

  @GenerateSql({ params: [DummyValue.UUID_SET] })
  @ChunkedArray({ paramIndex: 0 })
  async getAttachmentsForPosts(postIds: Set<string>) {
    if (postIds.size === 0) {
      return [];
    }

    return this.db
      .selectFrom('post_attachment')
      .selectAll('post_attachment')
      .where('post_attachment.postId', 'in', [...postIds])
      .orderBy('post_attachment.postId', 'asc')
      .orderBy('post_attachment.position', 'asc')
      .execute();
  }

  @GenerateSql({ params: [DummyValue.UUID, DummyValue.UUID_SET] })
  @ChunkedSet({ paramIndex: 1 })
  async getLikedPostIds(userId: string, postIds: Set<string>) {
    if (postIds.size === 0) {
      return new Set<string>();
    }

    return this.db
      .selectFrom('post_like')
      .select('post_like.postId')
      .where('post_like.userId', '=', asUuid(userId))
      .where('post_like.postId', 'in', [...postIds])
      .execute()
      .then((rows) => new Set(rows.map((row) => row.postId)));
  }

  @GenerateSql({ params: [DummyValue.UUID_SET] })
  @ChunkedArray({ paramIndex: 0 })
  async getAudienceForPosts(postIds: Set<string>) {
    if (postIds.size === 0) {
      return [];
    }

    return this.db
      .selectFrom('post_audience')
      .select(['post_audience.postId', 'post_audience.userId'])
      .where('post_audience.postId', 'in', [...postIds])
      .orderBy('post_audience.postId', 'asc')
      .orderBy('post_audience.userId', 'asc')
      .execute();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  getAttachments(postId: string) {
    return this.db
      .selectFrom('post_attachment')
      .selectAll('post_attachment')
      .where('post_attachment.postId', '=', asUuid(postId))
      .orderBy('post_attachment.position', 'asc')
      .execute();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  async getAudienceUserIds(postId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('post_audience')
      .select('post_audience.userId')
      .where('post_audience.postId', '=', asUuid(postId))
      .orderBy('post_audience.userId', 'asc')
      .execute();
    return rows.map((row) => row.userId);
  }

  /**
   * Create a post with its attachments and audience atomically.
   */
  @GenerateSql({
    params: [
      { ownerId: DummyValue.UUID, body: DummyValue.STRING, visibility: 'private' },
      [{ assetId: DummyValue.UUID, albumId: null }],
      DummyValue.UUID_SET,
    ],
  })
  async createWithDetails(data: Insertable<PostTable>, attachments: PostAttachmentInput[], audience: Set<string>) {
    return await this.db.transaction().execute(async (tx) => {
      const post = await tx.insertInto('post').values(data).returningAll().executeTakeFirstOrThrow();
      await this.replaceAttachments(tx, post.id, attachments);
      await this.replaceAudience(tx, post.id, audience);
      return post;
    });
  }

  /**
   * Update a post with its attachments and audience atomically.
   * Empty `values` skips the post row update entirely.
   */
  @GenerateSql({
    params: [
      DummyValue.UUID,
      {
        values: { body: DummyValue.STRING },
        attachments: [{ assetId: DummyValue.UUID, albumId: null }],
        audience: DummyValue.UUID_SET,
      },
    ],
  })
  async updateWithDetails(id: string, details: PostUpdateDetails) {
    await this.db.transaction().execute(async (tx) => {
      if (details.attachments !== undefined) {
        await this.replaceAttachments(tx, id, details.attachments);
      }
      if (details.audience !== undefined) {
        await this.replaceAudience(tx, id, details.audience ?? new Set());
      }
      if (Object.keys(details.values).length > 0) {
        await tx.updateTable('post').set(details.values).where('post.id', '=', asUuid(id)).execute();
      }
    });
  }

  private async replaceAttachments(tx: Transaction<DB>, postId: string, items: PostAttachmentInput[]) {
    await tx.deleteFrom('post_attachment').where('post_attachment.postId', '=', asUuid(postId)).execute();
    if (items.length > 0) {
      await tx
        .insertInto('post_attachment')
        .values(
          items.map((item, index) => ({
            postId: asUuid(postId),
            assetId: item.assetId ? asUuid(item.assetId) : null,
            albumId: item.albumId ? asUuid(item.albumId) : null,
            position: index,
          })),
        )
        .execute();
    }
  }

  private async replaceAudience(tx: Transaction<DB>, postId: string, userIds: Set<string>) {
    await tx.deleteFrom('post_audience').where('post_audience.postId', '=', asUuid(postId)).execute();
    if (userIds.size > 0) {
      await tx
        .insertInto('post_audience')
        .values([...userIds].map((userId) => ({ postId: asUuid(postId), userId: asUuid(userId) })))
        .execute();
    }
  }
}
