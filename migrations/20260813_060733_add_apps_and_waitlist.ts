import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_apps_platforms" AS ENUM('ios', 'android', 'web');
  CREATE TYPE "public"."enum_apps_stage" AS ENUM('concept', 'in_development', 'coming_soon', 'available');
  CREATE TYPE "public"."enum_apps_plate" AS ENUM('reader', 'colouring', 'year', 'echo');
  CREATE TYPE "public"."enum_apps_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__apps_v_version_platforms" AS ENUM('ios', 'android', 'web');
  CREATE TYPE "public"."enum__apps_v_version_stage" AS ENUM('concept', 'in_development', 'coming_soon', 'available');
  CREATE TYPE "public"."enum__apps_v_version_plate" AS ENUM('reader', 'colouring', 'year', 'echo');
  CREATE TYPE "public"."enum__apps_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "apps_platforms" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_apps_platforms",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "apps_screenshots" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"caption" varchar
  );
  
  CREATE TABLE "apps" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"slug" varchar,
  	"tagline" varchar,
  	"summary" varchar,
  	"detail" varchar,
  	"description" jsonb,
  	"stage" "enum_apps_stage" DEFAULT 'concept',
  	"sequence" varchar,
  	"hero_image_id" integer,
  	"plate" "enum_apps_plate" DEFAULT 'reader',
  	"app_store_u_r_l" varchar,
  	"play_store_u_r_l" varchar,
  	"order" numeric DEFAULT 0,
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_apps_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_apps_v_version_platforms" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum__apps_v_version_platforms",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_apps_v_version_screenshots" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"caption" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_apps_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_name" varchar,
  	"version_slug" varchar,
  	"version_tagline" varchar,
  	"version_summary" varchar,
  	"version_detail" varchar,
  	"version_description" jsonb,
  	"version_stage" "enum__apps_v_version_stage" DEFAULT 'concept',
  	"version_sequence" varchar,
  	"version_hero_image_id" integer,
  	"version_plate" "enum__apps_v_version_plate" DEFAULT 'reader',
  	"version_app_store_u_r_l" varchar,
  	"version_play_store_u_r_l" varchar,
  	"version_order" numeric DEFAULT 0,
  	"version_meta_title" varchar,
  	"version_meta_description" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__apps_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "app_waitlist" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"email" varchar NOT NULL,
  	"app_id" integer NOT NULL,
  	"source" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "apps_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "app_waitlist_id" integer;
  ALTER TABLE "apps_platforms" ADD CONSTRAINT "apps_platforms_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "apps_screenshots" ADD CONSTRAINT "apps_screenshots_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "apps_screenshots" ADD CONSTRAINT "apps_screenshots_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "apps" ADD CONSTRAINT "apps_hero_image_id_media_id_fk" FOREIGN KEY ("hero_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_apps_v_version_platforms" ADD CONSTRAINT "_apps_v_version_platforms_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_apps_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_apps_v_version_screenshots" ADD CONSTRAINT "_apps_v_version_screenshots_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_apps_v_version_screenshots" ADD CONSTRAINT "_apps_v_version_screenshots_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_apps_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_apps_v" ADD CONSTRAINT "_apps_v_parent_id_apps_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."apps"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_apps_v" ADD CONSTRAINT "_apps_v_version_hero_image_id_media_id_fk" FOREIGN KEY ("version_hero_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_waitlist" ADD CONSTRAINT "app_waitlist_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "apps_platforms_order_idx" ON "apps_platforms" USING btree ("order");
  CREATE INDEX "apps_platforms_parent_idx" ON "apps_platforms" USING btree ("parent_id");
  CREATE INDEX "apps_screenshots_order_idx" ON "apps_screenshots" USING btree ("_order");
  CREATE INDEX "apps_screenshots_parent_id_idx" ON "apps_screenshots" USING btree ("_parent_id");
  CREATE INDEX "apps_screenshots_image_idx" ON "apps_screenshots" USING btree ("image_id");
  CREATE UNIQUE INDEX "apps_slug_idx" ON "apps" USING btree ("slug");
  CREATE INDEX "apps_hero_image_idx" ON "apps" USING btree ("hero_image_id");
  CREATE INDEX "apps_order_idx" ON "apps" USING btree ("order");
  CREATE INDEX "apps_updated_at_idx" ON "apps" USING btree ("updated_at");
  CREATE INDEX "apps_created_at_idx" ON "apps" USING btree ("created_at");
  CREATE INDEX "apps__status_idx" ON "apps" USING btree ("_status");
  CREATE INDEX "_apps_v_version_platforms_order_idx" ON "_apps_v_version_platforms" USING btree ("order");
  CREATE INDEX "_apps_v_version_platforms_parent_idx" ON "_apps_v_version_platforms" USING btree ("parent_id");
  CREATE INDEX "_apps_v_version_screenshots_order_idx" ON "_apps_v_version_screenshots" USING btree ("_order");
  CREATE INDEX "_apps_v_version_screenshots_parent_id_idx" ON "_apps_v_version_screenshots" USING btree ("_parent_id");
  CREATE INDEX "_apps_v_version_screenshots_image_idx" ON "_apps_v_version_screenshots" USING btree ("image_id");
  CREATE INDEX "_apps_v_parent_idx" ON "_apps_v" USING btree ("parent_id");
  CREATE INDEX "_apps_v_version_version_slug_idx" ON "_apps_v" USING btree ("version_slug");
  CREATE INDEX "_apps_v_version_version_hero_image_idx" ON "_apps_v" USING btree ("version_hero_image_id");
  CREATE INDEX "_apps_v_version_version_order_idx" ON "_apps_v" USING btree ("version_order");
  CREATE INDEX "_apps_v_version_version_updated_at_idx" ON "_apps_v" USING btree ("version_updated_at");
  CREATE INDEX "_apps_v_version_version_created_at_idx" ON "_apps_v" USING btree ("version_created_at");
  CREATE INDEX "_apps_v_version_version__status_idx" ON "_apps_v" USING btree ("version__status");
  CREATE INDEX "_apps_v_created_at_idx" ON "_apps_v" USING btree ("created_at");
  CREATE INDEX "_apps_v_updated_at_idx" ON "_apps_v" USING btree ("updated_at");
  CREATE INDEX "_apps_v_latest_idx" ON "_apps_v" USING btree ("latest");
  CREATE INDEX "_apps_v_autosave_idx" ON "_apps_v" USING btree ("autosave");
  CREATE INDEX "app_waitlist_email_idx" ON "app_waitlist" USING btree ("email");
  CREATE INDEX "app_waitlist_app_idx" ON "app_waitlist" USING btree ("app_id");
  CREATE INDEX "app_waitlist_updated_at_idx" ON "app_waitlist" USING btree ("updated_at");
  CREATE INDEX "app_waitlist_created_at_idx" ON "app_waitlist" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_apps_fk" FOREIGN KEY ("apps_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_app_waitlist_fk" FOREIGN KEY ("app_waitlist_id") REFERENCES "public"."app_waitlist"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_apps_id_idx" ON "payload_locked_documents_rels" USING btree ("apps_id");
  CREATE INDEX "payload_locked_documents_rels_app_waitlist_id_idx" ON "payload_locked_documents_rels" USING btree ("app_waitlist_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "apps_platforms" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "apps_screenshots" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "apps" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_apps_v_version_platforms" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_apps_v_version_screenshots" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_apps_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "app_waitlist" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "apps_platforms" CASCADE;
  DROP TABLE "apps_screenshots" CASCADE;
  DROP TABLE "apps" CASCADE;
  DROP TABLE "_apps_v_version_platforms" CASCADE;
  DROP TABLE "_apps_v_version_screenshots" CASCADE;
  DROP TABLE "_apps_v" CASCADE;
  DROP TABLE "app_waitlist" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_apps_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_app_waitlist_fk";
  
  DROP INDEX "payload_locked_documents_rels_apps_id_idx";
  DROP INDEX "payload_locked_documents_rels_app_waitlist_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "apps_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "app_waitlist_id";
  DROP TYPE "public"."enum_apps_platforms";
  DROP TYPE "public"."enum_apps_stage";
  DROP TYPE "public"."enum_apps_plate";
  DROP TYPE "public"."enum_apps_status";
  DROP TYPE "public"."enum__apps_v_version_platforms";
  DROP TYPE "public"."enum__apps_v_version_stage";
  DROP TYPE "public"."enum__apps_v_version_plate";
  DROP TYPE "public"."enum__apps_v_version_status";`)
}
