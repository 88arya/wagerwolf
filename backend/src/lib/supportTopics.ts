/**
 * The support entry points, and the subject line each one sends.
 *
 * MIRRORED IN frontend/lib/support.ts. Separate packages with no shared build,
 * the same deliberate duplication MAX_NFL_WEEK carries — keep the keys in step.
 * The subject is the only thing sorting these once they arrive: there is one
 * inbox, and a question and a bug report want reading differently.
 */
export const SUPPORT_TOPICS = {
  contact: { subject: "Wagerwolf support" },
  issue: { subject: "Wagerwolf issue report" },
} as const;

export type SupportTopic = keyof typeof SUPPORT_TOPICS;

export function isSupportTopic(v: unknown): v is SupportTopic {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(SUPPORT_TOPICS, v);
}
