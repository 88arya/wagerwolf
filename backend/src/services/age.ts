/**
 * The age gate.
 *
 * Wagerwolf plays with fake money, so no statutory gambling age applies to it
 * anywhere. This gate exists for three other reasons, and it is worth being
 * clear which: app store review and ad networks both ask; the product
 * deliberately looks and reads like a sportsbook, which `app/responsible-
 * gaming` says in its own header and which is enough to pull someone with a
 * gambling problem; and "we never checked" is a bad answer to a parent.
 *
 * ONE GLOBAL NUMBER, deliberately. 18 is the floor across most of the English-
 * speaking world — UK, Australia, Ireland — and clears the app stores'
 * simulated-gambling threshold. It is not 19 (Ontario and most of Canada, but
 * not Alberta, Manitoba or Quebec) and not 21 (US real-money sportsbooks),
 * because picking either would fit one jurisdiction and misfit the rest.
 *
 * A TICKBOX, NOT A BIRTHDATE. This used to collect a `dateOfBirth` and check it
 * against MIN_AGE. The date bought exactly one thing a tick does not: it can be
 * re-evaluated. If the threshold ever has to move, stored dates answer "who is
 * still eligible" with a query, where a tick answers it only by asking everyone
 * again. Against that: a date input was the highest-friction field in sign-up,
 * and both forms are self-attested, so neither is evidence of anything.
 *
 * WHAT THIS IS WORTH: nothing, as verification. Anyone willing to tick a box
 * gets through, exactly as anyone willing to type a false date did. What it
 * buys is that the question was put, and that the answer and its timestamp are
 * on record — `User.ageConfirmedAt`. That is the whole of what a self-attested
 * gate has ever bought. Do not mistake it for verification.
 */

export const MIN_AGE = 18;
