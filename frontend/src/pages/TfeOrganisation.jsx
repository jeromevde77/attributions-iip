/* L'ESPACE TFE (3.5.069, Charles, 2 novembre 2026 : « il faudra encore un espace TFE » ; tranché : sujets et promoteurs,
 * jalons et dépôts, défense et jury, lien avec l'épreuve intégrée). Organisation → TFE. Quatre faces :
 *   Vue d'ensemble — tous les TFE de l'année, promoteur et jury, remises, défense, décision de l'épreuve intégrée ;
 *   Sans TFE — les inscrits d'une épreuve intégrée dont aucun TFE n'est encodé : on pose le titre ;
 *   Remises — le calendrier de chaque section (projet, version intermédiaire, version finale…), ce qui est reçu, « Relancer » ;
 *   Défenses — date, heure, local et jury ; « Convoquer » l'étudiant et le jury, simulation d'abord.
 * Le TFE d'un étudiant est le même que celui de sa fiche (onglet TFE). Serveur : routes/tfe.js. */
import { useEffect, useMemo, useState } from 'react';
import { IconSend, IconUsers, IconPlus, IconTrash } from '@tabler/icons-react';
import { EnteteCarte, Tableau, TableauEntete, Th, Td, Tr, PastilleEtat, TuileEtat, Fenetre, OutilFenetre } from '../components/ui.jsx';
import { api, authHeaders } from '../lib/api.js';
import { demander, informer } from '../lib/dialogue.jsx';
import { Jury } from '../components/Tfe.jsx';

const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const appel = (url, o = {}) => fetch(url, { ...o, headers: { ...authHeaders(), ...(o.body ? { 'Content-Type': 'application/json' } : {}) } })
  .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); return j; });
const nomEtud = t => `${String(t.etud_nom || '').toUpperCase()} ${t.etud_prenom || ''}`.trim();
const promoteur = t => (t.membres || []).filter(m => m.role === 'promoteur').map(m => m.nom || `« ${m.nom_libre} »`).join(', ');
const ETAT_EI = { reussi: 'reussi', faveur: 'faveur', ajourne: 'surveiller', refuse: 'corriger' };
const MOT_EI = { reussi: 'Réussie', faveur: 'Réussie (faveur)', ajourne: 'Ajournée', refuse: 'Refusée' };

export default function TfeOrganisation({ annee }) {
  const [face, setFace] = useState(() => { try { return new URLSearchParams(window.location.search).get('face') || 'ensemble'; } catch { return 'ensemble'; } });
  const [d, setD] = useState(null);
  const [profs, setProfs] = useState([]);
  const [jury, setJury] = useState(null);
  const charger = () => appel(`/api/tfe/annee?annee=${encodeURIComponent(annee)}`).then(setD).catch(e => setD({ erreur: e.message }));
  useEffect(() => { if (annee) charger(); }, [annee]);
  useEffect(() => {
    api.professeurs(true).then(l => setProfs((Array.isArray(l) ? l : []).filter(p => !p.est_a_designer).sort((a, b) =>
      `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr')))).catch(() => {});
  }, []);
  const faces = [['ensemble', 'Vue d’ensemble'], ['sans', `Sans TFE${d?.synthese?.sans_tfe ? ` (${d.synthese.sans_tfe})` : ''}`],
    ['remises', `Remises${d?.synthese?.en_retard ? ` (${d.synthese.en_retard} en retard)` : ''}`], ['defenses', 'Défenses']];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="titre-ecran">Travaux de fin d’études</h1>
        <p className="text-second text-slate-500">Les TFE de {annee} : sujets et promoteurs, remises attendues, défenses et jurys. Le TFE d’un étudiant se retouche aussi dans sa fiche, onglet TFE.</p>
      </div>
      <div className="flex flex-nowrap gap-1 border-b overflow-x-auto" style={{ borderColor: 'var(--menu-bord)' }}>
        {faces.map(([k, l]) => <button key={k} onClick={() => setFace(k)} className={`onglet-page ${face === k ? 'onglet-page-actif' : ''}`}>{l}</button>)}
      </div>
      {!d ? <div className="text-sm text-slate-500">Chargement…</div> : d.erreur ? <div className="text-sm text-red-700">{d.erreur}</div> : <>
        {face === 'ensemble' && <Ensemble d={d} ouvrirJury={setJury} />}
        {face === 'sans' && <SansTfe d={d} annee={annee} recharger={charger} />}
        {face === 'remises' && <Remises d={d} annee={annee} recharger={charger} />}
        {face === 'defenses' && <Defenses d={d} recharger={charger} ouvrirJury={setJury} />}
      </>}
      {jury && (
        <Fenetre icone={IconUsers} titre={`Jury — ${nomEtud(jury)}`} sous={jury.titre} onFermer={() => { setJury(null); charger(); }}>
          <Jury membres={jury.membres || []} profs={profs} peutEcrire
            onChange={async m => {
              const nom = id => { const p = profs.find(x => x.id === id); return p ? `${String(p.nom).toUpperCase()} ${p.prenom || ''}`.trim() : null; };
              try { await appel(`/api/tfe/${jury.id}`, { method: 'PUT', body: JSON.stringify({ membres: m }) }); setJury(j => ({ ...j, membres: m.map(x => ({ ...x, nom: nom(x.professeur_id) })) })); }
              catch (e) { informer(`❌ ${e.message}`); }
            }} />
        </Fenetre>)}
    </div>
  );
}

function Filtres({ d, section, setSection, q, setQ }) {
  return <>
    <input className="controle border border-slate-300 rounded-champ text-sm w-48" placeholder="Étudiant, titre…" value={q} onChange={e => setQ(e.target.value)} />
    <select className="controle border border-slate-300 rounded-champ text-sm" value={section} onChange={e => setSection(e.target.value)}>
      <option value="">Toutes les sections</option>{d.sections.map(s => <option key={s}>{s}</option>)}</select>
  </>;
}
const garde = (section, q) => t => (!section || t.section === section)
  && (!q || `${t.etud_nom} ${t.etud_prenom} ${t.titre || ''}`.toLowerCase().includes(q.toLowerCase()));

function Ensemble({ d, ouvrirJury }) {
  const [section, setSection] = useState('');
  const [q, setQ] = useState('');
  const liste = d.tfe.filter(garde(section, q));
  const sy = d.synthese;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <TuileEtat valeur={sy.total} libelle="TFE encodés" />
        <TuileEtat etat={sy.sans_tfe ? 'surveiller' : 'reussi'} valeur={sy.sans_tfe} libelle="inscrits à l’EI sans TFE" />
        <TuileEtat etat={sy.sans_promoteur ? 'surveiller' : 'reussi'} valeur={sy.sans_promoteur} libelle="sans promoteur" />
        <TuileEtat etat={sy.en_retard ? 'corriger' : 'reussi'} valeur={sy.en_retard} libelle="remises en retard" />
        <TuileEtat etat="neutre" valeur={`${sy.defense_posee} / ${sy.total}`} libelle="défenses fixées" />
      </div>
      <div className="carte overflow-hidden">
        <EnteteCarte titre={`${liste.length} TFE`} sous="La décision de l’épreuve intégrée se lit de la délibération de l’unité ; elle ne s’écrit pas ici.">
          <Filtres d={d} section={section} setSection={setSection} q={q} setQ={setQ} />
        </EnteteCarte>
        <Tableau dense>
          <TableauEntete><Th>Étudiant</Th><Th>Section</Th><Th>Titre</Th><Th>Promoteur</Th><Th>Remises</Th><Th>Défense</Th><Th>Épreuve intégrée</Th><Th /></TableauEntete>
          <tbody>{liste.map(t => {
            const recues = t.remises.filter(r => r.recu_le).length;
            return (
              <Tr key={t.id}>
                <Td><a className="hover:underline underline-offset-2" href={`/etudiants?q=${encodeURIComponent(t.etud_nom)}`}>{nomEtud(t)}</a></Td>
                <Td ton="secondaire">{t.section || '—'}</Td>
                <Td><span className="line-clamp-2">{t.titre}</span></Td>
                <Td>{promoteur(t) || <PastilleEtat etat="surveiller">à désigner</PastilleEtat>}</Td>
                <Td>{t.remises.length ? <span className="tabular-nums">{recues} / {t.remises.length}</span> : <span className="text-slate-400">—</span>}
                  {t.en_retard.length > 0 && <> <PastilleEtat etat="corriger">{t.en_retard.length} en retard</PastilleEtat></>}</Td>
                <Td ton="secondaire">{t.date_defense ? `${fr(t.date_defense)}${t.heure_defense ? ` · ${t.heure_defense}` : ''}` : '—'}</Td>
                <Td>{t.ei?.resultat ? <PastilleEtat etat={ETAT_EI[t.ei.resultat] || 'neutre'}>{MOT_EI[t.ei.resultat] || t.ei.resultat}{t.ei.points != null ? ` · ${t.ei.points}` : ''}</PastilleEtat>
                  : t.ei ? <span className="text-slate-400">non délibérée</span> : <span className="text-slate-400">pas inscrit</span>}</Td>
                <Td align="droite"><button type="button" className="bouton px-2 py-0.5 text-second inline-flex items-center gap-1" onClick={() => ouvrirJury(t)}><IconUsers size={13} /> Jury</button></Td>
              </Tr>);
          })}</tbody>
        </Tableau>
        {!liste.length && <p className="px-4 py-3 text-second text-slate-500 m-0">Aucun TFE encodé pour {d.annee}{section ? ` en ${section}` : ''}.</p>}
      </div>
    </div>
  );
}

function SansTfe({ d, annee, recharger }) {
  const [titres, setTitres] = useState({});
  const [section, setSection] = useState('');
  const liste = d.sans_tfe.filter(x => !section || x.section === section);
  async function creer(x) {
    const titre = (titres[x.etudiant_id] || '').trim();
    if (!titre) return;
    try { await appel('/api/tfe', { method: 'POST', body: JSON.stringify({ etudiant_id: x.etudiant_id, annee_scolaire: annee, ue_num: x.ue_num, titre }) }); recharger(); }
    catch (e) { informer(`❌ ${e.message}`); }
  }
  return (
    <div className="carte overflow-hidden">
      <EnteteCarte titre={`${liste.length} inscrit(s) à une épreuve intégrée sans TFE`} sous="Le titre est la seule chose demandée ; promoteur, jury et dates se posent ensuite.">
        <select className="controle border border-slate-300 rounded-champ text-sm" value={section} onChange={e => setSection(e.target.value)}>
          <option value="">Toutes les sections</option>{d.sections.map(s => <option key={s}>{s}</option>)}</select>
      </EnteteCarte>
      <Tableau dense>
        <TableauEntete><Th>Étudiant</Th><Th>Section</Th><Th>Épreuve intégrée</Th><Th>Titre du TFE</Th><Th /></TableauEntete>
        <tbody>{liste.map(x => (
          <Tr key={`${x.etudiant_id}-${x.ue_num}`}>
            <Td>{nomEtud(x)}</Td><Td ton="secondaire">{x.section || '—'}</Td><Td ton="secondaire">UE {x.ue_num}</Td>
            <Td><input className="controle w-full min-w-[260px]" placeholder="Titre du travail" value={titres[x.etudiant_id] || ''}
              onChange={e => setTitres(t => ({ ...t, [x.etudiant_id]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') creer(x); }} /></Td>
            <Td align="droite"><button type="button" className="bouton controle inline-flex items-center gap-1" disabled={!(titres[x.etudiant_id] || '').trim()} onClick={() => creer(x)}><IconPlus size={14} /> Créer</button></Td>
          </Tr>))}</tbody>
      </Tableau>
      {!liste.length && <p className="px-4 py-3 text-second text-slate-500 m-0">Chaque inscrit d’une épreuve intégrée a son TFE.</p>}
    </div>
  );
}

function Remises({ d, annee, recharger }) {
  const [section, setSection] = useState(d.sections[0] || '');
  const jalons = d.jalons.filter(j => j.section === section);
  const [brouillon, setBrouillon] = useState(null);
  useEffect(() => setBrouillon(null), [section]);
  const liste = d.tfe.filter(t => t.section === section);
  const edition = brouillon || jalons.map(j => ({ id: j.id, libelle: j.libelle, date_limite: j.date_limite || '' }));
  async function enregistrer() {
    try { await appel('/api/tfe/jalons', { method: 'PUT', body: JSON.stringify({ annee, section, jalons: edition }) }); setBrouillon(null); recharger(); }
    catch (e) { informer(`❌ ${e.message}`); }
  }
  async function cocher(t, r) {
    try { await appel(`/api/tfe/${t.id}/remise`, { method: 'PUT', body: JSON.stringify({ jalon_id: r.jalon_id, recu_le: r.recu_le ? null : aujourdhui() }) }); recharger(); }
    catch (e) { informer(`❌ ${e.message}`); }
  }
  async function relancer(t) {
    if (!(await demander(`Relancer ${nomEtud(t)} pour : ${t.en_retard.join(', ')} ? Le courriel part à son adresse d’école.`))) return;
    try { const j = await appel(`/api/tfe/${t.id}/relancer`, { method: 'POST' }); informer(`✓ Relance envoyée à ${j.a}.`); recharger(); }
    catch (e) { informer(`❌ ${e.message}`); }
  }
  const auj = aujourdhui();
  return (
    <div className="space-y-4">
      <div className="flex flex-nowrap items-center gap-2">
        <span className="text-second text-slate-600">Section</span>
        <select className="controle border border-slate-300 rounded-champ text-sm" value={section} onChange={e => setSection(e.target.value)}>
          {d.sections.map(s => <option key={s}>{s}</option>)}</select>
      </div>
      <div className="carte overflow-hidden">
        <EnteteCarte titre="Le calendrier des remises" sous={`Ce que les étudiants de ${section || '…'} remettent, et pour quand : projet, version intermédiaire, version finale…`}>
          <button type="button" className="bouton controle inline-flex items-center gap-1" onClick={() => setBrouillon([...edition, { libelle: '', date_limite: '' }])}><IconPlus size={14} /> Remise</button>
          {brouillon && <button type="button" className="bouton bouton-fort controle" onClick={enregistrer}>Enregistrer</button>}
        </EnteteCarte>
        <div className="p-4 space-y-2">
          {edition.map((j, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className="controle flex-1 min-w-0" placeholder="Projet de TFE, version intermédiaire…" value={j.libelle}
                onChange={e => setBrouillon(edition.map((x, k) => (k === i ? { ...x, libelle: e.target.value } : x)))} />
              <input type="date" className="controle" value={j.date_limite || ''}
                onChange={e => setBrouillon(edition.map((x, k) => (k === i ? { ...x, date_limite: e.target.value } : x)))} />
              <button type="button" className="bouton" title="Retirer" onClick={() => setBrouillon(edition.filter((_, k) => k !== i))}><IconTrash size={14} /></button>
            </div>))}
          {!edition.length && <p className="text-second text-slate-500 m-0">Aucune remise prévue pour cette section.</p>}
        </div>
      </div>
      {jalons.length > 0 && (
        <div className="carte overflow-hidden">
          <EnteteCarte titre={`${liste.length} TFE en ${section}`} sous="Un clic sur une case marque la remise reçue aujourd’hui ; un second l’efface." />
          <Tableau dense>
            <TableauEntete><Th>Étudiant</Th>{jalons.map(j => <Th key={j.id}>{j.libelle}<div className="text-mention text-slate-500 font-normal">{fr(j.date_limite)}</div></Th>)}<Th /></TableauEntete>
            <tbody>{liste.map(t => (
              <Tr key={t.id}>
                <Td>{nomEtud(t)}</Td>
                {t.remises.map(r => {
                  const retard = !r.recu_le && r.date_limite && r.date_limite < auj;
                  return <Td key={r.jalon_id}><button type="button" className="bouton px-2 py-0.5 text-second" onClick={() => cocher(t, r)}>
                    {r.recu_le ? <PastilleEtat etat="reussi">reçu {fr(r.recu_le)}</PastilleEtat> : retard ? <PastilleEtat etat="corriger">en retard</PastilleEtat> : <span className="text-slate-400">attendu</span>}
                  </button></Td>;
                })}
                <Td align="droite">{t.en_retard.length > 0 && <button type="button" className="bouton px-2 py-0.5 text-second inline-flex items-center gap-1" onClick={() => relancer(t)}><IconSend size={13} /> Relancer</button>}
                  {t.relance_le && <div className="text-mention text-slate-400">relancé le {fr(t.relance_le)}</div>}</Td>
              </Tr>))}</tbody>
          </Tableau>
        </div>)}
    </div>
  );
}

function Defenses({ d, recharger, ouvrirJury }) {
  const [section, setSection] = useState('');
  const [q, setQ] = useState('');
  const [choix, setChoix] = useState(() => new Set(d.tfe.filter(t => t.date_defense && !t.convoque_le).map(t => t.id)));
  const [sim, setSim] = useState(null);
  const liste = useMemo(() => d.tfe.filter(garde(section, q)).slice()
    .sort((a, b) => `${a.date_defense || '9999'} ${a.heure_defense || ''}`.localeCompare(`${b.date_defense || '9999'} ${b.heure_defense || ''}`)), [d, section, q]);
  async function poser(t, champ, valeur) {
    if ((t[champ] || '') === (valeur || '')) return;
    try { await appel(`/api/tfe/${t.id}`, { method: 'PUT', body: JSON.stringify({ [champ]: valeur }) }); recharger(); }
    catch (e) { informer(`❌ ${e.message}`); }
  }
  const basculer = id => setChoix(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  async function simuler() {
    try { setSim(await appel('/api/tfe/convoquer', { method: 'POST', body: JSON.stringify({ ids: [...choix], simulation: true }) })); }
    catch (e) { informer(`❌ ${e.message}`); }
  }
  async function envoyer() {
    try {
      const j = await appel('/api/tfe/convoquer', { method: 'POST', body: JSON.stringify({ ids: [...choix], simulation: false }) });
      setSim(null); setChoix(new Set()); recharger();
      informer(`✓ ${j.envoyes.length} convocation(s) envoyée(s).${j.echecs.length ? ` ${j.echecs.length} échec(s) : ${j.echecs.map(e => e.nom).join(', ')}.` : ''}`);
    } catch (e) { informer(`❌ ${e.message}`); }
  }
  return (
    <div className="carte overflow-hidden">
      <EnteteCarte titre="Le planning des défenses" sous="Date, heure et local s’enregistrent en quittant la case. La convocation part à l’étudiant (adresse d’école) et à chaque membre du jury.">
        <Filtres d={d} section={section} setSection={setSection} q={q} setQ={setQ} />
        <button type="button" className="bouton bouton-fort controle inline-flex items-center gap-1" disabled={!choix.size} onClick={simuler}><IconSend size={14} /> Convoquer ({choix.size})</button>
      </EnteteCarte>
      <Tableau dense>
        <TableauEntete><Th /><Th>Étudiant</Th><Th>Date</Th><Th>Heure</Th><Th>Local</Th><Th>Jury</Th><Th>Convoqué</Th></TableauEntete>
        <tbody>{liste.map(t => (
          <Tr key={t.id}>
            <Td><input type="checkbox" checked={choix.has(t.id)} onChange={() => basculer(t.id)} /></Td>
            <Td><div>{nomEtud(t)}</div><div className="text-mention text-slate-500 line-clamp-1">{t.titre}</div></Td>
            <Td><input type="date" className="controle" defaultValue={t.date_defense || ''} onBlur={e => poser(t, 'date_defense', e.target.value)} /></Td>
            <Td><input className="controle w-20" placeholder="9h30" defaultValue={t.heure_defense || ''} onBlur={e => poser(t, 'heure_defense', e.target.value)} /></Td>
            <Td><input className="controle w-28" placeholder="Local" defaultValue={t.local_defense || ''} onBlur={e => poser(t, 'local_defense', e.target.value)} /></Td>
            <Td><button type="button" className="bouton px-2 py-0.5 text-second inline-flex items-center gap-1" onClick={() => ouvrirJury(t)}><IconUsers size={13} /> {t.membres.length || 'à composer'}</button>
              {t.sans_jury && <> <PastilleEtat etat="surveiller">sans promoteur</PastilleEtat></>}</Td>
            <Td ton="secondaire">{t.convoque_le ? fr(t.convoque_le) : '—'}</Td>
          </Tr>))}</tbody>
      </Tableau>
      {sim && (
        <Fenetre icone={IconSend} titre="Convoquer à la défense" sous={`${sim.envoyables} convocation(s) prête(s) sur ${sim.lignes.length}`} onFermer={() => setSim(null)}
          outils={<OutilFenetre Icone={IconSend} titre={`Envoyer ${sim.envoyables} convocation(s)`} disabled={!sim.envoyables} onClick={envoyer} />}
          pied={<span className="text-second text-slate-500 min-w-0">{sim.envoyables ? 'L’avion du bandeau envoie : chaque personne reçoit un courriel.' : 'Rien ne peut partir : complétez d’abord ce qui manque.'}</span>}>
          <div className="space-y-2">
            {sim.lignes.map(l => (
              <div key={l.id} className="bloc-etat px-3 py-2 text-sm" data-etat={l.manque.length ? 'surveiller' : 'reussi'}>
                <b>{l.nom}</b>{l.deja ? <span className="text-slate-500"> · déjà convoqué le {fr(l.deja)}</span> : null}
                {l.manque.length ? <div>Manque : {l.manque.join(', ')} — ne part pas.</div> : <div className="text-second">À : {l.dest.join(' · ')}</div>}
                {l.sans_adresse.length > 0 && <div className="text-second">Sans adresse, non prévenu(s) : {l.sans_adresse.join(', ')}</div>}
              </div>))}
          </div>
        </Fenetre>)}
    </div>
  );
}
