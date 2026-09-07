'use client';

import { useState } from 'react';

import { createEvent } from '@/app/admin/actions';
import { LogoPicker } from '@/components/logo-picker';
import { DEFAULT_CERTIFICATE_LAYOUT } from '@/lib/certificate-layout';
import { Button, Field, Input } from '@/components/ui';
import { DEFAULT_LOGO_POSITION, type LogoPosition } from '@/lib/logo';

export function CreateEventForm({
  /** Carried over from the previous event, if there is one. */
  suggestedOrgName,
  isFirstEvent,
}: {
  suggestedOrgName: string;
  isFirstEvent: boolean;
}) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoPosition, setLogoPosition] = useState<LogoPosition>(DEFAULT_LOGO_POSITION);

  return (
    <form action={createEvent} className="flex flex-col gap-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          id="event-name"
          label="Event name"
          hint="Spoken at the start of every certificate, so write it the way you would say it aloud."
        >
          {(props) => <Input {...props} name="name" required placeholder="Annual Awards 2026" />}
        </Field>

        <Field
          id="event-org"
          label="Organisation"
          hint="Who is presenting the awards. Also spoken on every certificate."
        >
          {(props) => (
            <Input
              {...props}
              name="orgName"
              required
              defaultValue={suggestedOrgName}
              placeholder="Your organisation's name"
            />
          )}
        </Field>
      </div>

      {!isFirstEvent && (
        <p className="text-ink-soft">
          The wording, voice and language from your last event will be carried over. You can change
          any of it in Settings afterwards.
        </p>
      )}

      <LogoPicker
        logoUrl={logoUrl}
        logoPosition={logoPosition}
        // A brand new event has no layout of its own yet, so the picker
        // describes the one it will start with.
        layout={DEFAULT_CERTIFICATE_LAYOUT}
        onChange={(next) => {
          setLogoUrl(next.logoUrl);
          setLogoPosition(next.logoPosition);
        }}
      />

      {/* The logo is already uploaded by this point; the form only carries the
          resulting URL so the new event can be created with it in place. */}
      <input type="hidden" name="logoUrl" value={logoUrl ?? ''} />
      <input type="hidden" name="logoPosition" value={logoPosition} />

      <Button type="submit" className="self-start">
        Create event
      </Button>
    </form>
  );
}
