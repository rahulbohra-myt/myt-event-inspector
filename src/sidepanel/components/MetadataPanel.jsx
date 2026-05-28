import React from 'react';

const SKIP_KEYS = new Set(['event_author', 'banyan_user_interface']);

function shouldSkip(key) {
  if (SKIP_KEYS.has(key)) return true;
  if (key.endsWith('_version')) return true;
  return false;
}

function renderValue(value) {
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="metadata-row__value--empty">—</span>;
    return (
      <span>
        {value.map((item, i) => (
          <span key={i} className="metadata-tag">{String(item)}</span>
        ))}
      </span>
    );
  }
  if (value === 'None' || value === null || value === undefined || value === '') {
    return <span className="metadata-row__value--empty">—</span>;
  }
  return <span>{String(value)}</span>;
}

export default function MetadataPanel({ metadata }) {
  if (!metadata) return null;

  const entries = Object.entries(metadata).filter(([key]) => !shouldSkip(key));

  if (entries.length === 0) {
    return <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>No metadata</p>;
  }

  return (
    <div className="metadata-panel">
      {entries.map(([key, value]) => {
        const isUtm = key.startsWith('utm_');
        return (
          <div key={key} className="metadata-row">
            <span className={`metadata-row__key${isUtm ? ' metadata-row__key--utm' : ''}`}>
              {key}
            </span>
            <span className="metadata-row__value">
              {renderValue(value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
