export type ChatTagSoundKey =
  | 'tag'
  | 'pass-used'
  | 'pass-granted'
  | 'ffa'
  | 'new-it'
  | 'leaderboard'
  | 'score'
  | 'live'
  | 'history'
  | 'message';

export const CHAT_TAG_SOUNDS: Record<ChatTagSoundKey, string> = {
  tag: '/sounds/chat-tag/tag.mp3',
  'pass-used': '/sounds/chat-tag/pass-used.mp3',
  'pass-granted': '/sounds/chat-tag/pass-granted.mp3',
  ffa: '/sounds/chat-tag/ffa.mp3',
  'new-it': '/sounds/chat-tag/new-it.mp3',
  leaderboard: '/sounds/chat-tag/leaderboard.mp3',
  score: '/sounds/chat-tag/score.mp3',
  live: '/sounds/chat-tag/live.mp3',
  history: '/sounds/chat-tag/history.mp3',
  message: '/sounds/chat-tag/message.mp3',
};

export function getChatTagSoundUrl(key: ChatTagSoundKey | undefined): string | null {
  return key ? CHAT_TAG_SOUNDS[key] || null : null;
}
