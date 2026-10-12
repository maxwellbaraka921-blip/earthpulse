(() => {
  'use strict';

  // ---- Config -------------------------------------------------------------
  const ISS_URL = 'https://api.wheretheiss.at/v1/satellites/25544';
  const ISS_POSITIONS_URL = ISS_URL + '/positions?units=kilometers&timestamps=';
  const QUAKE_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';
  const IMG = 'https://unpkg.com/three-globe/example/img/';

  const EARTH_RADIUS_KM = 6371;
  const ISS_POLL_MS = 5000;
  const QUAKE_POLL_MS = 5 * 60 * 1000;
  const ORBIT_REFRESH_MS = 10 * 60 * 1000;

  // ---- State --------------------------------------------------------------
  const state = { iss: null, quakes: [], user: null, follow: true };

  // ---- Helpers ------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const toRad = (d) => (d * Math.PI) / 180;
  const fmtKm = (n) => Math.round(n).toLocaleString() + ' km';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // Great-circle distance in km (haversine).
  function distanceKm(lat1, lng1, lat2, lng2) {
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  // Elevation angle (degrees) of the ISS above the observer's horizon.
  function elevationDeg(groundKm, altKm) {
    const c = groundKm / EARTH_RADIUS_KM; // central angle
    const ratio = EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altKm);
    return (Math.atan2(Math.cos(c) - ratio, Math.sin(c)) * 180) / Math.PI;
  }

  function magColor(m) {
    if (m < 3.5) return '#ffd166';
    if (m < 4.5) return '#ff9f43';
    if (m < 5.5) return '#ff6b3d';
    return '#ff2d55';
  }

  function makeMarker(emoji, extraClass) {
    const el = document.createElement('div');
    el.className = 'marker' + (extraClass ? ' ' + extraClass : '');
    el.textContent = emoji;
    return el;
  }

  async function getJSON(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(url + ' → HTTP ' + res.status);
    return res.json();
  }

  function setStatus(msg) { $('status').textContent = msg; }

  // ---- Globe --------------------------------------------------------------
  const issObj = { lat: 0, lng: 0, alt: 0.066, el: makeMarker('🛰️') };
  const userObj = { lat: 0, lng: 0, alt: 0.01, el: makeMarker('📍', 'user') };

  const globe = Globe()($('globe'))
    .globeImageUrl(IMG + 'earth-blue-marble.jpg')
    .bumpImageUrl(IMG + 'earth-topology.png')
    .backgroundImageUrl(IMG + 'night-sky.png')
    .atmosphereColor('#6cb4ff')
    .atmosphereAltitude(0.2)
    // Earthquakes
    .pointLat('lat').pointLng('lng')
    .pointAltitude((d) => 0.004 + d.mag * 0.008)
    .pointRadius((d) => 0.12 + d.mag * 0.07)
    .pointColor((d) => magColor(d.mag))
    .pointLabel((d) => `<b>M${d.mag.toFixed(1)}</b> · ${esc(d.place)}<br>${new Date(d.time).toLocaleString()}`)
    .onPointClick((d) => flyTo(d.lat, d.lng, 0.8))
    .ringLat('lat').ringLng('lng')
    .ringMaxRadius((d) => d.mag * 1.1)
    .ringPropagationSpeed(2)
    .ringRepeatPeriod(1800)
    .ringColor((d) => (t) => {
      const c = magColor(d.mag);
      const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${1 - t})`;
    })
    // ISS + user markers
    .htmlLat('lat').htmlLng('lng').htmlAltitude('alt')
    .htmlElement((d) => d.el)
    // ISS orbit path
    .pathPoints('points')
    .pathPointLat((p) => p[0]).pathPointLng((p) => p[1]).pathPointAlt((p) => p[2])
    .pathColor(() => ['rgba(90,209,255,0.05)', 'rgba(90,209,255,0.95)'])
    .pathStroke(0.5)
    .pathTransitionDuration(0);

  function resize() { globe.width(window.innerWidth).height(window.innerHeight); }
  window.addEventListener('resize', resize);
  resize();

  globe.controls().autoRotate = false;
  globe.controls().addEventListener('start', () => setFollow(false));
  globe.pointOfView({ lat: 0, lng: 37, altitude: 2.4 });

  function flyTo(lat, lng, altitude) {
    setFollow(false);
    globe.pointOfView({ lat, lng, altitude }, 1000);
  }

  function setFollow(on) {
    state.follow = on;
    const btn = $('followBtn');
    btn.classList.toggle('on', on);
    btn.textContent = on ? 'Following ISS' : 'Follow ISS';
  }

  $('followBtn').addEventListener('click', () => {
    setFollow(!state.follow);
    if (state.follow && state.iss) followIss();
  });

  function followIss() {
    const alt = globe.pointOfView().altitude || 2;
    globe.pointOfView({ lat: state.iss.lat, lng: state.iss.lng, altitude: alt }, 1000);
  }

  function refreshMarkers() {
    const items = [issObj];
    if (state.user) items.push(userObj);
    globe.htmlElementsData(items);
  }

  // ---- ISS ----------------------------------------------------------------
  async function updateIss() {
    try {
      const d = await getJSON(ISS_URL);
      state.iss = { lat: d.latitude, lng: d.longitude, alt: d.altitude, vel: d.velocity, vis: d.visibility };
      issObj.lat = d.latitude;
      issObj.lng = d.longitude;
      issObj.alt = d.altitude / EARTH_RADIUS_KM;
      refreshMarkers();

      $('issLat').textContent = d.latitude.toFixed(2) + '°';
      $('issLng').textContent = d.longitude.toFixed(2) + '°';
      $('issAlt').textContent = fmtKm(d.altitude);
      $('issVel').textContent = Math.round(d.velocity).toLocaleString() + ' km/h';
      $('issVis').textContent = d.visibility === 'daylight' ? '☀️ Daylight'
        : d.visibility === 'eclipsed' ? '🌑 In Earth’s shadow' : d.visibility;

      updateUserDistance();
      updateNearestQuake();
      if (state.follow) followIss();
      setStatus('Updated ' + new Date().toLocaleTimeString());
    } catch (err) {
      console.error(err);
      setStatus('Could not reach the ISS feed. Retrying…');
    }
  }

  async function updateOrbit() {
    try {
      const now = Math.floor(Date.now() / 1000);
      const stamps = [];
      for (let m = -20; m < 80; m += 5) stamps.push(now + m * 60); // 20 points
      const pts = [];
      for (let i = 0; i < stamps.length; i += 10) {
        const chunk = stamps.slice(i, i + 10);
        const data = await getJSON(ISS_POSITIONS_URL + chunk.join(','));
        data.forEach((p) => pts.push(p));
        if (i + 10 < stamps.length) await sleep(1100); // be polite to the API
      }
      // Unwrap longitudes so the path never jumps across the ±180° seam.
      let prev = null;
      const points = pts.map((p) => {
        let lng = p.longitude;
        if (prev !== null) {
          while (lng - prev > 180) lng -= 360;
          while (lng - prev < -180) lng += 360;
        }
        prev = lng;
        return [p.latitude, lng, p.altitude / EARTH_RADIUS_KM];
      });
      globe.pathsData([{ points }]);
    } catch (err) {
      console.error(err);
    }
  }

  // ---- Earthquakes --------------------------------------------------------
  async function updateQuakes() {
    try {
      const geo = await getJSON(QUAKE_URL);
      state.quakes = geo.features
        .filter((f) => f.geometry && f.properties && f.properties.mag != null)
        .map((f) => ({
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
          mag: f.properties.mag,
          place: f.properties.place || 'Unknown location',
          time: f.properties.time,
        }));

      globe.pointsData(state.quakes);
      globe.ringsData(state.quakes.filter((q) => q.mag >= 4.5));

      $('quakeCount').textContent = state.quakes.length.toLocaleString();
      const top = [...state.quakes].sort((a, b) => b.mag - a.mag);
      $('quakeMax').textContent = top.length ? `M${top[0].mag.toFixed(1)}` : '–';

      const list = $('quakeList');
      list.replaceChildren();
      top.slice(0, 8).forEach((q) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        const mag = document.createElement('span');
        mag.className = 'mag';
        mag.style.color = magColor(q.mag);
        mag.textContent = 'M' + q.mag.toFixed(1);
        const place = document.createElement('span');
        place.className = 'place';
        place.textContent = q.place;
        btn.append(mag, place);
        btn.addEventListener('click', () => flyTo(q.lat, q.lng, 0.8));
        li.append(btn);
        list.append(li);
      });

      updateNearestQuake();
    } catch (err) {
      console.error(err);
      $('quakeCount').textContent = 'unavailable';
    }
  }

  function updateNearestQuake() {
    if (!state.iss || !state.quakes.length) return;
    let best = null, bestD = Infinity;
    for (const q of state.quakes) {
      const d = distanceKm(state.iss.lat, state.iss.lng, q.lat, q.lng);
      if (d < bestD) { bestD = d; best = q; }
    }
    if (best) $('issNearQuake').textContent = `M${best.mag.toFixed(1)} · ${fmtKm(bestD)}`;
  }

  // ---- User location ------------------------------------------------------
  function updateUserDistance() {
    if (!state.user || !state.iss) return;
    const ground = distanceKm(state.user.lat, state.user.lng, state.iss.lat, state.iss.lng);
    const el = elevationDeg(ground, state.iss.alt);
    $('issDist').textContent = el > 0
      ? `${fmtKm(ground)} · overhead now (${Math.round(el)}° up)`
      : `${fmtKm(ground)} · below horizon`;
  }

  $('locBtn').addEventListener('click', () => {
    if (!navigator.geolocation) { setStatus('Geolocation is not supported here.'); return; }
    setStatus('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.user = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        userObj.lat = state.user.lat;
        userObj.lng = state.user.lng;
        refreshMarkers();
        updateUserDistance();
        setStatus('Location set (stays in your browser).');
      },
      () => setStatus('Location blocked. You can allow it in your browser settings.'),
      { timeout: 10000 }
    );
  });

  // ---- Start --------------------------------------------------------------
  updateIss();
  updateQuakes();
  updateOrbit();
  setInterval(updateIss, ISS_POLL_MS);
  setInterval(updateQuakes, QUAKE_POLL_MS);
  setInterval(updateOrbit, ORBIT_REFRESH_MS);
})();
