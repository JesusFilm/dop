import QRCode from "qrcode";

/**
 * Renders `text` as a standalone SVG QR code (§7.5: "produces the QR … to
 * download/print/screenshot"). SVG is resolution-independent, so the same
 * markup serves the on-screen preview, a print, and a download. Rendered
 * server-side; the setup page hands the string to a client component for the
 * download affordance.
 */
export function renderQrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
  });
}
