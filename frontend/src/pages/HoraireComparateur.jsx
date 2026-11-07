import { useEffect, useRef, useState } from 'react';
import {
  IconUpload, IconRefresh, IconAlertTriangle, IconCheck, IconTrash,
  IconCalendarEvent, IconUsers,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { EnteteCarte, Encadre, PastilleEtat, TuileEtat, Tableau, TableauEntete, Th, Td, Tr } from '../components/ui.jsx';

/**
 * L'HORAIRE FACE AUX ATTRIBUTIONS.
 *
 * L'horaire n'est pas fait ici : les coordinations le bâtissent dans
 * Hyperplanning, à partir des attributions. Personne ne vérifie ensuite qu'il
 * dépense bien ce qui a été accordé. Un cours à qui l'on a donné quarante
 * périodes peut n'en recevoir que seize à l'horaire ; un cours peut être donné
 * par un autre que son titulaire. Cela se découvre en fin d'année, quand la
 * charge ne tombe pas juste.
 *
 * Lucie compare — elle ne crée pas encore l'horaire. C'est la première marche :
 * avant de prétendre remplacer un logiciel d'horaire, il faut savoir lire le
 * sien et dire où il s'écarte.
 */

const VERDICTS = {
  concordant: { l: 'Concordant', etat: 'reussi' },
  professeur: { l: 'Autre professeur', etat: 'surveiller' },
  heures: { l: 'Charge non dépensée', etat: 'surveiller' },
  hors_attribution: { l: 'Hors attribution', etat: 'corriger' },
};

const h1 = n => `${Number(n ?? 0).toFixed(1).replace('.', ',')} h`;

export default function HoraireComparateur({ annee }) {
  const [lots, setLots] = useState([]);
  const [comp, setComp] = useState(null);
  const [classe, setClasse] = useState('');
  const [apercu, setApercu] = useState(null);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const fichierRef = useRef(null);
  const choisi = useRef(null);

  const memePersonne = async (texte, a) => {
    setErreur('');
    const r = await fetch('/api/horaire/alias', { method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ texte, professeur_id: a.id }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErreur(j.error || `Erreur ${r.status}`); return; }
    charger();
  };

  const charger = async () => {
    if (!annee) return;
    setEnCours(true); setErreur('');
    try {
      const p = new URLSearchParams({ annee });
      if (classe) p.set('classe', classe);
      const [rl, rc] = await Promise.all([
        fetch(`/api/horaire/lots?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() }),
        fetch(`/api/horaire/comparaison?${p}`, { headers: authHeaders() }),
      ]);
      setLots(rl.ok ? await rl.json() : []);
      const j = await rc.json();
      if (!rc.ok) throw new Error(j.error || 'comparaison impossible');
      setComp(j);
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [annee, classe]);

  const envoyer = async (fichier, simulation) => {
    setEnCours(true); setErreur('');
    try {
      const fd = new FormData();
      fd.append('fichier', fichier);
      fd.append('annee', annee);
      fd.append('simulation', String(simulation));
      const rep = await fetch('/api/horaire/import',
        { method: 'POST', headers: authHeaders(), body: fd });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error || 'import impossible');
      if (simulation) { choisi.current = fichier; setApercu(j); }
      else { setApercu(null); choisi.current = null; await charger(); }
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };

  const supprimer = async (id) => {
    setEnCours(true);
    try {
      await fetch(`/api/horaire/lot/${id}`, { method: 'DELETE', headers: authHeaders() });
      await charger();
    } finally { setEnCours(false); }
  };

  const classes = [...new Set(lots.map(l => l.classe).filter(Boolean))];

  return (
    <div className="p-4 space-y-4">
      <section className="carte overflow-hidden">
        <EnteteCarte icone={IconCalendarEvent} titre="L'horaire face aux attributions">
          <div className="flex items-center gap-2">
            <input ref={fichierRef} type="file" accept=".pdf" className="hidden"
              onChange={e => e.target.files?.[0] && envoyer(e.target.files[0], true)} />
            <button onClick={() => fichierRef.current?.click()} disabled={enCours || !annee}
              className="bouton bouton-fort">
              <IconUpload size={15} /> Lire un emploi du temps
            </button>
            <button onClick={charger} disabled={enCours}
              className="bouton">
              <IconRefresh size={14} /> Relire
            </button>
          </div>
        </EnteteCarte>
        <div className="px-4 py-3">
          <p className="text-second text-slate-600">
            L'horaire est bâti par les coordinations, à partir des attributions.
            Lucie le relit et dit où il s'en écarte : un cours donné par un autre
            que son titulaire, une charge accordée mais non posée, un cours à
            l'horaire sans attribution — et l'inverse, qu'on ne regarde jamais :
            une attribution sans une seule séance.
          </p>
          <p className="text-xs text-slate-400 mt-2">
            Le PDF attendu est l'export « Emploi du temps » d'Index Éducation :
            une ligne par séance, colonnes jour / classe / cours / professeur / local.
          </p>
        </div>
      </section>

      {erreur && (
        <Encadre etat="corriger">{erreur}</Encadre>
      )}

      {/* LA SIMULATION D'ABORD : ce qui sera lu, avant que rien ne soit écrit. */}
      {apercu && (
        <div className="bloc-etat px-4 py-3 space-y-2" data-etat="surveiller">
          <div className="text-sm font-semibold text-iip-texte">
            {apercu.classe || 'Classe non reconnue'} — {apercu.seances} séance(s),
            {' '}{h1(apercu.heures)}, du {apercu.periode?.debut} au {apercu.periode?.fin}
          </div>
          <div className="text-second text-slate-700 space-y-0.5">
            <div>{apercu.rapproches} séance(s) rattachée(s) à un professeur de Lucie.</div>
            {!!apercu.sans_code && (
              <div>{apercu.sans_code} séance(s) sans code de cours — elles seront gardées
                telles quelles, sans être rapprochées.</div>
            )}
            {!!apercu.cours_inconnus?.length && (
              <div><b>Cours inconnus en {annee} :</b> {apercu.cours_inconnus.join(', ')} —
                vérifiez l'année de travail.</div>
            )}
            {!!apercu.profs_inconnus?.length && (
              <div><b>Professeurs non reconnus :</b> {apercu.profs_inconnus.join(' · ')}</div>
            )}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button onClick={() => choisi.current && envoyer(choisi.current, false)}
              disabled={enCours}
              className="bouton bouton-fort">
              Enregistrer cet horaire
            </button>
            <button onClick={() => { setApercu(null); choisi.current = null; }}
              className="bouton">Annuler</button>
          </div>
          <p className="text-xs text-slate-500">
            Enregistrer remplace l'horaire déjà connu pour cette classe et cette
            année : un horaire se corrige, deux versions superposées ne comparent plus rien.
          </p>
        </div>
      )}

      {!!lots.length && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-second text-slate-500">Classe :</span>
          <div className="segments">
            <button onClick={() => setClasse('')}
              className={`text-second ${!classe ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}`}>Toutes</button>
            {classes.map(c => (
              <button key={c} onClick={() => setClasse(c)}
                className={`text-second ${classe === c ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}`}>{c}</button>
            ))}
          </div>
          <span className="flex-1" />
          {lots.map(l => (
            <span key={l.id} className="text-xs text-slate-500 flex items-center gap-1">
              {l.classe} · {l.nb_seances} séances · {l.periode_debut} → {l.periode_fin}
              <button onClick={() => supprimer(l.id)} disabled={enCours}
                title="Retirer cet horaire" className="text-slate-400 hover:text-rose-600">
                <IconTrash size={13} />
              </button>
            </span>
          ))}
        </div>
      )}

      {comp && !comp.lignes.length && !comp.sans_seance.length && (
        <div className="carte px-4 py-8 text-center text-sm text-slate-500">
          Aucun horaire lu pour {annee}. Chargez l'export d'une classe pour commencer.
        </div>
      )}

      {comp && !!(comp.lignes.length || comp.sans_seance.length) && (
        <>
          <div className="grid gap-2 sm:grid-cols-4">
            {[
              ['Séances lues', comp.total.seances],
              ['Heures posées', h1(comp.total.heures_horaire)],
              ['Cours concordants', comp.total.concordants],
              ['À regarder', comp.total.ecarts + comp.total.sans_seance],
            ].map(([l, v], i) => (
              <TuileEtat key={l} valeur={v} libelle={l}
                etat={i === 3 && (comp.total.ecarts + comp.total.sans_seance) ? 'surveiller' : 'neutre'} />
            ))}
          </div>

          <Tableau dense>
              <TableauEntete>
                  <Th>Cours</Th>
                  <Th align="droite">Séances</Th>
                  <Th align="droite">À l'horaire</Th>
                  <Th align="droite">Attribué</Th>
                  <Th align="droite">Écart</Th>
                  <Th>Qui le donne</Th>
                  <Th>Verdict</Th>
              </TableauEntete>
              <tbody>
                {comp.lignes.map(l => {
                  const v = VERDICTS[l.verdict] || VERDICTS.concordant;
                  return (
                    <Tr key={l.cours_code}>
                      <Td>
                        <span className="font-mono font-bold text-slate-700">{l.cours_code}</span>
                        {l.cours_nom && (
                          <span className="text-slate-500"> · {l.cours_nom}</span>
                        )}
                        {l.ue_num ? (
                          <span className="text-slate-400"> — UE {l.ue_num}</span>
                        ) : null}
                      </Td>
                      <Td align="droite" className="tabular-nums">{l.seances}</Td>
                      <Td align="droite" className="tabular-nums">{h1(l.heures_horaire)}</Td>
                      <Td align="droite" className="tabular-nums text-slate-500">
                        {h1(l.heures_attribuees)}
                      </Td>
                      <Td align="droite" className={`tabular-nums font-semibold ${
                        Math.abs(l.ecart) > 2 ? 'text-rose-700' : 'text-slate-400'}`}>
                        {l.ecart > 0 ? '+' : ''}{h1(l.ecart)}
                      </Td>
                      <Td>
                        {l.profs_horaire.map((p, i) => (
                          <span key={i} className={p.attribue ? '' : 'text-amber-800 font-semibold'}>
                            {i ? ' · ' : ''}{p.nom || '—'}
                            {p.attribue ? '' : <IconAlertTriangle size={12} className="inline ml-0.5 align-[-1px]" />}
                          </span>
                        ))}
                        {!!l.profs_attribues.length && !l.profs_horaire.every(p => p.attribue) && (
                          <div className="text-xs text-slate-500">
                            attribué à {l.profs_attribues.map(p => p.nom || 'À désigner').join(', ')}
                          </div>
                        )}
                        {/* LE NOM DE L'EXPORT N'EST PAS RECONNU, MAIS C'EST LA MÊME
                            PERSONNE (ELJASZUK / ELJASUK) : on le dit une fois, et
                            c'est retenu pour les imports suivants. */}
                        {l.profs_horaire.filter(p => !p.id && p.nom).map(p => l.profs_attribues.filter(a => a.id).map(a => (
                          <button key={`${p.nom}-${a.id}`} type="button" onClick={() => memePersonne(p.nom, a)}
                            className="block text-xs text-iip-blue underline mt-0.5">
                            « {p.nom} » est {a.nom} — c'est la même personne
                          </button>
                        )))}
                      </Td>
                      <Td>
                        <PastilleEtat etat={v.etat}>{v.l}</PastilleEtat>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
          </Tableau>

          {/* LA MOITIÉ QU'ON NE REGARDE JAMAIS : ce qui est payé et jamais posé. */}
          {!!comp.sans_seance.length && (
            <Encadre etat="corriger" icone={IconAlertTriangle}
              titre={`${comp.sans_seance.length} cours attribué(s) sans une seule séance à l'horaire`}>
              <div className="space-y-0.5">
                {comp.sans_seance.map(x => (
                  <div key={x.cours_code}>
                    <span className="font-mono font-bold">{x.cours_code}</span>
                    {x.cours_nom ? ` · ${x.cours_nom}` : ''} — {h1(x.heures_attribuees)} —
                    {' '}{x.profs.join(', ')}
                  </div>
                ))}
              </div>
            </Encadre>
          )}

          {(!!comp.collisions.professeur.length || !!comp.collisions.local.length) && (
            <Encadre etat="surveiller" icone={IconUsers} titre="Chevauchements">
              <div className="space-y-0.5">
                {comp.collisions.professeur.map((x, i) => (
                  <div key={`p${i}`}>Professeur : {x}</div>
                ))}
                {comp.collisions.local.map((x, i) => <div key={`l${i}`}>Local : {x}</div>)}
              </div>
            </Encadre>
          )}

          {(!!comp.profs_non_rapproches.length || !!comp.sans_code.length) && (
            <div className="text-second text-slate-600 space-y-1">
              {!!comp.profs_non_rapproches.length && (
                <div>
                  <b>Professeurs de l'horaire absents de Lucie :</b>{' '}
                  {comp.profs_non_rapproches.join(' · ')} — leurs séances sont lues,
                  mais ne se comparent à aucune attribution.
                </div>
              )}
              {!!comp.sans_code.length && (
                <div>
                  <b>{comp.sans_code.length} séance(s) sans code de cours</b> (matière à
                  préciser, séance d'information) : gardées, non comparées.
                </div>
              )}
            </div>
          )}

          {!comp.total.ecarts && !comp.total.sans_seance && (
            <Encadre etat="reussi" icone={IconCheck} titre="L'horaire dépense exactement ce que les attributions ont accordé, et par les bonnes personnes." />
          )}
        </>
      )}
    </div>
  );
}
