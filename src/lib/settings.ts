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

export async function getSettings(): Promise<PlatformSettings> {
  const rows = await prisma.platformSetting.findMany();
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = r.value;
  const out = s as unknown as PlatformSettings;
  out.defaultCancellationPolicy = parsePolicy(out.defaultCancellationPolicy);
  return out;
}

export async function setSetting<K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) {
  await prisma.platformSetting.upsert({
    where: { key },
    create: { key, value: value as never },
    update: { value: value as never },
  });
}

export function turfPolicy(turf: { cancellationPolicy: unknown }, s: PlatformSettings) {
  return turf.cancellationPolicy ? parsePolicy(turf.cancellationPolicy, s.defaultCancellationPolicy) : s.defaultCancellationPolicy;
}
