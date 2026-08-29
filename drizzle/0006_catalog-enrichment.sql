CREATE TABLE "cast_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_item_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"character" text,
	"billing_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_members" (
	"collection_id" uuid NOT NULL,
	"media_item_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"library_id" uuid NOT NULL,
	"provider_source" text DEFAULT 'tmdb' NOT NULL,
	"provider_id" text NOT NULL,
	"name" text NOT NULL,
	"overview" text,
	"poster_path" text,
	"backdrop_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "genres" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"library_id" uuid NOT NULL,
	"provider_source" text DEFAULT 'tmdb' NOT NULL,
	"provider_id" text,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_item_genres" (
	"media_item_id" uuid NOT NULL,
	"genre_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_technical_profiles" (
	"media_file_id" uuid PRIMARY KEY NOT NULL,
	"resolution_label" text,
	"width" integer,
	"height" integer,
	"video_codec" text,
	"audio_codec" text,
	"audio_channels" text,
	"dynamic_range" text,
	"bitrate" bigint,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"library_id" uuid NOT NULL,
	"provider_source" text DEFAULT 'tmdb' NOT NULL,
	"provider_id" text NOT NULL,
	"name" text NOT NULL,
	"profile_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation_edges" (
	"source_media_item_id" uuid NOT NULL,
	"recommended_media_item_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"provider_source" text DEFAULT 'tmdb' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "original_title" text;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "release_date" date;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "tagline" text;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "provider_rating" real;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "content_rating" text;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "user_title" text;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "user_year" integer;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "user_overview" text;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "enrichment_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "enrichment_last_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "enrichment_last_success_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cast_credits" ADD CONSTRAINT "cast_credits_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cast_credits" ADD CONSTRAINT "cast_credits_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_members" ADD CONSTRAINT "collection_members_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_members" ADD CONSTRAINT "collection_members_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "genres" ADD CONSTRAINT "genres_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_item_genres" ADD CONSTRAINT "media_item_genres_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_item_genres" ADD CONSTRAINT "media_item_genres_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_technical_profiles" ADD CONSTRAINT "media_technical_profiles_media_file_id_media_files_id_fk" FOREIGN KEY ("media_file_id") REFERENCES "public"."media_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_edges" ADD CONSTRAINT "recommendation_edges_source_media_item_id_media_items_id_fk" FOREIGN KEY ("source_media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_edges" ADD CONSTRAINT "recommendation_edges_recommended_media_item_id_media_items_id_fk" FOREIGN KEY ("recommended_media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cast_credits_item_person_unique" ON "cast_credits" USING btree ("media_item_id","person_id");--> statement-breakpoint
CREATE INDEX "cast_credits_item_order_index" ON "cast_credits" USING btree ("media_item_id","billing_order");--> statement-breakpoint
CREATE INDEX "cast_credits_person_id_index" ON "cast_credits" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_members_collection_item_unique" ON "collection_members" USING btree ("collection_id","media_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_members_media_item_unique" ON "collection_members" USING btree ("media_item_id");--> statement-breakpoint
CREATE INDEX "collection_members_collection_position_index" ON "collection_members" USING btree ("collection_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "collections_library_provider_unique" ON "collections" USING btree ("library_id","provider_source","provider_id");--> statement-breakpoint
CREATE INDEX "collections_library_name_index" ON "collections" USING btree ("library_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "genres_library_normalized_name_unique" ON "genres" USING btree ("library_id","normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "genres_library_provider_unique" ON "genres" USING btree ("library_id","provider_source","provider_id");--> statement-breakpoint
CREATE INDEX "genres_library_id_index" ON "genres" USING btree ("library_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_item_genres_item_genre_unique" ON "media_item_genres" USING btree ("media_item_id","genre_id");--> statement-breakpoint
CREATE INDEX "media_item_genres_genre_id_index" ON "media_item_genres" USING btree ("genre_id");--> statement-breakpoint
CREATE INDEX "media_item_genres_item_position_index" ON "media_item_genres" USING btree ("media_item_id","position");--> statement-breakpoint
CREATE INDEX "media_technical_profiles_resolution_index" ON "media_technical_profiles" USING btree ("resolution_label");--> statement-breakpoint
CREATE UNIQUE INDEX "people_library_provider_unique" ON "people" USING btree ("library_id","provider_source","provider_id");--> statement-breakpoint
CREATE INDEX "people_library_name_index" ON "people" USING btree ("library_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "recommendation_edges_source_recommended_unique" ON "recommendation_edges" USING btree ("source_media_item_id","recommended_media_item_id");--> statement-breakpoint
CREATE INDEX "recommendation_edges_source_position_index" ON "recommendation_edges" USING btree ("source_media_item_id","position");--> statement-breakpoint
CREATE INDEX "recommendation_edges_recommended_id_index" ON "recommendation_edges" USING btree ("recommended_media_item_id");