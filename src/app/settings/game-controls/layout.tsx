import type { ReactNode } from 'react';

// `/settings/**` is SPMT admin/owner guarded by middleware before this client UI renders.
export default function GuardedGameControlsLayout({ children }: { children: ReactNode }) {
  return children;
}
