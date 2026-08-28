import { useEffect, useState } from 'react';
import { IconX, IconPrinter, IconTable, IconFileSpreadsheet } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * Rapport de PAE.
 *
 * Deux sorties tirées du même jeu de données, pour qu'elles ne divergent pas :
 * un aperçu imprimable, et un classeur Excel à la forme du classeur de la
 * coordination — donc réimportable par l'écran d'import une fois complété.
 */
export default function RapportPAE({ anneeCourante, onClose }) {
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [annee, setAnnee] = useState(anneeCourante || '');
  const [annees, setAnnees] = useState([]);

  const [etendue, setEtendue] = useState('toutes');   // toutes | niveau | ue
  const [niveau, setNiveau] = useState('BA1');
  const [ueNum, setUeNum] = useState('');
  const [ues, setUes] = useState([]);

  const [contenu, setContenu] = useState('annee');    // annee | etat | note
  const [granularite, setGranularite] = useState('ue');
  const [intitules, setIntitules] = useState(false);   // en-têtes détaillés
  const [synthese, setSynthese] = useState(true);      // colonnes acquis / ECTS
  const [tauxUE, setTauxUE] = useState(true);          // ligne de réussite par UE
  const [filtre, setFiltre] = useState('tous');        // tous | echec | diplomables

  const [apercu, setApercu] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);

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

  useEffect(() => {
    if (!section) return;
    fetch(`/api/etudiants/purge/perimetre?section=${encodeURIComponent(section)}&annee=${annee}`,
      { headers: authHeaders() })
      .then(r => r.json()).then(j => setUes(j?.ues || [])).catch(() => {});
  }, [section, annee]);

  function url() {
    const p = new URLSearchParams({ section, annee, granularite });
    if (etendue === 'niveau') p.set('niveau', niveau);
    if (etendue === 'ue' && ueNum) p.set('ue_num', ueNum);
    return `/api/etudiants/rapport-pae?${p}`;
  }

  async function charger() {
    if (!section || !annee) { setErreur('Choisissez une section et une année.'); return null; }
    setErreur(null); setEnCours(true);
    try {
      const rep = await fetch(url(), { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error || 'Erreur'); return null; }
      if (!j.etudiants?.length) { setErreur('Aucun étudiant pour ce périmètre.'); return null; }
      return j;
    } finally { setEnCours(false); }
  }

  // Valeur d'une cellule : l'année de validation, ou l'état de l'année courante
  // Valeur d'une case. En colonnes par cours, à défaut de résultat encodé à
  // cette maille, on retombe sur celui de l'UE — signalé comme tel : sans quoi
  // le tableau serait muet tant que les classeurs ne sont pas importés.
  function valeur(e, col, j) {
    const parCours = j.granularite === 'cours';
    const aCours = parCours && e.cours && e.cours[col.code];

    if (contenu === 'note') {
      if (parCours) {
        if (aCours) return aCours.note != null ? String(aCours.note) : '';
        const a = e.ue[col.ue_num];
        if (a && a.points != null) return String(a.points) + '*';
        return a ? (a.mode === 'va' ? 'VA' : '✓*') : '';
      }
      const a = e.ue[col.ue_num];
      if (a && a.points != null) return String(a.points);
      const p = e.points_courant?.[col.ue_num];
      return p != null ? String(p) : (a ? (a.mode === 'va' ? 'VA' : '✓') : '');
    }
    if (parCours) {
      if (aCours) {
        const sigle = { reussi: 'C', refuse: 'R', non_presente: 'np', va: 'VA', vp: 'VP', report: 'RN' }[aCours.statut] || '';
        if (contenu === 'annee') return aCours.statut === 'reussi' || aCours.statut === 'va'
          ? aCours.annee.slice(2, 4) + '-' + aCours.annee.slice(7, 9) : sigle;
        return sigle + (aCours.faveur ? ' (F)' : '');
      }
      // Repli sur l'UE, marqué d'un astérisque
      const a = e.ue[col.ue_num];
      if (contenu === 'annee') {
        if (a) return (a.mode === 'va' ? 'VA ' : '') + a.annee.slice(2, 4) + '-' + a.annee.slice(7, 9) + '*';
        const c0 = e.courant[col.ue_num];
        return c0 === 'ajourne' ? 'R*' : c0 ? 'x*' : '';
      }
      if (a) return (a.mode === 'va' ? 'VA' : 'C') + '*';
      const c0 = e.courant[col.ue_num];
      return c0 === 'ajourne' ? 'R*' : c0 === 'absent' ? 'A*' : c0 ? 'x*' : '';
    }
    const acquis = e.ue[col.ue_num];
    if (contenu === 'annee') {
      if (!acquis) return e.courant[col.ue_num] === 'ajourne' ? 'R'
        : e.courant[col.ue_num] ? 'x' : '';
      return (acquis.mode === 'va' ? 'VA ' : '') + acquis.annee.slice(2, 4) + '-' + acquis.annee.slice(7, 9);
    }
    if (acquis) return acquis.mode === 'va' ? 'VA' : 'C';
    const c = e.courant[col.ue_num];
    return c === 'ajourne' ? 'R' : c === 'absent' ? 'A' : c ? 'x' : '';
  }

  async function voirApercu() {
    const j = await charger();
    if (!j) return;
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    // BA1 orange, BA2 bleu clair, BA3 bleu marine — convention de Lucie
    const NIV_PALETTE = ['#F97316', '#60A5FA', '#1E3A8A', '#A855F7', '#EC4899'];
    const coulNiv = niv => {
      const m = /^BA(\d+)$/i.exec(String(niv || '').trim());
      return m ? NIV_PALETTE[(Number(m[1]) - 1) % NIV_PALETTE.length] : '#94A3B8';
    };
    const enTetes = j.colonnes.map(c =>
      `<th title="${esc(c.libelle)}" class="${intitules ? 'long' : ''}">${esc(c.code)}` +
      `<span style="color:${coulNiv(c.ue_niv)};font-weight:700">${esc(c.ue_niv || '')}</span>` +
      (intitules ? `<span class="lib">${esc((c.libelle || '').slice(0, 42))}</span>` : '') +
      `</th>`).join('')
      + (synthese
          ? '<th class="s">Acquis</th><th class="s">ECTS</th><th class="s">Situation</th>'
          : '');
    // Combien de valeurs proviennent réellement de la maille du cours ?
    const cotesCours = j.granularite === 'cours'
      ? j.etudiants.reduce((s, e) => s + Object.keys(e.cours || {}).length, 0) : null;

    const retenus = j.etudiants.filter(e =>
      filtre === 'echec' ? e.echecs > 0
      : filtre === 'diplomables' ? e.diplomable
      : true);
    if (!retenus.length) { setErreur('Aucun étudiant ne correspond au filtre.'); return; }

    const lignes = retenus.map((e, i) => {
      const cells = j.colonnes.map(c => {
        const v = valeur(e, c, j);
        const repris = v.endsWith('*');
        const b = repris ? v.slice(0, -1) : v;
        const base = /^\d\d-\d\d$/.test(b) || b === 'C' || b === '✓' || /^\d+([.,]\d+)?$/.test(b) ? 'ok'
          : b.startsWith('VA') ? 'va' : b === 'R' ? 'ko' : b === 'x' ? 'ins' : '';
        const cls = base + (repris ? ' repris' : '');
        return `<td class="${cls}">${esc(v)}</td>`;
      }).join('');
      const synth = synthese
        ? `<td class="s">${e.acquises}/${e.total_ue}</td>`
          + `<td class="s">${e.ects}${e.ects_total ? '/' + e.ects_total : ''}</td>`
          + `<td class="s">${e.diplomable ? '<b>diplômable</b>' : (e.echecs ? e.echecs + ' échec(s)' : '')}</td>`
        : '';
      return `<tr><td class="num">${i + 1}</td><td class="nom">${esc(e.nom)} ${esc(e.prenom)}`
        + `<span class="mat">${esc(e.id_ecampus || '')}${e.niveau ? ' · ' + esc(e.niveau) : ''}</span></td>${cells}${synth}</tr>`;
    }).join('');

    // Ligne de taux de réussite : elle désigne les UE qui font barrage
    const ligneTaux = tauxUE
      ? `<tr class="taux"><td></td><td class="nom">Taux de réussite</td>` +
        j.colonnes.map(c0 => {
          const t = j.taux?.[c0.code];
          const cls = t == null ? '' : t >= 75 ? 'ok' : t >= 50 ? '' : 'ko';
          return `<td class="${cls}">${t == null ? '' : t + '%'}</td>`;
        }).join('') +
        (synthese ? '<td class="s"></td><td class="s"></td><td class="s"></td>' : '') +
        `</tr>`
      : '';

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>PAE ${esc(j.section)} — ${esc(j.annee)}</title>
<style>
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1B2B4B; margin: 22px; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  .meta { color: #64748b; font-size: 11px; margin-bottom: 12px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #cbd5e1; padding: 3px 5px; text-align: center; }
  th { background: #f1f5f9; font-size: 9.5px; }
  th span { display: block; font-weight: normal; color: #94a3b8; font-size: 8px; }
  td.num { color: #94a3b8; width: 24px; }
  td.nom { text-align: left; white-space: nowrap; font-weight: 500; }
  td.nom .mat { display: block; color: #94a3b8; font-weight: normal; font-size: 9px; }
  td.ok  { background: #d1fae5; color: #065f46; font-weight: 700; }
  td.va  { background: #ede9fe; color: #5b21b6; font-weight: 700; }
  td.ko  { background: #fee2e2; color: #991b1b; font-weight: 700; }
  td.ins { background: #e0f2fe; color: #075985; }
  td.repris { opacity: .55; font-style: italic; }
  th.long { min-width: 74px; }
  th .lib { display: block; font-weight: normal; color: #64748b; font-size: 7.5px;
            line-height: 1.15; margin-top: 2px; }
  td.s, th.s { background: #f8fafc; font-size: 10px; }
  tr.taux td { background: #f1f5f9; font-weight: 700; font-size: 10px; color: #475569; }
  tr.taux td.ok { color: #047857; }
  tr.taux td.ko { color: #b91c1c; }
  .alerte { background: #FEF3C7; border: 1px solid #FCD34D; color: #92400E;
            padding: 7px 10px; border-radius: 6px; font-size: 11px; margin-bottom: 10px; }
  .legende { margin-top: 10px; font-size: 10px; color: #64748b; }
  @media print { body { margin: 8mm; } @page { size: landscape; } }
</style></head><body>
<h1>Plan annuel — ${esc(j.section)}</h1>
${j.granularite === 'cours' && !cotesCours ? `
<div class="alerte">
  <b>Aucun résultat n'est encodé au niveau des cours pour cette section.</b>
  Les cases reprennent donc la décision de l'unité d'enseignement, à l'identique pour tous
  ses cours — ce tableau n'apporte rien de plus que la vue par UE tant que les classeurs de
  suivi n'ont pas été importés (« Reconstruire l'historique »).
</div>` : ''}
<div class="meta">${esc(j.annee)} · ${retenus.length} étudiant(s) · ${j.colonnes.length} colonne(s)
  · ${contenu === 'annee' ? "année de validation" : "état de l'année"} · imprimé le ${new Date().toLocaleDateString('fr-BE')}</div>
<table><thead><tr><th></th><th style="text-align:left">Étudiant</th>${enTetes}</tr></thead>
<tbody>${lignes}${ligneTaux}</tbody></table>
<div class="legende">
  ${contenu === 'annee'
    ? "Chaque case porte l'année de la première validation. <b>VA</b> valorisation · <b>R</b> refusé · <b>x</b> inscrit, non délibéré."
    : contenu === 'note'
      ? "Chaque case porte la note sur 20 lorsqu'elle est connue. <b>VA</b> valorisation · <b>✓</b> acquise sans note."
      : "<b>C</b> acquise · <b>VA</b> valorisation · <b>R</b> refusé · <b>A</b> absent · <b>x</b> inscrit, non délibéré."}
  ${granularite === 'cours' ? "Un <b>astérisque</b> signale une valeur reprise de l'unité d'enseignement, faute de résultat encodé au niveau du cours." : ''}
  ${tauxUE ? "La dernière ligne donne le taux de réussite de chaque UE parmi les étudiants qui l'ont suivie." : ''}
</div></body></html>`;

    setApercu({ html, nom: `pae_${j.section}_${j.annee}.html` });
  }

  async function exporterExcel() {
    const j = await charger();
    if (!j) return;

    const retenus = j.etudiants.filter(e =>
      filtre === 'echec' ? e.echecs > 0
      : filtre === 'diplomables' ? e.diplomable
      : true);
    if (!retenus.length) { setErreur('Aucun étudiant ne correspond au filtre.'); return; }

    // La mise en forme se fait côté serveur : seule ExcelJS sait colorer les
    // cellules, la bibliothèque du navigateur ne produit que des valeurs.
    setEnCours(true);
    try {
      const rep = await fetch('/api/etudiants/rapport-pae/excel', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          section: j.section, annee: j.annee, colonnes: j.colonnes, taux: j.taux,
          etudiants: retenus.map(e => ({
            id_ecampus: e.id_ecampus, nom: e.nom, prenom: e.prenom,
            email_ecole: e.email_ecole, niveau: e.niveau,
            acquises: e.acquises, total_ue: e.total_ue,
            ects: e.ects, ects_total: e.ects_total,
            diplomable: e.diplomable, echecs: e.echecs,
            valeurs: Object.fromEntries(j.colonnes.map(c0 => [c0.code, valeur(e, c0, j)])),
          })),
          options: {
            granularite: j.granularite, synthese, tauxUE,
            libelleContenu: contenu === 'annee' ? 'Année de validation'
              : contenu === 'note' ? 'Note sur 20' : "État de l'année",
            libelleFiltre: filtre === 'echec' ? 'Avec au moins un échec'
              : filtre === 'diplomables' ? 'Diplômables' : 'Tous',
          },
        }),
      });
      if (!rep.ok) { setErreur('Erreur à la génération du classeur.'); return; }
      const blob = await rep.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PAE_${j.section}_${j.annee}.xlsx`.replace(/[^\w.\-]/g, '_');
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } finally { setEnCours(false); }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-auto"
        onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mt-10">
          <div className="bg-iip-blue rounded-t-2xl px-5 py-4 flex items-start justify-between">
            <div>
              <div className="text-white font-bold text-[15px]">Rapport de PAE</div>
              <div className="text-blue-200 text-[12px] mt-0.5">
                Aperçu imprimable ou classeur à compléter
              </div>
            </div>
            <button onClick={onClose} className="text-blue-200 hover:text-white"><IconX size={19} /></button>
          </div>

          <div className="p-5 space-y-4">
            {erreur && (
              <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[12.5px] text-red-800">
                {erreur}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs">
                <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Section</span>
                <select value={section} onChange={e => setSection(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                  {sections.map(s => <option key={s.code} value={s.code}>{s.libelle || s.code}</option>)}
                </select>
              </label>
              <label className="text-xs">
                <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Année</span>
                <select value={annee} onChange={e => setAnnee(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                  {annees.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
            </div>

            <div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Étendue</div>
              <div className="flex gap-3 flex-wrap mb-2">
                {[['toutes', 'Toutes les UE'], ['niveau', 'Par année d\u2019études'], ['ue', 'Une seule UE']].map(([v, l]) => (
                  <label key={v} className="flex items-center gap-1.5 text-[12.5px]">
                    <input type="radio" checked={etendue === v} onChange={() => setEtendue(v)} /> {l}
                  </label>
                ))}
              </div>
              {etendue === 'niveau' && (
                <select value={niveau} onChange={e => setNiveau(e.target.value)}
                  className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                  {['BA1', 'BA2', 'BA3'].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              )}
              {etendue === 'ue' && (
                <select value={ueNum} onChange={e => setUeNum(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                  <option value="">Choisir une UE…</option>
                  {ues.map(u => <option key={u.ue_num} value={u.ue_num}>{u.ue_num} — {u.ue_nom}</option>)}
                </select>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Contenu des cases</div>
                {[['annee', "Année de validation"], ['etat', "État de l'année choisie"],
                  ['note', 'Note sur 20']].map(([v, l]) => (
                  <label key={v} className="flex items-center gap-1.5 text-[12.5px] mb-1">
                    <input type="radio" checked={contenu === v} onChange={() => setContenu(v)} /> {l}
                  </label>
                ))}
              </div>
              <div>
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Colonnes</div>
                {[['ue', 'Une par UE'], ['cours', 'Une par cours']].map(([v, l]) => (
                  <label key={v} className="flex items-center gap-1.5 text-[12.5px] mb-1">
                    <input type="radio" checked={granularite === v} onChange={() => setGranularite(v)} /> {l}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Enrichissements
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <label className="flex items-start gap-2 text-[12.5px]">
                  <input type="checkbox" checked={intitules} onChange={e => setIntitules(e.target.checked)} className="mt-0.5" />
                  <span>Intitulés en en-tête
                    <span className="block text-[10.5px] text-slate-500">Sous le code, pour un document remis au jury</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-[12.5px]">
                  <input type="checkbox" checked={synthese} onChange={e => setSynthese(e.target.checked)} className="mt-0.5" />
                  <span>Synthèse par étudiant
                    <span className="block text-[10.5px] text-slate-500">UE acquises, ECTS cumulés, situation</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-[12.5px]">
                  <input type="checkbox" checked={tauxUE} onChange={e => setTauxUE(e.target.checked)} className="mt-0.5" />
                  <span>Taux de réussite par UE
                    <span className="block text-[10.5px] text-slate-500">En pied de tableau — désigne les UE qui font barrage</span>
                  </span>
                </label>
                <label className="text-[12.5px]">
                  <span className="block mb-1">Étudiants retenus</span>
                  <select value={filtre} onChange={e => setFiltre(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1 text-[12px]">
                    <option value="tous">Tous</option>
                    <option value="echec">Avec au moins un échec</option>
                    <option value="diplomables">Diplômables — reste l'épreuve intégrée</option>
                  </select>
                </label>
              </div>
            </div>

            {granularite === 'cours' && (
              <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11.5px] text-amber-900">
                Les colonnes par cours ne portent de valeurs propres que si des résultats ont été
                encodés à cette maille — par « Reconstruire l'historique » ou « Importer le classeur
                PAE ». À défaut, chaque cours reprend la décision de son UE, en estompé.
              </div>
            )}

            <div className="px-3 py-2 rounded-lg bg-sky-50 border border-sky-200 text-[11.5px] text-sky-900">
              Le classeur exporté reprend la forme de celui de la coordination : il peut être
              complété à la main, puis réimporté par « Importer le classeur PAE ». Choisissez
              alors des colonnes <b>par cours</b>, la maille de l'encodage.
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-lg border border-slate-300">
                Fermer
              </button>
              <button onClick={voirApercu} disabled={enCours}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-iip-blue text-iip-blue font-medium disabled:opacity-50">
                <IconPrinter size={15} /> Aperçu
              </button>
              <button onClick={exporterExcel} disabled={enCours}
                className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold disabled:opacity-50">
                <IconFileSpreadsheet size={15} /> Excel
              </button>
            </div>
          </div>
        </div>
      </div>

      {apercu && (
        <PreviewLite html={apercu.html} nom={apercu.nom} onClose={() => setApercu(null)} />
      )}
    </>
  );
}

// Aperçu plein écran, imprimable
function PreviewLite({ html, nom, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex flex-col p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-white text-[12.5px]">{nom}</span>
        <div className="flex gap-2">
          <button onClick={() => {
              const f = document.getElementById('apercu-pae');
              f?.contentWindow?.focus(); f?.contentWindow?.print();
            }}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-iip-turquoise text-white font-semibold">
            <IconPrinter size={15} /> Imprimer / PDF
          </button>
          <button onClick={onClose} className="text-white/80 hover:text-white"><IconX size={20} /></button>
        </div>
      </div>
      <iframe id="apercu-pae" title="Aperçu" srcDoc={html}
        className="flex-1 bg-white rounded-xl" />
      <div className="text-white/60 text-[11px] mt-1.5">Paysage A4 conseillé.</div>
    </div>
  );
}
