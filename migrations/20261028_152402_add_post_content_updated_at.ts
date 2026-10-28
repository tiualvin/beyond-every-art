import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts" ADD COLUMN "content_updated_at" timestamp(3) with time zone;
  ALTER TABLE "_posts_v" ADD COLUMN "version_content_updated_at" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts" DROP COLUMN "content_updated_at";
  ALTER TABLE "_posts_v" DROP COLUMN "version_content_updated_at";`)
}
