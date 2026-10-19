export const SUPPORT_EMAIL = "support@wagerwolf.app";

export const SUPPORT_TOPICS = {
  contact: { subject: "Wagerwolf support" },
  issue: { subject: "Wagerwolf issue report" },
} as const;

export type SupportTopic = keyof typeof SUPPORT_TOPICS;

export function supportMailto(topic: SupportTopic = "contact") {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(SUPPORT_TOPICS[topic].subject)}`;
}
