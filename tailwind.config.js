/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#171b23',
        ink: '#f4f7fb',
        muted: '#aeb8c8',
        line: '#27303d',
        action: '#2f6df6',
      },
      borderRadius: {
        panel: '8px',
      },
    },
  },
};
