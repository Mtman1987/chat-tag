'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

interface OverlayState {
  me: any;
  myRank: number | null;
  it: { id: string; username: string } | null;
  isFFA: boolean;
  lastTagTime: number | null;
  liveCount: number;
  playerCount: number;
  leaderboard: any[];
  recentHistory: any[];
  overlayMessages?: any[];
  monthlyWinners: any[];
  timestamp: number;
}

type BroadcastType = 'tag' | 'ffa' | 'newit' | 'history' | 'message';
interface Broadcast { type: BroadcastType; lines: string[]; icon: string; color: string; glow: string; }
interface OverlayMessage {
  type?: string;
  message?: string;
  payload?: any;
  timestamp?: number;
}
interface ConfettiPiece {
  id: string;
  left: number;
  delay: number;
  duration: number;
  size: number;
  rotate: number;
  drift: number;
  color: string;
}

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

function StackStat({ value, label, align = 'right' }: { value: string | number; label: string; align?: 'left' | 'right' }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: align === 'right' ? 'flex-end' : 'flex-start',
      lineHeight: 1,
      minWidth: 0,
    }}>
      <span style={{ fontSize: 'min(4vw, 4.5vh)', fontWeight: 900, whiteSpace: 'nowrap', textShadow: '0 2px 6px rgba(0,0,0,0.6)' }}>{value}</span>
      <small style={{ fontSize: 'min(1.3vw, 1.5vh)', color: '#c7ecff', opacity: 0.95, textTransform: 'uppercase', letterSpacing: '0.04em', textShadow: '0 1px 3px rgba(0,0,0,0.55)' }}>{label}</small>
    </div>
  );
}

export default function OverlayPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const userId = params.userId as string;
  const isPreview = userId === 'preview';
  const historyInterval = parseInt(searchParams.get('cycle') || '240') * 1000;

  const [data, setData] = useState<OverlayState | null>(null);
  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
  const [dimBar, setDimBar] = useState(false);
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([]);
  const activeBroadcastRef = useRef(false);
  const broadcastTimer = useRef<NodeJS.Timeout | null>(null);
  const historyTimer = useRef<NodeJS.Timeout | null>(null);
  const pendingBroadcasts = useRef<Array<{ broadcast: Broadcast; duration: number }>>([]);
  const prevHistoryTs = useRef<number | null>(null);
  const prevOverlayMessageTs = useRef<number | null>(null);
  const prevIt = useRef<string | null>(null);
  const lastHistoryShow = useRef<number>(0);
  const nextCycleMode = useRef<'history' | 'leaderboard'>('history');
  const audioContextRef = useRef<AudioContext | null>(null);
  const previewTimerRef = useRef<NodeJS.Timeout | null>(null);

  const crown = (name: string) => {
    if (!data?.monthlyWinners?.length) return name;
    const w = data.monthlyWinners.find((e: any) => (e.username || '').toLowerCase() === (name || '').toLowerCase());
    return w ? `👑 ${name}` : name;
  };

  const playBroadcastSound = (type: BroadcastType) => {
    try {
      const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtor) return;
      const ctx = audioContextRef.current || new AudioCtor();
      audioContextRef.current = ctx;
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;
      const tones: Record<BroadcastType, number[]> = {
        tag: [523.25, 659.25, 783.99],
        ffa: [329.63, 440.0, 587.33, 783.99],
        newit: [493.88, 659.25, 739.99],
        history: [392.0, 523.25],
        message: [587.33, 698.46],
      };

      tones[type].forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type === 'history' ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, now + index * 0.11);
        gain.gain.setValueAtTime(0.0001, now + index * 0.11);
        gain.gain.exponentialRampToValueAtTime(type === 'history' ? 0.018 : 0.03, now + index * 0.11 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.11 + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + index * 0.11);
        osc.stop(now + index * 0.11 + 0.24);
      });
    } catch {}
  };

  const spawnConfetti = (colors: string[]) => {
    const pieces: ConfettiPiece[] = Array.from({ length: 28 }, (_, index) => ({
      id: `${Date.now()}-${index}`,
      left: Math.random() * 100,
      delay: Math.random() * 0.35,
      duration: 3.8 + Math.random() * 1.8,
      size: 0.45 + Math.random() * 0.9,
      rotate: -40 + Math.random() * 80,
      drift: -18 + Math.random() * 36,
      color: colors[index % colors.length],
    }));
    setConfetti(pieces);
    setTimeout(() => setConfetti([]), 5600);
  };

  const fireBroadcast = (b: Broadcast, duration = 6000) => {
    if (broadcastTimer.current) clearTimeout(broadcastTimer.current);
    activeBroadcastRef.current = true;
    setDimBar(true);
    setBroadcast(b);
    playBroadcastSound(b.type);
    if (b.type !== 'history' && b.type !== 'message') {
      spawnConfetti([b.color, '#ffffff', b.glow, '#ffd700']);
    }
    broadcastTimer.current = setTimeout(() => {
      activeBroadcastRef.current = false;
      setBroadcast(null);
      setTimeout(() => setDimBar(false), 400);
      setTimeout(() => {
        const nextQueued = pendingBroadcasts.current.shift();
        if (nextQueued) {
          fireBroadcast(nextQueued.broadcast, nextQueued.duration);
        }
      }, 450);
    }, duration);
  };

  const queueBroadcast = (b: Broadcast, duration = 6000) => {
    if (!activeBroadcastRef.current) {
      fireBroadcast(b, duration);
      return;
    }
    pendingBroadcasts.current.push({ broadcast: b, duration });
  };

  const fireHistoryBroadcast = (history: any[]) => {
    if (!history.length || broadcast) return;
    const lines = history.slice(0, 6).map((h: any) => {
      if (h.blocked) return `🛡️ ${h.tagger} → ${h.tagged} (${h.blocked})`;
      return `${h.doublePoints ? '🔥' : '🎯'} ${crown(h.tagger)} tagged ${crown(h.tagged)}${h.doublePoints ? ' 2x!' : ''}`;
    });
    fireBroadcast({ type: 'history', lines, icon: '📜', color: '#9146ff', glow: '#9146ff' }, 15000);
    lastHistoryShow.current = Date.now();
  };

  const fireLeaderboardBroadcast = (leaderboard: any[]) => {
    if (!leaderboard.length || broadcast) return;
    const lines = leaderboard.slice(0, 5).map((player: any, index: number) =>
      `#${index + 1} ${crown(player.twitchUsername || player.username || '?')} ${player.score} pts`
    );
    fireBroadcast({ type: 'history', lines, icon: '🏆', color: '#ffd700', glow: '#ffb300' }, 15000);
    spawnConfetti(['#ffd700', '#fff2a8', '#ffffff', '#ffb300']);
    lastHistoryShow.current = Date.now();
  };

  const buildBroadcastFromOverlayMessage = (message: OverlayMessage): Broadcast | null => {
    const payload = message.payload || {};
    switch (message.type) {
      case 'leaderboard-card':
        return {
          type: 'history',
          icon: '🏆',
          color: '#ffd700',
          glow: '#ffb300',
          lines: (payload.rows || []).map((row: any) => `#${row.rank} ${row.username} ${row.score} pts`),
        };
      case 'score-card':
        return {
          type: 'history',
          icon: '📊',
          color: '#00d9ff',
          glow: '#00d9ff',
          lines: [
            `${payload.playerName || 'Player'} #${payload.rank || '-'}/${payload.totalPlayers || '-'}`,
            `${payload.score || 0} pts • ${payload.tags || 0} tags • ${payload.tagged || 0} tagged`,
            `🎟️ ${payload.passCount || 0} passes • 🏆 ${payload.wins || 0} wins${payload.winnerText ? ` • ${payload.winnerText}` : ''}`,
          ],
        };
      case 'live-card':
        return {
          type: 'history',
          icon: '🟢',
          color: '#34d399',
          glow: '#34d399',
          lines: [
            `Live now: ${payload.liveCount || 0} • Chatters: ${payload.chatterCount || 0}`,
            ...((payload.groups || []) as string[]),
          ],
        };
      case 'tag-card':
        return {
          type: 'tag',
          icon: payload.doublePoints ? '🔥' : '🎯',
          color: payload.doublePoints ? '#ff4500' : '#00d9ff',
          glow: payload.doublePoints ? '#ff4500' : '#00d9ff',
          lines: [`${payload.tagger || '?'} tagged ${payload.tagged || '?'}${payload.doublePoints ? ' for DOUBLE POINTS and is now it!' : ' who is now it!'}`],
        };
      case 'pass-card':
        if (payload.granted) {
          return {
            type: 'newit',
            icon: '🎟️',
            color: '#ffd700',
            glow: '#ffd700',
            lines: [`${payload.tagged || '?'} got an SPMT Pass!`, 'Use "spmt pass @username" for a DOUBLE POINTS tag!'],
          };
        }
        return {
          type: 'tag',
          icon: '🎟️',
          color: '#ffd700',
          glow: '#ffd700',
          lines: [`${payload.tagger || '?'} used a PASS on ${payload.tagged || '?'} for DOUBLE POINTS!`],
        };
      default:
        if (!message.message) return null;
        return {
          type: 'message',
          lines: [message.message],
          icon: '💬',
          color: '#9146ff',
          glow: '#9146ff',
        };
    }
  };

  useEffect(() => {
    if (!isPreview) return;

    const previewState: OverlayState = {
      me: {
        twitchUsername: 'mtman1987',
        score: 700,
        tags: 2,
        tagged: 0,
        passCount: 1,
        wins: 0,
      },
      myRank: 1,
      it: { id: 'preview-it', username: 'niniav 23' },
      isFFA: false,
      lastTagTime: Date.now() - 4 * 60 * 1000,
      liveCount: 9,
      playerCount: 114,
      leaderboard: [
        { twitchUsername: 'niniav 23', score: 1200 },
        { twitchUsername: 'mtman1987', score: 700 },
        { twitchUsername: 'van braak', score: 650 },
        { twitchUsername: 'scarlett_ai420', score: 620 },
        { twitchUsername: 'pinscorpion6521', score: 500 },
      ],
      recentHistory: [
        { tagger: 'van braak', tagged: 'niniav 23', doublePoints: false, blocked: null, timestamp: Date.now() - 60_000 },
      ],
      overlayMessages: [],
      monthlyWinners: [],
      timestamp: Date.now(),
    };

    setData(previewState);

    const previewEvents: Record<string, OverlayMessage> = {
      tag: { type: 'tag-card', payload: { tagger: 'van braak', tagged: 'niniav 23', doublePoints: false }, timestamp: Date.now() },
      pass: { type: 'pass-card', payload: { tagger: 'mtman1987', tagged: 'niniav 23', doublePoints: true, passUsed: true }, timestamp: Date.now() },
      grantpass: { type: 'pass-card', payload: { tagged: 'mtman1987', granted: true }, timestamp: Date.now() },
      rank: { type: 'leaderboard-card', payload: { rows: previewState.leaderboard.map((row, index) => ({ rank: index + 1, username: row.twitchUsername, score: row.score })) }, timestamp: Date.now() },
      score: { type: 'score-card', payload: { playerName: 'mtman1987', rank: 1, totalPlayers: 114, score: 700, tags: 2, tagged: 0, passCount: 1, wins: 0 }, timestamp: Date.now() },
      live: { type: 'live-card', payload: { liveCount: 9, chatterCount: 12, page: 1, totalPages: 1, groups: ['🟢niniav23 > 💬mtman1987, vanbraak', '🟢vanbraak', '🟣Discord > 💬scarlett_ai420'] }, timestamp: Date.now() },
      history: { type: 'history', message: 'preview history', payload: null, timestamp: Date.now() },
      message: { type: 'message', message: 'Overlay mode ON - bot replies now appear here.', timestamp: Date.now() },
      ffa: { type: 'ffa', message: 'preview ffa', timestamp: Date.now() },
      newit: { type: 'newit', message: 'preview newit', timestamp: Date.now() },
    };

    const triggerPreview = (kind: string) => {
      if (kind === 'ffa') {
        queueBroadcast({ type: 'ffa', lines: ['FREE FOR ALL!', 'Anyone can tag for DOUBLE POINTS!'], icon: '🔥', color: '#ff4500', glow: '#ff8c00' }, 13000);
        return;
      }
      if (kind === 'newit') {
        queueBroadcast({ type: 'newit', lines: ['niniav 23 is now IT!'], icon: '🎯', color: '#00d9ff', glow: '#00d9ff' }, 11000);
        return;
      }
      if (kind === 'history') {
        fireHistoryBroadcast(previewState.recentHistory);
        return;
      }
      const event = previewEvents[kind];
      const built = event ? buildBroadcastFromOverlayMessage(event) : null;
      if (built) queueBroadcast(built, built.type === 'history' ? 15000 : 13000);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'overlay-preview-trigger') return;
      triggerPreview(String(event.data.kind || 'message'));
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, [isPreview]);

  useEffect(() => {
    if (isPreview) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/overlay/state?userId=${encodeURIComponent(userId)}`, { cache: 'no-store' });
        if (!res.ok) return;
        const next: OverlayState = await res.json();
        let showedOverlayMessage = false;

        const latestMessage: OverlayMessage | undefined = next.overlayMessages?.[0];
        const latestMessageTs = latestMessage?.timestamp || 0;
        if (prevOverlayMessageTs.current !== null && latestMessageTs > prevOverlayMessageTs.current) {
          showedOverlayMessage = true;
          const richBroadcast = latestMessage ? buildBroadcastFromOverlayMessage(latestMessage) : null;
          const newOverlayMessages = (next.overlayMessages || [])
            .filter((entry: OverlayMessage) => (entry.timestamp || 0) > prevOverlayMessageTs.current!)
            .sort((a: OverlayMessage, b: OverlayMessage) => (a.timestamp || 0) - (b.timestamp || 0));

          for (const entry of newOverlayMessages) {
            const nextBroadcast = buildBroadcastFromOverlayMessage(entry);
            if (!nextBroadcast) continue;
            queueBroadcast(nextBroadcast, nextBroadcast.type === 'history' ? 15000 : 13000);
          }
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
            }, 13000);
          }
        }
        prevHistoryTs.current = latestTs;

        const newIt = next.it?.username || null;
        if (!showedOverlayMessage && prevIt.current !== null && newIt !== prevIt.current) {
          if (!newIt) {
            fireBroadcast({ type: 'ffa', lines: ['FREE FOR ALL!', 'Anyone can tag for DOUBLE POINTS!'], icon: '🔥', color: '#ff4500', glow: '#ff8c00' }, 13000);
          } else {
            fireBroadcast({ type: 'newit', lines: [`${crown(newIt)} is now IT!`], icon: '🎯', color: '#00d9ff', glow: '#00d9ff' }, 11000);
          }
        }
        prevIt.current = newIt;
        setData(next);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [userId, isPreview]);

  useEffect(() => {
    if (isPreview) return;
    historyTimer.current = setInterval(() => {
      if (!data || broadcast || Date.now() - lastHistoryShow.current <= historyInterval) return;

      if (nextCycleMode.current === 'leaderboard' && data.leaderboard?.length) {
        fireLeaderboardBroadcast(data.leaderboard);
        nextCycleMode.current = data.recentHistory?.length ? 'history' : 'leaderboard';
        return;
      }

      if (data.recentHistory?.length) {
        fireHistoryBroadcast(data.recentHistory);
        nextCycleMode.current = data.leaderboard?.length ? 'leaderboard' : 'history';
        return;
      }

      if (data.leaderboard?.length) {
        fireLeaderboardBroadcast(data.leaderboard);
      }
    }, historyInterval);
    return () => { if (historyTimer.current) clearInterval(historyTimer.current); };
  }, [data, broadcast, historyInterval, isPreview]);

  if (!data) return null;
  const elapsed = data.lastTagTime ? Math.floor((Date.now() - data.lastTagTime) / 60000) : 0;

  return (
    <div style={{ background: 'transparent', width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', fontFamily: "'Segoe UI', Arial, sans-serif", color: '#fff', boxSizing: 'border-box' }}>
      {confetti.map((piece) => (
        <div
          key={piece.id}
          style={{
            position: 'absolute',
            top: '-8%',
            left: `${piece.left}%`,
            width: `${piece.size}vw`,
            height: `${piece.size * 1.8}vw`,
            minWidth: '6px',
            minHeight: '10px',
            background: piece.color,
            borderRadius: '2px',
            opacity: 0.92,
            transform: `rotate(${piece.rotate}deg)`,
            animation: `confettiFall ${piece.duration}s linear ${piece.delay}s forwards`,
            ['--drift' as any]: `${piece.drift}vw`,
            zIndex: 60,
            pointerEvents: 'none',
            boxShadow: `0 0 12px ${piece.color}66`,
          }}
        />
      ))}

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
          padding: '2.2vh 2.6vw', display: 'flex', alignItems: 'center', gap: '1.35vw',
          borderTop: `0.8vh solid ${data.isFFA ? '#ff4500' : '#00d9ff'}`,
          background: data.isFFA
            ? 'linear-gradient(180deg, rgba(255, 69, 0, 0.75), rgba(255, 100, 0, 0.75))'
            : 'linear-gradient(180deg, rgba(0, 180, 255, 0.75), rgba(0, 100, 200, 0.75))',
          boxSizing: 'border-box',
        }}>
          <span style={{ fontSize: 'min(10.5vw, 88px)', lineHeight: 1 }}>{data.isFFA ? '🔥' : '🎯'}</span>
          <div style={{ flexShrink: 0, overflow: 'hidden', minWidth: 0, maxWidth: 'min(40vw, 380px)' }}>
            {data.isFFA ? (
              <>
                <div style={{ fontSize: 'min(2.6vw, 2.4vh)', opacity: 0.95, fontWeight: 800, textTransform: 'uppercase', textShadow: '0 1px 4px rgba(0,0,0,0.45)' }}>FREE FOR ALL</div>
                <div style={{ fontSize: 'min(3.4vw, 3vh)', opacity: 0.92, fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.45)' }}>Anyone can tag for DOUBLE POINTS!</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 'min(2.6vw, 2.4vh)', opacity: 0.95, fontWeight: 800, textTransform: 'uppercase', textShadow: '0 1px 4px rgba(0,0,0,0.45)' }}>IT</div>
                <div style={{
                  fontSize: 'min(7.4vw, 7.8vh)',
                  fontWeight: 900,
                  lineHeight: 0.95,
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  textShadow: '0 2px 6px rgba(0,0,0,0.5)',
                }}>{crown(data.it?.username || '?')}</div>
              </>
            )}
          </div>
          <div style={{
            marginLeft: '0.9vw',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, auto))',
            alignItems: 'center',
            columnGap: '1.05vw',
            rowGap: '0.3vh',
            padding: '0.95vh 1.1vw 0.85vh',
            background: 'linear-gradient(180deg, rgba(7, 16, 30, 0.72), rgba(6, 12, 24, 0.82))',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: '0.6vw',
            boxShadow: '0 0.4vh 1.4vh rgba(0,0,0,0.35)',
          }}>
            <StackStat value={data.liveCount || 0} label="live" />
            <StackStat value={data.isFFA ? 'FFA' : `${elapsed}m`} label={data.isFFA ? 'mode' : 'it time'} />
            <StackStat value={data.playerCount} label="players" />
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
        @keyframes confettiFall {
          0% { transform: translate3d(0, -5vh, 0) rotate(0deg); opacity: 0; }
          10% { opacity: 0.95; }
          100% { transform: translate3d(var(--drift), 112vh, 0) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
