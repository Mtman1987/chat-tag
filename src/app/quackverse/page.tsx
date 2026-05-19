import { QuackverseCardGame } from '@/components/quackverse-card-game';

export default function QuackversePage() {
  return (
    <main className="min-h-screen bg-background p-3 sm:p-4">
      <div className="mx-auto max-w-[1500px]">
        <QuackverseCardGame />
      </div>
    </main>
  );
}
