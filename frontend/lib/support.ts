/**
 * The one support address.
 *
 * It was a constant at the top of app/contact/page.tsx and is now imported by
 * that page, the support modal and anything else that needs it — three copies
 * of an address is three places to miss when it changes.
 *
 * STILL A PLACEHOLDER. support@wagerwolf.app does not resolve: the domain is
 * registered but no mailbox or forwarding rule exists behind it yet, so mail
 * sent here bounces. Cloudflare Email Routing is free and would close it
 * without any hosting.
 */
export const SUPPORT_EMAIL = "support@wagerwolf.app";

/**
 * What each entry point into support is about, and the subject line it sends.
 *
 * The subject is the ONLY thing that sorts these once they land — there is one
 * inbox, and a question and a bug report want reading differently — so the link
 * that was pressed carries it, rather than the form asking for a category it
 * already knows.
 *
 * MIRRORED IN backend/src/lib/supportTopics.ts. Separate packages with no
 * shared build, the same deliberate duplication MAX_NFL_WEEK carries; keep the
 * keys in step.
 *
 * There is no `title` any more. Every entry point now opens the same dialog,
 * headed "Contact us" — which is the standardisation these two links were
 * quietly undoing by presenting themselves as two different things.
 */
export const SUPPORT_TOPICS = {
  contact: { subject: "Wagerwolf support" },
  issue: { subject: "Wagerwolf issue report" },
} as const;

export type SupportTopic = keyof typeof SUPPORT_TOPICS;

/**
 * A mailto: with the address and subject filled in, and nothing else.
 *
 * It used to carry a body too, composed from a textarea in the modal. That
 * textarea is gone: it asked people to write their message in a box that could
 * not send it, then handed the text to their mail client anyway — two places to
 * type one message, and a Send button that did not send. The modal now just
 * points at the address. See SupportModal.
 */
export function supportMailto(topic: SupportTopic = "contact") {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(SUPPORT_TOPICS[topic].subject)}`;
}
