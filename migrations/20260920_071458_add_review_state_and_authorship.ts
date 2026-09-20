import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_posts_review_state" AS ENUM('writing', 'ready', 'changes');
  CREATE TYPE "public"."enum_posts_last_edited_by" AS ENUM('person', 'agent');
  CREATE TYPE "public"."enum__posts_v_version_review_state" AS ENUM('writing', 'ready', 'changes');
  CREATE TYPE "public"."enum__posts_v_version_last_edited_by" AS ENUM('person', 'agent');
  CREATE TYPE "public"."enum_pages_last_edited_by" AS ENUM('person', 'agent');
  CREATE TYPE "public"."enum__pages_v_version_last_edited_by" AS ENUM('person', 'agent');
  ALTER TABLE "posts" ADD COLUMN "review_state" "enum_posts_review_state";
  ALTER TABLE "posts" ADD COLUMN "last_edited_by" "enum_posts_last_edited_by";
  ALTER TABLE "_posts_v" ADD COLUMN "version_review_state" "enum__posts_v_version_review_state";
  ALTER TABLE "_posts_v" ADD COLUMN "version_last_edited_by" "enum__posts_v_version_last_edited_by";
  ALTER TABLE "pages" ADD COLUMN "last_edited_by" "enum_pages_last_edited_by";
  ALTER TABLE "_pages_v" ADD COLUMN "version_last_edited_by" "enum__pages_v_version_last_edited_by";
  CREATE INDEX "posts_review_state_idx" ON "posts" USING btree ("review_state");
  CREATE INDEX "posts_last_edited_by_idx" ON "posts" USING btree ("last_edited_by");
  CREATE INDEX "_posts_v_version_version_review_state_idx" ON "_posts_v" USING btree ("version_review_state");
  CREATE INDEX "_posts_v_version_version_last_edited_by_idx" ON "_posts_v" USING btree ("version_last_edited_by");
  CREATE INDEX "pages_last_edited_by_idx" ON "pages" USING btree ("last_edited_by");
  CREATE INDEX "_pages_v_version_version_last_edited_by_idx" ON "_pages_v" USING btree ("version_last_edited_by");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "posts_review_state_idx";
  DROP INDEX "posts_last_edited_by_idx";
  DROP INDEX "_posts_v_version_version_review_state_idx";
  DROP INDEX "_posts_v_version_version_last_edited_by_idx";
  DROP INDEX "pages_last_edited_by_idx";
  DROP INDEX "_pages_v_version_version_last_edited_by_idx";
  ALTER TABLE "posts" DROP COLUMN "review_state";
  ALTER TABLE "posts" DROP COLUMN "last_edited_by";
  ALTER TABLE "_posts_v" DROP COLUMN "version_review_state";
  ALTER TABLE "_posts_v" DROP COLUMN "version_last_edited_by";
  ALTER TABLE "pages" DROP COLUMN "last_edited_by";
  ALTER TABLE "_pages_v" DROP COLUMN "version_last_edited_by";
  DROP TYPE "public"."enum_posts_review_state";
  DROP TYPE "public"."enum_posts_last_edited_by";
  DROP TYPE "public"."enum__posts_v_version_review_state";
  DROP TYPE "public"."enum__posts_v_version_last_edited_by";
  DROP TYPE "public"."enum_pages_last_edited_by";
  DROP TYPE "public"."enum__pages_v_version_last_edited_by";`)
}
