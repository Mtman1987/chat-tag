# Discord Card Table Activity Plan

## Goal

Build one rules-light, deck-to-deck table simulator for Pokémon and Quackverse tournaments. The table displays and moves cards correctly but does not try to enforce either game's complete rules. Players and referees remain responsible for legal play.

Gym-leader battles remain a separate stream-event system. They are not part of peer-to-peer table play.

## Shared table contract

`CardTableSessionV1` is game-neutral:

- `game`: `pokemon` or `quackverse`
- `sessionId`, Discord guild/channel/activity instance, tournament/match identifiers
- seats for player one, player two, referee, and spectators
- optimistic `version` and an append-only action log
- public zones, private hands, decks, discard piles, exile/removed zones, and game-adapter zones
- card instances with owner, controller, position, rotation, face state, stack order, and attached tokens
- manual counters, named tokens, dice/coin results, score labels, turn number, and active seat
- match status: setup, active, paused, disputed, completed, or archived
- immutable turn checkpoints used for undo, replay, screenshots, and clips

The server authorizes every action and filters hidden information before returning spectator or opponent state. A client-side hidden-card effect is not considered secure.

## Game adapters

The shared engine calls a small adapter for each game.

### Pokémon

- Imports the player's linked StreamWeaver Pokémon collection and saved deck.
- Uses Pokémon card aspect ratio, card art, card backs, and labels.
- Supplies a default layout with deck, hand, discard, active position, bench, prize area, stadium, and manual damage/status tokens.
- Retains the existing nine-card booster contract.

### Quackverse

- Reuses the current Quackverse cards, collections, deck data, and table work.
- Supplies the current grid/play-area layout as a selectable Quackverse template.
- Uses Quackverse art, card backs, counters, and token presets.
- Uses nine-card boosters and the existing StreamWeaver-compatible pack-opening animation event.

Adapters provide presentation and starting zones only. They do not decide whether a move, attack, ability, or card combination is legal.

## Roles and controls

### Players

- Draw, shuffle, reveal, flip, rotate, stack, attach, and move their cards.
- Manipulate counters and tokens they control.
- Use End Turn to create a public checkpoint.
- Request an undo or referee review.

### Referee

- View both hands when explicitly entering referee view.
- Move or reveal any card, adjust any counter, restore a checkpoint, pause play, and resolve a dispute.
- Mark corrections with a reason. Referee mutations remain visible in the audit log.

### Spectators

- Receive public state only.
- Never receive hidden card identities through page data, APIs, WebSocket events, screenshots, or clip frames.

## Discord Activity

- Launch from a match embed or Discord Activity invite.
- Resolve the Activity instance and linked SPMT/DiscordStreamHub identity.
- Seat assignment requires an invitation or referee approval.
- Reconnection restores the same server-owned state and seat.
- A game picker creates either a Pokémon or Quackverse table from the same Activity shell.
- Match controls and system replies use the ecosystem's standardized Discord embed layout.

## Play-by-play publishing

Small drag operations update the live table but do not post to Discord.

End Turn:

1. Commits an immutable checkpoint with a monotonic turn/event number.
2. Renders spectator-safe before and after states.
3. Produces a PNG immediately.
4. Optionally produces a 3–5 second MP4/WebM transition using Playwright frames and FFmpeg.
5. Updates one permanent Live Match embed.
6. Posts the turn media and summary into a dedicated match thread.
7. Publishes the same checkpoint to the OBS spectator feed.

If clip creation is delayed or fails, the screenshot is posted first. Media generation is idempotent by session and checkpoint ID so retries cannot duplicate a turn.

## OBS and browser spectator surface

- `/card-table/overlay/[sessionId]` renders public state with transparent and broadcast layouts.
- SSE or WebSocket events update it live; Discord attachments are not used as the live transport.
- Query options control player names, score/counter panels, latest-action banner, camera-safe margins, and resolution.
- A replay mode can step through committed checkpoints for tournament recaps.

## Persistence and concurrency

- Server-owned append-only actions plus materialized current state.
- Compare-and-swap version on every mutation.
- Idempotency key on each client action.
- Per-session mutation lock.
- Checkpoint restore creates a new audited action rather than deleting history.
- Archived sessions remain replayable and exportable.

## Next-push delivery slices

1. Extract the existing Quackverse table into the neutral state/action contract.
2. Add secure roles, private-hand projections, versioned actions, referee correction, and checkpoint restore.
3. Add the Pokémon adapter and linked deck import.
4. Add the Discord Activity game picker, seating, reconnect, and match embed.
5. Add End Turn screenshots, match-thread publishing, and permanent embed updates.
6. Add the OBS spectator route.
7. Add optional FFmpeg turn clips after screenshot delivery is proven reliable.

## Acceptance gates

- A Pokémon deck and a Quackverse deck can each complete a two-player manual tabletop session.
- Hidden cards never appear in spectator/opponent responses or captured media.
- Two simultaneous actions cannot silently overwrite each other.
- A referee can correct and restore state with an auditable reason.
- Every End Turn creates exactly one checkpoint and one thread entry.
- Screenshot fallback works when FFmpeg is unavailable.
- OBS and Discord show the same committed public state.
- Rejoining the Activity restores the same match rather than creating a duplicate room.
