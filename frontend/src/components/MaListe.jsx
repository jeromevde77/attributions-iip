import { useEffect, useRef, useState } from 'react';
import { IconListDetails, IconChevronDown, IconPrinter, IconFileSpreadsheet, IconMail, IconColumns } from '@tabler/icons-react';
import { Fenetre, OutilFenetre } from './ui.jsx';
import { authHeaders, getAnnee } from '../lib/api.js';
import { ouvrirApercu } from '../lib/apercu.js';

/* COMPOSER SA LISTE (3.5.147, Charles : « pouvoir composer des listes comme dans Éditions, avec mail, matricule… »). Les colonnes à
   garder, dans l'ordre ; des colonnes vides à remplir à la main ; un titre. Le N° est toujours là. Aperçu/PDF par le serveur (la
   feuille de Mes cours), Excel dans le navigateur. */
const COLONNES = [['nom', 'Nom'], ['prenom', 'Prénom'], ['matricule', 'Matricule'], ['email', 'Adresse école'], ['groupe', 'Groupe'], ['section', 'Section']];
const VIDES_PROPOSEES = ['Signature', 'Présent', 'Remarques', 'Note', 'Matériel'];
function Composer({ etudiants, cours, groupe, onImprimer, onFermer }) {
  const [cols, setCols] = useState(['nom', 'prenom', 'matricule']);
  const [vides, setVides] = useState(['Signature']);
  const [autre, setAutre] = useState('');
  const [titre, setTitre] = useState('');
  const basculer = (l, set, k) => set(l.includes(k) ? l.filter(x => x !== k) : [...l, k]);
  const ordonnees = COLONNES.map(c => c[0]).filter(k => cols.includes(k));
  async function excel() {
    const XLSX = await import('xlsx');
    const val = (e, k) => ({ nom: String(e.nom || '').toUpperCase(), prenom: e.prenom || '', matricule: e.id_ecampus || '', email: e.email_ecole || '',
      groupe: e.groupe || '', section: e.section || e.section_rattachement || '' }[k]);
    const tete = ['N°', ...ordonnees.map(k => COLONNES.find(c => c[0] === k)[1]), ...vides];
    const lignes = etudiants.map((e, i) => [i + 1, ...ordonnees.map(k => val(e, k)), ...vides.map(() => '')]);
    const ws = XLSX.utils.aoa_to_sheet([...(titre ? [[titre], []] : []), tete, ...lignes]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Liste');
    XLSX.writeFile(wb, `Liste_${cours}${groupe ? `_groupe_${groupe}` : ''}.xlsx`);
  }
  const options = { colonnes: ordonnees.join(','), vides: vides.join(','), titre, paysage: ordonnees.length + vides.length > 5 };
  return (
    <Fenetre titre="Composer une liste" sous={`${cours}${groupe ? ` · groupe ${groupe}` : ''} · ${etudiants.length} étudiant(s)`} onFermer={onFermer}
      outils={<>
        <OutilFenetre Icone={IconPrinter} titre="Aperçu et PDF" onClick={() => { onImprimer(options); onFermer(); }} />
        <OutilFenetre Icone={IconFileSpreadsheet} titre="Excel" onClick={excel} />
      </>}>
      <div className="space-y-4 text-sm">
        <label className="block"><span className="intertitre block mb-1">Titre de la liste</span>
          <input className="controle w-full" value={titre} onChange={e => setTitre(e.target.value)} placeholder="Ex. : Liste d’appel — examen du 12 janvier" data-reponses="non" /></label>
        <div><span className="intertitre block mb-1">Colonnes</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5"><span className="text-slate-400">N° (toujours)</span>
            {COLONNES.map(([k, l]) => <label key={k} className="inline-flex items-center gap-1.5"><input type="checkbox" checked={cols.includes(k)} onChange={() => basculer(cols, setCols, k)} />{l}</label>)}</div></div>
        <div><span className="intertitre block mb-1">Colonnes vides, à remplir à la main</span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {[...new Set([...VIDES_PROPOSEES, ...vides])].map(v => <label key={v} className="inline-flex items-center gap-1.5"><input type="checkbox" checked={vides.includes(v)} onChange={() => basculer(vides, setVides, v)} />{v}</label>)}
            <span className="inline-flex items-center gap-1.5"><input className="controle !h-8 w-40" value={autre} onChange={e => setAutre(e.target.value)} placeholder="Autre colonne…" data-reponses="non" />
              <button type="button" className="bouton !h-8" disabled={!autre.trim()} onClick={() => { setVides(v => [...new Set([...v, autre.trim()])]); setAutre(''); }}>Ajouter</button></span>
          </div></div>
        <p className="m-0 text-second text-slate-500">L’aperçu, le PDF et l’Excel sont dans la barre bleue, en haut de la fenêtre.</p>
      </div>
    </Fenetre>);
}

/**
 * MA LISTE (3.1.288, Charles, 11 octobre 2026 : « ce n'est pas clair pour les profs ; ça va dans
 * Éditions, mais ils ne savent rien faire, c'est bridé — et pouvoir faire des Excel »). Un bouton
 * nommé, là où l'on travaille, et trois gestes : imprimer la liste (PDF, colonne de signature),
 * la télécharger en Excel, copier les adresses de l'école. Le groupe affiché fait la liste.
 */
export default function MaListe({ etudiants, groupe, cours, onImprimer, occupe }) {
  const [ouvert, setOuvert] = useState(false);
  const [composer, setComposer] = useState(false);
  const [msg, setMsg] = useState('');
  const boite = useRef(null);
  useEffect(() => {
    const f = e => { if (boite.current && !boite.current.contains(e.target)) setOuvert(false); };
    document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f);
  }, []);
  const dire = t => { setMsg(t); setTimeout(() => setMsg(''), 4000); };

  async function excel() {
    setOuvert(false);
    const XLSX = await import('xlsx');
    const lignes = etudiants.map(e => ({
      Nom: String(e.nom || '').toUpperCase(), Prénom: e.prenom || '', Matricule: e.id_ecampus || '',
      Groupe: e.groupe || '', 'Adresse école': e.email_ecole || '',
    }));
    const ws = XLSX.utils.json_to_sheet(lignes);
    ws['!cols'] = [{ wch: 24 }, { wch: 18 }, { wch: 14 }, { wch: 30 }, { wch: 34 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Étudiants');
    XLSX.writeFile(wb, `Liste_${cours}${groupe ? `_groupe_${groupe}` : ''}.xlsx`);
    dire(`✓ ${lignes.length} étudiant(s) dans le fichier Excel.`);
  }
  async function adresses() {
    setOuvert(false);
    const l = etudiants.map(e => e.email_ecole).filter(Boolean);
    try { await navigator.clipboard.writeText(l.join('; ')); dire(`✓ ${l.length} adresse(s) copiée(s) : collez-les dans votre messagerie.`); }
    catch { dire('La copie a été refusée par le navigateur.'); }
  }

  return (
    <div ref={boite} className="relative inline-flex items-center gap-2">
      {msg && <span className="text-second text-slate-500">{msg}</span>}
      <button type="button" className="bouton bouton-sortir inline-flex items-center gap-1.5" disabled={occupe} onClick={() => setOuvert(o => !o)}>
        <IconListDetails size={15} /> Ma liste {groupe ? `(groupe ${groupe})` : ''} <span className="text-slate-400">· {etudiants.length}</span> <IconChevronDown size={14} />
      </button>
      {ouvert && (
        <div className="absolute right-0 top-full mt-1 z-30 w-80 rounded-carte border border-slate-200 shadow-flottant p-1" style={{ background: 'var(--blanc)' }}>
          {[
            [IconColumns, 'Composer une liste…', 'Choisir les colonnes : adresse, matricule, groupe, section, colonnes vides', () => { setOuvert(false); setComposer(true); }],
            [IconPrinter, 'Imprimer la liste (PDF)', 'Avec une colonne de signature ; aperçu d’abord', () => { setOuvert(false); onImprimer(); }],
            [IconFileSpreadsheet, 'Télécharger en Excel', 'Nom, prénom, matricule, groupe, adresse école', excel],
            [IconMail, 'Copier les adresses e-mail', 'Les adresses de l’école, séparées par « ; »', adresses],
          ].map(([Ic, t, d, f]) => (
            <button key={t} type="button" onClick={f} className="w-full text-left px-3 py-2 rounded-champ hover:bg-slate-50 flex gap-2.5">
              <Ic size={18} className="text-slate-500 mt-0.5 flex-none" />
              <span><span className="block text-sm font-medium">{t}</span><span className="block text-second text-slate-500">{d}</span></span>
            </button>))}
        </div>)}
      {composer && <Composer etudiants={etudiants} cours={cours} groupe={groupe} onImprimer={onImprimer} onFermer={() => setComposer(false)} />}
    </div>);
}

/* UNE LISTE SUR MESURE, DEPUIS N'IMPORTE OÙ (3.5.160, Charles : « le petit avion pour exporter des listes sur mesure ») : la
   fenêtre « Composer une liste » pour un cours, sans ouvrir sa feuille de notes. Les étudiants viennent de Mes cours, la feuille
   imprimée de la même route que « Ma liste ». */
export function ListeSurMesure({ cours, groupe = '', annee = getAnnee(), onFermer }) {
  const [etudiants, setEtudiants] = useState(null);
  const [erreur, setErreur] = useState(null);
  useEffect(() => {
    fetch(`/api/mes-cours/${encodeURIComponent(cours)}/etudiants?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(r => r.json().then(j => (r.ok ? j : Promise.reject(new Error(j.error || `Erreur ${r.status}`)))))
      .then(j => setEtudiants((j.etudiants || []).filter(e => !groupe || String(e.groupe || '').split(' + ').map(x => x.trim()).includes(groupe))))
      .catch(e => setErreur(e.message));
  }, [cours, groupe, annee]);
  async function imprimer(opt) {
    try {
      const q = `&colonnes=${encodeURIComponent(opt.colonnes)}&vides=${encodeURIComponent(opt.vides || '')}&titre=${encodeURIComponent(opt.titre || '')}`;
      const r = await fetch(`/api/mes-cours/${encodeURIComponent(cours)}/listes?annee=${encodeURIComponent(annee)}&format=html${groupe ? `&groupe=${encodeURIComponent(groupe)}` : ''}${q}`, { headers: authHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      ouvrirApercu({ html: j.html, titre: `Liste — ${cours}${groupe ? ` · groupe ${groupe}` : ''}`, nomFichier: j.nom, envoiPossible: false,
        pdf: { orientation: opt.paysage ? 'landscape' : 'portrait' } });
    } catch (e) { setErreur(e.message); }
  }
  if (erreur) return <Fenetre titre="Composer une liste" onFermer={onFermer}><p className="text-red-700">{erreur}</p></Fenetre>;
  if (!etudiants) return <Fenetre titre="Composer une liste" onFermer={onFermer}><p className="text-slate-500">Chargement…</p></Fenetre>;
  return <Composer etudiants={etudiants} cours={cours} groupe={groupe} onImprimer={imprimer} onFermer={onFermer} />;
}
