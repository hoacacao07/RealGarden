/**
 * Sun position (azimuth, altitude) for a time and place. Same low-precision astronomy formulas as the `suncalc`
 * library (Vladimir Agafonkin, BSD-2, after the Astronomy Answers articles by Dr. Louis Strous), inlined here so the
 * engine has no dependency. Accurate to well under a degree, plenty for counting sun hours on a balcony.
 */
const RAD = Math.PI / 180;
const DAY_MS = 86400e3;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = RAD * 23.4397;

const toDays = (ms: number) => ms / DAY_MS - 0.5 + J1970 - J2000;
const rightAscension = (l: number, b: number) => Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY), Math.cos(l));
const declination = (l: number, b: number) => Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l));
const siderealTime = (d: number, lw: number) => RAD * (280.16 + 360.9856235 * d) - lw;
const meanAnomaly = (d: number) => RAD * (357.5291 + 0.98560028 * d);

function eclipticLongitude(m: number) {
  const c = RAD * (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m));
  return m + c + RAD * 102.9372 + Math.PI;
}

export interface SunPos {
  /** Compass bearing of the sun in degrees: 0 north, 90 east, 180 south, 270 west. */
  azimuth_deg: number;
  /** Degrees above the horizon (negative at night). */
  altitude_deg: number;
}

export function sunPosition(ms: number, lat: number, lon: number): SunPos {
  const lw = RAD * -lon;
  const phi = RAD * lat;
  const d = toDays(ms);
  const l = eclipticLongitude(meanAnomaly(d));
  const dec = declination(l, 0);
  const h = siderealTime(d, lw) - rightAscension(l, 0);
  // suncalc's azimuth runs from south, clockwise toward west; +180° turns it into a compass bearing.
  const az = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(h));
  return { azimuth_deg: (((az / RAD + 180) % 360) + 360) % 360, altitude_deg: alt / RAD };
}
