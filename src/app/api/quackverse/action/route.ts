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
import { quackverseCards, type QuackverseCard } from '@/lib/quackverse-data';
import { findQuackverseStructuredEffect, getQuackverseAbilityCost, summarizeQuackverseGear } from '@/lib/quackverse-effects';
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
  specialCurrent: 0,
  equipmentIds: [],
  fatigue: 0,
  statModifiers: { atk: 0, def: 0, spd: 0, spc: 0 },
});
const numberFromText = (text: string, pattern: RegExp) => Number(text.match(pattern)?.[1] || 0);
const cardFor = (piece: QuackverseSavedPiece) => quackverseCards.find((card) => card.id === piece.cardId);
const isRole = (card: QuackverseCard, token: string) => `${card.name} ${card.role || ''}`.toLowerCase().includes(token.toLowerCase());
const getSpecialMax = (piece: QuackverseSavedPiece) => {
  const card = cardFor(piece);
  const base = Number(card?.spc || 0);
  const modifiers = piece.statModifiers || {};
  return Math.max(10, 10 + base * 2 + Number(modifiers.spc || 0) * 2);
};
const deckForPlayer = (state: QuackverseSavedState, playerId: PlayerId) => {
  const userId = state.claimedPlayers[playerId];
  const collectionDeck = userId ? state.collections?.[userId]?.deck : [];
  return Array.isArray(collectionDeck) ? collectionDeck.filter((cardId) => quackverseCards.some((card) => card.id === cardId)) : [];
};
const battleDeckForPlayer = (state: QuackverseSavedState, playerId: PlayerId) => {
  const deck = deckForPlayer(state, playerId);
  return deck.length > 0 ? deck : starterBattleDecks[playerId];
};

function getCurrentSpecial(piece: QuackverseSavedPiece) {
  return Number(piece.specialCurrent || 0);
}

function spendSpecial(piece: QuackverseSavedPiece, cost: number) {
  piece.specialCurrent = Math.max(0, getCurrentSpecial(piece) - cost);
}

function getGearHealPerTurn(piece: QuackverseSavedPiece) {
  const equipment = (piece.equipmentIds || []).map((id) => quackverseCards.find((item) => item.id === id)).filter(Boolean) as QuackverseCard[];
  return summarizeQuackverseGear(equipment).healPerTurn;
}

function removeNegativeModifiers(piece: QuackverseSavedPiece) {
  piece.statModifiers = {
    atk: Math.max(0, Number(piece.statModifiers?.atk || 0)),
    def: Math.max(0, Number(piece.statModifiers?.def || 0)),
    spd: Math.max(0, Number(piece.statModifiers?.spd || 0)),
    spc: Math.max(0, Number(piece.statModifiers?.spc || 0)),
  };
}

function recordDeckResult(state: QuackverseSavedState, winner: PlayerId) {
  if (state.matchResultRecordedForWinner === winner) return false;

  const loser = opponentOf(winner);
  let recorded = false;

  for (const playerId of [winner, loser] as PlayerId[]) {
    const userId = state.claimedPlayers[playerId];
    if (!userId) continue;
    const collection = state.collections?.[userId];
    if (!collection || collection.deck.length === 0) continue;
    if (playerId === winner) {
      collection.deckWins = Number(collection.deckWins || 0) + 1;
    } else {
      collection.deckLosses = Number(collection.deckLosses || 0) + 1;
    }
    const activeDeck = collection.savedDecks?.find((deck) => deck.id === collection.activeDeckId);
    if (activeDeck) {
      if (playerId === winner) {
        activeDeck.wins = Number(activeDeck.wins || 0) + 1;
      } else {
        activeDeck.losses = Number(activeDeck.losses || 0) + 1;
      }
      activeDeck.updatedAt = new Date().toISOString();
    }
    recorded = true;
  }

  if (recorded) state.matchResultRecordedForWinner = winner;
  return recorded;
}

type DetectedFormation = {
  owner: PlayerId;
  name: string;
  key: string;
  indices: number[];
  healerCount: number;
};

const formationPriority: Record<string, number> = {
  'Eclipse Cross': 5,
  'Cosmic Diamond': 5,
  'Flying V': 4,
  'Medic Sanctuary': 4,
  'Battle Line': 1,
};

function detectFormations(grid: Array<QuackverseSavedPiece | null>): DetectedFormation[] {
  const formations: DetectedFormation[] = [];
  const medicKeys = new Set<string>();
  const addFormation = (owner: PlayerId, name: string, indices: number[]) => {
    const unique = [...new Set(indices)].sort((a, b) => a - b);
    if (unique.every((index) => rowOf(index) === playerLabels[owner].backRow)) return;
    const healerCount = unique.filter((index) => {
      const card = grid[index] ? cardFor(grid[index]!) : null;
      return Boolean(card && (isRole(card, 'support') || isRole(card, 'medic') || isRole(card, 'heal')));
    }).length;
    formations.push({ owner, name, indices: unique, healerCount, key: `${owner}:${name}:${unique.join('-')}` });
  };
  const owned = (index: number, owner: PlayerId) => grid[index]?.owner === owner;
  const neighborOffsets = [-gridSize - 1, -gridSize, -gridSize + 1, -1, 1, gridSize - 1, gridSize, gridSize + 1];
  const isHealer = (index: number) => {
    const card = grid[index] ? cardFor(grid[index]!) : null;
    return Boolean(card && (isRole(card, 'support') || isRole(card, 'medic') || isRole(card, 'heal')));
  };
  const gatherComponent = (startIndex: number, owner: PlayerId) => {
    const queue = [startIndex];
    const seen = new Set<number>([startIndex]);
    while (queue.length) {
      const index = queue.shift()!;
      for (const offset of neighborOffsets) {
        const next = index + offset;
        if (next < 0 || next >= grid.length) continue;
        if (seen.has(next) || !owned(next, owner)) continue;
        const rowDelta = Math.abs(rowOf(next) - rowOf(index));
        const colDelta = Math.abs(colOf(next) - colOf(index));
        if (rowDelta > 1 || colDelta > 1) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    return [...seen];
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
        }
        row += 1;
      }
    }

    for (let row = 1; row < gridSize - 1; row += 1) {
      for (let col = 1; col < gridSize - 1; col += 1) {
        const center = row * gridSize + col;
        const cross = [center, center - gridSize, center + gridSize, center - 1, center + 1];
        if (cross.every((index) => owned(index, owner))) addFormation(owner, 'Eclipse Cross', cross);

        const diamond = [center - gridSize - 1, center - gridSize + 1, center + gridSize - 1, center + gridSize + 1];
        if (diamond.every((index) => owned(index, owner))) addFormation(owner, 'Cosmic Diamond', diamond);
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
      if (!piece || piece.owner !== owner || !isHealer(index)) return;
      const component = gatherComponent(index, owner);
      const healerCount = component.filter((componentIndex) => isHealer(componentIndex)).length;
      if (component.length >= 3) {
        const key = `${owner}:Medic Sanctuary:${[...new Set(component)].sort((a, b) => a - b).join('-')}`;
        if (medicKeys.has(key)) return;
        medicKeys.add(key);
        formations.push({
          owner,
          name: 'Medic Sanctuary',
          indices: [...new Set(component)].sort((a, b) => a - b),
          healerCount,
          key,
        });
      }
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
  const baseIndices = new Set(fresh.indices);
  state.scoredFormationKeys.push(fresh.key);
  if (earnsVp) {
    state.formationVp[owner] += 1;
    state.score[owner] += 1;
  }
  const isCross = fresh.name === 'Eclipse Cross';
  const isFlyingV = fresh.name === 'Flying V';
  const isBattleLine = fresh.name === 'Battle Line';
  const isCosmicDiamond = fresh.name === 'Cosmic Diamond';
  const isMedicSanctuary = fresh.name === 'Medic Sanctuary';
  const battleLineAtkBonus = isBattleLine ? Math.max(0, fresh.indices.length - 3) : 0;
  const battleLineDefBonus = isBattleLine ? 1 : 0;
  const flyingVAtkBonus = isFlyingV ? (fresh.indices.length >= 5 ? 2 : 1) : 0;
  const diamondSpcBonus = isCosmicDiamond ? 1 : 0;
  const medicDefBonus = isMedicSanctuary ? 1 : 0;

  state.grid = state.grid.map((slot, index) => {
    if (!slot || !baseIndices.has(index)) return slot;
    const nextModifiers = {
      atk: Number(slot.statModifiers?.atk || 0),
      def: Number(slot.statModifiers?.def || 0),
      spd: Number(slot.statModifiers?.spd || 0),
      spc: Number(slot.statModifiers?.spc || 0),
    };
    if (isBattleLine) nextModifiers.def += battleLineDefBonus;
    if (battleLineAtkBonus > 0) nextModifiers.atk += battleLineAtkBonus;
    if (isFlyingV && flyingVAtkBonus > 0) nextModifiers.atk += flyingVAtkBonus;
    if (isCosmicDiamond) nextModifiers.spc += diamondSpcBonus;
    if (isMedicSanctuary) nextModifiers.def += medicDefBonus;

    return {
      ...slot,
      fatigue: Number(slot.fatigue || 0) + 1,
      currentHp: isCross ? Math.min(slot.maxHp, Number(slot.currentHp || 0) + 3) : Number(slot.currentHp || 0) + 1,
      maxHp: Number(slot.maxHp || 0) + 1,
      statModifiers: nextModifiers,
    };
  });
  if (earnsVp && state.score[owner] >= victoryTarget) state.winner = owner;
  addLog(
    state,
    `${playerLabels[owner].short} formed ${fresh.name}${earnsVp ? ' for +1 VP' : ' with no VP because the formation cap is reached'}. Formation ducks gain +1 HP and +1 Fatigue${isCross ? ' and Cross heals 3 HP' : ''}.`,
  );
}

function refreshTurnResources(state: QuackverseSavedState, owner: PlayerId) {
  const formed = new Set(
    detectFormations(state.grid)
      .filter((formation) => formation.owner === owner)
      .flatMap((formation) => formation.indices),
  );

  state.grid = state.grid.map((slot, index) => {
    if (!slot || slot.owner !== owner) return slot;
    const nextFatigue = formed.has(index) ? Number(slot.fatigue || 0) : Math.max(0, Number(slot.fatigue || 0) - 1);
    const card = cardFor(slot);
    const statBonus = Number(slot.statModifiers?.spc || 0);
    const gain = Math.max(0, 4 + Number(card?.spc || 0) + statBonus - nextFatigue);
    const specialCurrent = Math.min(getSpecialMax(slot), Number(slot.specialCurrent || 0) + gain);
    const healPerTurn = getGearHealPerTurn(slot);
    return {
      ...slot,
      fatigue: nextFatigue,
      currentHp: Math.min(slot.maxHp, Number(slot.currentHp || 0) + healPerTurn),
      specialCurrent,
    };
  });
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
  const gear = summarizeQuackverseGear(equipment);
  const modifiers = piece.statModifiers || {};
  const fatigue = Number(piece.fatigue || 0);
  const damageReduction = gear.damageReduction;
  return {
    atk: Math.max(1, (card?.atk || 0) + Number(modifiers.atk || 0) + Number(gear.statModifiers.atk || 0) - fatigue - damageReduction),
    def: Math.max(0, (card?.def || 0) + Number(modifiers.def || 0) + Number(gear.statModifiers.def || 0) + damageReduction),
    spd: Math.max(1, (card?.spd || 0) + Number(modifiers.spd || 0) + Number(gear.statModifiers.spd || 0) - fatigue),
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
  const structuredAbility = findQuackverseStructuredEffect(sourceCard, ability);
  const abilityTags = new Set(structuredAbility?.tags || []);
  const abilityCost = getQuackverseAbilityCost(sourceCard, ability);
  if (getCurrentSpecial(source) < abilityCost) {
    addLog(
      state,
      `${playerLabels[source.owner].short} tried ${ability.split(':')[0] || 'Ability'} but needed ${abilityCost} Special and only had ${getCurrentSpecial(source)}.`,
    );
    return;
  }

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
  const friendlyTargets = /all allies|to allies|allied/i.test(ability)
    ? ownPieces.map((entry) => entry.index)
    : /to ally|an ally/i.test(ability)
      ? [adjacentAlly?.index ?? sourceIndex]
      : [sourceIndex];
  const enemyTargets = /all enemies|enemies/i.test(ability)
    ? enemyPieces.map((entry) => entry.index)
    : adjacentEnemy
      ? [adjacentEnemy.index]
      : [];
  const abilityName = ability.split(':')[0] || 'Ability';
  const finish = (entry: string) => {
    spendSpecial(source, abilityCost);
    state.turnActions[owner].usedAbility.push(pieceKey(source));
    addLog(state, entry);
  };

  if (abilityTags.has('cleanse')) {
    for (const targetIndex of friendlyTargets) {
      const target = state.grid[targetIndex];
      if (target) removeNegativeModifiers(target);
    }
    finish(`${playerLabels[owner].short} used ${abilityName}, cleansing ${friendlyTargets.length} target${friendlyTargets.length === 1 ? '' : 's'}.`);
    return;
  }

  const healAmount = numberFromText(ability, /(?:Heal|Restore|Repair|Mend|Blessing|Sprinkle)\D+(\d+)\s*HP/i);
  if (abilityTags.has('heal') && healAmount > 0) {
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
  if (abilityTags.has('damage') && damage > 0 && enemyTargets.length > 0) {
    const knockedOut = applyDamage(state, owner, enemyTargets, damage);
    finish(
      `${playerLabels[owner].short} used ${abilityName}, dealing ${damage} damage to ${enemyTargets.length} target${enemyTargets.length === 1 ? '' : 's'}${knockedOut ? ` and KO'ing ${knockedOut}` : ''}.`,
    );
    return;
  }

  if (abilityTags.has('attackTwice') && adjacentEnemy?.piece) {
    const damageOne = Math.max(1, Math.floor(getEffectiveStats(source).atk / 2) - getEffectiveStats(adjacentEnemy.piece).def);
    const totalDamage = Math.max(0, damageOne) * 2;
    adjacentEnemy.piece.currentHp -= totalDamage;
    state.turnActions[owner].attacked.push(pieceKey(source));
    if (adjacentEnemy.piece.currentHp <= 0) {
      state.grid[adjacentEnemy.index] = null;
      state.battlePiles[adjacentEnemy.piece.owner].discardPile.push({ instanceId: pieceKey(adjacentEnemy.piece), cardId: adjacentEnemy.piece.cardId });
      for (const cardId of adjacentEnemy.piece.equipmentIds || []) state.battlePiles[adjacentEnemy.piece.owner].discardPile.push(makeCardInstance(adjacentEnemy.piece.owner, cardId));
      state.koCount[owner] += 1;
      state.score[owner] += 1;
      if (state.score[owner] >= victoryTarget) state.winner = owner;
    }
    finish(`${playerLabels[owner].short} used ${abilityName}, striking twice for ${totalDamage} total damage.`);
    return;
  }

  const statBuffs = (['atk', 'def', 'spd', 'spc'] as const)
    .map((stat) => ({ stat, amount: numberFromText(ability, new RegExp(`\\+(\\d+)\\s*${stat}`, 'i')) }))
    .filter((entry) => entry.amount > 0);
  if (abilityTags.has('buff') && statBuffs.length > 0) {
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

  if (abilityTags.has('peek') || abilityTags.has('reveal')) {
    const revealCount = /top\s*2/i.test(ability) ? 2 : 1;
    const previewPile = state.battlePiles[enemyOwner].drawPile.slice(0, revealCount);
    source.specialCurrent = Math.min(getSpecialMax(source), getCurrentSpecial(source) + 2);
    finish(
      `${playerLabels[owner].short} used ${abilityName}, peeking at ${previewPile.map((entry) => quackverseCards.find((card) => card.id === entry.cardId)?.name || 'a card').join(', ') || 'the next card'}.`,
    );
    return;
  }

  const statDebuff = (['atk', 'def', 'spd', 'spc'] as const)
    .map((stat) => {
      const match = ability.match(new RegExp(`-(\\d+)\\s*${stat}|Reduce enemy ${stat} by\\s*(\\d+)`, 'i'));
      return { stat, amount: Number(match?.[1] || match?.[2] || 0) };
    })
    .find((entry) => entry.amount > 0);
  if (abilityTags.has('debuff') && statDebuff && enemyTargets.length > 0) {
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

  if (abilityTags.has('attackFirst')) {
    source.statModifiers = {
      atk: Number(source.statModifiers?.atk || 0),
      def: Number(source.statModifiers?.def || 0),
      spd: Number(source.statModifiers?.spd || 0) + (state.turnNumber === 1 ? 6 : 3),
      spc: Number(source.statModifiers?.spc || 0),
    };
    finish(`${playerLabels[owner].short} used ${abilityName}, gaining a burst of speed.`);
    return;
  }

  if (abilityTags.has('root') && enemyTargets.length > 0) {
    for (const targetIndex of enemyTargets) {
      const target = state.grid[targetIndex];
      if (!target) continue;
      target.statModifiers = {
        atk: Number(target.statModifiers?.atk || 0),
        def: Number(target.statModifiers?.def || 0),
        spd: Number(target.statModifiers?.spd || 0) - 3,
        spc: Number(target.statModifiers?.spc || 0),
      };
    }
    finish(`${playerLabels[owner].short} used ${abilityName}, rooting the enemy in place.`);
    return;
  }

  if (abilityTags.has('debuff') && /blind enemy/i.test(ability) && enemyTargets.length > 0) {
    for (const targetIndex of enemyTargets) {
      const target = state.grid[targetIndex];
      if (!target) continue;
      target.statModifiers = {
        atk: Number(target.statModifiers?.atk || 0) - 2,
        def: Number(target.statModifiers?.def || 0),
        spd: Number(target.statModifiers?.spd || 0) - 1,
        spc: Number(target.statModifiers?.spc || 0),
      };
    }
    finish(`${playerLabels[owner].short} used ${abilityName}, blinding the enemy.`);
    return;
  }

  if ((abilityTags.has('peek') || abilityTags.has('reveal')) && /see opponent.?hand|opponent.?hand/i.test(ability)) {
    const visibleHand = state.battlePiles[enemyOwner].hand
      .map((entry) => quackverseCards.find((card) => card.id === entry.cardId)?.name || 'a card')
      .join(', ');
    finish(`${playerLabels[owner].short} used ${abilityName}, seeing ${visibleHand || 'the opponent hand'}${visibleHand ? '.' : ''}`);
    return;
  }

  if (abilityTags.has('random') && /random buff|reroll random effects|change any random effect/i.test(ability)) {
    const statOptions: Array<'atk' | 'def' | 'spd' | 'spc'> = ['atk', 'def', 'spd', 'spc'];
    const chosenStat = statOptions[Math.floor(Math.random() * statOptions.length)];
    const amount = /reroll/i.test(ability) ? 3 : 2;
    source.statModifiers = {
      atk: Number(source.statModifiers?.atk || 0),
      def: Number(source.statModifiers?.def || 0),
      spd: Number(source.statModifiers?.spd || 0),
      spc: Number(source.statModifiers?.spc || 0),
      [chosenStat]: Number(source.statModifiers?.[chosenStat] || 0) + amount,
    };
    finish(`${playerLabels[owner].short} used ${abilityName}, gaining +${amount} ${chosenStat.toUpperCase()}.`);
    return;
  }

  if (abilityTags.has('stun')) {
    for (const targetIndex of enemyTargets) {
      const target = state.grid[targetIndex];
      if (!target) continue;
      target.statModifiers = {
        atk: Number(target.statModifiers?.atk || 0) - 1,
        def: Number(target.statModifiers?.def || 0),
        spd: Number(target.statModifiers?.spd || 0) - 2,
        spc: Number(target.statModifiers?.spc || 0),
      };
    }
    finish(`${playerLabels[owner].short} used ${abilityName}, stunning the enemy line and slowing them down.`);
    return;
  }

  if (abilityTags.has('debuff') && /enemy loses next attack/i.test(ability)) {
    for (const targetIndex of enemyTargets) {
      const target = state.grid[targetIndex];
      if (!target) continue;
      target.statModifiers = {
        atk: Number(target.statModifiers?.atk || 0) - 3,
        def: Number(target.statModifiers?.def || 0),
        spd: Number(target.statModifiers?.spd || 0),
        spc: Number(target.statModifiers?.spc || 0),
      };
    }
    finish(`${playerLabels[owner].short} used ${abilityName}, suppressing the next enemy attack.`);
    return;
  }

  if (abilityTags.has('dodge') || abilityTags.has('shield')) {
    for (const targetIndex of friendlyTargets) {
      const target = state.grid[targetIndex];
      if (!target) continue;
      target.statModifiers = {
        atk: Number(target.statModifiers?.atk || 0),
        def: Number(target.statModifiers?.def || 0) + 2,
        spd: Number(target.statModifiers?.spd || 0) + 1,
        spc: Number(target.statModifiers?.spc || 0),
      };
    }
    finish(`${playerLabels[owner].short} used ${abilityName}, reinforcing ${friendlyTargets.length} target${friendlyTargets.length === 1 ? '' : 's'}.`);
    return;
  }

  if (abilityTags.has('move')) {
    source.statModifiers = {
      atk: Number(source.statModifiers?.atk || 0),
      def: Number(source.statModifiers?.def || 0),
      spd: Number(source.statModifiers?.spd || 0) + 3,
      spc: Number(source.statModifiers?.spc || 0),
    };
    finish(`${playerLabels[owner].short} used ${abilityName}, gaining extra movement tempo.`);
    return;
  }

  if (abilityTags.has('swap') && adjacentEnemy?.piece) {
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

  if (/50%.*double damage or miss/i.test(ability)) {
    if (Math.random() < 0.5 && enemyTargets.length > 0) {
      const doubled = applyDamage(state, owner, enemyTargets, Math.max(1, Math.floor(getEffectiveStats(source).atk * 2)));
      finish(`${playerLabels[owner].short} used ${abilityName}, landing the big hit${doubled ? ` and KO'ing ${doubled}` : ''}.`);
    } else {
      finish(`${playerLabels[owner].short} used ${abilityName}, but it missed.`);
    }
    return;
  }

  if (/50% dodge chance/i.test(ability)) {
    if (Math.random() < 0.5) {
      source.statModifiers = {
        atk: Number(source.statModifiers?.atk || 0),
        def: Number(source.statModifiers?.def || 0) + 3,
        spd: Number(source.statModifiers?.spd || 0) + 1,
        spc: Number(source.statModifiers?.spc || 0),
      };
      finish(`${playerLabels[owner].short} used ${abilityName}, dodging the danger.`);
    } else {
      finish(`${playerLabels[owner].short} used ${abilityName}, but the dodge did not trigger.`);
    }
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
  return Boolean(card);
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
    const discarded = discardBattleCard(state, currentPlayer);
    addLog(
      state,
      discarded
        ? `${currentPlayer === 'playerOne' ? 'P1' : 'P2'} ended the turn without acting and discarded a card.`
        : `${currentPlayer === 'playerOne' ? 'P1' : 'P2'} ended the turn without acting and had no card to discard.`,
    );
  }
  const nextPlayer = opponentOf(currentPlayer);
  state.activePlayer = nextPlayer;
  state.turnActions[currentPlayer] = { deployedOrMoved: false, attacked: [], usedAbility: [], equipped: [] };
  state.turnActions[nextPlayer] = { deployedOrMoved: false, attacked: [], usedAbility: [], equipped: [] };
  drawBattleCards(state, nextPlayer, 1);
  state.turnNumber += 1;
  refreshTurnResources(state, nextPlayer);
}

function loadMockGame(state: QuackverseSavedState) {
  const p1Deck = starterBattleDecks.playerOne;
  const p2Deck = starterBattleDecks.playerTwo;
  state.gridSize = gridSize;
  state.squadSize = quackverseSquadSize;
  state.squads = { playerOne: [], playerTwo: [] };
  state.grid = Array.from({ length: gridSize * gridSize }, () => null) as Array<QuackverseSavedPiece | null>;
  state.battlePiles = {
    playerOne: buildBattlePile('playerOne', p1Deck),
    playerTwo: buildBattlePile('playerTwo', p2Deck),
  };
  state.score = { playerOne: 0, playerTwo: 0 };
  state.koCount = { playerOne: 0, playerTwo: 0 };
  state.formationVp = { playerOne: 0, playerTwo: 0 };
  state.scoredFormationKeys = [];
  state.matchResultRecordedForWinner = null;
  state.turnActions = {
    playerOne: { deployedOrMoved: false, attacked: [], usedAbility: [], equipped: [] },
    playerTwo: { deployedOrMoved: false, attacked: [], usedAbility: [], equipped: [] },
  };
  state.winner = null;
  state.activePlayer = 'playerOne';
  state.turnNumber = 1;
  refreshTurnResources(state, state.activePlayer);
  state.matchLog = [
    'Mock game loaded: current decks are ready and both entry rows are open.',
    'Player 1 starts. Select a duck from the hand, then place it on the bottom entry row.',
  ];
  state.npcPlayers = { playerOne: false, playerTwo: true };
}

function resetMatchState(state: QuackverseSavedState, clearSeats = true) {
  const previousClaimedPlayers = { ...state.claimedPlayers };
  const previousCollections = { ...(state.collections || {}) };
  const nextState = normalizeQuackverseState({});
  if (!clearSeats) {
    nextState.claimedPlayers = previousClaimedPlayers;
  }
  nextState.collections = previousCollections;
  Object.assign(state, nextState);
  state.npcPlayers = { playerOne: false, playerTwo: false };
  state.battlePiles = {
    playerOne: buildBattlePile('playerOne', battleDeckForPlayer(state, 'playerOne')),
    playerTwo: buildBattlePile('playerTwo', battleDeckForPlayer(state, 'playerTwo')),
  };
  state.grid = Array.from({ length: gridSize * gridSize }, () => null) as Array<QuackverseSavedPiece | null>;
  state.matchResultRecordedForWinner = null;
  state.matchLog = [
    clearSeats ? 'Match ended. Seats are open for the next players.' : 'Board cleared. Current decks are ready. Place ducks from the entry rows.',
  ];
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const actionType = String(body.type || '');
  const sessionUser = getSessionUserFromRequest(req);
  const botRequest = isBotRequest(req);
  const requestUserId = botRequest ? normalizeQuackverseUserId(body.userId) : quackverseUserIdFromSession(sessionUser);
  const adminRequest = botRequest || isAdminUsername(sessionUser?.twitchUsername);
  const allowLocalSetup = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '::1'].includes(req.nextUrl.hostname);

  if (!requestUserId && !adminRequest && !allowLocalSetup) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const roomKey = quackverseRoomKeyFromParams(req.nextUrl.searchParams);
  const scopedRoom = Boolean(quackverseScopeFromParams(req.nextUrl.searchParams));

  const result = await updateAppState((appState) => {
    const raw = appState.quackverseRooms?.[roomKey] || (!scopedRoom ? appState.quackverse : {});
    const state = normalizeQuackverseState(raw as Partial<QuackverseSavedState>);
    const globalState = normalizeQuackverseState(appState.quackverse as Partial<QuackverseSavedState>);
    state.collections = { ...state.collections, ...globalState.collections };
    if (state.winner && state.matchResultRecordedForWinner !== state.winner) {
      recordDeckResult(state, state.winner);
    }

    const existingSeat = getClaimedSeat(state, requestUserId);
    const explicitSeatAction = ['claimSeat', 'leaveSeat', 'clearSeat', 'endMatch', 'reset', 'loadMockGame', 'toggleNpc', 'setClaimedPlayer'].includes(actionType);
    const requestSeat = requestUserId && !explicitSeatAction ? ensureClaimedSeat(state, requestUserId) : existingSeat;
    let activeSeat = requestSeat || existingSeat;
    const controlsActiveSeat = activeSeat && state.activePlayer === activeSeat;
    const controlsActiveNpc = Boolean(state.npcPlayers[state.activePlayer] && (activeSeat || adminRequest || allowLocalSetup));
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
      state.npcPlayers[activeSeat] = false;
      addLog(state, `${playerLabels[activeSeat].short} left. The seat is open.`);
      activeSeat = null;
    }

    if (actionType === 'clearSeat') {
      if (!isPlayerId(body.playerId)) return reject('Choose a valid player seat.', 400);
      const playerId = body.playerId as PlayerId;
      if (!adminRequest && playerId !== activeSeat) return reject('Only admins can clear another player.');
      state.claimedPlayers[playerId] = '';
      state.npcPlayers[playerId] = false;
      addLog(state, `${playerLabels[playerId].short} seat cleared.`);
      if (playerId === activeSeat) activeSeat = null;
    }

    if (actionType === 'endMatch') {
      if (!adminRequest && !activeSeat && !allowLocalSetup) return reject('Only players in this match can end it.');
      if (state.winner && state.matchResultRecordedForWinner !== state.winner) {
        recordDeckResult(state, state.winner);
      }
      resetMatchState(state, true);
      activeSeat = null;
    }

    if (body.type === 'loadMockGame') {
      if (state.winner && state.matchResultRecordedForWinner !== state.winner) {
        recordDeckResult(state, state.winner);
      }
      loadMockGame(state);
    }

    if (body.type === 'reset') {
      if (!adminRequest && !activeSeat && !allowLocalSetup) return reject('Only players in this match can reset it.');
      if (state.winner && state.matchResultRecordedForWinner !== state.winner) {
        recordDeckResult(state, state.winner);
      }
      resetMatchState(state, false);
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
      if (!controlsActiveSeat && !controlsActiveNpc) return reject('It is not your turn.');
      addLog(state, `${state.activePlayer === 'playerOne' ? 'P1' : 'P2'} passed.`);
      endTurn(state);
    }

    if (state.winner && state.matchResultRecordedForWinner !== state.winner) {
      recordDeckResult(state, state.winner);
    }

    state.updatedAt = new Date().toISOString();
    if (!appState.quackverseRooms) appState.quackverseRooms = {};
    appState.quackverseRooms[roomKey] = state;
    appState.quackverse = {
      ...globalState,
      collections: state.collections,
      updatedAt: state.updatedAt,
    };
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
