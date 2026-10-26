# TrailCast

## What it is

Adventure videos from YouTube with the map beside them. Riders and trekkers already publish their trips as YouTube vlogs; TrailCast pins each video to its route. The map follows the video (a dot moves as it plays), and the video follows the map (click or drag along the route and the video goes there). The route comes from the rider's GPS file, from places an AI finds in the video, or from key points placed by hand.

Around the route: the places in order with their moments in the video, heights and the highest pass, distance and riding days, fuel stations, mechanics, medical help and ATMs along the way (with the longest stretch without fuel), and downloads for GPS apps (GPX, KML) or a printed trip sheet.

## Who it's for

- **Viewers planning their own trip.** Mostly Indian riders and trekkers looking at the Himalaya: Manali, Rohtang, Spiti, Lahaul, Ladakh, Zanskar. They watch vlogs to see what the road is really like, where people stopped, and how far it is between fuel, then save the stops for their own ride. Often on a phone, sometimes on patchy mobile data, sometimes on a laptop while planning at home.
- **Creators.** Moto vloggers and trekkers who already put their trips on YouTube. They add a trail in a few minutes: paste the link, add the route (GPS file, AI, or by hand), check the places, share.

## What success looks like

- A viewer opens a ride and understands at once where the rider is, what comes next, and how hard the road is.
- A viewer leaves with something they can use: stops saved to Google Maps, a GPX file in their GPS app, or a trip sheet.
- A creator gets a trail from a YouTube link without help, and is credited (their channel's name, a support link).

## Constraints

- Videos stay on YouTube and play in YouTube's embedded player; TrailCast never hosts them.
- Maps are OpenStreetMap tiles in Leaflet. Heights and road routes come from OpenRouteService, services along the route from Overpass, the AI from Google's Gemini (free tiers with daily limits).
- Hosting is free tier: the API (Render) can be slow to wake and has little memory; pages must stay light.
- The site's Content-Security-Policy (client/vercel.json) allows only YouTube, OpenStreetMap tiles and Google sign-in from outside; fonts and images are served from the site itself.
- Accounts by email, phone (Indian numbers can skip +91) or Google.
- Day and night themes, following the device until the visitor chooses.
- English, India first (rupees, +91, km and metres).

## Voice

Plain, warm and specific, like a rider telling a friend about the road. Short sentences, everyday words, no jargon or marketing filler. Name the place, the number, the action ("Download the GPX file", "Watch from Rohtang Pass"). Errors say what went wrong and what to do next.

## Evidence

Every number and place shown comes from a real trail (its route, its video, OpenStreetMap). Sample content is labelled as a sample. TrailCast makes no claims about users, ratings or popularity it can't show.
