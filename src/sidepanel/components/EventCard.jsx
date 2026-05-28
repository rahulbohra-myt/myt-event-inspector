import React, { useState } from 'react';
import MetadataPanel from './MetadataPanel.jsx';

const TYPE_CONFIG = {
  view:    { label: 'VIEW',    color: '#3b82f6' },
  click:   { label: 'CLICK',   color: '#ee731b' },
  capture: { label: 'CAPTURE', color: '#8b5cf6' },
  success: { label: 'SUCCESS', color: '#22c55e' },
  failure: { label: 'FAILURE', color: '#ef4444' },
  toggle:  { label: 'TOGGLE',  color: '#6b7280' },
  media:   { label: 'MEDIA',   color: '#14b8a6' },
  auth:    { label: 'AUTH',    color: '#f59e0b' },
  other:   { label: 'EVENT',   color: '#6b7280' },
};

function classifyEvent(eventName) {
  const lower = eventName.toLowerCase();
  if (lower === 'page view') return 'view';
  if (lower.endsWith('- view'))                return 'view';
  if (lower.endsWith('- click') ||
      lower.endsWith('- click/swipe'))          return 'click';
  if (lower.endsWith('- user input capture'))   return 'capture';
  if (lower.endsWith('- success'))              return 'success';
  if (lower.endsWith('- failure'))              return 'failure';
  if (lower.endsWith('- expand') ||
      lower.endsWith('- collapse'))             return 'toggle';
  if (lower.endsWith('- play') ||
      lower.endsWith('- stop'))                 return 'media';
  if (lower.endsWith('- verification'))         return 'auth';
  return 'other';
}

function relativeTime(epochMs) {
  const diff = Date.now() - epochMs;
  if (diff < 5000)    return 'just now';
  if (diff < 60000)   return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

function DeviceSection({ device }) {
  if (!device) return null;
  const rows = [
    ['pathname', device.pathname],
    ['href', device.href],
    ['browser', device.browser_version],
    ['os', device.operating_system],
    ['timezone', device.timezone],
  ];
  const hasQuery = device.query && Object.keys(device.query).length > 0;

  return (
    <div className="kv-panel">
      {rows.map(([key, val]) => val ? (
        <div key={key} className="kv-row">
          <span className="kv-row__key">{key}</span>
          <span className="kv-row__value">{val}</span>
        </div>
      ) : null)}
      {hasQuery && (
        <>
          <div className="kv-section-label">query params</div>
          {Object.entries(device.query).map(([k, v]) => (
            <div key={k} className="kv-row">
              <span className="kv-row__key kv-row__key--utm">{k}</span>
              <span className="kv-row__value">{v}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function SessionSection({ event }) {
  const rows = [
    ['session_id', event.unique_platform],
    ['student_uuid', event.student_uuid || '—'],
    ['user_type', event.source_user_type],
  ];
  if (event.offer_type) rows.push(['offer_type', event.offer_type]);
  if (event.funnel_url) rows.push(['funnel_url', event.funnel_url]);

  return (
    <div className="kv-panel">
      {rows.map(([key, val]) => (
        <div key={key} className="kv-row">
          <span className="kv-row__key">{key}</span>
          <span className="kv-row__value">{val}</span>
        </div>
      ))}
    </div>
  );
}

const SECTIONS = ['metadata', 'device', 'session'];

export default function EventCard({ event, now }) {
  const [open, setOpen] = useState({ metadata: true, device: false, session: false });
  const type = classifyEvent(event.event_name);
  const config = TYPE_CONFIG[type];
  const isDimmed = !event.metadata?.event_author;
  const isSuccess = event.status === 'SUCCESS';

  function toggle(section) {
    setOpen(prev => ({ ...prev, [section]: !prev[section] }));
  }

  return (
    <div
      className={`event-card${isDimmed ? ' event-card--dimmed' : ''}`}
      style={{ '--accent': config.color }}
    >
      <div className="event-card__header">
        <span className="event-card__badge" style={{ backgroundColor: config.color }}>
          {config.label}
        </span>
        <span className="event-card__name">{event.event_name}</span>
        <span className={`event-card__status event-card__status--${isSuccess ? 'success' : 'failure'}`}>
          ●
        </span>
      </div>

      <div className="event-card__meta">
        <span>{relativeTime(event.myt_request_time)}</span>
        <span className="event-card__meta-sep">·</span>
        <span className="event-card__pathname">{event.device?.pathname}</span>
      </div>

      <div className="event-section__tabs">
        {SECTIONS.map(section => (
          <button
            key={section}
            className={`event-section__tab${open[section] ? ' event-section__tab--active' : ''}`}
            style={open[section] ? { '--tab-color': config.color } : {}}
            onClick={() => toggle(section)}
          >
            {section.charAt(0).toUpperCase() + section.slice(1)}
          </button>
        ))}
      </div>

      {open.metadata && (
        <div className="event-section__body">
          <MetadataPanel metadata={event.metadata} />
        </div>
      )}
      {open.device && (
        <div className="event-section__body">
          <DeviceSection device={event.device} />
        </div>
      )}
      {open.session && (
        <div className="event-section__body">
          <SessionSection event={event} />
        </div>
      )}
    </div>
  );
}
