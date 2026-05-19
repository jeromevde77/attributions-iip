/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        iip: {
          gold:   '#1B2B4B',   // bleu marine — titres, header, boutons principaux
          amber:  '#163A6B',   // bleu marine foncé — hover
          mauve:  '#00AACC',   // turquoise — badges, accents
          orange: '#C0392B'    // rouge — boutons destructifs, déconnexion
        }
      },
      fontFamily: {
        sans:  ['Aptos', 'Arial', 'Helvetica', 'sans-serif'],
        title: ['Aptos', 'Arial', 'Helvetica', 'sans-serif']
      }
    }
  },
  plugins: []
};
