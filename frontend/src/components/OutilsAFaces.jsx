import { Suspense, useState } from 'react';
import { Fenetre } from './ui.jsx';

/**
 * DES OUTILS QUI ONT QUITTÉ CONFIGURATION (lot 4 du plan du 26 septembre,
 * Charles, 2 octobre 2026). Ce ne sont pas des réglages : ils vivent là où
 * l'on s'en sert, dans une seule fenêtre à faces — une entrée de rail, pas
 * quatre icônes de plus.
 *
 * faces : [{ cle, label, rendu }] ; rendu est un élément (souvent paresseux).
 */
export default function OutilsAFaces({ icone, titre, sous, faces, faceInitiale, onFermer }) {
  const [face, setFace] = useState(faces.some(f => f.cle === faceInitiale) ? faceInitiale : faces[0].cle);
  const courante = faces.find(f => f.cle === face) || faces[0];
  return (
    <Fenetre icone={icone} titre={titre} sous={sous} large="pleine" hauteurFixe onFermer={onFermer}>
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 mb-3 -mt-1">
        {faces.map(f => (
          <button key={f.cle} type="button" onClick={() => setFace(f.cle)}
            className={`onglet-page ${f.cle === face ? 'onglet-page-actif' : ''}`}>{f.label}</button>
        ))}
      </div>
      <Suspense fallback={<p className="text-sm text-slate-400">Chargement…</p>}>
        <div key={courante.cle}>{courante.rendu}</div>
      </Suspense>
    </Fenetre>
  );
}
