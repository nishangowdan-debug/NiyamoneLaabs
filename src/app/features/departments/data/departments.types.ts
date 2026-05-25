export interface Department {
  id: string;
  branch_id: string;
  code: string;
  name: string;
  description: string | null;
  head_staff_id: string | null;
  color: string;
  icon: string | null;
  floor: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface DepartmentView extends Department {
  head: { id: string; full_name: string } | null;
  doctorsCount: number;
  /** When > 1 → this row aggregates the same department across multiple branches (network view). */
  branchCount?: number;
}

export interface DoctorOption {
  id: string;
  full_name: string;
  specialty: string | null;
}
