import type { RunRecord } from "@ray-catalyst/core";

export function RunResults({ runs }: { runs: RunRecord[] }) {
  return (
    <section className="results">
      <div className="results-head">
        <div className="gallery-bar-left">
          <h2>Gallery</h2>
          <div className="gallery-filters">
            <button className="filter-chip active" type="button">All</button>
            <button className="filter-chip" type="button">Liked</button>
            <button className="filter-chip" type="button">Recent</button>
          </div>
        </div>
        <span>{runs.length} saved locally</span>
      </div>
      {!runs.length ? (
        <div className="empty-state">
          <div className="empty-mark">✦</div>
          <div className="empty-title">No mockups yet</div>
          <div className="empty-sub">Write a brief above and hit Generate. Results will land here.</div>
        </div>
      ) : null}
      <div className="masonry">
        {runs.map((run) => (
          <article className="run-card" key={run.id}>
            <div className="run-meta">
              <strong>{run.model.label}</strong>
              <span className={`run-status ${run.status}`}>{run.status}</span>
            </div>
            {run.output?.images?.map((image) => (
              <img key={image.url} src={image.url} alt={`Generated output from ${run.model.label}`} />
            ))}
            {run.output?.deck ? (
              <div className="deck-output">
                <h3>{run.output.deck.title}</h3>
                <ol>
                  {run.output.deck.slides.slice(0, 5).map((slide) => (
                    <li key={slide.title}>
                      <strong>{slide.title}</strong>
                      <span>{slide.notes}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            {run.error ? <p className="error-line">{run.error}</p> : null}
            <div className="event-list">
              {run.events.slice(-3).map((item, index) => (
                <span key={`${run.id}-${item.at}-${index}`}>{item.message}</span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
