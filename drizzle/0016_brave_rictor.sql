CREATE TABLE "user_collection_items" (
	"user_collection_id" uuid NOT NULL,
	"media_item_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"overview" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_collection_items" ADD CONSTRAINT "user_collection_items_user_collection_id_user_collections_id_fk" FOREIGN KEY ("user_collection_id") REFERENCES "public"."user_collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_collection_items" ADD CONSTRAINT "user_collection_items_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_collections" ADD CONSTRAINT "user_collections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_collection_items_collection_item_unique" ON "user_collection_items" USING btree ("user_collection_id","media_item_id");--> statement-breakpoint
CREATE INDEX "user_collection_items_collection_position_index" ON "user_collection_items" USING btree ("user_collection_id","position");--> statement-breakpoint
CREATE INDEX "user_collections_user_name_index" ON "user_collections" USING btree ("user_id","name");