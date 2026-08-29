CREATE TABLE "watchlist_entries" (
	"user_id" uuid NOT NULL,
	"media_item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "watchlist_entries" ADD CONSTRAINT "watchlist_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_entries" ADD CONSTRAINT "watchlist_entries_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_entries_user_media_unique" ON "watchlist_entries" USING btree ("user_id","media_item_id");--> statement-breakpoint
CREATE INDEX "watchlist_entries_user_recent_index" ON "watchlist_entries" USING btree ("user_id","created_at");