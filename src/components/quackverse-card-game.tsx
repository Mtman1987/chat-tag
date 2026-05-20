'use client';

import { createContext, useCallback, useEffect, useMemo, useRef, useState, useContext } from 'react';
import {
  BadgePlus,
  BookOpen,
  Flag,
  Hand,
  HeartPulse,
  LogOut,
  Move,
  Minus,
  PanelTop,
  RotateCcw,
  Shield,
  Sparkles,
  Swords,
  Undo2,
  UserPlus,
  UserX,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { isAdminUsername } from '@/lib/admin';
import { getAuthHeaders } from '@/lib/client-auth';
import {
  quackverseCards,
  quackverseDucks,
  quackverseEquipment,
  type QuackverseCard,
} from '@/lib/quackverse-data';
import { getQuackverseFamilyGroup } from '@/lib/quackverse-family-map';
import { summarizeCollection } from '@/lib/quackverse-packs';
import {
  quackverseRoomIdFromParams,
  quackverseRoomLabel,
  quackverseScopeFromParams,
  sanitizeQuackverseRoomToken,
} from '@/lib/quackverse-rooms';
import {
  quackverseGridSize,
  quackverseSquadSize,
  type QuackverseBattlePileState,
  type QuackverseCardInstance,
  type QuackverseSavedState,
  type QuackverseTurnActions,
} from '@/lib/quackverse-state';
import { useSession } from '@/contexts/session-context';
import { QuackverseArtManager } from '@/components/quackverse-art-manager';

type PlayerId = 'playerOne' | 'playerTwo';
type ActionMode = 'select' | 'move' | 'attack';
type ActionPanelPosition = 'north' | 'east' | 'south' | 'west';

type Squad = Record<PlayerId, QuackverseCard[]>;
type TestPlayerProfile = {
  id: string;
  twitchUsername: string;
  avatarUrl: string;
  score?: number;
  tags?: number;
  tagged?: number;
};
type QuackverseViewer = {
  userId: string;
  twitchUsername: string;
  avatarUrl: string;
  seat: PlayerId | null;
};
type PackAuditEvent = {
  id: string;
  at: string;
  day: string;
  userId: string;
  twitchUsername?: string;
  packNumberToday: number;
  packsRemaining: number;
  collectionSizeAfter: number;
  uniqueCardsAfter: number;
  cards: Array<{ id: number; name: string; type: string; rarity: string }>;
  rarityCounts: Record<string, number>;
};
type PackAuditSummary = {
  totalPacks: number;
  totalCards: number;
  rarityCounts: Record<string, number>;
  mostPulledCards: Array<{ name: string; count: number }>;
};
type QuackverseArtAsset = {
  fileName: string;
  mimeType: string;
  originalName: string;
  updatedAt: string;
  url: string;
};
type QuackverseArtEntry = {
  static?: QuackverseArtAsset | null;
  hover?: QuackverseArtAsset | null;
};
type QuackverseArtManifest = Record<string, QuackverseArtEntry>;
type GridPiece = {
  instanceId: string;
  owner: PlayerId;
  card: QuackverseCard;
  currentHp: number;
  maxHp: number;
  specialCurrent: number;
  equipmentIds: number[];
  fatigue: number;
  statModifiers: {
    atk: number;
    def: number;
    spd: number;
    spc: number;
  };
};
type GridSlot = GridPiece | null;
type UndoSnapshot = {
  activePlayer: PlayerId;
  turnNumber: number;
  actionMode: ActionMode;
  selectedCardId: number;
  selectedSquadCard: { owner: PlayerId; cardId: number } | null;
  selectedBattleCard: { owner: PlayerId; instanceId: string } | null;
  selectedBoardIndex: number | null;
  squads: Squad;
  grid: GridSlot[];
  battlePiles: Record<PlayerId, QuackverseBattlePileState>;
  score: Record<PlayerId, number>;
  koCount: Record<PlayerId, number>;
  formationVp: Record<PlayerId, number>;
  scoredFormationKeys: string[];
  turnActions: Record<PlayerId, QuackverseTurnActions>;
  winner: PlayerId | null;
  matchLog: string[];
};

const gridSize = quackverseGridSize;
const squadSize = quackverseSquadSize;
const players: Record<PlayerId, { label: string; short: string; accent: string; backRow: number }> = {
  playerOne: {
    label: 'Player 1',
    short: 'P1',
    accent: 'border-cyan-300 bg-cyan-400/10 text-cyan-100',
    backRow: gridSize - 1,
  },
  playerTwo: {
    label: 'Player 2',
    short: 'P2',
    accent: 'border-rose-300 bg-rose-400/10 text-rose-100',
    backRow: 0,
  },
};

const opponentOf = (playerId: PlayerId): PlayerId => (playerId === 'playerOne' ? 'playerTwo' : 'playerOne');
const emptyTurnActions = (): QuackverseTurnActions => ({ deployedOrMoved: false, attacked: [], usedAbility: [], equipped: [] });
const emptyTurnActionState = (): Record<PlayerId, QuackverseTurnActions> => ({
  playerOne: emptyTurnActions(),
  playerTwo: emptyTurnActions(),
});
const pieceKey = (piece: GridPiece) => piece.instanceId;
const makeInstanceId = (owner: PlayerId, card: QuackverseCard) =>
  `${owner}-${card.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const makeCardInstance = (owner: PlayerId, cardId: number): QuackverseCardInstance => ({
  instanceId: `${owner}-${cardId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  cardId,
});
const shuffleCards = (cards: QuackverseCardInstance[]) => {
  const copy = [...cards];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
};
const startPileState = (): QuackverseBattlePileState => ({ drawPile: [], hand: [], discardPile: [] });
const starterBattleDecks: Record<PlayerId, number[]> = {
  playerOne: [1, 4, 24, 32, 52, 81, 84, 85, 86, 88],
  playerTwo: [9, 19, 37, 43, 73, 83, 87, 90, 95, 96],
};
const makePiece = (owner: PlayerId, card: QuackverseCard, instanceId = makeInstanceId(owner, card)): GridPiece => ({
  instanceId,
  owner,
  card,
  currentHp: card.hp ?? 1,
  maxHp: card.hp ?? 1,
  specialCurrent: 0,
  equipmentIds: [],
  fatigue: 0,
  statModifiers: { atk: 0, def: 0, spd: 0, spc: 0 },
});
const squadsLabel = (cards: QuackverseCard[]) => cards.map((card) => card.name).join(', ');
const rowOf = (index: number) => Math.floor(index / gridSize);
const colOf = (index: number) => index % gridSize;
const isAdjacent = (from: number, to: number) => {
  const rowDistance = Math.abs(rowOf(from) - rowOf(to));
  const colDistance = Math.abs(colOf(from) - colOf(to));

  return rowDistance + colDistance === 1;
};

const victoryTarget = 6;
const formationVpLimit = 3;

const numberFromText = (text: string, pattern: RegExp) => {
  const match = text.match(pattern);
  return match ? Number(match[1]) : 0;
};

function getEffectiveStats(piece: GridPiece) {
  const equipment = piece.equipmentIds
    .map((id) => quackverseCards.find((card) => card.id === id))
    .filter(Boolean) as QuackverseCard[];
  const effectText = equipment.map((card) => card.effect || '').join(' ');
  const damageReduction = numberFromText(effectText, /(?:Reduce damage taken by|Reduce all damage by)\s*(\d+)/i);

  return {
    atk: Math.max(1, (piece.card.atk || 0) + piece.statModifiers.atk + numberFromText(effectText, /\+(\d+)\s*ATK/i) - piece.fatigue - damageReduction),
    def: Math.max(0, (piece.card.def || 0) + piece.statModifiers.def + numberFromText(effectText, /\+(\d+)\s*DEF/i) + damageReduction),
    spd: Math.max(1, (piece.card.spd || 0) + piece.statModifiers.spd + numberFromText(effectText, /\+(\d+)\s*SPD/i) - piece.fatigue),
    spc: Math.max(0, (piece.card.spc || 0) + piece.statModifiers.spc + numberFromText(effectText, /\+(\d+)\s*SPC/i)),
  };
}

function getSpecialMax(piece: GridPiece) {
  return Math.max(10, 10 + (piece.card.spc || 0) * 2 + Number(piece.statModifiers.spc || 0) * 2);
}

function getSpecialGain(piece: GridPiece) {
  return Math.max(0, 4 + (piece.card.spc || 0) + Number(piece.statModifiers.spc || 0) - piece.fatigue);
}

function getGearHealPerTurn(piece: GridPiece) {
  return piece.equipmentIds
    .map((id) => quackverseCards.find((card) => card.id === id)?.effect || '')
    .reduce((sum, effectText) => sum + numberFromText(effectText, /Heal\s+(\d+)\s+HP\s+per\s+turn/i), 0);
}

function getMovementBudget(spd: number) {
  if (spd >= 11) return 5;
  if (spd >= 8) return 4;
  if (spd >= 5) return 3;
  return 2;
}

function movementStepCost(owner: PlayerId, from: number, to: number) {
  const rowDelta = rowOf(to) - rowOf(from);
  const colDelta = colOf(to) - colOf(from);
  if (Math.abs(rowDelta) + Math.abs(colDelta) !== 1) return Infinity;
  if (colDelta !== 0) return 2;
  const forwardDelta = owner === 'playerOne' ? -1 : 1;
  return rowDelta === forwardDelta ? 1 : 3;
}

function isRole(card: QuackverseCard, token: string) {
  const haystack = `${card.name} ${card.role || ''}`.toLowerCase();
  return haystack.includes(token.toLowerCase());
}

const familyStyles: Record<string, { label: string; className: string }> = {
  ranger: { label: 'R', className: 'border-cyan-200/70 bg-cyan-300/20 text-cyan-50' },
  eclipse: { label: 'E', className: 'border-fuchsia-200/70 bg-fuchsia-300/20 text-fuchsia-50' },
  void: { label: 'V', className: 'border-violet-200/70 bg-violet-300/20 text-violet-50' },
  cosmic: { label: 'C', className: 'border-sky-200/70 bg-sky-300/20 text-sky-50' },
  shadow: { label: 'S', className: 'border-slate-200/70 bg-slate-300/20 text-slate-50' },
  fire: { label: 'F', className: 'border-red-200/70 bg-red-300/20 text-red-50' },
  ice: { label: 'I', className: 'border-blue-200/70 bg-blue-300/20 text-blue-50' },
  electric: { label: 'Z', className: 'border-yellow-200/70 bg-yellow-300/20 text-yellow-50' },
  support: { label: '+', className: 'border-emerald-200/70 bg-emerald-300/20 text-emerald-50' },
  gear: { label: 'G', className: 'border-amber-200/70 bg-amber-300/20 text-amber-50' },
};

function getCardFamily(card: QuackverseCard) {
  if (card.type === 'Equipment') return 'gear';
  const haystack = `${card.name} ${card.role || ''}`.toLowerCase();
  return ['eclipse', 'void', 'cosmic', 'shadow', 'ranger', 'fire', 'ice', 'electric', 'support'].find((family) => haystack.includes(family)) || 'ranger';
}

function FamilyAvatar({ card, className }: { card: QuackverseCard; className?: string }) {
  const family = getCardFamily(card);
  const style = familyStyles[family] || familyStyles.ranger;
  return (
    <span
      title={`${family[0].toUpperCase()}${family.slice(1)} family`}
      className={cn('inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[0.68rem] font-bold', style.className, className)}
    >
      {style.label}
    </span>
  );
}

const quickStartSquads: Record<PlayerId, { name: string; cardIds: number[] }[]> = {
  playerOne: [
    { name: 'Ranger Strike', cardIds: [1, 4, 24, 32, 52] },
    { name: 'Cosmic Control', cardIds: [20, 23, 39, 49, 57] },
  ],
  playerTwo: [
    { name: 'Eclipse Ambush', cardIds: [9, 19, 37, 43, 73] },
    { name: 'Meteor Guard', cardIds: [26, 35, 40, 61, 71] },
  ],
};

const demoSteps = [
  {
    title: '1. Pick squads',
    body: 'Each player chooses 5 ducks. A simple first match is Ranger Strike versus Eclipse Ambush.',
  },
  {
    title: '2. Enter from back rows',
    body: 'Player 1 starts from the bottom row. Player 2 starts from the top row. Place one duck at a time.',
  },
  {
    title: '3. Take one action',
    body: 'On a turn, a duck attacks, uses one ability, moves one orthogonal square, or passes.',
  },
  {
    title: '4. Resolve combat',
    body: 'Damage is ATK minus DEF, minimum 1. Higher SPD acts first when timing matters.',
  },
  {
    title: '5. Win the round',
    body: 'Knock out 3 of the opponent’s 5 ducks. Track session points with the counters below the board.',
  },
];

const rarityClasses: Record<string, string> = {
  Common: 'border-slate-400/60 text-slate-200',
  Uncommon: 'border-emerald-400/70 text-emerald-200',
  Rare: 'border-sky-400/70 text-sky-200',
  Epic: 'border-fuchsia-400/70 text-fuchsia-200',
  Legendary: 'border-amber-300/80 text-amber-100',
};

const primaryStats = [
  ['ATK', Swords],
  ['DEF', Shield],
  ['SPD', Zap],
  ['SPC', Sparkles],
  ['HP', HeartPulse],
] as const;

function statValue(card: QuackverseCard, stat: (typeof primaryStats)[number][0]) {
  return card[stat.toLowerCase() as 'atk' | 'def' | 'spd' | 'spc' | 'hp'];
}

function comparableSavedState(state: QuackverseSavedState) {
  return JSON.stringify({ ...state, updatedAt: '' });
}

const QuackverseArtContext = createContext<QuackverseArtManifest>({});
const QuackverseDeckRecordContext = createContext<{ wins: number; losses: number }>({ wins: 0, losses: 0 });

function sanitizeRoomId(value: string) {
  return sanitizeQuackverseRoomToken(value, 'default');
}

function CardFace({
  card,
  compact = false,
  selected = false,
  record,
  attachedGear = [],
  onClick,
}: {
  card: QuackverseCard;
  compact?: boolean;
  selected?: boolean;
  record?: { wins: number; losses: number };
  attachedGear?: QuackverseCard[];
  onClick?: () => void;
}) {
  const artManifest = useContext(QuackverseArtContext);
  const deckRecord = useContext(QuackverseDeckRecordContext);
  const [isHovered, setIsHovered] = useState(false);
  const rarityClass = rarityClasses[card.rarity || ''] || 'border-slate-500 text-slate-200';
  const familyGroup = getQuackverseFamilyGroup(card.id);
  const artEntry = artManifest[String(card.id)];
  const staticUrl = artEntry?.static?.url || card.artUrl || '';
  const hoverUrl = artEntry?.hover?.url || card.artHoverUrl || staticUrl;
  const cardArtUrl = isHovered ? hoverUrl : staticUrl;
  const description = card.flavor || card.role || card.effect || 'No description available.';
  const currentRecord = record || deckRecord;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
      className={cn(
        'group flex h-full w-full flex-col rounded-lg border bg-slate-950/70 p-3 text-left shadow-sm transition',
        'hover:-translate-y-0.5 hover:border-cyan-300/80 hover:bg-slate-900',
        selected ? 'border-cyan-300 ring-2 ring-cyan-300/40' : 'border-white/10',
      )}
    >
      <div className={cn('flex items-start justify-between gap-2', selected && 'flex-wrap')}>
        <div className="min-w-0">
          <div className="text-[0.68rem] font-semibold uppercase tracking-normal text-slate-400">
            #{card.id} {card.type}
          </div>
          <div className={cn('font-headline text-sm leading-tight text-white', !compact && 'sm:text-base')}>
            {card.name}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <FamilyAvatar card={card} />
          <Badge variant="outline" className={cn('rounded-md px-1.5 py-0 text-[0.63rem]', rarityClass)}>
            {card.rarity || 'Gear'}
          </Badge>
        </div>
      </div>

      {selected ? (
        <div className="mt-2 space-y-2 text-xs text-slate-300">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-white/20 text-slate-200">
              {familyGroup?.label || 'Unsorted'}
            </Badge>
            <Badge variant="outline" className="border-cyan-300/50 text-cyan-100">
              {card.role || card.type}
            </Badge>
            <Badge variant="outline" className="border-amber-300/50 text-amber-100">
              Card #{card.id}
            </Badge>
          </div>
          <div className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[0.72rem] text-slate-200">
            {description}
          </div>
        </div>
      ) : (
        <div className="mt-2 text-xs text-slate-300">{card.role || card.effect}</div>
      )}

      <div className={cn('mt-3 flex items-center justify-center rounded-md border border-white/10 bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-950 text-center', selected ? 'aspect-[4/3]' : 'aspect-[5/3]')}>
        {cardArtUrl ? (
          <img src={cardArtUrl} alt="" className="h-full w-full rounded-md object-cover" />
        ) : (
          <div className="px-2">
            <Sparkles className="mx-auto mb-1 h-5 w-5 text-cyan-200/70" />
            <div className="text-[0.62rem] uppercase text-slate-400">Art slot</div>
          </div>
        )}
      </div>

      {card.type === 'Duck' ? (
        <div className={cn('mt-3 grid grid-cols-5 gap-1', compact && 'hidden sm:grid')}>
          {primaryStats.map(([label, Icon]) => (
            <div key={label} className="rounded-md border border-white/10 bg-white/[0.04] px-1 py-1 text-center">
              <Icon className="mx-auto mb-0.5 h-3 w-3 text-cyan-200" />
              <div className="text-[0.6rem] text-slate-400">{label}</div>
              <div className="text-xs font-semibold text-white">{statValue(card, label)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-white/10 bg-white/[0.04] p-2 text-xs text-slate-200">
          {card.effect}
        </div>
      )}

      {selected && (
        <div className="mt-3 grid gap-2 text-[0.68rem] text-slate-300 sm:grid-cols-2">
          <div className="rounded-md border border-white/10 bg-white/[0.04] p-2">
            <div className="mb-1 font-semibold text-white">Card details</div>
            <div>Type: {card.type}</div>
            <div>Rarity: {card.rarity || 'Gear'}</div>
            <div>Role: {card.role || 'None'}</div>
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.04] p-2">
            <div className="mb-1 font-semibold text-white">Record</div>
            <div>Current deck record: {Number(currentRecord?.wins || 0)} W / {Number(currentRecord?.losses || 0)} L.</div>
            <div>All cards in the active deck inherit this result line.</div>
          </div>
          {attachedGear.length > 0 && (
            <div className="rounded-md border border-white/10 bg-white/[0.04] p-2 sm:col-span-2">
              <div className="mb-1 font-semibold text-white">Attached gear</div>
              <div className="flex flex-wrap gap-1.5">
                {attachedGear.map((gear) => (
                  <span key={gear.id} className="rounded-md border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-[0.62rem] text-amber-100">
                    {gear.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!compact && (
        <div className="mt-3 space-y-1 text-xs text-slate-300">
          {(card.abilities.length ? card.abilities : [card.effect]).filter(Boolean).map((ability) => (
            <div key={ability} className="rounded-md bg-black/20 px-2 py-1">
              {ability}
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

function SquadSlot({
  card,
  owner,
  index,
  selected,
  onSelect,
  onRemove,
}: {
  card?: QuackverseCard;
  owner: PlayerId;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  if (!card) {
    return (
      <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.03] text-xs text-slate-500">
        Slot {index + 1}
      </div>
    );
  }
  return (
    <div className="relative min-h-24">
      <CardFace card={card} compact selected={selected} onClick={onSelect} />
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="absolute right-1 top-1 h-7 w-7 bg-black/60"
        onClick={onRemove}
        aria-label={`Remove ${card.name}`}
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <div className={cn('absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-[0.63rem]', players[owner].accent)}>
        {players[owner].short}
      </div>
    </div>
  );
}

function savedPieceToGridPiece(piece: QuackverseSavedState['grid'][number]): GridSlot {
  if (!piece) return null;
  const card = quackverseCards.find((item) => item.id === piece.cardId);
  if (!card) return null;

  return {
    instanceId: piece.instanceId || `${piece.owner}-${piece.cardId}-saved`,
    owner: piece.owner,
    card,
    currentHp: piece.currentHp,
    maxHp: piece.maxHp,
    specialCurrent: Number(piece.specialCurrent || 0),
    equipmentIds: piece.equipmentIds || [],
    fatigue: Number(piece.fatigue ?? (piece.fatigued ? 1 : 0)),
    statModifiers: {
      atk: Number(piece.statModifiers?.atk || 0),
      def: Number(piece.statModifiers?.def || 0),
      spd: Number(piece.statModifiers?.spd || 0),
      spc: Number(piece.statModifiers?.spc || 0),
    },
  };
}

type DetectedFormation = {
  owner: PlayerId;
  name: string;
  key: string;
  indices: number[];
};

const formationPriority: Record<string, number> = {
  'Ranger Wall': 5,
  'Eclipse Cross': 5,
  'Cosmic Diamond': 5,
  'Flying V': 4,
  'Medic Sanctuary': 4,
  'Battle Line': 1,
};

function detectFormations(grid: GridSlot[]): DetectedFormation[] {
  const formations: DetectedFormation[] = [];
  const addFormation = (owner: PlayerId, name: string, indices: number[]) => {
    const unique = [...new Set(indices)].sort((a, b) => a - b);
    if (unique.every((index) => rowOf(index) === players[owner].backRow)) return;
    formations.push({ owner, name, indices: unique, key: `${owner}:${name}:${unique.join('-')}` });
  };
  const owned = (index: number, owner: PlayerId) => grid[index]?.owner === owner;
  const roleAt = (index: number, token: string) => {
    const card = grid[index]?.card;
    if (!card) return false;
    if (token === 'eclipse') return isRole(card, 'eclipse') || isRole(card, 'shadow') || isRole(card, 'void');
    if (token === 'support') return isRole(card, 'support') || isRole(card, 'medic') || isRole(card, 'heal');
    return isRole(card, token);
  };

  (['playerOne', 'playerTwo'] as PlayerId[]).forEach((owner) => {
    for (let row = 0; row < gridSize; row += 1) {
      let col = 0;
      while (col < gridSize) {
        const run: number[] = [];
        while (col < gridSize && owned(row * gridSize + col, owner)) {
          run.push(row * gridSize + col);
          col += 1;
        }
        if (run.length >= 3) {
          addFormation(owner, 'Battle Line', run);
          if (run.every((index) => roleAt(index, 'ranger'))) addFormation(owner, 'Ranger Wall', run);
        }
        col += 1;
      }
    }

    for (let col = 0; col < gridSize; col += 1) {
      let row = 0;
      while (row < gridSize) {
        const run: number[] = [];
        while (row < gridSize && owned(row * gridSize + col, owner)) {
          run.push(row * gridSize + col);
          row += 1;
        }
        if (run.length >= 3) {
          addFormation(owner, 'Battle Line', run);
          if (run.every((index) => roleAt(index, 'ranger'))) addFormation(owner, 'Ranger Wall', run);
        }
        row += 1;
      }
    }

    for (let row = 1; row < gridSize - 1; row += 1) {
      for (let col = 1; col < gridSize - 1; col += 1) {
        const center = row * gridSize + col;
        const cross = [center, center - gridSize, center + gridSize, center - 1, center + 1];
        if (cross.every((index) => owned(index, owner) && roleAt(index, 'eclipse'))) addFormation(owner, 'Eclipse Cross', cross);

        const diamond = [center - gridSize - 1, center - gridSize + 1, center + gridSize - 1, center + gridSize + 1];
        if (diamond.every((index) => owned(index, owner) && roleAt(index, 'cosmic'))) addFormation(owner, 'Cosmic Diamond', diamond);
      }
    }

    const forward = owner === 'playerOne' ? -1 : 1;
    for (let row = 0; row < gridSize; row += 1) {
      for (let col = 1; col < gridSize - 1; col += 1) {
        const point = row * gridSize + col;
        const wingRow = row - forward;
        const farWingRow = row - forward * 2;
        if (wingRow < 0 || wingRow >= gridSize) continue;
        const flyingV = [point, wingRow * gridSize + col - 1, wingRow * gridSize + col + 1];
        const largeFlyingV =
          farWingRow >= 0 && farWingRow < gridSize && col >= 2 && col <= gridSize - 3
            ? [...flyingV, farWingRow * gridSize + col - 2, farWingRow * gridSize + col + 2]
            : [];
        if (largeFlyingV.length && largeFlyingV.every((index) => owned(index, owner))) {
          addFormation(owner, 'Flying V', largeFlyingV);
        } else if (flyingV.every((index) => owned(index, owner))) {
          addFormation(owner, 'Flying V', flyingV);
        }
      }
    }

    grid.forEach((piece, index) => {
      if (!piece || piece.owner !== owner || !roleAt(index, 'support')) return;
      const adjacent = [index - gridSize, index + gridSize, index - 1, index + 1].filter(
        (adjacentIndex) => adjacentIndex >= 0 && adjacentIndex < grid.length && isAdjacent(index, adjacentIndex) && owned(adjacentIndex, owner),
      );
      if (adjacent.length >= 2) addFormation(owner, 'Medic Sanctuary', [index, ...adjacent.slice(0, 2)]);
    });
  });

  return formations;
}

export function QuackverseCardGame({ layout = 'full' }: { layout?: 'full' | 'command' } = {}) {
  const isCommandLayout = layout === 'command';
  const { user } = useSession();
  const isAdmin = isAdminUsername(user?.twitchUsername);
  const [artManifest, setArtManifest] = useState<QuackverseArtManifest>({});
  const hasLoadedSharedState = useRef(false);
  const hasLoadedCollectionLab = useRef(false);
  const isApplyingSharedState = useRef(false);
  const lastSharedStateRef = useRef('');
  const lastSharedUpdatedAtRef = useRef('');
  const hasPendingSharedWriteRef = useRef(false);
  const hasRequestedSharedSaveRef = useRef(false);
  const requestedSharedSaveAtRef = useRef(0);
  const forceNextSharedWriteRef = useRef(false);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const actionRequestPendingRef = useRef(false);
  const npcPlayersRef = useRef<Record<PlayerId, boolean>>({ playerOne: false, playerTwo: true });
  const undoStackRef = useRef<UndoSnapshot[]>([]);
  const [activePlayer, setActivePlayer] = useState<PlayerId>('playerOne');
  const [turnNumber, setTurnNumber] = useState(1);
  const [actionMode, setActionMode] = useState<ActionMode>('select');
  const [libraryMode, setLibraryMode] = useState<'ducks' | 'equipment' | 'all'>('ducks');
  const [rarity, setRarity] = useState('All');
  const [cardSearch, setCardSearch] = useState('');
  const [selectedCardId, setSelectedCardId] = useState<number>(quackverseDucks[0]?.id ?? 1);
  const [selectedSquadCard, setSelectedSquadCard] = useState<{ owner: PlayerId; cardId: number } | null>(null);
  const [selectedBattleCard, setSelectedBattleCard] = useState<{ owner: PlayerId; instanceId: string } | null>(null);
  const [selectedBoardIndex, setSelectedBoardIndex] = useState<number | null>(null);
  const [squads, setSquads] = useState<Squad>({ playerOne: [], playerTwo: [] });
  const [grid, setGrid] = useState<GridSlot[]>(Array.from({ length: gridSize * gridSize }, () => null));
  const [battlePiles, setBattlePiles] = useState<Record<PlayerId, QuackverseBattlePileState>>({
    playerOne: startPileState(),
    playerTwo: startPileState(),
  });
  const [score, setScore] = useState<Record<PlayerId, number>>({ playerOne: 0, playerTwo: 0 });
  const [koCount, setKoCount] = useState<Record<PlayerId, number>>({ playerOne: 0, playerTwo: 0 });
  const [formationVp, setFormationVp] = useState<Record<PlayerId, number>>({ playerOne: 0, playerTwo: 0 });
  const [scoredFormationKeys, setScoredFormationKeys] = useState<string[]>([]);
  const [turnActions, setTurnActions] = useState<Record<PlayerId, QuackverseTurnActions>>(emptyTurnActionState);
  const [winner, setWinner] = useState<PlayerId | null>(null);
  const [matchLog, setMatchLog] = useState<string[]>(['Load quick-start squads or build two squads, then place ducks on the board.']);
  const [npcPlayers, setNpcPlayers] = useState<Record<PlayerId, boolean>>({ playerOne: false, playerTwo: true });
  const [pendingPacks, setPendingPacks] = useState(3);
  const [dailyPackLimit, setDailyPackLimit] = useState(3);
  const [isOpeningPack, setIsOpeningPack] = useState(false);
  const [packError, setPackError] = useState('');
  const [collection, setCollection] = useState<number[]>([]);
  const [lastPack, setLastPack] = useState<QuackverseCard[]>([]);
  const [deck, setDeck] = useState<number[]>([]);
  const [deckWins, setDeckWins] = useState(0);
  const [deckLosses, setDeckLosses] = useState(0);
  const [packAuditEvents, setPackAuditEvents] = useState<PackAuditEvent[]>([]);
  const [packAuditSummary, setPackAuditSummary] = useState<PackAuditSummary | null>(null);
  const [canViewPackAudit, setCanViewPackAudit] = useState(false);
  const [demoStep, setDemoStep] = useState(0);
  const [testPlayers, setTestPlayers] = useState<TestPlayerProfile[]>([]);
  const [claimedPlayers, setClaimedPlayers] = useState<Record<PlayerId, string>>({ playerOne: '', playerTwo: '' });
  const [undoVersion, setUndoVersion] = useState(0);
  const [actionPanelPosition, setActionPanelPosition] = useState<ActionPanelPosition>('east');
  const [saveRequestVersion, setSaveRequestVersion] = useState(0);
  const [isActionPending, setIsActionPending] = useState(false);
  const [actionError, setActionError] = useState('');
  const [inspectedCardId, setInspectedCardId] = useState<number | null>(null);
  const [viewer, setViewer] = useState<QuackverseViewer | null>(null);
  const [roomScope, setRoomScope] = useState('');
  const [roomId, setRoomId] = useState('default');
  const [roomInput, setRoomInput] = useState('default');
  const deckRecord = useMemo(() => ({ wins: deckWins, losses: deckLosses }), [deckLosses, deckWins]);

  const refreshArtManifest = useCallback(async () => {
    const response = await fetch('/api/quackverse/art', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to load Quackverse art (${response.status})`);
    }
    const data = (await response.json()) as { cards?: QuackverseArtManifest };
    setArtManifest(data.cards || {});
  }, []);

  const refreshCollection = useCallback(async () => {
    const response = await fetch('/api/quackverse/pack', {
      cache: 'no-store',
      headers: getAuthHeaders(),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) return;
    setPendingPacks(Number(data.packsRemaining || 0));
    setDailyPackLimit(Number(data.dailyLimit || 3));
    setCollection(Array.isArray(data.cards) ? data.cards : []);
    setDeck(Array.isArray(data.deck) ? data.deck : []);
    setDeckWins(Number(data.deckWins || 0));
    setDeckLosses(Number(data.deckLosses || 0));
    setLastPack(
      Array.isArray(data.lastPack)
        ? data.lastPack.map((cardId: number) => quackverseCards.find((card) => card.id === cardId)).filter(Boolean)
        : [],
    );
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextScope = quackverseScopeFromParams(params);
    const nextRoomId = quackverseRoomIdFromParams(params);
    setRoomScope(nextScope);
    setRoomId(nextRoomId);
    setRoomInput(nextRoomId);
  }, []);

  useEffect(() => {
    refreshArtManifest().catch((error) => console.error('[QuackverseCardGame] art refresh failed:', error));
  }, [refreshArtManifest]);

  const roomQuery = useMemo(() => {
    const params = new URLSearchParams({ roomId });
    if (roomScope) params.set('tenant', roomScope);
    return params.toString();
  }, [roomId, roomScope]);
  const displayRoom = quackverseRoomLabel(roomScope, roomId);
  const quackverseUrl = useCallback((path: string) => `${path}?${roomQuery}`, [roomQuery]);
  const switchRoom = () => {
    const nextRoomId = sanitizeRoomId(roomInput);
    setRoomId(nextRoomId);
    setRoomInput(nextRoomId);
    hasLoadedSharedState.current = false;
    lastSharedStateRef.current = '';
    lastSharedUpdatedAtRef.current = '';
    const params = new URLSearchParams({ roomId: nextRoomId });
    if (roomScope) params.set('tenant', roomScope);
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  };


  const cards = useMemo(() => {
    const source =
      libraryMode === 'ducks' ? quackverseDucks : libraryMode === 'equipment' ? quackverseEquipment : quackverseCards;
    const normalizedSearch = cardSearch.trim().toLowerCase();
    return source.filter((card) => {
      if (rarity !== 'All' && card.rarity !== rarity) return false;
      if (!normalizedSearch) return true;
      const haystack = [
        card.id,
        card.name,
        card.type,
        card.role,
        card.rarity,
        card.effect,
        card.flavor,
        ...card.abilities,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [cardSearch, libraryMode, rarity]);

  const selectedCard = quackverseCards.find((card) => card.id === selectedCardId) || quackverseCards[0];
  const inspectedCard = inspectedCardId ? quackverseCards.find((card) => card.id === inspectedCardId) || null : null;
  const mySeat = viewer?.seat || null;
  const canControlActivePlayer = !!mySeat && mySeat === activePlayer && !winner;
  const selectedPiece = selectedBoardIndex === null ? null : grid[selectedBoardIndex];
  const selectedGridCard = !!selectedBattleCard || selectedPiece !== null;
  const canActWithSelected = !!selectedPiece && selectedPiece.owner === activePlayer && canControlActivePlayer;
  const activeTurnActions = turnActions[activePlayer];
  const selectedPieceKey = selectedPiece ? pieceKey(selectedPiece) : '';
  const selectedPieceCanAttack = canActWithSelected && !activeTurnActions.attacked.includes(selectedPieceKey);
  const selectedPieceCanUseAbility = canActWithSelected && !activeTurnActions.usedAbility.includes(selectedPieceKey);
  const selectedPieceCanEquip = canActWithSelected && !activeTurnActions.equipped.includes(selectedPieceKey);
  const canUndo = undoVersion >= 0 && undoStackRef.current.length > 0;
  const selectedBattleCardData = selectedBattleCard
    ? battlePiles[selectedBattleCard.owner].hand.find((entry) => entry.instanceId === selectedBattleCard.instanceId) || null
    : null;
  const selectedBattleCardDetails = selectedBattleCardData
    ? quackverseCards.find((card) => card.id === selectedBattleCardData.cardId) || null
    : null;
  useEffect(() => {
    if (!selectedBattleCard) return;
    if (selectedBattleCardData) return;
    setSelectedBattleCard(null);
  }, [selectedBattleCard, selectedBattleCardData]);
  const battleHandCards = useMemo(
    () =>
      (Object.keys(battlePiles) as PlayerId[]).reduce(
        (acc, playerId) => {
          const handCards = battlePiles[playerId].hand
            .map((instance) => {
              const card = quackverseCards.find((item) => item.id === instance.cardId);
              return card ? { instance, card } : undefined;
            })
            .filter(Boolean) as { instance: QuackverseCardInstance; card: QuackverseCard }[];
          acc[playerId] = handCards;
          return acc;
        },
        {} as Record<PlayerId, { instance: QuackverseCardInstance; card: QuackverseCard }[]>,
      ),
    [battlePiles],
  );
  const activeHandCards = battleHandCards[activePlayer];
  const reachableMoveTargets = useMemo(() => {
    if (!selectedPiece || selectedBoardIndex === null || selectedPiece.owner !== activePlayer || winner) return new Set<number>();
    const budget = getMovementBudget(getEffectiveStats(selectedPiece).spd);
    const costs = new Map<number, number>([[selectedBoardIndex, 0]]);
    const queue = [selectedBoardIndex];

    while (queue.length) {
      const current = queue.shift() as number;
      const currentCost = costs.get(current) || 0;
      const candidates = [current - gridSize, current + gridSize, current - 1, current + 1].filter(
        (index) => index >= 0 && index < grid.length && isAdjacent(current, index),
      );

      for (const candidate of candidates) {
        if (grid[candidate]) continue;
        const nextCost = currentCost + movementStepCost(selectedPiece.owner, current, candidate);
        if (nextCost > budget) continue;
        if ((costs.get(candidate) ?? Infinity) <= nextCost) continue;
        costs.set(candidate, nextCost);
        queue.push(candidate);
      }
    }

    costs.delete(selectedBoardIndex);
    return new Set(costs.keys());
  }, [activePlayer, grid, selectedBoardIndex, selectedPiece, winner]);
  const collectionSummary = useMemo(() => summarizeCollection(collection), [collection]);
  const deckCards = useMemo(
    () => deck.map((cardId) => quackverseCards.find((card) => card.id === cardId)).filter(Boolean) as QuackverseCard[],
    [deck],
  );
  const currentDeckReady = deckCards.length > 0;
  const deckDuckCount = deckCards.filter((card) => card.type === 'Duck').length;
  const deckEquipmentCount = deckCards.filter((card) => card.type === 'Equipment').length;
  const isDeckPlayable = deck.length === 20 && deckDuckCount >= 10 && deckEquipmentCount <= 8;
  const displayPlayers = useMemo(
    () =>
      (Object.keys(players) as PlayerId[]).reduce(
        (acc, playerId) => {
          const profile =
            testPlayers.find((player) => player.id === claimedPlayers[playerId]) ||
            (viewer?.seat === playerId
              ? { id: viewer.userId, twitchUsername: viewer.twitchUsername, avatarUrl: viewer.avatarUrl }
              : undefined);
          acc[playerId] = {
            ...players[playerId],
            label: profile?.twitchUsername || players[playerId].label,
            avatarUrl: profile?.avatarUrl || '',
            profile,
          };
          return acc;
        },
        {} as Record<PlayerId, (typeof players)[PlayerId] & { avatarUrl: string; profile?: TestPlayerProfile }>,
      ),
    [claimedPlayers, testPlayers, viewer],
  );
  useEffect(() => {
    npcPlayersRef.current = npcPlayers;
  }, [npcPlayers]);

  const applySharedState = useCallback((shared: QuackverseSavedState) => {
    const comparable = comparableSavedState(shared);
    if (comparable === lastSharedStateRef.current) return;

    lastSharedStateRef.current = comparable;
    lastSharedUpdatedAtRef.current = shared.updatedAt || '';
    isApplyingSharedState.current = true;
    setActivePlayer(shared.activePlayer);
    setTurnNumber(shared.turnNumber);
    setSquads({ playerOne: [], playerTwo: [] });
    setSelectedSquadCard(null);
    setGrid(shared.grid.map(savedPieceToGridPiece));
    setBattlePiles(shared.battlePiles);
    setScore(shared.score);
    setKoCount(shared.koCount);
    setClaimedPlayers(shared.claimedPlayers);
    setNpcPlayers(shared.npcPlayers);
    setFormationVp(shared.formationVp);
    setScoredFormationKeys(shared.scoredFormationKeys);
    setTurnActions(shared.turnActions);
    setWinner(shared.winner);
    setMatchLog(shared.matchLog);
    undoStackRef.current = [];
    setUndoVersion((current) => current + 1);
    window.setTimeout(() => {
      isApplyingSharedState.current = false;
    }, 0);
  }, []);
  const savedState = useMemo<QuackverseSavedState>(
    () => ({
      gridSize,
      squadSize,
      activePlayer,
      turnNumber,
      squads: { playerOne: [], playerTwo: [] },
      claimedPlayers,
      battlePiles,
      grid: grid.map((piece) =>
        piece
          ? {
              instanceId: piece.instanceId,
              owner: piece.owner,
              cardId: piece.card.id,
              currentHp: piece.currentHp,
              maxHp: piece.maxHp,
              specialCurrent: piece.specialCurrent,
              equipmentIds: piece.equipmentIds,
              fatigue: piece.fatigue,
              statModifiers: piece.statModifiers,
            }
          : null,
      ),
      score,
      koCount,
      formationVp,
      scoredFormationKeys,
      turnActions,
      npcPlayers,
      winner,
      matchResultRecordedForWinner: winner,
      matchLog,
      collections: {},
      updatedAt: new Date().toISOString(),
    }),
    [activePlayer, battlePiles, claimedPlayers, formationVp, grid, koCount, matchLog, npcPlayers, score, scoredFormationKeys, turnActions, turnNumber, winner],
  );
  useEffect(() => {
    let cancelled = false;

    async function loadSharedState() {
      try {
        const response = await fetch(quackverseUrl('/api/quackverse/state'), {
          cache: 'no-store',
          headers: getAuthHeaders(),
        });
        if (!response.ok) return;
        const data = await response.json();
        const shared = data.state as QuackverseSavedState;
        if (data.viewer !== undefined) setViewer(data.viewer || null);
        if (cancelled || !shared) return;
        if (hasPendingSharedWriteRef.current) return;
        applySharedState(shared);
      } catch (error) {
        console.warn('[Quackverse] Failed to load shared state', error);
      } finally {
        if (!cancelled) hasLoadedSharedState.current = true;
      }
    }

    loadSharedState();
    const events = new EventSource(quackverseUrl('/api/quackverse/events'));

    events.addEventListener('state', (event) => {
      if (cancelled || hasPendingSharedWriteRef.current) return;
      try {
        applySharedState(JSON.parse((event as MessageEvent).data) as QuackverseSavedState);
      } catch (error) {
        console.warn('[Quackverse] Failed to apply pushed state', error);
      }
    });

    events.onerror = () => {
      console.warn('[Quackverse] State event stream disconnected. It will reconnect automatically.');
    };

    return () => {
      cancelled = true;
      events.close();
    };
  }, [applySharedState, quackverseUrl]);

  const requestSharedSave = () => {
    hasRequestedSharedSaveRef.current = true;
    requestedSharedSaveAtRef.current = Date.now();
    hasPendingSharedWriteRef.current = true;
    setSaveRequestVersion((current) => current + 1);
  };

  useEffect(() => {
    if (!hasRequestedSharedSaveRef.current) return;
    if (!hasLoadedSharedState.current) return;
    if (isApplyingSharedState.current) return;

    const comparable = comparableSavedState(savedState);
    if (comparable === lastSharedStateRef.current) {
      if (Date.now() - requestedSharedSaveAtRef.current > 1000) {
        hasRequestedSharedSaveRef.current = false;
        hasPendingSharedWriteRef.current = false;
      }
      return;
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      hasRequestedSharedSaveRef.current = false;

      fetch(quackverseUrl('/api/quackverse/state'), {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ state: savedState, baseUpdatedAt: lastSharedUpdatedAtRef.current, force: forceNextSharedWriteRef.current }),
      })
        .then(async (response) => {
          const data = await response.json().catch(() => null);
          if (data?.state && response.ok) {
            applySharedState(data.state as QuackverseSavedState);
          } else {
            lastSharedStateRef.current = comparable;
          }
        })
        .catch((error) => console.warn('[Quackverse] Failed to save shared state', error))
        .finally(() => {
          forceNextSharedWriteRef.current = false;
          hasPendingSharedWriteRef.current = false;
        });
    }, 75);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [applySharedState, quackverseUrl, savedState, saveRequestVersion]);

  const sendQuackverseAction = async (action: Record<string, unknown>) => {
    if (actionRequestPendingRef.current) return;
    actionRequestPendingRef.current = true;
    hasPendingSharedWriteRef.current = true;
    setIsActionPending(true);
    try {
      const response = await fetch(quackverseUrl('/api/quackverse/action'), {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(action),
      });
      const data = await response.json().catch(() => null);
      if (data?.viewer !== undefined) setViewer(data.viewer || null);
      if (data?.state) {
        applySharedState(data.state as QuackverseSavedState);
      }
      if (!response.ok || data?.error) {
        setActionError(String(data?.error || `Action failed (${response.status})`));
      } else {
        setActionError('');
        void refreshCollection();
      }
    } catch (error) {
      setActionError('Action failed. Try again.');
      console.warn('[Quackverse] Failed to apply action', error);
    } finally {
      actionRequestPendingRef.current = false;
      setIsActionPending(false);
      hasPendingSharedWriteRef.current = false;
    }
  };

  useEffect(() => {
    refreshCollection()
      .catch((error) => {
        console.warn('[Quackverse] Failed to load collection', error);
      })
      .finally(() => {
        hasLoadedCollectionLab.current = true;
      });
  }, [refreshCollection]);

  useEffect(() => {
    let cancelled = false;

    async function loadPackAudit() {
      try {
        const response = await fetch('/api/quackverse/pack?audit=1', {
          cache: 'no-store',
          headers: getAuthHeaders(),
        });
        const data = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok || !data) {
          setCanViewPackAudit(false);
          return;
        }
        setCanViewPackAudit(true);
        setPackAuditEvents(Array.isArray(data.events) ? data.events : []);
        setPackAuditSummary(data.summary || null);
      } catch {
        if (!cancelled) setCanViewPackAudit(false);
      }
    }

    loadPackAudit();
    return () => {
      cancelled = true;
    };
  }, [collection.length, pendingPacks]);

  useEffect(() => {
    let cancelled = false;

    async function loadTestPlayers() {
      try {
        const response = await fetch('/api/quackverse/test-players', { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) setTestPlayers(Array.isArray(data.players) ? data.players : []);
      } catch (error) {
        console.warn('[Quackverse] Failed to load test players', error);
      }
    }

    loadTestPlayers();
  }, []);

  const addToSquad = (card: QuackverseCard, owner = activePlayer) => {
    if (card.type !== 'Duck') return;
    requestSharedSave();
    setSquads((current) => {
      if (current[owner].some((squadCard) => squadCard.id === card.id) || current[owner].length >= squadSize) return current;
      return { ...current, [owner]: [...current[owner], card] };
    });
    setSelectedSquadCard({ owner, cardId: card.id });
  };

  const addLog = (entry: string) => {
    setMatchLog((current) => [`Turn ${turnNumber}: ${entry}`, ...current].slice(0, 12));
  };

  const updateClaimedPlayer = (playerId: PlayerId, playerProfileId: string) => {
    setClaimedPlayers((current) => ({ ...current, [playerId]: playerProfileId }));
    void sendQuackverseAction({ type: 'setClaimedPlayer', playerId, userId: playerProfileId });
  };

  const claimSeat = (playerId: PlayerId) => {
    void sendQuackverseAction({ type: 'claimSeat', playerId });
  };

  const leaveSeat = () => {
    void sendQuackverseAction({ type: 'leaveSeat' });
  };

  const clearSeatClaim = (playerId: PlayerId) => {
    void sendQuackverseAction({ type: 'clearSeat', playerId });
  };

  const endMatch = () => {
    void sendQuackverseAction({ type: 'endMatch' });
  };

  const pushUndoSnapshot = () => {
    const snapshot: UndoSnapshot = {
      activePlayer,
      turnNumber,
      actionMode,
      selectedCardId,
      selectedSquadCard,
      selectedBattleCard,
      selectedBoardIndex,
      squads: structuredClone(squads),
      grid: structuredClone(grid),
      battlePiles: structuredClone(battlePiles),
      score: structuredClone(score),
      koCount: structuredClone(koCount),
      formationVp: structuredClone(formationVp),
      scoredFormationKeys: structuredClone(scoredFormationKeys),
      turnActions: structuredClone(turnActions),
      winner,
      matchLog: structuredClone(matchLog),
    };

    undoStackRef.current = [snapshot, ...undoStackRef.current].slice(0, 12);
    setUndoVersion((current) => current + 1);
    requestSharedSave();
  };

  const undoLastAction = () => {
    const [snapshot, ...rest] = undoStackRef.current;
    if (!snapshot) return;

    undoStackRef.current = rest;
    setUndoVersion((current) => current + 1);
    setActivePlayer(snapshot.activePlayer);
    setTurnNumber(snapshot.turnNumber);
    setActionMode(snapshot.actionMode);
    setSelectedCardId(snapshot.selectedCardId);
    setSelectedSquadCard(snapshot.selectedSquadCard);
    setSelectedBattleCard(snapshot.selectedBattleCard);
    setSelectedBoardIndex(snapshot.selectedBoardIndex);
    setSquads(snapshot.squads);
    setGrid(snapshot.grid);
    setBattlePiles(snapshot.battlePiles);
    setScore(snapshot.score);
    setKoCount(snapshot.koCount);
    setFormationVp(snapshot.formationVp);
    setScoredFormationKeys(snapshot.scoredFormationKeys);
    setTurnActions(snapshot.turnActions);
    setWinner(snapshot.winner);
    setMatchLog([`Turn ${turnNumber}: Undid the last action.`, ...snapshot.matchLog].slice(0, 12));
    requestSharedSave();
  };

  const buildBattlePile = (owner: PlayerId, cardIds: number[], openingHandSize = 5): QuackverseBattlePileState => {
    const drawPile = shuffleCards(cardIds.map((cardId) => makeCardInstance(owner, cardId)));
    return {
      drawPile: drawPile.slice(openingHandSize),
      hand: drawPile.slice(0, openingHandSize),
      discardPile: [],
    };
  };

  const moveBattleCardToDiscard = (owner: PlayerId, instanceId: string) => {
    setBattlePiles((current) => {
      const pile = current[owner];
      const handEntry = pile.hand.find((entry) => entry.instanceId === instanceId);
      if (!handEntry) return current;
      return {
        ...current,
        [owner]: {
          ...pile,
          hand: pile.hand.filter((entry) => entry.instanceId !== instanceId),
          discardPile: [...pile.discardPile, handEntry],
        },
      };
    });
    setSelectedBattleCard((current) => (current?.owner === owner && current.instanceId === instanceId ? null : current));
  };

  const removeBattleCardFromHand = (owner: PlayerId, instanceId: string) => {
    setBattlePiles((current) => {
      const pile = current[owner];
      if (!pile.hand.some((entry) => entry.instanceId === instanceId)) return current;
      return {
        ...current,
        [owner]: {
          ...pile,
          hand: pile.hand.filter((entry) => entry.instanceId !== instanceId),
          },
      };
    });
    setSelectedBattleCard((current) => (current?.owner === owner && current.instanceId === instanceId ? null : current));
  };

  const drawBattleCards = (owner: PlayerId, count = 1) => {
    if (count <= 0) return;
    setBattlePiles((current) => {
      let pile = current[owner];
      let drawPile = [...pile.drawPile];
      let discardPile = [...pile.discardPile];
      let hand = [...pile.hand];

      for (let i = 0; i < count; i += 1) {
        if (!drawPile.length && discardPile.length) {
          drawPile = shuffleCards(discardPile);
          discardPile = [];
        }
        const nextCard = drawPile.shift();
        if (!nextCard) break;
        hand = [...hand, nextCard];
      }

      return {
        ...current,
        [owner]: {
          drawPile,
          discardPile,
          hand,
        },
      };
    });
  };

  const discardBattleCard = (owner: PlayerId, instanceId?: string) => {
    setBattlePiles((current) => {
      const pile = current[owner];
      const nextHand = [...pile.hand];
      const discardTarget = instanceId
        ? nextHand.find((entry) => entry.instanceId === instanceId)
        : nextHand[0];
      if (!discardTarget) return current;
      return {
        ...current,
        [owner]: {
          ...pile,
          hand: nextHand.filter((entry) => entry.instanceId !== discardTarget.instanceId),
          discardPile: [...pile.discardPile, discardTarget],
        },
      };
    });
  };

  const discardBoardPiece = (piece: GridPiece) => {
    setBattlePiles((current) => {
      const pile = current[piece.owner];
      const discardEntries = [
        { instanceId: piece.instanceId, cardId: piece.card.id },
        ...piece.equipmentIds.map((cardId) => makeCardInstance(piece.owner, cardId)),
      ];
      return {
        ...current,
        [piece.owner]: {
          ...pile,
          discardPile: [...pile.discardPile, ...discardEntries],
        },
      };
    });
  };

  const markTurnAction = (playerId: PlayerId, action: keyof QuackverseTurnActions, key?: string) => {
    setTurnActions((current) => {
      const playerActions = current[playerId];
      if (action === 'deployedOrMoved') {
        return { ...current, [playerId]: { ...playerActions, deployedOrMoved: true } };
      }
      if (!key) return current;
      const actionList = playerActions[action] as string[];
      if (actionList.includes(key)) return current;
      return { ...current, [playerId]: { ...playerActions, [action]: [...actionList, key] } };
    });
  };

  const recoverFatigueFor = (playerId: PlayerId) => {
    const activeFormationIndices = new Set(
      detectFormations(grid)
        .filter((formation) => formation.owner === playerId)
        .flatMap((formation) => formation.indices),
    );

    setGrid((current) =>
      current.map((slot, index) => {
        if (!slot || slot.owner !== playerId || activeFormationIndices.has(index) || slot.fatigue <= 0) return slot;
        return { ...slot, fatigue: Math.max(0, slot.fatigue - 1) };
      }),
    );
  };

  const endTurn = (entry?: string, actedOverride?: boolean, skipUndo = false) => {
    if (entry?.endsWith(' passed.')) {
      setSelectedBoardIndex(null);
      setActionMode('select');
      void sendQuackverseAction({ type: 'pass' });
      return;
    }
    if (!skipUndo) pushUndoSnapshot();
    if (entry) addLog(entry);
    const currentPlayer = activePlayer;
    const currentActions = turnActions[currentPlayer];
    const actedThisTurn =
      actedOverride ??
      (currentActions.deployedOrMoved ||
        currentActions.attacked.length > 0 ||
        currentActions.usedAbility.length > 0 ||
        currentActions.equipped.length > 0);
    if (
      !actedThisTurn &&
      !currentActions.deployedOrMoved &&
      currentActions.attacked.length === 0 &&
      currentActions.usedAbility.length === 0 &&
      currentActions.equipped.length === 0
    ) {
      discardBattleCard(currentPlayer);
      addLog(`${displayPlayers[currentPlayer].short} ended the turn without acting and discarded a card.`);
    }
    const nextPlayer = opponentOf(currentPlayer);
    setActivePlayer(nextPlayer);
    setTurnActions((current) => ({
      ...current,
      [currentPlayer]: emptyTurnActions(),
      [nextPlayer]: emptyTurnActions(),
    }));
    drawBattleCards(nextPlayer, 1);
    recoverFatigueFor(nextPlayer);
    setSelectedBoardIndex(null);
    setActionMode('select');
    setTurnNumber((current) => current + 1);
  };

  const removeFromSquad = (owner: PlayerId, cardId: number) => {
    requestSharedSave();
    setSquads((current) => ({ ...current, [owner]: current[owner].filter((card) => card.id !== cardId) }));
    setGrid((current) => current.map((slot) => (slot?.owner === owner && slot.card.id === cardId ? null : slot)));
    setSelectedSquadCard((current) => (current?.owner === owner && current.cardId === cardId ? null : current));
    setSelectedBoardIndex(null);
  };

  const scoreNewFormations = (owner: PlayerId, nextGrid: GridSlot[]) => {
    const detected = detectFormations(nextGrid).filter((formation) => formation.owner === owner);
    const fresh = detected
      .filter((formation) => !scoredFormationKeys.includes(formation.key))
      .sort((a, b) => b.indices.length - a.indices.length || (formationPriority[b.name] || 0) - (formationPriority[a.name] || 0))[0];
    if (!fresh) return;

    const earnsVp = formationVp[owner] < formationVpLimit;
    const nextScore = score[owner] + (earnsVp ? 1 : 0);
    setScoredFormationKeys((current) => [...current, fresh.key]);
    setFormationVp((current) => ({ ...current, [owner]: current[owner] + (earnsVp ? 1 : 0) }));
    setGrid(
      nextGrid.map((slot, index) =>
        slot && fresh.indices.includes(index)
          ? { ...slot, fatigue: slot.fatigue + 1, currentHp: slot.currentHp + 1, maxHp: slot.maxHp + 1 }
          : slot,
      ),
    );

    if (earnsVp) {
      setScore((current) => ({ ...current, [owner]: current[owner] + 1 }));
    }

    if (earnsVp && nextScore >= victoryTarget) {
      setWinner(owner);
      addLog(`${displayPlayers[owner].short} formed ${fresh.name} for +1 VP and wins the match. Formation ducks gain +1 HP and +1 Fatigue.`);
      return;
    }

    addLog(
      `${displayPlayers[owner].short} formed ${fresh.name}${earnsVp ? ' for +1 VP' : ' with no VP because the formation cap is reached'}. Formation ducks gain +1 HP and +1 Fatigue.`,
    );
  };

  const loadQuickStart = (owner: PlayerId, cardIds: number[]) => {
    const cardsToLoad = cardIds
      .map((cardId) => quackverseDucks.find((card) => card.id === cardId))
      .filter(Boolean) as QuackverseCard[];
    const battleDeck = buildBattlePile(owner, [...cardIds, ...starterBattleDecks[owner].filter((id) => !cardIds.includes(id))]);

    forceNextSharedWriteRef.current = true;
    pushUndoSnapshot();
    setSquads((current) => ({ ...current, [owner]: cardsToLoad }));
    setGrid((current) => current.map((slot) => (slot?.owner === owner ? null : slot)));
    setSelectedSquadCard({ owner, cardId: cardsToLoad[0].id });
    setSelectedBattleCard(battleDeck.hand[0] ? { owner, instanceId: battleDeck.hand[0].instanceId } : null);
    setBattlePiles((current) => ({ ...current, [owner]: battleDeck }));
    setActivePlayer(owner);
    setWinner(null);
    setFormationVp({ playerOne: 0, playerTwo: 0 });
    setScoredFormationKeys([]);
    setTurnActions(emptyTurnActionState());
    setMatchLog((current) => [`Loaded ${squadsLabel(cardsToLoad)} for ${displayPlayers[owner].label}.`, ...current].slice(0, 12));
  };

  const loadMockGame = () => {
    void sendQuackverseAction({ type: 'loadMockGame' });
    return;
    const p1 = quickStartSquads.playerOne[0].cardIds
      .map((cardId) => quackverseDucks.find((card) => card.id === cardId))
      .filter(Boolean) as QuackverseCard[];
    const p2 = quickStartSquads.playerTwo[0].cardIds
      .map((cardId) => quackverseDucks.find((card) => card.id === cardId))
      .filter(Boolean) as QuackverseCard[];
    const demoGrid = Array.from({ length: gridSize * gridSize }, () => null) as GridSlot[];
    [1, 2, 3, 4, 5].forEach((col, index) => {
      demoGrid[gridSize * (gridSize - 1) + col] = makePiece('playerOne', p1[index]);
      demoGrid[col] = makePiece('playerTwo', p2[index]);
    });
    const p1Battle = buildBattlePile('playerOne', [...quickStartSquads.playerOne[0].cardIds, 81, 84, 85, 86, 88]);
    const p2Battle = buildBattlePile('playerTwo', [...quickStartSquads.playerTwo[0].cardIds, 83, 87, 90, 95, 96]);

    forceNextSharedWriteRef.current = true;
    pushUndoSnapshot();
    setSquads({ playerOne: p1, playerTwo: p2 });
    setGrid(demoGrid);
    setBattlePiles({ playerOne: p1Battle, playerTwo: p2Battle });
    setScore({ playerOne: 0, playerTwo: 0 });
    setKoCount({ playerOne: 0, playerTwo: 0 });
    setFormationVp({ playerOne: 0, playerTwo: 0 });
    setScoredFormationKeys([]);
    setTurnActions(emptyTurnActionState());
    setWinner(null);
    setTurnNumber(1);
    setActionMode('select');
    setActivePlayer('playerOne');
    setSelectedSquadCard({ owner: 'playerOne', cardId: p1[0].id });
    setSelectedBattleCard(p1Battle.hand[0] ? { owner: 'playerOne', instanceId: p1Battle.hand[0].instanceId } : null);
    setSelectedBoardIndex(gridSize * (gridSize - 1) + 1);
    setSelectedCardId(p1[0].id);
    setMatchLog([
      'Mock game loaded: Ranger Strike enters from the bottom, Eclipse Ambush enters from the top.',
      'Player 1 starts. Select a duck, then Move or Attack from the action panel.',
    ]);
    setDemoStep(1);
  };

  const placeSelected = (index: number) => {
    if (!selectedBattleCardData || !selectedBattleCardDetails || selectedBattleCardDetails.type !== 'Duck' || grid[index] || winner) return;
    const battleSelection = selectedBattleCard;
    if (!battleSelection) return;
    if (battleSelection.owner !== activePlayer) {
      addLog(`${displayPlayers[activePlayer].short} can only place their own hand cards.`);
      return;
    }
    if (activeTurnActions.deployedOrMoved) {
      addLog(`${displayPlayers[activePlayer].short} already placed or moved this turn.`);
      return;
    }
    if (rowOf(index) !== players[activePlayer].backRow) {
      addLog(`${displayPlayers[activePlayer].short} must place new ducks on their entry row.`);
      return;
    }
    void sendQuackverseAction({ type: 'place', targetIndex: index, instanceId: selectedBattleCardData.instanceId });
  };

  const clearSquare = (index: number) => {
    pushUndoSnapshot();
    setGrid((current) => current.map((slot, slotIndex) => (slotIndex === index ? null : slot)));
  };

  const resetTable = () => {
    void sendQuackverseAction({ type: 'reset' });
    return;
    const p1Battle = buildBattlePile('playerOne', starterBattleDecks.playerOne);
    const p2Battle = buildBattlePile('playerTwo', starterBattleDecks.playerTwo);
    forceNextSharedWriteRef.current = true;
    pushUndoSnapshot();
    setGrid(Array.from({ length: gridSize * gridSize }, () => null));
    setBattlePiles({
      playerOne: p1Battle,
      playerTwo: p2Battle,
    });
    setScore({ playerOne: 0, playerTwo: 0 });
    setKoCount({ playerOne: 0, playerTwo: 0 });
    setFormationVp({ playerOne: 0, playerTwo: 0 });
    setScoredFormationKeys([]);
    setTurnActions(emptyTurnActionState());
    setWinner(null);
    setTurnNumber(1);
    setActivePlayer('playerOne');
    setActionMode('select');
    setSelectedBoardIndex(null);
    setSelectedBattleCard(p1Battle.hand[0] ? { owner: 'playerOne', instanceId: p1Battle.hand[0].instanceId } : null);
    setMatchLog(['Board cleared. Build squads, place ducks, then start taking turns.']);
  };

  const movePiece = (toIndex: number) => {
    if (selectedBoardIndex === null || !canActWithSelected || grid[toIndex] || !reachableMoveTargets.has(toIndex)) return;
    if (activeTurnActions.deployedOrMoved) {
      addLog(`${displayPlayers[activePlayer].short} already placed or moved this turn.`);
      return;
    }
    const piece = grid[selectedBoardIndex];
    if (!piece) return;

    void sendQuackverseAction({ type: 'move', from: selectedBoardIndex, to: toIndex });
    setSelectedBoardIndex(null);
    setActionMode('select');
    return;
  };

  const attackPiece = (targetIndex: number) => {
    if (selectedBoardIndex === null || !canActWithSelected || !isAdjacent(selectedBoardIndex, targetIndex)) return;
    const attacker = grid[selectedBoardIndex];
    const defender = grid[targetIndex];
    if (!attacker || !defender || defender.owner === attacker.owner) return;
    if (turnActions[attacker.owner].attacked.includes(pieceKey(attacker))) {
      addLog(`${displayPlayers[attacker.owner].short} already attacked with ${attacker.card.name} this turn.`);
      return;
    }

    void sendQuackverseAction({ type: 'attack', attackerIndex: selectedBoardIndex, targetIndex });
    setActionMode('select');
    return;
  };

  const handleBoardSquareClick = (index: number) => {
    const slot = grid[index];

    if (!slot && selectedBoardIndex !== null && selectedPiece && selectedPiece.owner === activePlayer && reachableMoveTargets.has(index)) {
      movePiece(index);
      return;
    }

    if (actionMode === 'move' && !slot) {
      if (isLegalMoveTarget(index)) {
        movePiece(index);
      }
      return;
    }

    if (actionMode === 'attack' && slot && selectedBoardIndex !== null && slot.owner !== activePlayer) {
      attackPiece(index);
      return;
    }

    if (slot && selectedBattleCardDetails?.type === 'Equipment' && slot.owner === activePlayer) {
      setSelectedBoardIndex(index);
      attachSelectedEquipment(index);
      return;
    }

    if (slot) {
      setSelectedBoardIndex(index);
      setSelectedCardId(slot.card.id);
      setInspectedCardId(slot.card.id);
      setActionMode('select');
      return;
    }

    if (selectedBattleCardDetails?.type === 'Duck') {
      placeSelected(index);
    }
  };

  const selectedFormationTargets = useMemo(() => {
    if (!selectedPiece || selectedBoardIndex === null) return new Set<number>();
    const formations = detectFormations(grid).filter((formation) => formation.indices.includes(selectedBoardIndex));
    return new Set(formations.flatMap((formation) => formation.indices));
  }, [grid, selectedBoardIndex, selectedPiece]);

  const selectedAbilityTargets = useMemo(() => {
    if (!selectedPiece || selectedBoardIndex === null) return new Set<number>();
    const ability = selectedPiece.card.abilities[0] || '';
    const targets = new Set<number>();
    const ownPieces = grid.map((piece, index) => ({ piece, index })).filter((entry) => entry.piece?.owner === selectedPiece.owner);
    const enemyPieces = grid.map((piece, index) => ({ piece, index })).filter((entry) => entry.piece?.owner === opponentOf(selectedPiece.owner));

    if (/all allies/i.test(ability)) {
      ownPieces.forEach((entry) => targets.add(entry.index));
      return targets;
    }

    if (/all enemies/i.test(ability)) {
      enemyPieces.forEach((entry) => targets.add(entry.index));
      return targets;
    }

    if (/(?:Heal|Restore)|\+(\d+)\s*DEF/i.test(ability)) {
      targets.add(selectedBoardIndex);
    }

    if (/\+(\d+)\s*(?:damage|ATK)/i.test(ability) || /swap\s+SPD\s+with\s+enemy/i.test(ability)) {
      grid
        .map((piece, index) => ({ piece, index }))
        .filter((entry) => entry.piece && entry.piece.owner !== selectedPiece.owner && isAdjacent(selectedBoardIndex, entry.index))
        .forEach((entry) => targets.add(entry.index));
    }

    return targets;
  }, [grid, selectedBoardIndex, selectedPiece]);

  const isLegalMoveTarget = (index: number) =>
    selectedBoardIndex !== null &&
    !grid[index] &&
    canActWithSelected &&
    !activeTurnActions.deployedOrMoved &&
    reachableMoveTargets.has(index);
  const isLegalAttackTarget = (index: number) =>
    selectedBoardIndex !== null && !!grid[index] && selectedPieceCanAttack && grid[index]?.owner !== activePlayer && isAdjacent(selectedBoardIndex, index);
  const isAbilityTarget = (index: number) => selectedAbilityTargets.has(index);
  const isFormationTarget = (index: number) => selectedFormationTargets.has(index);

  const openPack = async () => {
    if (pendingPacks <= 0 || isOpeningPack) return;
    setIsOpeningPack(true);
    setPackError('');
    try {
      const response = await fetch('/api/quackverse/pack', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: 'open' }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setPackError(String(data?.error || `Pack open failed (${response.status})`));
        if (data?.packsRemaining !== undefined) setPendingPacks(Number(data.packsRemaining || 0));
        return;
      }
      setPendingPacks(Number(data.packsRemaining || 0));
      setDailyPackLimit(Number(data.dailyLimit || dailyPackLimit));
      setCollection(Array.isArray(data.cards) ? data.cards : []);
      setDeck(Array.isArray(data.deck) ? data.deck : []);
      const packCards = Array.isArray(data.pack) ? data.pack : data.lastPack;
      setLastPack(
        Array.isArray(packCards)
          ? packCards.map((card: QuackverseCard | number) => (typeof card === 'number' ? quackverseCards.find((item) => item.id === card) : card)).filter(Boolean) as QuackverseCard[]
          : [],
      );
    } catch (error) {
      setPackError('Pack open failed. Try again.');
      console.warn('[Quackverse] Failed to open pack', error);
    } finally {
      setIsOpeningPack(false);
    }
  };

  const addToDeck = async (cardId: number) => {
    if (deck.length >= 20) return;
    const ownedCount = collection.filter((id) => id === cardId).length;
    const deckCount = deck.filter((id) => id === cardId).length;
    if (deckCount >= ownedCount) return;
    const response = await fetch('/api/quackverse/pack', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ action: 'addToDeck', cardId }),
    });
    const data = await response.json().catch(() => null);
    if (response.ok && data) {
      setCollection(Array.isArray(data.cards) ? data.cards : collection);
      setDeck(Array.isArray(data.deck) ? data.deck : deck);
      setPendingPacks(Number(data.packsRemaining ?? pendingPacks));
      setDailyPackLimit(Number(data.dailyLimit || dailyPackLimit));
    }
  };

  const removeFromDeck = async (cardId: number) => {
    const response = await fetch('/api/quackverse/pack', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ action: 'removeFromDeck', cardId }),
    });
    const data = await response.json().catch(() => null);
    if (response.ok && data) {
      setCollection(Array.isArray(data.cards) ? data.cards : collection);
      setDeck(Array.isArray(data.deck) ? data.deck : deck);
      setPendingPacks(Number(data.packsRemaining ?? pendingPacks));
      setDailyPackLimit(Number(data.dailyLimit || dailyPackLimit));
    }
  };

  const runNpcTurn = (playerId: PlayerId = activePlayer) => {
    if (!npcPlayersRef.current[playerId] || activePlayer !== playerId || winner) return;
    pushUndoSnapshot();
    const opponent = opponentOf(playerId);
    const npcPieces = grid
      .map((piece, index) => ({ piece, index }))
      .filter((entry): entry is { piece: GridPiece; index: number } => entry.piece?.owner === playerId);
    const playerPieces = grid
      .map((piece, index) => ({ piece, index }))
      .filter((entry): entry is { piece: GridPiece; index: number } => entry.piece?.owner === opponent);

    for (const npc of npcPieces) {
      const target = playerPieces.find((playerPiece) => isAdjacent(npc.index, playerPiece.index));
      if (target) {
        setSelectedBoardIndex(npc.index);
        setSelectedCardId(npc.piece.card.id);
        setSelectedSquadCard({ owner: playerId, cardId: npc.piece.card.id });
        const damage = Math.max(1, getEffectiveStats(npc.piece).atk - getEffectiveStats(target.piece).def);
        const nextHp = target.piece.currentHp - damage;
        const isKo = nextHp <= 0;
        setGrid((current) =>
          current.map((slot, index) => (index === target.index && slot ? (isKo ? null : { ...slot, currentHp: nextHp }) : slot)),
        );
        markTurnAction(playerId, 'attacked', pieceKey(npc.piece));
        if (isKo) {
          discardBoardPiece(target.piece);
          const nextKoCount = koCount[playerId] + 1;
          const nextScore = score[playerId] + 1;
          setKoCount((current) => ({ ...current, [playerId]: nextKoCount }));
          setScore((current) => ({ ...current, [playerId]: current[playerId] + 1 }));
          if (nextScore >= victoryTarget) {
            setWinner(playerId);
            addLog(`${displayPlayers[playerId].short} NPC attacked for ${damage}. ${target.piece.card.name} was KO'd for +1 VP. ${displayPlayers[playerId].label} wins the match.`);
            return;
          }
          endTurn(`${displayPlayers[playerId].short} NPC attacked for ${damage}. ${target.piece.card.name} was KO'd for +1 VP.`, true, true);
          return;
        }
        endTurn(`${displayPlayers[playerId].short} NPC attacked ${target.piece.card.name} for ${damage}. ${target.piece.card.name} has ${nextHp} HP left.`, true, true);
        return;
      }
    }

    const movable = npcPieces
      .map((npc) => {
        const nearest = playerPieces
          .map((playerPiece) => ({
            index: playerPiece.index,
            distance: Math.abs(rowOf(npc.index) - rowOf(playerPiece.index)) + Math.abs(colOf(npc.index) - colOf(playerPiece.index)),
          }))
          .sort((a, b) => a.distance - b.distance)[0];
        const options = [npc.index + gridSize, npc.index - gridSize, npc.index + 1, npc.index - 1].filter(
          (index) =>
            index >= 0 &&
            index < grid.length &&
            !grid[index] &&
            isAdjacent(npc.index, index) &&
            (!nearest ||
              Math.abs(rowOf(index) - rowOf(nearest.index)) + Math.abs(colOf(index) - colOf(nearest.index)) < nearest.distance),
        );
        return { ...npc, to: options[0] };
      })
      .find((entry) => entry.to !== undefined);

    if (movable?.to !== undefined) {
      setGrid((current) => current.map((slot, index) => (index === movable.index ? null : index === movable.to ? movable.piece : slot)));
      markTurnAction(playerId, 'deployedOrMoved');
      endTurn(`${displayPlayers[playerId].short} NPC moved ${movable.piece.card.name} to square ${movable.to + 1}.`, true, true);
      return;
    }

    endTurn(`${displayPlayers[playerId].short} NPC passed.`, undefined, true);
  };

  const useAbility = (ability = selectedPiece?.card.abilities[0]) => {
    if (selectedBoardIndex === null || !canActWithSelected || !selectedPiece || !ability) return;
    if (turnActions[selectedPiece.owner].usedAbility.includes(pieceKey(selectedPiece))) {
      addLog(`${displayPlayers[selectedPiece.owner].short} already used an ability with ${selectedPiece.card.name} this turn.`);
      return;
    }
    void sendQuackverseAction({ type: 'useAbility', sourceIndex: selectedBoardIndex, ability });
  };

  const attachSelectedEquipment = (targetIndex = selectedBoardIndex) => {
    if (targetIndex === null || selectedBattleCardDetails?.type !== 'Equipment' || winner || !selectedBattleCardData) {
      return;
    }
    const targetPiece = grid[targetIndex];
    if (!targetPiece || targetPiece.owner !== activePlayer) return;
    const battleSelection = selectedBattleCard;
    if (!battleSelection) return;
    if (turnActions[targetPiece.owner].equipped.includes(pieceKey(targetPiece))) {
      addLog(`${displayPlayers[targetPiece.owner].short} already equipped gear to ${targetPiece.card.name} this turn.`);
      return;
    }

    void sendQuackverseAction({ type: 'attachGear', targetIndex, instanceId: selectedBattleCardData.instanceId });
  };

  const toggleNpcPlayer = (playerId: PlayerId) => {
    setNpcPlayers((current) => ({ ...current, [playerId]: !current[playerId] }));
    void sendQuackverseAction({ type: 'toggleNpc', playerId });
  };

  const npcControlButtons = (
    <div className="grid grid-cols-2 gap-2">
      {(Object.keys(displayPlayers) as PlayerId[]).map((playerId) => (
        <button
          key={playerId}
          type="button"
          className="rounded-md bg-white/[0.05] p-2 text-left hover:bg-white/[0.08]"
          onClick={() => toggleNpcPlayer(playerId)}
        >
          NPC {displayPlayers[playerId].short}: {npcPlayers[playerId] ? 'On' : 'Off'}
        </button>
      ))}
    </div>
  );

  const seatControlPanel = (
    <div className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-headline text-lg text-white">Match Seats</h3>
          <p className="text-sm text-slate-400">
            {viewer?.seat ? `You are sitting in ${displayPlayers[viewer.seat].short}.` : 'Claim an open seat, or clear a stuck seat if you manage the room.'}
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={endMatch} disabled={isActionPending}>
          <Flag className="mr-2 h-4 w-4" />
          End Match
        </Button>
      </div>
      {actionError && <div className="mt-3 rounded-md border border-amber-300/30 bg-amber-300/10 p-2 text-sm text-amber-100">{actionError}</div>}
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {(Object.keys(displayPlayers) as PlayerId[]).map((playerId) => {
          const claimed = Boolean(claimedPlayers[playerId]);
          const isMine = viewer?.seat === playerId;
          const canClaim = !claimed || npcPlayers[playerId] || isMine;
          return (
            <div key={playerId} className={cn('rounded-lg border p-3', displayPlayers[playerId].accent)}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase text-slate-400">{displayPlayers[playerId].short}</div>
                  <div className="truncate font-headline text-white">{claimed ? displayPlayers[playerId].label : npcPlayers[playerId] ? 'NPC / Open' : 'Open Seat'}</div>
                </div>
                <div className="rounded-md bg-black/25 px-2 py-1 text-xs text-slate-200">{activePlayer === playerId ? 'Active' : 'Waiting'}</div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button type="button" size="sm" onClick={() => claimSeat(playerId)} disabled={isActionPending || !canClaim}>
                  <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                  {isMine ? 'Your Seat' : 'Claim'}
                </Button>
                {isMine ? (
                  <Button type="button" size="sm" variant="secondary" onClick={leaveSeat} disabled={isActionPending}>
                    <LogOut className="mr-1.5 h-3.5 w-3.5" />
                    Leave
                  </Button>
                ) : (
                  <Button type="button" size="sm" variant="secondary" onClick={() => clearSeatClaim(playerId)} disabled={isActionPending || (!claimed && !npcPlayers[playerId])}>
                    <UserX className="mr-1.5 h-3.5 w-3.5" />
                    Clear
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const cycleActionPanelPosition = () => {
    const positions: ActionPanelPosition[] = ['north', 'east', 'south', 'west'];
    setActionPanelPosition((current) => positions[(positions.indexOf(current) + 1) % positions.length]);
  };

  const selectedPieceActionPanel = selectedPiece && canActWithSelected ? (
    <div
      className={cn(
        'pointer-events-auto absolute z-30 w-64 rounded-md border border-cyan-300/60 bg-slate-950/95 p-3 text-left shadow-xl shadow-cyan-950/40',
        actionPanelPosition === 'north' && 'bottom-[calc(100%+0.5rem)] left-1/2 -translate-x-1/2',
        actionPanelPosition === 'east' && 'left-[calc(100%+0.5rem)] top-1/2 -translate-y-1/2',
        actionPanelPosition === 'south' && 'left-1/2 top-[calc(100%+0.5rem)] -translate-x-1/2',
        actionPanelPosition === 'west' && 'right-[calc(100%+0.5rem)] top-1/2 -translate-y-1/2',
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs uppercase text-slate-400">Selected duck</div>
          <div className="font-headline text-sm text-white">
            {displayPlayers[selectedPiece.owner].short} · {selectedPiece.card.name}
          </div>
          <div className="text-xs text-slate-300">
            {selectedPiece.currentHp}/{selectedPiece.maxHp} HP · {selectedPiece.specialCurrent}/{getSpecialMax(selectedPiece)} SPC · {getMovementBudget(getEffectiveStats(selectedPiece).spd)} move points
          </div>
          <div className="mt-1 text-[0.68rem] font-semibold uppercase text-cyan-100">Your turn</div>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="h-7 w-7"
            onClick={() => setInspectedCardId(selectedPiece.card.id)}
            title="View full card"
            aria-label="View full selected card"
          >
            <BookOpen className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="h-7 w-7"
            onClick={cycleActionPanelPosition}
            title={`Move actions panel (${actionPanelPosition})`}
            aria-label={`Move actions panel from ${actionPanelPosition}`}
          >
            <PanelTop className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="mb-2 rounded-md border border-white/10 bg-white/[0.04] p-2 text-[0.68rem] text-slate-300">
        Gear heals {getGearHealPerTurn(selectedPiece)} HP per turn.
      </div>
      <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={actionMode === 'move' ? 'default' : 'secondary'}
            disabled={isActionPending || !canActWithSelected || activeTurnActions.deployedOrMoved}
            onClick={() => setActionMode('move')}
          >
            <Move className="mr-1.5 h-3.5 w-3.5" />
            Move
          </Button>
          <Button
            type="button"
            size="sm"
            variant={actionMode === 'attack' ? 'default' : 'secondary'}
            disabled={isActionPending || !selectedPieceCanAttack}
            onClick={() => setActionMode('attack')}
          >
            <Swords className="mr-1.5 h-3.5 w-3.5" />
            Attack
          </Button>
          {selectedPiece.card.abilities.map((ability) => (
            <Button
              key={ability}
              type="button"
              size="sm"
              variant="secondary"
              className="max-w-full justify-start text-left"
              disabled={isActionPending || !selectedPieceCanUseAbility}
              onClick={() => useAbility(ability)}
              title={ability}
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{ability.split(':')[0]}</span>
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={isActionPending || !selectedPieceCanEquip || selectedBattleCardDetails?.type !== 'Equipment'}
            onClick={() => attachSelectedEquipment()}
          >
            <Shield className="mr-1.5 h-3.5 w-3.5" />
            Attach Gear
          </Button>
          <Button type="button" size="sm" variant="secondary" disabled={isActionPending || !!winner} onClick={() => endTurn(`${displayPlayers[activePlayer].short} passed.`)}>
            <Hand className="mr-1.5 h-3.5 w-3.5" />
            Pass
          </Button>
          <Button type="button" size="sm" variant="secondary" disabled={!canUndo} onClick={undoLastAction}>
            <Undo2 className="mr-1.5 h-3.5 w-3.5" />
            Undo
          </Button>
      </div>
      {selectedPiece.equipmentIds.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {selectedPiece.equipmentIds.map((gearId) => {
            const gear = quackverseCards.find((card) => card.id === gearId);
            if (!gear) return null;
            return (
              <span key={gear.id} className="rounded-md border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-[0.62rem] text-amber-100">
                {gear.name}
              </span>
            );
          })}
        </div>
      )}
    </div>
  ) : null;

  const inspectedAttachedGear = selectedPiece && inspectedCard && selectedPiece.card.id === inspectedCard.id
    ? (selectedPiece.equipmentIds
        .map((gearId) => quackverseCards.find((gear) => gear.id === gearId))
        .filter(Boolean) as QuackverseCard[])
    : [];

  const cardInspector = inspectedCard ? (
    <div className="fixed right-4 top-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-cyan-300/40 bg-slate-950/95 p-3 shadow-2xl shadow-black/60">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <FamilyAvatar card={inspectedCard} />
          <div className="min-w-0">
            <div className="truncate font-headline text-sm text-white">{inspectedCard.name}</div>
            <div className="text-[0.68rem] uppercase text-slate-400">{inspectedCard.role || inspectedCard.type}</div>
          </div>
        </div>
        <Button type="button" size="icon" variant="secondary" className="h-7 w-7" onClick={() => setInspectedCardId(null)} aria-label="Close card preview">
          x
        </Button>
      </div>
      <CardFace
        card={inspectedCard}
        selected
        attachedGear={inspectedAttachedGear}
      />
    </div>
  ) : null;

  const packAuditPanel = canViewPackAudit ? (
    <div className="mt-3 rounded-lg border border-cyan-300/20 bg-cyan-300/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-white">Pack Audit</div>
          <div className="text-xs text-slate-400">{packAuditSummary?.totalPacks || 0} packs tracked</div>
        </div>
        <Badge variant="outline" className="rounded-md border-cyan-300/50 text-cyan-100">
          Admin
        </Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300">
        {['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'].map((item) => (
          <div key={item} className="rounded-md bg-white/[0.05] p-2">
            {item}: {packAuditSummary?.rarityCounts?.[item] || 0}
          </div>
        ))}
      </div>
      <ScrollArea className="mt-3 h-48 pr-3">
        <div className="space-y-2">
          {packAuditEvents.length === 0 ? (
            <div className="rounded-md bg-white/[0.05] p-2 text-xs text-slate-400">No pack opens tracked yet.</div>
          ) : (
            packAuditEvents.slice(0, 25).map((event) => (
              <div key={event.id} className="rounded-md bg-white/[0.05] p-2 text-xs text-slate-300">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-white">{event.twitchUsername || event.userId}</span>
                  <span>{new Date(event.at).toLocaleString()}</span>
                </div>
                <div className="mt-1 text-slate-400">
                  Pack {event.packNumberToday}/{dailyPackLimit} · Collection {event.collectionSizeAfter} cards · Unique {event.uniqueCardsAfter}
                </div>
                <div className="mt-1 text-slate-200">
                  {(event.cards || []).map((card) => `${card.name} (${card.rarity})`).join(', ')}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  ) : null;

  useEffect(() => {
    if (!npcPlayers[activePlayer] || winner) return;

    const timeout = setTimeout(() => {
      if (npcPlayersRef.current[activePlayer]) {
        runNpcTurn(activePlayer);
      }
    }, 900);

    return () => clearTimeout(timeout);
  }, [activePlayer, npcPlayers, turnNumber, winner]);

  if (!isCommandLayout) {
    return (
      <div className="space-y-5">
        {cardInspector}
        <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-slate-950/70 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-headline text-2xl text-white">Quackverse Space-Force</h2>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-300">
              <span className="rounded-md bg-white/[0.06] px-2 py-1">Current deck</span>
              <span className="rounded-md bg-white/[0.06] px-2 py-1">7x7 tactical board</span>
              <span className="rounded-md bg-white/[0.06] px-2 py-1">6 VP wins</span>
              <span className="rounded-md bg-white/[0.06] px-2 py-1">Room {displayRoom}</span>
              <span className="rounded-md bg-white/[0.06] px-2 py-1">Turn {turnNumber}: {displayPlayers[activePlayer].label}</span>
              {winner && <span className="rounded-md bg-amber-300/20 px-2 py-1 text-amber-100">{displayPlayers[winner].label} wins</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex h-10 overflow-hidden rounded-md border border-white/10 bg-slate-950">
              <input
                value={roomInput}
                onChange={(event) => setRoomInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') switchRoom();
                }}
                className="w-36 bg-transparent px-3 text-sm text-white outline-none placeholder:text-slate-500"
                placeholder="room-id"
                aria-label="Quackverse room id"
              />
              <Button type="button" className="rounded-l-none" onClick={switchRoom}>
                Join
              </Button>
            </div>
            <a
              href={quackverseUrl('/quackverse-overlay')}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
            >
              Open Overlay
            </a>
            <a
              href={quackverseUrl('/quackverse-command')}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
            >
              Pop Out Controls
            </a>
          </div>
        </div>

        <Tabs defaultValue="play" className="space-y-4">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-secondary/50 p-1 sm:grid-cols-4">
            <TabsTrigger value="play">Play</TabsTrigger>
            <TabsTrigger value="cards">Cards</TabsTrigger>
            <TabsTrigger value="collection">Collection</TabsTrigger>
            <TabsTrigger value="guide">Guide</TabsTrigger>
          </TabsList>

          <TabsContent value="play" className="space-y-4">
            <div className="grid gap-3 rounded-lg border border-white/10 bg-black/20 p-4 md:grid-cols-2">
              {(Object.keys(displayPlayers) as PlayerId[]).map((playerId) => {
                const display = displayPlayers[playerId];
                return (
                  <div key={playerId} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-slate-900">
                      {display.avatarUrl ? (
                        <img src={display.avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-sm font-semibold text-slate-300">{display.short}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold uppercase text-slate-400">{display.short} identity</div>
                      <div className="mt-1 truncate rounded-md border border-white/10 bg-slate-950 px-2 py-2 text-sm text-white">
                        {display.profile?.twitchUsername || display.label}
                      </div>
                    </div>
                    <Button type="button" variant={activePlayer === playerId ? 'default' : 'secondary'} disabled>
                      <Hand className="mr-2 h-4 w-4" />
                      {activePlayer === playerId ? 'Active' : 'Waiting'}
                    </Button>
                  </div>
                );
              })}
            </div>

            {seatControlPanel}

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <section className="space-y-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="font-headline text-lg text-white">Current Deck</h3>
                        <p className="text-sm text-slate-400">
                          {currentDeckReady
                            ? `${deck.length} cards ready. Start a match with this deck, or use the mock game for NPC testing.`
                            : 'Build a deck in Collection first. This deck becomes the default match deck.'}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" onClick={resetTable} disabled={isActionPending}>
                          Start Game
                        </Button>
                        <Button type="button" variant="secondary" onClick={loadMockGame} disabled={isActionPending}>
                          Start Mock Game
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-300">
                      <div className="rounded-md bg-white/[0.05] p-2">Cards {deck.length}/20</div>
                      <div className="rounded-md bg-white/[0.05] p-2">Ducks {deckDuckCount}/10+</div>
                      <div className="rounded-md bg-white/[0.05] p-2">Gear {deckEquipmentCount}/8 max</div>
                    </div>
                    <div className={cn('mt-2 rounded-md p-2 text-xs', isDeckPlayable ? 'bg-emerald-400/10 text-emerald-100' : 'bg-amber-400/10 text-amber-100')}>
                      {isDeckPlayable ? 'Deck is playable for testing.' : 'Deck needs 20 cards, at least 10 ducks, and no more than 8 equipment cards.'}
                    </div>
                    {deckCards.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {deckCards.slice(0, 20).map((card) => (
                          <button
                            key={card.id}
                            type="button"
                            className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-slate-200 hover:border-cyan-300/60"
                            onClick={() => setSelectedCardId(card.id)}
                          >
                            {card.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                    <div className="text-sm font-semibold text-white">Match Summary</div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-300">
                      <div className="rounded-md bg-white/[0.05] p-2">P1: {score.playerOne}/6 VP</div>
                      <div className="rounded-md bg-white/[0.05] p-2">P2: {score.playerTwo}/6 VP</div>
                      <div className="rounded-md bg-white/[0.05] p-2">P1 KOs: {koCount.playerOne}</div>
                      <div className="rounded-md bg-white/[0.05] p-2">P2 KOs: {koCount.playerTwo}</div>
                    </div>
                    <div className="mt-2 rounded-md bg-white/[0.05] p-2 text-xs text-slate-400">
                      Each player enters from their back row. P1 deploys on the bottom row and P2 deploys on the top row.
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="font-headline text-lg text-white">Turn Status</h3>
                      <p className="text-sm text-slate-400">
                        {selectedPiece
                          ? `${displayPlayers[selectedPiece.owner].short} selected ${selectedPiece.card.name} (${selectedPiece.currentHp}/${selectedPiece.maxHp} HP, ${getMovementBudget(getEffectiveStats(selectedPiece).spd)} move points)`
                          : 'Select a duck on the board to move or attack.'}
                      </p>
                    </div>
                    <div className={cn('rounded-md border px-3 py-2 text-sm font-semibold', displayPlayers[activePlayer].accent)}>
                      <Hand className="mr-2 inline h-4 w-4" />
                      {displayPlayers[activePlayer].label}'s turn
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-3">
                    <div className="rounded-md bg-white/[0.05] p-2">P1: {score.playerOne}/6 VP · KOs {koCount.playerOne}</div>
                    <div className="rounded-md bg-white/[0.05] p-2">P2: {score.playerTwo}/6 VP · KOs {koCount.playerTwo}</div>
                    <div className="rounded-md bg-white/[0.05] p-2">Deck: {currentDeckReady ? 'ready' : 'empty'}</div>
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-headline text-lg text-white">Hand</h3>
                      <p className="text-sm text-slate-400">Click a card to select it for placement or gear.</p>
                    </div>
                    <div className="text-xs text-slate-400">
                      Draw {battlePiles[activePlayer].drawPile.length} · Discard {battlePiles[activePlayer].discardPile.length} · Hand {battlePiles[activePlayer].hand.length}
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {battleHandCards[activePlayer].length === 0 ? (
                      <div className="rounded-md border border-dashed border-white/10 bg-white/[0.03] p-3 text-sm text-slate-500">
                        No cards in hand.
                      </div>
                    ) : (
                      battleHandCards[activePlayer].map(({ instance, card }) => (
                        <button
                          key={instance.instanceId}
                          type="button"
                          className={cn(
                            'rounded-md border bg-white/[0.04] p-3 text-left transition hover:border-cyan-300/70 hover:bg-white/[0.07]',
                            selectedBattleCard?.instanceId === instance.instanceId ? 'border-cyan-300 ring-2 ring-cyan-300/30' : 'border-white/10',
                          )}
                          onClick={() => {
                            setSelectedBattleCard({ owner: activePlayer, instanceId: instance.instanceId });
                            setSelectedCardId(card.id);
                            setInspectedCardId(card.id);
                          }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs uppercase text-slate-400">{card.type}</div>
                              <div className="font-headline text-sm text-white">{card.name}</div>
                            </div>
                            <FamilyAvatar card={card} />
                          </div>
                          <div className="mt-2 text-xs text-slate-300">{card.type === 'Duck' ? card.role : card.effect}</div>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-slate-950/70 p-4">
                  <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-headline text-lg text-white">Tactical Card Board</h3>
                      <p className="text-sm text-slate-400">Select a duck from the hand, then place it on an entry row or move it by clicking a highlighted square.</p>
                    </div>
                    <Button type="button" variant="secondary" onClick={resetTable}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Clear Board
                    </Button>
                  </div>

                  <div className="mx-auto max-w-[64rem] rounded-lg border border-white/5 bg-transparent p-3">
                    <div className="grid grid-cols-7 gap-2">
                      {grid.map((slot, index) => {
                        const row = Math.floor(index / gridSize);
                        const isPlayerOneBackRow = row === players.playerOne.backRow;
                        const isPlayerTwoBackRow = row === players.playerTwo.backRow;
                        const backRowLabel = isPlayerOneBackRow ? 'P1 entry' : isPlayerTwoBackRow ? 'P2 entry' : '';
                        const isSelectedSquare = selectedBoardIndex === index;
                        const isMoveTarget = isLegalMoveTarget(index);
                        const isAttackTarget = isLegalAttackTarget(index);
                        const effectiveStats = slot ? getEffectiveStats(slot) : null;

                        return (
                          <div
                            key={index}
                            className={cn(
                              'relative aspect-square rounded-lg border text-center transition',
                          'bg-transparent',
                          slot?.owner === activePlayer && !isSelectedSquare && 'shadow-[0_0_0_1px_rgba(255,255,255,0.35),0_0_18px_rgba(34,211,238,0.18)]',
                          isSelectedSquare && 'ring-2 ring-yellow-300',
                          isMoveTarget && 'border-emerald-300 bg-emerald-400/10 ring-1 ring-emerald-300/50',
                          isAttackTarget && 'border-red-300 bg-red-400/10 ring-1 ring-red-300/50',
                          isAbilityTarget(index) && 'border-sky-300 bg-sky-400/10 ring-1 ring-sky-300/50',
                          isFormationTarget(index) && 'border-yellow-300 bg-yellow-400/10 ring-1 ring-yellow-300/50',
                              isPlayerOneBackRow && 'border-cyan-300/25 shadow-[inset_0_0_18px_rgba(34,211,238,0.08)]',
                              isPlayerTwoBackRow && 'border-rose-300/25 shadow-[inset_0_0_18px_rgba(251,113,133,0.08)]',
                              !isPlayerOneBackRow && !isPlayerTwoBackRow && 'border-white/5',
                              slot?.owner && displayPlayers[slot.owner].accent,
                            )}
                          >
                      {slot ? (
                        <button
                          type="button"
                          className="flex h-full w-full flex-col overflow-hidden rounded-lg text-left"
                          onClick={() => handleBoardSquareClick(index)}
                        >
                          <div className="relative flex-1 overflow-hidden">
                            <img
                              src={artManifest[String(slot.card.id)]?.static?.url || slot.card.artUrl || ''}
                              alt={slot.card.name}
                              className="h-full w-full object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                            <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-1 p-2 text-[0.6rem]">
                              <span className="rounded bg-black/45 px-1.5 py-0.5 font-semibold text-white">{displayPlayers[slot.owner].short}</span>
                              <button
                                type="button"
                                className="rounded bg-black/45 px-1.5 py-0.5 text-slate-200 hover:bg-black/70"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  clearSquare(index);
                                }}
                                aria-label={`Clear square ${index + 1}`}
                              >
                                Clear
                              </button>
                            </div>
                            <div className="absolute inset-x-0 bottom-0 p-2 text-left text-white">
                              {isSelectedSquare ? (
                                <div className="space-y-1 text-[0.58rem] text-slate-200">
                                  <div className="flex flex-wrap gap-1">
                                    <span className="rounded bg-black/45 px-1.5 py-0.5">ATK {effectiveStats?.atk}</span>
                                    <span className="rounded bg-black/45 px-1.5 py-0.5">DEF {effectiveStats?.def}</span>
                                    <span className="rounded bg-black/45 px-1.5 py-0.5">SPD {effectiveStats?.spd}</span>
                                    <span className="rounded bg-black/45 px-1.5 py-0.5">HP {slot.currentHp}</span>
                                  </div>
                                  <div className="line-clamp-2 text-xs font-semibold">{slot.card.name}</div>
                                </div>
                              ) : (
                                <>
                                  <div className="line-clamp-2 text-[0.72rem] font-semibold">{slot.card.name}</div>
                                  <div className="text-[0.58rem] text-slate-200">
                                    {getQuackverseFamilyGroup(slot.card.id)?.label || slot.card.role || slot.card.type}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="h-1.5 bg-black/50">
                            <div className="h-full rounded-full bg-emerald-300" style={{ width: `${Math.max(5, (slot.currentHp / slot.maxHp) * 100)}%` }} />
                          </div>
                        </button>
                      ) : (
                              <button
                                type="button"
                                onClick={() => handleBoardSquareClick(index)}
                                className={cn(
                                  'flex h-full w-full flex-col items-center justify-center rounded-lg p-2',
                                  'text-slate-700 hover:bg-white/[0.04] hover:text-cyan-100',
                                  selectedGridCard && 'cursor-pointer',
                                  !selectedGridCard && 'cursor-default',
                                )}
                                aria-label={`Place selected card on board square ${index + 1}`}
                              >
                                <span className="text-[0.65rem]">{index + 1}</span>
                                {backRowLabel && <span className="mt-1 text-[0.58rem] uppercase">{backRowLabel}</span>}
                              </button>
                            )}
                            {isSelectedSquare && selectedPieceActionPanel}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>

              <aside className="space-y-4">
                <Accordion type="multiple" defaultValue={['quick-start', 'log']} className="space-y-3">
                  <AccordionItem value="quick-start" className="rounded-lg border border-white/10 bg-black/20 px-4">
                  <AccordionTrigger className="font-headline text-lg text-white hover:no-underline">Match Start</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3">
                      <div className="rounded-md bg-white/[0.05] p-3 text-sm text-slate-300">
                        <div className="font-semibold text-white">Current deck</div>
                        <div className="mt-1 text-slate-400">
                          {currentDeckReady ? `${deck.length} cards are ready to deploy.` : 'No deck available yet.'}
                        </div>
                        {deckCards.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {deckCards.slice(0, 12).map((card) => (
                              <button
                                key={card.id}
                                type="button"
                                className="rounded-md bg-cyan-300/10 px-2 py-1 text-xs text-cyan-100"
                                onClick={() => setSelectedCardId(card.id)}
                              >
                                {card.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <Button type="button" size="sm" className="w-full" onClick={resetTable}>
                        Start Game
                      </Button>
                      <Button type="button" size="sm" variant="secondary" className="w-full" onClick={loadMockGame}>
                        Start Mock Game
                      </Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                  <AccordionItem value="score" className="rounded-lg border border-white/10 bg-black/20 px-4">
                    <AccordionTrigger className="font-headline text-lg text-white hover:no-underline">Manual Score</AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3">
                        {(Object.keys(displayPlayers) as PlayerId[]).map((playerId) => (
                          <div key={playerId} className="flex items-center justify-between rounded-md bg-white/[0.05] p-3">
                            <span className="font-headline text-white">{displayPlayers[playerId].label}</span>
                            <div className="flex items-center gap-2">
                              <Button type="button" size="icon" variant="secondary" onClick={() => setScore((current) => ({ ...current, [playerId]: Math.max(0, current[playerId] - 1) }))}>
                                <Minus className="h-4 w-4" />
                              </Button>
                              <span className="w-8 text-center text-lg font-bold text-white">{score[playerId]}</span>
                              <Button type="button" size="icon" onClick={() => setScore((current) => ({ ...current, [playerId]: current[playerId] + 1 }))}>
                                <BadgePlus className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="log" className="rounded-lg border border-white/10 bg-black/20 px-4">
                    <AccordionTrigger className="font-headline text-lg text-white hover:no-underline">Match Log</AccordionTrigger>
                    <AccordionContent>
                      <ScrollArea className="h-56 pr-3">
                        <div className="space-y-2 text-sm text-slate-300">
                          {matchLog.map((entry, index) => (
                            <div key={`${entry}-${index}`} className="rounded-md bg-white/[0.05] p-2">
                              {entry}
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </aside>
            </div>
          </TabsContent>

          <TabsContent value="cards">
            {isAdmin && (
              <div className="mb-4">
                <QuackverseArtManager />
              </div>
            )}
            <div className="grid gap-4 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
              <section className="space-y-3 rounded-lg border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-headline text-lg text-white">Card Library</h3>
                  <Badge variant="outline" className="rounded-md border-cyan-300/50 text-cyan-100">{cards.length} cards</Badge>
                </div>
                <Tabs value={libraryMode} onValueChange={(value) => setLibraryMode(value as typeof libraryMode)}>
                  <TabsList className="grid w-full grid-cols-3 bg-secondary/50">
                    <TabsTrigger value="ducks">Ducks</TabsTrigger>
                    <TabsTrigger value="equipment">Gear</TabsTrigger>
                    <TabsTrigger value="all">All</TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="flex flex-wrap gap-2">
                  {['All', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'].map((item) => (
                    <Button key={item} type="button" size="sm" variant={rarity === item ? 'default' : 'secondary'} className="h-8" onClick={() => setRarity(item)}>
                      {item}
                    </Button>
                  ))}
                </div>
                <input
                  type="search"
                  value={cardSearch}
                  onChange={(event) => setCardSearch(event.target.value)}
                  placeholder="Search cards, roles, abilities..."
                  className="h-9 w-full rounded-md border border-white/10 bg-slate-950 px-3 text-sm text-white placeholder:text-slate-500"
                />
                <ScrollArea className="h-[42rem] pr-3">
                  <div className="grid gap-2">
                    {cards.map((card) => (
                      <div key={card.id} className="space-y-2">
                        <CardFace card={card} compact selected={selectedCardId === card.id} onClick={() => setSelectedCardId(card.id)} />
                        {card.type === 'Duck' && (
                          <Button type="button" size="sm" className="w-full" onClick={() => addToDeck(card.id)}>
                            <BadgePlus className="mr-2 h-4 w-4" />
                            Add to Deck
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </section>

              <section className="rounded-lg border border-white/10 bg-black/20 p-4">
                <h3 className="mb-3 font-headline text-lg text-white">Selected Card</h3>
                <div className="max-w-md">
                  <CardFace card={selectedCard} selected />
                </div>
                {selectedCard.flavor && <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.04] p-3 text-sm italic text-slate-300">{selectedCard.flavor}</p>}
              </section>
            </div>
          </TabsContent>

          <TabsContent value="collection">
            <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
              <section className="rounded-lg border border-white/10 bg-black/20 p-4">
                <h3 className="font-headline text-lg text-white">Collection Lab</h3>
                <div className="mt-3">
                  <Button type="button" className="w-full" disabled={pendingPacks <= 0 || isOpeningPack} onClick={openPack}>
                    {isOpeningPack ? 'Opening...' : `Open Pack (${pendingPacks}/${dailyPackLimit} left today)`}
                  </Button>
                </div>
                {packError && <div className="mt-2 rounded-md border border-amber-300/30 bg-amber-300/10 p-2 text-xs text-amber-100">{packError}</div>}
                <div className="mt-3 text-sm text-slate-300">
                  Owned: {collection.length} cards · Unique: {collectionSummary.length}/{quackverseCards.length} · Deck: {deck.length}/20
                </div>
                <div className="mt-2 rounded-md bg-white/[0.05] p-2 text-xs text-slate-400">
                  Pack slots: utility common/uncommon, utility up to epic, duck common/uncommon, duck uncommon/rare, wild.
                </div>
                {packAuditPanel}
                {lastPack.length > 0 && (
                  <div className="mt-3 grid grid-cols-5 gap-2">
                    {lastPack.map((card) => (
                      <button key={`${card.id}-${card.name}`} type="button" className="rounded-md border border-white/10 bg-white/[0.04] p-2 text-left text-[0.65rem] text-slate-200 hover:border-cyan-300/60" onClick={() => setSelectedCardId(card.id)}>
                        <div className="font-semibold text-white">{card.name}</div>
                        <div>{card.rarity}</div>
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-white">Pack Preview</div>
                    <div className="text-xs text-slate-400">Click a card above to inspect it</div>
                  </div>
                  <div className="max-w-md">
                    <CardFace card={selectedCard} selected />
                  </div>
                  {selectedCard.flavor && (
                    <p className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-sm italic text-slate-300">
                      {selectedCard.flavor}
                    </p>
                  )}
                </div>
              </section>

              <section className="rounded-lg border border-white/10 bg-black/20 p-4">
                <h3 className="font-headline text-lg text-white">Deck Builder</h3>
                <p className="mt-1 text-sm text-slate-400">Prototype flow: open packs, collect cards, then add owned copies to a simple deck.</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-300">
                  <div className="rounded-md bg-white/[0.05] p-2">Cards {deck.length}/20</div>
                  <div className="rounded-md bg-white/[0.05] p-2">Ducks {deckDuckCount}/10+</div>
                  <div className="rounded-md bg-white/[0.05] p-2">Gear {deckEquipmentCount}/8 max</div>
                </div>
                <div className={cn('mt-2 rounded-md p-2 text-xs', isDeckPlayable ? 'bg-emerald-400/10 text-emerald-100' : 'bg-amber-400/10 text-amber-100')}>
                  {isDeckPlayable ? 'Deck is playable for testing.' : 'Deck needs 20 cards, at least 10 ducks, and no more than 8 equipment cards.'}
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <ScrollArea className="h-80 pr-3">
                    <div className="space-y-2">
                      {collectionSummary.length === 0 ? (
                        <div className="rounded-md bg-white/[0.05] p-2 text-sm text-slate-400">Open a pack to start collecting.</div>
                      ) : (
                        collectionSummary.map(({ card, quantity }) => (
                          <div key={card.id} className="flex items-center justify-between gap-2 rounded-md bg-white/[0.05] p-2 text-sm">
                            <button type="button" className="min-w-0 flex-1 text-left text-slate-200" onClick={() => setSelectedCardId(card.id)}>
                              <span className="font-semibold text-white">{card.name}</span>
                              <span className="ml-2 text-slate-400">x{quantity}</span>
                            </button>
                            <Button type="button" size="sm" variant="secondary" onClick={() => addToDeck(card.id)}>Add</Button>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <div className="mb-2 text-sm font-semibold text-white">Current Deck</div>
                    <div className="flex flex-wrap gap-2">
                      {deck.length === 0 ? (
                        <div className="text-sm text-slate-400">No cards added yet.</div>
                      ) : (
                        deck.map((cardId, index) => {
                          const card = quackverseCards.find((item) => item.id === cardId);
                          return (
                            <button key={`${cardId}-${index}`} type="button" className="rounded-md bg-cyan-300/10 px-2 py-1 text-xs text-cyan-100" onClick={() => removeFromDeck(cardId)}>
                              {card?.name || cardId}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </TabsContent>

          <TabsContent value="guide">
            <Accordion type="multiple" defaultValue={['rules', 'learn']} className="space-y-3">
              <AccordionItem value="rules" className="rounded-lg border border-white/10 bg-black/20 px-4">
                <AccordionTrigger className="font-headline text-lg text-white hover:no-underline">Rules</AccordionTrigger>
                <AccordionContent>
                  <div className="grid gap-2 text-sm text-slate-300 md:grid-cols-2">
                    <div className="rounded-md bg-white/[0.05] p-2">Setup: each player brings 5 ducks. Equipment can be added after the base match loop works.</div>
                    <div className="rounded-md bg-white/[0.05] p-2">Turn: move, attack, use an ability, or pass. One main action per turn. Abilities spend Special and fail if the duck does not have enough charge.</div>
                    <div className="rounded-md bg-white/[0.05] p-2">Attack damage = ATK - enemy DEF, minimum 1.</div>
                    <div className="rounded-md bg-white/[0.05] p-2">Movement uses SPD: low speed gets 2 points, average 3, fast 4, boosted 5. Forward costs 1, lateral 2, backward 3.</div>
                    <div className="rounded-md bg-white/[0.05] p-2">Special uses SPC: ducks gain charge at the start of their turn, modified by SPC and fatigue. Strong utility cards spend more charge.</div>
                    <div className="rounded-md bg-white/[0.05] p-2">Win at 6 VP. KOs give +1 VP. Formations give +1 VP for your first 3 scored formations; later formations only grant perks.</div>
                    <div className="rounded-md bg-white/[0.05] p-2">Formation perk: involved ducks gain +1 HP and +1 Fatigue, reducing ATK and SPD by the fatigue value. Ducks recover 1 Fatigue at the start of a turn if they are no longer in formation.</div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="learn" className="rounded-lg border border-white/10 bg-black/20 px-4">
                <AccordionTrigger className="font-headline text-lg text-white hover:no-underline">Learn By Playing</AccordionTrigger>
                <AccordionContent>
                  <div className="rounded-md bg-white/[0.05] p-3">
                    <div className="text-sm font-semibold text-white">{demoSteps[demoStep].title}</div>
                    <p className="mt-1 text-sm text-slate-300">{demoSteps[demoStep].body}</p>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button type="button" variant="secondary" className="flex-1" onClick={() => setDemoStep((current) => Math.max(0, current - 1))}>Back</Button>
                    <Button type="button" className="flex-1" onClick={() => setDemoStep((current) => Math.min(demoSteps.length - 1, current + 1))}>Next</Button>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="log" className="rounded-lg border border-white/10 bg-black/20 px-4">
                <AccordionTrigger className="font-headline text-lg text-white hover:no-underline">Match Log</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 text-sm text-slate-300">
                    {matchLog.map((entry, index) => (
                      <div key={`${entry}-${index}`} className="rounded-md bg-white/[0.05] p-2">{entry}</div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  if (isCommandLayout) {
    return (
      <QuackverseDeckRecordContext.Provider value={deckRecord}>
        <QuackverseArtContext.Provider value={artManifest}>
      <div className="space-y-3 text-sm">
        {cardInspector}
        <div className="rounded-lg border border-white/10 bg-slate-950/80 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-headline text-lg leading-tight text-white">Quackverse Command</h2>
              <div className="mt-1 text-xs text-slate-400">
                Room {displayRoom} · Turn {turnNumber} · {displayPlayers[activePlayer].label}
                {winner ? ` · ${displayPlayers[winner].label} wins` : ''}
              </div>
            </div>
            <a
              href={quackverseUrl('/quackverse-overlay')}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-md bg-secondary px-2.5 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
            >
              Overlay
            </a>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300">
            <div className="rounded-md border border-cyan-300/30 bg-cyan-300/10 p-2">
              {displayPlayers.playerOne.label}: {score.playerOne}/6 VP
            </div>
            <div className="rounded-md border border-rose-300/30 bg-rose-300/10 p-2">
              {displayPlayers.playerTwo.label}: {score.playerTwo}/6 VP
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-black/25 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-white">Active Hand</div>
            <div className="text-xs text-slate-400">
              Draw {battlePiles[activePlayer].drawPile.length} · Discard {battlePiles[activePlayer].discardPile.length} · Hand {battlePiles[activePlayer].hand.length}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {activeHandCards.length === 0 ? (
              <div className="rounded-md border border-dashed border-white/10 bg-white/[0.03] p-3 text-xs text-slate-500">No cards in hand.</div>
            ) : (
              activeHandCards.map(({ instance, card }) => (
                <button
                  key={instance.instanceId}
                  type="button"
                  className={cn(
                    'rounded-md border bg-white/[0.04] p-3 text-left transition hover:border-cyan-300/70 hover:bg-white/[0.07]',
                    selectedBattleCard?.instanceId === instance.instanceId ? 'border-cyan-300 ring-2 ring-cyan-300/30' : 'border-white/10',
                  )}
                  onClick={() => {
                    setSelectedBattleCard({ owner: activePlayer, instanceId: instance.instanceId });
                    setSelectedCardId(card.id);
                    setInspectedCardId(card.id);
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs uppercase text-slate-400">{card.type}</div>
                      <div className="font-headline text-sm text-white">{card.name}</div>
                    </div>
                    <FamilyAvatar card={card} />
                  </div>
                  <div className="mt-2 text-xs text-slate-300">{card.type === 'Duck' ? card.role : card.effect}</div>
                </button>
              ))
            )}
          </div>
        </div>

        <Tabs defaultValue="controls" className="space-y-3">
          <TabsList className="grid h-auto w-full grid-cols-4 bg-secondary/50 p-1">
            <TabsTrigger value="controls">Controls</TabsTrigger>
            <TabsTrigger value="board">Board</TabsTrigger>
            <TabsTrigger value="setup">Setup</TabsTrigger>
            <TabsTrigger value="log">Log</TabsTrigger>
          </TabsList>

          <TabsContent value="controls" className="space-y-3">
            {seatControlPanel}
            <div className="rounded-lg border border-white/10 bg-black/25 p-3">
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(displayPlayers) as PlayerId[]).map((playerId) => (
                  <Button
                    key={playerId}
                    type="button"
                    size="sm"
                    variant={activePlayer === playerId ? 'default' : 'secondary'}
                    disabled
                  >
                    <Hand className="mr-2 h-4 w-4" />
                    {activePlayer === playerId ? `${displayPlayers[playerId].short} Active` : `${displayPlayers[playerId].short} Wait`}
                  </Button>
                ))}
              </div>
              <div className="mt-3 rounded-md bg-white/[0.05] p-2 text-xs text-slate-300">
                {selectedPiece
                  ? `${displayPlayers[selectedPiece.owner].short}: ${selectedPiece.card.name} · ${selectedPiece.currentHp}/${selectedPiece.maxHp} HP · ${getMovementBudget(getEffectiveStats(selectedPiece).spd)} move points`
                  : 'Open Board and select a duck before move, attack, ability, or gear.'}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className={cn('rounded-md border px-2 py-2 text-xs font-semibold', displayPlayers[activePlayer].accent)}>
                  <Hand className="mr-1.5 inline h-3.5 w-3.5" />
                  {displayPlayers[activePlayer].short} turn
                </div>
                <div className="rounded-md bg-white/[0.05] p-2">Deck: {currentDeckReady ? 'ready' : 'empty'}</div>
              </div>
              <div className="mt-3 rounded-md bg-white/[0.05] p-2 text-xs text-slate-300">
                Hand {battlePiles[activePlayer].hand.length} · Draw {battlePiles[activePlayer].drawPile.length} · Discard {battlePiles[activePlayer].discardPile.length}
                {selectedBattleCardDetails ? ` · Selected ${selectedBattleCardDetails.name}` : ''}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="board">
            <div className="rounded-lg border border-white/5 bg-transparent p-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className={cn('rounded-md border px-2 py-1 text-xs font-semibold', displayPlayers[activePlayer].accent)}>
                  {displayPlayers[activePlayer].short} turn
                </div>
                <Button type="button" size="sm" variant="secondary" onClick={resetTable}>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  Clear
                </Button>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {grid.map((slot, index) => {
                  const row = Math.floor(index / gridSize);
                  const isPlayerOneBackRow = row === players.playerOne.backRow;
                  const isPlayerTwoBackRow = row === players.playerTwo.backRow;
                  const isSelectedSquare = selectedBoardIndex === index;
                  const isMoveTarget = isLegalMoveTarget(index);
                  const isAttackTarget = isLegalAttackTarget(index);
                  const effectiveStats = slot ? getEffectiveStats(slot) : null;

                  return (
                    <div
                      key={index}
                      className={cn(
                        'relative aspect-square rounded-md border bg-transparent text-center transition',
                        slot?.owner === activePlayer && !isSelectedSquare && 'shadow-[0_0_0_1px_rgba(255,255,255,0.35),0_0_18px_rgba(34,211,238,0.18)]',
                        isSelectedSquare && 'ring-2 ring-yellow-300',
                        isMoveTarget && 'border-emerald-300 bg-emerald-400/10 ring-1 ring-emerald-300/50',
                        isAttackTarget && 'border-red-300 bg-red-400/10 ring-1 ring-red-300/50',
                        isAbilityTarget(index) && 'border-sky-300 bg-sky-400/10 ring-1 ring-sky-300/50',
                        isFormationTarget(index) && 'border-yellow-300 bg-yellow-400/10 ring-1 ring-yellow-300/50',
                        isPlayerOneBackRow && 'border-cyan-300/25 shadow-[inset_0_0_12px_rgba(34,211,238,0.08)]',
                        isPlayerTwoBackRow && 'border-rose-300/25 shadow-[inset_0_0_12px_rgba(251,113,133,0.08)]',
                        !isPlayerOneBackRow && !isPlayerTwoBackRow && 'border-white/5',
                        slot?.owner && displayPlayers[slot.owner].accent,
                      )}
                    >
                      {slot ? (
                        <button type="button" className="flex h-full w-full flex-col justify-between p-1" onClick={() => handleBoardSquareClick(index)}>
                          <span className="self-start rounded bg-black/35 px-1 text-[0.55rem] text-white">{displayPlayers[slot.owner].short}</span>
                          <span className="line-clamp-2 text-[0.55rem] font-semibold leading-tight text-white">{slot.card.name}</span>
                          <span className="text-[0.5rem] text-slate-200">A{effectiveStats?.atk} D{effectiveStats?.def} S{effectiveStats?.spd} H{slot.currentHp}</span>
                        </button>
                      ) : (
                        <button type="button" onClick={() => handleBoardSquareClick(index)} className="flex h-full w-full items-center justify-center text-[0.55rem] text-slate-700">
                          {index + 1}
                        </button>
                      )}
                      {isSelectedSquare && selectedPieceActionPanel}
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="setup">
            <Accordion type="multiple" defaultValue={[]} className="space-y-3">
              <AccordionItem value="players" className="rounded-lg border border-white/10 bg-black/20 px-3">
                <AccordionTrigger className="py-3 text-sm text-white hover:no-underline">Players</AccordionTrigger>
                <AccordionContent>
                  <div className="grid gap-2">
                    {(Object.keys(displayPlayers) as PlayerId[]).map((playerId) => {
                      const display = displayPlayers[playerId];
                      return (
                        <div key={playerId} className="flex items-center gap-2 rounded-md bg-white/[0.05] p-2">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-slate-900">
                            {display.avatarUrl ? <img src={display.avatarUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-xs text-slate-300">{display.short}</span>}
                          </div>
                          <div className="h-8 min-w-0 flex-1 truncate rounded-md border border-white/10 bg-slate-950 px-2 py-1.5 text-xs text-white">
                            {display.profile?.twitchUsername || display.label}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="quick-start" className="rounded-lg border border-white/10 bg-black/20 px-3">
                <AccordionTrigger className="py-3 text-sm text-white hover:no-underline">Match Start</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3">
                    <div className="rounded-md bg-white/[0.05] p-3 text-sm text-slate-300">
                      <div className="font-semibold text-white">Current deck</div>
                      <div className="mt-1 text-slate-400">
                        {currentDeckReady ? `${deck.length} cards are ready to deploy.` : 'No deck available yet.'}
                      </div>
                      {deckCards.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {deckCards.slice(0, 12).map((card) => (
                            <button
                              key={card.id}
                              type="button"
                              className="rounded-md bg-cyan-300/10 px-2 py-1 text-xs text-cyan-100"
                              onClick={() => setSelectedCardId(card.id)}
                            >
                              {card.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button type="button" size="sm" className="w-full" onClick={resetTable}>
                      Start Game
                    </Button>
                    <Button type="button" size="sm" variant="secondary" className="w-full" onClick={loadMockGame}>
                      Start Mock Game
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </TabsContent>

          <TabsContent value="log">
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <ScrollArea className="h-72 pr-3">
                <div className="space-y-2 text-xs text-slate-300">
                  {matchLog.map((entry, index) => (
                    <div key={`${entry}-${index}`} className="rounded-md bg-white/[0.05] p-2">
                      {entry}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>
      </div>
        </QuackverseArtContext.Provider>
      </QuackverseDeckRecordContext.Provider>
    );
  }

  return (
    <QuackverseDeckRecordContext.Provider value={deckRecord}>
    <QuackverseArtContext.Provider value={artManifest}>
    <div className={cn('space-y-5', isCommandLayout && 'space-y-3')}>
      {cardInspector}
      <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-slate-950/70 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className={cn('font-headline text-2xl text-white', isCommandLayout && 'text-xl')}>Quackverse Space-Force</h2>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-300">
            <span className="rounded-md bg-white/[0.06] px-2 py-1">Current deck</span>
            <span className="rounded-md bg-white/[0.06] px-2 py-1">7x7 tactical board</span>
            <span className="rounded-md bg-white/[0.06] px-2 py-1">6 VP wins</span>
            <span className="rounded-md bg-white/[0.06] px-2 py-1">Turn {turnNumber}: {displayPlayers[activePlayer].label}</span>
            {winner && <span className="rounded-md bg-amber-300/20 px-2 py-1 text-amber-100">{displayPlayers[winner].label} wins</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isCommandLayout && (
            <>
              <a
                href={quackverseUrl('/quackverse-overlay')}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center justify-center rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
              >
                Open Overlay
              </a>
              <a
                href={quackverseUrl('/quackverse-command')}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center justify-center rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
              >
                Pop Out Controls
              </a>
            </>
          )}
          {(Object.keys(displayPlayers) as PlayerId[]).map((playerId) => (
            <Button
              key={playerId}
              type="button"
              variant={activePlayer === playerId ? 'default' : 'secondary'}
              disabled
            >
              <Hand className="mr-2 h-4 w-4" />
              {displayPlayers[playerId].label}
            </Button>
          ))}
        </div>
      </div>

      <div className={cn('grid gap-3 rounded-lg border border-white/10 bg-black/20 p-4 md:grid-cols-2', isCommandLayout && 'p-3')}>
        {(Object.keys(displayPlayers) as PlayerId[]).map((playerId) => {
          const display = displayPlayers[playerId];
          return (
            <div key={playerId} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-slate-900">
                {display.avatarUrl ? (
                  <img src={display.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-sm font-semibold text-slate-300">{display.short}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold uppercase text-slate-400">{display.short} identity</div>
                <div className="mt-1 truncate rounded-md border border-white/10 bg-slate-950 px-2 py-2 text-sm text-white">
                  {display.profile?.twitchUsername || display.label}
                </div>
              </div>
              <div className="hidden text-right text-xs text-slate-400 sm:block">
                <div>{display.profile ? `${display.profile.tags || 0} tags` : 'Guest'}</div>
                <div>{display.profile ? `${display.profile.tagged || 0} tagged` : 'No login'}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className={cn(
          'grid gap-5 xl:grid-cols-[minmax(280px,360px)_minmax(420px,1fr)_minmax(280px,360px)]',
          isCommandLayout && 'gap-3 xl:grid-cols-[minmax(420px,1fr)_minmax(260px,320px)]',
        )}
      >
        <section className={cn('space-y-3 rounded-lg border border-white/10 bg-black/20 p-4', isCommandLayout && 'hidden')}>
          <div className="flex items-center justify-between">
            <h3 className="font-headline text-lg text-white">Card Library</h3>
            <Badge variant="outline" className="rounded-md border-cyan-300/50 text-cyan-100">
              {cards.length} cards
            </Badge>
          </div>

          <Tabs value={libraryMode} onValueChange={(value) => setLibraryMode(value as typeof libraryMode)}>
            <TabsList className="grid w-full grid-cols-3 bg-secondary/50">
              <TabsTrigger value="ducks">Ducks</TabsTrigger>
              <TabsTrigger value="equipment">Gear</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap gap-2">
            {['All', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'].map((item) => (
              <Button
                key={item}
                type="button"
                size="sm"
                variant={rarity === item ? 'default' : 'secondary'}
                className="h-8"
                onClick={() => setRarity(item)}
              >
                {item}
              </Button>
            ))}
          </div>

          <input
            type="search"
            value={cardSearch}
            onChange={(event) => setCardSearch(event.target.value)}
            placeholder="Search cards, roles, abilities..."
            className="h-9 w-full rounded-md border border-white/10 bg-slate-950 px-3 text-sm text-white placeholder:text-slate-500"
          />

          <ScrollArea className="h-[33rem] pr-3">
            <div className="grid gap-2">
              {cards.map((card) => (
                <div key={card.id} className="space-y-2">
                  <CardFace
                    card={card}
                    compact
                    selected={selectedCardId === card.id}
                    onClick={() => setSelectedCardId(card.id)}
                  />
                  {card.type === 'Duck' && (
                    <Button type="button" size="sm" className="w-full" onClick={() => addToDeck(card.id)}>
                      <BadgePlus className="mr-2 h-4 w-4" />
                      Add to Deck
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </section>

        <section className={cn('space-y-4', isCommandLayout && 'space-y-3')}>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-lg border border-white/10 bg-black/20 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-headline text-lg text-white">Current Deck</h3>
                  <p className="text-sm text-slate-400">
                    {currentDeckReady ? `${deck.length} cards ready for match start.` : 'Build a deck in Collection first.'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={resetTable} disabled={isActionPending}>
                    Start Game
                  </Button>
                  <Button type="button" variant="secondary" onClick={loadMockGame} disabled={isActionPending}>
                    Start Mock Game
                  </Button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-300">
                <div className="rounded-md bg-white/[0.05] p-2">Cards {deck.length}/20</div>
                <div className="rounded-md bg-white/[0.05] p-2">Ducks {deckDuckCount}/10+</div>
                <div className="rounded-md bg-white/[0.05] p-2">Gear {deckEquipmentCount}/8 max</div>
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-4">
              <div className="text-sm font-semibold text-white">Match Summary</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-300">
                <div className="rounded-md bg-white/[0.05] p-2">P1: {score.playerOne}/6 VP</div>
                <div className="rounded-md bg-white/[0.05] p-2">P2: {score.playerTwo}/6 VP</div>
                <div className="rounded-md bg-white/[0.05] p-2">P1 KOs: {koCount.playerOne}</div>
                <div className="rounded-md bg-white/[0.05] p-2">P2 KOs: {koCount.playerTwo}</div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="font-headline text-lg text-white">Turn Status</h3>
                <p className="text-sm text-slate-400">
                  {selectedPiece
                    ? `${displayPlayers[selectedPiece.owner].short} selected ${selectedPiece.card.name} (${selectedPiece.currentHp}/${selectedPiece.maxHp} HP, ${selectedPiece.specialCurrent}/${getSpecialMax(selectedPiece)} SPC, ${getMovementBudget(getEffectiveStats(selectedPiece).spd)} move points)`
                    : 'Select a duck on the board to move or attack.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className={cn('rounded-md border px-3 py-2 text-sm font-semibold', displayPlayers[activePlayer].accent)}>
                  <Hand className="mr-2 inline h-4 w-4" />
                  {displayPlayers[activePlayer].label}'s turn
                </div>
              </div>
            </div>
            <div className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-3">
              <div className="rounded-md bg-white/[0.05] p-2">P1: {score.playerOne}/6 VP · KOs {koCount.playerOne}</div>
              <div className="rounded-md bg-white/[0.05] p-2">P2: {score.playerTwo}/6 VP · KOs {koCount.playerTwo}</div>
              <div className="rounded-md bg-white/[0.05] p-2">Deck: {currentDeckReady ? 'ready' : 'empty'}</div>
            </div>
          </div>

          <div className={cn('rounded-lg border border-white/10 bg-slate-950/70 p-4', isCommandLayout && 'p-3')}>
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-headline text-lg text-white">Tactical Card Board</h3>
                  <p className="text-sm text-slate-400">
                    Select a duck from the hand, then place it on an entry row or move it by clicking a highlighted square.
                  </p>
                </div>
              <Button type="button" variant="secondary" onClick={resetTable}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Clear Board
              </Button>
            </div>

            <div className={cn('mx-auto max-w-[60rem] rounded-lg border border-white/5 bg-transparent p-3', isCommandLayout && 'max-w-none p-2')}>
              <div className={cn('grid grid-cols-7 gap-2', isCommandLayout && 'gap-1.5')}>
                {grid.map((slot, index) => {
                  const row = Math.floor(index / gridSize);
                  const isPlayerOneBackRow = row === players.playerOne.backRow;
                  const isPlayerTwoBackRow = row === players.playerTwo.backRow;
                  const backRowLabel = isPlayerOneBackRow ? 'P1 entry' : isPlayerTwoBackRow ? 'P2 entry' : '';
                  const isSelectedSquare = selectedBoardIndex === index;
                  const isMoveTarget = isLegalMoveTarget(index);
                  const isAttackTarget = isLegalAttackTarget(index);
                  const effectiveStats = slot ? getEffectiveStats(slot) : null;

                  return (
                    <div
                      key={index}
                      className={cn(
                        'relative aspect-square rounded-lg border text-center transition',
                        'bg-transparent',
                        slot?.owner === activePlayer && !isSelectedSquare && 'shadow-[0_0_0_1px_rgba(255,255,255,0.35),0_0_18px_rgba(34,211,238,0.18)]',
                        isSelectedSquare && 'ring-2 ring-yellow-300',
                        isMoveTarget && 'border-emerald-300 bg-emerald-400/10 ring-1 ring-emerald-300/50',
                        isAttackTarget && 'border-red-300 bg-red-400/10 ring-1 ring-red-300/50',
                        isAbilityTarget(index) && 'border-sky-300 bg-sky-400/10 ring-1 ring-sky-300/50',
                        isFormationTarget(index) && 'border-yellow-300 bg-yellow-400/10 ring-1 ring-yellow-300/50',
                        isPlayerOneBackRow && 'border-cyan-300/25 shadow-[inset_0_0_18px_rgba(34,211,238,0.08)]',
                        isPlayerTwoBackRow && 'border-rose-300/25 shadow-[inset_0_0_18px_rgba(251,113,133,0.08)]',
                        !isPlayerOneBackRow && !isPlayerTwoBackRow && 'border-white/5',
                        slot?.owner && displayPlayers[slot.owner].accent,
                      )}
                    >
                      {slot ? (
                        <button
                          type="button"
                          className="flex h-full w-full flex-col overflow-hidden rounded-lg text-left"
                          onClick={() => handleBoardSquareClick(index)}
                        >
                          <div className="relative flex-1 overflow-hidden">
                            <img
                              src={artManifest[String(slot.card.id)]?.static?.url || slot.card.artUrl || ''}
                              alt={slot.card.name}
                              className="h-full w-full object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                            <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-1 p-2 text-[0.6rem]">
                              <span className="rounded bg-black/45 px-1.5 py-0.5 font-semibold text-white">{displayPlayers[slot.owner].short}</span>
                              <button
                                type="button"
                                className="rounded bg-black/45 px-1.5 py-0.5 text-slate-200 hover:bg-black/70"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  clearSquare(index);
                                }}
                                aria-label={`Clear square ${index + 1}`}
                              >
                                Clear
                              </button>
                            </div>
                            <div className="absolute inset-x-0 bottom-0 p-2 text-left text-white">
                              {isSelectedSquare ? (
                                <div className="space-y-1 text-[0.58rem] text-slate-200">
                                  <div className="flex flex-wrap gap-1">
                                    <span className="rounded bg-black/45 px-1.5 py-0.5">ATK {effectiveStats?.atk}</span>
                                    <span className="rounded bg-black/45 px-1.5 py-0.5">DEF {effectiveStats?.def}</span>
                                    <span className="rounded bg-black/45 px-1.5 py-0.5">SPD {effectiveStats?.spd}</span>
                                    <span className="rounded bg-black/45 px-1.5 py-0.5">HP {slot.currentHp}</span>
                                  </div>
                                  <div className="line-clamp-2 text-xs font-semibold">{slot.card.name}</div>
                                </div>
                              ) : (
                                <>
                                  <div className="line-clamp-2 text-[0.72rem] font-semibold">{slot.card.name}</div>
                                  <div className="text-[0.58rem] text-slate-200">
                                    {getQuackverseFamilyGroup(slot.card.id)?.label || slot.card.role || slot.card.type}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="h-1.5 bg-black/50">
                            <div className="h-full rounded-full bg-emerald-300" style={{ width: `${Math.max(5, (slot.currentHp / slot.maxHp) * 100)}%` }} />
                          </div>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleBoardSquareClick(index)}
                          className={cn(
                            'flex h-full w-full flex-col items-center justify-center rounded-lg p-2',
                            'text-slate-700 hover:bg-white/[0.04] hover:text-cyan-100',
                            selectedGridCard && 'cursor-pointer',
                            !selectedGridCard && 'cursor-default',
                          )}
                          aria-label={`Place selected card on board square ${index + 1}`}
                        >
                          <span className="text-[0.65rem]">{index + 1}</span>
                          {backRowLabel && <span className="mt-1 text-[0.58rem] uppercase">{backRowLabel}</span>}
                        </button>
                      )}
                      {isSelectedSquare && selectedPieceActionPanel}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.keys(displayPlayers) as PlayerId[]).map((playerId) => (
              <div key={playerId} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 p-3">
                <span className="font-headline text-white">{displayPlayers[playerId].label} Points</span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    onClick={() => setScore((current) => ({ ...current, [playerId]: Math.max(0, current[playerId] - 1) }))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-8 text-center text-lg font-bold text-white">{score[playerId]}</span>
                  <Button
                    type="button"
                    size="icon"
                    onClick={() => setScore((current) => ({ ...current, [playerId]: current[playerId] + 1 }))}
                  >
                    <BadgePlus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={cn('space-y-4', isCommandLayout && 'space-y-3')}>
          <div className="rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="mb-3 flex items-center gap-2">
              <BadgePlus className="h-4 w-4 text-cyan-200" />
              <h3 className="font-headline text-lg text-white">Match Start</h3>
            </div>
            <div className="space-y-3">
              <div className="rounded-md bg-white/[0.05] p-3 text-sm text-slate-300">
                <div className="font-semibold text-white">Current deck</div>
                <div className="mt-1 text-slate-400">
                  {currentDeckReady ? `${deck.length} cards are ready to deploy.` : 'No deck available yet.'}
                </div>
                {deckCards.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {deckCards.slice(0, 12).map((card) => (
                      <button
                        key={card.id}
                        type="button"
                        className="rounded-md bg-cyan-300/10 px-2 py-1 text-xs text-cyan-100"
                        onClick={() => setSelectedCardId(card.id)}
                      >
                        {card.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button type="button" className="w-full" onClick={resetTable}>
                Start Game
              </Button>
              <Button type="button" variant="secondary" className="w-full" onClick={loadMockGame}>
                Start Mock Game
              </Button>
            </div>
          </div>

          <div className={cn('rounded-lg border border-white/10 bg-black/20 p-4', isCommandLayout && 'hidden')}>
                <h3 className="font-headline text-lg text-white">Collection Lab</h3>
                <div className="mt-3">
                  <Button type="button" className="w-full" disabled={pendingPacks <= 0 || isOpeningPack} onClick={openPack}>
                    {isOpeningPack ? 'Opening...' : `Open Pack (${pendingPacks}/${dailyPackLimit} left today)`}
                  </Button>
                </div>
                {packError && <div className="mt-2 rounded-md border border-amber-300/30 bg-amber-300/10 p-2 text-xs text-amber-100">{packError}</div>}
            <div className="mt-3 text-sm text-slate-300">
              Owned: {collection.length} cards · Unique: {collectionSummary.length}/{quackverseCards.length} · Deck: {deck.length}/20
            </div>
            <div className="mt-2 rounded-md bg-white/[0.05] p-2 text-xs text-slate-400">
              Pack slots: utility common/uncommon, utility up to epic, duck common/uncommon, duck uncommon/rare, wild.
            </div>
            {packAuditPanel}
            {lastPack.length > 0 && (
              <div className="mt-3 grid grid-cols-5 gap-2">
                {lastPack.map((card) => (
                  <button
                    key={`${card.id}-${card.name}`}
                    type="button"
                    className="rounded-md border border-white/10 bg-white/[0.04] p-2 text-left text-[0.65rem] text-slate-200 hover:border-cyan-300/60"
                    onClick={() => setSelectedCardId(card.id)}
                  >
                    <div className="font-semibold text-white">{card.name}</div>
                    <div>{card.rarity}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={cn('rounded-lg border border-white/10 bg-black/20 p-4', isCommandLayout && 'hidden')}>
            <h3 className="font-headline text-lg text-white">Deck Builder</h3>
            <p className="mt-1 text-sm text-slate-400">Prototype mirrors the StreamWeaver flow: open packs, collect cards, then add owned copies to a simple deck.</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-300">
              <div className="rounded-md bg-white/[0.05] p-2">Cards {deck.length}/20</div>
              <div className="rounded-md bg-white/[0.05] p-2">Ducks {deckDuckCount}/10+</div>
              <div className="rounded-md bg-white/[0.05] p-2">Gear {deckEquipmentCount}/8 max</div>
            </div>
            <div className={cn('mt-2 rounded-md p-2 text-xs', isDeckPlayable ? 'bg-emerald-400/10 text-emerald-100' : 'bg-amber-400/10 text-amber-100')}>
              {isDeckPlayable ? 'Deck is playable for testing.' : 'Deck needs 20 cards, at least 10 ducks, and no more than 8 equipment cards.'}
            </div>
            <ScrollArea className="mt-3 h-44 pr-3">
              <div className="space-y-2">
                {collectionSummary.length === 0 ? (
                  <div className="rounded-md bg-white/[0.05] p-2 text-sm text-slate-400">Open a pack to start collecting.</div>
                ) : (
                  collectionSummary.map(({ card, quantity }) => (
                    <div key={card.id} className="flex items-center justify-between gap-2 rounded-md bg-white/[0.05] p-2 text-sm">
                      <button type="button" className="min-w-0 flex-1 text-left text-slate-200" onClick={() => setSelectedCardId(card.id)}>
                        <span className="font-semibold text-white">{card.name}</span>
                        <span className="ml-2 text-slate-400">x{quantity}</span>
                      </button>
                      <Button type="button" size="sm" variant="secondary" onClick={() => addToDeck(card.id)}>
                        Add
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
            {deck.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {deck.map((cardId, index) => {
                  const card = quackverseCards.find((item) => item.id === cardId);
                  return (
                    <button
                      key={`${cardId}-${index}`}
                      type="button"
                      className="rounded-md bg-cyan-300/10 px-2 py-1 text-xs text-cyan-100"
                      onClick={() => removeFromDeck(cardId)}
                    >
                      {card?.name || cardId}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className={cn('rounded-lg border border-white/10 bg-black/20 p-4', isCommandLayout && 'hidden')}>
            <h3 className="mb-3 font-headline text-lg text-white">Selected Card</h3>
            <CardFace card={selectedCard} selected />
            {selectedCard.flavor && (
              <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.04] p-3 text-sm italic text-slate-300">
                {selectedCard.flavor}
              </p>
            )}
          </div>

          <div className={cn('rounded-lg border border-white/10 bg-black/20 p-4', isCommandLayout && 'hidden')}>
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-cyan-200" />
              <h3 className="font-headline text-lg text-white">Rules</h3>
            </div>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              <div className="rounded-md bg-white/[0.05] p-2">Setup: each player brings 5 ducks. Equipment can be added after the base match loop works.</div>
              <div className="rounded-md bg-white/[0.05] p-2">Turn: move, attack, use an ability, or pass. One main action per turn. Abilities spend Special and fail if the duck does not have enough charge.</div>
              <div className="rounded-md bg-white/[0.05] p-2">Attack damage = ATK - enemy DEF, minimum 1.</div>
              <div className="rounded-md bg-white/[0.05] p-2">Movement uses SPD: low speed gets 2 points, average 3, fast 4, boosted 5. Forward costs 1, lateral 2, backward 3.</div>
              <div className="rounded-md bg-white/[0.05] p-2">Special uses SPC: ducks gain charge at the start of their turn, modified by SPC and fatigue. Strong utility cards spend more charge.</div>
              <div className="rounded-md bg-white/[0.05] p-2">Win at 6 VP. KOs give +1 VP. Formations give +1 VP for your first 3 scored formations; later formations only grant perks.</div>
              <div className="rounded-md bg-white/[0.05] p-2">Formation perk: involved ducks gain +1 HP and +1 Fatigue, reducing ATK and SPD by the fatigue value. Ducks recover 1 Fatigue at the start of a turn if they are no longer in formation.</div>
              <div className="rounded-md bg-white/[0.05] p-2">NPC mode can pilot Player 2 with simple attack-then-advance behavior.</div>
              <div className="rounded-md bg-white/[0.05] p-2">Session scoring: +3 match win, +2 Legendary KO, +1 ability streak.</div>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/20 p-4">
            <h3 className="font-headline text-lg text-white">Match Log</h3>
            <ScrollArea className="mt-3 h-48 pr-3">
              <div className="space-y-2 text-sm text-slate-300">
                {matchLog.map((entry, index) => (
                  <div key={`${entry}-${index}`} className="rounded-md bg-white/[0.05] p-2">
                    {entry}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          <div className={cn('rounded-lg border border-white/10 bg-black/20 p-4', isCommandLayout && 'hidden')}>
            <h3 className="font-headline text-lg text-white">Learn By Playing</h3>
            <div className="mt-3 rounded-md bg-white/[0.05] p-3">
              <div className="text-sm font-semibold text-white">{demoSteps[demoStep].title}</div>
              <p className="mt-1 text-sm text-slate-300">{demoSteps[demoStep].body}</p>
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => setDemoStep((current) => Math.max(0, current - 1))}
              >
                Back
              </Button>
              <Button
                type="button"
                className="flex-1"
                onClick={() => setDemoStep((current) => Math.min(demoSteps.length - 1, current + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
    </QuackverseArtContext.Provider>
    </QuackverseDeckRecordContext.Provider>
  );
}
