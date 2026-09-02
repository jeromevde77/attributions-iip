import { useEffect, useMemo, useRef, useState } from 'react';
import { IconSearch, IconCheck, IconDeviceFloppy, IconPencil } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import EncodageDirect from '../components/EncodageDirect.jsx';

/**
 * Encodage rapide des résultats — étudiants en lignes, UE en colonnes.
 *
 * L'année est portée par l'écran et non par la cellule : on délibère une année
 * entière d'un seul tenant. Un clic marque la réussite, deux le refus, trois
 * effacent. Marquer un résultat vaut inscription — celle-ci n'est jamais à
 * saisir séparément.
 *
 * Les acquis des autres années restent visibles en filigrane, avec leur année,
 * pour qu'on sache ce qui est déjà fait sans quitter l'écran.
 */

const CYCLE = [null, 'reussi', 'ajourne'];

// Couleurs des années d'études, communes à Lucie : BA1 orange, BA2 bleu clair,
// BA3 bleu marine.
const NIV_PALETTE = ['#F97316', '#60A5FA', '#1E3A8A', '#A855F7', '#EC4899'];
const couleurNiveau = niv => {
  const m = /^BA(\d+)$/i.exec(String(niv || '').trim());
  return m ? NIV_PALETTE[(Number(m[1]) - 1) % NIV_PALETTE.length] : null;
};

// L'année encodée est pleine et vive ; les acquis des autres années sont
// dans la même teinte, plus douce, avec leur millésime — le parcours se lit
// alors sans quitter l'écran.
const STYLE = {
  reussi:  'bg-emerald-100 text-emerald-800 border-emerald-300',
  ajourne: 'bg-red-100 text-red-700 border-red-300',
  absent:  'bg-slate-100 text-slate-500 border-slate-300',
};
const STYLE_ANTERIEUR = {
  reussi:  'bg-emerald-50/70 text-emerald-600 border-emerald-200',
  ajourne: 'bg-red-50/60 text-red-500 border-red-200',
  absent:  'bg-slate-50 text-slate-400 border-slate-200',
  va:      'bg-violet-50/70 text-violet-600 border-violet-200',
};
const SIGLE = { reussi: '✓', ajourne: '✕', absent: '–', va: 'VA' };

// « 2024-2025 » → « 24-25 »
const millesime = a => (a || '').slice(2, 4) + '-' + (a || '').slice(7, 9);

export default function EncodageRapide() {
  const [encodageDirect, setEncodageDirect] = useState(false);
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [annees, setAnnees] = useState([]);
  const [annee, setAnnee] = useState('');

  const [data, setData] = useState(null);
  const [cellules, setCellules] = useState({});     // "etud|ue" -> resultat
  const [notes, setNotes] = useState({});          // "etud|ue" -> note sur 20
  const [recherche, setRecherche] = useState('');
  const [choisis, setChoisis] = useState(new Set());
  const [niveauLot, setNiveauLot] = useState('');
  const [etat, setEtat] = useState('pret');         // pret | enregistrement | enregistre
  const [vue, setVue] = useState('ue');            // ue | annee
  const [synthese, setSynthese] = useState(null);

  const enAttente = useRef(new Map());
  const minuteur = useRef(null);

  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() })
      .then(r => r.json()).then(l => {
        if (Array.isArray(l)) { setSections(l); if (l.length && !section) setSection(l[0].code); }
      }).catch(() => {});
    fetch('/api/etudiants/purge/perimetre', { headers: authHeaders() })
      .then(r => r.json()).then(j => {
        const a = j?.annees || [];
        setAnnees(a); if (a.length && !annee) setAnnee(a[0]);
      }).catch(() => {});
    // eslint-disable-next-line
  }, []);

  async function charger() {
    if (!section || !annee) return;
    setData(null);
    const rep = await fetch(
      `/api/etudiants/matrice?annee=${annee}&section=${encodeURIComponent(section)}`,
      { headers: authHeaders() });
    if (!rep.ok) { setData({ ues: [], etudiants: [] }); return; }
    const j = await rep.json();
    setData(j);
    const c = {}, n = {};
    for (const e of j.etudiants) {
      for (const [ue, v] of Object.entries(e.cellules || {})) {
        if (v.resultat) c[e.id + '|' + ue] = v.resultat;
        if (v.points != null) n[e.id + '|' + ue] = v.points;
      }
    }
    setCellules(c); setNotes(n);
    setChoisis(new Set());
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [section, annee]);

  async function chargerSynthese() {
    if (!section) return;
    setSynthese(null);
    const rep = await fetch(`/api/etudiants/synthese?section=${encodeURIComponent(section)}`,
      { headers: authHeaders() });
    setSynthese(rep.ok ? await rep.json() : { annees: [], etudiants: [] });
  }
  useEffect(() => { if (vue === 'annee') chargerSynthese(); /* eslint-disable-next-line */ }, [vue, section]);

  // Enregistrement au fil de l'eau, par lots
  function planifier(etudId, ueNum, resultat) {
    enAttente.current.set(etudId + '|' + ueNum, { etudiant_id: etudId, ue_num: ueNum, resultat });
    setEtat('enregistrement');
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(async () => {
      const lot = [...enAttente.current.values()];
      enAttente.current.clear();
      if (!lot.length) { setEtat('pret'); return; }
      const rep = await fetch('/api/etudiants/matrice', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, changements: lot }),
      });
      setEtat(rep.ok ? 'enregistre' : 'pret');
      if (rep.ok) setTimeout(() => setEtat('pret'), 1600);
    }, 700);
  }

  function poser(etudId, ueNum, resultat) {
    const cle = etudId + '|' + ueNum;
    setCellules(c => {
      const n = { ...c };
      if (resultat) n[cle] = resultat; else delete n[cle];
      return n;
    });
    // Vider une case efface aussi sa note : elle ne survivrait à rien.
    if (!resultat) setNotes(n => { const m = { ...n }; delete m[cle]; return m; });
    planifier(etudId, ueNum, resultat);
  }

  function cycler(etudId, ueNum) {
    const actuel = cellules[etudId + '|' + ueNum] || null;
    const i = CYCLE.indexOf(actuel);
    poser(etudId, ueNum, CYCLE[(i + 1) % CYCLE.length]);
  }

  const filtres = useMemo(() => {
    if (!data?.etudiants) return [];
    if (!recherche) return data.etudiants;
    const q = recherche.toLowerCase();
    return data.etudiants.filter(e =>
      (e.nom || '').toLowerCase().includes(q) ||
      (e.prenom || '').toLowerCase().includes(q) ||
      (e.id_ecampus || '').toLowerCase().includes(q));
  }, [data, recherche]);

  const cibles = () => (choisis.size ? filtres.filter(e => choisis.has(e.id)) : filtres);

  // Action groupée : un résultat sur toutes les UE d'une année d'études
  function appliquerLot(resultat) {
    if (!data) return;
    const ues = data.ues.filter(u => !niveauLot || (u.ue_niv || '') === niveauLot);
    const etuds = cibles();
    if (!ues.length || !etuds.length) return;
    const quoi = resultat === 'reussi' ? 'réussi' : resultat === 'ajourne' ? 'refusé' : 'effacé';
    if (!window.confirm(
      `Marquer ${quoi} ${ues.length} UE${niveauLot ? ' de ' + niveauLot : ''} ` +
      `pour ${etuds.length} étudiant(s), en ${annee} ?`)) return;

    setCellules(c => {
      const n = { ...c };
      for (const e of etuds) for (const u of ues) {
        const cle = e.id + '|' + u.ue_num;
        if (resultat) n[cle] = resultat; else delete n[cle];
      }
      return n;
    });
    for (const e of etuds) for (const u of ues) planifier(e.id, u.ue_num, resultat);
  }

  // Colonne entière
  function appliquerColonne(ueNum) {
    const etuds = cibles();
    if (!etuds.length) return;
    if (!window.confirm(`Marquer réussi l'UE ${ueNum} pour ${etuds.length} étudiant(s) ?`)) return;
    setCellules(c => {
      const n = { ...c };
      for (const e of etuds) n[e.id + '|' + ueNum] = 'reussi';
      return n;
    });
    for (const e of etuds) planifier(e.id, ueNum, 'reussi');
  }

  const niveauxPresents = [...new Set((data?.ues || []).map(u => u.ue_niv).filter(Boolean))].sort();

  return (
    <div className="p-5 space-y-3 max-w-full">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-iip-blue">Encodage rapide</h2>
          <p className="text-sm text-slate-500">
            Un clic pour la réussite, deux pour le refus, trois pour effacer. L'inscription
            découle du résultat.
          </p>
        </div>
        <button onClick={() => setEncodageDirect(true)}
          title="Saisir directement les notes sur 20, pour l'année de votre choix"
          className="flex items-center gap-2 px-3 py-2 text-sm border border-iip-blue
                     text-iip-blue rounded-lg hover:bg-iip-blue/5 font-semibold">
          <IconPencil size={15} /> Encodage direct
        </button>
        <div className="text-[12px] flex items-center gap-1.5 text-slate-400">
          <IconDeviceFloppy size={14} />
          {etat === 'enregistrement' ? 'Enregistrement…'
            : etat === 'enregistre' ? <span className="text-emerald-600">Enregistré</span>
            : 'Enregistrement automatique'}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        {vue === 'ue' && (
          <select value={annee} onChange={e => setAnnee(e.target.value)}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm font-semibold text-iip-blue">
            {annees.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
        <select value={section} onChange={e => setSection(e.target.value)}
          className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
          {sections.map(s => <option key={s.code} value={s.code}>{s.libelle || s.code}</option>)}
        </select>
        <div className="flex rounded-lg border border-slate-300 overflow-hidden">
          {[['ue', 'Par UE'], ['annee', 'Par année']].map(([v, l]) => (
            <button key={v} onClick={() => setVue(v)}
              className={`px-3 py-1.5 text-[12.5px] ${vue === v
                ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="relative">
          <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={recherche} onChange={e => setRecherche(e.target.value)}
            placeholder="Filtrer les étudiants…"
            className="border border-slate-300 rounded-lg pl-8 pr-2 py-1.5 text-sm w-56" />
        </div>
      </div>

      {/* Actions groupées — délibération seulement */}
      <div className={`${vue === 'ue' ? 'flex' : 'hidden'} items-center gap-2 flex-wrap px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl`}>
        <span className="text-[12px] text-slate-600">
          {choisis.size ? <b>{choisis.size} étudiant(s) sélectionné(s)</b> : `Les ${filtres.length} étudiants affichés`}
        </span>
        <span className="text-slate-300">·</span>
        <select value={niveauLot} onChange={e => setNiveauLot(e.target.value)}
          className="border border-slate-300 rounded-lg px-2 py-1 text-[12px]">
          <option value="">Toutes les UE</option>
          {niveauxPresents.map(n => <option key={n} value={n}>UE de {n}</option>)}
        </select>
        <button onClick={() => appliquerLot('reussi')}
          className="text-[12px] px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-semibold">
          Tout réussi
        </button>
        <button onClick={() => appliquerLot('ajourne')}
          className="text-[12px] px-2.5 py-1 rounded-lg border border-red-300 text-red-700">
          Tout refusé
        </button>
        <button onClick={() => appliquerLot(null)}
          className="text-[12px] px-2.5 py-1 rounded-lg border border-slate-300 text-slate-600">
          Effacer
        </button>
        {choisis.size > 0 && (
          <button onClick={() => setChoisis(new Set())}
            className="text-[12px] px-2 py-1 text-slate-500">Désélectionner</button>
        )}
      </div>

      {vue === 'annee' ? (
        <SyntheseAnnees synthese={synthese} recherche={recherche}
          onOuvrir={(an) => { setAnnee(an); setVue('ue'); }} />
      ) : !data ? (
        <div className="py-10 text-center text-sm text-slate-400">Chargement…</div>
      ) : !data.etudiants.length ? (
        <div className="py-10 text-center text-sm text-slate-400 border-2 border-dashed rounded-xl">
          Aucun étudiant pour cette section.
        </div>
      ) : (
        <div className="border border-slate-200 rounded-xl overflow-auto" style={{ maxHeight: '68vh' }}>
          <table className="text-sm border-collapse">
            <thead className="sticky top-0 z-20">
              <tr className="bg-slate-50">
                <th className="sticky left-0 z-30 bg-slate-50 border-b border-r border-slate-200 px-2 py-2 w-8"></th>
                <th className="sticky left-8 z-30 bg-slate-50 border-b border-r border-slate-200 px-3 py-2 text-left min-w-[190px]">
                  <span className="text-[10.5px] uppercase tracking-wide text-slate-500">Étudiant</span>
                </th>
                {data.ues.map((u, i) => (
                  <th key={u.ue_num} onClick={() => appliquerColonne(u.ue_num)}
                    title={`${u.ue_nom || ''} — cliquer pour marquer réussi sur la sélection`}
                    /* Un filet marque le passage d'un niveau au suivant : les
                       colonnes sont triées BA1, BA2, BA3, mais rien ne le
                       montrait. */
                    className={`border-b border-slate-200 px-1 py-2 w-14 cursor-pointer
                      hover:bg-slate-100 ${i > 0 && data.ues[i - 1].ue_niv !== u.ue_niv
                        ? 'border-l-2 border-l-iip-blue/30' : ''}`}>
                    <div className="text-[11.5px] font-bold text-iip-blue">{u.ue_num}</div>
                    <div className="text-[8.5px] font-semibold"
                      style={{ color: couleurNiveau(u.ue_niv) || '#94A3B8' }}>
                      {u.ue_niv || '—'}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtres.map(e => (
                <tr key={e.id} className="hover:bg-slate-50/60">
                  <td className="sticky left-0 z-10 bg-white border-r border-b border-slate-100 px-2 py-1 text-center">
                    <input type="checkbox" checked={choisis.has(e.id)}
                      onChange={ev => setChoisis(s => {
                        const n = new Set(s);
                        ev.target.checked ? n.add(e.id) : n.delete(e.id);
                        return n;
                      })} />
                  </td>
                  <td className="sticky left-8 z-10 bg-white border-r border-b border-slate-100 px-3 py-1">
                    <div className="text-[12.5px] text-slate-800 truncate max-w-[180px]">
                      {e.nom} {e.prenom}
                    </div>
                    <div className="text-[10px] text-slate-400">{e.id_ecampus}</div>
                  </td>
                  {data.ues.map((u, i) => {
                    const cle = e.id + '|' + u.ue_num;
                    const val = cellules[cle] || null;
                    const ant = e.anterieurs?.[u.ue_num];
                    return (
                      <td key={u.ue_num}
                        className={`border-b border-slate-100 p-0.5 text-center
                          ${i > 0 && data.ues[i - 1].ue_niv !== u.ue_niv
                            ? 'border-l-2 border-l-iip-blue/30' : ''}`}>
                        <button onClick={() => cycler(e.id, u.ue_num)}
                          title={val
                            ? `${val === 'reussi' ? 'Réussi' : val === 'ajourne' ? 'Refusé' : 'Absent'} en ${annee}`
                              + (notes[cle] != null ? ` — ${notes[cle]}/20` : '')
                            : ant
                              ? `${ant.resultat === 'va' ? 'Valorisée' : ant.resultat === 'reussi' ? 'Réussie' : 'Refusée'} en ${ant.annee}`
                              : 'Cliquer pour encoder'}
                          className={`w-12 h-9 rounded-md border transition leading-none
                            ${val ? STYLE[val]
                                  : ant ? STYLE_ANTERIEUR[ant.resultat] || STYLE_ANTERIEUR.absent
                                        : 'border-transparent text-slate-300 hover:border-slate-200 hover:bg-slate-50'}`}>
                          {val ? (
                            <span className="block">
                              <span className="block text-[13px] font-bold">
                                {notes[cle] != null ? notes[cle] : SIGLE[val]}
                              </span>
                              <span className="block text-[7.5px] font-medium opacity-70">{millesime(annee)}</span>
                            </span>
                          ) : ant ? (
                            <span className="block">
                              <span className="block text-[12px] font-semibold">
                                {ant.points != null ? ant.points : (SIGLE[ant.resultat] || '·')}
                              </span>
                              <span className="block text-[7.5px] opacity-80">{millesime(ant.annee)}</span>
                            </span>
                          ) : '·'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className={`text-[11px] text-slate-400 ${vue === 'ue' ? '' : 'hidden'}`}>
        La case porte la <b>note sur 20</b> lorsqu'elle est connue, sinon le symbole :
        <b className="text-emerald-700"> ✓</b> réussi · <b className="text-red-600">✕</b> refusé ·
        <b className="text-violet-600"> VA</b> valorisation — chaque case porte son millésime.
        Les acquis d'une autre année s'affichent dans la même couleur, en plus doux.
        Cliquer un numéro d'UE marque la colonne comme réussie pour les étudiants sélectionnés,
        ou pour tous ceux affichés si aucune sélection n'est faite.
      </p>
    {encodageDirect && (
        <EncodageDirect onClose={() => setEncodageDirect(false)}
          anneeDefaut={annee} sectionDefaut={section} />
      )}

    </div>
  );
}


// ── Vue par année scolaire : une case résume une année ──────────────────────
// Le détail des UE n'y figure pas — il est à un clic, dans la vue de
// délibération. C'est ce renoncement qui rend la cohorte lisible.
function SyntheseAnnees({ synthese, recherche, onOuvrir }) {
  if (!synthese) return <div className="py-10 text-center text-sm text-slate-400">Chargement…</div>;
  if (!synthese.etudiants?.length) {
    return (
      <div className="py-10 text-center text-sm text-slate-400 border-2 border-dashed rounded-xl">
        Aucun étudiant pour cette section.
      </div>
    );
  }

  const q = (recherche || '').toLowerCase();
  const lignes = q
    ? synthese.etudiants.filter(e =>
        (e.nom || '').toLowerCase().includes(q) ||
        (e.prenom || '').toLowerCase().includes(q) ||
        (e.id_ecampus || '').toLowerCase().includes(q))
    : synthese.etudiants;

  // Du rouge au vert selon la proportion d'UE acquises
  const teinte = (r, t) => {
    if (!t) return { bg: 'transparent', fg: '#CBD5E1', bd: 'transparent' };
    const p = r / t;
    if (p >= 0.999) return { bg: '#D1FAE5', fg: '#065F46', bd: '#6EE7B7' };
    if (p >= 0.75)  return { bg: '#ECFDF5', fg: '#047857', bd: '#A7F3D0' };
    if (p >= 0.5)   return { bg: '#FEF9C3', fg: '#854D0E', bd: '#FDE68A' };
    if (p > 0)      return { bg: '#FFEDD5', fg: '#9A3412', bd: '#FED7AA' };
    return { bg: '#FEE2E2', fg: '#991B1B', bd: '#FCA5A5' };
  };

  return (
    <>
      <div className="border border-slate-200 rounded-xl overflow-auto" style={{ maxHeight: '68vh' }}>
        <table className="text-sm border-collapse w-full">
          <thead className="sticky top-0 z-20">
            <tr className="bg-slate-50">
              <th className="sticky left-0 z-30 bg-slate-50 border-b border-r border-slate-200 px-3 py-2 text-left min-w-[210px]">
                <span className="text-[10.5px] uppercase tracking-wide text-slate-500">Étudiant</span>
              </th>
              {synthese.annees.map(a => (
                <th key={a} className="border-b border-slate-200 px-2 py-2 min-w-[86px]">
                  <div className="text-[11.5px] font-bold text-iip-blue">{a}</div>
                  {a === synthese.annee_active && (
                    <div className="text-[8px] text-iip-turquoise font-semibold">EN COURS</div>
                  )}
                </th>
              ))}
              <th className="border-b border-l border-slate-200 px-2 py-2 w-20">
                <span className="text-[10.5px] uppercase tracking-wide text-slate-500">Acquis</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lignes.map(e => (
              <tr key={e.id} className="hover:bg-slate-50/60">
                <td className="sticky left-0 z-10 bg-white border-r border-b border-slate-100 px-3 py-1.5">
                  <div className="text-[12.5px] text-slate-800 truncate max-w-[200px]">
                    {e.nom} {e.prenom}
                  </div>
                  <div className="text-[10px] text-slate-400">{e.id_ecampus}</div>
                </td>

                {synthese.annees.map(a => {
                  const k = e.cases[a];
                  if (!k) return <td key={a} className="border-b border-slate-100 text-center text-slate-200">·</td>;
                  const t = teinte(k.reussies, k.tentees);
                  const detail = [
                    `${k.tentees} UE au programme`,
                    k.reussies ? `${k.reussies} réussie(s)` : null,
                    k.refusees ? `${k.refusees} refusée(s)` : null,
                    k.absentes ? `${k.absentes} absence(s)` : null,
                    k.en_cours ? `${k.en_cours} non délibérée(s)` : null,
                    k.va ? `${k.va} valorisation(s)` : null,
                    k.moyenne != null ? `moyenne ${k.moyenne}/20` : null,
                  ].filter(Boolean).join(' · ');
                  return (
                    <td key={a} className="border-b border-slate-100 p-1 text-center">
                      <button onClick={() => onOuvrir(a)} title={`${a} — ${detail}`}
                        className="w-full rounded-md border py-1 leading-none transition hover:brightness-95"
                        style={{ background: t.bg, color: t.fg, borderColor: t.bd }}>
                        <span className="block text-[13px] font-bold">
                          {k.reussies}/{k.tentees}
                        </span>
                        <span className="block text-[8px] opacity-80">
                          {k.en_cours ? `${k.en_cours} en cours` : k.moyenne != null ? `${k.moyenne}/20` : '\u00a0'}
                        </span>
                      </button>
                    </td>
                  );
                })}

                <td className="border-b border-l border-slate-100 px-2 py-1.5 text-center">
                  <span className="text-[12.5px] font-bold text-iip-blue">{e.acquis}</span>
                  <span className="text-[10px] text-slate-400">/{e.total}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-slate-400 mt-2">
        Chaque case donne les <b>UE réussies sur les UE au programme</b> de l'année, et sa couleur
        en traduit la proportion. Le détail apparaît au survol ; un clic ouvre l'année dans la vue
        de délibération.
      </p>
    </>
  );
}
