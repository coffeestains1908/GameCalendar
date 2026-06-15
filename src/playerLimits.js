export const DEFAULT_MAX_PLAYERS = 5;
export const MIN_MAX_PLAYERS = 1;
export const MAX_MAX_PLAYERS = 24;
export const PLAYER_LIMIT_EXCEEDED_MESSAGE = 'Player limit exceeded. Please contact your Game Master';

export function normalizeMaxPlayers(value) {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < MIN_MAX_PLAYERS || numberValue > MAX_MAX_PLAYERS) {
    return DEFAULT_MAX_PLAYERS;
  }
  return numberValue;
}

export function formatPlayerCapacity(playerCount, maxPlayers) {
  const count = Math.max(0, Number(playerCount) || 0);
  const limit = normalizeMaxPlayers(maxPlayers);
  return `${count}/${limit} ${count === 1 ? 'player' : 'players'} joining`;
}
