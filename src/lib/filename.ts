/**
 * Builds the filename a family actually sees when the MP3 lands in their chat.
 *
 * Unicode letters are kept rather than stripped to ASCII: a student whose name
 * is written in Kannada should get a file named in Kannada, and every platform
 * this touches handles UTF-8 filenames. Only characters that are genuinely
 * unsafe in a path or URL are removed.
 *
 * `school` is passed for the bulk downloads, where one ZIP holds everybody and
 * the organiser has to be able to tell a Nisha from a Nisha before forwarding
 * anything. A single download leaves it out: there is nothing to confuse it
 * with, and the shorter name is the kinder one to receive.
 */

/**
 * Long enough to carry a school, short enough that a folder and the file inside
 * it still fit inside Windows' 260-character path limit once unzipped.
 */
const MAX_BASE = 100;

/*
 * Letters, digits and *marks*. The marks matter: a Kannada vowel sign is a
 * combining mark rather than a letter, so dropping them turns ನಿಶಾ into ನ-ಶ --
 * not a shortening of the name but a different string altogether, and one that
 * two different names can collapse onto. Everything else becomes a hyphen.
 */
function part(value: string): string {
  return value
    .trim()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

export function certificateFileBase(
  eventName: string,
  studentName: string,
  school?: string | null,
): string {
  const lead = [part(eventName), part(studentName)].filter(Boolean).join('-');
  const tail = school ? part(school) : '';
  if (!tail) return (lead || 'certificate').slice(0, MAX_BASE);

  /*
   * The school is what tells two people of one name apart, so it earns its
   * place -- but school names run long ("Ranga Rao Memorial School for
   * Differently Abled" is 45 characters) and a blind slice would cut one mid
   * word, and could cut two different schools down to the same string. Whole
   * words come off the end instead, and the name itself is never sacrificed.
   */
  const words = tail.split('-');
  while (words.length > 0 && `${lead}-${words.join('-')}`.length > MAX_BASE) words.pop();

  const base = words.length > 0 ? `${lead}-${words.join('-')}` : lead;
  return (base || 'certificate').slice(0, MAX_BASE);
}

export type NamedEntry = {
  /** The person, as they should be named in a warning. */
  name: string;
  fileBase: string;
};

export type FileBaseResult = {
  /** What to actually call each entry's file or folder, in the same order. */
  bases: string[];
  /** Entries sharing a name, so the operator can be told to fix the data. */
  clashes: { base: string; names: string[] }[];
};

/**
 * Settles the names within one download so that no two can collide.
 *
 * A ZIP with two entries of one name keeps only the last, so a clash means
 * somebody silently loses their certificate. Name and school together should
 * be unique; where they are not, the data is wrong and the operator is the only
 * one who can put it right -- so this reports the clash rather than papering
 * over it. It still numbers the repeats, so that a download taken before the
 * data is corrected is short a good name rather than short a certificate.
 */
export function resolveFileBases(entries: readonly NamedEntry[]): FileBaseResult {
  const seen = new Map<string, number>();
  const grouped = new Map<string, string[]>();

  const bases = entries.map((entry) => {
    const count = (seen.get(entry.fileBase) ?? 0) + 1;
    seen.set(entry.fileBase, count);
    grouped.set(entry.fileBase, [...(grouped.get(entry.fileBase) ?? []), entry.name]);
    return count === 1 ? entry.fileBase : `${entry.fileBase}-${count}`;
  });

  const clashes = [...grouped]
    .filter(([, names]) => names.length > 1)
    .map(([base, names]) => ({ base, names }));

  return { bases, clashes };
}
