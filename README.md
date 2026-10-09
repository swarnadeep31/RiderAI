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
- **Watch page:** the video on one side, the map on the other.
  - The route is drawn on the map.
  - A blue dot follows the video while it plays (when the GPX file has times).
  - Numbered pins mark the key points. Clicking a pin or a list item jumps the video there.
- **Creator tools:** add key points (pause the video, click the map, name it), line up the map with the video in two
  clicks, delete points or the whole trail.
- **Take it with you:** an "Open in Google Maps" link for every key point, GPX and KML downloads (KML imports into
  Google My Maps), and a printable trip sheet you can save as a PDF.
- **Support the creator:** a button linking to the creator's Ko-fi, Buy Me a Coffee, Patreon or UPI page.

## Why it costs (almost) nothing to run

| Part | Who pays | Cost |
| --- | --- | --- |
| Video storage, streaming, live streams | YouTube (official embedded player) | Free |
| Map | OpenStreetMap + Leaflet | Free |
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

**Try it out:** sign up, answer the welcome question, click "+ New trail", paste any YouTube riding video and upload `samples/sample-ride.gpx`. That file is
a made-up 20-minute route near Manali with times, so the blue dot will move as the video plays (it won't match the
real video, of course).

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the API and the website, reloading when you change code |
| `npm test` | Runs the server and client tests |
| `npm run build` | Builds the website for production into `client/dist/` |

## How the code is organised

```
client/                  React website (Vite, Tailwind CSS, Leaflet)
  src/
    pages/               One file per page: Home, NewTrail, Trail (watch + edit), Print (trip sheet),
                         Signup, Login, Welcome (questions after signing up), Account, Feedback
    components/          Pieces used by the pages: the map, key point list, add-point form,
                         RequireAuth (makes a page logged-in only)
    hooks/               useYouTubePlayer: puts a YouTube player on the page and reports its time
    lib/                 Plain functions, each with a .test.js next to it:
      gpx.js               read GPX files in the browser
      track.js             where the rider is at a given video time
      exports.js           GPX/KML files and Google Maps / YouTube links
      time.js              12:30 <-> 750 seconds
    api.js               All calls to the server
    auth.jsx             Knows who is logged in, for every page (useAuth)
server/                  Express API + MongoDB (Mongoose)
  src/
    models/              What trails, users and feedback look like in the database, with validation rules
    controllers/         What each API request does
    routes/              Which URL goes to which controller
    middleware/          auth.js: login sessions; errorHandler.js: clear JSON error messages
    utils/               YouTube link parsing and small helpers
  test/                  API tests against a real (in-memory) MongoDB
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
| GET | `/api/trails` | Anyone | List trails (without their routes) |
| GET | `/api/trails/:id` | Anyone | One trail with its route and key points |
| POST | `/api/trails` | Logged in | Create a trail from `youtubeUrl`, `title` and optional route |
| PATCH | `/api/trails/:id` | Owner | Change a trail (title, sync, support link...) |
| DELETE | `/api/trails/:id` | Owner | Delete a trail |
| POST | `/api/trails/:id/points` | Owner | Add a key point |
| PATCH | `/api/trails/:id/points/:pointId` | Owner | Change a key point |
| DELETE | `/api/trails/:id/points/:pointId` | Owner | Delete a key point |

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
8. **Draw a route by hand** for creators who didn't record a GPX file.
9. **Log in with a phone number.**
