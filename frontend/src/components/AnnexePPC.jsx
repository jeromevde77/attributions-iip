/* L'ANNEXE DE LA CIRCULAIRE : LISTE DES DISPONIBILITÉS PAR DÉFAUT D'EMPLOI ET DES PERTES PARTIELLES DE CHARGE (3.5.563, Charles,
   18 novembre 2026 : « sors-moi automatiquement cette annexe » ; tranché : Éditions → Personnel, fenêtre modifiable, Word et PDF).
   Lucie calcule (définitif − attribué, par fonction et niveau ; rappel = attributions hors des fonctions nommées — lib/annexePPC.js),
   chaque case se corrige, on enregistre, puis Word ou PDF signé et cacheté. Routes : GET/PUT /api/formulaires/ppc, …/ppc/document. */
import { useEffect, useState } from 'react';
import { IconFileTypeDocx, IconFileTypePdf, IconPlus, IconTrash, IconRefresh, IconUpload } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { Fenetre, OutilFenetre, Encadre, PastilleEtat } from './ui.jsx';
import { demander } from '../lib/dialogue.jsx';

const COLS = [['nom', 'Nom, prénom', 170], ['fonction', 'Fonction / niveau', 90], ['nature', 'D / PPC', 64], ['perte', 'Charge perdue', 110],
  ['date_perte', 'Date de la perte', 100], ['rappel', 'Rappel à l’activité', 190], ['date_fin_rappel', 'Fin du rappel', 100], ['non_prestees', 'Payées non prestées', 100], ['remarques', 'Remarques', 180]];
const vide = () => Object.fromEntries(COLS.map(([k]) => [k, '']));

export function BoutonAnnexePPC() {
  const [ouvert, setOuvert] = useState(false);
  return (<>
    <section className="carte p-3 space-y-2">
      <div className="titre-carte">Annexe de la circulaire</div>
      <p className="text-second text-slate-600 m-0">Liste récapitulative des disponibilités par défaut d’emploi et des pertes partielles de charge : Lucie la calcule d’après les nominations à titre définitif et les attributions de l’année.</p>
      <button type="button" className="bouton bouton-sortir" onClick={() => setOuvert(true)}>Ouvrir l’annexe</button>
    </section>
    {ouvert && <FenetreAnnexePPC onFermer={() => setOuvert(false)} />}
  </>);
}

export default function FenetreAnnexePPC({ onFermer }) {
  const [annee] = useState(getAnnee());
  const [d, setD] = useState(null);
  const [lignes, setLignes] = useState([]);
  const [reseau, setReseau] = useState('');
  const [date, setDate] = useState(new Date().toLocaleDateString('fr-BE'));
  const [msg, setMsg] = useState(null);
  const [modif, setModif] = useState(false);
  const [importer, setImporter] = useState(false);
  const [tour, setTour] = useState(0);
  useEffect(() => {
    fetch(`/api/formulaires/ppc?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() }).then(r => r.json()).then(j => {
      setD(j); const s = j.saisie;
      setLignes(s?.lignes?.length ? s.lignes : j.calcul || []); setReseau(s?.reseau || ''); if (s?.date) setDate(s.date);
    }).catch(e => setMsg({ etat: 'corriger', t: e.message }));
  }, [annee, tour]);
  const maj = (i, k, v) => { setLignes(l => l.map((x, j) => (j === i ? { ...x, [k]: v } : x))); setModif(true); };
  const enregistrer = async () => {
    const r = await fetch('/api/formulaires/ppc', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ annee, lignes, reseau, date }) });
    const j = await r.json(); if (!r.ok) { setMsg({ etat: 'corriger', t: j.error || 'Enregistrement impossible.' }); return false; }
    setModif(false); setMsg({ etat: 'reussi', t: 'Enregistré.' }); return true;
  };
  const sortir = async format => {
    if (modif && !(await enregistrer())) return;
    const r = await fetch(`/api/formulaires/ppc/document?annee=${encodeURIComponent(annee)}&format=${format}`, { headers: authHeaders() });
    if (!r.ok) { const j = await r.json().catch(() => ({})); setMsg({ etat: 'corriger', t: j.error || 'La pièce ne s’est pas composée.' }); return; }
    const url = URL.createObjectURL(await r.blob());
    if (format === 'pdf') window.open(url, '_blank');
    else { const a = document.createElement('a'); a.href = url; a.download = `Annexe_disponibilites_pertes_partielles_${annee}.docx`; a.click(); }
  };
  const recalculer = async () => {
    if (!(await demander({ titre: 'Reprendre le calcul de Lucie', message: 'Les lignes de la fenêtre sont remplacées par le calcul d’après les nominations et les attributions de l’année. Vos corrections non enregistrées sont perdues.', confirmer: 'Reprendre le calcul', annuler: 'Annuler' }))) return;
    setLignes(d?.calcul || []); setModif(true);
  };
  return (
    <Fenetre large="pleine" titre="Disponibilités par défaut d’emploi et pertes partielles de charge" sous={`Annexe de la circulaire · année ${annee}`} onFermer={onFermer}
      outils={<><OutilFenetre Icone={IconFileTypeDocx} titre="Télécharger le Word" onClick={() => sortir('docx')} /><OutilFenetre Icone={IconFileTypePdf} titre="Ouvrir le PDF" onClick={() => sortir('pdf')} /></>}
      pied={<div className="flex items-center gap-2 w-full">
        {msg && <span className="text-second min-w-0 truncate" style={{ color: msg.etat === 'corriger' ? 'var(--c-refuse)' : 'var(--c-reussi)' }}>{msg.t}</span>}
        <span className="flex-1" />
        <button type="button" className="bouton bouton-fort" disabled={!modif} onClick={enregistrer}>Enregistrer</button>
      </div>}>
      {!d ? <p className="text-second text-slate-400">Lucie calcule…</p> : (
        <div className="space-y-3">
          <Encadre etat="neutre" titre="Comment Lucie calcule">
            Une ligne par membre nommé à titre définitif, par fonction (CT, PP) et niveau (DS pour le supérieur, SS, SI) : la charge perdue
            est <b>toute la charge nommée</b> ; le rappel à l'activité, ce qui lui est attribué cette année dans cette fonction (IIP, hors
            congé), plus ce qui lui est attribué ailleurs. Rien d'attribué : <b>D</b> ; sinon <b>PPC</b>. Payées et non prestées = nommé −
            rappel. Seuls les nommés encodés comptent (fiche → Nominations). Chaque case se corrige.
            {d.saisie && <> Dernier enregistrement {d.saisie.par ? `par ${d.saisie.par} ` : ''}le {String(d.saisie.maj_le || '').slice(0, 10).split('-').reverse().join('/')}.</>}
          </Encadre>
          <div className="flex flex-wrap items-center gap-3 text-second">
            <label className="flex items-center gap-2">Réseau
              <select className="controle" value={reseau} onChange={e => { setReseau(e.target.value); setModif(true); }}>
                <option value="">— à cocher —</option>{(d.reseaux || []).map(r => <option key={r} value={r}>{r}</option>)}
              </select></label>
            <label className="flex items-center gap-2">Date <input className="controle w-32" value={date} onChange={e => { setDate(e.target.value); setModif(true); }} /></label>
            <span className="flex-1" />
            <button type="button" className="bouton inline-flex items-center gap-1.5" onClick={() => setImporter(true)}><IconUpload size={15} />Importer les nominations (Word)</button>
            <button type="button" className="bouton inline-flex items-center gap-1.5" onClick={recalculer}><IconRefresh size={15} />Reprendre le calcul</button>
            <button type="button" className="bouton inline-flex items-center gap-1.5" onClick={() => { setLignes(l => [...l, vide()]); setModif(true); }}><IconPlus size={15} />Ajouter une ligne</button>
          </div>
          {!lignes.length ? <Encadre etat="reussi" titre="Aucune disponibilité ni perte partielle de charge cette année : chaque définitif garde au moins sa charge nommée." /> : (
            <div className="carte overflow-x-auto">
              <table className="w-full text-second" data-numeros="non">
                <thead><tr className="tab-entete text-mention uppercase tracking-wide text-slate-500">
                  {COLS.map(([k, l]) => <th key={k} className="px-2 py-2 text-left font-semibold whitespace-nowrap">{l}</th>)}<th /></tr></thead>
                <tbody>{lignes.map((l, i) => (
                  <tr key={i} className="border-t border-slate-100 align-top">
                    {COLS.map(([k, , w]) => (
                      <td key={k} className="px-1 py-1" style={{ minWidth: w }}>
                        {k === 'nature' ? <select className="controle !h-8 w-full" value={l[k] || ''} onChange={e => maj(i, k, e.target.value)}><option value="D">D</option><option value="PPC">PPC</option></select>
                          : ['rappel', 'remarques'].includes(k) ? <textarea className="controle !h-auto w-full py-1" rows={2} value={l[k] || ''} onChange={e => maj(i, k, e.target.value)} data-reponses="non" />
                            : <input className="controle !h-8 w-full" value={l[k] || ''} onChange={e => maj(i, k, e.target.value)} />}
                      </td>))}
                    <td className="px-1 py-1"><button type="button" className="text-slate-400 hover:text-red-700 p-1" title="Retirer la ligne" onClick={() => { setLignes(x => x.filter((_, j) => j !== i)); setModif(true); }}><IconTrash size={15} /></button></td>
                  </tr>))}</tbody>
              </table>
            </div>)}
        </div>)}
      {importer && <ImportNominations onFermer={() => setImporter(false)} onFait={() => { setImporter(false); setTour(t => t + 1); setMsg({ etat: 'reussi', t: 'Nominations importées : « Reprendre le calcul » pour les voir dans l’annexe.' }); }} />}
    </Fenetre>);
}

/* L'IMPORT DES NOMINATIONS (3.5.567, Charles : « prépare-moi un import des nominations pour me simplifier la vie ») : le Word
   « MDP définitifs » de la coordination. Lucie lit et montre d'abord ; une personne déjà encodée ne change que si on coche
   « remplacer ». Route : POST /api/nominations/import. */
const ETAT = { creer: ['reussi', 'à créer'], remplacer: ['surveiller', 'remplacée'], deja: ['neutre', 'déjà encodée'], absent: ['corriger', 'fiche introuvable'] };
function ImportNominations({ onFermer, onFait }) {
  const [fichier, setFichier] = useState(null);
  const [sim, setSim] = useState(null);
  const [remplacer, setRemplacer] = useState([]);
  const [err, setErr] = useState(null);
  const [encours, setEncours] = useState(false);
  const envoyer = async (ecrire, fic = fichier, rempl = remplacer) => {
    setEncours(true); setErr(null);
    try {
      const r = await fetch('/api/nominations/import', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ fichier: fic, remplacer: rempl, ecrire }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      if (ecrire) onFait(); else setSim(j.personnes);
    } catch (e) { setErr(e.message); } finally { setEncours(false); }
  };
  const lire = f => { if (!f) return; const rd = new FileReader(); rd.onload = () => { setFichier(rd.result); setRemplacer([]); envoyer(false, rd.result, []); }; rd.readAsDataURL(f); };
  const basculer = id => { const n = remplacer.includes(id) ? remplacer.filter(x => x !== id) : [...remplacer, id]; setRemplacer(n); envoyer(false, fichier, n); };
  const aEcrire = (sim || []).filter(p => ['creer', 'remplacer'].includes(p.action));
  return (
    <Fenetre large="grande" titre="Importer les nominations à titre définitif" sous="Le tableau Word des membres du personnel définitifs" onFermer={onFermer}
      pied={<div className="flex items-center gap-2 w-full">
        {err && <span className="text-second min-w-0 truncate" style={{ color: 'var(--c-refuse)' }}>{err}</span>}
        {sim && !aEcrire.length && <span className="text-second text-slate-500">Rien à écrire : coche « remplacer » pour une personne déjà encodée.</span>}
        <span className="flex-1" />
        <button type="button" className="bouton bouton-fort" disabled={!aEcrire.length || encours} onClick={() => envoyer(true)}>Importer {aEcrire.length ? `(${aEcrire.length})` : ''}</button>
      </div>}>
      <div className="space-y-3">
        <label className="bouton inline-flex items-center gap-1.5 cursor-pointer"><IconUpload size={15} />Choisir le fichier Word
          <input type="file" accept=".docx" className="hidden" onChange={e => lire(e.target.files?.[0])} /></label>
        <p className="text-second text-slate-500 m-0">Colonnes attendues : Nom et prénom · Fonction / Cours (CT, PP… en fin de libellé) · Périodes · Total · Niveau. Rien ne s’écrit avant « Importer ».
          Une personne déjà encodée garde ses nominations, sauf si tu coches « remplacer » (les anciennes deviennent inactives, elles ne sont pas effacées).</p>
        {encours && !sim && <p className="text-second text-slate-400">Lecture…</p>}
        {sim && <div className="carte overflow-x-auto"><table className="w-full text-second" data-numeros="non">
          <thead><tr className="tab-entete"><th className="px-2 py-1.5 text-left">Personne</th><th className="px-2 py-1.5 text-left">Dans le fichier</th><th className="px-2 py-1.5 text-left">Déjà dans Lucie</th><th className="px-2 py-1.5 text-left">Import</th></tr></thead>
          <tbody>{sim.map((p, i) => (
            <tr key={i} className="border-t border-slate-100 align-top">
              <td className="px-2 py-1.5 font-semibold whitespace-nowrap">{p.nom} {p.prenom}{p.avis.length > 0 && <div className="text-mention font-normal" style={{ color: 'var(--c-attente)' }}>{p.avis.join(' ; ')}</div>}</td>
              <td className="px-2 py-1.5">{p.lignes.map((l, j) => <div key={j}>{l.libelle}{l.fonction ? ` (${l.fonction})` : ''} · {l.periodes ?? '?'}</div>)}</td>
              <td className="px-2 py-1.5 text-slate-600">{p.existantes.length ? p.existantes.map(e => <div key={e.id}>{e.cours_libre || e.cours_code} ({e.type_charge || '—'}) · {e.periodes}</div>) : '—'}</td>
              <td className="px-2 py-1.5 whitespace-nowrap space-y-1">
                <PastilleEtat etat={ETAT[p.action][0]}>{ETAT[p.action][1]}</PastilleEtat>
                {p.professeur_id && p.existantes.length > 0 && <label className="flex items-center gap-1.5"><input type="checkbox" checked={remplacer.includes(p.professeur_id)} onChange={() => basculer(p.professeur_id)} />remplacer</label>}
                {p.action === 'absent' && <div className="text-mention text-slate-500">à créer d’abord dans Personnel</div>}
              </td>
            </tr>))}</tbody></table></div>}
      </div>
    </Fenetre>);
}
