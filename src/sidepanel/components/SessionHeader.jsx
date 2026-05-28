import React, { useState } from 'react';

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button className="btn-copy" onClick={handleCopy} title={copied ? 'Copied!' : 'Copy'}>
      {copied ? (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M3 8l4 4 6-7" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <rect x="5" y="5" width="8" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M11 5V4a1 1 0 00-1-1H4a1 1 0 00-1 1v8a1 1 0 001 1h1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )}
    </button>
  );
}

export default function SessionHeader({ session, eventCount, onClear }) {
  const isLoggedIn = session.loginStatus === 'LoggedIn';
  const displayId = isLoggedIn ? session.studentUuid : session.uniquePlatform;

  return (
    <div className="session-header">
      <div className="session-header__top">
        <span className="session-header__title">Event Inspector</span>
        {session.environment && (
          <span className={`env-tag env-tag--${session.environment === 'PROD' ? 'prod' : 'staging'}`}>
            {session.environment}
          </span>
        )}
      </div>
      <div className="session-header__bottom">
        <div className="session-header__identity">
          <span className={`status-dot status-dot--${isLoggedIn ? 'green' : 'grey'}`} />
          <span>{isLoggedIn ? 'Logged In' : 'Anonymous'}</span>
          {displayId && (
            <span className="session-header__id-group">
              <span className="session-header__id-label">
                {isLoggedIn ? 'User' : 'Session'}
              </span>
              <span className="session-header__id" title={displayId}>
                {displayId.slice(0, 8)}…
              </span>
              <CopyButton value={displayId} />
            </span>
          )}
        </div>
        <div className="session-header__actions">
          <span className="session-header__count">{eventCount} events</span>
          <button className="btn-clear" onClick={onClear}>Clear</button>
        </div>
      </div>
    </div>
  );
}
