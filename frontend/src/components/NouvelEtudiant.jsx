import { useEffect, useState } from 'react';
import { IconUserPlus } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { Fenetre } from './ui.jsx';

/**
 * CRÉER UN ÉTUDIANT À LA MAIN.
 *
 * La route serveur existait depuis l'origine ; aucun écran ne l'appelait. Tout
 * entrait par l'import eCampus, ce qui va tant que le monde s'y conforme :
 * l'inscription tardive, le dossier repris d'un autre établissement, la
 * personne qui se présente au secrétariat un mardi de novembre n'avaient aucun
 * moyen d'entrer dans Lucie. Une fonction sans porte est une fonction qui
 * n'existe pas.
 *
 * ON NE DEMANDE QUE L'IDENTITÉ. Le programme se compose dans l'onglet Parcours,
 * où l'écran est fait pour cela ; empiler ici un choix d'unités donnerait un
 * troisième endroit où inscrire quelqu'un — et nous en avons déjà deux de trop.
 *
 * LE DOUBLON EST LE VRAI RISQUE. On ne trouve pas quelqu'un dans la liste, on
 * le recrée, et son parcours se coupe en deux — c'est précisément ce que nous
 * avons passé une journée à réparer pour TIM. Le serveur cherche donc avant
 * d'écrire, et rend la main plutôt que de créer en double.
 */
export default function NouvelEtudiant({ onClose, onCree }) {
  const [form, setForm] = useState({
    nom: '', prenom: '', titre: '', date_naissance: '', num_national: '',
    email_ecole: '', email_perso: '', gsm: '',
    adresse: '', cp: '', localite: '', section_rattachement: '',
  });
  const [sections, setSections] = useState([]);
  const [doublons, setDoublons] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : []))
      .then(l => setSections(Array.isArray(l) ? l : []))
      .catch(() => setSections([]));
  }, []);

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setDoublons(null); };
  const pret = form.nom.trim() && form.prenom.trim();

  async function creer(forcer = false) {
    if (!pret) return;
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/etudiants', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ ...form, forcer }),
      });
      const j = await rep.json();
      if (rep.status === 409) { setDoublons(j.candidats || []); return; }
      if (!rep.ok) throw new Error(j.error || 'Erreur');
      onCree?.(j.id);
      onClose?.();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const champ = (k, label, type = 'text', large = false) => (
    <label className={`block text-xs ${large ? 'col-span-2' : ''}`}>
      <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
        {label}
      </span>
      <input type={type} value={form[k]} className="controle w-full"
        onChange={e => set(k, e.target.value)} />
    </label>
  );

  return (
    <Fenetre icone={IconUserPlus} onFermer={onClose}
      titre="Nouvel étudiant"
      sous="Son identité — le programme se compose ensuite dans le Parcours"
      pied={<>
        <button onClick={() => creer(false)} disabled={!pret || enCours || !!doublons}
          className="bouton bouton-fort disabled:opacity-40">
          {enCours ? 'Création…' : "Créer l'étudiant"}
        </button>
        <button onClick={onClose} className="bouton ml-auto">Annuler</button>
      </>}>
      <div className="p-5 space-y-4 overflow-auto">

        <div className="grid grid-cols-2 gap-3">
          {champ('nom', 'Nom')}
          {champ('prenom', 'Prénom')}
          <label className="block text-xs">
            <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Titre
            </span>
            <select value={form.titre} className="controle w-full"
              onChange={e => set('titre', e.target.value)}>
              <option value="">—</option>
              <option value="M.">M.</option>
              <option value="Mme">Mme</option>
            </select>
          </label>
          {champ('date_naissance', 'Date de naissance', 'date')}
        </div>

        {/* LE REGISTRE NATIONAL EST LA CLÉ QUI NE CHANGE PAS. Le matricule est
            refait chaque rentrée ; lui suit la personne, et c'est par lui que
            l'on reconnaît un dossier déjà ouvert. */}
        <div className="grid grid-cols-2 gap-3">
          {champ('num_national', 'Numéro de registre national')}
          <label className="block text-xs">
            <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Section de rattachement
            </span>
            <select value={form.section_rattachement} className="controle w-full"
              onChange={e => set('section_rattachement', e.target.value)}>
              <option value="">À déduire du programme</option>
              {sections.map(sx => (
                <option key={sx.code} value={sx.code}>{sx.libelle || sx.code}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {champ('email_ecole', 'Adresse école', 'email')}
          {champ('email_perso', 'Adresse privée', 'email')}
          {champ('gsm', 'Téléphone')}
        </div>

        <div className="grid grid-cols-4 gap-3">
          {champ('adresse', 'Adresse', 'text', true)}
          {champ('cp', 'Code postal')}
          {champ('localite', 'Localité')}
        </div>

        {/* LE DOUBLON SE MONTRE, IL NE SE DEVINE PAS. Deux homonymes nés le
            même jour existent : le serveur signale, le secrétariat tranche. */}
        {doublons && (
          <div className="border border-[#B45309]/40 rounded-carte overflow-hidden">
            <div className="px-3 py-2 bg-amber-50 border-b border-[#B45309]/30
                            text-[12px] text-amber-900">
              <b>Un dossier existe déjà pour cette personne.</b> Le recréer
              couperait son parcours en deux.
            </div>
            <div className="divide-y divide-slate-100">
              {doublons.map(d => (
                <div key={d.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                  <span className="flex-1 min-w-0">
                    <b>{(d.nom || '').toUpperCase()} {d.prenom}</b>
                    <span className="block text-[11px] text-slate-500">
                      {d.date_naissance || 'date de naissance inconnue'}
                      {d.email_ecole ? ` · ${d.email_ecole}` : ''}
                    </span>
                  </span>
                  <button onClick={() => { onCree?.(d.id); onClose?.(); }}
                    className="bouton text-[12px] px-2.5 py-1">
                    Ouvrir ce dossier
                  </button>
                </div>
              ))}
            </div>
            <div className="px-3 py-2 border-t border-slate-100">
              <button onClick={() => creer(true)} disabled={enCours}
                className="text-[12px] text-[#9D4A38] hover:underline">
                Ce n'est pas la même personne — créer quand même
              </button>
            </div>
          </div>
        )}

        {erreur && <div className="text-[12px] text-rose-700">{erreur}</div>}

        <p className="text-[11px] text-slate-400">
          Créé, il n'est encore inscrit à rien : ouvrez son onglet <b>Parcours</b>
          {' '}pour composer son PAE {getAnnee()}.
        </p>
      </div>
    </Fenetre>
  );
}
