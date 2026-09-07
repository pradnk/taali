'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { setEventArchived, updateEvent, type EventSettings } from '@/app/admin/actions';
import { LogoPicker } from '@/components/logo-picker';
import { NamedImagePicker } from '@/components/named-image-picker';
import { WordingTextarea } from '@/components/wording-textarea';
import { Alert, Button, Card, Field, Input, Select, Textarea } from '@/components/ui';
import {
  CERTIFICATE_LAYOUTS,
  EVENT_NAME_POSITIONS,
  PARTNER_LOGO_POSITIONS,
  normalisePartnerLabel,
} from '@/lib/certificate-layout';
import { DEFAULT_AWARDS, type AwardCategory } from '@/lib/awards';
import type { Event, TemplateSet } from '@/lib/db/schema';
import { MAX_PARTNER_LOGOS, normalisePartnerLogos } from '@/lib/partners';
import { MAX_SIGNATURES, normaliseSignatures } from '@/lib/signatures';
import { normalisePrintWording, type PrintWording } from '@/lib/print-wording';
import {
  SPOKEN_FIELDS,
  type SpokenField,
  type SpokenOverrides as SpokenOverrideMap,
  type WordingOverrides,
} from '@/lib/wording';
import {
  MAX_RECIPIENT_TYPES,
  newRecipientTypeId,
  normaliseRecipientTypes,
  type RecipientType,
} from '@/lib/recipient-types';
import type { ElevenLabsVoice } from '@/lib/elevenlabs';
import {
  DEFAULT_TEMPLATES,
  LANGUAGES_NEEDING_REVIEW,
  MODEL_AUTO,
  MODEL_MULTILINGUAL_V2,
  MODEL_V3,
  SUPPORTED_LANGUAGES,
  languageLabel,
  pickModelFor,
  resolveModel,
} from '@/lib/languages';

const EMPTY_TEMPLATE: TemplateSet = {
  intro: '',
  awardLine: '',
  citation: '',
  prize: '',
  closing: '',
};

const TEMPLATE_FIELDS: Array<{
  key: keyof TemplateSet;
  label: string;
  hint: string;
  rows: number;
}> = [
  {
    key: 'intro',
    label: 'Opening line',
    hint: 'Spoken first, after the chime. The same for every student, so it is only recorded once.',
    rows: 2,
  },
  {
    key: 'awardLine',
    label: 'Lead-in to the name',
    hint: 'Deliberately has no full stop — it should lead into the name, not land.',
    rows: 1,
  },
  {
    key: 'citation',
    label: 'What they did',
    hint: 'Spoken after the name. Anything inside [[double brackets]] disappears if its details are missing.',
    rows: 2,
  },
  { key: 'prize', label: 'The prize', hint: 'Spoken after the drum roll.', rows: 1 },
  {
    key: 'closing',
    label: 'Closing line',
    hint: 'Spoken over the applause. Also the same for every student.',
    rows: 2,
  },
];

/**
 * The printed sheet's wording, in the order it appears on the page.
 *
 * `only` marks a field the classic layout has no slot for, so the form can say
 * so rather than letting somebody write a recognition paragraph that never
 * appears anywhere.
 */
const WORDING_FIELDS: Array<{
  key: keyof PrintWording;
  label: string;
  hint: string;
  rows: number;
  centredOnly?: boolean;
}> = [
  {
    key: 'title',
    label: 'Title across the top',
    hint: 'Printed in capitals. Leave it empty for no title at all.',
    rows: 1,
    centredOnly: true,
  },
  {
    key: 'lead',
    label: 'Line above the name',
    hint: 'The one line both layouts print.',
    rows: 1,
  },
  {
    key: 'fromLine',
    label: 'Where they are from',
    hint: 'Anything in [[double brackets]] disappears when its details are missing, so a recipient with no school recorded gets no line at all rather than a bare “from”.',
    rows: 1,
    centredOnly: true,
  },
  {
    key: 'recognition',
    label: 'What the certificate is for',
    hint: 'The paragraph under the name. Used by any group that has not been given its own line under Who is being recognised.',
    rows: 3,
    centredOnly: true,
  },
  {
    key: 'closing',
    label: 'Parting line (optional)',
    hint: 'Something to send them off with. Leave it empty to print nothing.',
    rows: 2,
    centredOnly: true,
  },
  {
    key: 'signature',
    label: 'Signed off at the foot',
    hint: 'Bottom left of the sheet, e.g. “For Vividha Trust”.',
    rows: 1,
    centredOnly: true,
  },
];

/**
 * Speaks a sample line in the selected voice.
 *
 * Worth the space it takes: a voice can be listed on the account and still be
 * refused at synthesis time -- Voice Library voices need a paid ElevenLabs
 * plan, for instance -- and without this the first anyone learns of it is a row
 * of failed certificates. One click here settles both whether the voice works
 * and whether it says an Indian name properly.
 */
function VoiceTest({ voiceId, modelId }: { voiceId: string; modelId: string }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const SAMPLE = 'This certificate is awarded to Ravi Kumar. First Prize.';

  const play = async () => {
    setBusy(true);
    setProblem('');
    try {
      const response = await fetch('/api/admin/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voiceId,
          modelId,
          segments: [{ id: 'name', spoken: SAMPLE, speed: 1 }],
        }),
      });
      const body = (await response.json()) as { clips?: Array<{ url: string }>; error?: string };
      if (!response.ok || !body.clips?.[0]) {
        throw new Error(body.error ?? `The voice service returned ${response.status}.`);
      }
      const audio = new Audio(body.clips[0].url);
      audio.addEventListener('ended', () => setBusy(false), { once: true });
      await audio.play();
    } catch (caught) {
      setProblem(caught instanceof Error ? caught.message : 'Could not play the sample.');
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={play} disabled={busy}>
          {busy ? '♪ Playing…' : '♪ Test this voice'}
        </Button>
        <span className="text-ink-soft">“{SAMPLE}”</span>
      </div>
      {problem && <Alert>{problem}</Alert>}
    </div>
  );
}

const TOKENS = [
  '{{role}}',
  '{{Role}}',
  '{{event}}',
  '{{org}}',
  '{{name}}',
  '{{location}}',
  '{{school}}',
  '{{city}}',
  '{{class}}',
  '{{projectTitle}}',
  '{{blurb}}',
  '{{award}}',
];

export function SettingsForm({
  event,
  voices,
  voicesError,
}: {
  event: Event;
  voices: ElevenLabsVoice[];
  voicesError?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const [settings, setSettings] = useState<EventSettings>({
    name: event.name,
    orgName: event.orgName,
    eventDate: event.eventDate,
    venue: event.venue,
    voiceId: event.voiceId,
    modelId: event.modelId,
    defaultLanguage: event.defaultLanguage,
    logoUrl: event.logoUrl,
    logoPosition: event.logoPosition,
    templates: event.templates,
    // The stored list as it is, not `recipientTypesFor` -- an event whose types
    // have been cleared should look cleared here, even though the add screens
    // fall back to a default rather than offering nothing.
    recipientTypes: event.recipientTypes,
    partnerLogos: event.partnerLogos,
    partnerLogoPosition: event.partnerLogoPosition,
    partnerLabel: event.partnerLabel,
    certificateLayout: event.certificateLayout,
    eventNamePosition: event.eventNamePosition,
    signatures: event.signatures,
    printWording: event.printWording,
  });

  const archived = Boolean(event.archivedAt);

  const [activeLanguage, setActiveLanguage] = useState(event.defaultLanguage);
  const activeTemplates = settings.templates[activeLanguage] ?? EMPTY_TEMPLATE;

  const update = <K extends keyof EventSettings>(key: K, value: EventSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const updateTemplate = (field: keyof TemplateSet, value: string) => {
    setSettings((current) => ({
      ...current,
      templates: {
        ...current.templates,
        [activeLanguage]: { ...(current.templates[activeLanguage] ?? EMPTY_TEMPLATE), [field]: value },
      },
    }));
    setSaved(false);
  };

  const updateWording = (field: keyof PrintWording, value: string) => {
    setSettings((current) => ({
      ...current,
      printWording: { ...current.printWording, [field]: value },
    }));
    setSaved(false);
  };

  const save = () => {
    setError('');

    // Clean the categories here as well as on the server, and keep the result,
    // so the form ends up showing the list that was actually stored. Without
    // this the blank and duplicate rows the server drops stay on screen after
    // "Saved.", which reads as the save not having taken.
    const cleaned: EventSettings = {
      ...settings,
      recipientTypes: normaliseRecipientTypes(settings.recipientTypes),
      partnerLogos: normalisePartnerLogos(settings.partnerLogos),
      signatures: normaliseSignatures(settings.signatures),
      partnerLabel: normalisePartnerLabel(settings.partnerLabel),
      printWording: normalisePrintWording(settings.printWording),
    };
    setSettings(cleaned);

    startTransition(async () => {
      try {
        await updateEvent(event.id, cleaned);
        setSaved(true);
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not save.');
      }
    });
  };

  const hasWording = Boolean(settings.templates[activeLanguage]?.intro?.trim());
  const needsReview = LANGUAGES_NEEDING_REVIEW.includes(activeLanguage);
  const hasIndianVoice = voices.some((voice) =>
    (voice.labels?.accent ?? '').toLowerCase().includes('indian'),
  );
  const selectedVoice = voices.find((voice) => voice.voice_id === settings.voiceId);

  return (
    <div className="flex flex-col gap-8">
      {error && <Alert>{error}</Alert>}

      {archived && (
        <p className="rounded-lg border-2 border-line bg-paper-sunk px-5 py-4 text-lg">
          <strong>This event is marked complete.</strong> Its settings and students are locked
          against changes. The certificate links still work and always will — reopen the event below
          if you need to change something.
        </p>
      )}

      {/* One disabled fieldset rather than a `disabled` prop on twenty
          controls: it is the native way to switch off a whole form section,
          browsers apply it to every descendant, and screen readers announce
          the controls as unavailable without any extra ARIA. */}
      <fieldset disabled={archived} className="contents">

      <Card>
        <h2 className="mb-5 text-xl font-bold">About the event</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="name"
            label="Event name"
            hint="Spoken at the start of every certificate."
          >
            {(props) => (
              <Input {...props} value={settings.name} onChange={(e) => update('name', e.target.value)} />
            )}
          </Field>

          <Field id="orgName" label="Organisation">
            {(props) => (
              <Input
                {...props}
                value={settings.orgName}
                onChange={(e) => update('orgName', e.target.value)}
              />
            )}
          </Field>

          <Field id="eventDate" label="Date (optional)" hint="Shown on the certificate page.">
            {(props) => (
              <Input
                {...props}
                value={settings.eventDate ?? ''}
                onChange={(e) => update('eventDate', e.target.value)}
                placeholder="23–24 November 2026"
              />
            )}
          </Field>

          <Field id="venue" label="Venue (optional)">
            {(props) => (
              <Input
                {...props}
                value={settings.venue ?? ''}
                onChange={(e) => update('venue', e.target.value)}
              />
            )}
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 text-xl font-bold">Your organisation&apos;s logo</h2>
        <p className="mb-5 text-ink-soft">
          The mark of whoever is presenting the award — {settings.orgName || 'your organisation'}.
          Anyone helping to run the event goes under <strong>Other organisations</strong> below
          instead, where they get a row of their own.
        </p>
        <LogoPicker
          logoUrl={settings.logoUrl}
          logoPosition={settings.logoPosition}
          layout={settings.certificateLayout}
          disabled={archived}
          onChange={(next) => {
            setSettings((current) => ({ ...current, ...next }));
            setSaved(false);
          }}
        />
      </Card>

      <Card>
        <h2 className="mb-2 text-xl font-bold">The printed certificate</h2>
        <p className="mb-5 text-ink-soft">
          How the sheet is arranged, and the words on it. None of this is spoken — the recording is
          set under <strong>What the certificate says</strong> further down, and changing anything
          here never means remaking audio.
        </p>

        <div className="mb-6 flex flex-col gap-3">
          {CERTIFICATE_LAYOUTS.map((layout) => (
            <label
              key={layout.value}
              className="flex cursor-pointer items-start gap-3 rounded-lg border-2 border-line p-4 has-checked:border-teal-800 has-checked:bg-teal-50"
            >
              <input
                type="radio"
                name="certificateLayout"
                className="mt-1 size-5"
                value={layout.value}
                checked={settings.certificateLayout === layout.value}
                onChange={() => update('certificateLayout', layout.value)}
              />
              <span>
                <span className="block font-bold">{layout.label}</span>
                <span className="block text-ink-soft">{layout.hint}</span>
              </span>
            </label>
          ))}
        </div>

        {settings.certificateLayout === 'centred' && (
          <div className="mb-6">
            <Field
              id="eventNamePosition"
              label="Where the event's name goes"
              hint="Beside the logo the header reads as a masthead along one edge; centred, it sits on the sheet's middle line with the logos flanking it. Either way it stays inside the header band."
            >
              {(props) => (
                <Select
                  {...props}
                  value={settings.eventNamePosition}
                  onChange={(e) =>
                    update('eventNamePosition', e.target.value as typeof settings.eventNamePosition)
                  }
                >
                  {EVENT_NAME_POSITIONS.map((position) => (
                    <option key={position.value} value={position.value}>
                      {position.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        )}

        <div className="flex flex-col gap-5">
          {WORDING_FIELDS.map((field) => {
            const unused = field.centredOnly && settings.certificateLayout !== 'centred';
            return (
              <Field
                key={field.key}
                id={`wording-${field.key}`}
                label={field.label}
                hint={unused ? `${field.hint} Not printed by the classic layout.` : field.hint}
              >
                {(props) => (
                  <WordingTextarea
                    {...props}
                    rows={field.rows}
                    value={settings.printWording[field.key]}
                    onChange={(next) => updateWording(field.key, next)}
                    className={unused ? 'opacity-60' : undefined}
                    dir="auto"
                  />
                )}
              </Field>
            );
          })}
        </div>

        <details className="mt-5">
          <summary className="min-h-11 cursor-pointer font-bold text-teal-900">
            Placeholders you can use
          </summary>
          <ul className="mt-3 flex flex-wrap gap-2">
            {TOKENS.map((token) => (
              <li key={token} className="rounded bg-paper-sunk px-2 py-1 font-mono text-sm">
                {token}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-ink-soft">
            <code className="font-mono">{'{{role}}'}</code> is the group&apos;s own name in lower
            case — “student”, “teacher” — and{' '}
            <code className="font-mono">{'{{Role}}'}</code> is it capitalised, for the start of a
            sentence.
          </p>
          <p className="mt-3 text-ink-soft">
            <code className="font-mono">{'{{location}}'}</code> is the school and the city together,
            so one line covers a recipient with both, with only one, or with neither.
          </p>
        </details>
      </Card>

      <Card>
        <h2 className="mb-2 text-xl font-bold">Signatures</h2>
        <p className="mb-5 text-ink-soft">
          Scanned signatures, printed under the sign-off at the bottom left. Two is the usual pair;
          three is the most that fits. Leave it empty and that space stays clear to sign by hand,
          which is what it is there for.
        </p>
        {settings.certificateLayout !== 'centred' && (
          <p className="mb-5 rounded-lg border-2 border-focus bg-teal-50 px-4 py-3">
            <strong>The classic layout has no sign-off to put these under.</strong> They will be
            saved, and will appear if you switch to the centred layout.
          </p>
        )}
        <NamedImagePicker
          items={settings.signatures}
          max={MAX_SIGNATURES}
          idPrefix="signature"
          labels={{
            thing: 'signature',
            nameLabel: 'Who signed',
            nameHint:
              'Never printed. It is what a screen reader reads out in place of the signature, so write it as you would say it — “Meera Nair, Trustee”.',
            namePlaceholder: 'Meera Nair, Trustee',
            fileHint:
              'PNG, JPEG, WebP or SVG, under 2 MB. A scan on a white background, cropped close to the ink, sits best.',
          }}
          disabled={archived}
          onChange={(next) => update('signatures', next)}
        />
      </Card>

      <Card>
        <h2 className="mb-2 text-xl font-bold">Other organisations</h2>
        <p className="mb-5 text-ink-soft">
          Anyone running the event alongside you, or supporting it. Their logos appear in a row at
          the foot of the printed certificate and on the certificate page. They are never spoken —
          the recording stays about the person receiving the award.
        </p>
        <NamedImagePicker
          items={settings.partnerLogos}
          max={MAX_PARTNER_LOGOS}
          idPrefix="partner-logo"
          labels={{
            thing: 'logo',
            nameLabel: 'Organisation',
            nameHint: 'Never printed. It is what a screen reader reads out in place of the logo.',
            namePlaceholder: 'Vision Empower',
            fileHint:
              'PNG, JPEG, WebP or SVG, under 2 MB. A version with a transparent or white background works best — the certificate is white.',
          }}
          disabled={archived}
          onChange={(next) => update('partnerLogos', next)}
        />

        {settings.partnerLogos.length > 0 && (
          <div className="mt-6 grid gap-5 border-t-2 border-line pt-6 sm:grid-cols-2">
            <Field
              id="partnerLogoPosition"
              label="Where they sit"
              hint="On the printed certificate. On the certificate page they always follow the closing line."
            >
              {(props) => (
                <Select
                  {...props}
                  value={settings.partnerLogoPosition}
                  onChange={(e) =>
                    update(
                      'partnerLogoPosition',
                      e.target.value as typeof settings.partnerLogoPosition,
                    )
                  }
                >
                  {PARTNER_LOGO_POSITIONS.map((position) => (
                    <option key={position.value} value={position.value}>
                      {position.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field
              id="partnerLabel"
              label="Words above them (optional)"
              hint="Leave it empty for logos and nothing else. Never used when they sit at the top, where a caption would read as a stray heading."
            >
              {(props) => (
                <Input
                  {...props}
                  value={settings.partnerLabel}
                  onChange={(e) => update('partnerLabel', e.target.value)}
                  autoComplete="off"
                  placeholder="Presented by"
                />
              )}
            </Field>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-5 text-xl font-bold">Voice</h2>

        {voices.length > 0 && !selectedVoice && (
          <Alert>
            The voice this event was set up with is no longer on the ElevenLabs account. Pick
            another below and save, or every certificate will fail.
          </Alert>
        )}

        {selectedVoice?.category === 'professional' && (
          <p className="mb-4 rounded-lg border-2 border-focus bg-teal-50 px-4 py-3">
            <strong>{selectedVoice.name} came from the Voice Library.</strong> Those need a paid
            ElevenLabs plan to use over the API — on a free plan every certificate will fail. Press{' '}
            <strong>Test this voice</strong> below to check before running a batch.
          </p>
        )}

        {voices.length > 0 && !hasIndianVoice && (
          <p className="mb-4 rounded-lg border-2 border-focus bg-teal-50 px-4 py-3">
            <strong>No Indian-accented voice is available on this account.</strong> The voices here
            are American, British and Australian, which will read Indian names with the wrong
            stress. Add one free from the{' '}
            <a
              href="https://elevenlabs.io/app/voice-library?accent=indian"
              className="font-bold text-teal-900 underline underline-offset-4"
              target="_blank"
              rel="noreferrer"
            >
              ElevenLabs Voice Library
            </a>{' '}
            — search for an Indian English voice, click Add, then reload this page.
          </p>
        )}

        {voicesError && (
          <p className="mb-4 rounded-lg border-2 border-danger bg-danger-bg px-4 py-3 text-danger">
            {voicesError} You can still paste a voice ID below.
          </p>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="voiceId"
            label="Reading voice"
            hint="Pick one that reads Indian names naturally. Try a name on the students page before doing a whole batch."
          >
            {(props) =>
              voices.length > 0 ? (
                <Select
                  {...props}
                  value={settings.voiceId}
                  onChange={(e) => update('voiceId', e.target.value)}
                >
                  {voices.every((voice) => voice.voice_id !== settings.voiceId) && (
                    <option value={settings.voiceId}>Current voice ({settings.voiceId})</option>
                  )}
                  {voices.map((voice) => (
                    <option key={voice.voice_id} value={voice.voice_id}>
                      {voice.name}
                      {voice.labels?.accent ? ` — ${voice.labels.accent}` : ''}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  {...props}
                  value={settings.voiceId}
                  onChange={(e) => update('voiceId', e.target.value)}
                />
              )
            }
          </Field>

          <Field
            id="defaultLanguage"
            label="Default language"
            hint="Used for new students. Each student can be changed individually."
          >
            {(props) => (
              <Select
                {...props}
                value={settings.defaultLanguage}
                onChange={(e) => update('defaultLanguage', e.target.value)}
              >
                {SUPPORTED_LANGUAGES.map((language) => (
                  <option key={language.tag} value={language.tag}>
                    {languageLabel(language.tag)}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            id="modelId"
            label="Voice engine"
            hint="Choose automatically unless you have a reason not to. It picks the engine that can both speak the language and slow the student's name down."
          >
            {(props) => (
              <Select
                {...props}
                value={settings.modelId}
                onChange={(e) => update('modelId', e.target.value)}
              >
                <option value={MODEL_AUTO}>Choose automatically (recommended)</option>
                <option value={MODEL_MULTILINGUAL_V2}>
                  Multilingual v2 — English, Hindi, Tamil only
                </option>
                <option value={MODEL_V3}>v3 — every language, cannot slow the name down</option>
              </Select>
            )}
          </Field>
        </div>

        {settings.modelId === MODEL_AUTO && (
          <p className="mt-4 text-ink-soft">
            For {languageLabel(settings.defaultLanguage)} this will use{' '}
            <strong>{pickModelFor(settings.defaultLanguage)}</strong>.
          </p>
        )}

        <VoiceTest
          voiceId={settings.voiceId}
          modelId={resolveModel(settings.modelId, settings.defaultLanguage)}
        />
      </Card>

      <Card>
        <h2 className="mb-2 text-xl font-bold">Who is being recognised</h2>
        <p className="mb-5 text-ink-soft">
          Most events honour more than one group — the students who took part, and the teachers who
          got them there. Each group has its own prizes, offered when you add someone of that kind
          and used to check a pasted spreadsheet, so “first prize” is corrected to the spelling you
          set here before it is printed and spoken.
        </p>
        <p className="mb-5 text-ink-soft">
          Each group can also say what it is being recognised <em>for</em>, since a teacher who
          guided students is not being thanked for the same thing they are. Leave that box empty and
          the group uses the shared line. The rest of the wording is common to everybody — put{' '}
          <code className="font-mono">{'{{role}}'}</code> in it where the group&apos;s own name
          belongs.
        </p>
        <RecipientTypes
          types={settings.recipientTypes}
          disabled={archived}
          onChange={(next) => update('recipientTypes', next)}
        />
      </Card>

      <Card>
        <h2 className="mb-2 text-xl font-bold">What the certificate says</h2>
        <p className="mb-5 text-ink-soft">
          Each language needs its own wording — the voice engine works out which language to speak
          from the words themselves, so there is no setting that turns English into Hindi.
        </p>

        <div role="group" aria-label="Language to edit" className="mb-5 flex flex-wrap gap-2">
          {SUPPORTED_LANGUAGES.map((language) => {
            const filled = Boolean(settings.templates[language.tag]?.intro?.trim());
            return (
              <Button
                key={language.tag}
                variant={activeLanguage === language.tag ? 'primary' : 'secondary'}
                aria-pressed={activeLanguage === language.tag}
                className="min-h-11 px-3 text-sm"
                onClick={() => setActiveLanguage(language.tag)}
              >
                {language.englishName}
                {filled ? ' ✓' : ''}
              </Button>
            );
          })}
        </div>

        {!hasWording && (
          <div className="mb-5 rounded-lg border-2 border-line bg-paper-sunk p-4">
            <p className="mb-3 font-bold">
              No wording yet for {languageLabel(activeLanguage)}.
            </p>
            <p className="mb-3 text-ink-soft">
              Certificates cannot be made in this language until someone who speaks it writes the
              lines below. Machine translation is not offered on purpose: wording that reads
              awkwardly at an awards ceremony is worse than wording a person wrote.
            </p>
            {DEFAULT_TEMPLATES[activeLanguage] && (
              <Button
                variant="secondary"
                onClick={() => {
                  setSettings((current) => ({
                    ...current,
                    templates: {
                      ...current.templates,
                      [activeLanguage]: { ...DEFAULT_TEMPLATES[activeLanguage] },
                    },
                  }));
                  setSaved(false);
                }}
              >
                Start from the built-in wording
              </Button>
            )}
          </div>
        )}

        {hasWording && needsReview && (
          <p className="mb-5 rounded-lg border-2 border-focus bg-teal-50 px-4 py-3">
            <strong>Please have a fluent speaker read this over.</strong> The built-in{' '}
            {languageLabel(activeLanguage)} wording is a starting draft, not a checked translation.
          </p>
        )}

        <div className="flex flex-col gap-5">
          {TEMPLATE_FIELDS.map((field) => (
            <Field
              key={field.key}
              id={`template-${field.key}`}
              label={field.label}
              hint={field.hint}
            >
              {(props) => (
                <Textarea
                  {...props}
                  rows={field.rows}
                  value={activeTemplates[field.key]}
                  onChange={(e) => updateTemplate(field.key, e.target.value)}
                  dir="auto"
                />
              )}
            </Field>
          ))}
        </div>

        <SpokenOverrides
          types={settings.recipientTypes}
          language={activeLanguage}
          shared={activeTemplates}
          onChange={(next) => update('recipientTypes', next)}
        />

        <details className="mt-5">
          <summary className="min-h-11 cursor-pointer font-bold text-teal-900">
            Placeholders you can use
          </summary>
          <ul className="mt-3 flex flex-wrap gap-2">
            {TOKENS.map((token) => (
              <li key={token} className="rounded bg-paper-sunk px-2 py-1 font-mono text-sm">
                {token}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-ink-soft">
            <code className="font-mono">{'[[from {{school}}]]'}</code> — text in double brackets is
            dropped entirely when the details inside it are blank, so one line covers a student with
            a school and one without.
          </p>
        </details>
      </Card>

      <div className="flex items-center gap-4">
        <Button onClick={save} disabled={pending || archived}>
          {pending ? 'Saving…' : 'Save settings'}
        </Button>
        <span aria-live="polite" className="font-bold text-success">
          {saved && 'Saved.'}
        </span>
      </div>

      </fieldset>

      <ArchiveControl event={event} onError={setError} />
    </div>
  );
}

/**
 * Edits the list of prizes an event hands out.
 *
 * One input per category with its own Remove button, rather than a textarea of
 * one-per-line: the people who run these ceremonies are not editing a config
 * file, and a stray blank line in a textarea silently becomes a nameless prize.
 * Blank rows here are simply dropped when the list is saved.
 */
/**
 * Edits the groups an event honours and the prizes each of them gets.
 *
 * A group is a label plus a prize list, so this is mostly a wrapper around the
 * prize editor that already existed -- an event with one group looks and works
 * exactly as it did before types were a thing, which is the point.
 */
/**
 * Different spoken words for a group, or for one of its prizes.
 *
 * Sits inside the wording card so that the language tabs above drive it: an
 * override belongs to one language, because the voice engine decides what
 * language to speak from the words themselves and a stray English sentence in
 * a Hindi recording is not a translation slip but a change of language
 * mid-certificate.
 *
 * Every level is optional and every beat within it is optional too, so a group
 * that only wants a different citation writes that one line and inherits the
 * other four.
 */
function SpokenOverrides({
  types,
  language,
  shared,
  onChange,
}: {
  types: RecipientType[];
  language: string;
  shared: TemplateSet;
  onChange: (next: RecipientType[]) => void;
}) {
  if (types.length === 0) return null;

  const patchType = (typeIndex: number, changes: Partial<RecipientType>) =>
    onChange(types.map((type, i) => (i === typeIndex ? { ...type, ...changes } : type)));

  const setSpoken = (
    current: WordingOverrides,
    field: SpokenField,
    text: string,
  ): SpokenOverrideMap => ({
    ...current.spoken,
    [language]: { ...current.spoken?.[language], [field]: text },
  });

  // Each group, then each of its prizes: the levels a certificate resolves
  // through, listed in the order it tries them.
  const levels = types.flatMap((type, typeIndex) => [
    {
      key: `type-${type.id}`,
      title: `${type.label || 'Unnamed group'} — every prize`,
      inherits: "the event's wording above",
      value: type as WordingOverrides,
      apply: (field: SpokenField, text: string) =>
        patchType(typeIndex, { spoken: setSpoken(type, field, text) }),
    },
    ...type.awards.map((award, awardIndex) => ({
      key: `award-${type.id}-${awardIndex}`,
      title: `${type.label || 'Unnamed group'} · ${award.name || 'Unnamed prize'}`,
      inherits: `${type.label || 'the group'}'s wording, then the event's`,
      value: award as WordingOverrides,
      apply: (field: SpokenField, text: string) =>
        patchType(typeIndex, {
          awards: type.awards.map((entry, i) =>
            i === awardIndex ? { ...entry, spoken: setSpoken(entry, field, text) } : entry,
          ),
        }),
    })),
  ]);

  return (
    <div className="mt-6 border-t-2 border-line pt-6">
      <h3 className="mb-2 text-lg font-bold">Different words for some groups or prizes</h3>
      <p className="mb-4 text-ink-soft">
        Anything left empty is spoken exactly as written above. These are the{' '}
        <strong>{languageLabel(language)}</strong> words — a certificate in another language uses
        that language&apos;s wording, so fill these in for each language you actually use.
      </p>

      <div className="flex flex-col gap-3">
        {levels.map((level) => {
          const set = level.value.spoken?.[language] ?? {};
          const filled = SPOKEN_FIELDS.filter((field) => set[field]?.trim()).length;
          return (
            <details key={level.key} className="rounded-lg border-2 border-line p-4" open={filled > 0}>
              <summary className="min-h-11 cursor-pointer font-bold text-teal-900">
                {level.title}
                {filled > 0 ? ` — ${filled} line${filled === 1 ? '' : 's'} of its own` : ''}
              </summary>
              <div className="mt-4 flex flex-col gap-4">
                {TEMPLATE_FIELDS.map((field) => (
                  <Field
                    key={field.key}
                    id={`spoken-${level.key}-${field.key}-${language}`}
                    label={field.label}
                    hint={`Leave empty to use ${level.inherits}.`}
                  >
                    {(props) => (
                      <Textarea
                        {...props}
                        rows={field.rows}
                        value={set[field.key] ?? ''}
                        onChange={(e) => level.apply(field.key, e.target.value)}
                        placeholder={shared[field.key]}
                        dir="auto"
                      />
                    )}
                  </Field>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The two printed lines a prize category or a group may say for itself.
 *
 * The other four -- the title, the lead-in, the "from" line and the sign-off --
 * read the same whoever the certificate is for, so they stay on the event and
 * are not repeated here.
 */
function PrintedOverrideFields({
  idPrefix,
  subject,
  inheritsFrom,
  value,
  onChange,
}: {
  idPrefix: string;
  subject: string;
  inheritsFrom: string;
  value: { recognition?: string; closing?: string };
  onChange: (changes: { recognition?: string; closing?: string }) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Field
        id={`${idPrefix}-recognition`}
        label={`What ${subject} is recognised for`}
        hint={`Printed under the prize. Leave it empty and ${inheritsFrom} is used.`}
      >
        {(props) => (
          <WordingTextarea
            {...props}
            rows={3}
            value={value.recognition ?? ''}
            onChange={(next) => onChange({ recognition: next })}
            dir="auto"
          />
        )}
      </Field>
      <Field
        id={`${idPrefix}-closing`}
        label="Parting line"
        hint={`The last line on the sheet. Leave it empty and ${inheritsFrom} is used — worth setting when the shared one is addressed to somebody else, as “keep experimenting” is to a teacher.`}
      >
        {(props) => (
          <WordingTextarea
            {...props}
            rows={2}
            value={value.closing ?? ''}
            onChange={(next) => onChange({ closing: next })}
            dir="auto"
          />
        )}
      </Field>
    </div>
  );
}

function RecipientTypes({
  types,
  disabled,
  onChange,
}: {
  types: RecipientType[];
  disabled: boolean;
  onChange: (next: RecipientType[]) => void;
}) {
  const patch = (index: number, changes: Partial<RecipientType>) =>
    onChange(types.map((type, position) => (position === index ? { ...type, ...changes } : type)));

  const remove = (index: number) => onChange(types.filter((_, position) => position !== index));

  const add = () => {
    const label = '';
    // The id is fixed now and never rewritten afterwards, so that renaming the
    // group later does not orphan the certificates already filed under it.
    onChange([...types, { id: newRecipientTypeId(`type-${types.length + 1}`, types), label, awards: [] }]);
  };

  return (
    <div className="flex flex-col gap-6">
      {types.map((type, index) => (
        <div key={type.id} className="rounded-lg border-2 border-line p-5">
          <div className="mb-5 flex flex-wrap items-end gap-4">
            <div className="min-w-56 flex-1">
              <Field
                id={`recipient-type-${type.id}`}
                label="This group is called"
                hint="Singular, as it would read mid-sentence — “student”, “teacher”, “volunteer”."
                error={type.label.trim() ? undefined : 'Needed — a group with no name is dropped when you save.'}
              >
                {(props) => (
                  <Input
                    {...props}
                    value={type.label}
                    onChange={(e) => patch(index, { label: e.target.value })}
                    autoComplete="off"
                    placeholder="Student"
                  />
                )}
              </Field>
            </div>
            {types.length > 1 && (
              <Button
                variant="danger"
                onClick={() => remove(index)}
                disabled={disabled}
                aria-label={`Remove the ${type.label.trim() || `group ${index + 1}`} group`}
              >
                Remove group
              </Button>
            )}
          </div>

          <p className="mb-3 font-bold">
            Prizes for {type.label.trim() ? `each ${type.label.trim().toLowerCase()}` : 'this group'}
          </p>
          <AwardCategories
            awards={type.awards}
            idPrefix={`award-${type.id}`}
            disabled={disabled}
            onChange={(next) => patch(index, { awards: next })}
          />

          <div className="mt-5">
            <div className="mb-4">
              <Field
                id={`recipient-${type.id}-title`}
                label="Heading on the certificate"
                hint="Printed across the top, e.g. “Student Certificate”. The same for every prize in this group. Leave it empty to use the event's heading."
              >
                {(props) => (
                  <Input
                    {...props}
                    value={type.title ?? ''}
                    onChange={(e) => patch(index, { title: e.target.value })}
                    autoComplete="off"
                    placeholder="Certificate"
                  />
                )}
              </Field>
            </div>
            <PrintedOverrideFields
              idPrefix={`recipient-${type.id}`}
              subject={`a ${type.label.trim().toLowerCase() || 'certificate in this group'}`}
              inheritsFrom="the event's shared line"
              value={type}
              onChange={(changes) => patch(index, changes)}
            />
          </div>
        </div>
      ))}

      {types.length < MAX_RECIPIENT_TYPES && (
        <Button variant="secondary" onClick={add} disabled={disabled} className="self-start">
          Add another group
        </Button>
      )}
    </div>
  );
}

function AwardCategories({
  awards,
  idPrefix,
  disabled,
  onChange,
}: {
  awards: AwardCategory[];
  /**
   * Namespaces the field ids. This list is rendered once per group, so an id
   * built from the row's index alone repeats across groups -- and a duplicated
   * id silently points the second group's labels at the first group's inputs.
   */
  idPrefix: string;
  disabled: boolean;
  onChange: (next: AwardCategory[]) => void;
}) {
  const patch = (index: number, changes: Partial<AwardCategory>) =>
    onChange(awards.map((award, position) => (position === index ? { ...award, ...changes } : award)));

  const remove = (index: number) => onChange(awards.filter((_, position) => position !== index));

  // A duplicate is dropped on save, so say so while it is still fixable rather
  // than letting a category quietly disappear.
  const duplicates = new Set(
    awards
      .map((award) => award.name.trim().toLowerCase())
      .filter((name, index, all) => name && all.indexOf(name) !== index),
  );

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {awards.map((award, index) => {
          const duplicate = duplicates.has(award.name.trim().toLowerCase());
          return (
            <li key={index} className="flex flex-col gap-2">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <Input
                    value={award.name}
                    onChange={(e) => patch(index, { name: e.target.value })}
                    aria-label={`Prize category ${index + 1}`}
                    aria-invalid={duplicate || undefined}
                    autoComplete="off"
                    placeholder="Best Team Effort"
                  />
                  {duplicate && (
                    <p className="mt-1 text-sm text-danger">
                      Already in the list — the repeat will be dropped when you save.
                    </p>
                  )}
                </div>
                <Button
                  variant="danger"
                  onClick={() => remove(index)}
                  aria-label={`Remove ${award.name.trim() || `prize category ${index + 1}`}`}
                >
                  Remove
                </Button>
              </div>

              {/*
                Folded away by default. Most prizes want the group's line, and a
                textarea under every one of five categories would bury the list
                it belongs to. The summary says when one is set, so a filled-in
                line is never hidden.
              */}
              <details
                className="ml-1"
                open={Boolean(award.recognition?.trim() || award.closing?.trim())}
              >
                <summary className="min-h-11 cursor-pointer text-teal-900">
                  {award.recognition?.trim() || award.closing?.trim()
                    ? 'Has its own wording'
                    : 'Give this prize its own wording'}
                </summary>
                <div className="mt-2">
                  <PrintedOverrideFields
                    idPrefix={`${idPrefix}-${index}`}
                    subject={award.name.trim() || 'this prize'}
                    inheritsFrom="the group's line"
                    value={award}
                    onChange={(changes) => patch(index, changes)}
                  />
                </div>
              </details>
            </li>
          );
        })}
      </ul>

      {awards.length === 0 && (
        <p className="rounded-lg border-2 border-line bg-paper-sunk px-4 py-3 text-ink-soft">
          No prizes yet for this group.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          onClick={() => onChange([...awards, { name: '', recognition: '' }])}
          disabled={disabled}
        >
          Add a category
        </Button>
        <Button
          variant="quiet"
          onClick={() => onChange(DEFAULT_AWARDS.map((name) => ({ name, recognition: '' })))}
          disabled={disabled}
          className="px-2"
        >
          Restore the standard list
        </Button>
      </div>
    </div>
  );
}

/**
 * Marks an event complete, or reopens it.
 *
 * Placed last and styled quietly: it is a housekeeping action taken once, weeks
 * after the ceremony, not something anyone needs while preparing certificates.
 */
function ArchiveControl({
  event,
  onError,
}: {
  event: Event;
  onError: (message: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const archived = Boolean(event.archivedAt);

  const toggle = () => {
    if (
      !archived &&
      !window.confirm(
        `Mark ${event.name} as complete?\n\nNo more students can be added and no certificates changed until you reopen it. All existing certificate links keep working.`,
      )
    ) {
      return;
    }

    startTransition(async () => {
      try {
        await setEventArchived(event.id, !archived);
        router.refresh();
      } catch (caught) {
        onError(caught instanceof Error ? caught.message : 'Could not change the event state.');
      }
    });
  };

  return (
    <Card className="border-line bg-paper-sunk">
      <h2 className="mb-2 text-xl font-bold">{archived ? 'Reopen this event' : 'Finish up'}</h2>
      <p className="mb-4 text-ink-soft">
        {archived ? (
          <>
            Marked complete
            {event.archivedAt && ` on ${new Date(event.archivedAt).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}`}
            . Reopening lets you add students and remake certificates again.
          </>
        ) : (
          <>
            Once the ceremony is over and every certificate has been sent out, mark the event
            complete. It moves out of the main list and is locked against accidental changes.
            Certificate links are unaffected — families keep them forever.
          </>
        )}
      </p>
      <Button variant={archived ? 'primary' : 'secondary'} onClick={toggle} disabled={pending}>
        {pending
          ? 'Saving…'
          : archived
            ? 'Reopen event'
            : 'Mark event as complete'}
      </Button>
    </Card>
  );
}
