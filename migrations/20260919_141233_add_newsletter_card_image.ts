import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "site_settings" ADD COLUMN "newsletter_image_id" integer;
  ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_newsletter_image_id_media_id_fk" FOREIGN KEY ("newsletter_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "site_settings_newsletter_image_idx" ON "site_settings" USING btree ("newsletter_image_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "site_settings" DROP CONSTRAINT "site_settings_newsletter_image_id_media_id_fk";
  
  DROP INDEX "site_settings_newsletter_image_idx";
  ALTER TABLE "site_settings" DROP COLUMN "newsletter_image_id";`)
}
