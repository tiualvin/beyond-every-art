import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts_locales" ADD COLUMN "drafted_at" timestamp(3) with time zone;
  ALTER TABLE "_posts_v_locales" ADD COLUMN "version_drafted_at" timestamp(3) with time zone;`)

  // Written by hand. `draftedAt` is how "saved but not out" is now told per
  // language (lib/content/editorial-status.ts, `pendingIn`). An English draft
  // already waiting when this runs has no date yet, so it is given the time
  // its version was saved — the moment the stamp would have recorded. Every
  // other row has nothing pending and keeps null.
  await db.execute(sql`
   UPDATE "_posts_v_locales" l SET "version_drafted_at" = v."updated_at"
     FROM "_posts_v" v
     WHERE l."_parent_id" = v."id" AND l."_locale" = 'en'
       AND v."latest" = true AND v."version__status" = 'draft';
   UPDATE "posts_locales" l SET "drafted_at" = p."updated_at"
     FROM "posts" p
     WHERE l."_parent_id" = p."id" AND l."_locale" = 'en'
       AND p."_status" = 'draft';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts_locales" DROP COLUMN "drafted_at";
  ALTER TABLE "_posts_v_locales" DROP COLUMN "version_drafted_at";`)
}
