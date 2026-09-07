import type { CertificateInput } from '@/app/admin/actions';
import { matchAward } from '@/lib/awards';
import { matchRecipientType, type RecipientType } from '@/lib/recipient-types';
import { SUPPORTED_LANGUAGES } from '@/lib/languages';

/**
 * Reads a student list pasted from a spreadsheet or uploaded as CSV.
 *
 * Copying a block of cells out of Excel or Google Sheets yields tab-separated
 * text, and a saved file is comma-separated, so both are handled by sniffing
 * the delimiter. Doing this properly matters: the alternative is a volunteer
 * retyping forty-five names, which is slow and is exactly where a
 * mistyped name would creep in.
 */

/**
 * The column order assumed when a sheet has no header row at all.
 *
 * Only that: with a header row -- which is the normal way in -- a sheet carries
 * whichever of these it likes, in any order, and anything missing is simply not
 * set. See OPTIONAL_COLUMNS for the ones beyond the downloadable template.
 */
export const IMPORT_COLUMNS = [
  'Name',
  'Say it like',
  'School',
  'City or state',
  'Class',
  'Project title',
  'Description',
  'Award',
  'Type',
  'Language',
] as const;

/** Header spellings accepted for each field, all compared lowercased. */
const HEADER_ALIASES: Record<string, string[]> = {
  studentName: ['name', 'student', 'student name', 'full name'],
  namePronunciation: ['say it like', 'pronunciation', 'pronounce', 'phonetic', 'say as'],
  school: ['school', 'institution'],
  // One field for wherever they are, because it is only ever joined onto the
  // school: "from Delhi Public School, Karnataka" reads the same whether that
  // second part is a city or a state, and asking for both would mean a column
  // most sheets leave empty.
  city: ['city', 'town', 'place', 'state', 'state/ut', 'district', 'region', 'province', 'city or state'],
  className: ['class', 'grade', 'std', 'standard'],
  projectTitle: ['project title', 'project', 'exhibit', 'title', 'experiment'],
  projectBlurb: ['description', 'blurb', 'about', 'details', 'one line', 'summary'],
  award: ['award', 'prize', 'result', 'position'],
  recipientType: ['type', 'role', 'group', 'category', 'recipient type'],
  language: ['language', 'lang'],
};

/** Splits delimited text, honouring quoted fields that contain the delimiter. */
function splitRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      // Swallow the second half of a CRLF pair.
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  row.push(field);
  rows.push(row);
  return rows.filter((cells) => cells.some((cell) => cell.trim()));
}

/** Tabs win when present: that is what a spreadsheet paste looks like. */
function sniffDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  return firstLine.includes('\t') ? '\t' : ',';
}

function matchHeader(cell: string): string | undefined {
  const normalised = cell.trim().toLowerCase().replace(/[_-]+/g, ' ');
  return Object.keys(HEADER_ALIASES).find((field) =>
    HEADER_ALIASES[field].includes(normalised),
  );
}

function resolveLanguage(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const lower = trimmed.toLowerCase();
  const match = SUPPORTED_LANGUAGES.find(
    (language) =>
      language.tag.toLowerCase() === lower ||
      language.englishName.toLowerCase() === lower ||
      language.nativeName === trimmed ||
      language.englishName.toLowerCase().startsWith(lower),
  );
  return match?.tag ?? fallback;
}

export type ParseResult = {
  rows: CertificateInput[];
  /** Human-readable problems, one per rejected line. */
  problems: string[];
  /**
   * Lines that were accepted but are worth a second look -- an award that is
   * not one of the event's categories, most often a typo. Not an error: the
   * list still imports, because a one-off prize on the morning of the ceremony
   * must not be blocked by a settings page.
   */
  warnings: string[];
  usedHeader: boolean;
};

export function parseStudentList(
  text: string,
  options: {
    defaultLanguage: string;
    defaultAward?: string;
    /** The event's groups; a row's Type column is matched against these. */
    types?: RecipientType[];
    /** Which group a row with no Type column belongs to. */
    defaultType?: string;
  },
): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { rows: [], problems: [], warnings: [], usedHeader: false };

  const cells = splitRows(trimmed, sniffDelimiter(trimmed));
  const problems: string[] = [];
  const warnings: string[] = [];
  const types = options.types ?? [];

  /*
   * A first row whose cells look like column names is treated as a header, and
   * its order is used. Otherwise the documented column order is assumed.
   *
   * Two recognised names is proof enough on its own. One is too, as long as
   * every filled cell in the row is a name Taali knows -- that is what lets a
   * sheet of nothing but `Name` work. Without it the header became a recipient
   * called "Name", which is a worse failure than losing a row would have been,
   * because it prints.
   */
  const headerMatches = cells[0].map(matchHeader);
  const recognised = headerMatches.filter(Boolean).length;
  const filled = cells[0].filter((cell) => cell.trim()).length;
  const usedHeader = recognised >= 2 || (recognised >= 1 && recognised === filled);

  const order = usedHeader
    ? headerMatches
    : [
        'studentName',
        'namePronunciation',
        'school',
        'city',
        'className',
        'projectTitle',
        'projectBlurb',
        'award',
        'recipientType',
        'language',
      ];

  /*
   * A header Taali does not recognise is skipped further down, silently -- and
   * a silently dropped column is the worst kind of import bug, because the
   * upload succeeds, the names are all right, and nobody notices that State
   * never arrived until a certificate is printed without it. So say so.
   */
  if (usedHeader) {
    const ignored = cells[0].filter((cell, column) => cell.trim() && !headerMatches[column]);
    if (ignored.length > 0) {
      warnings.push(
        `${ignored.map((cell) => `“${cell.trim()}”`).join(' and ')} ` +
          `${ignored.length === 1 ? 'is not a column' : 'are not columns'} Taali knows, so ` +
          `${ignored.length === 1 ? 'it was' : 'they were'} ignored. ` +
          'Accepted names are listed under the box; check the spelling if you meant one of them.',
      );
    }
  }

  const dataRows = usedHeader ? cells.slice(1) : cells;
  const rows: CertificateInput[] = [];

  dataRows.forEach((cellsInRow, index) => {
    const record: Record<string, string> = {};
    cellsInRow.forEach((value, column) => {
      const field = order[column];
      if (field) record[field] = value.trim();
    });

    const lineNumber = index + 1 + (usedHeader ? 1 : 0);

    if (!record.studentName) {
      problems.push(`Line ${lineNumber}: no student name, so this line was skipped.`);
      return;
    }

    // The group decides which prize list this row is checked against, so a
    // teacher's "Best Mentor" is not reported as a typo for a student prize.
    const matchedType = matchRecipientType(record.recipientType ?? '', types);
    if (record.recipientType && !matchedType && types.length > 0) {
      warnings.push(
        `Line ${lineNumber}: “${record.recipientType}” is not one of this event's groups, so this row was filed under ${types[0].label}.`,
      );
    }
    const type =
      matchedType ??
      types.find((candidate) => candidate.id === options.defaultType) ??
      types[0];
    const awards = type?.awards ?? [];

    const rawAward = record.award || options.defaultAward || '';
    if (!rawAward) {
      problems.push(
        `Line ${lineNumber}: "${record.studentName}" has no award. Add an Award column, or set a default award above.`,
      );
      return;
    }

    // Spelling comes from the event's configured categories, so a column of
    // "first prize" prints and speaks as "First Prize". Anything unrecognised
    // is kept exactly as typed and flagged, since it is as likely to be a
    // deliberate one-off as a typo.
    const known = matchAward(rawAward, awards);
    if (!known && awards.length > 0) {
      warnings.push(
        `Line ${lineNumber}: “${rawAward}” is not one of the prizes for ${type?.label ?? 'this group'}. It will be used exactly as written.`,
      );
    }

    rows.push({
      studentName: record.studentName,
      namePronunciation: record.namePronunciation || null,
      school: record.school || null,
      city: record.city || null,
      className: record.className || null,
      projectTitle: record.projectTitle || null,
      projectBlurb: record.projectBlurb || null,
      award: known?.name ?? rawAward,
      recipientType: type?.id ?? '',
      language: resolveLanguage(record.language ?? '', options.defaultLanguage),
    });
  });

  return { rows, problems, warnings, usedHeader };
}

/**
 * The template offered as a download.
 *
 * The columns most events actually fill in, not all ten. A template listing
 * every optional column reads as a list of things to go and find out, and the
 * five here are enough to make a certificate: the rest can be added by anyone
 * who wants them, because a header row means only the columns present are read.
 *
 * `Type` appears only when there is more than one group to sort people into,
 * and the example award is the event's own, so a downloaded template never
 * demonstrates a prize the event does not hand out.
 */
export function csvTemplate(awards: readonly string[] = [], typeLabel = ''): string {
  const columns = ['Name', 'School', 'City or state', 'Award'];
  const example = ['Ravi Kumar', 'ACTS Secondary School', 'Karnataka', awards[0] ?? 'First Prize'];

  if (typeLabel) {
    columns.push('Type');
    example.push(typeLabel);
  }

  return `${columns.join(',')}\n${example.map((cell) => `"${cell}"`).join(',')}\n`;
}

/** The columns beyond the template's, for anyone who wants them. */
export const OPTIONAL_COLUMNS = [
  'Say it like',
  'Class',
  'Project title',
  'Description',
  'Language',
] as const;

/**
 * How a row in a sheet is matched to somebody already in the list.
 *
 * Name and group, with capitals and spacing ignored, because that is what an
 * organiser means by "the same person" when they fix a spreadsheet and paste it
 * again. It follows that a corrected *name* is a new person -- there is nothing
 * left to match on -- so the screen says so rather than letting anyone assume
 * the old row went away.
 */
export function recipientKey(name: string, recipientType: string | undefined): string {
  return `${(recipientType ?? '').trim()}::${name.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}
