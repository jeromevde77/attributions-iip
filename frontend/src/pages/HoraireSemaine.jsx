/**
 * L'HORAIRE DE LA SEMAINE (Charles, 28 septembre 2026 : « copier le
 * fonctionnement d'Hyperplanning, mais en plus simple — une grille qui montre
 * la semaine, des tuiles déplaçables pour les blocs de 2 h ou 1 h, sur base
 * des attributions et des groupes »).
 *
 * Trois lectures d'une même grille : la classe (une section et un bloc), le
 * professeur, le local. Dans la lecture par classe, le BAC dit ce qui reste à
 * poser, groupe par groupe ; on y prend une carte et on la pose sur la grille.
 * Une tuile se déplace au quart d'heure, se rallonge par le bas, s'ouvre d'un
 * clic (local, durée, annulation). Un conflit — même professeur, même local,
 * même classe au même moment — se voit sur la tuile, il n'est pas interdit.
 *
 * Rien ne se devine : une séance déplacée l'est par la personne connectée, et
 * le serveur le garde.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { IconChevronLeft, IconChevronRight, IconCopy, IconTrash, IconUpload } from '@tabler/icons-react';
import { authHeaders, getAnnee, getUser } from '../lib/api.js';
import { Fenetre } from '../components/ui.jsx';
import { teinteCours, styleTuileCours } from '../lib/teinteCours.js';

const H0 = 8, H1 = 21, PX = 12;                     // 12 px par quart d'heure
const NOMS_JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const teinte = teinteCours;
const hm = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const deHm = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
const lisible = t => { const n = hm(t); return `${Math.floor(n / 60)}h${String(n % 60).padStart(2, '0')}`; };
const iso = d => d.toISOString().slice(0, 10);
const ajouter = (dIso, n) => { const d = new Date(dIso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const lundiDe = dIso => { const d = new Date(dIso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return iso(d); };
const court = dIso => dIso.slice(8, 10) + '-' + dIso.slice(5, 7);
const RAISONS = { professeur: 'le professeur est déjà pris', local: 'le local est déjà occupé', classe: 'la classe a déjà cours' };
const nomProf = s => [s.prof_nom, s.prof_prenom].filter(Boolean).join(' ') || s.professeur_texte || '';

async function appel(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: authHeaders() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
  return j;
}

export default function HoraireSemaine() {
  const [annee] = useState(getAnnee());
  const peutEcrire = ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'coordination'].includes(getUser()?.role);
  const [vue, setVue] = useState('classe');
  const [cle, setCle] = useState('');
  const [classes, setClasses] = useState([]);
  const [ref, setRef] = useState({ profs: [], locaux: [] });
  const [lundi, setLundi] = useState(() => lundiDe(iso(new Date())));
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const duree = 120;
  const [sel, setSel] = useState(null);             // séance ouverte dans la bulle
  const [recopie, setRecopie] = useState(null);     // fenêtre de recopie
  const [importer, setImporter] = useState(false);  // import Hyperplanning (CSV)
  const [glisse, setGlisse] = useState(null);       // { id | groupe, d, debut, fin } pendant un geste
  const grille = useRef(null);

  useEffect(() => {
    appel(`/api/horaire/classes?annee=${annee}`).then(l => { setClasses(l); if (!cle && l[0]) setCle(l[0].cle); }).catch(e => setErreur(e.message));
    appel(`/api/horaire/referentiel?annee=${annee}`).then(setRef).catch(() => {});
    // eslint-disable-next-line
  }, [annee]);

  const charger = () => {
    if (!cle) { setData(null); return; }
    appel(`/api/horaire/semaine?annee=${annee}&lundi=${lundi}&vue=${vue}&cle=${encodeURIComponent(cle)}`)
      .then(j => { setData(j); setErreur(null); }).catch(e => setErreur(e.message));
  };
  useEffect(charger, [annee, lundi, vue, cle]);   // eslint-disable-line

  const choisirVue = v => {
    setVue(v); setSel(null);
    setCle(v === 'classe' ? (classes[0]?.cle || '') : v === 'professeur' ? String(ref.profs[0]?.id || '') : (ref.locaux[0]?.nom || ''));
  };

  const seances = data?.seances || [];
  // Du lundi au samedi ; le dimanche paraît s'il porte une séance (distanciel).
  const indexJour = d => (new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7;
  const nbJours = seances.some(s => indexJour(s.date) === 6) ? 7 : 6;
  const jours = (data?.jours || []).slice(0, nbJours);
  const hauteur = (H1 - H0) * 4 * PX;

  // ── Les gestes : poser, déplacer, rallonger ──────────────────────────────
  const posDe = (x, y) => {
    const cols = [...(grille.current?.querySelectorAll('[data-jour]') || [])];
    for (const c of cols) {
      const r = c.getBoundingClientRect();
      if (x >= r.left && x <= r.right) return { d: Number(c.dataset.jour), m: H0 * 60 + Math.round((y - r.top) / PX) * 15 };
    }
    return null;
  };
  const borne = (debut, long) => Math.max(H0 * 60, Math.min(H1 * 60 - long, debut));

  function commencer(ev, geste) {
    if (!peutEcrire) { if (geste.seance) setSel(geste.seance); return; }
    ev.preventDefault();
    const x0 = ev.clientX, y0 = ev.clientY;
    let bouge = false, courant = null;
    const mv = e => {
      if (!bouge && Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) < 4) return;
      bouge = true;
      if (geste.type === 'rallonger') {
        const p = posDe(e.clientX, e.clientY);
        if (!p) return;
        const fin = Math.max(hm(geste.seance.heure_debut) + 15, Math.min(H1 * 60, p.m));
        courant = { id: geste.seance.id, d: geste.d, debut: hm(geste.seance.heure_debut), fin };
      } else {
        const p = posDe(e.clientX, e.clientY - geste.decalY);
        if (!p) return;
        const debut = borne(p.m, geste.long);
        courant = { id: geste.seance?.id, groupe: geste.groupe, d: p.d, debut, fin: debut + geste.long };
      }
      setGlisse(courant);
    };
    const up = async () => {
      document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up);
      setGlisse(null);
      if (!bouge || !courant) { if (geste.seance) setSel(geste.seance); return; }
      const corps = { date: jours[courant.d]?.date, heure_debut: deHm(courant.debut), heure_fin: deHm(courant.fin) };
      try {
        if (geste.groupe) await appel('/api/horaire/seance', { method: 'POST', body: JSON.stringify({ ...corps, groupe_id: geste.groupe.id }) });
        else await appel(`/api/horaire/seance/${courant.id}`, { method: 'PUT', body: JSON.stringify(corps) });
        charger();
      } catch (e) { setErreur(e.message); }
    };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
  }

  const enregistrerSel = async modif => {
    try { await appel(`/api/horaire/seance/${sel.id}`, { method: 'PUT', body: JSON.stringify(modif) }); setSel(null); charger(); }
    catch (e) { setErreur(e.message); }
  };
  const supprimerSel = async () => {
    try { await appel(`/api/horaire/seance/${sel.id}`, { method: 'DELETE' }); setSel(null); charger(); }
    catch (e) { setErreur(e.message); }
  };

  const conflits = seances.filter(s => s.conflits?.length);
  const libelleCle = vue === 'classe' ? classes.find(c => c.cle === cle)?.libelle
    : vue === 'professeur' ? ref.profs.find(p => String(p.id) === cle)?.nom : cle;

  return (
    <div className="space-y-3 text-[13px]">
      {/* LA BARRE : quelle lecture, laquelle, quelle semaine */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-champ border border-slate-300 overflow-hidden">
          {[['classe', 'Classe'], ['professeur', 'Professeur'], ['local', 'Local']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => choisirVue(k)}
              className={`px-3 h-9 text-[12.5px] ${vue === k ? 'bg-[#1B2B4B] text-white' : 'bg-white text-slate-700'}`}>{l}</button>
          ))}
        </div>
        <select className="controle min-w-[14rem]" value={cle} onChange={e => { setCle(e.target.value); setSel(null); }}>
          {vue === 'classe' && classes.map(c => <option key={c.cle} value={c.cle}>{c.libelle}</option>)}
          {vue === 'professeur' && ref.profs.map(p => <option key={p.id} value={String(p.id)}>{p.nom} {p.prenom}</option>)}
          {vue === 'local' && ref.locaux.map(l => <option key={l.nom} value={l.nom}>{l.nom}{l.type ? ` — ${l.type}` : ''}{l.places ? ` (${l.places})` : ''}</option>)}
        </select>
        <div className="inline-flex items-center gap-1 ml-2">
          <button type="button" className="bouton bouton-icone" aria-label="Semaine précédente" onClick={() => setLundi(ajouter(lundi, -7))}><IconChevronLeft size={16} /></button>
          <input type="date" className="controle" value={lundi} onChange={e => e.target.value && setLundi(lundiDe(e.target.value))} />
          <button type="button" className="bouton bouton-icone" aria-label="Semaine suivante" onClick={() => setLundi(ajouter(lundi, 7))}><IconChevronRight size={16} /></button>
          <span className="text-slate-500 ml-1">du {court(lundi)} au {court(ajouter(lundi, nbJours - 1))}
            {data?.semaine && data.semaine.type !== 'cours' ? ` · ${data.semaine.label || data.semaine.type}` : data?.semaine ? ` · semaine ${data.semaine.semaine_num}` : ''}</span>
        </div>
        {vue === 'classe' && peutEcrire && (
          <button type="button" className="bouton ml-auto" onClick={() => setImporter(true)}>
            <IconUpload size={15} /> Importer d'Hyperplanning…
          </button>
        )}
        {vue === 'classe' && peutEcrire && (
          <button type="button" className="bouton" disabled={!seances.length}
            onClick={() => setRecopie({ cibles: new Set(), rapport: null, enCours: false })}>
            <IconCopy size={15} /> Recopier cette semaine…
          </button>
        )}
      </div>

      {erreur && <div data-etat="corriger" className="bloc-etat px-3 py-2">{erreur}</div>}
      {!classes.length && !erreur && <p className="text-slate-500">Aucune classe : l'horaire se construit sur les groupes des attributions, et aucun groupe n'existe encore cette année.</p>}

      <div className={`grid gap-3 ${vue === 'classe' ? 'grid-cols-[minmax(0,1fr)_15rem]' : 'grid-cols-1'}`}>
        {/* LA GRILLE */}
        <div ref={grille} className="border border-slate-200 rounded-carte overflow-hidden bg-white select-none">
          <div className="grid" style={{ gridTemplateColumns: `3rem repeat(${nbJours}, minmax(0,1fr))` }}>
            <div className="tab-entete h-9" />
            {jours.map((j, i) => (
              <div key={j.date} className="tab-entete h-9 flex flex-col items-center justify-center border-l border-slate-200 text-[11.5px] text-slate-600">
                <span>{NOMS_JOURS[i]} {court(j.date)}</span>
                {j.ferie && <span className="text-[10px] text-slate-400">{j.ferie}</span>}
              </div>
            ))}
            <div className="relative" style={{ height: hauteur }}>
              {Array.from({ length: H1 - H0 }, (_, i) => (
                <div key={i} className="absolute right-1 text-[10px] text-slate-400" style={{ top: i * 4 * PX - 6 }}>{H0 + i}h</div>
              ))}
            </div>
            {jours.map((j, d) => (
              <div key={j.date} data-jour={d} className="relative border-l border-slate-200" style={{ height: hauteur }}>
                {Array.from({ length: H1 - H0 }, (_, i) => (
                  <div key={i} className="absolute left-0 right-0 border-t border-dashed border-slate-100" style={{ top: i * 4 * PX }} />
                ))}
                {j.ferie && (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-300 text-[13px] pointer-events-none"
                    style={{ background: 'repeating-linear-gradient(45deg, transparent 0 8px, rgba(27,43,75,.05) 8px 16px)' }}>Férié</div>
                )}
                {seances.filter(s => s.date === j.date).map(s => {
                  const g = glisse && glisse.id === s.id ? glisse : null;
                  if (g && g.d !== d) return null;
                  const debut = g ? g.debut : hm(s.heure_debut), fin = g ? g.fin : hm(s.heure_fin);
                  const c = s.annule ? '#9AA3B2' : teinte(s.cours_code);
                  return (
                    <div key={s.id} onPointerDown={ev => commencer(ev, { seance: s, decalY: ev.clientY - ev.currentTarget.getBoundingClientRect().top, long: hm(s.heure_fin) - hm(s.heure_debut) })}
                      title={s.conflits?.length ? `Conflit : ${s.conflits.map(x => RAISONS[x]).join(', ')}` : undefined}
                      className={`absolute left-[3px] right-[3px] overflow-hidden rounded-r-[8px] px-1.5 py-1 text-[11px] leading-tight ${peutEcrire ? 'cursor-grab' : 'cursor-pointer'} ${g ? 'opacity-80 z-10' : ''}`}
                      style={{ top: (debut - H0 * 60) / 15 * PX, height: (fin - debut) / 15 * PX - 2,
                        ...(s.annule ? { borderLeft: `4px solid ${c}`, background: 'repeating-linear-gradient(45deg,#F4F5F7 0 6px,#fff 6px 12px)' } : styleTuileCours(s.cours_code)),
                        outline: s.conflits?.length ? '2px solid var(--c-refuse)' : 'none', outlineOffset: -2 }}>
                      <div className={`font-semibold truncate ${s.annule ? 'line-through text-slate-400' : 'text-[#1B2B4B]'}`}>{s.cours_code} {s.cours_nom || s.matiere || ''}</div>
                      <div className="truncate text-slate-600">{s.annule ? 'Annulée' : nomProf(s)}{s.sous_groupe ? ` · gr. ${s.sous_groupe}` : s.groupe_nom && s.groupe_nom !== 'A' ? ` · gr. ${s.groupe_nom}` : ''}</div>
                      <div className="truncate text-slate-500">{s.local_texte || 'local à préciser'} · {lisible(deHm(debut))}–{lisible(deHm(fin))}</div>
                      {peutEcrire && <div onPointerDown={ev => { ev.stopPropagation(); commencer(ev, { type: 'rallonger', seance: s, d }); }}
                        className="absolute left-0 right-0 bottom-0 h-1.5 cursor-ns-resize" />}
                    </div>
                  );
                })}
                {glisse?.groupe && glisse.d === d && (
                  <div className="absolute left-[3px] right-[3px] rounded-r-[8px] px-1.5 py-1 text-[11px] opacity-80 z-10"
                    style={{ top: (glisse.debut - H0 * 60) / 15 * PX, height: (glisse.fin - glisse.debut) / 15 * PX - 2,
                      ...styleTuileCours(glisse.groupe.code_cours) }}>
                    <b>{glisse.groupe.code_cours}</b> {lisible(deHm(glisse.debut))}–{lisible(deHm(glisse.fin))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* LE BAC */}
        {vue === 'classe' && (
          <div className="border border-slate-200 rounded-carte p-2.5 space-y-2 self-start">
            <div className="flex items-center justify-between gap-2">
              <b className="text-[12.5px] text-iip-blue">À placer</b>
              {/* CHEZ NOUS, UN BLOC FAIT 120 MINUTES (Charles, 9 octobre 2026). Une
                  séance plus longue se rallonge sur la grille, par quart d'heure. */}
              <span className="text-[11px] text-slate-500">blocs de 2 h</span>
            </div>
            <p className="text-[11px] text-slate-500">Glissez une carte sur la grille. Le reste se calcule sur les heures attribuées au groupe.</p>
            <div className="space-y-1.5 max-h-[60vh] overflow-auto pr-0.5">
              {(data?.bac || []).map(g => {
                const fini = g.reste <= 0;
                return (
                  <div key={g.id} onPointerDown={ev => !fini && commencer(ev, { groupe: g, decalY: 0, long: duree })}
                    className={`rounded-r-[8px] px-2 py-1 text-[11.5px] ${fini ? 'opacity-50' : peutEcrire ? 'cursor-grab' : ''}`}
                    style={styleTuileCours(g.code_cours, { fond: 12 })}>
                    <div className="font-semibold text-[#1B2B4B] truncate">{g.code_cours} {g.cours_nom}{g.nom !== 'A' ? ` · gr. ${g.nom}` : ''}</div>
                    <div className="text-slate-500 truncate">{[g.prof_nom, g.prof_prenom].filter(Boolean).join(' ') || 'professeur à attribuer'}</div>
                    <div className="text-slate-500 tabular-nums">
                      {g.heures_posees} h posées sur {g.heures_attribuees} · <b className={fini ? 'text-[#3E7D5E]' : 'text-[#1B2B4B]'}>{fini ? 'complet' : `reste ${g.reste} h`}</b>
                      {g.prevu_semaine != null && <span> · prévu cette semaine {g.prevu_semaine} h, posé {g.pose_semaine} h</span>}
                    </div>
                  </div>
                );
              })}
              {data && !(data.bac || []).length && <p className="text-slate-400 text-[12px]">Aucun groupe pour cette classe.</p>}
            </div>
          </div>
        )}
      </div>

      {conflits.length > 0 && (
        <div data-etat="corriger" className="bloc-etat px-3 py-2 text-[12.5px]">
          <b>{conflits.length} séance(s) en conflit cette semaine</b> (cerclées de brique) :{' '}
          {conflits.slice(0, 6).map(s => `${s.cours_code} le ${court(s.date)} à ${lisible(s.heure_debut)} — ${s.conflits.map(x => RAISONS[x]).join(', ')}`).join(' · ')}
        </div>
      )}
      {!peutEcrire && <p className="text-[11.5px] text-slate-400">Lecture seule : l'horaire se compose par la coordination, le secrétariat et la direction.</p>}

      {/* LA BULLE D'UNE SÉANCE */}
      {sel && (
        <Fenetre titre={`${sel.cours_code} ${sel.cours_nom || ''}`} large="petite" onFermer={() => setSel(null)}
          sous={`${NOMS_JOURS[(new Date(sel.date + 'T12:00:00Z').getUTCDay() + 6) % 7]} ${court(sel.date)} · ${lisible(sel.heure_debut)}–${lisible(sel.heure_fin)} · ${nomProf(sel) || 'professeur à attribuer'}`}
          pied={peutEcrire ? <>
            <button className="bouton bouton-detruire" onClick={supprimerSel}><IconTrash size={14} /> Supprimer</button>
            <span className="flex-1" />
            <button className="bouton" onClick={() => setSel(null)}>Fermer</button>
            <button className="bouton bouton-fort" onClick={() => enregistrerSel({ local_texte: sel._local ?? sel.local_texte,
              heure_fin: deHm(hm(sel.heure_debut) + (sel._duree ?? (hm(sel.heure_fin) - hm(sel.heure_debut)))),
              annule: sel._annule ?? !!sel.annule, commentaire: sel._commentaire ?? sel.commentaire })}>Enregistrer</button>
          </> : null}>
          <div className="space-y-3 text-[13px]">
            <label className="block">
              <span className="text-[11px] text-slate-500">Local</span>
              <input className="controle w-full" list="locaux-horaire" disabled={!peutEcrire}
                value={sel._local ?? sel.local_texte ?? ''} onChange={e => setSel({ ...sel, _local: e.target.value })}
                placeholder="P2 523, Nile, Distanciel asynchrone…" />
              <datalist id="locaux-horaire">{ref.locaux.map(l => <option key={l.nom} value={l.nom} />)}<option value="Distanciel asynchrone" /></datalist>
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-500">Durée</span>
              <select className="controle w-full" disabled={!peutEcrire}
                value={sel._duree ?? (hm(sel.heure_fin) - hm(sel.heure_debut))} onChange={e => setSel({ ...sel, _duree: Number(e.target.value) })}>
                {[30, 45, 60, 90, 120, 150, 180, 240].map(m => <option key={m} value={m}>{Math.floor(m / 60)} h{m % 60 ? String(m % 60).padStart(2, '0') : ''}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" disabled={!peutEcrire} checked={sel._annule ?? !!sel.annule} onChange={e => setSel({ ...sel, _annule: e.target.checked })} />
              Séance annulée <span className="text-slate-400 text-[11.5px]">— elle reste visible, barrée, et ne compte plus dans les heures posées</span>
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-500">Remarque</span>
              <input className="controle w-full" disabled={!peutEcrire} value={sel._commentaire ?? sel.commentaire ?? ''}
                onChange={e => setSel({ ...sel, _commentaire: e.target.value })} placeholder="Grand auditoire svp, sous-groupe…" />
            </label>
            {sel.conflits?.length > 0 && <div data-etat="corriger" className="bloc-etat px-2.5 py-1.5 text-[12px]">Conflit : {sel.conflits.map(x => RAISONS[x]).join(', ')}.</div>}
            <p className="text-[11px] text-slate-400">
              {sel.source === 'import' && !sel.modifie_lucie ? 'Séance reprise d’un import.' : ''}
              {sel.cree_par ? ` Posée par ${sel.cree_par}.` : ''}{sel.modifie_par ? ` Modifiée par ${sel.modifie_par}.` : ''}
            </p>
          </div>
        </Fenetre>
      )}

      {importer && <ImportHyper annee={annee} cle={cle} libelle={libelleCle} classes={classes} vueClasse={vue === 'classe'}
        onFermer={() => setImporter(false)} onFini={() => { setImporter(false); charger(); }} />}

      {/* LA RECOPIE */}
      {recopie && <Recopie annee={annee} cle={cle} lundi={lundi} libelle={libelleCle} etat={recopie} setEtat={setRecopie}
        onFini={() => { setRecopie(null); charger(); }} />}
    </div>
  );
}

function Recopie({ annee, cle, lundi, libelle, etat, setEtat, onFini }) {
  const [semaines, setSemaines] = useState([]);
  useEffect(() => { appel(`/api/horaire/semaines?annee=${annee}`).then(setSemaines).catch(() => {}); }, [annee]);
  const futures = useMemo(() => semaines.filter(s => s.date_debut > lundi), [semaines, lundi]);
  const bascule = d => setEtat(e => { const c = new Set(e.cibles); c.has(d) ? c.delete(d) : c.add(d); return { ...e, cibles: c, rapport: null }; });
  const toutesCours = () => setEtat(e => ({ ...e, cibles: new Set(futures.filter(s => s.type === 'cours').map(s => s.date_debut)), rapport: null }));
  const lancer = async simulation => {
    setEtat(e => ({ ...e, enCours: true, erreur: null }));
    try {
      const j = await appel('/api/horaire/recopier', { method: 'POST',
        body: JSON.stringify({ annee, cle, lundi, cibles: [...etat.cibles], simulation }) });
      if (!simulation) { onFini(); return; }
      setEtat(e => ({ ...e, rapport: j, enCours: false }));
    } catch (err) { setEtat(e => ({ ...e, enCours: false, erreur: err.message })); }
  };
  return (
    <Fenetre titre="Recopier la semaine" large="moyenne" onFermer={() => setEtat(null)}
      sous={`${libelle || ''} · semaine du ${court(lundi)} — ses séances sont recopiées, jour pour jour, sur les semaines cochées`}
      pied={<>
        <span className="flex-1 min-w-0 text-[12px] text-slate-500">
          {etat.rapport ? `${etat.rapport.total} séance(s) seront créées.` : 'Vérifiez d’abord : rien n’est écrit avant de confirmer.'}
        </span>
        <button className="bouton" onClick={() => setEtat(null)}>Annuler</button>
        {!etat.rapport
          ? <button className="bouton bouton-fort" disabled={!etat.cibles.size || etat.enCours} onClick={() => lancer(true)}>Vérifier</button>
          : <button className="bouton bouton-fort" disabled={!etat.rapport.total || etat.enCours} onClick={() => lancer(false)}>Recopier {etat.rapport.total} séance(s)</button>}
      </>}>
      <div className="space-y-2 text-[13px]">
        <button type="button" className="bouton bouton-compact" onClick={toutesCours}>Cocher toutes les semaines de cours suivantes</button>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
          {futures.map(s => {
            const r0 = etat.rapport?.rapport?.find(x => x.lundi === s.date_debut);
            return (
              <label key={s.id} className={`flex items-start gap-1.5 px-2 py-1 rounded-champ border ${s.type === 'cours' ? 'border-slate-200' : 'border-dashed border-slate-300 text-slate-400'}`}>
                <input type="checkbox" checked={etat.cibles.has(s.date_debut)} onChange={() => bascule(s.date_debut)} />
                <span className="text-[12px]">S{s.semaine_num} · {court(s.date_debut)}{s.type !== 'cours' ? ` · ${s.label || s.type}` : ''}
                  {r0 && <span className="block text-[11px] text-slate-500">{r0.creees} créée(s){r0.ignorees ? `, ${r0.ignorees} non posée(s) : ${r0.raison}` : ''}</span>}
                </span>
              </label>
            );
          })}
        </div>
        {etat.erreur && <div data-etat="corriger" className="bloc-etat px-2.5 py-1.5">{etat.erreur}</div>}
      </div>
    </Fenetre>
  );
}

/* L'IMPORT DE L'EXPORT « LISTE » D'HYPERPLANNING (29 septembre 2026). Le
   fichier CSV du service informatique ; la simulation dit ce qui entrera, ce
   qui est écarté, ce qui ne se rattache à aucun cours ni à aucun professeur —
   rien n'est écrit avant de confirmer. */
function ImportHyper({ annee, cle, libelle, classes = [], vueClasse = true, onFermer, onFini }) {
  const [fichier, setFichier] = useState(null);
  const [rapport, setRapport] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  /* TOUT LE FICHIER PAR DÉFAUT (5 octobre 2026 : « tu ne parviens pas à tout
     importer ») : l'export de l'Institut porte toutes les classes, et chacune
     va dans la sienne. « Cette classe seulement » reste pour l'export d'une
     classe. */
  const [tout, setTout] = useState(true);
  const [choix, setChoix] = useState({});      // classe du fichier → « section|bloc » ('' = ne pas importer)
  const envoyer = async (simulation, corr = choix) => {
    setEnCours(true); setErreur(null);
    try {
      const f = new FormData();
      f.append('fichier', fichier); f.append('annee', annee); f.append('simulation', String(simulation));
      f.append('cle', tout ? '*' : cle);
      if (tout) f.append('correspondances', JSON.stringify(corr));
      const h = { ...authHeaders() }; delete h['Content-Type'];     // le navigateur écrit la frontière du multipart
      const r = await fetch('/api/horaire/import-csv', { method: 'POST', headers: h, body: f });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      if (simulation) setRapport(j); else onFini();
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };
  const changerClasse = (source, v) => {
    const corr = { ...Object.fromEntries((rapport?.classes || []).map(x => [x.classe_source, x.cle || ''])), ...choix, [source]: v };
    setChoix(corr); envoyer(true, corr);
  };
  const R = rapport;
  const date = d => d?.split('-').reverse().join('/');
  const options = cleCourante => {
    const l = [...classes];
    if (cleCourante && !l.some(c => c.cle === cleCourante)) l.push({ cle: cleCourante, libelle: cleCourante.replace('|', ' ') });
    return l;
  };
  return (
    <Fenetre titre="Importer un horaire d'Hyperplanning" large={tout ? 'grande' : 'moyenne'} onFermer={onFermer}
      sous={tout ? 'Tout le fichier — chaque classe dans la sienne ; rien n’est écrit avant de confirmer'
        : `Dans la classe ${libelle || ''} — l'export « liste » en CSV ; rien n'est écrit avant de confirmer`}
      pied={<>
        <span className="flex-1 min-w-0 text-[12px] text-slate-500">
          {R ? `${R.seances} séance(s) à importer${R.tout ? ` dans ${R.classes.filter(x => !x.ecartee).length} classe(s)` : (R.remplacees ? `, ${R.remplacees} séance(s) d'un import précédent remplacée(s)` : '')}.` : 'Choisissez le fichier, puis vérifiez.'}
        </span>
        <button className="bouton" onClick={onFermer}>Annuler</button>
        {!R ? <button className="bouton bouton-fort" disabled={!fichier || enCours || (!tout && !(vueClasse && cle))} onClick={() => envoyer(true)}>{enCours ? '…' : 'Vérifier'}</button>
          : <button className="bouton bouton-fort" disabled={!R.seances || enCours} onClick={() => envoyer(false)}>{enCours ? '…' : `Importer ${R.seances} séance(s)`}</button>}
      </>}>
      <div className="space-y-3 text-[13px]">
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" accept=".csv,text/csv" onChange={e => { setFichier(e.target.files?.[0] || null); setRapport(null); setChoix({}); }} />
          <span className="segments">
            <button type="button" className={`px-3 py-1 text-[12px] ${tout ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}`}
              onClick={() => { setTout(true); setRapport(null); }}>Tout le fichier</button>
            <button type="button" className={`px-3 py-1 text-[12px] ${!tout ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}`}
              disabled={!vueClasse} title={vueClasse ? '' : 'Choisissez d’abord une classe dans la vue « classe »'}
              onClick={() => { setTout(false); setRapport(null); }}>Cette classe seulement{libelle && vueClasse ? ` (${libelle})` : ''}</button>
          </span>
        </div>
        {erreur && <div data-etat="corriger" className="bloc-etat px-3 py-2">{erreur}</div>}
        {R && R.tout && (
          <div className="space-y-2">
            <div data-etat="neutre" className="bloc-etat px-3 py-2">
              <b>{R.seances}</b> séance(s), soit {R.heures} h, lues dans {R.lignes} ligne(s) ; semaine 1 au {date(R.semaine_1)}.
              Une séance commune à plusieurs classes entre dans l'horaire de chacune.
            </div>
            <div className="border border-slate-200 rounded-carte overflow-hidden">
              <table className="w-full text-[12.5px]">
                <thead><tr className="tab-entete text-left text-[10.5px] uppercase tracking-[.08em] text-slate-500">
                  <th className="px-3 py-1.5">Classe du fichier</th><th className="px-3 py-1.5">Classe de Lucie</th>
                  <th className="px-3 py-1.5 text-right">Séances</th><th className="px-3 py-1.5">Période</th><th className="px-3 py-1.5">À regarder</th></tr></thead>
                <tbody>
                  {R.classes.map(x => (
                    <tr key={x.classe_source} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-1.5 font-semibold">{x.classe_source}</td>
                      <td className="px-3 py-1.5">
                        <select className="controle text-[12.5px]" value={x.cle || ''} disabled={enCours}
                          onChange={e => changerClasse(x.classe_source, e.target.value)}>
                          <option value="">— ne pas importer —</option>
                          {options(x.cle).map(c => <option key={c.cle} value={c.cle}>{c.libelle}</option>)}
                        </select>
                        {x.ecartee && <div className="text-[11.5px] text-[color:var(--c-refuse)] mt-0.5">{x.ecartee}</div>}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{x.ecartee ? '—' : x.seances}</td>
                      <td className="px-3 py-1.5 text-slate-500">{x.du ? `${date(x.du)} → ${date(x.au)}` : ''}</td>
                      <td className="px-3 py-1.5 text-[12px] text-slate-600">
                        {!x.ecartee && [
                          x.remplacees ? `${x.remplacees} séance(s) d'un import précédent remplacée(s)` : null,
                          x.conservees_retouchees ? `${x.conservees_retouchees} retouchée(s) dans Lucie, gardée(s)` : null,
                          x.deja_posees_dans_lucie ? `${x.deja_posees_dans_lucie} posée(s) à la main : vérifiez les doublons` : null,
                          x.sans_cours?.length ? `sans cours reconnu : ${x.sans_cours.map(c => `${c.libelle} (${c.seances})`).join(', ')}` : null,
                          x.profs_inconnus?.length ? `professeur non reconnu : ${x.profs_inconnus.map(c => c.nom).join(', ')}` : null,
                          x.ignorees?.length ? `${x.ignorees.length} ligne(s) écartée(s) : ${[...new Set(x.ignorees.map(g => g.raison))].join(' ; ')}` : null,
                          x.incoherentes?.length ? `${x.incoherentes.length} ligne(s) incohérente(s) : ${x.incoherentes.map(g => g.ligne).join(', ')}` : null,
                        ].filter(Boolean).map((t, i) => <div key={i}>{t}</div>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {R.perdues?.length > 0 && <details className="text-[12.5px]"><summary className="cursor-pointer"><b>{R.perdues.length} ligne(s) qu'aucune classe retenue ne prend</b></summary>
              <ul className="mt-1 text-slate-600">{R.perdues.map((x, i) => <li key={i}>ligne {x.ligne} — {x.libelle} ({x.classes})</li>)}</ul></details>}
          </div>
        )}
        {R && !R.tout && (
          <div className="space-y-2">
            <div data-etat="neutre" className="bloc-etat px-3 py-2">
              Classe du fichier : <b>{R.classe_source}</b> → classe de Lucie : <b>{R.classe_lucie}</b>.
              {' '}<b>{R.seances}</b> séance(s) du {date(R.du)} au {date(R.au)}, soit {R.heures} h, lues dans {R.lignes} ligne(s).
            </div>
            {R.conservees_retouchees > 0 && <div data-etat="surveiller" className="bloc-etat px-3 py-2">{R.conservees_retouchees} séance(s) d'un import précédent ont été retouchées dans Lucie : elles sont gardées telles quelles.</div>}
            {R.deja_posees_dans_lucie > 0 && <div data-etat="surveiller" className="bloc-etat px-3 py-2">{R.deja_posees_dans_lucie} séance(s) ont déjà été posées à la main dans Lucie pour cette classe : l'import s'y ajoute, vérifiez les doublons.</div>}
            {R.sans_cours.length > 0 && <div className="text-[12.5px]"><b>Sans cours reconnu</b> — importées avec leur libellé : {R.sans_cours.map(x => `${x.libelle} (${x.seances})`).join(' · ')}</div>}
            {R.profs_inconnus.length > 0 && <div className="text-[12.5px]"><b>Professeur non reconnu</b> — nom gardé en texte ; corrigez son orthographe dans sa fiche : {R.profs_inconnus.map(x => `${x.nom} (${x.seances})`).join(' · ')}</div>}
            {R.ignorees.length > 0 && <details className="text-[12.5px]"><summary className="cursor-pointer"><b>{R.ignorees.length} ligne(s) écartée(s)</b></summary>
              <ul className="mt-1 text-slate-600">{R.ignorees.map((x, i) => <li key={i}>ligne {x.ligne} — {x.libelle} : {x.raison}</li>)}</ul></details>}
            {R.incoherentes.length > 0 && <div data-etat="corriger" className="bloc-etat px-3 py-2 text-[12.5px]"><b>{R.incoherentes.length} ligne(s) incohérente(s)</b> — leurs semaines ne retombent pas sur leurs dates ; elles ne sont pas importées : {R.incoherentes.map(x => `ligne ${x.ligne}`).join(', ')}</div>}
          </div>
        )}
      </div>
    </Fenetre>
  );
}
