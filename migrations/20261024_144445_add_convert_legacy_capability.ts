import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_convert_legacy_article" boolean DEFAULT true;`)

  // Written by hand; the generator only adds the column. `DEFAULT true` is the
  // plugin's default for a new key, but applied to existing rows it would hand
  // every key and OAuth grant — a grant is a row in this table too — a way to
  // replace what a migrated article renders from, including one whose holder
  // or approver unticked the tool that edits that article today.
  //
  // `convertLegacyArticle` belongs with `editLegacyHtml`: both take an
  // editor, both write a migrated article's draft body. So an existing key has
  // it exactly where it has `editLegacyHtml` — which itself went only to keys
  // holding both `updateArticleMarkdown` and `posts.update`
  // (20261023_163131). A null there reads as off to the plugin, and stays off.
  await db.execute(sql`
   UPDATE "payload_mcp_api_keys" SET
    "payload_mcp_tool_convert_legacy_article" =
      COALESCE("payload_mcp_tool_edit_legacy_html", false);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_convert_legacy_article";`)
}
