/* LES FICHES D'ÉVALUATION (3.5.079, Charles, 2 novembre 2026 : « cette fiche doit être paramétrable en ligne par la
 * coordination TFE ou cursus ou la personne en charge des TFE ; de même pour les stages » ; « une fiche pour le lieu de
 * stage, une pour le superviseur… »). Face « Fiches » d'Organisation → TFE et d'Organisation → Stages.
 * Une fiche = son nom, qui la remplit, quand, et ses critères (un acquis, son poids, ce qu'on y regarde). Elle devient une
 * évaluation « acquis par acquis » du carnet du cours qui la porte : la note suit le chemin habituel vers la feuille de notes.
 * Qui règle : la direction, la coordination de la section, les responsables désignés (choisis ici). Serveur :
 * routes/fichesEvaluation.js. */
import { useEffect, useState } from 'react';
import { IconPlus, IconTrash, IconPencil, IconClipboardList, IconUserPlus } from '@tabler/icons-react';
import { EnteteCarte, Fenetre } from './ui.jsx';
import { authHeaders } from '../lib/api.js';
import { demander, informer } from '../lib/dialogue.jsx';

const appel = (url, o = {}) => fetch(url, { ...o, headers: { ...authHeaders(), ...(o.body ? { 'Content-Type': 'application/json' } : {}) } })
  .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); return j; });
const MODELES = {
  tfe: [{ intitule: 'Écrit', rempli_par: 'promoteur', moment: 'Avant la défense' }, { intitule: 'Oral', rempli_par: 'jury', moment: 'Après la défense, de commun accord' }],
  stage: [{ intitule: 'Fiche du lieu de stage', rempli_par: 'maitre_stage', moment: 'En fin de stage' }, { intitule: 'Fiche du superviseur', rempli_par: 'superviseur', moment: 'Après la dernière visite' }],
};

export default function FichesEvaluation({ annee, domaine }) {
  const [d, setD] = useState(null);
  const [edite, setEdite] = useState(null);
  const charger = () => appel(`/api/fiches-evaluation?annee=${encodeURIComponent(annee)}&domaine=${domaine}`).then(setD).catch(e => setD({ erreur: e.message }));
  useEffect(() => { if (annee) charger(); }, [annee, domaine]);
  if (!d) return <div className="text-sm text-slate-500">Chargement…</div>;
  if (d.erreur) return <div className="text-sm text-red-700">{d.erreur}</div>;
  const mot = domaine === 'tfe' ? 'épreuve intégrée' : 'UE de stage';
  if (!d.ues.length) return <div className="carte p-4 text-sm text-slate-600">Aucune {mot} en {annee} dont vous réglez les fiches. La direction, la coordination de la section et les responsables désignés les règlent.</div>;
  const sections = [...new Set(d.ues.map(u => u.section))];
  const retirer = async f => {
    if (!(await demander(`Supprimer la fiche « ${f.intitule} » de l’UE ${f.ue_num} ? Son évaluation quitte aussi le carnet.`))) return;
    try { await appel(`/api/fiches-evaluation/fiche/${f.id}`, { method: 'DELETE' }); charger(); } catch (e) { informer(`❌ ${e.message}`); }
  };
  return (
    <div className="space-y-4">
      <p className="text-second text-slate-500 m-0">Chaque fiche dit ce qu’on évalue (les acquis, leur poids, ce qu’on y regarde), qui la remplit et quand. Elle devient une évaluation du carnet de cotes du cours qui la porte, notée acquis par acquis : la note rejoint ensuite la feuille de notes comme toute autre.</p>
      {sections.map(section => {
        const s = d.sections.find(x => x.section === section);
        return (
          <div key={section} className="space-y-3">
            <Responsables s={s} domaine={domaine} comptes={d.comptes} recharger={charger} />
            {d.ues.filter(u => u.section === section).map(u => {
              const fiches = d.fiches.filter(f => f.ue_num === u.ue_num);
              return (
                <div key={u.ue_num} className="carte overflow-hidden">
                  <EnteteCarte icone={IconClipboardList} titre={`UE ${u.ue_num} — ${u.ue_nom}`} sous={`${fiches.length} fiche${fiches.length > 1 ? 's' : ''}`}>
                    <button className="bouton inline-flex items-center gap-1.5" onClick={() => setEdite({ ue: u, fiche: null })}><IconPlus size={15} /> Nouvelle fiche</button>
                  </EnteteCarte>
                  {!fiches.length ? (
                    <div className="p-4 text-sm text-slate-600 space-y-2">
                      <div>Aucune fiche. Pour commencer :</div>
                      <div className="flex flex-wrap gap-2">
                        {MODELES[domaine].map(m => <button key={m.intitule} className="bouton" onClick={() => setEdite({ ue: u, fiche: null, modele: m })}>{m.intitule}</button>)}
                      </div>
                    </div>
                  ) : (
                    <div className="divide-y" style={{ borderColor: 'var(--menu-bord)' }}>
                      {fiches.map(f => (
                        <div key={f.id} className="p-3 flex flex-wrap items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm">{f.intitule} <span className="text-slate-500 font-normal">· sur {f.sur} · poids {f.poids} · cours {f.cours_code}</span></div>
                            <div className="text-second text-slate-600">{d.rempli_par[f.rempli_par] || f.rempli_par}{f.moment ? ` — ${f.moment}` : ''}{f.notees ? ` · ${f.notees} note${f.notees > 1 ? 's' : ''}` : ''}</div>
                            <ul className="m-0 mt-1 pl-0 list-none text-second text-slate-600 space-y-0.5">
                              {f.criteres.map(c => <li key={c.aa_code}><b>{c.aa_code}</b> ({c.poids}){c.consigne ? ` — ${c.consigne}` : ''}</li>)}
                            </ul>
                          </div>
                          <div className="flex gap-1">
                            <button className="bouton" title="Modifier" onClick={() => setEdite({ ue: u, fiche: f })}><IconPencil size={15} /></button>
                            {!f.notees && <button className="bouton" title="Supprimer" onClick={() => retirer(f)}><IconTrash size={15} /></button>}
                          </div>
                        </div>))}
                    </div>)}
                </div>);
            })}
          </div>);
      })}
      {edite && <EditerFiche annee={annee} domaine={domaine} {...edite} rempliPar={d.rempli_par} onFermer={ok => { setEdite(null); if (ok) charger(); }} />}
    </div>
  );
}

function Responsables({ s, domaine, comptes, recharger }) {
  const [choix, setChoix] = useState('');
  if (!s) return null;
  const ecrire = async ids => {
    try { await appel('/api/fiches-evaluation/responsables', { method: 'PUT', body: JSON.stringify({ section: s.section, domaine, ids }) }); setChoix(''); recharger(); }
    catch (e) { informer(`❌ ${e.message}`); }
  };
  const ids = s.responsables.map(r => r.utilisateur_id);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="intertitre m-0">{s.section}</span>
      <span className="text-slate-500">Responsable{s.responsables.length > 1 ? 's' : ''} des fiches {domaine === 'tfe' ? 'TFE' : 'de stage'}, avec la coordination :</span>
      {s.responsables.length ? s.responsables.map(r => (
        <span key={r.utilisateur_id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5">{r.nom}
          {s.peut_designer && <button className="text-slate-400 hover:text-red-700" title="Retirer" onClick={() => ecrire(ids.filter(i => i !== r.utilisateur_id))}>×</button>}
        </span>)) : <span className="text-slate-500">aucun</span>}
      {s.peut_designer && (
        <span className="inline-flex items-center gap-1">
          <select className="controle" value={choix} onChange={e => setChoix(e.target.value)}>
            <option value="">Désigner…</option>
            {comptes.filter(c => !ids.includes(c.id)).map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
          <button className="bouton" disabled={!choix} title="Ajouter" onClick={() => ecrire([...ids, Number(choix)])}><IconUserPlus size={15} /></button>
        </span>)}
    </div>
  );
}

function EditerFiche({ annee, domaine, ue, fiche, modele, rempliPar, onFermer }) {
  const coursDefaut = fiche?.cours_code || ue.cours.find(c => c.acquis.length)?.cours_code || ue.cours[0]?.cours_code || '';
  const [f, setF] = useState(() => ({ intitule: fiche?.intitule || modele?.intitule || '', rempli_par: fiche?.rempli_par || modele?.rempli_par || '',
    moment: fiche?.moment || modele?.moment || '', sur: fiche?.sur ?? 20, poids: fiche?.poids ?? 1, cours_code: coursDefaut }));
  const [crit, setCrit] = useState(() => new Map((fiche?.criteres || []).map(c => [c.aa_code, { poids: c.poids, consigne: c.consigne || '' }])));
  const [envoi, setEnvoi] = useState(false);
  const acquis = ue.cours.find(c => c.cours_code === f.cours_code)?.acquis || [];
  const maj = (k, v) => setF(x => ({ ...x, [k]: v }));
  const cocher = (aa, oui) => setCrit(m => { const n = new Map(m); if (oui) n.set(aa, { poids: 1, consigne: '' }); else n.delete(aa); return n; });
  const majCrit = (aa, k, v) => setCrit(m => { const n = new Map(m); n.set(aa, { ...n.get(aa), [k]: v }); return n; });
  const pret = f.intitule.trim() && f.rempli_par && f.cours_code && crit.size;
  const enregistrer = async () => {
    setEnvoi(true);
    const criteres = acquis.filter(a => crit.has(a.aa_code)).map(a => ({ aa_code: a.aa_code, ...crit.get(a.aa_code) }));
    try {
      await appel(fiche ? `/api/fiches-evaluation/fiche/${fiche.id}` : '/api/fiches-evaluation/fiche',
        { method: fiche ? 'PUT' : 'POST', body: JSON.stringify({ ...f, annee, domaine, ue_num: ue.ue_num, criteres }) });
      onFermer(true);
    } catch (e) { informer(`❌ ${e.message}`); setEnvoi(false); }
  };
  return (
    <Fenetre icone={IconClipboardList} titre={fiche ? `Fiche « ${fiche.intitule} »` : 'Nouvelle fiche'} sous={`UE ${ue.ue_num} — ${ue.ue_nom}`} large="grande" onFermer={() => onFermer(false)}
      pied={<>
        <span className="text-second text-slate-500 min-w-0">{pret ? '' : 'Nommez la fiche, dites qui la remplit et cochez au moins un acquis.'}</span>
        <button className="bouton bouton-fort" disabled={!pret || envoi} onClick={enregistrer}>Enregistrer</button>
      </>}>
      <div className="space-y-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1"><span className="block text-slate-600">Nom de la fiche</span>
            <input className="controle w-full" value={f.intitule} maxLength={80} onChange={e => maj('intitule', e.target.value)} placeholder="Écrit, Oral, Fiche du lieu de stage…" /></label>
          <label className="space-y-1"><span className="block text-slate-600">Qui la remplit</span>
            <select className="controle w-full" value={f.rempli_par} onChange={e => maj('rempli_par', e.target.value)}>
              <option value="">—</option>
              {Object.entries(rempliPar).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></label>
          <label className="space-y-1"><span className="block text-slate-600">Quand</span>
            <input className="controle w-full" value={f.moment} maxLength={120} onChange={e => maj('moment', e.target.value)} placeholder="Avant la défense, en fin de stage…" /></label>
          <div className="grid grid-cols-3 gap-2">
            <label className="space-y-1 col-span-1"><span className="block text-slate-600">Sur</span>
              <input className="controle w-full" inputMode="decimal" value={f.sur} onChange={e => maj('sur', e.target.value)} /></label>
            <label className="space-y-1 col-span-2"><span className="block text-slate-600">Poids dans le carnet</span>
              <input className="controle w-full" inputMode="decimal" value={f.poids} onChange={e => maj('poids', e.target.value)} /></label>
          </div>
          <label className="space-y-1 sm:col-span-2"><span className="block text-slate-600">Cours qui porte la note</span>
            <select className="controle w-full" value={f.cours_code} disabled={!!fiche?.notees} onChange={e => { maj('cours_code', e.target.value); setCrit(new Map()); }}>
              {ue.cours.map(c => <option key={c.cours_code} value={c.cours_code}>{c.cours_code} — {c.cours_nom}{c.acquis.length ? '' : ' (aucun acquis lié)'}</option>)}
            </select></label>
        </div>
        <div>
          <div className="intertitre">Les critères : les acquis évalués par cette fiche</div>
          {!acquis.length ? <div className="text-slate-600">Aucun acquis n’est lié à ce cours. On les lie dans Organisation → Pondérations (ou dans la fiche de l’UE), puis on revient ici.</div> : (
            <div className="space-y-2">
              {acquis.map(a => {
                const c = crit.get(a.aa_code);
                return (
                  <div key={a.aa_code} className="rounded-champ border p-2" style={{ borderColor: 'var(--menu-bord)' }}>
                    <label className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" checked={!!c} onChange={e => cocher(a.aa_code, e.target.checked)} />
                      <span><b>{a.aa_code}</b> {a.description}</span>
                    </label>
                    {c && (
                      <div className="mt-2 ml-6 grid gap-2 sm:grid-cols-[6rem_1fr]">
                        <input className="controle" inputMode="decimal" value={c.poids} title="Poids de l’acquis dans la fiche" onChange={e => majCrit(a.aa_code, 'poids', e.target.value)} />
                        <input className="controle" maxLength={500} value={c.consigne} placeholder="Ce qu’on regarde (lu par qui note)" onChange={e => majCrit(a.aa_code, 'consigne', e.target.value)} />
                      </div>)}
                  </div>);
              })}
            </div>)}
        </div>
      </div>
    </Fenetre>
  );
}
