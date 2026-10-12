# 🌍 EarthPulse

A live 3D globe that shows where the **International Space Station** is right now, together with **real earthquakes from the last 24 hours**. No backend, no API keys, no build step.

## Features

- ISS position, altitude, speed and sunlight status, updated every 5 seconds
- ISS orbit path (about 20 minutes behind, 75 minutes ahead)
- Earthquakes (M2.5+) as colored markers, with pulsing rings for M4.5+
- "Nearest quake to the ISS" readout
- "Use my location" shows how far the ISS is from you and whether it is above your horizon
- Click any quake in the list to fly to it

## Run it

Just open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 8000
# then visit http://localhost:8000
```

## Deploy free (GitHub Pages)

1. Push this folder to a GitHub repository
2. Repository → **Settings → Pages** → Source: `main` branch, `/ (root)`
3. Your site appears at `https://<your-username>.github.io/<repo-name>/`

## Data sources

- ISS: [wheretheiss.at](https://wheretheiss.at/w/developer) API
- Earthquakes: [USGS](https://earthquake.usgs.gov/earthquakes/feed/) GeoJSON feed
- Globe: [globe.gl](https://globe.gl) and three-globe imagery

## Roadmap (good first issues)

- [ ] Wildfires, storms and volcanoes from [NASA EONET](https://eonet.gsfc.nasa.gov/)
- [ ] More satellites from CelesTrak, calculated in the browser with satellite.js
- [ ] ISS pass-time predictions for your location
- [ ] Telegram alerts for big quakes near you
- [ ] Pin an exact `globe.gl` version

## Disclaimer

EarthPulse is for curiosity and learning. It is **not** an official warning system. In an emergency, follow your national authorities.

## License

MIT, see [LICENSE](LICENSE).
