import { quackverseCards, type QuackverseCard } from './quackverse-data';
import {
  quackverseGridSize,
  type QuackversePlayerId,
  type QuackverseSavedPiece,
  type QuackverseSavedState,
} from './quackverse-state';

type PlayerId = QuackversePlayerId;

export type QuackverseNpcAction =
  | { type: 'attack'; attackerIndex: number; targetIndex: number }
  | { type: 'place'; targetIndex: number; instanceId: string }
  | { type: 'move'; from: number; to: number }
  | { type: 'pass' };

const gridSize = quackverseGridSize;
const rowOf = (index: number) => Math.floor(index / gridSize);
const colOf = (index: number) => index % gridSize;
const opponentOf = (playerId: PlayerId): PlayerId => (playerId === 'playerOne' ? 'playerTwo' : 'playerOne');
const pieceKey = (piece: QuackverseSavedPiece) => piece.instanceId || `${piece.owner}-${piece.cardId}`;
const cardForPiece = (piece: QuackverseSavedPiece) => quackverseCards.find((card) => card.id === piece.cardId);
const cardForId = (cardId: number) => quackverseCards.find((card) => card.id === cardId);

function neighbors(index: number) {
  const row = rowOf(index);
  const col = colOf(index);
  const result: number[] = [];
  if (row > 0) result.push(index - gridSize);
  if (row < gridSize - 1) result.push(index + gridSize);
  if (col > 0) result.push(index - 1);
  if (col < gridSize - 1) result.push(index + 1);
  return result;
}

function distance(from: number, to: number) {
  return Math.abs(rowOf(from) - rowOf(to)) + Math.abs(colOf(from) - colOf(to));
}

function approximateStats(piece: QuackverseSavedPiece) {
  const card = cardForPiece(piece);
  return {
    atk: Math.max(1, Number(card?.atk || 0) + Number(piece.statModifiers?.atk || 0) - Number(piece.fatigue || 0)),
    def: Math.max(0, Number(card?.def || 0) + Number(piece.statModifiers?.def || 0)),
  };
}

function deploymentScore(card: QuackverseCard) {
  return Number(card.atk || 0) * 3
    + Number(card.def || 0) * 2
    + Number(card.hp || 0) * 2
    + Number(card.spd || 0)
    + Number(card.spc || 0);
}

export function chooseQuackverseNpcAction(state: QuackverseSavedState): QuackverseNpcAction {
  const owner = state.activePlayer;
  const enemyOwner = opponentOf(owner);
  const actions = state.turnActions[owner];
  const ownedPieces = state.grid
    .map((piece, index) => ({ piece, index }))
    .filter((entry): entry is { piece: QuackverseSavedPiece; index: number } => entry.piece?.owner === owner);
  const enemyPieces = state.grid
    .map((piece, index) => ({ piece, index }))
    .filter((entry): entry is { piece: QuackverseSavedPiece; index: number } => entry.piece?.owner === enemyOwner);

  const attack = ownedPieces
    .filter(({ piece }) => !actions.attacked.includes(pieceKey(piece)))
    .flatMap(({ piece, index }) => neighbors(index)
      .map((targetIndex) => ({ piece, index, targetIndex, defender: state.grid[targetIndex] }))
      .filter((entry): entry is { piece: QuackverseSavedPiece; index: number; targetIndex: number; defender: QuackverseSavedPiece } =>
        Boolean(entry.defender && entry.defender.owner === enemyOwner),
      ))
    .map((entry) => {
      const attackerStats = approximateStats(entry.piece);
      const defenderStats = approximateStats(entry.defender);
      const damage = Math.max(1, attackerStats.atk - defenderStats.def);
      const lethal = damage >= Number(entry.defender.currentHp || 0);
      return { ...entry, damage, score: (lethal ? 10_000 : 0) + damage * 100 - Number(entry.defender.currentHp || 0) };
    })
    .sort((a, b) => b.score - a.score)[0];

  if (attack) {
    return { type: 'attack', attackerIndex: attack.index, targetIndex: attack.targetIndex };
  }

  if (!actions.deployedOrMoved) {
    const pile = state.battlePiles[owner];
    const duck = pile.hand
      .map((entry) => ({ entry, card: cardForId(entry.cardId) }))
      .filter((candidate): candidate is { entry: { instanceId: string; cardId: number }; card: QuackverseCard } => candidate.card?.type === 'Duck')
      .sort((a, b) => deploymentScore(b.card) - deploymentScore(a.card))[0];
    const backRow = owner === 'playerOne' ? gridSize - 1 : 0;
    const openEntrySquares = Array.from({ length: gridSize }, (_, col) => backRow * gridSize + col)
      .filter((index) => !state.grid[index]);

    if (duck && openEntrySquares.length > 0) {
      const center = (gridSize - 1) / 2;
      const targetIndex = [...openEntrySquares]
        .sort((a, b) => {
          const aEnemyDistance = enemyPieces.length ? Math.min(...enemyPieces.map((enemy) => distance(a, enemy.index))) : 0;
          const bEnemyDistance = enemyPieces.length ? Math.min(...enemyPieces.map((enemy) => distance(b, enemy.index))) : 0;
          if (aEnemyDistance !== bEnemyDistance) return aEnemyDistance - bEnemyDistance;
          return Math.abs(colOf(a) - center) - Math.abs(colOf(b) - center);
        })[0];
      return { type: 'place', targetIndex, instanceId: duck.entry.instanceId };
    }
  }

  if (!actions.deployedOrMoved && ownedPieces.length > 0) {
    const forwardDelta = owner === 'playerOne' ? -1 : 1;
    const opponentBackRow = owner === 'playerOne' ? 0 : gridSize - 1;
    const move = ownedPieces
      .flatMap(({ index }) => neighbors(index)
        .filter((targetIndex) => !state.grid[targetIndex])
        .map((targetIndex) => {
          const rowProgress = (rowOf(targetIndex) - rowOf(index)) * forwardDelta;
          const enemyDistance = enemyPieces.length
            ? Math.min(...enemyPieces.map((enemy) => distance(targetIndex, enemy.index)))
            : Math.abs(rowOf(targetIndex) - opponentBackRow);
          const centerPenalty = Math.abs(colOf(targetIndex) - (gridSize - 1) / 2);
          return {
            from: index,
            to: targetIndex,
            score: -enemyDistance * 100 + rowProgress * 20 - centerPenalty,
          };
        }))
      .sort((a, b) => b.score - a.score)[0];

    if (move) return { type: 'move', from: move.from, to: move.to };
  }

  return { type: 'pass' };
}
