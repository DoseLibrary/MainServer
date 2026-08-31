CREATE TYPE "public"."device_auth_status" AS ENUM('pending', 'approved', 'denied');--> statement-breakpoint
CREATE TABLE "device_auth_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_code" text NOT NULL,
	"device_code_hash" text NOT NULL,
	"device_name" text NOT NULL,
	"status" "device_auth_status" DEFAULT 'pending' NOT NULL,
	"user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"last_polled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "device_name" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "created_via" text DEFAULT 'password' NOT NULL;--> statement-breakpoint
ALTER TABLE "device_auth_requests" ADD CONSTRAINT "device_auth_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "device_auth_requests_user_code_unique" ON "device_auth_requests" USING btree ("user_code");--> statement-breakpoint
CREATE UNIQUE INDEX "device_auth_requests_device_code_hash_unique" ON "device_auth_requests" USING btree ("device_code_hash");