ALTER TABLE "media_trailers" ADD COLUMN IF NOT EXISTS "local_path" text;--> statement-breakpoint
ALTER TABLE "media_trailers" ADD COLUMN IF NOT EXISTS "downloaded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_trailers" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'metadata' NOT NULL;
