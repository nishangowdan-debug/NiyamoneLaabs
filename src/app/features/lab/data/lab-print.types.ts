import type {
  HospitalSettings,
  InstructionSection,
  LabReportPrintMode,
  PrintHeaderMode,
  PrintFooterMode,
} from '../../pharmacy/services/hospital-settings.service';

export type { PrintHeaderMode, PrintFooterMode, LabReportPrintMode, InstructionSection };

export interface PrintOptions extends LabReportPrintMode {
  autoPrint?: boolean;
}

export interface InfographicRange {
  label: string;          // 'High' | 'Normal' | 'Low'
  threshold: string;      // '> 200 mg/dL'
  tone: 'danger' | 'good' | 'warn';
  badge?: string;         // small numeric badge text
  description?: string;
}

export interface InfographicCause {
  group: 'High' | 'Normal' | 'Low';
  items: string[];
}

export interface InfographicConfig {
  title: string;
  subtitle?: string;
  ranges: InfographicRange[];
  causes?: InfographicCause[];
  interpretation?: string;
}

export type CategoryInstructions = Record<string, InstructionSection[]>;

export interface ReportConfig {
  settings: HospitalSettings;
  catalogInstructions: CategoryInstructions;
}

export function resolvePrintOptions(
  saved: LabReportPrintMode,
  overrides?: Partial<PrintOptions>,
): PrintOptions {
  return { ...saved, ...(overrides ?? {}) };
}

/** Built-in infographic map keyed by test code. Extended via lab_tests.infographic JSON. */
export const BUILTIN_INFOGRAPHICS: Record<string, InfographicConfig> = {
  RBS: {
    title: 'RBS (RANDOM BLOOD SUGAR)',
    subtitle:
      'A Random Blood Sugar (RBS) test measures blood sugar (glucose) levels at any time of the day, regardless of when you last ate.',
    ranges: [
      { label: 'High',   threshold: '> 200 mg/dL',     tone: 'danger', badge: '200' },
      { label: 'Normal', threshold: '> 70 – 199 mg/dL', tone: 'good',   badge: '120' },
      { label: 'Low',    threshold: '< 70 mg/dL',      tone: 'warn',   badge: '60' },
    ],
    causes: [
      { group: 'High',   items: ['Diabetes', 'Stress or illness', 'Certain medications'] },
      { group: 'Normal', items: ['Typically normal and healthy range (consult a healthcare provider for concerns)'] },
      { group: 'Low',    items: ['Missed meals', 'Certain medications', 'Excessive alcohol'] },
    ],
    interpretation:
      'High RBS levels may indicate diabetes or other health issues, while low levels may lead to hypoglycemia. Clinical correlation with symptoms and medical history is advised.',
  },
};
