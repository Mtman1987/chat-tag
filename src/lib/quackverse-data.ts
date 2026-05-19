export type QuackverseCard = {
  id: number;
  name: string;
  type: 'Duck' | 'Equipment';
  role: string | null;
  rarity: string | null;
  atk: number | null;
  def: number | null;
  spd: number | null;
  spc: number | null;
  hp: number | null;
  abilities: string[];
  effect: string | null;
  flavor: string;
  artUrl?: string;
};

export const quackverseCards = [
  {
    "id": 1,
    "name": "Captain Ranger Starlash",
    "type": "Duck",
    "role": "Commander",
    "rarity": "Legendary",
    "atk": 9,
    "def": 8,
    "spd": 7,
    "spc": 9,
    "hp": 16,
    "abilities": [
      "Starlash Strike: +3 damage.",
      "Command Aura: All allied Rangers gain +1 ATK for 2 turns."
    ],
    "effect": null,
    "flavor": "“To the stars — and don’t spare the splash.”"
  },
  {
    "id": 2,
    "name": "Galaxy Ranger",
    "type": "Duck",
    "role": "Scout",
    "rarity": "Epic",
    "atk": 7,
    "def": 6,
    "spd": 9,
    "spc": 6,
    "hp": 12,
    "abilities": [
      "Star Map Dash: Always goes first on turn 1.",
      "Cosmic Insight: Peek at opponent’s next card."
    ],
    "effect": null,
    "flavor": "“Every quack echoes across the galaxy.”"
  },
  {
    "id": 3,
    "name": "Ranger Web-Slap Master",
    "type": "Duck",
    "role": "Melee Specialist",
    "rarity": "Epic",
    "atk": 8,
    "def": 7,
    "spd": 6,
    "spc": 7,
    "hp": 14,
    "abilities": [
      "Photon Web: -2 SPD to enemy.",
      "Slap Combo: Attack twice at half ATK."
    ],
    "effect": null,
    "flavor": "“If it moves, I web it.”"
  },
  {
    "id": 4,
    "name": "Photon Ranger Featherbolt",
    "type": "Duck",
    "role": "Speed Striker",
    "rarity": "Rare",
    "atk": 7,
    "def": 5,
    "spd": 10,
    "spc": 7,
    "hp": 10,
    "abilities": [
      "Featherbolt Dash: Always attacks first.",
      "Lightning Plume: +2 ATK this turn."
    ],
    "effect": null,
    "flavor": "“Blink and you’ll miss the quack.”"
  },
  {
    "id": 5,
    "name": "Astro Ranger Downburst",
    "type": "Duck",
    "role": "Heavy Ranger",
    "rarity": "Rare",
    "atk": 8,
    "def": 9,
    "spd": 4,
    "spc": 6,
    "hp": 18,
    "abilities": [
      "Downburst Shockwave: Reduce enemy DEF by 2.",
      "Gravity Slam: +4 ATK if acting second."
    ],
    "effect": null,
    "flavor": "“Brace yourself — storm incoming.”"
  },
  {
    "id": 6,
    "name": "Ranger Cometfeather",
    "type": "Duck",
    "role": "Stealth Operative",
    "rarity": "Rare",
    "atk": 6,
    "def": 6,
    "spd": 8,
    "spc": 8,
    "hp": 12,
    "abilities": [
      "Comet Cloak: 50% dodge chance.",
      "Silent Strike: +3 ATK."
    ],
    "effect": null,
    "flavor": "“You never see the feather that gets you.”"
  },
  {
    "id": 7,
    "name": "Moonbeam McQuackers",
    "type": "Duck",
    "role": "Support",
    "rarity": "Uncommon",
    "atk": 4,
    "def": 5,
    "spd": 6,
    "spc": 9,
    "hp": 10,
    "abilities": [
      "Lunar Heal: Restore 4 HP.",
      "Moonbeam Glow: -2 ATK to enemy."
    ],
    "effect": null,
    "flavor": "“Shine bright, quack soft.”"
  },
  {
    "id": 8,
    "name": "Nebula Downfeather",
    "type": "Duck",
    "role": "Medic",
    "rarity": "Rare",
    "atk": 3,
    "def": 7,
    "spd": 5,
    "spc": 10,
    "hp": 14,
    "abilities": [
      "Nebula Mist: Heal 5 HP.",
      "Star-Soothe: Remove debuffs."
    ],
    "effect": null,
    "flavor": "“Breathe deep — the stars heal all.”"
  },
  {
    "id": 9,
    "name": "Voidwing Von Quack",
    "type": "Duck",
    "role": "Anti-Hero",
    "rarity": "Epic",
    "atk": 8,
    "def": 6,
    "spd": 7,
    "spc": 9,
    "hp": 12,
    "abilities": [
      "Void Cloak: +2 DEF.",
      "Shadow Rend: -3 DEF for 2 turns."
    ],
    "effect": null,
    "flavor": "“Light is overrated.”"
  },
  {
    "id": 10,
    "name": "Orbit O’Feathers",
    "type": "Duck",
    "role": "Engineer",
    "rarity": "Uncommon",
    "atk": 5,
    "def": 6,
    "spd": 5,
    "spc": 8,
    "hp": 12,
    "abilities": [
      "Orbital Repair: Heal 3 HP.",
      "Gadget Burst: +2 ATK and +2 SPD."
    ],
    "effect": null,
    "flavor": "“If it sparks, I can fix it.”"
  },
  {
    "id": 11,
    "name": "Milky Way Mallard",
    "type": "Duck",
    "role": "Navigator",
    "rarity": "Uncommon",
    "atk": 5,
    "def": 5,
    "spd": 6,
    "spc": 6,
    "hp": 10,
    "abilities": [
      "Star Compass: Look at top 2 cards.",
      "Cosmic Drift: +1 SPD to allies."
    ],
    "effect": null,
    "flavor": "“The universe is big — but I’ve got the map.”"
  },
  {
    "id": 12,
    "name": "Venus Von Quack",
    "type": "Duck",
    "role": "Diplomat",
    "rarity": "Uncommon",
    "atk": 4,
    "def": 6,
    "spd": 5,
    "spc": 8,
    "hp": 12,
    "abilities": [
      "Charm Pulse: Enemy loses next attack.",
      "Venus Glow: +2 DEF to ally."
    ],
    "effect": null,
    "flavor": "“Peace, love, and perfectly preened feathers.”"
  },
  {
    "id": 13,
    "name": "Quantum Quacker",
    "type": "Duck",
    "role": "Scientist",
    "rarity": "Rare",
    "atk": 6,
    "def": 4,
    "spd": 7,
    "spc": 10,
    "hp": 8,
    "abilities": [
      "Quantum Shift: Swap SPD with enemy.",
      "Time Loop: +1 ATK."
    ],
    "effect": null,
    "flavor": "“I was here before I arrived.”"
  },
  {
    "id": 14,
    "name": "Astro Waddle",
    "type": "Duck",
    "role": "Rookie",
    "rarity": "Common",
    "atk": 3,
    "def": 4,
    "spd": 4,
    "spc": 5,
    "hp": 8,
    "abilities": [
      "Accidental Genius: Random buff.",
      "Oops Strike: 50% double damage or miss."
    ],
    "effect": null,
    "flavor": "“I meant to do that… probably.”"
  },
  {
    "id": 15,
    "name": "Starlight Featherforge",
    "type": "Duck",
    "role": "Weaponsmith",
    "rarity": "Uncommon",
    "atk": 6,
    "def": 7,
    "spd": 4,
    "spc": 7,
    "hp": 14,
    "abilities": [
      "Forge Blessing: +2 ATK to ally.",
      "Starlight Armor: +3 DEF to self."
    ],
    "effect": null,
    "flavor": "“A good blade is forged in starlight.”"
  },
  {
    "id": 16,
    "name": "Quillwing Quasar",
    "type": "Duck",
    "role": "Aerial Ace",
    "rarity": "Rare",
    "atk": 7,
    "def": 5,
    "spd": 9,
    "spc": 6,
    "hp": 10,
    "abilities": [
      "Quasar Roll: Dodge next attack.",
      "Wing Burst: +3 ATK."
    ],
    "effect": null,
    "flavor": "“Catch me if you can — you won’t.”"
  },
  {
    "id": 17,
    "name": "Solar Eclipse Honkmaster",
    "type": "Duck",
    "role": "Villain-Turned-Ally",
    "rarity": "Rare",
    "atk": 8,
    "def": 6,
    "spd": 5,
    "spc": 8,
    "hp": 12,
    "abilities": [
      "Eclipse Horn: Stun all enemies.",
      "Totality Roar: -2 ATK to enemy."
    ],
    "effect": null,
    "flavor": "“Darkness falls — and so do your feathers.”"
  },
  {
    "id": 18,
    "name": "Eclipsewing Von Quack",
    "type": "Duck",
    "role": "Shadow Ranger",
    "rarity": "Epic",
    "atk": 7,
    "def": 6,
    "spd": 8,
    "spc": 9,
    "hp": 12,
    "abilities": [
      "Umbra Cloak: +2 DEF.",
      "Dark Plume: +4 ATK if HP < 6."
    ],
    "effect": null,
    "flavor": "“Light bends. I don’t.”"
  },
  {
    "id": 19,
    "name": "Shadowfeather Eclipse",
    "type": "Duck",
    "role": "Assassin",
    "rarity": "Rare",
    "atk": 9,
    "def": 4,
    "spd": 9,
    "spc": 8,
    "hp": 8,
    "abilities": [
      "Totality Strike: +4 damage if attacking first.",
      "Moonshadow Fade: +2 DEF."
    ],
    "effect": null,
    "flavor": "“In the shadow of the moon… I strike.”"
  },
  {
    "id": 20,
    "name": "Ranger of the Quackverse",
    "type": "Duck",
    "role": "Mythic Ranger",
    "rarity": "Legendary",
    "atk": 9,
    "def": 9,
    "spd": 6,
    "spc": 10,
    "hp": 18,
    "abilities": [
      "Quackverse Light: Heal all allies 3 HP.",
      "Cosmic Judgment: Deal 5 unavoidable damage."
    ],
    "effect": null,
    "flavor": "“Guardians rise when the cosmos calls.”"
  },
  {
    "id": 21,
    "name": "Starflare Ranger",
    "type": "Duck",
    "role": "Blaster Ranger",
    "rarity": "Rare",
    "atk": 8,
    "def": 5,
    "spd": 7,
    "spc": 8,
    "hp": 10,
    "abilities": [
      "Solar Shot: +2 damage.",
      "Radiant Burst: Blind enemy (-2 SPD)."
    ],
    "effect": null,
    "flavor": "“Burn bright, strike fast.”"
  },
  {
    "id": 22,
    "name": "Comet Drake",
    "type": "Duck",
    "role": "Speed Ranger",
    "rarity": "Uncommon",
    "atk": 6,
    "def": 4,
    "spd": 10,
    "spc": 6,
    "hp": 8,
    "abilities": [
      "Comet Dash: Move twice.",
      "Tailfire: +1 ATK per turn (max +3)."
    ],
    "effect": null,
    "flavor": "“A streak of feathers and fury.”"
  },
  {
    "id": 23,
    "name": "Nebula Quillcaster",
    "type": "Duck",
    "role": "Mystic",
    "rarity": "Rare",
    "atk": 5,
    "def": 6,
    "spd": 5,
    "spc": 10,
    "hp": 12,
    "abilities": [
      "Nebula Surge: +3 SPC this turn.",
      "Starbind: Root enemy in place."
    ],
    "effect": null,
    "flavor": "“Magic is just science with flair.”"
  },
  {
    "id": 24,
    "name": "Ranger Ironplume",
    "type": "Duck",
    "role": "Tank Ranger",
    "rarity": "Uncommon",
    "atk": 5,
    "def": 9,
    "spd": 3,
    "spc": 6,
    "hp": 18,
    "abilities": [
      "Iron Guard: +2 DEF.",
      "Plume Shield: Block next attack."
    ],
    "effect": null,
    "flavor": "“Steel is temporary. Feathers endure.”"
  },
  {
    "id": 25,
    "name": "Void Drake",
    "type": "Duck",
    "role": "Eclipse Warrior",
    "rarity": "Rare",
    "atk": 8,
    "def": 5,
    "spd": 7,
    "spc": 9,
    "hp": 10,
    "abilities": [
      "Void Slash: +3 damage.",
      "Eclipse Veil: -1 SPC to all enemies."
    ],
    "effect": null,
    "flavor": "“The void whispers.”"
  },
  {
    "id": 26,
    "name": "Ranger Starbreaker",
    "type": "Duck",
    "role": "Heavy Ranger",
    "rarity": "Epic",
    "atk": 9,
    "def": 8,
    "spd": 4,
    "spc": 7,
    "hp": 16,
    "abilities": [
      "Starbreaker Smash: +4 damage.",
      "Gravity Anchor: Reduce enemy SPD by 3."
    ],
    "effect": null,
    "flavor": "“The cosmos trembles.”"
  },
  {
    "id": 27,
    "name": "Lunar Waddle",
    "type": "Duck",
    "role": "Support",
    "rarity": "Common",
    "atk": 3,
    "def": 4,
    "spd": 5,
    "spc": 7,
    "hp": 8,
    "abilities": [
      "Lunar Blessing: Heal 2 HP.",
      "Soft Glow: +1 DEF to ally."
    ],
    "effect": null,
    "flavor": "“Gentle light, gentle quack.”"
  },
  {
    "id": 28,
    "name": "Ranger Flashplume",
    "type": "Duck",
    "role": "Speed Ranger",
    "rarity": "Uncommon",
    "atk": 6,
    "def": 4,
    "spd": 9,
    "spc": 6,
    "hp": 8,
    "abilities": [
      "Flash Step: Dodge next attack.",
      "Feather Flash: +2 SPD."
    ],
    "effect": null,
    "flavor": "“Fast enough to outrun light.”"
  },
  {
    "id": 29,
    "name": "Eclipse Drake",
    "type": "Duck",
    "role": "Shadow Warrior",
    "rarity": "Rare",
    "atk": 8,
    "def": 5,
    "spd": 8,
    "spc": 8,
    "hp": 10,
    "abilities": [
      "Dark Rend: -2 DEF.",
      "Eclipse Cloak: +2 DEF."
    ],
    "effect": null,
    "flavor": "“Darkness is my ally.”"
  },
  {
    "id": 30,
    "name": "Ranger Skyforge",
    "type": "Duck",
    "role": "Weaponsmith Ranger",
    "rarity": "Uncommon",
    "atk": 6,
    "def": 7,
    "spd": 4,
    "spc": 7,
    "hp": 14,
    "abilities": [
      "Forge Spark: +1 ATK to all allies.",
      "Sky Armor: +2 DEF to self."
    ],
    "effect": null,
    "flavor": "“Crafted in the clouds.”"
  },
  {
    "id": 31,
    "name": "Cosmic Drake",
    "type": "Duck",
    "role": "Cosmic Warrior",
    "rarity": "Rare",
    "atk": 7,
    "def": 6,
    "spd": 6,
    "spc": 8,
    "hp": 12,
    "abilities": [
      "Cosmic Pulse: +2 SPC.",
      "Starfall: Deal 2 damage to all enemies."
    ],
    "effect": null,
    "flavor": "“The universe answers my call.”"
  },
  {
    "id": 32,
    "name": "Ranger Thunderquill",
    "type": "Duck",
    "role": "Electric Ranger",
    "rarity": "Rare",
    "atk": 8,
    "def": 5,
    "spd": 8,
    "spc": 7,
    "hp": 10,
    "abilities": [
      "Thunder Strike: +3 damage.",
      "Static Field: -1 SPD to enemies."
    ],
    "effect": null,
    "flavor": "“Shock and quack.”"
  },
  {
    "id": 33,
    "name": "Solar Drake",
    "type": "Duck",
    "role": "Solar Warrior",
    "rarity": "Rare",
    "atk": 8,
    "def": 6,
    "spd": 6,
    "spc": 8,
    "hp": 12,
    "abilities": [
      "Solar Flare: Blind enemy.",
      "Radiant Heal: Heal 3 HP."
    ],
    "effect": null,
    "flavor": "“Burn with purpose.”"
  },
  {
    "id": 34,
    "name": "Ranger Frostplume",
    "type": "Duck",
    "role": "Ice Ranger",
    "rarity": "Uncommon",
    "atk": 6,
    "def": 6,
    "spd": 5,
    "spc": 8,
    "hp": 12,
    "abilities": [
      "Frost Shot: -2 SPD to enemy.",
      "Ice Shield: +2 DEF."
    ],
    "effect": null,
    "flavor": "“Cold as the void.”"
  },
  {
    "id": 35,
    "name": "Meteor Mallard",
    "type": "Duck",
    "role": "Impact Striker",
    "rarity": "Rare",
    "atk": 9,
    "def": 5,
    "spd": 6,
    "spc": 6,
    "hp": 10,
    "abilities": [
      "Meteor Crash: +4 damage.",
      "Dust Cloud: Enemy -1 ATK."
    ],
    "effect": null,
    "flavor": "“Incoming!”"
  },
  {
    "id": 36,
    "name": "Ranger Starflare",
    "type": "Duck",
    "role": "Fire Ranger",
    "rarity": "Uncommon",
    "atk": 7,
    "def": 5,
    "spd": 6,
    "spc": 7,
    "hp": 10,
    "abilities": [
      "Flame Shot: +2 damage.",
      "Heat Wave: -1 DEF to all enemies."
    ],
    "effect": null,
    "flavor": "“Burn bright.”"
  },
  {
    "id": 37,
    "name": "Voidfeather Assassin",
    "type": "Duck",
    "role": "Eclipse Assassin",
    "rarity": "Epic",
    "atk": 10,
    "def": 4,
    "spd": 10,
    "spc": 8,
    "hp": 8,
    "abilities": [
      "Void Strike: +5 damage.",
      "Shadow Step: +2 DEF."
    ],
    "effect": null,
    "flavor": "“Gone before you blink.”"
  },
  {
    "id": 38,
    "name": "Ranger Cloudburst",
    "type": "Duck",
    "role": "Weather Ranger",
    "rarity": "Uncommon",
    "atk": 5,
    "def": 6,
    "spd": 5,
    "spc": 8,
    "hp": 12,
    "abilities": [
      "Rain Shield: +2 DEF.",
      "Storm Bolt: +2 damage."
    ],
    "effect": null,
    "flavor": "“Weather is my weapon.”"
  },
  {
    "id": 39,
    "name": "Starseer Duck",
    "type": "Duck",
    "role": "Mystic",
    "rarity": "Rare",
    "atk": 5,
    "def": 5,
    "spd": 6,
    "spc": 10,
    "hp": 10,
    "abilities": [
      "Star Vision: See opponent’s hand.",
      "Fate Twist: Reroll random effects."
    ],
    "effect": null,
    "flavor": "“The stars whisper truth.”"
  },
  {
    "id": 40,
    "name": "Ranger Ironwing",
    "type": "Duck",
    "role": "Tank Ranger",
    "rarity": "Rare",
    "atk": 6,
    "def": 9,
    "spd": 3,
    "spc": 6,
    "hp": 18,
    "abilities": [
      "Iron Wall: +3 DEF.",
      "Steel Plume: Reduce damage taken by 2."
    ],
    "effect": null,
    "flavor": "“Unbreakable.”"
  },
  {
    "id": 41,
    "name": "Cosmic Waddle",
    "type": "Duck",
    "role": "Cosmic Support",
    "rarity": "Common",
    "atk": 3,
    "def": 4,
    "spd": 5,
    "spc": 7,
    "hp": 8,
    "abilities": [
      "Cosmic Glow: +1 SPC to ally.",
      "Star Sprinkle: Heal 1 HP."
    ],
    "effect": null,
    "flavor": "“A tiny spark of the universe.”"
  },
  {
    "id": 42,
    "name": "Ranger Emberquack",
    "type": "Duck",
    "role": "Fire Ranger",
    "rarity": "Uncommon",
    "atk": 7,
    "def": 5,
    "spd": 6,
    "spc": 7,
    "hp": 10,
    "abilities": [
      "Ember Shot: +2 damage.",
      "Flame Guard: +1 DEF."
    ],
    "effect": null,
    "flavor": "“Burning bright.”"
  },
  {
    "id": 43,
    "name": "Eclipse Whisper",
    "type": "Duck",
    "role": "Shadow Support",
    "rarity": "Rare",
    "atk": 4,
    "def": 5,
    "spd": 7,
    "spc": 9,
    "hp": 10,
    "abilities": [
      "Whisper Veil: -1 SPC to all enemies.",
      "Shadow Mend: Heal 3 HP."
    ],
    "effect": null,
    "flavor": "“Silence is power.”"
  },
  {
    "id": 44,
    "name": "Ranger Galeplume",
    "type": "Duck",
    "role": "Wind Ranger",
    "rarity": "Uncommon",
    "atk": 6,
    "def": 5,
    "spd": 9,
    "spc": 6,
    "hp": 10,
    "abilities": [
      "Gale Dash: Move twice.",
      "Feather Cyclone: -1 SPD to enemies."
    ],
    "effect": null,
    "flavor": "“Ride the wind.”"
  },
  {
    "id": 45,
    "name": "Starforge Drake",
    "type": "Duck",
    "role": "Weaponsmith",
    "rarity": "Rare",
    "atk": 7,
    "def": 7,
    "spd": 4,
    "spc": 7,
    "hp": 14,
    "abilities": [
      "Forge Fire: +2 ATK.",
      "Armor Plate: +2 DEF."
    ],
    "effect": null,
    "flavor": "“Crafted in stardust.”"
  },
  {
    "id": 46,
    "name": "Ranger Nightflare",
    "type": "Duck",
    "role": "Eclipse Ranger",
    "rarity": "Rare",
    "atk": 7,
    "def": 6,
    "spd": 7,
    "spc": 8,
    "hp": 12,
    "abilities": [
      "Night Slash: +3 damage.",
      "Eclipse Shield: +2 DEF."
    ],
    "effect": null,
    "flavor": "“Strike from the dark.”"
  },
  {
    "id": 47,
    "name": "Lunar Drake",
    "type": "Duck",
    "role": "Moon Warrior",
    "rarity": "Rare",
    "atk": 6,
    "def": 7,
    "spd": 6,
    "spc": 9,
    "hp": 14,
    "abilities": [
      "Lunar Beam: +3 SPC.",
      "Moon Heal: Heal 4 HP."
    ],
    "effect": null,
    "flavor": "“Moonlight guides me.”"
  },
  {
    "id": 48,
    "name": "Ranger Boltfeather",
    "type": "Duck",
    "role": "Electric Ranger",
    "rarity": "Uncommon",
    "atk": 7,
    "def": 5,
    "spd": 9,
    "spc": 6,
    "hp": 10,
    "abilities": [
      "Bolt Shot: +2 damage.",
      "Static Charge: -1 SPD to enemy."
    ],
    "effect": null,
    "flavor": "“Shockingly effective.”"
  },
  {
    "id": 49,
    "name": "Cosmic Drake Prime",
    "type": "Duck",
    "role": "Cosmic Elite",
    "rarity": "Epic",
    "atk": 9,
    "def": 7,
    "spd": 7,
    "spc": 10,
    "hp": 14,
    "abilities": [
      "Cosmic Nova: +5 damage.",
      "Starshield: +3 DEF."
    ],
    "effect": null,
    "flavor": "“Born from the heart of a star.”"
  },
  {
    "id": 50,
    "name": "Ranger Frostwing",
    "type": "Duck",
    "role": "Ice Ranger",
    "rarity": "Uncommon",
    "atk": 6,
    "def": 6,
    "spd": 5,
    "spc": 8,
    "hp": 12,
    "abilities": [
      "Frostbite: -2 SPD.",
      "Ice Armor: +2 DEF."
    ],
    "effect": null,
    "flavor": "“Cold and calculated.”"
  },
  {
    "id": 51,
    "name": "Meteor Drake",
    "type": "Duck",
    "role": "Impact Warrior",
    "rarity": "Rare",
    "atk": 9,
    "def": 5,
    "spd": 6,
    "spc": 6,
    "hp": 10,
    "abilities": [
      "Meteor Smash: +4 damage.",
      "Dust Storm: -1 ATK to enemies."
    ],
    "effect": null,
    "flavor": "“Impact imminent.”"
  },
  {
    "id": 52,
    "name": "Ranger Starflare Prime",
    "type": "Duck",
    "role": "Fire Elite",
    "rarity": "Epic",
    "atk": 9,
    "def": 6,
    "spd": 7,
    "spc": 9,
    "hp": 12,
    "abilities": [
      "Solar Burst: +4 damage.",
      "Flame Shield: +2 DEF."
    ],
    "effect": null,
    "flavor": "“Burn with purpose.”"
  },
  {
    "id": 53,
    "name": "Void Drake Prime",
    "type": "Duck",
    "role": "Eclipse Elite",
    "rarity": "Epic",
    "atk": 9,
    "def": 6,
    "spd": 8,
    "spc": 10,
    "hp": 12,
    "abilities": [
      "Void Rend: +5 damage.",
      "Eclipse Barrier: +2 DEF."
    ],
    "effect": null,
    "flavor": ""
  },
  {
    "id": 54,
    "name": "Ranger Stormfeather",
    "type": "Duck",
    "role": "Weather Ranger",
    "rarity": "Rare",
    "atk": 7,
    "def": 6,
    "spd": 7,
    "spc": 8,
    "hp": 12,
    "abilities": [
      "Storm Strike: +3 damage.",
      "Thundercloud: -1 SPD to all enemies."
    ],
    "effect": null,
    "flavor": "“The storm follows me.”"
  },
  {
    "id": 55,
    "name": "Eclipse Nightquill",
    "type": "Duck",
    "role": "Shadow Assassin",
    "rarity": "Rare",
    "atk": 8,
    "def": 5,
    "spd": 9,
    "spc": 8,
    "hp": 10,
    "abilities": [
      "Night Slash: +3 damage.",
      "Shadow Melt: +2 DEF."
    ],
    "effect": null,
    "flavor": "“Silent. Deadly. Gone.”"
  },
  {
    "id": 56,
    "name": "Ranger Solarforge",
    "type": "Duck",
    "role": "Solar Ranger",
    "rarity": "Epic",
    "atk": 9,
    "def": 7,
    "spd": 6,
    "spc": 9,
    "hp": 14,
    "abilities": [
      "Solar Hammer: +4 damage.",
      "Radiant Shield: +3 DEF."
    ],
    "effect": null,
    "flavor": "“Forged in sunlight.”"
  },
  {
    "id": 57,
    "name": "Cosmic Plume Sage",
    "type": "Duck",
    "role": "Cosmic Support",
    "rarity": "Rare",
    "atk": 4,
    "def": 6,
    "spd": 5,
    "spc": 10,
    "hp": 12,
    "abilities": [
      "Star Wisdom: +2 SPC to all allies.",
      "Cosmic Heal: Restore 4 HP."
    ],
    "effect": null,
    "flavor": "“Knowledge is the brightest star.”"
  },
  {
    "id": 58,
    "name": "Ranger Emberstrike",
    "type": "Duck",
    "role": "Fire Ranger",
    "rarity": "Uncommon",
    "atk": 7,
    "def": 5,
    "spd": 7,
    "spc": 7,
    "hp": 10,
    "abilities": [
      "Ember Shot: +2 damage.",
      "Heat Shield: +1 DEF."
    ],
    "effect": null,
    "flavor": "“Burn with precision.”"
  },
  {
    "id": 59,
    "name": "Voidflare Drake",
    "type": "Duck",
    "role": "Eclipse Warrior",
    "rarity": "Rare",
    "atk": 8,
    "def": 6,
    "spd": 7,
    "spc": 9,
    "hp": 12,
    "abilities": [
      "Voidflare: +3 SPC.",
      "Dark Pulse: -2 ATK to enemy."
    ],
    "effect": null,
    "flavor": "“The void burns brighter.”"
  },
  {
    "id": 60,
    "name": "Ranger Froststrike",
    "type": "Duck",
    "role": "Ice Ranger",
    "rarity": "Uncommon",
    "atk": 6,
    "def": 6,
    "spd": 5,
    "spc": 8,
    "hp": 12,
    "abilities": [
      "Frostbite: -2 SPD.",
      "Ice Wall: +2 DEF."
    ],
    "effect": null,
    "flavor": "“Cold justice.”"
  },
  {
    "id": 61,
    "name": "Meteor Quill",
    "type": "Duck",
    "role": "Impact Striker",
    "rarity": "Rare",
    "atk": 9,
    "def": 5,
    "spd": 6,
    "spc": 6,
    "hp": 10,
    "abilities": [
      "Meteor Dive: +4 damage.",
      "Dust Veil: -1 ATK to enemies."
    ],
    "effect": null,
    "flavor": "“Impact imminent.”"
  },
  {
    "id": 62,
    "name": "Ranger Skyflare",
    "type": "Duck",
    "role": "Fire Ranger",
    "rarity": "Uncommon",
    "atk": 7,
    "def": 5,
    "spd": 6,
    "spc": 7,
    "hp": 10,
    "abilities": [
      "Flame Shot: +2 damage.",
      "Heat Wave: -1 DEF to all enemies."
    ],
    "effect": null,
    "flavor": "“Burn the sky.”"
  },
  {
    "id": 63,
    "name": "Eclipse Whisperwing",
    "type": "Duck",
    "role": "Shadow Support",
    "rarity": "Rare",
    "atk": 4,
    "def": 5,
    "spd": 7,
    "spc": 9,
    "hp": 10,
    "abilities": [
      "Whisper Veil: -1 SPC to all enemies.",
      "Shadow Mend: Heal 3 HP."
    ],
    "effect": null,
    "flavor": "“Silence is strength.”"
  },
  {
    "id": 64,
    "name": "Ranger Galeclaw",
    "type": "Duck",
    "role": "Wind Ranger",
    "rarity": "Uncommon",
    "atk": 6,
    "def": 5,
    "spd": 9,
    "spc": 6,
    "hp": 10,
    "abilities": [
      "Gale Dash: Move twice.",
      "Cyclone Burst: -1 SPD to enemies."
    ],
    "effect": null,
    "flavor": "“Ride the storm.”"
  },
  {
    "id": 65,
    "name": "Starforge Mallard",
    "type": "Duck",
    "role": "Weaponsmith",
    "rarity": "Rare",
    "atk": 7,
    "def": 7,
    "spd": 4,
    "spc": 7,
    "hp": 14,
    "abilities": [
      "Forge Fire: +2 ATK.",
      "Armor Plate: +2 DEF."
    ],
    "effect": null,
    "flavor": "“Crafted in stardust.”"
  },
  {
    "id": 66,
    "name": "Ranger Nightflare Prime",
    "type": "Duck",
    "role": "Eclipse Ranger Elite",
    "rarity": "Epic",
    "atk": 8,
    "def": 6,
    "spd": 8,
    "spc": 9,
    "hp": 12,
    "abilities": [
      "Nightfall Slash: +4 damage.",
      "Eclipse Barrier: +2 DEF."
    ],
    "effect": null,
    "flavor": "“Darkness obeys.”"
  },
  {
    "id": 67,
    "name": "Lunar Quillmaster",
    "type": "Duck",
    "role": "Moon Warrior",
    "rarity": "Rare",
    "atk": 6,
    "def": 7,
    "spd": 6,
    "spc": 9,
    "hp": 14,
    "abilities": [
      "Lunar Beam: +3 SPC.",
      "Moon Heal: Heal 4 HP."
    ],
    "effect": null,
    "flavor": "“Moonlight guides my strike.”"
  },
  {
    "id": 68,
    "name": "Ranger Boltstrike",
    "type": "Duck",
    "role": "Electric Ranger",
    "rarity": "Uncommon",
    "atk": 7,
    "def": 5,
    "spd": 9,
    "spc": 6,
    "hp": 10,
    "abilities": [
      "Bolt Shot: +2 damage.",
      "Static Charge: -1 SPD to enemy."
    ],
    "effect": null,
    "flavor": "“Shock and awe.”"
  },
  {
    "id": 69,
    "name": "Cosmic Drake Ultra",
    "type": "Duck",
    "role": "Cosmic Elite",
    "rarity": "Epic",
    "atk": 9,
    "def": 7,
    "spd": 7,
    "spc": 10,
    "hp": 14,
    "abilities": [
      "Cosmic Nova: +5 damage.",
      "Starshield: +3 DEF."
    ],
    "effect": null,
    "flavor": "“Born from the heart of a star.”"
  },
  {
    "id": 70,
    "name": "Ranger Frostclaw",
    "type": "Duck",
    "role": "Ice Ranger",
    "rarity": "Uncommon",
    "atk": 6,
    "def": 6,
    "spd": 5,
    "spc": 8,
    "hp": 12,
    "abilities": [
      "Frostbite: -2 SPD.",
      "Ice Armor: +2 DEF."
    ],
    "effect": null,
    "flavor": "“Cold precision.”"
  },
  {
    "id": 71,
    "name": "Meteor Drake Ultra",
    "type": "Duck",
    "role": "Impact Elite",
    "rarity": "Epic",
    "atk": 10,
    "def": 5,
    "spd": 7,
    "spc": 7,
    "hp": 10,
    "abilities": [
      "Meteor Impact: +5 damage.",
      "Shockwave: -1 ATK to all enemies."
    ],
    "effect": null,
    "flavor": "“Impact beyond measure.”"
  },
  {
    "id": 72,
    "name": "Ranger Starflare Ultra",
    "type": "Duck",
    "role": "Fire Elite",
    "rarity": "Epic",
    "atk": 9,
    "def": 6,
    "spd": 7,
    "spc": 9,
    "hp": 12,
    "abilities": [
      "Solar Burst: +4 damage.",
      "Flame Shield: +2 DEF."
    ],
    "effect": null,
    "flavor": "“Burn with purpose.”"
  },
  {
    "id": 73,
    "name": "Void Drake Ultra",
    "type": "Duck",
    "role": "Eclipse Elite",
    "rarity": "Epic",
    "atk": 9,
    "def": 6,
    "spd": 8,
    "spc": 10,
    "hp": 12,
    "abilities": [
      "Void Rend: +5 damage.",
      "Eclipse Barrier: +2 DEF."
    ],
    "effect": null,
    "flavor": "“The void consumes.”"
  },
  {
    "id": 74,
    "name": "Ranger Cloudstrike",
    "type": "Duck",
    "role": "Weather Ranger",
    "rarity": "Uncommon",
    "atk": 5,
    "def": 6,
    "spd": 5,
    "spc": 8,
    "hp": 12,
    "abilities": [
      "Rain Shield: +2 DEF.",
      "Storm Bolt: +2 damage."
    ],
    "effect": null,
    "flavor": "“Weather is my weapon.”"
  },
  {
    "id": 75,
    "name": "Starseer Prime",
    "type": "Duck",
    "role": "Mystic Elite",
    "rarity": "Epic",
    "atk": 6,
    "def": 6,
    "spd": 7,
    "spc": 10,
    "hp": 12,
    "abilities": [
      "Star Vision: See opponent’s hand.",
      "Fate Rewrite: Change any random effect."
    ],
    "effect": null,
    "flavor": "“The stars obey.”"
  },
  {
    "id": 76,
    "name": "Ranger Ironplume Prime",
    "type": "Duck",
    "role": "Tank Elite",
    "rarity": "Epic",
    "atk": 6,
    "def": 10,
    "spd": 3,
    "spc": 7,
    "hp": 20,
    "abilities": [
      "Iron Fortress: +4 DEF.",
      "Steel Resolve: Reduce all damage by 2."
    ],
    "effect": null,
    "flavor": "“Unbreakable.”"
  },
  {
    "id": 77,
    "name": "Cosmic Waddle Prime",
    "type": "Duck",
    "role": "Cosmic Support Elite",
    "rarity": "Rare",
    "atk": 4,
    "def": 6,
    "spd": 6,
    "spc": 9,
    "hp": 12,
    "abilities": [
      "Cosmic Blessing: +2 SPC to ally.",
      "Star Mend: Heal 3 HP."
    ],
    "effect": null,
    "flavor": "“A spark of infinity.”"
  },
  {
    "id": 78,
    "name": "Ranger Emberflare",
    "type": "Duck",
    "role": "Fire Ranger",
    "rarity": "Uncommon",
    "atk": 7,
    "def": 5,
    "spd": 6,
    "spc": 7,
    "hp": 10,
    "abilities": [
      "Ember Shot: +2 damage.",
      "Flame Guard: +1 DEF."
    ],
    "effect": null,
    "flavor": "“Burn bright.”"
  },
  {
    "id": 79,
    "name": "Eclipse Whisper Prime",
    "type": "Duck",
    "role": "Shadow Support Elite",
    "rarity": "Epic",
    "atk": 5,
    "def": 6,
    "spd": 8,
    "spc": 10,
    "hp": 12,
    "abilities": [
      "Whisper Shroud: -1 SPC to all enemies.",
      "Shadow Heal: Heal 4 HP."
    ],
    "effect": null,
    "flavor": "“Silence is absolute.”"
  },
  {
    "id": 80,
    "name": "Ranger Galeprime",
    "type": "Duck",
    "role": "Wind Elite",
    "rarity": "Epic",
    "atk": 7,
    "def": 6,
    "spd": 10,
    "spc": 7,
    "hp": 12,
    "abilities": [
      "Gale Burst: Move twice.",
      "Cyclone Storm: -2 SPD to all enemies."
    ],
    "effect": null,
    "flavor": "“Ride the cosmic winds.”"
  },
  {
    "id": 81,
    "name": "Photon-Web Gauntlets",
    "type": "Equipment",
    "role": null,
    "rarity": null,
    "atk": null,
    "def": null,
    "spd": null,
    "spc": null,
    "hp": null,
    "abilities": [],
    "effect": "+2 ATK.",
    "flavor": "“Stick and strike.”"
  },
  {
    "id": 82,
    "name": "Nebula-Mist Injector",
    "type": "Equipment",
    "role": null,
    "rarity": null,
    "atk": null,
    "def": null,
    "spd": null,
    "spc": null,
    "hp": null,
    "abilities": [],
    "effect": "Heal 3 HP per turn.",
    "flavor": "“Breathe the stars.”"
  },
  {
    "id": 83,
    "name": "Eclipse Cloak",
    "type": "Equipment",
    "role": null,
    "rarity": null,
    "atk": null,
    "def": null,
    "spd": null,
    "spc": null,
    "hp": null,
    "abilities": [],
    "effect": "+2 DEF.",
    "flavor": "“Shadow-woven.”"
  },
  {
    "id": 84,
    "name": "Featherforge Armor",
    "type": "Equipment",
    "role": null,
    "rarity": null,
    "atk": null,
    "def": null,
    "spd": null,
    "spc": null,
    "hp": null,
    "abilities": [],
    "effect": "+3 DEF.",
    "flavor": "“Forged in starlight.”"
  },
  {
    "id": 85,
    "name": "Comet-Trail Boots",
    "type": "Equipment",
    "role": null,
    "rarity": null,
    "atk": null,
    "def": null,
    "spd": null,
    "spc": null,
    "hp": null,
    "abilities": [],
    "effect": "+2 SPD.",
    "flavor": "“Run like a comet.”"
  },
  {
    "id": 86,
    "name": "Starshield Bracer",
    "type": "Equipment",
    "role": null,
    "rarity": null,
    "atk": null,
    "def": null,
    "spd": null,
    "spc": null,
    "hp": null,
    "abilities": [],
    "effect": "Reduce damage by 2.",
    "flavor": "“A shield of light.”"
  },
  {
    "id": 87,
    "name": "Void-Touched Blade",
    "type": "Equipment",
    "role": null,
    "rarity": null,
    "atk": null,
    "def": null,
    "spd": null,
    "spc": null,
    "hp": null,
    "abilities": [],
    "effect": "+3 ATK, -1 DEF.",
    "flavor": "“Power at a price.”"
  },
  {
    "id": 88,
    "name": "Lunar Charm",
    "type": "Equipment",
    "role": null,
    "rarity": null,
    "atk": null,
    "def": null,
    "spd": null,
    "spc": null,
    "hp": null,
    "abilities": [],
    "effect": "+2 SPC.",
    "flavor": "“Moonlit magic.”"
  },
  {
    "id": 89,
    "name": "Solar Core Battery",
    "type": "Equipment",
    "role": null,
    "rarity": null,
    "atk": null,
    "def": null,
    "spd": null,
    "spc": null,
    "hp": null,
    "abilities": [],
    "effect": "Ability cooldown reduced by 1.",
    "flavor": "“Burn brighter.”"
  },
  {
    "id": 90,
    "name": "Gravity Anchor",
    "type": "Equipment",
    "role": null,
    "rarity": null,
    "atk": null,
    "def": null,
    "spd": null,
    "spc": null,
    "hp": null,
    "abilities": [],
    "effect": "Enemy SPD -2 when adjacent.",
    "flavor": "“Hold your ground.”"
  },
  {
    "id": 91,
    "name": "Starforge Hammer",
    "type": "Equipment",
    "role": null,
    "rarity": null,
    "atk": null,
    "def": null,
    "spd": null,
    "spc": null,
    "hp": null,
    "abilities": [],
    "effect": "+2 ATK, +1 DEF.",
    "flavor": "“Crafted for war.”"
  },
  {
    "id": 92,
    "name": "Nebula Lens",
    "type": "Equipment",
    "role": null,
    "rarity": null,
    "atk": null,
    "def": null,
    "spd": null,
    "spc": null,
    "hp": null,
    "abilities": [],
    "effect": "See opponent’s top card.",
    "flavor": "“Peer into infinity.”"
  },
  {
    "id": 93,
    "name": "Eclipse Fang",
    "type": "Equipment",
    "role": null,
    "rarity": null,
    "atk": null,
    "def": null,
    "spd": null,
    "spc": null,
    "hp": null,
    "abilities": [],
    "effect": "+3 damage on first attack.",
    "flavor": "“Strike from darkness.”"
  },
  {
    "id": 94,
    "name": "Cosmic Beacon",
    "type": "Equipment",
    "role": null,
    "rarity": null,
    "atk": null,
    "def": null,
    "spd": null,
    "spc": null,
    "hp": null,
    "abilities": [],
    "effect": "Allies gain +1 SPC.",
    "flavor": "“Guide the cosmos.”"
  },
  {
    "id": 95,
    "name": "Meteor Buckler",
    "type": "Equipment",
    "role": null,
    "rarity": null,
    "atk": null,
    "def": null,
    "spd": null,
    "spc": null,
    "hp": null,
    "abilities": [],
    "effect": "Block next attack.",
    "flavor": "“Impact-proof.”"
  },
  {
    "id": 96,
    "name": "Frostcore Pendant",
    "type": "Equipment",
    "role": null,
    "rarity": null,
    "atk": null,
    "def": null,
    "spd": null,
    "spc": null,
    "hp": null,
    "abilities": [],
    "effect": "Enemy SPD -1.",
    "flavor": "“Cold as the void.”"
  },
  {
    "id": 97,
    "name": "Thundercoil Wraps",
    "type": "Equipment",
    "role": null,
    "rarity": null,
    "atk": null,
    "def": null,
    "spd": null,
    "spc": null,
    "hp": null,
    "abilities": [],
    "effect": "+1 ATK, enemy SPD -1.",
    "flavor": "“Shock and awe.”"
  },
  {
    "id": 98,
    "name": "Starflare Gauntlet",
    "type": "Equipment",
    "role": null,
    "rarity": null,
    "atk": null,
    "def": null,
    "spd": null,
    "spc": null,
    "hp": null,
    "abilities": [],
    "effect": "+2 ATK, +1 SPD.",
    "flavor": "“Burn fast.”"
  },
  {
    "id": 99,
    "name": "Voidstone Amulet",
    "type": "Equipment",
    "role": null,
    "rarity": null,
    "atk": null,
    "def": null,
    "spd": null,
    "spc": null,
    "hp": null,
    "abilities": [],
    "effect": "+1 DEF.",
    "flavor": "“The void protects.”"
  },
  {
    "id": 100,
    "name": "Cosmic Stabilizer",
    "type": "Equipment",
    "role": null,
    "rarity": null,
    "atk": null,
    "def": null,
    "spd": null,
    "spc": null,
    "hp": null,
    "abilities": [],
    "effect": "Prevents random effects.",
    "flavor": "“Order in chaos.”"
  }
] satisfies QuackverseCard[];

export const quackverseDucks = quackverseCards.filter((card) => card.type === 'Duck');
export const quackverseEquipment = quackverseCards.filter((card) => card.type === 'Equipment');
