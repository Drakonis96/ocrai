module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './components/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx,js}',
    './utils/**/*.{ts,tsx,js}',
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          850: '#1e293b',
        },
      },
    },
  },
  plugins: [],
};
