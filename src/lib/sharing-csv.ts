/**
 * The hand-off sheet: who gets what, and where their files are.
 *
 * A field officer distributing certificates works from a list, not from the
 * admin screens -- so this is deliberately the *same* shape as the sheet the
 * recipients were imported from, with the links added on the end. Anyone can
 * open it in Excel, sort it by school, and work down their share of it.
 */

export type SharingRow = {
  name: string;
  school: string;
  /** Held in the `city` field; the import calls the column State. */
  state: string;
  award: string;
  /** The recipient type's label, e.g. Student or Teacher. */
  type: string;
  /** The certificate's own page: the audio, the words, and a PDF to download. */
  pageUrl: string;
  /** Direct file links. Null until the files have been saved for sharing. */
  pdfUrl: string | null;
  audioUrl: string | null;
};

export const SHARING_COLUMNS = [
  'Name',
  'School',
  'State',
  'Award',
  'Type',
  'File Location',
  'Certificate PDF',
  'Audio MP3',
] as const;

/**
 * Quotes a cell the way every spreadsheet expects (RFC 4180).
 *
 * Always quoting rather than only when needed: school names carry commas often
 * enough that the difference is not worth the risk of getting the test wrong,
 * and a quoted cell reads identically once opened.
 */
function cell(value: string): string {
  return `"${(value ?? '').replace(/"/g, '""')}"`;
}

/**
 * Builds the CSV text.
 *
 * A leading BOM, because Excel on Windows otherwise reads a UTF-8 file as
 * Latin-1 and turns every Kannada or Tamil name into mojibake -- which on this
 * list would be most of it. CRLF line endings for the same audience.
 */
export function sharingCsv(rows: readonly SharingRow[]): string {
  const lines = [
    SHARING_COLUMNS.map(cell).join(','),
    ...rows.map((row) =>
      [
        row.name,
        row.school,
        row.state,
        row.award,
        row.type,
        row.pageUrl,
        row.pdfUrl ?? '',
        row.audioUrl ?? '',
      ]
        .map(cell)
        .join(','),
    ),
  ];
  return `﻿${lines.join('\r\n')}\r\n`;
}
