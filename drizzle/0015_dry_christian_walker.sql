CREATE TABLE "collection_expected_members" (
	"collection_id" uuid NOT NULL,
	"tmdb_id" text NOT NULL,
	"title" text NOT NULL,
	"year" integer,
	"release_date" date,
	"poster_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collection_expected_members" ADD CONSTRAINT "collection_expected_members_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "collection_expected_members_collection_tmdb_unique" ON "collection_expected_members" USING btree ("collection_id","tmdb_id");--> statement-breakpoint
CREATE INDEX "collection_expected_members_collection_release_index" ON "collection_expected_members" USING btree ("collection_id","release_date");