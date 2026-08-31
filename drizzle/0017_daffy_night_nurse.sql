CREATE TABLE "playback_queue" (
	"user_id" uuid NOT NULL,
	"media_item_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "playback_queue" ADD CONSTRAINT "playback_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playback_queue" ADD CONSTRAINT "playback_queue_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "playback_queue_user_item_unique" ON "playback_queue" USING btree ("user_id","media_item_id");--> statement-breakpoint
CREATE INDEX "playback_queue_user_position_index" ON "playback_queue" USING btree ("user_id","position");