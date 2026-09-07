import { config } from 'dotenv';

/**
 * Sets an event's partner logos to the three committed under public/partners.
 *
 * A one-off convenience, not part of the app: the logos are per event and
 * editable under Event settings, and a migration that named these particular
 * organisations would put them on the certificates of anyone else who deployed
 * Taali. This just saves uploading three files that are already in the repo.
 *
 *   npm run seed:partners                 -- every event that has none
 *   npm run seed:partners -- <event-id>   -- one event
 */

config({ path: ['.env.local', '.env'], quiet: true });

const { eq } = await import('drizzle-orm');
const { drizzle } = await import('drizzle-orm/neon-http');
const { neon } = await import('@neondatabase/serverless');
const { events } = await import('@/lib/db/schema');
const { normalisePartnerLogos } = await import('@/lib/partners');

const PARTNERS = normalisePartnerLogos([
  { url: '/partners/vividha-trust.png', name: 'Vividha Trust' },
  { url: '/partners/vision-empower.png', name: 'Vision Empower' },
  { url: '/partners/help-the-blind-foundation.png', name: 'Help the Blind Foundation' },
]);

const eventId = process.argv[2];

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Fill in .env.local first.');
}

const db = drizzle(neon(process.env.DATABASE_URL));

const rows = await db
  .select({ id: events.id, name: events.name, partnerLogos: events.partnerLogos })
  .from(events);

const targets = eventId
  ? rows.filter((row) => row.id === eventId)
  : rows.filter((row) => row.partnerLogos.length === 0);

if (targets.length === 0) {
  console.log(
    eventId
      ? `No event with id ${eventId}.`
      : 'Every event already has partner logos. Pass an event id to overwrite one.',
  );
} else {
  for (const target of targets) {
    await db
      .update(events)
      .set({ partnerLogos: PARTNERS, updatedAt: new Date() })
      .where(eq(events.id, target.id));
    console.log(`${target.name} (${target.id}) → ${PARTNERS.map((p) => p.name).join(', ')}`);
  }
}
