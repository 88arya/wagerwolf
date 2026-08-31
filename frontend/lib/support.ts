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

/** A mailto: carrying whatever the person typed, so nothing is retyped. */
export function supportMailto(message: string) {
  const subject = encodeURIComponent("Wagerwolf support");
  const body = encodeURIComponent(message);
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}
