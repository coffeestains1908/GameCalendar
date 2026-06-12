import { Eye, EyeOff } from 'lucide-react';
import { formatDateTime, getEventStatus } from '../time.js';

export const EVENT_LIST_PAGE_SIZE = 10;

export function getEventPageCount(events, pageSize = EVENT_LIST_PAGE_SIZE) {
  return Math.max(1, Math.ceil(events.length / pageSize));
}

export function paginateEvents(events, page, pageSize = EVENT_LIST_PAGE_SIZE) {
  const start = (page - 1) * pageSize;
  return events.slice(start, start + pageSize);
}

export function AdminEventList({ events, inviteDetails, renderActions }) {
  return events.map((event) => {
    const details = event.inviteEnabled === true ? inviteDetails[event.id] : null;

    return (
      <article className="admin-event compact" key={event.id}>
        <div className="admin-event-main">
          <div className="admin-event-title-row">
            <span className={`status-dot ${getEventStatus(event)}`} />
            <h3>{event.title}</h3>
          </div>
          <time>{formatDateTime(event.startAt)}</time>
        </div>
        <div className="admin-event-invite">
          {details && (
            <>
              <span>PIN {details.pin || '------'}</span>
              <a href={details.url} title={details.url}>
                {details.url}
              </a>
            </>
          )}
        </div>
        <span className="visibility-state" title={event.published ? 'Published' : 'Draft'}>
          {event.published ? <Eye size={16} /> : <EyeOff size={16} />}
        </span>
        <div className="admin-event-actions">{renderActions(event)}</div>
      </article>
    );
  });
}

export function EventListPagination({ page, pageCount, onPageChange, totalEvents }) {
  if (totalEvents === 0) return null;

  return (
    <div className="event-pagination" aria-label="Event list pagination">
      <button
        className="button secondary"
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
      >
        Previous
      </button>
      <span>
        Page {page} of {pageCount}
      </span>
      <button
        className="button secondary"
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= pageCount}
      >
        Next
      </button>
    </div>
  );
}
