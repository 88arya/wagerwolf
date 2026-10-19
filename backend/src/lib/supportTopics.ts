export const SUPPORT_TOPICS = {
  contact: { subject: "Wagerwolf support" },
  issue: { subject: "Wagerwolf issue report" },
} as const;

export type SupportTopic = keyof typeof SUPPORT_TOPICS;

export function isSupportTopic(v: unknown): v is SupportTopic {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(SUPPORT_TOPICS, v);
}
