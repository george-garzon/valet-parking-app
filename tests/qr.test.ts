import { test } from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { ticketQrCode } from '../lib/qr-code';

test('downloadable PNG QR decodes to the exact guest ticket link', async () => {
  const url = 'https://valet.example.com/?ticket=0123456789abcdef0123456789abcdef0123456789abcdef';
  const image = await ticketQrCode(url);
  assert.ok(image.startsWith('data:image/png;base64,'));
  const png = PNG.sync.read(Buffer.from(image.split(',')[1], 'base64'));
  assert.equal(png.width, 512); assert.equal(png.height, 512);
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.equal(decoded?.data, url);
});
