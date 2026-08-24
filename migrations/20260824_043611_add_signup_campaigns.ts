import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "signup_campaigns" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"internal_name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"active" boolean DEFAULT false,
  	"starts_at" timestamp(3) with time zone,
  	"ends_at" timestamp(3) with time zone,
  	"heading" varchar NOT NULL,
  	"body" varchar,
  	"submit_label" varchar DEFAULT 'Subscribe',
  	"success_message" varchar,
  	"consent_text" varchar,
  	"privacy_link" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "signup_campaigns_id" integer;
  CREATE UNIQUE INDEX "signup_campaigns_slug_idx" ON "signup_campaigns" USING btree ("slug");
  CREATE INDEX "signup_campaigns_updated_at_idx" ON "signup_campaigns" USING btree ("updated_at");
  CREATE INDEX "signup_campaigns_created_at_idx" ON "signup_campaigns" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_signup_campaigns_fk" FOREIGN KEY ("signup_campaigns_id") REFERENCES "public"."signup_campaigns"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_signup_campaigns_id_idx" ON "payload_locked_documents_rels" USING btree ("signup_campaigns_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "signup_campaigns" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "signup_campaigns" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_signup_campaigns_fk";
  
  DROP INDEX "payload_locked_documents_rels_signup_campaigns_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "signup_campaigns_id";`)
}
