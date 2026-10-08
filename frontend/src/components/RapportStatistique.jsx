/**
 * LE RAPPORT STATISTIQUE, FEUILLE DE PILOTAGE (Charles, 8 octobre 2026 :
 * « j'aimerais que ce rapport soit une des feuilles de pilotage — c'est super
 * important »). La pièce d'Éditions (`cout-formations`), lue ici à l'écran :
 * l'année, les inscrits prévus des sections qui n'en ont pas encore, la pièce
 * entière, et l'impression par l'aperçu commun (PDF A4 paysage du serveur).
 * Un seul calcul : c'est la route d'Éditions qui la compose.
 */
import { useEffect, useState } from 'react';
import { IconSend, IconRefresh } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { ouvrirApercu } from '../lib/apercu.js';
import InscritsPrevus from './InscritsPrevus.jsx';

export default function RapportStatistique() {
  const [annee, setAnnee] = useState(getAnnee());
  const [annees, setAnnees] = useState([]);
  const [doc, setDoc] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [tour, setTour] = useState(0);

  useEffect(() => {
    fetch('/api/annees', { headers: authHeaders() }).then(r => (r.ok ? r.json() : []))
      .then(l => setAnnees((Array.isArray(l) ? l : []).map(a => a.code).filter(Boolean))).catch(() => {});
  }, []);
  useEffect(() => {
    let vivant = true;
    setEnCours(true); setErreur(null);
    fetch('/api/rapports/cout-formations/document', { method: 'POST', headers: authHeaders({ 'X-Annee': annee }), body: JSON.stringify({ annee }) })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); if (vivant) setDoc(j); })
      .catch(e => { if (vivant) setErreur(e.message); })
      .finally(() => { if (vivant) setEnCours(false); });
    return () => { vivant = false; };
  }, [annee, tour]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={annee} onChange={e => setAnnee(e.target.value)} className="controle" title="Année académique">
          {[...new Set([annee, ...annees])].map(a => <option key={a}>{a}</option>)}
        </select>
        <button type="button" className="bouton controle inline-flex items-center gap-1.5" onClick={() => setTour(t => t + 1)} disabled={enCours}
          title="Recalculer avec les données du moment">
          <IconRefresh size={15} /> {enCours ? 'Calcul…' : 'Recalculer'}</button>
        <span className="flex-1" />
        <button type="button" className="bouton-sortir controle inline-flex items-center gap-1.5" disabled={!doc?.html}
          onClick={() => ouvrirApercu({ html: doc.html, titre: doc.titre, nomFichier: doc.nom, envoiPossible: false, pdf: { orientation: 'paysage' } })}>
          <IconSend size={15} /> Imprimer ou enregistrer en PDF</button>
      </div>
      <div className="carte-plate">
        <InscritsPrevus replie annee={annee} onEnregistre={() => setTour(t => t + 1)} />
      </div>
      {erreur && <div className="bloc-etat px-3 py-2 text-[13px]" data-etat="corriger">{erreur}</div>}
      {doc?.html && (
        <iframe aria-label="Rapport statistique" srcDoc={doc.html}
          className="w-full bg-white rounded-carte border border-slate-200" style={{ height: 'calc(100vh - 16rem)', minHeight: '36rem' }} />)}
    </div>
  );
}
