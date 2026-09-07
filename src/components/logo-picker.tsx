'use client';

import { useRef, useState } from 'react';

import { Alert, Button, Field, Select } from '@/components/ui';
import type { CertificateLayout } from '@/lib/certificate-layout';
import {
  LOGO_CONTENT_TYPES,
  LOGO_POSITIONS,
  isLeft,
  isTop,
  type LogoPosition,
} from '@/lib/logo';

/**
 * Choose an organisation logo and where it sits on the certificate.
 *
 * Shared by the create-event form and the event settings page so both behave
 * identically. The preview is a miniature of the printed sheet rather than just
 * a thumbnail of the image, because the question being answered is "does it sit
 * right on the certificate", not "is this the right file".
 */
export function LogoPicker({
  logoUrl,
  logoPosition,
  layout,
  onChange,
  disabled,
}: {
  logoUrl: string | null;
  logoPosition: LogoPosition;
  /**
   * Which printed arrangement is selected. The two treat this setting
   * differently, and a picker that promised four corners while the sheet
   * honoured two would be worse than one that says so.
   */
  layout: CertificateLayout;
  onChange: (next: { logoUrl: string | null; logoPosition: LogoPosition }) => void;
  disabled?: boolean;
}) {
  // The centred sheet has one logo band, across the top, so only the side is
  // meaningful there; a bottom position lands in that band too.
  const oneBand = layout === 'centred';
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/admin/logo', { method: 'POST', body: form });
      const body = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !body.url) {
        throw new Error(body.error ?? `Upload failed (${response.status}).`);
      }
      onChange({ logoUrl: body.url, logoPosition });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not upload that image.');
    } finally {
      setUploading(false);
      // Let the same file be chosen again after a failure.
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="logo-file"
          label="Organisation logo (optional)"
          hint="PNG, JPEG, WebP or SVG, under 2 MB. A version with a transparent or white background works best."
        >
          {(props) => (
            <input
              {...props}
              ref={inputRef}
              type="file"
              accept={LOGO_CONTENT_TYPES.join(',')}
              disabled={disabled || uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
              className="min-h-11 w-full rounded-lg border-2 border-line bg-paper px-3 py-2"
            />
          )}
        </Field>

        <Field
          id="logo-position"
          label="Where it sits"
          hint={
            oneBand
              ? 'The centred layout runs the logo across the top beside the event name, so only left and right change anything. On the certificate page it sits in the header.'
              : 'One of the four corners of the printed sheet. On the certificate page, top and bottom become the header and the footer.'
          }
        >
          {(props) => (
            <Select
              {...props}
              value={logoPosition}
              disabled={disabled || !logoUrl}
              onChange={(event) =>
                onChange({ logoUrl, logoPosition: event.target.value as LogoPosition })
              }
            >
              {LOGO_POSITIONS.map((position) => (
                <option key={position.value} value={position.value}>
                  {position.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {uploading && <p aria-live="polite">Uploading…</p>}
      {error && <Alert>{error}</Alert>}

      {logoUrl && (
        <div className="flex flex-wrap items-start gap-5">
          <LogoPreview logoUrl={logoUrl} logoPosition={logoPosition} oneBand={oneBand} />
          <Button
            variant="danger"
            disabled={disabled}
            onClick={() => onChange({ logoUrl: null, logoPosition })}
          >
            Remove logo
          </Button>
        </div>
      )}
    </div>
  );
}

/** A miniature of the printed sheet, showing where the logo will land. */
function LogoPreview({
  logoUrl,
  logoPosition,
  oneBand,
}: {
  logoUrl: string;
  logoPosition: LogoPosition;
  oneBand: boolean;
}) {
  const vertical = oneBand || isTop(logoPosition) ? 'items-start' : 'items-end';
  const horizontal = isLeft(logoPosition) ? 'justify-start' : 'justify-end';

  return (
    <figure className="m-0">
      <div
        // 297:210 is A4 landscape, so the preview is proportioned like the sheet.
        className={`flex aspect-[297/210] w-56 rounded border-2 border-teal-800 bg-paper p-3 ${vertical} ${horizontal}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary Blob URL */}
        <img src={logoUrl} alt="" className="max-h-8 max-w-20 object-contain" />
      </div>
      <figcaption className="mt-1 text-sm text-ink-soft">
        Preview of the printed certificate
      </figcaption>
    </figure>
  );
}
