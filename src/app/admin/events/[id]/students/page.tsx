import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PrintIcon, SettingsIcon } from '@/components/icons';
import { getEvent, listCertificates } from '@/lib/data';
import { siteUrl } from '@/lib/env';
import { StudentsClient } from './students-client';

export const dynamic = 'force-dynamic';

/**
 * Shared by every navigation option in an event's header, so they read as one
 * set of choices rather than a row of unrelated links. `min-h-11` keeps each
 * one at a 44px touch target.
 */
const OPTION_LINK =
  'inline-flex min-h-11 items-center gap-2 rounded-lg border-2 border-teal-800 ' +
  'px-4 font-bold text-teal-900 hover:bg-teal-50';

export async function generateMetadata({ params }: PageProps<'/admin/events/[id]/students'>) {
  const { id } = await params;
  const event = await getEvent(id);
  return { title: event ? `Recipients — ${event.name}` : 'Recipients' };
}

export default async function StudentsPage({ params }: PageProps<'/admin/events/[id]/students'>) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();

  const rows = await listCertificates(id);

  return (
    <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{event.name}</h1>
          <p className="text-ink-soft">{event.orgName}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={`/admin/events/${event.id}`} className={OPTION_LINK}>
            <SettingsIcon />
            Settings
          </Link>
          <Link href={`/admin/events/${event.id}/print`} className={OPTION_LINK}>
            <PrintIcon />
            Print all
          </Link>
        </div>
      </div>

      <StudentsClient event={event} initialRows={rows} siteUrl={siteUrl()} />
    </main>
  );
}
