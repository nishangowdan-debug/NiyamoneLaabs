import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export const strongPasswordValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const value = (control.value ?? '') as string;
  if (!value) return null;

  const errors: ValidationErrors = {};
  if (value.length < 12) errors['minlength'] = { required: 12, actual: value.length };
  if (!/[A-Z]/.test(value)) errors['uppercase'] = true;
  if (!/[a-z]/.test(value)) errors['lowercase'] = true;
  if (!/[0-9]/.test(value)) errors['number'] = true;
  if (!/[^A-Za-z0-9]/.test(value)) errors['symbol'] = true;

  return Object.keys(errors).length > 0 ? { strongPassword: errors } : null;
};

export function passwordStrengthLabel(value: string): {
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Too weak' | 'Weak' | 'Fair' | 'Strong' | 'Excellent';
} {
  let score = 0;
  if (value.length >= 12) score++;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
  if (/[0-9]/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;

  const labels = ['Too weak', 'Weak', 'Fair', 'Strong', 'Excellent'] as const;
  return { score: score as 0 | 1 | 2 | 3 | 4, label: labels[score] };
}
