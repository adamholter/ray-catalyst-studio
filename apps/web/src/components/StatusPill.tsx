import React from 'react';

type StatusType = 'queued' | 'generating' | 'applying_watermark' | 'completed' | 'failed' | 'watermarked' | 'success';

interface StatusPillProps {
  status: StatusType;
}

export const StatusPill: React.FC<StatusPillProps> = ({ status }) => {
  const getLabelAndClass = () => {
    switch (status) {
      case 'queued':
        return { label: 'queued', className: 'queued' };
      case 'generating':
        return { label: 'generating', className: 'generating' };
      case 'applying_watermark':
        return { label: 'SynthID watermarking', className: 'watermarked' };
      case 'watermarked':
        return { label: 'SynthID active', className: 'watermarked' };
      case 'completed':
      case 'success':
        return { label: 'completed', className: 'success' };
      case 'failed':
        return { label: 'failed', className: 'failed' };
      default:
        return { label: status, className: 'queued' };
    }
  };

  const config = getLabelAndClass();

  return (
    <span className={`status-pill ${config.className}`}>
      {status === 'generating' && (
        <span
          className="spinner"
          style={{ width: '8px', height: '8px', borderWidth: '1px', marginRight: '4px' }}
        />
      )}
      {config.label}
    </span>
  );
};
