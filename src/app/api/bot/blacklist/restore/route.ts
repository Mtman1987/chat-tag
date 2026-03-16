import { NextResponse } from 'next/server';
import { updateAppState } from '@/lib/volume-store';

const LEGACY_BLACKLIST = [
  'sportyelastic96',
  'collectivesooth',
  'zinkybaby',
  'pondy_wlrus',
  'zakktheripperttv',
  'greeneagle_17',
  'vonage35',
  'beccca_boop',
  'notinmymomsbasement',
  'senyorbishop',
  'gamerat527',
  'toxickirbz23',
  'fast_cat_',
  'rabbit01xp',
];

export async function POST() {
  const added = await updateAppState((state) => {
    const existing = new Set((state.botSettings.blacklistedChannels.channels || []).map((c: string) => c.toLowerCase()));
    const toAdd = LEGACY_BLACKLIST.filter((c) => !existing.has(c));

    state.botSettings.blacklistedChannels.channels = Array.from(
      new Set([...(state.botSettings.blacklistedChannels.channels || []), ...LEGACY_BLACKLIST])
    );

    for (const channel of LEGACY_BLACKLIST) {
      delete state.botChannels[channel];
    }

    return toAdd;
  });

  return NextResponse.json({ success: true, restored: added.length, channels: added });
}