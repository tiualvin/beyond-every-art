import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "oauth_grants" ADD COLUMN "previous_refresh_token_hash" varchar;
  ALTER TABLE "oauth_grants" ADD COLUMN "absolute_expires_at" timestamp(3) with time zone;
  CREATE INDEX "oauth_grants_previous_refresh_token_hash_idx" ON "oauth_grants" USING btree ("previous_refresh_token_hash");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "oauth_grants_previous_refresh_token_hash_idx";
  ALTER TABLE "oauth_grants" DROP COLUMN "previous_refresh_token_hash";
  ALTER TABLE "oauth_grants" DROP COLUMN "absolute_expires_at";`)
}
