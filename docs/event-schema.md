# Timeline Event Schema Reference

Full JSON schema for events fired to `https://gapi.myyogateacher.com/v2/user_timeline/events/track`.

Source: MYT Data Science team documentation + live network captures.

---

## Root Object

```
{
  event_name       string    — Name of the event (e.g., "Home Page - view")
  msg_type         string    — Always "UI_EVENTS" for Timeline Events
  service          string    — Always "desktop_web_ui" on web
  message          string    — Mirrors event_name
  metadata         object    — Per-event custom properties (see below)
  student_uuid     string    — Logged-in user ID. Empty string "" if not logged in
  unique_platform  string    — Cookie-based anonymous session ID (UUID format). Always present
  source_user_type string    — "STUDENT" or "TEACHER"
  source_user      string    — Empty string "" when anonymous. Mirrors student_uuid exactly when logged in
  status           string    — "SUCCESS" or "FAILURE"
  myt_request_time number    — Epoch milliseconds in the user's local timezone
  user_details     object    — Platform and device summary (see below)
  device           object    — Full browser and system context (see below)

  // Optional root-level fields — present on some events, absent on others. NOT inside metadata.
  offer_type       string?   — Acquisition offer identifier e.g., "2_1on1_fitness_1wk"
  funnel_url       string?   — Funnel slug e.g., "1on1-focus—holistic-fitness"
}
```

---

## `metadata` Object

**Variable per event.** Defined manually by the Data Science team on a per-event basis. No fixed schema — keys differ for every event type.

**Guaranteed keys (present on manually-defined events):**
```
event_author              string  — Name of the person who defined this event (e.g., "Savi Sethi", "Will Allen", "Taha E")
banyan_user_interface     string  — "web", "Web", "App", "Mobile-Web-App", "Mobile-Web", "Email"
                                    NOTE: casing is inconsistent — "web" and "Web" both appear. Normalise for display.
<EventName> Version       string  — Version string e.g., "Current Implementation as of Jan 2026"
login_status              string  — "Not Logged In" or "Logged In"
```

**Engineering default events** (e.g., "Page - view", "Page View") have minimal metadata — only `banyan_user_interface` and sometimes `login_status`. They have NO `event_author`.

**Metadata value types — IMPORTANT:**
Metadata values are not always strings. Three value types appear in practice:

1. **String** — most common: `"Organic"`, `"Yes"`, `"No"`, `"None"`, `"Student Dashboard"`
2. **Array** — lists of items: `["Stress Relief", "Boost Energy Levels"]` or empty `[]`
3. **"None" string** — the literal string `"None"` (not null, not undefined) used when a value is absent

**Boolean-as-string pattern:** Yes/No flags are strings, not booleans: `"is_first_session": "Yes"`, `"is_trial_session": "No"`. Do not treat these as JS booleans.

**MetadataPanel must handle all three value types gracefully:**
- Strings → render as plain text
- Arrays with items → render as comma-separated tags or a small inline list
- Empty arrays `[]` → render as `—` (dash), do not show `[]`
- `"None"` string → render as `—` (dash) for cleaner display

**UTM fields in metadata** (present on page-view events when Data team adds them):
```
utm_source      string  — "None" (literal string) if not set
utm_medium      string  — "None" if not set
utm_campaign    string  — "None" if not set
utm_content     string  — "None" if not set
utm_term        string  — "None" if not set
utm_id          string  — "None" if not set
```

**Note:** "None" (string) ≠ null. The Data team explicitly sets these to the string "None" when no UTM is present.

**Example event-specific metadata keys:**
```
# Home Page - view
query_string_for_home_page   string
home_page_version            string

# Signup CTA - click
location_for_signup_cta      string  — e.g., "Bottom Left on the Hero Image"
page_or_popup_for_signup_cta string  — e.g., "Home Page"
signup_cta_version           string
funnel_url_pathname_for_landing_page  string

# Yoga Goals Page - view
yoga_goals_page_version      string
yoga_goal_page_trigger       string

# Yoga Goals - user input capture
yoga_goals_capture_state     string  — "Success" or "Failure"
yoga_goals_selected          list

# Time Slots - view
teacher_name                 string
selected_session_duration    number
booking_flow_type            string
page_or_popup_for_time_slots string

# Login - success / Login - failure
login_mode                   string
```

---

## `device` Object

Captures browser and page context. Always present.

```
{
  hostname          string   — "myyogateacher.com"
  pathname          string   — Current page path e.g., "/", "/goals", "/articles/yoga-benefits"
  href              string   — Full URL including query string
  referrer          string   — Previous page URL
  user_agent        string   — Full user agent string
  platform          string   — "Win32", "MacIntel", etc.
  query             object   — Parsed query string params (see device.query below)
  screen_resolution string   — "1920x1080"
  browser_language  string   — "en-US"
  cookies_enabled   boolean
  do_not_track      string   — "unknown", "yes", "no"
  online_status     string   — "online"
  has_geolocation   boolean
  device_type       string   — "Desktop" or "Mobile"
  is_mobile_device  boolean
  timezone          string   — IANA timezone e.g., "Asia/Calcutta"
  browser_version   string   — "chrome 148.0.0.0"
  operating_system  string   — "windows", "macos", "ios", "android"
}
```

### `device.query` Object

Present and populated only when the page URL contains a query string. Empty object `{}` otherwise.

```
{
  utm_source    string  — Traffic source
  utm_medium    string  — Traffic medium
  utm_campaign  string  — Campaign name
  utm_content   string  — Ad content variant
  utm_term      string  — Paid search term
  utm_id        string  — Campaign ID
  lp_url        string  — Landing page URL
  lpversion     string  — Landing page version identifier
  selected_goal string  — Pre-selected goal from LP
  # ... any other query params present in the URL
}
```

---

## `user_details` Object

```
{
  app_platform  string  — "web_app" or "mobile_app"
  device_type   string  — "Desktop" or "Mobile"
}
```

---

## `genmeta` Object (in ClickHouse only)

This object appears in the ClickHouse `prod.app_events` table but is NOT present in the network request payload intercepted by the extension. It is added server-side.

```
{
  domain          string
  ip_details      object  — { asn, cn_iso, cn_nm, cn_st, ct_nm, geo, ip, latitude, longitude, tz }
  origin          string
  timestamp       number
  unique_platform string
}
```

---

## `genuser` Object (in ClickHouse only)

Also server-side only, not in the network payload.

```
{
  srole        string  — "teacher" or "student"
  user_uuid    string
  student_uuid string
}
```

---

## User Identification Logic

Two identifiers exist:

| Identifier | Anonymous state | Logged-in state |
|---|---|---|
| `unique_platform` | UUID string — always present | Same UUID — persists across login |
| `student_uuid` | Empty string `""` | UUID string — populated after login/signup |
| `source_user` | Empty string `""` | Mirrors `student_uuid` exactly |

**Login detection:** A user is logged in when `student_uuid !== ""`. At that point `source_user` will equal `student_uuid`.

**Session transition:** The same `unique_platform` UUID appears in both anonymous and logged-in events — this is how ClickHouse backfills the identity. The extension will see events from the same `unique_platform` transition from `student_uuid: ""` to `student_uuid: "uuid-value"` mid-session (e.g., after the login page). When this happens, update the session header to "Logged In" and display the truncated `student_uuid`.

The extension should track the transition moment: when `student_uuid` first becomes non-empty in an event stream, the session header should update from "Anonymous" to "Logged In".

---

## Known Event Name Patterns

All 57 known events follow the `[Subject] - [action]` pattern:

```
# Page Views (- view)
Page - view                                     ← Engineering default, fires on every page
Home Page - view
Yoga Goals Page - view
Free 1on1 Video Page - view
Signup Page - view
Login Page - view
Select Login Profile Page - view
Password Reset Page - view
Password Reset Confirmation Page - view
Phone Number Capture Screen - view
Phone Number Verification Code Screen - view
Age & Gender Page - view
Health History Page - view
How Did You Hear About Us Page - view
Onboarding Session Recommendation Page - view
Pricing Page - view
Upcoming Sessions Page - view
Past Sessions Page - view
Session Recap Page - view
Time Slots - view
Unique Needs Popup - view

# Click Interactions (- click / - click/swipe)
Signup CTA - click
Login CTA - click
Navigation Menu Item - click
Footer Item - click
Group Class List CTA - click
Onboarding Session Recommendation Show More CTA - click
Onboarding Session Recommendation CTA - click
Skip Step CTA - click
Verification Code Resend CTA - click
Change Phone Number CTA - click
Membership Plan Select CTA - click
Prepay Option - click
Pricing Option Switch CTA - click
Get Membership CTA - click
Join Class Button - click
Chat Button - click
Cancel Booking - click
Cancel Booking Confirmation Yes - click
Show More Upcoming Classes CTA - click
List Scroll Left - click/swipe
List Scroll Right - click/swipe
FAQ Dropdown - expand
FAQ Dropdown - collapse

# Form Submissions (- user input capture)
Yoga Goals - user input capture
Signup Page - user input capture
Phone Number - user input capture
Age & Gender - user input capture
Health History - user input capture
How Did You Hear About Us - user input capture
Login Mode - user input capture
Time Slots - user input capture

# Outcomes
Onboarding Finished - success
Login - success
Login - failure
Phone Number - user verification

# Media
Video - play
Video - stop

# Password
Password Visibility Toggle
```
