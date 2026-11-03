/* L'ÉTAPE 0 : LIRE LE DOSSIER PÉDAGOGIQUE AVANT DE CROISER (3.5.099, Charles : « je voudrais qu'il soit en étape 0, puis
 * cliquable au besoin »). Le texte du dossier de l'unité, en lecture : finalités, capacités préalables, acquis et degré de
 * maîtrise, programme par activité. Les mêmes rubriques que la fiche de l'UE (Configuration → Unités et cours), découpées par
 * `rubriquesDuDossier` — une lecture, pas une seconde copie. La fiche complète s'ouvre par le bouton « Dossier pédagogique ». */
import { useEffect, useState } from 'react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { rubriquesDuDossier, decouperProgramme } from '../lib/texteDossier.js';
import EditeurRubrique from './EditeurRubrique.jsx';

export default function ApercuDossier({ ueNum, onSuivante }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    setD(null);
    fetch(`/api/ref/ue/${ueNum}?annee=${encodeURIComponent(getAnnee())}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : {})).then(setD).catch(() => setD({}));
  }, [ueNum]);
  if (!d) return <p className="text-sm text-slate-400">Chargement du dossier…</p>;
  if (!d.ue_dp) return <p className="text-sm text-slate-500">Aucun dossier pédagogique importé pour cette unité cette année.</p>;
  const cours = (d.cours || []).filter(c => String(c.ct_pp || '').toUpperCase() !== 'Z');
  const R = rubriquesDuDossier(d.ue_dp || '', cours.map(c => c.cours_nom));
  const P = decouperProgramme(R['Programme'] || '', cours.map(c => c.cours_nom).filter(Boolean));
  const lire = (k, titre) => (R[k] ? <EditeurRubrique key={k} titre={titre} texte={R[k]} lecture /> : null);
  return (
    <div className="space-y-2">
      {lire('Finalités', '1. Finalités de l’unité')}
      {lire('Capacités préalables', '2. Capacités préalables requises')}
      {lire("Acquis d'apprentissage", '3. Acquis d’apprentissage')}
      {lire('Degré de maîtrise', 'Degré de maîtrise')}
      {(P.preambule || P.cours.length > 0) && <div className="intertitre mt-3">4. Programme — par activité d’enseignement</div>}
      {P.preambule && <EditeurRubrique titre="Introduction commune à tous les cours" texte={P.preambule} lecture />}
      {P.cours.map(c => <EditeurRubrique key={c.nom} titre={c.nom} texte={c.texte} lecture />)}
      {onSuivante && <div className="pt-2"><button type="button" className="bouton bouton-fort" onClick={onSuivante}>Étape suivante : croiser les acquis et le programme</button></div>}
    </div>);
}
