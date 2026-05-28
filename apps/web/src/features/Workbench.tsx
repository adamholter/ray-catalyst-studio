import React, { useState, useEffect } from 'react';
import { fetchCapabilities, Capabilities, TaskType } from '../lib/capabilities';
import { fetchRuns, createRun, GenerationRun } from '../lib/api';
import { SegmentedControl } from '../components/SegmentedControl';
import { ModelSelector } from '../components/ModelSelector';
import { DynamicField } from '../components/InputFields';
import { InspectorRow } from '../components/InspectorRow';
import { StatusPill } from '../components/StatusPill';
import { ResultCard } from '../components/ResultCard';
import { Timeline } from '../components/Timeline';
import { Button } from '../components/Button';

export const Workbench: React.FC = () => {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [activeTask, setActiveTask] = useState<TaskType>('mockup');
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [formInputs, setFormInputs] = useState<Record<string, any>>({});
  const [selectedUpscaler, setSelectedUpscaler] = useState<string>('none');
  const [prompt, setPrompt] = useState<string>('');
  const [attachment, setAttachment] = useState<File | null>(null);
  
  const [runs, setRuns] = useState<GenerationRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<GenerationRun | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load capabilities & history on mount
  useEffect(() => {
    async function loadData() {
      const caps = await fetchCapabilities();
      setCapabilities(caps);
      
      const initialRuns = await fetchRuns();
      setRuns(initialRuns);
      if (initialRuns.length > 0) {
        setSelectedRun(initialRuns[0]);
      }
    }
    loadData();
  }, []);

  // Filter models based on selected task
  const taskModels = capabilities
    ? capabilities.models.filter((m) => m.task === activeTask)
    : [];

  // Update selected model when task changes
  useEffect(() => {
    if (taskModels.length > 0) {
      const firstModel = taskModels[0];
      setSelectedModelId(firstModel.id);
    }
  }, [activeTask, capabilities]);

  // Update form input defaults when model changes
  const activeModel = taskModels.find((m) => m.id === selectedModelId);
  useEffect(() => {
    if (activeModel) {
      const defaults: Record<string, any> = {};
      activeModel.fields.forEach((field) => {
        defaults[field.name] = field.default;
      });
      setFormInputs(defaults);
      
      // Select default upscaler if model supports upscalers
      if (activeModel.supportedUpscalers.length > 0) {
        setSelectedUpscaler(activeModel.supportedUpscalers[0]);
      } else {
        setSelectedUpscaler('none');
      }
    }
  }, [selectedModelId]);

  // Handle prompt reuse from result overlay panel
  const handleReusePrompt = (oldRun: GenerationRun) => {
    setPrompt(oldRun.prompt);
    setActiveTask(oldRun.task);
    setSelectedModelId(oldRun.modelId);
    setFormInputs(oldRun.inputs);
    setSelectedUpscaler(oldRun.upscaler);
  };

  const handleInputChange = (fieldName: string, value: any) => {
    setFormInputs((prev) => ({ ...prev, [fieldName]: value }));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setAttachment(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || !selectedModelId) return;

    setIsSubmitting(true);
    
    try {
      // Execute the generation with simulated timeline streaming
      await createRun(
        activeTask,
        selectedModelId,
        prompt,
        selectedUpscaler,
        formInputs,
        (updatedRun) => {
          // Streaming progress callback
          setRuns((prev) => {
            const idx = prev.findIndex((r) => r.id === updatedRun.id);
            if (idx === -1) {
              return [updatedRun, ...prev];
            } else {
              const nextRuns = [...prev];
              nextRuns[idx] = updatedRun;
              return nextRuns;
            }
          });
          setSelectedRun(updatedRun);
        }
      );

      // Reset prompt field
      setPrompt('');
      setAttachment(null);
    } catch (err) {
      console.error('Run execution error', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!capabilities) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '16px' }}>
        <span className="spinner" style={{ width: '32px', height: '32px' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Aligning Catalyst Studio capabilities...
        </span>
      </div>
    );
  }

  // Selected upscaler metadata
  const upscalerDetail = capabilities.upscalers.find((u) => u.id === selectedUpscaler);

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-title-group">
          <h1 className="header-title">Catalyst Studio</h1>
          <span className="header-tagline">Workbench</span>
        </div>
        <div className="header-status">
          <div className="status-indicator" />
          <span>API Server: Operational</span>
          <span style={{ color: 'var(--border-medium)' }}>|</span>
          <span>Model Registry: 4 Active</span>
          <span style={{ color: 'var(--border-medium)' }}>|</span>
          <span>SynthID: Embedded</span>
        </div>
      </header>

      {/* Main Grid */}
      <div className="workbench-main">
        {/* Left Side: Request Composer */}
        <section className="composer-pane">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span className="form-label">Studio Task Workspace</span>
            <SegmentedControl
              options={capabilities.tasks}
              value={activeTask}
              onChange={(val) => setActiveTask(val as TaskType)}
            />
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Model Selector */}
            <ModelSelector
              models={taskModels}
              selectedValue={selectedModelId}
              onChange={setSelectedModelId}
            />

            {/* Main Prompt Textarea */}
            <div className="form-group">
              <label className="form-label">Generation Prompt</label>
              <textarea
                className="form-textarea"
                style={{ minHeight: '110px', fontSize: '0.95rem' }}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the desired creative output with deliberate style guidelines..."
                required
              />
            </div>

            {/* Dynamic fields mapped from selected model specs */}
            {activeModel && activeModel.fields.map((field) => (
              <DynamicField
                key={field.name}
                spec={field}
                value={formInputs[field.name]}
                onChange={(val) => handleInputChange(field.name, val)}
              />
            ))}

            {/* Reference Attachment upload */}
            <div className="form-group">
              <label className="form-label">Reference Attachment (Optional)</label>
              <div
                className="dropzone"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*';
                  input.onchange = (e: any) => {
                    if (e.target.files && e.target.files[0]) {
                      setAttachment(e.target.files[0]);
                    }
                  };
                  input.click();
                }}
              >
                {attachment ? (
                  <div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent-emerald)', fontWeight: 600 }}>
                      ✓ {attachment.name}
                    </span>
                    <p className="dropzone-mono">{(attachment.size / 1024).toFixed(1)} KB • Click to change</p>
                  </div>
                ) : (
                  <div>
                    <p className="dropzone-text">Drag & drop asset mockups or click to browse</p>
                    <p className="dropzone-mono">Supports references for structural lock-in</p>
                  </div>
                )}
              </div>
            </div>

            {/* Run Button */}
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
              disabled={!prompt.trim() || !selectedModelId}
              style={{ marginTop: '10px' }}
            >
              Execute Generation Run
            </Button>
          </form>
        </section>

        {/* Right Side: Capability Inspector */}
        <section className="inspector-pane">
          <div className="inspector-section">
            <h3 className="inspector-section-title">Model Capability Details</h3>
            {activeModel ? (
              <div className="inspector-table">
                <InspectorRow label="Model ID" value={activeModel.id} isCode />
                <InspectorRow label="SynthID Status" value={
                  <span className={`status-pill ${activeModel.synthIdStatus.includes('Active') ? 'watermarked' : 'failed'}`} style={{ fontSize: '0.65rem' }}>
                    {activeModel.synthIdStatus}
                  </span>
                } />
                <InspectorRow label="Native Output Shape" value={activeModel.outputShape} />
                <InspectorRow label="Postprocessing Pipeline" value={
                  activeModel.defaultPostprocessors.length > 0
                    ? activeModel.defaultPostprocessors.join(' → ')
                    : 'None (Direct Render)'
                } />
              </div>
            ) : (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                No active model capability loaded.
              </div>
            )}
          </div>

          {/* Upscaler Selector */}
          <div className="inspector-section" style={{ marginTop: '10px' }}>
            <h3 className="inspector-section-title">Post-Upscaler Settings</h3>
            {activeModel && activeModel.supportedUpscalers.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="form-group">
                  <select
                    className="form-select"
                    value={selectedUpscaler}
                    onChange={(e) => setSelectedUpscaler(e.target.value)}
                  >
                    <option value="none">None (Native size)</option>
                    {capabilities.upscalers
                      .filter((u) => activeModel.supportedUpscalers.includes(u.id))
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.multiplier})
                        </option>
                      ))}
                  </select>
                </div>
                {upscalerDetail && selectedUpscaler !== 'none' && (
                  <div style={{ padding: '10px', borderLeft: '2px solid var(--border-dark)', backgroundColor: 'var(--bg-tertiary)', fontSize: '0.75rem', lineHeight: '1.4' }}>
                    <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', display: 'block', marginBottom: '2px' }}>
                      {upscalerDetail.name} active
                    </strong>
                    <span style={{ color: 'var(--text-secondary)' }}>{upscalerDetail.description}</span>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', backgroundColor: 'var(--bg-tertiary)', padding: '10px', borderLeft: '2px solid var(--border-medium)' }}>
                Native vector/deck output active. Neural upscaling skipped.
              </div>
            )}
          </div>

          {/* Active/Inspected Run Details */}
          <div className="inspector-section" style={{ marginTop: '20px' }}>
            <h3 className="inspector-section-title">Inspected Run Summary</h3>
            {selectedRun ? (
              <div className="inspector-table" style={{ fontSize: '0.8rem' }}>
                <InspectorRow label="Run Identifier" value={selectedRun.id} isCode />
                <InspectorRow label="Status" value={<StatusPill status={selectedRun.status} />} />
                <InspectorRow label="Model ID" value={selectedRun.modelId} />
                <InspectorRow label="Active Upscaler" value={selectedRun.upscaler} />
                <InspectorRow label="Execution Speed" value={selectedRun.durationMs ? `${(selectedRun.durationMs / 1000).toFixed(2)} seconds` : 'Computing...'} />
                {selectedRun.outputs && selectedRun.outputs[0]?.synthIdHash && (
                  <InspectorRow label="SynthID Signature" value={
                    <span className="inspector-value-code" style={{ fontSize: '0.6rem', letterSpacing: '0' }}>
                      {selectedRun.outputs[0].synthIdHash.substring(0, 14)}...
                    </span>
                  } />
                )}
              </div>
            ) : (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                Select a timeline item or result card to inspect execution logs.
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Lower Section: Gallery & Timeline */}
      <section className="results-area">
        <div className="results-header">
          <h2 className="results-title">Studio Generations Canvas</h2>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Timeline History Log
          </span>
        </div>

        <div className="results-content">
          {/* Timeline pane */}
          <Timeline
            runs={runs}
            activeRunId={selectedRun?.id}
            onSelectRun={setSelectedRun}
          />

          {/* Masonry gallery pane */}
          <div className="gallery-pane">
            {runs.filter((r) => r.status === 'completed' && r.outputs.length > 0).length === 0 ? (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: '8px',
                  color: 'var(--text-tertiary)',
                  minHeight: '260px'
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                  Canvas empty. Trigger a generation run above.
                </span>
              </div>
            ) : (
              <div className="masonry-grid">
                {runs
                  .filter((r) => r.status === 'completed' && r.outputs.length > 0)
                  .map((run) => (
                    <ResultCard
                      key={run.id}
                      run={run}
                      onRedo={handleReusePrompt}
                    />
                  ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
export default Workbench;
