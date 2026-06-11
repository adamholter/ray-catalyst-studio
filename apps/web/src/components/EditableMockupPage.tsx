import { useState } from "react";
import type { Attachment, RunRecord } from "@ray-catalyst/core";
import { importMockupUpload } from "../lib/api";
import { fileToAttachment } from "../lib/files";
import { MockupEditor } from "./MockupEditor";

function imageDimensions(dataUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
    image.onerror = () => reject(new Error("Could not read image dimensions."));
    image.src = dataUrl;
  });
}

function aspectFromDimensions(width?: number, height?: number) {
  if (!width || !height) return "2:3";
  const ratio = width / height;
  if (ratio > 1.55) return "16:9";
  if (ratio > 1.35) return "16:10";
  if (ratio > 0.9 && ratio < 1.1) return "1:1";
  return "2:3";
}

export interface EditableMockupPageProps {
  onNavigate?: (path: string) => void;
}

export function EditableMockupPage({ onNavigate }: EditableMockupPageProps) {
  const [attachment, setAttachment] = useState<(Attachment & { width?: number; height?: number }) | null>(null);
  const [prompt, setPrompt] = useState("");
  const [run, setRun] = useState<RunRecord | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setError("");
    const uploaded = await fileToAttachment(file);
    const dimensions = await imageDimensions(uploaded.dataUrl);
    setAttachment({ ...uploaded, ...dimensions });
    setRun(null);
  }

  async function convertUpload() {
    if (!attachment) return;
    setWorking(true);
    setError("");
    try {
      const result = await importMockupUpload(attachment, prompt, aspectFromDimensions(attachment.width, attachment.height));
      setRun(result.run);
      setEditorOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not convert the uploaded mockup.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <span
            className="brand"
            style={{ cursor: "pointer" }}
            onClick={(e) => {
              if (onNavigate) {
                e.preventDefault();
                onNavigate("");
              } else {
                window.location.href = "/";
              }
            }}
          >
            ✦ catalyst
          </span>
          <span className="brand-tag">editable</span>
        </div>
        <div className="topbar-right">
          <a
            className="topbar-link"
            href="/mockup"
            onClick={(e) => {
              if (onNavigate) {
                e.preventDefault();
                onNavigate("mockup");
              }
            }}
          >
            Mockups
          </a>
          <span className="topbar-sep">·</span>
          <a
            className="topbar-link"
            href="/logo"
            onClick={(e) => {
              if (onNavigate) {
                e.preventDefault();
                onNavigate("logo");
              }
            }}
          >
            Logos
          </a>
        </div>
      </header>

      <main className="editable-page-shell">
        <section className="editable-upload-panel">
          <div>
            <span className="modal-category">Editable mockups</span>
            <h1>Convert a raster mockup into editable HTML.</h1>
          </div>

          <label className={attachment ? "editable-upload-drop has-file" : "editable-upload-drop"}>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleFile(event.target.files)} disabled={working} />
            {attachment ? (
              <span className="editable-upload-preview">
                <img src={attachment.dataUrl} alt="Uploaded mockup preview" />
                <strong>{attachment.name}</strong>
                <small>{attachment.width} × {attachment.height}</small>
              </span>
            ) : (
              <span className="editable-upload-empty">
                <strong>Upload mockup image</strong>
                <small>PNG, JPG, or WEBP screenshot</small>
              </span>
            )}
          </label>

          <label className="editable-instructions">
            <span>Conversion notes</span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Optional: describe the page, brand, sections, or anything the converter should preserve."
              rows={4}
              disabled={working}
            />
          </label>

          <div className="editable-actions">
            <button className="generate-button" type="button" onClick={convertUpload} disabled={!attachment || working}>
              {working ? "Converting..." : "Make editable"}
            </button>
            {working ? <span className="generation-status-text"><span className="status-spinner-small">✦</span> Building editable HTML...</span> : null}
          </div>

          {error ? <p className="error-box">{error}</p> : null}
        </section>

        <section className="editable-result-panel">
          {run?.output?.mockup ? (
            <>
              <div className="editable-result-head">
                <div>
                  <span className="modal-category">Ready</span>
                  <h2>{run.output.mockup.assets.length} assets mapped</h2>
                </div>
                <button className="ghost-button" type="button" onClick={() => setEditorOpen(true)}>
                  Open editor
                </button>
              </div>
              <div className="editable-result-preview">
                <img src={run.output.images?.[0]?.url} alt="Converted mockup source" />
              </div>
            </>
          ) : (
            <div className="empty-state editable-empty-state">
              <div className="empty-mark">✦</div>
              <div className="empty-title">No editable mockup yet</div>
              <div className="empty-sub">Upload a screenshot and convert it. The editor opens after conversion.</div>
            </div>
          )}
        </section>
      </main>

      {run?.output?.mockup && editorOpen ? (
        <MockupEditor
          run={run}
          onClose={() => setEditorOpen(false)}
          onRunUpdated={(updatedRun) => setRun(updatedRun)}
          initialTab="design"
        />
      ) : null}
    </>
  );
}
