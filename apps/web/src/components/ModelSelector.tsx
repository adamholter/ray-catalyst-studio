import React from 'react';
import { ModelSpec } from '../lib/capabilities';

interface ModelSelectorProps {
  models: ModelSpec[];
  selectedValue: string;
  onChange: (modelId: string) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  models,
  selectedValue,
  onChange,
}) => {
  const selectedModel = models.find((m) => m.id === selectedValue);

  return (
    <div className="form-group">
      <label className="form-label">Active Generation Model</label>
      <select
        className="form-select"
        value={selectedValue}
        onChange={(e) => onChange(e.target.value)}
      >
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name}
          </option>
        ))}
      </select>
      {selectedModel && (
        <span
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            marginTop: '4px',
            lineHeight: '1.4',
            display: 'block',
          }}
        >
          {selectedModel.description}
        </span>
      )}
    </div>
  );
};
