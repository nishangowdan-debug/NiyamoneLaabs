export type AttendanceStatus = 'present' | 'late' | 'half_day' | 'leave' | 'absent' | 'off';

export interface AttendanceRow {
  id: string;
  staff_id: string;
  branch_id: string;
  work_date: string;
  in_at: string | null;
  out_at: string | null;
  status: AttendanceStatus;
  hours: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RosterRow {
  staff_id: string;
  staff_code: string;
  full_name: string;
  role_slug: string;
  attendance: AttendanceRow | null;
}

export const STATUS_TONE: Record<AttendanceStatus, { chip: string; label: string }> = {
  present:  { chip: 'bg-good-bg text-good-fg',     label: 'Present'   },
  late:     { chip: 'bg-warn-bg text-warn-fg',     label: 'Late'      },
  half_day: { chip: 'bg-warn-bg text-warn-fg',     label: 'Half day'  },
  leave:    { chip: 'bg-info-bg text-info-fg',     label: 'On leave'  },
  absent:   { chip: 'bg-danger-bg text-danger-fg', label: 'Absent'    },
  off:      { chip: 'bg-surface-subtle text-ink-muted', label: 'Off'  },
};
