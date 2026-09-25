import type { Metadata } from 'next';
import { NebulaControllerBay } from '@/components/nebula-controller-bay';

export const metadata: Metadata = {
  title: 'Controller Bay · Nebula Arcade',
  description: 'Choose a stream and a Nebula Arcade game, then open its private controller.',
};

export default function ControllersPage() {
  return <NebulaControllerBay />;
}
