'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

interface OverlayState {
  me: any;
  myRank: number | null;
  it: { id: string; username: string } | null;
  isFFA: boolean;
  lastTagTime: number | null;
  playerCount: number;
  leaderboard: any[];
  recentHistory: any[];
  overlayMessages?: any[];
  monthlyWinners: any[];
  timestamp: number;
}

type BroadcastType = 'tag' | 'ffa' | 'newit' | 'history' | 'message';
interface Broadcast { type: BroadcastType; lines: string[]; icon: string; color: string; glow: string; }

function StatItem({ value, label, color }: { value: string | number; label: string; color?: string }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'baseline',
      gap: '0.35vw',
      color: color || '#fff',
    }}>
      <span>{value}</span>
      <small style={{ fontSize: '0.45em', opacity: 0.7, textTransform: 'uppercase' }}>{label}</small>
    </span>
  );
}

export default function OverlayPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const userId = params.userId as string;
  const historyInterval = parseInt(searchParams.get('cycle') || '240') * 1000;

  const [data, setData] = useState<OverlayState | null>(null);
  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
  const [dimBar, setDimBar] = useState(false);
  const broadcastTimer = useRef<NodeJS.Timeout | null>(null);
  const historyTimer = useRef<NodeJS.Timeout | null>(null);
  const prevHistoryTs = useRef<number | null>(null);
  const prevOverlayMessageTs = useRef<number | null>(null);
  const prevIt = useRef<string | null>(null);
  const lastHistoryShow = useRef<number>(0);

  const crown = (name: string) => {
    if (!data?.monthlyWinners?.length) return name;
    const w = data.monthlyWinners.find((e: any) => (e.username || '').toLowerCase() === (name || '').toLowerCase());
    return w ? `👑 ${name}` : name;
  };

  const fireBroadcast = (b: Broadcast, duration = 6000) => {
    if (broadcastTimer.current) clearTimeout(broadcastTimer.current);
    setDimBar(true);
    setBroadcast(b);
    broadcastTimer.current = setTimeout(() => {
      setBroadcast(null);
      setTimeout(() => setDimBar(false), 400);
    }, duration);
  };

  const fireHistoryBroadcast = (history: any[]) => {
    if (!history.length || broadcast) return;
    const lines = history.slice(0, 6).map((h: any) => {
      if (h.blocked) return `🛡️ ${h.tagger} → ${h.tagged} (${h.blocked})`;
      return `${h.doublePoints ? '🔥' : '🎯'} ${crown(h.tagger)} tagged ${crown(h.tagged)}${h.doublePoints ? ' 2x!' : ''}`;
    });
    fireBroadcast({ type: 'history', lines, icon: '📜', color: '#9146ff', glow: '#9146ff' }, 10000);
    lastHistoryShow.current = Date.now();
  };

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/overlay/state?userId=${encodeURIComponent(userId)}`, { cache: 'no-store' });
        if (!res.ok) return;
        const next: OverlayState = await res.json();
        let showedOverlayMessage = false;

        const latestMessage = next.overlayMessages?.[0];
        const latestMessageTs = latestMessage?.timestamp || 0;
        if (prevOverlayMessageTs.current !== null && latestMessageTs > prevOverlayMessageTs.current) {
          showedOverlayMessage = true;
          fireBroadcast({
            type: 'message',
            lines: [latestMessage.message],
            icon: '💬',
            color: '#9146ff',
            glow: '#9146ff',
          }, 8000);
        }
        prevOverlayMessageTs.current = latestMessageTs;

        const latestTs = next.recentHistory[0]?.timestamp || 0;
        if (!showedOverlayMessage && prevHistoryTs.current !== null && latestTs > prevHistoryTs.current) {
          const h = next.recentHistory[0];
          if (h && !h.blocked) {
            const dp = h.doublePoints ? ' for DOUBLE POINTS and is now it!' : ' who is now it!';
            fireBroadcast({
              type: 'tag', lines: [`${crown(h.tagger)} tagged ${crown(h.tagged)}${dp}`],
              icon: h.doublePoints ? '🔥' : '🎯',
              color: h.doublePoints ? '#ff4500' : '#00d9ff',
              glow: h.doublePoints ? '#ff4500' : '#00d9ff',
            }, 8000);
          }
        }
        prevHistoryTs.current = latestTs;

        const newIt = next.it?.username || null;
        if (!showedOverlayMessage && prevIt.current !== null && newIt !== prevIt.current) {
          if (!newIt) {
            fireBroadcast({ type: 'ffa', lines: ['FREE FOR ALL!', 'Anyone can tag for DOUBLE POINTS!'], icon: '🔥', color: '#ff4500', glow: '#ff8c00' }, 8000);
          } else {
            fireBroadcast({ type: 'newit', lines: [`${crown(newIt)} is now IT!`], icon: '🎯', color: '#00d9ff', glow: '#00d9ff' }, 6000);
          }
        }
        prevIt.current = newIt;
        setData(next);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [userId]);

  useEffect(() => {
    historyTimer.current = setInterval(() => {
      if (data?.recentHistory?.length && !broadcast && Date.now() - lastHistoryShow.current > historyInterval) {
        fireHistoryBroadcast(data.recentHistory);
      }
    }, historyInterval);
    return () => { if (historyTimer.current) clearInterval(historyTimer.current); };
  }, [data, broadcast, historyInterval]);

  if (!data) return null;
  const elapsed = data.lastTagTime ? Math.floor((Date.now() - data.lastTagTime) / 60000) : 0;

  return (
    <div style={{ background: 'transparent', width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', fontFamily: "'Segoe UI', Arial, sans-serif", color: '#fff', boxSizing: 'border-box' }}>

      {/* FULL-SCREEN BROADCAST */}
      {broadcast && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          zIndex: 50, padding: '3%', animation: 'broadcastIn 0.3s ease-out',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: `radial-gradient(ellipse at center, ${broadcast.glow}22 0%, transparent 70%)`, pointerEvents: 'none' }} />
          <div style={{
            fontSize: broadcast.type === 'history' ? 'min(18vw,18vh)' : 'min(21.6vw,21.6vh)',
            marginBottom: '1vh',
            filter: `drop-shadow(0 0 3.6vw ${broadcast.glow})`,
            animation: broadcast.type === 'ffa' ? 'pulse 0.6s ease-in-out infinite alternate' : 'iconBounce 0.4s ease-out',
          }}>
            {broadcast.icon}
          </div>
          {broadcast.lines.map((line, i) => (
            <div key={i} style={{
              fontSize: broadcast.type === 'history' ? 'min(7.2vw,8.4vh)' : (i === 0 ? 'min(9.6vw,10.8vh)' : 'min(7.2vw,8.4vh)'),
              fontWeight: i === 0 ? 900 : 700,
              textAlign: broadcast.type === 'history' ? 'left' : 'center',
              textShadow: `0 0 4.8vw ${broadcast.glow}, 0 0.4vh 1.2vh rgba(0,0,0,0.9)`,
              marginBottom: '0.3vh', width: '100%', wordWrap: 'break-word' as const, lineHeight: 1.1,
              animation: `lineSlide 0.3s ease-out ${i * 0.06}s both`,
              padding: broadcast.type === 'history' ? '0.3vh 2%' : undefined,
            }}>
              {line}
            </div>
          ))}
          <div style={{ width: '40%', height: '0.6vh', marginTop: '1.5vh', background: `linear-gradient(90deg, transparent, ${broadcast.color}, transparent)`, animation: 'lineGrow 0.5s ease-out 0.2s both' }} />
        </div>
      )}

      {/* BOTTOM UI CONTAINER */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        transition: 'opacity 0.4s ease, transform 0.4s ease',
        opacity: dimBar ? 0.12 : 1, transform: dimBar ? 'translateY(5%)' : 'translateY(0)',
        zIndex: 20, display: 'flex', flexDirection: 'column',
        paddingBottom: 'max(1.25vh, env(safe-area-inset-bottom))',
        boxSizing: 'border-box',
      }}>
        {/* IT / FFA Status */}
        <div style={{
          padding: '2.5vh 3vw', display: 'flex', alignItems: 'center', gap: '2vw',
          borderTop: `0.8vh solid ${data.isFFA ? '#ff4500' : '#00d9ff'}`,
          background: data.isFFA
            ? 'linear-gradient(180deg, rgba(255, 69, 0, 0.75), rgba(255, 100, 0, 0.75))'
            : 'linear-gradient(180deg, rgba(0, 180, 255, 0.75), rgba(0, 100, 200, 0.75))',
          boxSizing: 'border-box',
        }}>
          <span style={{ fontSize: 'min(12vw, 100px)' }}>{data.isFFA ? '🔥' : '🎯'}</span>
          <div style={{ flexShrink: 1, overflow: 'hidden' }}>
            {data.isFFA ? (
              <>
                <div style={{ fontSize: 'min(3vw, 2.8vh)', opacity: 0.9, fontWeight: 700, textTransform: 'uppercase' }}>FREE FOR ALL</div>
                <div style={{ fontSize: 'min(4vw, 3.5vh)', opacity: 0.8 }}>Anyone can tag for DOUBLE POINTS!</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 'min(3vw, 2.8vh)', opacity: 0.9, fontWeight: 700, textTransform: 'uppercase' }}>IT</div>
                <div style={{
                  fontSize: 'min(9vw, 10vh)',
                  fontWeight: 900,
                  lineHeight: 0.9,
                  whiteSpace: 'nowrap',
                  textShadow: '2px 2px 4px rgba(0,0,0,0.3)',
                }}>{crown(data.it?.username || '?')}</div>
              </>
            )}
          </div>
          <div style={{ fontSize: 'min(4vw, 4vh)', fontWeight: 700, opacity: 0.8, marginLeft: 'auto' }}>
            {!data.isFFA && `${elapsed}m · `}{data.playerCount}
          </div>
        </div>

        {/* My Stats */}
        {data.me && (
          <div style={{
            padding: '2vh 3vw 2.6vh', background: 'linear-gradient(180deg, rgba(50, 55, 80, 0.75), rgba(30, 30, 45, 0.75))',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, auto) minmax(0, 1fr)',
            alignItems: 'center',
            columnGap: '1.5vw',
            borderTop: '2px solid rgba(255,255,255,0.2)', width: '100%',
            boxSizing: 'border-box',
          }}>
            <span style={{
              fontSize: 'min(6vw, 6.5vh)',
              fontWeight: 900,
              lineHeight: 1,
              whiteSpace: 'nowrap',
              minWidth: 0,
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {crown(data.me.twitchUsername)} <span style={{ opacity: 0.5, fontWeight: 400 }}>#{data.myRank}</span>
            </span>
            <div style={{
              fontSize: 'min(4.2vw, 4.8vh)',
              fontWeight: 900,
              display: 'flex',
              alignItems: 'center',
              gap: '0.8vw',
              flexWrap: 'nowrap',
              justifyContent: 'flex-end',
              lineHeight: 1,
              minWidth: 0,
              width: '100%',
              overflow: 'hidden',
            }}>
              <StatItem value={data.me.score} label="pts" />
              <span style={{opacity: 0.3}}>|</span>
              <StatItem value={data.me.tags} label="tags" />
              <span style={{opacity: 0.3}}>|</span>
              <StatItem value={data.me.tagged || 0} label="tagged" />
              <span style={{opacity: 0.3}}>|</span>
              <StatItem value={`🎟️${data.me.passCount || 0}`} label="passes" color="#ffd700" />
              <span style={{opacity: 0.3}}>|</span>
              <StatItem value={`🏆${data.me.wins || 0}`} label="wins" color="#ffd700" />
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes broadcastIn { 0% { opacity: 0; } 100% { opacity: 1; } }
        @keyframes iconBounce { 0% { transform: scale(0.3) rotate(-10deg); opacity: 0; } 60% { transform: scale(1.15) rotate(3deg); } 100% { transform: scale(1) rotate(0); opacity: 1; } }
        @keyframes pulse { 0% { transform: scale(1); } 100% { transform: scale(1.2); } }
        @keyframes lineSlide { 0% { opacity: 0; transform: translateY(15%); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes lineGrow { 0% { width: 0; opacity: 0; } 100% { width: 40%; opacity: 1; } }
      `}</style>
    </div>
  );
}
