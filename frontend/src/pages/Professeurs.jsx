import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getAnnee, getUser } from '../lib/api.js';
import ProfFicheModal from './ProfFicheModal.jsx';

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


function DetailModal({ profId, onClose, onEdit }) {
  const [detail, setDetail] = useState(null);
  const navigate = useNavigate();
  const u = getUser();
  useEffect(() => {
    api.professeur(profId).then(setDetail).catch(e => alert(e.message));
  }, [profId]);

  async function nouvelEA12() {
    try {
      const { id } = await api.ea12Create({ professeur_id: profId, annee_scolaire: getAnnee(), variante: 'bis', donnees: {} });
      navigate(`/ea12/${id}`);
    } catch (e) { alert('Erreur : ' + e.message); }
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
          <div className="flex gap-2 flex-shrink-0">
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

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3 px-6 py-3 border-b border-gray-100">
          <div className="bg-iip-gold/10 rounded p-2.5 text-center">
            <div className="text-xs text-gray-600">Total IIP</div>
            <div className="font-bold text-lg text-iip-gold">{detail.total_per_iip ?? 0} per.</div>
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
              <th className="text-right">Aut.</th>
              <th className="text-right">Total</th>
            </tr></thead>
            <tbody>
              {detail.attributions?.length === 0 && (
                <tr><td colSpan="9" className="text-center text-gray-400 py-4">Aucune attribution</td></tr>
              )}
              {detail.attributions?.map(a => (
                <tr key={a.id}>
                  <td>{a.section}</td>
                  <td className="font-mono text-xs">{a.ue_num}</td>
                  <td className="text-xs truncate max-w-[200px]">{a.nom_cours}</td>
                  <td className="text-xs text-gray-500">{a.activite_nom || '—'}</td>
                  <td className="text-center">
                    {a.type_cours && <span className={`badge ${a.type_cours==='CT'?'badge-ct':'badge-pp'}`}>{a.type_cours}</span>}
                  </td>
                  <td className="text-center">{a.code || '—'}</td>
                  <td className="num">{a.periodes_attribuees}</td>
                  <td className="num">{a.autonomie_attribuee}</td>
                  <td className="num font-semibold">{a.total_attribue_professeur}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function Professeurs() {
  const [profs, setProfs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState(null);
  const [editProf, setEditProf] = useState(null);   // null = fermé, {} = nouveau, {...} = existant
  const [sortBy, setSortBy] = useState({ key: 'nom_prenom', dir: 'asc' });
  const [deleting, setDeleting] = useState(null);
  const [selection, setSelection] = useState(new Set());  // ids des profs cochés
  const [printing, setPrinting] = useState(false);

  const me = JSON.parse(localStorage.getItem('user') || 'null');
  const canEdit = me?.role === 'admin' || me?.role === 'editeur';

  async function load() {
    setLoading(true);
    try { setProfs(await api.professeurs()); } finally { setLoading(false); }
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
  }, [profs, sortBy]);

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
          Corps professoral <span className="text-base font-normal text-gray-400">({filtered.length})</span>
        </h1>
        <div className="flex gap-2 items-center">
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
                <Th k="total_per_iip" num>Total IIP</Th>
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
                    {p.statut
                      ? <span className={`badge ${p.statut === 'CC' ? 'badge-iip' : p.statut === 'EXP' ? 'badge-exp' : 'badge-helb'}`}>{p.statut}</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="text-xs text-gray-600">{p.adresse_mail || '—'}</td>
                  <td className="text-xs text-gray-600">{p.commune || '—'}</td>
                  <td className="text-center">
                    {p.capaes === 'x'
                      ? <span className="text-green-600 text-xs font-semibold">✓</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="num">{Number(p.total_per_iip || 0).toLocaleString('fr-BE')}</td>
                  <td className="num">{Number(p.total_hrs_helb || 0).toLocaleString('fr-BE')}</td>
                  <td className="num">{p.anciennete_25_26_po || 0}</td>
                  <td className="text-center">
                    <div className="flex items-center justify-center gap-2">
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
          onEdit={p => { setDetailId(null); setEditProf(p); }} />
      )}

      {editProf !== null && (
        <ProfFicheModal prof={editProf} onClose={() => setEditProf(null)}
          onSaved={() => { setEditProf(null); load(); }} />
      )}
    </div>
  );
}
