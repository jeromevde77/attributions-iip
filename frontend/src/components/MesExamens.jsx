import { useEffect, useRef, useState } from 'react';
import { IconFileText, IconPrinter, IconPlus, IconTrash, IconArrowUp } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { ouvrirApercu } from '../lib/apercu.js';
import { Fenetre, OutilFenetre, ListeEtats, LigneEtat, Encadre, Tableau, TableauEntete, Th, Td, Tr, TrTotal, PastilleEtat } from './ui.jsx';

/* MES EXAMENS — LA PAGE DE GARDE (3.5.234, Charles, 8 novembre 2026 : « depuis l'espace prof, l'enseignant doit pouvoir générer sa
   page de garde, avec les données de Lucie : son nom, prénom, année, UE, cours, AA qui seront évalués » ; « pas dans Mes cours mais
   dans l'espace prof »). Espace enseignant → Mes examens : ses cours de l'année et leurs épreuves datées ; pour chacun, la page de
   garde réglementaire préremplie — l'année, la session, la section, l'unité, le cours, son nom, la date et l'horaire du calendrier
   des sessions (modifiables), les acquis qu'il coche, avec ses questions et ses points —, vierge ou une par étudiant.
   Serveur : /api/examens/mes-epreuves, /api/examens/cours/:cours. */
const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');

/* LA GRILLE DE L'EXAMEN (3.5.240, Charles : « créer la grille complète de l'examen : autant de lignes que de questions, attribuées à
   un AA, avec somme automatique »). Une ligne par question — numéro, intitulé, acquis, points (au demi-point) ; les sommes par acquis
   et le total se calculent à mesure ; la grille se garde d'elle-même et la page de garde l'imprime. */
const num = n => String(Math.round(n * 100) / 100).replace('.', ',');
const vierge = i => ({ num: `Q${i + 1}`, libelle: '', aa_code: '', points: '' });

function Composer({ c, onFermer }) {
  const [session, setSession] = useState(c.s1 ? 1 : c.s2 ? 2 : 1);
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [qs, setQs] = useState([]);
  const [garde, setGarde] = useState('');
  const [f, setF] = useState({ date: '', heure: '', pages: '', materiel: '', consignes: '', nominatif: false });
  const premier = useRef(true);
  useEffect(() => {
    setD(null); premier.current = true;
    fetch(`/api/examens/cours/${encodeURIComponent(c.cours_code)}?session=${session}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Lecture impossible.'); return j; })
      .then(j => { setD(j);
        setQs(j.grille?.length ? j.grille.map(q => ({ ...q, points: q.points || '' }))
          : (j.acquis || []).map((a, i) => ({ ...vierge(i), aa_code: a.aa_code })));
        setF(x => ({ ...x, date: j.date ? String(j.date).slice(0, 10) : '', heure: j.heure ? String(j.heure).slice(0, 5) : '', materiel: j.materiel || '', consignes: j.consignes || '' })); })
      .catch(e => setErreur(e.message));
  }, [c.cours_code, session]);
  // La grille se garde seule, une seconde et demie après le dernier changement.
  useEffect(() => {
    if (!d) return undefined;
    if (premier.current) { premier.current = false; return undefined; }
    setGarde('…');
    const t = setTimeout(() => fetch(`/api/examens/cours/${encodeURIComponent(c.cours_code)}/grille`, { method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ session, questions: qs }) }).then(r => setGarde(r.ok ? 'grille gardée' : 'grille non gardée')).catch(() => setGarde('grille non gardée')), 1500);
    return () => clearTimeout(t);
  }, [qs]); // eslint-disable-line react-hooks/exhaustive-deps
  const maj = (i, k, v) => setQs(l => l.map((q, j) => (j === i ? { ...q, [k]: v } : q)));
  const ajouter = (aa = '') => setQs(l => [...l, { ...vierge(l.length), aa_code: aa || l[l.length - 1]?.aa_code || '' }]);
  const retirer = i => setQs(l => l.filter((_, j) => j !== i));
  const deplacer = (i, k) => setQs(l => { const n = [...l]; const j = i + k; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const renumeroter = () => setQs(l => l.map((q, i) => ({ ...q, num: `Q${i + 1}` })));
  const pts = q => Number(String(q.points).replace(',', '.')) || 0;
  const total = qs.reduce((t, q) => t + pts(q), 0);
  const parAA = (d?.acquis || []).map(a => { const l = qs.filter(q => q.aa_code === a.aa_code); return { ...a, l, points: l.reduce((t, q) => t + pts(q), 0) }; });
  const incompletes = qs.filter(q => !q.aa_code || !pts(q));
  const produire = async () => {
    setErreur(null);
    const r = await fetch(`/api/examens/cours/${encodeURIComponent(c.cours_code)}/page-de-garde`, { method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ session, questions: qs.map(q => ({ ...q, points: pts(q) })), ...f }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErreur(j.error || 'Refusé.'); return; }
    ouvrirApercu({ html: j.html, titre: j.titre, sousTitre: `${c.cours_code} · ${session === 1 ? '1re' : '2e'} session`, nomFichier: j.nom, envoiPossible: false, astuceImpression: 'A4 portrait' });
  };
  return (
    <Fenetre icone={IconFileText} titre={`Examen — ${c.cours_code} ${c.cours_nom || ''}`} sous={`UE ${c.ue_num} — ${c.ue_nom || ''}`} large="grande" onFermer={onFermer}
      outils={<OutilFenetre Icone={IconPrinter} titre="Aperçu et impression" onClick={produire} disabled={!d} />}
      pied={<><span className="text-second text-slate-500 min-w-0 flex-1">{erreur || (incompletes.length
          ? `${incompletes.length} question(s) sans acquis ou sans points : ${incompletes.map(q => q.num).join(', ')}.`
          : `${qs.length} question(s), ${num(total)} points${garde ? ` · ${garde}` : ''}.`)}</span>
        <button type="button" className="bouton" onClick={onFermer}>Fermer</button>
        <button type="button" className="bouton bouton-fort" disabled={!d || !qs.length || incompletes.length > 0} onClick={produire}>Produire la page de garde</button></>}>
      {!d ? <p className="text-second text-slate-500">{erreur || 'Chargement…'}</p> : (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-end gap-3">
            <div className="segments flex">{[1, 2].map(n => <button key={n} type="button" onClick={() => setSession(n)} className={session === n ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}>{n === 1 ? '1re session' : '2e session'}</button>)}</div>
            <label><span className="block text-slate-500">Date</span><input type="date" className="controle mt-1" value={f.date} onChange={e => setF(x => ({ ...x, date: e.target.value }))} /></label>
            <label><span className="block text-slate-500">Début</span><input type="time" className="controle mt-1" value={f.heure} onChange={e => setF(x => ({ ...x, heure: e.target.value }))} /></label>
            <label><span className="block text-slate-500">Nombre de pages</span><input type="number" min="1" className="controle mt-1 w-24" value={f.pages} onChange={e => setF(x => ({ ...x, pages: e.target.value }))} /></label>
            <label className="inline-flex items-center gap-2 pb-2"><input type="checkbox" checked={f.nominatif} onChange={e => setF(x => ({ ...x, nominatif: e.target.checked }))} /> Une page par étudiant ({d.etudiants})</label>
          </div>
          <p className="m-0 text-second text-slate-500">{d.datee ? `Épreuve datée au calendrier des sessions : ${fr(d.date)}${d.heure ? ` à ${String(d.heure).slice(0, 5)}` : ''}${d.local ? `, ${d.local}` : ''}.` : 'Cette épreuve n’est pas encore datée au calendrier des sessions : indiquez la date et l’heure.'} Section {d.section || '—'}{d.niveau ? ` · bloc ${d.niveau}` : ''} · {d.professeurs}.</p>
          <div>
            <div className="intertitre">La grille de l’examen</div>
            {!d.acquis.length ? <Encadre etat="surveiller" titre="Aucun acquis pondéré">Ce cours n’a pas encore d’acquis pondérés cette année (Mes unités → Pondérer).</Encadre> : (<>
              <Tableau dense>
                <TableauEntete><Th largeur="w-20">N°</Th><Th>Question</Th><Th largeur="w-40">Acquis</Th><Th largeur="w-24">Points</Th><Th largeur="w-24" /></TableauEntete>
                <tbody>
                  <TrTotal><Td colSpan={3}><b>Total</b>{total && total !== 20 ? <span className="text-second text-slate-500"> — ramené sur 20 : × {num(20 / total)}</span> : ''}</Td><Td><b>{num(total)}</b></Td><Td /></TrTotal>
                  {qs.map((q, i) => (
                  <Tr key={i}>
                    <Td><input className="controle !h-8 w-16" value={q.num} onChange={e => maj(i, 'num', e.target.value)} aria-label="Numéro" /></Td>
                    <Td><input className="controle !h-8 w-full" placeholder="Intitulé (facultatif)" value={q.libelle} onChange={e => maj(i, 'libelle', e.target.value)} /></Td>
                    <Td><select className="controle !h-8 w-full" value={q.aa_code} onChange={e => maj(i, 'aa_code', e.target.value)} title={d.acquis.find(a => a.aa_code === q.aa_code)?.description || ''}>
                      <option value="">— acquis —</option>{d.acquis.map(a => <option key={a.aa_code} value={a.aa_code}>{a.aa_code}</option>)}</select></Td>
                    <Td><input type="number" min="0" step="0.5" className="controle !h-8 w-20" value={q.points} onChange={e => maj(i, 'points', e.target.value)} aria-label="Points" /></Td>
                    <Td className="whitespace-nowrap text-right">
                      <button type="button" className="bouton !h-8 !px-2" title="Monter" onClick={() => deplacer(i, -1)} disabled={!i}><IconArrowUp size={14} /></button>{' '}
                      <button type="button" className="bouton !h-8 !px-2" title="Retirer la question" onClick={() => retirer(i)}><IconTrash size={14} /></button></Td>
                  </Tr>))}
                </tbody>
              </Tableau>
              <div className="flex flex-wrap gap-2 mt-2">
                <button type="button" className="bouton inline-flex items-center gap-1.5" onClick={() => ajouter()}><IconPlus size={14} /> Ajouter une question</button>
                <button type="button" className="bouton" onClick={renumeroter}>Renuméroter Q1, Q2…</button>
              </div></>)}
          </div>
          {d.acquis.length > 0 && <div>
            <div className="intertitre">Par acquis d’apprentissage</div>
            <Tableau dense>
              <TableauEntete><Th largeur="w-24">Acquis</Th><Th>Énoncé</Th><Th largeur="w-28">Questions</Th><Th largeur="w-20">Points</Th><Th largeur="w-20">Part</Th><Th largeur="w-24" /></TableauEntete>
              <tbody>{parAA.map(a => (
                <Tr key={a.aa_code}>
                  <Td className="whitespace-nowrap"><b>{a.aa_code}</b></Td><Td className="text-second">{a.description}</Td>
                  <Td>{a.l.map(q => q.num).join(', ') || <PastilleEtat etat="surveiller">non évalué</PastilleEtat>}</Td>
                  <Td>{a.points ? num(a.points) : '—'}</Td><Td>{a.points && total ? `${num(a.points / total * 100)} %` : ''}</Td>
                  <Td className="text-right"><button type="button" className="bouton !h-8 !px-2" title={`Ajouter une question sur ${a.aa_code}`} onClick={() => ajouter(a.aa_code)}><IconPlus size={14} /></button></Td>
                </Tr>))}</tbody>
            </Tableau>
            <p className="m-0 mt-1 text-second text-slate-500">Un acquis sans question n’est pas évalué par cette épreuve : il sort de la page de garde.</p>
          </div>}
          <label className="block"><span className="text-slate-500">Matériel autorisé et consignes</span>
            <textarea className="controle mt-1 w-full !h-auto py-2" rows={3} value={[f.materiel, f.consignes].filter(Boolean).join('\n')} onChange={e => setF(x => ({ ...x, materiel: e.target.value, consignes: '' }))} data-reponses="examen-consignes" /></label>
        </div>)}
    </Fenetre>);
}

export default function MesExamens() {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [ouvert, setOuvert] = useState(null);
  useEffect(() => {
    fetch('/api/examens/mes-epreuves', { headers: authHeaders() })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Lecture impossible.'); return j; })
      .then(setD).catch(e => setErreur(e.message));
  }, []);
  if (erreur) return <Encadre etat="corriger" titre="Lecture impossible">{erreur}</Encadre>;
  if (!d) return <p className="text-second text-slate-500">Chargement…</p>;
  if (!d.relie) return <Encadre etat="surveiller" titre="Compte non relié">Votre compte n’est relié à aucune fiche d’enseignant : le secrétariat fait le lien.</Encadre>;
  const date = x => (x?.d ? `${fr(x.d)}${x.h ? ` à ${String(x.h).slice(0, 5)}` : ''}${x.l ? `, ${x.l}` : ''}` : null);
  return (
    <div className="space-y-4">
      <h1 className="titre-ecran">Mes examens</h1>
      <p className="m-0 text-sm text-slate-600">Vos cours de {d.annee} et leurs épreuves. Pour chacun, la page de garde réglementaire, préremplie par Lucie : il ne vous reste qu’à composer la grille : une ligne par question, son acquis, ses points ; les sommes se font seules. Le questionnaire part ensuite au secrétariat (examens@institut-prigogine.be), un mois avant l’épreuve.</p>
      {!d.cours.length ? <Encadre etat="neutre" titre="Aucun cours">Aucun cours attribué cette année.</Encadre>
        : <ListeEtats>{d.cours.map(c => (
            <LigneEtat key={c.cours_code} etat={c.s1 || c.s2 ? 'disponible' : 'neutre'} icone={IconFileText} titre={`${c.cours_code} — ${c.cours_nom || ''}`}
              sous={`UE ${c.ue_num} — ${c.ue_nom || ''}`}
              meta={<>{date(c.s1) ? <PastilleEtat etat="disponible">1re session : {date(c.s1)}</PastilleEtat> : <PastilleEtat etat="neutre">1re session à dater</PastilleEtat>}
                {date(c.s2) && <PastilleEtat etat="surveiller">2e session : {date(c.s2)}</PastilleEtat>}</>}
              onClick={() => setOuvert(c)} />))}</ListeEtats>}
      {ouvert && <Composer c={ouvert} onFermer={() => setOuvert(null)} />}
    </div>);
}
