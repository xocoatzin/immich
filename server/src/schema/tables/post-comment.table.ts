import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  ForeignKeyColumn,
  type Generated,
  Index,
  PrimaryGeneratedColumn,
  Table,
  Timestamp,
  UpdateDateColumn,
} from '@immich/sql-tools';
import { UpdateIdColumn, UpdatedAtTrigger } from 'src/decorators.js';
import { PostTable } from 'src/schema/tables/post.table.js';
import { UserTable } from 'src/schema/tables/user.table.js';

@Table('post_comment')
@UpdatedAtTrigger('post_comment_updatedAt')
@Index({ name: 'post_comment_post_created_idx', columns: ['postId', 'createdAt', 'id'] })
export class PostCommentTable {
  @PrimaryGeneratedColumn()
  id!: Generated<string>;

  @ForeignKeyColumn(() => PostTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  postId!: string;

  @ForeignKeyColumn(() => PostCommentTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', nullable: true })
  parentId!: string | null;

  @ForeignKeyColumn(() => UserTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  userId!: string;

  @Column({ type: 'text' })
  body!: string;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;

  @UpdateDateColumn()
  updatedAt!: Generated<Timestamp>;

  @DeleteDateColumn()
  deletedAt!: Timestamp | null;

  @UpdateIdColumn({ index: true })
  updateId!: Generated<string>;
}
