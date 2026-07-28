/**
 * Mentivax design tokens — the official brand system (mentivax.com). Blue
 * primary (kept under the `green*` names for accent parity with the web theme),
 * with a separate `success*` green. Consumed as a TS object (mobile/RN) or via
 * theme.css (web).
 */
export const colors = {
  paper: '#EEF3FB',
  card: '#FFFFFF',
  ink: '#10192B',
  ink2: '#4A5568',
  ink3: '#8A93A6',
  line: '#DCE4F0',
  line2: '#CDD8EC',
  // Primary accent (brand blue)
  green: '#2563EB',
  greenInk: '#1D4ED8',
  greenSoft: '#EAF0FE',
  greenLine: '#C7D9FB',
  // Success (brand green)
  success: '#1E9E6A',
  successInk: '#157552',
  successSoft: '#E3F5ED',
  amber: '#B26B00',
  amberSoft: '#FCF0DC',
  red: '#D9483B',
  redSoft: '#FCEAE8',
  blue: '#2563EB',
  blueSoft: '#EAF0FE',
  violet: '#6D45C9',
} as const;

export const radii = { sm: 10, md: 12, lg: 16 } as const;

export const fonts = {
  ui: "'DM Sans',system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
  display: "'Space Grotesk','DM Sans',system-ui,sans-serif",
  mono: "'DM Mono',ui-monospace,'SF Mono',Menlo,Consolas,monospace",
} as const;

export const brand = {
  name: 'Mentivax',
  tagline: 'Less paperwork, more teaching',
} as const;

export type Colors = typeof colors;
