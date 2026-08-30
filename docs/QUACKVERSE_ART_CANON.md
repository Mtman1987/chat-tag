# Quackverse Art Canon

## Status

Quackverse card artwork is complete by default. Every card has a permanent, deterministic built-in static artwork endpoint and no external image-generation provider is required for gameplay, previews, packs, overlays, or admin use.

The canonical artwork URL for a card is:

`/api/quackverse/art/canon?cardId=<id>`

This applies to the full card catalog, including Duck character cards and Equipment cards.

## Canon hierarchy

Artwork must preserve the card's established identity in this order:

1. **Card identity and lore** — name, role, abilities/effect, and flavor establish the individual card.
2. **Family** — the gameplay family groups related cards and is never ignored when presenting their identity.
3. **Trunk / role** — the card's role controls combat silhouette and recognizable function. Tanks read heavy, assassins/scouts read fast and lean, commanders read authoritative, support/medic/mystic roles read lighter and more open, engineers/weaponsmiths read practical and tool-heavy.
4. **Visual affinity / faction language** — Radiant, Cosmic, Eclipse, Solar, Frost, Storm, Tide, Gale, Forge, and Meteor each have their own palette, armor/material language, and effects.
5. **Species and individual traits** — Duck character cards retain the species, plumage, body silhouette, armor language, signature weapon/focus, palette hierarchy, and VFX defined by `src/lib/quackverse-visual-canon.ts`.
6. **Equipment identity** — Equipment art is derived from the item name/effect and uses a recognizable equipment silhouette plus its matching affinity language.

A related family may share visual DNA, but individual cards must remain distinguishable. A card must never use artwork merely because it looks generally "space duck" compatible if it contradicts the card's canon.

## Permanent static artwork

`src/lib/quackverse-schema.ts` assigns every normalized card its built-in canonical artwork URL. This means a card cannot be created or loaded without a static-art fallback.

`src/app/api/quackverse/art/canon/route.ts` renders that artwork deterministically from the card data and visual canon. It does not call StreamWeaver, SeaArt, or another remote image service.

The built-in artwork is therefore:

- always available with the deployed application;
- stable for a given canon version;
- card-specific;
- family/trunk/class aware;
- affinity/faction aware;
- independent of API keys, provider credits, queues, or outages.

## Legacy artwork migration

Canon artwork version 2 retires the old partially seeded volume artwork.

On the first `/api/quackverse/art` load after deployment, if the stored canon version is older than version 2, the application:

1. removes the existing `quackverse-card-art` volume directory;
2. clears the old Quackverse art manifest;
3. records `quackverseCanonArtVersion = 2`;
4. exposes the built-in canonical static asset for every card.

This deliberately removes old images that may not match current lore and also fixes cards that never received artwork.

## Admin overrides

Admin upload remains available for deliberate replacements. A manually uploaded static or hover asset is an override, not a requirement for completeness.

Any replacement should only be accepted when it preserves the same family, trunk/role, affinity/faction, species, anatomy, palette, armor language, signature equipment, and other canonical traits. Removing an override must always reveal the built-in canon asset rather than a blank card.

## Animation / GIF second pass

Animation is optional enhancement only. Quackverse must never depend on GIF or video generation to be considered complete or playable.

If animated hover art is added later, use the already-established static canon as the source/reference and the existing FFmpeg pipeline to create a lightweight forward/reverse ping-pong loop. The animation must not redesign the character or equipment.

Until an approved animation exists, hover uses the same permanent static canon artwork. There is no missing-art state.

## Operational rule

Do not add a runtime dependency that regenerates artwork every time a card is displayed. Artwork is canon-first and persistent. External generation, if ever used again, is an admin authoring aid for a deliberate replacement and must not be part of the gameplay rendering path.
