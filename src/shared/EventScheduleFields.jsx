import { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { DayPicker } from '@daypicker/react';
import '@daypicker/react/style.css';
import {
  dayPickerSelection,
  durationToParts,
  EVENT_DATE_MODE_RANGE,
  EVENT_DATE_MODE_SINGLE,
  formatSelectedDateRange,
  setEventRangeSelection,
  setEventDateMode,
  setEventDateSelection,
  updateDurationPart,
} from './forms.js';
import { dateKeyToMalaysiaDate } from '../time.js';

export function EventScheduleFields({ form, setForm }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [rangeStep, setRangeStep] = useState('start');
  const pickerRef = useRef(null);
  const isRange = form.dateMode === EVENT_DATE_MODE_RANGE;
  const rangeComplete = Boolean(form.dateRange.from && form.dateRange.to);
  const duration = durationToParts(form.durationMinutes);
  const rangeStart = form.dateRange.from ? dateKeyToMalaysiaDate(form.dateRange.from) : undefined;
  const rangeEnd = form.dateRange.to ? dateKeyToMalaysiaDate(form.dateRange.to) : undefined;
  const selectedDate = isRange ? rangeStart : dayPickerSelection(form);
  const rangeModifiers = {};
  if (isRange && rangeStart) rangeModifiers.rangeStart = rangeStart;
  if (isRange && rangeEnd) rangeModifiers.rangeEnd = rangeEnd;
  if (isRange && rangeStart && rangeEnd) rangeModifiers.rangeMiddle = { after: rangeStart, before: rangeEnd };

  useEffect(() => {
    if (!pickerOpen) return undefined;

    const closeOnPointerDown = (event) => {
      if (pickerRef.current?.contains(event.target)) return;
      setPickerOpen(false);
    };

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setPickerOpen(false);
    };

    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [pickerOpen]);

  const selectDate = (selection) => {
    if (isRange) {
      setRangeStep(setEventRangeSelection(setForm, selection, rangeStep));
      return;
    }

    setEventDateSelection(setForm, selection);
    setPickerOpen(false);
  };

  const toggleMultiDay = (event) => {
    const enabled = event.target.checked;
    setEventDateMode(setForm, enabled ? EVENT_DATE_MODE_RANGE : EVENT_DATE_MODE_SINGLE);
    setRangeStep('start');
    setPickerOpen(true);
  };

  const openPicker = () => {
    if (isRange) setRangeStep(rangeComplete ? 'start' : form.dateRange.from ? 'end' : 'start');
    setPickerOpen(true);
  };

  const rangeStatus = rangeComplete
    ? 'Range selected. Pick another date to start over.'
    : rangeStep === 'end' && form.dateRange.from
      ? 'Select end date'
      : 'Select start date';

  return (
    <section className="schedule-fields" aria-label="Event schedule">
      <div className="date-input-row">
        <label className="toggle-row compact-toggle">
          <input type="checkbox" checked={isRange} onChange={toggleMultiDay} />
          Multi-day
        </label>
        <div className="date-picker-field" ref={pickerRef}>
          <label>
            Date
            <div className="field-with-action">
              <input
                readOnly
                value={formatSelectedDateRange(form)}
                onClick={openPicker}
                onFocus={openPicker}
                aria-haspopup="dialog"
                aria-expanded={pickerOpen}
              />
              <button className="icon-button" type="button" onClick={() => setPickerOpen((current) => !current)} title="Pick date">
                <CalendarDays size={17} />
              </button>
            </div>
          </label>

          {pickerOpen && (
            <div className="date-picker-popover" role="dialog" aria-label="Pick event date">
              {isRange && <p className="date-picker-status">{rangeStatus}</p>}
              <DayPicker
                mode="single"
                required
                selected={selectedDate}
                onSelect={selectDate}
                modifiers={rangeModifiers}
                modifiersClassNames={{
                  rangeStart: 'range-start',
                  rangeEnd: 'range-end',
                  rangeMiddle: 'range-middle',
                }}
                numberOfMonths={isRange ? 2 : 1}
                fixedWeeks
                showOutsideDays
                weekStartsOn={1}
              />
            </div>
          )}
        </div>
      </div>

      <div className="three-col schedule-time-grid">
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
          Hours
          <input
            type="number"
            min="0"
            step="1"
            value={duration.hours}
            onChange={(event) => updateDurationPart(setForm, 'hours', event.target.value)}
            required
          />
        </label>
        <label>
          Minutes
          <input
            type="number"
            min="0"
            max="59"
            step="1"
            value={duration.minutes}
            onChange={(event) => updateDurationPart(setForm, 'minutes', event.target.value)}
            required
          />
        </label>
      </div>
    </section>
  );
}
