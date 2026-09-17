import { useEffect, useMemo, useState } from 'react';
import { IconClipboardPlus, IconSearch, IconX } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { Fenetre } from './ui.jsx';

/**
 * CONFIER UNE TÂCHE — SANS PASSER PAR UNE RÉUNION, ET À PLUSIEURS.
 *
 * Le modèle le permettait depuis le début : `reunion_id` est facultatif sur la
 * table `tache`, et `tache_personne` porte un ÉQUIPAGE, pas un responsable
 * unique. Mais le seul écran qui créait des tâches était celui d'une réunion,
 * si bien qu'une consigne donnée dans un couloir n'avait nulle part où aller —
 * et « je te l'avais demandé » ne se vérifie pas.
 *
 * UNE PERSONNE, PAS UN TEXTE LIBRE. « Voir avec le secrétariat » n'engage
 * personne, et trois mois plus tard la tâche est toujours là. On choisit donc
 * des personnes — qu'elles aient un compte Lucie ou non, le personnel
 * enseignant n'en a pas.
 *
 * LA SECTION D'UN ENSEIGNANT NE S'ÉCRIT NULLE PART : elle se déduit de ce
 * qu'il enseigne cette année, et il peut en porter deux. Le filtre travaille
 * donc sur une liste, et « aucune section » est un cas normal — le secrétariat
 * et la direction n'en ont pas.
 */
export default function ConfierTache({ onClose, onCree }) {
  const annee = getAnnee();
  const [personnes, setPersonnes] = useState(null);
  const [recherche, setRecherche] = useState('');
  const [section, setSection] = useState('');
  const [choisies, setChoisies] = useState(() => new Set());
  const [form, setForm] = useState({
    titre: '', detail: '', echeance: '', priorite: 1,
  });
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    fetch(`/api/reunions/personnes?annee=${encodeURIComponent(annee)}`,
      { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : []))
      .then(l => setPersonnes(Array.isArray(l) ? l : []))
      .catch(() => setPersonnes([]));
    // eslint-disable-next-line
  }, []);

  const sections = useMemo(() => [...new Set(
    (personnes || []).flatMap(p => p.sections || []))].sort(), [personnes]);

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return (personnes || []).filter(p => {
      if (section && !(p.sections || []).includes(section)) return false;
      return !q || p.nom.toLowerCase().includes(q);
    });
  }, [personnes, recherche, section]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const basculer = cle => setChoisies(s => {
    const n = new Set(s);
    if (n.has(cle)) n.delete(cle); else n.add(cle);
    return n;
  });

  async function confier() {
    if (!form.titre.trim() || !choisies.size) return;
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/reunions/taches', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          titre: form.titre.trim(),
          detail: form.detail.trim() || null,
          echeance: form.echeance || null,
          priorite: Number(form.priorite),
          // L'ÉQUIPAGE, DANS L'ORDRE DE SÉLECTION. Le premier nommé est celui
          // qui répond de la tâche — c'est la convention de la table, on la
          // suit plutôt que d'en inventer une seconde.
          responsables: [...choisies],
          // Pas de réunion : c'est tout l'objet de cet écran.
          reunion_id: null,
        }),
      });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error || 'Erreur');
      onCree?.(j);
      onClose?.();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const pret = form.titre.trim() && choisies.size;

  return (
    /* L'ACTION VIT DANS LE PIED, JAMAIS DANS LE CONTENU.
       La liste des personnes défile ; un bouton posé dessous descend avec
       elle, et il faut dérouler tout le personnel pour valider trois cases
       cochées en haut. */
    <Fenetre icone={IconClipboardPlus} large="grande" onFermer={onClose}
      titre="Confier une tâche"
      sous="Elle rejoint le suivi, sans passer par une réunion"
      pied={<>
        <button onClick={confier} disabled={!pret || enCours}
          className="bouton bouton-fort disabled:opacity-40">
          {choisies.size > 1 ? `Confier à ${choisies.size} personnes` : 'Confier'}
        </button>
        {!pret && (
          <span className="text-[12px] text-amber-800">
            {!form.titre.trim() ? "Écris ce qu'il y a à faire." : 'Coche au moins une personne.'}
          </span>
        )}
        <button onClick={onClose} className="bouton ml-auto">Annuler</button>
      </>}>
      <div className="flex-1 min-h-0 flex">

        {/* ── À QUI ─────────────────────────────────────────── */}
        <div className="w-[340px] border-r border-slate-200 flex flex-col min-h-0">
          <div className="flex-none p-3 space-y-2 border-b border-slate-100">
            <div className="text-[13px] font-semibold text-iip-blue">À qui</div>
            <select value={section} onChange={e => setSection(e.target.value)}
              className="controle w-full text-[13px]">
              <option value="">Toutes les sections</option>
              {sections.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="relative">
              <IconSearch size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={recherche} onChange={e => setRecherche(e.target.value)}
                placeholder="Un nom…" className="controle w-full pl-8 text-[13px]" />
            </div>
          </div>

          <div className="flex-1 overflow-auto min-h-0">
            {!personnes ? (
              <div className="p-4 text-[13px] text-slate-400">Chargement…</div>
            ) : !visibles.length ? (
              <div className="p-4 text-[13px] text-slate-400">
                Personne ne correspond à ce filtre.
              </div>
            ) : visibles.map(p => (
              <label key={p.cle}
                className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer
                            border-b border-slate-50 ${
                              choisies.has(p.cle) ? 'bg-iip-blue/5' : ''}`}>
                <input type="checkbox" checked={choisies.has(p.cle)}
                  onChange={() => basculer(p.cle)}
                  className="w-4 h-4 accent-iip-blue" />
                <span className="flex-1 min-w-0">
                  <span className="text-[13px] font-medium block truncate">{p.nom}</span>
                  <span className="block text-[11px] text-slate-500 truncate">
                    {(p.sections || []).join(' · ')
                      || p.role || p.statut || 'sans section'}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <div className="flex-none px-3 py-2 border-t border-slate-100
                          text-[12px] text-slate-600 flex items-center gap-2">
            <span className="flex-1">
              {choisies.size
                ? `${choisies.size} personne(s) — la première répond de la tâche`
                : 'Personne sélectionnée'}
            </span>
            {choisies.size > 0 && (
              <button onClick={() => setChoisies(new Set())}
                className="text-slate-400 hover:text-iip-blue" title="Tout décocher">
                <IconX size={14} />
              </button>
            )}
          </div>
        </div>

        {/* ── QUOI ──────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 p-5 space-y-3 overflow-auto">
          <label className="block text-xs">
            <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Quoi
            </span>
            <input autoFocus value={form.titre} className="controle w-full"
              placeholder="Ce qu'il y a à faire"
              onChange={e => set('titre', e.target.value)} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs">
              <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Pour quand <span className="font-normal normal-case">(facultatif)</span>
              </span>
              <input type="date" value={form.echeance} className="controle w-full"
                onChange={e => set('echeance', e.target.value)} />
            </label>
            <label className="block text-xs">
              <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Priorité
              </span>
              <select value={form.priorite} className="controle w-full"
                onChange={e => set('priorite', e.target.value)}>
                <option value={0}>Basse</option>
                <option value={1}>Normale</option>
                <option value={2}>Haute</option>
              </select>
            </label>
          </div>

          <label className="block text-xs">
            <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Précision <span className="font-normal normal-case">(facultatif)</span>
            </span>
            <textarea rows={6} value={form.detail}
              placeholder="Le contexte, ce qui est attendu, où trouver la matière"
              className="w-full border border-slate-300 rounded-champ px-2 py-1.5 text-[13px]"
              onChange={e => set('detail', e.target.value)} />
          </label>

          {erreur && <div className="text-[12px] text-rose-700">{erreur}</div>}


        </div>
      </div>
    </Fenetre>
  );
}
