import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

interface RoleRow {
  key: string;
  label: string;
  description: string;
  permissions: number;
}

@Component({
  selector: 'app-hr-roles-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
<div class="flex flex-col gap-4 h-full">
  <header class="flex items-end justify-between pb-4 border-b border-border">
    <div>
      <h1 class="font-display text-[28px] font-medium tracking-[-0.02em] text-ink leading-[1.1]">Roles</h1>
      <p class="text-[13px] text-ink-muted mt-1">
        {{ roles().length }} roles defined for the HR module
      </p>
    </div>
    <nav class="flex items-center gap-2 text-[12px] text-ink-muted">
      <a routerLink="/hr/staff" class="px-2 py-1 rounded hover:bg-bg-muted">Staff</a>
      <a routerLink="/hr/attendance" class="px-2 py-1 rounded hover:bg-bg-muted">Attendance</a>
      <span class="px-2 py-1 rounded bg-primary-50 text-primary-700">Roles</span>
    </nav>
  </header>

  <div class="rounded-lg border border-border overflow-hidden">
    <table class="w-full text-[13px]">
      <thead class="bg-bg-muted text-ink-muted">
        <tr>
          <th class="text-left px-3 py-2 font-medium">Role</th>
          <th class="text-left px-3 py-2 font-medium">Description</th>
          <th class="text-right px-3 py-2 font-medium">Permissions</th>
        </tr>
      </thead>
      <tbody>
        @for (r of roles(); track r.key) {
          <tr class="border-t border-border">
            <td class="px-3 py-2 font-medium text-ink">{{ r.label }}</td>
            <td class="px-3 py-2 text-ink-muted">{{ r.description }}</td>
            <td class="px-3 py-2 text-right text-ink">{{ r.permissions }}</td>
          </tr>
        }
      </tbody>
    </table>
  </div>
</div>
  `,
})
export class RolesPage {
  readonly roles = signal<RoleRow[]>([
    { key: 'super_admin',  label: 'Super Admin',  description: 'Full access across all branches', permissions: 124 },
    { key: 'branch_admin', label: 'Branch Admin', description: 'Administer a single branch',      permissions: 86  },
    { key: 'doctor',       label: 'Doctor',       description: 'Clinical workflows and orders',   permissions: 42  },
    { key: 'nurse',        label: 'Nurse',        description: 'Nursing tasks, vitals, MAR',      permissions: 31  },
    { key: 'pharmacist',   label: 'Pharmacist',   description: 'Pharmacy dispense and stock',     permissions: 28  },
    { key: 'lab_tech',     label: 'Lab Tech',     description: 'Lab orders, results, QC',         permissions: 22  },
    { key: 'receptionist', label: 'Receptionist', description: 'Registration and appointments',   permissions: 18  },
    { key: 'patient',      label: 'Patient',      description: 'Patient portal access',           permissions: 9   },
  ]);
}
