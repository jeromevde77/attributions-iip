import { useEffect, useState } from 'react';
import { IconClipboardPlus } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Fenetre } from './ui.jsx';

/**
 * CONFIER UNE TÂCHE — SANS PASSER PAR UNE RÉUNION.
 *
 * Le modèle le permettait depuis le début : `reunion_id` est facultatif sur la
 * table `tache`. Mais le seul écran qui créait des tâches était celui d'une
 * réunion, si bien qu'une consigne donnée dans un couloir n'avait nulle part
 * où aller — et « je te l'avais demandé » ne se vérifie pas.
 *
 * On confie donc une tâche d'ici, en trois champs. Elle rejoint le même
 * registre : elle apparaît dans « Ce qui m'attend » de la personne et dans
 * « Ce que j'ai confié » de celui qui la donne, exactement comme une action
 * décidée en séance. Une réunion pourra la reprendre plus tard ; l'inverse
 * n'était pas possible.
 *
 * UNE PERSONNE, PAS UN TEXTE LIBRE. « Voir avec le secrétariat » n'engage
 * personne, et trois mois plus tard la tâche est toujours là. On choisit donc
 * quelqu'un — qu'il ait un compte Lucie ou non, le personnel enseignant n'en a
 * pas — ou, à défaut, un rôle, qui reste un destinataire identifiable.
 */
export default function ConfierTache({ onClose, onCree }) {
  const [personnes, setPersonnes] = useState(null);
  const [form, setForm] = useState({
    titre: '', detail: '', responsable: '', echeance: '', priorite: 1,
  });
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    fetch('/api/reunions/personnes', { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : []))
      .then(l => setPersonnes(Array.isArray(l) ? l : []))
      .catch(() => setPersonnes([]));
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function confier() {
    if (!form.titre.trim() || !form.responsable) return;
    setEnCours(true); setErreur(null);
    try {
      // La clé porte sa nature : « u: » un compte, « p: » une fiche de
      // personnel. C'est la convention de la table d'équipage, on la suit
      // plutôt que d'en inventer une seconde.
      const [genre, id] = form.responsable.split(':');
      const rep = await fetch('/api/reunions/taches', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          titre: form.titre.trim(),
          detail: form.detail.trim() || null,
          responsable_user_id: genre === 'u' ? Number(id) : null,
          responsable_professeur_id: genre === 'p' ? Number(id) : null,
          echeance: form.echeance || null,
          priorite: Number(form.priorite),
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

  const pret = form.titre.trim() && form.responsable;

  return (
    <Fenetre icone={IconClipboardPlus} large="petite" onFermer={onClose}
      titre="Confier une tâche"
      sous="Elle rejoint le suivi, sans passer par une réunion">
      <div className="p-5 space-y-3">
        <label className="block text-xs">
          <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
            Quoi
          </span>
          <input autoFocus value={form.titre} className="controle w-full"
            placeholder="Ce qu'il y a à faire"
            onChange={e => set('titre', e.target.value)} />
        </label>

        <label className="block text-xs">
          <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
            Qui
          </span>
          <select value={form.responsable} className="controle w-full"
            onChange={e => set('responsable', e.target.value)}>
            <option value="">— choisir une personne —</option>
            {(personnes || []).map(p => (
              <option key={p.cle} value={p.cle}>
                {p.nom}{p.statut ? ` · ${p.statut}` : p.role ? ` · ${p.role}` : ''}
              </option>
            ))}
          </select>
          {personnes && !personnes.length && (
            <span className="block text-[10px] text-amber-700 mt-1">
              Aucune personne connue : la liste vient du personnel et des comptes actifs.
            </span>
          )}
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
          <textarea rows={3} value={form.detail}
            placeholder="Le contexte, ce qui est attendu, où trouver la matière"
            className="w-full border border-slate-300 rounded-champ px-2 py-1.5 text-[13px]"
            onChange={e => set('detail', e.target.value)} />
        </label>

        {erreur && <div className="text-[12px] text-rose-700">{erreur}</div>}

        <div className="flex gap-2 pt-1">
          <button onClick={confier} disabled={!pret || enCours}
            className="bouton bouton-fort disabled:opacity-40">
            Confier
          </button>
          <button onClick={onClose} className="bouton ml-auto">Annuler</button>
        </div>
      </div>
    </Fenetre>
  );
}
