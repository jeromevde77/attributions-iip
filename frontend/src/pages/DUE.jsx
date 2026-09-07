import { useEffect, useMemo, useState } from 'react';
import {
  IconPrinter, IconDeviceFloppy, IconLock, IconLockOpen, IconArrowLeft,
  IconAlertTriangle, IconCheck, IconCircleCheck, IconPencil, IconEye,
} from '@tabler/icons-react';
import { api } from '../lib/api.js';

/**
 * LES DESCRIPTIFS D'UNITÉ D'ENSEIGNEMENT.
 *
 * La DUE était un Word recopié d'année en année : le volume horaire y
 * divergeait du référentiel et les acquis n'étaient plus ceux du dossier
 * pédagogique. L'écran sépare donc nettement deux choses.
 *
 * En GRIS, ce que Lucie sait déjà et que personne ne retape : périodes,
 * crédits, quadrimestre, cours de l'unité, acquis avec leur libellé,
 * titulaires tirés des attributions. Corriger le référentiel corrige la DUE.
 *
 * En BLANC, ce que l'enseignant rédige — et lui seul : finalités, programme,
 * méthodes, supports, modalités d'évaluation, critères, degré de maîtrise.
 *
 * Le titulaire écrit tant que la DUE est en préparation ; la direction valide,
 * et la fiche passe alors en lecture seule.
 */

const METHODES = [
  ['ex_cathedra', 'Cours ex cathedra'], ['exercices', "Réalisation d'exercices"],
  ['etude_cas', 'Étude de cas'], ['problemes', 'Apprentissage par problèmes'],
  ['classe_inversee', 'Classe inversée'], ['groupe', 'Collaboration en groupe'],
  ['pairs', 'Apprentissage par les pairs'], ['situation', 'Mise en situation'],
  ['pratique', 'Pratique'], ['debats', 'Débats'], ['jeux_roles', 'Jeux de rôles'],
  ['simulation', 'Simulation'], ['hybridation', 'Hybridation'],
];
const EPREUVES = [['ecrit', 'Écrit'], ['oral', 'Oral'], ['pratique', 'Pratique'],
  ['travail', 'Travail'], ['continue', 'Év. continue']];

// ── Briques d'écriture ───────────────────────────────────────────────────────

function Bloc({ titre, aide, children }) {
  return (
    <section className="mb-4">
      <div className="px-3 py-1.5 bg-iip-blue text-white text-[11px] font-semibold
                      uppercase tracking-wide rounded-t-lg">{titre}</div>
      <div className="border border-t-0 border-slate-200 rounded-b-lg p-3 bg-white">
        {aide && <p className="text-[11px] text-slate-500 mb-2">{aide}</p>}
        {children}
      </div>
    </section>
  );
}

function Zone({ valeur, onChange, lignes = 4, lecture, placeholder }) {
  if (lecture) {
    return valeur
      ? <div className="text-[12.5px] text-slate-700 whitespace-pre-wrap">{valeur}</div>
      : <div className="text-[12.5px] text-slate-400 italic">non complété</div>;
  }
  return (
    <textarea rows={lignes} value={valeur || ''} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className="w-full text-[12.5px] border border-slate-300 rounded-lg px-2.5 py-2
                 focus:outline-none focus:ring-2 focus:ring-iip-blue/30" />
  );
}

function Champ({ label, valeur, onChange, lecture, placeholder }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold text-slate-500 mb-0.5">{label}</span>
      {lecture
        ? <span className="text-[12.5px] text-slate-700">{valeur || '—'}</span>
        : <input value={valeur || ''} placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          className="w-full text-[12.5px] border border-slate-300 rounded-lg px-2.5 py-1.5
                     focus:outline-none focus:ring-2 focus:ring-iip-blue/30" />}
    </label>
  );
}

/**
 * LE RESPONSABLE DE L'UNITÉ.
 *
 * Le champ était libre : chacun y écrivait ce qu'il voulait, sans garantie que
 * la personne citée enseignât dans l'unité. On choisit désormais parmi les
 * titulaires, et Lucie propose celui qui y porte le plus de périodes — c'est
 * en général lui qui en répond. La proposition n'est qu'un défaut : le choix
 * reste ouvert, et l'écran dit lequel des deux est affiché.
 */
function Responsable({ c, d, lecture, onChange }) {
  const liste = d.enseignants || [];
  const choisi = c.responsable ?? d.responsable_propose ?? '';
  const parDefaut = c.responsable == null && d.responsable_propose != null;
  const nom = id => {
    const e = liste.find(x => String(x.id) === String(id));
    return e ? `${e.prenom} ${e.nom}` : (id || '—');
  };

  if (lecture) {
    return (
      <div>
        <span className="block text-[11px] font-semibold text-slate-500 mb-0.5">
          Responsable de l'unité
        </span>
        <span className="text-[12.5px] text-slate-700">{nom(choisi)}</span>
      </div>
    );
  }

  if (!liste.length) {
    return (
      <div>
        <span className="block text-[11px] font-semibold text-slate-500 mb-0.5">
          Responsable de l'unité
        </span>
        <span className="text-[12px] text-amber-800">
          Aucune attribution encodée : le responsable ne peut pas être choisi.
        </span>
      </div>
    );
  }

  return (
    <label className="block">
      <span className="block text-[11px] font-semibold text-slate-500 mb-0.5">
        Responsable de l'unité
      </span>
      <select value={String(choisi)} onChange={e => onChange(e.target.value)}
        className="w-full text-[12.5px] border border-slate-300 rounded-lg px-2 py-1.5
                   focus:outline-none focus:ring-2 focus:ring-iip-blue/30">
        {liste.map(e => (
          <option key={e.id} value={String(e.id)}>
            {e.prenom} {e.nom}{e.periodes ? ` — ${e.periodes} p.` : ''}
          </option>
        ))}
      </select>
      <span className="block text-[10.5px] text-slate-400 mt-0.5">
        {parDefaut
          ? 'Proposé : le titulaire qui porte le plus de périodes dans l’unité.'
          : 'Choisi manuellement parmi les titulaires de l’unité.'}
      </span>
    </label>
  );
}

// Ce que Lucie sait déjà : posé sur fond gris, sans champ de saisie, pour que
// nul ne cherche à le corriger ici.
function Su({ label, valeur }) {
  return (
    <div className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-[12.5px] text-slate-700 font-medium">{valeur ?? '—'}</div>
    </div>
  );
}

// ── La liste ─────────────────────────────────────────────────────────────────

function Liste({ onOuvrir }) {
  const [etat, setEtat] = useState(null);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    api.dueListe().then(setEtat).catch(e => setErreur(e.message));
  }, []);

  if (erreur) return <div className="p-6 text-sm text-red-700">{erreur}</div>;
  if (!etat) return <div className="p-6 text-sm text-slate-400">Chargement…</div>;
  if (!etat.ues.length) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">
        Aucune unité d'enseignement ne vous est attribuée en {etat.annee}.
      </div>
    );
  }

  return (
    <div className="p-4">
      <p className="text-[12px] text-slate-500 mb-3">
        {etat.peut_valider
          ? "Toutes les unités de l'année. Une DUE validée passe en lecture seule pour ses titulaires."
          : "Les unités dont vous êtes titulaire. Vous pouvez compléter leur descriptif tant qu'il n'est pas validé."}
      </p>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {etat.ues.map(u => (
          <button key={u.ue_num} onClick={() => onOuvrir(u.ue_num)}
            className="text-left px-3 py-2.5 rounded-xl border border-slate-200 bg-white
                       hover:border-iip-blue/40 hover:shadow-sm transition">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold text-iip-blue truncate">
                  UE {u.ue_num} — {u.ue_nom}
                </div>
                <div className="text-[11px] text-slate-500">
                  {u.section}{u.ects ? ` · ${u.ects} ECTS` : ''}{u.ue_quad ? ` · ${u.ue_quad}` : ''}
                </div>
              </div>
              <span className={`flex-none text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                u.statut === 'validee'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                {u.statut === 'validee' ? 'validée' : 'en préparation'}
              </span>
            </div>
            <div className="text-[10.5px] text-slate-400 mt-1">
              {u.valide_le ? `Validée le ${u.valide_le}`
                : u.maj_le ? `Modifiée le ${String(u.maj_le).slice(0, 10)}`
                  : 'Jamais complétée'}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── La fiche ─────────────────────────────────────────────────────────────────

function Fiche({ ueNum, onRetour }) {
  const [d, setD] = useState(null);
  const [c, setC] = useState({});
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [sale, setSale] = useState(false);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    api.dueLire(ueNum)
      .then(j => { setD(j); setC(j.contenu || {}); setSale(false); })
      .catch(e => setErreur(e.message));
  }, [ueNum]);

  const lecture = !d?.droits?.ecrire;
  const maj = (cle, val) => { setC(x => ({ ...x, [cle]: val })); setSale(true); };
  const majSous = (cle, sous, val) => {
    setC(x => ({ ...x, [cle]: { ...(x[cle] || {}), [sous]: val } })); setSale(true);
  };

  async function enregistrer() {
    setEnCours(true); setErreur(null); setMessage(null);
    try {
      const j = await api.dueEnregistrer(ueNum, c);
      setD(x => ({ ...x, ...j })); setSale(false);
      setMessage('Descriptif enregistré.');
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  async function basculerValidation() {
    setEnCours(true); setErreur(null); setMessage(null);
    try {
      const rouvrir = d.statut === 'validee';
      await api.dueValider(ueNum, rouvrir);
      const j = await api.dueLire(ueNum);
      setD(j); setC(j.contenu || {}); setSale(false);
      setMessage(rouvrir ? 'DUE rouverte : les titulaires peuvent à nouveau la compléter.'
        : 'DUE validée : elle est désormais en lecture seule.');
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  async function imprimer() {
    try {
      const j = await api.dueDocument(ueNum);
      const f = window.open('', '_blank');
      if (!f) { setErreur("Le navigateur a bloqué la fenêtre d'impression."); return; }
      f.document.write(j.html); f.document.close();
    } catch (e) { setErreur(e.message); }
  }

  // Les champs restés vides : ce sont eux qui empêchent la validation d'être
  // sereine, autant les nommer plutôt que de laisser chercher.
  const manques = useMemo(() => {
    if (!d) return [];
    const m = [];
    if (!c.finalites) m.push('finalités particulières');
    if (!c.programme) m.push('programme');
    if (!Object.values(c.methodes || {}).some(Boolean)) m.push("méthodes d'apprentissage");
    if (!c.criteres) m.push("critères d'évaluation");
    if (!c.degre_maitrise) m.push('degré de maîtrise');
    const sansEval = (d.cours || []).filter(x =>
      !Object.values(c.evaluation?.[x.cours_code]?.s1 || {}).some(Boolean));
    if (sansEval.length) m.push(`modalités de 1re session (${sansEval.length} cours)`);
    return m;
  }, [c, d]);

  if (erreur && !d) return <div className="p-6 text-sm text-red-700">{erreur}</div>;
  if (!d) return <div className="p-6 text-sm text-slate-400">Chargement…</div>;
  const u = d.ue;

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <button onClick={onRetour}
            className="text-[11.5px] text-slate-500 hover:text-iip-blue flex items-center gap-1 mb-1">
            <IconArrowLeft size={13} /> Tous les descriptifs
          </button>
          <h2 className="text-[16px] font-semibold text-iip-blue truncate">
            UE {u.ue_num} — {u.ue_nom}
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[10.5px] px-2 py-0.5 rounded-full font-semibold ${
              d.statut === 'validee'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
              {d.statut === 'validee' ? `validée le ${d.valide_le || ''}` : 'en préparation'}
            </span>
            <span className="text-[10.5px] text-slate-400 flex items-center gap-1">
              {lecture ? <><IconEye size={12} /> lecture seule</>
                : <><IconPencil size={12} /> vous pouvez modifier</>}
            </span>
          </div>
        </div>
        <div className="flex flex-none gap-2">
          <button onClick={imprimer}
            className="px-3 py-1.5 text-[12px] rounded-lg border border-slate-300 text-slate-600
                       flex items-center gap-1.5 hover:bg-slate-50">
            <IconPrinter size={14} /> Imprimer
          </button>
          {d.droits.valider && (
            <button onClick={basculerValidation} disabled={enCours}
              className={`px-3 py-1.5 text-[12px] rounded-lg font-semibold flex items-center gap-1.5
                ${d.statut === 'validee'
      ? 'border border-amber-300 text-amber-800 bg-amber-50'
      : 'bg-emerald-600 text-white'}`}>
              {d.statut === 'validee' ? <><IconLockOpen size={14} /> Rouvrir</>
                : <><IconLock size={14} /> Valider</>}
            </button>
          )}
          {!lecture && (
            <button onClick={enregistrer} disabled={enCours || !sale}
              className="px-3 py-1.5 text-[12px] rounded-lg bg-iip-blue text-white font-semibold
                         flex items-center gap-1.5 disabled:opacity-40">
              <IconDeviceFloppy size={14} /> Enregistrer
            </button>
          )}
        </div>
      </div>

      {erreur && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200
                        text-[12px] text-red-800 flex items-start gap-1.5">
          <IconAlertTriangle size={14} className="mt-0.5 flex-none" /> {erreur}
        </div>
      )}
      {message && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200
                        text-[12px] text-emerald-800 flex items-start gap-1.5">
          <IconCircleCheck size={14} className="mt-0.5 flex-none" /> {message}
        </div>
      )}
      {!lecture && !!manques.length && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                        text-[11.5px] text-amber-900">
          <b>Reste à compléter :</b> {manques.join(' · ')}.
        </div>
      )}

      {/* ── Ce que Lucie sait déjà ── */}
      <Bloc titre="Identification de l'unité"
        aide="Repris du référentiel de l'année : pour le corriger, passez par les référentiels.">
        <div className="grid gap-2 sm:grid-cols-3 mb-3">
          <Su label="Section" valeur={u.section} />
          <Su label="Crédits ECTS" valeur={u.ects} />
          <Su label="Volume horaire"
            valeur={u.periodes ? `${u.periodes} périodes · ${u.heures} h` : null} />
          <Su label="Quadrimestre" valeur={u.quadrimestre} />
          <Su label="Unité prérequise" valeur={u.prerequise || 'Aucune'} />
          <Su label="Code FWB" valeur={u.ue_code_fwb} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Champ label="Cursus" valeur={c.cursus} lecture={lecture}
            placeholder={u.section} onChange={v => maj('cursus', v)} />
          <Responsable c={c} d={d} lecture={lecture} onChange={v => maj('responsable', v)} />
          <Champ label="Bloc d'études administratif" valeur={c.bloc} lecture={lecture}
            placeholder="1, 2 ou 3" onChange={v => maj('bloc', v)} />
          <Champ label="Niveau du cadre européen des certifications" valeur={c.niveau_cec}
            lecture={lecture} placeholder="Niveau 6 (TC)" onChange={v => maj('niveau_cec', v)} />
          <Champ label="Langue d'enseignement" valeur={c.langue_ens} lecture={lecture}
            placeholder="Français" onChange={v => maj('langue_ens', v)} />
          <Champ label="Langue d'évaluation" valeur={c.langue_eval} lecture={lecture}
            placeholder="Français" onChange={v => maj('langue_eval', v)} />
        </div>
        {!lecture && (
          <label className="flex items-center gap-2 mt-2 text-[12px] text-slate-700">
            <input type="checkbox" checked={!!c.codiplomation} className="w-4 h-4 accent-iip-blue"
              onChange={e => maj('codiplomation', e.target.checked)} />
            Co-diplomation HELB
          </label>
        )}
      </Bloc>

      <Bloc titre="Titulaires" aide="Tirés des attributions de l'année.">
        {d.enseignants.length ? (
          <ul className="text-[12.5px] text-slate-700 space-y-0.5">
            {d.enseignants.map((e, i) => (
              <li key={i}>{e.prenom} {e.nom}
                {e.cours && <span className="text-slate-400"> — {e.cours}</span>}</li>
            ))}
          </ul>
        ) : (
          <div className="text-[12px] text-amber-800">
            Aucune attribution encodée pour cette unité : les titulaires manqueront au document.
          </div>
        )}
      </Bloc>

      <Bloc titre="Acquis d'apprentissage"
        aide="Encodés dans le référentiel des acquis ; rattachés aux cours par la pondération.">
        {d.acquis.length ? (
          <ul className="text-[12.5px] text-slate-700 space-y-1">
            {d.acquis.map(a => (
              <li key={a.aa_code}>
                <b className="text-iip-blue">{a.aa_code}</b> — {a.description
                  || <i className="text-amber-700">libellé absent du référentiel</i>}
              </li>
            ))}
          </ul>
        ) : <div className="text-[12px] text-amber-800">Aucun acquis encodé pour cette unité.</div>}
      </Bloc>

      <Bloc titre="Activités d'apprentissage">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase text-slate-400">
              <th className="pb-1">Code</th><th>Intitulé</th>
              <th className="text-right">Périodes</th><th className="text-right">Heures</th>
              <th className="pl-3">Acquis évalués</th>
            </tr>
          </thead>
          <tbody>
            {d.cours.map(x => (
              <tr key={x.cours_code} className="border-t border-slate-100">
                <td className="py-1 text-slate-500">{x.cours_code}</td>
                <td className="text-slate-800">{x.cours_nom}</td>
                <td className="text-right">{x.cours_per ?? '—'}</td>
                <td className="text-right">{x.heures ?? '—'}</td>
                <td className="pl-3 text-slate-500">{(x.acquis || []).join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Bloc>

      {/* ── Ce que l'enseignant rédige ── */}
      <Bloc titre="Finalités particulières"
        aide="Ce que cette unité vise à faire acquérir, au-delà des finalités générales du décret.">
        <Zone valeur={c.finalites} lecture={lecture} lignes={4}
          onChange={v => maj('finalites', v)} />
      </Bloc>

      <Bloc titre="Programme" aide="Le contenu, tel qu'il figure au dossier pédagogique.">
        <Zone valeur={c.programme} lecture={lecture} lignes={6}
          onChange={v => maj('programme', v)} />
      </Bloc>

      <Bloc titre="Méthodes d'apprentissage">
        <div className="flex flex-wrap gap-1.5">
          {METHODES.map(([k, l]) => {
            const on = !!c.methodes?.[k];
            if (lecture && !on) return null;
            return (
              <button key={k} disabled={lecture}
                onClick={() => majSous('methodes', k, !on)}
                className={`px-2.5 py-1 rounded-full text-[11.5px] border ${on
                  ? 'bg-iip-blue text-white border-iip-blue'
                  : 'bg-white text-slate-600 border-slate-300 hover:border-iip-blue/50'}`}>
                {on && <IconCheck size={11} className="inline mr-1" />}{l}
              </button>
            );
          })}
        </div>
        <div className="mt-2">
          <Champ label="Autre" valeur={c.methode_autre} lecture={lecture}
            onChange={v => maj('methode_autre', v)} />
        </div>
      </Bloc>

      <Bloc titre="Supports de cours"
        aide="Un support obligatoire doit être déposé sur e-campus, sauf ouvrage protégé.">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase text-slate-400">
              <th className="pb-1">Activité</th><th>Type de support</th>
              <th className="text-right">Obligatoire</th>
            </tr>
          </thead>
          <tbody>
            {d.cours.map(x => {
              const s = c.supports?.[x.cours_code] || {};
              const poser = v => majSous('supports', x.cours_code, { ...s, ...v });
              return (
                <tr key={x.cours_code} className="border-t border-slate-100">
                  <td className="py-1 text-slate-800">{x.cours_nom}</td>
                  <td>
                    {lecture ? (s.type || '—')
                      : <input value={s.type || ''} placeholder="Syllabus, PowerPoint, ouvrage…"
                        onChange={e => poser({ type: e.target.value })}
                        className="w-full text-[12px] border border-slate-300 rounded px-2 py-1" />}
                  </td>
                  <td className="text-right">
                    <input type="checkbox" disabled={lecture} checked={!!s.obligatoire}
                      onChange={e => poser({ obligatoire: e.target.checked })}
                      className="w-4 h-4 accent-iip-blue" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Bloc>

      <Bloc titre="Modalités d'évaluation">
        {['s1', 's2'].map(sess => (
          <div key={sess} className="mb-3 last:mb-0">
            <div className="text-[11px] font-semibold text-slate-500 mb-1">
              {sess === 's1' ? 'Première session' : 'Seconde session'}
            </div>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-[10px] uppercase text-slate-400">
                  <th className="text-left pb-1">Activité</th>
                  {EPREUVES.map(([k, l]) => <th key={k} className="text-center">{l}</th>)}
                </tr>
              </thead>
              <tbody>
                {d.cours.map(x => {
                  const e = c.evaluation?.[x.cours_code]?.[sess] || {};
                  const poser = (k, v) => {
                    const parCours = { ...(c.evaluation?.[x.cours_code] || {}) };
                    parCours[sess] = { ...e, [k]: v };
                    majSous('evaluation', x.cours_code, parCours);
                  };
                  return (
                    <tr key={x.cours_code} className="border-t border-slate-100">
                      <td className="py-1 text-slate-800">{x.cours_nom}</td>
                      {EPREUVES.map(([k]) => (
                        <td key={k} className="text-center">
                          <input type="checkbox" disabled={lecture} checked={!!e[k]}
                            onChange={ev => poser(k, ev.target.checked)}
                            className="w-4 h-4 accent-iip-blue" />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
        <div className="mt-2">
          <span className="block text-[11px] font-semibold text-slate-500 mb-0.5">
            Note générale de l'unité
          </span>
          <Zone valeur={c.note_ue} lecture={lecture} lignes={3}
            placeholder={"Laissé vide, le document reprend la règle usuelle : moyenne pondérée "
              + "des acquis, mais unité non acquise dès qu'une note est sous 10/20, "
              + 'sauf décision du Conseil des études.'}
            onChange={v => maj('note_ue', v)} />
        </div>
      </Bloc>

      <Bloc titre="Critères d'évaluation" aide="Ce qui, concrètement, mène à la réussite.">
        <Zone valeur={c.criteres} lecture={lecture} lignes={4}
          onChange={v => maj('criteres', v)} />
      </Bloc>

      <Bloc titre="Degré de maîtrise" aide="Pour chaque acquis, ce qui distingue la maîtrise.">
        <Zone valeur={c.degre_maitrise} lecture={lecture} lignes={4}
          onChange={v => maj('degre_maitrise', v)} />
      </Bloc>

      {!lecture && sale && (
        <div className="sticky bottom-3 flex justify-end">
          <button onClick={enregistrer} disabled={enCours}
            className="px-4 py-2 text-[12.5px] rounded-lg bg-iip-blue text-white font-semibold
                       shadow-lg flex items-center gap-1.5">
            <IconDeviceFloppy size={15} /> Enregistrer les modifications
          </button>
        </div>
      )}
    </div>
  );
}

export default function DUE({ ueInitiale = null }) {
  const [ueNum, setUeNum] = useState(ueInitiale);
  return ueNum == null
    ? <Liste onOuvrir={setUeNum} />
    : <Fiche ueNum={ueNum} onRetour={() => setUeNum(null)} />;
}
