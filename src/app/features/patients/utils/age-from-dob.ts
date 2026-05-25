export function ageFromDob(dob: string | Date | null | undefined): number | null {
  if (!dob) return null;
  const d = typeof dob === 'string' ? new Date(dob) : dob;
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export function formatAgeGender(
  dob: string | null | undefined,
  gender: string | null | undefined,
): string {
  const age = ageFromDob(dob);
  const g = gender ? gender.charAt(0).toUpperCase() : '';
  if (age === null && !g) return '—';
  if (age === null) return g;
  return `${age} / ${g}`;
}

export function formatINR(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}
