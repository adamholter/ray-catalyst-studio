import { useEffect, useMemo, useState } from "react";
import type { CreateRunRequest, FieldSpec, ModelSpec, TaskId } from "@ray-catalyst/core";
import { AttachmentDropzone } from "./components/AttachmentDropzone";
import { defaultValueForField, FieldRenderer } from "./components/FieldRenderer";
import { ModelInspector } from "./components/ModelInspector";
import { RunResults } from "./components/RunResults";
import { SegmentedControl } from "./components/SegmentedControl";
import { createRun, fetchCapabilities, fetchRuns, type Capabilities } from "./lib/api";

function valuesFromFields(fields: FieldSpec[]) {
  return Object.fromEntries(fields.map((field) => [field.key, defaultValueForField(field)]));
}

export function App() {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [taskId, setTaskId] = useState<TaskId>("mockup");
  const [modelId, setModelId] = useState("grok-imagine");
  const [inputs, setInputs] = useState<Record<string, unknown>>({});
  const [attachments, setAttachments] = useState<CreateRunRequest["attachments"]>([]);
  const [runs, setRuns] = useState<Awaited<ReturnType<typeof fetchRuns>>["runs"]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([fetchCapabilities(), fetchRuns()])
      .then(([caps, runData]) => {
        setCapabilities(caps);
        setRuns(runData.runs);
        const defaultModel = caps.defaults.mockup.modelId;
        setModelId(defaultModel);
        const model = caps.models.find((item) => item.id === defaultModel);
        setInputs(valuesFromFields(model?.inputFields || []));
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const taskOptions = useMemo(
    () => capabilities?.tasks.map((task) => ({ label: task.label, value: task.id })) || [],
    [capabilities]
  );
  const modelsForTask = useMemo(
    () => capabilities?.models.filter((model) => model.taskIds.includes(taskId)) || [],
    [capabilities, taskId]
  );
  const selectedModel = useMemo<ModelSpec | undefined>(
    () => capabilities?.models.find((model) => model.id === modelId),
    [capabilities, modelId]
  );
  const selectedUpscaler = useMemo(() => {
    const id = selectedModel?.defaultPostprocessors[0];
    return capabilities?.upscalers.find((upscaler) => upscaler.id === id);
  }, [capabilities, selectedModel]);

  function selectTask(nextTask: string) {
    const task = nextTask as TaskId;
    setTaskId(task);
    const defaultModel = capabilities?.defaults[task]?.modelId || modelsForTask[0]?.id || "";
    setModelId(defaultModel);
    const model = capabilities?.models.find((item) => item.id === defaultModel);
    setInputs(valuesFromFields(model?.inputFields || []));
  }

  function selectModel(nextModel: string) {
    setModelId(nextModel);
    const model = capabilities?.models.find((item) => item.id === nextModel);
    setInputs((current) => ({ ...valuesFromFields(model?.inputFields || []), ...current }));
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
    return <main className="boot">Loading Catalyst Studio...</main>;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <strong>Catalyst Studio</strong>
          <span>Composable model workbench</span>
        </div>
        <div className="mode-chip">Mock-safe by default</div>
      </header>

      <section className="workbench">
        <div className="composer">
          <SegmentedControl label="Task" options={taskOptions} value={taskId} onChange={selectTask} />
          <SegmentedControl
            label="Model"
            options={modelsForTask.map((model) => ({ label: model.ui.shortName, value: model.id }))}
            value={modelId}
            onChange={selectModel}
          />

          <div className="field-grid">
            {selectedModel?.inputFields.map((field) => (
              <FieldRenderer
                key={field.key}
                field={field}
                value={inputs[field.key]}
                onChange={(value) => setInputs((current) => ({ ...current, [field.key]: value }))}
              />
            ))}
          </div>

          <AttachmentDropzone attachments={attachments} onChange={setAttachments} />

          {error ? <div className="error-box">{error}</div> : null}

          <button className="run-button" type="button" onClick={submit} disabled={busy}>
            {busy ? "Running..." : "Create run"}
          </button>
        </div>

        <ModelInspector model={selectedModel} upscaler={selectedUpscaler} />
      </section>

      <RunResults runs={runs} />
    </main>
  );
}
