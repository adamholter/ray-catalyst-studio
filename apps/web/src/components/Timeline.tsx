import React from 'react';
import { GenerationRun } from '../lib/api';
import { StatusPill } from './StatusPill';

interface TimelineProps {
  runs: GenerationRun[];
  activeRunId?: string;
  onSelectRun: (run: GenerationRun) => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  runs,
  activeRunId,
  onSelectRun,
}) => {
  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="timeline-pane">
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
          Run Timeline Log ({runs.length})
        </h4>
        {runs.some((r) => r.status === 'generating' || r.status === 'queued') && (
          <span style={{ fontSize: '0.7rem', color: 'var(--accent-ochre)', fontFamily: 'var(--font-mono)', animation: 'pulse 1.5s infinite' }}>
            ● Active Process
          </span>
        )}
      </div>

      <div className="timeline-list">
        {runs.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
            No generations executed
          </div>
        ) : (
          runs.map((run) => {
            const isActive = run.id === activeRunId || run.status === 'generating' || run.status === 'applying_watermark';
            return (
              <div
                key={run.id}
                className={`timeline-item ${isActive ? 'active' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={() => onSelectRun(run)}
              >
                <div className="timeline-item-header">
                  <span className="timeline-item-title">{run.id}</span>
                  <span className="timeline-item-time">{formatTime(run.createdAt)}</span>
                </div>
                <div className="timeline-item-desc">
                  {run.prompt}
                </div>
                
                {/* Active progress bar simulation */}
                {(run.status === 'generating' || run.status === 'applying_watermark') && (
                  <div
                    style={{
                      height: '2px',
                      width: '100%',
                      backgroundColor: 'var(--bg-tertiary)',
                      marginTop: '4px',
                      borderRadius: '1px',
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: run.status === 'generating' ? '60%' : '90%',
                        backgroundColor: 'var(--accent-ochre)',
                        borderRadius: '1px',
                        transition: 'width 2s ease-in-out',
                        animation: run.status === 'generating' ? 'progress-glow 1.5s infinite' : 'none'
                      }}
                    />
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                    {run.modelId} • {run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : 'active'}
                  </span>
                  <StatusPill status={run.status} />
                </div>
              </div>
            );
          })
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pulse {
          0% { opacity: 0.4; }
          50% { opacity: 1; }
          100% { opacity: 0.4; }
        }
        @keyframes progress-glow {
          0% { opacity: 0.8; }
          50% { opacity: 1; }
          100% { opacity: 0.8; }
        }
      `}} />
    </div>
  );
};
