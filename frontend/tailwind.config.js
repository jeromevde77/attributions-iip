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
      // ─── L'ÉCHELLE, ET RIEN EN DEHORS ───────────────────────────────────
      // Quatre rayons, trois élévations, une courbe. C'est cela — plus que les
      // couleurs — qui sépare un système d'un assemblage.
      borderRadius: {
        champ:   '8px',    // champs de saisie, boutons
        carte:   '14px',   // cartes, tableaux, encadrés
        fenetre: '22px',   // fenêtres, pastilles
        panneau: '26px',   // panneaux flottants (le rail)
      },
      boxShadow: {
        pose:     '0 1px 2px rgba(11,21,45,.06)',
        flottant: '0 20px 50px -18px rgba(11,21,45,.35)',
        dessus:   '0 30px 70px -20px rgba(11,21,45,.45)',
      },
      transitionTimingFunction: {
        ios: 'cubic-bezier(.32,.72,0,1)',
      },
      fontFamily: {
        sans:  ['Inter', 'Aptos', 'system-ui', 'Arial', 'sans-serif'],
        title: ['Inter', 'Aptos', 'system-ui', 'Arial', 'sans-serif']
      }
    }
  },
  plugins: []
};
