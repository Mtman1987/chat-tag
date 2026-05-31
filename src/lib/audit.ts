import { makeId, type AppState } from '@/lib/volume-store';
import type { SessionUser } from '@/lib/session';

type AdminAuditOptions = {
  action: string;
  performedBy?: string | null;
  targetUser?: string | null;
  details?: string | null;
};

export function adminActor(user?: SessionUser | null): string {
  return user?.twitchUsername || user?.id || 'unknown-admin';
}

export function appendAdminHistory(state: AppState, options: AdminAuditOptions) {
  state.adminHistory = state.adminHistory || [];
  state.adminHistory.push({
    id: makeId('admin'),
    action: options.action,
    performedBy: options.performedBy || 'unknown-admin',
    targetUser: options.targetUser || '',
    details: options.details || '',
    timestamp: Date.now(),
  });

  if (state.adminHistory.length > 500) {
    state.adminHistory = state.adminHistory.slice(-500);
  }
}
