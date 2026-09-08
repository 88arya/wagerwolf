import { SUPPORT_TOPICS, type SupportTopic } from "../lib/supportTopics";

/**
 * Hands a support message to a mail provider.
 *
 * A SEAM, NOT AN INTEGRATION. With no RESEND_API_KEY set it logs and reports
 * that nothing was delivered — which is the state in development and will be
 * the state in production until the key is added. The caller writes the row
 * either way, so a message sent before the key exists is kept rather than lost,
 * and the sender is told plainly that it did not go out.
 *
 * FROM IS OURS, REPLY-TO IS THEIRS. A message cannot be sent *as* the person
 * who wrote it: `From: someone@gmail.com` on mail leaving our domain fails SPF
 * and DKIM, and lands in spam or is rejected outright. So it comes from a
 * verified address on wagerwolf.app with Reply-To set to them — replying in the
 * inbox still goes straight back, which is the behaviour that was actually
 * wanted.
 *
 * Resend rather than SES despite the app being on AWS: a new SES account is
 * sandboxed and can only send to addresses you have separately verified until
 * you file a support request to leave it, which is a day's wait discovered at
 * the worst moment. Resend is one HTTPS call and a DNS record.
 */
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function deliverSupportMessage(input: {
  email: string;
  topic: SupportTopic;
  body: string;
  userId: string | null;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.SUPPORT_INBOX;
  const from = process.env.SUPPORT_FROM;

  if (!key || !to || !from) {
    console.log(
      `[support] stored, not sent (no mail provider configured): ${input.topic} from ${input.email}`,
    );
    return false;
  }

  const who = input.userId ? `account ${input.userId}` : "signed-out visitor";

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: input.email,
      subject: SUPPORT_TOPICS[input.topic].subject,
      text: `From: ${input.email} (${who})\n\n${input.body}`,
    }),
  });

  if (!res.ok) {
    // Logged, not thrown: the row is already written, so a provider outage
    // should not turn into a 500 the sender reads as "your message vanished".
    console.error(`[support] provider refused (${res.status}): ${await res.text()}`);
    return false;
  }
  return true;
}
