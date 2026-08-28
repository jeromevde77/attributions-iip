import { useEffect, useMemo, useState } from 'react';
import {
  IconPlus, IconTrash, IconUpload, IconCopy, IconAlertTriangle, IconCash,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * Gestion budgétaire — par année CIVILE et par section.
 *
 * Le tableur du pouvoir organisateur ne portait que les prévisions ; le suivi
 * des dépenses se tenait en centrale, invisible ici. Les deux sont réunis :
 * chaque ligne de prévision affiche ce qui a été engagé et le solde restant.
 */
const eur = n => (Number(n) || 0).toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

export default function Budget() {
  const anneeCivile = new Date().getFullYear();
  const [annee, setAnnee] = useState(anneeCivile);
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [comptes, setComptes] = useState([]);
  const [data, setData] = useState(null);
  const [synthese, setSynthese] = useState(null);
  const [vue, setVue] = useState('section');        // section | synthese
  const [form, setForm] = useState(null);           // ligne en cours d'édition
  const [depenseFor, setDepenseFor] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() })
      .then(r => r.json())
      .then(l => {
        if (!Array.isArray(l)) return;
        // Aux sections d'enseignement s'ajoutent les services, qui ont aussi
        // leur budget : direction, secrétariat, coordination…
        const services = ['Direction', 'Direction adjointe', 'Secrétariat', 'Coordination', 'MDP', 'IIP'];
        const codes = [...l.map(s => s.code), ...services];
        setSections(codes);
        if (codes.length && !section) setSection(codes[0]);
      }).catch(() => {});
    fetch('/api/budget/comptes', { headers: authHeaders() })
      .then(r => r.json()).then(l => { if (Array.isArray(l)) setComptes(l); }).catch(() => {});
    // eslint-disable-next-line
  }, []);

  async function charger() {
    if (!annee) return;
    if (vue === 'synthese') {
      const rep = await fetch(`/api/budget/synthese?annee=${annee}`, { headers: authHeaders() });
      setSynthese(rep.ok ? await rep.json() : { sections: [] });
      return;
    }
    if (!section) return;
    setData(null);
    const rep = await fetch(`/api/budget?annee=${annee}&section=${encodeURIComponent(section)}`,
      { headers: authHeaders() });
    setData(rep.ok ? await rep.json() : { lignes: [], totaux: {} });
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [annee, section, vue]);

  async function enregistrerLigne() {
    const corps = { ...form, annee_civile: annee, section };
    const url = form.id ? `/api/budget/ligne/${form.id}` : '/api/budget/ligne';
    const rep = await fetch(url, {
      method: form.id ? 'PUT' : 'POST', headers: authHeaders(), body: JSON.stringify(corps),
    });
    const j = await rep.json();
    if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
    setForm(null); await charger();
  }

  async function supprimerLigne(id) {
    if (!window.confirm('Supprimer cette ligne de prévision ainsi que les dépenses qui s\u2019y rattachent ?')) return;
    await fetch(`/api/budget/ligne/${id}`, { method: 'DELETE', headers: authHeaders() });
    await charger();
  }

  async function ajouterDepense(d) {
    const rep = await fetch('/api/budget/depense', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ ...d, annee_civile: annee, section }),
    });
    const j = await rep.json();
    if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
    setDepenseFor(null); await charger();
  }

  async function supprimerDepense(id) {
    if (!window.confirm('Supprimer cette dépense ?')) return;
    await fetch(`/api/budget/depense/${id}`, { method: 'DELETE', headers: authHeaders() });
    await charger();
  }

  async function reprendre() {
    if (!window.confirm(`Reprendre les lignes de ${annee - 1} pour ${section} ?`)) return;
    const rep = await fetch('/api/budget/reprendre', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ annee, annee_source: annee - 1, section }),
    });
    const j = await rep.json();
    if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
    setMessage({ type: j.source_vide ? 'err' : 'ok', texte: j.message });
    await charger();
  }

  // Import du canevas : le référentiel des comptes, et les prévisions elles-mêmes
  async function importerCanevas(fichier) {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await fichier.arrayBuffer(), { type: 'array' });
      const rapport = [];

      // Onglet « Données » — les comptes généraux
      const ongletD = wb.SheetNames.find(n => /donn/i.test(n));
      if (ongletD) {
        const liste = XLSX.utils.sheet_to_json(wb.Sheets[ongletD], { defval: null })
          .filter(l => l['Référence'])
          .map(l => ({
            reference: String(l['Référence']).trim(),
            libelle: String(l['Libellé'] || '').trim(),
            bilan: l['Bilan'] || null, type: l['Type'] || null,
            tva_defaut: l['TVA'] != null ? Number(l['TVA']) : null,
          }));
        if (liste.length) {
          const rep = await fetch('/api/budget/comptes', {
            method: 'PUT', headers: authHeaders(), body: JSON.stringify({ comptes: liste }),
          });
          const j = await rep.json();
          if (rep.ok) rapport.push(`${j.comptes} compte(s)`);
        }
      }

      // Onglet « Budget » — les prévisions. Les en-têtes sont en ligne 5.
      const ongletB = wb.SheetNames.find(n => /budget/i.test(n));
      if (ongletB) {
        const M = XLSX.utils.sheet_to_json(wb.Sheets[ongletB], { header: 1, defval: null });
        const iEnt = M.findIndex(r0 => (r0 || []).some(v => /Compte g[ée]n[ée]ral/i.test(String(v || ''))));
        if (iEnt >= 0) {
          const ent = (M[iEnt] || []).map(v => String(v || '').trim());
          const col = re => ent.findIndex(v => re.test(v));
          const iC = col(/Compte g[ée]n[ée]ral/i), iD = col(/D[ée]tails/i),
                iA = col(/charge|profit/i), iPU = col(/Prix unitaire/i),
                iQ = col(/Quantit/i), iT = col(/Taux TVA/i);

          const prev = [];
          for (let li = iEnt + 1; li < M.length; li++) {
            const row = M[li] || [];
            const details = String(row[iD] ?? '').trim();
            const compte = String(row[iC] ?? '').trim();
            if (!details || !compte) continue;
            // « 612410 Achat mobilier… » → référence = premier mot
            const ref = compte.split(/\s+/)[0];
            // « TIM - Prix pour les étudiants » → section = préfixe
            const sec = details.includes(' - ') ? details.split(' - ')[0].trim() : null;
            prev.push({
              section: sec && sec.length <= 24 ? sec : null,
              compte_ref: /^[0-9A-Za-z.]+$/.test(ref) ? ref : null,
              details: sec ? details.slice(details.indexOf(' - ') + 3).trim() : details,
              a_charge: String(row[iA] ?? 'IIP').trim() || 'IIP',
              prix_unitaire: Number(row[iPU] || 0),
              quantite: Number(row[iQ] || 1),
              taux_tva: row[iT] != null && row[iT] !== '' ? Number(row[iT]) : 0.21,
            });
          }

          if (prev.length) {
            const sansSection = prev.filter(p => !p.section).length;
            if (!window.confirm(
              `${prev.length} prévision(s) trouvée(s) dans le canevas.\n` +
              (sansSection ? `${sansSection} sans section identifiable iront dans « À répartir ».\n` : '') +
              `\nLes importer pour l'année ${annee} ? Les prévisions existantes des sections concernées seront remplacées.`
            )) return;
            const rep = await fetch('/api/budget/import', {
              method: 'POST', headers: authHeaders(),
              body: JSON.stringify({ annee, lignes: prev, remplacer: true }),
            });
            const j = await rep.json();
            if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
            rapport.push(`${j.importees} prévision(s)`);
            if (j.refusees?.length) rapport.push(`refusées hors périmètre : ${j.refusees.join(', ')}`);
          }
        }
      }

      if (!rapport.length) throw new Error("Aucun onglet « Budget » ni « Données » reconnu dans ce fichier.");
      setMessage({ type: 'ok', texte: 'Import terminé — ' + rapport.join(' · ') });
      const cpt = await fetch('/api/budget/comptes', { headers: authHeaders() }).then(r => r.json());
      setComptes(Array.isArray(cpt) ? cpt : []);
      await charger();
    } catch (e) { setMessage({ type: 'err', texte: e.message }); }
  }

  const annees = useMemo(() => {
    const a = [];
    for (let y = anneeCivile + 1; y >= anneeCivile - 4; y--) a.push(y);
    return a;
  }, [anneeCivile]);

  return (
    <div className="p-5 space-y-4 max-w-6xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-iip-blue">Gestion budgétaire</h2>
          <p className="text-sm text-slate-500">
            Prévisions et dépenses, par année civile et par section.
          </p>
        </div>
        <label className={`flex items-center gap-2 px-3 py-1.5 text-[12.5px] border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50`}>
          <IconUpload size={14} /> Importer le canevas ({annee})
          <input type="file" accept=".xlsx,.xlsm" className="hidden"
            onChange={e => e.target.files[0] && importerCanevas(e.target.files[0])} />
        </label>
      </div>

      {message && (
        <div className={`px-4 py-2.5 rounded-lg text-sm flex items-center justify-between ${
          message.type === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-red-50 text-red-800 border border-red-200'}`}>
          <span>{message.texte}</span>
          <button onClick={() => setMessage(null)} className="ml-3 opacity-60">✕</button>
        </div>
      )}

      <div className="flex gap-2 flex-wrap items-center">
        <select value={annee} onChange={e => setAnnee(Number(e.target.value))}
          className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm font-semibold text-iip-blue">
          {annees.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <div className="flex rounded-lg border border-slate-300 overflow-hidden">
          {[['section', 'Par section'], ['synthese', "Vue d'ensemble"]].map(([v, l]) => (
            <button key={v} onClick={() => setVue(v)}
              className={`px-3 py-1.5 text-[12.5px] ${vue === v
                ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>
              {l}
            </button>
          ))}
        </div>
        {vue === 'section' && (
          <>
            <select value={section} onChange={e => setSection(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
              {sections.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={reprendre}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12.5px] border border-slate-300 rounded-lg hover:bg-slate-50">
              <IconCopy size={14} /> Reprendre {annee - 1}
            </button>
          </>
        )}
      </div>

      {vue === 'synthese' ? (
        <SyntheseBudget synthese={synthese} onOuvrir={s => { setSection(s); setVue('section'); }} />
      ) : !data ? (
        <div className="py-10 text-center text-sm text-slate-400">Chargement…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['Prévu HTVA', data.totaux.prevu_htva, 'text-iip-blue'],
              ['Prévu TVAC', data.totaux.prevu_tvac, 'text-slate-600'],
              ['Engagé', data.totaux.engage, 'text-amber-700'],
              ['Solde', (data.totaux.prevu_htva || 0) - (data.totaux.engage || 0),
               (data.totaux.prevu_htva || 0) - (data.totaux.engage || 0) < 0 ? 'text-red-600' : 'text-emerald-700'],
            ].map(([lib, val, cls]) => (
              <div key={lib} className="border border-slate-200 rounded-xl px-3 py-2.5 bg-white">
                <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{lib}</div>
                <div className={`text-[18px] font-bold ${cls}`}>{eur(val)}</div>
              </div>
            ))}
          </div>

          {data.peut_ecrire && (
            <button onClick={() => setForm({ prix_unitaire: 0, quantite: 1, taux_tva: 0.21, a_charge: 'IIP' })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-iip-blue text-white font-semibold rounded-lg">
              <IconPlus size={15} /> Ajouter une prévision
            </button>
          )}

          {form && (
            <LigneForm form={form} setForm={setForm} comptes={comptes}
              onEnregistrer={enregistrerLigne} onAnnuler={() => setForm(null)} />
          )}

          {!data.lignes.length ? (
            <div className="py-10 text-center text-sm text-slate-400 border-2 border-dashed rounded-xl">
              Aucune prévision pour {section} en {annee}.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                    <th className="px-3 py-2 text-left">Compte</th>
                    <th className="px-3 py-2 text-left">Prévision</th>
                    <th className="px-2 py-2 text-right w-24">P.U. HTVA</th>
                    <th className="px-2 py-2 text-right w-14">Qté</th>
                    <th className="px-2 py-2 text-right w-28">Total HTVA</th>
                    <th className="px-2 py-2 text-right w-24">Engagé</th>
                    <th className="px-2 py-2 text-right w-24">Solde</th>
                    <th className="px-2 py-2 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.lignes.map(l => (
                    <LigneBudget key={l.id} l={l} depenses={data.depenses.filter(d => d.ligne_id === l.id)}
                      peutEcrire={data.peut_ecrire}
                      onEditer={() => setForm({ ...l })}
                      onSupprimer={() => supprimerLigne(l.id)}
                      onDepense={() => setDepenseFor(l)}
                      onSupprimerDepense={supprimerDepense} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.hors_prevision?.length > 0 && (
            <div className="border border-amber-200 bg-amber-50 rounded-xl px-4 py-3">
              <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-900 mb-1.5">
                <IconAlertTriangle size={15} /> Dépenses hors prévision
              </div>
              {data.hors_prevision.map(d => (
                <div key={d.id} className="flex items-center gap-2 text-[12px] text-amber-900 py-0.5">
                  <span className="text-slate-500">{d.date_depense}</span>
                  <span className="flex-1">{d.libelle}</span>
                  <b>{eur(d.montant_htva)}</b>
                  {data.peut_ecrire && (
                    <button onClick={() => supprimerDepense(d.id)} className="text-amber-600 hover:text-red-600">
                      <IconTrash size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {depenseFor && (
            <DepenseForm ligne={depenseFor} onEnregistrer={ajouterDepense}
              onAnnuler={() => setDepenseFor(null)} />
          )}
        </>
      )}
    </div>
  );
}

// ── Une ligne de prévision, dépliable sur ses dépenses ─────────────────────
function LigneBudget({ l, depenses, peutEcrire, onEditer, onSupprimer, onDepense, onSupprimerDepense }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <tr className={`border-b border-slate-100 hover:bg-slate-50/60 ${l.depasse ? 'bg-red-50/40' : ''}`}>
        <td className="px-3 py-2 text-[11.5px] text-slate-500 align-top">
          {l.compte_ref || '—'}
          {l.compte_libelle && <span className="block text-[10px] text-slate-400">{l.compte_libelle}</span>}
        </td>
        <td className="px-3 py-2 text-[12.5px] text-slate-800">
          {l.details}
          {l.a_charge && l.a_charge !== 'IIP' && (
            <span className="ml-1.5 text-[9.5px] px-1 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200">
              {l.a_charge}
            </span>
          )}
          {depenses.length > 0 && (
            <button onClick={() => setOuvert(o => !o)} className="ml-2 text-[10.5px] text-iip-turquoise underline">
              {depenses.length} dépense(s)
            </button>
          )}
        </td>
        <td className="px-2 py-2 text-right text-[12px]">{eur(l.prix_unitaire)}</td>
        <td className="px-2 py-2 text-right text-[12px]">{l.quantite}</td>
        <td className="px-2 py-2 text-right text-[12.5px] font-semibold text-iip-blue">{eur(l.total_htva)}</td>
        <td className="px-2 py-2 text-right text-[12px] text-amber-700">{l.engage ? eur(l.engage) : '—'}</td>
        <td className={`px-2 py-2 text-right text-[12.5px] font-semibold ${l.depasse ? 'text-red-600' : 'text-emerald-700'}`}>
          {eur(l.solde)}
        </td>
        <td className="px-2 py-2 text-right whitespace-nowrap">
          {peutEcrire && (
            <>
              <button onClick={onDepense} title="Encoder une dépense"
                className="text-[10.5px] px-1.5 py-0.5 border border-slate-300 rounded mr-1">+ dép.</button>
              <button onClick={onEditer} className="text-slate-400 hover:text-iip-blue mr-1" title="Modifier">✎</button>
              <button onClick={onSupprimer} className="text-slate-300 hover:text-red-500" title="Supprimer">
                <IconTrash size={13} />
              </button>
            </>
          )}
        </td>
      </tr>
      {ouvert && depenses.map(d => (
        <tr key={d.id} className="bg-slate-50/60 border-b border-slate-100">
          <td></td>
          <td className="px-3 py-1 text-[11.5px] text-slate-600" colSpan={3}>
            <span className="text-slate-400 mr-2">{d.date_depense}</span>{d.libelle}
            {d.piece && <span className="text-slate-400 ml-2">pièce {d.piece}</span>}
          </td>
          <td className="px-2 py-1 text-right text-[11.5px]">{eur(d.montant_htva)}</td>
          <td colSpan={2}></td>
          <td className="px-2 py-1 text-right">
            {peutEcrire && (
              <button onClick={() => onSupprimerDepense(d.id)} className="text-slate-300 hover:text-red-500">
                <IconTrash size={12} />
              </button>
            )}
          </td>
        </tr>
      ))}
    </>
  );
}

// ── Formulaire de prévision ────────────────────────────────────────────────
function LigneForm({ form, setForm, comptes, onEnregistrer, onAnnuler }) {
  const total = Number(form.prix_unitaire || 0) * Number(form.quantite || 0);
  const maj = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div className="border border-iip-turquoise/40 rounded-xl p-4 bg-iip-turquoise/5 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-xs md:col-span-2">
          <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Compte général</span>
          <select value={form.compte_ref || ''} onChange={e => {
              const c = comptes.find(x => x.reference === e.target.value);
              setForm(f => ({ ...f, compte_ref: e.target.value,
                taux_tva: c?.tva_defaut != null ? c.tva_defaut : f.taux_tva }));
            }}
            className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white">
            <option value="">— à préciser</option>
            {comptes.map(c => (
              <option key={c.reference} value={c.reference}>{c.reference} — {c.libelle}</option>
            ))}
          </select>
        </label>
        <label className="text-xs md:col-span-2">
          <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
            Détail de la prévision
          </span>
          <input value={form.details || ''} onChange={e => maj('details', e.target.value)}
            placeholder="Ce que couvre la dépense, et pour qui"
            className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white" />
        </label>
        <label className="text-xs">
          <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">À charge de</span>
          <input value={form.a_charge || ''} onChange={e => maj('a_charge', e.target.value)}
            placeholder="IIP, IIP / HELB Santé 50%…"
            className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white" />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs">
            <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">P.U. HTVA</span>
            <input type="number" step="0.01" value={form.prix_unitaire ?? ''}
              onChange={e => maj('prix_unitaire', e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white text-right" />
          </label>
          <label className="text-xs">
            <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Qté</span>
            <input type="number" step="0.5" value={form.quantite ?? ''}
              onChange={e => maj('quantite', e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white text-right" />
          </label>
          <label className="text-xs">
            <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">TVA</span>
            <select value={form.taux_tva ?? 0.21} onChange={e => maj('taux_tva', Number(e.target.value))}
              className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white">
              {[0, 0.06, 0.12, 0.21].map(t => <option key={t} value={t}>{Math.round(t * 100)} %</option>)}
            </select>
          </label>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[12.5px] text-slate-600">
          Total HTVA <b className="text-iip-blue">{eur(total)}</b> ·
          TVAC <b>{eur(total * (1 + Number(form.taux_tva ?? 0.21)))}</b>
        </div>
        <div className="flex gap-2">
          <button onClick={onAnnuler} className="text-sm px-3 py-1.5 rounded-lg border border-slate-300">Annuler</button>
          <button onClick={onEnregistrer} disabled={!form.details}
            className="text-sm px-4 py-1.5 rounded-lg bg-iip-blue text-white font-semibold disabled:opacity-40">
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Encodage d'une dépense ─────────────────────────────────────────────────
function DepenseForm({ ligne, onEnregistrer, onAnnuler }) {
  const [d, setD] = useState({
    ligne_id: ligne.id, libelle: '', montant_htva: '',
    date_depense: new Date().toISOString().slice(0, 10), piece: '',
    taux_tva: ligne.taux_tva,
  });
  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onAnnuler()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mt-24 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <IconCash size={18} className="text-iip-turquoise" />
          <span className="font-semibold text-iip-blue">Encoder une dépense</span>
        </div>
        <div className="text-[12px] text-slate-500">
          Sur la prévision « {ligne.details} » — solde actuel <b>{eur(ligne.solde)}</b>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs col-span-2">
            <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Libellé</span>
            <input value={d.libelle} onChange={e => setD(x => ({ ...x, libelle: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs">
            <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Montant HTVA</span>
            <input type="number" step="0.01" value={d.montant_htva}
              onChange={e => setD(x => ({ ...x, montant_htva: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-right" />
          </label>
          <label className="text-xs">
            <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Date</span>
            <input type="date" value={d.date_depense}
              onChange={e => setD(x => ({ ...x, date_depense: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs col-span-2">
            <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Pièce</span>
            <input value={d.piece} onChange={e => setD(x => ({ ...x, piece: e.target.value }))}
              placeholder="N° de facture ou de bon de commande"
              className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onAnnuler} className="text-sm px-3 py-1.5 rounded-lg border border-slate-300">Annuler</button>
          <button onClick={() => onEnregistrer(d)} disabled={!d.libelle || !d.montant_htva}
            className="text-sm px-4 py-1.5 rounded-lg bg-iip-blue text-white font-semibold disabled:opacity-40">
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Vue d'ensemble ─────────────────────────────────────────────────────────
function SyntheseBudget({ synthese, onOuvrir }) {
  if (!synthese) return <div className="py-10 text-center text-sm text-slate-400">Chargement…</div>;
  if (!synthese.sections?.length) {
    return (
      <div className="py-10 text-center text-sm text-slate-400 border-2 border-dashed rounded-xl">
        Aucun budget encodé pour {synthese.annee}.
      </div>
    );
  }
  const tot = synthese.sections.reduce((s, k) => ({
    prevu: s.prevu + k.prevu, engage: s.engage + k.engage,
  }), { prevu: 0, engage: 0 });

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
            <th className="px-3 py-2 text-left">Section</th>
            <th className="px-3 py-2 text-right w-32">Prévu HTVA</th>
            <th className="px-3 py-2 text-right w-32">Engagé</th>
            <th className="px-3 py-2 text-right w-32">Solde</th>
            <th className="px-3 py-2 w-40">Consommation</th>
          </tr>
        </thead>
        <tbody>
          {synthese.sections.map(s => (
            <tr key={s.section} onClick={() => onOuvrir(s.section)}
              className="border-b border-slate-100 hover:bg-slate-50/60 cursor-pointer">
              <td className="px-3 py-2 text-[12.5px] text-slate-800">
                {s.section}
                <span className="block text-[10px] text-slate-400">
                  {s.lignes} prévision(s) · {s.depenses} dépense(s)
                </span>
              </td>
              <td className="px-3 py-2 text-right font-semibold text-iip-blue">{eur(s.prevu)}</td>
              <td className="px-3 py-2 text-right text-amber-700">{eur(s.engage)}</td>
              <td className={`px-3 py-2 text-right font-semibold ${s.solde < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                {eur(s.solde)}
              </td>
              <td className="px-3 py-2">
                <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div className={`h-full ${s.taux > 100 ? 'bg-red-500' : s.taux > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: Math.min(100, s.taux || 0) + '%' }} />
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">{s.taux != null ? s.taux + ' %' : '—'}</div>
              </td>
            </tr>
          ))}
          <tr className="bg-slate-50 font-semibold">
            <td className="px-3 py-2 text-[12.5px] text-iip-blue">Total</td>
            <td className="px-3 py-2 text-right text-iip-blue">{eur(tot.prevu)}</td>
            <td className="px-3 py-2 text-right text-amber-700">{eur(tot.engage)}</td>
            <td className={`px-3 py-2 text-right ${tot.prevu - tot.engage < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
              {eur(tot.prevu - tot.engage)}
            </td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
