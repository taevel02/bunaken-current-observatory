import {Body, Illumination, MoonPhase} from "astronomy-engine";

const phases = ["New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous", "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent"] as const;

/** Eight display sectors; quarter labels do not imply an exact phase event. */
export function lunarPhaseName(angle: number) {
  return phases[Math.floor((angle + 22.5) / 45) % phases.length];
}

/** Geocentric astronomical display only, never an environmental/model feature. */
export function calculateMoon(at: Date) {
  return {phase: lunarPhaseName(MoonPhase(at)), illumination: Illumination(Body.Moon, at).phase_fraction};
}
