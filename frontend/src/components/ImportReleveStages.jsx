import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { IconBuildingHospital } from '@tabler/icons-react';
import { Fenetre } from './ui.jsx';
import { api, authHeaders } from '../lib/api.js';

/**
 * IMPORTER UN RELEVÉ DES STAGES EFFECTUÉS (Charles, 8 octobre 2026 : « je dois
 * intégrer ceci pour compléter les suppléments au diplôme »). Le relevé d'une
 * section — une ligne par stage — devient les stages des dossiers : intitulé,
 * domaine, lieu, période, heures, maître de stage. Les colonnes se reconnaissent
 * à leur en-tête ; la date de fin est la colonne sans titre qui suit « Période ».
 * Rien ne s'écrit sans simulation, et l'écriture est tout ou rien (routes/stages.js).
 */
const COLONNES = {
  intitule: /ann[ée]e\s*\/\s*stage|intitul/i, nom: /^nom/i, prenom: /pr[ée]nom/i, domaine: /domaine|service/i,
  etablissement: /^[ée]tablissement|lieu/i, adresse: /adresse/i, debut: /p[ée]riode|d[ée]but/i, fin: /^fin/i,
  heures: /heures/i, maitre: /^ma[iî]tre de stage$/i, maitre_contact: /coordonn[ée]es/i,
};
// La date LOCALE de la cellule : toISOString la ramène en UTC, et le 8 décembre devenait le 7.
const deux = n => String(n).padStart(2, '0');
const enIso = v => (v instanceof Date ? `${v.getFullYear()}-${deux(v.getMonth() + 1)}-${deux(v.getDate())}` : String(v ?? '').trim());

function lireClasseur(buffer) {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  for (const nomFeuille of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[nomFeuille], { header: 1, defval: '', raw: true });
    const h = rows.findIndex(r => r.some(c => /tablissement/i.test(String(c))) && r.some(c => /pr[ée]nom/i.test(String(c))));
    if (h < 0) continue;
    const idx = {};
    rows[h].forEach((c, i) => {
      for (const [k, re] of Object.entries(COLONNES)) if (idx[k] == null && re.test(String(c).trim())) { idx[k] = i; break; }
    });
    // La fin de la période : la colonne sans en-tête qui suit le début.
    if (idx.fin == null && idx.debut != null && !String(rows[h][idx.debut + 1] ?? '').trim()) idx.fin = idx.debut + 1;
    const lignes = rows.slice(h + 1)
      .map(r => Object.fromEntries(Object.entries(idx).map(([k, i]) => [k, ['debut', 'fin'].includes(k) ? enIso(r[i]) : String(r[i] ?? '').trim()])))
      .filter(l => l.nom && l.etablissement);
    return { feuille: nomFeuille, colonnes: Object.keys(idx), lignes };
  }
  return null;
}

export default function ImportReleveStages({ onClose, onFini }) {
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [lu, setLu] = useState(null);
  const [rapport, setRapport] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => { api.sections().then(d => setSections(Array.isArray(d) ? d : [])).catch(() => {}); }, []);

  async function choisirFichier(f) {
    setErreur(null); setRapport(null); setLu(null);
    if (!f) return;
    const r = lireClasseur(await f.arrayBuffer());
    if (!r) { setErreur('Aucune ligne d’en-tête « Établissement · Prénom » trouvée dans ce classeur.'); return; }
    setLu(r);
  }

  async function envoyer(simulation) {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/stages/import-releve', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ section, lignes: lu.lignes, simulation }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error || "L'import a échoué."); return; }
      setRapport(j);
      if (!simulation) onFini?.(j);
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const raison = !lu ? 'Déposez le relevé.' : !section ? 'Choisissez la section.' : null;
  const fait = rapport && !rapport.simulation;
  const pastille = (n, lib, couleur) => (
    <span className="rounded-full px-2.5 h-6 inline-flex items-center text-white font-semibold" style={{ background: couleur }}>{n} {lib}</span>);

  return (
    <Fenetre icone={IconBuildingHospital} titre="Importer un relevé des stages effectués"
      sous="Une ligne par stage — pour les dossiers et le supplément au diplôme" large="grande" onFermer={onClose}
      pied={<>
        <span className="text-second min-w-0" style={{ color: erreur ? 'var(--c-refuse)' : undefined }}>
          {erreur || (fait ? 'Import terminé.' : raison) || ''}
        </span>
        <button type="button" className="bouton ml-auto" onClick={onClose}>{fait ? 'Fermer' : 'Annuler'}</button>
        {!fait && (
          <button type="button" className={`bouton ${rapport ? '' : 'bouton-fort'}`} disabled={!!raison || enCours}
            onClick={() => envoyer(true)}>Simuler</button>)}
        {rapport?.simulation && rapport.a_creer > 0 && (
          <button type="button" className="bouton bouton-fort" disabled={!!raison || enCours} onClick={() => envoyer(false)}>
            Importer {rapport.a_creer} stage(s)</button>)}
      </>}>
      <div className="grid md:grid-cols-2 gap-3 mb-4">
        <label>
          <span className="block text-mention uppercase tracking-[.1em] text-slate-400 font-semibold mb-0.5">Relevé</span>
          <input type="file" accept=".xlsx,.xls" className="block w-full text-second" onChange={e => choisirFichier(e.target.files?.[0])} />
        </label>
        <label>
          <span className="block text-mention uppercase tracking-[.1em] text-slate-400 font-semibold mb-0.5">Section</span>
          <select className="controle w-full bg-white" value={section} onChange={e => { setSection(e.target.value); setRapport(null); }}>
            <option value="">— choisir —</option>
            {sections.map(s => <option key={s.code} value={s.code}>{s.libelle || s.code}</option>)}
          </select>
        </label>
      </div>

      {lu && !rapport && (
        <p className="text-sm text-slate-700">
          <b>{lu.lignes.length}</b> stage(s) lus dans la feuille « {lu.feuille} » — colonnes reconnues : {lu.colonnes.join(', ')}.
          Lancez la simulation pour voir ce qui sera écrit.
        </p>)}

      {rapport && (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2 text-second">
            {pastille(rapport.a_creer, fait ? 'stage(s) créé(s)' : 'stage(s) à créer', 'var(--c-reussi)')}
            {pastille(rapport.deja, 'déjà dans Lucie', 'var(--c-disponible)')}
            {pastille(rapport.lieux_crees.length, 'lieu(x) nouveau(x)', 'var(--c-disponible)')}
            {rapport.inconnus.length > 0 && pastille(rapport.inconnus.length, 'étudiant(s) non retrouvé(s)', 'var(--c-attente)')}
            {rapport.illisibles.length > 0 && pastille(rapport.illisibles.length, 'date(s) illisible(s)', 'var(--c-refuse)')}
            <span className="text-slate-500 self-center">Section {rapport.section}{rapport.simulation ? ' — simulation, rien n’est écrit' : ''}</span>
          </div>
          {Object.keys(rapport.par_annee).length > 0 && (
            <p className="m-0 text-slate-600">Par année : {Object.entries(rapport.par_annee).sort().map(([a, n]) => `${a} : ${n}`).join(' · ')}</p>)}
          {rapport.inconnus.length > 0 && (
            <div>
              <div className="font-semibold text-iip-texte mb-1">Non retrouvés — à corriger dans le relevé ou à rapprocher à la main</div>
              <div className="text-second text-slate-600 columns-2 md:columns-3">
                {[...new Map(rapport.inconnus.map(x => [x.nom, x])).values()].map(x => (
                  <div key={x.nom}>{x.nom}{x.motif === 'homonymes' ? ' (homonymes)' : ''}</div>))}
              </div>
            </div>)}
          {rapport.lieux_crees.length > 0 && (
            <div>
              <div className="font-semibold text-iip-texte mb-1">Lieux qui seront créés</div>
              <div className="text-second text-slate-600">{rapport.lieux_crees.map(l => `${l.nom}${l.localite ? ` (${l.cp || ''} ${l.localite})` : ''}`).join(' · ')}</div>
            </div>)}
          {rapport.illisibles.length > 0 && <div className="text-second text-slate-600">{rapport.illisibles.join(' · ')}</div>}
        </div>)}
    </Fenetre>
  );
}
