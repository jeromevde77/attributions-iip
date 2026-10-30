import { useEffect, useState } from 'react';
import { IconUserPlus, IconId } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { Fenetre } from './ui.jsx';
import { eidReadAll, eidToProf } from '../lib/eid.js';

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
 * L'IDENTITÉ, ET UNE SECTION (Charles, 28 octobre 2026 : « soit lui attribuer une section,
 * soit l'inscrire à au moins une UE »). La première UE, facultative, passe par la porte
 * unique du programme (`ecrireProgramme`, côté serveur) : ce n'est pas un troisième
 * endroit où inscrire, c'est la même porte, appelée d'ici. Le reste du programme se
 * compose dans l'onglet Parcours.
 *
 * LE DOUBLON EST LE VRAI RISQUE. On ne trouve pas quelqu'un dans la liste, on
 * le recrée, et son parcours se coupe en deux — c'est précisément ce que nous
 * avons passé une journée à réparer pour TIM. Le serveur cherche donc avant
 * d'écrire, et rend la main plutôt que de créer en double.
 */
/* LE PLUS COURT CHEMIN VERS LA FICHE (Charles, 3 octobre 2026 : « pour créer
 * un étudiant, il faut juste soit lire la carte d'identité, soit ajouter nom et
 * prénom ; ensuite ça va direct dans la fiche »). Le reste — adresse par code
 * postal et rues, nationalité en liste, section — se complète dans la fiche,
 * où la saisie est faite pour cela. La carte, quand on la lit, apporte en plus
 * la date et le lieu de naissance, le registre national, l'adresse et la
 * nationalité : le registre national est la clé qui reconnaît un doublon. */
export default function NouvelEtudiant({ onClose, onCree }) {
  const [form, setForm] = useState({ nom: '', prenom: '' });
  const [carte, setCarte] = useState(null);      // ce que la carte a apporté
  const [doublons, setDoublons] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  // UNE SECTION OU UNE UE (Charles, 28 octobre 2026) : sans l'un ni l'autre, le dossier se perd.
  const [sections, setSections] = useState([]);
  const [ues, setUes] = useState([]);
  const [section, setSection] = useState('');
  const [ue, setUe] = useState('');
  const annee = getAnnee();
  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() }).then(r => (r.ok ? r.json() : [])).then(l => setSections(Array.isArray(l) ? l : [])).catch(() => {});
  }, []);
  useEffect(() => {
    setUe('');
    if (!section) { setUes([]); return; }
    fetch(`/api/ref/ue?annee=${encodeURIComponent(annee)}&section=${encodeURIComponent(section)}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : [])).then(l => setUes(Array.isArray(l) ? l : [])).catch(() => setUes([]));
  }, [section, annee]);

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setDoublons(null); };
  const pret = form.nom.trim() && form.prenom.trim() && (section || ue);

  async function lireCarte() {
    setEnCours(true); setErreur(null);
    try {
      const r = await eidReadAll();
      if (!r.ok) throw new Error(r.code === 'UNREACHABLE'
        ? "Le lecteur de carte ne répond pas : vérifiez que l'application eID Reader est lancée et la carte insérée."
        : r.message || 'Lecture impossible.');
      const m = eidToProf(r.data);
      const c = {
        nom: m.nom || '', prenom: m.prenom || '', date_naissance: m.date_naissance || '',
        num_national: m.niss || '', lieu_naissance: m.lieu_naissance_ville || '',
        nationalite: m.nationalite || '', adresse: m.adresse_rue || '', cp: m.code_postal || '', localite: m.commune || '',
      };
      setForm(f => ({ ...f, nom: c.nom || f.nom, prenom: c.prenom || f.prenom }));
      setCarte(c); setDoublons(null);
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  }

  async function creer(forcer = false) {
    if (!pret) return;
    setEnCours(true); setErreur(null);
    try {
      const corps = { ...(carte || {}), nom: form.nom, prenom: form.prenom, forcer,
        section_rattachement: section || null, ...(ue ? { annee, ue_nums: [Number(ue)] } : {}) };
      const rep = await fetch('/api/etudiants', { method: 'POST', headers: authHeaders(), body: JSON.stringify(corps) });
      const j = await rep.json();
      if (rep.status === 409) { setDoublons(j.candidats || []); return; }
      if (!rep.ok) throw new Error(j.error || 'Erreur');
      onCree?.(j.id);
      onClose?.();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const champ = (k, label) => (
    <label className="block text-xs">
      <span className="intertitre block mb-1">{label}</span>
      <input value={form[k]} className="controle w-full" autoFocus={k === 'nom'}
        onChange={e => set(k, e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && pret && !doublons) creer(false); }} />
    </label>
  );
  const fr = d => (d ? String(d).split('-').reverse().join('/') : '');

  return (
    <Fenetre icone={IconUserPlus} onFermer={onClose} large="petite"
      titre="Nouvel étudiant"
      sous="Carte d'identité, ou nom et prénom — le reste se complète dans la fiche"
      pied={<>
        <button onClick={() => creer(false)} disabled={!pret || enCours || !!doublons}
          className="bouton bouton-fort disabled:opacity-40">
          {enCours ? 'Création…' : 'Créer et aller à la fiche'}
        </button>
        <button onClick={onClose} className="bouton ml-auto">Annuler</button>
      </>}>
      {/* UNE SEULE MARGE, CELLE DE LA FENÊTRE (3.1.459, Charles : « alignement à revoir ») : un p-5 en
          plus décalait le contenu de 20 px par rapport au titre et au pied. */}
      <div className="space-y-4">
        <button type="button" onClick={lireCarte} disabled={enCours}
          className="bouton w-full justify-center inline-flex items-center gap-2 disabled:opacity-40">
          <IconId size={17} /> Lire la carte d'identité
        </button>
        {carte && (
          <div className="bloc-etat etat-neutre rounded-r-carte px-3 py-2 text-second" style={{ borderLeftColor: 'var(--c-reussi, #3E7D5E)' }}>
            Carte lue : {[fr(carte.date_naissance) && `né(e) le ${fr(carte.date_naissance)}`, carte.lieu_naissance && `à ${carte.lieu_naissance}`,
              carte.nationalite, carte.num_national && `RN ${carte.num_national}`, [carte.adresse, carte.cp, carte.localite].filter(Boolean).join(' ')]
              .filter(Boolean).join(' · ')} — enregistré avec la fiche.
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          {champ('nom', 'Nom')}
          {champ('prenom', 'Prénom')}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs"><span className="intertitre block mb-1">Section</span>
            <select className="controle w-full" value={section} onChange={e => { setSection(e.target.value); setDoublons(null); }}>
              <option value="">— choisir —</option>
              {sections.map(s => <option key={s.code} value={s.code}>{s.libelle ? `${s.code} — ${s.libelle}` : s.code}</option>)}
            </select></label>
          <label className="block text-xs"><span className="intertitre block mb-1">Première UE (facultatif)</span>
            <select className="controle w-full" value={ue} disabled={!section} onChange={e => setUe(e.target.value)}>
              <option value="">{section ? '— aucune pour l’instant —' : 'choisir d’abord la section'}</option>
              {ues.map(u => <option key={`${u.ue_num}-${u.section}`} value={u.ue_num}>UE {u.ue_num} — {u.ue_nom}</option>)}
            </select></label>
        </div>

        {/* LE DOUBLON SE MONTRE, IL NE SE DEVINE PAS. Deux homonymes nés le
            même jour existent : le serveur signale, le secrétariat tranche. */}
        {doublons && (
          <div className="bloc-etat etat-neutre rounded-r-carte overflow-hidden" style={{ borderLeftColor: 'var(--c-attente, #E8890C)' }}>
            <div className="px-3 py-2 border-b border-slate-100 text-second">
              <b>Un dossier existe déjà pour cette personne.</b> Le recréer couperait son parcours en deux.
            </div>
            <div className="divide-y divide-slate-100">
              {doublons.map(d => (
                <div key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="flex-1 min-w-0">
                    <b>{(d.nom || '').toUpperCase()} {d.prenom}</b>
                    <span className="block text-xs text-slate-500">
                      {d.date_naissance || 'date de naissance inconnue'}{d.email_ecole ? ` · ${d.email_ecole}` : ''}
                    </span>
                  </span>
                  <button onClick={() => { onCree?.(d.id); onClose?.(); }} className="bouton text-second px-2.5 py-1">Ouvrir ce dossier</button>
                </div>
              ))}
            </div>
            <div className="px-3 py-2 border-t border-slate-100">
              <button onClick={() => creer(true)} disabled={enCours} className="text-second text-iip-texte hover:underline">
                Ce n'est pas la même personne — créer quand même
              </button>
            </div>
          </div>
        )}

        {erreur && <div className="text-second" style={{ color: 'var(--c-refuse, #9D4A38)' }}>{erreur}</div>}
        <p className="text-xs text-slate-400">
          La section est obligatoire : sans elle, le dossier n’apparaîtrait dans aucune liste. La fiche s'ouvre aussitôt :
          adresse et programme ({annee}) s'y complètent ; une UE choisie ici entre au programme par la même porte que l’onglet Parcours.
        </p>
      </div>
    </Fenetre>
  );
}
