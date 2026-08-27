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

  const [contenu, setContenu] = useState('annee');    // annee | etat
  const [granularite, setGranularite] = useState('ue');

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
  function valeur(e, col, j) {
    if (j.granularite === 'cours') {
      const c = e.cours[col.code];
      if (!c) return contenu === 'annee' ? '' : '';
      const sigle = { reussi: 'C', refuse: 'R', non_presente: 'np', va: 'VA', vp: 'VP', report: 'RN' }[c.statut] || '';
      if (contenu === 'annee') return c.statut === 'reussi' || c.statut === 'va'
        ? c.annee.slice(2, 4) + '-' + c.annee.slice(7, 9) : sigle;
      return sigle + (c.faveur ? ' (F)' : '');
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
    const enTetes = j.colonnes.map(c =>
      `<th title="${esc(c.libelle)}">${esc(c.code)}<span>${esc(c.ue_niv || '')}</span></th>`).join('');
    const lignes = j.etudiants.map((e, i) => {
      const cells = j.colonnes.map(c => {
        const v = valeur(e, c, j);
        const cls = /^\d\d-\d\d$/.test(v) || v === 'C' ? 'ok'
          : v.startsWith('VA') ? 'va' : v === 'R' ? 'ko' : v === 'x' ? 'ins' : '';
        return `<td class="${cls}">${esc(v)}</td>`;
      }).join('');
      return `<tr><td class="num">${i + 1}</td><td class="nom">${esc(e.nom)} ${esc(e.prenom)}`
        + `<span class="mat">${esc(e.id_ecampus || '')}${e.niveau ? ' · ' + esc(e.niveau) : ''}</span></td>${cells}</tr>`;
    }).join('');

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
  .legende { margin-top: 10px; font-size: 10px; color: #64748b; }
  @media print { body { margin: 8mm; } @page { size: landscape; } }
</style></head><body>
<h1>Plan annuel — ${esc(j.section)}</h1>
<div class="meta">${esc(j.annee)} · ${j.etudiants.length} étudiant(s) · ${j.colonnes.length} colonne(s)
  · ${contenu === 'annee' ? "année de validation" : "état de l'année"} · imprimé le ${new Date().toLocaleDateString('fr-BE')}</div>
<table><thead><tr><th></th><th style="text-align:left">Étudiant</th>${enTetes}</tr></thead>
<tbody>${lignes}</tbody></table>
<div class="legende">
  ${contenu === 'annee'
    ? "Chaque case porte l'année de la première validation. <b>VA</b> valorisation · <b>R</b> refusé · <b>x</b> inscrit, non délibéré."
    : "<b>C</b> acquise · <b>VA</b> valorisation · <b>R</b> refusé · <b>A</b> absent · <b>x</b> inscrit, non délibéré."}
</div></body></html>`;

    setApercu({ html, nom: `pae_${j.section}_${j.annee}.html` });
  }

  async function exporterExcel() {
    const j = await charger();
    if (!j) return;
    const XLSX = await import('xlsx');

    // Forme du classeur de la coordination : intitulés en ligne 1, codes en
    // ligne 2, un étudiant par ligne — donc relisible par l'écran d'import.
    const l1 = ['', '', '', '', '', '', '', '', '', ...j.colonnes.map(c => c.libelle)];
    const l2 = ['Id_Etud', 'Email Perso', 'EmailEcole', 'NomEtud', 'PréEtud', '', 'inscription',
                'Classe', 'Niveau', ...j.colonnes.map(c => c.code), 'Commentaire(s) du Conseil des Etudes'];
    const lignes = j.etudiants.map(e => ([
      e.id_ecampus || '', '', e.email_ecole || '', e.nom || '', e.prenom || '',
      '', '', '', e.niveau || '',
      ...j.colonnes.map(c => valeur(e, c, j)), '',
    ]));

    const ws = XLSX.utils.aoa_to_sheet([l1, l2, ...lignes]);
    ws['!cols'] = [
      { wch: 11 }, { wch: 22 }, { wch: 28 }, { wch: 20 }, { wch: 16 },
      { wch: 6 }, { wch: 10 }, { wch: 8 }, { wch: 11 },
      ...j.colonnes.map(() => ({ wch: 7 })), { wch: 45 },
    ];
    ws['!freeze'] = { xSplit: 5, ySplit: 2 };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'TOUS');
    XLSX.writeFile(wb, `PAE_${j.section}_${j.annee}.xlsx`);
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
                {[['annee', "Année de validation"], ['etat', "État de l'année choisie"]].map(([v, l]) => (
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
