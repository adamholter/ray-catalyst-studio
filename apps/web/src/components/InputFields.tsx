import React from 'react';
import { FieldSpec } from '../lib/capabilities';

interface DynamicFieldProps {
  spec: FieldSpec;
  value: any;
  onChange: (val: any) => void;
}

export const DynamicField: React.FC<DynamicFieldProps> = ({
  spec,
  value,
  onChange,
}) => {
  const renderInput = () => {
    switch (spec.type) {
      case 'text':
        return (
          <textarea
            className="form-textarea"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`Enter ${spec.label.toLowerCase()}...`}
          />
        );
      case 'select':
        return (
          <select
            className="form-select"
            value={value || spec.default}
            onChange={(e) => onChange(e.target.value)}
          >
            {spec.options?.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        );
      case 'range':
        const minVal = spec.min !== undefined ? spec.min : 0;
        const maxVal = spec.max !== undefined ? spec.max : 100;
        const stepVal = spec.step !== undefined ? spec.step : 1;
        return (
          <div className="range-container">
            <input
              type="range"
              className="range-slider"
              min={minVal}
              max={maxVal}
              step={stepVal}
              value={value !== undefined ? value : spec.default}
              onChange={(e) => onChange(parseFloat(e.target.value))}
            />
            <span className="range-value">
              {value !== undefined ? value : spec.default}
            </span>
          </div>
        );
      case 'number':
        return (
          <input
            type="number"
            className="form-input-text"
            min={spec.min}
            max={spec.max}
            step={spec.step}
            value={value !== undefined ? value : spec.default}
            onChange={(e) => onChange(parseFloat(e.target.value))}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="form-group">
      <label className="form-label">{spec.label}</label>
      {renderInput()}
    </div>
  );
};
