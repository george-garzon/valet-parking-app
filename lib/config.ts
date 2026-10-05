import 'server-only';
import { isSupportedCountry, type CountryCode } from 'libphonenumber-js';
import type { BusinessConfig, ParkingType } from './types';

export function getBusinessConfig(): BusinessConfig {
  const id = process.env.BUSINESS_ID?.trim() || 'parkside';
  const businessType = process.env.BUSINESS_TYPE?.trim() || 'hotel';
  if (!['hotel', 'business'].includes(businessType)) throw new Error('BUSINESS_TYPE must be hotel or business.');
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new Error('BUSINESS_ID must be a lowercase slug, up to 64 characters.');
  const timeZone = process.env.BUSINESS_TIMEZONE?.trim() || 'America/New_York';
  new Intl.DateTimeFormat('en-US', { timeZone }).format();
  const color = process.env.BRAND_PRIMARY_COLOR?.trim() || '#237766';
  if (!/^#[a-f0-9]{6}$/i.test(color)) throw new Error('BRAND_PRIMARY_COLOR must be a six-digit hex color.');
  const publicUrl = process.env.PUBLIC_APP_URL?.trim().replace(/\/$/, '') || '';
  if (publicUrl) validateUrl(publicUrl, 'PUBLIC_APP_URL');
  const logoUrl = process.env.BUSINESS_LOGO_URL?.trim() || '';
  if (logoUrl && !logoUrl.startsWith('/')) validateUrl(logoUrl, 'BUSINESS_LOGO_URL');
  if (logoUrl.startsWith('//')) throw new Error('BUSINESS_LOGO_URL must use an explicit URL or a local /path.');
  const rates = {} as Record<ParkingType, number>;
  for (const [type, name, fallback] of [['Transient', 'RATE_TRANSIENT_CENTS', 2500], ['Overnight', 'RATE_OVERNIGHT_CENTS', 4500], ['Monthly', 'RATE_MONTHLY_CENTS', 25000]] as const) {
    const raw = process.env[name]?.trim();
    const rate = raw ? Number(raw) : fallback;
    if (!Number.isSafeInteger(rate) || rate < 0 || rate > 10000000) throw new Error(`${name} must be a nonnegative integer in cents (maximum 10000000).`);
    rates[type] = rate;
  }
  const smsProvider = process.env.SMS_PROVIDER?.trim() || 'preview';
  if (!['preview', 'disabled', 'twilio'].includes(smsProvider)) throw new Error('SMS_PROVIDER must be preview, disabled, or twilio.');
  const phoneCountry = process.env.PHONE_DEFAULT_COUNTRY?.trim() || 'US';
  if (!isSupportedCountry(phoneCountry)) throw new Error('PHONE_DEFAULT_COUNTRY must be a supported two-letter country code.');
  const flag = (name: string, fallback: boolean) => {
    const raw = process.env[name]?.trim();
    if (!raw) return fallback;
    if (!['true', 'false'].includes(raw)) throw new Error(`${name} must be true or false.`);
    return raw === 'true';
  };
  const paymentsEnabled = flag('GUEST_PAYMENTS_ENABLED', false);
  const paymentRequired = flag('GUEST_PAYMENT_REQUIRED', false);
  if (paymentRequired && !paymentsEnabled) throw new Error('Required payment needs GUEST_PAYMENTS_ENABLED=true.');
  const tipPresets = (process.env.GUEST_TIP_PRESETS_CENTS || '300,500,1000').split(',').map(Number);
  if (tipPresets.length > 6 || tipPresets.some(n => !Number.isSafeInteger(n) || n <= 0 || n > 100000)) throw new Error('Tip presets must contain 1–6 positive cent amounts, maximum 100000.');
  return { paymentsEnabled, paymentRequired, tipsEnabled: flag('GUEST_TIPS_ENABLED', true), tipPresets, id, businessType: businessType as BusinessConfig['businessType'], businessName: process.env.BUSINESS_NAME?.trim() || 'The Parkside Hotel',
    brandName: process.env.APP_BRAND_NAME?.trim() || 'Porter', logoUrl, primaryColor: color, timeZone, publicUrl,
    pickupLocation: process.env.VALET_PICKUP_LOCATION?.trim() || 'the valet podium',
    rates, smsProvider: smsProvider as BusinessConfig['smsProvider'], phoneCountry: phoneCountry as CountryCode };
}
function validateUrl(value: string, name: string) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error(`${name} must be an HTTP(S) URL without credentials, query parameters, or a fragment.`);
}
