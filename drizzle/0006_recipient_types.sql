ALTER TABLE "certificates" ADD COLUMN "recipient_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "recipient_types" jsonb DEFAULT '[{"id":"recipient","label":"Recipient","awards":["First Prize","Second Prize","Third Prize","Special Mention","Certificate of Participation"]}]'::jsonb NOT NULL;--> statement-breakpoint
-- Carry each event's existing prize list into a first recipient type rather
-- than letting the column default overwrite it. Events set up before types
-- existed were all about students, so that is what the group is called.
UPDATE "events"
SET "recipient_types" = jsonb_build_array(
  jsonb_build_object('id', 'student', 'label', 'Student', 'awards', "awards")
)
WHERE jsonb_array_length(COALESCE("awards", '[]'::jsonb)) > 0;
