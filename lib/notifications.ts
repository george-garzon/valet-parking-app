import 'server-only';
import { ApiError, getTicket, getWelcomeMessage, claimWelcomeMessage, finishWelcomeMessage, updateWelcomeMessageContent } from './db';
import { getBusinessConfig } from './config';
import { submitTwilioMessage, SmsError } from './sms';
import { renderGuestMessage, DEFAULT_SMS_TEMPLATE } from './message-template';

export async function sendWelcomeMessage(id: number, retry = false, submit = submitTwilioMessage) {
  const message = getWelcomeMessage(id);
  if (!message) throw new ApiError('No guest message exists for this ticket.', 404);
  const config = getBusinessConfig();
  if (config.smsProvider !== 'twilio') return message;
  if (retry && !message.consent_at) throw new ApiError('Guest permission is required to send this text.', 422);
  if (!claimWelcomeMessage(id, retry)) return message;
  try {
    if (retry) {
      const ticket = getTicket(id);
      if (!ticket) throw new SmsError('The vehicle ticket is unavailable.');
      try { message.body = renderGuestMessage(ticket, config, '', process.env.SMS_TEMPLATE || DEFAULT_SMS_TEMPLATE); }
      catch { throw new SmsError('Unable to prepare the guest text. Check message template settings.'); }
      message.media_url = process.env.SMS_MEDIA_URL?.trim() || '';
      updateWelcomeMessageContent(id, message.body, message.media_url);
    }
    if (!message.body) throw new SmsError('The guest text could not be prepared. Check message template settings.');
    const sid = await submit(message, config.publicUrl);
    finishWelcomeMessage(id, 'queued', sid, null);
  } catch (error) {
    const uncertain = error instanceof SmsError && error.uncertain;
    finishWelcomeMessage(id, uncertain ? 'unknown' : 'failed', null, error instanceof SmsError ? error.message : 'Unable to submit the guest text.');
  }
  return getWelcomeMessage(id)!;
}
