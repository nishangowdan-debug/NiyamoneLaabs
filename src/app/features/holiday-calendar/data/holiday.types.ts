export type HolidayType = 'public' | 'optional' | 'hospital';

export interface Holiday {
  id: string;
  branch_id: string | null;
  holiday_date: string;
  name: string;
  type: HolidayType;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export const HOLIDAY_TYPE_LABELS: Record<HolidayType, string> = {
  public: 'Public',
  optional: 'Optional',
  hospital: 'Hospital',
};
