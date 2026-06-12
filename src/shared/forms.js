import {
  dateKeyToMalaysiaDate,
  formatCompactDate,
  malaysiaInputToDate,
  toInputDate,
  toInputTime,
} from '../time.js';

const MS_PER_MINUTE = 60 * 1000;
const MINUTES_PER_DAY = 24 * 60;

export const EVENT_DATE_MODE_SINGLE = 'single';
export const EVENT_DATE_MODE_RANGE = 'range';

export const DURATION_PRESETS = [
  { value: 30, label: '30m' },
  { value: 60, label: '1h' },
  { value: 90, label: '1h 30m' },
  { value: 120, label: '2h' },
  { value: 180, label: '3h' },
  { value: 240, label: '4h' },
  { value: 360, label: '6h' },
  { value: 480, label: '8h' },
];

export function createEmptyEventForm() {
  const today = toInputDate(new Date());
  return {
    title: '',
    gameMaster: '',
    gameMasterUid: '',
    game: '',
    gameColor: '#2f6df6',
    location: '',
    description: '',
    dateMode: EVENT_DATE_MODE_SINGLE,
    dateRange: { from: today, to: today },
    startTime: '20:00',
    durationMinutes: 120,
    published: true,
    inviteEnabled: false,
  };
}

export const emptyForm = createEmptyEventForm();

export function eventToForm(event, games = []) {
  const matchingGame = games.find((game) => game.name === event.game);
  const startDate = toInputDate(event.startAt);
  const endDate = toInputDate(event.endAt);
  const durationMinutes = Math.max(1, Math.round((event.endAt - event.startAt) / MS_PER_MINUTE));
  return {
    title: event.title || '',
    gameMaster: event.gameMaster || '',
    gameMasterUid: event.gameMasterUid || '',
    game: event.game || '',
    gameColor: event.gameColor || matchingGame?.color || '#2f6df6',
    location: event.location || '',
    description: event.description || '',
    dateMode: startDate === endDate ? EVENT_DATE_MODE_SINGLE : EVENT_DATE_MODE_RANGE,
    dateRange: { from: startDate, to: endDate },
    startTime: toInputTime(event.startAt),
    durationMinutes,
    published: Boolean(event.published),
    inviteEnabled: event.inviteEnabled === true,
  };
}

export function duplicateEventToForm(event, games = []) {
  return {
    ...eventToForm(event, games),
    title: `${event.title || 'Event'} Copy`,
  };
}

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

export function setEventDateMode(setForm, dateMode) {
  setForm((current) => {
    const from = current.dateRange.from || toInputDate(new Date());
    return {
      ...current,
      dateMode,
      dateRange: {
        from,
        to: dateMode === EVENT_DATE_MODE_SINGLE ? from : current.dateRange.to || from,
      },
    };
  });
}

export function dayPickerSelection(form) {
  const from = form.dateRange.from ? dateKeyToMalaysiaDate(form.dateRange.from) : undefined;
  const to = form.dateRange.to ? dateKeyToMalaysiaDate(form.dateRange.to) : undefined;
  return form.dateMode === EVENT_DATE_MODE_RANGE ? { from, to } : from;
}

export function setEventDateSelection(setForm, selection) {
  setForm((current) => {
    if (current.dateMode === EVENT_DATE_MODE_RANGE) {
      const from = selection?.from ? toInputDate(selection.from) : '';
      const to = selection?.to ? toInputDate(selection.to) : '';
      const previousDaySpan = daySpan(current.dateRange.from, current.dateRange.to);
      const nextDaySpan = daySpan(from, to);
      const baseMinutes = Math.max(1, current.durationMinutes - previousDaySpan * MINUTES_PER_DAY);
      return {
        ...current,
        dateRange: { from, to },
        durationMinutes: to ? nextDaySpan * MINUTES_PER_DAY + baseMinutes : current.durationMinutes,
      };
    }

    const date = selection ? toInputDate(selection) : '';
    return {
      ...current,
      dateRange: { from: date, to: date },
    };
  });
}

export function updateDurationMinutes(setForm, value) {
  const durationMinutes = Math.max(0, Number(value) || 0);
  setForm((current) => ({
    ...current,
    durationMinutes,
    dateRange: {
      ...current.dateRange,
      to: current.dateRange.from
        ? toInputDate(new Date(malaysiaInputToDate(current.dateRange.from, current.startTime).getTime() + durationMinutes * MS_PER_MINUTE))
        : current.dateRange.to,
    },
  }));
}

export function buildEventSchedule(form) {
  if (!form.dateRange.from) {
    return {
      error: {
        title: 'Pick an event date',
        detail: 'Choose the date this event starts.',
      },
    };
  }

  if (form.dateMode === EVENT_DATE_MODE_RANGE && !form.dateRange.to) {
    return {
      error: {
        title: 'Pick an end date',
        detail: 'Choose the last date in the event range.',
      },
    };
  }

  if (Number(form.durationMinutes) <= 0) {
    return {
      error: {
        title: 'Invalid event duration',
        detail: 'Duration must be greater than 0 minutes.',
      },
    };
  }

  const startAt = malaysiaInputToDate(form.dateRange.from, form.startTime);
  const endAt = new Date(startAt.getTime() + Number(form.durationMinutes) * MS_PER_MINUTE);
  if (endAt <= startAt) {
    return {
      error: {
        title: 'Invalid event time',
        detail: 'Duration must end after the start date and time.',
      },
    };
  }

  return { startAt, endAt };
}

export function durationOptionValue(durationMinutes) {
  return DURATION_PRESETS.some((preset) => preset.value === Number(durationMinutes))
    ? String(durationMinutes)
    : 'custom';
}

export function formatDuration(minutes) {
  const value = Number(minutes) || 0;
  const days = Math.floor(value / MINUTES_PER_DAY);
  const remainder = value % MINUTES_PER_DAY;
  const hours = Math.floor(remainder / 60);
  const mins = remainder % 60;
  return [
    days ? `${days}d` : '',
    hours ? `${hours}h` : '',
    mins ? `${mins}m` : '',
  ].filter(Boolean).join(' ') || '0m';
}

export function formatSelectedDateRange(form) {
  if (!form.dateRange.from) return 'No date selected';
  const from = formatCompactDate(dateKeyToMalaysiaDate(form.dateRange.from));
  if (form.dateMode === EVENT_DATE_MODE_SINGLE || !form.dateRange.to || form.dateRange.to === form.dateRange.from) {
    return from;
  }
  return `${from} - ${formatCompactDate(dateKeyToMalaysiaDate(form.dateRange.to))}`;
}

function daySpan(from, to) {
  if (!from || !to) return 0;
  return Math.max(0, Math.round((dateKeyToMalaysiaDate(to) - dateKeyToMalaysiaDate(from)) / (MINUTES_PER_DAY * MS_PER_MINUTE)));
}
