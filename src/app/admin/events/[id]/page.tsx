import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getEvent } from '@/lib/data';
import { listVoices, type ElevenLabsVoice } from '@/lib/elevenlabs';
import { SettingsForm } from './settings-form';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/admin/events/[id]'>) {
  const { id } = await params;
  const event = await getEvent(id);
  return { title: event ? `Settings — ${event.name}` : 'Settings' };
}

export default async function EventSettingsPage({ params }: PageProps<'/admin/events/[id]'>) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();

  // A missing or rejected API key must not take the whole settings page down --
  // the wording is editable without it, and the page is where you would go to
  // work out what is wrong.
  let voices: ElevenLabsVoice[] = [];
  let voicesError: string | undefined;
  try {
    voices = await listVoices();
  } catch (error) {
    voicesError = error instanceof Error ? error.message : 'Could not load the voice list.';
  }

  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-bold">{event.name}</h1>
        <Link
          href={`/admin/events/${event.id}/students`}
          className="font-bold text-teal-900 underline underline-offset-4"
        >
          Back to recipients
        </Link>
      </div>

      <SettingsForm event={event} voices={voices} voicesError={voicesError} />
    </main>
  );
}
