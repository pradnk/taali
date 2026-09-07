import Link from 'next/link';
import type { Metadata } from 'next';

import { PeopleIcon, SettingsIcon } from '@/components/icons';
import { Card } from '@/components/ui';
import { listEvents } from '@/lib/data';
import type { Event } from '@/lib/db/schema';
import { CreateEventForm } from './create-event-form';

export const metadata: Metadata = { title: 'Events' };
export const dynamic = 'force-dynamic';

export default async function AdminHomePage() {
  const events = await listEvents();
  const active = events.filter((event) => !event.archivedAt);
  const completed = events.filter((event) => event.archivedAt);
  // The most recent event seeds the next one, so the same organisation does not
  // retype its name and wording every year.
  const previous = events.at(-1);

  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
      <h1 className="mb-8 text-3xl font-bold">Events</h1>

      {active.length > 0 && (
        <section aria-labelledby="active-heading" className="mb-10">
          <h2 id="active-heading" className="sr-only-focusable">
            Events in progress
          </h2>
          <ul className="flex flex-col gap-3">
            {active.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </ul>
        </section>
      )}

      {completed.length > 0 && (
        <section aria-labelledby="completed-heading" className="mb-10">
          <h2 id="completed-heading" className="mb-3 text-xl font-bold text-ink-soft">
            Completed
          </h2>
          <p className="mb-3 text-ink-soft">
            These are locked against changes. Their certificate links still work exactly as before.
          </p>
          <ul className="flex flex-col gap-3">
            {completed.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </ul>
        </section>
      )}

      <Card>
        <h2 className="mb-5 text-xl font-bold">Start a new event</h2>
        <CreateEventForm
          suggestedOrgName={previous?.orgName ?? ''}
          isFirstEvent={events.length === 0}
        />
      </Card>
    </main>
  );
}

function EventRow({ event }: { event: Event }) {
  const archived = Boolean(event.archivedAt);

  return (
    <li>
      <Card className={archived ? 'border-line bg-paper-sunk' : undefined}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            {event.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary Blob URL
              <img src={event.logoUrl} alt="" className="max-h-10 max-w-20 object-contain" />
            )}
            <div>
              <h3 className="text-xl font-bold">
                {event.name}
                {archived && (
                  <span className="ml-2 rounded bg-line px-2 py-0.5 align-middle text-sm font-bold text-ink-soft">
                    Complete
                  </span>
                )}
              </h3>
              <p className="text-ink-soft">{event.orgName}</p>
            </div>
          </div>

          <div className="flex gap-2">
            <Link
              href={`/admin/events/${event.id}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border-2 border-teal-800 px-4 font-bold text-teal-900 hover:bg-teal-50"
            >
              <SettingsIcon />
              Settings
            </Link>
            <Link
              href={`/admin/events/${event.id}/students`}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-teal-800 px-4 font-bold text-white hover:bg-teal-900"
            >
              <PeopleIcon />
              {archived ? 'View recipients' : 'Recipients'}
            </Link>
          </div>
        </div>
      </Card>
    </li>
  );
}
