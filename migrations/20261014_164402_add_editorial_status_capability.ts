import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_editorial_status" boolean DEFAULT true;`)

  // Written by hand; the generator only adds the column. `DEFAULT true` is the
  // plugin's default for a new key, but applied to existing rows it would hand
  // every key and OAuth grant a new way to read posts. The status lists titles,
  // addresses and dates of posts the key can already read — what `findPosts`
  // returns — so an existing key gets it exactly when it had `posts.find`. A
  // null reads as off to the plugin, and stays off here.
  await db.execute(sql`
   UPDATE "payload_mcp_api_keys" SET
    "payload_mcp_tool_editorial_status" = COALESCE("posts_find", false);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_editorial_status";`)
}
