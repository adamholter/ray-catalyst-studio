import { useState } from "react";
import type { GeneratedImage, RunRecord } from "@ray-catalyst/core";
import { enhanceRunImage } from "../lib/api";

type SelectedResult = {
  run: RunRecord;
  image: GeneratedImage;
  index: number;
};

type ResultTile = {
  run: RunRecord;
  image?: GeneratedImage;
  index: number;
};

export function RunResults({
  runs,
  onRunUpdated
}: {
  runs: RunRecord[];
  onRunUpdated: (run: RunRecord) => void;
}) {
  const [selected, setSelected] = useState<SelectedResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [working, setWorking] = useState(false);
  const [modalError, setModalError] = useState("");

  const tiles: ResultTile[] = runs.flatMap((run) => {
    if (run.output?.images?.length) {
      return run.output.images.map((image, index) => ({ run, image, index }));
    }
    return [{ run, index: 0 }];
  });

  async function handleEnhance() {
    if (!selected) return;
    setWorking(true);
    setModalError("");
    try {
      const result = await enhanceRunImage(selected.run.id, selected.image.url);
      onRunUpdated(result.run);
      const nextImage = result.run.output?.images?.[0];
      if (nextImage) setSelected({ run: result.run, image: nextImage, index: 0 });
    } catch (error) {
      setModalError(error instanceof Error ? error.message : String(error));
    } finally {
      setWorking(false);
    }
  }

  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <>
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
          <span>{tiles.length} saved locally</span>
        </div>

        {!tiles.length ? (
          <div className="empty-state">
            <div className="empty-mark">✦</div>
            <div className="empty-title">No mockups yet</div>
            <div className="empty-sub">Write a brief above and hit Generate. Results will land here.</div>
          </div>
        ) : null}

        <div className="masonry">
          {tiles.map(({ run, image, index }) => (
            <article className={`run-card ${run.status}`} key={`${run.id}-${image?.url || index}`}>
              <div className="run-card-media">
                {image ? (
                  <button
                    className="result-image-button"
                    type="button"
                    onClick={() => {
                      setModalError("");
                      setCopied(false);
                      setSelected({ run, image, index });
                    }}
                  >
                    <img src={image.url} alt={`Output from ${run.model.label}`} />
                    <span>Actions</span>
                  </button>
                ) : run.output?.deck ? (
                  <div className="deck-card-preview">
                    <span className="deck-icon">✦</span>
                    <h3>{run.output.deck.title}</h3>
                    <p>{run.output.deck.slides.length} slides planned</p>
                  </div>
                ) : (
                  <div className={`run-card-overlay ${run.status}`}>
                    <span>{run.status === "failed" ? "Generation failed" : "Processing..."}</span>
                  </div>
                )}
              </div>
              <div className="run-card-footer">
                <div className="run-card-info">
                  <strong className="run-card-title">{run.model.label}</strong>
                  <span className={`run-status-pill ${run.status}`}>{run.status}</span>
                </div>
              </div>
              {run.error ? <p className="error-line">{run.error}</p> : null}
            </article>
          ))}
        </div>
      </section>

      {selected ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Result actions" onClick={() => setSelected(null)}>
          <div className="modal-surface compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-topline">
              <div>
                <span className="modal-category">Result</span>
                <h2>{selected.run.model.label}</h2>
              </div>
              <button className="modal-close" type="button" onClick={() => setSelected(null)} aria-label="Close result actions">×</button>
            </div>

            <img className="modal-result-image" src={selected.image.url} alt="Selected generated result" />

            <div className="modal-actions-row">
              <button className="ghost-button" type="button" onClick={handleEnhance} disabled={working || selected.run.status === "running"}>
                {working || selected.run.status === "running" ? "Enhancing..." : "Enhance"}
              </button>
              <a className="ghost-button" href={selected.image.url} download={`catalyst-${selected.run.id}-${selected.index + 1}.png`}>
                Download
              </a>
              <button className="ghost-button" type="button" onClick={() => copyUrl(selected.image.url)}>
                {copied ? "Copied" : "Copy URL"}
              </button>
            </div>

            {modalError ? <p className="error-line">{modalError}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
