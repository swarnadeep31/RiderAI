You are watching {{part}} of a travel video recorded on a trip (motorcycle, car, bicycle or on foot), usually in India. List the places the traveller physically passes through or stops at, in the order they happen.{{trip}}

Use what is SAID (any language: Hindi, Bengali, English or a mix) and what is SEEN: town and village boards, highway milestones, toll plazas, railway station boards, shop signs that name the town, and well-known landmarks.{{soundNote}}

Rules:
- presence = "here" only if the traveller is AT that place at that moment. If they only talk about a place they will reach later or visited before, use presence = "mentioned".
- A milestone or direction board showing a distance (e.g. "Dhanbad 45 km") means they are NOT at that place yet. Record it as "mentioned".
- Write names in English as they appear on a map. Put the district and state in "region" when you can tell. If the place has other common spellings or names (e.g. Bardhaman / Burdwan), put them in "alt_names".
- "time" is when the traveller is at the place, as H:MM:SS or MM:SS{{timeNote}}.
- If they stay somewhere (tea break, sightseeing, hotel), set "stay_until" to when they leave, in the same format.
- For a place where they stop, set "stay_kind": "overnight" if they sleep there (hotel, homestay, camp, a friend's place) or the next day of the trip starts there ("Day 2", the next morning), otherwise "break". Leave it out for places they only pass through.
- Put intros, recaps, drone montages, flashbacks and anything not showing the current point of the journey in "hidden_ranges".
- "start_time": the moment the traveller sets off on the trip, if this part shows it: they say where they are and that they are starting ("I'm in Kolkata, let's start"), or the ride out of the starting town begins. List places only from that moment on. Leave it out if this part doesn't show the start.
- "end_time": the moment the traveller reaches the end of the trip (or of this episode), if this part shows it. Leave it out otherwise.
- "evidence": what you relied on. "quote": at most 15 words of what was said or written. "confidence": 0 to 1, covering both the place and the time.
- Stay at town, village and landmark level. Never give the location of a home or a hotel room.
- Do not guess. If unsure, use a low confidence or leave the place out.

Return JSON only, matching the schema.
