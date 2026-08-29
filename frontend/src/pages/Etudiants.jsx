import { useEffect, useState, useMemo } from 'react';
import {
  IconSearch, IconUser, IconChevronRight, IconPlus, IconCheck,
  IconX, IconPrinter, IconAlertTriangle, IconClock, IconUpload, IconFileText, IconFolder, IconTrash, IconTable} from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import PreviewModal from '../components/PreviewModal.jsx';
import SchemaCapitalisationVue from '../components/SchemaCapitalisation.jsx';
import ImportPAE from '../components/ImportPAE.jsx';
import PurgeResultats from '../components/PurgeResultats.jsx';
import RapportPAE from '../components/RapportPAE.jsx';
import ImportListe from '../components/ImportListe.jsx';
import DroitInscription from '../components/DroitInscription.jsx';
import ImportHistorique from '../components/ImportHistorique.jsx';

// Niveau de l'étudiant : BA1/BA2 s'il ne suit qu'une année, « Diplômant »
// s'il ne lui reste que la BA3, « Parcours » s'il en mélange plusieurs.
// Couleurs des années d'études, communes à Lucie (cf. exports Attributions) :
// BA1 orange, BA2 bleu clair, BA3 bleu marine, puis violet et rose au-delà.
const NIV_PALETTE = ['#F97316', '#60A5FA', '#1E3A8A', '#A855F7', '#EC4899'];

function couleurNiveau(niv) {
  const m = /^BA(\d+)$/i.exec(String(niv || '').trim());
  if (!m) return null;
  return NIV_PALETTE[(Number(m[1]) - 1) % NIV_PALETTE.length];
}

// Pastille d'année d'études, sur fond plein pour rester lisible.
function BadgeUeNiveau({ niveau }) {
  const couleur = couleurNiveau(niveau);
  if (!niveau) return <span className="text-[11px] text-slate-300">—</span>;
  if (!couleur) {
    return (
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-slate-200 text-slate-500">
        {niveau}
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white"
      style={{ backgroundColor: couleur }}>
      {niveau}
    </span>
  );
}

// En-tête de colonne triable : un clic trie, un second inverse le sens.
function ThTri({ champ, tri, onTri, className = '', children }) {
  const actif = tri.champ === champ;
  return (
    <th onClick={() => onTri(champ)}
      className={`px-4 py-2.5 cursor-pointer select-none hover:bg-slate-100 transition ${className}`}
      title="Trier sur cette colonne">
      <span className="inline-flex items-center gap-1">
        {children}
        <span className={`text-[9px] leading-none ${actif ? 'text-iip-turquoise' : 'text-slate-300'}`}>
          {actif ? (tri.sens === 1 ? '▲' : '▼') : '▲'}
        </span>
      </span>
    </th>
  );
}

function BadgeNiveau({ niveau, libelle, className = '' }) {
  if (!libelle) return null;
  const cls = niveau === 'MIXTE' ? 'bg-amber-50 text-amber-700 border-amber-200'
    : niveau === 'BA3'          ? 'bg-violet-50 text-violet-700 border-violet-200'
    : 'bg-sky-50 text-sky-700 border-sky-200';
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cls} ${className}`}>
      {libelle}
    </span>
  );
}

const STATUTS_PIECE = [
  { val: 'manquant', label: 'Manquant', cls: 'bg-red-50 text-red-700 border-red-200' },
  { val: 'recu',     label: 'Reçu',     cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { val: 'na',       label: 'N/A',      cls: 'bg-slate-100 text-slate-500 border-slate-200' },
];

// ── Schéma de capitalisation de l'étudiant (vue partagée avec Organisation) ──
function SchemaCapitalisation({ etudId, annee }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let vivant = true;
    fetch(`/api/etudiants/${etudId}/capitalisation?annee=${annee}`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (vivant) setData(j || { nodes: [], edges: [] }); })
      .catch(() => { if (vivant) setData({ nodes: [], edges: [] }); });
    return () => { vivant = false; };
  }, [etudId, annee]);
  if (data && !data.nodes?.length) return null;
  return <SchemaCapitalisationVue data={data} mode="etudiant" />;
}

// ── Grille de parcours : UE × années ─────────────────────────────────────────
const KINDS_CELLULE = [
  { val: 'inscrit', label: 'Inscrit',  short: '·',  cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  { val: 'reussi',  label: 'Réussi',   short: '✓',  cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  { val: 'va',      label: 'VA',       short: 'VA', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  { val: 'ajourne', label: 'Refusé',   short: '✕',  cls: 'bg-red-50 text-red-700 border-red-200' },
  { val: 'absent',  label: 'Absent',   short: '–',  cls: 'bg-slate-50 text-slate-600 border-slate-200' },
];

function GrilleParcours({ etudId, peutEcrire }) {
  const [data, setData] = useState(null);
  const [popover, setPopover] = useState(null); // { annee, ue_num, verrou }
  const [pts, setPts] = useState('');
  const [nbHistorique, setNbHistorique] = useState(0);   // nb d'années antérieures révélées
  const [detail, setDetail] = useState(null);       // composantes + notes de la cellule ouverte
  const [detailOuvert, setDetailOuvert] = useState(false);



  async function charger() {
    const rep = await fetch(`/api/etudiants/${etudId}/grille`, { headers: authHeaders() });
    if (rep.ok) setData(await rep.json());
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [etudId]);

  async function chargerDetail() {
    if (!popover) return;
    const rep = await fetch(
      `/api/etudiants/${etudId}/grille/detail?annee=${popover.annee}&ue_num=${popover.ue_num}`,
      { headers: authHeaders() });
    if (rep.ok) { setDetail(await rep.json()); setDetailOuvert(true); }
  }

  async function poserReport(cand) {
    await fetch('/api/acquis/reports', {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({
        etudiant_id: etudId, annee_scolaire: popover.annee, ue_num: popover.ue_num,
        cours_code: cand.cours_code, note: cand.note, annee_origine: cand.annee_origine,
      }),
    });
    await chargerDetail();
  }

  async function retirerReport(coursCode) {
    await fetch(`/api/acquis/reports/${etudId}/${popover.ue_num}/${encodeURIComponent(coursCode)}?annee=${popover.annee}`,
      { method: 'DELETE', headers: authHeaders() });
    await chargerDetail();
  }

  async function ecrireDetail(coursCode, aaCode, points, opts = {}) {
    const rep = await fetch(`/api/etudiants/${etudId}/grille/detail`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({
        annee: popover.annee, ue_num: popover.ue_num,
        cours_code: coursCode, code: aaCode, points,
        va: opts.va ? 1 : 0, non_evalue: opts.non_evalue ? 1 : 0,
      }),
    });
    if (rep.ok) {
      const j = await rep.json();
      setDetail(d => d && ({
        ...d,
        calcul: j.calcul,
        notes: {
          ...d.notes,
          [coursCode + '|' + aaCode]: {
            points, va: opts.va ? 1 : 0, non_evalue: opts.non_evalue ? 1 : 0,
          },
        },
      }));
      charger();
    }
  }


  async function purgerAnnee() {
    const annees = (data?.annees || []);
    const saisie = window.prompt(
      'Année à purger ?\nAnnées présentes : ' + annees.join(', '),
      annees[annees.length - 1] || '');
    if (!saisie || !/^20\d{2}-20\d{2}$/.test(saisie.trim())) {
      if (saisie !== null) alert('Format attendu : 2025-2026');
      return;
    }
    const an = saisie.trim();
    const tout = window.confirm(
      `Purge de ${an}\n\nOK = supprimer les inscriptions ET les résultats\n` +
      `Annuler = ne vider que les résultats, en gardant les inscriptions`);
    const portee = tout ? 'tout' : 'resultats';
    if (!window.confirm(
      portee === 'tout'
        ? `Confirmer la suppression des inscriptions de ${an} et de tout ce qui s'y rattache ?`
        : `Confirmer l'effacement des résultats de ${an} ? Les inscriptions sont conservées.`)) return;

    const rep = await fetch(`/api/etudiants/${etudId}/annee/${an}?portee=${portee}`,
      { method: 'DELETE', headers: authHeaders() });
    const j = await rep.json();
    if (!rep.ok) { alert(j.error || 'Erreur'); return; }
    alert(`Purge de ${an} — ${j.avant} inscription(s) concernée(s)` +
      (portee === 'tout' ? `\n${j.inscriptions} supprimée(s), ${j.valorisations} valorisation(s)` : '\nrésultats effacés') +
      `\n${j.notes} note(s) d'acquis supprimée(s)`);
    await charger();
  }

  async function ecrire(kind, opts = {}) {
    if (!popover) return;
    const rep = await fetch(`/api/etudiants/${etudId}/grille`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({
        annee: popover.annee, ue_num: popover.ue_num, kind,
        points: opts.points, derogation: popover.verrou ? 1 : 0,
      }),
    });
    if (!rep.ok) { const j = await rep.json().catch(() => ({})); alert(j.error || 'Erreur'); return; }
    setPopover(null); setPts(''); setDetail(null); setDetailOuvert(false);
    await charger();
  }

  if (!data) return <div className="py-6 text-sm text-slate-400">Chargement…</div>;
  if (!data.ues.length) return (
    <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed rounded-xl">
      Aucune UE trouvée pour la section de cet étudiant.
    </div>
  );

  const cell = (annee, ueNum) => data.cellules?.[annee]?.[ueNum] || null;
  // Les années antérieures existent toujours ; le bouton « les révèle.
  // Le calcul part TOUJOURS des années réellement présentes en base, jamais
  // d'une liste accumulée — impossible d'en perdre une au clic suivant.
  const anneesBase = [...data.annees].sort();
  // Un parcours se lit d'une année à la suivante : les colonnes doivent être
  // CONTINUES. Une année sans donnée reste affichée, vide — sans quoi la
  // grille saute des années et l'on croit à une interruption d'études.
  // Fenêtre d'années : l'année active est toujours la dernière colonne, et
  // quatre années au moins la précèdent — de quoi lire le parcours et encoder
  // sans manipuler l'affichage. Les années portant des données restent
  // visibles même au-delà de cette fenêtre.
  const ANNEES_AVANT = 4;
  const anneesAffichees = (() => {
    if (!anneesBase.length) return anneesBase;
    const finBase   = Number(anneesBase[anneesBase.length - 1].split('-')[0]);
    const fin = Math.max(finBase, Number((data.anneeActive || '').split('-')[0] || 0));
    const debutDonnees = Number(anneesBase[0].split('-')[0]);
    const debut = Math.min(debutDonnees, fin - ANNEES_AVANT) - (nbHistorique || 0);
    const toutes = [];
    for (let a = debut; a <= fin; a++) toutes.push(a + '-' + (a + 1));
    return toutes;
  })();
  const aDetail = (annee, ueNum) => (data.detail || []).includes(annee + ':' + ueNum);

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-[12px] text-slate-500 flex-1 max-w-none">
        Cliquez sur une case pour encoder. Une UE dont les prérequis ne sont pas acquis est
        verrouillée <span className="text-slate-400">🔒</span> — l'encoder demande une dérogation (tracée).
        Un halo <span className="inline-block w-3 h-3 rounded-sm bg-violet-100 border border-violet-300 align-middle"></span> suggère
        une UE probablement acquise (inférence prérequis) à confirmer.
        </p>
        <div className="flex-none flex gap-1.5">
          {nbHistorique > 0 && (
            <button onClick={() => setNbHistorique(0)}
              title="Masquer les années antérieures vides"
              className="px-2.5 py-1.5 text-[12px] border border-slate-300 rounded-lg hover:bg-slate-50">
              » Masquer
            </button>
          )}
          <button onClick={purgerAnnee}
            title="Effacer les résultats ou les inscriptions d'une année"
            className="px-2.5 py-1.5 text-[12px] border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
            Purger une année
          </button>
          <button onClick={() => setNbHistorique(n => (n === 0 ? 5 : n + 3))}
            title="Afficher les années antérieures pour encoder l'historique"
            className="px-2.5 py-1.5 text-[12px] border border-slate-300 rounded-lg hover:bg-slate-50">
            « {nbHistorique === 0 ? 'Années antérieures' : 'Remonter encore'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 text-[10.5px] uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 text-left sticky left-0 bg-slate-50 z-10 min-w-[260px]">UE</th>
              <th className="px-2 py-2 text-left w-14">Niv.</th>
              {anneesAffichees.map((a, i) => {
                const derniere = i === anneesAffichees.length - 1;
                return (
                  <th key={a}
                    className={`px-2 py-2 text-center min-w-[92px] ${derniere
                      ? 'sticky right-0 z-20 bg-iip-blue text-white shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.18)]'
                      : ''}`}>
                    {a}
                    {derniere && <span className="block text-[8.5px] font-normal text-blue-200">à venir</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.ues.map(u => {
              const verrou = !u.deverrouillee && !u.acquise;
              return (
                <tr key={u.section + '-' + u.ue_num}
                  className={`border-t border-slate-100 ${u.acquise ? 'bg-emerald-50/30' : ''}`}>
                  <td className={`px-3 py-1.5 sticky left-0 bg-white z-10 ${u.acquise ? 'bg-emerald-50/60' : ''}`}>
                    <span className="font-medium text-iip-blue">{u.ue_num}</span>
                    <span className="text-slate-600 ml-1.5 text-[12px]">{u.ue_nom}</span>
                    {verrou && <span className="ml-1.5 text-[11px]"
                      title={'Exige : UE ' + ((u.prereq_chaine?.length ? u.prereq_chaine : u.prerequis) || []).join(', ')}>🔒</span>}
                    {u.suggeree && <span className="ml-1.5 text-[9.5px] px-1 py-0.5 rounded bg-violet-50 text-violet-600 border border-violet-200" title="Probablement acquise (inférence prérequis) — à confirmer">à confirmer</span>}
                    {u.hors_referentiel && (
                      <span className="ml-1.5 text-[9.5px] px-1 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200"
                        title="Inscription à une UE absente du référentiel de la section">
                        hors référentiel
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5"><BadgeUeNiveau niveau={u.ue_niv} /></td>
                  {anneesAffichees.map((a, iCol) => {
                    const derniere = iCol === anneesAffichees.length - 1;
                    const cl = cell(a, u.ue_num);
                    const kind = cl && KINDS_CELLULE.find(k => k.val === cl.kind);
                    return (
                      <td key={a}
                        className={`px-1.5 py-1.5 text-center ${derniere
                          ? 'sticky right-0 z-10 bg-white shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.10)]'
                          : ''}`}>
                        <button
                          onClick={() => {
                            if (!peutEcrire) return;
                            if (!verrou || cl) { setPopover({ annee: a, ue_num: u.ue_num, verrou: false }); return; }
                            // Prérequis manquants : sont-ils inscrits (ou mieux) la même année ?
                            const acquisSet = new Set(data.ues.filter(x => x.acquise).map(x => x.ue_num));
                            const nivMap = Object.fromEntries(data.ues.map(x => [x.ue_num, (x.ue_niv || '').toUpperCase()]));
                            const manquants = u.prerequis.filter(p => !acquisSet.has(p));
                            const memeAnnee = manquants.length > 0 && manquants.every(p =>
                              cell(a, p) && nivMap[p] === (u.ue_niv || '').toUpperCase());
                            if (memeAnnee) {
                              // Inscription simultanée normale — sous réserve, pas de dérogation
                              setPopover({ annee: a, ue_num: u.ue_num, verrou: false, sousReserve: manquants });
                            } else if (window.confirm(
                                'UE verrouillée — exige la réussite de : UE '
                                + ((u.prereq_chaine?.length ? u.prereq_chaine : u.prerequis) || []).join(', ')
                                + '.\n\nL\'exigence est transitive : une UE prérequise a elle-même ses prérequis.'
                                + '\n\nEncoder quand même avec dérogation ?')) {
                              setPopover({ annee: a, ue_num: u.ue_num, verrou: true });
                            }
                          }}
                          className={`w-full min-h-[30px] text-[11.5px] font-medium rounded-lg border px-1 py-1 transition
                            ${kind ? kind.cls : 'border-transparent text-slate-300 hover:border-slate-200 hover:bg-slate-50'}
                            ${cl?.derogation ? 'ring-1 ring-amber-400' : ''}`}
                          title={cl?.derogation ? 'Encodée avec dérogation' : ''}>
                          {kind
                            ? (kind.val === 'reussi' ? (cl.points != null ? cl.points + '/20' : '✓')
                               : kind.val === 'va' ? (cl.points != null ? 'VA ' + cl.points : 'VA')
                               : kind.short)
                            : '·'}
                          {aDetail(a, u.ue_num) && <span className="ml-0.5 align-super text-[8px]">●</span>}
                          {(() => {
                            if (!cl || cl.kind !== 'inscrit') return null;
                            const acquisSet = new Set(data.ues.filter(x => x.acquise).map(x => x.ue_num));
                            const nivMap = Object.fromEntries(data.ues.map(x => [x.ue_num, (x.ue_niv || '').toUpperCase()]));
                            const manquants = u.prerequis.filter(p => !acquisSet.has(p));
                            if (manquants.length && manquants.every(p => cell(a, p) && nivMap[p] === (u.ue_niv || '').toUpperCase()))
                              return <span className="ml-0.5 text-[9px]" title={'Sous réserve — réussite UE ' + manquants.join(', ') + ' requise en cours d\'année'}>⏳</span>;
                            return null;
                          })()}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {popover && (
        <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center p-4"
          onClick={() => { setPopover(null); setPts(''); setDetail(null); setDetailOuvert(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl p-5 w-80" onClick={e => e.stopPropagation()}>
            <div className="font-semibold text-iip-blue mb-1">
              UE {popover.ue_num} — {popover.annee}
            </div>
            {popover.verrou && (
              <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mb-2">
                Dérogation — sera tracée comme telle
              </div>
            )}
            {popover.sousReserve && (
              <div className="text-[11px] text-sky-700 bg-sky-50 border border-sky-200 rounded-lg px-2 py-1 mb-2">
                Inscription sous réserve — l'accès effectif dépend de la réussite de
                l'UE {popover.sousReserve.join(', ')} en cours d'année (cas type : épreuve intégrée).
              </div>
            )}
            <input type="number" min="0" max="20" step="0.1" placeholder="Note /20 (optionnel)"
              value={pts} onChange={e => setPts(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm mb-3" />
            <div className="grid grid-cols-2 gap-1.5">
              {KINDS_CELLULE.map(k => (
                <button key={k.val}
                  onClick={() => ecrire(k.val, { points: pts !== '' ? Number(pts) : undefined })}
                  className={`text-[12px] px-2 py-1.5 rounded-lg border font-medium ${k.cls}`}>
                  {k.label}
                </button>
              ))}
              <button onClick={() => ecrire('effacer_resultat')}
                title="L'inscription demeure ; sa note et ses acquis sont effacés"
                className="text-[12px] px-2 py-1.5 rounded-lg border border-slate-200 text-slate-600">
                Effacer le résultat
              </button>
              <button onClick={() => {
                  if (window.confirm("Supprimer l'inscription à cette UE pour cette année ?\nSes notes, valorisations et reports seront également supprimés."))
                    ecrire('effacer');
                }}
                title="Supprime l'inscription et tout ce qui s'y rattache"
                className="text-[12px] px-2 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">
                Supprimer l'inscription
              </button>
            </div>

            <button onClick={() => detailOuvert ? setDetailOuvert(false) : chargerDetail()}
              className="mt-3 w-full text-[12px] px-2 py-1.5 rounded-lg border border-iip-turquoise/40 text-iip-blue hover:bg-iip-turquoise/5">
              {detailOuvert ? 'Masquer le détail' : 'Notes par cours & AA…'}
            </button>

            {detailOuvert && detail && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                {/* Note calculée depuis les acquis d'apprentissage */}
                {detail.calcul && (
                  <div className={`rounded-xl px-3 py-2.5 mb-3 border ${
                    detail.calcul.pourcentage == null
                      ? 'bg-slate-50 border-slate-200'
                      : detail.calcul.sur20 >= 10
                        ? 'bg-emerald-50 border-emerald-200'
                        : 'bg-red-50 border-red-200'}`}>
                    {detail.calcul.sur20 == null ? (
                      <div className="text-[11.5px] text-slate-500">
                        Aucun acquis coté, ou pondérations non encodées pour cette UE.
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                            Note calculée
                          </div>
                          <div className="text-[19px] font-bold text-iip-blue leading-tight"
                            title={detail.calcul.sur20_exact != null ? `Valeur exacte : ${detail.calcul.sur20_exact}` : ''}>
                            {detail.calcul.sur20} / 20
                            <span className="text-[12px] font-normal text-slate-500 ml-2">
                              {detail.calcul.pourcentage} %
                            </span>
                          </div>
                          <div className="text-[10.5px] text-slate-500">
                            {detail.calcul.evalues}/{detail.calcul.attendus} acquis cotés
                            {!detail.calcul.complet ? " — calcul partiel" : ''}
                          </div>
                        </div>
                        <button
                          onClick={() => ecrire(detail.calcul.sur20 >= 10 ? 'reussi' : 'ajourne',
                            { points: detail.calcul.sur20 })}
                          className="flex-none text-[11.5px] px-2.5 py-1.5 rounded-lg bg-iip-blue text-white font-semibold">
                          Reporter sur l\u2019UE
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Reports de note proposés : cours validés dans une UE échouée */}
                {(detail.candidats_report || []).length > 0 && (
                  <div className="mb-3 border border-sky-200 bg-sky-50 rounded-xl px-3 py-2.5">
                    <div className="text-[11.5px] font-semibold text-sky-900 mb-1.5">
                      Report de note possible
                    </div>
                    <div className="space-y-1">
                      {detail.candidats_report.map(cd => (
                        <div key={cd.cours_code} className="flex items-center gap-2">
                          <div className="flex-1 text-[11px] text-sky-900 truncate" title={cd.cours_nom}>
                            <b>{cd.cours_code}</b> {cd.cours_nom}
                            <span className="text-sky-700"> — {cd.note_affichee}/20 en {cd.annee_origine}</span>
                          </div>
                          <button onClick={() => poserReport(cd)}
                            className="flex-none text-[11px] px-2 py-0.5 rounded-lg bg-sky-600 text-white font-semibold">
                            Reporter
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-sky-700 mt-1.5">
                      Cours validés alors que l'UE n'était pas réussie. Le report relève du Conseil des études.
                    </p>
                  </div>
                )}

                <div className="max-h-72 overflow-y-auto space-y-2.5">
                  {(detail.structure || []).map(co => (
                    <div key={co.cours_code} className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-50">
                        <div className="flex-1 text-[11.5px] text-slate-700 truncate" title={co.cours_nom}>
                          <b className="text-iip-blue">{co.cours_code}</b> {co.cours_nom}
                        </div>
                        <span className="text-[10px] text-slate-400 flex-none"
                          title={`${co.periodes} périodes`}>
                          {co.poids_cours_affiche != null ? co.poids_cours_affiche + ' %' : '— %'}
                        </span>
                        {!co.complet && (
                          <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 flex-none"
                            title={`Somme des pondérations : ${co.somme_poids} au lieu de 100`}>
                            pondérations {co.somme_poids}
                          </span>
                        )}
                      </div>

                      {(detail.reports || []).some(r0 => r0.cours_code === co.cours_code) ? (
                        (() => {
                          const rn = detail.reports.find(r0 => r0.cours_code === co.cours_code);
                          return (
                            <div className="px-3 py-2 flex items-center gap-2 bg-sky-50/60">
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-600 text-white flex-none">
                                RN
                              </span>
                              <div className="flex-1 text-[11.5px] text-sky-900">
                                Note reportée : <b>{Math.round(rn.note)}/20</b>
                                {rn.annee_origine ? <span className="text-sky-700"> (validé en {rn.annee_origine})</span> : null}
                              </div>
                              <button onClick={() => retirerReport(co.cours_code)}
                                className="flex-none text-[10.5px] px-2 py-0.5 rounded-lg border border-sky-300 text-sky-700 hover:bg-white">
                                Retirer
                              </button>
                            </div>
                          );
                        })()
                      ) : !co.aas.length ? (
                        <div className="px-3 py-2 text-[11px] text-slate-400">
                          Aucun acquis d\u2019apprentissage rattaché à ce cours.
                        </div>
                      ) : (
                        <div className="px-2 py-1 space-y-0.5">
                          {co.aas.map(aa => {
                            const cle = co.cours_code + '|' + aa.aa_code;
                            const n = detail.notes[cle] || {};
                            return (
                              <div key={cle} className="flex items-center gap-2 py-0.5">
                                <div className="flex-1 text-[11px] text-slate-600 truncate"
                                  title={aa.description || aa.aa_code}>
                                  <b className="text-slate-500">{aa.aa_code}</b> {aa.description || ''}
                                </div>
                                <span className="text-[10px] text-slate-400 flex-none w-9 text-right"
                                  title="Pondération dans ce cours">
                                  {aa.poids != null ? aa.poids + '%' : '—'}
                                </span>
                                <input type="number" min="0" max="20" step="0.1" placeholder="/20"
                                  defaultValue={n.points ?? ''}
                                  disabled={!!n.non_evalue}
                                  onBlur={e => ecrireDetail(co.cours_code, aa.aa_code,
                                    e.target.value !== '' ? Number(e.target.value) : null,
                                    { va: n.va, non_evalue: n.non_evalue })}
                                  className="w-14 border border-slate-200 rounded-lg px-1.5 py-0.5 text-[11px] text-right disabled:bg-slate-100" />
                                <label className="flex items-center gap-1 text-[10px] text-slate-500 flex-none"
                                  title="Dispensé : cet acquis sort du calcul, sans pénaliser l\u2019étudiant">
                                  <input type="checkbox" checked={!!n.non_evalue}
                                    onChange={e => ecrireDetail(co.cours_code, aa.aa_code,
                                      n.points ?? null, { va: n.va, non_evalue: e.target.checked })} />
                                  disp.
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}

                  {!(detail.structure || []).length && (
                    <div className="text-[11.5px] text-slate-400 text-center py-2">
                      Aucun cours au référentiel pour cette UE.
                    </div>
                  )}
                </div>

                <p className="text-[10px] text-slate-400 mt-2">
                  Chaque acquis pèse par sa pondération dans son cours et par les périodes de ce
                  cours. Un acquis dispensé sort du calcul sans compter comme un zéro.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const TYPES_VA = [
  { val: 'complete',  label: 'Dispense complète (UE)' },
  { val: 'partielle', label: 'Dispense partielle (AA ou cours)' },
  { val: 'admission', label: 'Admission (capacités préalables)' },
];

function Valorisations({ etudId, annee }) {
  const [valos, setValos] = useState(null);
  const [form, setForm] = useState(null);
  const [composantes, setComposantes] = useState(null);
  const [estAdmin] = useState(() => {
    try { return JSON.parse(atob((localStorage.getItem('token')||'').split('.')[1]||''))?.role === 'admin'; }
    catch { return false; }
  });

  async function charger() {
    const rep = await fetch(`/api/etudiants/${etudId}/valorisations`, { headers: authHeaders() });
    if (rep.ok) setValos(await rep.json());
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [etudId]);

  async function chargerComposantes(ueNum) {
    if (!ueNum) { setComposantes(null); return; }
    const rep = await fetch(`/api/etudiants/ue/${ueNum}/composantes?annee=${annee}`, { headers: authHeaders() });
    if (rep.ok) setComposantes(await rep.json());
  }

  async function sauver() {
    const rep = await fetch(`/api/etudiants/${etudId}/valorisations`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ ...form, annee_scolaire: annee }),
    });
    const j = await rep.json();
    if (!rep.ok) { alert(j.error || 'Erreur'); return; }
    setForm(null); setComposantes(null); await charger();
  }

  async function supprimer(vid) {
    if (!confirm('Supprimer cette valorisation ?')) return;
    await fetch(`/api/etudiants/valorisations/${vid}`, { method: 'DELETE', headers: authHeaders() });
    await charger();
  }

  if (!valos) return <div className="py-6 text-sm text-slate-400">Chargement…</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] text-slate-500">
          Valorisation des acquis — AGCF du 13-12-2024 · décisions du Conseil des études
        </p>
        <button onClick={() => setForm({ type: 'complete', ue_num: '', pourcentage: 50, cible: 'cours', cible_detail: '' })}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 rounded-lg">
          <IconPlus size={14} /> Ajouter une VA
        </button>
      </div>

      {form && (
        <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 space-y-3 mb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="text-xs col-span-2"><span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Type</span>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                {TYPES_VA.map(t => <option key={t.val} value={t.val}>{t.label}</option>)}
              </select></label>
            <label className="text-xs"><span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">N° UE</span>
              <input type="number" value={form.ue_num}
                onChange={e => { setForm(f => ({ ...f, ue_num: e.target.value })); }}
                onBlur={e => form.type === 'partielle' && chargerComposantes(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" /></label>
            {form.type !== 'admission' && (
              <label className="text-xs"><span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">%</span>
                <input type="number" min="0" max="100" value={form.pourcentage}
                  onChange={e => setForm(f => ({ ...f, pourcentage: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" /></label>
            )}
          </div>

          {form.type === 'partielle' && (
            <div className="space-y-2">
              <div className="flex gap-3">
                {['cours','aa'].map(cb => (
                  <label key={cb} className="flex items-center gap-1.5 text-sm">
                    <input type="radio" checked={form.cible === cb}
                      onChange={() => { setForm(f => ({ ...f, cible: cb, cible_detail: '' })); chargerComposantes(form.ue_num); }} />
                    {cb === 'cours' ? 'Par cours' : "Par acquis d'apprentissage"}
                  </label>
                ))}
              </div>
              {composantes && (
                <div className="flex flex-wrap gap-1.5">
                  {(form.cible === 'cours' ? composantes.cours : composantes.aas).map(item => {
                    const code = form.cible === 'cours' ? item.cours_code : item.aa_code;
                    const libelle = form.cible === 'cours' ? item.cours_nom : (item.description || item.aa_code);
                    const sel = (form.cible_detail || '').split(',').filter(Boolean);
                    const actif = sel.includes(code);
                    return (
                      <button key={code} type="button"
                        onClick={() => {
                          const next = actif ? sel.filter(s => s !== code) : [...sel, code];
                          setForm(f => ({ ...f, cible_detail: next.join(',') }));
                        }}
                        className={`text-[11px] px-2 py-1 rounded-lg border ${actif
                          ? 'bg-iip-blue text-white border-iip-blue'
                          : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                        title={libelle}>
                        {code}
                      </button>
                    );
                  })}
                  {!((form.cible === 'cours' ? composantes.cours : composantes.aas).length) && (
                    <span className="text-[11px] text-slate-400">Aucune composante trouvée pour cette UE</span>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs"><span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Date décision CE</span>
              <input type="date" value={form.decision_ce_date || ''}
                onChange={e => setForm(f => ({ ...f, decision_ce_date: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" /></label>
            <label className="text-xs"><span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Commentaire</span>
              <input value={form.commentaire || ''}
                onChange={e => setForm(f => ({ ...f, commentaire: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" /></label>
          </div>

          <div className="flex gap-2">
            <button onClick={sauver} disabled={!form.ue_num || (form.type === 'partielle' && !form.cible_detail)}
              className="text-sm px-3 py-1.5 rounded-lg bg-iip-blue text-white font-semibold disabled:opacity-40">
              Enregistrer
            </button>
            <button onClick={() => { setForm(null); setComposantes(null); }}
              className="text-sm px-3 py-1.5 rounded-lg border border-slate-300">Annuler</button>
          </div>
        </div>
      )}

      {!valos.length ? (
        <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed rounded-xl">
          Aucune valorisation enregistrée
        </div>
      ) : (
        <div className="space-y-2">
          {valos.map(v => (
            <div key={v.id} className="flex items-center justify-between gap-3 border border-slate-200 rounded-xl px-4 py-2.5">
              <div>
                <span className="font-medium text-iip-blue">{v.ue_num}</span>
                <span className="text-slate-600 ml-1.5 text-[12.5px]">{v.ue_nom}</span>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {TYPES_VA.find(t => t.val === v.type)?.label}
                  {v.cible ? ` · ${v.cible === 'cours' ? 'cours' : 'AA'} : ${v.cible_detail}` : ''}
                  {v.pourcentage != null ? ` · ${v.pourcentage} %` : ''}
                  {v.decision_ce_date ? ` · CE du ${v.decision_ce_date}` : ''}
                </div>
              </div>
              {estAdmin && (
                <button onClick={() => supprimer(v.id)} className="text-slate-300 hover:text-red-500 flex-none">
                  <IconTrash size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="text-[10.5px] text-slate-400 mt-3">
        Dispense complète : l'UE est acquise, l'apprenant n'est pas comptabilisé comme régulier pour cette UE (art. 4).
        Dispense partielle : dispense d'activités d'enseignement, l'apprenant reste comptabilisé (art. 3).
        Interdite pour les épreuves intégrées.
      </p>
    </div>
  );
}

function DossierApprenant({ etudId }) {
  const [pieces, setPieces] = useState(null);

  async function charger() {
    const rep = await fetch(`/api/etudiants/${etudId}/pieces`, { headers: authHeaders() });
    if (rep.ok) setPieces(await rep.json());
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [etudId]);

  async function setStatut(type, statut) {
    await fetch(`/api/etudiants/${etudId}/pieces/${type}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify({ statut }),
    });
    await charger();
  }

  if (!pieces) return <div className="py-6 text-sm text-slate-400">Chargement…</div>;
  const recues = pieces.filter(p => p.statut !== 'manquant').length;

  return (
    <div>
      <p className="text-[12px] text-slate-500 mb-3">
        Dossier individuel de l'apprenant — {recues}/{pieces.length} pièces traitées
        <span className="text-slate-400"> · circulaire n° 9764 du 13/07/2026</span>
      </p>
      <div className="space-y-2">
        {pieces.map(p => (
          <div key={p.type} className="flex items-center justify-between gap-3 border border-slate-200 rounded-xl px-4 py-2.5">
            <div className="text-[13px] text-slate-700">{p.libelle}</div>
            <div className="flex gap-1 flex-none">
              {STATUTS_PIECE.map(s => (
                <button key={s.val} onClick={() => setStatut(p.type, s.val)}
                  className={`text-[11px] px-2 py-1 rounded-lg border transition ${
                    p.statut === s.val ? s.cls + ' font-semibold' : 'border-transparent text-slate-400 hover:bg-slate-50'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


// ── Fiche étudiant + PAE ──────────────────────────────────────────────────────
function FicheEtudiant({ id, annee, onClose }) {
  const [data, setData] = useState(null);
  const [pae, setPae] = useState(null);
  const [onglet, setOnglet] = useState('grille');
  const [ficheInscription, setFicheInscription] = useState(null);
  const [selection, setSelection] = useState(null);      // Set des ue_num retenues
  const [catalogueOuvert, setCatalogueOuvert] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [sectionForcee, setSectionForcee] = useState('');

  async function paeAuto() {
    if (!window.confirm('Inscrire automatiquement cet étudiant à toutes les UE accessibles en ' + annee + ' (y compris les inscriptions sous réserve) ?')) return;
    const rep = await fetch(`/api/etudiants/${id}/pae-auto`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ annee }),
    });
    const j = await rep.json();
    if (!rep.ok) { alert(j.error || 'Erreur'); return; }
    const nbSR = Object.keys(j.sous_reserve || {}).length;
    alert(`${j.creees} inscription(s) créée(s) — ${j.inscrites.length} UE au PAE ${annee}` +
      (nbSR ? `\ndont ${nbSR} sous réserve : UE ${Object.keys(j.sous_reserve).join(', ')}` : ''));
    await chargerPAE(); await charger();
  }

  function basculerUE(u) {
    setSelection(prev => {
      const s = new Set(prev);
      if (s.has(u.ue_num)) { s.delete(u.ue_num); return s; }
      // Ajout d'une UE hors proposition dont les prérequis ne sont pas acquis
      if (!u.propose && !u.accessible && !u.reinscriptible_ce) {
        const chaine = u.prereq_chaine?.length ? u.prereq_chaine : (u.prereq_manquants || []);
        const msg = chaine.length
          ? `Cette UE exige la réussite de : UE ${chaine.join(', ')}.\n\n`
            + `L'exigence est transitive — une UE prérequise a elle-même ses propres prérequis.\n\n`
            + `Ajouter quand même ? La dérogation sera tracée.`
          : 'Ajouter cette UE au PAE ?';
        if (!window.confirm(msg)) return s;
      }
      s.add(u.ue_num);
      return s;
    });
  }

  async function enregistrerPAE() {
    if (!selection) return;
    setEnregistrement(true);
    try {
      const ue_nums = [...selection];
      const derogations = pae.pae
        .filter(u => selection.has(u.ue_num) && !u.propose && !u.accessible && !u.reinscriptible_ce)
        .map(u => u.ue_num);
      const rep = await fetch(`/api/etudiants/${id}/pae-valider`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, ue_nums, derogations }),
      });
      const j = await rep.json();
      if (!rep.ok) { alert(j.error || 'Erreur'); return; }

      // Les inscriptions portant un résultat ne sont jamais retirées d'office
      if (j.conservees) {
        const forcer = window.confirm(
          `${j.conservees} inscription(s) décochée(s) portent un résultat encodé et ont été conservées.\n\n` +
          `Les supprimer quand même, avec leurs notes ?`);
        if (forcer) {
          const rep2 = await fetch(`/api/etudiants/${id}/pae-valider`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ annee, ue_nums, derogations, forcer: true }),
          });
          const j2 = await rep2.json();
          if (rep2.ok) {
            alert(`PAE enregistré — ${j2.total} UE inscrites\n${j2.retirees} retirée(s)`);
            await chargerPAE(); await charger();
            return;
          }
        }
      }

      alert(`PAE enregistré — ${j.total} UE inscrites` +
        (j.ajoutees ? `\n${j.ajoutees} ajoutée(s)` : '') +
        (j.retirees ? `\n${j.retirees} retirée(s)` : '') +
        (j.conservees ? `\n${j.conservees} conservée(s) car elles portent un résultat` : ''));
      await chargerPAE(); await charger();
    } finally { setEnregistrement(false); }
  }

  async function ouvrirFicheInscription() {
    const rep = await fetch(`/api/etudiants/${id}/fiche-inscription?annee=${annee}`, { headers: authHeaders() });
    const j = await rep.json();
    if (rep.ok) setFicheInscription(j);
    else alert(j.error || 'Erreur');
  }
  const anneePrecedente = useMemo(() => {
    if (!annee) return null;
    const [a1, a2] = annee.split('-').map(Number);
    return `${a1-1}-${a2-1}`;
  }, [annee]);

  async function charger() {
    const rep = await fetch(`/api/etudiants/${id}`, { headers: authHeaders() });
    if (rep.ok) setData(await rep.json());
  }
  async function chargerPAE() {
    try {
      const rep = await fetch(
        `/api/etudiants/${id}/pae?annee=${annee}&annee_precedente=${anneePrecedente}` +
        (sectionForcee ? `&section=${encodeURIComponent(sectionForcee)}` : ''),
        { headers: authHeaders() });
      const j = await rep.json();
      if (rep.ok) {
        setPae(j);
        // Une inscription existante n'est reconduite que si elle TIENT :
        // ni déjà acquise, ni bloquée par des prérequis manquants. Sans quoi
        // un programme calculé par erreur se perpétuerait d'année en année.
        setSelection(new Set(j.pae.filter(u =>
          !u.deja_reussie && (u.propose || (u.inscrite && (u.accessible || u.sous_reserve)))
        ).map(u => u.ue_num)));
      }
      else setPae({ erreur: j.error || 'Erreur serveur' });
    } catch(e) { setPae({ erreur: e.message }); }
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [id]);
  useEffect(() => { if (onglet === 'pae') chargerPAE(); /* eslint-disable-next-line */ }, [sectionForcee]);



  if (!data) return <div className="p-6 text-slate-400 text-sm">Chargement…</div>;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1400px] mt-8">
        {/* En-tête */}
        <div className="bg-iip-blue rounded-t-2xl px-6 py-5 flex items-start justify-between">
          <div>
            <div className="text-white font-bold text-xl">{data.nom} {data.prenom}</div>
            <div className="text-blue-200 text-sm mt-0.5 flex items-center gap-2">
              <span>{data.email_ecole} · {data.id_ecampus}</span>
              {data.niveau?.libelle && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/15 text-white">
                  {data.niveau.libelle}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-blue-200 hover:text-white">
            <IconX size={22} />
          </button>
        </div>

        {/* Onglets */}
        <div className="flex border-b border-slate-200 px-6">
          {[['grille', `Grille de parcours (${data.inscriptions?.length || 0})`],
            ['pae', `PAE ${annee}`],
            ['va', 'Valorisation'],
            ['di', "Droit d'inscription"],
            ['dossier', 'Dossier']].map(([k, l]) => (
            <button key={k} onClick={() => { setOnglet(k); if (k==='pae' && !pae) chargerPAE(); }}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px ${onglet===k
                ? 'border-iip-turquoise text-iip-blue font-semibold'
                : 'border-transparent text-slate-500'}`}>
              {l}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* Inscriptions + résultats */}
          {onglet === 'grille' && <GrilleParcours etudId={id} peutEcrire={true} />}

          {onglet === 'va' && <Valorisations etudId={id} annee={annee} />}

          {onglet === 'di' && <DroitInscription etudId={id} annee={annee} />}

          {onglet === 'dossier' && <DossierApprenant etudId={id} />}

          {onglet === 'pae' && (
            <div>
              {!pae ? (
                <div className="text-center py-8 text-slate-400 text-sm">Chargement du PAE…</div>
              ) : pae.erreur ? (
                <div className="text-center py-8 text-red-600 text-sm border border-red-200 bg-red-50 rounded-xl">{pae.erreur}</div>
              ) : (() => {
                const sel = selection || new Set();
                const retenues = pae.pae.filter(u => sel.has(u.ue_num));
                const acquises = pae.pae.filter(u => !sel.has(u.ue_num) && u.deja_reussie);
                const autres   = pae.pae.filter(u => !sel.has(u.ue_num) && !u.deja_reussie);
                // Inscriptions résiduelles sur des UE déjà acquises : vestiges
                // d'un PAE calculé avant l'encodage des résultats.
                const residuelles = acquises.filter(u => u.inscrite);
                // Inscriptions maintenues alors que la chaîne des prérequis
                // n'est pas satisfaite : elles ne sont pas reconduites.
                const bloquees = pae.pae.filter(u =>
                  u.inscrite && !u.deja_reussie && !u.accessible && !u.sous_reserve);
                const ligneStatut = u =>
                  u.reinscriptible_ce
                    ? <span className="text-[11px] text-amber-700 flex items-center gap-1"><IconAlertTriangle size={12} />
                        {u.va_complete ? 'Dispensée (VA complète)' : 'Réinscription — décision du Conseil des études'}</span>
                    : u.accessible
                      ? <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1"><IconCheck size={12} /> Accessible</span>
                      : u.sous_reserve || u.propose_sous_reserve
                        ? <span className="text-[11px] text-sky-700 flex items-center gap-1"><IconClock size={12} /> Sous réserve — réussite UE {(u.prereq_manquants || []).join(', ')}</span>
                        : u.avertissements?.length
                          ? <span className="text-[11px] text-amber-700 flex items-center gap-1"
                              title={u.avertissements.map(a => `UE ${a.ue_num}${a.motif ? ' — ' + a.motif : ''}`).join('\n')}>
                              <IconAlertTriangle size={12} />
                              Recommandé après {u.avertissements.map(a => a.ue_num).join(', ')}
                            </span>
                        : u.epreuve_integree
                          ? <span className="text-[11px] text-red-600 flex items-center gap-1"
                              title={'Restent à acquérir : UE ' + (u.epreuve_restantes || []).join(', ')}>
                              <IconAlertTriangle size={12} /> Épreuve intégrée — {(u.epreuve_restantes || []).length} UE des années antérieures non acquise(s)
                            </span>
                          : <span className="text-[11px] text-red-600 flex items-center gap-1"
                              title={u.prereq_chaine?.length ? 'Chaîne complète : UE ' + u.prereq_chaine.join(', ') : ''}>
                              <IconAlertTriangle size={12} /> Exige {(u.prereq_chaine || u.prereq_manquants || []).join(', ')}
                            </span>;

                return (
                <>
                  <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
                    <div>
                      <div className="font-semibold text-iip-blue">Plan Annuel de l'Étudiant — {pae.annee}</div>
                      <div className="text-[12px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>{retenues.length} UE retenue(s) · section {(pae.sections || []).join(', ') || '—'}</span>
                        {pae.niveau?.libelle && (
                          <BadgeNiveau niveau={pae.niveau.niveau} libelle={pae.niveau.libelle} />
                        )}
                        {(pae.sections_scores || []).length > 1 && (
                          <select value={sectionForcee} onChange={e => setSectionForcee(e.target.value)}
                            className="border border-slate-300 rounded-lg px-1.5 py-0.5 text-[11.5px]">
                            <option value="">Section détectée</option>
                            {pae.sections_scores.map(s => (
                              <option key={s.section} value={s.section}>{s.section} ({s.n} UE)</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={enregistrerPAE} disabled={enregistrement}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-iip-turquoise text-white font-semibold rounded-lg disabled:opacity-50">
                        <IconCheck size={14} /> {enregistrement ? 'Enregistrement…' : 'Enregistrer le PAE'}
                      </button>
                      <button onClick={ouvrirFicheInscription}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-iip-blue text-white font-semibold rounded-lg">
                        <IconFileText size={14} /> Fiche d'inscription / reçu
                      </button>
                    </div>
                  </div>

                  {bloquees.length > 0 && (
                    <div className="mb-3 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
                      <div className="flex items-start gap-2">
                        <IconAlertTriangle size={15} className="text-red-600 mt-0.5 flex-none" />
                        <div className="flex-1 text-[12px] text-red-900">
                          <b>{bloquees.length} inscription(s) impossible(s)</b> en {pae.annee} :
                          les prérequis ne sont pas acquis. Elles ne sont pas reconduites ;
                          enregistrer le PAE les retirera.
                          <ul className="mt-1 space-y-0.5 text-[11px] text-red-800">
                            {bloquees.slice(0, 8).map(u => (
                              <li key={u.ue_num}>
                                UE {u.ue_num} — exige {(u.prereq_chaine || u.prereq_manquants || []).join(', ') || '—'}
                              </li>
                            ))}
                            {bloquees.length > 8 && <li>… et {bloquees.length - 8} autre(s)</li>}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  {residuelles.length > 0 && (
                    <div className="mb-3 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
                      <div className="flex items-start gap-2">
                        <IconAlertTriangle size={15} className="text-amber-600 mt-0.5 flex-none" />
                        <div className="flex-1 text-[12px] text-amber-900">
                          <b>{residuelles.length} UE déjà réussie(s)</b> portent encore une inscription
                          en {pae.annee} — vestige d'un programme calculé avant l'encodage des résultats.
                          Elles ne sont plus proposées ; enregistrer le PAE les retirera.
                          <div className="text-[11px] text-amber-700 mt-0.5">
                            UE {residuelles.map(u => u.ue_num).join(', ')}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <SchemaCapitalisation etudId={id} annee={pae.annee} />

                  {!retenues.length ? (
                    <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed rounded-xl">
                      Aucune UE retenue — utilisez « Ajouter une UE » ci-dessous.
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[10.5px] uppercase tracking-wide text-slate-400 border-b">
                          <th className="py-2 w-8"></th>
                          <th className="py-2 text-left">UE proposée</th>
                          <th className="py-2 text-left w-20">Niv.</th>
                          <th className="py-2 text-left w-64">Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {retenues.map(u => (
                          <tr key={u.ue_num} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                            <td className="py-2">
                              <input type="checkbox" checked readOnly
                                onClick={() => basculerUE(u)}
                                className="cursor-pointer accent-[#00AACC]" />
                            </td>
                            <td className="py-2">
                              <span className="font-medium text-iip-blue">{u.ue_num}</span>
                              <span className="text-slate-600 ml-1.5 text-[12.5px]">{u.ue_nom}</span>
                              {u.inscrite && <span className="ml-1.5 text-[9.5px] px-1 py-0.5 rounded bg-slate-100 text-slate-500">déjà inscrite</span>}
                            </td>
                            <td className="py-2">
                              <BadgeUeNiveau niveau={u.ue_niv} />
                            </td>
                            <td className="py-2">{ligneStatut(u)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {acquises.length > 0 && (
                    <details className="mt-4 border border-emerald-200 bg-emerald-50/40 rounded-xl">
                      <summary className="px-3 py-2 text-[12.5px] font-semibold text-emerald-900 cursor-pointer">
                        {acquises.length} UE déjà acquise(s)
                        <span className="font-normal text-emerald-700"> — hors programme</span>
                      </summary>
                      <div className="px-3 pb-2.5">
                        <p className="text-[11px] text-emerald-800 mb-1.5">
                          Réussies ou valorisées lors d'une année antérieure. Une réinscription
                          reste possible, mais suppose une décision favorable du Conseil des études.
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {acquises.map(u => (
                            <button key={u.ue_num} onClick={() => basculerUE(u)}
                              title={`${u.ue_nom || ''} — cliquer pour réinscrire`}
                              className="text-[11px] px-2 py-0.5 rounded-lg border border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100">
                              {u.ue_num}
                              {u.va_complete ? ' · VA' : ''}
                            </button>
                          ))}
                        </div>
                      </div>
                    </details>
                  )}

                  <button onClick={() => setCatalogueOuvert(o => !o)}
                    className="mt-4 flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">
                    <IconPlus size={14} /> {catalogueOuvert ? 'Masquer les autres UE' : `Ajouter une UE (${autres.length} disponibles)`}
                  </button>

                  {catalogueOuvert && (
                    <div className="mt-3 border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                      <p className="text-[11px] text-slate-500 mb-2">
                        UE organisées en {pae.annee} dans la ou les sections de l'étudiant, hors proposition.
                        Ajouter une UE dont les prérequis ne sont pas acquis demande une confirmation — la dérogation est tracée.
                      </p>
                      {!autres.length ? (
                        <div className="text-[12px] text-slate-400 py-2 text-center">Toutes les UE organisées sont déjà retenues.</div>
                      ) : (
                        <table className="w-full text-sm">
                          <tbody>
                            {autres.map(u => (
                              <tr key={u.ue_num} className="border-b border-slate-100 last:border-0">
                                <td className="py-1.5 w-8">
                                  <input type="checkbox" checked={false} readOnly
                                    onClick={() => basculerUE(u)}
                                    className="cursor-pointer accent-[#00AACC]" />
                                </td>
                                <td className="py-1.5">
                                  <span className="font-medium text-iip-blue">{u.ue_num}</span>
                                  <span className="text-slate-600 ml-1.5 text-[12.5px]">{u.ue_nom}</span>
                                </td>
                                <td className="py-1.5 w-16">
                                  <BadgeUeNiveau niveau={u.ue_niv} />
                                </td>
                                <td className="py-1.5 w-64">{ligneStatut(u)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  <p className="text-[11px] text-slate-400 mt-4 border-t pt-3">
                    Le PAE est établi en accord avec l'étudiant et validé par la direction.
                    « Enregistrer le PAE » inscrit les UE cochées ; décocher retire une inscription
                    uniquement si aucun résultat n'y est encodé.
                  </p>
                </>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {ficheInscription && <PreviewModal html={ficheInscription.html} titre="Fiche d'inscription / reçu"
        nomFichier={ficheInscription.nom} astuceImpression="Portrait A4"
        onClose={() => setFicheInscription(null)} />}
    </div>
  );
}

// ── Page principale Étudiants ─────────────────────────────────────────────────
export default function Etudiants() {
  const annee = getAnnee();
  const [etudiants, setEtudiants] = useState([]);
  const [recherche, setRecherche] = useState('');
  const [section, setSection] = useState('');
  const [sections, setSections] = useState([]);
  const [selId, setSelId] = useState(null);
  const [chargement, setChargement] = useState(false);
  const [importing, setImporting] = useState(false);
  const [msgImport, setMsgImport] = useState(null);
  const [rapport, setRapport] = useState(null);
  const [importPAE, setImportPAE] = useState(false);
  const [purge, setPurge] = useState(false);
  const [rapportPAE, setRapportPAE] = useState(false);
  const [importListe, setImportListe] = useState(false);
  const [importHisto, setImportHisto] = useState(false);
  const [tri, setTri] = useState({ champ: 'nom', sens: 1 });

  function trierPar(champ) {
    setTri(t => t.champ === champ ? { champ, sens: -t.sens } : { champ, sens: 1 });
  }

  async function ouvrirRapport() {
    if (!section) { alert('Choisissez d\'abord une section dans le filtre.'); return; }
    const [a1, a2] = (annee || '').split('-').map(Number);
    const anneeRapport = window.prompt('Année académique du rapport ?', (a1-1) + '-' + (a2-1));
    if (!anneeRapport || !/^20\d{2}-20\d{2}$/.test(anneeRapport.trim())) {
      if (anneeRapport !== null) alert('Format attendu : 2025-2026');
      return;
    }
    const rep = await fetch(`/api/etudiants/rapport?section=${encodeURIComponent(section)}&annee=${anneeRapport.trim()}`,
      { headers: authHeaders() });
    const j = await rep.json();
    if (rep.ok) setRapport(j);
    else alert(j.error || 'Erreur');
  }

  async function importerResultats(fichier) {
    if (!fichier || !annee) return;
    const [a1, a2] = annee.split('-').map(Number);
    const anneeImport = window.prompt(
      'Année scolaire des résultats de ce classeur ?', (a1-1) + '-' + (a2-1));
    if (!anneeImport || !/^20\d{2}-20\d{2}$/.test(anneeImport.trim())) {
      if (anneeImport !== null) alert('Format attendu : 2025-2026');
      return;
    }
    setImporting(true); setMsgImport(null);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await fichier.arrayBuffer(), { type: 'array' });

      const resultats = [];
      let ongletsLus = 0;
      for (const nom of wb.SheetNames) {
        if (!/^\d+$/.test(nom.trim())) continue;   // seuls les onglets numériques = ue_num
        const ueNum = Number(nom.trim());
        const M = XLSX.utils.sheet_to_json(wb.Sheets[nom], { header: 1, defval: null });
        if (M.length < 13) continue;

        // Ligne 8 (index 7) : libellés Note.s1 / Décision.s1 / Note.s2 / Décision.s2
        const l8 = M[7] || [];
        const iNs1 = l8.findIndex(v => v === 'Note.s1');
        const iDs1 = l8.findIndex(v => v === 'Décision.s1');
        const iNs2 = l8.findIndex(v => v === 'Note.s2');
        const iDs2 = l8.findIndex(v => v === 'Décision.s2');
        // Ligne 12 (index 11) : Matricule
        const l12 = M[11] || [];
        const iMat = l12.findIndex(v => v === 'Matricule');
        if (iMat < 0 || (iDs2 < 0 && iDs1 < 0)) continue;
        ongletsLus++;

        for (let li = 12; li < M.length; li++) {
          const row = M[li] || [];
          const mat = row[iMat];
          if (!mat) continue;
          const ds2 = iDs2 >= 0 ? row[iDs2] : null;
          const ds1 = iDs1 >= 0 ? row[iDs1] : null;
          const dec = (ds2 || ds1 || '').toString().trim().toUpperCase();
          let noteBrute = iNs2 >= 0 && row[iNs2] != null && !isNaN(Number(row[iNs2]))
            ? Number(row[iNs2])
            : (iNs1 >= 0 && row[iNs1] != null && !isNaN(Number(row[iNs1])) ? Number(row[iNs1]) : null);
          // Les notes du classeur sont sur 20 — l'échelle retenue dans Lucie.
          // Une valeur au-delà de 20 est un pourcentage : on la ramène sur 20.
          const points = noteBrute == null ? null
            : Math.round((noteBrute <= 20 ? noteBrute : noteBrute / 5) * 10) / 10;
          const resultat = dec === 'C' ? 'reussi' : (dec === 'R' || dec === 'AJ') ? 'ajourne' : null;
          resultats.push({ id_ecampus: String(mat).trim(), ue_num: ueNum, resultat, points });
        }
      }

      if (!resultats.length) throw new Error('Aucun résultat lisible — vérifiez que le classeur contient des onglets par UE (65, 66…)');

      const rep = await fetch('/api/etudiants/import-resultats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ annee: anneeImport.trim(), resultats }),
      });
      const j = await rep.json();
      if (rep.ok) {
        setMsgImport({ type: 'ok', texte: `${ongletsLus} UE lues · ${j.maj} résultats importés pour ${anneeImport.trim()}` +
          (j.inconnus?.length ? ` · matricules inconnus : ${j.inconnus.join(', ')}` : '') });
        await charger();
      } else setMsgImport({ type: 'err', texte: j.error || 'Erreur' });
    } catch(e) { setMsgImport({ type: 'err', texte: e.message }); }
    finally { setImporting(false); }
  }

  async function importerExcel(fichier) {
    if (!fichier || !annee) return;
    // Détecter l'année depuis le nom du fichier (ex. "20252026" → 2025-2026),
    // sinon proposer l'année précédant l'année active (le listing est celui de l'année écoulée)
    const m = fichier.name.match(/(20\d{2})[-_]?(20\d{2})/);
    let anneeDetectee;
    if (m) anneeDetectee = m[1] + '-' + m[2];
    else {
      const [a1, a2] = annee.split('-').map(Number);
      anneeDetectee = (a1-1) + '-' + (a2-1);
    }
    const anneeImport = window.prompt(
      'Année scolaire des inscriptions de ce fichier ?', anneeDetectee);
    if (!anneeImport || !/^20\d{2}-20\d{2}$/.test(anneeImport.trim())) {
      if (anneeImport !== null) alert('Format attendu : 2025-2026');
      return;
    }
    setImporting(true); setMsgImport(null);
    try {
      // Lecture côté client avec SheetJS — gère .xls et .xlsx
      const XLSX = await import('xlsx');
      const buffer = await fichier.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });

      // 3e onglet ou celui qui contient 'Inscription'
      const wsName = wb.SheetNames[2] ||
                     wb.SheetNames.find(n => n.includes('Inscription')) ||
                     wb.SheetNames[0];
      if (!wsName) throw new Error('Onglet introuvable dans le fichier');
      const ws = wb.Sheets[wsName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (!rows.length) throw new Error('Le fichier semble vide');
      if (!('Id_Etud' in rows[0]) || !('Code_UE' in rows[0])) {
        throw new Error('Colonnes Id_Etud ou Code_UE introuvables — vérifiez que c\'est le bon fichier eCampus');
      }

      // Dédupliquer les étudiants
      const etudiants = [];
      const vus = new Set();
      for (const r of rows) {
        if (vus.has(r.Id_Etud)) continue;
        vus.add(r.Id_Etud);
        etudiants.push({
          id_ecampus: String(r.Id_Etud||'').trim(),
          nom: String(r.NomEtud||'').trim(),
          prenom: String(r['PréEtud']||'').trim(),
          email_ecole: String(r.EmailEcole||'').trim(),
          email_perso: String(r['Email Perso']||'').trim(),
          date_naissance: String(r.StrDatNais||'').trim(),
          num_national: String(r['N°National']||'').trim(),
          gsm: String(r.GSMEtud||'').trim(),
          adresse: String(r['AdrN°Bte']||'').trim(),
          localite: String(r['Localité']||'').trim(),
          cp: String(r.CP||'').trim(),
          titre: String(r.TitreMrMme||'').trim(),
        });
      }

      const inscriptions = rows
        .filter(r => r.Id_Etud && r.Code_UE && !isNaN(Number(r.Code_UE)))
        .map(r => ({ id_ecampus: String(r.Id_Etud).trim(), ue_num: Number(r.Code_UE), groupe: String(r.COG||'').trim() }));

      // Envoyer au backend
      const rep = await fetch('/api/etudiants/import-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ annee: anneeImport.trim(), etudiants, inscriptions }),
      });
      const j = await rep.json();
      if (rep.ok) {
        setMsgImport({ type: 'ok', texte: `${j.etudiants} étudiants · ${j.inscriptions_creees} inscriptions importées pour ${j.annee}` });
        await charger();
      } else {
        setMsgImport({ type: 'err', texte: j.error || 'Erreur' });
      }
    } catch(e) { setMsgImport({ type: 'err', texte: e.message }); }
    finally { setImporting(false); }
  }

  async function charger() {
    if (!annee) return;
    setChargement(true);
    try {
      const params = new URLSearchParams();
      if (section) params.set('section', section);
      if (recherche) params.set('q', recherche);
      const rep = await fetch(`/api/etudiants?${params}`, { headers: authHeaders() });
      const j = await rep.json();
      if (rep.ok) setEtudiants(Array.isArray(j) ? j : []);
    } finally { setChargement(false); }
  }

  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() })
      .then(r => r.json()).then(l => { if (Array.isArray(l)) setSections(l); }).catch(() => {});
  }, []);

  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [annee, section]);

  const filtres = useMemo(() => {
    const q = recherche.toLowerCase();
    const base = recherche
      ? etudiants.filter(e =>
          e.nom?.toLowerCase().includes(q) || e.prenom?.toLowerCase().includes(q) ||
          e.id_ecampus?.toLowerCase().includes(q))
      : [...etudiants];

    // Tri par colonne. Les valeurs absentes se rangent toujours en fin de
    // liste, quel que soit le sens : elles n'apprennent rien.
    const cle = {
      nom:     e => `${e.nom || ''} ${e.prenom || ''}`.trim().toLowerCase(),
      email:   e => (e.email_ecole || '').toLowerCase(),
      section: e => (e.sections || '').toLowerCase(),
      niveau:  e => ({ BA1: 1, BA2: 2, BA3: 3, MIXTE: 4 }[e.niveau] ?? 9),
      nb_ue:   e => Number(e.nb_ue || 0),
    }[tri.champ] || (e => e.nom || '');

    return base.sort((a, b) => {
      const va = cle(a), vb = cle(b);
      const va_vide = va === '' || va == null, vb_vide = vb === '' || vb == null;
      if (va_vide !== vb_vide) return va_vide ? 1 : -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * tri.sens;
      return String(va).localeCompare(String(vb), 'fr') * tri.sens;
    });
  }, [etudiants, recherche, tri]);

  return (
    <div className="p-5 space-y-4 max-w-none">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-iip-blue">Étudiants</h2>
          <p className="text-sm text-slate-500">{filtres.length} étudiant(s)</p>
        </div>
      </div>

      {msgImport && (
        <div className={`px-4 py-2.5 rounded-lg text-sm flex items-center justify-between ${msgImport.type==='ok'
          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          : 'bg-red-50 text-red-800 border border-red-200'}`}>
          <span>{msgImport.texte}</span>
          <button onClick={() => setMsgImport(null)} className="ml-3 opacity-60">✕</button>
        </div>
      )}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={recherche} onChange={e => setRecherche(e.target.value)}
            placeholder="Nom, prénom ou identifiant…"
            className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm" />
        </div>
        <label className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg cursor-pointer
          ${importing ? 'opacity-50 pointer-events-none' : 'border-iip-turquoise text-iip-turquoise hover:bg-iip-turquoise/5'}`}>
          <IconUpload size={15} />
          {importing ? 'Import en cours…' : 'Importer depuis eCampus (.xls)'}
          <input type="file" accept=".xls,.xlsx" className="hidden"
            onChange={e => e.target.files[0] && importerExcel(e.target.files[0])} />
        </label>
        <label className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg cursor-pointer
          ${importing ? 'opacity-50 pointer-events-none' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
          <IconUpload size={15} />
          Importer les résultats (.xlsm)
          <input type="file" accept=".xlsm,.xlsx" className="hidden"
            onChange={e => e.target.files[0] && importerResultats(e.target.files[0])} />
        </label>
        <button onClick={() => setImportHisto(true)}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-iip-blue text-iip-blue rounded-lg hover:bg-iip-blue/5">
          <IconUpload size={15} /> Reconstruire l'historique
        </button>
        <button onClick={() => setImportListe(true)}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-iip-turquoise text-iip-turquoise rounded-lg hover:bg-iip-turquoise/5">
          <IconUpload size={15} /> Importer une liste eCampus
        </button>
        <button onClick={() => setImportPAE(true)}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-iip-blue text-iip-blue rounded-lg hover:bg-iip-blue/5">
          <IconUpload size={15} /> Importer le classeur PAE
        </button>
        <button onClick={ouvrirRapport}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">
          <IconPrinter size={15} /> Rapport
        </button>
        <button onClick={() => setRapportPAE(true)}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">
          <IconTable size={15} /> Rapport PAE
        </button>
        <button onClick={() => setPurge(true)}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
          <IconTrash size={15} /> Vider des résultats
        </button>
        <select value={section} onChange={e => setSection(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
          <option value="">Toutes les sections</option>
          {sections.map(s => <option key={s.code} value={s.code}>{s.libelle}</option>)}
        </select>
      </div>

      {!filtres.length ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 text-sm">
          {chargement ? 'Chargement…' : 'Aucun étudiant — importez les données depuis eCampus.'}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10.5px] uppercase tracking-wide text-slate-500">
                <ThTri champ="nom"     tri={tri} onTri={trierPar} className="text-left">Étudiant</ThTri>
                <ThTri champ="email"   tri={tri} onTri={trierPar} className="text-left">Email</ThTri>
                <ThTri champ="section" tri={tri} onTri={trierPar} className="text-left w-24">Sections</ThTri>
                <ThTri champ="niveau"  tri={tri} onTri={trierPar} className="text-left w-24">Niveau</ThTri>
                <ThTri champ="nb_ue"   tri={tri} onTri={trierPar} className="text-right w-16">UE</ThTri>
                <th className="px-4 py-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtres.map(e => (
                <tr key={e.id} onClick={() => setSelId(e.id)}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 cursor-pointer">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-iip-blue/10 text-iip-blue flex items-center justify-center text-[11px] font-bold flex-none">
                        {(e.nom||'?')[0]}{(e.prenom||'?')[0]}
                      </div>
                      <div>
                        <div className="font-medium text-slate-800">{e.nom} {e.prenom}</div>
                        <div className="text-[11px] text-slate-400">{e.id_ecampus}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 text-[12.5px]">{e.email_ecole}</td>
                  <td className="px-4 py-2.5 text-[11.5px] text-slate-500">{e.sections}</td>
                  <td className="px-4 py-2.5">
                    <BadgeNiveau niveau={e.niveau} libelle={e.niveau_libelle} />
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-iip-blue">{e.nb_ue}</td>
                  <td className="px-4 py-2.5 text-slate-300"><IconChevronRight size={16} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selId && (
        <FicheEtudiant id={selId} annee={annee} onClose={() => setSelId(null)} />
      )}

      {importHisto && (
        <ImportHistorique onClose={() => setImportHisto(false)} onImporte={charger} />
      )}

      {importListe && (
        <ImportListe annee={annee} onClose={() => setImportListe(false)} onImporte={charger} />
      )}

      {rapportPAE && (
        <RapportPAE anneeCourante={annee} onClose={() => setRapportPAE(false)} />
      )}

      {purge && (
        <PurgeResultats anneeCourante={annee} onClose={() => setPurge(false)} onPurge={charger} />
      )}

      {importPAE && (
        <ImportPAE annee={annee} onClose={() => setImportPAE(false)} onImporte={charger} />
      )}

      {rapport && <PreviewModal html={rapport.html} titre="Parcours des étudiants"
        nomFichier={rapport.nom} astuceImpression="Paysage A4 conseillé"
        onClose={() => setRapport(null)} />}
    </div>
  );
}
