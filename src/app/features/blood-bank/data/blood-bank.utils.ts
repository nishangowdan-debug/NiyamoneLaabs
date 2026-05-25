import type {
  BloodGroup, BloodRequest, BloodRequestSlaStatus, BloodRequestStage,
} from './blood-bank.types';

const TEXT_TO_ENUM: Record<string, BloodGroup> = {
  'A+': 'A_POS', 'A-': 'A_NEG',
  'B+': 'B_POS', 'B-': 'B_NEG',
  'AB+': 'AB_POS', 'AB-': 'AB_NEG',
  'O+': 'O_POS', 'O-': 'O_NEG',
};

export function bloodGroupTextToEnum(text: string | null | undefined): BloodGroup | null {
  if (!text) return null;
  return TEXT_TO_ENUM[text.trim().toUpperCase()] ?? null;
}

const ENUM_TO_TEXT: Record<BloodGroup, string> = {
  A_POS: 'A+', A_NEG: 'A-',
  B_POS: 'B+', B_NEG: 'B-',
  AB_POS: 'AB+', AB_NEG: 'AB-',
  O_POS: 'O+', O_NEG: 'O-',
};

export function bloodGroupEnumToText(g: BloodGroup): string {
  return ENUM_TO_TEXT[g];
}

export function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.floor(ms / 86_400_000);
}

// ── Request TAT / SLA helpers (mirrors v_blood_requests_tat) ───
const SLA_TARGET_MIN: Record<BloodRequest['priority'], number> = {
  stat: 60, urgent: 90, routine: 240,
};

export function slaTargetMinutes(r: Pick<BloodRequest, 'priority'>): number {
  return SLA_TARGET_MIN[r.priority];
}

export function pendingMinutes(r: Pick<BloodRequest, 'created_at'>): number {
  return Math.max(0, (Date.now() - new Date(r.created_at).getTime()) / 60_000);
}

export function pendingDays(r: Pick<BloodRequest, 'created_at'>): number {
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const startOfCreated = new Date(r.created_at); startOfCreated.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((+startOfToday - +startOfCreated) / 86_400_000));
}

export function currentStage(
  r: Pick<BloodRequest,
    'ward_received_at' | 'dispatched_at' | 'issued_at' |
    'crossmatch_completed_at' | 'crossmatch_started_at' |
    'sample_received_at' | 'acknowledged_at'>,
): BloodRequestStage {
  if (r.ward_received_at)        return 'ward_received';
  if (r.dispatched_at)           return 'dispatched';
  if (r.issued_at)               return 'issued';
  if (r.crossmatch_completed_at) return 'cross_matched';
  if (r.crossmatch_started_at)   return 'crossmatching';
  if (r.sample_received_at)      return 'sample_received';
  if (r.acknowledged_at)         return 'acknowledged';
  return 'pending_acknowledgement';
}

export function slaStatus(r: BloodRequest): BloodRequestSlaStatus {
  if (r.state === 'completed' || r.state === 'cancelled') return 'closed';
  const target = slaTargetMinutes(r);
  const elapsed = pendingMinutes(r);
  if (elapsed >= target)         return 'breached';
  if (elapsed >= 0.8 * target)   return 'at_risk';
  return 'ok';
}

/** "5d 03:14" / "2h 15m" / "45m". */
export function formatPending(minutes: number): string {
  const m = Math.floor(minutes);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return `${h}h ${rem.toString().padStart(2, '0')}m`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return `${d}d ${remH.toString().padStart(2, '0')}h`;
}
