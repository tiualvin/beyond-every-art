import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_site_settings_rail_fallback_kind" AS ENUM('none', 'post', 'app');
  CREATE TABLE "site_settings_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"posts_id" integer
  );
  
  ALTER TABLE "site_settings" ADD COLUMN "rail_fallback_kind" "enum_site_settings_rail_fallback_kind" DEFAULT 'none';
  ALTER TABLE "site_settings" ADD COLUMN "rail_fallback_app_id" integer;
  ALTER TABLE "site_settings_rels" ADD CONSTRAINT "site_settings_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_settings_rels" ADD CONSTRAINT "site_settings_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "site_settings_rels_order_idx" ON "site_settings_rels" USING btree ("order");
  CREATE INDEX "site_settings_rels_parent_idx" ON "site_settings_rels" USING btree ("parent_id");
  CREATE INDEX "site_settings_rels_path_idx" ON "site_settings_rels" USING btree ("path");
  CREATE INDEX "site_settings_rels_posts_id_idx" ON "site_settings_rels" USING btree ("posts_id");
  ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_rail_fallback_app_id_apps_id_fk" FOREIGN KEY ("rail_fallback_app_id") REFERENCES "public"."apps"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "site_settings_rail_fallback_rail_fallback_app_idx" ON "site_settings" USING btree ("rail_fallback_app_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "site_settings_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "site_settings_rels" CASCADE;
  ALTER TABLE "site_settings" DROP CONSTRAINT "site_settings_rail_fallback_app_id_apps_id_fk";
  
  DROP INDEX "site_settings_rail_fallback_rail_fallback_app_idx";
  ALTER TABLE "site_settings" DROP COLUMN "rail_fallback_kind";
  ALTER TABLE "site_settings" DROP COLUMN "rail_fallback_app_id";
  DROP TYPE "public"."enum_site_settings_rail_fallback_kind";`)
}
