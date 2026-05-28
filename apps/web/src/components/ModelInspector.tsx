import type { ModelSpec, UpscalerSpec } from "@ray-catalyst/core";

export function ModelInspector({
  model,
  upscaler
}: {
  model: ModelSpec | undefined;
  upscaler: UpscalerSpec | undefined;
}) {
  if (!model) return <aside className="inspector">Select a model.</aside>;

  return (
    <aside className="inspector">
      <div>
        <p className="section-kicker">Selected model</p>
        <h2>{model.label}</h2>
        <p>{model.ui.recommendedFor.join(" · ")}</p>
      </div>

      <dl className="detail-list">
        <div>
          <dt>Provider</dt>
          <dd>{model.provider}:{model.endpoint}</dd>
        </div>
        <div>
          <dt>Cost / speed</dt>
          <dd>{model.costTier} / {model.speed}</dd>
        </div>
        <div>
          <dt>Output shape</dt>
          <dd>{model.output.path}</dd>
        </div>
        <div>
          <dt>SynthID</dt>
          <dd>
            <span className={`status-dot ${model.synthId.status}`}>{model.synthId.status}</span>
            {model.synthId.note}
          </dd>
        </div>
        <div>
          <dt>Default upscaler</dt>
          <dd>{upscaler ? `${upscaler.label}: ${upscaler.note}` : "None"}</dd>
        </div>
      </dl>

      <div className="shape-table">
        <p className="section-kicker">Inputs</p>
        {model.inputFields.map((field) => (
          <div key={field.key}>
            <span>{field.key}</span>
            <code>{field.kind}{field.required ? " required" : ""}</code>
          </div>
        ))}
      </div>
    </aside>
  );
}
