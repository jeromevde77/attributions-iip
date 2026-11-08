import { useEffect, useState } from 'react';
import { IconFileText, IconPrinter } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { ouvrirApercu } from '../lib/apercu.js';
import { Fenetre, OutilFenetre, ListeEtats, LigneEtat, Encadre, Tableau, TableauEntete, Th, Td, Tr, PastilleEtat } from './ui.jsx';

/* MES EXAMENS — LA PAGE DE GARDE (3.5.234, Charles, 8 novembre 2026 : « depuis l'espace prof, l'enseignant doit pouvoir générer sa
   page de garde, avec les données de Lucie : son nom, prénom, année, UE, cours, AA qui seront évalués » ; « pas dans Mes cours mais
   dans l'espace prof »). Espace enseignant → Mes examens : ses cours de l'année et leurs épreuves datées ; pour chacun, la page de
   garde réglementaire préremplie — l'année, la session, la section, l'unité, le cours, son nom, la date et l'horaire du calendrier
   des sessions (modifiables), les acquis qu'il coche, avec ses questions et ses points —, vierge ou une par étudiant.
   Serveur : /api/examens/mes-epreuves, /api/examens/cours/:cours. */
const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');

function Composer({ c, onFermer }) {
  const [session, setSession] = useState(c.s1 ? 1 : c.s2 ? 2 : 1);
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [aa, setAa] = useState({});
  const [f, setF] = useState({ date: '', heure: '', pages: '', materiel: '', consignes: '', nominatif: false });
  useEffect(() => {
    setD(null);
    fetch(`/api/examens/cours/${encodeURIComponent(c.cours_code)}?session=${session}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Lecture impossible.'); return j; })
      .then(j => { setD(j); setAa(Object.fromEntries((j.acquis || []).map(a => [a.aa_code, { coche: true, questions: '', points: '' }])));
        setF(x => ({ ...x, date: j.date ? String(j.date).slice(0, 10) : '', heure: j.heure ? String(j.heure).slice(0, 5) : '', materiel: j.materiel || '', consignes: j.consignes || '' })); })
      .catch(e => setErreur(e.message));
  }, [c.cours_code, session]);
  const produire = async () => {
    setErreur(null);
    const acquis = Object.entries(aa).filter(([, v]) => v.coche).map(([aa_code, v]) => ({ aa_code, questions: v.questions, points: v.points }));
    const r = await fetch(`/api/examens/cours/${encodeURIComponent(c.cours_code)}/page-de-garde`, { method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ session, acquis, ...f }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErreur(j.error || 'Refusé.'); return; }
    ouvrirApercu({ html: j.html, titre: j.titre, sousTitre: `${c.cours_code} · ${session === 1 ? '1re' : '2e'} session`, nomFichier: j.nom, envoiPossible: false, astuceImpression: 'A4 portrait' });
  };
  const total = Object.values(aa).filter(v => v.coche).reduce((t, v) => t + (Number(v.points) || 0), 0);
  return (
    <Fenetre icone={IconFileText} titre={`Page de garde — ${c.cours_code} ${c.cours_nom || ''}`} sous={`UE ${c.ue_num} — ${c.ue_nom || ''}`} large="grande" onFermer={onFermer}
      outils={<OutilFenetre Icone={IconPrinter} titre="Aperçu et impression" onClick={produire} disabled={!d} />}
      pied={<><span className="text-second text-slate-500 min-w-0 flex-1">{erreur || 'Vierge : une page à photocopier. Nominative : une page par étudiant, avec son nom et son matricule.'}</span>
        <button type="button" className="bouton" onClick={onFermer}>Fermer</button>
        <button type="button" className="bouton bouton-fort" disabled={!d} onClick={produire}>Produire la page de garde</button></>}>
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
            <div className="intertitre">Les acquis évalués</div>
            {!d.acquis.length ? <Encadre etat="surveiller" titre="Aucun acquis pondéré">Ce cours n’a pas encore d’acquis pondérés cette année (Mes unités → Pondérer).</Encadre> : (
              <Tableau dense>
                <TableauEntete><Th largeur="w-8" /><Th>Acquis</Th><Th>Énoncé</Th><Th>Questions</Th><Th>Points</Th></TableauEntete>
                <tbody>{d.acquis.map(a => { const v = aa[a.aa_code] || {}; const maj = (k, x) => setAa(o => ({ ...o, [a.aa_code]: { ...v, [k]: x } })); return (
                  <Tr key={a.aa_code}>
                    <Td><input type="checkbox" checked={!!v.coche} onChange={e => maj('coche', e.target.checked)} aria-label={a.aa_code} /></Td>
                    <Td className="whitespace-nowrap"><b>{a.aa_code}</b></Td>
                    <Td className="text-second">{a.description}</Td>
                    <Td><input className="controle !h-8 w-28" placeholder="ex. Q1, Q3" value={v.questions || ''} disabled={!v.coche} onChange={e => maj('questions', e.target.value)} /></Td>
                    <Td><input type="number" min="0" className="controle !h-8 w-20" value={v.points || ''} disabled={!v.coche} onChange={e => maj('points', e.target.value)} /></Td>
                  </Tr>); })}</tbody>
              </Tableau>)}
            {total > 0 && <p className="m-0 mt-1 text-second">Total : <b>{total}</b> points, ramenés sur 20.</p>}
          </div>
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
      <p className="m-0 text-sm text-slate-600">Vos cours de {d.annee} et leurs épreuves. Pour chacun, la page de garde réglementaire, préremplie par Lucie : il ne vous reste qu’à cocher les acquis évalués et à indiquer vos questions et vos points. Le questionnaire part ensuite au secrétariat (examens@institut-prigogine.be), un mois avant l’épreuve.</p>
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
