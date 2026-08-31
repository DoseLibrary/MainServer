ALTER TABLE "user_settings" ADD COLUMN "playback_speed_percent" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "subtitle_size_percent" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "subtitle_background" text DEFAULT 'shadow' NOT NULL;