import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { IconBuildingHospital } from '@tabler/icons-react';
import { Fenetre } from './ui.jsx';
import { api, authHeaders } from '../lib/api.js';

/**
 * IMPORTER UN RÉPERTOIRE DE LIEUX DE STAGE (Charles, 3 octobre 2026 : « pour
 * les stages de psychomotricité, je veux qu'on puisse sélectionner… j'aurai le
 * même pour les autres »). Le classeur de la section — type de lieu,
 * responsable, organisme, adresse, comment demander un stage — devient la liste
 * dans laquelle on choisit le lieu d'un stage.
 *
 * Les colonnes se reconnaissent à leur en-tête, où qu'il soit dans la feuille.
 * Rien ne s'écrit sans simulation : on voit ce qui sera créé, ce qui sera
 * complété (même nom dans la section), ce qui est ignoré.
 */
/* Les en-têtes de chaque section ne se ressemblent pas : AeSI écrit « Lieux de
   stage · Statuts · Adresses · Personne de contact » (8 octobre 2026). */
const COLONNES = {
  type: /type|statut/i, responsable: /responsable|contact/i, nom: /nom de l|organisme|lieux? de stage/i,
  adresse: /adresse/i, demande: /demande/i,
};

function lireClasseur(buffer) {
  const wb = XLSX.read(buffer, { type: 'array' });
  for (const nomFeuille of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[nomFeuille], { header: 1, defval: '' });
    const h = rows.findIndex(r => r.some(c => COLONNES.nom.test(String(c))));
    if (h < 0) continue;
    const idx = {};
    rows[h].forEach((c, i) => {
      for (const [k, re] of Object.entries(COLONNES)) if (idx[k] == null && re.test(String(c))) idx[k] = i;
    });
    const lignes = rows.slice(h + 1)
      .map(r => Object.fromEntries(Object.entries(idx).map(([k, i]) => [k, String(r[i] ?? '').trim()])))
      .filter(l => l.nom);
    /* UN MÊME LIEU, DEUX SERVICES (« Scheutbos — maison de repos » et « Scheutbos —
       revalidation ») : le type devient le service, sans quoi la seconde ligne
       complèterait la première au lieu d'exister. */
    const compte = {}; lignes.forEach(l => { const k = l.nom.toLowerCase(); compte[k] = (compte[k] || 0) + 1; });
    lignes.forEach(l => { if (compte[l.nom.toLowerCase()] > 1 && l.type) l.service = l.type; });
    return { feuille: nomFeuille, colonnes: Object.keys(idx), lignes };
  }
  return null;
}

export default function ImportLieuxStage({ onClose, onFini }) {
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [ues, setUes] = useState('');
  const [lu, setLu] = useState(null);
  const [rapport, setRapport] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => { api.sections().then(d => setSections(Array.isArray(d) ? d : [])).catch(() => {}); }, []);

  async function choisirFichier(f) {
    setErreur(null); setRapport(null); setLu(null);
    if (!f) return;
    const r = lireClasseur(await f.arrayBuffer());
    if (!r) { setErreur("Aucune colonne « Nom de l'organisme » trouvée dans ce classeur."); return; }
    setLu(r);
    // Les UE se devinent du nom du fichier (« UE 77, 78 & 79 ») ; on corrige au besoin.
    // « 26-27 » est une année, pas deux unités.
    const nums = (f.name.replace(/\b\d{2}(\d{2})?\s*[-–\/]\s*\d{2}(\d{2})?\b/g, ' ').match(/\b\d{2,3}\b/g) || []).filter(n => Number(n) < 1000);
    if (nums.length && !ues) setUes(nums.join(', '));
    const echap = t => String(t || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sec = sections.find(s => new RegExp(`\\b${echap(s.code)}\\b`, 'i').test(f.name))
      || sections.find(s => new RegExp(echap(String(s.libelle || s.code).slice(0, 8)), 'i').test(f.name));
    if (sec && !section) setSection(sec.code);
  }

  async function envoyer(simulation) {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/stages/lieux/import', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ section, ues, lignes: lu.lignes, simulation }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error || "L'import a échoué."); return; }
      setRapport(j);
      if (!simulation) onFini?.(j);
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const raison = !lu ? 'Déposez le classeur du répertoire.' : !section ? 'Choisissez la section.' : null;
  const fait = rapport && !rapport.simulation;

  return (
    <Fenetre icone={IconBuildingHospital} titre="Importer un répertoire de lieux de stage"
      sous="Type de lieu, responsable, organisme, adresse, demande" large="grande" onFermer={onClose}
      pied={<>
        <span className="text-second" style={{ color: erreur ? 'var(--c-refuse)' : undefined }}>
          {erreur || (fait ? 'Import terminé.' : raison) || ''}
        </span>
        <button type="button" className="bouton" onClick={onClose}>{fait ? 'Fermer' : 'Annuler'}</button>
        {!fait && (
          <button type="button" className={`bouton ${rapport ? '' : 'bouton-fort'}`} disabled={!!raison || enCours}
            onClick={() => envoyer(true)}>Simuler</button>
        )}
        {rapport?.simulation && (
          <button type="button" className="bouton bouton-fort" disabled={!!raison || enCours} onClick={() => envoyer(false)}>
            Importer {rapport.crees.length + rapport.completes.length} lieu(x)
          </button>
        )}
      </>}>
      <div className="grid md:grid-cols-3 gap-3 mb-4">
        <label className="md:col-span-1">
          <span className="block text-mention uppercase tracking-[.1em] text-slate-400 font-semibold mb-0.5">Classeur</span>
          <input type="file" accept=".xlsx,.xls,.csv" className="block w-full text-second"
            onChange={e => choisirFichier(e.target.files?.[0])} />
        </label>
        <label>
          <span className="block text-mention uppercase tracking-[.1em] text-slate-400 font-semibold mb-0.5">Section</span>
          <select className="controle w-full bg-white" value={section} onChange={e => { setSection(e.target.value); setRapport(null); }}>
            <option value="">— choisir —</option>
            {sections.map(s => <option key={s.code} value={s.code}>{s.libelle || s.code}</option>)}
          </select>
        </label>
        <label>
          <span className="block text-mention uppercase tracking-[.1em] text-slate-400 font-semibold mb-0.5">UE de stage concernées</span>
          <input className="controle w-full bg-white" value={ues} placeholder="77, 78, 79"
            onChange={e => { setUes(e.target.value); setRapport(null); }} />
        </label>
      </div>

      {lu && !rapport && (
        <p className="text-sm text-slate-700">
          <b>{lu.lignes.length}</b> lieu(x) lus dans la feuille « {lu.feuille} » — colonnes reconnues :
          {' '}{lu.colonnes.join(', ')}. Lancez la simulation pour voir ce qui sera écrit.
        </p>
      )}

      {rapport && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-second">
            <span className="rounded-full px-2.5 h-6 inline-flex items-center text-white font-semibold" style={{ background: 'var(--c-reussi)' }}>
              {rapport.crees.length} à créer</span>
            <span className="rounded-full px-2.5 h-6 inline-flex items-center text-white font-semibold" style={{ background: 'var(--c-disponible)' }}>
              {rapport.completes.length} déjà connu(s), complété(s)</span>
            {rapport.ignores.length > 0 && (
              <span className="rounded-full px-2.5 h-6 inline-flex items-center text-white font-semibold" style={{ background: 'rgb(var(--gris-400))' }}>
                {rapport.ignores.length} ignoré(s)</span>
            )}
            <span className="text-slate-500 self-center">Section {rapport.section}{rapport.ues ? ` · UE ${rapport.ues}` : ''}{rapport.simulation ? ' — simulation, rien n’est écrit' : ''}</span>
          </div>
          <div className="border border-slate-200 rounded-carte overflow-hidden">
            <table className="w-full text-second">
              <thead><tr className="tab-entete text-left text-mention uppercase tracking-[.08em] text-slate-500">
                <th className="px-3 py-1.5">Organisme</th><th className="px-3 py-1.5">Type</th>
                <th className="px-3 py-1.5">Adresse</th><th className="px-3 py-1.5">CP · localité</th><th className="px-3 py-1.5" /></tr></thead>
              <tbody>
                {[...rapport.crees.map(l => ({ ...l, etat: 'à créer' })), ...rapport.completes.map(l => ({ ...l, etat: 'complété' }))].map((l, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 font-semibold text-iip-texte">{l.nom}</td>
                    <td className="px-3 py-1.5 text-slate-600">{l.secteur || '—'}</td>
                    <td className="px-3 py-1.5 text-slate-600">{l.adresse || '—'}</td>
                    <td className="px-3 py-1.5 text-slate-600">{[l.cp, l.localite].filter(Boolean).join(' ') || <span className="text-[color:var(--c-attente)]">à compléter</span>}</td>
                    <td className="px-3 py-1.5 text-xs text-slate-400">{l.etat}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Fenetre>
  );
}
