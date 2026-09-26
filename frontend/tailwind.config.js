/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // LES GRIS SONT RÉGLABLES (2.12.194, Charles : « trop de bleu, j'avais
        // parlé de gris très clair »). Les gris de Tailwind — slate et gray,
        // cinq mille six cents classes — sont bleutés. On ne réécrit pas cinq
        // mille classes : on redéfinit le défaut, et chaque nuance lit une
        // variable (index.css) que Configuration → Thèmes et couleurs bascule
        // entre « ardoise » (d'origine) et « neutre ».
        slate: Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
          .map(n => [n, `rgb(var(--gris-${n}) / <alpha-value>)`])),
        gray: Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
          .map(n => [n, `rgb(var(--gris-${n}) / <alpha-value>)`])),
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

        // ── ET LES RAYONS DE TAILWIND SONT RAMENÉS SUR L'ÉCHELLE ──────────
        //
        // L'échelle existait depuis des semaines et servait soixante et une
        // fois. Pendant ce temps, deux mille trois cents classes employaient
        // « rounded », « rounded-lg », « rounded-md », « rounded-xl » — huit
        // valeurs différentes, de 2 à 16 pixels, réparties au hasard de qui
        // écrivait. D'où des boutons pointus à côté de boutons ronds : ce
        // n'est pas un détail, c'est CE QUI FAIT qu'une application paraît
        // assemblée plutôt qu'aboutie.
        //
        // Les réécrire une à une, c'est deux mille trois cents occasions de se
        // tromper. On redéfinit donc les noms de Tailwind eux-mêmes : tout ce
        // qui est écrit aujourd'hui, et tout ce qui s'écrira demain, tombe sur
        // l'échelle sans que personne ait à y penser. Trois rayons dans toute
        // l'application, et le défaut est correct.
        DEFAULT: '8px',    // rounded
        sm:      '8px',
        md:      '8px',
        lg:      '8px',    // les boutons et les champs
        xl:      '14px',   // les cartes
        '2xl':   '14px',
        '3xl':   '22px',
        full:    '9999px', // les pastilles rondes, et elles seules
      },
      // ─── L'ÉCHELLE TYPOGRAPHIQUE ────────────────────────────────────────
      //
      // Dix-neuf tailles cohabitaient : douze écrites au pixel (9, 9,5, 10,
      // 10,5, 11, 11,5, 12, 12,5, 13, 15, 16, 17) et les sept de Tailwind,
      // employées deux mille cinq cents fois. Une même information n'avait
      // donc pas la même taille selon l'écran qui l'affichait.
      //
      // Six degrés suffisent, et chacun a un emploi :
      //   10 — la mention, la légende, ce qu'on ne lit que si on cherche
      //   11 — l'étiquette d'un champ, l'en-tête d'une colonne
      //   12 — le second plan : compteurs, aides, précisions
      //   13 — LE CORPS. Tout ce qui se lit vraiment.
      //   15 — le titre d'une carte, d'une section
      //   17 — le titre d'un écran, et il n'y en a qu'un
      //
      // Les noms de Tailwind y tombent aussi : « text-sm » vaut désormais 13,
      // comme le corps, et non quatorze. Une seule échelle, deux façons de
      // l'écrire.
      fontSize: {
        xs:      ['11px', '1.45'],
        sm:      ['13px', '1.5'],
        base:    ['15px', '1.55'],
        lg:      ['17px', '1.35'],
        xl:      ['21px', '1.25'],
        '2xl':   ['27px', '1.2'],
        '3xl':   ['34px', '1.15'],
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
