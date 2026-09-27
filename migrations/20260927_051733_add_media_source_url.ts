import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media" ADD COLUMN "source_u_r_l" varchar;
  CREATE INDEX "media_source_u_r_l_idx" ON "media" USING btree ("source_u_r_l");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "media_source_u_r_l_idx";
  ALTER TABLE "media" DROP COLUMN "source_u_r_l";`)
}
