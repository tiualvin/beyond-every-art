import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_list_article_versions" boolean DEFAULT true;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_read_article_version" boolean DEFAULT true;`)

  // Written by hand; the generator only adds the columns. `DEFAULT true` is the
  // plugin's default for a new key, but applied to existing rows it would hand
  // every key and OAuth grant two new ways to read article bodies — including
  // one whose holder or approver unticked `readArticleMarkdown`, the tool that
  // reads the same text today. So an existing key reads history exactly when
  // it could already read the current body.
  await db.execute(sql`
   UPDATE "payload_mcp_api_keys" SET
    "payload_mcp_tool_list_article_versions" = "payload_mcp_tool_read_article_markdown",
    "payload_mcp_tool_read_article_version" = "payload_mcp_tool_read_article_markdown";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_list_article_versions";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_read_article_version";`)
}
