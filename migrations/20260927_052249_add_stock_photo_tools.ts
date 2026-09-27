import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_find_stock_photo" boolean DEFAULT true;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_import_stock_photo" boolean DEFAULT true;`)

  // Hand-written; the generator does not know about consent.
  //
  // `ADD COLUMN ... DEFAULT true` fills every existing row, which is how a new
  // custom tool reaches keys that already exist. For an API key that is the
  // plugin's documented behaviour, and it was kept (docs/STOCK_IMAGERY.md,
  // Decision 4). For an OAuth grant it is not: its approver ticked boxes on a
  // consent screen that did not list these tools, and `capabilityDocument`
  // writes explicit `false`s precisely so an unticked tool stays refused. So
  // every row reachable only through OAuth is unticked here — those a grant
  // points at, and any with no bearer key enabled, which is what a grant's
  // record is and what one left behind by a deleted grant still looks like.
  await db.execute(sql`
   UPDATE "payload_mcp_api_keys"
     SET "payload_mcp_tool_find_stock_photo" = false,
         "payload_mcp_tool_import_stock_photo" = false
   WHERE "id" IN (SELECT "api_key_id" FROM "oauth_grants" WHERE "api_key_id" IS NOT NULL)
      OR "enable_a_p_i_key" IS NOT TRUE;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_find_stock_photo";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_import_stock_photo";`)
}
