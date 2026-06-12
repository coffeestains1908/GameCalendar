import { CalendarDays, Clock3 } from 'lucide-react';
import { DayPicker } from '@daypicker/react';
import '@daypicker/react/style.css';
import {
  dayPickerSelection,
  DURATION_PRESETS,
  durationOptionValue,
  EVENT_DATE_MODE_RANGE,
  EVENT_DATE_MODE_SINGLE,
  formatDuration,
  formatSelectedDateRange,
  setEventDateMode,
  setEventDateSelection,
  updateDurationMinutes,
} from './forms.js';

export function EventScheduleFields({ form, setForm }) {
  const isRange = form.dateMode === EVENT_DATE_MODE_RANGE;
  const durationValue = durationOptionValue(form.durationMinutes);

  return (
    <section className="schedule-fields" aria-label="Event schedule">
      <div className="schedule-heading">
        <CalendarDays size={17} />
        <span>{formatSelectedDateRange(form)}</span>
      </div>

      <div className="segmented-control" role="group" aria-label="Date mode">
        <button
          className={form.dateMode === EVENT_DATE_MODE_SINGLE ? 'active' : ''}
          type="button"
          onClick={() => setEventDateMode(setForm, EVENT_DATE_MODE_SINGLE)}
        >
          Single day
        </button>
        <button
          className={isRange ? 'active' : ''}
          type="button"
          onClick={() => setEventDateMode(setForm, EVENT_DATE_MODE_RANGE)}
        >
          Multi-day
        </button>
      </div>

      <div className="day-picker-panel">
        <DayPicker
          mode={isRange ? 'range' : 'single'}
          required
          selected={dayPickerSelection(form)}
          onSelect={(selection) => setEventDateSelection(setForm, selection)}
          numberOfMonths={isRange ? 2 : 1}
          fixedWeeks
          showOutsideDays
          weekStartsOn={1}
        />
      </div>

      <div className="two-col">
        <label>
          Start time
          <input
            type="time"
            value={form.startTime}
            onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))}
            required
          />
        </label>
        <label>
          Duration
          <select value={durationValue} onChange={(event) => updateDurationMinutes(setForm, event.target.value === 'custom' ? form.durationMinutes : event.target.value)}>
            {DURATION_PRESETS.map((preset) => (
              <option value={preset.value} key={preset.value}>{preset.label}</option>
            ))}
            {durationValue === 'custom' && <option value="custom">{formatDuration(form.durationMinutes)}</option>}
          </select>
        </label>
      </div>

      {durationValue === 'custom' && (
        <label>
          Custom duration minutes
          <div className="field-with-icon">
            <Clock3 size={17} />
            <input
              type="number"
              min="1"
              step="1"
              value={form.durationMinutes}
              onChange={(event) => updateDurationMinutes(setForm, event.target.value)}
              required
            />
          </div>
        </label>
      )}
    </section>
  );
}
