# TrailCast

**Adventure videos with the map beside them.**

Riders, trekkers and climbers post their trips on YouTube. TrailCast puts a map next to the video: the route they
took, a dot that follows the video as it plays, and the places they talk about. Viewers can click a place to jump to
that moment, and save the places to Google Maps, a GPS app or a printable trip sheet.

## What works today

- **Accounts:** sign up with email, username and password. New users answer one short welcome question (what
  they'll use TrailCast for), plus two optional ones (how they found TrailCast, what they'd like to see). Anyone can
  watch; you need an account to add trails, and only the person who added a trail can change it.
- **Feedback:** logged-in users can send feedback from the link at the bottom of every page.
- **Add a trail:** paste a YouTube link (normal video or live stream) and, optionally, upload the GPS route as a
  `.gpx` file from Strava, Garmin, Komoot or any tracking app.
- **Watch page:** the video on one side, the map on the other, like following a cab in a taxi app.
  - The whole route is drawn faded; the part already covered is drawn bold.
  - A blue marker glides along the route with the video (when the route has times). It waits at stops, and
    disappears during intros, recaps and montages, with a note saying when the map picks up again.
  - Numbered pins mark the key points. Clicking a pin or a list item jumps the video there.
- **Creator tools:** add key points (pause the video, search for the place by name or click the map), line up the
  map with the video in two clicks, delete points or the whole trail.
- **No GPS file? No problem:** add a key point each time the video reaches a new place, and TrailCast joins them into
  a route along real roads or footpaths (or straight lines). The blue dot moves between the places as the video plays,
  and the route is shown dashed and labelled "approximate". It redraws itself when key points change.
- **AI route builder:** for public videos without a GPS file, Google's Gemini watches the video and lists the towns
  and landmarks it passes, with the moment each one appears, how it knows (sign board, milestone, speech, landmark)
  and how sure it is. It also marks intros, recaps and montages. The owner checks the list (untick, move, change
  the parts the map skips), then TrailCast draws the route through the ticked places. Places only mentioned
  ("one day we'll ride to Leh") start unticked, and places that would send the route far off its way are flagged.
  The same video is never analysed (or paid for) twice, and daily and monthly limits stop runaway bills.
- **Take it with you:** an "Open in Google Maps" link for every key point, GPX and KML downloads (KML imports into
  Google My Maps), and a printable trip sheet you can save as a PDF.
- **Support the creator:** a button linking to the creator's Ko-fi, Buy Me a Coffee, Patreon or UPI page.

## Why it costs (almost) nothing to run

| Part | Who pays | Cost |
| --- | --- | --- |
| Video storage, streaming, live streams | YouTube (official embedded player) | Free |
| Map | OpenStreetMap + Leaflet | Free |
| Place search | OpenStreetMap Nominatim | Free (one search per second) |
| Routes along roads and paths | OpenRouteService free plan | Free (2,000 routes a day; each route is worked out once, when saved) |
| AI route builder (optional) | Google Gemini API | Free tier: up to 8 hours of YouTube video a day. Paid: about $0.06 (≈ ₹5) per 30 minutes of video, about 3× that with "read sign boards closely" |
| Database | MongoDB Atlas free tier | Free |
| Hosting | Free tiers (Render, Railway, Vercel...) | Free |
| Domain name | You, optional | ~$10/year |

TrailCast never stores or streams video itself. That would be by far the most expensive part of any video site.

## Run it on your computer

You need **Node.js 22.22 or newer** (`node --version` to check; Node 24 LTS is a good choice).

```sh
npm install
npm run dev
```

Open http://localhost:5173. The API runs on http://localhost:4000.

**Database:** with no settings, the server starts a temporary MongoDB in memory. `npm install` downloads it (about
100 MB), and everything you add is lost when you stop the server. To keep your data, copy `server/.env.example` to
`server/.env` and set `MONGODB_URI` to one of these:

- **MongoDB Atlas (free, in the cloud):** create a free cluster at https://www.mongodb.com/atlas, add a database
  user, and copy the connection string (`mongodb+srv://...`).
- **MongoDB on your computer with Podman or Docker:**
  ```sh
  podman run -d --name trailcast-mongo -p 27017:27017 docker.io/library/mongo:8
  ```
  Then use `MONGODB_URI=mongodb://localhost:27017/trailcast`.

If the in-memory database can't start on your system, use one of these instead.

**Logins:** `.env.example` also explains `JWT_SECRET`, the secret that signs login sessions. While developing you can
leave it empty; it must be set before TrailCast goes online.

**Routes along roads (optional):** for routes drawn between key points to follow real roads and footpaths, get a free
key at https://openrouteservice.org and set `ORS_API_KEY` in `server/.env`. Without it they're straight lines.

**AI route builder (optional):** get a Gemini API key at https://aistudio.google.com ("Get API key") and set
`GEMINI_API_KEY` in `server/.env`. `.env.example` lists the other settings: the model, the daily limit per user
(3) and the monthly budget ($5). Before using it in the app, try it on a few real vlogs from the command line. It
prints the places found, the parts to skip, the tokens used and the cost in dollars and rupees, and saves Gemini's
full answer in `server/ai-results/`:

```sh
npm run try-ai -w server -- https://www.youtube.com/watch?v=VIDEO_ID
npm run try-ai -w server -- https://www.youtube.com/watch?v=VIDEO_ID --high       # read sign boards closely (~3x the cost)
npm run try-ai -w server -- https://www.youtube.com/watch?v=VIDEO_ID --geocode    # also find the places on the map
npm run try-ai -w server -- https://www.youtube.com/watch?v=VIDEO_ID --fps 0.5    # 1 frame every 2 s: fewer picture tokens
npm run try-ai -w server -- ride.mp4 --no-audio                                   # a video file, sent without its sound
npm run try-ai -w server -- --list-models                                         # which Gemini models your key can use
```

The cost section lists the tokens for the picture (VIDEO) and the sound (AUDIO) separately, so you can see what each
one costs. To save tokens, send fewer frames with `--fps`, or leave the sound out with `--no-audio`. `--no-audio` only
works with a video file on your computer, such as your own ride: Gemini fetches YouTube links itself, sound included.
The script shrinks the file with [FFmpeg](https://ffmpeg.org/download.html) first (480 lines, 1 frame a second), so
it uploads quickly, then deletes it from Gemini afterwards. Without sound, Gemini only has sign boards, milestones and
on-screen text to go on, so compare the places found with and without it.

Gemini can only watch **public** YouTube videos. On the free tier, Google may use what you send to improve its
products; on a paid plan it doesn't.

**Try it out:** sign up, answer the welcome question, click "+ New trail", paste any YouTube riding video and upload `samples/sample-ride.gpx`. That file is
a made-up 20-minute route near Manali with times, so the blue dot will move as the video plays (it won't match the
real video, of course).

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the API and the website, reloading when you change code |
| `npm test` | Runs the server and client tests |
| `npm run build` | Builds the website for production into `client/dist/` |
| `npm run try-ai -w server -- <youtube-link or video file>` | Asks Gemini about one video and prints the places and the cost |

## How the code is organised

```
client/                  React website (Vite, Tailwind CSS, Leaflet)
  src/
    pages/               One file per page: Home, NewTrail, Trail (watch + edit), Print (trip sheet),
                         Signup, Login, Welcome (questions after signing up), Account, Feedback
    components/          Pieces used by the pages: the map (with the gliding marker), key point list,
                         add-point form, route panel, AI route panel (start, progress, review),
                         RequireAuth (makes a page logged-in only)
      art/               The hand-drawn SVG illustrations (hero landscape, summit, campsite, logo) and icons
    hooks/               useYouTubePlayer: puts a YouTube player on the page and reports its time,
                         with a clock the map reads 60 times a second; useReducedMotion
    lib/                 Plain functions, each with a .test.js next to it:
      gpx.js               read GPX files in the browser
      track.js             where the rider is at a given video time, and the part already covered
      exports.js           GPX/KML files and Google Maps / YouTube links
      time.js              12:30 <-> 750 seconds
    api.js               All calls to the server
    auth.jsx             Knows who is logged in, for every page (useAuth)
server/                  Express API + MongoDB (Mongoose)
  src/
    models/              What trails, users, feedback and AI jobs look like in the database, with validation rules
    controllers/         What each API request does
    services/            Outside services: routes along roads (OpenRouteService), place search (Nominatim),
                         Gemini (including uploading a video file), YouTube's video check (oEmbed),
                         FFmpeg (shrinking a video file and removing its sound)
    aiRoute/             The AI route builder: the job's stages, cleaning Gemini's answers, finding the places
                         on the map, working out the cost
    jobs/worker.js       Runs AI jobs in the background, one at a time; a job continues where it stopped after
                         a restart, and a paid Gemini answer is never asked for twice
    prompts/             What Gemini is asked (versioned, so a changed prompt doesn't reuse old answers)
    routes/              Which URL goes to which controller
    middleware/          auth.js: login sessions; errorHandler.js: clear JSON error messages
    utils/               YouTube link parsing, distances on the map, times like 1:02:05, small helpers
    config.js            The AI settings from server/.env
  scripts/try-ai-route.js  Try Gemini on one video from the command line
  test/                  API tests against a real (in-memory) MongoDB, with fake Gemini, maps and routing
samples/                 A sample GPX file to try
```

### API

| Method | URL | Who | What it does |
| --- | --- | --- | --- |
| POST | `/api/auth/signup` | Anyone | Create an account (`email`, `username`, `password`) and log in |
| POST | `/api/auth/login` | Anyone | Log in with `email` and `password` |
| POST | `/api/auth/logout` | Anyone | Log out |
| GET | `/api/auth/me` | Anyone | The logged-in user, or `null` |
| PUT | `/api/auth/onboarding` | Logged in | Save the welcome answers (`interests`, `referralSource`, `wishlist`) |
| POST | `/api/feedback` | Logged in | Send feedback (`message`) |
| GET | `/api/places?q=...` | Logged in | Find places by name |
| GET | `/api/config` | Anyone | What the server can do (`roadRouting`, `aiRoute`) |
| GET | `/api/trails` | Anyone | List trails (without their routes) |
| GET | `/api/trails/:id` | Anyone | One trail with its route and key points |
| POST | `/api/trails` | Logged in | Create a trail from `youtubeUrl`, `title` and optional route |
| PATCH | `/api/trails/:id` | Owner | Change a trail (title, sync, support link...) |
| DELETE | `/api/trails/:id` | Owner | Delete a trail |
| POST | `/api/trails/:id/route` | Owner | Draw the route between the key points (`style`: `roads`, `paths` or `straight`) |
| POST | `/api/trails/:id/points` | Owner | Add a key point |
| PATCH | `/api/trails/:id/points/:pointId` | Owner | Change a key point |
| DELETE | `/api/trails/:id/points/:pointId` | Owner | Delete a key point |
| POST | `/api/trails/:id/ai-route` | Owner | Start an AI analysis (`durationSec`, optional `highDetail`, `fresh`). Reuses an earlier analysis of the same video unless `fresh` |
| GET | `/api/trails/:id/ai-route` | Owner | The trail's latest AI analysis, or `null` |
| POST | `/api/trails/:id/ai-route/accept` | Owner | Turn the reviewed places into key points and draw the route (`jobId`, `places`, `hiddenRanges`) |
| GET | `/api/jobs/:id` | Job owner | How an analysis is going, and its places once done |
| POST | `/api/jobs/:id/cancel` | Job owner | Stop an analysis |

Logging in sets an httpOnly cookie, which the browser sends with every request after that.

## Roadmap

1. ~~Watch page with the synced map, key points, downloads, trip sheet~~ ✓
2. ~~Accounts: email login, welcome questions, feedback, only owners can edit~~ ✓
3. **Put it online:** one free host serving the API and the website, MongoDB Atlas, and a map tile provider with a
   free tier (OpenStreetMap's own servers are only for light use). Before that: limit login attempts, and add
   "forgot password" by email.
4. **Explore:** search and filter trails by region and activity, and a map of all trails.
5. **Live location:** during a YouTube live stream, the creator's phone sends its GPS position and viewers see the dot
   move in real time.
6. **Community:** follow creators, comments, viewers' saved places.
7. **Donations in TrailCast itself:** only once there are real users, because it needs a payments company, identity
   checks and taxes.
8. ~~Routes for videos without a GPX file, drawn between the key points~~ ✓
   Later: read the chapters in a YouTube description ("12:30 Rohtang Pass") and suggest them as key points.
9. ~~AI route builder and the cab-style map~~ ✓ Next: measure it on real vlogs (accuracy and cost), a "try harder"
   button with a stronger model, personal notes on places, sharing the route with each leg's Google Maps link,
   hiding the exact start and end (a rider's home), and remembering found places to save searches.
10. **Log in with a phone number.**
