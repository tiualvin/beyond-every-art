import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_publish_article" boolean DEFAULT true;`)

  // Written by hand; the generator only adds the column. `DEFAULT true` is the
  // plugin's default for a new key, but applied to existing rows it would hand
  // every key and OAuth grant a new tool that writes posts. Publishing an
  // article is an update to it — `updatePosts` with `_status: 'published'`
  // does the same — so an existing key gets it exactly when it already had
  // `posts.update`. Who may actually publish is unchanged: `refuseMcpPublish`
  // still requires an administrator, and for a connector the consent screen's
  // publishing box. A null reads as off to the plugin, and stays off here.
  await db.execute(sql`
   UPDATE "payload_mcp_api_keys" SET
    "payload_mcp_tool_publish_article" = COALESCE("posts_update", false);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_publish_article";`)
}
