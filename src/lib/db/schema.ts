import {
  DEFAULT_CERTIFICATE_LAYOUT,
  DEFAULT_PARTNER_LABEL,
  DEFAULT_EVENT_NAME_POSITION,
  DEFAULT_PARTNER_LOGO_POSITION,
  type CertificateLayout,
  type EventNamePosition,
  type PartnerLogoPosition,
} from '@/lib/certificate-layout';
import type { LogoPosition } from '@/lib/logo';
import type { PartnerLogo } from '@/lib/partners';
import type { Signature } from '@/lib/signatures';
import { defaultRecipientTypes, type RecipientType } from '@/lib/recipient-types';
import type { TemplateSet } from '@/lib/wording';
import { DEFAULT_PRINT_WORDING, type PrintWording } from '@/lib/print-wording';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * One row per awards event, e.g. "Curious Minds 2026".
 *
 * The narration templates live here rather than in code so the Vividha team can
 * reword what the certificate says without a deploy.
 */
export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  /**
   * The presenting organisation. Always supplied when an event is created --
   * no default, because this is spoken aloud on every certificate and a
   * leftover placeholder would be heard by everyone in the room.
   */
  orgName: text('org_name').notNull(),
  eventDate: text('event_date'),
  venue: text('venue'),

  /**
   * Narration templates, keyed by language tag ("en-IN", "hi", "kn", ...).
   *
   * Per-language rather than a single set with a language code, because the
   * voice engine infers the spoken language from the text itself. A Hindi
   * certificate needs genuinely Hindi wording; there is no language flag that
   * makes English text come out as Hindi. See lib/script.ts for token syntax.
   */
  templates: jsonb('templates').$type<Record<string, TemplateSet>>().notNull(),

  /**
   * The prize categories this event hands out, in the order they are offered.
   *
   * Per event rather than global: a science fair and a sports day give out
   * different things, and the list is what the admin screens suggest and what
   * a pasted spreadsheet is spell-checked against. Certificates still store
   * free text, so a one-off award never needs a settings change first.
   */
  /**
   * The groups this event gives certificates to, each with its own prize
   * categories. See lib/recipient-types.ts. Replaced a single `awards` list
   * when teachers started being recognised alongside students.
   */
  recipientTypes: jsonb('recipient_types')
    .$type<RecipientType[]>()
    .notNull()
    .default(defaultRecipientTypes()),

  /**
   * Co-organisers and supporters, shown as a row of logos at the foot of the
   * certificate and never spoken. See lib/partners.ts.
   *
   * Empty by default rather than seeded: crediting an organisation that had
   * nothing to do with an award is worse than crediting nobody.
   */
  partnerLogos: jsonb('partner_logos').$type<PartnerLogo[]>().notNull().default([]),

  /**
   * Where the partner logos sit on the sheet, and what is written above them.
   * An empty label means no label at all, which is what a header row wants.
   */
  partnerLogoPosition: text('partner_logo_position')
    .$type<PartnerLogoPosition>()
    .notNull()
    .default(DEFAULT_PARTNER_LOGO_POSITION),
  partnerLabel: text('partner_label').notNull().default(DEFAULT_PARTNER_LABEL),

  /**
   * Which arrangement the printed certificate uses. See lib/certificate-layout.ts.
   *
   * Defaults to the original so that an event which has already handed out
   * certificates keeps printing the same ones.
   */
  /**
   * Scanned signatures, printed under the sign-off. See lib/signatures.ts.
   * Empty by default: an unsigned certificate is the normal case, and the
   * space they occupy is left clear for a pen when there are none.
   */
  signatures: jsonb('signatures').$type<Signature[]>().notNull().default([]),

  /** Where the event's name sits on the centred sheet. */
  eventNamePosition: text('event_name_position')
    .$type<EventNamePosition>()
    .notNull()
    .default(DEFAULT_EVENT_NAME_POSITION),

  certificateLayout: text('certificate_layout')
    .$type<CertificateLayout>()
    .notNull()
    .default(DEFAULT_CERTIFICATE_LAYOUT),

  /**
   * The words on the printed sheet, as opposed to `templates` above, which is
   * what gets spoken. See lib/print-wording.ts.
   */
  printWording: jsonb('print_wording').$type<PrintWording>().notNull().default(DEFAULT_PRINT_WORDING),

  voiceId: text('voice_id').notNull(),
  /** A specific model id, or "auto" to choose per language. See lib/languages.ts. */
  modelId: text('model_id').notNull().default('auto'),
  defaultLanguage: text('default_language').notNull().default('en-IN'),

  logoUrl: text('logo_url'),
  /** Which corner of the certificate the logo sits in. See lib/logo.ts. */
  logoPosition: text('logo_position').$type<LogoPosition>().notNull().default('top-right'),

  /**
   * When the event was marked complete, or null while it is still running.
   *
   * A timestamp rather than a boolean because "when did we finish Curious Minds
   * 2026" is a question worth being able to answer later. Archiving only closes
   * the admin side: certificate links stay public and playable forever, which
   * is the whole point of handing them to families.
   */
  archivedAt: timestamp('archived_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const certificateStatuses = ['draft', 'generating', 'ready', 'failed'] as const;
export type CertificateStatus = (typeof certificateStatuses)[number];

export const certificates = pgTable(
  'certificates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Unguessable public-facing id used in /c/[publicId]. */
    publicId: text('public_id').notNull().unique(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),

    studentName: text('student_name').notNull(),
    /**
     * Optional phonetic respelling, e.g. "RUH-vee KOO-mar". When present this
     * is what gets sent to the voice engine; `studentName` is still what is
     * displayed and printed.
     */
    namePronunciation: text('name_pronunciation'),
    school: text('school'),
    city: text('city'),
    className: text('class_name'),
    projectTitle: text('project_title'),
    projectBlurb: text('project_blurb'),
    award: text('award').notNull(),
    /**
     * Which of the event's recipient types this is, by id. Empty means the
     * first one, which is what every certificate created before types existed
     * is treated as.
     */
    recipientType: text('recipient_type').notNull().default(''),
    language: text('language').notNull().default('en-IN'),

    audioUrl: text('audio_url'),
    audioDurationMs: integer('audio_duration_ms'),
    pdfUrl: text('pdf_url'),
    imageUrl: text('image_url'),

    status: text('status').$type<CertificateStatus>().notNull().default('draft'),
    errorMessage: text('error_message'),
    /** Ticked by the operator after they have actually listened to the result. */
    reviewed: boolean('reviewed').notNull().default(false),

    /**
     * The exact spoken text, segment by segment. Kept so the on-page transcript
     * always matches the audio word for word, and so a certificate can be
     * regenerated identically years later even if the templates change.
     */
    scriptSnapshot: jsonb('script_snapshot').$type<ScriptSnapshot>(),

    sortIndex: integer('sort_index').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    generatedAt: timestamp('generated_at', { withTimezone: true }),
  },
  (table) => [
    index('certificates_event_idx').on(table.eventId, table.sortIndex),
    index('certificates_status_idx').on(table.eventId, table.status),
  ],
);

/**
 * Content-addressed cache of synthesised speech.
 *
 * Keyed on a hash of (text, voice, model, language, speed), so it serves three
 * purposes at once: the shared intro/closing lines are synthesised once per
 * event instead of once per student, name pronunciation previews are free after
 * the first play, and re-running a failed batch does not re-bill any segment
 * that already succeeded.
 */
export const ttsCache = pgTable(
  'tts_cache',
  {
    hash: text('hash').primaryKey(),
    url: text('url').notNull(),
    durationMs: integer('duration_ms'),
    /** Characters billed, so the admin can see credit usage per event. */
    chars: integer('chars').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('tts_cache_hash_idx').on(table.hash)],
);

/** The five pieces of wording that make up a certificate, in one language. */
export type { TemplateSet };

/** A single spoken clip within a certificate. */
export type ScriptSegment = {
  /** Which beat of the score this is. Matches SEGMENT_IDS in lib/audio/score.ts. */
  id: 'intro' | 'awardLine' | 'name' | 'citation' | 'prize' | 'closing';
  /** What the listener hears, and what the transcript shows. */
  text: string;
  /**
   * What is actually sent to the voice engine. Differs from `text` only for the
   * name segment when a pronunciation override is set.
   */
  spoken: string;
  /** Speaking rate multiplier; the name is slowed down deliberately. */
  speed: number;
  /** True for segments shared by every certificate in the event. */
  shared: boolean;
};

export type ScriptSnapshot = {
  language: string;
  voiceId: string;
  modelId: string;
  segments: ScriptSegment[];
};

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Certificate = typeof certificates.$inferSelect;
export type NewCertificate = typeof certificates.$inferInsert;
