export type MovementType = 'inter_branch' | 'internal' | 'loan' | 'disposal';
export type MovementStatus = 'pending_dispatch' | 'in_transit' | 'completed' | 'cancelled';

export interface AssetMovement {
  id: string;
  movement_number: string;
  movement_type: MovementType;
  asset_name: string;
  asset_tag: string;
  serial_number: string | null;
  from_location: string;
  to_location: string;
  via_location: string | null;
  status: MovementStatus;
  reason: string | null;
  handler_name: string | null;
  priority: 'normal' | 'urgent';
  dispatched_at: string | null;
  received_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateMovementInput {
  movement_type: MovementType;
  asset_name: string;
  asset_tag: string;
  serial_number?: string | null;
  from_location: string;
  to_location: string;
  via_location?: string | null;
  reason?: string | null;
  handler_name?: string | null;
  priority: 'normal' | 'urgent';
}
