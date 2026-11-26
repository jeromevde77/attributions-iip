/* (CS) LE CONTRÔLE DE L'HORAIRE (3.5.746, Charles, 26 novembre 2026 : « la liste des erreurs de ce type pour les détecter » ; « un
   contrôle de l'horaire » dans Lucie). Quatre familles, chacune avec son geste, sans quitter la liste :
   le professeur n'est pas celui des attributions (⇄ prend le professeur d'une attribution et relie) ; aucun professeur (même geste) ;
   aucun cours (Rattacher à un cours…) ; un nom inconnu (« c'est la même personne »). Serveur : `lib/controleHoraire.js`. */
import { useEffect, useMemo, useState } from 'react';
import { IconArrowsLeftRight, IconRefresh } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { informer } from '../lib/dialogue.jsx';
import { EnteteCarte, Encadre, TuileEtat, Tableau, TableauEntete, Th, Td, Tr, TableauVide } from './ui.jsx';
import ChargementLucie from './ChargementLucie.jsx';
import ChangerCoursSeances from './ChangerCoursSeances.jsx';

const FAMILLES = {
  autre_prof: { l: 'Autre professeur que les attributions', court: 'autre professeur', etat: 'surveiller',
    aide: 'Le professeur de l’horaire n’a aucune attribution pour ce cours : doublon de fiche, remplaçant, ou erreur de l’horaire.' },
  sans_prof: { l: 'Aucun professeur', court: 'sans professeur', etat: 'surveiller', aide: 'Le cours est connu, la séance ne nomme personne.' },
  sans_cours: { l: 'Aucun cours de Lucie', court: 'sans cours', etat: 'corriger',
    aide: '« Matière à préciser », points, stages, réservations : la séance ne compte pour aucun cours ni aucune attribution.' },
  nom: { l: 'Nom inconnu', court: 'nom inconnu', etat: 'neutre', aide: 'Le nom de l’horaire ne correspond à aucune fiche : « c’est la même personne », ou un enseignant HELB.' },
};
const gnet = g => String(g || '').replace(/\s/g, '').toUpperCase().replace(/^\d+(?=[A-Z])/, '');

async function appel(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: authHeaders() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
  return j;
}

export default function ControleHoraire({ annee }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [section, setSection] = useState('');
  const [famille, setFamille] = useState('');
  const [profs, setProfs] = useState([]);
  const [alias, setAlias] = useState({});
  const [changer, setChanger] = useState(false);
  const [enCours, setEnCours] = useState(null);
  const charger = () => {
    setErreur(null);
    appel(`/api/horaire/controle?annee=${encodeURIComponent(annee)}`).then(setD).catch(e => setErreur(e.message));
  };
  useEffect(() => { if (annee) charger(); }, [annee]);   // eslint-disable-line
  useEffect(() => { appel(`/api/horaire/referentiel?annee=${annee}`).then(r => setProfs(r.profs || [])).catch(() => {}); }, [annee]);

  const lignes = useMemo(() => (d?.lignes || []).filter(l => (!section || l.section === section) && (!famille || l.famille === famille)), [d, section, famille]);
  const compte = f => (d?.lignes || []).filter(l => l.famille === f && (!section || l.section === section)).reduce((t, l) => t + l.n, 0);

  const prendre = async (l, a) => {
    setEnCours(l.cle);
    try { const r = await appel('/api/horaire/controle/prendre', { method: 'POST', body: JSON.stringify({ ids: l.ids, attribution_id: a.id }) });
      charger(); if (!r.modifiees) await informer('Aucune séance modifiée.'); }
    catch (e) { setErreur(e.message); } finally { setEnCours(null); }
  };
  const memePersonne = async l => {
    const id = Number(alias[l.cle]); if (!id) return;
    setEnCours(l.cle);
    try { const r = await appel('/api/horaire/alias', { method: 'POST', body: JSON.stringify({ texte: l.texte, professeur_id: id }) });
      await informer(`« ${l.texte} » = ${r.professeur} : ${r.seances} séance(s) mises à son nom. Lucie s’en souviendra aux prochains imports.`); charger(); }
    catch (e) { setErreur(e.message); } finally { setEnCours(null); }
  };

  if (erreur && !d) return <Encadre etat="corriger" titre={erreur} />;
  if (!d) return <ChargementLucie texte="Lucie relit l’horaire…" />;
  return (
    <section className="carte">
      <EnteteCarte titre="Les séances à vérifier" sous="Ce que l’horaire et les attributions ne racontent pas de la même façon. Un lien juste compte les heures et sert au congé-éducation.">
        <button className="bouton" onClick={charger}><IconRefresh size={14} /> Relire</button>
      </EnteteCarte>
      <div className="p-4 space-y-3">
        {erreur && <Encadre etat="corriger" titre={erreur} />}
        <div className="flex items-center gap-2 flex-nowrap overflow-x-auto">
          <select className="controle" value={section} onChange={e => setSection(e.target.value)}>
            <option value="">Toutes les sections</option>
            {d.sections.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {famille && <button className="bouton" onClick={() => setFamille('')}>Toutes les familles</button>}
        </div>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {Object.entries(FAMILLES).map(([k, f]) => (
            <TuileEtat key={k} taille="grande" etat={compte(k) ? f.etat : 'reussi'} valeur={compte(k)} libelle={f.l} aide={f.aide}
              actif={famille === k} onClick={() => setFamille(famille === k ? '' : k)} />
          ))}
        </div>
        <Tableau>
          <TableauEntete><Th largeur="8rem">Section</Th><Th>Cours</Th><Th largeur="6rem">Groupe</Th><Th>Ce qui ne va pas</Th>
            <Th largeur="5rem" align="droite">Séances</Th><Th>Corriger</Th></TableauEntete>
          <tbody>
            {!lignes.length && <TableauVide colonnes={6}>Rien à vérifier ici.</TableauVide>}
            {lignes.map(l => {
              const f = FAMILLES[l.famille];
              const cands = (l.candidats || []);
              const duGroupe = cands.filter(a => gnet(a.code) === gnet(l.groupe));
              const proposes = (duGroupe.length ? duGroupe : cands).filter(a => a.professeur_id);
              return (
                <Tr key={l.cle}>
                  <Td>{l.section}</Td>
                  <Td>{l.cours_code ? <><b>{l.cours_code}</b> {l.cours_nom || ''}</> : <span className="italic">{(l.matiere || '').replace(/^\.+$/, '') || '(sans intitulé)'}</span>}</Td>
                  <Td>{l.groupe || '—'}</Td>
                  <Td><span className="pastille-etat" data-etat={f.etat}>{f.court}</span>
                    <div className="text-mention text-slate-500 mt-1">
                      {l.famille === 'autre_prof' && <>horaire : <b>{l.prof}</b> · attributions : {[...new Set(cands.map(a => a.prof))].join(', ')}</>}
                      {l.famille === 'sans_prof' && <>attributions : {[...new Set(cands.map(a => a.prof))].join(', ')}</>}
                      {l.famille === 'sans_cours' && (l.prof ? <>professeur : {l.prof}</> : 'aucun professeur')}
                      {l.famille === 'nom' && <>nom de l’horaire : <b>{l.texte}</b></>}
                    </div></Td>
                  <Td align="droite"><span title={l.dates.join(', ')}>{l.n}</span>
                    <div className="text-mention text-slate-400 whitespace-nowrap">{l.dates[0]}{l.dates.length > 1 ? ` → ${l.dates[l.dates.length - 1]}` : ''}</div></Td>
                  <Td>
                    {(l.famille === 'autre_prof' || l.famille === 'sans_prof') && <div className="flex flex-wrap gap-1.5">
                      {proposes.map(a => (
                        <button key={a.id} className="bouton bouton-compact inline-flex items-center gap-1" disabled={enCours === l.cle}
                          title={`Les ${l.n} séance(s) prennent ${a.prof} et se relient à son attribution ${a.code || 'tous'}${a.activite ? ` (${a.activite})` : ''}`}
                          onClick={() => prendre(l, a)}><IconArrowsLeftRight size={13} /> {a.prof}{proposes.length > 1 && a.code ? ` · ${a.code}` : ''}</button>))}
                      {!proposes.length && <span className="text-mention text-slate-400">attribution sans professeur nommé</span>}
                    </div>}
                    {l.famille === 'sans_cours' && <button className="bouton bouton-compact" onClick={() => setChanger(true)}>Rattacher à un cours…</button>}
                    {l.famille === 'nom' && <div className="flex gap-1.5 items-center">
                      <select className="controle !h-8 text-second" value={alias[l.cle] || ''} onChange={e => setAlias(x => ({ ...x, [l.cle]: e.target.value }))}>
                        <option value="">— c’est… —</option>
                        {profs.map(p => <option key={p.id} value={p.id}>{p.nom} {p.prenom}</option>)}
                      </select>
                      <button className="bouton bouton-compact" disabled={!alias[l.cle] || enCours === l.cle} onClick={() => memePersonne(l)}>Même personne</button>
                    </div>}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Tableau>
        <p className="text-mention text-slate-400">Un doublon de fiche (même personne, deux fiches) apparaît en « autre professeur » : ⇄ met les séances sur la fiche qui porte les attributions.</p>
      </div>
      {changer && <ChangerCoursSeances annee={annee} onFermer={() => setChanger(false)} onFini={() => { setChanger(false); charger(); }} />}
    </section>
  );
}
