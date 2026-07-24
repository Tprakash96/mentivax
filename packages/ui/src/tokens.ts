/**
 * Mentivax design tokens — the green "fee intelligence" theme from the
 * prototype. Consumed as a TS object (mobile/RN) or via theme.css (web).
 */
export const colors = {
  paper: '#F7F8F7',
  card: '#FFFFFF',
  ink: '#171B1A',
  ink2: '#5B6663',
  ink3: '#98A29E',
  line: '#E6EAE8',
  line2: '#D5DCD9',
  green: '#0E7C5B',
  greenInk: '#0A5C44',
  greenSoft: '#E8F4EF',
  greenLine: '#BEE0D2',
  amber: '#B0700A',
  amberSoft: '#FBF1DD',
  red: '#C0392B',
  redSoft: '#FBEAE7',
  blue: '#2563EB',
  blueSoft: '#EAF0FE',
  violet: '#6D45C9',
} as const;

export const radii = { sm: 8, md: 12, lg: 16 } as const;

export const fonts = {
  ui: '-apple-system,BlinkMacSystemFont,"Segoe UI","Inter",Roboto,system-ui,sans-serif',
  mono: 'ui-monospace,"SF Mono",Menlo,Consolas,monospace',
} as const;

export const brand = {
  name: 'Mentivax',
  tagline: 'Less paperwork, more teaching',
} as const;

export type Colors = typeof colors;
