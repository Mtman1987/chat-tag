
import { FieldValue, Timestamp } from "firebase/firestore";
import type { Timestamp as AdminTimestamp } from 'firebase-admin/firestore';


export type Player = {
  id: string;
  twitchUsername: string;
  avatarUrl: string;
  score: number; // In-app game points
  communityPoints: number; // Points from external system
  isIt: boolean;
  isActive: boolean;
  tagImmunityUntil?: Timestamp | null;
  lastTaggedInStreamId?: string | null;
};

// Firestore Admin version of Player
export type AdminPlayer = Omit<Player, 'tagImmunityUntil'> & {
  tagImmunityUntil?: AdminTimestamp | null;
};


export type BingoCardState = {
  phrases: (string | null)[];
  covered: (string | null)[]; // Stores the ID of the player who claimed the square
  lastGenerated: FieldValue;
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
  timestamp: Timestamp;
};

export type AdminChatTagEvent = Omit<ChatTagEvent, 'timestamp'> & {
  timestamp: AdminTimestamp;
};

export type BingoWinEvent = {
  id: string;
  userId: string;
  points: number;
  timestamp: Timestamp;
};

export type AdminBingoWinEvent = Omit<BingoWinEvent, 'timestamp'> & {
  timestamp: AdminTimestamp;
};
