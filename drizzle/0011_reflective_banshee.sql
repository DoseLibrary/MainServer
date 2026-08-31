ALTER TABLE "media_items" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_items_archived_at_index" ON "media_items" USING btree ("archived_at");
