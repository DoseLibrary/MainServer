CREATE TYPE "public"."download_status" AS ENUM('preparing', 'ready', 'claimed', 'failed');--> statement-breakpoint
CREATE TABLE "download_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"media_item_id" uuid NOT NULL,
	"profile" text NOT NULL,
	"status" "download_status" DEFAULT 'preparing' NOT NULL,
	"file_path" text,
	"size_bytes" bigint,
	"estimated_bytes" bigint DEFAULT 0 NOT NULL,
	"error" text,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "download_grants" ADD CONSTRAINT "download_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_grants" ADD CONSTRAINT "download_grants_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "download_grants_user_index" ON "download_grants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "download_grants_status_index" ON "download_grants" USING btree ("status");