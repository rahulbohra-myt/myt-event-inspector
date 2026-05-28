import React from 'react';

export default function PageSeparator({ pathname }) {
  return (
    <div className="page-separator">
      <span className="page-separator__line" />
      <span className="page-separator__label">{pathname}</span>
      <span className="page-separator__line" />
    </div>
  );
}
