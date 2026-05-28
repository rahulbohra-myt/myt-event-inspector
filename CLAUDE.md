# MYT Event Inspector — Claude Code Context

## Project Identity

**Name:** MYT Event Inspector  
**Type:** Chrome Extension (Manifest V3)  
**Purpose:** Internal tool for the MyYogaTeacher team to inspect Timeline Events firing on myyogateacher.com in real time — similar to Meta Pixel Helper but for MYT's own custom event tracking system.  
**Users:** 2–5 internal MYT team members (marketing/growth/data)  
**Scope:** Read-only, client-side only, no backend, no auth required.

---

## Tech Stack

| Layer | Tool | Notes |
|---|---|---|
| Extension framework | Chrome Manifest V3 | Current standard, required |
| Build tool | Vite + `@crxjs/vite-plugin@beta` | Handles MV3 bundling, manifest processing, HMR |
| UI framework | React 18 | Side panel UI only |
| Package manager | npm | |
| Styling | Plain CSS with CSS variables | No Tailwind — keep it lightweight |
| Storage | `chrome.storage.session` | Clears on browser close, perfect for event log |
| Language | JavaScript (no TypeScript) | |

---

## File Structure

```
myt-event-inspector/
├── CLAUDE.md                        ← This file
├── manifest.json                    ← Processed by CRXJS at build time
├── package.json
├── vite.config.js
├── docs/
│   ├── event-schema.md              ← Full Timeline Event JSON schema reference
│   └── sample-events.json           ← 3 real event payloads captured from the site
├── public/
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
└── src/
    ├── sidepanel/
    │   ├── index.html               ← Side panel entry HTML
    │   ├── index.jsx                ← React root mount
    │   ├── SidePanel.jsx            ← Main panel component (root layout)
    │   ├── sidepanel.css            ← All styles using CSS variables
    │   └── components/
    │       ├── SessionHeader.jsx    ← Fixed top bar: session identity + event count
    │       ├── EventCard.jsx        ← Single event display with expand/collapse
    │       ├── PageSeparator.jsx    ← Visual divider shown when pathname changes
    │       └── MetadataPanel.jsx    ← Key-value renderer for metadata/device objects
    ├── content/
    │   └── index.js                 ← Content script: injects interceptor + bridges messages
    ├── injected/
    │   └── interceptor.js           ← Runs in PAGE context: wraps window.fetch
    └── background/
        └── service-worker.js        ← Opens side panel on icon click, stores + broadcasts events
```

---

## Architecture & Data Flow

### The Core Problem
Content scripts run in an **isolated JavaScript world** — they cannot access `window.fetch` of the actual page. If you try to intercept fetch from a content script, you're wrapping your own isolated copy, not the one the React app uses. The interception silently fails.

### The Solution: Two-Script Approach
```
PAGE CONTEXT                    EXTENSION CONTEXT
─────────────────               ──────────────────────────────────────
injected/interceptor.js         content/index.js
  wraps window.fetch               injects interceptor.js into DOM
  intercepts /track calls          listens for window.postMessage
  window.postMessage()    ──────►  chrome.runtime.sendMessage()
                                        │
                                        ▼
                                 background/service-worker.js
                                   stores in chrome.storage.session
                                   broadcasts to side panel
                                        │
                                        ▼
                                 src/sidepanel/SidePanel.jsx
                                   listens for chrome.runtime.onMessage
                                   updates React state → renders event
```

### Step-by-Step Flow
1. Content script runs at `document_start` on any `myyogateacher.com` page
2. Content script injects `interceptor.js` into the page DOM via `<script src="chrome.runtime.getURL(...)">` — this makes it run in the PAGE's JS context
3. Interceptor wraps `window.fetch` before the React app initialises
4. When the app fires `POST https://gapi.myyogateacher.com/v2/user_timeline/events/track`, the wrapper captures the request body JSON
5. Interceptor filters: only proceed if `body.msg_type === 'UI_EVENTS'`
6. Interceptor calls `window.postMessage({ type: 'MYT_TIMELINE_EVENT', payload: body }, '*')`
7. Content script receives this via `window.addEventListener('message', ...)`, validates source, forwards via `chrome.runtime.sendMessage`
8. Background service worker receives message, appends event to `chrome.storage.session`, then broadcasts via `chrome.runtime.sendMessage` to all extension listeners
9. Side panel's `useEffect` listener receives the broadcast, updates React state, re-renders

---

## Manifest V3 Configuration

```json
{
  "manifest_version": 3,
  "name": "MYT Event Inspector",
  "version": "1.0.0",
  "description": "Real-time Timeline Event inspector for myyogateacher.com",
  "permissions": ["sidePanel", "storage"],
  "host_permissions": ["*://myyogateacher.com/*"],
  "side_panel": {
    "default_path": "src/sidepanel/index.html"
  },
  "background": {
    "service_worker": "src/background/service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["*://myyogateacher.com/*"],
      "js": ["src/content/index.js"],
      "run_at": "document_start"
    }
  ],
  "action": {
    "default_title": "Open MYT Event Inspector",
    "default_icon": {
      "16": "public/icons/icon16.png",
      "48": "public/icons/icon48.png",
      "128": "public/icons/icon128.png"
    }
  },
  "web_accessible_resources": [
    {
      "resources": ["src/injected/interceptor.js"],
      "matches": ["*://myyogateacher.com/*"]
    }
  ]
}
```

**Why `run_at: document_start`:** The content script must inject the interceptor before the page's React app boots and starts making fetch calls. If the script runs after DOMContentLoaded, early page-view events will already have fired and be missed.

**Why `web_accessible_resources`:** The injected script needs to be served from the extension's origin. Without this entry, `chrome.runtime.getURL('src/injected/interceptor.js')` returns a URL that the page will refuse to load.

---

## Event Interception Details

### Target Endpoint
```
URL:    https://gapi.myyogateacher.com/v2/user_timeline/events/track
Method: POST
Body:   application/json
```

### Intercept Filter Logic
In `interceptor.js`, only forward events that pass ALL of these checks:
1. `url === 'https://gapi.myyogateacher.com/v2/user_timeline/events/track'`
2. `method === 'POST'` (case-insensitive check)
3. `body.msg_type === 'UI_EVENTS'`

Do NOT intercept other fetch calls on the page. Be surgical.

### Interceptor Pattern
```javascript
// IMPORTANT: Wrap in IIFE to avoid polluting page globals
(function () {
  const TARGET = 'https://gapi.myyogateacher.com/v2/user_timeline/events/track';
  const _fetch = window.fetch;

  window.fetch = async function (input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url;

    if (url === TARGET && (init.method || 'GET').toUpperCase() === 'POST') {
      try {
        const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
        if (body?.msg_type === 'UI_EVENTS') {
          window.postMessage({ type: 'MYT_TIMELINE_EVENT', payload: body }, '*');
        }
      } catch (_) {
        // Never break the original fetch call
      }
    }

    return _fetch.apply(this, arguments);
  };
})();
```

**Critical rule:** The interceptor must ALWAYS call and return the original fetch. Never block or delay it. Errors in interception logic must be caught silently.

---

## Event Schema

See `docs/event-schema.md` for the full field reference. Key fields used by the UI:

### Top-Level (always present)
| Field | Type | UI Usage |
|---|---|---|
| `event_name` | string | Primary headline of every event card |
| `msg_type` | string | Filter — only render if `"UI_EVENTS"` |
| `status` | string | `"SUCCESS"` or `"FAILURE"` — status dot on card |
| `myt_request_time` | epoch ms | Relative timestamp ("just now", "5s ago") |
| `student_uuid` | string | Empty `""` if not logged in — drives session header state |
| `unique_platform` | string | Anonymous session ID — always present |
| `source_user_type` | string | `"STUDENT"` or `"TEACHER"` |
| `source_user` | string | Empty `""` when anonymous. Equals `student_uuid` when logged in |

### Optional Root-Level Fields (present on some events, absent on others — NOT inside metadata)
| Field | Type | UI Usage |
|---|---|---|
| `offer_type` | string | Acquisition offer e.g., `"2_1on1_fitness_1wk"` — show in Session section of EventCard |
| `funnel_url` | string | Funnel slug e.g., `"1on1-focus—holistic-fitness"` — show in Session section of EventCard |

### `metadata` Object (variable per event)
Dynamic key-value pairs defined per event by the Data team. Must be rendered as a generic key-value list — do NOT hardcode specific metadata keys. The only guaranteed keys are `event_author` (present on manually defined events) and `banyan_user_interface`. All other keys are event-specific.

`event_author` presence = manually defined event by Data team (higher visual priority).
No `event_author` = engineering default/backup event (lower visual priority, slightly dimmed).

### `device` Object
| Field | UI Usage |
|---|---|
| `pathname` | Shown on card; also drives page separator logic |
| `href` | Full URL — shown in device expand section |
| `query` | UTM params and LP data — shown in device expand section |
| `browser_version` | Device expand section |
| `operating_system` | Device expand section |
| `timezone` | Device expand section |

### `device.query` Object
Present only when URL has query string. Contains UTM params (`utm_source`, `utm_medium`, `utm_campaign`, etc.) and LP params (`lp_url`, `lpversion`, `selected_goal`). Render as key-value pairs.

**Note on UTMs:** UTMs appear in TWO places — `device.query` (from the URL, auto-captured) and in `metadata` (manually added by Data team, shown as `"None"` string when absent). Surface both.

---

## Event Classification System

Classify events by parsing the suffix of `event_name` after the last ` - ` separator. This system covers all 57 known events and is designed to handle unknown future events gracefully.

**Important edge case:** The engineering default event has two known variants — `"Page - view"` (with dash) and `"Page View"` (no dash, no suffix). Both are default events, both get the `view` type. The classifier must handle the no-dash variant explicitly.

```javascript
function classifyEvent(eventName) {
  const lower = eventName.toLowerCase();

  // Handle no-dash variants from engineering default events
  if (lower === 'page view') return 'view';

  // Standard suffix matching
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
```

### Type → Badge Colour Mapping
| Type | Label | Colour |
|---|---|---|
| `view` | VIEW | `#3b82f6` (blue) |
| `click` | CLICK | `#ee731b` (MYT orange) |
| `capture` | CAPTURE | `#8b5cf6` (purple) |
| `success` | SUCCESS | `#22c55e` (green) |
| `failure` | FAILURE | `#ef4444` (red) |
| `toggle` | TOGGLE | `#6b7280` (grey) |
| `media` | MEDIA | `#14b8a6` (teal) |
| `auth` | AUTH | `#f59e0b` (yellow) |
| `other` | EVENT | `#6b7280` (grey) |

---

## UI Specification

### Side Panel Layout
```
┌─────────────────────────────────┐
│  SESSION HEADER (fixed)         │  ← Always visible, never scrolls
│  MYT Event Inspector            │
│  ID: 40a7e919  ● Anonymous  [×] │
│  12 events           [Clear]    │
├─────────────────────────────────┤
│  EVENT LIST (scrollable)        │
│                                 │
│  ── / ──────────────────────    │  ← PageSeparator (pathname change)
│                                 │
│  [VIEW] Home Page - view    ●   │  ← EventCard
│  just now · /                   │
│  ▼ Metadata  ▶ Device           │
│    login_status: Not Logged In  │
│    utm_source: None             │
│                                 │
│  [CLICK] Signup CTA - click ●   │
│  3s ago · /                     │
│  ▼ Metadata  ▶ Device           │
│    location: Bottom Left Hero   │
│    page_or_popup: Home Page     │
│                                 │
│  ── /goals ─────────────────    │  ← PageSeparator (new page)
│                                 │
│  [VIEW] Yoga Goals Page - view  │
│  ...                            │
└─────────────────────────────────┘
```

### SessionHeader Component
- Extension title: "Event Inspector" in MYT orange (`#ee731b`)
- `unique_platform`: display first 8 chars + `...` (e.g., `40a7e919...`)
- Login state:
  - `student_uuid === ''` → grey dot + "Anonymous"
  - `student_uuid` has value → green dot + "Logged In" + show truncated UUID
- Event count: "N events" — updates live
- Clear button: clears `chrome.storage.session` events array and resets React state

### EventCard Component
- **Header row:** `[TYPE BADGE]` + `event_name` (bold) + status dot (● green SUCCESS, ● red FAILURE)
- **Sub-row:** relative timestamp + ` · ` + `device.pathname`
- **Dimming rule:** if no `metadata.event_author`, reduce card opacity to 0.65 (engineering default event)
- **Expand/collapse sections:**
  - **Metadata** — default EXPANDED. Renders all `metadata` key-value pairs. Skip rendering `event_author`, `banyan_user_interface`, and any key ending in `_version` (these are noise). Highlight keys containing `utm_` in a distinct colour. **Value rendering rules:**
    - String `"None"` → display as `—` (dash)
    - Array with items → display as comma-separated inline tags
    - Empty array `[]` → display as `—` (dash)
    - String `"Yes"` / `"No"` → display as-is (do not convert to boolean)
  - **Device** — default COLLAPSED. Shows `pathname`, `href`, `query` (if non-empty object), `browser_version`, `operating_system`, `timezone`.
  - **Session** — default COLLAPSED. Shows `unique_platform`, `student_uuid` (or `—` if empty), `source_user_type`. If root-level `offer_type` or `funnel_url` are present on the event, show them here too — they are acquisition context fields that live at the root level (not inside metadata).

### PageSeparator Component
- Rendered whenever `device.pathname` differs from the previous event's `device.pathname`
- Style: horizontal rule with pathname label centred — `── /goals ──────`
- Colour: `#757575` (muted), small font

### Relative Timestamp Logic
```javascript
function relativeTime(epochMs) {
  const diff = Date.now() - epochMs;
  if (diff < 5000)   return 'just now';
  if (diff < 60000)  return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}
```
Update timestamps every 10 seconds via `setInterval` in `SidePanel.jsx`.

---

## State Management

All state lives in `SidePanel.jsx`. No external state library needed.

```javascript
// SidePanel.jsx state shape
const [events, setEvents] = useState([]);        // Array of raw event payloads
const [session, setSession] = useState({
  uniquePlatform: null,                          // First seen unique_platform value
  studentUuid: null,                             // First non-empty student_uuid seen
  loginStatus: 'Anonymous'
});
```

On mount, load existing events from `chrome.storage.session` (user may have opened panel mid-session). Then listen for `NEW_TIMELINE_EVENT` messages from background.

When a new event arrives:
1. Append to `events` array
2. Update `session.uniquePlatform` if not yet set
3. If `event.student_uuid` is non-empty and `session.studentUuid` is null, update session to "Logged In"

---

## MYT Design System

```css
:root {
  --color-brand:        #ee731b;
  --color-brand-light:  #ffecdf;
  --color-bg:           #ffffff;
  --color-bg-secondary: #f4f4f4;
  --color-text:         #000000;
  --color-text-muted:   #757575;
  --color-text-alt:     #333333;
  --color-border:       #e5e7eb;

  --font-heading: 'Mona Sans', sans-serif;
  --font-body:    'Inter', sans-serif;

  --radius-sm: 6px;
  --radius-md: 10px;

  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 12px;
  --spacing-lg: 16px;
  --spacing-xl: 24px;
}
```

**Side panel width:** Chrome's default side panel is 400px. Design for 360–400px width. Do not use fixed pixel widths inside — use `width: 100%`.

---

## Build Setup

### package.json dependencies
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta.23",
    "@vitejs/plugin-react": "^4.2.0",
    "vite": "^5.0.0"
  }
}
```

### vite.config.js
```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest })
  ]
});
```

### Loading the extension in Chrome
1. Run `npm run build` — output goes to `dist/`
2. Open `chrome://extensions`
3. Enable "Developer mode" (top right toggle)
4. Click "Load unpacked" → select the `dist/` folder
5. Navigate to `myyogateacher.com`
6. Click the extension icon in toolbar → side panel opens

### Development with HMR
Run `npm run dev` — CRXJS enables hot module replacement for the side panel React UI. Content script and interceptor changes still require a manual reload at `chrome://extensions`.

---

## Known Gotchas & Rules

1. **Never modify `init.body`** in the interceptor — only READ it. Mutating the request will break the app's tracking.

2. **The interceptor must be an IIFE** — it runs in the page's global scope. Any variable leakage will pollute `window` for the React app.

3. **`window.postMessage` security:** In the content script message listener, always verify `event.source === window` before processing. This prevents spoofing from iframes.

4. **Background service worker lifespan:** MV3 service workers are ephemeral — they sleep after inactivity. Do not rely on in-memory variables in the service worker. Always read from `chrome.storage.session`.

5. **Side panel vs popup:** This uses `chrome.sidePanel` API, NOT `chrome.action` popup. The `action.onClicked` listener in the background opens the side panel programmatically via `chrome.sidePanel.open({ tabId })`.

6. **Storage key:** Always use the key `"myt_events"` in `chrome.storage.session` for the events array. Consistent key prevents bugs across service worker sleep/wake cycles.

7. **No console.log in production files** — this is a team tool but keep it clean.

8. **Event ordering:** Events are always appended in arrival order. Do not sort. `myt_request_time` is the event's own timestamp; use it for display only, not for ordering (network latency can cause slight out-of-order arrival).

9. **Metadata key formatting:** Keys from the API use `snake_case`. Display them as-is in the UI — do not convert to title case. The Data team recognises the raw key names.

10. **Multiple events per page load:** It is normal for 2 events to arrive with identical `myt_request_time` (e.g., "Page - view" + "Home Page - view"). These are intentional — engineering default + manually defined. Render both; use the `event_author` presence to visually distinguish them.

11. **Two default event name variants:** The engineering default page view event has two known forms: `"Page - view"` and `"Page View"` (no dash). Both must classify as `view` type and both render with 0.65 opacity (no `event_author`). The classifier handles this explicitly — see Event Classification System section.

12. **`offer_type` and `funnel_url` are root-level, not in metadata:** These acquisition fields appear at the top level of the event JSON alongside `event_name`, `student_uuid`, etc. They are NOT nested inside `metadata`. When building the EventCard, extract them from the root event object, not from `event.metadata`.

13. **Metadata arrays must render gracefully:** Some metadata values are arrays (`student_yoga_goals: ["Stress Relief", "Boost Energy Levels"]`) or empty arrays (`recommended_group_classes: []`). The MetadataPanel component must handle all three value types: string, populated array (render as tags), empty array (render as `—`). Never render a raw `[]` string to the user.

14. **`"None"` string ≠ null:** The Data team uses the literal string `"None"` to represent absent values in metadata (e.g., `"utm_source": "None"`). Render these as `—` in the UI for visual cleanliness.

15. **`banyan_user_interface` casing is inconsistent:** Some events send `"web"` (lowercase), others send `"Web"` (title case). Normalise to title case when displaying, or simply exclude this key from the metadata display (it is in the skip list alongside `event_author` and `*_version` keys).
