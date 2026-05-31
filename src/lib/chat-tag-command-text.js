const DEFAULT_GUIDE_URL = 'https://chat-tag-new.fly.dev/about';

function quoted(command) {
  return `"${command}"`;
}

function getPlayerHelpText(prefix = 'spmt') {
  return [
    `${quoted(`${prefix} join`)} = Join`,
    `${quoted(`${prefix} tag @user`)} = Tag`,
    `${quoted(`${prefix} pass @user`)} = Pass (earned)`,
    `${quoted(`${prefix} pack`)} = Open Quackverse pack`,
    `${quoted(`${prefix} status`)} = Who's it`,
    `${quoted(`${prefix} score`)} = Stats`,
    `${quoted(`${prefix} rank`)} = Top 3`,
    `${quoted(`${prefix} players`)} = List`,
    `${quoted(`${prefix} live`)} = Live`,
    `${quoted(`${prefix} away`)} = Toggle immunity`,
    `${quoted(`${prefix} rules`)} = Rules`,
    `Mods: ${quoted(`${prefix} mod`)}`,
  ].join(' | ');
}

function getRulesText(prefix = 'spmt', guideUrl = DEFAULT_GUIDE_URL) {
  return `Tag Rules: Tag someone with ${quoted(`${prefix} tag @user`)} in their chat. If you're it, tag someone else! ${quoted(`${prefix} away`)} = toggle immunity. ${quoted(`${prefix} pass @user`)} = earned double-points tag. Full guide: ${guideUrl}`;
}

function getModHelpText(prefix = 'spmt', surface = 'twitch') {
  if (surface === 'discord') {
    return `Mod/Admin commands: ${quoted(`${prefix} givepass @user`)}. Twitch-only tools: mute, unmute, kick, and optout.`;
  }

  return [
    `${quoted(`${prefix} givepass @user`)} = Give pass`,
    `${quoted(`${prefix} support`)} = Help ticket`,
    `${quoted(`${prefix} away @user`)} = Toggle away`,
    `${quoted(`${prefix} mute`)} = Toggle OBS overlay mode`,
  ].join(' | ');
}

module.exports = {
  getPlayerHelpText,
  getRulesText,
  getModHelpText,
};
