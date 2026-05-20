export type QuackversePlayerId = 'playerOne' | 'playerTwo';

export type QuackverseSavedPiece = {
  instanceId?: string;
  owner: QuackversePlayerId;
  cardId: number;
  currentHp: number;
  maxHp: number;
  equipmentIds?: number[];
  fatigued?: boolean;
  fatigue?: number;
  statModifiers?: {
    atk?: number;
    def?: number;
    spd?: number;
    spc?: number;
  };
};

export type QuackverseCardInstance = {
  instanceId: string;
  cardId: number;
};

export type QuackverseBattlePileState = {
  drawPile: QuackverseCardInstance[];
  hand: QuackverseCardInstance[];
  discardPile: QuackverseCardInstance[];
};

export type QuackverseTurnActions = {
  deployedOrMoved: boolean;
  attacked: string[];
  usedAbility: string[];
  equipped: string[];
};

export type QuackverseSavedState = {
  gridSize: number;
  squadSize: number;
  activePlayer: QuackversePlayerId;
  turnNumber: number;
  squads: Record<QuackversePlayerId, number[]>;
  claimedPlayers: Record<QuackversePlayerId, string>;
  grid: Array<QuackverseSavedPiece | null>;
  battlePiles: Record<QuackversePlayerId, QuackverseBattlePileState>;
  score: Record<QuackversePlayerId, number>;
  koCount: Record<QuackversePlayerId, number>;
  formationVp: Record<QuackversePlayerId, number>;
  scoredFormationKeys: string[];
  matchResultRecordedForWinner: QuackversePlayerId | null;
  turnActions: Record<QuackversePlayerId, QuackverseTurnActions>;
  npcPlayers: Record<QuackversePlayerId, boolean>;
  winner: QuackversePlayerId | null;
  matchLog: string[];
  collections: Record<string, QuackverseCollectionState>;
  updatedAt: string;
};

export type QuackverseCollectionState = {
  cards: number[];
  deck: number[];
  deckWins: number;
  deckLosses: number;
  openedAtDay: string;
  openedToday: number;
  lastPack: number[];
};

export const quackverseDailyPackLimit = 3;
export const quackverseGridSize = 7;
export const quackverseSquadSize = 5;

export const defaultQuackverseState = (): QuackverseSavedState => ({
  gridSize: quackverseGridSize,
  squadSize: quackverseSquadSize,
  activePlayer: 'playerOne',
  turnNumber: 1,
  squads: { playerOne: [], playerTwo: [] },
  claimedPlayers: { playerOne: '', playerTwo: '' },
  grid: Array.from({ length: quackverseGridSize * quackverseGridSize }, () => null),
  battlePiles: {
    playerOne: { drawPile: [], hand: [], discardPile: [] },
    playerTwo: { drawPile: [], hand: [], discardPile: [] },
  },
  score: { playerOne: 0, playerTwo: 0 },
  koCount: { playerOne: 0, playerTwo: 0 },
  formationVp: { playerOne: 0, playerTwo: 0 },
  scoredFormationKeys: [],
  matchResultRecordedForWinner: null,
  turnActions: {
    playerOne: { deployedOrMoved: false, attacked: [], usedAbility: [], equipped: [] },
    playerTwo: { deployedOrMoved: false, attacked: [], usedAbility: [], equipped: [] },
  },
  npcPlayers: { playerOne: false, playerTwo: false },
  winner: null,
  matchLog: ['No match loaded yet.'],
  collections: {},
  updatedAt: new Date().toISOString(),
});

export const defaultQuackverseCollection = (): QuackverseCollectionState => ({
  cards: [],
  deck: [],
  deckWins: 0,
  deckLosses: 0,
  openedAtDay: '',
  openedToday: 0,
  lastPack: [],
});

export function quackverseDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function normalizeQuackverseCollection(value: Partial<QuackverseCollectionState> | null | undefined): QuackverseCollectionState {
  const fallback = defaultQuackverseCollection();
  const today = quackverseDayKey();
  const openedAtDay = typeof value?.openedAtDay === 'string' ? value.openedAtDay : '';
  return {
    cards: Array.isArray(value?.cards) ? value.cards.map(Number).filter((cardId) => Number.isFinite(cardId)) : fallback.cards,
    deck: Array.isArray(value?.deck) ? value.deck.map(Number).filter((cardId) => Number.isFinite(cardId)) : fallback.deck,
    deckWins: Number(value?.deckWins || 0),
    deckLosses: Number(value?.deckLosses || 0),
    openedAtDay,
    openedToday: openedAtDay === today ? Number(value?.openedToday || 0) : 0,
    lastPack: Array.isArray(value?.lastPack) ? value.lastPack.map(Number).filter((cardId) => Number.isFinite(cardId)) : fallback.lastPack,
  };
}

export function normalizeQuackverseState(value: Partial<QuackverseSavedState> | null | undefined): QuackverseSavedState {
  const fallback = defaultQuackverseState();
  const grid =
    Array.isArray(value?.grid) && value.grid.length === quackverseGridSize * quackverseGridSize
      ? value.grid
      : fallback.grid;

  return {
    ...fallback,
    ...value,
    gridSize: quackverseGridSize,
    squadSize: quackverseSquadSize,
    squads: {
      playerOne: Array.isArray(value?.squads?.playerOne) ? value.squads.playerOne : [],
      playerTwo: Array.isArray(value?.squads?.playerTwo) ? value.squads.playerTwo : [],
    },
    claimedPlayers: {
      playerOne: typeof value?.claimedPlayers?.playerOne === 'string' ? value.claimedPlayers.playerOne : '',
      playerTwo: typeof value?.claimedPlayers?.playerTwo === 'string' ? value.claimedPlayers.playerTwo : '',
    },
    grid,
    battlePiles: {
      playerOne: {
        drawPile: Array.isArray(value?.battlePiles?.playerOne?.drawPile) ? value.battlePiles.playerOne.drawPile : [],
        hand: Array.isArray(value?.battlePiles?.playerOne?.hand) ? value.battlePiles.playerOne.hand : [],
        discardPile: Array.isArray(value?.battlePiles?.playerOne?.discardPile) ? value.battlePiles.playerOne.discardPile : [],
      },
      playerTwo: {
        drawPile: Array.isArray(value?.battlePiles?.playerTwo?.drawPile) ? value.battlePiles.playerTwo.drawPile : [],
        hand: Array.isArray(value?.battlePiles?.playerTwo?.hand) ? value.battlePiles.playerTwo.hand : [],
        discardPile: Array.isArray(value?.battlePiles?.playerTwo?.discardPile) ? value.battlePiles.playerTwo.discardPile : [],
      },
    },
    score: {
      playerOne: Number(value?.score?.playerOne || 0),
      playerTwo: Number(value?.score?.playerTwo || 0),
    },
    koCount: {
      playerOne: Number(value?.koCount?.playerOne || 0),
      playerTwo: Number(value?.koCount?.playerTwo || 0),
    },
    formationVp: {
      playerOne: Number(value?.formationVp?.playerOne || 0),
      playerTwo: Number(value?.formationVp?.playerTwo || 0),
    },
    scoredFormationKeys: Array.isArray(value?.scoredFormationKeys) ? value.scoredFormationKeys : [],
    matchResultRecordedForWinner:
      value?.matchResultRecordedForWinner === 'playerOne' || value?.matchResultRecordedForWinner === 'playerTwo'
        ? value.matchResultRecordedForWinner
        : null,
    turnActions: {
      playerOne: {
        deployedOrMoved: Boolean(value?.turnActions?.playerOne?.deployedOrMoved),
        attacked: Array.isArray(value?.turnActions?.playerOne?.attacked) ? value.turnActions.playerOne.attacked : [],
        usedAbility: Array.isArray(value?.turnActions?.playerOne?.usedAbility) ? value.turnActions.playerOne.usedAbility : [],
        equipped: Array.isArray(value?.turnActions?.playerOne?.equipped) ? value.turnActions.playerOne.equipped : [],
      },
      playerTwo: {
        deployedOrMoved: Boolean(value?.turnActions?.playerTwo?.deployedOrMoved),
        attacked: Array.isArray(value?.turnActions?.playerTwo?.attacked) ? value.turnActions.playerTwo.attacked : [],
        usedAbility: Array.isArray(value?.turnActions?.playerTwo?.usedAbility) ? value.turnActions.playerTwo.usedAbility : [],
        equipped: Array.isArray(value?.turnActions?.playerTwo?.equipped) ? value.turnActions.playerTwo.equipped : [],
      },
    },
    npcPlayers: {
      playerOne: Boolean(value?.npcPlayers?.playerOne),
      playerTwo: Boolean(value?.npcPlayers?.playerTwo),
    },
    collections: Object.fromEntries(
      Object.entries(value?.collections || {}).map(([userId, collection]) => [
        userId,
        normalizeQuackverseCollection(collection as Partial<QuackverseCollectionState>),
      ]),
    ),
    activePlayer: value?.activePlayer === 'playerTwo' ? 'playerTwo' : 'playerOne',
    winner: value?.winner === 'playerOne' || value?.winner === 'playerTwo' ? value.winner : null,
    turnNumber: Number(value?.turnNumber || 1),
    matchLog: Array.isArray(value?.matchLog) ? value.matchLog.slice(0, 20) : fallback.matchLog,
    updatedAt: value?.updatedAt || fallback.updatedAt,
  };
}
