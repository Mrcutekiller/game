export enum Move {
  ROCK = 'ROCK',
  PAPER = 'PAPER',
  SCISSORS = 'SCISSORS',
}

export enum GameMode {
  VS_CPU = 'VS_CPU',
  VS_FRIEND = 'VS_FRIEND',
  ONLINE = 'ONLINE', // New online mode
}

export enum GameState {
  SETUP = 'SETUP', // Entering Name
  MENU = 'MENU',
  LOBBY = 'LOBBY', // Host/Join Room
  WAITING_FOR_OPPONENT = 'WAITING_FOR_OPPONENT', // In online game, waiting for connection
  P1_TURN = 'P1_TURN',
  TRANSITION = 'TRANSITION', // For passing device in local multiplayer
  P2_TURN = 'P2_TURN',
  ONLINE_MATCH = 'ONLINE_MATCH', // Active online gameplay
  RESULT = 'RESULT',
}

export interface Score {
  p1: number;
  p2: number;
}

export type Player = 'Player 1' | 'Player 2' | 'Gemini AI' | string;

// Network types
export type NetworkMessage = 
  | { type: 'HANDSHAKE'; name: string }
  | { type: 'MOVE'; move: Move }
  | { type: 'PLAY_AGAIN' };
