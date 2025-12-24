/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{svelte,js,ts}'],
  theme: {
    extend: {
      colors: {
        sky: {
          950: '#0b1f33'
        }
      }
    }
  },
  plugins: []
};
