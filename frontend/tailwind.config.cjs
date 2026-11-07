/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F5F0E6',
        ink: '#111111',
        lime: '#C6FF36',
        cobalt: '#3155FF',
        tang: '#FF6633',
        bubble: '#FF58A8',
        acid: '#F5E642',
      },
      fontFamily: {
        display: ['"Archivo Black"', 'Impact', 'sans-serif'],
        sans: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        brutal: '4px 4px 0 0 #111111',
        'brutal-sm': '3px 3px 0 0 #111111',
        'brutal-lg': '6px 6px 0 0 #111111',
        none: 'none',
      },
      letterSpacing: { tightest: '-0.04em' },
    },
  },
  plugins: [],
}
