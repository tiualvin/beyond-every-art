import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_restore_article_version" boolean DEFAULT true;`)

  // Written by hand; the generator only adds the column. `DEFAULT true` is the
  // plugin's default for a new key, but applied to existing rows it would hand
  // every key and OAuth grant a new way to write to posts. A restore replaces a
  // body and a post's other article fields, so an existing key gets it exactly
  // when it could already do both: `updateArticleMarkdown` and `posts.update`.
  // A null in either reads as off to the plugin, and stays off here.
  await db.execute(sql`
   UPDATE "payload_mcp_api_keys" SET
    "payload_mcp_tool_restore_article_version" =
      COALESCE("payload_mcp_tool_update_article_markdown", false)
      AND COALESCE("posts_update", false);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_restore_article_version";`)
}
