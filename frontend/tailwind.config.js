/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        tact: {
          void: '#0a0c0a',
          ink: '#101410',
          panel: '#161b16',
          steel: '#1e261e',
          rim: '#2a332a',
          mute: '#8a9480',
          sand: '#c4b896',
          fog: '#d8d4c4',
          gold: '#e8b84a',
          flare: '#f5c842',
          olive: '#6b7c3a',
          moss: '#3d4a28',
          blood: '#c23b2a',
          signal: '#4a9e6e',
        },
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'Impact', 'sans-serif'],
        hud: ['Rajdhani', 'Segoe UI', 'sans-serif'],
        mono: ['"Share Tech Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        panel: '0 0 0 1px rgba(232, 184, 74, 0.12), 0 18px 40px rgba(0, 0, 0, 0.45)',
        glow: '0 0 24px rgba(232, 184, 74, 0.18)',
      },
      backgroundImage: {
        'tact-grid':
          'linear-gradient(rgba(232,184,74,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(232,184,74,0.03) 1px, transparent 1px)',
        'tact-wash':
          'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(107,124,58,0.22), transparent 55%), radial-gradient(ellipse 60% 40% at 100% 100%, rgba(232,184,74,0.08), transparent 50%)',
      },
      backgroundSize: {
        grid: '48px 48px',
      },
      keyframes: {
        'scan-line': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-gold': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(232, 184, 74, 0.35)' },
          '50%': { boxShadow: '0 0 0 8px rgba(232, 184, 74, 0)' },
        },
      },
      animation: {
        scan: 'scan-line 8s linear infinite',
        'fade-up': 'fade-up 0.45s ease-out both',
        'pulse-gold': 'pulse-gold 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
