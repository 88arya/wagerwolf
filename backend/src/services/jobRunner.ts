// Runs one scheduler job. Steps report failures as they happen and keep going;
// the job fails at the end if any step did, so BullMQ sees it.
import { reportError } from "../lib/monitoring";
import { heartbeat as sendHeartbeat } from "../lib/heartbeat";

export type Fail = (step: string, err: unknown) => void;
export type Handler = (fail: Fail) => Promise<void>;

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

  const handler = Object.prototype.hasOwnProperty.call(handlers, name) ? handlers[name] : undefined;
  if (!handler) {
    console.warn(`[cron] No handler registered for job "${name}"`);
    return;
  }

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
