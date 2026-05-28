# MYT Event Inspector — Project Documentation

A Chrome Extension built for the MyYogaTeacher internal team to inspect custom tracking events firing on myyogateacher.com in real time — similar to Meta Pixel Helper, but for MYT's own Timeline Event system.

---

## What It Does

When a user visits myyogateacher.com, the website silently sends tracking data (called Timeline Events) to MYT's analytics server every time something meaningful happens — a page view, a button click, a form submission, a login. This tool intercepts those events before they leave the browser and displays them in a readable side panel, without affecting the website in any way.

---

## Tech Stack

| Technology | Role | Why This Choice |
|---|---|---|
| **Chrome Extension Manifest V3** | The extension framework | Current Chrome standard. Defines permissions, scripts, and capabilities |
| **Vite** | Build tool | Fast bundler that compiles source files into production-ready extension files |
| **CRXJS Vite Plugin** | Extension bundler bridge | Connects Vite's build system to Chrome's extension format — handles manifest processing automatically |
| **React 18** | Side panel UI | Component-based UI makes the event feed easy to manage as state |
| **Plain CSS with CSS Variables** | Styling | Lightweight, no extra dependencies. CSS variables make theming consistent |
| **chrome.storage.session** | Event storage | Persists events across page navigations. Clears automatically when the browser closes |
| **JavaScript (no TypeScript)** | Language | Keeps the project approachable and build setup simple |

---

## Chrome Extension Concepts (Plain English)

Understanding these four concepts explains why the project is structured the way it is.

### 1. Manifest V3 (MV3)
The `manifest.json` file is the "ID card" of a Chrome Extension. It tells Chrome:
- What the extension is called and what permissions it needs
- Which scripts to run, where, and when
- What pages it's allowed to operate on

MV3 is the current version of Chrome's extension system, introduced to improve security and performance over the older MV2.

### 2. Content Scripts vs. Page Scripts
Chrome extensions run in an **isolated JavaScript world** — their code is completely separate from the website's code. This is a security feature.

- A **content script** runs in the extension's isolated world. It can read the DOM and use Chrome APIs (`chrome.runtime`, `chrome.storage`, etc.), but it cannot directly access the website's JavaScript variables or functions.
- A **page script** runs in the website's main world — it has full access to the page's JavaScript, including `window.fetch`.

This distinction is why the project needed two separate scripts to intercept fetch calls.

### 3. `world: "MAIN"` Content Script
Chrome MV3 allows a content script to be declared with `"world": "MAIN"` in the manifest. This causes Chrome to inject the script directly into the **page's JavaScript world** instead of the isolated extension world. It can then access and modify `window.fetch` — which is the key to intercepting tracking calls.

### 4. Service Worker (Background Script)
In MV3, the background script runs as a **Service Worker** — an ephemeral process that Chrome starts when needed and puts to sleep when idle. It has no persistent memory. This is why all event data is stored in `chrome.storage.session` rather than in a JavaScript variable — storage survives the service worker sleeping and waking up.

---

## Architecture — How the Pieces Connect

The core challenge: a content script cannot access `window.fetch` of the actual page. The solution uses two scripts running in two different worlds, communicating via message passing.

```
PAGE WORLD (myyogateacher.com)
─────────────────────────────────────────
  interceptor.js  [world: MAIN]
  ├─ Wraps window.fetch permanently via Object.defineProperty
  ├─ Detects POST requests to the MYT tracking endpoint
  └─ Calls window.postMessage() with the event payload
           │
           │  window.postMessage
           ▼
EXTENSION WORLD (Isolated)
─────────────────────────────────────────
  content/index.js  [world: ISOLATED]
  ├─ Listens for window message events
  ├─ Validates the message source
  └─ Calls chrome.runtime.sendMessage() to forward to background
           │
           │  chrome.runtime.sendMessage
           ▼
BACKGROUND
─────────────────────────────────────────
  background/service-worker.js
  ├─ Receives the event from the content script
  ├─ Appends it to chrome.storage.session (key: "myt_events")
  └─ Broadcasts it to all open extension views
           │
           │  chrome.runtime.sendMessage (broadcast)
           ▼
SIDE PANEL UI
─────────────────────────────────────────
  src/sidepanel/  (React App)
  ├─ Listens for broadcast messages
  ├─ Updates React state → re-renders event feed
  └─ On open: loads existing events from chrome.storage.session
```

---

## File Structure

```
myt-event-inspector/
├── manifest.json                    Chrome reads this to understand the extension
├── package.json                     npm dependencies and build scripts
├── vite.config.js                   Configures Vite + CRXJS to build the extension
├── scripts/
│   └── generate-icons.js           One-time script to create placeholder PNG icons
├── public/
│   └── icons/                      Extension icons (16px, 48px, 128px)
├── docs/
│   ├── event-schema.md             Full field reference for Timeline Event payloads
│   └── project-overview.md         This document
├── reference/
│   └── sample-events.json          Real captured event payloads used as reference
└── src/
    ├── injected/
    │   └── interceptor.js          Runs in page world. Wraps window.fetch to capture events
    ├── content/
    │   └── index.js                Runs in extension world. Bridges page messages to background
    ├── background/
    │   └── service-worker.js       Stores events in session storage, broadcasts to side panel
    └── sidepanel/
        ├── index.html              HTML entry point Chrome loads as the side panel
        ├── index.jsx               React root — mounts the app into the HTML
        ├── SidePanel.jsx           Root component. Owns all state, listens for new events
        ├── sidepanel.css           All styles, using CSS variables for the MYT design system
        └── components/
            ├── SessionHeader.jsx   Fixed top bar — session ID, login status, event count, clear
            ├── EventCard.jsx       One card per event — badge, name, metadata, device, session
            ├── MetadataPanel.jsx   Generic key-value renderer for the metadata object
            └── PageSeparator.jsx   Visual divider shown when the page pathname changes
```

### File Roles in Detail

**`manifest.json`**
Declares two content scripts: `interceptor.js` with `world: MAIN` (runs before any page JavaScript at `document_start`), and `content/index.js` in the default isolated world. Also declares permissions for `sidePanel` and `storage`, and limits the extension to `myyogateacher.com`.

**`interceptor.js`**
Uses `Object.defineProperty` to permanently install a custom `window.fetch` that cannot be overwritten by the website or its frameworks. Filters for POST requests to the specific tracking endpoint, parses the JSON body, and broadcasts via `window.postMessage` if the payload contains `msg_type: "UI_EVENTS"`.

**`content/index.js`**
A simple message bridge. Listens for `window.postMessage` events (validating `event.source === window` to block iframe spoofing), then forwards the payload to the background service worker via `chrome.runtime.sendMessage`.

**`service-worker.js`**
Handles two things: opens the side panel when the toolbar icon is clicked (`chrome.action.onClicked`), and receives forwarded events — appending them to `chrome.storage.session` and broadcasting to all extension views.

**`SidePanel.jsx`**
The stateful root of the React app. Loads stored events from `chrome.storage.session` on mount (so opening the panel mid-session shows past events). Listens for `NEW_TIMELINE_EVENT` messages from the background. Derives session state (unique_platform, student_uuid, login status) from events as they arrive. Runs a 10-second interval to refresh relative timestamps.

**`EventCard.jsx`**
Classifies each event into a type (VIEW, CLICK, CAPTURE, SUCCESS, etc.) by parsing the suffix of `event_name` after the last ` - ` separator. Assigns a colour-coded badge. Dims the card if `event_author` is absent from metadata (engineering default events vs manually defined events).

**`MetadataPanel.jsx`**
Handles three metadata value types: plain strings, arrays (rendered as inline tags), and the literal string `"None"` (rendered as `—`). Skips internal keys (`event_author`, `banyan_user_interface`, version keys). Highlights UTM keys in purple.

---

## Build & Install

```bash
# Install dependencies
npm install

# Generate placeholder icons (run once)
node scripts/generate-icons.js

# Build the extension
npm run build
# → output goes to dist/

# Development mode (side panel UI hot-reloads on save)
npm run dev
```

**Loading in Chrome:**
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `dist/` folder
4. Navigate to `myyogateacher.com` → click the extension icon

**After any code change:**
```bash
npm run build
# Then click ↺ on the extension card at chrome://extensions
# Then hard-reload the MYT tab (Ctrl + Shift + R)
```

> Side panel React UI hot-reloads automatically with `npm run dev`. Content scripts and the interceptor always require a manual extension reload.

---

## Key Design Decisions

**Why `Object.defineProperty` for `window.fetch`?**
Modern JavaScript frameworks (like Next.js) can re-assign `window.fetch` during client-side page navigation. A plain `window.fetch = ourWrapper` would get overwritten, causing events on subsequent pages to be missed. Using `Object.defineProperty` with a custom getter makes the wrapper permanent for the entire lifetime of the page.

**Why `world: "MAIN"` instead of script tag injection?**
The original approach created a `<script src="...">` tag in the DOM to inject the interceptor. This has two problems: (1) it's asynchronous — the browser fetches the file, creating a timing gap where early tracking calls can slip through; (2) sites with a Content Security Policy (CSP) may block inline or dynamically injected scripts. Declaring the script directly in the manifest with `world: "MAIN"` bypasses both issues — Chrome injects it synchronously before any page code runs.

**Why `chrome.storage.session`?**
Three storage options exist in Chrome extensions: `local` (persists forever), `sync` (syncs across devices), and `session` (clears when the browser closes). Session storage is the right fit for a real-time debugging tool — you want a fresh slate every time you open the browser, and you don't want event logs accumulating indefinitely.
