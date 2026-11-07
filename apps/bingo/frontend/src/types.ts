export type Mode = "manual" | "random";
export type Phase = "lobby" | "playing" | "finished";
export interface Player {
  id: string;
  name: string;
  color: number | null;
  connected: boolean;
  isHost: boolean;
  wordCount: number;
  ready: boolean;
  score: number;
}
export interface Cell {
  id: string;
  ownerId: string;
  word: string;
  sips: number | null;
  validated: boolean;
}
export interface Combination {
  id: string;
  kind: "row" | "column" | "diagonal";
  index: number;
  cellIds: string[];
  bonus: number;
  recipientIds: string[];
}
export interface PublicLobby {
  code: string;
  phase: Phase;
  players: Player[];
  budget: number;
  mode: Mode;
}
export interface Snapshot extends PublicLobby {
  revision: number;
  endReason: "automatic" | "manual" | null;
  round: number;
  size: number;
  hostId: string;
  selfId: string;
  hostConnected: boolean;
  canStart: boolean;
  startedAt: string | null;
  expiresAt: string | null;
  ownPreparation: { words: string[]; sips: number[] };
  cells: Cell[];
  combinations: Combination[];
}
export interface Session {
  code: string;
  playerId: string;
  token: string;
  hostKey: string | null;
}
export interface Activation {
  revision: number;
  combinations: Combination[];
}
