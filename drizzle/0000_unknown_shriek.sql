CREATE TYPE "public"."library_kind" AS ENUM('movies', 'shows');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('movie', 'series', 'season', 'episode');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TABLE "libraries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "library_kind" NOT NULL,
	"root_path" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_scanned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_item_id" uuid NOT NULL,
	"library_id" uuid NOT NULL,
	"relative_path" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"modified_at" timestamp with time zone NOT NULL,
	"duration_seconds" integer,
	"probe" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"library_id" uuid NOT NULL,
	"parent_id" uuid,
	"kind" "media_kind" NOT NULL,
	"title" text NOT NULL,
	"sort_title" text NOT NULL,
	"year" integer,
	"season_number" integer,
	"episode_number" integer,
	"overview" text,
	"provider_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playback_progress" (
	"user_id" uuid NOT NULL,
	"media_item_id" uuid NOT NULL,
	"position_seconds" integer DEFAULT 0 NOT NULL,
	"watched" boolean DEFAULT false NOT NULL,
	"last_watched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'member' NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playback_progress" ADD CONSTRAINT "playback_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playback_progress" ADD CONSTRAINT "playback_progress_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "libraries_name_unique" ON "libraries" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "libraries_root_path_unique" ON "libraries" USING btree ("root_path");--> statement-breakpoint
CREATE UNIQUE INDEX "media_files_library_path_unique" ON "media_files" USING btree ("library_id","relative_path");--> statement-breakpoint
CREATE INDEX "media_files_media_item_id_index" ON "media_files" USING btree ("media_item_id");--> statement-breakpoint
CREATE INDEX "media_items_library_id_index" ON "media_items" USING btree ("library_id");--> statement-breakpoint
CREATE INDEX "media_items_parent_id_index" ON "media_items" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "playback_progress_user_media_unique" ON "playback_progress" USING btree ("user_id","media_item_id");--> statement-breakpoint
CREATE INDEX "playback_progress_user_recent_index" ON "playback_progress" USING btree ("user_id","last_watched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_id_index" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_unique" ON "users" USING btree ("username");