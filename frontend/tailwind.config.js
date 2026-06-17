/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        iip: {
          // Noms historiques (conservés pour compatibilité avec l'existant) :
          gold:   '#1B2B4B',   // = bleu marine (titres, header, boutons principaux)
          amber:  '#163A6B',   // = bleu marine foncé (hover)
          mauve:  '#00AACC',   // = turquoise (badges, accents)
          orange: '#C0392B',   // = rouge (boutons destructifs, déconnexion)
          // Noms clairs (à privilégier désormais) :
          blue:      '#1B2B4B', // bleu marine principal
          'blue-dark': '#163A6B',
          'blue-soft': '#2E5C9E',
          turquoise: '#00AACC', // accent
          'turquoise-dark': '#0090ad',
          light:     '#E1ECF5', // fond bleu très clair
          danger:    '#C0392B'
        }
      },
      fontFamily: {
        sans:  ['Inter', 'Aptos', 'system-ui', 'Arial', 'sans-serif'],
        title: ['Inter', 'Aptos', 'system-ui', 'Arial', 'sans-serif']
      }
    }
  },
  plugins: []
};
