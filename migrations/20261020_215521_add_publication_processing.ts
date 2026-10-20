import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_publication_pages_status" AS ENUM('ready', 'failed');
  CREATE TYPE "public"."enum_publication_runs_status" AS ENUM('downloading', 'validating', 'extracting-links', 'processing-pages', 'cleaning-up', 'ready', 'failed');
  CREATE TYPE "public"."enum_publication_runs_source_kind" AS ENUM('r2', 'file', 'sample');
  CREATE TYPE "public"."enum_publication_runs_rejection" AS ENUM('password', 'unreadable', 'too-many-pages', 'too-large');
  CREATE TABLE "publication_pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"publication_id" integer NOT NULL,
  	"page_number" numeric NOT NULL,
  	"status" "enum_publication_pages_status" NOT NULL,
  	"error" varchar,
  	"width" numeric,
  	"height" numeric,
  	"image_id" integer,
  	"text" varchar,
  	"words" jsonb,
  	"links" jsonb,
  	"source_sha256" varchar,
  	"rendition" numeric,
  	"run_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "publication_page_images" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"publication_id" integer NOT NULL,
  	"prefix" varchar,
  	"_objectkey" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_thumbnail_url" varchar,
  	"sizes_thumbnail_width" numeric,
  	"sizes_thumbnail_height" numeric,
  	"sizes_thumbnail_mime_type" varchar,
  	"sizes_thumbnail_filesize" numeric,
  	"sizes_thumbnail_filename" varchar,
  	"sizes_medium_url" varchar,
  	"sizes_medium_width" numeric,
  	"sizes_medium_height" numeric,
  	"sizes_medium_mime_type" varchar,
  	"sizes_medium_filesize" numeric,
  	"sizes_medium_filename" varchar
  );
  
  CREATE TABLE "publication_runs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"publication_id" integer NOT NULL,
  	"status" "enum_publication_runs_status" NOT NULL,
  	"source_kind" "enum_publication_runs_source_kind",
  	"source_name" varchar,
  	"source_bytes" numeric,
  	"source_sha256" varchar,
  	"page_count" numeric,
  	"pages_done" numeric,
  	"current_page" numeric,
  	"progress" numeric,
  	"rendition" numeric,
  	"started_at" timestamp(3) with time zone,
  	"finished_at" timestamp(3) with time zone,
  	"rejection" "enum_publication_runs_rejection",
  	"error" varchar,
  	"summary" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "publication_pages_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "publication_page_images_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "publication_runs_id" integer;
  ALTER TABLE "publication_pages" ADD CONSTRAINT "publication_pages_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "publication_pages" ADD CONSTRAINT "publication_pages_image_id_publication_page_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."publication_page_images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "publication_pages" ADD CONSTRAINT "publication_pages_run_id_publication_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."publication_runs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "publication_page_images" ADD CONSTRAINT "publication_page_images_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "publication_runs" ADD CONSTRAINT "publication_runs_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "publication_pages_publication_idx" ON "publication_pages" USING btree ("publication_id");
  CREATE INDEX "publication_pages_image_idx" ON "publication_pages" USING btree ("image_id");
  CREATE INDEX "publication_pages_run_idx" ON "publication_pages" USING btree ("run_id");
  CREATE INDEX "publication_pages_updated_at_idx" ON "publication_pages" USING btree ("updated_at");
  CREATE INDEX "publication_pages_created_at_idx" ON "publication_pages" USING btree ("created_at");
  CREATE UNIQUE INDEX "publication_pageNumber_idx" ON "publication_pages" USING btree ("publication_id","page_number");
  CREATE INDEX "publication_page_images_publication_idx" ON "publication_page_images" USING btree ("publication_id");
  CREATE INDEX "publication_page_images_updated_at_idx" ON "publication_page_images" USING btree ("updated_at");
  CREATE INDEX "publication_page_images_created_at_idx" ON "publication_page_images" USING btree ("created_at");
  CREATE UNIQUE INDEX "publication_page_images_filename_idx" ON "publication_page_images" USING btree ("filename");
  CREATE INDEX "publication_page_images_sizes_thumbnail_sizes_thumbnail__idx" ON "publication_page_images" USING btree ("sizes_thumbnail_filename");
  CREATE INDEX "publication_page_images_sizes_medium_sizes_medium_filena_idx" ON "publication_page_images" USING btree ("sizes_medium_filename");
  CREATE INDEX "publication_runs_publication_idx" ON "publication_runs" USING btree ("publication_id");
  CREATE INDEX "publication_runs_status_idx" ON "publication_runs" USING btree ("status");
  CREATE INDEX "publication_runs_updated_at_idx" ON "publication_runs" USING btree ("updated_at");
  CREATE INDEX "publication_runs_created_at_idx" ON "publication_runs" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_publication_pages_fk" FOREIGN KEY ("publication_pages_id") REFERENCES "public"."publication_pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_publication_page_images_fk" FOREIGN KEY ("publication_page_images_id") REFERENCES "public"."publication_page_images"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_publication_runs_fk" FOREIGN KEY ("publication_runs_id") REFERENCES "public"."publication_runs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_publication_pages_id_idx" ON "payload_locked_documents_rels" USING btree ("publication_pages_id");
  CREATE INDEX "payload_locked_documents_rels_publication_page_images_id_idx" ON "payload_locked_documents_rels" USING btree ("publication_page_images_id");
  CREATE INDEX "payload_locked_documents_rels_publication_runs_id_idx" ON "payload_locked_documents_rels" USING btree ("publication_runs_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Edited by hand, as 20261007_035208_add_publications was: the generated
  // rollback drops the three tables with CASCADE, which already removes the
  // foreign keys `payload_locked_documents_rels` holds on them, and then drops
  // those keys again by name — so as generated it fails with "constraint does
  // not exist" and rolls nothing back. Checked against a real database both
  // ways.
  await db.execute(sql`
   ALTER TABLE "publication_pages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "publication_page_images" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "publication_runs" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "publication_pages" CASCADE;
  DROP TABLE "publication_page_images" CASCADE;
  DROP TABLE "publication_runs" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_publication_pages_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_publication_page_images_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_publication_runs_fk";
  
  DROP INDEX "payload_locked_documents_rels_publication_pages_id_idx";
  DROP INDEX "payload_locked_documents_rels_publication_page_images_id_idx";
  DROP INDEX "payload_locked_documents_rels_publication_runs_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "publication_pages_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "publication_page_images_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "publication_runs_id";
  DROP TYPE "public"."enum_publication_pages_status";
  DROP TYPE "public"."enum_publication_runs_status";
  DROP TYPE "public"."enum_publication_runs_source_kind";
  DROP TYPE "public"."enum_publication_runs_rejection";`)
}
