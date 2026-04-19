
export type Player = {
  id: string;
  twitchUsername: string;
  avatarUrl: string;
  score: number;
  communityPoints: number;
  isIt: boolean;
  isActive: boolean;
  tagImmunityUntil?: number | null;
  lastTaggedInStreamId?: string | null;
  sleepingImmunity?: boolean;
  offlineImmunity?: boolean;
  noTagbackFrom?: string | null;
  timedImmunityUntil?: number | null;
};

export type BingoCardState = {
  phrases: (string | null)[];
  covered: (string | null)[];
  lastGenerated: number;
};

export type GameSettings = {
  twitchClientId?: string;
  twitchClientSecret?: string;
  discordBotToken?: string;
  discordServerId?: string;
  twitchBotToken?: string;
  discordChannelId?: string;
  discordWebhookUrl?: string;
  discordLeaderboardMessageId?: string;
  externalApiUrl?: string;
  tagSuccessPoints?: number;
  tagPenaltyPoints?: number;
  bingoSquarePoints?: number;
  bingoWinPoints?: number;
  bingoCardsCompleted?: number;
};

export type ChatTagEvent = {
  id: string;
  taggerId: string;
  taggedId: string;
  streamerId: string;
  timestamp: number;
};

export type BingoWinEvent = {
  id: string;
  userId: string;
  points: number;
  timestamp: number;
};
