import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0e27',
        surface: '#131625',
        'surface-secondary': '#1a1f3a',
        border: '#2d2e44',
        text: {
          primary: '#f5f5f5',
          secondary: '#b4b4b8',
          tertiary: '#717175',
        },
        accent: {
          primary: '#0070f3',
          'primary-dark': '#0051cc',
          secondary: '#7c3aed',
        },
      },
      fontFamily: {
        sans: ['system-ui', 'sans-serif'],
        mono: ['Monaco', 'Menlo', 'Courier New', 'monospace'],
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      },
    },
  },
  plugins: [],
};

export default config;
