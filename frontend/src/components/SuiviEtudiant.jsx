import { useEffect, useRef, useState } from 'react';
import { IconLock, IconNotes, IconFileText, IconPaperclip, IconTrash,
         IconDownload, IconAlertTriangle } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * LE DOSSIER DE SUIVI — l'onglet confidentiel de la fiche étudiant.
 *
 * Notes de suivi, rapports, documents joints : signés, datés, et réservés par
 * LE SERVEUR aux enseignants de l'étudiant, à la coordination de sa section
 * et à la direction. L'écran ne décide rien : si la porte est fermée, il le
 * dit — il ne cache pas un onglet en espérant que personne ne trouve l'URL.
 */
const TYPES = {
  note:     { libelle: 'Note de suivi', cls: 'bg-sky-100 text-sky-800' },
  rapport:  { libelle: 'Rapport',       cls: 'bg-violet-100 text-violet-800' },
  document: { libelle: 'Document',      cls: 'bg-emerald-100 text-emerald-800' },
};

export default function SuiviEtudiant({ etudId }) {
  const [d, setD] = useState(null);
  const [refuse, setRefuse] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [type, setType] = useState('note');
  const [titre, setTitre] = useState('');
  const [texte, setTexte] = useState('');
  const [enCours, setEnCours] = useState(false);
  const fichierRef = useRef(null);

  async function charger() {
    setErreur(null);
    const r = await fetch(`/api/suivi-etudiant/${etudId}`, { headers: authHeaders() });
    const j = await r.json().catch(() => ({}));
    if (r.status === 403) { setRefuse(j.error || 'Dossier confidentiel.'); return; }
    if (!r.ok) { setErreur(j.error || 'Erreur'); return; }
    setD(j);
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [etudId]);

  async function ajouter() {
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch(`/api/suivi-etudiant/${etudId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ type, titre, texte }),
      });
      const j = await r.json();
      if (!r.ok) { setErreur(j.error || 'Erreur'); return; }
      setTitre(''); setTexte('');
      await charger();
    } finally { setEnCours(false); }
  }

  async function joindre(f) {
    if (!f) return;
    setEnCours(true); setErreur(null);
    try {
      const fd = new FormData();
      fd.append('fichier', f);
      const r = await fetch(`/api/suivi-etudiant/${etudId}/document`, {
        method: 'POST', headers: authHeaders(), body: fd,
      });
      const j = await r.json();
      if (!r.ok) { setErreur(j.error || 'Erreur'); return; }
      await charger();
    } finally { setEnCours(false); if (fichierRef.current) fichierRef.current.value = ''; }
  }

  async function effacer(n) {
    if (!confirm(`Effacer « ${n.titre || TYPES[n.type]?.libelle || 'cette note'} » ?\n\nL'effacement est définitif.`)) return;
    const r = await fetch(`/api/suivi-etudiant/${etudId}/${n.id}`, {
      method: 'DELETE', headers: authHeaders() });
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErreur(j.error || 'Refusé'); return; }
    await charger();
  }

  const fr = s => (s ? String(s).slice(0, 16).replace('T', ' ').split('-').length
    ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}` : s : '');

  if (refuse) return (
    <div className="p-5 flex items-start gap-2 text-[13px] text-slate-600">
      <IconLock size={16} className="flex-none mt-0.5 text-slate-400" />{refuse}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 border border-slate-200 rounded-carte px-3 py-2">
        <IconLock size={14} className="flex-none mt-0.5 text-slate-400" />
        <span>Dossier <b>confidentiel</b> : visible des seuls enseignants de cet étudiant,
          de la coordination de sa section et de la direction. Chaque note est signée et datée ;
          seuls son auteur et la direction peuvent l'effacer.</span>
      </div>

      {erreur && (
        <div className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-carte px-3 py-2 flex items-start gap-1.5">
          <IconAlertTriangle size={14} className="flex-none mt-0.5" />{erreur}
        </div>
      )}

      {/* ── Écrire ── */}
      <div className="carte p-3 space-y-2">
        <div className="flex items-center gap-3">
          <span className="text-[11px] uppercase tracking-wide text-slate-500">Ajouter au dossier</span>
          {['note', 'rapport'].map(t => (
            <label key={t} className="flex items-center gap-1.5 text-[13px] cursor-pointer">
              <input type="radio" name="type-suivi" checked={type === t} onChange={() => setType(t)} />
              {TYPES[t].libelle}
            </label>
          ))}
          <label className="ml-auto bouton text-[12px] cursor-pointer">
            <IconPaperclip size={14} /> Joindre un document
            <input ref={fichierRef} type="file" className="hidden"
              onChange={e => joindre(e.target.files?.[0])} />
          </label>
        </div>
        <input value={titre} onChange={e => setTitre(e.target.value)}
          placeholder="Titre (facultatif) — ex : Entretien du 3 octobre"
          className="controle text-[13px] w-full" />
        <textarea value={texte} onChange={e => setTexte(e.target.value)} rows={3}
          placeholder="La note — ce qui a été observé, dit, convenu…"
          className="controle text-[13px] w-full font-[inherit]" />
        <button onClick={ajouter} disabled={enCours || !texte.trim()}
          className="bouton bouton-fort disabled:opacity-40">
          {enCours ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      {/* ── Lire ── */}
      {!d ? (
        <p className="text-sm text-slate-400">Chargement…</p>
      ) : !d.notes.length ? (
        <p className="text-sm text-slate-400">Le dossier est vide.</p>
      ) : (
        <div className="carte overflow-hidden">
          {d.notes.map(n => (
            <div key={n.id} className="px-3 py-2.5 border-t border-slate-100 first:border-t-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${TYPES[n.type]?.cls || ''}`}>
                  {TYPES[n.type]?.libelle || n.type}
                </span>
                {n.titre && <b className="text-[13px] text-iip-blue">{n.titre}</b>}
                <span className="text-[11px] text-slate-400 ml-auto">
                  {n.cree_par || '—'}{n.cree_par_role ? ` (${n.cree_par_role})` : ''} · {fr(n.cree_le)}
                </span>
                {n.nom_fichier && (
                  <a href={`/api/suivi-etudiant/piece/${n.id}`} target="_blank" rel="noreferrer"
                    onClick={async e => {
                      e.preventDefault();
                      const r = await fetch(`/api/suivi-etudiant/piece/${n.id}`, { headers: authHeaders() });
                      if (!r.ok) return;
                      const b = await r.blob();
                      const url = URL.createObjectURL(b);
                      const a = document.createElement('a');
                      a.href = url; a.download = n.nom_fichier; a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="text-[12px] text-iip-blue inline-flex items-center gap-1">
                    <IconDownload size={13} /> {n.nom_fichier}
                  </a>
                )}
                {n.effacable && (
                  <button onClick={() => effacer(n)} title="Effacer (auteur ou direction)"
                    className="text-slate-300 hover:text-red-600">
                    <IconTrash size={14} />
                  </button>
                )}
              </div>
              {n.texte && (
                <p className="text-[13px] text-slate-700 whitespace-pre-wrap mt-1 mb-0">{n.texte}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
