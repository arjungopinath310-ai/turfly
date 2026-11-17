import { prisma } from "./db";
import { DEFAULT_POLICY, parsePolicy, type CancellationPolicy } from "./engine/policy";

export interface PlatformSettings {
  advanceAmountPaise: number;
  platformFeePaise: number;
  holdMinutes: number;
  maxActiveHoldsPerUser: number;
  defaultCommissionPercent: number;
  defaultCancellationPolicy: CancellationPolicy;
  reminders: { h24: boolean; h2: boolean; balance: boolean; channels: ("SMS" | "WHATSAPP" | "EMAIL")[] };
}

export const DEFAULT_SETTINGS: PlatformSettings = {
  advanceAmountPaise: 4900,
  platformFeePaise: 0,
  holdMinutes: 5,
  maxActiveHoldsPerUser: 2,
  defaultCommissionPercent: 0,
  defaultCancellationPolicy: DEFAULT_POLICY,
  reminders: { h24: true, h2: true, balance: true, channels: ["SMS", "WHATSAPP", "EMAIL"] },
};

// Settings are read on almost every request but change rarely: keep them in memory for a short time.
// With several app servers, a change made on one reaches the others within SETTINGS_TTL_MS.
const SETTINGS_TTL_MS = 30_000;
let cache: { value: PlatformSettings; until: number } | null = null;

export async function getSettings(): Promise<PlatformSettings> {
  if (cache && cache.until > Date.now()) return structuredClone(cache.value);
  const rows = await prisma.platformSetting.findMany();
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = r.value;
  const out = s as unknown as PlatformSettings;
  out.defaultCancellationPolicy = parsePolicy(out.defaultCancellationPolicy);
  cache = { value: out, until: Date.now() + SETTINGS_TTL_MS };
  return structuredClone(out);
}

export async function setSetting<K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) {
  await prisma.platformSetting.upsert({
    where: { key },
    create: { key, value: value as never },
    update: { value: value as never },
  });
  cache = null; // this server sees the change at once
}

export function turfPolicy(turf: { cancellationPolicy: unknown }, s: PlatformSettings) {
  return turf.cancellationPolicy ? parsePolicy(turf.cancellationPolicy, s.defaultCancellationPolicy) : s.defaultCancellationPolicy;
}
