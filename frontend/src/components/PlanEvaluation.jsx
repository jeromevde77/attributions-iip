/**
 * GÉRER MON ÉVALUATION (3.5.189, Charles, 7 novembre 2026 : « un outil qui doit permettre, sur base de la DUE, de paramétrer les
 * évaluations — choisir si c'est une évaluation continue, si cela s'additionne, si chaque évaluation a un poids » ; tranché :
 * au choix du professeur ; le plan propose la note par acquis ; réglé par les titulaires ; il part de la DUE et la nourrit).
 *
 * Par session : la façon de compter (moyenne pondérée, addition des points, continu + examen et la part du continu), puis
 * chaque évaluation — sa nature (les modalités de la DUE), son rôle, son poids ou son maximum. « Partir de la DUE » ajoute
 * une évaluation par modalité cochée dans la DUE qui n'en a pas encore. Enregistrer écrit le plan et met à jour les
 * modalités de la DUE de ce cours (sauf DUE validée). Serveur : `PUT /api/mes-cours/carnet/:cours/plan`.
 */
import { useState } from 'react';
import { IconPlus, IconFileDescription, IconTrash } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Fenetre, Encadre } from './ui.jsx';

const nb = v => String(v ?? '').replace('.', ',');
const num = v => Number(String(v ?? '').replace(',', '.'));

export default function PlanEvaluation({ coursCode, annee, d, onFermer, onEnregistre }) {
  const [session, setSession] = useState(1);
  const [plans, setPlans] = useState({ 1: { ...(d.plans?.[1] || { mode: 'pondere', part_continue: 40 }) }, 2: { ...(d.plans?.[2] || { mode: 'pondere', part_continue: 40 }) } });
  const [evs, setEvs] = useState(() => (d.evaluations || []).map(e => ({ id: e.id, intitule: e.intitule, session: e.session, nature: e.nature || '', role: e.role || '', poids: e.poids, sur: e.sur, notees: e.notees })));
  const [creer, setCreer] = useState([]);
  const [msg, setMsg] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const natures = d.natures || {};
  const plan = plans[session];
  const lignes = [...evs.filter(e => e.session === session).map(e => ({ ...e, _nouvelle: false })), ...creer.map((e, i) => ({ ...e, _i: i, _nouvelle: true })).filter(e => e.session === session)];
  const modalites = (session === 1 ? d.due?.s1 : d.due?.s2) || [];
  const maj = (l, k, v) => (l._nouvelle ? setCreer(c => c.map((x, i) => (i === l._i ? { ...x, [k]: v } : x))) : setEvs(c => c.map(x => (x.id === l.id ? { ...x, [k]: v } : x))));
  const roleDe = n => (n === 'continue' ? 'continue' : 'examen');

  function partirDeLaDUE() {
    const deja = new Set(lignes.map(l => l.nature).filter(Boolean));
    const a = modalites.filter(n => !deja.has(n)).map(n => ({ intitule: natures[n] || n, nature: n, role: roleDe(n), session, sur: 20, poids: 1 }));
    if (!a.length) { setMsg(modalites.length ? 'Chaque modalité de la DUE a déjà son évaluation.' : 'La DUE ne coche encore aucune modalité pour ce cours et cette session.'); return; }
    setCreer(c => [...c, ...a]); setMsg(`${a.length} évaluation(s) ajoutée(s) d’après la DUE : nommez-les et réglez-les, puis enregistrez.`);
  }

  async function enregistrer() {
    setEnCours(true); setErreur(null); setMsg(null);
    try {
      const r = await fetch(`/api/mes-cours/carnet/${encodeURIComponent(coursCode)}/plan`, {
        method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ annee, plans, evaluations: evs.map(e => ({ id: e.id, nature: e.nature || null, role: e.role || null, poids: num(e.poids), sur: num(e.sur) })),
          creer: creer.map(e => ({ intitule: e.intitule, nature: e.nature || null, role: e.role || null, session: e.session, poids: num(e.poids), sur: num(e.sur) })) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      onEnregistre?.(j.due === 'validee' ? 'Plan enregistré. La DUE est validée par la direction : ses modalités n’ont pas été modifiées.'
        : j.due === 'ok' ? 'Plan enregistré ; les modalités d’évaluation de la DUE de ce cours sont mises à jour.' : 'Plan enregistré.');
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  }

  const total = plan.mode === 'somme' ? lignes.reduce((t, l) => t + (num(l.sur) || 0), 0) : null;
  const resume = plan.mode === 'somme' ? `Note du cours = total des points obtenus sur ${nb(total)}, ramené sur 20.`
    : plan.mode === 'continu_examen' ? `Note du cours = ${nb(plan.part_continue)} % pour l’évaluation continue + ${nb(100 - num(plan.part_continue))} % pour l’examen (chacun en moyenne pondérée).`
      : 'Note du cours = moyenne des évaluations, chacune à son poids.';

  return (
    <Fenetre titre="Gérer mon évaluation" sous={`${coursCode} · ${annee} — commun aux titulaires du cours`} large="grande" onFermer={onFermer}
      pied={<>
        <span className="text-second text-slate-500 min-w-0 flex-1">{erreur ? <span style={{ color: 'var(--c-refuse)' }}>{erreur}</span> : msg}</span>
        <button type="button" className="bouton" onClick={onFermer}>Annuler</button>
        <button type="button" className="bouton bouton-fort" disabled={enCours} onClick={enregistrer}>{enCours ? 'Enregistrement…' : 'Enregistrer le plan'}</button>
      </>}>
      <div className="space-y-4 text-sm">
        <div className="segments">{[[1, '1ʳᵉ session'], [2, '2ᵉ session']].map(([n, l]) => (
          <button key={n} type="button" onClick={() => setSession(n)} className={session === n ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}>{l}</button>))}</div>

        <div>
          <div className="intertitre mb-1.5">Comment se calcule la note</div>
          <div className="grid gap-2 md:grid-cols-3">
            {Object.entries(d.modes || {}).map(([k, l]) => {
              const [titre, expl] = l.split(' — ');
              return (
                <button key={k} type="button" onClick={() => setPlans(p => ({ ...p, [session]: { ...p[session], mode: k } }))}
                  className="text-left rounded-carte border px-3 py-2"
                  style={plan.mode === k ? { borderColor: 'var(--c-principal)', boxShadow: 'inset 0 0 0 1px var(--c-principal)' } : { borderColor: 'rgb(var(--gris-200))' }}>
                  <div className="font-semibold text-iip-texte">{titre}</div><div className="text-second text-slate-500">{expl}</div>
                </button>);
            })}
          </div>
          {plan.mode === 'continu_examen' && (
            <label className="mt-2 inline-flex items-center gap-2">Part de l’évaluation continue
              <input className="controle w-20 text-right" value={plan.part_continue} data-reponses="non"
                onChange={e => setPlans(p => ({ ...p, [session]: { ...p[session], part_continue: e.target.value } }))} /> %</label>)}
          <p className="m-0 mt-2 text-second text-slate-600">{resume}</p>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <div className="intertitre">Les évaluations</div>
            <span className="flex-1" />
            <button type="button" className="bouton" onClick={partirDeLaDUE} title={modalites.length ? `La DUE coche : ${modalites.map(n => natures[n] || n).join(', ')}` : 'La DUE ne coche encore rien pour ce cours'}>
              <IconFileDescription size={15} /> Partir de la DUE</button>
            <button type="button" className="bouton" onClick={() => setCreer(c => [...c, { intitule: '', nature: '', role: 'examen', session, sur: 20, poids: 1 }])}>
              <IconPlus size={15} /> Une évaluation</button>
          </div>
          {d.due?.validee && <Encadre etat="surveiller">La DUE de cette unité est validée par la direction : le plan s’enregistre, mais ses modalités dans la DUE ne changent pas.</Encadre>}
          {!lignes.length ? <p className="text-slate-500 m-0">Aucune évaluation pour cette session. « Partir de la DUE » propose celles que la DUE annonce.</p> : (
            <table className="w-full">
              <thead><tr><th className="text-left px-2 py-1">Évaluation</th><th className="text-left px-2 py-1">Nature</th>
                {plan.mode === 'continu_examen' && <th className="text-left px-2 py-1">Compte dans</th>}
                {plan.mode !== 'somme' && <th className="text-right px-2 py-1">Poids</th>}
                <th className="text-right px-2 py-1">Sur</th><th /></tr></thead>
              <tbody>{lignes.map((l, i) => (
                <tr key={l._nouvelle ? `n${l._i}` : l.id} className="border-t border-slate-100">
                  <td className="px-2 py-1">{l._nouvelle
                    ? <input className="controle w-full" value={l.intitule} placeholder="Nom de l’évaluation" data-reponses="non" onChange={e => maj(l, 'intitule', e.target.value)} />
                    : <span className="font-semibold">{l.intitule}{l.notees ? <span className="font-normal text-slate-400"> · {l.notees} note(s)</span> : null}</span>}</td>
                  <td className="px-2 py-1"><select className="controle" value={l.nature} onChange={e => maj(l, 'nature', e.target.value)}>
                    <option value="">—</option>{Object.entries(natures).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></td>
                  {plan.mode === 'continu_examen' && <td className="px-2 py-1"><select className="controle" value={l.role || roleDe(l.nature)} onChange={e => maj(l, 'role', e.target.value)}>
                    <option value="continue">le continu</option><option value="examen">l’examen</option></select></td>}
                  {plan.mode !== 'somme' && <td className="px-2 py-1 text-right"><input className="controle w-16 text-right" value={nb(l.poids)} data-reponses="non" onChange={e => maj(l, 'poids', e.target.value)} /></td>}
                  <td className="px-2 py-1 text-right"><input className="controle w-16 text-right" value={nb(l.sur)} data-reponses="non" onChange={e => maj(l, 'sur', e.target.value)} /></td>
                  <td className="px-1">{l._nouvelle && <button type="button" className="text-slate-400 hover:text-red-600" title="Retirer" onClick={() => setCreer(c => c.filter((_, k) => k !== l._i))}><IconTrash size={15} /></button>}</td>
                </tr>))}</tbody>
            </table>)}
          <p className="m-0 mt-2 text-second text-slate-500">Les acquis évalués par chaque évaluation se rattachent dans le carnet (un clic sur l’en-tête de sa colonne) : c’est ce rattachement qui fait la note proposée par acquis.</p>
        </div>
      </div>
    </Fenetre>);
}
