CREATE TABLE "media_intro_markers" (
	"media_file_id" uuid PRIMARY KEY NOT NULL,
	"start_seconds" real NOT NULL,
	"end_seconds" real NOT NULL,
	"source" text DEFAULT 'audio-correlation' NOT NULL,
	"signature" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_intro_markers" ADD CONSTRAINT "media_intro_markers_media_file_id_media_files_id_fk" FOREIGN KEY ("media_file_id") REFERENCES "public"."media_files"("id") ON DELETE cascade ON UPDATE no action;