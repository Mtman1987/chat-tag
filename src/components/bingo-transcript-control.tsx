'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Send, Waves } from 'lucide-react';
import { useSession } from '@/contexts/session-context';

function normalize(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/^#/, '');
}

export function BingoTranscriptControl({ channel }: { channel: string }) {
  const { user } = useSession();
  const recognitionRef = useRef<any>(null);
  const [listening,setListening] = useState(false);
  const [supported,setSupported] = useState<boolean | null>(null);
  const [manual,setManual] = useState('');
  const [lastTranscript,setLastTranscript] = useState('');
  const [result,setResult] = useState('');
  const [busy,setBusy] = useState(false);
  const owner = normalize(user?.twitchUsername);
  const broadcaster = Boolean(channel && owner && normalize(channel) === owner);

  async function sendTranscript(text: string) {
    const clean = text.trim();
    if (!clean || !broadcaster) return;
    setBusy(true);
    try {
      const response = await fetch('/api/game-hub/bingo-transcript', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({channel,text:clean}),
      });
      const body = await response.json().catch(()=>({}));
      if (!response.ok) throw new Error(body.error || 'Transcript was rejected.');
      setLastTranscript(clean);
      const triggered = Array.isArray(body.triggered) ? body.triggered : [];
      const blocked = Array.isArray(body.blocked) ? body.blocked : [];
      if (triggered.length) setResult(`Opened ${triggered.join(', ')} for 15 seconds.`);
      else if (blocked.length) setResult(`Stella blocked ${blocked.join(', ')}.`);
      else setResult('Heard it. No Bingo phrase matched.');
    } catch (error:any) {
      setResult(error?.message || 'Transcript could not be sent.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const Recognition = typeof window !== 'undefined'
      ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
      : null;
    setSupported(Boolean(Recognition));
    return () => {
      try { recognitionRef.current?.stop?.(); } catch {}
      recognitionRef.current = null;
    };
  }, []);

  function start() {
    if (!broadcaster) {
      setResult(`Sign in as #${channel} to connect that streamer's microphone.`);
      return;
    }
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) { setSupported(false); return; }
    try { recognitionRef.current?.stop?.(); } catch {}
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onstart = () => { setListening(true); setResult('Listening to the streamer microphone…'); };
    recognition.onend = () => { setListening(false); recognitionRef.current = null; };
    recognition.onerror = (event:any) => {
      setListening(false);
      setResult(event?.error === 'not-allowed' ? 'Microphone permission was denied.' : `Microphone error: ${event?.error || 'unknown'}`);
    };
    recognition.onresult = (event:any) => {
      for (let index=event.resultIndex; index<event.results.length; index+=1) {
        const entry=event.results[index];
        if (!entry?.isFinal) continue;
        const transcript=String(entry[0]?.transcript || '').trim();
        if (transcript) void sendTranscript(transcript);
      }
    };
    recognitionRef.current = recognition;
    recognition.start();
  }

  function stop() {
    try { recognitionRef.current?.stop?.(); } catch {}
    recognitionRef.current = null;
    setListening(false);
    setResult('Microphone disconnected.');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text=manual.trim();
    if (!text) return;
    await sendTranscript(text);
    setManual('');
  }

  return <section className="space-y-4">
    <div className="rounded-3xl border border-cyan-300/15 bg-cyan-300/[.05] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.18em] text-cyan-200"><Waves className="h-4 w-4"/>Streamer transcript</div>
          <h2 className="mt-2 text-2xl font-black text-white">Connect Bingo to the microphone</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Final speech text is sent to the existing Bingo matcher. Raw microphone audio is not stored by Nebula. A matching phrase opens that square for 15 seconds; if chat does not claim it, Stella takes it.</p>
        </div>
        <div className={`rounded-full px-3 py-1.5 text-xs font-black ${listening?'bg-emerald-300/15 text-emerald-200':'bg-white/8 text-slate-400'}`}>{listening?'LISTENING':'DISCONNECTED'}</div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {!listening ? <button type="button" onClick={start} disabled={!broadcaster || supported===false} className="inline-flex items-center gap-2 rounded-xl bg-emerald-300 px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-40"><Mic className="h-4 w-4"/>Start listening</button>
          : <button type="button" onClick={stop} className="inline-flex items-center gap-2 rounded-xl bg-rose-300 px-4 py-2.5 text-sm font-black text-slate-950"><MicOff className="h-4 w-4"/>Stop listening</button>}
      </div>

      {!broadcaster ? <p className="mt-3 text-xs text-amber-200">You are viewing #{channel}. Only that broadcaster's signed-in controller may provide the microphone transcript.</p> : null}
      {supported===false ? <p className="mt-3 text-xs text-amber-200">This browser does not expose live speech recognition. Use the manual transcript test below; a recorded-audio STT fallback can be added next.</p> : null}
      {result ? <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3 text-sm text-slate-200">{result}</div> : null}
      {lastTranscript ? <p className="mt-2 text-xs text-slate-500">Last final transcript: “{lastTranscript}”</p> : null}
    </div>

    <form onSubmit={submit} className="rounded-3xl border border-white/10 bg-white/[.025] p-5">
      <div className="text-xs font-black uppercase tracking-[.16em] text-slate-400">Manual transcript test</div>
      <p className="mt-1 text-xs text-slate-500">Useful while testing phrase matching without speaking.</p>
      <div className="mt-3 flex gap-2">
        <input value={manual} onChange={(event)=>setManual(event.target.value)} placeholder="Type exactly what the streamer said…" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-sm text-white outline-none"/>
        <button disabled={!broadcaster || busy || !manual.trim()} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-40"><Send className="h-4 w-4"/>Feed</button>
      </div>
    </form>
  </section>;
}
