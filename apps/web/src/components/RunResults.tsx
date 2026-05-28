import type { RunRecord } from "@ray-catalyst/core";

export function RunResults({ runs }: { runs: RunRecord[] }) {
  if (!runs.length) {
    return (
      <section className="results empty">
        <h2>Runs</h2>
        <p>Create a request above. Mock mode returns local generated placeholders without spending money.</p>
      </section>
    );
  }

  return (
    <section className="results">
      <div className="results-head">
        <h2>Runs</h2>
        <span>{runs.length} saved locally</span>
      </div>
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
              {run.events.slice(-3).map((item) => (
                <span key={`${run.id}-${item.at}`}>{item.message}</span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
