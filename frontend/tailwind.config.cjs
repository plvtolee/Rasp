/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'rgb(var(--color-paper-rgb) / <alpha-value>)',
        ink: 'rgb(var(--color-ink-rgb) / <alpha-value>)',
        lime: '#C6FF36',
        cobalt: '#3155FF',
        tang: '#FF6633',
        bubble: '#FF58A8',
        acid: '#F5E642',
        card: 'rgb(var(--color-card-rgb) / <alpha-value>)',
      },
      fontFamily: {
        display: ['"Archivo Black"', 'Impact', 'sans-serif'],
        sans: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        brutal: '4px 4px 0 0 rgb(var(--color-ink-rgb))',
        'brutal-sm': '3px 3px 0 0 rgb(var(--color-ink-rgb))',
        'brutal-lg': '6px 6px 0 0 rgb(var(--color-ink-rgb))',
        none: 'none',
      },
      letterSpacing: { tightest: '-0.04em' },
    },
  },
  plugins: [],
}
