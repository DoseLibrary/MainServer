CREATE TABLE "media_subtitles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_file_id" uuid NOT NULL,
	"stream_index" integer NOT NULL,
	"language" text,
	"label" text NOT NULL,
	"forced" boolean DEFAULT false NOT NULL,
	"storage_key" text NOT NULL,
	"source" text DEFAULT 'embedded' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_subtitles" ADD CONSTRAINT "media_subtitles_media_file_id_media_files_id_fk" FOREIGN KEY ("media_file_id") REFERENCES "public"."media_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_subtitles_file_stream_unique" ON "media_subtitles" USING btree ("media_file_id","stream_index");--> statement-breakpoint
CREATE INDEX "media_subtitles_file_index" ON "media_subtitles" USING btree ("media_file_id");