import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TYPE "post_visibility_enum" AS ENUM ('private','partners','specific','public');`.execute(db);
  await sql`CREATE TABLE "post" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "ownerId" uuid NOT NULL,
  "body" text NOT NULL,
  "visibility" post_visibility_enum NOT NULL DEFAULT 'private',
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  "deletedAt" timestamp with time zone,
  "updateId" uuid NOT NULL DEFAULT immich_uuid_v7(),
  CONSTRAINT "post_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "post_pkey" PRIMARY KEY ("id")
);`.execute(db);
  await sql`CREATE INDEX "post_created_idx" ON "post" ("createdAt", "id");`.execute(db);
  await sql`CREATE INDEX "post_owner_created_idx" ON "post" ("ownerId", "createdAt", "id");`.execute(db);
  await sql`CREATE INDEX "post_ownerId_idx" ON "post" ("ownerId");`.execute(db);
  await sql`CREATE INDEX "post_updateId_idx" ON "post" ("updateId");`.execute(db);
  await sql`CREATE OR REPLACE TRIGGER "post_updatedAt"
  BEFORE UPDATE ON "post"
  FOR EACH ROW
  EXECUTE FUNCTION updated_at();`.execute(db);
  await sql`CREATE TABLE "post_attachment" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "postId" uuid NOT NULL,
  "assetId" uuid,
  "albumId" uuid,
  "position" integer NOT NULL DEFAULT 0,
  CONSTRAINT "post_attachment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "post" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "post_attachment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "post_attachment_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "album" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "post_attachment_target_check" CHECK ((("assetId" IS NOT NULL AND "albumId" IS NULL) OR ("assetId" IS NULL AND "albumId" IS NOT NULL))),
  CONSTRAINT "post_attachment_pkey" PRIMARY KEY ("id")
);`.execute(db);
  await sql`CREATE UNIQUE INDEX "post_attachment_post_idx" ON "post_attachment" ("postId", "position");`.execute(db);
  await sql`CREATE INDEX "post_attachment_postId_idx" ON "post_attachment" ("postId");`.execute(db);
  await sql`CREATE INDEX "post_attachment_assetId_idx" ON "post_attachment" ("assetId");`.execute(db);
  await sql`CREATE INDEX "post_attachment_albumId_idx" ON "post_attachment" ("albumId");`.execute(db);
  await sql`CREATE TABLE "post_audience" (
  "postId" uuid NOT NULL,
  "userId" uuid NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "post_audience_postId_fkey" FOREIGN KEY ("postId") REFERENCES "post" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "post_audience_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "post_audience_pkey" PRIMARY KEY ("postId", "userId")
);`.execute(db);
  await sql`CREATE INDEX "post_audience_userId_idx" ON "post_audience" ("userId");`.execute(db);
  await sql`CREATE TABLE "post_comment" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "postId" uuid NOT NULL,
  "parentId" uuid,
  "userId" uuid NOT NULL,
  "body" text NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  "deletedAt" timestamp with time zone,
  "updateId" uuid NOT NULL DEFAULT immich_uuid_v7(),
  CONSTRAINT "post_comment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "post" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "post_comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "post_comment_pkey" PRIMARY KEY ("id")
);`.execute(db);
  await sql`CREATE INDEX "post_comment_post_created_idx" ON "post_comment" ("postId", "createdAt", "id");`.execute(db);
  await sql`CREATE INDEX "post_comment_postId_idx" ON "post_comment" ("postId");`.execute(db);
  await sql`CREATE INDEX "post_comment_parentId_idx" ON "post_comment" ("parentId");`.execute(db);
  await sql`CREATE INDEX "post_comment_userId_idx" ON "post_comment" ("userId");`.execute(db);
  await sql`CREATE INDEX "post_comment_updateId_idx" ON "post_comment" ("updateId");`.execute(db);
  await sql`CREATE OR REPLACE TRIGGER "post_comment_updatedAt"
  BEFORE UPDATE ON "post_comment"
  FOR EACH ROW
  EXECUTE FUNCTION updated_at();`.execute(db);
  await sql`ALTER TABLE "post_comment" ADD CONSTRAINT "post_comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "post_comment" ("id") ON UPDATE CASCADE ON DELETE CASCADE;`.execute(db);
  await sql`CREATE TABLE "post_like" (
  "postId" uuid NOT NULL,
  "userId" uuid NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "post_like_postId_fkey" FOREIGN KEY ("postId") REFERENCES "post" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "post_like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "post_like_pkey" PRIMARY KEY ("postId", "userId")
);`.execute(db);
  await sql`CREATE INDEX "post_like_userId_idx" ON "post_like" ("userId");`.execute(db);
  await sql`INSERT INTO "migration_overrides" ("name", "value") VALUES ('trigger_post_updatedAt', '{"type":"trigger","name":"post_updatedAt","sql":"CREATE OR REPLACE TRIGGER \\"post_updatedAt\\"\\n  BEFORE UPDATE ON \\"post\\"\\n  FOR EACH ROW\\n  EXECUTE FUNCTION updated_at();"}'::jsonb);`.execute(db);
  await sql`INSERT INTO "migration_overrides" ("name", "value") VALUES ('trigger_post_comment_updatedAt', '{"type":"trigger","name":"post_comment_updatedAt","sql":"CREATE OR REPLACE TRIGGER \\"post_comment_updatedAt\\"\\n  BEFORE UPDATE ON \\"post_comment\\"\\n  FOR EACH ROW\\n  EXECUTE FUNCTION updated_at();"}'::jsonb);`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TRIGGER "post_updatedAt" ON "post";`.execute(db);
  await sql`DROP TRIGGER "post_comment_updatedAt" ON "post_comment";`.execute(db);
  await sql`ALTER TABLE "post_comment" DROP CONSTRAINT "post_comment_parentId_fkey";`.execute(db);
  await sql`DROP TABLE "post_attachment";`.execute(db);
  await sql`DROP TABLE "post_audience";`.execute(db);
  await sql`DROP TABLE "post_comment";`.execute(db);
  await sql`DROP TABLE "post_like";`.execute(db);
  await sql`DROP TABLE "post";`.execute(db);
  await sql`DROP TYPE "post_visibility_enum";`.execute(db);
  await sql`DELETE FROM "migration_overrides" WHERE "name" = 'trigger_post_updatedAt';`.execute(db);
  await sql`DELETE FROM "migration_overrides" WHERE "name" = 'trigger_post_comment_updatedAt';`.execute(db);
}
