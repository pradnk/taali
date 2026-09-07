import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getCertificateByPublicId } from '@/lib/data';
import type { ScriptSnapshot } from '@/lib/db/schema';
import { certificateFileBase } from '@/lib/filename';
import { isLeft, isTop } from '@/lib/logo';
import {
  recipientTypeFor,
  recipientTypesFor,
  printWordingFor,
} from '@/lib/recipient-types';
import { RichText } from '@/components/rich-text';
import { renderPrintedLines } from '@/lib/script';
import { CertificatePlayer } from './player';

export async function generateMetadata({ params }: PageProps<'/c/[publicId]'>): Promise<Metadata> {
  const { publicId } = await params;
  const row = await getCertificateByPublicId(publicId);
  if (!row) return { title: 'Certificate not found' };

  const title = `${row.certificate.studentName} — ${row.certificate.award}`;
  return {
    /*
     * Absolute, so the root layout's "— Taali" suffix is not appended. The
     * certificate belongs to the student and to the organisation presenting it;
     * the tool that produced it has no business in the browser tab, the link
     * preview, or anywhere else on this page.
     */
    title: { absolute: `${title} — ${row.event.orgName}` },
    description: `${row.certificate.award} at ${row.event.name}, presented by ${row.event.orgName}. Listen to this certificate.`,
    openGraph: {
      title,
      description: `${row.certificate.award} at ${row.event.name}`,
      type: 'website',
    },
  };
}

/**
 * A single certificate, as heard and as read.
 *
 * The transcript below the player is rendered from the stored script snapshot,
 * so it is word-for-word what the audio says. That matters more than it looks:
 * it means the page is complete for someone whose screen reader is their
 * primary way through it, for someone who cannot play audio right now, and for
 * a search engine or a link preview.
 */
export default async function CertificatePage({ params }: PageProps<'/c/[publicId]'>) {
  const { publicId } = await params;
  const row = await getCertificateByPublicId(publicId);
  if (!row) notFound();

  const { certificate, event } = row;
  const snapshot = certificate.scriptSnapshot as ScriptSnapshot | null;
  const audioUrl = certificate.status === 'ready' ? certificate.audioUrl : null;

  // Shared with the printed sheet so the two never disagree. Rendered through
  // the same substituter the spoken templates use, so `[[optional blocks]]`
  // drop out here exactly as they do on paper.
  const type = recipientTypeFor(recipientTypesFor(event), certificate.recipientType);
  const role = type.label;
  const printVars = {
    role: role.toLowerCase(),
    Role: role,
    event: event.name,
    org: event.orgName,
    date: event.eventDate,
    venue: event.venue,
    name: certificate.studentName,
    school: certificate.school,
    city: certificate.city,
    class: certificate.className,
    projectTitle: certificate.projectTitle,
    blurb: certificate.projectBlurb,
    award: certificate.award,
    location: [certificate.school, certificate.city]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(', '),
  };
  const wording = printWordingFor(type, certificate.award, event.printWording);
  // The same lines the sheet carries, with their breaks and their bold intact.
  const lead = renderPrintedLines(wording.lead, printVars);
  const recognition = renderPrintedLines(wording.recognition, printVars);
  const closing = renderPrintedLines(wording.closing, printVars);

  /*
   * A web page has no corners the way an A4 sheet does, so the position setting
   * maps onto the two bands it does have: top puts the logo in the header,
   * bottom in the footer, and left/right decides the side within that band.
   *
   * The alt depends on which band it lands in, under the rule that governs every
   * image here: empty only when the same name is already text beside it. The
   * footer says "Presented by ..." right next to the logo, so there it is
   * decorative. The header says only the event's name, so there the logo is the
   * one thing carrying the organisation and has to say so.
   */
  const logoAtTop = Boolean(event.logoUrl) && isTop(event.logoPosition);
  const logo = event.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary Blob URL from an untyped host
    <img
      src={event.logoUrl}
      alt={logoAtTop ? event.orgName : ''}
      className="max-h-16 max-w-36 object-contain"
    />
  ) : null;

  return (
    <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-5 py-10 sm:py-16">
      <article>
        {/*
          A matching spacer opposite the logo, so the name lands on the middle of
          the column rather than the middle of what the logo leaves over. Narrow
          on a phone, where every millimetre of the heading's width counts.
        */}
        <header className="mb-8 flex items-center gap-4 border-b-4 border-teal-800 pb-6">
          {logoAtTop && <span className="w-16 shrink-0 sm:w-24">{logo}</span>}
          <div className="flex-1 text-center">
            {/*
              The event's name and nothing else. The organisation is named in the
              footer, under "Presented by", where it belongs on a page whose
              subject is the person the certificate is for.
            */}
            <p className="text-2xl font-bold tracking-wide text-teal-800 uppercase sm:text-3xl">
              {event.name}
            </p>
          </div>
          {logoAtTop && <span className="w-16 shrink-0 sm:w-24" aria-hidden="true" />}
        </header>

        {/*
          Centred to match the printed sheet, so the two read as the same
          certificate. It stops here: the transcript below is several paragraphs
          of prose, and centred prose is genuinely harder to track line to line
          for the readers this page exists for. Short lines can carry it; a long
          read cannot.

          The wording is whatever Settings resolved -- a group's or a prize's own
          line if it has one -- and only its alignment is decided here.
        */}
        <div className="text-center">
          {lead.length > 0 && (
            <p className="text-xl text-ink-soft">
              <RichText lines={lead} />
            </p>
          )}
          <h1 className="mt-1 mb-4 text-5xl leading-tight font-bold text-balance sm:text-6xl">
            {certificate.studentName}
          </h1>

          <p className="inline-block rounded-lg bg-teal-100 px-4 py-2 text-2xl font-bold text-teal-900">
            {certificate.award}
          </p>

          {(recognition.length > 0 || closing.length > 0) && (
            <div className="mt-6 flex flex-col gap-3 text-xl leading-relaxed text-balance">
              {recognition.length > 0 && (
                <p>
                  <RichText lines={recognition} />
                </p>
              )}
              {closing.length > 0 && (
                <p className="font-bold">
                  <RichText lines={closing} />
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-8">
        {audioUrl ? (
          <CertificatePlayer
            audioUrl={audioUrl}
            studentName={certificate.studentName}
            downloadName={`${certificateFileBase(event.name, certificate.studentName)}.mp3`}
          />
        ) : (
          <p className="rounded-lg border-2 border-line bg-paper-sunk px-4 py-5 text-lg">
            The audio for this certificate is not ready yet. The written version is below, and the
            recording will appear here once it has been made.
          </p>
        )}
        </div>

        {/* A verbatim transcript. It repeats the name and award shown above,
            which is the point: this is exactly what the recording says, so the
            page is complete for anyone who cannot or would rather not play it.
            The heading makes the repetition read as deliberate. */}
        <section
          aria-labelledby="citation-heading"
          className="mt-12 rounded-xl border-2 border-line bg-paper-sunk p-6"
        >
          <h2 id="citation-heading" className="mb-4 text-2xl font-bold">
            Word for word, what you will hear
          </h2>

          {snapshot ? (
            <div className="flex flex-col gap-3 text-xl leading-relaxed">
              {snapshot.segments.map((segment, index) => (
                <p key={`${segment.id}-${index}`}>
                  {segment.id === 'name' ? (
                    <strong className="text-2xl">{segment.text}</strong>
                  ) : (
                    segment.text
                  )}
                </p>
              ))}
            </div>
          ) : (
            // Falls back to the stored details when a certificate has been
            // entered but not yet generated, so the page is never empty.
            <div className="flex flex-col gap-3 text-xl leading-relaxed">
              <p>
                {certificate.studentName}
                {certificate.school && `, from ${certificate.school}`}
                {certificate.city && `, ${certificate.city}`}.
              </p>
              {certificate.projectTitle && <p>Exhibit: {certificate.projectTitle}</p>}
              {certificate.projectBlurb && <p>{certificate.projectBlurb}</p>}
              <p>{certificate.award}</p>
            </div>
          )}
        </section>

        <p className="mt-8">
          <Link
            href={`/c/${publicId}/print`}
            className="inline-flex min-h-14 items-center rounded-lg border-2 border-line px-5 text-lg font-bold text-teal-900 hover:bg-teal-50"
          >
            Print this certificate
          </Link>
        </p>

        <footer className="mt-14 border-t-2 border-line pt-6 text-ink-soft">
          <div
            className={`flex items-end gap-5 ${
              !logoAtTop && isLeft(event.logoPosition) ? 'flex-row-reverse justify-end' : ''
            }`}
          >
            <div className="flex-1">
              {/*
                * No link to any particular organisation's website here. This page
                * is rendered for whichever organisation presented the award, so a
                * hardcoded one would send another charity's families somewhere
                * else entirely.
                */}
              <p>
                Presented by {event.orgName}
                {event.venue && ` at ${event.venue}`}.
              </p>
            </div>
            {!logoAtTop && logo}
          </div>

          {/*
            The same caption the printed sheet carries, so the two agree on what
            this row is. It is a heading for the list rather than a sentence, and
            `aria-labelledby` ties the two together so a screen reader announces
            the group before reading the names out of it.
          */}
          {event.partnerLogos.length > 0 && (
            <section
              // Only when there is a heading to point at: a dangling reference
              // leaves the section unnamed and the attribute lying about it.
              aria-labelledby={event.partnerLabel.trim() ? 'partners-heading' : undefined}
              // Shrink-wrapped around the logos so that centring the caption
              // centres it over them. As a full-width block its own middle is
              // the column's middle, which is nowhere near the marks it labels.
              className="mt-6 w-fit max-w-full"
            >
              {event.partnerLabel.trim() && (
                <h2
                  id="partners-heading"
                  className="mb-2 text-center text-sm font-bold tracking-wide uppercase"
                >
                  {event.partnerLabel}
                </h2>
              )}
            <ul className="flex flex-wrap items-center gap-x-8 gap-y-4">
              {event.partnerLogos.map((partner) => (
                <li key={partner.url}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary Blob or static URL from an untyped host */}
                  <img
                    src={partner.url}
                    /* A real alt: these names appear in no text on the page. */
                    alt={partner.name}
                    className="max-h-12 max-w-32 object-contain"
                  />
                </li>
              ))}
            </ul>
            </section>
          )}
        </footer>
      </article>
    </main>
  );
}
