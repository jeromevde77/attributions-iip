import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getAnnee, getUser, nomDoc } from '../lib/api.js';
import ProfFicheModal from './ProfFicheModal.jsx';
import PreviewModal from '../components/PreviewModal.jsx';
import CoursEditModal from '../components/CoursEditModal.jsx';

const EMPTY = {
  nom: '', prenom: '', adresse_mail: '', mail_prive: '',
  statut: '', adresse_rue: '', code_postal: '', commune: '',
  capaes: '', anciennete_25_26_po: 0,
  matricule: '', titre1: '', titre2: '', titre3: '', statut_ea12: ''
};

// Génère une feuille d'attributions imprimable (1 page par prof) et lance l'impression.
function ouvrirFeuilleImpression(data) {
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmt = (n) => Number(n || 0).toLocaleString('fr-BE', { maximumFractionDigits: 1 });
  const annee = esc(data.annee || '');

  const pages = (data.profs || []).map(p => {
    const lignes = (p.attributions || []).map(a => {
      const totLigne = (a.periodes_attribuees || 0) + (a.autonomie_attribuee || 0);
      const totHeures = Math.round(totLigne * 50 / 60 * 10) / 10;
      return `<tr>
        <td>${esc(a.section)}</td>
        <td>${esc(a.ue_num)} — ${esc(a.ue_nom)}</td>
        <td>${esc(a.nom_cours)}</td>
        <td class="c">${esc(a.quadrimestre_attribue || '')}</td>
        <td>${esc(a.activite_nom || '')}</td>
        <td class="c">${a.num_groupe ? esc(a.num_groupe) : ''}</td>
        <td class="c">${esc(a.type_cours || '')}</td>
        <td class="r">${fmt(a.periodes_attribuees)}</td>
        <td class="r">${fmt(a.autonomie_attribuee)}</td>
        <td class="r"><b>${fmt(totLigne)}</b> <span class="h">(${fmt(totHeures)} h)</span></td>
      </tr>`;
    }).join('');

    return `<section class="page">
      <div class="entete">
        <div class="titre">Feuille d'attributions ${annee ? '— ' + annee : ''}</div>
        <div class="prof"><b>${esc(p.nom)} ${esc(p.prenom)}</b> ${p.statut ? '<span class="badge">' + esc(p.statut) + '</span>' : ''}</div>
      </div>
      <table>
        <thead><tr>
          <th>Section</th><th>UE</th><th>Cours</th><th>Quad.</th><th>Activité</th>
          <th>Gr.</th><th>Type</th><th>Pér.</th><th>Auto.</th><th>Total (pér. / h)</th>
        </tr></thead>
        <tbody>${lignes || '<tr><td colspan="10" class="vide">Aucune attribution</td></tr>'}</tbody>
        <tfoot><tr>
          <td colspan="9" class="r"><b>TOTAL</b></td>
          <td class="r"><b>${fmt(p.total_global_periodes)} pér.</b> <span class="h">(${fmt(p.total_global_heures)} h)</span></td>
        </tr></tfoot>
      </table>
    </section>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
    <title>Feuilles d'attributions</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; margin: 0; color: #1a1a1a; }
      .page { padding: 18mm 14mm; page-break-after: always; }
      .page:last-child { page-break-after: auto; }
      .entete { border-bottom: 2px solid #1F3864; padding-bottom: 8px; margin-bottom: 14px; }
      .titre { font-size: 12px; color: #555; text-transform: uppercase; letter-spacing: 1px; }
      .prof { font-size: 20px; margin-top: 4px; }
      .badge { font-size: 11px; background: #1F3864; color: #fff; padding: 2px 8px; border-radius: 10px; vertical-align: middle; margin-left: 6px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #ccc; padding: 5px 7px; text-align: left; vertical-align: top; }
      thead th { background: #9CC2E5; font-weight: bold; }
      tfoot td { background: #f0f4f8; font-size: 13px; }
      .c { text-align: center; } .r { text-align: right; }
      .h { color: #777; font-weight: normal; font-size: 11px; }
      .vide { text-align: center; color: #999; font-style: italic; }
      @media print { .page { padding: 12mm; } }
    </style></head><body>${pages}
    <script>window.onload = () => { window.print(); };<\/script>
    </body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Veuillez autoriser les pop-ups pour imprimer.'); return; }
  w.document.write(html);
  w.document.close();
}


function DetailModal({ profId, onClose, onEdit, onFiche }) {
  const [detail, setDetail] = useState(null);
  const navigate = useNavigate();
  const u = getUser();
  const [editCours, setEditCours] = useState(null); // { section, code_cours }
  useEffect(() => {
    api.professeur(profId, getAnnee()).then(setDetail).catch(e => alert(e.message));
  }, [profId]);

  async function nouvelEA12() {
    try {
      const { id } = await api.ea12Create({ professeur_id: profId, annee_scolaire: getAnnee(), variante: 'bis', donnees: {} });
      navigate(`/ea12/${id}`);
    } catch (e) { alert('Erreur : ' + e.message); }
  }

  const [showContratModal, setShowContratModal] = useState(false);
  const [dateContrat, setDateContrat]           = useState(new Date().toISOString().split('T')[0]);
  const [representant, setRepresentant]         = useState('Charles Sohet, Directeur a.i.');
  const [generatingContrat, setGeneratingContrat] = useState(false);

  async function genererContrat() {
    setGeneratingContrat(true);
    try {
      const res = await fetch('/api/contrats/generer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ prof_id: profId, date_contrat: dateContrat, representant }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur serveur');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Contrat_${detail.nom}_${detail.prenom}_${dateContrat}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      setShowContratModal(false);
    } catch (e) { alert('Erreur : ' + e.message); }
    finally { setGeneratingContrat(false); }
  }

  if (!detail) return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-30">
      <div className="bg-white rounded-xl p-8 text-gray-400">Chargement…</div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-30"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-title text-iip-gold">{detail.nom_prenom}</h2>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 flex-wrap">
              {detail.adresse_mail && <span>✉ {detail.adresse_mail}</span>}
              {detail.statut && <span className="badge badge-iip">{detail.statut}</span>}
              {detail.capaes === 'x' && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">CAPAES</span>}
              {detail.commune && <span>📍 {detail.code_postal} {detail.commune}</span>}
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
            <button onClick={() => onFiche && onFiche(profId)}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-3 py-1.5 rounded">
              📋 Fiche attr.
            </button>
            {u?.role === 'admin' && (
              <button onClick={() => setShowContratModal(true)}
                className="bg-green-700 hover:opacity-90 text-white text-sm px-3 py-1.5 rounded">
                📄 Contrat
              </button>
            )}
            {u?.role === 'admin' && (
              <button onClick={nouvelEA12}
                className="bg-iip-mauve hover:opacity-90 text-white text-sm px-3 py-1.5 rounded">
                + Nouvel EA12
              </button>
            )}
            <button onClick={() => onEdit(detail)}
              className="bg-iip-gold hover:bg-iip-amber text-white text-sm px-3 py-1.5 rounded">
              ✏ Modifier
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-red-500 text-2xl leading-none ml-2">×</button>
          </div>
        </div>

        {/* Modale génération contrat */}
        {showContratModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
              <h3 className="text-lg font-title text-iip-gold mb-4">📄 Générer le contrat de travail</h3>
              <p className="text-sm text-gray-600 mb-4">
                Contrat CDD — Enseignement pour adultes<br />
                <strong>{detail.nom_prenom}</strong>
              </p>
              <div className="space-y-4">
                <label className="block">
                  <div className="text-xs font-semibold text-gray-600 mb-1">Date de signature du contrat</div>
                  <input type="date" value={dateContrat} onChange={e => setDateContrat(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                  {dateContrat && (
                    <p className="text-xs text-gray-500 mt-1">
                      Apparaîtra dans le contrat : <em>{['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'][new Date(dateContrat+'T12:00').getDay()]} {new Date(dateContrat+'T12:00').toLocaleDateString('fr-BE',{day:'2-digit',month:'long',year:'numeric'})}</em>
                    </p>
                  )}
                </label>
                <label className="block">
                  <div className="text-xs font-semibold text-gray-600 mb-1">Représentant(e) du PO</div>
                  <input value={representant} onChange={e => setRepresentant(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                </label>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowContratModal(false)}
                  className="flex-1 border border-gray-300 text-gray-600 py-2 rounded text-sm">
                  Annuler
                </button>
                <button onClick={genererContrat} disabled={generatingContrat || !dateContrat}
                  className="flex-1 bg-green-700 hover:opacity-90 disabled:opacity-40 text-white py-2 rounded text-sm font-semibold">
                  {generatingContrat ? 'Génération…' : '⬇ Télécharger le .docx'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3 px-6 py-3 border-b border-gray-100">
          <div className="bg-iip-gold/10 rounded p-2.5 text-center">
            <div className="text-xs text-gray-600">Total IIP (per. + aut.)</div>
            <div className="font-bold text-lg text-iip-gold">{(detail.tot_per_annee ?? 0) + (detail.tot_aut_annee ?? 0)} per.</div>
          </div>
          <div className="bg-iip-mauve/10 rounded p-2.5 text-center">
            <div className="text-xs text-gray-600">Total HELB</div>
            <div className="font-bold text-lg text-iip-mauve">{detail.total_hrs_helb ?? 0} hrs</div>
          </div>
          <div className="bg-gray-50 rounded p-2.5 text-center">
            <div className="text-xs text-gray-600">Ancienneté PO</div>
            <div className="font-bold text-lg">{detail.anciennete_25_26_po ?? 0}</div>
          </div>
        </div>

        {/* Attributions */}
        <div className="flex-1 overflow-auto px-6 py-3">
          <h3 className="font-semibold text-sm mb-2 text-gray-700">
            Attributions ({detail.attributions?.length || 0})
          </h3>
          <table className="grid-excel-soft w-full text-sm">
            <thead><tr>
              <th className="text-left">Section</th>
              <th className="text-left">UE</th>
              <th className="text-left">Cours</th>
              <th className="text-left">Activité</th>
              <th>Type</th>
              <th>Gr.</th>
              <th className="text-right">Per.</th>
              <th></th>
            </tr></thead>
            <tbody>
              {detail.attributions?.length === 0 && (
                <tr><td colSpan="8" className="text-center text-gray-400 py-4">Aucune attribution</td></tr>
              )}
              {detail.attributions?.flatMap(a => {
                const badge = tc => tc === 'CT'
                  ? <span className="badge badge-ct">CT</span>
                  : tc === 'PP' ? <span className="badge badge-pp">PP</span> : null;
                const btnActions = (
                  <>
                    {a.code_cours && (
                      <button title="Éditer ce cours"
                        onClick={() => setEditCours({ section: a.section, code_cours: a.code_cours })}
                        className="text-iip-gold hover:text-iip-amber text-xs px-1">✏</button>
                    )}
                    <button title="Désattribuer → À DÉSIGNER"
                      onClick={async () => {
                        if (!confirm('Retirer cette attribution et la passer à "À DÉSIGNER" ?')) return;
                        const tok = localStorage.getItem('token');
                        const res = await fetch(`/api/attributions/${a.id}/desattribuer`, {
                          method: 'PATCH', headers: { Authorization: `Bearer ${tok}` }
                        });
                        if (res.ok) setDetail(d => ({ ...d, attributions: d.attributions.filter(x => x.id !== a.id) }));
                      }}
                      className="text-orange-400 hover:text-orange-600 text-xs px-1">🔄</button>
                  </>
                );
                const rows = [];
                // Ligne cours (si périodes > 0 ou pas d'autonomie du tout)
                if (a.periodes_attribuees > 0 || a.autonomie_attribuee === 0) {
                  rows.push(
                    <tr key={`${a.id}-per`} className="hover:bg-iip-gold/5">
                      <td>{a.section}</td>
                      <td className="font-mono text-xs">{a.ue_num}</td>
                      <td className="text-xs truncate max-w-[180px]">{a.nom_cours}</td>
                      <td className="text-xs text-gray-500">{a.activite_nom || '—'}</td>
                      <td className="text-center">{badge(a.type_cours)}</td>
                      <td className="text-center text-xs">{a.code || '—'}</td>
                      <td className="num">{a.periodes_attribuees}</td>
                      <td className="text-center whitespace-nowrap">
                        {a.autonomie_attribuee === 0 && btnActions}
                      </td>
                    </tr>
                  );
                }
                // Ligne autonomie séparée (si > 0)
                if (a.autonomie_attribuee > 0) {
                  rows.push(
                    <tr key={`${a.id}-aut`} className="bg-amber-50/40 hover:bg-amber-50">
                      <td className="text-gray-300 text-xs pl-3">↳</td>
                      <td className="font-mono text-xs text-gray-400">{a.ue_num}</td>
                      <td className="text-xs text-gray-400 truncate max-w-[180px]">{a.nom_cours}</td>
                      <td className="text-xs text-amber-600 italic">{a.activite_nom ? `Autonomie — ${a.activite_nom}` : 'Autonomie'}</td>
                      <td className="text-center">{badge(a.type_cours)}</td>
                      <td className="text-center text-xs text-gray-400">{a.code || '—'}</td>
                      <td className="num text-amber-700 font-semibold">{a.autonomie_attribuee}</td>
                      <td className="text-center whitespace-nowrap">{btnActions}</td>
                    </tr>
                  );
                }
                return rows;
              })}
              ))}
            </tbody>
          </table>
          {editCours && (
            <CoursEditModal
              section={editCours.section}
              codeCours={editCours.code_cours}
              onClose={() => setEditCours(null)}
              onChanged={() => { setEditCours(null); api.professeur(profId, getAnnee()).then(setDetail).catch(() => {}); }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function Professeurs() {
  const [profs, setProfs] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState(null);
  const [editProf, setEditProf] = useState(null);
  const [sortBy, setSortBy] = useState({ key: 'nom_prenom', dir: 'asc' });
  const [deleting, setDeleting] = useState(null);
  const [selection, setSelection] = useState(new Set());
  const [printing, setPrinting] = useState(false);
  const [ficheHtml, setFicheHtml] = useState(null);

  const me = JSON.parse(localStorage.getItem('user') || 'null');

  async function genererFicheAttributions(profId) {
    const annee = getAnnee();
    const tok = localStorage.getItem('token');
    const d = await fetch(`/api/ref/professeurs/${profId}/fiche-attributions?annee=${encodeURIComponent(annee)}`,
      { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.json());
    if (d.error) { alert(d.error); return; }

    const { prof, attributions, nominations, bilan_nomination, tot_ct, tot_pp, tot_aut, tot_per, tot_global, etp } = d;
    const fmt = n => n != null ? String(n) : '0';
    const S  = 'padding:2px 6px;font-size:11px;';
    const SR = S + 'text-align:right;';

    // Grouper par section
    const sections = {};
    for (const a of attributions) {
      if (!sections[a.section]) sections[a.section] = [];
      sections[a.section].push(a);
    }

    const lignesSections = Object.entries(sections).map(([sec, rows]) => {
      const lignes = rows.map((a, i) => `
        <tr style="background:${i%2===0?'#fff':'#f9fafb'}">
          <td style="${S}color:#6b7280">${a.section}</td>
          <td style="${S}color:#374151">UE ${a.ue_num}${a.ue_niv ? ` <span style="background:#1B2B4B;color:white;font-size:9px;padding:1px 4px;border-radius:3px">${a.ue_niv}</span>` : ''}</td>
          <td style="${S}color:#374151">${a.cours_nom || a.code_cours || '—'}${a.activite_nom ? ` <em style="color:#9ca3af">(${a.activite_nom})</em>` : ''}${a.est_rt ? ` <span style="color:#ea580c;border:1px solid #ef4444;border-radius:3px;font-size:8px;padding:0 3px;font-weight:700">RT</span>` : ''}</td>
          <td style="${SR}font-weight:600;color:${a.type_cours==='CT'?'#1B2B4B':'#00AACC'}">${a.type_cours || '—'}</td>
          <td style="${SR}color:#374151">${fmt(a.per)}</td>
          <td style="${SR}color:#6b7280">${fmt(a.aut)}</td>
          <td style="${SR}font-weight:700;border-left:1px solid #e5e7eb">${fmt((a.per||0)+(a.aut||0))}</td>
        </tr>`).join('');
      return lignes;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#111827}
        table{width:100%;border-collapse:collapse}
        td,th{border-bottom:1px solid #e5e7eb}
        @media print{@page{margin:10mm;size:A4 landscape}tr{page-break-inside:avoid}thead{display:table-header-group}}
      </style></head><body>
      <div style="padding:10mm">
        <!-- En-tête -->
        <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #1B2B4B;padding-bottom:8px;margin-bottom:16px">
          <div>
            <div style="font-size:9px;color:#00AACC;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px">Institut Ilya Prigogine · Fiche d'attributions</div>
            <div style="font-size:20px;font-weight:700;color:#1B2B4B">${prof.prenom} ${prof.nom}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px">${prof.fonction || prof.statut || ''}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:13px;font-weight:600;color:#1B2B4B">${annee}</div>
            <div style="font-size:9px;color:#9ca3af;margin-top:2px">Généré le ${new Date().toLocaleDateString('fr-BE')} · Lucie</div>
          </div>
        </div>

        <!-- Tableau -->
        <table>
          <thead>
            <tr style="background:#1B2B4B;color:white">
              <th style="padding:4px 6px;text-align:left;font-size:10px">Section</th>
              <th style="padding:4px 6px;text-align:left;font-size:10px">UE</th>
              <th style="padding:4px 6px;text-align:left;font-size:10px">Cours</th>
              <th style="padding:4px 6px;text-align:center;font-size:10px">CT/PP</th>
              <th style="padding:4px 6px;text-align:right;font-size:10px">Pér.</th>
              <th style="padding:4px 6px;text-align:right;font-size:10px">Aut.</th>
              <th style="padding:4px 6px;text-align:right;font-size:10px;border-left:1px solid rgba(255,255,255,.3)">Total</th>
            </tr>
          </thead>
          <tbody>${lignesSections}</tbody>
        </table>

        <!-- Totaux -->
        <div style="margin-top:16px;display:flex;gap:24px;justify-content:flex-end">
          <div style="background:#f1f5f9;border-radius:8px;padding:12px 20px;min-width:200px">
            <div style="font-size:10px;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">Récapitulatif</div>
            <table style="width:100%">
              <tr><td style="padding:2px 0;color:#374151;border:none">Charge de cours (CT)</td><td style="padding:2px 0;text-align:right;font-weight:600;color:#1B2B4B;border:none">${fmt(tot_ct)} p.</td></tr>
              <tr><td style="padding:2px 0;color:#374151;border:none">Pratique professionnelle (PP)</td><td style="padding:2px 0;text-align:right;font-weight:600;color:#00AACC;border:none">${fmt(tot_pp)} p.</td></tr>
              <tr><td style="padding:2px 0;color:#374151;border:none">Autonomie</td><td style="padding:2px 0;text-align:right;font-weight:600;color:#6b7280;border:none">${fmt(tot_aut)} p.</td></tr>
              <tr style="border-top:2px solid #1B2B4B">
                <td style="padding:4px 0;font-weight:700;color:#1B2B4B;border:none">Total général</td>
                <td style="padding:4px 0;text-align:right;font-weight:700;color:#1B2B4B;border:none">${fmt(tot_global)} p.</td>
              </tr>
              <tr>
                <td style="padding:2px 0;font-weight:700;color:#1B2B4B;border:none">ETP</td>
                <td style="padding:2px 0;text-align:right;font-size:16px;font-weight:700;color:#00AACC;border:none">${etp}</td>
              </tr>
            </table>
          </div>
        </div>
        ${(nominations && nominations.length) ? `
        <!-- Engagement à titre définitif -->
        <div style="margin-top:20px">
          <div style="font-size:11px;font-weight:700;color:#1B2B4B;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #1B2B4B;padding-bottom:3px;margin-bottom:6px">Engagement à titre définitif</div>
          <table style="width:100%">
            <thead>
              <tr style="background:#eef2f7;color:#1B2B4B">
                <th style="padding:3px 6px;text-align:left;font-size:9px">Dossier pédagogique (code FWB)</th>
                <th style="padding:3px 6px;text-align:center;font-size:9px">Type</th>
                <th style="padding:3px 6px;text-align:right;font-size:9px">Nommé (pér.)</th>
                <th style="padding:3px 6px;text-align:right;font-size:9px">ETP</th>
              </tr>
            </thead>
            <tbody>
              ${nominations.map((n,i) => `
                <tr style="background:${i%2===0?'#fff':'#f9fafb'}">
                  <td style="${S}color:#374151">${n.libelle} <span style="color:#9ca3af;font-family:monospace;font-size:9px">${n.code_fwb === 'INCONNU' ? '(code inconnu)' : n.code_fwb}</span></td>
                  <td style="${S}text-align:center;color:#6b7280">${n.type_charge || ''}</td>
                  <td style="${SR}font-weight:600">${fmt(n.periodes)}</td>
                  <td style="${SR}color:#6b7280">${n.etp}</td>
                </tr>`).join('')}
            </tbody>
          </table>
          ${bilan_nomination ? `
          <div style="margin-top:8px;padding:8px 12px;border-radius:8px;background:${bilan_nomination.couvert ? '#f0fdf4' : '#fef2f2'};border:1px solid ${bilan_nomination.couvert ? '#bbf7d0' : '#fecaca'}">
            <table style="width:100%;font-size:11px">
              <tr>
                <td style="border:none;color:#374151">Équivalent ETP nommé</td>
                <td style="border:none;text-align:right;font-weight:600">${bilan_nomination.etp_nomme}</td>
                <td style="border:none;color:#374151;padding-left:20px">Couvert (dont RT ${bilan_nomination.etp_rt})</td>
                <td style="border:none;text-align:right;font-weight:600">${bilan_nomination.etp_couvert}</td>
                <td style="border:none;text-align:right;padding-left:20px;font-weight:700;color:${bilan_nomination.couvert ? '#16a34a' : '#dc2626'}">
                  ${bilan_nomination.couvert ? '✓ couvert' : `manque ${bilan_nomination.etp_manque} ETP (~${Math.round(bilan_nomination.etp_manque*800)} pér. CT)`}
                </td>
              </tr>
            </table>
          </div>` : ''}
        </div>` : ''}
      </div>
      </body></html>`;

    setFicheHtml({ html, nom: nomDoc('Fiche_attr', prof.nom, prof.prenom, annee) });
  }
  const canEdit = me?.role === 'admin' || me?.role === 'editeur';

  async function load() {
    setLoading(true);
    try { setProfs(await api.professeurs(true, getAnnee())); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function toggleSort(key) {
    setSortBy(s => s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : { key: null, dir: 'asc' });
  }

  function toggleSelect(id) {
    setSelection(s => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function toggleSelectAll(ids) {
    setSelection(s => s.size === ids.length ? new Set() : new Set(ids));
  }

  async function imprimerAttributions() {
    if (selection.size === 0) return;
    setPrinting(true);
    try {
      const ids = [...selection].join(',');
      const annee = getAnnee() || '';
      const data = await api.professeursAttributions(ids, annee);
      ouvrirFeuilleImpression(data);
    } catch (e) { alert('Erreur : ' + e.message); }
    finally { setPrinting(false); }
  }

  const filtered = useMemo(() => {
    let arr = [...profs];
    // Filtrage par recherche
    if (search.trim()) {
      const q = search.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      arr = arr.filter(p => {
        const hay = [p.nom_prenom, p.adresse_mail, p.commune, p.fonction_admin, p.statut]
          .filter(Boolean).join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return hay.includes(q);
      });
    }
    if (sortBy.key) {
      arr = [...arr].sort((a, b) => {
        const va = a[sortBy.key], vb = b[sortBy.key];
        if (va == null && vb == null) return 0;
        if (va == null) return 1; if (vb == null) return -1;
        const na = Number(va), nb = Number(vb);
        const cmp = (!isNaN(na) && !isNaN(nb) && va !== '' && vb !== '')
          ? na - nb
          : String(va).localeCompare(String(vb), 'fr', { numeric: true, sensitivity: 'base' });
        return sortBy.dir === 'asc' ? cmp : -cmp;
      });
    }
    return arr;
  }, [profs, sortBy, search]);

  async function handleDelete(p) {
    if (!confirm(`Supprimer ${p.nom_prenom} ? Cette action est irréversible.`)) return;
    setDeleting(p.id);
    try {
      await api.deleteProfesseur(p.id);
      load();
    } catch (e) { alert('Erreur : ' + e.message); }
    finally { setDeleting(null); }
  }

  function Th({ k, children, num }) {
    const arrow = sortBy.key === k ? (sortBy.dir === 'asc' ? ' ▲' : ' ▼') : '';
    return (
      <th className={`cursor-pointer select-none hover:bg-iip-amber/10 ${num ? 'text-right' : ''}`}
        onClick={() => toggleSort(k)}>
        {children}{arrow}
      </th>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-title text-iip-gold">
          Membres du personnel <span className="text-base font-normal text-gray-400">({filtered.length})</span>
        </h1>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative">
            <input
              type="text"
              role="searchbox"
              name="recherche-personnel-no-autofill"
              placeholder="🔍 Rechercher..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              data-1p-ignore="true"
              data-lpignore="true"
              data-form-type="other"
              className="border border-gray-300 rounded-lg pl-3 pr-8 py-1.5 text-sm focus:outline-none focus:border-iip-gold w-48"
            />
            {search && (
              <button onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">✕</button>
            )}
          </div>
          {selection.size > 0 && (
            <button onClick={imprimerAttributions} disabled={printing}
              className="bg-iip-mauve hover:opacity-90 disabled:opacity-50 text-white text-sm px-3 py-1.5 rounded font-medium">
              {printing ? 'Préparation…' : `🖨 Imprimer les attributions (${selection.size})`}
            </button>
          )}
          {canEdit && (
            <button onClick={() => setEditProf({ ...EMPTY })}
              className="bg-iip-gold hover:bg-iip-amber text-white text-sm px-3 py-1.5 rounded font-medium">
              ➕ Nouveau prof.
            </button>
          )}
        </div>
      </div>

      {loading ? <p className="text-gray-400 p-4">Chargement…</p> : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-auto max-h-[calc(100vh-180px)]">
          <table className="grid-excel-soft w-full">
            <thead>
              <tr>
                <th className="text-center" style={{ width: '32px' }}>
                  <input type="checkbox"
                    checked={filtered.length > 0 && selection.size === filtered.length}
                    onChange={() => toggleSelectAll(filtered.map(p => p.id))} />
                </th>
                <Th k="nom_prenom">Nom et prénom</Th>
                <Th k="statut">Statut</Th>
                <Th k="adresse_mail">Email</Th>
                <Th k="commune">Commune</Th>
                <th className="text-center">CAPAES</th>
                <Th k="total_per_annee" num>Total année</Th>
                <Th k="total_hrs_helb" num>HELB (hrs)</Th>
                <Th k="anciennete_25_26_po" num>Anc. PO</Th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className={p.statut === 'EXP' ? 'bg-slate-100/60 hover:bg-slate-200/60' : 'hover:bg-gray-50'}>
                  <td className="text-center">
                    <input type="checkbox" checked={selection.has(p.id)}
                      onChange={() => toggleSelect(p.id)} />
                  </td>
                  <td className="font-medium">
                    <button onClick={() => setDetailId(p.id)} className="hover:text-iip-gold hover:underline text-left">
                      {p.nom_prenom}
                    </button>
                  </td>
                  <td>
                    <div className="flex items-center gap-1 flex-wrap">
                      {p.type_personnel === 'admin' && (() => {
                        const label = (p.fonction_admin || 'ADM').slice(0, 3).toUpperCase();
                        return <span className="inline-flex items-center justify-center w-7 h-7 rounded text-[10px] font-bold" style={{background:'#00AACC',color:'white'}}>{label}</span>;
                      })()}
                      {(p.contrats_annee || p.statut || '').split(',').filter(c => ['CC','EXP','MDP'].includes(c)).map(c => (
                        <span key={c} className={`inline-flex items-center justify-center w-7 h-7 rounded text-[10px] font-bold ${c === 'CC' ? 'badge-iip' : c === 'EXP' ? 'badge-exp' : 'badge-helb'}`}>{c}</span>
                      ))}
                      {!p.type_personnel && !p.contrats_annee && !p.statut && (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </div>
                  </td>
                  <td className="text-xs text-gray-600">{p.adresse_mail || '—'}</td>
                  <td className="text-xs text-gray-600">{p.commune || '—'}</td>
                  <td className="text-center">
                    {p.capaes === 'x'
                      ? <span className="text-green-600 text-xs font-semibold">✓</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="num">{Number(p.total_per_annee ?? p.total_per_iip ?? 0).toLocaleString('fr-BE')}</td>
                  <td className="num">{Number(p.total_hrs_helb || 0).toLocaleString('fr-BE')}</td>
                  <td className="num">{p.anciennete_25_26_po || 0}</td>
                  <td className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => genererFicheAttributions(p.id)}
                        className="text-gray-400 hover:text-iip-mauve text-sm" title="Fiche d'attributions">📋</button>
                      {canEdit && (
                        <button onClick={() => setEditProf(p)}
                          className="text-iip-gold hover:text-iip-amber text-sm" title="Modifier">✏</button>
                      )}
                      {canEdit && (
                        <button onClick={() => handleDelete(p)} disabled={deleting === p.id}
                          className="text-red-400 hover:text-red-600 text-sm disabled:opacity-30" title="Supprimer">🗑</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailId && (
        <DetailModal profId={detailId} onClose={() => setDetailId(null)}
          onFiche={genererFicheAttributions}
          onEdit={p => { setDetailId(null); setEditProf(p); }} />
      )}

      {editProf !== null && (
        <ProfFicheModal prof={editProf} onClose={() => setEditProf(null)}
          onSaved={() => { setEditProf(null); load(); }} />
      )}
      {ficheHtml && <PreviewModal html={ficheHtml.html||ficheHtml} titre="Fiche d'attributions" nomFichier={ficheHtml.nom} onClose={() => setFicheHtml(null)} />}
    </div>
  );
}
