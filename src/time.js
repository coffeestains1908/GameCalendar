export const MALAYSIA_TIME_ZONE = 'Asia/Kuala_Lumpur';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MINUTES_PER_DAY = 24 * 60;

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MALAYSIA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const monthFormatter = new Intl.DateTimeFormat('en-MY', {
  timeZone: MALAYSIA_TIME_ZONE,
  month: 'long',
});

const weekdayFormatter = new Intl.DateTimeFormat('en-MY', {
  timeZone: MALAYSIA_TIME_ZONE,
  weekday: 'short',
});

const timeFormatter = new Intl.DateTimeFormat('en-MY', {
  timeZone: MALAYSIA_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-MY', {
  timeZone: MALAYSIA_TIME_ZONE,
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const compactDatePartFormatter = new Intl.DateTimeFormat('en-MY', {
  timeZone: MALAYSIA_TIME_ZONE,
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function formatDateKey(date) {
  return dateFormatter.format(date);
}

export function formatMonthName(dateKey) {
  return monthFormatter.format(dateKeyToMalaysiaDate(dateKey));
}

export function formatDayLabel(dateKey) {
  const day = Number(dateKey.slice(-2));
  const suffix = day >= 11 && day <= 13
    ? 'th'
    : { 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] || 'th';
  return `${day}${suffix}`;
}

export function formatWeekdayLabel(dateKey) {
  return weekdayFormatter.format(dateKeyToMalaysiaDate(dateKey));
}

export function formatTime(date) {
  return timeFormatter.format(date);
}

export function formatDateTime(date) {
  return dateTimeFormatter.format(date);
}

export function formatCompactDate(date) {
  const parts = compactDatePartFormatter.formatToParts(date);
  const part = (type) => parts.find((entry) => entry.type === type)?.value || '';
  return `${part('weekday')}, ${part('day')}/${part('month')}/${part('year')}`;
}

export function dateKeyToMalaysiaDate(dateKey) {
  return new Date(`${dateKey}T00:00:00+08:00`);
}

export function addDaysToDateKey(dateKey, days) {
  return formatDateKey(new Date(dateKeyToMalaysiaDate(dateKey).getTime() + days * MS_PER_DAY));
}

export function toInputDate(date) {
  return formatDateKey(date);
}

export function toInputTime(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: MALAYSIA_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === 'hour')?.value || '00';
  const minute = parts.find((part) => part.type === 'minute')?.value || '00';
  return `${hour}:${minute}`;
}

export function malaysiaInputToDate(dateValue, timeValue) {
  return new Date(`${dateValue}T${timeValue}:00+08:00`);
}

export function dateToMinutes(date) {
  const [hour, minute] = toInputTime(date).split(':').map(Number);
  return hour * 60 + minute;
}

export function splitEventIntoDateSegments(event) {
  const start = event.startAt;
  const end = event.endAt;
  if (!start || !end || end <= start) return [];

  const segments = [];
  let cursorKey = formatDateKey(start);
  const endKey = formatDateKey(new Date(end.getTime() - 1));

  while (cursorKey <= endKey) {
    const dayStart = dateKeyToMalaysiaDate(cursorKey);
    const nextDayStart = dateKeyToMalaysiaDate(addDaysToDateKey(cursorKey, 1));
    const segmentStart = start > dayStart ? start : dayStart;
    const segmentEnd = end < nextDayStart ? end : nextDayStart;
    const startMinutes = Math.max(0, dateToMinutes(segmentStart));
    const endMinutes = segmentEnd.getTime() === nextDayStart.getTime()
      ? MINUTES_PER_DAY
      : Math.min(MINUTES_PER_DAY, dateToMinutes(segmentEnd));

    segments.push({
      ...event,
      segmentDateKey: cursorKey,
      segmentStart,
      segmentEnd,
      leftPercent: (startMinutes / MINUTES_PER_DAY) * 100,
      widthPercent: Math.max(((endMinutes - startMinutes) / MINUTES_PER_DAY) * 100, 0.4),
      continuesFromPrevious: segmentStart.getTime() > start.getTime(),
      continuesToNext: segmentEnd.getTime() < end.getTime(),
    });

    cursorKey = addDaysToDateKey(cursorKey, 1);
  }

  return segments;
}

export function getEventStatus(event, now = new Date()) {
  if (event.startAt <= now && event.endAt > now) return 'ongoing';
  if (event.startAt > now) return 'upcoming';
  return 'ended';
}

export function gameColor(game = '') {
  let hash = 0;
  for (let i = 0; i < game.length; i += 1) {
    hash = game.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return {
    background: `hsl(${hue} 76% 44%)`,
    border: `hsl(${hue} 82% 62%)`,
    glow: `hsl(${hue} 80% 55% / 0.28)`,
  };
}
