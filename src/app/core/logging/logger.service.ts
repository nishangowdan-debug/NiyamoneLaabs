import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

const PHI_KEYS = new Set([
  'full_name', 'name', 'first_name', 'last_name',
  'email', 'phone', 'address', 'dob', 'date_of_birth',
  'aadhaar', 'pan', 'abha', 'national_id',
  'allergies', 'diagnosis', 'notes',
]);

function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = PHI_KEYS.has(k.toLowerCase()) ? '[redacted]' : redact(v);
    }
    return out;
  }
  return value;
}

@Injectable({ providedIn: 'root' })
export class LoggerService {
  info(event: string, context?: Record<string, unknown>) {
    if (!environment.production) {
      console.info(`[${event}]`, context ? redact(context) : '');
    }
  }

  warn(event: string, context?: Record<string, unknown>) {
    console.warn(`[${event}]`, context ? redact(context) : '');
  }

  error(event: string, context?: Record<string, unknown>) {
    console.error(`[${event}]`, context ? redact(context) : '');
  }
}
