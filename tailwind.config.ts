import typography from '@tailwindcss/typography';
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: [
          'Geist Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace',
        ],
        sans: [
          'Geist', 'Inter', 'system-ui', '-apple-system', 'sans-serif',
        ],
      },
    },
  },
  plugins: [typography],
} satisfies Config;
