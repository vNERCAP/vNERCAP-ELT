const VATSIM_URL = 'https://data.vatsim.net/v3/vatsim-data.json';

export async function fetchVatsimFlight(callsign) {
  const response = await fetch(VATSIM_URL);
  if (!response.ok) {
    throw new Error(`VATSIM fetch failed: ${response.status}`);
  }
  const data = await response.json();
  const match = (data.pilots || []).find(
    (p) => p.callsign && p.callsign.toUpperCase() === callsign.toUpperCase()
  );
  if (!match) {
    throw new Error(`Callsign ${callsign} not found on network`);
  }

  return {
    callsign: match.callsign,
    lat: match.latitude,
    lon: match.longitude,
    alt: match.altitude,
    groundspeed: match.groundspeed,
    lastSeen: match.last_seen || match.logon_time
  };
}

export function haversineDistanceNm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371e3; // meters
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const m = R * c;
  return m / 1852; // nautical miles
}

export function bearingBetween(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const λ1 = toRad(lon1);
  const λ2 = toRad(lon2);

  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);

  const θ = Math.atan2(y, x);
  const bearing = (toDeg(θ) + 360) % 360;
  return bearing;
}
