module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        mania: {
          1: '#ff6b6b',
          2: '#4ecdc4',
          3: '#ffe66d',
          4: '#6a0572',
        }
      },
      fontFamily: {
        'mono': ['monospace'],
      }
    },
  },
  plugins: [],
}