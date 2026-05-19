import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserFromRequest, isBotRequest } from '@/lib/auth';
import { isAdminUsername } from '@/lib/admin';
import {
  ensureClaimedSeat,
  getClaimedSeat,
  normalizeQuackverseUserId,
  quackverseUserIdFromSession,
  redactQuackverseStateForViewer,
  viewerPayload,
} from '@/lib/quackverse-access';
import { quackverseCards, quackverseDucks, type QuackverseCard } from '@/lib/quackverse-data';
import { quackverseRoomKeyFromParams, quackverseScopeFromParams } from '@/lib/quackverse-rooms';
import { updateAppState } from '@/lib/volume-store';
import {
  normalizeQuackverseState,
  quackverseGridSize,
  quackverseSquadSize,
  type QuackverseBattlePileState,
  type QuackverseCardInstance,
  type QuackversePlayerId,
  type QuackverseSavedPiece,
  type QuackverseSavedState,
} from '@/lib/quackverse-state';

type PlayerId = QuackversePlayerId;

const gridSize = quackverseGridSize;
const victoryTarget = 6;
const formationVpLimit = 3;
const starterBattleDecks: Record<PlayerId, number[]> = {
  playerOne: [1, 4, 24, 32, 52, 81, 84, 85, 86, 88],
  playerTwo: [9, 19, 37, 43, 73, 83, 87, 90, 95, 96],
};
const quickStartSquads: Record<PlayerId, number[]> = {
  playerOne: [1, 4, 24, 32, 52],
  playerTwo: [9, 19, 37, 43, 73],
};

const opponentOf = (playerId: PlayerId): PlayerId => (playerId === 'playerOne' ? 'playerTwo' : 'playerOne');
const playerIds: PlayerId[] = ['playerOne', 'playerTwo'];
const playerLabels: Record<PlayerId, { short: string; backRow: number }> = {
  playerOne: { short: 'P1', backRow: gridSize - 1 },
  playerTwo: { short: 'P2', backRow: 0 },
};
const isPlayerId = (value: unknown): value is PlayerId => value === 'playerOne' || value === 'playerTwo';
const rowOf = (index: number) => Math.floor(index / gridSize);
const colOf = (index: number) => index % gridSize;
const isAdjacent = (from: number, to: number) => Math.abs(rowOf(from) - rowOf(to)) + Math.abs(colOf(from) - colOf(to)) === 1;
const pieceKey = (piece: QuackverseSavedPiece) => piece.instanceId || `${piece.owner}-${piece.cardId}`;
const makeInstanceId = (owner: PlayerId, cardId: number) =>
  `${owner}-${cardId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const makeCardInstance = (owner: PlayerId, cardId: number): QuackverseCardInstance => ({
  instanceId: makeInstanceId(owner, cardId),
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
const buildBattlePile = (owner: PlayerId, cardIds: number[], openingHandSize = 5): QuackverseBattlePileState => {
  const drawPile = shuffleCards(cardIds.map((cardId) => makeCardInstance(owner, cardId)));
  return { drawPile: drawPile.slice(openingHandSize), hand: drawPile.slice(0, openingHandSize), discardPile: [] };
};
const makePiece = (owner: PlayerId, card: QuackverseCard, instanceId = makeInstanceId(owner, card.id)): QuackverseSavedPiece => ({
  instanceId,
  owner,
  cardId: card.id,
  currentHp: card.hp ?? 1,
  maxHp: card.hp ?? 1,
  equipmentIds: [],
  fatigue: 0,
  statModifiers: { atk: 0, def: 0, spd: 0, spc: 0 },
});
const numberFromText = (text: string, pattern: RegExp) => Number(text.match(pattern)?.[1] || 0);
const cardFor = (piece: QuackverseSavedPiece) => quackverseCards.find((card) => card.id === piece.cardId);
const isRole = (card: QuackverseCard, token: string) => `${card.name} ${card.role || ''}`.toLowerCase().includes(token.toLowerCase());

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

function detectFormations(grid: Array<QuackverseSavedPiece | null>): DetectedFormation[] {
  const formations: DetectedFormation[] = [];
  const addFormation = (owner: PlayerId, name: string, indices: number[]) => {
    const unique = [...new Set(indices)].sort((a, b) => a - b);
    if (unique.every((index) => rowOf(index) === playerLabels[owner].backRow)) return;
    formations.push({ owner, name, indices: unique, key: `${owner}:${name}:${unique.join('-')}` });
  };
  const owned = (index: number, owner: PlayerId) => grid[index]?.owner === owner;
  const roleAt = (index: number, token: string) => {
    const piece = grid[index];
    const card = piece ? cardFor(piece) : undefined;
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

function scoreNewFormations(state: QuackverseSavedState, owner: PlayerId) {
  const fresh = detectFormations(state.grid)
    .filter((formation) => formation.owner === owner && !state.scoredFormationKeys.includes(formation.key))
    .sort((a, b) => b.indices.length - a.indices.length || (formationPriority[b.name] || 0) - (formationPriority[a.name] || 0))[0];
  if (!fresh) return;

  const earnsVp = state.formationVp[owner] < formationVpLimit;
  state.scoredFormationKeys.push(fresh.key);
  if (earnsVp) {
    state.formationVp[owner] += 1;
    state.score[owner] += 1;
  }
  state.grid = state.grid.map((slot, index) =>
    slot && fresh.indices.includes(index)
      ? {
          ...slot,
          fatigue: Number(slot.fatigue || 0) + 1,
          currentHp: Number(slot.currentHp || 0) + 1,
          maxHp: Number(slot.maxHp || 0) + 1,
        }
      : slot,
  );
  if (earnsVp && state.score[owner] >= victoryTarget) state.winner = owner;
  addLog(
    state,
    `${playerLabels[owner].short} formed ${fresh.name}${earnsVp ? ' for +1 VP' : ' with no VP because the formation cap is reached'}. Formation ducks gain +1 HP and +1 Fatigue.`,
  );
}

function discardBoardPiece(state: QuackverseSavedState, piece: QuackverseSavedPiece) {
  state.battlePiles[piece.owner].discardPile.push({ instanceId: pieceKey(piece), cardId: piece.cardId });
  for (const cardId of piece.equipmentIds || []) {
    state.battlePiles[piece.owner].discardPile.push(makeCardInstance(piece.owner, cardId));
  }
}

function getEffectiveStats(piece: QuackverseSavedPiece) {
  const card = cardFor(piece);
  const equipment = (piece.equipmentIds || []).map((id) => quackverseCards.find((item) => item.id === id)).filter(Boolean) as QuackverseCard[];
  const effectText = equipment.map((item) => item.effect || '').join(' ');
  const modifiers = piece.statModifiers || {};
  const fatigue = Number(piece.fatigue || 0);
  return {
    atk: Math.max(1, (card?.atk || 0) + Number(modifiers.atk || 0) + numberFromText(effectText, /\+(\d+)\s*ATK/i) - fatigue),
    def: Math.max(0, (card?.def || 0) + Number(modifiers.def || 0) + numberFromText(effectText, /\+(\d+)\s*DEF/i)),
    spd: Math.max(1, (card?.spd || 0) + Number(modifiers.spd || 0) + numberFromText(effectText, /\+(\d+)\s*SPD/i) - fatigue),
  };
}

function applyDamage(state: QuackverseSavedState, owner: PlayerId, targetIndices: number[], damage: number) {
  if (!targetIndices.length || damage <= 0) return 0;

  let knockedOut = 0;
  for (const targetIndex of targetIndices) {
    const target = state.grid[targetIndex];
    if (!target) continue;

    target.currentHp -= damage;
    if (target.currentHp <= 0) {
      state.grid[targetIndex] = null;
      discardBoardPiece(state, target);
      knockedOut += 1;
    }
  }

  if (knockedOut > 0) {
    state.koCount[owner] += knockedOut;
    state.score[owner] += knockedOut;
    if (state.score[owner] >= victoryTarget) state.winner = owner;
  }

  return knockedOut;
}

function resolveAbility(state: QuackverseSavedState, sourceIndex: number, requestedAbility?: string) {
  const source = state.grid[sourceIndex];
  const sourceCard = source ? cardFor(source) : null;
  if (!source || !sourceCard || source.owner !== state.activePlayer) return;
  const ability = requestedAbility || sourceCard.abilities[0] || '';
  if (!ability || !(sourceCard.abilities as string[]).includes(ability)) return;
  if (state.turnActions[source.owner].usedAbility.includes(pieceKey(source))) return;

  const owner = source.owner;
  const enemyOwner = opponentOf(owner);
  const ownPieces = state.grid
    .map((piece, index) => ({ piece, index }))
    .filter((entry): entry is { piece: QuackverseSavedPiece; index: number } => entry.piece?.owner === owner);
  const enemyPieces = state.grid
    .map((piece, index) => ({ piece, index }))
    .filter((entry): entry is { piece: QuackverseSavedPiece; index: number } => entry.piece?.owner === enemyOwner);
  const adjacentEnemy = enemyPieces.find((entry) => isAdjacent(sourceIndex, entry.index));
  const adjacentAlly = ownPieces.find((entry) => entry.index !== sourceIndex && isAdjacent(sourceIndex, entry.index));
  const friendlyTargets = /all allies/i.test(ability)
    ? ownPieces.map((entry) => entry.index)
    : /to ally/i.test(ability)
      ? [adjacentAlly?.index ?? sourceIndex]
      : [sourceIndex];
  const enemyTargets = /all enemies|enemies/i.test(ability)
    ? enemyPieces.map((entry) => entry.index)
    : adjacentEnemy
      ? [adjacentEnemy.index]
      : [];
  const abilityName = ability.split(':')[0] || 'Ability';
  const finish = (entry: string) => {
    state.turnActions[owner].usedAbility.push(pieceKey(source));
    addLog(state, entry);
  };

  const healAmount = numberFromText(ability, /(?:Heal|Restore|Repair|Mend|Blessing|Sprinkle)\D+(\d+)\s*HP/i);
  if (healAmount > 0) {
    for (const targetIndex of friendlyTargets) {
      const target = state.grid[targetIndex];
      if (target) target.currentHp = Math.min(target.maxHp, target.currentHp + healAmount);
    }
    finish(`${playerLabels[owner].short} used ${abilityName}, healing ${friendlyTargets.length} target${friendlyTargets.length === 1 ? '' : 's'} for ${healAmount} HP.`);
    return;
  }

  const damage =
    numberFromText(ability, /Deal\s+(\d+)\s+damage\s+to\s+all\s+enemies/i) ||
    numberFromText(ability, /Deal\s+(\d+)\s+unavoidable\s+damage/i) ||
    numberFromText(ability, /\+(\d+)\s*damage/i);
  if (damage > 0 && enemyTargets.length > 0) {
    const knockedOut = applyDamage(state, owner, enemyTargets, damage);
    finish(
      `${playerLabels[owner].short} used ${abilityName}, dealing ${damage} damage to ${enemyTargets.length} target${enemyTargets.length === 1 ? '' : 's'}${knockedOut ? ` and KO'ing ${knockedOut}` : ''}.`,
    );
    return;
  }

  const statBuffs = (['atk', 'def', 'spd', 'spc'] as const)
    .map((stat) => ({ stat, amount: numberFromText(ability, new RegExp(`\\+(\\d+)\\s*${stat}`, 'i')) }))
    .filter((entry) => entry.amount > 0);
  if (statBuffs.length > 0) {
    for (const targetIndex of friendlyTargets) {
      const target = state.grid[targetIndex];
      if (!target) continue;
      const nextModifiers = {
        atk: Number(target.statModifiers?.atk || 0),
        def: Number(target.statModifiers?.def || 0),
        spd: Number(target.statModifiers?.spd || 0),
        spc: Number(target.statModifiers?.spc || 0),
      };
      for (const statBuff of statBuffs) {
        nextModifiers[statBuff.stat] += statBuff.amount;
        if (statBuff.stat === 'def') {
          target.currentHp += statBuff.amount;
          target.maxHp += statBuff.amount;
        }
      }
      target.statModifiers = nextModifiers;
    }
    finish(`${playerLabels[owner].short} used ${abilityName}, giving ${statBuffs.map((buff) => `+${buff.amount} ${buff.stat.toUpperCase()}`).join(', ')} to ${friendlyTargets.length} target${friendlyTargets.length === 1 ? '' : 's'}.`);
    return;
  }

  const statDebuff = (['atk', 'def', 'spd', 'spc'] as const)
    .map((stat) => {
      const match = ability.match(new RegExp(`-(\\d+)\\s*${stat}|Reduce enemy ${stat} by\\s*(\\d+)`, 'i'));
      return { stat, amount: Number(match?.[1] || match?.[2] || 0) };
    })
    .find((entry) => entry.amount > 0);
  if (statDebuff && enemyTargets.length > 0) {
    for (const targetIndex of enemyTargets) {
      const target = state.grid[targetIndex];
      if (!target) continue;
      target.statModifiers = {
        atk: Number(target.statModifiers?.atk || 0),
        def: Number(target.statModifiers?.def || 0),
        spd: Number(target.statModifiers?.spd || 0),
        spc: Number(target.statModifiers?.spc || 0),
        [statDebuff.stat]: Number(target.statModifiers?.[statDebuff.stat] || 0) - statDebuff.amount,
      };
    }
    finish(`${playerLabels[owner].short} used ${abilityName}, giving -${statDebuff.amount} ${statDebuff.stat.toUpperCase()} to ${enemyTargets.length} enemy${enemyTargets.length === 1 ? '' : 'ies'}.`);
    return;
  }

  if (/swap\s+SPD\s+with\s+enemy/i.test(ability) && adjacentEnemy?.piece) {
    const ownCurrentSpd = getEffectiveStats(source).spd;
    const enemyCurrentSpd = getEffectiveStats(adjacentEnemy.piece).spd;
    source.statModifiers = {
      atk: Number(source.statModifiers?.atk || 0),
      def: Number(source.statModifiers?.def || 0),
      spd: Number(source.statModifiers?.spd || 0) + enemyCurrentSpd - ownCurrentSpd,
      spc: Number(source.statModifiers?.spc || 0),
    };
    adjacentEnemy.piece.statModifiers = {
      atk: Number(adjacentEnemy.piece.statModifiers?.atk || 0),
      def: Number(adjacentEnemy.piece.statModifiers?.def || 0),
      spd: Number(adjacentEnemy.piece.statModifiers?.spd || 0) + ownCurrentSpd - enemyCurrentSpd,
      spc: Number(adjacentEnemy.piece.statModifiers?.spc || 0),
    };
    finish(`${playerLabels[owner].short} used ${abilityName}, swapping SPD with ${cardFor(adjacentEnemy.piece)?.name || 'an enemy'}.`);
    return;
  }

  source.statModifiers = {
    atk: Number(source.statModifiers?.atk || 0) + 1,
    def: Number(source.statModifiers?.def || 0),
    spd: Number(source.statModifiers?.spd || 0),
    spc: Number(source.statModifiers?.spc || 0),
  };
  finish(`${playerLabels[owner].short} used ${abilityName}, gaining +1 ATK.`);
}

function addLog(state: QuackverseSavedState, entry: string) {
  state.matchLog = [`Turn ${state.turnNumber}: ${entry}`, ...state.matchLog].slice(0, 12);
}

function drawBattleCards(state: QuackverseSavedState, owner: PlayerId, count = 1) {
  const pile = state.battlePiles[owner];
  for (let i = 0; i < count; i += 1) {
    if (!pile.drawPile.length && pile.discardPile.length) {
      pile.drawPile = shuffleCards(pile.discardPile);
      pile.discardPile = [];
    }
    const next = pile.drawPile.shift();
    if (next) pile.hand.push(next);
  }
}

function discardBattleCard(state: QuackverseSavedState, owner: PlayerId) {
  const pile = state.battlePiles[owner];
  const card = pile.hand.shift();
  if (card) pile.discardPile.push(card);
}

function endTurn(state: QuackverseSavedState, actedOverride?: boolean) {
  const currentPlayer = state.activePlayer;
  const actions = state.turnActions[currentPlayer];
  const acted =
    actedOverride ??
    (actions.deployedOrMoved ||
      actions.attacked.length > 0 ||
      actions.usedAbility.length > 0 ||
      actions.equipped.length > 0);
  if (!acted) {
    discardBattleCard(state, currentPlayer);
    addLog(state, `${currentPlayer === 'playerOne' ? 'P1' : 'P2'} ended the turn without acting and discarded a card.`);
  }
  const nextPlayer = opponentOf(currentPlayer);
  state.activePlayer = nextPlayer;
  state.turnActions[currentPlayer] = { deployedOrMoved: false, attacked: [], usedAbility: [], equipped: [] };
  state.turnActions[nextPlayer] = { deployedOrMoved: false, attacked: [], usedAbility: [], equipped: [] };
  drawBattleCards(state, nextPlayer, 1);
  state.turnNumber += 1;
}

function loadMockGame(state: QuackverseSavedState) {
  const p1 = quickStartSquads.playerOne.map((id) => quackverseDucks.find((card) => card.id === id)).filter(Boolean) as QuackverseCard[];
  const p2 = quickStartSquads.playerTwo.map((id) => quackverseDucks.find((card) => card.id === id)).filter(Boolean) as QuackverseCard[];
  const grid = Array.from({ length: gridSize * gridSize }, () => null) as Array<QuackverseSavedPiece | null>;
  [1, 2, 3, 4, 5].forEach((col, index) => {
    grid[gridSize * (gridSize - 1) + col] = makePiece('playerOne', p1[index]);
    grid[col] = makePiece('playerTwo', p2[index]);
  });
  state.gridSize = gridSize;
  state.squadSize = quackverseSquadSize;
  state.squads = { playerOne: quickStartSquads.playerOne, playerTwo: quickStartSquads.playerTwo };
  state.grid = grid;
  state.battlePiles = {
    playerOne: buildBattlePile('playerOne', [...quickStartSquads.playerOne, 81, 84, 85, 86, 88]),
    playerTwo: buildBattlePile('playerTwo', [...quickStartSquads.playerTwo, 83, 87, 90, 95, 96]),
  };
  state.score = { playerOne: 0, playerTwo: 0 };
  state.koCount = { playerOne: 0, playerTwo: 0 };
  state.formationVp = { playerOne: 0, playerTwo: 0 };
  state.scoredFormationKeys = [];
  state.turnActions = {
    playerOne: { deployedOrMoved: false, attacked: [], usedAbility: [], equipped: [] },
    playerTwo: { deployedOrMoved: false, attacked: [], usedAbility: [], equipped: [] },
  };
  state.winner = null;
  state.activePlayer = 'playerOne';
  state.turnNumber = 1;
  state.matchLog = [
    'Mock game loaded: Ranger Strike enters from the bottom, Eclipse Ambush enters from the top.',
    'Player 1 starts. Select a duck, then Move or Attack from the action panel.',
  ];
}

function resetMatchState(state: QuackverseSavedState, clearSeats = true) {
  const nextState = normalizeQuackverseState({});
  if (!clearSeats) {
    nextState.claimedPlayers = { ...state.claimedPlayers };
    nextState.npcPlayers = { ...state.npcPlayers };
  }
  Object.assign(state, nextState);
  state.battlePiles = { playerOne: buildBattlePile('playerOne', starterBattleDecks.playerOne), playerTwo: buildBattlePile('playerTwo', starterBattleDecks.playerTwo) };
  state.matchLog = [clearSeats ? 'Match ended. Seats are open for the next players.' : 'Board cleared. Build squads, place ducks, then start taking turns.'];
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const actionType = String(body.type || '');
  const sessionUser = getSessionUserFromRequest(req);
  const botRequest = isBotRequest(req);
  const requestUserId = botRequest ? normalizeQuackverseUserId(body.userId) : quackverseUserIdFromSession(sessionUser);
  const adminRequest = botRequest || isAdminUsername(sessionUser?.twitchUsername);

  if (!requestUserId && !adminRequest) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const roomKey = quackverseRoomKeyFromParams(req.nextUrl.searchParams);
  const scopedRoom = Boolean(quackverseScopeFromParams(req.nextUrl.searchParams));

  const result = await updateAppState((appState) => {
    const raw = appState.quackverseRooms?.[roomKey] || (!scopedRoom ? appState.quackverse : {});
    const state = normalizeQuackverseState(raw as Partial<QuackverseSavedState>);

    const existingSeat = getClaimedSeat(state, requestUserId);
    const explicitSeatAction = ['claimSeat', 'leaveSeat', 'clearSeat', 'endMatch', 'reset', 'loadMockGame', 'toggleNpc', 'setClaimedPlayer'].includes(actionType);
    const requestSeat = requestUserId && !explicitSeatAction ? ensureClaimedSeat(state, requestUserId) : existingSeat;
    let activeSeat = requestSeat || existingSeat;
    const controlsActiveSeat = activeSeat && state.activePlayer === activeSeat;
    const reject = (error: string, status = 403) => ({ state, error, status });

    if (['loadMockGame', 'setClaimedPlayer'].includes(actionType) && !adminRequest) {
      return reject('Only admins can change match setup.');
    }

    if (actionType === 'claimSeat') {
      if (!requestUserId) return reject('Authentication required.', 401);
      if (!isPlayerId(body.playerId)) return reject('Choose a valid player seat.', 400);
      const playerId = body.playerId as PlayerId;
      const claimedBy = state.claimedPlayers[playerId];
      if (claimedBy && claimedBy !== requestUserId && !state.npcPlayers[playerId]) {
        return reject(`${playerLabels[playerId].short} is already claimed.`);
      }
      for (const otherPlayerId of playerIds) {
        if (state.claimedPlayers[otherPlayerId] === requestUserId) state.claimedPlayers[otherPlayerId] = '';
      }
      state.claimedPlayers[playerId] = requestUserId;
      state.npcPlayers[playerId] = false;
      activeSeat = playerId;
      addLog(state, `${playerLabels[playerId].short} seat claimed.`);
    }

    if (actionType === 'leaveSeat') {
      if (!requestUserId || !activeSeat) return reject('You do not have a claimed seat.');
      state.claimedPlayers[activeSeat] = '';
      state.npcPlayers[activeSeat] = true;
      addLog(state, `${playerLabels[activeSeat].short} left. NPC control is enabled until someone else claims the seat.`);
      activeSeat = null;
    }

    if (actionType === 'clearSeat') {
      if (!isPlayerId(body.playerId)) return reject('Choose a valid player seat.', 400);
      const playerId = body.playerId as PlayerId;
      if (!adminRequest && playerId !== activeSeat) return reject('Only admins can clear another player.');
      state.claimedPlayers[playerId] = '';
      state.npcPlayers[playerId] = true;
      addLog(state, `${playerLabels[playerId].short} seat cleared. NPC control is enabled.`);
      if (playerId === activeSeat) activeSeat = null;
    }

    if (actionType === 'endMatch') {
      if (!adminRequest && !activeSeat) return reject('Only players in this match can end it.');
      resetMatchState(state, true);
      activeSeat = null;
    }

    if (body.type === 'loadMockGame') {
      loadMockGame(state);
    }

    if (body.type === 'reset') {
      if (!adminRequest && !activeSeat) return reject('Only players in this match can reset it.');
      resetMatchState(state, true);
      activeSeat = null;
    }

    if (body.type === 'setClaimedPlayer' && (body.playerId === 'playerOne' || body.playerId === 'playerTwo')) {
      state.claimedPlayers[body.playerId as PlayerId] = String(body.userId || '');
    }

    if (body.type === 'toggleNpc' && (body.playerId === 'playerOne' || body.playerId === 'playerTwo')) {
      const playerId = body.playerId as PlayerId;
      if (!adminRequest && state.claimedPlayers[playerId] && playerId !== activeSeat) return reject('Only admins can toggle NPC for another claimed seat.');
      state.npcPlayers[playerId] = !state.npcPlayers[playerId];
    }

    if (body.type === 'move') {
      if (!controlsActiveSeat) return reject('It is not your turn.');
      const from = Number(body.from);
      const to = Number(body.to);
      const piece = state.grid[from];
      if (piece && piece.owner === state.activePlayer && !state.grid[to] && !state.turnActions[piece.owner].deployedOrMoved) {
        state.grid[from] = null;
        state.grid[to] = piece;
        state.turnActions[piece.owner].deployedOrMoved = true;
        addLog(state, `${piece.owner === 'playerOne' ? 'P1' : 'P2'} moved ${cardFor(piece)?.name || 'duck'} to square ${to + 1}.`);
        scoreNewFormations(state, piece.owner);
      }
    }

    if (body.type === 'place') {
      if (!controlsActiveSeat) return reject('It is not your turn.');
      const targetIndex = Number(body.targetIndex);
      const instanceId = String(body.instanceId || '');
      const pile = state.battlePiles[state.activePlayer];
      const handEntry = pile.hand.find((entry) => entry.instanceId === instanceId);
      const card = handEntry ? quackverseCards.find((item) => item.id === handEntry.cardId) : null;
      if (
        handEntry &&
        card?.type === 'Duck' &&
        targetIndex >= 0 &&
        targetIndex < state.grid.length &&
        !state.grid[targetIndex] &&
        rowOf(targetIndex) === playerLabels[state.activePlayer].backRow &&
        !state.turnActions[state.activePlayer].deployedOrMoved
      ) {
        state.grid[targetIndex] = makePiece(state.activePlayer, card, handEntry.instanceId);
        pile.hand = pile.hand.filter((entry) => entry.instanceId !== instanceId);
        state.turnActions[state.activePlayer].deployedOrMoved = true;
        addLog(state, `${playerLabels[state.activePlayer].short} placed ${card.name} on square ${targetIndex + 1}.`);
        scoreNewFormations(state, state.activePlayer);
      }
    }

    if (body.type === 'attack') {
      if (!controlsActiveSeat) return reject('It is not your turn.');
      const attackerIndex = Number(body.attackerIndex);
      const targetIndex = Number(body.targetIndex);
      const attacker = state.grid[attackerIndex];
      const defender = state.grid[targetIndex];
      if (
        attacker &&
        defender &&
        attacker.owner === state.activePlayer &&
        defender.owner !== attacker.owner &&
        isAdjacent(attackerIndex, targetIndex) &&
        !state.turnActions[attacker.owner].attacked.includes(pieceKey(attacker))
      ) {
        const damage = Math.max(1, getEffectiveStats(attacker).atk - getEffectiveStats(defender).def);
        defender.currentHp -= damage;
        state.turnActions[attacker.owner].attacked.push(pieceKey(attacker));
        if (defender.currentHp <= 0) {
          state.grid[targetIndex] = null;
          state.battlePiles[defender.owner].discardPile.push({ instanceId: pieceKey(defender), cardId: defender.cardId });
          for (const cardId of defender.equipmentIds || []) state.battlePiles[defender.owner].discardPile.push(makeCardInstance(defender.owner, cardId));
          state.koCount[attacker.owner] += 1;
          state.score[attacker.owner] += 1;
          addLog(state, `${attacker.owner === 'playerOne' ? 'P1' : 'P2'} attacked for ${damage}. ${cardFor(defender)?.name || 'Duck'} was KO'd for +1 VP.`);
          if (state.score[attacker.owner] >= victoryTarget) state.winner = attacker.owner;
        } else {
          addLog(state, `${attacker.owner === 'playerOne' ? 'P1' : 'P2'} attacked ${cardFor(defender)?.name || 'duck'} for ${damage}. ${cardFor(defender)?.name || 'Duck'} has ${defender.currentHp} HP left.`);
        }
      }
    }

    if (body.type === 'useAbility') {
      if (!controlsActiveSeat) return reject('It is not your turn.');
      resolveAbility(state, Number(body.sourceIndex), typeof body.ability === 'string' ? body.ability : undefined);
    }

    if (body.type === 'attachGear') {
      if (!controlsActiveSeat) return reject('It is not your turn.');
      const targetIndex = Number(body.targetIndex);
      const instanceId = String(body.instanceId || '');
      const target = state.grid[targetIndex];
      if (target && target.owner === state.activePlayer && !state.turnActions[target.owner].equipped.includes(pieceKey(target))) {
        const pile = state.battlePiles[target.owner];
        const gear = pile.hand.find((entry) => entry.instanceId === instanceId);
        const gearCard = gear ? quackverseCards.find((card) => card.id === gear.cardId) : null;
        if (gear && gearCard?.type === 'Equipment') {
          target.equipmentIds = [...(target.equipmentIds || []), gear.cardId];
          pile.hand = pile.hand.filter((entry) => entry.instanceId !== instanceId);
          state.turnActions[target.owner].equipped.push(pieceKey(target));
          addLog(state, `${target.owner === 'playerOne' ? 'P1' : 'P2'} equipped ${gearCard.name} to ${cardFor(target)?.name || 'duck'}.`);
        }
      }
    }

    if (body.type === 'pass') {
      if (!controlsActiveSeat) return reject('It is not your turn.');
      addLog(state, `${state.activePlayer === 'playerOne' ? 'P1' : 'P2'} passed.`);
      endTurn(state);
    }

    state.updatedAt = new Date().toISOString();
    if (!appState.quackverseRooms) appState.quackverseRooms = {};
    appState.quackverseRooms[roomKey] = state;
    return { state, viewerSeat: activeSeat };
  });


  if ((result as any).error) {
    const state = normalizeQuackverseState((result as any).state as Partial<QuackverseSavedState>);
    const viewer = viewerPayload(sessionUser, state);
    return NextResponse.json(
      { error: (result as any).error, state: redactQuackverseStateForViewer(state, viewer?.seat || null), viewer },
      { status: (result as any).status || 400 },
    );
  }

  const state = normalizeQuackverseState((result as any).state as Partial<QuackverseSavedState>);
  const viewer = viewerPayload(sessionUser, state) || (botRequest ? null : undefined);
  return NextResponse.json({ state: redactQuackverseStateForViewer(state, viewer?.seat || (result as any).viewerSeat || null), viewer });
}
