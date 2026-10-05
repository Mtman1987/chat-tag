'use client';
import { useEffect, useState } from 'react';

export function useMosaicReveal(until?: string) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (!until) return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [until]);
  return Math.max(0, Math.ceil((Date.parse(until || '') - now) / 1000)) || 0;
}
