import React, { useState, useEffect, useRef } from 'react';
import SessionHeader from './components/SessionHeader.jsx';
import EventCard from './components/EventCard.jsx';
import PageSeparator from './components/PageSeparator.jsx';

const INITIAL_SESSION = {
  uniquePlatform: null,
  studentUuid: null,
  loginStatus: 'Anonymous',
  environment: null,
};

function detectEnvironment(hostname) {
  if (!hostname) return 'PROD';
  if (hostname.includes('testenv1')) return 'Testenv1';
  if (hostname.includes('testenv2')) return 'Testenv2';
  return 'PROD';
}

function updateSession(current, event) {
  const next = { ...current };

  // unique_platform is stable across the whole session — set once from first event
  if (!next.uniquePlatform && event.unique_platform) {
    next.uniquePlatform = event.unique_platform;
  }

  // Derive environment from the page hostname carried in the event
  next.environment = detectEnvironment(event.device?.hostname);

  // Always reflect the most recent event's login state so transitions
  // (anonymous → logged in, logged in → logged out) update live
  if (event.student_uuid) {
    next.studentUuid = event.student_uuid;
    next.loginStatus = 'LoggedIn';
  } else {
    next.studentUuid = null;
    next.loginStatus = 'Anonymous';
  }

  return next;
}

export default function SidePanel() {
  const [events, setEvents] = useState([]);
  const [session, setSession] = useState(INITIAL_SESSION);
  const [now, setNow] = useState(Date.now());
  const listRef = useRef(null);

  // Load events already stored when panel opens mid-session
  useEffect(() => {
    chrome.storage.session.get('myt_events', (result) => {
      const stored = result.myt_events || [];
      if (stored.length > 0) {
        setEvents(stored);
        setSession(stored.reduce(updateSession, INITIAL_SESSION));
      }
    });
  }, []);

  // Listen for new events broadcast from service worker
  useEffect(() => {
    const listener = (message) => {
      if (message.type !== 'NEW_TIMELINE_EVENT') return;
      setEvents(prev => [...prev, message.payload]);
      setSession(prev => updateSession(prev, message.payload));
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // Update relative timestamps every 10 seconds
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [events.length]);

  function handleClear() {
    chrome.storage.session.set({ myt_events: [] }, () => {
      setEvents([]);
      setSession(INITIAL_SESSION);
    });
  }

  return (
    <>
      <SessionHeader
        session={session}
        eventCount={events.length}
        onClear={handleClear}
      />
      <div className="event-list" ref={listRef}>
        {events.length === 0 ? (
          <div className="event-list--empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
              <path d="M5.636 5.636a9 9 0 1 0 12.728 0"/>
              <path d="M8.465 8.465a5 5 0 1 0 7.07 0"/>
              <line x1="12" y1="12" x2="12" y2="12.01"/>
            </svg>
            <p>Listening for events<br /><span style={{ fontSize: 11 }}>Navigate on myyogateacher.com to see events appear here</span></p>
          </div>
        ) : (
          events.map((event, i) => {
            const prevPathname = i > 0 ? events[i - 1].device?.pathname : null;
            const currPathname = event.device?.pathname;
            const showSeparator = currPathname && currPathname !== prevPathname;

            return (
              <React.Fragment key={i}>
                {showSeparator && <PageSeparator pathname={currPathname} />}
                <EventCard event={event} now={now} />
              </React.Fragment>
            );
          })
        )}
      </div>
    </>
  );
}
