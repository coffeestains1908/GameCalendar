import { toInputDate } from '../time.js';

export const emptyForm = {
  title: '',
  gameMaster: '',
  gameMasterUid: '',
  game: '',
  gameColor: '#2f6df6',
  location: '',
  description: '',
  date: toInputDate(new Date()),
  startTime: '20:00',
  endDate: toInputDate(new Date()),
  endTime: '22:00',
  published: true,
  inviteEnabled: false,
};

export function bindForm(setForm, key) {
  return (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
}

export function selectGame(setForm, games, gameName) {
  const game = games.find((entry) => entry.name === gameName);
  setForm((current) => ({
    ...current,
    game: gameName,
    gameColor: game?.color || current.gameColor,
  }));
}

export function syncStartDate(setForm) {
  return (event) => {
    const value = event.target.value;
    setForm((current) => ({
      ...current,
      date: value,
      endDate: current.endDate < value ? value : current.endDate,
    }));
  };
}
