import React from 'react';

interface InspectorRowProps {
  label: string;
  value: React.ReactNode;
  isCode?: boolean;
}

export const InspectorRow: React.FC<InspectorRowProps> = ({
  label,
  value,
  isCode = false,
}) => {
  return (
    <div className="inspector-row">
      <span className="inspector-key">{label}</span>
      <span className={isCode && typeof value === 'string' ? 'inspector-value-code' : 'inspector-value'}>
        {value}
      </span>
    </div>
  );
};
