/**
 * LA GRILLE DE PRÉSENCE, À SORTIR (28 octobre 2026 : « par cours puis par UE,
 * car la vérificatrice demande les présences dans l'UE »). Dans l'onglet
 * Présences de Mes cours : la période (toute l'année si rien n'est choisi), la
 * grille du cours, et celle de l'UE pour qui en a le droit — le serveur le dit
 * (`grilleUE`), l'écran ne devine pas les rôles. PDF par l'aperçu commun, ou
 * Excel.
 */
import { useState } from 'react';
import { IconTable, IconFileSpreadsheet } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { ouvrirApercu } from '../lib/apercu.js';

export default function GrillePresence({ coursCode, ueNum, annee, grilleUE = false }) {
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [occupe, setOccupe] = useState(null);
  const [erreur, setErreur] = useState(null);
  const chemin = ue => (ue ? `/api/mes-cours/ue/${ueNum}/grille-presences` : `/api/mes-cours/${encodeURIComponent(coursCode)}/grille-presences`);
  const params = format => `?annee=${encodeURIComponent(annee)}&format=${format}${du ? `&du=${du}` : ''}${au ? `&au=${au}` : ''}`;

  const apercu = async ue => {
    setOccupe(ue ? 'ue' : 'cours'); setErreur(null);
    try {
      const r = await fetch(chemin(ue) + params('html'), { headers: authHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      ouvrirApercu({ html: j.html, titre: ue ? `Grille de présence — UE ${ueNum}` : `Grille de présence — ${coursCode}`,
        nomFichier: j.nom, envoiPossible: false, pdf: { orientation: 'paysage' } });
    } catch (e) { setErreur(e.message); } finally { setOccupe(null); }
  };
  const excel = async ue => {
    setOccupe(ue ? 'ue-x' : 'cours-x'); setErreur(null);
    try {
      const r = await fetch(chemin(ue) + params('xlsx'), { headers: authHeaders() });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `Erreur ${r.status}`); }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await r.blob());
      a.download = `${ue ? `Presences_UE${ueNum}` : `Presences_${coursCode}`}_${annee}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { setErreur(e.message); } finally { setOccupe(null); }
  };

  return (
    <div className="carte px-3 py-2 flex flex-wrap items-center gap-2">
      <IconTable size={17} className="text-iip-blue" />
      <span className="text-sm font-semibold">Grille de présence</span>
      <label className="text-second text-slate-500 inline-flex items-center gap-1">du
        <input type="date" value={du} onChange={e => setDu(e.target.value)} className="controle border border-slate-300 rounded-champ bg-white text-sm" />
      </label>
      <label className="text-second text-slate-500 inline-flex items-center gap-1">au
        <input type="date" value={au} onChange={e => setAu(e.target.value)} className="controle border border-slate-300 rounded-champ bg-white text-sm" />
      </label>
      {!du && !au && <span className="text-second text-slate-400">toute l’année</span>}
      <span className="ml-auto" />
      <button type="button" className="bouton bouton-sortir" disabled={!!occupe} onClick={() => apercu(false)}>
        {occupe === 'cours' ? '…' : 'Ce cours'}</button>
      <button type="button" className="bouton" disabled={!!occupe} onClick={() => excel(false)} title="Ce cours, en Excel">
        <IconFileSpreadsheet size={16} /> Excel</button>
      {grilleUE && <>
        <button type="button" className="bouton bouton-sortir" disabled={!!occupe} onClick={() => apercu(true)}
          title="Toutes les séances de tous les cours de l'UE, et le récapitulatif des heures par cours">
          {occupe === 'ue' ? '…' : `Toute l’UE ${ueNum}`}</button>
        <button type="button" className="bouton" disabled={!!occupe} onClick={() => excel(true)} title={`L'UE ${ueNum}, en Excel`}>
          <IconFileSpreadsheet size={16} /> Excel UE</button>
      </>}
      {erreur && <span className="basis-full text-second" style={{ color: 'var(--c-refuse)' }}>{erreur}</span>}
    </div>
  );
}
