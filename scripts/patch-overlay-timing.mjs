import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const filePath = path.join(repoRoot, 'src/app/overlay/[userId]/page.tsx');
const diskSource = fs.readFileSync(filePath, 'utf8');
let source = diskSource.replace(/\r\n/g, '\n');

const oldTiming = "  const historyInterval = parseInt(searchParams.get('cycle') || '240') * 1000;";
const newTiming = [
  "  const historyInterval = Math.max(300, parseInt(searchParams.get('cycle') || '420', 10) || 420) * 1000;",
  "  const hudOnMs = Math.max(5, parseInt(searchParams.get('hudOn') || '45', 10) || 45) * 1000;",
  "  const hudOffMs = Math.max(0, parseInt(searchParams.get('hudOff') || '120', 10) || 0) * 1000;",
].join('\n');
if (!source.includes(newTiming)) {
  if (!source.includes(oldTiming)) throw new Error('ChatTag overlay timing patch: timing marker missing');
  source = source.replace(oldTiming, newTiming);
}

const oldState = "  const [dimBar, setDimBar] = useState(false);";
const newState = `${oldState}\n  const [hudVisible, setHudVisible] = useState(true);`;
if (!source.includes('const [hudVisible, setHudVisible] = useState(true);')) {
  if (!source.includes(oldState)) throw new Error('ChatTag overlay timing patch: HUD state marker missing');
  source = source.replace(oldState, newState);
}

const effectMarker = "  useEffect(() => {\n    winnersRef.current = data?.monthlyWinners || [];\n  }, [data?.monthlyWinners]);";
const hudEffect = `${effectMarker}\n\n  useEffect(() => {\n    if (hudOffMs <= 0) {\n      setHudVisible(true);\n      return;\n    }\n\n    let timer: ReturnType<typeof setTimeout> | null = null;\n    let cancelled = false;\n    const show = () => {\n      if (cancelled) return;\n      setHudVisible(true);\n      timer = setTimeout(hide, hudOnMs);\n    };\n    const hide = () => {\n      if (cancelled) return;\n      setHudVisible(false);\n      timer = setTimeout(show, hudOffMs);\n    };\n\n    setHudVisible(true);\n    timer = setTimeout(hide, hudOnMs);\n    return () => {\n      cancelled = true;\n      if (timer) clearTimeout(timer);\n    };\n  }, [hudOffMs, hudOnMs]);`;
if (!source.includes('timer = setTimeout(hide, hudOnMs);')) {
  if (!source.includes(effectMarker)) throw new Error('ChatTag overlay timing patch: effect marker missing');
  source = source.replace(effectMarker, hudEffect);
}

const oldHudStyle = "        transition: 'opacity 0.4s ease, transform 0.4s ease',\n        opacity: dimBar ? 0.12 : 1, transform: dimBar ? 'translateY(5%)' : 'translateY(0)',";
const newHudStyle = "        transition: 'opacity 0.8s ease, transform 0.8s ease',\n        opacity: dimBar ? 0.12 : (hudVisible ? 1 : 0),\n        transform: dimBar ? 'translateY(5%)' : (hudVisible ? 'translateY(0)' : 'translateY(100%)'),\n        pointerEvents: hudVisible ? 'auto' : 'none',";
if (!source.includes("opacity: dimBar ? 0.12 : (hudVisible ? 1 : 0)")) {
  if (!source.includes(oldHudStyle)) throw new Error('ChatTag overlay timing patch: HUD style marker missing');
  source = source.replace(oldHudStyle, newHudStyle);
}

for (const marker of [
  "searchParams.get('cycle') || '420'",
  "searchParams.get('hudOn') || '45'",
  "searchParams.get('hudOff') || '120'",
  'const [hudVisible, setHudVisible] = useState(true);',
  "opacity: dimBar ? 0.12 : (hudVisible ? 1 : 0)",
]) {
  if (!source.includes(marker)) throw new Error(`ChatTag overlay timing patch incomplete: ${marker}`);
}

fs.writeFileSync(filePath, source, 'utf8');
console.log('ChatTag overlay timing patch applied');
