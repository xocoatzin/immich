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
import { PostVisibility } from 'src/enum.js';
import { post_visibility_enum } from 'src/schema/enums.js';
import { UserTable } from 'src/schema/tables/user.table.js';

@Table('post')
@UpdatedAtTrigger('post_updatedAt')
@Index({ name: 'post_owner_created_idx', columns: ['ownerId', 'createdAt', 'id'] })
@Index({ name: 'post_created_idx', columns: ['createdAt', 'id'] })
export class PostTable {
  @PrimaryGeneratedColumn()
  id!: Generated<string>;

  @ForeignKeyColumn(() => UserTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  ownerId!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ enum: post_visibility_enum, default: PostVisibility.Private })
  visibility!: Generated<PostVisibility>;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;

  @UpdateDateColumn()
  updatedAt!: Generated<Timestamp>;

  @DeleteDateColumn()
  deletedAt!: Timestamp | null;

  @UpdateIdColumn({ index: true })
  updateId!: Generated<string>;
}
