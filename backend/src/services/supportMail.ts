import { SUPPORT_TOPICS, type SupportTopic } from "../lib/supportTopics";

// Sent from our domain with Reply-To set to the user (sending as them fails SPF).
// Without RESEND_API_KEY this just logs and reports not delivered.
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
    console.error(`[support] provider refused (${res.status}): ${await res.text()}`);
    return false;
  }
  return true;
}
