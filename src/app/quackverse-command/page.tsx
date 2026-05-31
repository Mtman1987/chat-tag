import { QuackverseCardGame } from '@/components/quackverse-card-game';

export default function QuackverseCommandPage() {
  return (
    <main className="cosmic-page">
      <div className="mx-auto max-w-[980px]">
        <QuackverseCardGame layout="command" />
      </div>
    </main>
  );
}
