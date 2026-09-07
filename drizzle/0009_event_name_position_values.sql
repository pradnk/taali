ALTER TABLE "events" ALTER COLUMN "event_name_position" SET DEFAULT 'left';--> statement-breakpoint
-- The two values were renamed when the centred option moved inside the header
-- band: "above-title" described where it used to land, not what it means now.
UPDATE "events" SET "event_name_position" = 'left' WHERE "event_name_position" = 'header';--> statement-breakpoint
UPDATE "events" SET "event_name_position" = 'centre' WHERE "event_name_position" = 'above-title';
