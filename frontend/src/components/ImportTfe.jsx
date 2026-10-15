/**
 * IMPORTER DES TFE (3.1.378, Charles, 15 octobre 2026 : « je souhaite importer des données de TFE »).
 * Trois formes de fichier, une seule porte : un tableur (xlsx, ods, csv — « Étudiant.e | Titre », ou
 * « Nom | Prénom | Année | Section | Promoteur | Titre TFE »), ou le planning de défense en Word (un
 * tableau « Heures | noms | sujet | Président jury | Promoteur | Copromoteur | auditeur | lecteur », la
 * date dans le titre : « Vendredi 26 juin »). L'écran lit le fichier, le serveur retrouve étudiants et
 * jury ; simulation d'abord.
 */
import { useEffect, useState } from 'react';
import { IconUpload, IconCheck } from '@tabler/icons-react';
import { Fenetre } from './ui.jsx';
import { authHeaders } from '../lib/api.js';

const reduire = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Les en-têtes reconnus. « noms » / « étudiant.e » portent souvent « NOM Prénom » ensemble.
const CHAMPS = {
  nom: ['nom', 'noms', 'etudiant', 'etudiante', 'etudiante', 'etudiantetudiante', 'etudiants', 'nometudiant'],
  prenom: ['prenom', 'prenoms'],
  titre: ['titre', 'titretfe', 'titredutfe', 'sujet', 'intitule'],
  annee: ['annee', 'anneescolaire', 'anneeacademique'],
  section: ['section'],
  promoteur: ['promoteur', 'promotrice', 'promoteurtrice'],
  copromoteur: ['copromoteur', 'copromotrice'],
  lecteur: ['lecteur', 'lectrice', 'lecteurs'],
  auditeur: ['auditeur', 'auditrice'],
  president: ['presidentjury', 'president', 'presidente', 'presidentedejury', 'presidentdujury'],
  heure: ['heure', 'heures', 'horaire'],
  date_defense: ['date', 'datedefense', 'datededefense'],
};
const MOIS = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12 };
// « Vendredi 26 juin » dans l'année scolaire choisie : septembre-décembre = première année, sinon la seconde.
function dateDuTexte(t, annee) {
  const m = /(\d{1,2})\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)(?:\s+(\d{4}))?/i.exec(String(t || ''));
  if (!m) return null;
  const mois = MOIS[reduire(m[2])];
  const [a1, a2] = String(annee).split('-').map(Number);
  const an = m[3] ? Number(m[3]) : (mois >= 9 ? a1 : a2);
  return `${an}-${String(mois).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}
function lignesDuTableau(rows, annee, dateCommune = null) {
  const iTete = rows.findIndex(r => r.map(reduire).some(c => CHAMPS.titre.includes(c)) && r.map(reduire).some(c => CHAMPS.nom.includes(c)));
  if (iTete < 0) throw new Error("Je ne trouve pas de ligne d'en-tête avec un nom (Nom, Étudiant…) et un titre (Titre, Sujet).");
  const tete = rows[iTete].map(reduire);
  const col = Object.fromEntries(Object.entries(CHAMPS).map(([k, al]) => [k, tete.findIndex(c => al.includes(c))]));
  return rows.slice(iTete + 1).map(r => {
    const l = Object.fromEntries(Object.entries(col).filter(([, i]) => i >= 0).map(([k, i]) => [k, String(r[i] ?? '').trim()]));
    if (dateCommune && !l.date_defense) l.date_defense = dateCommune;
    if (l.date_defense && !/^\d{4}-\d{2}-\d{2}$/.test(l.date_defense)) l.date_defense = dateDuTexte(l.date_defense, annee) || '';
    return l;
  }).filter(l => l.nom && !/^x+$/i.test(l.nom) && (l.titre || l.promoteur || l.president));
}

export default function ImportTfe({ annee: anneeDefaut, onClose, onTermine }) {
  const [annee, setAnnee] = useState(anneeDefaut || '2025-2026');
  const [annees, setAnnees] = useState([]);
  const [fichiers, setFichiers] = useState([]);   // [{ nom, rows | docx: { tables, date } }]
  const [lignes, setLignes] = useState(null);
  const [rapport, setRapport] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    fetch('/api/annees', { headers: authHeaders() }).then(r => (r.ok ? r.json() : []))
      .then(l => setAnnees((Array.isArray(l) ? l : []).map(a => a.code || a).filter(Boolean))).catch(() => {});
  }, []);

  async function lireUn(f) {
    if (/\.docx$/i.test(f.name)) {
      const JSZip = (await import('jszip')).default;
      const xml = await (await JSZip.loadAsync(await f.arrayBuffer())).file('word/document.xml').async('string');
      const texte = x => x.replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
      const tables = [...xml.matchAll(/<w:tbl>([\s\S]*?)<\/w:tbl>/g)].map(t =>
        [...t[1].matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map(tr => [...tr[0].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map(tc => texte(tc[1]))));
      const avant = texte(xml.split('<w:tbl>')[0]);
      return { nom: f.name, tables, entete: avant };
    }
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: false, raw: false });
    return { nom: f.name, tables: wb.SheetNames.map(n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: false })), entete: '' };
  }
  async function deposer(liste) {
    setErreur(null); setRapport(null);
    try { setFichiers(await Promise.all([...liste].map(lireUn))); } catch (e) { setErreur(e.message); }
  }
  // Les lignes se recalculent quand l'année change (la date « 26 juin » en dépend).
  useEffect(() => {
    if (!fichiers.length) { setLignes(null); return; }
    try {
      const out = [];
      for (const f of fichiers) {
        const date = dateDuTexte(f.entete, annee);
        // Le président écrit dans le titre du planning (« Présidente de Jury Mme Loubna ROUGUI ») vaut pour les lignes sans président.
        const pres = /pr[ée]sident(?:e)?\s+(?:de\s+)?jury\s*\d*\s*:?\s*(?:m(?:me|r|lle)?\.?\s+)?(.+)$/i.exec(f.entete)?.[1]?.trim() || null;
        const lues = f.tables.flatMap(t => { try { return lignesDuTableau(t, annee, date); } catch { return []; } })
          .map(l => ({ ...l, president: l.president || pres || '', _fichier: f.nom }));
        if (!lues.length) throw new Error(`${f.nom} : je ne trouve pas de tableau avec un nom et un titre.`);
        out.push(...lues);
      }
      setLignes(out); setErreur(null); setRapport(null);
    } catch (e) { setErreur(e.message); setLignes(null); }
  }, [fichiers, annee]);

  async function executer(simulation) {
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch('/api/tfe/import', { method: 'POST', headers: authHeaders(), body: JSON.stringify({
        annee, lignes, simulation, origine: `import ${fichiers.map(f => f.nom).join(', ')}` }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setRapport(j);
      if (!simulation) onTermine?.();
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  }

  return (
    <Fenetre icone={IconUpload} titre="Importer des TFE" large="grande" onFermer={onClose}
      sous="Liste (nom, titre), tableau avec promoteur, ou planning de défense en Word — un ou plusieurs fichiers"
      pied={<>
        <span className="text-second text-slate-500 flex-1 min-w-0">{!lignes ? 'Déposez un ou plusieurs fichiers.' : `${lignes.length} TFE lus.`}</span>
        <button className={rapport?.simulation ? 'bouton' : 'bouton bouton-fort'} disabled={!lignes?.length || enCours} onClick={() => executer(true)}>
          {enCours ? 'Analyse…' : 'Simuler'}</button>
        {rapport?.simulation && (
          <button className="bouton bouton-fort inline-flex items-center gap-1.5" disabled={enCours} onClick={() => executer(false)}>
            <IconCheck size={15} /> Appliquer</button>)}
      </>}>
      <div className="space-y-4">
        {erreur && <div className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</div>}
        <div className="flex flex-wrap items-end gap-3">
          <label className="inline-flex items-center gap-2 bouton cursor-pointer">
            <IconUpload size={15} /> {fichiers.length ? fichiers.map(f => f.nom).join(', ') : 'Choisir les fichiers (.xlsx, .ods, .csv, .docx)'}
            <input type="file" multiple accept=".xls,.xlsx,.ods,.csv,.docx" className="hidden" onChange={e => e.target.files.length && deposer(e.target.files)} />
          </label>
          <label className="text-second text-slate-600">Année scolaire (si le fichier ne la donne pas)
            <select className="controle ml-2" value={annee} onChange={e => setAnnee(e.target.value)}>
              {[...new Set([annee, ...annees])].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
        </div>

        {lignes && !rapport && (
          <div className="max-h-72 overflow-auto border border-slate-200 rounded-carte">
            <table className="w-full text-second">
              <thead className="tab-entete"><tr>{['Étudiant', 'Titre', 'Défense', 'Président', 'Promoteur', 'Copromoteur', 'Lecteur', 'Auditeur'].map(h => <th key={h} className="px-2 py-1 text-left">{h}</th>)}</tr></thead>
              <tbody>{lignes.map((l, i) => (
                <tr key={i} className="border-t border-slate-100 align-top">
                  <td className="px-2 py-1 whitespace-nowrap">{[l.nom, l.prenom].filter(Boolean).join(' ')}</td>
                  <td className="px-2 py-1">{l.titre}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{[l.date_defense, l.heure].filter(Boolean).join(' · ')}</td>
                  <td className="px-2 py-1">{l.president}</td><td className="px-2 py-1">{l.promoteur}</td>
                  <td className="px-2 py-1">{l.copromoteur}</td><td className="px-2 py-1">{l.lecteur}</td><td className="px-2 py-1">{l.auditeur}</td>
                </tr>))}</tbody>
            </table>
          </div>)}

        {rapport && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-4 text-sm">
              <span><b>{rapport.crees}</b> TFE {rapport.simulation ? 'à créer' : 'créé(s)'}</span>
              <span><b>{rapport.completes}</b> {rapport.simulation ? 'à compléter' : 'complété(s)'}</span>
              {rapport.inchanges > 0 && <span><b>{rapport.inchanges}</b> inchangé(s)</span>}
              {rapport.ignores.length > 0 && <span><b>{rapport.ignores.length}</b> ignoré(s)</span>}
            </div>
            {rapport.ignores.length > 0 && (
              <div className="bloc-etat px-3 py-2 text-second" data-etat="surveiller">
                <b>Lignes ignorées</b> — à vérifier ou à encoder à la main dans l'onglet TFE :
                <ul className="mt-1 list-disc pl-5">{rapport.ignores.map((x, i) => <li key={i}>ligne {x.ligne} · {x.nom || '—'} : {x.raison}</li>)}</ul>
              </div>)}
            {rapport.jury_libre.length > 0 && (
              <div className="bloc-etat px-3 py-2 text-second" data-etat="surveiller">
                <b>{rapport.jury_libre.length} membre(s) du jury non reconnu(s) dans le personnel</b> — gardés tels quels, à rattacher dans l'onglet TFE :
                <ul className="mt-1 list-disc pl-5">{[...new Map(rapport.jury_libre.map(x => [x.texte, x])).values()].map((x, i) =>
                  <li key={i}>« {x.texte} »{x.ambigu ? ' (plusieurs personnes possibles)' : ''}</li>)}</ul>
              </div>)}
            <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-carte divide-y divide-slate-100">
              {rapport.details.map((d, i) => (
                <div key={i} className="px-3 py-1.5 text-second">
                  <div className="flex gap-2"><span className="font-semibold flex-1 min-w-0 truncate">{d.nom}</span><span className="text-slate-500">{d.action} · {d.annee}</span></div>
                  <div className="text-slate-600 truncate">{d.titre}</div>
                  {d.jury && <div className="text-slate-500 text-mention">{d.jury}</div>}
                </div>))}
            </div>
          </div>)}
      </div>
    </Fenetre>);
}
