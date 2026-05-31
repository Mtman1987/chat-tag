import { QuackverseCardGame } from '@/components/quackverse-card-game';

export default function QuackversePage() {
  return (
    <main className="cosmic-page">
      <section className="cosmic-hero">
        <div className="cosmic-card space-y-4">
          <div className="cosmic-status">Production Layout</div>
          <h1 className="cosmic-title">Quackverse</h1>
          <p className="cosmic-subtitle">
            Deck building, card browsing, and board logic stay mounted here. The shell now follows the app-suite direction instead of dropping you into a disconnected full-screen utility.
          </p>
        </div>
        <div className="cosmic-panel">
          <h2 className="mb-4 font-headline text-2xl text-white">Live Preview</h2>
          <div className="mock-window">
            <div className="mock-head">
              <span className="mock-dot mock-dot-red" />
              <span className="mock-dot mock-dot-amber" />
              <span className="mock-dot mock-dot-green" />
            </div>
            <div className="mock-body">
              <div className="mock-row"><span>App</span><span>Chat-Tag</span></div>
              <div className="mock-row"><span>Page</span><span>quackverse</span></div>
              <div className="mock-row"><span>Status</span><span>Ready</span></div>
              <div className="mock-row"><span>Theme</span><span>Cosmic</span></div>
            </div>
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-[1500px]">
        <QuackverseCardGame />
      </div>
    </main>
  );
}
