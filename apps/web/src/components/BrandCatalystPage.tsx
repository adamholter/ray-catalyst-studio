import { useEffect, useMemo, useState } from "react";
import type { Attachment, BrandIdentityOutput, RunRecord } from "@ray-catalyst/core";
import { createRun, fetchCapabilities, fetchRuns } from "../lib/api";
import { fileToAttachment } from "../lib/files";

type BrandCatalystPageProps = {
  onNavigate?: (path: string) => void;
};

const brandModelId = "brand-identity-pipeline";

function displayError(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "The brand identity request failed.";
}

function downloadText(filename: string, contents: string, type: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function brandFilename(brand: BrandIdentityOutput | undefined, suffix: string) {
  const base = brand?.concept.name?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "brand";
  return `${base}-${suffix}`;
}

function eventTime(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
  } catch {
    return "";
  }
}

function isBrandRun(run: RunRecord) {
  return run.request.taskId === "brand" || run.request.modelId === brandModelId;
}

function recordedRunCost(run: RunRecord) {
  return (run.modelInvocations || []).reduce((total, invocation) => total + (invocation.estimatedCostUsd || 0), 0);
}

export function BrandCatalystPage({ onNavigate }: BrandCatalystPageProps) {
  const [prompt, setPrompt] = useState("");
  const [budget, setBudget] = useState(1.5);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "showcase" | "icons" | "assets" | "skill">("overview");
  const [sessionCost, setSessionCost] = useState(() => Number(sessionStorage.getItem("catalyst-session-cost") || "0"));
  const [providerMode, setProviderMode] = useState<"mock" | "live">("mock");

  const brandRuns = useMemo(() => runs.filter(isBrandRun), [runs]);
  const activeRun = useMemo(() => {
    return brandRuns.find((run) => run.id === activeRunId) || brandRuns[0] || null;
  }, [activeRunId, brandRuns]);
  const brand = activeRun?.output?.brand;
  const hasRunningRun = brandRuns.some((run) => run.status === "running" || run.status === "queued");

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchRuns(), fetchCapabilities()])
      .then(([data, capabilities]) => {
        if (cancelled) return;
        setProviderMode(capabilities.providerMode);
        setRuns(data.runs);
        const firstBrand = data.runs.find(isBrandRun);
        if (firstBrand) setActiveRunId(firstBrand.id);
      })
      .catch((err) => setError(displayError(err)));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasRunningRun) return;
    const interval = window.setInterval(() => {
      fetchRuns()
        .then((data) => setRuns(data.runs))
        .catch((err) => setError(displayError(err)));
    }, 2_000);
    return () => window.clearInterval(interval);
  }, [hasRunningRun]);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    try {
      setError("");
      const next = await Promise.all(Array.from(files).slice(0, 4).map(fileToAttachment));
      setAttachments((current) => [...current, ...next].slice(0, 4));
    } catch (err) {
      setError(displayError(err));
    }
  }

  async function submit() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError("");
    setActiveTab("overview");
    const now = new Date().toISOString();
    const tempRun: RunRecord = {
      id: `temp-brand-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
      status: "running",
      request: {
        taskId: "brand",
        modelId: brandModelId,
        inputs: { prompt, budget },
        attachments
      },
      model: {
        id: brandModelId,
        label: "Brand Identity Pipeline",
        provider: "internal",
        endpoint: "internal/brand-identity-pipeline",
        synthId: { status: "none", note: "Brand pipeline text has no watermark concern.", applyUpscaleByDefault: false },
        defaultPostprocessors: []
      },
      events: [{ at: now, message: "Queued Brand Identity Pipeline" }]
    };
    setRuns((current) => [tempRun, ...current]);
    setActiveRunId(tempRun.id);

    try {
      const result = await createRun({
        taskId: "brand",
        modelId: brandModelId,
        inputs: { prompt, budget },
        attachments
      });
      setActiveRunId(result.run.id);
      setRuns((current) => [result.run, ...current.filter((run) => run.id !== tempRun.id && run.id !== result.run.id)]);
      const runCost = recordedRunCost(result.run) || (providerMode === "live" ? budget : 0);
      if (runCost > 0) {
        setSessionCost((current) => {
          const next = Number((current + runCost).toFixed(4));
          sessionStorage.setItem("catalyst-session-cost", String(next));
          return next;
        });
      }
    } catch (err) {
      const message = displayError(err);
      setError(message);
      setRuns((current) =>
        current.map((run) =>
          run.id === tempRun.id
            ? {
                ...run,
                status: "failed",
                error: message,
                events: [...run.events, { at: new Date().toISOString(), message: `Failed: ${message}` }]
              }
            : run
        )
      );
    } finally {
      setBusy(false);
    }
  }

  const navigate = (path: string) => {
    if (onNavigate) onNavigate(path);
    else window.location.href = path ? `/${path}` : "/";
  };

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <span className="brand" role="button" tabIndex={0} onClick={() => navigate("")}>
            ✦ catalyst
          </span>
          <span className="brand-tag">brands</span>
        </div>
        <div className="topbar-right">
          <span className="session-cost">session est. ${sessionCost.toFixed(2)}</span>
          <button className="topbar-link" type="button" onClick={() => navigate("")}>
            Tools Hub
          </button>
          <span className="topbar-sep">·</span>
          <button className="topbar-link" type="button" onClick={() => navigate("mockup")}>
            Mockups
          </button>
          <span className="topbar-sep">·</span>
          <button className="topbar-link" type="button" onClick={() => navigate("logo")}>
            Logos
          </button>
        </div>
      </header>

      <main className="brand-workbench">
        <aside className="brand-sidebar">
          <section className="brand-panel">
            <div className="composer-eyebrow">
              <span className="eyebrow-dot" />
              <span className="eyebrow-text">Brand identity workflow</span>
            </div>
            <label className="sr-only" htmlFor="brandPrompt">
              Brand prompt
            </label>
            <textarea
              id="brandPrompt"
              className="brand-prompt-field"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe the brand, customer, market, visual tone, and any specific assets you need..."
              disabled={busy}
            />
            <div className="brand-upload-row">
              <label className="brand-upload">
                <input type="file" accept="image/*" multiple onChange={(event) => handleFiles(event.target.files)} disabled={busy} />
                <span>Reference images</span>
                <small>{attachments.length ? `${attachments.length} attached` : "Upload logos, moodboards, screenshots"}</small>
              </label>
              <label className="brand-budget">
                <span>Budget</span>
                <input
                  type="number"
                  min="0.1"
                  max="5"
                  step="0.1"
                  value={budget}
                  onChange={(event) => setBudget(Math.max(0.1, Number(event.target.value) || 1.5))}
                  disabled={busy}
                />
              </label>
            </div>
            {attachments.length ? (
              <div className="brand-reference-strip">
                {attachments.map((attachment, index) => (
                  <button
                    key={`${attachment.name}-${index}`}
                    className="brand-reference-thumb"
                    type="button"
                    title={`Remove ${attachment.name}`}
                    onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    disabled={busy}
                  >
                    <img src={attachment.dataUrl} alt="" />
                  </button>
                ))}
              </div>
            ) : null}
            <button className="generate-button brand-generate-button" type="button" onClick={submit} disabled={busy || !prompt.trim()}>
              {busy ? "Starting pipeline..." : "Build brand identity"}
            </button>
            {error ? <div className="error-box">{error}</div> : null}
          </section>

          <section className="brand-panel brand-history-panel">
            <div className="brand-panel-heading">
              <span>Recent brands</span>
              <small>{brandRuns.length} saved</small>
            </div>
            {brandRuns.length ? (
              <div className="brand-history-list">
                {brandRuns.map((run) => {
                  const runBrand = run.output?.brand;
                  const active = activeRun?.id === run.id;
                  return (
                    <button
                      key={run.id}
                      className={active ? "brand-history-item active" : "brand-history-item"}
                      type="button"
                      onClick={() => {
                        setActiveRunId(run.id);
                        setActiveTab("overview");
                      }}
                    >
                      <span>
                        <strong>{runBrand?.concept.name || String(run.request.inputs.prompt || "Brand run").slice(0, 34)}</strong>
                        <small>{runBrand?.concept.tagline || run.status}</small>
                      </span>
                      <em>{eventTime(run.updatedAt)}</em>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="brand-muted">No brand systems saved yet.</p>
            )}
          </section>
        </aside>

        <section className="brand-output">
          {!activeRun ? (
            <div className="brand-empty">
              <div className="empty-mark">✦</div>
              <h1>Describe a brand. Get the whole system.</h1>
              <p>
                The pipeline creates a concept, reference sheet, icon set, supporting assets, a practical brand skill file, and a
                previewable HTML showcase.
              </p>
            </div>
          ) : (
            <>
              <div className="brand-output-header">
                <div>
                  <span className="modal-category">Result</span>
                  <h1>{brand?.concept.name || String(activeRun.request.inputs.prompt || "Brand identity")}</h1>
                  <p>{brand?.concept.tagline || activeRun.status}</p>
                </div>
                {brand ? (
                  <div className="brand-output-actions">
                    <button
                      className="ws-btn"
                      type="button"
                      onClick={() => downloadText(brandFilename(brand, "skill.md"), brand.skillMarkdown, "text/markdown")}
                    >
                      Export skill
                    </button>
                    <button
                      className="ws-btn accent"
                      type="button"
                      onClick={() => downloadText(brandFilename(brand, "showcase.html"), brand.showcaseHtml, "text/html")}
                    >
                      Export HTML
                    </button>
                  </div>
                ) : null}
              </div>

              {(activeRun.status === "running" || activeRun.status === "queued") && (
                <div className="brand-progress">
                  <span className="status-spinner-small">✦</span>
                  <span>Pipeline running</span>
                </div>
              )}

              {activeRun.status === "failed" ? <div className="error-box">{activeRun.error || "Brand run failed."}</div> : null}

              <div className="brand-event-list" aria-label="Brand pipeline events">
                {activeRun.events.slice(-8).map((item, index) => (
                  <div key={`${item.at}-${index}`} className="brand-event-item">
                    <span>{eventTime(item.at)}</span>
                    <p>{item.message}</p>
                  </div>
                ))}
              </div>

              {brand ? (
                <>
                  <div className="brand-tabs" role="tablist" aria-label="Brand output">
                    {[
                      ["overview", "Overview"],
                      ["showcase", "Showcase"],
                      ["icons", "Icons"],
                      ["assets", "Assets"],
                      ["skill", "Skill file"]
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        className={activeTab === id ? "active" : ""}
                        onClick={() => setActiveTab(id as typeof activeTab)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="brand-tab-panel">
                    {activeTab === "overview" ? <BrandOverview brand={brand} /> : null}
                    {activeTab === "showcase" ? (
                      <iframe className="brand-showcase-frame" title="Brand showcase" srcDoc={brand.showcaseHtml} sandbox="" />
                    ) : null}
                    {activeTab === "icons" ? <BrandIcons brand={brand} /> : null}
                    {activeTab === "assets" ? <BrandAssets brand={brand} /> : null}
                    {activeTab === "skill" ? <pre className="brand-skill-doc">{brand.skillMarkdown}</pre> : null}
                  </div>
                </>
              ) : null}
            </>
          )}
        </section>
      </main>
    </>
  );
}

function BrandOverview({ brand }: { brand: BrandIdentityOutput }) {
  return (
    <div className="brand-overview-grid">
      <section className="brand-summary-card">
        <h2>{brand.concept.name}</h2>
        <p>{brand.concept.tagline}</p>
        <div className="brand-personality">
          {brand.concept.personality.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
        <small>{brand.concept.audience}</small>
      </section>
      <section className="brand-summary-card">
        <h3>Palette</h3>
        <div className="brand-palette-grid">
          {Object.entries(brand.concept.colors).map(([name, value]) => (
            <div key={name} className="brand-swatch">
              <span style={{ backgroundColor: value }} />
              <strong>{name}</strong>
              <small>{value}</small>
            </div>
          ))}
        </div>
      </section>
      <section className="brand-summary-card">
        <h3>Typography</h3>
        <p>{brand.concept.fonts.display}</p>
        <small>{brand.concept.fonts.body}</small>
      </section>
      {brand.assets.referenceSheet ? (
        <section className="brand-summary-card brand-reference-card">
          <h3>Reference sheet</h3>
          <img src={brand.assets.referenceSheet} alt={`${brand.concept.name} reference sheet`} />
        </section>
      ) : null}
    </div>
  );
}

function BrandIcons({ brand }: { brand: BrandIdentityOutput }) {
  return (
    <div className="brand-icon-grid">
      {brand.assets.icons.map((icon) => (
        <figure key={`${icon.name}-${icon.url}`}>
          <img src={icon.url} alt={icon.name} />
          <figcaption>
            <strong>{icon.name}</strong>
            {icon.source ? <small>{icon.source}</small> : null}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function BrandAssets({ brand }: { brand: BrandIdentityOutput }) {
  const assets = [
    ["Reference sheet", brand.assets.referenceSheet, "1 / 1"],
    ["Hero background", brand.assets.heroBackground, "16 / 9"],
    ["Light pattern", brand.assets.lightPattern, "1 / 1"],
    ["Dark pattern", brand.assets.darkPattern, "1 / 1"]
  ].filter((item): item is [string, string, string] => Boolean(item[1]));

  return (
    <div className="brand-asset-grid">
      {assets.map(([label, url, ratio]) => (
        <figure key={label}>
          <div style={{ aspectRatio: ratio }}>
            <img src={url} alt={label} />
          </div>
          <figcaption>{label}</figcaption>
        </figure>
      ))}
    </div>
  );
}
