import { QuackverseCardGame } from '@/components/quackverse-card-game';

export default function QuackverseCommandPage() {
  return (
    <main className="min-h-screen bg-background p-2">
      <div className="mx-auto max-w-[980px]">
        <QuackverseCardGame layout="command" />
      </div>
    </main>
  );
}
