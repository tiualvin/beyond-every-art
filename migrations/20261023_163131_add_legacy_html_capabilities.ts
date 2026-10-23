import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_read_legacy_html" boolean DEFAULT true;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_edit_legacy_html" boolean DEFAULT true;`)

  // Written by hand; the generator only adds the columns. `DEFAULT true` is the
  // plugin's default for a new key, but applied to existing rows it would hand
  // every key and OAuth grant — a grant is a row in this table too — a new way
  // to read and a new way to write article bodies, including one whose holder
  // or approver unticked the tools that do that today.
  //
  // `readLegacyHtml` reads the body `readArticleMarkdown` reads, for the
  // articles that render from HTML, so an existing key has it exactly where it
  // had that. `editLegacyHtml` writes a draft body, which takes both
  // `updateArticleMarkdown` and `posts.update` by hand today; an existing key
  // has it only where it had both. A null in any of them reads as off to the
  // plugin, and stays off here.
  await db.execute(sql`
   UPDATE "payload_mcp_api_keys" SET
    "payload_mcp_tool_read_legacy_html" = "payload_mcp_tool_read_article_markdown",
    "payload_mcp_tool_edit_legacy_html" =
      COALESCE("payload_mcp_tool_update_article_markdown", false)
      AND COALESCE("posts_update", false);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_read_legacy_html";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_edit_legacy_html";`)
}
