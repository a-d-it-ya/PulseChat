/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        pulse: {
          bg: '#0a0d14',
          card: '#0f141f',
          surface: '#151b29',
          border: '#1f293d',
          hover: '#26334d',
          accent: '#00f0ff',
          accentGlow: 'rgba(0, 240, 255, 0.15)',
          blue: '#0070f3',
          purple: '#8a2be2',
          magenta: '#ff007f',
          green: '#00ff88',
          yellow: '#ffd700',
          red: '#ff3344',
          text: '#e2e8f0',
          muted: '#8e9bb0'
        }
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', '"Liberation Mono"', '"Courier New"', 'monospace'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif']
      }
    },
  },
  plugins: [],
}
