// Typed façade over the plain Node script so tests get useful types.
// @ts-ignore - the verifier is intentionally a dependency-free .mjs script
import {
  runVerifier as rawRunVerifier,
  redact as rawRedact,
} from "../../scripts/verify-providers.mjs";

export interface VerifierEntry {
  service: string;
  status: "PASS" | "FAIL" | "SKIP";
  reason: string;
}

export interface VerifierResult {
  results: VerifierEntry[];
  lines: string[];
  exitCode: number;
}

export interface VerifierOptions {
  env?: Record<string, string | undefined>;
  http?: (url: string, init?: RequestInit) => Promise<Response>;
  argv?: string[];
  blobApiBase?: string;
}

export function runVerifier(options: VerifierOptions = {}): Promise<VerifierResult> {
  const raw = rawRunVerifier as unknown as (
    input: VerifierOptions,
  ) => Promise<VerifierResult>;
  return raw(options);
}

export const redact = rawRedact as (
  text: string,
  env?: Record<string, string | undefined>,
) => string;
