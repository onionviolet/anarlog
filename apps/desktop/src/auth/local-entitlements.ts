import { useBillingAccess } from "./billing-context";

/**
 * Fork policy: a feature is billable only when using it consumes Anarlog's
 * servers. Everything that runs on this machine, including work that talks to
 * the user's own third-party accounts, is unlocked without a payment or a
 * sign-in. Upstream gates several such features client-side, which is what
 * this module reverses.
 */
export type ForkGatedFeature =
  // Transcription keywords and the local title and enhance transforms. Runs
  // against whichever STT and LLM are configured, local ones included.
  | "dictionary"
  // Cosmetic, resolved entirely from bundled assets.
  | "appIcon"
  // Executes on this machine against the user's own Linear, Notion or GitHub
  // credentials. No Anarlog infrastructure is involved.
  | "automations"
  // The three below are served by Anarlog's backend, so they stay billable.
  | "sync"
  | "team"
  | "cloudApi";

const RUNS_LOCALLY: ReadonlySet<ForkGatedFeature> = new Set([
  "dictionary",
  "appIcon",
  "automations",
]);

export function runsLocally(feature: ForkGatedFeature): boolean {
  return RUNS_LOCALLY.has(feature);
}

export function hasFeature(feature: ForkGatedFeature, isPro: boolean): boolean {
  return runsLocally(feature) || isPro;
}

export function useFeatureAccess(feature: ForkGatedFeature): boolean {
  const { isPro } = useBillingAccess();
  return hasFeature(feature, isPro);
}
