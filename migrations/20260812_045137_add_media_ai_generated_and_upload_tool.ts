import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media" ADD COLUMN "ai_generated" boolean DEFAULT false;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_upload_media" boolean DEFAULT true;
  CREATE INDEX "media_ai_generated_idx" ON "media" USING btree ("ai_generated");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "media_ai_generated_idx";
  ALTER TABLE "media" DROP COLUMN "ai_generated";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_upload_media";`)
}
