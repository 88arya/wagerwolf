/**
 * What the scheduler's worker does with one job, apart from the queue, so it can
 * be tested without Redis or a database. scheduler.ts wires it into BullMQ.
 *
 * A step inside a job failing is reported through `fail`, in place of the bare
 * `console.error` every catch in scheduler.ts used to end with.
 *
 * THOSE CATCHES STAY, and they are right: one league failing to auto-start must
 * not stop the next, and a failed resolve must not cancel the allowance pass.
 * What was wrong is that they were the END of the story. Each one logged and
 * returned normally, so every job completed "successfully" whatever happened
 * inside it, and BullMQ's `failed` event, the one place built to notice, never
 * fired for any of them.
 *
 * Now each failure is reported where it happens and recorded, and the job fails
 * once every step has had its turn. Isolation is kept, and the job's outcome
 * finally says what happened.
 */
import { reportError } from "../lib/monitoring";
import { heartbeat as sendHeartbeat } from "../lib/heartbeat";

export type Fail = (step: string, err: unknown) => void;
export type Handler = (fail: Fail) => Promise<void>;

/**
 * Steps named in a StepsFailed message. The message is stored on the failed job
 * in Redis and shown in logs, and a week where every league fails to auto-start
 * would otherwise write one entry per league into it.
 */
export const MAX_NAMED_STEPS = 10;

/** Thrown after the steps ran; each one was already reported. */
export class StepsFailed extends Error {
  constructor(job: string, public readonly steps: string[]) {
    const named = steps.slice(0, MAX_NAMED_STEPS).join("; ");
    const rest = steps.length > MAX_NAMED_STEPS ? `; and ${steps.length - MAX_NAMED_STEPS} more` : "";
    super(`${job}: ${steps.length} step(s) failed: ${named}${rest}`);
    this.name = "StepsFailed";
  }
}

/** For a run with no worker around it, e.g. runResolveAndAllowances by hand. */
export const reportOnly: Fail = (step, err) => reportError(`[cron] ${step} failed:`, err, { step });

export async function runJob(
  name: string,
  handlers: Record<string, Handler>,
  deps: { report?: typeof reportError; heartbeat?: typeof sendHeartbeat } = {}
) {
  const report = deps.report ?? reportError;
  const heartbeat = deps.heartbeat ?? sendHeartbeat;

  // `hasOwn`, because a job name is data from Redis and `handlers[name]` would
  // otherwise find "constructor" or "toString" on the prototype and call it.
  const handler = Object.prototype.hasOwnProperty.call(handlers, name) ? handlers[name] : undefined;
  if (!handler) {
    // A scheduler left in Redis by an older deploy. Not this job's failure and
    // not a check anyone set up, so no heartbeat; the log is what finds it.
    console.warn(`[cron] No handler registered for job "${name}"`);
    return;
  }

  // A throw that escapes the handler is one more failed step, so the heartbeat
  // below still runs and reports it.
  const failed: string[] = [];
  const fail: Fail = (step, err) => {
    report(`[cron] ${name}: ${step} failed:`, err, { job: name, step });
    failed.push(step);
  };
  try {
    await handler(fail);
  } catch (err) {
    fail("job", err);
  }

  await heartbeat(name, failed.length === 0);
  if (failed.length > 0) throw new StepsFailed(name, failed);
}
