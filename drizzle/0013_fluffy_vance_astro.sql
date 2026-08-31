CREATE TABLE "media_preview_sprites" (
	"media_file_id" uuid PRIMARY KEY NOT NULL,
	"storage_key" text NOT NULL,
	"columns" integer NOT NULL,
	"rows" integer NOT NULL,
	"interval" integer NOT NULL,
	"tile_width" integer NOT NULL,
	"tile_height" integer NOT NULL,
	"signature" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_preview_sprites" ADD CONSTRAINT "media_preview_sprites_media_file_id_media_files_id_fk" FOREIGN KEY ("media_file_id") REFERENCES "public"."media_files"("id") ON DELETE cascade ON UPDATE no action;