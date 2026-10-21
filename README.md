**English** | [Español](README.es.md)

# H6 Live Pass

![H6 Live Pass](web/og.png)

A no-install mobile web app that helps first-time spectators understand a Hyatlon H6 race and follow their athletes live. **Winner of the GED Sports challenge at ActivaHack 2026 (University of León).**

- **Try it on your phone:** https://h6-live-pass.vercel.app
- **Presenter view (desktop):** https://h6-live-pass.vercel.app/presentar

## The problem
A Hyatlon H6 alternates 6 × 1 km runs with 6 strength stations. A venue hosts around 1,000 athletes, with a new wave starting every 15 minutes, so people at very different stages are on the course at once. Today results are published after the event as one PDF per category, with no splits and no live tracking. From the stands it is hard to know where your athlete is, what they are doing or whether a position is final.

## What the app does
- **Find your athlete** by name, bib or wave, and follow them with one tap.
- **Live status:** current station or run, time on course, estimated time to the next station and finish, and alerts at every chip mat.
- **Understand the race:** a one-minute intro, a guide to each station with animations and weights by category, and the live wave schedule.
- **Provisional vs. official:** every position shows its state (provisional, under review or official), plus who has overtaken your athlete from a later wave.
- **Share it:** a Strava-style image of the result for Instagram or WhatsApp, also as a transparent sticker.

## How it works
- **No backend.** The whole race day is generated in the browser by a deterministic, seeded simulation, so every device computes exactly the same race.
- **Phones stay in sync through the QR.** The QR on the presenter screen carries the race clock (time, anchor, speed, pause). Each phone that scans it shows the same moment of the race, with no server involved.
- **Confirmed vs. estimated data.** A reading from a chip mat is marked ✓. Anything between two mats is estimated from the athlete's own pace and always marked with ~.
- **Grounded in the real format.** Stations, categories, weights and the wave system come from official Hyatlon / FETRI documents. What is not public yet (exact mat positions, the review window) is clearly treated as an assumption. See [`investigacion/RESUMEN.md`](investigacion/RESUMEN.md) (in Spanish).
- **Plain HTML, CSS and JavaScript.** No framework and no build step. Vercel serves the `web/` folder as a static site.

## Project structure
| Path | Purpose |
|---|---|
| `web/index.html` | Spectator app (mobile): Follow, Rankings, Waves and Guide |
| `web/presentar.html` | Desktop / projector view: story scenarios, race clock, embedded phone and QR |
| `web/js/data.js` | Simulation engine: categories, waves, chip mats and rankings |
| `web/js/scenarios.js` | The 8 moments of the demo story |
| `web/js/talk.js` | Guided 3-minute demo |
| `web/anim/` | Animated SVGs for each station |
| `investigacion/` | Research notes: what is official, what is assumed and what was discarded |

## Run it locally
```bash
python -m http.server 5173 --bind 0.0.0.0 --directory web
```
Open `http://localhost:5173/` for the app and `http://localhost:5173/presentar.html` for the presenter view. To test on a phone over the local Wi-Fi, open `http://<your-PC-IP>:5173/` and enter that same address under "¿El QR apunta a localhost?" in the presenter view.

The presenter view has a guided demo: press **▶ Presentar** or the `P` key.

## Team
- **Iván Rodríguez Steuerberg** · [LinkedIn](https://www.linkedin.com/in/ivansteuerberg/)
- **Álvaro Rodríguez Pino** · [LinkedIn](https://www.linkedin.com/in/alvarorodriguezpino/)

Athletes and results in the demo are fictitious.

## License
© 2026 Iván Rodríguez Steuerberg and Álvaro Rodríguez Pino. All rights reserved. The code is public so it can be reviewed; it may not be copied, modified or redistributed without permission.
