import { useEffect, useMemo, useState } from "react";
import type { CreateRunRequest, FieldOption, ModelSpec, RunRecord, TaskId } from "@ray-catalyst/core";
import { RunResults } from "./components/RunResults";
import { MockupEditor } from "./components/MockupEditor";
import { EditableMockupPage } from "./components/EditableMockupPage";
import { BrandCatalystPage } from "./components/BrandCatalystPage";
import { createRun, fetchCapabilities, fetchRuns, type Capabilities } from "./lib/api";
import { fileToAttachment } from "./lib/files";

function displayError(error: unknown) {
  if (!error) return "";
  if (typeof error === "string") return error === "[object Object]" ? "The request failed. Try again." : error;
  if (error && typeof error === "object") {
    const item = error as { message?: unknown; error?: unknown; detail?: unknown };
    for (const value of [item.message, item.error, item.detail]) {
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return "The request failed. Try again.";
}

function aspectRatioNumber(value: string) {
  const [rawWidth, rawHeight] = value.split(":");
  const width = Number(rawWidth);
  const height = Number(rawHeight);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return width / height;
}

function nearestAspectOption(options: FieldOption[], requested: unknown) {
  const requestedValue = typeof requested === "string" && requested.trim() ? requested.trim() : "";
  const exact = options.find((option) => option.value === requestedValue);
  if (exact) return exact;

  const requestedRatio = aspectRatioNumber(requestedValue);
  if (!requestedRatio) return options[0];

  return options.reduce((best, option) => {
    const optionRatio = aspectRatioNumber(option.value);
    const bestRatio = aspectRatioNumber(best.value);
    if (!optionRatio || !bestRatio) return best;
    const optionDistance = Math.abs(Math.log(optionRatio / requestedRatio));
    const bestDistance = Math.abs(Math.log(bestRatio / requestedRatio));
    return optionDistance < bestDistance ? option : best;
  }, options[0]);
}

function aspectFieldFor(model: ModelSpec | undefined) {
  return model?.inputFields.find((field) => field.key === "aspectRatio" && field.kind === "aspectRatio");
}

function defaultInputsFor(model: ModelSpec | undefined, current: Record<string, unknown> = {}) {
  const next = { ...current };
  for (const field of model?.inputFields || []) {
    if (next[field.key] !== undefined) continue;
    if (field.defaultValue !== undefined) next[field.key] = field.defaultValue;
    else if (field.kind === "number") next[field.key] = 1;
    else if (field.kind === "boolean") next[field.key] = false;
    else if (field.kind === "images") next[field.key] = [];
    else next[field.key] = "";
  }
  const aspectField = aspectFieldFor(model);
  if (aspectField?.options?.length) {
    next.aspectRatio = nearestAspectOption(aspectField.options, next.aspectRatio ?? aspectField.defaultValue)?.value || "1:1";
  }
  return next;
}

function modelDetailLabel(model: ModelSpec | undefined, inputs: Record<string, unknown>) {
  if (!model) return "Model";
  const suffix =
    model.id === "gpt-image-2"
      ? ` · ${String(inputs.quality || "low")}`
      : model.id === "grok-imagine-quality"
        ? ` · ${String(inputs.resolution || "1k")}`
        : model.id === "recraft-v4"
          ? ` · ${inputs.recraftPro ? "Pro" : "Standard"}${inputs.recraftVector ? " Vector" : ""}`
          : "";
  return `${model.label}${suffix}`;
}

function estimateCost(modelId: string, inputs: Record<string, unknown>) {
  const count = Number(inputs.count || 1);
  const prices: Record<string, number> = {
    "nano-banana-2": 0.08,
    "seedream-5-lite": 0.035,
    "grok-imagine": 0.02,
    "grok-imagine-quality": String(inputs.resolution || "1k") === "2k" ? 0.12 : 0.06,
    "recraft-v4": 0.04,
    "ideogram-v3": 0.08
  };

  if (modelId === "gpt-image-2") {
    const quality = String(inputs.quality || "low");
    const qualityPrices: Record<string, number> = { low: 0.07, medium: 0.12, high: 0.17 };
    return (qualityPrices[quality] || qualityPrices.low) * count;
  }

  if (modelId === "recraft-v4") {
    const isPro = !!inputs.recraftPro;
    const isVector = !!inputs.recraftVector;
    let basePrice = 0.04;
    if (isPro && isVector) basePrice = 0.30;
    else if (isPro) basePrice = 0.25;
    else if (isVector) basePrice = 0.08;
    return basePrice * count;
  }

  return (prices[modelId] || 0) * count;
}

function recordedRunCost(run: RunRecord) {
  return (run.modelInvocations || []).reduce((total, invocation) => total + (invocation.estimatedCostUsd || 0), 0);
}

const taskIds: TaskId[] = ["mockup", "logo"];

function getInitialTask(currentPath?: string): TaskId {
  const params = new URLSearchParams(window.location.search);
  const taskParam = params.get("task");
  if (taskParam && taskIds.includes(taskParam as TaskId)) return taskParam as TaskId;

  const rawPath = currentPath !== undefined ? currentPath : window.location.pathname.replace(/^\/+|\/+$/g, "").toLowerCase();
  const path = (rawPath === "asset" || rawPath === "assets") ? "" : rawPath;
  const pathTasks: Record<string, TaskId> = {
    mockup: "mockup",
    mockups: "mockup",
    logo: "logo",
    logos: "logo"
  };
  return pathTasks[path] || "mockup";
}

function initialInputsForTask(taskId: TaskId) {
  return {
    count: 1,
    aspectRatio: taskId === "logo" ? "1:1" : "2:3",
    quality: "low",
    style: "",
    enhancePrompt: false,
    colorPalette: []
  };
}

export function App() {
  const [path, setPath] = useState(() => {
    const initialPath = window.location.pathname.replace(/^\/+|\/+$/g, "").toLowerCase();
    if (initialPath === "asset" || initialPath === "assets") {
      window.history.replaceState({}, "", "/");
      return "";
    }
    return initialPath;
  });
  const isEditablePage = ["editable", "editor", "mockup-editor"].includes(path);
  const isBrandPage = ["brand", "brands"].includes(path);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [taskId, setTaskId] = useState<TaskId>(() => {
    const initialPath = window.location.pathname.replace(/^\/+|\/+$/g, "").toLowerCase();
    const cleanPath = (initialPath === "asset" || initialPath === "assets") ? "" : initialPath;
    return getInitialTask(cleanPath);
  });
  const [modelId, setModelId] = useState("gpt-image-2");
  const [inputs, setInputs] = useState<Record<string, unknown>>(() => {
    const initialPath = window.location.pathname.replace(/^\/+|\/+$/g, "").toLowerCase();
    const cleanPath = (initialPath === "asset" || initialPath === "assets") ? "" : initialPath;
    return initialInputsForTask(getInitialTask(cleanPath));
  });
  const [attachments, setAttachments] = useState<CreateRunRequest["attachments"]>([]);
  const [runs, setRuns] = useState<Awaited<ReturnType<typeof fetchRuns>>["runs"]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [debugOpen, setDebugOpen] = useState(false);
  const [activeMockupRunId, setActiveMockupRunId] = useState<string | null>(null);
  const [sessionCost, setSessionCost] = useState(() => Number(sessionStorage.getItem("catalyst-session-cost") || "0"));

  const navigate = (newPath: string) => {
    let targetPath = newPath.replace(/^\/+|\/+$/g, "").toLowerCase();
    if (targetPath === "asset" || targetPath === "assets") {
      targetPath = "";
      window.history.pushState({}, "", "/");
    } else {
      window.history.pushState({}, "", newPath.startsWith("/") ? newPath : `/${newPath}`);
    }
    setPath(targetPath);
  };

  useEffect(() => {
    const handlePopState = () => {
      const poppedPath = window.location.pathname.replace(/^\/+|\/+$/g, "").toLowerCase();
      if (poppedPath === "asset" || poppedPath === "assets") {
        window.history.replaceState({}, "", "/");
        setPath("");
      } else {
        setPath(poppedPath);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    Promise.all([fetchCapabilities(), fetchRuns()])
      .then(([caps, runData]) => {
        setCapabilities(caps);
        setRuns(runData.runs);
        const initialPath = window.location.pathname.replace(/^\/+|\/+$/g, "").toLowerCase();
        const cleanPath = (initialPath === "asset" || initialPath === "assets") ? "" : initialPath;
        const initialTask = getInitialTask(cleanPath);
        const defaultModel = caps.defaults[initialTask]?.modelId || caps.defaults.mockup.modelId;
        setModelId(defaultModel);
        setInputs(defaultInputsFor(caps.models.find((item) => item.id === defaultModel), initialInputsForTask(initialTask)));
      })
      .catch((err) => setError(displayError(err)));
  }, []);

  useEffect(() => {
    if (!capabilities) return;
    const pathTasks: Record<string, TaskId> = {
      mockup: "mockup",
      mockups: "mockup",
      logo: "logo",
      logos: "logo"
    };
    const nextTask = pathTasks[path];
    if (nextTask) {
      if (nextTask === taskId) return;
      setTaskId(nextTask);
      const defaultModel = capabilities.defaults[nextTask]?.modelId || capabilities.defaults.mockup.modelId;
      setModelId(defaultModel);
      setInputs(defaultInputsFor(capabilities.models.find((item) => item.id === defaultModel), initialInputsForTask(nextTask)));
      return;
    }
    if (path && !isEditablePage && !isBrandPage) {
      window.history.replaceState({}, "", "/");
      setPath("");
    }
  }, [path, capabilities, isEditablePage, taskId]);

  const hasRunningRuns = useMemo(
    () => runs.some((run) => run.status === "running" || run.status === "queued"),
    [runs]
  );

  useEffect(() => {
    if (!hasRunningRuns) return;
    const interval = window.setInterval(() => {
      fetchRuns()
        .then((runData) => setRuns(runData.runs))
        .catch((err) => setError(displayError(err)));
    }, 2_000);
    return () => window.clearInterval(interval);
  }, [hasRunningRuns]);

  const activeTask = useMemo(
    () => capabilities?.tasks.find((t) => t.id === taskId),
    [capabilities, taskId]
  );
  const modelsForTask = useMemo(
    () => capabilities?.models.filter((model) => model.taskIds.includes(taskId) && model.id !== "auto-random" && model.id !== "smart-mix") || [],
    [capabilities, taskId]
  );
  const selectedModel = useMemo(
    () => capabilities?.models.find((model) => model.id === modelId),
    [capabilities, modelId]
  );
  const activeMockupRun = useMemo(
    () => runs.find((r) => r.id === activeMockupRunId),
    [runs, activeMockupRunId]
  );

  const filteredRuns = useMemo(() => {
    return runs.filter((run) => {
      const runTask = run.request?.taskId;
      if (taskId === "logo") {
        return runTask === "logo";
      }
      if (taskId === "mockup") {
        return runTask === "mockup" || !runTask;
      }
      return runTask === taskId;
    });
  }, [runs, taskId]);

  function setInput(key: string, value: unknown) {
    setInputs((current) => ({ ...current, [key]: value }));
  }

  function selectModel(nextModel: string) {
    const model = capabilities?.models.find((item) => item.id === nextModel);
    setModelId(nextModel);
    setInputs((current) => defaultInputsFor(model, current));
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const next = await Promise.all(Array.from(files).map(fileToAttachment));
    setAttachments((current) => [...current, ...next]);
  }

  async function submit() {
    if (!selectedModel) return;
    setBusy(true);
    setError("");
    const tempId = `temp-${Date.now()}`;
    const tempRun: RunRecord = {
      id: tempId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "running",
      request: {
        taskId,
        modelId,
        inputs,
        attachments
      },
      model: {
        id: selectedModel.id,
        label: selectedModel.label,
        provider: selectedModel.provider,
        endpoint: selectedModel.endpoint,
        synthId: selectedModel.synthId,
        defaultPostprocessors: selectedModel.defaultPostprocessors
      },
      events: [{ at: new Date().toISOString(), message: `Queued ${selectedModel.label}` }]
    };

    setRuns((current) => [tempRun, ...current]);

    try {
      const result = await createRun({
        taskId,
        modelId,
        inputs,
        attachments
      });
      const recordedCost = recordedRunCost(result.run);
      const runCost = recordedCost || (capabilities?.providerMode === "live" ? cost : 0);
      if (runCost > 0) {
        setSessionCost((current) => {
          const next = Number((current + runCost).toFixed(4));
          sessionStorage.setItem("catalyst-session-cost", String(next));
          return next;
        });
      }
      setRuns((current) => [result.run, ...current.filter((run) => run.id !== tempId && run.id !== result.run.id)]);
    } catch (err) {
      const errorMessage = displayError(err);
      setError(errorMessage);
      setRuns((current) =>
        current.map((run) =>
          run.id === tempId
            ? {
                ...run,
                status: "failed" as const,
                error: errorMessage,
                events: [...run.events, { at: new Date().toISOString(), message: `Failed: ${errorMessage}` }]
              }
            : run
        )
      );
    } finally {
      setBusy(false);
    }
  }

  if (isBrandPage) {
    return <BrandCatalystPage onNavigate={navigate} />;
  }

  if (isEditablePage) {
    return <EditableMockupPage onNavigate={navigate} />;
  }

  if (!capabilities) {
    return <main className="boot">Loading Catalyst...</main>;
  }

  if (path === "") {
    return (
      <>
        <header className="topbar">
          <div className="topbar-left">
            <span className="brand" style={{ cursor: "pointer" }} onClick={() => navigate("")}>✦ catalyst</span>
            <span className="brand-tag">studio</span>
          </div>
          <div className="topbar-right">
            <span className="session-cost">session est. ${sessionCost.toFixed(2)}</span>
            <button className="topbar-link" type="button" onClick={() => setDebugOpen((open) => !open)}>Debug</button>
          </div>
        </header>

        <main className="hub-container animate-slide-in">
          <div className="hub-hero">
            <h1 className="hub-logo">✦ catalyst <span>studio</span></h1>
            <p className="hub-tagline">
              An elegant suite of generative tools for high-fidelity mockups, vector branding, and editable mockup conversion.
            </p>
          </div>

          <div className="hub-grid">
            <a href="/mockup" className="hub-card" onClick={(e) => { e.preventDefault(); navigate("mockup"); }}>
              <div className="hub-card-icon">▧</div>
              <div className="hub-card-meta">
                <h2 className="hub-card-title">Mockup Catalyst <span>pages</span></h2>
                <p className="hub-card-description">
                  Generate beautiful landing pages, mobile apps, and interactive web interface layouts from simple natural language prompts.
                </p>
              </div>
              <span className="hub-card-arrow">Open Tool →</span>
            </a>

            <a href="/logo" className="hub-card" onClick={(e) => { e.preventDefault(); navigate("logo"); }}>
              <div className="hub-card-icon">▦</div>
              <div className="hub-card-meta">
                <h2 className="hub-card-title">Logo Catalyst <span>identities</span></h2>
                <p className="hub-card-description">
                  Create unique corporate identities, sleek vector icons, branding marks, and custom color-palletized logos.
                </p>
              </div>
              <span className="hub-card-arrow">Open Tool →</span>
            </a>

            <a href="/editable" className="hub-card" onClick={(e) => { e.preventDefault(); navigate("editable"); }}>
              <div className="hub-card-icon">⌨</div>
              <div className="hub-card-meta">
                <h2 className="hub-card-title">Editable Conversion <span>code</span></h2>
                <p className="hub-card-description">
                  Upload any JPG, PNG, or WEBP interface screenshot and convert it into clean, responsive, and fully editable HTML/CSS structures.
                </p>
              </div>
              <span className="hub-card-arrow">Convert Mockup →</span>
            </a>

            <a href="/brand" className="hub-card" onClick={(e) => { e.preventDefault(); navigate("brand"); }}>
              <div className="hub-card-icon">✦</div>
              <div className="hub-card-meta">
                <h2 className="hub-card-title">Brand Catalyst <span>identity</span></h2>
                <p className="hub-card-description">
                  Generate beautiful complete brand systems, custom color palettes, parallel icon suites, and stunning HTML brand showcase pages.
                </p>
              </div>
              <span className="hub-card-arrow">Create Brand →</span>
            </a>
          </div>
        </main>

        {debugOpen ? (
          <div className="debug-panel">
            <strong>Current selection</strong>
            <pre>{JSON.stringify({ path, runsCount: runs.length }, null, 2)}</pre>
          </div>
        ) : null}
      </>
    );
  }

  const count = Number(inputs.count || 1);
  const taskTag = taskId === "logo" ? "logos" : "mockups";
  const cost = estimateCost(modelId, inputs);

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <span className="brand" style={{ cursor: "pointer" }} onClick={() => navigate("")}>✦ catalyst</span>
          <span className="brand-tag">{taskTag}</span>
        </div>
        <div className="topbar-right">
          <span className="session-cost">session est. ${sessionCost.toFixed(2)}</span>
          <button className="topbar-chip" type="button">{modelDetailLabel(selectedModel, inputs)}</button>
          <button className="topbar-link" type="button" onClick={() => navigate("")}>Tools Hub</button>
          <span className="topbar-sep">·</span>
          <button className="topbar-link" type="button" onClick={() => setDebugOpen((open) => !open)}>Debug</button>
        </div>
      </header>

      <main className="stage">
        <div className="stage-main">
          <section className="composer">
            <div className="composer-eyebrow">
              <span className="eyebrow-dot" />
              <span className="eyebrow-text">Describe what you want to see</span>
            </div>

            <div className="composer-surface">
              <label className="sr-only" htmlFor="prompt">Prompt</label>
              <textarea
                id="prompt"
                className="prompt-field"
                rows={3}
                value={String(inputs.prompt || "")}
                onChange={(event) => setInput("prompt", event.target.value)}
                placeholder="Describe the website, app screen, or logo you want..."
                disabled={busy}
              />

              <div className="composer-enhancement-row">
                <label className="toggle-label" htmlFor="enhancePrompt">
                  <input
                    id="enhancePrompt"
                    type="checkbox"
                    checked={!!inputs.enhancePrompt}
                    onChange={(event) => setInput("enhancePrompt", event.target.checked)}
                    disabled={busy}
                  />
                  <span>Enhance input (LLM rewriting)</span>
                </label>
              </div>

              {activeTask?.optionalInputFields?.filter(field => field.key !== "colorPalette").map((field) => (
                <div key={field.key} className="composer-optional-field">
                  <label htmlFor={field.key} className="optional-field-label">
                    {field.label}
                  </label>
                  {field.kind === "textarea" ? (
                    <textarea
                      id={field.key}
                      className="optional-input-field optional-textarea-field"
                      value={String(inputs[field.key] || "")}
                      onChange={(event) => setInput(field.key, event.target.value)}
                      placeholder={field.placeholder}
                      disabled={busy}
                      rows={2}
                    />
                  ) : field.kind === "select" ? (
                    <select
                      id={field.key}
                      className="optional-input-field optional-select-field"
                      value={String(inputs[field.key] ?? field.defaultValue ?? "")}
                      onChange={(event) => setInput(field.key, event.target.value)}
                      disabled={busy}
                    >
                      {field.options?.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={field.key}
                      type="text"
                      className="optional-input-field"
                      value={String(inputs[field.key] || "")}
                      onChange={(event) => setInput(field.key, event.target.value)}
                      placeholder={field.placeholder}
                      disabled={busy}
                    />
                  )}
                  {field.help && <small className="optional-field-help">{field.help}</small>}
                </div>
              ))}

              <div className="composer-rail">
                <div className="rail-drops">
                  <label className="drop-tile">
                    <input className="drop-input" type="file" accept="image/*" onChange={(event) => handleFiles(event.target.files)} disabled={busy} />
                    <span className="drop-body">
                      <span className="drop-icon">▧</span>
                      <span className="drop-text"><strong>Logo</strong><small>Drop or click</small></span>
                    </span>
                  </label>
                  <label className="drop-tile">
                    <input className="drop-input" type="file" multiple accept="image/*" onChange={(event) => handleFiles(event.target.files)} disabled={busy} />
                    <span className="drop-body">
                      <span className="drop-icon">▧</span>
                      <span className="drop-text"><strong>References</strong><small>{attachments.length ? `${attachments.length} attached` : "Drop inspiration"}</small></span>
                    </span>
                  </label>

                  {(taskId === "logo" || taskId === "mockup") && (
                    <div className="drop-tile color-palette-tile">
                      <span className="drop-body">
                        <span className="drop-icon">▦</span>
                        <span className="drop-text">
                          <strong>Color Palette</strong>
                          <span className="palette-controls">
                            <span className="swatches-row">
                              {(((inputs.colorPalette as string[]) || [])).map((color, idx) => (
                                <label key={idx} className="swatch-label" style={{ backgroundColor: color }} title="Click to change color">
                                  <input
                                    type="color"
                                    className="swatch-color-picker"
                                    value={color.startsWith("#") && color.length === 7 ? color : "#ffffff"}
                                    onChange={(e) => {
                                      const updated = [...((inputs.colorPalette as string[]) || [])];
                                      updated[idx] = e.target.value;
                                      setInput("colorPalette", updated);
                                    }}
                                    disabled={busy}
                                  />
                                </label>
                              ))}
                              {((inputs.colorPalette as string[]) || []).length < 5 && (
                                <button
                                  type="button"
                                  className="swatch-add-button"
                                  onClick={() => {
                                    const updated = [...((inputs.colorPalette as string[]) || []), "#355C7D"];
                                    setInput("colorPalette", updated);
                                  }}
                                  disabled={busy}
                                  title="Add color"
                                >
                                  +
                                </button>
                              )}
                              {((inputs.colorPalette as string[]) || []).length > 0 && (
                                <button
                                  type="button"
                                  className="swatch-clear-button"
                                  onClick={() => setInput("colorPalette", [])}
                                  disabled={busy}
                                  title="Clear palette"
                                >
                                  ↺
                                </button>
                              )}
                            </span>
                            <input
                              id="colorPalette"
                              type="text"
                              className="palette-hex-text"
                              value={Array.isArray(inputs.colorPalette) ? inputs.colorPalette.join(", ") : ""}
                              onChange={(e) => {
                                const colors = e.target.value.split(",").map(c => c.trim()).filter(Boolean);
                                setInput("colorPalette", colors);
                              }}
                              placeholder="Optional hex colors: #111318, #F7F3EA"
                              disabled={busy}
                            />
                          </span>
                        </span>
                      </span>
                    </div>
                  )}
                </div>
                <div className="rail-meta">
                  <span><span>Model</span> {selectedModel?.label}</span>
                  <span>·</span>
                  <span><span>Count</span> {count}</span>
                </div>
              </div>
            </div>

            <div className="style-row">
              <span className="style-label">Style</span>
              <div className="style-chips">
                {["Minimal", "Bold", "Playful", "Luxury", "Modern"].map((label) => {
                  const active = inputs.style === label;
                  return (
                    <button
                      key={label}
                      type="button"
                      className={active ? "tag-chip active" : "tag-chip"}
                      onClick={() => setInput("style", active ? "" : label)}
                      disabled={busy}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="composer-action">
              <div className="action-left">
                <button className="generate-button" type="button" onClick={submit} disabled={busy || !String(inputs.prompt || "").trim()}>
                  {busy ? "Generating..." : `Generate ${taskTag}`}
                </button>
                {busy && (
                  <span className="generation-status-text">
                    <span className="status-spinner-small">✦</span>
                    Sending prompt to {selectedModel?.label}...
                  </span>
                )}
              </div>
              <div className="action-right">
                <span className="cost-line"><span>est.</span><strong>{cost === null ? "varies" : `$${cost.toFixed(2)}`}</strong></span>
              </div>
            </div>

            {error ? <div className="error-box">{error}</div> : null}
          </section>

          <RunResults 
            runs={filteredRuns} 
            onRunUpdated={(run) => setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)])}
            onRunDeleted={(runId) => setRuns((current) => current.filter((item) => item.id !== runId))}
            onEditMockup={(run) => setActiveMockupRunId(run.id)}
            editModels={capabilities.editModels}
            taskId={taskId}
          />
        </div>

        <aside className="sidebar">
          <div className="sidebar-card">
            <div className="sidebar-section">
              <div className="sidebar-head"><span className="sidebar-label">Model</span></div>
              <select
                className="sidebar-select"
                aria-label="Generation model"
                value={modelId}
                onChange={(event) => selectModel(event.target.value)}
                disabled={busy}
              >
                {modelsForTask.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            </div>

            {selectedModel?.inputFields
              .filter((field) => !["prompt", "aspectRatio", "count"].includes(field.key))
              .map((field) => {
                if (field.kind === "select") {
                  return (
                    <div key={field.key} className="sidebar-section">
                      <div className="sidebar-head">
                        <span className="sidebar-label">{field.label}</span>
                      </div>
                      <div className="chip-row">
                        {field.options?.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            className={inputs[field.key] === opt.value ? "chip active" : "chip"}
                            onClick={() => setInput(field.key, opt.value)}
                            disabled={busy}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                }
                if (field.kind === "boolean") {
                  const val = !!inputs[field.key];
                  return (
                    <div key={field.key} className="sidebar-section">
                      <div className="sidebar-head">
                        <span className="sidebar-label">{field.label}</span>
                      </div>
                      <div className="chip-row">
                        <button
                          type="button"
                          className={val ? "chip active" : "chip"}
                          onClick={() => setInput(field.key, true)}
                          disabled={busy}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          className={!val ? "chip active" : "chip"}
                          onClick={() => setInput(field.key, false)}
                          disabled={busy}
                        >
                          No
                        </button>
                      </div>
                    </div>
                  );
                }
                return null;
              })}

            {(() => {
              const aspectFieldSpec = aspectFieldFor(selectedModel);
              const showAspectSelector = !!aspectFieldSpec?.options?.length;
              if (!showAspectSelector) return null;
              
              const options = aspectFieldSpec.options!;
              const currentOption = nearestAspectOption(options, inputs.aspectRatio);
              const currentVal = currentOption?.value || "1:1";
              const currentIndex = Math.max(0, options.findIndex((opt) => opt.value === currentVal));
              
              return (
                <div className="sidebar-section">
                  <div className="sidebar-head">
                    <span className="sidebar-label">Aspect ratio</span>
                    <span className="sidebar-value">{currentVal}</span>
                  </div>
                  
                  <div className="aspect-ratio-controls">
                    <div className="aspect-stepper-row">
                      <button
                        type="button"
                        className="aspect-stepper-btn"
                        disabled={busy || currentIndex <= 0}
                        onClick={() => {
                          const nextOpt = options[currentIndex - 1];
                          if (nextOpt) setInput("aspectRatio", nextOpt.value);
                        }}
                        title="Step wider"
                        aria-label="Step wider"
                      >
                        ‹
                      </button>
                      
                      <input
                        type="range"
                        className="sidebar-range aspect-slider"
                        min="0"
                        max={options.length - 1}
                        value={currentIndex}
                        disabled={busy}
                        onChange={(e) => {
                          const idx = parseInt(e.target.value, 10);
                          const nextOpt = options[idx];
                          if (nextOpt) setInput("aspectRatio", nextOpt.value);
                        }}
                      />
                      
                      <button
                        type="button"
                        className="aspect-stepper-btn"
                        disabled={busy || currentIndex >= options.length - 1}
                        onClick={() => {
                          const nextOpt = options[currentIndex + 1];
                          if (nextOpt) setInput("aspectRatio", nextOpt.value);
                        }}
                        title="Step taller"
                        aria-label="Step taller"
                      >
                        ›
                      </button>
                    </div>

                    <div className="aspect-tick-row" aria-hidden="true">
                      <span>{options[0]?.value}</span>
                      <span>{options[currentIndex]?.value}</span>
                      <span>{options[options.length - 1]?.value}</span>
                    </div>

                    <div className="aspect-preview-row">
                      <div className="aspect-preview-container">
                        <div 
                          className="aspect-preview-box" 
                          style={(() => {
                            const parts = currentVal.split(":");
                            let w = 1, h = 1;
                            if (parts.length === 2) {
                              w = parseFloat(parts[0]) || 1;
                              h = parseFloat(parts[1]) || 1;
                            }
                            const maxDim = 28;
                            const scale = maxDim / Math.max(w, h);
                            return {
                              width: `${Math.round(w * scale)}px`,
                              height: `${Math.round(h * scale)}px`
                            };
                          })()}
                        />
                      </div>
                      <div className="aspect-labels-container">
                        <div className="aspect-label-sub">{
                          (() => {
                            const parts = currentVal.split(":");
                            if (parts.length === 2) {
                              const w = parseFloat(parts[0]);
                              const h = parseFloat(parts[1]);
                              if (w === h) return "Square shape";
                              if (w < h) return "Vertical format";
                              if (w > h) return "Horizontal format";
                            }
                            return "Custom format";
                          })()
                        }</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="sidebar-section">
              <div className="sidebar-head"><span className="sidebar-label">Count</span><span className="sidebar-value">{count} {taskTag}</span></div>
              <input className="sidebar-range" type="range" min="1" max="10" value={count} onChange={(event) => setInput("count", Number(event.target.value))} disabled={busy} />
            </div>
          </div>
        </aside>

      </main>

      {debugOpen ? (
        <div className="debug-panel">
          <strong>Current selection</strong>
          <pre>{JSON.stringify({ task: taskId, model: selectedModel?.label, inputs }, null, 2)}</pre>
        </div>
      ) : null}
      {activeMockupRun && (
        <MockupEditor
          run={activeMockupRun}
          onClose={() => setActiveMockupRunId(null)}
          onRunUpdated={(updatedRun) => {
            setRuns((current) => current.map((item) => item.id === updatedRun.id ? updatedRun : item));
          }}
        />
      )}
    </>
  );
}
