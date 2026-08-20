import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { EditModelSpec, GeneratedImage, RunRecord, TaskId } from "@ray-catalyst/core";
import { deleteRun, enhanceRunImage, convertRunMockup, editRunImage, vectorizeRunImage } from "../lib/api";

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

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

const svgTextCache = new Map<string, Promise<string>>();

function displayError(error: unknown) {
  if (!error) return "";
  if (typeof error === "string") return error === "[object Object]" ? "The last operation failed. Try again." : error;
  if (error && typeof error === "object") {
    const item = error as { message?: unknown; error?: unknown; detail?: unknown };
    for (const value of [item.message, item.error, item.detail]) {
      if (typeof value === "string" && value.trim()) return value;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return "The last operation failed. Try again.";
    }
  }
  return String(error);
}

function isVectorImage(image: GeneratedImage) {
  return image.contentType?.includes("svg") || image.url.includes(".svg") || image.url.startsWith("data:image/svg");
}

function svgTextFromDataUrl(url: string) {
  const [, payload = ""] = url.split(",", 2);
  return decodeURIComponent(payload);
}

function svgDataUrl(svgText: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
}

function loadSvgText(url: string) {
  if (url.startsWith("data:image/svg")) return Promise.resolve(svgTextFromDataUrl(url));
  const cached = svgTextCache.get(url);
  if (cached) return cached;
  const request = fetch(url).then((res) => {
    if (!res.ok) throw new Error(`SVG preview failed: ${res.status}`);
    return res.text();
  });
  svgTextCache.set(url, request);
  return request;
}

function ImagePreview({
  image,
  alt,
  className
}: {
  image: GeneratedImage;
  alt: string;
  className?: string;
}) {
  const transparentPreview = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
  const imageUrl = image.url;
  const isVector = isVectorImage(image);
  const [previewUrl, setPreviewUrl] = useState(() => (isVector && !imageUrl.startsWith("data:image/svg") ? "" : imageUrl));

  useEffect(() => {
    let cancelled = false;
    setPreviewUrl(isVector && !imageUrl.startsWith("data:image/svg") ? "" : imageUrl);

    if (!isVector || imageUrl.startsWith("data:image/svg")) return;

    async function loadSvgPreview() {
      try {
        const text = await loadSvgText(imageUrl);
        if (!cancelled) setPreviewUrl(svgDataUrl(text));
      } catch {
        if (!cancelled) setPreviewUrl(imageUrl);
      }
    }

    void loadSvgPreview();
    return () => {
      cancelled = true;
    };
  }, [imageUrl, isVector]);

  return <img className={className} src={previewUrl || transparentPreview} alt={alt} />;
}

async function svgToPngDataUrl(image: GeneratedImage) {
  const svgText = await loadSvgText(image.url);
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.querySelector("svg");
  const viewBox = svg?.getAttribute("viewBox")?.split(/\s+/).map(Number) || [];
  const width = image.width || Number.parseFloat(svg?.getAttribute("width") || "") || viewBox[2] || 1024;
  const height = image.height || Number.parseFloat(svg?.getAttribute("height") || "") || viewBox[3] || 1024;
  const blob = new Blob([svgText], { type: "image/svg+xml" });
  const objectUrl = URL.createObjectURL(blob);

  try {
    const img = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Unable to rasterize SVG for editing"));
    });
    img.src = objectUrl;
    await loaded;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(256, Math.min(4096, Math.round(width)));
    canvas.height = Math.max(256, Math.min(4096, Math.round(height)));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable for SVG rasterization");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function pathPoints(d: string) {
  const matches = d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
  const points: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < matches.length - 1; index += 2) {
    const x = Number(matches[index]);
    const y = Number(matches[index + 1]);
    if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y });
    if (points.length >= 180) break;
  }
  return points;
}

function VectorInspector({ image }: { image: GeneratedImage }) {
  const [svgText, setSvgText] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setSvgText("");
    setError("");

    async function loadSvg() {
      try {
        const text = await loadSvgText(image.url);
        if (!cancelled) setSvgText(text);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }

    void loadSvg();
    return () => {
      cancelled = true;
    };
  }, [image.url]);

  const details = useMemo(() => {
    if (!svgText) return { viewBox: "0 0 1024 1024", paths: [] as string[], points: [] as Array<{ x: number; y: number }> };
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const svg = doc.querySelector("svg");
    const width = svg?.getAttribute("width") || "1024";
    const height = svg?.getAttribute("height") || "1024";
    const viewBox = svg?.getAttribute("viewBox") || `0 0 ${Number.parseFloat(width) || 1024} ${Number.parseFloat(height) || 1024}`;
    const paths = Array.from(doc.querySelectorAll("path"))
      .map((path) => path.getAttribute("d") || "")
      .filter(Boolean)
      .slice(0, 80);
    const points = paths.flatMap(pathPoints).slice(0, 220);
    return { viewBox, paths, points };
  }, [svgText]);

  return (
    <div className="vector-inspector">
      <div className="vector-inspector-head">
        <span>Outline</span>
        <span>{details.paths.length} paths · {details.points.length} points</span>
      </div>
      <div className="vector-canvas">
        <ImagePreview image={image} alt="Vector output preview" />
        {svgText ? (
          <svg className="vector-outline-layer" viewBox={details.viewBox} aria-hidden="true">
            {details.paths.map((path, index) => (
              <path key={`${index}-${path.slice(0, 20)}`} d={path} />
            ))}
            {details.points.map((point, index) => (
              <circle key={`${index}-${point.x}-${point.y}`} cx={point.x} cy={point.y} r="4" />
            ))}
          </svg>
        ) : null}
      </div>
      {error ? <p className="error-line">{error}</p> : null}
    </div>
  );
}

export function RunResults({
  runs,
  onRunUpdated,
  onRunDeleted,
  onEditMockup,
  editModels,
  taskId
}: {
  runs: RunRecord[];
  onRunUpdated: (run: RunRecord) => void;
  onRunDeleted: (runId: string) => void;
  onEditMockup: (run: RunRecord) => void;
  editModels: EditModelSpec[];
  taskId?: TaskId;
}) {
  const [selected, setSelected] = useState<SelectedResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [working, setWorking] = useState(false);
  const [modalError, setModalError] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editModelId, setEditModelId] = useState<string>("gpt-image-2");
  const [editQuality, setEditQuality] = useState<"low" | "medium" | "high">("low");
  const [editResolution, setEditResolution] = useState<"1k" | "2k">("1k");
  const [showVectorXray, setShowVectorXray] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const selectedRef = useRef<SelectedResult | null>(null);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  function closeSelected() {
    selectedRef.current = null;
    setSelected(null);
  }

  const tiles: ResultTile[] = runs.map((run) => ({ run, image: run.output?.images?.[0], index: 0 }));
  const pluralName = taskId === "logo" ? "logos" : taskId === "asset" ? "assets" : "mockups";
  const singularName = taskId === "logo" ? "logo" : taskId === "asset" ? "asset" : "mockup";
  const canConvertToMockup = taskId === "mockup";
  const selectedEditModel = editModels.find((model) => model.id === editModelId) || editModels[0];
  const editModelFields = selectedEditModel?.inputFields || [];
  const editModelHasQuality = editModelFields.some((field) => field.key === "quality");
  const editModelHasResolution = editModelFields.some((field) => field.key === "resolution");

  async function handleEnhance() {
    if (!selected) return;
    setWorking(true);
    setModalError("");
    try {
      const result = await enhanceRunImage(selected.run.id, selected.image.url);
      onRunUpdated(result.run);
      const nextImage = result.run.output?.images?.[0];
      if (nextImage && selectedRef.current?.run.id === selected.run.id) setSelected({ run: result.run, image: nextImage, index: 0 });
    } catch (error) {
      setModalError(displayError(error));
    } finally {
      setWorking(false);
    }
  }

  async function handleVectorize() {
    if (!selected) return;
    setWorking(true);
    setModalError("");
    try {
      const result = await vectorizeRunImage(selected.run.id, selected.image.url);
      onRunUpdated(result.run);
      const nextImage = result.run.output?.images?.[0];
      if (nextImage && selectedRef.current?.run.id === selected.run.id) setSelected({ run: result.run, image: nextImage, index: 0 });
    } catch (error) {
      setModalError(displayError(error));
    } finally {
      setWorking(false);
    }
  }

  async function handleConvert() {
    if (!selected) return;
    setWorking(true);
    setModalError("");
    try {
      const result = await convertRunMockup(selected.run.id);
      onRunUpdated(result.run);
      onEditMockup(result.run);
      closeSelected();
    } catch (error) {
      setModalError(displayError(error));
    } finally {
      setWorking(false);
    }
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !editPrompt.trim()) return;
    const prompt = editPrompt.trim();
    setWorking(true);
    setModalError("");
    setChatMessages((messages) => [...messages, { role: "user", text: prompt }]);
    setEditPrompt("");
    try {
      const editImageUrl = isVectorImage(selected.image) ? await svgToPngDataUrl(selected.image) : selected.image.url;
      const result = await editRunImage(selected.run.id, editImageUrl, prompt, editModelId, {
        ...(editModelHasQuality ? { quality: editQuality } : {}),
        ...(editModelHasResolution ? { resolution: editResolution } : {})
      });
      onRunUpdated(result.run);
      const nextImage = result.run.output?.images?.[0];
      if (nextImage && selectedRef.current?.run.id === selected.run.id) setSelected({ run: result.run, image: nextImage, index: 0 });
      setChatMessages((messages) => [...messages, { role: "assistant", text: `Edited with ${selectedEditModel?.label || "selected model"}` }]);
    } catch (error) {
      const message = displayError(error);
      setModalError(message);
      setChatMessages((messages) => [...messages, { role: "assistant", text: message }]);
    } finally {
      setWorking(false);
    }
  }

  async function handleDeleteRun(runId: string) {
    setWorking(true);
    setModalError("");
    try {
      await deleteRun(runId);
      onRunDeleted(runId);
      if (selected?.run.id === runId) closeSelected();
    } catch (error) {
      setModalError(displayError(error));
    } finally {
      setWorking(false);
    }
  }

  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function copyPrompt(prompt: string) {
    await navigator.clipboard.writeText(prompt);
    setPromptCopied(true);
    window.setTimeout(() => setPromptCopied(false), 1600);
  }

  const selectedPrompt = selected ? String(selected.run.request.inputs.prompt || "") : "";
  const selectedIsVector = selected ? isVectorImage(selected.image) : false;
  const selectedVersions = selected?.run.output?.images || [];
  const selectedHasHistory = selectedVersions.length > 1;
  const selectedVersionLabel = selected?.image.operation === "edited" ? "Edited" : selected?.image.operation === "enhanced" ? "Enhanced" : selected?.image.operation === "vectorized" ? "Vectorized" : "Original";

  return (
    <>
      <section className="results">
        <div className="results-head">
          <div className="gallery-bar-left">
            <h2>Gallery</h2>
          </div>
          <span>{tiles.length} saved locally</span>
        </div>

        {!tiles.length ? (
          <div className="empty-state">
            <div className="empty-mark">✦</div>
            <div className="empty-title">No {pluralName} yet</div>
            <div className="empty-sub">Write a brief above and hit Generate. Results will land here.</div>
          </div>
        ) : null}

        <div className="masonry">
          {tiles.map(({ run, image, index }) => (
            <article className={`run-card ${run.status}`} key={`${run.id}-${index}-${image?.url || "pending"}`}>
              <div
                className="run-card-media"
                style={
                  !image && run.request?.inputs?.aspectRatio
                    ? { aspectRatio: String(run.request.inputs.aspectRatio).replace(":", "/") }
                    : undefined
                }
              >
                {image ? (
                  <button
                    className="result-image-button"
                    type="button"
                    onClick={() => {
                      setModalError("");
                      setCopied(false);
                      setPromptCopied(false);
                      setEditPrompt("");
                      setShowVectorXray(false);
                      setChatMessages([]);
                      setSelected({ run, image, index });
                    }}
                  >
                    <ImagePreview image={image} alt={`Output from ${run.model.label}`} />
                    <span>Actions</span>
                  </button>
                ) : (
                  <div className={`run-card-overlay ${run.status}`}>
                    {run.status === "failed" ? (
                      <>
                        <div className="warning-mark">✕</div>
                        <span>Generation failed</span>
                        {run.error ? <small className="failed-details" title={displayError(run.error)}>{displayError(run.error)}</small> : null}
                      </>
                    ) : (
                      <>
                        <div className="spinner">✦</div>
                        <span>Generating {singularName}...</span>
                      </>
                    )}
                  </div>
                )}
                <button
                  className="card-icon-button"
                  type="button"
                  aria-label={`Delete ${run.model.label} generation`}
                  title="Delete generation"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleDeleteRun(run.id);
                  }}
                  disabled={working}
                >
                  ×
                </button>
              </div>
              <div className="run-card-footer">
                <div className="run-card-info">
                  <strong className="run-card-title">
                    {run.model.label}
                    {(run.output?.images?.length || 0) > 1 ? <span className="edited-mark" title="Has edit history">↯</span> : null}
                  </strong>
                  <span className={`run-status-pill ${run.status}`}>{run.status}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {selected ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Result actions" onClick={closeSelected}>
          <button className="modal-close" type="button" onClick={(event) => { event.stopPropagation(); closeSelected(); }} aria-label="Close result actions">×</button>
          <div className="modal-surface compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-topline">
              <div>
                <span className="modal-category">Result</span>
                <h2>{selected.run.model.label}</h2>
              </div>
            </div>

            <div className="modal-preview-frame">
              <ImagePreview className="modal-result-image" image={selected.image} alt="Selected generated result" />
            </div>

            <div className="modal-actions-row">
              {!(selectedIsVector && taskId === "logo") ? (
                <button className="icon-button labeled" data-label="Enhance" type="button" onClick={handleEnhance} disabled={working || selected.run.status === "running"} aria-label="Enhance" title="Enhance">
                  ↑
                </button>
              ) : null}
              {taskId === "logo" && !selectedIsVector && (
                <button className="icon-button labeled" data-label="Vectorize" type="button" onClick={handleVectorize} disabled={working || selected.run.status === "running"} aria-label="Vectorize logo" title="Vectorize logo">
                  ◇
                </button>
              )}
              {canConvertToMockup && selected.run.output?.mockup ? (
                <button className="ghost-button" type="button" onClick={() => { onEditMockup(selected.run); closeSelected(); }}>
                  ✦ Edit Mockup
                </button>
              ) : null}
              {canConvertToMockup && !selected.run.output?.mockup ? (
                <button className="ghost-button" type="button" onClick={handleConvert} disabled={working || selected.run.status === "running"}>
                  {working ? "Converting..." : "✦ Convert to HTML"}
                </button>
              ) : null}
              <a className="icon-button labeled" data-label="Download" href={selected.image.url} download={`catalyst-${selected.run.id}-${selected.index + 1}.png`} aria-label="Download result" title="Download result">
                ↓
              </a>
              <button className="icon-button labeled" data-label={copied ? "Copied" : "Copy URL"} type="button" onClick={() => copyUrl(selected.image.url)} aria-label={copied ? "URL copied" : "Copy URL"} title={copied ? "Copied" : "Copy URL"}>
                ⧉
              </button>
              <button className="icon-button labeled" data-label={promptCopied ? "Copied" : "Copy prompt"} type="button" onClick={() => copyPrompt(selectedPrompt)} disabled={!selectedPrompt} aria-label={promptCopied ? "Prompt copied" : "Copy prompt"} title={promptCopied ? "Prompt copied" : "Copy prompt"}>
                ¶
              </button>
              {selectedIsVector ? (
                <button className={showVectorXray ? "icon-button labeled active" : "icon-button labeled"} data-label="X-ray" type="button" onClick={() => setShowVectorXray((value) => !value)} aria-label="Toggle vector x-ray" title="Toggle vector x-ray">
                  ◎
                </button>
              ) : null}
              <button className="icon-button labeled danger" data-label="Delete" type="button" onClick={() => void handleDeleteRun(selected.run.id)} disabled={working} aria-label="Delete generation" title="Delete generation">
                ×
              </button>
            </div>

            {selectedHasHistory ? (
              <section className="version-panel">
                <div className="modal-panel-head">
                  <span>History</span>
                  <span>{selectedVersionLabel} · v{selected.index + 1} of {selectedVersions.length}</span>
                </div>
                <div className="version-rail">
                  {selectedVersions.map((image, index) => (
                    <button
                      key={`${image.url}-${index}`}
                      type="button"
                      className={index === selected.index ? "version-node active" : "version-node"}
                      onClick={() => {
                        setShowVectorXray(false);
                        setSelected({ run: selected.run, image, index });
                      }}
                      aria-label={`Show version ${index + 1}`}
                    >
                      <span>{index + 1}</span>
                      <small>{image.operation || (index === selectedVersions.length - 1 ? "original" : "generated")}</small>
                    </button>
                  ))}
                </div>
                <div className="branch-graph" aria-label="Version branch graph">
                  {selectedVersions.map((image, index) => (
                    <div key={`${image.url}-branch-${index}`} className={index === selected.index ? "branch-node active" : "branch-node"}>
                      <span />
                      <small>{typeof image.parentIndex === "number" ? `from ${image.parentIndex + 1}` : index === selectedVersions.length - 1 ? "root" : "version"}</small>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {selectedIsVector && showVectorXray ? <VectorInspector image={selected.image} /> : null}

            <section className="modal-prompt-panel">
              <div className="modal-panel-head">
                <span>Prompt</span>
              </div>
              <p>{selectedPrompt || "No prompt saved for this result."}</p>
            </section>

            <section className="edit-chat-panel">
              <div className="modal-panel-head">
                <span>Edit</span>
                <div className="edit-controls-strip">
                  <label className="mini-select-label">
                    <span>Model</span>
                    <select aria-label="Edit model" value={editModelId} onChange={(event) => setEditModelId(event.target.value)} disabled={working}>
                      {editModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {editModelHasQuality ? (
                    <label className="mini-select-label">
                      <span>Quality</span>
                      <select value={editQuality} onChange={(event) => setEditQuality(event.target.value as "low" | "medium" | "high")} disabled={working}>
                        <option value="low">Low</option>
                        <option value="medium">Med</option>
                        <option value="high">High</option>
                      </select>
                    </label>
                  ) : null}
                  {editModelHasResolution ? (
                    <label className="mini-select-label">
                      <span>Resolution</span>
                      <select value={editResolution} onChange={(event) => setEditResolution(event.target.value as "1k" | "2k")} disabled={working}>
                        <option value="1k">1K</option>
                        <option value="2k">2K</option>
                      </select>
                    </label>
                  ) : null}
                </div>
              </div>
              {chatMessages.length ? (
                <div className="edit-chat-log">
                  {chatMessages.map((message, index) => (
                    <div key={`${message.role}-${index}`} className={`edit-chat-message ${message.role}`}>
                      {message.text}
                    </div>
                  ))}
                </div>
              ) : null}
              <form className="edit-chat-form" onSubmit={handleEditSubmit}>
                <label className="sr-only" htmlFor="result-edit-prompt">Edit prompt</label>
                <div className={working ? "chat-input-shell working" : "chat-input-shell"}>
                  <textarea
                    id="result-edit-prompt"
                    value={editPrompt}
                    onChange={(event) => setEditPrompt(event.target.value)}
                    placeholder="Ask for an edit..."
                    disabled={working || selected.run.status === "running"}
                    rows={1}
                  />
                  <button className="send-icon-button" type="submit" disabled={working || selected.run.status === "running" || !editPrompt.trim()} aria-label="Send edit" title="Send edit">
                    {working ? "…" : "↑"}
                  </button>
                </div>
              </form>
              {working ? (
                <div className="edit-working-indicator" role="status" aria-live="polite">
                  <span />
                  <span />
                  <span />
                  Editing image
                </div>
              ) : null}
            </section>

            {modalError ? <p className="error-line">{modalError}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
