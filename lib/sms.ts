import 'server-only';
import type { GuestMessage } from './types';

export class SmsError extends Error {
  constructor(message: string, public uncertain = false) { super(message); }
}
export async function submitTwilioMessage(message: GuestMessage, publicUrl: string, send: typeof fetch = fetch) {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim() || '';
  const token = process.env.TWILIO_AUTH_TOKEN?.trim() || '';
  const service = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() || '';
  const from = process.env.TWILIO_FROM_NUMBER?.trim() || '';
  if (!/^AC[a-f0-9]{32}$/i.test(sid) || !token || (!service && !from)) throw new SmsError('SMS account or sender settings are missing. Contact your administrator.');
  if (service && !/^MG[a-f0-9]{32}$/i.test(service)) throw new SmsError('SMS Messaging Service settings are invalid. Contact your administrator.');
  if (!service && !/^\+[1-9]\d{7,14}$/.test(from)) throw new SmsError('SMS sender number must use international format.');
  let url: URL;
  try { url = new URL(publicUrl); } catch { throw new SmsError('Configure the public guest URL before sending texts.'); }
  if (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new SmsError('Guest texts require a public HTTPS app URL. Contact your administrator.');
  const data = new URLSearchParams({ To: message.to_phone, Body: message.body });
  if (service) data.set('MessagingServiceSid', service); else data.set('From', from);
  if (message.media_url) {
    let media: URL;
    try { media = new URL(message.media_url); } catch { throw new SmsError('The guest message image URL is invalid.'); }
    if (media.protocol !== 'https:') throw new SmsError('Guest message images require a public HTTPS URL.');
    data.set('MediaUrl', message.media_url);
  }
  let response: Response;
  try {
    response = await send(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: data, signal: AbortSignal.timeout(8000), redirect: 'error',
    });
  } catch { throw new SmsError('Text submission could not be confirmed. Check the SMS provider before trying again.', true); }
  if (!response.ok) throw new SmsError(`The SMS provider rejected this text (HTTP ${response.status}).`, response.status >= 500);
  let result: { sid?: string; status?: string };
  try { result = await response.json(); } catch { throw new SmsError('Text submission could not be confirmed. Check the SMS provider.', true); }
  if (!result.sid || !/^SM[a-f0-9]{32}$/i.test(result.sid)) throw new SmsError('Text submission could not be confirmed. Check the SMS provider.', true);
  if (['failed', 'undelivered', 'canceled'].includes(result.status || '')) throw new SmsError('The SMS provider could not submit this text.');
  return result.sid;
}
