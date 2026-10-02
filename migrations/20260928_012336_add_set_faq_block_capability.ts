import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_set_f_a_q_block" boolean DEFAULT true;`)

  // Written by hand; the generator only adds the column. `DEFAULT true` is the
  // plugin's default for a new key, but applied to existing rows it would hand
  // every key and OAuth grant a new way to write an article body — including
  // one whose holder or approver unticked `updateArticleMarkdown`. Setting an
  // FAQ writes the draft body and nothing else, which is exactly what that
  // tool does, so an existing key gets it exactly when it could already do
  // that. A null reads as off to the plugin, and stays off here. The same rule
  // as `setKeyFactsBlock`'s, in 20260927_095529.
  await db.execute(sql`
   UPDATE "payload_mcp_api_keys" SET
    "payload_mcp_tool_set_f_a_q_block" =
      COALESCE("payload_mcp_tool_update_article_markdown", false);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_set_f_a_q_block";`)
}
