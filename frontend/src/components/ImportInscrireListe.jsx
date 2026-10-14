/**
 * INSCRIRE UNE LISTE À DES UNITÉS (Charles, 14 octobre 2026 : « ces étudiants suivent un double cursus,
 * Optométrie et Opticien »). Une liste déposée — nom, prénom, matricule, NISS, coordonnées —, des
 * unités cochées : Lucie retrouve chacun (registre national, matricule ou matricule initial, puis nom +
 * prénom + naissance), ouvre les absents si on le demande, rattachés à la section choisie, et les
 * inscrit par la porte du PAE. Simulation d'abord ; ce qui enfreint une règle s'inscrit et se nomme.
 */
import { useEffect, useState } from 'react';
import { IconUpload, IconCheck } from '@tabler/icons-react';
import { Fenetre } from './ui.jsx';
import { authHeaders } from '../lib/api.js';

const reduire = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Les en-têtes reconnus, et ce qu'ils deviennent.
const CHAMPS = {
  nom: ['nom', 'nometud'], prenom: ['prenom', 'preetud'], matricule: ['matricule', 'idetud', 'noinit'],
  matricule_initial: ['matriculeinitial'], titre: ['titre', 'titremrmme'], sexe: ['sexe'],
  lieu_naissance: ['lieudenaissance', 'lieunais'], adresse: ['adresse', 'adrnbte'], cp: ['cp', 'codepostal'],
  localite: ['localite', 'loc'], date_naissance: ['datedenaissance', 'datnais', 'strdatnais'],
  num_national: ['niss', 'nnational', 'numeronational', 'regnat', 'registrenational'],
  email_perso: ['mailperso', 'emailperso', 'mailprive'], email_ecole: ['mailecole', 'emailecole', 'courriel'],
  gsm: ['telephone', 'gsm', 'gsmetud'],
};

export default function ImportInscrireListe({ annee, onClose, onTermine }) {
  const [lignes, setLignes] = useState(null);
  const [nomFichier, setNomFichier] = useState('');
  const [sections, setSections] = useState([]);
  const [sectionUe, setSectionUe] = useState('');
  const [ues, setUes] = useState([]);
  const [cochees, setCochees] = useState(new Set());
  const [rattachement, setRattachement] = useState('');
  const [creer, setCreer] = useState(true);
  const [remplacer, setRemplacer] = useState(false);
  const [rapport, setRapport] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() }).then(r => r.json())
      .then(l => setSections(Array.isArray(l) ? l.map(s => s.code) : [])).catch(() => {});
  }, []);
  useEffect(() => {
    if (!sectionUe) { setUes([]); return; }
    fetch(`/api/ref/ue?section=${encodeURIComponent(sectionUe)}&annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(r => r.json()).then(l => { const v = Array.isArray(l) ? l : []; setUes(v); setCochees(new Set(v.map(u => u.ue_num))); })
      .catch(() => setUes([]));
    setRapport(null);
  }, [sectionUe, annee]);

  async function lire(f) {
    setErreur(null); setRapport(null);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: false, raw: false });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false });
      // La ligne d'en-tête : la première qui porte « nom » et « prénom » (les titres au-dessus ne comptent pas).
      const iTete = rows.findIndex(r => r.map(reduire).includes('nom') && r.map(reduire).some(c => c === 'prenom' || c === 'preetud'));
      if (iTete < 0) throw new Error('Je ne trouve pas de ligne d’en-tête avec « NOM » et « Prénom ».');
      const tete = rows[iTete].map(reduire);
      const col = Object.fromEntries(Object.entries(CHAMPS).map(([k, al]) => [k, tete.findIndex(c => al.includes(c))]));
      const l = rows.slice(iTete + 1).filter(r => String(r[col.nom] ?? '').trim())
        .map(r => Object.fromEntries(Object.entries(col).filter(([, i]) => i >= 0).map(([k, i]) => [k, String(r[i] ?? '').trim()])));
      setLignes(l); setNomFichier(f.name);
    } catch (e) { setErreur(e.message); }
  }

  async function executer(simulation) {
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch('/api/etudiants/inscrire-liste', { method: 'POST', headers: authHeaders(), body: JSON.stringify({
        annee, lignes, ues: [...cochees], creer, section_rattachement: rattachement || null, simulation,
        remplacer_rattachement: remplacer,
        origine: `liste ${nomFichier}` }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setRapport(j);
      if (!simulation) onTermine?.();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const pret = lignes?.length && (!creer || rattachement);
  return (
    <Fenetre icone={IconUpload} titre="Inscrire une liste à des unités" large="moyenne" onFermer={onClose}
      sous={`Année ${annee} — retrouver, créer les absents, inscrire par la porte du PAE`}
      pied={<>
        <span className="text-second text-slate-500 flex-1 min-w-0">
          {!lignes ? 'Déposez la liste.' : creer && !rattachement ? 'Choisissez la section de rattachement des étudiants à créer.' : ''}
        </span>
        <button className={rapport?.simulation ? 'bouton' : 'bouton bouton-fort'} disabled={!pret || enCours} onClick={() => executer(true)}>
          {enCours ? 'Analyse…' : 'Simuler'}</button>
        {rapport?.simulation && (
          <button className="bouton bouton-fort inline-flex items-center gap-1.5" disabled={enCours} onClick={() => executer(false)}>
            <IconCheck size={15} /> Appliquer</button>)}
      </>}>
      <div className="space-y-4">
        {erreur && <div className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</div>}
        <label className="inline-flex items-center gap-2 bouton cursor-pointer">
          <IconUpload size={15} /> {nomFichier || 'Choisir la liste (.xlsx, .csv)'}
          <input type="file" accept=".xls,.xlsx,.csv" className="hidden" onChange={e => e.target.files[0] && lire(e.target.files[0])} />
        </label>
        {lignes && <p className="text-second text-slate-600">{lignes.length} étudiant(s) lus.</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-second text-slate-600">Unités de la section
            <select value={sectionUe} onChange={e => setSectionUe(e.target.value)} className="controle w-full mt-1">
              <option value="">— aucune inscription —</option>
              {sections.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="text-second text-slate-600">Section de rattachement (les créés ; les retrouvés si cochée ci-dessous)
            <select value={rattachement} onChange={e => setRattachement(e.target.value)} className="controle w-full mt-1">
              <option value="">—</option>
              {sections.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>

        {ues.length > 0 && (
          <div className="space-y-1">
            <div className="intertitre">Unités où les inscrire ({cochees.size} sur {ues.length})</div>
            {ues.map(u => (
              <label key={u.ue_num} className="flex items-center gap-2 text-second">
                <input type="checkbox" checked={cochees.has(u.ue_num)} onChange={() => setCochees(s => { const n = new Set(s); n.has(u.ue_num) ? n.delete(u.ue_num) : n.add(u.ue_num); return n; })} />
                <b>UE {u.ue_num}</b> {u.ue_nom}<span className="text-slate-400">{u.ue_quad ? ` · ${u.ue_quad}` : ''}</span>
              </label>))}
          </div>)}

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={remplacer} onChange={e => setRemplacer(e.target.checked)} disabled={!rattachement} />
          Rattacher aussi les étudiants retrouvés à cette section <span className="text-second text-slate-500">— remplace leur rattachement actuel (pour un double cursus : la section PRINCIPALE)</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={creer} onChange={e => setCreer(e.target.checked)} />
          Créer les étudiants absents de Lucie <span className="text-second text-slate-500">— simulez d'abord : la recherche passe par le registre national, le matricule, puis nom, prénom et naissance</span>
        </label>

        {rapport && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-3 text-sm">
              <span><b>{rapport.retrouves}</b> retrouvé(s)</span>
              <span><b>{rapport.crees}</b> {rapport.simulation ? 'à créer' : 'créé(s)'}</span>
              {rapport.completes > 0 && <span><b>{rapport.completes}</b> rattachement(s) {rapport.simulation ? 'à poser' : 'posé(s)'}</span>}
              <span><b>{rapport.inscriptions}</b> inscription(s) {rapport.simulation ? 'à poser' : 'posée(s)'}</span>
              {rapport.deja > 0 && <span><b>{rapport.deja}</b> déjà inscrite(s)</span>}
              {rapport.ignores.length > 0 && <span><b>{rapport.ignores.length}</b> ignorée(s)</span>}
            </div>
            {rapport.a_trancher?.length > 0 && (
              <div className="bloc-etat px-3 py-2 text-second" data-etat="surveiller">
                <b>{rapport.a_trancher.length} étudiant(s) d'une autre section</b> — ni rattachés ni inscrits (cochez « Rattacher aussi les retrouvés » pour forcer) :
                <ul className="mt-1 list-disc pl-5">{rapport.a_trancher.slice(0, 12).map((x, i) => <li key={i}>{x.nom} · {x.actuelle}</li>)}</ul>
              </div>)}
            {rapport.ecarts.length > 0 && (
              <div className="bloc-etat px-3 py-2 text-second" data-etat="surveiller">
                <b>{rapport.ecarts.length} inscription(s) hors des règles du PAE</b> — elles s'inscrivent et restent tracées :
                <ul className="mt-1 list-disc pl-5">{rapport.ecarts.slice(0, 12).map((x, i) => <li key={i}>{x.nom} · UE {x.ue_num} : {x.regles.join(', ')}</li>)}</ul>
              </div>)}
            {rapport.ignores.length > 0 && (
              <div className="text-second text-slate-600">Ignorées : {rapport.ignores.slice(0, 12).map(x => `ligne ${x.ligne} (${x.nom ? `${x.nom}, ` : ''}${x.raison})`).join(' · ')}</div>)}
            <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-carte divide-y divide-slate-100">
              {rapport.details.map((d, i) => (
                <div key={i} className="px-3 py-1 text-second flex gap-2">
                  <span className="flex-1 truncate">{d.nom}</span>
                  <span className="text-slate-500">{d.action}{d.methode ? ` (${d.methode})` : ''}{d.rattachement ? ` · ${d.rattachement}` : ''}</span>
                  {d.ajoutees && <span className="text-slate-500">+{d.ajoutees.length} UE</span>}
                </div>))}
            </div>
          </div>)}
      </div>
    </Fenetre>);
}
