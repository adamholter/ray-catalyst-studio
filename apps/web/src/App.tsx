import { useEffect, useMemo, useState } from "react";
import type { CreateRunRequest, ModelSpec, TaskId } from "@ray-catalyst/core";
import { RunResults } from "./components/RunResults";
import { createRun, fetchCapabilities, fetchRuns, type Capabilities } from "./lib/api";
import { fileToAttachment } from "./lib/files";

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
  return next;
}

function modelDetailLabel(model: ModelSpec | undefined, inputs: Record<string, unknown>) {
  if (!model) return "Model";
  const suffix = model.id === "gpt-image-2" ? ` · ${String(inputs.quality || "low")}` : "";
  return `${model.label}${suffix}`;
}

export function App() {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [taskId, setTaskId] = useState<TaskId>("mockup");
  const [modelId, setModelId] = useState("gpt-image-2");
  const [inputs, setInputs] = useState<Record<string, unknown>>({ count: 1, aspectRatio: "2:3", quality: "low" });
  const [attachments, setAttachments] = useState<CreateRunRequest["attachments"]>([]);
  const [runs, setRuns] = useState<Awaited<ReturnType<typeof fetchRuns>>["runs"]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [debugOpen, setDebugOpen] = useState(false);

  useEffect(() => {
    Promise.all([fetchCapabilities(), fetchRuns()])
      .then(([caps, runData]) => {
        setCapabilities(caps);
        setRuns(runData.runs);
        const defaultModel = caps.defaults.mockup.modelId;
        setModelId(defaultModel);
        setInputs(defaultInputsFor(caps.models.find((item) => item.id === defaultModel), inputs));
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const task = useMemo(() => capabilities?.tasks.find((item) => item.id === taskId), [capabilities, taskId]);
  const modelsForTask = useMemo(
    () => capabilities?.models.filter((model) => model.taskIds.includes(taskId)) || [],
    [capabilities, taskId]
  );
  const selectedModel = useMemo(
    () => capabilities?.models.find((model) => model.id === modelId),
    [capabilities, modelId]
  );
  const selectedUpscaler = useMemo(() => {
    const id = selectedModel?.defaultPostprocessors[0];
    return capabilities?.upscalers.find((upscaler) => upscaler.id === id);
  }, [capabilities, selectedModel]);

  function setInput(key: string, value: unknown) {
    setInputs((current) => ({ ...current, [key]: value }));
  }

  function selectTask(nextTask: TaskId) {
    const defaultModel = capabilities?.defaults[nextTask]?.modelId || "grok-imagine";
    const model = capabilities?.models.find((item) => item.id === defaultModel);
    setTaskId(nextTask);
    setModelId(defaultModel);
    setInputs(defaultInputsFor(model, { prompt: inputs.prompt || "", count: inputs.count || 1, aspectRatio: inputs.aspectRatio || "2:3" }));
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
    try {
      const result = await createRun({
        taskId,
        modelId,
        inputs,
        attachments,
        postprocess: {
          upscalerId: selectedUpscaler?.id || null,
          applyUpscale: selectedModel.synthId.applyUpscaleByDefault
        }
      });
      setRuns((current) => [result.run, ...current.filter((run) => run.id !== result.run.id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!capabilities) {
    return <main className="boot">Loading Catalyst...</main>;
  }

  const count = Number(inputs.count || 1);
  const taskTag = taskId === "mockup" ? "mockups" : taskId === "logo" ? "logos" : taskId === "asset" ? "assets" : "decks";
  const showQuality = selectedModel?.id === "gpt-image-2";

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <span className="brand">✦ catalyst</span>
          <span className="brand-tag">{taskTag}</span>
        </div>
        <div className="topbar-right">
          <button className="topbar-chip" type="button">{modelDetailLabel(selectedModel, inputs)}</button>
          <button className="topbar-link" type="button">Settings</button>
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
                placeholder="A museum website for a contemporary art gallery, with an airy editorial feel and a sculptural hero photograph..."
              />

              <div className="composer-rail">
                <div className="rail-drops">
                  <label className="drop-tile">
                    <input className="drop-input" type="file" accept="image/*" onChange={(event) => handleFiles(event.target.files)} />
                    <span className="drop-body">
                      <span className="drop-icon">▧</span>
                      <span className="drop-text"><strong>Logo</strong><small>Drop or click</small></span>
                    </span>
                  </label>
                  <label className="drop-tile">
                    <input className="drop-input" type="file" multiple accept="image/*" onChange={(event) => handleFiles(event.target.files)} />
                    <span className="drop-body">
                      <span className="drop-icon">▧</span>
                      <span className="drop-text"><strong>References</strong><small>{attachments.length ? `${attachments.length} attached` : "Drop inspiration"}</small></span>
                    </span>
                  </label>
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
                {["Minimal", "Bold", "Playful", "Luxury", "Modern"].map((label) => (
                  <button key={label} type="button" className="tag-chip">{label}</button>
                ))}
                <button type="button" className="tag-chip tag-chip-ghost">More +</button>
              </div>
            </div>

            <div className="composer-action">
              <div className="action-left">
                <button className="generate-button" type="button" onClick={submit} disabled={busy}>
                  {busy ? "Generating..." : `Generate ${taskTag}`}
                </button>
                <button className="ghost-button" type="button" onClick={() => selectModel("auto-random")}>Shuffle model</button>
              </div>
              <div className="action-right">
                <span className="cost-line"><span>est.</span><strong>$0.00</strong></span>
              </div>
            </div>

            <details className="advanced">
              <summary>
                <span>Advanced controls</span>
                <span>task, client type, colors, architecture metadata</span>
                <span>›</span>
              </summary>
              <div className="advanced-body">
                <div className="task-row">
                  {capabilities.tasks.map((item) => (
                    <button key={item.id} type="button" className={item.id === taskId ? "chip active" : "chip"} onClick={() => selectTask(item.id)}>
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="system-note">
                  <strong>{task?.description}</strong>
                  <span>Frontend is rendering this from the backend model registry. Provider calls stay server-side.</span>
                </div>
              </div>
            </details>

            {error ? <div className="error-box">{error}</div> : null}
          </section>

          <RunResults runs={runs} />
        </div>

        <aside className="sidebar">
          <div className="sidebar-card">
            <div className="sidebar-section">
              <div className="sidebar-head"><span className="sidebar-label">Model</span></div>
              <div className="chip-row">
                {modelsForTask.map((model) => (
                  <button key={model.id} type="button" className={model.id === modelId ? "chip active" : "chip"} onClick={() => selectModel(model.id)}>
                    {model.label}
                  </button>
                ))}
              </div>
            </div>

            {showQuality ? (
              <div className="sidebar-section">
                <div className="sidebar-head"><span className="sidebar-label">Quality</span></div>
                <div className="chip-row">
                  {["low", "medium", "high"].map((quality) => (
                    <button key={quality} type="button" className={inputs.quality === quality ? "chip active" : "chip"} onClick={() => setInput("quality", quality)}>
                      {quality[0].toUpperCase() + quality.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="sidebar-section">
              <div className="sidebar-head"><span className="sidebar-label">Aspect</span><span className="sidebar-value">{String(inputs.aspectRatio || "2:3")}</span></div>
              <div className="chip-row">
                {[
                  ["Portrait", "2:3"],
                  ["Square", "1:1"],
                  ["Landscape", "16:9"],
                  ["Slide", "16:10"]
                ].map(([label, value]) => (
                  <button key={value} type="button" className={inputs.aspectRatio === value ? "chip active" : "chip"} onClick={() => setInput("aspectRatio", value)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="sidebar-section">
              <div className="sidebar-head"><span className="sidebar-label">Count</span><span className="sidebar-value">{count} {taskTag}</span></div>
              <input className="sidebar-range" type="range" min="1" max="10" value={count} onChange={(event) => setInput("count", Number(event.target.value))} />
            </div>

            <div className="sidebar-section">
              <label className="toggle-label">
                <input type="checkbox" checked={Boolean(selectedModel?.synthId.applyUpscaleByDefault)} readOnly />
                <span>Use SynthID cleanup path when this model needs it</span>
              </label>
              <p className="sidebar-note">{selectedUpscaler ? `${selectedUpscaler.label} is configured as the default interchangeable upscaler.` : "No upscaler is applied by default for this model."}</p>
            </div>
          </div>
        </aside>
      </main>

      {debugOpen ? (
        <div className="debug-panel">
          <strong>Model registry</strong>
          <pre>{JSON.stringify({ selectedModel, upscaler: selectedUpscaler }, null, 2)}</pre>
        </div>
      ) : null}
    </>
  );
}
