# 🚨 ShadowAlert — Safe Route Navigation

ShadowAlert is a web app that recommends the **safest route** between two places instead of just the shortest one. It combines crime data, community-reported unsafe spots, and time of day to score each route, and adds personal-safety tools such as one-tap **SOS** and **live location sharing**.

---

## ✨ Features

- **Safety-scored routes** – up to 3 alternative routes (OSRM) are scored 0–100 and colour-coded (green / orange / red). The safest route is highlighted automatically.
- **Travel modes** – car, bike, or walking.
- **Time-aware analysis** – Day, Evening, Night, or "Now" (auto-detected). Crime relevance changes with the time slot.
- **Crime heatmap** – toggleable heatmap built from processed crime data plus user feedback.
- **Community feedback** – after a journey, users rate the route (Safe / Moderate / Risky) and pin unsafe spots on the map. Feedback is stored in Supabase and updates routes in real time.
- **Real-time alerts** – warns you when an unsafe area is near your route or you are close to a high-crime spot.
- **SOS button** – sends your Google Maps location to all saved emergency contacts via WhatsApp.
- **Live location sharing** – share a link so someone can watch your live position on a map (updates every 3 seconds).
- **Authentication** – sign-up / login via Supabase Auth.
- **Light / Dark / System theme.**

---

## 🛠️ Tech Stack

| Area | Technology |
|------|-----------|
| Frontend | HTML, CSS, vanilla JavaScript |
| Maps | [Leaflet](https://leafletjs.com/), Leaflet.heat, Leaflet Routing Machine |
| Routing | [OSRM](https://project-osrm.org/) public API |
| Map tiles | OpenStreetMap |
| Backend / DB / Auth / Realtime | [Supabase](https://supabase.com/) |
| Hosting | Netlify (uses `_redirects`) |

---

## 📁 Project Structure

```
├── auth.html          # Landing / login / sign-up page (entry point)
├── planner.html       # Main app: route planner, map, settings, feedback modal
├── index.html         # Simple standalone map version
├── track.html         # Public page to view someone's live location
├── script.js          # Map, routing, safety scoring, heatmap, feedback, alerts
├── liveLocation.js    # Live location sharing (writes to Supabase)
├── sos.js             # SOS: fetch contacts + send WhatsApp message
├── style.css          # Shared styles
├── _redirects         # Netlify redirect: "/" -> /auth.html
└── data/
    └── crime_data_processed.json   # Crime dataset (required – see below)
```

> ⚠️ `script.js` loads `data/crime_data_processed.json`. Make sure this file is in your repository, otherwise the heatmap and crime-based scoring will not work.

---

## 🗂️ Crime Data Format

`data/crime_data_processed.json` is an array of incidents (currently 40 records around Pune, India). Each record looks like this:

```json
{
  "lat": 18.5159,
  "lng": 73.8387,
  "crime_type": "Robbery",
  "severity_weight": 3,
  "crime_time": "23:20",
  "time_slot": "night",
  "time_weight": 1.6
}
```

| Field | Meaning |
|-------|---------|
| `lat`, `lng` | Incident location |
| `crime_type` | Harassment, Theft, Snatching, Robbery, Assault |
| `severity_weight` | 1 (low) to 3 (severe) |
| `crime_time` | Time of incident (HH:MM) |
| `time_slot` | `day` (06–18), `evening` (18–22), or `night` (22–06) |
| `time_weight` | Multiplier by slot: day 1.0, evening 1.3, night 1.6 |

You can replace this file with your own city's data using the same format.

---

## 🧠 How the Safety Score Works

1. For each route, the app finds crime incidents within **100 m** and user-reported spots within **120 m** of the route.
2. Each incident adds "danger" based on severity, time slot match, distance from route, and a crowd factor (daytime/evening reduces non-violent crime impact).
3. Final score:

```
safetyScore = 100 / (1 + danger / routeLengthInKm)
```

Higher is safer. Routes ≥ 70 are green, 40–70 orange, < 40 red.

---

## 🚀 Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>
```

### 2. Set up Supabase

Create a free project at [supabase.com](https://supabase.com) and create these tables:

| Table | Columns |
|-------|---------|
| `user_feedback` | `id` (int8, PK), `experience` (text), `time_slot` (text), `lat` (float8), `lng` (float8), `created_at` |
| `live_locations` | `user_id` (uuid, **unique**), `latitude` (float8), `longitude` (float8), `updated_at` (timestamptz) |
| `emergency_contacts` | `id`, `user_id` (uuid), `phone_number` (text) – and any name fields you use |

Then:
- Enable **Realtime** for the `user_feedback` table.
- Enable **Row Level Security (RLS)** on all tables and add policies (e.g. users can only read/write their own `emergency_contacts`; `live_locations` readable by anyone with the link, writable only by the owner).

### 3. Add your Supabase keys

Replace the project URL and publishable (anon) key in:

- `planner.html` (where `window.sb = window.supabase.createClient(...)` is defined)
- `auth.html` (if it creates its own client)
- `track.html` (`sbClient`)

> Only use the **publishable / anon** key in frontend code. **Never** put the `service_role` key in this repo. Safety of your data depends on proper RLS policies.

### 4. Run locally

Geolocation requires HTTPS or `localhost`. Use any static server:

```bash
# Python
python -m http.server 8000

# or Node
npx serve .
```

Open `http://localhost:8000/auth.html`.

### 5. Fix the share-link path (important)

In `liveLocation.js`, the share link is hard-coded as:

```js
`${window.location.origin}/shadowalert_fixed/track.html?user=${currentUser.id}`
```

Change `/shadowalert_fixed/` to match where you host the app (for Netlify at the site root, use `/track.html`):

```js
`${window.location.origin}/track.html?user=${currentUser.id}`
```

---

## 🌐 Deployment

### Netlify (recommended – `_redirects` already included)

1. Push the project to GitHub.
2. Go to [netlify.com](https://netlify.com) → **Add new site → Import from Git**.
3. Select your repo. Leave build command empty and set publish directory to `/` (root).
4. Deploy. The site opens on `auth.html` thanks to `_redirects`.

### GitHub Pages (alternative)

`_redirects` is Netlify-only. On GitHub Pages, rename or copy `auth.html` to `index.html` (or link directly to `auth.html`). Enable it under **Settings → Pages → Deploy from branch → main / root**.

---

## 📖 Usage

1. Sign up / log in on the landing page.
2. Enter a start point and destination, choose travel mode and time of day.
3. Click **Find Routes** and compare safety scores.
4. After the journey, tap **Feedback for Route** to rate it and mark unsafe spots.
5. Use **SOS** in an emergency, or **Start Live Location** → **Copy Link** to share your position.

---

## ⚠️ Known Limitations

- Uses the public OSRM demo server – not suitable for heavy production traffic.
- Safety scores are estimates based on historical data and user reports; they are **not a guarantee of safety**.
- SOS opens WhatsApp links in the browser; the user must tap send.
- Crime data covers a limited area (default map centre: Pune, India).

---

## 🔮 Future Improvements

- Automatic SMS / push-based SOS
- Mobile app (PWA)
- Street-lighting and crowd-density data
- Self-hosted routing engine

---
