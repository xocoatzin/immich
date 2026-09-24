import { CreateDateColumn, ForeignKeyColumn, type Generated, Table, Timestamp } from '@immich/sql-tools';
import { PostTable } from 'src/schema/tables/post.table.js';
import { UserTable } from 'src/schema/tables/user.table.js';

@Table('post_like')
export class PostLikeTable {
  @ForeignKeyColumn(() => PostTable, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
    primary: true,
    // [postId, userId] is the PK constraint
    index: false,
  })
  postId!: string;

  @ForeignKeyColumn(() => UserTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', primary: true })
  userId!: string;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;
}
