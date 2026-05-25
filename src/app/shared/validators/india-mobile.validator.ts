import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

const RE = /^(\+91[\s-]?)?[6-9]\d{9}$/;

export const indiaMobileValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const v = (control.value ?? '').toString().replace(/\s|-/g, '');
  if (!v) return null;
  return RE.test(v) ? null : { indiaMobile: true };
};

export function normaliseMobile(value: string): string {
  const v = value.trim().replace(/\s|-/g, '');
  if (v.startsWith('+91')) return v.slice(3);
  if (v.startsWith('91') && v.length === 12) return v.slice(2);
  return v;
}

export const pincodeValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const v = (control.value ?? '').toString();
  if (!v) return null;
  return /^[1-9][0-9]{5}$/.test(v) ? null : { pincode: true };
};
