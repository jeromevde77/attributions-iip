/* MES ABSENCES — LE CERTIFICAT MÉDICAL (3.5.126). L'étudiant dépose son certificat (PDF ou photo) et les dates de son absence.
 * Le dépôt attend le relevé de Lucie (quelques secondes), qui le juge : remis dans les 3 jours ouvrables après le début de
 * l'absence, ses absences de la période sont justifiées ; au-delà, la direction décide. Serveur : portail/src/serveur.js
 * (/api/portail/certificats, /api/portail/certificat) ; Lucie : backend/src/lib/certificatMedical.js. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { IconUpload, IconCheck, IconClock, IconAlertTriangle } from '@tabler/icons-react';

const jourFr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const auj = () => new Date().toISOString().slice(0, 10);

export default function MesAbsences({ appel, jeton, onErreur }) {
  const [p, setP] = useState(null);
  const [du, setDu] = useState(auj());
  const [au, setAu] = useState(auj());
  const [fichier, setFichier] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const champ = useRef(null);
  const charger = useCallback(() => appel('GET', '/certificats').then(setP).catch(onErreur), [appel, onErreur]);
  useEffect(() => { charger(); }, [charger]);
  // Un dépôt attend le relevé de l'école : on relit jusqu'à ce qu'il soit passé.
  useEffect(() => { if (!p?.certificats?.some(c => !c.releve_le)) return undefined; const t = setTimeout(charger, 4000); return () => clearTimeout(t); }, [p, charger]);

  async function deposer() {
    if (!fichier) return;
    if (fichier.size > 10 * 1024 * 1024) { onErreur(new Error('Fichier trop lourd (10 Mo au plus).')); return; }
    setEnvoi(true);
    try {
      const tk = jeton();
      const res = await fetch(`/api/portail/certificat?du=${du}&au=${au}&nom=${encodeURIComponent(fichier.name)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream', ...(tk ? { Authorization: `Bearer ${tk}` } : {}) },
        body: fichier, credentials: 'same-origin' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || (res.status === 413 ? 'Fichier trop lourd (10 Mo au plus).' : `Erreur ${res.status}`));
      setFichier(null); if (champ.current) champ.current.value = '';
      charger();
    } catch (e) { onErreur(e); } finally { setEnvoi(false); }
  }

  if (!p) return <p className="text-sm text-slate-500">Chargement…</p>;
  return (
    <div className="space-y-4">
      <div className="carte p-4 space-y-3">
        <h2 className="text-base font-semibold text-iip-texte m-0">Déposer un certificat médical</h2>
        <p className="text-sm text-slate-600 m-0">
          Remettez votre certificat au plus tard <b>{p.delai} jours ouvrables</b> après le premier jour de votre absence : vos absences de
          la période seront alors justifiées. Après ce délai, la direction décide.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-slate-600"><div className="mb-1">Absent du</div>
            <input type="date" className="controle" value={du} max={auj()} onChange={e => { setDu(e.target.value); if (au < e.target.value) setAu(e.target.value); }} /></label>
          <label className="text-sm text-slate-600"><div className="mb-1">au</div>
            <input type="date" className="controle" value={au} min={du} onChange={e => setAu(e.target.value)} /></label>
          <input ref={champ} type="file" className="hidden" accept="application/pdf,image/jpeg,image/png" onChange={e => setFichier(e.target.files?.[0] || null)} />
          <button type="button" className="bouton inline-flex items-center gap-1.5" onClick={() => champ.current?.click()}>
            <IconUpload size={15} /> {fichier ? fichier.name : 'Choisir le certificat (PDF, photo)'}</button>
          <button type="button" className="bouton bouton-fort" disabled={!fichier || envoi} onClick={deposer}>{envoi ? 'Envoi…' : 'Envoyer'}</button>
        </div>
      </div>

      {p.certificats?.length > 0 && (
        <div className="carte divide-y divide-slate-100">
          {p.certificats.map(c => {
            const etat = !c.releve_le ? 'attente' : c.erreur ? 'refus' : 'recu';
            return (
              <div key={c.id} className="px-4 py-3 flex items-start gap-3 text-sm">
                <span className={`flex-none mt-0.5 ${etat === 'recu' ? 'text-[color:var(--c-reussi)]' : etat === 'refus' ? 'text-[color:var(--c-refuse)]' : 'text-slate-400'}`}>
                  {etat === 'recu' ? <IconCheck size={18} /> : etat === 'refus' ? <IconAlertTriangle size={18} /> : <IconClock size={18} />}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">Absence du {jourFr(c.du)} au {jourFr(c.au)}</div>
                  <div className="text-xs text-slate-500">déposé le {jourFr(c.cree_le)} · {c.nom}</div>
                  <div className="text-xs mt-0.5">{etat === 'attente' ? 'En route vers l’école…' : c.erreur || c.resultat || 'Reçu par l’école.'}</div>
                </div>
              </div>);
          })}
        </div>)}
    </div>
  );
}
