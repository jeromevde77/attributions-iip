import { useEffect, useMemo, useState } from 'react';
import {
  IconCalendarStats, IconChevronRight, IconAlertTriangle, IconCheck,
  IconDeviceFloppy, IconPlus, IconTrash,
} from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { Fenetre } from '../components/ui.jsx';

/**
 * LA GRILLE D'ORGANISATION — LA COUCHE QUI MANQUAIT.
 *
 * Le dossier pédagogique dit ce qu'EST l'unité ; il ne bouge pas. L'attribution
 * dit QUI le fait. Entre les deux : ce qu'on FAIT de l'unité cette année —
 * comment ses périodes se découpent, où l'autonomie se place, quand elle tombe
 * dans l'année. C'est la structure de l'année, et elle se planifie AVANT
 * d'attribuer.
 *
 * ELLE NE RÉINVENTE RIEN. Le calendrier vient de `annee_calendrier` — les
 * semaines de l'institut avec leurs congés et leurs sessions. Les dates
 * viennent de `organisation_ue`, celles qu'on saisit déjà dans « Dates des
 * UE ». La grille les LIT, et les complète là où elles manquent.
 *
 * LA BARRE PORTE DEUX GRANDEURS : sa LONGUEUR est la durée, son ÉPAISSEUR
 * l'intensité — 5 px pour 2 h par semaine. Une unité étalée sur l'année est
 * longue et fine ; la même massée sur six semaines est courte et épaisse ; un
 * stage à vingt heures par semaine devient un pavé qu'on ne peut pas rater. On
 * voit la charge, pas seulement le calendrier.
 */

const BLOC = { 1: '#E8890C', 2: '#7FB3D5', 3: '#1B2B4B' };
const teinteBloc = niv => {
  const m = String(niv || '').match(/([123])\s*$/);
  return m ? BLOC[m[1]] : '#94A3B8';
};

const FOND_SEM = {
  cours: 'transparent', vacances: '#EEF0F3', ferie: '#EEF0F3',
  ev1: '#FDF3E7', ev2: '#FDF3E7', stage: '#EFF6FF',
};

/** 5 px pour 2 h/semaine — plancher à 4 px, plafond à 22 pour rester lisible. */
const epaisseur = perSem => {
  if (!perSem) return 4;
  return Math.max(4, Math.min(22, Math.round(perSem * 2.5)));
};

export default function GrilleOrganisation() {
  const annee = getAnnee();
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [data, setData] = useState(null);
  const [vue, setVue] = useState('prof');      // prof | etudiant
  const [ouverte, setOuverte] = useState(null); // ue_num déplié
  const [fiche, setFiche] = useState(null);     // { ue, cours } — fenêtre du cours
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);

  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : []))
      .then(l => { const a = Array.isArray(l) ? l : []; setSections(a);
        if (a.length && !section) setSection(a[0].code); })
      .catch(() => setSections([]));
  }, []);

  const charger = () => {
    if (!section) return;
    setCharge(true); setErreur('');
    fetch(`/api/grille?annee=${encodeURIComponent(annee)}&section=${encodeURIComponent(section)}`,
      { headers: authHeaders() })
      .then(r => r.json())
      .then(j => { if (j.error) setErreur(j.error); else setData(j); })
      .catch(e => setErreur(e.message))
      .finally(() => setCharge(false));
  };
  useEffect(() => { charger(); }, [section, annee]);

  const semaines = data?.semaines || [];
  const nbSem = semaines.length || 1;

  /* LES DEUX QUADRIMESTRES, déduits du calendrier : on ne les saisit pas une
     seconde fois. La coupure est la plus longue suite de semaines sans cours
     au milieu de l'année — c'est ce qui sépare Q1 de Q2. */
  const coupure = useMemo(() => {
    if (!semaines.length) return Math.floor(nbSem / 2);
    const milieu = Math.floor(semaines.length / 2);
    let best = milieu, bestLen = 0, i = 0;
    while (i < semaines.length) {
      if (semaines[i].type === 'cours') { i++; continue; }
      let j = i; while (j < semaines.length && semaines[j].type !== 'cours') j++;
      const len = j - i;
      if (len > bestLen && Math.abs(i - milieu) < semaines.length / 3) {
        bestLen = len; best = i + Math.floor(len / 2);
      }
      i = j;
    }
    return best;
  }, [semaines, nbSem]);

  const anomalies = (data?.ues || []).filter(u => !u.controle.conforme);
  const aPoser = (data?.ues || []).filter(u => !u.planifiee);

  return (
    <div className="px-3 pt-4 pb-8">
      <div className="hidden md:flex items-baseline gap-2.5 min-w-0 mb-2.5">
        <h1 className="titre-ecran flex-shrink-0 mb-0">Grille d'organisation</h1>
        <p className="text-[13px] text-slate-400 truncate">
          <span className="mr-2 text-slate-300">·</span>
          Ce qu'on fait des unités cette année — avant d'attribuer
        </p>
      </div>

      <div className="carte overflow-hidden">
        {/* ── La barre ─────────────────────────────────────────── */}
        <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-slate-200
                        bg-[#FCFCFD] flex-wrap">
          <label className="flex items-center gap-2">
            <span className="text-[12px] text-slate-500">Section</span>
            <select value={section} onChange={e => setSection(e.target.value)}
              className="controle">
              {sections.map(s => <option key={s.code} value={s.code}>{s.libelle || s.code}</option>)}
            </select>
          </label>
          <span className="text-[12px] text-slate-400">{annee}</span>

          {/* UNE SEULE GRILLE, DEUX LECTURES. Ce qui est confié au professeur
              et ce que vit l'étudiant coïncident presque toujours — presque :
              sur un stage, les heures d'encadrement du superviseur ne sont pas
              les heures de l'étudiant. Deux grilles finiraient par diverger. */}
          <span className="seg-fam ml-2">
            <button className={vue === 'prof' ? 'on' : ''} onClick={() => setVue('prof')}>
              Vue professeurs
            </button>
            <button className={vue === 'etudiant' ? 'on' : ''} onClick={() => setVue('etudiant')}>
              Vue étudiants
            </button>
          </span>

          <span className="ml-auto text-[12px] text-slate-500">
            {data ? `${data.ues.length} unités · ${semaines.length} semaines` : ''}
          </span>
        </div>

        {/* ── Ce qui cloche, dit avant le dessin ───────────────── */}
        {(anomalies.length > 0 || aPoser.length > 0) && (
          <div className="px-3 py-2 space-y-1.5 border-b border-slate-200">
            {anomalies.map(u => (
              <div key={u.ue_num}
                className="carte px-3 py-2 border-l-[3px] border-l-[#9D4A38] text-[12px]">
                <IconAlertTriangle size={13} className="inline align-[-2px] mr-1.5 text-[#9D4A38]" />
                <b>UE {u.ue_num}</b> — la règle des multiples n'est pas respectée.
                {u.controle.anomalies.map(a => (
                  <div key={a.cours_code} className="text-slate-600 mt-0.5">
                    {a.cours_code} est à {a.total} périodes ; le dossier en attend un
                    multiple de {a.multiple}. Il manque <b>{a.manque}</b> —
                    {a.autonomie_suffit
                      ? ` l'autonomie disponible (${u.controle.autonomie.restante}) suffit à combler.`
                      : ` l'autonomie restante (${u.controle.autonomie.restante}) NE suffit pas.`}
                  </div>
                ))}
              </div>
            ))}
            {aPoser.length > 0 && (
              <div className="carte px-3 py-2 border-l-[3px] border-l-[#B45309] text-[12px]">
                <b>{aPoser.length} unité(s) sans dates</b> — elles ne sont pas encore
                posées dans l'année : {aPoser.slice(0, 6).map(u => `UE ${u.ue_num}`).join(', ')}
                {aPoser.length > 6 ? '…' : ''}. Elles se complètent ici.
              </div>
            )}
          </div>
        )}

        {erreur && <div className="px-3 py-2 text-[13px] text-rose-700">{erreur}</div>}
        {charge && <div className="px-3 py-6 text-[13px] text-slate-400">Chargement…</div>}

        {/* ── La frise ─────────────────────────────────────────── */}
        {data && !charge && (
          <div className="overflow-auto">
            <div style={{ minWidth: 820 }}>

              {/* Les mois, puis les quadrimestres — lus du calendrier. */}
              <div className="flex text-[10px] uppercase tracking-wide text-slate-400 px-3 pt-2">
                <div style={{ width: 230, flexShrink: 0 }} />
                <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${nbSem}, 1fr)` }}>
                  {semaines.map((s, i) => {
                    const mois = new Date(s.date_debut).toLocaleDateString('fr-BE', { month: 'short' });
                    const prec = i > 0
                      ? new Date(semaines[i - 1].date_debut).toLocaleDateString('fr-BE', { month: 'short' })
                      : null;
                    return <div key={s.semaine_num}
                      className="border-l border-slate-100 pl-0.5 truncate">
                      {mois !== prec ? mois : ''}
                    </div>;
                  })}
                </div>
              </div>
              <div className="flex px-3 pb-1">
                <div style={{ width: 230, flexShrink: 0 }} />
                <div className="flex-1 grid gap-0.5"
                  style={{ gridTemplateColumns: `repeat(${nbSem}, 1fr)` }}>
                  <div className="text-[9px] font-bold tracking-wider text-white text-center
                                  rounded-sm bg-[#2D4470]"
                    style={{ gridColumn: `1 / ${Math.max(2, coupure + 1)}` }}>Q1</div>
                  <div className="text-[9px] font-bold tracking-wider text-white text-center
                                  rounded-sm bg-[#2D4470]"
                    style={{ gridColumn: `${Math.max(2, coupure + 1)} / ${nbSem + 1}` }}>Q2</div>
                </div>
              </div>

              {data.ues.map(u => (
                <LigneUE key={u.ue_num} u={u} semaines={semaines} nbSem={nbSem}
                  ouverte={ouverte === u.ue_num}
                  surOuvrir={() => setOuverte(o => (o === u.ue_num ? null : u.ue_num))}
                  surCours={c => setFiche({ ue: u, cours: c })}
                  vue={vue} />
              ))}
            </div>
          </div>
        )}
      </div>

      {fiche && (
        <FenetreCours etat={fiche} annee={annee} section={section}
          periodeMinutes={data?.periode_minutes || 50}
          onFermer={() => setFiche(null)}
          onEnregistre={() => { setFiche(null); charger(); }} />
      )}
    </div>
  );
}

/** Une unité, et ses cours quand on la déplie. */
function LigneUE({ u, semaines, nbSem, ouverte, surOuvrir, surCours, vue }) {
  const teinte = teinteBloc(u.ue_niv);
  const deb = u.sem_debut || 1;
  const fin = u.sem_fin || nbSem;
  const h = epaisseur(u.per_semaine);

  return (
    <>
      <div className="flex items-center border-t border-slate-100 hover:bg-slate-50/60">
        <button onClick={surOuvrir}
          className="flex items-center gap-2 text-left px-3 py-1.5 text-[12.5px] min-w-0"
          style={{ width: 230, flexShrink: 0 }}>
          <IconChevronRight size={13}
            className={`text-slate-400 flex-shrink-0 transition-transform ${ouverte ? 'rotate-90' : ''}`} />
          <i style={{ background: teinte, width: 4, height: 15, borderRadius: 2, flexShrink: 0 }} />
          <span className="truncate"><b>UE {u.ue_num}</b> — {u.ue_nom}</span>
          <span className="ml-auto text-[10px] text-slate-400 flex-shrink-0">{u.per_total}p</span>
        </button>
        <div className="flex-1 grid items-center relative" style={{
          gridTemplateColumns: `repeat(${nbSem}, 1fr)`, height: 30 }}>
          {semaines.map(s => (
            <i key={s.semaine_num} style={{
              gridRow: 1, gridColumn: `${s.semaine_num} / ${s.semaine_num + 1}`,
              background: FOND_SEM[s.type] || 'transparent',
              borderLeft: '1px solid #F4F5F7', height: '100%' }} />
          ))}
          {u.planifiee ? (
            <div title={`${u.per_semaine || '?'} pér./semaine · ${u.date_debut} → ${u.date_fin}`}
              style={{ gridRow: 1, gridColumn: `${deb} / ${fin + 1}`,
                height: h, background: teinte, borderRadius: 3, zIndex: 1 }} />
          ) : (
            <div style={{ gridRow: 1, gridColumn: `1 / ${nbSem + 1}`, zIndex: 1 }}
              className="text-[10px] text-[#B45309] pl-1">sans dates — à poser</div>
          )}
        </div>
      </div>

      {ouverte && u.cours.map(c => {
        const cd = c.sem_debut || deb, cf = c.sem_fin || fin;
        const vus = (c.activites || []).filter(a => vue === 'prof' || a.vu_etudiant);
        const per = vus.reduce((t, a) => t + (Number(a.periodes) || 0), 0)
          || Number(c.cours_per) || 0;
        return (
          <div key={c.cours_code} className="flex items-center border-t border-slate-100 bg-[#FCFCFD]">
            <button onClick={() => surCours(c)}
              className="text-left px-3 py-1.5 text-[11.5px] min-w-0 hover:text-iip-blue"
              style={{ width: 230, flexShrink: 0, paddingLeft: 34 }}>
              <span className="truncate block">{c.cours_code} — {c.cours_nom}</span>
              <span className="text-[10px] text-slate-400">
                {per}p{c.activites?.length ? ` · ${c.activites.length} activité(s)` : ' · à découper'}
              </span>
            </button>
            <div className="flex-1 grid items-center" style={{
              gridTemplateColumns: `repeat(${nbSem}, 1fr)`, height: 26 }}>
              {semaines.map(s => (
                <i key={s.semaine_num} style={{
                  gridRow: 1, gridColumn: `${s.semaine_num} / ${s.semaine_num + 1}`,
                  background: FOND_SEM[s.type] || 'transparent',
                  borderLeft: '1px solid #F4F5F7', height: '100%' }} />
              ))}
              <div style={{ gridRow: 1, gridColumn: `${cd} / ${cf + 1}`, height: 7,
                background: teinte, opacity: .62, borderRadius: 3, zIndex: 1 }} />
            </div>
          </div>
        );
      })}

      {/* L'AUTONOMIE EST UNE LIGNE, PAS UNE COLONNE. Elle se répartit dans les
          cours ; la voir à part, c'est voir ce qui reste à placer. */}
      {ouverte && u.controle.autonomie.unite > 0 && (
        <div className="flex items-center border-t border-slate-100 bg-[#FCFCFD]">
          <div className="px-3 py-1.5 text-[11.5px]" style={{ width: 230, flexShrink: 0, paddingLeft: 34 }}>
            <span className="text-[#7C3AED]">Autonomie</span>
            <span className="text-[10px] text-slate-400 block">
              {u.controle.autonomie.placee} placée sur {u.controle.autonomie.unite}
              {u.controle.autonomie.restante > 0
                ? ` · ${u.controle.autonomie.restante} à placer` : ' · tout est placé'}
            </span>
          </div>
          <div className="flex-1 grid items-center" style={{
            gridTemplateColumns: `repeat(${nbSem}, 1fr)`, height: 24 }}>
            <div style={{ gridRow: 1, gridColumn: `${deb} / ${fin + 1}`, height: 6,
              background: '#8B5CF6', opacity: .5, borderRadius: 3 }} />
          </div>
        </div>
      )}
    </>
  );
}

/**
 * LA DÉCOUPE D'UN COURS EN ACTIVITÉS.
 *
 * Une activité est un SOUS-COURS : elle ne paraît ni sur le contrat de travail,
 * ni sur aucune pièce officielle. C'est un choix pédagogique, il peut différer
 * d'un professeur à l'autre — la grille en propose un, elle ne l'impose pas.
 * Leur somme, avec l'autonomie posée, doit retomber sur un multiple des
 * périodes du dossier.
 */
function FenetreCours({ etat, annee, section, periodeMinutes = 50,
                        onFermer, onEnregistre }) {
  const { ue, cours } = etat;
  const [lignes, setLignes] = useState(() => (cours.activites || []).map(a => ({
    activite_id: a.activite_id, periodes: a.periodes, vu_etudiant: a.vu_etudiant !== 0,
  })));
  const [auto, setAuto] = useState(Number(cours.autonomie_placee) || 0);
  const [dispo, setDispo] = useState([]);
  const [enCours, setEnCours] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch(`/api/grille/activites?section=${encodeURIComponent(section)}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : [])).then(l => setDispo(Array.isArray(l) ? l : []))
      .catch(() => setDispo([]));
  }, [section]);

  const dp = Number(cours.cours_per) || 0;
  const somme = lignes.reduce((t, l) => t + (Number(l.periodes) || 0), 0);
  const total = Math.round((somme + Number(auto || 0)) * 100) / 100;
  const reste = dp ? Math.round((total % dp) * 100) / 100 : 0;
  const manque = dp && reste ? Math.round((dp - reste) * 100) / 100 : 0;
  const restanteUE = Math.round(
    (ue.controle.autonomie.unite - ue.controle.autonomie.placee
      + (Number(cours.autonomie_placee) || 0) - Number(auto || 0)) * 100) / 100;

  async function enregistrer() {
    setEnCours(true); setErr('');
    try {
      const rep = await fetch('/api/grille/cours', {
        method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          annee_scolaire: annee, section, ue_num: ue.ue_num, cours_code: cours.cours_code,
          autonomie_placee: Number(auto) || 0,
          activites: lignes.filter(l => l.activite_id),
        }),
      });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error || 'Erreur');
      onEnregistre();
    } catch (e) { setErr(e.message); setEnCours(false); }
  }

  return (
    <Fenetre icone={IconCalendarStats} onFermer={onFermer}
      titre={`${cours.cours_code} — ${cours.cours_nom}`}
      sous={`UE ${ue.ue_num} · dossier pédagogique : ${dp || '—'} périodes`}
      pied={<>
        <button onClick={enregistrer} disabled={enCours}
          className="bouton bouton-fort disabled:opacity-40">
          <IconDeviceFloppy size={15} className="inline align-[-2px] mr-1" />
          {enCours ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {dp > 0 && (manque
          ? <span className="text-[12px] text-[#9D4A38]">
              Total {total} — il manque {manque} pour un multiple de {dp}.
            </span>
          : <span className="text-[12px] text-[#15803D]">
              <IconCheck size={13} className="inline align-[-2px] mr-1" />
              Total {total} — multiple de {dp} respecté.
            </span>)}
        {err && <span className="text-[12px] text-rose-700">{err}</span>}
        <button onClick={onFermer} className="bouton ml-auto">Annuler</button>
      </>}>
      <div className="p-5 space-y-4 overflow-auto">

        {/* LA JAUGE : LE COURS SE VOIT AVANT DE SE LIRE.
            La barre du bandeau était d'une seule couleur et ne disait rien de
            ce qu'on venait d'y poser. Elle se DÉCOUPE désormais : un segment
            par activité, un pour l'autonomie, chacun large de ses périodes.
            Ajouter une activité coupe la barre, changer un nombre déplace la
            coupure — c'est le dessin qui répond à la saisie, et non un total
            qu'il faut aller relire en bas de la fenêtre.

            L'ÉCHELLE EST CELLE DU DOSSIER PÉDAGOGIQUE, pas celle du total :
            mise à l'échelle du total, la barre serait toujours pleine et ne
            dirait jamais qu'on déborde. Le repère du dossier reste donc fixe,
            et ce qui le dépasse se voit sortir. */}
        <JaugeCours dp={dp} lignes={lignes} auto={Number(auto) || 0}
          dispo={dispo} minutes={periodeMinutes} />

        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-slate-500">
              <th className="text-left pb-1">Activité</th>
              <th className="text-right pb-1 w-24">Périodes</th>
              <th className="text-center pb-1 w-28">Vue étudiant</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="py-1.5">
                  <select value={l.activite_id || ''} className="controle w-full"
                    onChange={e => setLignes(ls => ls.map((x, j) =>
                      j === i ? { ...x, activite_id: Number(e.target.value) || null } : x))}>
                    <option value="">— choisir —</option>
                    {dispo.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.libelle}{a.section ? ` (${a.section})` : ''}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1.5 text-right">
                  <input type="text" inputMode="decimal" value={l.periodes}
                    className="controle w-20 text-right"
                    onChange={e => setLignes(ls => ls.map((x, j) =>
                      j === i ? { ...x, periodes: e.target.value.replace(',', '.') } : x))} />
                </td>
                {/* CE QUE L'ÉTUDIANT VOIT. Sur un stage, les heures
                    d'encadrement du superviseur ne sont pas les siennes. */}
                <td className="py-1.5 text-center">
                  <input type="checkbox" checked={l.vu_etudiant}
                    onChange={() => setLignes(ls => ls.map((x, j) =>
                      j === i ? { ...x, vu_etudiant: !x.vu_etudiant } : x))}
                    className="accent-iip-blue" />
                </td>
                <td className="text-center">
                  <button onClick={() => setLignes(ls => ls.filter((_, j) => j !== i))}
                    className="text-slate-300 hover:text-[#9D4A38]"><IconTrash size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button onClick={() => setLignes(ls => [...ls, { activite_id: null, periodes: 0, vu_etudiant: true }])}
          className="text-[12px] text-iip-blue hover:underline">
          <IconPlus size={14} className="inline align-[-2px] mr-1" />Ajouter une activité
        </button>

        {/* L'AUTONOMIE SE FAIT GLISSER VERS LE COURS. Ce qui reste non placé est
            signalé, jamais réparti d'office. */}
        <div className="carte px-3 py-2.5">
          <div className="flex items-baseline gap-2 text-[12.5px]">
            <b>Autonomie posée sur ce cours</b>
            <span className="text-slate-500 text-[11.5px]">
              unité : {ue.controle.autonomie.unite} · restante ailleurs : {restanteUE}
            </span>
            <span className="ml-auto text-[#7C3AED] font-semibold">{auto}</span>
          </div>
          <input type="range" min="0" max={ue.controle.autonomie.unite || 0} step="1"
            value={auto} onChange={e => setAuto(Number(e.target.value))}
            className="w-full accent-[#8B5CF6] mt-1.5" />
          {restanteUE < 0 && (
            <div className="text-[11.5px] text-[#9D4A38] mt-1">
              Vous placez plus d'autonomie que l'unité n'en porte.
            </div>
          )}
        </div>

        <p className="text-[11px] text-slate-400">
          Une activité est un sous-cours : elle n'apparaît ni sur le contrat de
          travail, ni sur les documents officiels. C'est un choix pédagogique, et
          il peut différer d'un professeur à l'autre — cette grille le propose.
        </p>
      </div>
    </Fenetre>
  );
}

/**
 * UNE PÉRIODE N'EST PAS UNE HEURE, ET PERSONNE NE FAIT LA DIVISION DE TÊTE.
 *
 * Cinquante minutes chez nous — mais c'est un réglage, servi par le serveur :
 * l'écrire en dur ferait une seconde source. On affiche « 64 p · 53 h 20 »,
 * parce que c'est en heures qu'on parle à un professeur et qu'on remplit un
 * horaire, et en périodes que le dossier pédagogique compte.
 */
function enHeures(periodes, minutes) {
  const m = Math.round((Number(periodes) || 0) * (Number(minutes) || 50));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
}

/** Les teintes des segments : la maison, déclinée — jamais un état. */
const TEINTES = ['#1B2B4B', '#3B5488', '#00AACC', '#5B7FB8', '#7FB3D5', '#A9C6E0'];
const TEINTE_AUTONOMIE = '#8B5CF6';

function JaugeCours({ dp, lignes, auto, dispo, minutes }) {
  const nom = id => dispo.find(a => a.id === Number(id))?.libelle || 'Activité';
  const segments = [
    ...lignes.map((l, i) => ({
      cle: `a${i}`, libelle: l.activite_id ? nom(l.activite_id) : 'À choisir',
      valeur: Number(l.periodes) || 0, teinte: TEINTES[i % TEINTES.length],
    })),
    ...(auto > 0 ? [{ cle: 'auto', libelle: 'Autonomie', valeur: auto,
      teinte: TEINTE_AUTONOMIE }] : []),
  ].filter(s => s.valeur > 0);

  const total = segments.reduce((t, s) => t + s.valeur, 0);
  // L'échelle : le dossier, ou le total quand il le dépasse — sinon ce qui
  // déborde sortirait du cadre au lieu de se voir.
  const echelle = Math.max(dp || 0, total, 1);
  const pct = v => `${(v / echelle) * 100}%`;

  return (
    <div className="carte px-3 py-2.5">
      <div className="flex items-baseline gap-2 text-[12.5px] mb-2">
        <b>Périodes du cours</b>
        <span className="text-slate-500 text-[11.5px]">
          dossier pédagogique : <b className="text-slate-700">{dp || '—'}</b>
          {dp ? ` p · ${enHeures(dp, minutes)}` : ''}
        </span>
        <span className="ml-auto text-[12.5px]">
          <b className={total === dp ? 'text-[#15803D]'
            : (total > (dp || 0) ? 'text-[#9D4A38]' : 'text-slate-700')}>{total}</b>
          <span className="text-slate-500"> p · {enHeures(total, minutes)} organisés</span>
        </span>
      </div>

      {/* LA BARRE. Vide, elle reste visible : un cours pas encore découpé doit
          se distinguer d'un cours absent. */}
      <div className="flex h-3 w-full rounded-full overflow-hidden bg-slate-200/70">
        {segments.map(s => (
          <div key={s.cle} style={{ width: pct(s.valeur), background: s.teinte }}
            title={`${s.libelle} — ${s.valeur} p · ${enHeures(s.valeur, minutes)}`} />
        ))}
      </div>

      {/* LE REPÈRE DU DOSSIER, quand on le dépasse : il dit OÙ était la cible. */}
      {dp > 0 && total > dp && (
        <div className="relative h-0">
          <div className="absolute -top-3 w-px h-3 bg-[#9D4A38]"
            style={{ left: pct(dp) }} title={`Dossier pédagogique : ${dp} périodes`} />
        </div>
      )}

      {segments.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 text-[11px] text-slate-500">
          {segments.map(s => (
            <span key={s.cle} className="inline-flex items-center gap-1">
              <i className="inline-block w-2 h-2 rounded-full" style={{ background: s.teinte }} />
              {s.libelle} <b className="text-slate-700">{s.valeur}</b> p
              <span className="text-slate-400">· {enHeures(s.valeur, minutes)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
