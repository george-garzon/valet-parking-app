import QRCode from 'qrcode';

export function ticketQrCode(url: string) {
  return QRCode.toDataURL(url, { type: 'image/png', width: 512, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
}
