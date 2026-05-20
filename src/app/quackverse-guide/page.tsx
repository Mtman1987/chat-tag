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
  trunk: 'Ranger' | 'Cosmic' | 'Eclipse' | 'Bridge';
  subclass: 'L/S' | 'S/T' | 'Bridge';
  story: string;
  blurb: string;
  specialty: string;
};

type TrunkMeta = {
  label: 'Ranger' | 'Cosmic' | 'Eclipse' | 'Bridge';
  story: string;
  blurb: string;
  specialty: string;
};

type SubclassMeta = {
  label: 'L/S' | 'S/T';
  title: string;
  story: string;
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
    story: 'The banner line of the Ranger houses. Starline cards feel like leaders, mascots, and the cards the rest of the roster rallies around.',
    blurb: 'Command identity, radiant pressure, and the central hero tone.',
    specialty: 'leadership, pressure, momentum',
  },
  {
    key: 'featherbolt',
    label: 'Featherbolt',
    trunk: 'Ranger',
    subclass: 'S/T',
    story: 'The lightning branch. These are the quick-strike birds, built for first contact and fast board control.',
    blurb: 'Fast hands, electric openings, and momentum before the opponent stabilizes.',
    specialty: 'initiative, lightning, tempo',
  },
  {
    key: 'cosmic',
    label: 'Cosmic',
    trunk: 'Cosmic',
    subclass: 'L/S',
    story: 'The mapmaker branch. Cosmic families watch the board, plan ahead, and make space itself feel like part of the move.',
    blurb: 'Prediction, range, foresight, and board shaping.',
    specialty: 'vision, planning, control',
  },
  {
    key: 'eclipse',
    label: 'Eclipse / Void / Shadow',
    trunk: 'Eclipse',
    subclass: 'L/S',
    story: 'The pressure line. Eclipse cards are about denial, silence, and the feeling that the board has started working against you.',
    blurb: 'Stealth, debuffs, and control through pressure instead of brute force.',
    specialty: 'disruption, stealth, denial',
  },
  {
    key: 'lunar',
    label: 'Lunar',
    trunk: 'Ranger',
    subclass: 'L/S',
    story: 'The moon side of the celestial branch. Lunar cards heal, stall, and reset the fight until they can turn the tempo back.',
    blurb: 'Recovery, frost, patience, and control.',
    specialty: 'healing, stall, reset',
  },
  {
    key: 'solar',
    label: 'Solar',
    trunk: 'Ranger',
    subclass: 'L/S',
    story: 'The flare side of the celestial branch. Solar cards are bright finishers, burst cards, and the clean end to a long setup.',
    blurb: 'Burst damage, clean finishes, radiant force.',
    specialty: 'burst, finisher energy, cleanse',
  },
  {
    key: 'weather',
    label: 'Weather / Electric',
    trunk: 'Ranger',
    subclass: 'S/T',
    story: 'The storm line. Weather cards break formations, pull pieces around, and make positioning matter more than raw stats.',
    blurb: 'Wind, lightning, and lane control.',
    specialty: 'movement, disruption, tempo',
  },
  {
    key: 'forge',
    label: 'Forge / Iron',
    trunk: 'Ranger',
    subclass: 'S/T',
    story: 'The armor line. Forge cards are the tools, shields, and structure that let the roster survive long enough to do its job.',
    blurb: 'Defense, equipment themes, hard structure.',
    specialty: 'durability, defense, support gear',
  },
  {
    key: 'comet',
    label: 'Comet / Meteor',
    trunk: 'Ranger',
    subclass: 'L/S',
    story: 'The impact line. These ducks hit fast, land hard, and make every move feel like a flyby instead of a brawl.',
    blurb: 'Speed, angled pressure, and collision damage.',
    specialty: 'impact, momentum, dive attacks',
  },
  {
    key: 'support',
    label: 'Support / Medic / Repair',
    trunk: 'Cosmic',
    subclass: 'S/T',
    story: 'The maintenance line. Support cards keep the machine running: heals, repairs, protection, and recovery windows.',
    blurb: 'Sustain, repair, and stability.',
    specialty: 'healing, repair, protection',
  },
  {
    key: 'tactical',
    label: 'Tactical / Special Ops',
    trunk: 'Eclipse',
    subclass: 'S/T',
    story: 'The trick-play line. Tactical cards create odd board states, surprise windows, and utility that looks strange until it wins the game.',
    blurb: 'Ambushes, utility, and rule-bending lines.',
    specialty: 'ambush, flex tools, weird plays',
  },
  {
    key: 'bridge',
    label: 'Bridge / Outlier',
    trunk: 'Bridge',
    subclass: 'Bridge',
    story: 'Cards that are intentionally flexible while the pool is still being built. These are the place where future family splits can land.',
    blurb: 'Temporary home for cards that do not fit cleanly yet.',
    specialty: 'flex placement, lore placeholders',
  },
];

const trunkMeta: TrunkMeta[] = [
  {
    label: 'Ranger',
    story: 'The frontline trunk. Ranger cards are the center of the roster and the easiest place to build an opening hand around.',
    blurb: 'Flexible, readable, and the most directly playable branch.',
    specialty: 'initiative, board pressure, direct action',
  },
  {
    label: 'Cosmic',
    story: 'The long-view trunk. Cosmic cards are about prediction, range, and making the board feel larger than the current turn.',
    blurb: 'High vision, wide effects, planning, and board shaping.',
    specialty: 'setup, foresight, positioning',
  },
  {
    label: 'Eclipse',
    story: 'The pressure trunk. Eclipse cards win by making the other side spend turns recovering from what just happened.',
    blurb: 'Disruption, stealth, denial, and the darker edge of the set.',
    specialty: 'debuffs, stealth, denial',
  },
  {
    label: 'Bridge',
    story: 'The staging trunk. Bridge cards are not a final taxonomy; they are the place to park the awkward, experimental, or future-defined ducks.',
    blurb: 'Useful for outliers and the next expansion wave.',
    specialty: 'future split points, experimental identity',
  },
];

const subclassMeta: SubclassMeta[] = [
  {
    label: 'L/S',
    title: 'Lunar / Solar',
    story: 'The celestial split. It is the line between recovery and finish, frost and flare, patient control and clean burst.',
    specialty: 'burst, sustain, spectacle, finishing',
  },
  {
    label: 'S/T',
    title: 'Support / Tech',
    story: 'The utility split. It covers armor, weather, repair, and cards that keep the board stable while the rest of the deck does the fighting.',
    specialty: 'stabilize, reposition, endure, assist',
  },
];

function getFamilyKey(card: QuackverseCard): FamilyKey {
  const lower = card.name.toLowerCase();

  if (card.id === 14 || lower.includes('astro waddle')) return 'bridge';
  if (lower.includes('nightflare') || lower.includes('flashplume')) return 'bridge';
  if (lower.includes('starlash') || lower.includes('starbreaker') || lower.includes('starflare') || lower.includes('starseer') || lower.includes('starshield')) {
    return 'starline';
  }
  if (lower.includes('featherbolt') || lower.includes('boltfeather') || lower.includes('thunderquill') || lower.includes('boltstrike')) return 'featherbolt';
  if (
    lower.includes('galaxy') ||
    lower.includes('nebula') ||
    lower.includes('quasar') ||
    lower.includes('quantum') ||
    lower.includes('orbit') ||
    lower.includes('milky way') ||
    lower.includes('venus') ||
    lower.includes('cosmic')
  ) {
    return 'cosmic';
  }
  if (lower.includes('void') || lower.includes('eclipse') || lower.includes('shadow')) return 'eclipse';
  if (lower.includes('lunar') || lower.includes('moonbeam') || lower.includes('frost')) return 'lunar';
  if (lower.includes('solar') || lower.includes('ember')) return 'solar';
  if (lower.includes('cloud') || lower.includes('gale') || lower.includes('storm') || lower.includes('sky')) return 'weather';
  if (lower.includes('forge') || lower.includes('iron') || lower.includes('featherforge')) return 'forge';
  if (lower.includes('comet') || lower.includes('meteor') || lower.includes('downburst')) return 'comet';
  if (
    lower.includes('downfeather') ||
    lower.includes('medic') ||
    lower.includes('repair') ||
    lower.includes('support') ||
    lower.includes('shield') ||
    lower.includes('anchor') ||
    lower.includes('stabilizer') ||
    lower.includes('injector') ||
    lower.includes('lens') ||
    lower.includes('beacon') ||
    lower.includes('bracer') ||
    lower.includes('charm')
  ) {
    return 'support';
  }
  if (lower.includes('web-slap') || lower.includes('assassin') || lower.includes('quackverse')) return 'tactical';
  return 'bridge';
}

const familyRows = familyMeta
  .map((family) => ({
    ...family,
    cards: duckCards.filter((card) => getFamilyKey(card) === family.key).sort((a, b) => a.id - b.id),
  }))
  .sort((a, b) => b.cards.length - a.cards.length);

const trunkRows = trunkMeta.map((trunk) => {
  const cards = duckCards
    .filter((card) => {
      const family = familyRows.find((row) => row.cards.some((entry) => entry.id === card.id));
      return family?.trunk === trunk.label;
    })
    .sort((a, b) => a.id - b.id);

  return {
    ...trunk,
    cards,
  };
});

const bridgeCards = familyRows.find((family) => family.key === 'bridge')?.cards || [];

function cardFamilyLabel(card: QuackverseCard) {
  const family = familyRows.find((row) => row.cards.some((entry) => entry.id === card.id));
  return family?.label || 'Unsorted';
}

function statLabel(label: string) {
  return (
    <span className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[0.65rem] uppercase tracking-wide text-slate-300">
      {label}
    </span>
  );
}

export default function QuackverseGuidePage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-xl border border-white/10 bg-black/30 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-cyan-300/50 text-cyan-100">
                  Quackverse guide
                </Badge>
                <Badge variant="outline" className="border-white/20 text-slate-200">
                  {duckCards.length} ducks
                </Badge>
                <Badge variant="outline" className="border-white/20 text-slate-200">
                  {equipmentCount} equipment
                </Badge>
                <Badge variant="outline" className="border-fuchsia-300/50 text-fuchsia-100">
                  {familyMeta.length} family lines
                </Badge>
                <Badge variant="outline" className="border-emerald-300/50 text-emerald-100">
                  3 trunks
                </Badge>
                <Badge variant="outline" className="border-amber-300/50 text-amber-100">
                  2 subclasses
                </Badge>
              </div>
              <div>
                <h1 className="font-headline text-3xl">Quackverse schema, family index, and card guide</h1>
                <p className="mt-2 max-w-3xl text-sm text-slate-300">
                  This is the production map for the set. It separates the roster into trunks, subclasses, families, and cards so you can keep balance readable without losing the lore or the art direction.
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
              <CardDescription className="text-slate-300">Big lore branch. This tells you the broad identity of the card.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-300">
              <div>Ranger, Cosmic, Eclipse, Bridge.</div>
              <div>Use the trunk first when reading a card.</div>
            </CardContent>
          </Card>
          <Card className="border-white/10 bg-black/25">
            <CardHeader>
              <CardTitle className="text-lg">2. Subclass</CardTitle>
              <CardDescription className="text-slate-300">Balance split. This is the gameplay side of the identity.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-300">
              <div>L/S and S/T are the useful production split.</div>
              <div>Bright burst versus utility/stability.</div>
            </CardContent>
          </Card>
          <Card className="border-white/10 bg-black/25">
            <CardHeader>
              <CardTitle className="text-lg">3. Family</CardTitle>
              <CardDescription className="text-slate-300">The lineage. This is where names, visual language, and short stories live.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-300">
              <div>Starline, Featherbolt, Cosmic, Eclipse, Lunar, Solar, Weather, Forge, Comet, Support, Tactical, Bridge.</div>
            </CardContent>
          </Card>
          <Card className="border-white/10 bg-black/25">
            <CardHeader>
              <CardTitle className="text-lg">4. Variant</CardTitle>
              <CardDescription className="text-slate-300">Prime, Ultra, Legendary, and other special forms.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-300">
              <div>Variant changes power and presentation, not the family identity.</div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <Card className="border-white/10 bg-black/25">
            <CardHeader>
              <CardTitle className="text-lg">Deck record</CardTitle>
              <CardDescription className="text-slate-300">One active deck per player for now. Results attach to the saved deck flag.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-300">
              <div>Deck wins and losses are stored on the player collection.</div>
              <div>The current deck is the default match deck when it exists.</div>
              <div>Cards in that deck inherit the deck result line for display.</div>
            </CardContent>
          </Card>
          <Card className="border-white/10 bg-black/25">
            <CardHeader>
              <CardTitle className="text-lg">Stats</CardTitle>
              <CardDescription className="text-slate-300">Board stats need to read cleanly, so each stat has one job.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-300">
              <div><span className="font-semibold text-white">ATK</span>: damage output.</div>
              <div><span className="font-semibold text-white">DEF</span>: damage reduction and durability.</div>
              <div><span className="font-semibold text-white">SPD</span>: movement, turn tempo, and positioning.</div>
              <div><span className="font-semibold text-white">SPC</span>: ability charge, gear impact, and special potency.</div>
              <div><span className="font-semibold text-white">Fatigue</span>: reduces SPD first.</div>
            </CardContent>
          </Card>
          <Card className="border-white/10 bg-black/25">
            <CardHeader>
              <CardTitle className="text-lg">Board flow</CardTitle>
              <CardDescription className="text-slate-300">Match setup now starts empty unless a real deck is chosen.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-300">
              <div>Player 1 enters from the bottom row.</div>
              <div>Player 2 enters from the top row.</div>
              <div>Highlighted squares should be clickable as move targets.</div>
              <div>The squad strip is gone from the live board.</div>
              <div>Abilities spend Special and only fire when the duck has enough charge.</div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          {trunkMeta.map((trunk) => (
            <Card key={trunk.label} className="border-white/10 bg-black/25">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-xl">{trunk.label}</CardTitle>
                  <Badge variant="outline" className="border-white/20 text-slate-200">
                    {trunkRows.find((row) => row.label === trunk.label)?.cards.length || 0} ducks
                  </Badge>
                </div>
                <CardDescription className="text-slate-300">{trunk.blurb}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-300">
                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                  <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">Background</div>
                  <div>{trunk.story}</div>
                </div>
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
                  <CardTitle className="text-xl">
                    {subclass.label} - {subclass.title}
                  </CardTitle>
                  <Badge variant="outline" className="border-white/20 text-slate-200">
                    secondary tag
                  </Badge>
                </div>
                <CardDescription className="text-slate-300">{subclass.story}</CardDescription>
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
          <div className="mb-4">
            <h2 className="font-headline text-2xl">Family index</h2>
            <p className="text-sm text-slate-300">
              Families are the lore layer. This is the working index for the current set, with a short story and role note for each line.
            </p>
          </div>

          <Accordion type="single" collapsible className="space-y-3">
            {familyRows.map((family) => (
              <AccordionItem key={family.key} value={family.key} className="rounded-lg border border-white/10 px-4">
                <AccordionTrigger className="text-left text-base hover:no-underline">
                  <span className="flex flex-wrap items-center gap-2">
                    <span>{family.label}</span>
                    <Badge variant="outline" className="border-white/20 text-slate-200">
                      {family.cards.length} cards
                    </Badge>
                    <Badge variant="outline" className="border-cyan-300/50 text-cyan-100">
                      {family.trunk}
                    </Badge>
                    <Badge variant="outline" className="border-fuchsia-300/50 text-fuchsia-100">
                      {family.subclass}
                    </Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 text-sm text-slate-300">
                    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                      <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">Background</div>
                      <div>{family.story}</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                      <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">Specialty</div>
                      <div>{family.specialty}</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                      <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Cards</div>
                      <div className="flex flex-wrap gap-2">
                        {family.cards.map((card) => (
                          <Badge key={card.id} variant="secondary" className="bg-white/[0.08] text-slate-100">
                            #{card.id} {card.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section className="rounded-xl border border-white/10 bg-black/25 p-5">
          <div className="mb-4">
            <h2 className="font-headline text-2xl">Character index</h2>
            <p className="text-sm text-slate-300">
              This is the production list for the ducks themselves. Each row shows the card, its family, and the role it plays in the roster.
            </p>
          </div>

          <Accordion type="multiple" defaultValue={['ranger', 'cosmic']} className="space-y-3">
            {trunkRows.map((trunk) => (
              <AccordionItem key={trunk.label} value={trunk.label.toLowerCase()} className="rounded-lg border border-white/10 px-4">
                <AccordionTrigger className="text-left text-base hover:no-underline">
                  <span className="flex flex-wrap items-center gap-2">
                    <span>{trunk.label}</span>
                    <Badge variant="outline" className="border-white/20 text-slate-200">
                      {trunk.cards.length} ducks
                    </Badge>
                    <Badge variant="outline" className="border-emerald-300/50 text-emerald-100">
                      character index
                    </Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2">
                    {trunk.cards.map((card) => {
                      const familyLabel = cardFamilyLabel(card);
                      return (
                        <div
                          key={card.id}
                          className="grid gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-3 text-sm text-slate-300 md:grid-cols-[90px_minmax(0,1fr)_240px]"
                        >
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-black/40 px-2 py-1 font-mono text-xs text-cyan-100">#{card.id}</span>
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-white">{card.name}</div>
                            <div className="text-xs text-slate-400">
                              {card.role || 'No role'} · {card.rarity || 'No rarity'} · {card.effect || 'No effect'}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 md:justify-end">
                            <Badge variant="outline" className="border-cyan-300/50 text-cyan-100">
                              {familyLabel}
                            </Badge>
                            {statLabel(`ATK ${card.atk ?? 0}`)}
                            {statLabel(`DEF ${card.def ?? 0}`)}
                            {statLabel(`SPD ${card.spd ?? 0}`)}
                            {statLabel(`SPC ${card.spc ?? 0}`)}
                            {statLabel(`HP ${card.hp ?? 0}`)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}

            {bridgeCards.length ? (
              <AccordionItem value="bridge" className="rounded-lg border border-white/10 px-4">
                <AccordionTrigger className="text-left text-base hover:no-underline">
                  <span className="flex flex-wrap items-center gap-2">
                    <span>Bridge</span>
                    <Badge variant="outline" className="border-white/20 text-slate-200">
                      {bridgeCards.length} ducks
                    </Badge>
                    <Badge variant="outline" className="border-amber-300/50 text-amber-100">
                      outliers
                    </Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2">
                    {bridgeCards.map((card) => (
                      <div
                        key={card.id}
                        className="grid gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-3 text-sm text-slate-300 md:grid-cols-[90px_minmax(0,1fr)_240px]"
                      >
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-black/40 px-2 py-1 font-mono text-xs text-cyan-100">#{card.id}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-white">{card.name}</div>
                          <div className="text-xs text-slate-400">
                            {card.role || 'No role'} · {card.rarity || 'No rarity'} · {card.effect || 'No effect'}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 md:justify-end">
                          <Badge variant="outline" className="border-amber-300/50 text-amber-100">
                            Bridge
                          </Badge>
                          {statLabel(`ATK ${card.atk ?? 0}`)}
                          {statLabel(`DEF ${card.def ?? 0}`)}
                          {statLabel(`SPD ${card.spd ?? 0}`)}
                          {statLabel(`SPC ${card.spc ?? 0}`)}
                          {statLabel(`HP ${card.hp ?? 0}`)}
                        </div>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ) : null}
          </Accordion>
        </section>

        <section className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-5 text-sm text-slate-200">
          <div className="font-semibold text-white">Stage 2 notes</div>
          <p className="mt-2 text-slate-300">
            The art system expects a one-shot hover GIF per card. For the preview sample, the fallback waits for the GIF runtime to finish and then returns to the static PNG after a short buffer so the last frame lands cleanly.
          </p>
          <p className="mt-2 text-slate-300">
            The current public path for the sample is <span className="font-mono text-amber-100">/quackverse-preview</span>. The card and family data live in{' '}
            <span className="font-mono text-amber-100">src/lib/quackverse-data.ts</span> and the art manager writes uploads to the volume.
          </p>
          <p className="mt-2 text-slate-300">
            Bridge cards stay flexible for now. They are the place to move cards that do not yet have a clean family home.
          </p>
          <p className="mt-2 text-slate-300">
            The art manager is admin-only. In the current allowlist that means <span className="font-mono text-amber-100">mtman1987</span> and the other configured admin usernames.
          </p>
          <p className="mt-2 text-slate-300">
            Uploads persist immediately to the volume, so there is no separate save button in the editor.
          </p>
          <p className="mt-2 text-slate-300">
            Special is a charge pool: the board adds charge on turn start, weighted by SPC and reduced by fatigue. Fatigue now decays when a duck is no longer in formation.
          </p>
          <p className="mt-2 text-slate-300">
            Formations are now generic shapes any deck can use. Every formation grants the baseline +1 HP and +1 Fatigue, with shape-specific bonuses on top: Battle Line adds DEF and extra ATK on longer lines, Flying V adds ATK, Cross heals 3, Cosmic Diamond adds SPC, and Medic Sanctuary buffs connected healer chains.
          </p>
        </section>
      </div>
    </main>
  );
}
