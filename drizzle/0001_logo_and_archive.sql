ALTER TABLE "events" ALTER COLUMN "model_id" SET DEFAULT 'auto';--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "logo_position" text DEFAULT 'top-right' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "archived_at" timestamp with time zone;