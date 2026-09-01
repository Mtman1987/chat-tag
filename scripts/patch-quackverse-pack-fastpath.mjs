import fs from 'node:fs';

const file = 'src/app/api/quackverse/pack/route.ts';
let source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

source = source.replace("import { lookupTwitchUser } from '@/lib/twitch';\n", '');

const lookupBlock = `  const twitchProfile = normalizedUsername ? await lookupTwitchUser(normalizedUsername).catch(() => null) : null;\n  const userRecordId = String(body?.twitchUserId || twitchProfile?.id || userId.replace(/^user_/, '') || '').trim();`;
const lookupReplacement = `  // Bot/session identity already carries Twitch's authoritative user id. Pack\n  // opening must not depend on a second external Twitch OAuth/user lookup.\n  const userRecordId = String(body?.twitchUserId || userId.replace(/^user_/, '') || '').trim();`;
if (source.includes(lookupBlock)) source = source.replace(lookupBlock, lookupReplacement);

source = source.replace(
  "avatarUrl: twitchProfile?.profile_image_url || body?.avatarUrl || body?.avatar || rootState.users[userRecordId]?.avatarUrl || '',",
  "avatarUrl: body?.avatarUrl || body?.avatar || rootState.users[userRecordId]?.avatarUrl || '',",
);

if (source.includes('lookupTwitchUser') || source.includes('twitchProfile')) {
  throw new Error('Quackverse pack fastpath patch did not remove the redundant Twitch lookup.');
}
if (!source.includes("const userRecordId = String(body?.twitchUserId || userId.replace(/^user_/, '') || '').trim();")) {
  throw new Error('Quackverse pack fastpath identity contract is missing.');
}

fs.writeFileSync(file, source, 'utf8');
console.log('Quackverse pack fastpath applied: no external Twitch lookup before pack open.');
