/* (CS) L'ÉVALUATION DU PERSONNEL — l'écran (3.5.605 ; serveur : backend/src/lib/evaluationPersonnel.js, routes/evaluations.js).
   Personnel → Évaluations, l'adresse /evaluations, et l'espace enseignant pour l'évalué. Le code (TOTP, ou envoyé par courriel à qui
   n'a pas d'application) est redemandé à l'entrée et vaut 15 minutes sans activité. L'aveugle est tenu par le serveur : l'écran ne
   reçoit pas la grille de l'autre partie avant la synthèse. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { IconLock, IconPlus, IconArrowLeft, IconFileTypePdf, IconCheck, IconTrash } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { demander, saisir } from '../lib/dialogue.jsx';
import { EnteteCarte, Tableau, TableauEntete, Th, Td, Tr, PastilleEtat, TuileEtat, Encadre } from '../components/ui.jsx';

const API = '/api/evaluations';
const ETAT_PASTILLE = { brouillon: 'neutre', ouverte: 'disponible', attente: 'surveiller', synthese: 'disponible', entretien: 'disponible', validee: 'reussi', archivee: 'indisponible' };
const ROLE = { evalue: 'Évalué·e', evaluateur: 'Évaluateur', gestionnaire: 'Direction' };
const CLASSE = { concordant: ['Concordant', 'reussi'], proche: ['Proche', 'neutre'], divergent: ['Divergent', 'corriger'], clarifier: ['À clarifier', 'surveiller'], incomplet: ['—', 'neutre'], une_lecture: ['Une lecture', 'neutre'] };
const ETAPES = [['brouillon', 'Brouillon'], ['ouverte', 'Ouverte'], ['attente', 'En attente'], ['synthese', 'Synthèse'], ['entretien', 'Entretien'], ['validee', 'Validée'], ['archivee', 'Archivée']];
const dateFr = d => (d ? new Date(String(d).length <= 10 ? `${d}T12:00:00` : `${String(d).replace(' ', 'T')}Z`).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');

async function appel(chemin, options = {}) {
  const r = await fetch(`${API}${chemin}`, { ...options, headers: { ...authHeaders(), ...(options.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `Erreur ${r.status}`), { reauth: !!j.reauth, statut: r.status });
  return j;
}
const corps = b => ({ body: JSON.stringify(b) });

/* ── Le verrou ─────────────────────────────────────────────────────────── */
function Verrou({ onOuvert }) {
  const [etat, setEtat] = useState(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState(null);
  useEffect(() => { appel('/deverrou').then(j => (j.ouvert ? onOuvert() : setEtat(j))).catch(e => setMsg(e.message)); }, [onOuvert]);
  const envoyer = async () => { setMsg(null); try { await appel('/deverrou/code', { method: 'POST' }); setMsg(`Code envoyé à ${etat.email}. Il vaut dix minutes.`); } catch (e) { setMsg(e.message); } };
  const valider = async e => { e.preventDefault(); setMsg(null); try { await appel('/deverrou', { method: 'POST', ...corps({ code }) }); onOuvert(); } catch (x) { setMsg(x.message); setCode(''); } };
  if (!etat) return <div className="p-6 text-slate-400 text-sm">{msg || 'Chargement…'}</div>;
  return (
    <section className="carte overflow-hidden max-w-md">
      <EnteteCarte icone={IconLock} titre="Les évaluations sont protégées" sous={`Votre code est redemandé à l’entrée ; il vaut ${etat.duree_min} minutes sans activité.`} />
      <form className="px-4 py-4 space-y-3 text-sm" onSubmit={valider}>
        {!etat.cle && <Encadre etat="corriger">La clé de chiffrement des évaluations n’est pas posée sur ce serveur : rien ne peut s’y écrire.</Encadre>}
        {etat.mode === 'totp'
          ? <p>Saisissez le code à six chiffres de votre application d’authentification.</p>
          : <p>Recevez un code à votre adresse ({etat.email}) : <button type="button" className="bouton" onClick={envoyer}>M’envoyer un code</button></p>}
        <div className="flex gap-2">
          <input className="controle w-36 tracking-widest text-center" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
            value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" aria-label="Code" autoFocus />
          <button type="submit" className="bouton bouton-fort" disabled={code.length !== 6}>Ouvrir</button>
        </div>
        {msg && <div className="text-second text-slate-600">{msg}</div>}
      </form>
    </section>);
}

/* ── Les échelles, toujours visibles ───────────────────────────────────── */
function Echelles({ echelles, utilisees }) {
  return (
    <aside className="carte overflow-hidden lg:sticky lg:top-4 self-start">
      <EnteteCarte titre="Les échelles" />
      <div className="px-3 py-2 space-y-3 text-second">
        {utilisees.map(k => echelles[k] && (
          <div key={k}><div className="font-medium mb-1">{echelles[k].titre}</div>
            <ul className="space-y-1">{echelles[k].valeurs.map(v => <li key={v.v}><b>{v.v}</b> {v.l}{v.d ? <span className="text-slate-500"> — {v.d}</span> : null}</li>)}</ul></div>))}
      </div>
    </aside>);
}

/* Un choix unique par boutons — jamais un nombre tapé. */
function Choix({ echelle, valeur, onChange, lecture }) {
  return (
    <div className="segments" role="radiogroup">
      {echelle.valeurs.map(v => (
        <button key={v.v} type="button" role="radio" aria-checked={valeur === v.v} disabled={lecture} title={v.l}
          className={valeur === v.v ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'} onClick={() => onChange(valeur === v.v ? null : v.v)}>{v.v}</button>))}
    </div>);
}

/* ── La grille ─────────────────────────────────────────────────────────── */
function Grille({ ev, contenu: initial, lecture, onRecharger }) {
  const [c, setC] = useState(initial || {});
  const [etat, setEtat] = useState('');
  const premier = useRef(true);
  const sections = ev.referentiel?.structure?.sections || [];
  const maj = (id, champ, v) => setC(x => ({ ...x, [id]: { ...(x[id] || {}), [champ]: v } }));
  useEffect(() => {
    if (premier.current) { premier.current = false; return undefined; }
    if (lecture) return undefined;
    setEtat('à enregistrer');
    const t = setTimeout(() => appel(`/${ev.id}/grille`, { method: 'PUT', ...corps({ contenu: c }) })
      .then(() => setEtat('enregistré')).catch(e => setEtat(e.message)), 1200);
    return () => clearTimeout(t);
  }, [c]); // eslint-disable-line react-hooks/exhaustive-deps
  const soumettre = async () => {
    if (!(await demander({ titre: 'Soumettre ma grille', confirmer: 'Soumettre', annuler: 'Pas encore',
      message: 'Une grille soumise ne se modifie plus. L’autre partie ne la verra qu’une fois sa propre grille soumise.' }))) return;
    try { await appel(`/${ev.id}/grille`, { method: 'PUT', ...corps({ contenu: c }) }); await appel(`/${ev.id}/soumettre`, { method: 'POST' }); onRecharger(); }
    catch (e) { setEtat(e.message); }
  };
  const texte = (id, champ = 't', ph = '') => (
    <textarea className="controle w-full !h-auto mt-1" rows={2} disabled={lecture} data-reponses="non" placeholder={ph}
      value={c[id]?.[champ] || ''} onChange={e => maj(id, champ, e.target.value)} />);
  const utilisees = [...new Set(sections.map(s => s.echelle).filter(Boolean))];
  return (
    <div className="grid lg:grid-cols-[1fr_18rem] gap-4">
      <div className="space-y-4 min-w-0">
        {sections.map(s => {
          const ech = ev.echelles[s.echelle];
          const criteres = s.type === 'objectifs' ? ev.objectifs.map(o => ({ id: `o:${o.id}`, libelle: o.libelle })) : (s.criteres || []);
          const libres = c[`libres:${s.id}`] || [];
          return (
            <section key={s.id} className="carte overflow-hidden">
              <EnteteCarte titre={s.titre} />
              <div className="px-4 py-3 space-y-4 text-sm">
                {s.type === 'texte' && (s.champs || []).map(ch => <label key={ch.id} className="block"><span className="font-medium">{ch.libelle}</span>{texte(ch.id)}</label>)}
                {s.type === 'objectifs' && !criteres.length && <p className="text-slate-500">Aucun objectif n’a été fixé pour cette période.</p>}
                {criteres.map(cr => (
                  <div key={cr.id} className="space-y-1">
                    <div className="font-medium">{cr.libelle}</div>
                    {s.type === 'objectifs' && texte(cr.id, 'ind', 'L’indicateur : ce qui montre où l’on en est')}
                    <Choix echelle={ech} valeur={c[cr.id]?.v ?? null} lecture={lecture} onChange={v => maj(cr.id, 'v', v)} />
                    {s.type === 'techniques'
                      ? <label className="flex items-center gap-2 text-second"><input type="checkbox" disabled={lecture} checked={!!c[cr.id]?.f} onChange={e => maj(cr.id, 'f', e.target.checked)} /> besoin de formation</label>
                      : texte(cr.id, 't', s.type === 'missions' ? 'Un incident critique : un fait précis qui illustre' : s.type === 'objectifs' ? 'Les facteurs explicatifs' : 'Un exemple')}
                  </div>))}
                {s.libres && <>
                  {libres.map((l, i) => (
                    <div key={l.id} className="space-y-1">
                      <div className="flex gap-2"><input className="controle flex-1" disabled={lecture} value={l.libelle} placeholder="La mission"
                        onChange={e => setC(x => ({ ...x, [`libres:${s.id}`]: libres.map((y, k) => (k === i ? { ...y, libelle: e.target.value } : y)) }))} />
                        {!lecture && <button type="button" className="bouton" title="Retirer" onClick={() => setC(x => ({ ...x, [`libres:${s.id}`]: libres.filter((_, k) => k !== i) }))}><IconTrash size={15} /></button>}</div>
                      <Choix echelle={ech} valeur={l.v ?? null} lecture={lecture} onChange={v => setC(x => ({ ...x, [`libres:${s.id}`]: libres.map((y, k) => (k === i ? { ...y, v } : y)) }))} />
                      <textarea className="controle w-full !h-auto" rows={2} disabled={lecture} data-reponses="non" placeholder="Un incident critique" value={l.t || ''}
                        onChange={e => setC(x => ({ ...x, [`libres:${s.id}`]: libres.map((y, k) => (k === i ? { ...y, t: e.target.value } : y)) }))} />
                    </div>))}
                  {!lecture && <button type="button" className="bouton" onClick={() => setC(x => ({ ...x, [`libres:${s.id}`]: [...libres, { id: `l${Date.now().toString(36)}`, libelle: '' }] }))}><IconPlus size={15} /> Ajouter une mission</button>}
                </>}
              </div>
            </section>);
        })}
        {!lecture && <div className="flex items-center gap-3">
          <button type="button" className="bouton bouton-fort" onClick={soumettre}>Soumettre ma grille</button>
          <span className="text-second text-slate-500">{etat || 'Enregistrement automatique'}</span></div>}
      </div>
      <Echelles echelles={ev.echelles} utilisees={utilisees} />
    </div>);
}

/* ── La synthèse ───────────────────────────────────────────────────────── */
function Synthese({ ev }) {
  const s = ev.synthese;
  const affiche = v => (v == null ? '—' : v);
  const lignes = s.lignes.filter(l => !l.texte);
  const prio = s.priorite.map(id => lignes.find(l => l.id === id)).filter(Boolean);
  const Ligne = ({ l }) => (
    <Tr><Td><div className="text-second text-slate-500">{l.section}</div>{l.libelle}</Td>
      <Td align="centre">{affiche(l.auto)}</Td><Td align="centre">{affiche(l.eval)}</Td><Td align="centre">{l.ecart ?? '—'}</Td>
      <Td><PastilleEtat etat={CLASSE[l.classe]?.[1]}>{CLASSE[l.classe]?.[0]}</PastilleEtat></Td>
      <Td className="text-second"><div><b>Auto :</b> {l.ind_auto ? `${l.ind_auto} — ` : ''}{l.t_auto || '—'}{l.formation_auto ? ' · formation souhaitée' : ''}</div>
        <div><b>Évaluateur :</b> {l.ind_eval ? `${l.ind_eval} — ` : ''}{l.t_eval || '—'}{l.formation_eval ? ' · formation souhaitée' : ''}</div></Td></Tr>);
  const entete = <TableauEntete><Th>Critère</Th><Th align="centre">Auto</Th><Th align="centre">Évaluateur</Th><Th align="centre">Écart</Th><Th>Lecture</Th><Th>Ce que chacun a écrit</Th></TableauEntete>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <TuileEtat etat="reussi" valeur={s.comptes.concordant} libelle="concordants" />
        <TuileEtat etat="neutre" valeur={s.comptes.proche} libelle="proches" />
        <TuileEtat etat="corriger" valeur={s.comptes.divergent} libelle="divergents" />
        <TuileEtat etat="surveiller" valeur={s.comptes.clarifier} libelle="à clarifier" />
      </div>
      <p className="text-second text-slate-500">Aucune note globale ni moyenne : les deux lectures, côte à côte, pour structurer l’entretien.</p>
      {prio.length > 0 && <section className="carte overflow-hidden"><EnteteCarte titre="À discuter en priorité" />
        <Tableau className="!border-0 !rounded-none">{entete}<tbody>{prio.map(l => <Ligne key={l.id} l={l} />)}</tbody></Tableau></section>}
      <section className="carte overflow-hidden"><EnteteCarte titre="Tous les critères" />
        <Tableau className="!border-0 !rounded-none">{entete}<tbody>{lignes.map(l => <Ligne key={l.id} l={l} />)}</tbody></Tableau></section>
      <section className="carte overflow-hidden"><EnteteCarte titre="Les textes" />
        <Tableau className="!border-0 !rounded-none"><TableauEntete><Th>Question</Th><Th>Auto-évaluation</Th><Th>Évaluateur</Th></TableauEntete>
          <tbody>{s.lignes.filter(l => l.texte).map(l => <Tr key={l.id}><Td><div className="text-second text-slate-500">{l.section}</div>{l.libelle}</Td>
            <Td className="whitespace-pre-line">{l.t_auto || '—'}</Td><Td className="whitespace-pre-line">{l.t_eval || '—'}</Td></Tr>)}</tbody></Tableau></section>
    </div>);
}

/* ── Le compte rendu ───────────────────────────────────────────────────── */
function CompteRendu({ ev, onRecharger }) {
  const cr = ev.compte_rendu || {};
  const [b, setB] = useState({ points_forts: cr.points_forts || '', points_developpement: cr.points_developpement || '',
    plan: cr.plan?.length ? cr.plan : [{ axe: '', moyens: '', echeance: '' }, { axe: '', moyens: '', echeance: '' }],
    observations: cr.observations || '', desaccord: !!cr.desaccord });
  const [date, setDate] = useState(ev.dates.entretien_le || new Date().toISOString().slice(0, 10));
  const [msg, setMsg] = useState(null);
  const evaluateur = ev.role === 'evaluateur', evalue = ev.role === 'evalue';
  const ecritEvaluateur = evaluateur && ev.etat === 'entretien' && !ev.dates.valide_evaluateur_le;
  const ecritEvalue = evalue && ev.etat === 'entretien' && ev.dates.valide_evaluateur_le && !ev.dates.valide_evalue_le;
  const enregistrer = async () => { setMsg(null); try { await appel(`/${ev.id}/compte-rendu`, { method: 'PUT', ...corps(b) }); setMsg('Enregistré.'); } catch (e) { setMsg(e.message); } };
  const valider = async () => {
    if (!(await demander({ titre: 'Valider le compte rendu', confirmer: 'Valider', annuler: 'Pas encore',
      message: evaluateur ? 'Une fois validé, le compte rendu est figé ; l’évalué·e y ajoute ses observations puis valide.' : 'Vos observations seront figées et le compte rendu sera validé par les deux parties.' }))) return;
    try { await appel(`/${ev.id}/compte-rendu`, { method: 'PUT', ...corps(b) }); await appel(`/${ev.id}/valider`, { method: 'POST' }); onRecharger(); } catch (e) { setMsg(e.message); }
  };
  if (ev.etat === 'synthese') {
    return evaluateur ? (
      <section className="carte overflow-hidden max-w-xl"><EnteteCarte titre="L’entretien" sous="Notez la date de l’entretien pour ouvrir la rédaction du compte rendu." />
        <div className="px-4 py-3 flex gap-2 items-center text-sm"><input type="date" className="controle" value={date} onChange={e => setDate(e.target.value)} />
          <button type="button" className="bouton bouton-fort" onClick={async () => { try { await appel(`/${ev.id}/entretien`, { method: 'POST', ...corps({ date }) }); onRecharger(); } catch (e) { setMsg(e.message); } }}>L’entretien a eu lieu</button>
          {msg && <span className="text-second text-slate-600">{msg}</span>}</div></section>)
      : <p className="text-sm text-slate-500">Le compte rendu sera rédigé par l’évaluateur après l’entretien.</p>;
  }
  const zone = (k, titre) => (
    <label className="block"><span className="font-medium">{titre}</span>
      <textarea className="controle w-full !h-auto mt-1" rows={4} disabled={!ecritEvaluateur} data-reponses="non" value={b[k]} onChange={e => setB(x => ({ ...x, [k]: e.target.value }))} /></label>);
  return (
    <div className="space-y-4 max-w-4xl">
      <section className="carte overflow-hidden">
        <EnteteCarte titre="Le compte rendu" sous={`Entretien du ${dateFr(ev.dates.entretien_le)} · rédigé par l’évaluateur`} />
        <div className="px-4 py-3 space-y-3 text-sm">
          {zone('points_forts', 'Points forts')}
          {zone('points_developpement', 'Points de développement')}
          <div><div className="font-medium mb-1">Plan de développement — deux ou trois axes, formulés en comportements</div>
            <Tableau className="!rounded-none"><TableauEntete><Th>Axe</Th><Th>Moyens</Th><Th largeur="w-36">Échéance</Th></TableauEntete><tbody>
              {b.plan.map((a, i) => <Tr key={i}>{['axe', 'moyens', 'echeance'].map(k => <Td key={k}>
                <input className="controle w-full" disabled={!ecritEvaluateur} value={a[k] || ''} onChange={e => setB(x => ({ ...x, plan: x.plan.map((y, j) => (j === i ? { ...y, [k]: e.target.value } : y)) }))} /></Td>)}</Tr>)}
            </tbody></Tableau>
            {ecritEvaluateur && b.plan.length < 3 && <button type="button" className="bouton mt-2" onClick={() => setB(x => ({ ...x, plan: [...x.plan, { axe: '', moyens: '', echeance: '' }] }))}><IconPlus size={15} /> Un axe</button>}
          </div>
        </div>
      </section>
      {(ev.dates.valide_evaluateur_le || evalue) && <section className="carte overflow-hidden">
        <EnteteCarte titre="Les observations du membre du personnel" sous="Un désaccord s’écrit ici ; il reste attaché au compte rendu." />
        <div className="px-4 py-3 space-y-2 text-sm">
          <textarea className="controle w-full !h-auto" rows={4} disabled={!ecritEvalue} data-reponses="non" value={b.observations} onChange={e => setB(x => ({ ...x, observations: e.target.value }))} />
          <label className="flex items-center gap-2"><input type="checkbox" disabled={!ecritEvalue} checked={b.desaccord} onChange={e => setB(x => ({ ...x, desaccord: e.target.checked }))} /> j’exprime un désaccord</label>
        </div></section>}
      <div className="flex items-center gap-3">
        {(ecritEvaluateur || ecritEvalue) && <><button type="button" className="bouton" onClick={enregistrer}>Enregistrer</button>
          <button type="button" className="bouton bouton-fort" onClick={valider}><IconCheck size={15} /> Valider</button></>}
        {evaluateur && ev.dates.valide_evaluateur_le && !ev.dates.valide_evalue_le && <span className="text-second text-slate-600">Validé de votre côté le {dateFr(ev.dates.valide_evaluateur_le)} ; en attente de l’évalué·e.</span>}
        {evalue && !ev.dates.valide_evaluateur_le && <span className="text-second text-slate-600">L’évaluateur rédige et valide d’abord ; vous ajoutez ensuite vos observations.</span>}
        {msg && <span className="text-second text-slate-600">{msg}</span>}
      </div>
    </div>);
}

/* ── Le brouillon (direction) ──────────────────────────────────────────── */
function Brouillon({ ev, comptes, refs, onRecharger, onRetour }) {
  const [b, setB] = useState({ evaluateur_user_id: ev.evaluateur.id, periode: ev.periode, remise_le: ev.remise_le || '', referentiel_id: ev.referentiel?.id,
    objectifs: ev.objectifs.length ? ev.objectifs : [{ libelle: '' }] });
  const [msg, setMsg] = useState(null);
  const enregistrer = async () => { setMsg(null); try { await appel(`/${ev.id}`, { method: 'PUT', ...corps(b) }); setMsg('Enregistré.'); onRecharger(); } catch (e) { setMsg(e.message); } };
  return (
    <section className="carte overflow-hidden max-w-3xl">
      <EnteteCarte titre="Le paramétrage" sous="Tant que l’évaluation est un brouillon, personne d’autre ne la voit remplir." />
      <div className="px-4 py-3 space-y-3 text-sm">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">Évaluateur<select className="controle w-full mt-1" value={b.evaluateur_user_id} onChange={e => setB(x => ({ ...x, evaluateur_user_id: Number(e.target.value) }))}>
            {comptes.filter(u => u.id !== ev.evalue.id).map(u => <option key={u.id} value={u.id}>{u.nom_complet || u.email}</option>)}</select></label>
          <label className="block">Référentiel<select className="controle w-full mt-1" value={b.referentiel_id} onChange={e => setB(x => ({ ...x, referentiel_id: Number(e.target.value) }))}>
            {refs.map(r => <option key={r.id} value={r.id}>{r.titre} (v{r.version})</option>)}</select></label>
          <label className="block">Période<input className="controle w-full mt-1" value={b.periode} onChange={e => setB(x => ({ ...x, periode: e.target.value }))} /></label>
          <label className="block">Date de remise<input type="date" className="controle w-full mt-1" value={b.remise_le} onChange={e => setB(x => ({ ...x, remise_le: e.target.value }))} /></label>
        </div>
        <div><div className="font-medium mb-1">Objectifs fixés pour la période</div>
          {b.objectifs.map((o, i) => <div key={i} className="flex gap-2 mb-1"><input className="controle flex-1" value={o.libelle} placeholder={`Objectif ${i + 1}`}
            onChange={e => setB(x => ({ ...x, objectifs: x.objectifs.map((y, j) => (j === i ? { ...y, libelle: e.target.value } : y)) }))} />
            <button type="button" className="bouton" title="Retirer" onClick={() => setB(x => ({ ...x, objectifs: x.objectifs.filter((_, j) => j !== i) }))}><IconTrash size={15} /></button></div>)}
          <button type="button" className="bouton" onClick={() => setB(x => ({ ...x, objectifs: [...x.objectifs, { libelle: '' }] }))}><IconPlus size={15} /> Un objectif</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="bouton" onClick={enregistrer}>Enregistrer</button>
          <button type="button" className="bouton bouton-fort" onClick={async () => {
            if (!(await demander({ titre: 'Ouvrir l’évaluation', confirmer: 'Ouvrir', annuler: 'Annuler', message: 'Les deux parties sont prévenues et remplissent chacune leur grille, sans voir celle de l’autre.' }))) return;
            try { await appel(`/${ev.id}`, { method: 'PUT', ...corps(b) }); await appel(`/${ev.id}/ouvrir`, { method: 'POST' }); onRecharger(); } catch (e) { setMsg(e.message); } }}>Ouvrir</button>
          <button type="button" className="bouton bouton-detruire" onClick={async () => {
            if (!(await demander({ titre: 'Supprimer le brouillon', confirmer: 'Supprimer', annuler: 'Garder', message: 'Le brouillon disparaît (le journal garde sa trace).' }))) return;
            try { await appel(`/${ev.id}`, { method: 'DELETE' }); onRetour(); } catch (e) { setMsg(e.message); } }}>Supprimer</button>
          {msg && <span className="text-second text-slate-600">{msg}</span>}
        </div>
      </div>
    </section>);
}

/* ── Une évaluation ────────────────────────────────────────────────────── */
function Detail({ id, gestion, onRetour, onReauth }) {
  const [ev, setEv] = useState(null);
  const [face, setFace] = useState(null);
  const [journal, setJournal] = useState(null);
  const [msg, setMsg] = useState(null);
  const charger = useCallback(() => appel(`/${id}`).then(x => { setEv(x); setFace(f => f || (['synthese', 'entretien', 'validee', 'archivee'].includes(x.etat) ? (x.etat === 'synthese' ? 'synthese' : 'cr') : 'grille')); })
    .catch(e => (e.reauth ? onReauth() : setMsg(e.message))), [id, onReauth]);
  useEffect(() => { charger(); }, [charger]);
  if (!ev) return <div className="p-6 text-slate-400 text-sm">{msg || 'Chargement…'}</div>;
  const synth = ['synthese', 'entretien', 'validee', 'archivee'].includes(ev.etat);
  const partie = ev.role === 'evalue' ? 'auto' : ev.role === 'evaluateur' ? 'evaluateur' : null;
  const iEtat = ETAPES.findIndex(([k]) => k === ev.etat);
  const faces = [
    ...(ev.etat === 'brouillon' && gestion.gestionnaire ? [['brouillon', 'Paramétrage']] : []),
    ...(partie && ev.etat !== 'brouillon' ? [['grille', 'Ma grille']] : []),
    ...(synth ? [['synthese', 'Synthèse'], ['cr', 'Compte rendu']] : []),
    ...(gestion.gestionnaire ? [['journal', 'Journal']] : []),
  ];
  const ouvrirFace = f => { setFace(f); if (f === 'journal') appel(`/${id}/journal`).then(setJournal).catch(e => setMsg(e.message)); };
  const pdf = async () => {
    const r = await fetch(`${API}/${id}/document`, { headers: authHeaders() });
    if (!r.ok) { setMsg((await r.json().catch(() => ({}))).error || 'PDF indisponible.'); return; }
    const url = URL.createObjectURL(await r.blob()); window.open(url, '_blank');
  };
  const reouvrir = async () => {
    const motif = await saisir({ titre: 'Rouvrir une grille soumise', obligatoire: true, message: 'Quelle grille rouvrir ? Écrivez « auto » ou « évaluateur », puis le motif après un tiret. Exemple : auto — erreur de saisie au critère 3.', confirmer: 'Rouvrir' });
    if (!motif) return;
    const [qui, ...reste] = String(motif).split(/[—-]/);
    const p = /auto/i.test(qui) ? 'auto' : /valuat/i.test(qui) ? 'evaluateur' : null;
    try { await appel(`/${id}/reouvrir`, { method: 'POST', ...corps({ partie: p, motif: reste.join('-').trim() }) }); charger(); } catch (e) { setMsg(e.message); }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="bouton" onClick={onRetour}><IconArrowLeft size={15} /> Mes évaluations</button>
        <h1 className="titre-ecran">{ev.evalue.nom} — {ev.periode}</h1>
        <PastilleEtat etat={ETAT_PASTILLE[ev.etat]}>{ev.etat_libelle}</PastilleEtat>
        <span className="text-second text-slate-500">Votre rôle : {ROLE[ev.role]} · évaluateur {ev.evaluateur.nom}{ev.remise_le ? ` · remise le ${dateFr(ev.remise_le)}` : ''}</span>
        {['validee', 'archivee'].includes(ev.etat) && <button type="button" className="bouton" onClick={pdf}><IconFileTypePdf size={15} /> Compte rendu PDF</button>}
        {gestion.gestionnaire && ['attente', 'synthese'].includes(ev.etat) && <button type="button" className="bouton" onClick={reouvrir}>Rouvrir une grille…</button>}
        {gestion.gestionnaire && ev.etat === 'validee' && <button type="button" className="bouton" onClick={async () => { try { await appel(`/${id}/archiver`, { method: 'POST' }); charger(); } catch (e) { setMsg(e.message); } }}>Archiver</button>}
      </div>
      <ol className="flex flex-wrap gap-1 text-second">{ETAPES.map(([k, l], i) => <li key={k} className={`px-2 py-0.5 rounded-champ border ${i === iEtat ? 'border-iip-blue font-semibold' : i < iEtat ? 'text-slate-400 border-transparent' : 'text-slate-500 border-transparent'}`}>{i < iEtat ? '✓ ' : ''}{l}</li>)}</ol>
      {ev.action && <Encadre etat="disponible" titre="À faire">{ev.action}</Encadre>}
      {ev.dates.purgee_le && <Encadre etat="neutre">Le contenu a été effacé le {dateFr(ev.dates.purgee_le)} (durée de conservation atteinte).</Encadre>}
      {msg && <Encadre etat="corriger">{msg}</Encadre>}
      {faces.length > 1 && <div className="flex gap-4 border-b border-slate-200">{faces.map(([k, l]) => <button key={k} type="button" className={`onglet-page ${face === k ? 'onglet-page-actif' : ''}`} onClick={() => ouvrirFace(k)}>{l}</button>)}</div>}
      {face === 'brouillon' && <Brouillon ev={ev} comptes={gestion.comptes} refs={gestion.refs} onRecharger={charger} onRetour={onRetour} />}
      {face === 'grille' && partie && (
        <>{ev.parties[partie]?.soumise_le && <Encadre etat="reussi">Votre grille est soumise depuis le {dateFr(ev.parties[partie].soumise_le)}.{!synth ? ' Vous verrez celle de l’autre partie quand elle aura soumis la sienne.' : ''}</Encadre>}
          {!['ouverte', 'attente'].includes(ev.etat) && !ev.parties[partie]?.soumise_le ? <p className="text-sm text-slate-500">La grille s’ouvre quand la direction ouvre l’évaluation.</p>
            : <Grille key={`${ev.id}-${ev.parties[partie]?.soumise_le || ''}`} ev={ev} contenu={ev.parties[partie]?.contenu} lecture={!!ev.parties[partie]?.soumise_le} onRecharger={charger} />}</>)}
      {face === 'synthese' && ev.synthese && <Synthese ev={ev} />}
      {face === 'cr' && <CompteRendu key={ev.etat + (ev.dates.valide_evaluateur_le || '')} ev={ev} onRecharger={charger} />}
      {face === 'journal' && journal && <section className="carte overflow-hidden"><EnteteCarte titre="Le journal" sous="Toute lecture et toute action, en ajout seul." />
        <Tableau className="!border-0 !rounded-none" dense><TableauEntete><Th>Quand</Th><Th>Qui</Th><Th>Action</Th><Th>Détail</Th><Th>Adresse</Th></TableauEntete>
          <tbody>{journal.map((j, i) => <Tr key={i}><Td>{new Date(`${j.le.replace(' ', 'T')}Z`).toLocaleString('fr-BE')}</Td><Td>{j.nom}</Td><Td>{j.action}</Td><Td>{j.detail}</Td><Td>{j.ip}</Td></Tr>)}</tbody></Tableau></section>}
    </div>);
}

/* ── Les référentiels (direction) ──────────────────────────────────────── */
const TYPES = { texte: 'Texte libre', missions: 'Missions (niveau 1 à 4 ou NO)', objectifs: 'Objectifs de la période', comportements: 'Comportements (fréquence 1 à 5)', techniques: 'Compétences techniques (maîtrise 1 à 4)' };
function Referentiels({ refs, onRecharger }) {
  const [edite, setEdite] = useState(null);
  const [msg, setMsg] = useState(null);
  const lignes = s => (s.type === 'texte' ? s.champs : s.criteres) || [];
  const majSection = (i, f) => setEdite(x => ({ ...x, structure: { sections: x.structure.sections.map((s, j) => (j === i ? f(s) : s)) } }));
  if (edite) {
    return (
      <section className="carte overflow-hidden">
        <EnteteCarte titre={`Nouvelle version — ${edite.fonction}`} sous="Une évaluation déjà créée garde la version de sa création." />
        <div className="px-4 py-3 space-y-4 text-sm">
          <div className="grid sm:grid-cols-2 gap-3">
            <label>Fonction (identifiant)<input className="controle w-full mt-1" value={edite.fonction} onChange={e => setEdite(x => ({ ...x, fonction: e.target.value }))} /></label>
            <label>Titre<input className="controle w-full mt-1" value={edite.titre} onChange={e => setEdite(x => ({ ...x, titre: e.target.value }))} /></label>
          </div>
          {edite.structure.sections.map((s, i) => (
            <div key={i} className="border border-slate-200 rounded-carte p-3 space-y-2">
              <div className="flex flex-wrap gap-2">
                <input className="controle flex-1 min-w-[12rem]" value={s.titre} placeholder="Titre de la section" onChange={e => majSection(i, x => ({ ...x, titre: e.target.value }))} />
                <select className="controle" value={s.type} onChange={e => majSection(i, x => ({ ...x, type: e.target.value }))}>{Object.entries(TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                {s.type === 'missions' && <label className="flex items-center gap-1"><input type="checkbox" checked={!!s.libres} onChange={e => majSection(i, x => ({ ...x, libres: e.target.checked }))} /> lignes libres</label>}
                <button type="button" className="bouton" title="Retirer la section" onClick={() => setEdite(x => ({ ...x, structure: { sections: x.structure.sections.filter((_, j) => j !== i) } }))}><IconTrash size={15} /></button>
              </div>
              {s.type !== 'objectifs' && <>
                {lignes(s).map((c, k) => <div key={k} className="flex gap-2"><input className="controle flex-1" value={c.libelle} placeholder={s.type === 'texte' ? 'La question' : 'Le critère'}
                  onChange={e => majSection(i, x => { const cle = x.type === 'texte' ? 'champs' : 'criteres'; return { ...x, [cle]: (x[cle] || []).map((y, m) => (m === k ? { ...y, libelle: e.target.value } : y)) }; })} />
                  <button type="button" className="bouton" title="Retirer" onClick={() => majSection(i, x => { const cle = x.type === 'texte' ? 'champs' : 'criteres'; return { ...x, [cle]: (x[cle] || []).filter((_, m) => m !== k) }; })}><IconTrash size={15} /></button></div>)}
                <button type="button" className="bouton" onClick={() => majSection(i, x => { const cle = x.type === 'texte' ? 'champs' : 'criteres'; return { ...x, [cle]: [...(x[cle] || []), { id: `c${Date.now().toString(36)}`, libelle: '' }] }; })}><IconPlus size={15} /> {s.type === 'texte' ? 'Une question' : 'Un critère'}</button>
              </>}
              {s.type === 'objectifs' && <p className="text-second text-slate-500">Les objectifs se fixent pour chaque évaluation, dans son paramétrage.</p>}
            </div>))}
          <button type="button" className="bouton" onClick={() => setEdite(x => ({ ...x, structure: { sections: [...x.structure.sections, { id: `s${Date.now().toString(36)}`, titre: '', type: 'missions', criteres: [] }] } }))}><IconPlus size={15} /> Une section</button>
          <div className="flex gap-2 items-center">
            <button type="button" className="bouton bouton-fort" onClick={async () => { setMsg(null); try { const x = await appel('/gestion/referentiels', { method: 'POST', ...corps(edite) }); setEdite(null); setMsg(`Version ${x.version} publiée.`); onRecharger(); } catch (e) { setMsg(e.message); } }}>Publier cette version</button>
            <button type="button" className="bouton" onClick={() => setEdite(null)}>Annuler</button>{msg && <span className="text-second text-slate-600">{msg}</span>}
          </div>
        </div>
      </section>);
  }
  return (
    <section className="carte overflow-hidden">
      <EnteteCarte titre="Les référentiels" sous="Un modèle par fonction, versionné. Modifier = publier une nouvelle version." />
      <Tableau className="!border-0 !rounded-none"><TableauEntete><Th>Fonction</Th><Th>Titre</Th><Th align="centre">Version</Th><Th align="centre">Évaluations</Th><Th></Th></TableauEntete>
        <tbody>{refs.map(r => <Tr key={r.id}><Td>{r.fonction}</Td><Td>{r.titre}</Td><Td align="centre">{r.version}</Td><Td align="centre">{r.utilise}</Td>
          <Td><button type="button" className="bouton" onClick={() => setEdite({ fonction: r.fonction, titre: r.titre, structure: JSON.parse(JSON.stringify(r.structure)) })}>Nouvelle version</button></Td></Tr>)}</tbody></Tableau>
      <div className="px-4 py-3"><button type="button" className="bouton" onClick={() => setEdite({ fonction: '', titre: '', structure: { sections: [] } })}><IconPlus size={15} /> Nouveau référentiel</button>{msg && <span className="ml-2 text-second text-slate-600">{msg}</span>}</div>
    </section>);
}

/* ── L'écran ───────────────────────────────────────────────────────────── */
export default function Evaluations() {
  const [ouvert, setOuvert] = useState(false);
  const [liste, setListe] = useState(null);
  const [gestion, setGestion] = useState({ gestionnaire: false, comptes: [], refs: [] });
  const [choisie, setChoisie] = useState(null);
  const [face, setFace] = useState('mes');
  const [nouv, setNouv] = useState(null);
  const [conserv, setConserv] = useState('');
  const [msg, setMsg] = useState(null);
  const reauth = useCallback(() => { setOuvert(false); setChoisie(null); }, []);
  const charger = useCallback(async () => {
    try {
      const j = await appel('/'); setListe(j.evaluations);
      if (j.gestionnaire) {
        const [comptes, refs, c] = await Promise.all([appel('/gestion/comptes'), appel('/gestion/referentiels'), appel('/gestion/conservation')]);
        setGestion({ gestionnaire: true, comptes, refs }); setConserv(c.ans ?? '');
      }
    } catch (e) { if (e.reauth) reauth(); else setMsg(e.message); }
  }, [reauth]);
  useEffect(() => { if (ouvert) charger(); }, [ouvert, charger]);
  const ouvrir = useCallback(() => setOuvert(true), []);
  if (!ouvert) return <div className="space-y-3"><h1 className="titre-ecran">Évaluations du personnel</h1><Verrou onOuvert={ouvrir} /></div>;
  if (choisie) return <Detail id={choisie} gestion={gestion} onReauth={reauth} onRetour={() => { setChoisie(null); charger(); }} />;
  const creer = async () => {
    setMsg(null);
    try { const x = await appel('/', { method: 'POST', ...corps(nouv) }); setNouv(null); setChoisie(x.id); } catch (e) { setMsg(e.message); }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="titre-ecran">Évaluations du personnel</h1>
        {gestion.gestionnaire && <div className="segments">
          {[['mes', 'Les évaluations'], ['refs', 'Référentiels'], ['reglages', 'Conservation']].map(([k, l]) => <button key={k} type="button" className={face === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'} onClick={() => setFace(k)}>{l}</button>)}</div>}
        {gestion.gestionnaire && face === 'mes' && <button type="button" className="bouton bouton-fort" onClick={() => setNouv({ evalue_user_id: '', evaluateur_user_id: getMoi(), referentiel_id: gestion.refs[0]?.id, periode: String(new Date().getFullYear()) })}><IconPlus size={15} /> Nouvelle évaluation</button>}
      </div>
      {msg && <Encadre etat="corriger">{msg}</Encadre>}
      {nouv && face === 'mes' && <section className="carte overflow-hidden max-w-3xl"><EnteteCarte titre="Nouvelle évaluation" sous="Elle naît en brouillon : objectifs et date de remise se règlent ensuite, puis on l’ouvre." />
        <div className="px-4 py-3 grid sm:grid-cols-2 gap-3 text-sm">
          <label>Membre du personnel évalué<select className="controle w-full mt-1" value={nouv.evalue_user_id} onChange={e => setNouv(x => ({ ...x, evalue_user_id: Number(e.target.value) }))}>
            <option value="">—</option>{gestion.comptes.map(u => <option key={u.id} value={u.id}>{u.nom_complet || u.email}</option>)}</select></label>
          <label>Évaluateur<select className="controle w-full mt-1" value={nouv.evaluateur_user_id} onChange={e => setNouv(x => ({ ...x, evaluateur_user_id: Number(e.target.value) }))}>
            {gestion.comptes.map(u => <option key={u.id} value={u.id}>{u.nom_complet || u.email}</option>)}</select></label>
          <label>Référentiel<select className="controle w-full mt-1" value={nouv.referentiel_id} onChange={e => setNouv(x => ({ ...x, referentiel_id: Number(e.target.value) }))}>
            {gestion.refs.map(r => <option key={r.id} value={r.id}>{r.titre} (v{r.version})</option>)}</select></label>
          <label>Période<input className="controle w-full mt-1" value={nouv.periode} onChange={e => setNouv(x => ({ ...x, periode: e.target.value }))} /></label>
          <div className="sm:col-span-2 flex gap-2"><button type="button" className="bouton bouton-fort" disabled={!nouv.evalue_user_id} onClick={creer}>Créer le brouillon</button><button type="button" className="bouton" onClick={() => setNouv(null)}>Annuler</button></div>
        </div></section>}
      {face === 'mes' && (liste == null ? <div className="text-slate-400 text-sm">Chargement…</div>
        : !liste.length ? <p className="text-sm text-slate-500">Aucune évaluation ne vous concerne pour l’instant.</p>
        : <Tableau><TableauEntete><Th>Évalué·e</Th><Th>Période</Th><Th>Évaluateur</Th><Th>Mon rôle</Th><Th>État</Th><Th>À faire</Th></TableauEntete>
          <tbody>{liste.map(l => <Tr key={l.id} className="cursor-pointer" onClick={() => setChoisie(l.id)}>
            <Td>{l.evalue}</Td><Td>{l.periode}</Td><Td>{l.evaluateur}</Td><Td>{ROLE[l.role]}</Td>
            <Td><PastilleEtat etat={ETAT_PASTILLE[l.etat]}>{l.etat_libelle}</PastilleEtat></Td><Td className="text-second">{l.action || '—'}</Td></Tr>)}</tbody></Tableau>)}
      {face === 'refs' && <Referentiels refs={gestion.refs} onRecharger={charger} />}
      {face === 'reglages' && <section className="carte overflow-hidden max-w-xl"><EnteteCarte titre="La durée de conservation" sous="À l’échéance, le contenu d’une évaluation archivée est effacé ; restent ses dates, sa référence et le journal. Vide : rien n’est effacé." />
        <div className="px-4 py-3 flex items-center gap-2 text-sm"><input className="controle w-20" inputMode="numeric" value={conserv} onChange={e => setConserv(e.target.value.replace(/\D/g, ''))} /> an(s) après l’archivage
          <button type="button" className="bouton" onClick={async () => { try { await appel('/gestion/conservation', { method: 'PUT', ...corps({ ans: conserv === '' ? null : Number(conserv) }) }); setMsg(null); } catch (e) { setMsg(e.message); } }}>Enregistrer</button></div></section>}
    </div>);
}
function getMoi() { try { return JSON.parse(localStorage.getItem('user') || 'null')?.id || ''; } catch { return ''; } }
