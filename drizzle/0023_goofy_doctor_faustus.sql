ALTER TABLE "media_subtitles" ADD COLUMN "sync_offset_ms" integer;--> statement-breakpoint
ALTER TABLE "media_subtitles" ADD COLUMN "sync_scale" real;--> statement-breakpoint
ALTER TABLE "media_subtitles" ADD COLUMN "sync_confidence" real;--> statement-breakpoint
ALTER TABLE "media_subtitles" ADD COLUMN "synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_subtitles" ADD COLUMN "source_path" text;