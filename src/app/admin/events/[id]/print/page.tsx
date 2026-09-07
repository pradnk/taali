import { notFound } from 'next/navigation';

import '@/app/print.css';
import { PrintButton } from '@/app/c/[publicId]/print/print-button';
import { PrintableCertificate } from '@/components/printable-certificate';
import { CertificateDownloads } from '@/components/certificate-downloads';
import { PrintWarnings } from '@/components/print-warnings';
import { getEvent, listCertificates } from '@/lib/data';
import { siteUrl } from '@/lib/env';
import { certificateFileBase } from '@/lib/filename';
import { qrDataUrl } from '@/lib/qr';
import { recipientTypeFor, recipientTypesFor } from '@/lib/recipient-types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/admin/events/[id]/print'>) {
  const { id } = await params;
  const event = await getEvent(id);
  return { title: event ? `Print all — ${event.name}` : 'Print certificates' };
}

/**
 * Every certificate for an event, one per page.
 *
 * Printing the whole event in a single pass produces one PDF the school can
 * file or send to a print shop, which is what an organiser actually wants --
 * rather than forty-five separate downloads to collate by hand.
 */
export default async function PrintAllPage({
  params,
  searchParams,
}: PageProps<'/admin/events/[id]/print'>) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();

  const all = await listCertificates(id);
  const origin = siteUrl();

  /*
   * `?only=` narrows the page to a chosen few, which is how a selection made on
   * the recipients page arrives here: that page has the ticks, this one has the
   * certificates. An id that no longer exists is simply not found, so a stale
   * link shows fewer sheets rather than an error.
   */
  const only = String((await searchParams).only ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const rows = only.length > 0 ? all.filter((row) => only.includes(row.id)) : all;

  const types = recipientTypesFor(event);
  const pages = await Promise.all(
    rows.map(async (certificate) => {
      const url = `${origin}/c/${certificate.publicId}`;
      return { certificate, url, qr: await qrDataUrl(url) };
    }),
  );

  return (
    <main id="main">
      <PrintButton
        label={`Print all ${pages.length} certificates`}
        hint={`${pages.length} certificate${pages.length === 1 ? '' : 's'}, one per page.`}
      />
      <PrintWarnings
        url={origin}
        notReady={rows.filter((row) => row.status !== 'ready').map((row) => row.studentName)}
      />
      {pages.length > 0 && (
        <CertificateDownloads
          items={pages.map(({ certificate, url }) => ({
            name: certificate.studentName,
            fileBase: certificateFileBase(
              event.name,
              certificate.studentName,
              certificate.school,
            ),
            audioUrl: certificate.status === 'ready' ? certificate.audioUrl : null,
            sharing: {
              id: certificate.id,
              name: certificate.studentName,
              school: certificate.school ?? '',
              // Imported under the heading State; held in the city field.
              state: certificate.city ?? '',
              award: certificate.award,
              type: recipientTypeFor(types, certificate.recipientType).label,
              pageUrl: url,
              pdfUrl: certificate.pdfUrl,
            },
          }))}
          zipName={certificateFileBase(event.name, 'certificates')}
        />
      )}

      {pages.length === 0 && (
        <p className="print-hide mx-auto max-w-4xl px-5">
          {all.length === 0
            ? 'There is nobody in this event yet.'
            : 'None of the people you chose are in this event any more.'}
        </p>
      )}

      {pages.map(({ certificate, url, qr }) => (
        <PrintableCertificate
          key={certificate.id}
          event={event}
          certificate={certificate}
          url={url}
          qrDataUrl={qr}
        />
      ))}
    </main>
  );
}
