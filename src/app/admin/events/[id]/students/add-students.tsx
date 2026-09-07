'use client';

import { useRef, useState, useTransition } from 'react';

import { addCertificates, type CertificateInput } from '@/app/admin/actions';
import { Alert, Button, Card, Field, Input, Select, Textarea } from '@/components/ui';
import { SUPPORTED_LANGUAGES, languageLabel } from '@/lib/languages';
import { OPTIONAL_COLUMNS, csvTemplate, parseStudentList } from '@/lib/paste-parse';
import { recipientKey } from '@/lib/paste-parse';
import type { RecipientType } from '@/lib/recipient-types';

/** What one import did, so the page can say so rather than just "added". */
type AddResult = { added: number; updated: number; unchanged: number };

export function AddStudents({
  eventId,
  defaultLanguage,
  types,
  existing,
  onAdded,
}: {
  eventId: string;
  defaultLanguage: string;
  /** The groups this event honours, each with its own prizes. */
  types: RecipientType[];
  /** Who is already in the list, so a re-upload can say what it will change. */
  existing: Array<{ name: string; type: string }>;
  onAdded: (result: AddResult) => void;
}) {
  const [mode, setMode] = useState<'one' | 'many'>('one');

  return (
    <Card>
      <h2 className="mb-4 text-xl font-bold">Add people</h2>

      <div role="group" aria-label="How to add people" className="mb-6 flex flex-wrap gap-2">
        <Button
          variant={mode === 'one' ? 'primary' : 'secondary'}
          aria-pressed={mode === 'one'}
          onClick={() => setMode('one')}
        >
          One at a time
        </Button>
        <Button
          variant={mode === 'many' ? 'primary' : 'secondary'}
          aria-pressed={mode === 'many'}
          onClick={() => setMode('many')}
        >
          Paste a list or upload a file
        </Button>
      </div>

      {mode === 'one' ? (
        <SingleStudentForm
          eventId={eventId}
          defaultLanguage={defaultLanguage}
          types={types}
          onAdded={onAdded}
        />
      ) : (
        <BulkImport
          eventId={eventId}
          defaultLanguage={defaultLanguage}
          types={types}
          existing={existing}
          onAdded={onAdded}
        />
      )}
    </Card>
  );
}

function SingleStudentForm({
  eventId,
  defaultLanguage,
  types,
  onAdded,
}: {
  eventId: string;
  defaultLanguage: string;
  types: RecipientType[];
  onAdded: (result: AddResult) => void;
}) {
  const [typeId, setTypeId] = useState(types[0]?.id ?? '');
  const awards = types.find((type) => type.id === typeId)?.awards ?? [];
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const submit = (formData: FormData) => {
    const input: CertificateInput = {
      studentName: String(formData.get('studentName') ?? ''),
      namePronunciation: String(formData.get('namePronunciation') ?? ''),
      school: String(formData.get('school') ?? ''),
      city: String(formData.get('city') ?? ''),
      className: String(formData.get('className') ?? ''),
      projectTitle: String(formData.get('projectTitle') ?? ''),
      projectBlurb: String(formData.get('projectBlurb') ?? ''),
      award: String(formData.get('award') ?? ''),
      recipientType: typeId,
      language: String(formData.get('language') ?? defaultLanguage),
    };

    if (!input.studentName.trim() || !input.award.trim()) {
      setError('A recipient needs at least a name and an award.');
      return;
    }

    setError('');
    startTransition(async () => {
      try {
        const result = await addCertificates(eventId, [input]);
        formRef.current?.reset();
        onAdded(result);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not add that person.');
      }
    });
  };

  return (
    <form ref={formRef} action={submit} className="flex flex-col gap-5">
      {error && <Alert>{error}</Alert>}

      <div className="grid gap-5 sm:grid-cols-2">
        {types.length > 1 && (
          <Field
            id="recipientType"
            label="This is a"
            hint="Which group they belong to. It decides which prizes are offered."
          >
            {(props) => (
              <Select {...props} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        <Field id="studentName" label="Name">
          {(props) => <Input {...props} name="studentName" required autoComplete="off" />}
        </Field>

        <Field
          id="namePronunciation"
          label="Say it like (optional)"
          hint="Only if the voice gets the name wrong. Write it as it sounds, e.g. RUH-vee KOO-mar."
        >
          {(props) => <Input {...props} name="namePronunciation" autoComplete="off" />}
        </Field>

        <Field id="school" label="School (optional)">
          {(props) => <Input {...props} name="school" autoComplete="off" />}
        </Field>

        <Field
          id="city"
          label="City or state (optional)"
          hint="Whichever suits. It is joined onto the school — “from Delhi Public School, Karnataka”."
        >
          {(props) => <Input {...props} name="city" autoComplete="off" />}
        </Field>

        <Field id="className" label="Class (optional)">
          {(props) => <Input {...props} name="className" autoComplete="off" placeholder="Class 8" />}
        </Field>

        {/* A free-text box with suggestions rather than a dropdown: the
            categories are set under Settings, but a one-off prize decided on
            the morning of the ceremony must not need a settings change first. */}
        <Field id="award" label="Award" hint="Start typing to pick one of this group's prizes.">
          {(props) => (
            <>
              <Input {...props} name="award" required list="award-suggestions" autoComplete="off" />
              <datalist id="award-suggestions">
                {awards.map((award) => (
                  <option key={award.name} value={award.name} />
                ))}
              </datalist>
            </>
          )}
        </Field>

        <Field id="projectTitle" label="What they showed (optional)">
          {(props) => (
            <Input {...props} name="projectTitle" autoComplete="off" placeholder="Talking Thermometer" />
          )}
        </Field>

        <Field id="language" label="Language">
          {(props) => (
            <Select {...props} name="language" defaultValue={defaultLanguage}>
              {SUPPORTED_LANGUAGES.map((language) => (
                <option key={language.tag} value={language.tag}>
                  {languageLabel(language.tag)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <Field
        id="projectBlurb"
        label="One line about it (optional)"
        hint="Spoken after the exhibit's name. One sentence is plenty."
      >
        {(props) => (
          <Textarea
            {...props}
            name="projectBlurb"
            rows={2}
            placeholder="It measures the temperature and announces it aloud"
          />
        )}
      </Field>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? 'Adding…' : 'Add to the list'}
      </Button>
    </form>
  );
}

function BulkImport({
  eventId,
  defaultLanguage,
  types,
  existing,
  onAdded,
}: {
  eventId: string;
  defaultLanguage: string;
  types: RecipientType[];
  existing: Array<{ name: string; type: string }>;
  onAdded: (result: AddResult) => void;
}) {
  const [text, setText] = useState('');
  const [typeId, setTypeId] = useState(types[0]?.id ?? '');
  const awards = types.find((type) => type.id === typeId)?.awards ?? [];
  const [defaultAward, setDefaultAward] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const preview = text.trim()
    ? parseStudentList(text, { defaultLanguage, defaultAward, types, defaultType: typeId })
    : null;

  // Counted here rather than on the server, so the split between new and
  // updated is visible before anything is pressed.
  const known = new Set(existing.map((person) => recipientKey(person.name, person.type)));
  const willUpdate =
    preview?.rows.filter((row) => known.has(recipientKey(row.studentName, row.recipientType)))
      .length ?? 0;
  const willAdd = (preview?.rows.length ?? 0) - willUpdate;
  const readyLine = [
    willAdd > 0 && `Ready to add ${willAdd} ${willAdd === 1 ? 'person' : 'people'}`,
    willUpdate > 0 && `${willAdd > 0 ? 'and update' : 'Ready to update'} ${willUpdate}`,
  ]
    .filter(Boolean)
    .join(' ') + '.';

  const readFile = async (file: File) => {
    setText(await file.text());
  };

  const commit = () => {
    if (!preview || preview.rows.length === 0) return;
    setError('');
    startTransition(async () => {
      try {
        const result = await addCertificates(eventId, preview.rows);
        setText('');
        onAdded(result);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not add those people.');
      }
    });
  };

  const downloadTemplate = () => {
    const label = types.find((type) => type.id === typeId)?.label ?? '';
    const url = URL.createObjectURL(
      new Blob([csvTemplate(awards.map((award) => award.name), label)], { type: 'text/csv' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'student-list-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-5">
      {error && <Alert>{error}</Alert>}

      <div className="rounded-lg bg-paper-sunk p-4">
        <p className="mb-2 font-bold">
          You need two columns: <span className="whitespace-nowrap">Name</span> and{' '}
          <span className="whitespace-nowrap">Award</span>.
        </p>
        <p className="text-ink-soft">
          Put those names in the first row and add whichever of these you have — in any order,
          leaving out the rest: <strong>School</strong> · <strong>City or state</strong>
          {types.length > 1 && (
            <>
              {' '}
              · <strong>Type</strong>
            </>
          )}{' '}
          · {OPTIONAL_COLUMNS.join(' · ')}. Any column Taali does not recognise is ignored, so you
          can usually paste your working sheet as it is.
        </p>
        {types.length > 1 && (
          <p className="mt-2 text-ink-soft">
            <strong>Type</strong> is the one that says which group somebody is in —{' '}
            {types.map((type) => type.label).join(' or ')}. Leave the column out and every row goes
            to the group chosen below.
          </p>
        )}
        {awards.length > 0 && (
          <p className="mt-2 text-ink-soft">
            Prizes for {types.find((type) => type.id === typeId)?.label ?? 'this group'}:{' '}
            {awards.map((award) => award.name).join(' · ')}. Capitals and spacing do not matter —
            they are corrected to these spellings. Anything else is kept exactly as you wrote it.
          </p>
        )}
        <Button variant="quiet" onClick={downloadTemplate} className="mt-2 px-0">
          Download a template spreadsheet
        </Button>
      </div>

      <Field
        id="paste"
        label="Paste from Excel or Google Sheets"
        hint="Select the cells in your spreadsheet, copy, and paste them here."
      >
        {(props) => (
          <Textarea
            {...props}
            rows={8}
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="font-mono text-sm"
          />
        )}
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="csv-file"
          label="…or upload a CSV file"
          hint="Exported from Excel, Google Sheets or Numbers."
        >
          {(props) => (
            <input
              {...props}
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
              }}
              className="min-h-11 w-full rounded-lg border-2 border-line bg-paper px-3 py-2"
            />
          )}
        </Field>

        {types.length > 1 && (
          <Field
            id="bulk-type"
            label="Group for rows without a Type column"
            hint="Every row goes here unless its own Type column says otherwise."
          >
            {(props) => (
              <Select {...props} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        <Field
          id="default-award"
          label="Award for rows that do not have one"
          hint="Useful when the whole list is participation certificates."
        >
          {(props) => (
            <>
              <Input
                {...props}
                value={defaultAward}
                onChange={(event) => setDefaultAward(event.target.value)}
                list="bulk-award-suggestions"
                autoComplete="off"
                placeholder={awards[awards.length - 1]?.name ?? 'Certificate of Participation'}
              />
              <datalist id="bulk-award-suggestions">
                {awards.map((award) => (
                  <option key={award.name} value={award.name} />
                ))}
              </datalist>
            </>
          )}
        </Field>
      </div>

      {preview && (
        <div aria-live="polite">
          <p className="font-bold">
            {preview.rows.length === 0 ? 'Nothing to add yet.' : readyLine}
            {preview.usedHeader && ' Header row detected.'}
          </p>
          {willUpdate > 0 && (
            <p className="mt-1 text-ink-soft">
              Somebody already in the list is matched by name and updated rather than added again,
              so you can fix a sheet and paste it a second time. An updated certificate has to be
              made again — a name spelled differently is a new person, not a correction.
            </p>
          )}

          {preview.problems.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 text-danger">
              {preview.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}

          {/* Warnings, not errors: these rows are going in either way. Shown so
              a mistyped award is caught here rather than read aloud at the
              ceremony. */}
          {preview.warnings.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 text-ink-soft">
              {preview.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}

          {preview.rows.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 text-ink-soft">
              {preview.rows.slice(0, 4).map((row, index) => (
                <li key={index}>
                  {row.studentName} — {row.award}
                  {row.school && ` — ${row.school}`}
                </li>
              ))}
              {preview.rows.length > 4 && <li>…and {preview.rows.length - 4} more.</li>}
            </ul>
          )}
        </div>
      )}

      <Button
        onClick={commit}
        disabled={pending || !preview || preview.rows.length === 0}
        className="self-start"
      >
        {pending
          ? 'Adding…'
          : willUpdate > 0 && willAdd === 0
            ? `Update ${willUpdate}`
            : willUpdate > 0
              ? `Add ${willAdd}, update ${willUpdate}`
              : `Add ${willAdd} to the list`}
      </Button>
    </div>
  );
}
