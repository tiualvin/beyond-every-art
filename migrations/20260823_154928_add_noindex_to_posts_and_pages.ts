import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts" ADD COLUMN "noindex" boolean DEFAULT false;
  ALTER TABLE "_posts_v" ADD COLUMN "version_noindex" boolean DEFAULT false;
  ALTER TABLE "pages" ADD COLUMN "noindex" boolean DEFAULT false;
  ALTER TABLE "_pages_v" ADD COLUMN "version_noindex" boolean DEFAULT false;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts" DROP COLUMN "noindex";
  ALTER TABLE "_posts_v" DROP COLUMN "version_noindex";
  ALTER TABLE "pages" DROP COLUMN "noindex";
  ALTER TABLE "_pages_v" DROP COLUMN "version_noindex";`)
}
