import {
  Check,
  Column,
  ForeignKeyColumn,
  type Generated,
  Index,
  PrimaryGeneratedColumn,
  Table,
} from '@immich/sql-tools';
import { AlbumTable } from 'src/schema/tables/album.table.js';
import { AssetTable } from 'src/schema/tables/asset.table.js';
import { PostTable } from 'src/schema/tables/post.table.js';

@Table('post_attachment')
@Index({ name: 'post_attachment_post_idx', columns: ['postId', 'position'], unique: true })
@Check({
  name: 'post_attachment_target_check',
  expression: `(("assetId" IS NOT NULL AND "albumId" IS NULL) OR ("assetId" IS NULL AND "albumId" IS NOT NULL))`,
})
export class PostAttachmentTable {
  @PrimaryGeneratedColumn()
  id!: Generated<string>;

  @ForeignKeyColumn(() => PostTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  postId!: string;

  @ForeignKeyColumn(() => AssetTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', nullable: true })
  assetId!: string | null;

  @ForeignKeyColumn(() => AlbumTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', nullable: true })
  albumId!: string | null;

  @Column({ type: 'integer', default: 0 })
  position!: Generated<number>;
}
