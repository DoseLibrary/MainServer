CREATE TYPE "public"."plugin_run_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "media_trailers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_item_id" uuid NOT NULL,
	"provider_source" text DEFAULT 'tmdb' NOT NULL,
	"provider_id" text NOT NULL,
	"site" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"official" boolean DEFAULT false NOT NULL,
	"language" text,
	"country" text,
	"published_at" timestamp with time zone,
	"preferred" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plugin_configurations" (
	"plugin_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"schedule" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_run_status" "plugin_run_status",
	"last_run_duration_ms" integer,
	"last_run_summary" text,
	"last_run_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plugin_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plugin_id" text NOT NULL,
	"status" "plugin_run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"summary" text,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "media_trailers" ADD CONSTRAINT "media_trailers_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_runs" ADD CONSTRAINT "plugin_runs_plugin_id_plugin_configurations_plugin_id_fk" FOREIGN KEY ("plugin_id") REFERENCES "public"."plugin_configurations"("plugin_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_trailers_item_provider_unique" ON "media_trailers" USING btree ("media_item_id","provider_source","provider_id");--> statement-breakpoint
CREATE INDEX "media_trailers_item_preferred_index" ON "media_trailers" USING btree ("media_item_id","preferred");--> statement-breakpoint
CREATE INDEX "plugin_runs_plugin_started_index" ON "plugin_runs" USING btree ("plugin_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_runs_one_active_per_plugin_unique" ON "plugin_runs" USING btree ("plugin_id") WHERE "plugin_runs"."status" = 'running';