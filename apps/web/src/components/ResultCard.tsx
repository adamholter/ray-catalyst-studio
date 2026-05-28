import React, { useState } from 'react';
import { GenerationRun } from '../lib/api';

interface ResultCardProps {
  run: GenerationRun;
  onRedo: (run: GenerationRun) => void;
}

export const ResultCard: React.FC<ResultCardProps> = ({ run, onRedo }) => {
  const [showMetadata, setShowMetadata] = useState(false);
  const output = run.outputs && run.outputs[0];

  if (!output) return null;

  // Determine aspect ratio class based on image dimensions
  const getRatioClass = (w: number, h: number) => {
    const ratio = w / h;
    if (ratio > 1.2) return 'ratio-landscape';
    if (ratio < 0.8) return 'ratio-portrait';
    return 'ratio-square';
  };

  const ratioClass = getRatioClass(output.width, output.height);

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'N/A';
    const kb = bytes / 1024;
    if (kb > 1024) {
      return `${(kb / 1024).toFixed(2)} MB`;
    }
    return `${kb.toFixed(1)} KB`;
  };

  return (
    <div className={`result-card ${ratioClass}`}>
      <div className="result-card-img-wrapper" onClick={() => setShowMetadata(true)}>
        <img
          src={output.url}
          alt={run.prompt}
          className="result-card-img"
          loading="lazy"
        />
        {output.synthIdHash && (
          <div style={{ position: 'absolute', top: '8px', right: '8px', zIndex: 2 }}>
            <span
              style={{
                fontSize: '0.6rem',
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                color: 'var(--accent-blue)',
                padding: '2px 6px',
                border: '1px solid var(--border-light)',
                borderRadius: '2px',
                fontFamily: 'var(--font-mono)',
                fontWeight: '600'
              }}
            >
              SynthID Injected
            </span>
          </div>
        )}
      </div>

      <div className="result-card-footer">
        <span className="result-card-title">{run.prompt}</span>
        <div className="result-card-actions">
          <button
            className="card-action-btn"
            title="View parameters"
            onClick={() => setShowMetadata(true)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </button>
          <a
            href={output.url}
            download={`catalyst-${run.id}`}
            target="_blank"
            rel="noreferrer"
            className="card-action-btn"
            title="Download full resolution"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </a>
        </div>
      </div>

      {/* Slide-up detailed metadata inspect card */}
      <div className={`result-overlay-panel ${showMetadata ? 'active' : ''}`}>
        <div className="overlay-header">
          <span className="overlay-title">Run Spec Inspector</span>
          <button className="overlay-close" onClick={() => setShowMetadata(false)}>×</button>
        </div>

        <div className="overlay-body">
          <div className="overlay-prompt">"{run.prompt}"</div>
          
          <div className="overlay-metadata-grid">
            <div className="overlay-meta-item">
              <span className="overlay-meta-label">Run ID</span>
              <span className="overlay-meta-value font-mono">{run.id}</span>
            </div>
            <div className="overlay-meta-item">
              <span className="overlay-meta-label">Model</span>
              <span className="overlay-meta-value">{run.modelId}</span>
            </div>
            <div className="overlay-meta-item">
              <span className="overlay-meta-label">File Type</span>
              <span className="overlay-meta-value">{output.format}</span>
            </div>
            <div className="overlay-meta-item">
              <span className="overlay-meta-label">Resolution</span>
              <span className="overlay-meta-value">{output.width} × {output.height} px</span>
            </div>
            <div className="overlay-meta-item">
              <span className="overlay-meta-label">File Size</span>
              <span className="overlay-meta-value">{formatFileSize(output.fileSizeBytes)}</span>
            </div>
            <div className="overlay-meta-item">
              <span className="overlay-meta-label">Upscaler</span>
              <span className="overlay-meta-value">{run.upscaler === 'none' ? 'None' : run.upscaler}</span>
            </div>
          </div>

          {output.synthIdHash && (
            <div style={{ marginTop: '8px', padding: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-secondary)', borderRadius: '2px' }}>
              <span className="overlay-meta-label" style={{ color: 'var(--accent-blue)', display: 'block', marginBottom: '2px' }}>SynthID Digital Signature</span>
              <span className="overlay-meta-value" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', wordBreak: 'break-all', display: 'block' }}>
                {output.synthIdHash}
              </span>
            </div>
          )}

          <div style={{ marginTop: '4px' }}>
            <span className="overlay-meta-label" style={{ display: 'block', marginBottom: '2px' }}>Parameters Submitted</span>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.65rem',
                backgroundColor: 'var(--bg-secondary)',
                padding: '6px',
                borderRadius: '2px',
                maxHeight: '70px',
                overflowY: 'auto'
              }}
            >
              {JSON.stringify(run.inputs, null, 2)}
            </div>
          </div>
        </div>

        <div className="overlay-footer">
          <button
            type="button"
            className="btn-secondary"
            style={{ flex: 1, fontSize: '0.7rem', padding: '6px 0' }}
            onClick={() => {
              onRedo(run);
              setShowMetadata(false);
            }}
          >
            Re-use Prompt
          </button>
          <button
            type="button"
            className="btn-primary"
            style={{ flex: 1, fontSize: '0.7rem', padding: '6px 0' }}
            onClick={() => setShowMetadata(false)}
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
