import { useEffect, useRef, useState } from 'react';
import { IconAlertTriangle, IconSearch, IconFileSpreadsheet } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import ImportAcquisCours from './ImportAcquisCours.jsx';
import { naviguerGrille, caseGrille } from '../lib/grilleClavier.js';
import PanneauAcquis from './PanneauAcquis.jsx';
import ClasseurNotes from './ClasseurNotes.jsx';
import { Fenetre } from './ui.jsx';

/**
 * Saisie des notes D'UN COURS — l'écran du professeur.
 *
 * La feuille de délibération présente les acquis d'une unité, consolidés :
 * c'est la vue du Conseil, celle qui sert à décider. Le professeur, lui, ne
 * connaît que SON cours et les acquis qu'il y évalue. Lui faire saisir dans la
 * grille de l'unité, c'était lui montrer les acquis de ses collègues et le
 * mettre en position d'écraser leurs notes.
 *
 * La note part sous « cours|acquis » : un acquis évalué dans deux cours a donc
 * deux notes, et chaque cours a la sienne. C'est ce que la délibération
 * consolide ensuite.
 */
const SEUIL = 10;

/**
 * LA COULEUR D'UNE NOTE — la même que sur la feuille d'unité.
 *
 *   sous 10        rouge    l'acquis n'est pas maîtrisé
 *   10 et 11       orange   au seuil, mais de justesse
 *   12 et plus     vert     acquis
 *
 * Deux écrans qui peignent la même note de deux couleurs différentes
 * apprennent à se méfier des deux.
 */
const tonNote = n => {
  if (n == null || n === '') return 'border-slate-300';
  const v = Number(n);
  if (!Number.isFinite(v)) return 'border-slate-300';
  if (v < SEUIL) return 'border-red-300 bg-red-50 text-red-900';
  if (v < 12) return 'border-amber-300 bg-amber-50 text-amber-900';
  return 'border-emerald-300 bg-emerald-50 text-emerald-900';
};

export default function EncodageCours({ coursCode, annee, onClose, onEnregistre, onParametrer }) {
  // La grille se parcourt au clavier : le conteneur écoute, chaque case porte
  // ses coordonnées (voir lib/grilleClavier.js).
  const grille = useRef(null);
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [session, setSession] = useState(1);
  const [recherche, setRecherche] = useState('');
  const [enAttente, setEnAttente] = useState(0);
  const [importer, setImporter] = useState(false);

  async function charger() {
    setErreur(null);
    try {
      const rep = await fetch(
        `/api/acquis/cours/${encodeURIComponent(coursCode)}/feuille`
        + `?annee=${encodeURIComponent(annee)}&session=${session}`,
        { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error);
      setData(j);
    } catch (e) { setErreur(e.message); }
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [coursCode, annee, session]);

  /* LES NOTES PROPOSÉES PAR LE PROFESSEUR (« Mes cours ») : une référence
     sous les yeux de qui encode — la feuille note par acquis, la proposition
     est une note de cours, on ne remplit donc rien à sa place. */
  const [propositions, setPropositions] = useState([]);
  useEffect(() => {
    fetch(`/api/mes-cours/${encodeURIComponent(coursCode)}/propositions?annee=${encodeURIComponent(annee)}`,
      { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : { propositions: [] }))
      .then(j => setPropositions(j.propositions || []))
      .catch(() => setPropositions([]));
  }, [coursCode, annee]);

  /* REPRENDRE LES PROPOSITIONS (28 septembre 2026) : ce que le professeur a
     proposé dans « Mes cours » entre dans l'encodage officiel en un geste,
     après simulation. Une note qui diffère n'est remplacée que si on la coche. */
  const [reprise, setReprise] = useState(null);      // réponse de la simulation
  const [aRemplacer, setARemplacer] = useState(() => new Set());
  const [repriseEnCours, setRepriseEnCours] = useState(false);
  const [repriseFaite, setRepriseFaite] = useState(null);
  const appelerReprise = async simulation => {
    setRepriseEnCours(true); setErreur(null);
    try {
      const r = await fetch(`/api/mes-cours/${encodeURIComponent(coursCode)}/reprendre`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, session, simulation,
          remplacer: [...aRemplacer].map(k => { const [etudiant_id, aa_code] = k.split('|'); return { etudiant_id: Number(etudiant_id), aa_code }; }) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      return j;
    } catch (e) { setErreur(e.message); return null; } finally { setRepriseEnCours(false); }
  };
  const ouvrirReprise = async () => { setARemplacer(new Set()); setRepriseFaite(null); const j = await appelerReprise(true); if (j) setReprise(j); };
  const confirmerReprise = async () => {
    const j = await appelerReprise(false);
    if (j) { setRepriseFaite(j); setReprise(null); await charger(); onEnregistre && onEnregistre(); }
  };

  // Chaque note part SEULE, dès la sortie du champ : une saisie de délibération
  // s'interrompt — un appel, une question — et un enregistrement global perdrait
  // tout ce qui n'a pas été validé.
  /**
   * NP OU PP SUR TOUTE L'ÉPREUVE. Cela ne vise pas un acquis mais l'épreuve :
   * tous les acquis du cours passent à zéro, avec la raison.
   */
  async function poserMention(etudId, mention) {
    setEnAttente(n => n + 1);
    try {
      const rep = await fetch(`/api/acquis/cours/${encodeURIComponent(coursCode)}/epreuve`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ etudiant_id: etudId, annee_scolaire: annee, session, mention }),
      });
      if (!rep.ok) {
        const j = await rep.json().catch(() => ({}));
        setErreur(j.error || 'Enregistrement refusé.');
      } else { setErreur(null); onEnregistre && onEnregistre(); }
      await charger();
    } catch (e) { setErreur(e.message); }
    finally { setEnAttente(n => n - 1); }
  }

  async function poser(etudId, aaCode, valeur) {
    const v = valeur === '' ? null : Number(String(valeur).replace(',', '.'));
    if (v != null && (!Number.isFinite(v) || v < 0 || v > 20)) {
      setErreur('Note attendue entre 0 et 20.');
      return;
    }
    setData(d => ({ ...d, notes: { ...d.notes,
      [etudId]: { ...(d.notes[etudId] || {}), [aaCode]: v } } }));
    setEnAttente(n => n + 1);
    try {
      const rep = await fetch('/api/acquis/feuille/note', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({
          etudiant_id: etudId, annee_scolaire: annee, ue_num: data.cours.ue_num,
          cours_code: coursCode, aa_code: aaCode, session, points: v,
        }),
      });
      if (!rep.ok) {
        const j = await rep.json().catch(() => ({}));
        setErreur(j.error || 'Enregistrement refusé.');
        await charger();
      } else { setErreur(null); onEnregistre && onEnregistre(); }
    } catch (e) { setErreur(e.message); }
    finally { setEnAttente(n => n - 1); }
  }

  const fermer = () => onClose();

  return (
    <>
    <Fenetre titre={data ? `${data.cours.cours_code} · ${data.cours.cours_nom || ''}` : coursCode}
      sous={`${data ? `UE ${data.cours.ue_num} · ${data.etudiants.length} étudiant(s) · ` : ''}${data ? `${data.acquis.length} acquis · ` : ''}${annee}${data?.cours?.professeurs ? ` · ${data.cours.professeurs}` : ''}`}
      large="grande" hauteurFixe onFermer={fermer}
      pied={<>
        <span />
        {/* LE CLASSEUR DU PROFESSEUR : il part, revient rempli, et se relit sur
            les clés qu'il porte plutôt que sur l'ordre de ses lignes. */}
        <ClasseurNotes ueNum={data?.cours?.ue_num} annee={annee} session={session}
          ueNom={data?.cours?.cours_nom}
          colonnes={(data?.acquis || []).map(a => ({
            cours_code: data?.cours?.cours_code, cours_nom: data?.cours?.cours_nom,
            aa_code: a.aa_code, description: a.description, poids: a.poids }))}
          etudiants={data?.etudiants || []}
          note={(id, c) => data?.notes?.[id]?.[c.aa_code] ?? null}
          mention={id => data?.mentions?.[id] || null}
          onImporte={() => { charger(); onEnregistre?.(); }} />
      </>}>
      {/* La grille et le panneau des acquis défilent chacun pour soi : le
          contenu prend toute la hauteur de la fenêtre. */}
      <div className="h-full -mx-5 flex flex-col">
        <div className="flex-none px-5 pb-3">
          <div className="flex items-center justify-end gap-2">
            {enAttente > 0 && <span className="text-second text-slate-400">enregistrement…</span>}
            {/* Les acquis viennent d'un tableur : autant les y lire. */}
            <button onClick={() => setImporter(true)}
              title="Importer les acquis de ce cours depuis un classeur Excel"
              className="px-2.5 py-1 text-second rounded-lg border border-slate-300
                         text-slate-600 flex items-center gap-1.5">
              <IconFileSpreadsheet size={14} /> Importer les acquis
            </button>
            <div className="segments">
              {[1, 2].map(s => (
                <button key={s} onClick={() => setSession(s)}
                  className={`px-3 py-1 text-second font-semibold ${session === s
                    ? 'bg-iip-blue text-white' : 'bg-white text-slate-600'}`}>
                  Session {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
        {/* L'ÉNONCÉ DES ACQUIS À CÔTÉ DE LA GRILLE : elle ne montre que des
            codes, et l'énoncé ne vivait que dans une infobulle qu'il fallait
            survoler colonne par colonne — ce que personne ne fait. */}
        <PanneauAcquis ueNum={data?.cours?.ue_num} colonnes={(data?.acquis || []).map(a => ({
          cours_code: data?.cours?.cours_code, cours_nom: data?.cours?.cours_nom,
          professeurs: data?.cours?.professeurs, aa_code: a.aa_code,
          description: a.description, poids: a.poids }))} />
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {erreur && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200
                            text-sm text-red-800">{erreur}</div>
          )}

          {propositions.length > 0 && (
            <div className="px-3 py-2 rounded-lg bg-iip-turquoise/10 border border-iip-turquoise/40 text-second text-iip-blue">
              <div className="flex items-center gap-2 flex-wrap">
                <b>{propositions.length} note(s) proposée(s) par le professeur</b>
                <span className="text-slate-500">(depuis « Mes cours »)</span>
                <button type="button" className="bouton bouton-fort bouton-compact ml-auto" disabled={repriseEnCours} onClick={ouvrirReprise}>
                  {repriseEnCours ? '…' : 'Reprendre les propositions'}
                </button>
              </div>
              {repriseFaite && <div className="text-second text-emerald-800 mt-1">Reprises : {repriseFaite.a_poser} posée(s), {repriseFaite.remplacees} remplacée(s), {repriseFaite.identiques} déjà identique(s).</div>}
              <span className="block mt-0.5">
                {Object.values(propositions.reduce((m, p) => {
                  const k = p.etudiant_id;
                  (m[k] ||= { nom: p.nom, prenom: p.prenom, parts: [] }).parts
                    .push(`${p.aa_code ? p.aa_code + ' ' : ''}${p.mention || p.note}`);
                  return m;
                }, {})).map(x =>
                  `${(x.nom || '').toUpperCase()} ${x.prenom || ''} : ${x.parts.join(', ')}`)
                  .join(' · ')}
              </span>
            </div>
          )}

          {reprise && (
            <Fenetre titre="Reprendre les propositions du professeur" large="grande" onFermer={() => setReprise(null)}
              sous={`${coursCode} · session ${reprise.session} · ${reprise.annee} — rien n'est écrit avant de confirmer`}
              pied={<>
                <span className="flex-1 min-w-0 text-second text-slate-500">
                  {reprise.a_poser + aRemplacer.size} note(s) seront écrites ; {reprise.identiques} déjà identique(s) seront pointées.
                </span>
                <button className="bouton" onClick={() => setReprise(null)}>Annuler</button>
                <button className="bouton bouton-fort" disabled={repriseEnCours || (!reprise.a_poser && !aRemplacer.size && !reprise.identiques)} onClick={confirmerReprise}>
                  {repriseEnCours ? '…' : `Reprendre ${reprise.a_poser + aRemplacer.size} note(s)`}
                </button>
              </>}>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-4 gap-2">
                  <div data-etat="disponible" className="bloc-etat px-3 py-2"><div className="text-lg font-bold">{reprise.a_poser}</div><div className="text-xs text-slate-500">cases vides, à poser</div></div>
                  <div data-etat="reussi" className="bloc-etat px-3 py-2"><div className="text-lg font-bold">{reprise.identiques}</div><div className="text-xs text-slate-500">déjà identiques</div></div>
                  <div data-etat="surveiller" className="bloc-etat px-3 py-2"><div className="text-lg font-bold">{reprise.differentes.length}</div><div className="text-xs text-slate-500">différentes de l'officiel</div></div>
                  <div data-etat="neutre" className="bloc-etat px-3 py-2"><div className="text-lg font-bold">{reprise.ignorees.length}</div><div className="text-xs text-slate-500">non reprises</div></div>
                </div>
                {!!reprise.differentes.length && (
                  <div>
                    <div className="text-second font-semibold mb-1">Notes qui diffèrent — cochez celles à remplacer par la proposition</div>
                    <table className="w-full text-second">
                      <thead className="tab-entete"><tr className="text-left text-xs text-slate-500"><th className="px-2 py-1 w-8"></th><th className="px-2 py-1">Étudiant</th><th className="px-2 py-1">Acquis</th><th className="px-2 py-1 text-right">Officiel</th><th className="px-2 py-1 text-right">Proposé</th></tr></thead>
                      <tbody>{reprise.differentes.map(d => { const k = `${d.etudiant_id}|${d.aa_code}`; return (
                        <tr key={k} className="border-t border-slate-100">
                          <td className="px-2 py-1"><input type="checkbox" checked={aRemplacer.has(k)} onChange={() => setARemplacer(s0 => { const n = new Set(s0); n.has(k) ? n.delete(k) : n.add(k); return n; })} /></td>
                          <td className="px-2 py-1">{d.etudiant}</td><td className="px-2 py-1">{d.aa_code}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{d.officiel}</td><td className="px-2 py-1 text-right tabular-nums font-semibold">{d.propose}</td>
                        </tr>); })}</tbody>
                    </table>
                  </div>
                )}
                {!!reprise.ignorees.length && (
                  <div className="text-second text-slate-500">
                    <b>Non reprises :</b> {reprise.ignorees.slice(0, 20).map(x => `${x.etudiant} ${x.aa_code || ''} (${x.raison})`).join(' · ')}{reprise.ignorees.length > 20 ? ` · et ${reprise.ignorees.length - 20} autres` : ''}
                  </div>
                )}
              </div>
            </Fenetre>
          )}

          {!data ? (
            <div className="py-8 text-center text-slate-400 text-sm">Chargement…</div>
          ) : data.epreuve_integree ? (
            /* L'unité est évaluée par une épreuve commune : encoder ici, cours
               par cours, n'aurait pas de sens — la note est celle de l'unité. */
            <div className="px-4 py-6 rounded-xl bg-violet-50 border border-violet-200
                            text-sm text-violet-900 space-y-1">
              <div className="font-semibold">Épreuve intégrée d'unité</div>
              <p>
                Cette unité est évaluée par une épreuve commune à ses professeurs.
                On y encode <b>une note par acquis pour l'unité entière</b>, et
                chaque cours reçoit la note de l'unité. La saisie se fait donc
                depuis l'unité, non depuis ce cours.
              </p>
            </div>
          ) : data.sans_acquis ? (
            /* Le cas de vos UE actuelles : sans lien cours↔acquis, il n'y a
               rien à saisir, et le dire vaut mieux qu'une grille vide. */
            <div className="px-4 py-6 rounded-xl bg-amber-50 border border-amber-200
                            text-sm text-amber-900 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <IconAlertTriangle size={16} /> Aucun acquis rattaché à ce cours
              </div>
              <p>
                La saisie par cours suppose de savoir quels acquis ce cours évalue.
                Ce lien se pose au paramétrage de l'unité, ou s'importe du classeur
                de suivi, onglet <b>Repartition_AA_UE</b>.
              </p>
              <div className="flex flex-wrap gap-2 mt-1">
                <button onClick={() => setImporter(true)}
                  className="px-3 py-1.5 text-sm rounded-lg bg-iip-blue
                             text-white font-semibold flex items-center gap-1.5">
                  <IconFileSpreadsheet size={14} /> Importer les acquis depuis Excel
                </button>
                {onParametrer && (
                  <button onClick={() => onParametrer(data.cours.ue_num)}
                    className="px-3 py-1.5 text-sm rounded-lg border border-iip-blue
                               text-iip-blue font-semibold">
                    Les relier à la main
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {data.sans_ponderation && (
                <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                                text-second text-amber-900">
                  Ces acquis n'ont pas de pondération dans ce cours : la note du cours
                  sera la moyenne simple de ses acquis.
                </div>
              )}

              <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-xs">
                  <IconSearch size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={recherche} onChange={e => setRecherche(e.target.value)}
                    placeholder="Filtrer un étudiant…"
                    className="w-full border border-slate-300 rounded-lg pl-7 pr-2 py-1 text-sm" />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table ref={grille} onKeyDown={ev => naviguerGrille(ev, grille.current)}
                  className="text-second border-collapse">
                  <thead>
                    <tr>
                      <th className="sticky left-0 bg-white text-left px-3 py-1.5
                                     border-b border-r border-slate-200 min-w-[180px]">Étudiant</th>
                      <th className="px-2 py-1.5 border-b border-r border-slate-200
                                     text-mention text-slate-500 font-semibold uppercase
                                     tracking-wide w-24" title="Épreuve non présentée">
                        Épreuve
                      </th>
                      {data.acquis.map(a => (
                        <th key={a.aa_code}
                          title={a.description || ''}
                          className="px-2 py-1.5 border-b border-slate-200 font-mono
                                     text-xs text-slate-600 whitespace-nowrap">
                          {a.aa_code}
                          {a.poids != null && (
                            <span className="block font-sans text-mention text-slate-400">
                              poids {Math.round(a.poids)}
                            </span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.etudiants
                      .filter(e => !recherche.trim()
                        || `${e.nom} ${e.prenom} ${e.id_ecampus || ''}`.toLowerCase()
                             .includes(recherche.trim().toLowerCase()))
                      .map((e, ligne) => (
                      <tr key={e.id} className="hover:bg-slate-50/60">
                        <td className="sticky left-0 bg-white px-3 py-1
                                       border-b border-r border-slate-100">
                          <div className="font-semibold text-iip-blue truncate">{e.nom}</div>
                          <div className="text-xs text-slate-500 truncate">{e.prenom}</div>
                        </td>
                        {/* NP / PP : la raison d'un zéro, posée sur l'épreuve
                            entière et non sur un acquis. */}
                        <td className="px-1 py-1 border-b border-r border-slate-100 text-center">
                          <div className="inline-segments">
                            {['NP', 'PP'].map(m => {
                              const actif = data.mentions?.[e.id] === m;
                              return (
                                <button key={m} type="button"
                                  onClick={() => poserMention(e.id, actif ? null : m)}
                                  title={m === 'NP'
                                    ? 'Note de présence — présent, rien qui vaille un point. Zéro, seconde session ouverte.'
                                    : "Pas présenté — absent à l'épreuve. Zéro ; le Conseil appréciera la justification."}
                                  className={`px-1.5 py-0.5 text-xs font-bold
                                    ${actif
                                      ? (m === 'NP' ? 'bg-amber-500 text-white' : 'bg-red-600 text-white')
                                      : 'bg-white text-slate-400 hover:text-slate-600'}`}>
                                  {m}
                                </button>
                              );
                            })}
                          </div>
                        </td>

                        {data.acquis.map((a, nc) => {
                          const v = data.notes[e.id]?.[a.aa_code];
                          const men = data.mentions?.[e.id];
                          return (
                            <td key={a.aa_code} className="px-1 py-1 border-b border-slate-100 text-center">
                              {men ? (
                                <span className={`inline-block w-16 py-1 rounded-lg text-second
                                  font-bold ${men === 'NP'
                                    ? 'bg-amber-500 text-white border border-amber-500'
                                    : 'bg-red-500 text-white border border-red-500'}`}>
                                  {men}
                                </span>
                              ) : (
                                <input {...caseGrille(ligne, nc)}
                                  defaultValue={v ?? ''}
                                  key={`${e.id}-${a.aa_code}-${session}-${v ?? ''}`}
                                  onBlur={ev => {
                                    const brut = ev.target.value;
                                    const avant = v == null ? '' : String(v);
                                    if (brut !== avant) poser(e.id, a.aa_code, brut);
                                  }}
                                  className={`w-16 border rounded-lg px-1.5 py-1 text-sm
                                              text-center tabular-nums ${tonNote(v)}`} />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-second text-slate-500">
                <b>NP</b> — note de présence : l'étudiant s'est présenté sans rien
                produire qui vaille un point. <b>PP</b> — pas présenté à l'épreuve.
                Les deux valent zéro sur tous les acquis du cours, à la différence
                d'un <b>0</b> saisi, qui dit qu'une copie a été remise et ne vaut
                aucun point. La note s'encode par point entier et s'enregistre en
                quittant le champ. Elle vaut pour CE cours :
                un acquis évalué dans un autre cours y garde sa propre note, et la
                délibération consolide les deux.
              </p>
            </>
          )}
        </div>
        </div>

      </div>
    </Fenetre>

      {importer && (
        <ImportAcquisCours coursCode={coursCode} coursNom={data?.cours?.cours_nom}
          annee={annee} onClose={() => setImporter(false)}
          onImporte={() => { charger(); onEnregistre && onEnregistre(); }} />
      )}
    </>
  );
}
