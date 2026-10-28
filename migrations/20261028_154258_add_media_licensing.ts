import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media" ADD COLUMN "creator" varchar;
  ALTER TABLE "media" ADD COLUMN "copyright_notice" varchar;
  ALTER TABLE "media" ADD COLUMN "license_u_r_l" varchar;
  ALTER TABLE "media" ADD COLUMN "acquire_license_page" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media" DROP COLUMN "creator";
  ALTER TABLE "media" DROP COLUMN "copyright_notice";
  ALTER TABLE "media" DROP COLUMN "license_u_r_l";
  ALTER TABLE "media" DROP COLUMN "acquire_license_page";`)
}
