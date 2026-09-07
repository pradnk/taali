'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import JSZip from 'jszip';

import { deleteCertificate, setReviewed, updateCertificatesBulk } from '@/app/admin/actions';
import { Alert, Button, Card, Field, LinkButton, Select, cx } from '@/components/ui';
import { recipientTypeFor, recipientTypesFor, type RecipientType } from '@/lib/recipient-types';
import { mapLimit } from '@/lib/concurrency';
import type { Certificate, Event } from '@/lib/db/schema';
import { certificateFileBase, resolveFileBases } from '@/lib/filename';
import {
  STAGE_LABELS,
  generateCertificate,
  type GenerationStage,
} from '@/lib/generate-client';
import { SUPPORTED_LANGUAGES, languageLabel, modelSupportsSpeed, resolveModel } from '@/lib/languages';
import { AddStudents } from './add-students';

/**
 * How many certificates are produced at once during a batch.
 *
 * Two rather than one, because each certificate spends most of its time waiting
 * on the voice service, so overlapping roughly halves a forty-student run. Not
 * more than two: mixing and MP3 encoding are CPU-bound, and saturating the
 * machine makes the progress display stutter on the modest laptops this is
 * likely to run on.
 */
const BATCH_CONCURRENCY = 2;

type RowState = { stage?: GenerationStage; error?: string };

export function StudentsClient({
  event,
  initialRows,
  siteUrl,
}: {
  event: Event;
  initialRows: Certificate[];
  siteUrl: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, RowState>>({});
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [batchRunning, setBatchRunning] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const cancelled = useRef(false);

  /**
   * The server rows are the single source of truth; only the "listened"
   * checkbox is held locally, so it responds instantly rather than waiting for
   * a round trip. Copying all the rows into state instead would leave two
   * versions of the truth to keep in step.
   */
  const [reviewedOverride, setReviewedOverride] = useState<Record<string, boolean>>({});
  const rows = initialRows.map((row) => ({
    ...row,
    reviewed: reviewedOverride[row.id] ?? row.reviewed,
  }));

  const certificateUrl = (row: Certificate) => `${siteUrl}/c/${row.publicId}`;

  /*
   * A completed event is read-only. Downloading, copying links and printing
   * stay available -- those are exactly what someone comes back to a finished
   * event for -- but nothing that would change a certificate does.
   */
  const archived = Boolean(event.archivedAt);
  const types = recipientTypesFor(event);

  const pending = rows.filter((row) => row.status !== 'ready');
  const ready = rows.filter((row) => row.status === 'ready' && row.audioUrl);

  const setRowState = useCallback((id: string, next: RowState) => {
    setState((current) => ({ ...current, [id]: next }));
  }, []);

  const runOne = useCallback(
    async (row: Certificate) => {
      setRowState(row.id, { stage: 'preparing' });
      try {
        await generateCertificate({
          certificateId: row.id,
          eventName: event.name,
          studentName: row.studentName,
          onStage: (stage) => setRowState(row.id, { stage }),
        });
        setRowState(row.id, { stage: 'done' });
        return true;
      } catch (caught) {
        setRowState(row.id, {
          error: caught instanceof Error ? caught.message : 'Something went wrong.',
        });
        return false;
      }
    },
    [event.name, setRowState],
  );

  const selectedRows = rows.filter((row) => selected.has(row.id));

  const toggleSelected = (id: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const selectAll = (on: boolean) =>
    setSelected(on ? new Set(rows.map((row) => row.id)) : new Set());

  const applyToSelected = async (changes: {
    award?: string;
    recipientType?: string;
    language?: string;
  }) => {
    setError('');
    setNotice('');
    try {
      const { updated } = await updateCertificatesBulk([...selected], changes);
      setNotice(
        `Changed ${updated} certificate${updated === 1 ? '' : 's'}. ` +
          'They need making again — the recording no longer matches the details.',
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not change those.');
    }
  };

  const generateOne = async (row: Certificate) => {
    setError('');
    setNotice('');
    await runOne(row);
    router.refresh();
  };

  const generateAll = async (only?: Certificate[]) => {
    // With rows ticked, the button acts on those and nothing else; with none
    // ticked it means everything outstanding, as it always did.
    const targets = only ?? [...pending];
    if (targets.length === 0) return;
    setError('');
    setNotice('');
    setBatchRunning(true);
    cancelled.current = false;

    const results = await mapLimit(targets, BATCH_CONCURRENCY, async (row) => {
      if (cancelled.current) return null;
      return runOne(row);
    });

    setBatchRunning(false);
    const attempted = results.filter((result) => result !== null);
    const succeeded = attempted.filter(Boolean).length;
    const failed = attempted.length - succeeded;

    setNotice(
      cancelled.current
        ? `Stopped. ${succeeded} made, ${targets.length - attempted.length} not started.`
        : `Done. ${succeeded} certificate${succeeded === 1 ? '' : 's'} made${failed > 0 ? `, ${failed} failed — use Retry on those rows` : ''}.`,
    );
    router.refresh();
  };

  const remove = async (row: Certificate) => {
    if (!window.confirm(`Remove ${row.studentName} from this event? This cannot be undone.`)) {
      return;
    }
    await deleteCertificate(row.id);
    router.refresh();
  };

  const toggleReviewed = async (row: Certificate, reviewed: boolean) => {
    setReviewedOverride((current) => ({ ...current, [row.id]: reviewed }));
    await setReviewed(row.id, reviewed);
  };

  const copyLinks = async () => {
    const header = ['Name', 'Award', 'Link'].join('\t');
    const lines = rows.map((row) =>
      [row.studentName, row.award, certificateUrl(row)].join('\t'),
    );
    try {
      await navigator.clipboard.writeText([header, ...lines].join('\n'));
      setNotice(`Copied ${rows.length} links. Paste them straight into a spreadsheet.`);
    } catch {
      setError('The browser would not allow copying. Select the links in the table instead.');
    }
  };

  const downloadZip = async () => {
    if (ready.length === 0) return;
    setError('');
    setNotice('Building the ZIP…');

    try {
      const zip = new JSZip();
      // Flat files in one ZIP, so two recipients of one name would overwrite
      // each other. The school tells them apart, and settles the rest.
      const { bases, clashes } = resolveFileBases(
        ready.map((row) => ({
          name: row.studentName,
          fileBase: certificateFileBase(event.name, row.studentName, row.school),
        })),
      );
      await mapLimit(ready, 4, async (row, index) => {
        const response = await fetch(row.audioUrl!);
        if (!response.ok) throw new Error(`Could not download ${row.studentName}'s audio.`);
        zip.file(`${bases[index]}.mp3`, await response.arrayBuffer());
      });

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${certificateFileBase(event.name, 'all-certificates')}.zip`;
      link.click();
      URL.revokeObjectURL(url);
      setNotice(
        `Downloaded ${ready.length} certificates.` +
          (clashes.length > 0
            ? ` ${clashes.map((clash) => clash.names[0]).join(', ')} appear more than once with` +
              ' the same school, so those files are numbered — worth checking the list.'
            : ''),
      );
    } catch (caught) {
      setNotice('');
      setError(caught instanceof Error ? caught.message : 'Could not build the ZIP.');
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {error && <Alert>{error}</Alert>}
      {notice && (
        <p
          aria-live="polite"
          className="rounded-lg border-2 border-success bg-success-bg px-4 py-3 font-bold text-success"
        >
          {notice}
        </p>
      )}

      {archived ? (
        <p className="rounded-lg border-2 border-line bg-paper-sunk px-5 py-4 text-lg">
          <strong>This event is marked complete.</strong> Recipients and certificates are locked. You
          can still download the audio, copy the links and print. To make changes, reopen the event
          in{' '}
          <Link
            href={`/admin/events/${event.id}`}
            className="font-bold text-teal-900 underline underline-offset-4"
          >
            Settings
          </Link>
          .
        </p>
      ) : (
        <AddStudents
          eventId={event.id}
          defaultLanguage={event.defaultLanguage}
          types={types}
          existing={rows.map((row) => ({ name: row.studentName, type: row.recipientType }))}
          onAdded={(result) => {
            const parts = [
              result.added > 0 && `added ${result.added}`,
              result.updated > 0 && `updated ${result.updated}`,
              result.unchanged > 0 && `left ${result.unchanged} unchanged`,
            ].filter(Boolean);
            setNotice(
              parts.length > 0
                ? `${parts.join(', ')}.${result.updated > 0 ? ' The updated ones need making again.' : ''}`
                : 'Nothing to add.',
            );
            router.refresh();
          }}
        />
      )}

      {rows.length > 0 && (
        <Card>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <h2 className="mr-auto text-xl font-bold">
              {rows.length} {rows.length === 1 ? 'recipient' : 'recipients'}
            </h2>

            {!archived && <NamePreviewAll rows={rows} event={event} onError={setError} />}

            {archived ? null : batchRunning ? (
              <Button
                variant="danger"
                onClick={() => {
                  cancelled.current = true;
                  setNotice('Stopping after the certificates already in progress…');
                }}
              >
                Stop
              </Button>
            ) : (
              <Button onClick={() => generateAll()} disabled={pending.length === 0}>
                {pending.length === 0
                  ? 'All certificates made'
                  : `Make ${pending.length} certificate${pending.length === 1 ? '' : 's'}`}
              </Button>
            )}

            <Button variant="secondary" onClick={downloadZip} disabled={ready.length === 0}>
              Download all as ZIP
            </Button>
            <Button variant="secondary" onClick={copyLinks}>
              Copy links
            </Button>
          </div>

          {batchRunning && (
            <p className="mb-4 font-bold" aria-live="polite">
              Keep this tab open — the certificates are being made here, in this browser.
            </p>
          )}

          {!archived && selectedRows.length > 0 && (
            <BulkActions
              types={types}
              count={selectedRows.length}
              busy={batchRunning}
              filesHref={`/admin/events/${event.id}/print?only=${selectedRows.map((row) => row.id).join(',')}`}
              onApply={applyToSelected}
              onRegenerate={() => generateAll(selectedRows)}
              onClear={() => setSelected(new Set())}
            />
          )}

          <StudentTable
            rows={rows}
            selected={selected}
            onToggleSelected={toggleSelected}
            onSelectAll={selectAll}
            event={event}
            state={state}
            certificateUrl={certificateUrl}
            onGenerate={generateOne}
            onDelete={remove}
            onToggleReviewed={toggleReviewed}
            onError={setError}
            disabled={batchRunning || archived}
            archived={archived}
          />
        </Card>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- table

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-paper-sunk text-ink-soft',
  generating: 'bg-teal-100 text-teal-900',
  ready: 'bg-success-bg text-success',
  failed: 'bg-danger-bg text-danger',
};

/**
 * What you can do to a batch of ticked rows.
 *
 * Appears only when something is ticked, and lists what will happen before it
 * happens: a bulk change is the one action here that is hard to undo by hand,
 * so it should never be a surprise.
 *
 * Each control applies on its own rather than there being one Apply button for
 * all three. Changing the prize and the language at once is rare; being made to
 * think about a language you did not mean to touch is not.
 */
function BulkActions({
  types,
  count,
  busy,
  filesHref,
  onApply,
  onRegenerate,
  onClear,
}: {
  types: RecipientType[];
  count: number;
  busy: boolean;
  /** Where the chosen few can be printed, or saved as files to send. */
  filesHref: string;
  onApply: (changes: { award?: string; recipientType?: string; language?: string }) => void;
  onRegenerate: () => void;
  onClear: () => void;
}) {
  const [award, setAward] = useState('');
  const [typeId, setTypeId] = useState('');
  const [language, setLanguage] = useState('');

  // Every prize across every group: a selection can span groups, and the point
  // of this bar is to move a batch onto the right one.
  const awards = types.flatMap((type) =>
    type.awards.map((entry) => ({ group: type.label, name: entry.name })),
  );

  const apply = (changes: Parameters<typeof onApply>[0], reset: () => void) => {
    onApply(changes);
    reset();
  };

  return (
    <div className="mb-5 rounded-lg border-2 border-teal-800 bg-teal-50 p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="mr-auto text-lg font-bold" aria-live="polite">
          {count} selected
        </p>
        <Button variant="quiet" onClick={onClear} className="px-2">
          Clear selection
        </Button>
      </div>

      <p className="mb-4 text-ink-soft">
        Changing any of these marks the certificates as needing to be made again — the recording
        would otherwise say one thing while the page says another.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="bulk-award" label="Change the prize to">
          {(props) => (
            <Select
              {...props}
              value={award}
              disabled={busy}
              onChange={(e) => {
                setAward(e.target.value);
                if (e.target.value) apply({ award: e.target.value }, () => setAward(''));
              }}
            >
              <option value="">Leave as it is</option>
              {awards.map((entry) => (
                <option key={`${entry.group}-${entry.name}`} value={entry.name}>
                  {types.length > 1 ? `${entry.name} (${entry.group})` : entry.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {types.length > 1 && (
          <Field id="bulk-group" label="Move to group">
            {(props) => (
              <Select
                {...props}
                value={typeId}
                disabled={busy}
                onChange={(e) => {
                  setTypeId(e.target.value);
                  if (e.target.value) apply({ recipientType: e.target.value }, () => setTypeId(''));
                }}
              >
                <option value="">Leave as it is</option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        <Field id="bulk-language" label="Change the language to">
          {(props) => (
            <Select
              {...props}
              value={language}
              disabled={busy}
              onChange={(e) => {
                setLanguage(e.target.value);
                if (e.target.value) apply({ language: e.target.value }, () => setLanguage(''));
              }}
            >
              <option value="">Leave as it is</option>
              {SUPPORTED_LANGUAGES.map((entry) => (
                <option key={entry.tag} value={entry.tag}>
                  {languageLabel(entry.tag)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button onClick={onRegenerate} disabled={busy}>
          {busy ? 'Making…' : `Make these ${count} again`}
        </Button>
        <LinkButton variant="secondary" href={filesHref}>
          Print or download these {count}
        </LinkButton>
      </div>
    </div>
  );
}

function StudentTable({
  rows,
  event,
  selected,
  onToggleSelected,
  onSelectAll,
  state,
  certificateUrl,
  onGenerate,
  onDelete,
  onToggleReviewed,
  onError,
  disabled,
  archived,
}: {
  rows: Certificate[];
  event: Event;
  selected: Set<string>;
  onToggleSelected: (id: string, on: boolean) => void;
  onSelectAll: (on: boolean) => void;
  state: Record<string, RowState>;
  certificateUrl: (row: Certificate) => string;
  onGenerate: (row: Certificate) => void;
  onDelete: (row: Certificate) => void;
  onToggleReviewed: (row: Certificate, reviewed: boolean) => void;
  onError: (message: string) => void;
  disabled: boolean;
  archived: boolean;
}) {
  const types = recipientTypesFor(event);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only-focusable">
          Everyone in this event, with the state of each certificate.
        </caption>
        <thead>
          <tr className="border-b-2 border-line">
            {!archived && (
              <th scope="col" className="py-2 pr-3">
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={rows.length > 0 && rows.every((row) => selected.has(row.id))}
                    onChange={(e) => onSelectAll(e.target.checked)}
                  />
                  <span className="sr-only-focusable">Select every recipient</span>
                </label>
              </th>
            )}
            <th scope="col" className="py-2 pr-4">Name</th>
            <th scope="col" className="py-2 pr-4">Award</th>
            <th scope="col" className="py-2 pr-4">State</th>
            <th scope="col" className="py-2 pr-4">Listened</th>
            <th scope="col" className="py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rowState = state[row.id] ?? {};
            const working = rowState.stage !== undefined && rowState.stage !== 'done';
            const message = rowState.error ?? row.errorMessage;

            return (
              <tr key={row.id} className="border-b border-line align-top">
                {!archived && (
                  <td className="py-3 pr-3">
                    <label className="flex min-h-11 items-center">
                      <input
                        type="checkbox"
                        className="size-5"
                        checked={selected.has(row.id)}
                        onChange={(e) => onToggleSelected(row.id, e.target.checked)}
                        aria-label={`Select ${row.studentName}`}
                      />
                    </label>
                  </td>
                )}
                <th scope="row" className="py-3 pr-4 font-normal">
                  <span className="block font-bold">{row.studentName}</span>
                  {row.namePronunciation && (
                    <span className="block text-sm text-ink-soft">
                      said as “{row.namePronunciation}”
                    </span>
                  )}
                  <span className="block text-sm text-ink-soft">
                    {[row.school, row.city].filter(Boolean).join(', ')}
                    {row.projectTitle && ` — ${row.projectTitle}`}
                  </span>
                  {row.language !== event.defaultLanguage && (
                    <span className="mt-1 inline-block rounded bg-teal-100 px-2 text-sm font-bold text-teal-900">
                      {languageLabel(row.language)}
                    </span>
                  )}
                </th>

                <td className="py-3 pr-4">
                  {row.award}
                  {types.length > 1 && (
                    <span className="block text-sm text-ink-soft">
                      {recipientTypeFor(types, row.recipientType).label}
                    </span>
                  )}
                </td>

                <td className="py-3 pr-4">
                  <span
                    className={cx(
                      'inline-block rounded px-2 py-0.5 text-sm font-bold',
                      STATUS_STYLES[working ? 'generating' : row.status],
                    )}
                  >
                    {working ? STAGE_LABELS[rowState.stage!] : STATUS_LABELS[row.status]}
                  </span>
                  {message && (
                    <span className="mt-1 block max-w-xs text-sm text-danger">{message}</span>
                  )}
                </td>

                <td className="py-3 pr-4">
                  <label className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={row.reviewed}
                      disabled={row.status !== 'ready' || archived}
                      onChange={(changeEvent) =>
                        onToggleReviewed(row, changeEvent.target.checked)
                      }
                    />
                    <span className="sr-only-focusable">
                      I have listened to {row.studentName}&apos;s certificate
                    </span>
                  </label>
                </td>

                <td className="py-3">
                  <div className="flex flex-wrap gap-2">
                    {!archived && (
                      <>
                        <NamePreviewButton row={row} event={event} onError={onError} />
                        <Button
                          variant="secondary"
                          className="min-h-11 px-3 text-sm"
                          disabled={disabled || working}
                          onClick={() => onGenerate(row)}
                        >
                          {row.status === 'ready'
                            ? 'Remake'
                            : row.status === 'failed'
                              ? 'Retry'
                              : 'Make'}
                        </Button>
                      </>
                    )}

                    {row.status === 'ready' && (
                      <Link
                        href={`/c/${row.publicId}`}
                        className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-bold text-teal-900 underline underline-offset-4 hover:bg-teal-50"
                      >
                        Open
                      </Link>
                    )}

                    {!archived && (
                      <Button
                        variant="quiet"
                        className="min-h-11 px-3 text-sm"
                        disabled={disabled}
                        onClick={() => onDelete(row)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>

                  {row.status === 'ready' && (
                    <p className="mt-1 text-sm break-all text-ink-soft">{certificateUrl(row)}</p>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Not made yet',
  generating: 'Making…',
  ready: 'Ready',
  failed: 'Failed',
};

// -------------------------------------------------------- name pronunciation

/**
 * Speaks just the student's name.
 *
 * This is the single most valuable control on the page. A mispronounced name on
 * a certificate meant to honour a child is worse than no certificate, and the
 * only way to know is to hear it. Because clips are cached by content, checking
 * a name costs nothing after the first time.
 */
function useNamePreview(event: Event) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const speak = useCallback(
    async (row: Certificate) => {
      const modelId = resolveModel(event.modelId, row.language);
      const response = await fetch('/api/admin/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voiceId: event.voiceId,
          modelId,
          segments: [
            {
              id: 'name',
              spoken: row.namePronunciation?.trim() || row.studentName,
              speed: modelSupportsSpeed(modelId) ? 0.9 : 1,
            },
          ],
        }),
      });

      const body = (await response.json()) as {
        clips?: Array<{ url: string }>;
        error?: string;
      };
      if (!response.ok || !body.clips?.[0]) {
        throw new Error(body.error ?? 'Could not play that name.');
      }

      audioRef.current?.pause();
      const audio = new Audio(body.clips[0].url);
      audioRef.current = audio;
      await audio.play();
      return audio;
    },
    [event.modelId, event.voiceId],
  );

  const stop = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  return { speak, stop };
}

function NamePreviewButton({
  row,
  event,
  onError,
}: {
  row: Certificate;
  event: Event;
  onError: (message: string) => void;
}) {
  const { speak } = useNamePreview(event);
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant="secondary"
      className="min-h-11 px-3 text-sm"
      disabled={busy}
      aria-label={`Hear how ${row.studentName} will be pronounced`}
      onClick={async () => {
        setBusy(true);
        try {
          const audio = await speak(row);
          audio.addEventListener('ended', () => setBusy(false), { once: true });
        } catch (caught) {
          onError(caught instanceof Error ? caught.message : 'Could not play that name.');
          setBusy(false);
        }
      }}
    >
      {busy ? '♪ Playing' : '♪ Hear name'}
    </Button>
  );
}

/**
 * Plays every name in turn, so one person can check a whole list in a couple of
 * minutes instead of clicking forty-five separate buttons.
 */
function NamePreviewAll({
  rows,
  event,
  onError,
}: {
  rows: Certificate[];
  event: Event;
  onError: (message: string) => void;
}) {
  const { speak, stop } = useNamePreview(event);
  const [index, setIndex] = useState<number | null>(null);
  const running = useRef(false);

  const start = async () => {
    running.current = true;
    try {
      for (let i = 0; i < rows.length; i += 1) {
        if (!running.current) break;
        setIndex(i);
        const audio = await speak(rows[i]);
        await new Promise((resolve) => audio.addEventListener('ended', resolve, { once: true }));
        // A beat between names, so they do not run together.
        await new Promise((resolve) => setTimeout(resolve, 450));
      }
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : 'Could not play the names.');
    } finally {
      running.current = false;
      setIndex(null);
    }
  };

  if (index !== null) {
    return (
      <div className="flex items-center gap-2">
        <span aria-live="polite" className="font-bold">
          {index + 1} of {rows.length}: {rows[index].studentName}
        </span>
        <Button
          variant="danger"
          onClick={() => {
            running.current = false;
            stop();
            setIndex(null);
          }}
        >
          Stop
        </Button>
      </div>
    );
  }

  return (
    <Button variant="secondary" onClick={start}>
      ♪ Check every name
    </Button>
  );
}
