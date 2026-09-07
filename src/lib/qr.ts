import 'server-only';
import QRCode from 'qrcode';

/**
 * QR code as a data URL, ready to drop into an <img>.
 *
 * Error correction is "M" and the module size kept generous, which is the
 * trade-off that matters: raising it to "Q" on a URL this long pushes the code
 * from 37 modules to 45, taking each one from 0.82mm down to 0.68mm inside the
 * 32mm the sheet gives it. More redundancy is worth little if the camera can no
 * longer resolve the squares -- and these get photocopied for a school file,
 * where a bigger module survives more than a cleverer one.
 *
 * `margin: 1` rather than the four modules the spec asks for, deliberately: the
 * quiet zone has to be white space on the paper, not white space inside the
 * image, and the certificate already leaves at least 5mm clear on every side of
 * the code. Putting it in the image as well would shrink each module to 0.71mm
 * to buy nothing.
 *
 * Scale is what a printer sees: at 16 the image is 624px for a 32mm box, near
 * 500dpi, so the edge of every module lands on a whole dot rather than being
 * dithered across two.
 *
 * The one thing that helps more than any of this is a shorter address. On a
 * custom domain the same code drops to 33 modules and each one grows to 0.91mm.
 */
export function qrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 1,
    scale: 16,
    color: { dark: '#0b4f4dff', light: '#ffffffff' },
  });
}
