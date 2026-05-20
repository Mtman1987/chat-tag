'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { quackverseCards, type QuackverseCard } from '@/lib/quackverse-data';

type FamilyKey =
  | 'starline'
  | 'featherbolt'
  | 'cosmic'
  | 'eclipse'
  | 'lunar'
  | 'solar'
  | 'weather'
  | 'forge'
  | 'comet'
  | 'support'
  | 'tactical'
  | 'bridge';

type FamilyMeta = {
  key: FamilyKey;
  label: string;
  trunk: string;
  subclass: string;
  blurb: string;
  specialty: string;
};

type TrunkMeta = {
  label: string;
  count: number;
  blurb: string;
  specialty: string;
};

const duckCards = quackverseCards.filter((card) => card.type === 'Duck') as QuackverseCard[];
const equipmentCount = quackverseCards.length - duckCards.length;

const familyMeta: FamilyMeta[] = [
  {
    key: 'starline',
    label: 'Starline',
    trunk: 'Ranger',
    subclass: 'L/S',
    blurb: 'Banner leaders, radiant momentum, and cards that make the rest of the line feel bigger.',
    specialty: 'command pressure, tempo bursts, frontline identity',
  },
  {
    key: 'featherbolt',
    label: 'Featherbolt',
    trunk: 'Ranger',
    subclass: 'S/T',
    blurb: 'Speed-first shock pieces with a clear first-strike feel.',
    specialty: 'initiative, lightning, fast pressure',
  },
  {
    key: 'cosmic',
    label: 'Cosmic',
    trunk: 'Cosmic',
    subclass: 'L/S',
    blurb: 'Long-view cards that feel like prediction, range, and the board itself is moving around them.',
    specialty: 'vision, forecasting, board shaping',
  },
  {
    key: 'eclipse',
    label: 'Eclipse / Void / Shadow',
    trunk: 'Eclipse',
    subclass: 'bridge',
    blurb: 'The pressure line: stealth, denial, and cards that create problems instead of straight damage.',
    specialty: 'disruption, debuffs, stealth threats',
  },
  {
    key: 'lunar',
    label: 'Lunar',
    trunk: 'Ranger',
    subclass: 'L/S',
    blurb: 'Recovery, frost, and quiet control. These cards buy time and then turn it into an edge.',
    specialty: 'healing, stall, reset, counterplay',
  },
  {
    key: 'solar',
    label: 'Solar',
    trunk: 'Ranger',
    subclass: 'L/S',
    blurb: 'Burst and flare cards that end a fight, not just start one.',
    specialty: 'burst, cleanse, finisher energy',
  },
  {
    key: 'weather',
    label: 'Weather',
    trunk: 'Ranger',
    subclass: 'S/T',
    blurb: 'Wind, sky, and storm cards that move pieces, break formations, and change lanes.',
    specialty: 'push-pull movement, positioning, tempo',
  },
  {
    key: 'forge',
    label: 'Forge / Iron',
    trunk: 'Ranger',
    subclass: 'S/T',
    blurb: 'Armor, tools, and structure. These cards hold the line and make other cards work better.',
    specialty: 'defense, equipment themes, structural play',
  },
  {
    key: 'comet',
    label: 'Comet / Meteor',
    trunk: 'Ranger',
    subclass: 'L/S',
    blurb: 'Drive-by impact cards. They feel fast, angled, and a little hard to pin down.',
    specialty: 'momentum, impact, angled aggression',
  },
  {
    key: 'support',
    label: 'Support / Medic / Repair',
    trunk: 'Cosmic',
    subclass: 'S/T',
    blurb: 'Keep-the-machine-running cards: heals, fixes, and stabilization.',
    specialty: 'repair, sustain, recovery',
  },
  {
    key: 'tactical',
    label: 'Tactical / Special Ops',
    trunk: 'Eclipse',
    subclass: 'S/T',
    blurb: 'Trick-play cards that create utility, ambush windows, and weird board outcomes.',
    specialty: 'ambush, flex tools, rule-bending',
  },
  {
    key: 'bridge',
    label: 'Bridge / Outlier',
    trunk: 'Bridge',
    subclass: 'Bridge',
    blurb: 'Cards that are intentionally flexible until the pool grows enough to give them a permanent home.',
    specialty: 'flex placement, lore placeholders, future split points',
  },
];

const trunkMeta: TrunkMeta[] = [
  {
    label: 'Ranger',
    count: 37,
    blurb: 'The main frontline trunk. Rangers are the flexible, playable center of the roster.',
    specialty: 'initiative, formation pressure, direct board action',
  },
  {
    label: 'Cosmic',
    count: 14,
    blurb: 'The high-vision trunk. Cosmic cards feel wide, predictive, and space-aware.',
    specialty: 'setup, range, awareness, board shaping',
  },
  {
    label: 'Eclipse',
    count: 14,
    blurb: 'The disruption trunk. Eclipse cards create pressure by hiding, weakening, or redirecting.',
    specialty: 'debuffs, denial, stealth pressure',
  },
];

const subclassMeta = [
  {
    label: 'L/S',
    title: 'Lunar / Solar',
    blurb: 'This is the bright-vs-dark celestial line. Use it for flare, frost, starline, comet, and explosive finishers.',
    specialty: 'burst, spectacle, finishing power',
  },
  {
    label: 'S/T',
    title: 'Support / Tech',
    blurb: 'This is the utility line. Use it for armor, weather, repair, and cards that keep the board under control.',
    specialty: 'stabilize, reposition, endure, assist',
  },
] as const;

function classifyFamily(name: string): FamilyKey {
  const lower = name.toLowerCase();
  if (lower.includes('astro waddle') || lower.includes('flashplume') || lower.includes('nightflare')) return 'bridge';
  if (lower.includes('starlash') || lower.includes('starflare') || lower.includes('starbreaker') || lower.includes('starseer') || lower.includes('starshield')) return 'starline';
  if (lower.includes('featherbolt') || lower.includes('boltfeather') || lower.includes('thunderquill') || lower.includes('stormfeather') || lower.includes('boltstrike')) return 'featherbolt';
  if (lower.includes('galaxy') || lower.includes('nebula') || lower.includes('quasar') || lower.includes('quantum') || lower.includes('orbit') || lower.includes('milky way') || lower.includes('venus') || lower.includes('cosmic')) return 'cosmic';
  if (lower.includes('void') || lower.includes('eclipse') || lower.includes('shadow')) return 'eclipse';
  if (lower.includes('lunar') || lower.includes('moonbeam') || lower.includes('frost')) return 'lunar';
  if (lower.includes('solar') || lower.includes('ember')) return 'solar';
  if (lower.includes('cloud') || lower.includes('gale') || lower.includes('sky')) return 'weather';
  if (lower.includes('forge') || lower.includes('iron')) return 'forge';
  if (lower.includes('comet') || lower.includes('meteor')) return 'comet';
  if (
    lower.includes('downfeather') ||
    lower.includes('downburst') ||
    lower.includes('injector') ||
    lower.includes('bracer') ||
    lower.includes('repair') ||
    lower.includes('medic') ||
    lower.includes('support') ||
    lower.includes('shield') ||
    lower.includes('anchor') ||
    lower.includes('stabilizer')
  ) {
    return 'support';
  }
  if (lower.includes('web-slap') || lower.includes('assassin') || lower.includes('quackverse') || lower.includes('waddle')) return 'tactical';
  return 'bridge';
}

const familyRows = familyMeta
  .map((family) => ({
    ...family,
    cards: duckCards.filter((card) => classifyFamily(card.name) === family.key),
  }))
  .sort((a, b) => b.cards.length - a.cards.length);

export default function QuackverseGuidePage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-xl border border-white/10 bg-black/30 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-cyan-300/50 text-cyan-100">Quackverse guide</Badge>
                <Badge variant="outline" className="border-white/20 text-slate-200">{duckCards.length} ducks</Badge>
                <Badge variant="outline" className="border-white/20 text-slate-200">{equipmentCount} equipment</Badge>
                <Badge variant="outline" className="border-fuchsia-300/50 text-fuchsia-100">11 family lines</Badge>
                <Badge variant="outline" className="border-emerald-300/50 text-emerald-100">3 trunks</Badge>
              </div>
              <div>
                <h1 className="font-headline text-3xl">Quackverse schema, rules, and family index</h1>
                <p className="mt-2 max-w-3xl text-sm text-slate-300">
                  This is the working production map for the card set. It separates the game into trunks, subclasses, families, and individual cards so you can keep lore readable without losing balance.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="secondary">
                <Link href="/quackverse-preview">Open preview sandbox</Link>
              </Button>
              <Button asChild>
                <Link href="/quackverse">Open full game</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-4">
          <Card className="border-white/10 bg-black/25">
            <CardHeader>
              <CardTitle className="text-lg">1. Trunk</CardTitle>
              <CardDescription className="text-slate-300">Big lore branch. The trunk decides the broad identity.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-300">
              <div>Ranger, Cosmic, Eclipse.</div>
              <div>Use the trunk to read the card at a glance.</div>
            </CardContent>
          </Card>
          <Card className="border-white/10 bg-black/25">
            <CardHeader>
              <CardTitle className="text-lg">2. Subclass</CardTitle>
              <CardDescription className="text-slate-300">Secondary balance tag. This is where the card leans.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-300">
              <div>L/S and S/T are the current useful split.</div>
              <div>They help separate burst from utility.</div>
            </CardContent>
          </Card>
          <Card className="border-white/10 bg-black/25">
            <CardHeader>
              <CardTitle className="text-lg">3. Family</CardTitle>
              <CardDescription className="text-slate-300">The lineage. This is where the name and visual language live.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-300">
              <div>Starline, Featherbolt, Cosmic, Eclipse, Lunar, Solar, Weather, Forge, Comet, Support, Tactical.</div>
            </CardContent>
          </Card>
          <Card className="border-white/10 bg-black/25">
            <CardHeader>
              <CardTitle className="text-lg">4. Variant</CardTitle>
              <CardDescription className="text-slate-300">Prime, Ultra, Legendary, and other limited forms.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-300">
              <div>This is where upgrades and special editions live.</div>
              <div>It should not change the family identity.</div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {trunkMeta.map((trunk) => (
            <Card key={trunk.label} className="border-white/10 bg-black/25">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-xl">{trunk.label}</CardTitle>
                  <Badge variant="outline" className="border-white/20 text-slate-200">{trunk.count} ducks</Badge>
                </div>
                <CardDescription className="text-slate-300">{trunk.blurb}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-slate-300">
                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                  <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">Specialty</div>
                  <div>{trunk.specialty}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          {subclassMeta.map((subclass) => (
            <Card key={subclass.label} className="border-white/10 bg-black/25">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-xl">{subclass.label} - {subclass.title}</CardTitle>
                  <Badge variant="outline" className="border-white/20 text-slate-200">secondary tag</Badge>
                </div>
                <CardDescription className="text-slate-300">{subclass.blurb}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-slate-300">
                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                  <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">Specialty</div>
                  <div>{subclass.specialty}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="rounded-xl border border-white/10 bg-black/25 p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-headline text-2xl">Rules and current build</h2>
              <p className="text-sm text-slate-300">This is the part of the project we already have in place.</p>
            </div>
            <Badge variant="outline" className="border-cyan-300/50 text-cyan-100">Preview + full game + art manager</Badge>
          </div>

          <Accordion type="multiple" defaultValue={['rules', 'build']} className="space-y-3">
            <AccordionItem value="rules" className="rounded-lg border border-white/10 px-4">
              <AccordionTrigger className="text-left text-base hover:no-underline">Game rules</AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-3 text-sm text-slate-300 md:grid-cols-2">
                  <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                    Ducks are characters. Equipment are modifiers. Keep those separate.
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                    The battlefield is a grid. Click to move. Drag to move. Attack and ability systems live in the full game, not the preview sandbox.
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                    Highlighted preview art can swap between static PNG and animated GIF for the same card.
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                    The art manager stores uploads on the volume, so the preview can keep using them after deploys.
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="build" className="rounded-lg border border-white/10 px-4">
              <AccordionTrigger className="text-left text-base hover:no-underline">What we already built</AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-3 text-sm text-slate-300 md:grid-cols-2">
                  <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">Public preview sandbox at <span className="font-mono text-cyan-100">/quackverse-preview</span>.</div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">Hover GIF behavior with delayed fallback to the matching static image.</div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">Art upload and manifest routes for static and hover assets.</div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">Card data model supports family tags and art variants.</div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        <section className="rounded-xl border border-white/10 bg-black/25 p-5">
          <div className="mb-4">
            <h2 className="font-headline text-2xl">Family index</h2>
            <p className="text-sm text-slate-300">
              This is the working index for the current 80-duck pool. It keeps the lore readable and makes balance decisions easier.
            </p>
          </div>

          <Accordion type="single" collapsible className="space-y-3">
            {familyRows.map((family) => (
              <AccordionItem key={family.key} value={family.key} className="rounded-lg border border-white/10 px-4">
                <AccordionTrigger className="text-left text-base hover:no-underline">
                  <span className="flex flex-wrap items-center gap-2">
                    <span>{family.label}</span>
                    <Badge variant="outline" className="border-white/20 text-slate-200">{family.cards.length} cards</Badge>
                    <Badge variant="outline" className="border-cyan-300/50 text-cyan-100">{family.trunk}</Badge>
                    <Badge variant="outline" className="border-fuchsia-300/50 text-fuchsia-100">{family.subclass}</Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 text-sm text-slate-300">
                    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                      <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">Family flair</div>
                      <div>{family.blurb}</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                      <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">Specialty</div>
                      <div>{family.specialty}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {family.cards.map((card) => (
                        <Badge key={card.id} variant="secondary" className="bg-white/[0.08] text-slate-100">
                          #{card.id} {card.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-5 text-sm text-slate-200">
          <div className="font-semibold text-white">Bridge cards and the next stage</div>
          <p className="mt-2 text-slate-300">
            Four cards are intentionally flexible right now: <span className="font-mono text-amber-100">Astro Waddle</span>,{' '}
            <span className="font-mono text-amber-100">Ranger Flashplume</span>, <span className="font-mono text-amber-100">Ranger Nightflare</span>, and{' '}
            <span className="font-mono text-amber-100">Ranger Nightflare Prime</span>. I would leave those as bridge cards until the next wave of ducks lands.
          </p>
          <p className="mt-2 text-slate-300">
            Stage 2, if you want it, is a production index that adds per-card notes, upload slots, and the exact family assignment for all 80 cards.
          </p>
        </section>
      </div>
    </main>
  );
}
