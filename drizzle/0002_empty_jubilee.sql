CREATE TYPE "public"."scan_status" AS ENUM('queued', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "scan_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"library_id" uuid NOT NULL,
	"status" "scan_status" DEFAULT 'queued' NOT NULL,
	"discovered_files" integer DEFAULT 0 NOT NULL,
	"processed_files" integer DEFAULT 0 NOT NULL,
	"failed_files" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "natural_key" text;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "poster_path" text;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "backdrop_path" text;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "metadata_source" text;--> statement-breakpoint
UPDATE "media_items" SET "natural_key" = 'legacy:' || "id"::text WHERE "natural_key" IS NULL;--> statement-breakpoint
ALTER TABLE "media_items" ALTER COLUMN "natural_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "scan_runs" ADD CONSTRAINT "scan_runs_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scan_runs_library_created_index" ON "scan_runs" USING btree ("library_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "media_items_library_natural_key_unique" ON "media_items" USING btree ("library_id","natural_key");
