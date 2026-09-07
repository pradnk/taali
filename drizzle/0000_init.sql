CREATE TABLE "certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text NOT NULL,
	"event_id" uuid NOT NULL,
	"student_name" text NOT NULL,
	"name_pronunciation" text,
	"school" text,
	"city" text,
	"class_name" text,
	"project_title" text,
	"project_blurb" text,
	"award" text NOT NULL,
	"language" text DEFAULT 'en-IN' NOT NULL,
	"audio_url" text,
	"audio_duration_ms" integer,
	"pdf_url" text,
	"image_url" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"error_message" text,
	"reviewed" boolean DEFAULT false NOT NULL,
	"script_snapshot" jsonb,
	"sort_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"generated_at" timestamp with time zone,
	CONSTRAINT "certificates_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"org_name" text DEFAULT 'Vividha Trust' NOT NULL,
	"event_date" text,
	"venue" text,
	"templates" jsonb NOT NULL,
	"voice_id" text NOT NULL,
	"model_id" text DEFAULT 'eleven_v3' NOT NULL,
	"default_language" text DEFAULT 'en-IN' NOT NULL,
	"logo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tts_cache" (
	"hash" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"duration_ms" integer,
	"chars" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "certificates_event_idx" ON "certificates" USING btree ("event_id","sort_index");--> statement-breakpoint
CREATE INDEX "certificates_status_idx" ON "certificates" USING btree ("event_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "tts_cache_hash_idx" ON "tts_cache" USING btree ("hash");