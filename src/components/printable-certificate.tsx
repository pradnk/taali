import type { Certificate, Event } from '@/lib/db/schema';
import { isTop, isLeft } from '@/lib/logo';
import {
  recipientTypeFor,
  recipientTypesFor,
  printWordingFor,
} from '@/lib/recipient-types';
import { RichText } from '@/components/rich-text';
import { renderPrintedLines, type ScriptVars } from '@/lib/script';

/**
 * The paper version of a certificate.
 *
 * Rendered as HTML for the browser's own print-to-PDF rather than generated
 * server-side with a PDF library. That is a deliberate trade: a PDF toolkit
 * needs every script's font registered up front, and a student whose name is
 * written in Kannada or Tamil would otherwise come out as a row of empty boxes.
 * The browser already has those fonts and shapes them correctly, so printing
 * from the page is both simpler and more correct for this audience.
 *
 * The layout is also built for low vision: very large type, a 7:1 contrast
 * ratio and no decorative script faces.
 *
 * The address is carried by the QR code alone and is not printed as text. It
 * used to be, on the reasoning that someone who cannot scan a code could still
 * type it -- but a deployment URL runs to seventy characters, which is not
 * something anyone types accurately and which dominated the foot of the sheet.
 * The full address is still in the QR image's alt text, so a screen reader
 * reading the print page aloud reaches it.
 *
 * Two arrangements are offered; see lib/certificate-layout.ts. Whichever is
 * chosen, the outer `certificate-page` and `certificate-frame` elements and the
 * recipient's `certificate-name` keep those class names: components/
 * print-warnings.tsx measures the sheet through them and names the recipient
 * whose certificate will not fit, and it fails silently if they move.
 *
 * `data-fit` marks the lines that are meant to stay on one line -- the name,
 * and where the recipient is from. A long name wrapping costs more height than
 * anything else on the sheet, so those two are measured in the browser and
 * stepped down a little when they do not fit. See fitLines in print-warnings.
 */
export function PrintableCertificate({
  event,
  certificate,
  url,
  qrDataUrl,
}: {
  event: Event;
  certificate: Certificate;
  url: string;
  qrDataUrl: string;
}) {
  return (
    <article className="certificate-page">
      {/* The layout is on the frame so that print.css can tune the shared
          blocks -- the partner band especially -- for the sheet they land on.
          `certificate-frame` itself stays, because print-warnings.tsx measures
          the sheet through it. */}
      <div className={`certificate-frame certificate-frame-${event.certificateLayout}`}>
        {event.certificateLayout === 'centred' ? (
          <CentredBody event={event} certificate={certificate} url={url} qrDataUrl={qrDataUrl} />
        ) : (
          <ClassicBody event={event} certificate={certificate} url={url} qrDataUrl={qrDataUrl} />
        )}
      </div>
    </article>
  );
}

type BodyProps = {
  event: Event;
  certificate: Certificate;
  url: string;
  qrDataUrl: string;
};

/**
 * Substitutions available to the printed wording.
 *
 * The same names the spoken templates use, so somebody who has already learned
 * `{{name}}` and `[[from {{location}}]]` on the wording screen does not have to
 * learn a second vocabulary for the sheet. `location` is pre-joined for the
 * same reason it is in buildScript: separate school and city blocks would
 * introduce a recipient with a city but no school as "Ravi Kumar Bengaluru".
 */
function printVars(event: Event, certificate: Certificate): ScriptVars {
  const role = recipientTypeFor(recipientTypesFor(event), certificate.recipientType).label;
  return {
    // Two cases, because a shared sentence needs both: "as a {{role}}"
    // mid-sentence, and "{{Role}} of the Year" at the start of one.
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
}

/** "This certificate speaks", and the code that makes it true. */
function ListenBlock({ url, qrDataUrl }: { url: string; qrDataUrl: string }) {
  return (
    <>
      <div className="certificate-listen">
        <p className="certificate-listen-title">This certificate speaks.</p>
        <p className="certificate-listen-body">
          Point a phone camera at the code to hear it read aloud, with the applause it was given.
        </p>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- a data URL that must survive printing */}
      <img src={qrDataUrl} alt={`QR code linking to ${url}`} className="certificate-qr" />
    </>
  );
}

/**
 * Scanned signatures, under the sign-off.
 *
 * They sit in the room the QR code opposite already reserves, so signing a
 * certificate costs it no height. The count is a data attribute rather than a
 * class per number, so print.css decides how one, two or three are spaced
 * without this component knowing anything about millimetres.
 */
function Signatures({ event }: { event: Event }) {
  if (event.signatures.length === 0) return null;

  return (
    <ul className="certificate-signatures" data-count={event.signatures.length}>
      {event.signatures.map((signature) => (
        <li key={signature.url}>
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary Blob or static URL; next/image cannot participate in a print layout */}
          <img
            src={signature.url}
            /* Named, by the same rule as the supporters: who signed appears in
               no text on the sheet, so an empty alt would erase them. */
            alt={signature.name}
            className="certificate-signature"
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * The presenting organisation's mark.
 *
 * The alt text is the caller's to decide, because the right answer depends on
 * the layout, and the rule is the same one that governs every image here: an
 * alt is empty only when the same name is already printed beside the picture.
 * The classic sheet prints the organisation's name directly under the event's,
 * so there the logo is decorative in the precise sense of the word. The centred
 * sheet prints that name nowhere, so an empty alt there would erase the
 * organisation from the certificate for anyone who cannot see it.
 */
function OrganisationLogo({ event, alt }: { event: Event; alt: string }) {
  if (!event.logoUrl) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary Blob or static URL; next/image cannot participate in a print layout
    <img src={event.logoUrl} alt={alt} className="certificate-logo" />
  );
}

/**
 * The row of co-organiser and supporter marks.
 *
 * The label sits above the row in a header and beside it in a foot band: over a
 * band that spans the sheet an inline caption reads as part of the row, while
 * in a header the row is narrow and a caption beside it would crowd whatever
 * shares the line.
 */
function PartnerLogos({ event, withLabel }: { event: Event; withLabel: boolean }) {
  if (event.partnerLogos.length === 0) return null;
  const label = withLabel ? event.partnerLabel.trim() : '';

  return (
    <section className="certificate-partners">
      {label && <p className="certificate-partners-label">{label}</p>}
      <div className="certificate-partners-row">
        {event.partnerLogos.map((partner) => (
          // eslint-disable-next-line @next/next/no-img-element -- next/image cannot participate in a print layout
          <img
            key={partner.url}
            src={partner.url}
            /* Named, by the same rule: these appear in no text on the sheet. */
            alt={partner.name}
            className="certificate-partner-logo"
          />
        ))}
      </div>
    </section>
  );
}

/** The original arrangement: a ruled header, then everything aligned left. */
function ClassicBody({ event, certificate, url, qrDataUrl }: BodyProps) {
  const details = [certificate.school, certificate.city].filter(Boolean).join(', ');
  const logoAtTop = event.logoUrl && isTop(event.logoPosition);
  const logoAtBottom = event.logoUrl && !isTop(event.logoPosition);
  const side = isLeft(event.logoPosition) ? 'start' : 'end';
  const partnersAtTop = event.partnerLogoPosition === 'top-right';

  // Empty alt: this layout prints the organisation's name a few millimetres
  // below, so a text alternative would only have a screen reader say it twice.
  const logo = <OrganisationLogo event={event} alt="" />;

  return (
    <>
      <header className={`certificate-header certificate-band-${side}`}>
        {logoAtTop && logo}
        <div className="certificate-heading">
          <p className="certificate-event">{event.name}</p>
          {/*
            No date on the sheet. What matters years later is whose award it was,
            not which afternoon it was handed over. `{{date}}` is still a
            placeholder the wording can use if an event wants it back.
          */}
          <p className="certificate-org">{event.orgName}</p>
        </div>
        {partnersAtTop && <PartnerLogos event={event} withLabel />}
      </header>

      <p className="certificate-lead">
        <RichText lines={renderPrintedLines(event.printWording.lead, printVars(event, certificate))} />
      </p>
      <h1 className="certificate-name" data-fit="name">
        {certificate.studentName}
      </h1>

      {details && (
        <p className="certificate-detail" data-fit="line">
          {details}
        </p>
      )}

      <p className="certificate-award">{certificate.award}</p>

      {certificate.projectTitle && (
        <p className="certificate-project">
          for their exhibit, “{certificate.projectTitle}”
          {certificate.projectBlurb ? ` — ${certificate.projectBlurb}` : ''}
        </p>
      )}

      <footer className={`certificate-footer certificate-band-${side}`}>
        {logoAtBottom && logo}
        <ListenBlock url={url} qrDataUrl={qrDataUrl} />
      </footer>

      {/*
        A sibling after the footer rather than a child of it: the footer
        carries `margin-top: auto`, so anything following it lands at the very
        bottom of the sheet without disturbing the three-slot row of logo,
        listen block and QR code.
      */}
      {!partnersAtTop && <PartnerLogos event={event} withLabel />}
    </>
  );
}

/**
 * A title across the top, then the recipient centred beneath it.
 *
 * Carries the prize, as the classic layout does -- whether that reads "First
 * Prize" or "Certificate of Participation", it is what the recipient was given
 * and what the recording announces, so leaving it off the paper would have the
 * sheet and the audio disagree.
 *
 * The exhibit and its description are still left off. They are the one part of
 * a certificate that runs to several lines and varies wildly in length, which
 * is what a fixed-height centred block can least afford.
 */
function CentredBody({ event, certificate, url, qrDataUrl }: BodyProps) {
  const vars = printVars(event, certificate);
  // Printed wording keeps its line breaks and its bold markers; see
  // lib/rich-text.ts. Everything spoken goes through renderTemplate instead,
  // which strips both.
  const line = (template: string) => renderPrintedLines(template, vars);

  // Resolved once, prize over group over event, rather than reaching for the
  // event's copy field by field and losing track of which ones can be overridden.
  const wording = printWordingFor(
    recipientTypeFor(recipientTypesFor(event), certificate.recipientType),
    certificate.award,
    event.printWording,
  );

  const title = line(wording.title);
  const lead = line(wording.lead);
  const fromLine = line(wording.fromLine);
  const recognition = line(wording.recognition);
  const closing = line(wording.closing);
  const signature = line(wording.signature);
  const partnersAtTop = event.partnerLogoPosition === 'top-right';
  const side = isLeft(event.logoPosition) ? 'start' : 'end';
  const namePlace = event.eventNamePosition;

  return (
    <>
      {/*
        The organisation's mark and the event's name read as one lockup at one
        end, the supporters at the other. `certificate-band-*` is the same class
        pair the classic header uses to flip the logo to the other side of the
        name, reused rather than reinvented.

        This layout has a single logo band, so only left and right are
        meaningful: a bottom position lands here too rather than dropping the
        logo off the sheet, which is what happened before the centred layout
        looked at `logoUrl` at all.
      */}
      {/*
        Three columns, so the middle one is centred on the sheet rather than on
        whatever space the marks leave over. The outer two are equal fractions
        even when one is empty, which is what keeps the name on the centre line
        when only one side carries a logo.
      */}
      <header className={`certificate-centred-header certificate-centred-header-${namePlace}`}>
        <div className={`certificate-centred-brand certificate-band-${side}`}>
          <OrganisationLogo event={event} alt={event.orgName} />
          {namePlace === 'left' && <p className="certificate-centred-event">{event.name}</p>}
        </div>
        {namePlace === 'centre' && <p className="certificate-centred-event">{event.name}</p>}
        {partnersAtTop && <PartnerLogos event={event} withLabel />}
      </header>

      {title.length > 0 && (
        <p className="certificate-centred-title">
          <RichText lines={title} />
        </p>
      )}

      <div className="certificate-centred-body">
        {lead.length > 0 && (
          <p className="certificate-centred-lead">
            <RichText lines={lead} />
          </p>
        )}
        <h1 className="certificate-name certificate-centred-name" data-fit="name">
          {certificate.studentName}
        </h1>
        {fromLine.length > 0 && (
          <p className="certificate-centred-from" data-fit="line">
            <RichText lines={fromLine} />
          </p>
        )}
        {certificate.award.trim() && (
          <p className="certificate-award certificate-centred-award">{certificate.award}</p>
        )}
        {recognition.length > 0 && (
          <p className="certificate-centred-recognition">
            <RichText lines={recognition} />
          </p>
        )}
        {closing.length > 0 && (
          <p className="certificate-centred-closing">
            <RichText lines={closing} />
          </p>
        )}
      </div>

      {/*
        Sign-off on the left, the code on the right. The logos do not join this
        row: signature, three logos, the listen text and a 32mm code need about
        250mm across a 243mm sheet, and the row that results squeezes the listen
        text into a column one word wide.
      */}
      <footer className="certificate-centred-footer">
        <div className="certificate-centred-signoff">
          <p className="certificate-centred-signature">
            <RichText lines={signature} />
          </p>
          <Signatures event={event} />
        </div>
        <div className="certificate-centred-listen">
          <ListenBlock url={url} qrDataUrl={qrDataUrl} />
        </div>
      </footer>

      {!partnersAtTop && <PartnerLogos event={event} withLabel />}
    </>
  );
}
