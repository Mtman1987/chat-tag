import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseQuackverseNpcAction } from '../src/lib/quackverse-npc';
import { quackverseCards } from '../src/lib/quackverse-data';
import { defaultQuackverseState, type QuackversePlayerId, type QuackverseSavedPiece } from '../src/lib/quackverse-state';

function piece(owner: QuackversePlayerId, cardId: number, instanceId: string): QuackverseSavedPiece {
  const card = quackverseCards.find((candidate) => candidate.id === cardId);
  assert.ok(card, `Missing Quackverse card ${cardId}`);
  return {
    owner,
    cardId,
    instanceId,
    currentHp: card.hp || 1,
    maxHp: card.hp || 1,
    specialCurrent: 0,
    equipmentIds: [],
    fatigue: 0,
    statModifiers: { atk: 0, def: 0, spd: 0, spc: 0 },
  };
}

test('NPC deploys a duck from its hand instead of passing on an empty board', () => {
  const state = defaultQuackverseState();
  state.activePlayer = 'playerTwo';
  state.npcPlayers.playerTwo = true;
  state.battlePiles.playerTwo.hand = [{ instanceId: 'npc-duck', cardId: 9 }];

  const action = chooseQuackverseNpcAction(state);

  assert.equal(action.type, 'place');
  if (action.type !== 'place') return;
  assert.equal(action.instanceId, 'npc-duck');
  assert.equal(Math.floor(action.targetIndex / 7), 0);
});

test('NPC attacks an adjacent enemy before deploying another duck', () => {
  const state = defaultQuackverseState();
  state.activePlayer = 'playerTwo';
  state.npcPlayers.playerTwo = true;
  state.grid[0] = piece('playerTwo', 9, 'npc-board');
  state.grid[7] = piece('playerOne', 1, 'human-board');
  state.battlePiles.playerTwo.hand = [{ instanceId: 'npc-duck', cardId: 19 }];

  const action = chooseQuackverseNpcAction(state);

  assert.deepEqual(action, { type: 'attack', attackerIndex: 0, targetIndex: 7 });
});

test('NPC moves toward the opponent when it cannot attack or deploy', () => {
  const state = defaultQuackverseState();
  state.activePlayer = 'playerTwo';
  state.npcPlayers.playerTwo = true;
  state.grid[0] = piece('playerTwo', 9, 'npc-board');
  state.grid[48] = piece('playerOne', 1, 'human-board');

  const action = chooseQuackverseNpcAction(state);

  assert.deepEqual(action, { type: 'move', from: 0, to: 7 });
});
