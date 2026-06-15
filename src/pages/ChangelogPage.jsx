import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CalendarDays, Rocket } from 'lucide-react';
import changelogMarkdown from '../../CHANGE_NOTES.md?raw';

const appVersion = import.meta.env.VITE_APP_VERSION;
const releaseHeadingPattern = /^##\s+(.+)$/gm;
const releaseDatePattern = /^\s*(?:Date|Released|Release date):\s*(.+)\s*$/im;

function parseChangelogEntries(markdown) {
  const matches = [...markdown.matchAll(releaseHeadingPattern)];
  if (matches.length === 0) {
    return [
      {
        title: 'Release notes',
        date: 'Undated',
        body: markdown.trim(),
      },
    ];
  }

  return matches.map((match, index) => {
    const nextMatch = matches[index + 1];
    const start = match.index + match[0].length;
    const end = nextMatch?.index ?? markdown.length;
    const rawBody = markdown.slice(start, end).trim();
    const dateMatch = rawBody.match(releaseDatePattern);
    const body = rawBody.replace(releaseDatePattern, '').trim();

    return {
      title: match[1].trim(),
      date: dateMatch?.[1]?.trim() || 'Undated',
      body,
    };
  });
}

export function ChangelogPage({ navigate }) {
  const changelogEntries = parseChangelogEntries(changelogMarkdown);

  return (
    <main className="app-shell changelog-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Release notes</p>
          <h1>Changelogs</h1>
          <p className="changelog-current-version">Current app build: v{appVersion}</p>
        </div>
        <button className="button secondary" type="button" onClick={() => navigate('/')}>
          <CalendarDays size={17} />
          Calendar
        </button>
      </header>

      <section className="changelog-timeline" aria-label="Application changelog">
        {changelogEntries.map((entry, index) => (
          <article className="changelog-release" key={`${entry.title}-${index}`}>
            <div className="changelog-marker" aria-hidden="true">
              <Rocket size={17} />
            </div>
            <div className="changelog-markdown-panel">
              <div className="changelog-release-heading">
                <h2>{entry.title}</h2>
                <span className="changelog-date-tag">{entry.date}</span>
              </div>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {entry.body}
              </ReactMarkdown>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
