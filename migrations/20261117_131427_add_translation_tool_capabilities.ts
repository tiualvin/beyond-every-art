import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_save_translation" boolean DEFAULT true;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_translation_status" boolean DEFAULT true;`)

  // Written by hand; the generator only adds the columns. `DEFAULT true` is
  // the plugin's default for a new key, but applied to existing rows it would
  // hand every key and OAuth grant two new tools by deploy.
  //
  // `saveTranslation` writes a draft body — in another language, never
  // English — which is what `updateArticleMarkdown` already does, so an
  // existing key gets it exactly where it had that. `translationStatus` reads
  // titles, slugs and dates of posts the key can already read, as
  // `editorialStatus` does, so it follows `posts.find`. A null reads as off to
  // the plugin, and stays off here.
  await db.execute(sql`
   UPDATE "payload_mcp_api_keys" SET
    "payload_mcp_tool_save_translation" =
      COALESCE("payload_mcp_tool_update_article_markdown", false),
    "payload_mcp_tool_translation_status" = COALESCE("posts_find", false);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_save_translation";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_translation_status";`)
}
