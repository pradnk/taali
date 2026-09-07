import { notFound } from 'next/navigation';

import '@/app/print.css';
import { PrintableCertificate } from '@/components/printable-certificate';
import { CertificateDownloads } from '@/components/certificate-downloads';
import { PrintWarnings } from '@/components/print-warnings';
import { getCertificateByPublicId } from '@/lib/data';
import { siteUrl } from '@/lib/env';
import { certificateFileBase } from '@/lib/filename';
import { qrDataUrl } from '@/lib/qr';
import { PrintButton } from './print-button';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/c/[publicId]/print'>) {
  const { publicId } = await params;
  const row = await getCertificateByPublicId(publicId);
  // Absolute title, and an explicit description, for the same reason as the
  // certificate page itself: nothing under /c should mention the tool. Without
  // its own description this page would inherit the root layout's, which names
  // Taali.
  return {
    title: {
      absolute: row
        ? `Print — ${row.certificate.studentName} — ${row.event.orgName}`
        : 'Print certificate',
    },
    description: row
      ? `Printable certificate for ${row.certificate.studentName}, ${row.certificate.award} at ${row.event.name}.`
      : 'Printable certificate.',
    // A print sheet has no business in search results or link previews.
    robots: { index: false, follow: false },
  };
}

export default async function PrintCertificatePage({
  params,
}: PageProps<'/c/[publicId]/print'>) {
  const { publicId } = await params;
  const row = await getCertificateByPublicId(publicId);
  if (!row) notFound();

  const url = `${siteUrl()}/c/${publicId}`;

  return (
    <main id="main">
      <PrintButton label="Print this certificate" />
      <PrintWarnings
        url={url}
        notReady={row.certificate.status === 'ready' ? [] : [row.certificate.studentName]}
      />
      <CertificateDownloads
        items={[
          {
            name: row.certificate.studentName,
            fileBase: certificateFileBase(row.event.name, row.certificate.studentName),
            audioUrl: row.certificate.status === 'ready' ? row.certificate.audioUrl : null,
          },
        ]}
      />
      <PrintableCertificate
        event={row.event}
        certificate={row.certificate}
        url={url}
        qrDataUrl={await qrDataUrl(url)}
      />
    </main>
  );
}
