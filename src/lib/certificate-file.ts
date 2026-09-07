/**
 * Turns a rendered certificate into a file somebody can be sent.
 *
 * The picture is taken of the real sheet, in the browser, rather than drawn a
 * second time by a PDF library. That is the whole design: the layout lives in
 * print.css and has been tuned a great deal -- the header, the squeeze that
 * rescues a long sheet, the type that steps down to keep a name on one line --
 * and a second implementation would drift from it silently. Whatever is on
 * screen is what arrives in the recipient's inbox.
 *
 * It also means every language works without bundling a single font: the
 * browser has already drawn the Kannada or Tamil name correctly, and this only
 * photographs it.
 *
 * The cost is that the words inside the PDF are part of the picture rather than
 * selectable text.
 */

/** A4 landscape in PDF points, 72 to the inch. */
const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;

/**
 * How many pixels are captured per CSS pixel.
 *
 * The sheet is 297mm wide and lays out at 1122 CSS px, so 3x lands a little
 * over 280dpi -- enough for the QR code to survive being printed and for the
 * type to stay clean, without producing a file too big to email.
 */
const CAPTURE_SCALE = 3;

/** JPEG rather than PNG: a photograph of a page, at a tenth of the size. */
const JPEG_QUALITY = 0.92;

/**
 * Photographs one `.certificate-page` element.
 *
 * Goes through a canvas rather than asking the library for a blob directly, for
 * two reasons that both caused a blank page before: its `toBlob` hands back a
 * PNG whatever type is asked for, and a PDF that says DCTDecode over PNG bytes
 * is a file no reader can open. The canvas also knows its own size, so the
 * dimensions written into the PDF are measured rather than calculated -- they
 * disagreed by three pixels when they were calculated.
 *
 * Loaded on demand so html-to-image is not in the bundle for anyone who only
 * ever prints.
 */
export async function captureCertificate(
  page: HTMLElement,
): Promise<{ jpeg: Uint8Array; width: number; height: number }> {
  const { toCanvas } = await import('html-to-image');

  const canvas = await toCanvas(page, {
    pixelRatio: CAPTURE_SCALE,
    // The sheet is white; without this every transparent pixel turns black
    // when the canvas is flattened into a JPEG.
    backgroundColor: '#ffffff',
    // Sized from the element, or the library measures the scrollable box and
    // includes the page's own margin in the shot.
    width: page.offsetWidth,
    height: page.offsetHeight,
    style: { margin: '0', boxShadow: 'none' },
  });

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );
  if (!blob) throw new Error('The certificate could not be captured.');

  return {
    jpeg: new Uint8Array(await blob.arrayBuffer()),
    width: canvas.width,
    height: canvas.height,
  };
}

/**
 * Wraps a JPEG in a one-page A4 landscape PDF.
 *
 * Written out by hand rather than with a PDF toolkit. A PDF holding a single
 * image is a dozen objects and no compression work -- the JPEG goes in exactly
 * as it arrives, because DCTDecode is what a PDF calls a JPEG -- and a library
 * for it would be three hundred kilobytes to produce the same bytes.
 */
export function jpegToPdf(jpeg: Uint8Array, pixelWidth: number, pixelHeight: number): Blob {
  const objects: Array<string | Uint8Array> = [];

  const add = (body: string | Uint8Array) => {
    objects.push(body);
    return objects.length; // PDF object numbers start at 1
  };

  // Objects 1-5, in the order the references above expect them.
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  add(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`,
  );
  // The image fills the page exactly: the capture is already A4 landscape.
  const stream = `q ${PAGE_WIDTH} 0 0 ${PAGE_HEIGHT} 0 0 cm /Im0 Do Q`;
  add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  const image = add(
    `<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\n` +
      `stream\n`,
  );

  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;

  const push = (bytes: Uint8Array) => {
    parts.push(bytes);
    length += bytes.length;
  };
  const pushText = (text: string) => push(encoder.encode(text));

  pushText('%PDF-1.4\n');

  objects.forEach((body, index) => {
    offsets[index] = length;
    pushText(`${index + 1} 0 obj\n`);
    pushText(body as string);
    // The image object's stream data follows its dictionary verbatim.
    if (index + 1 === image) {
      push(jpeg);
      pushText('\nendstream');
    }
    pushText('\nendobj\n');
  });

  const xref = length;
  pushText(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const offset of offsets) {
    pushText(`${String(offset).padStart(10, '0')} 00000 n \n`);
  }
  pushText(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );

  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}

/** One certificate as a PDF, ready to save or drop into a ZIP. */
export async function certificatePdf(page: HTMLElement): Promise<Blob> {
  const { jpeg, width, height } = await captureCertificate(page);
  return jpegToPdf(jpeg, width, height);
}
