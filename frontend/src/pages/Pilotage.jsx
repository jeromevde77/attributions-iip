import { useEffect, useState, useMemo } from 'react';
import { api } from '../lib/api.js';

function n(v, d = 0) { return v == null ? '—' : Number(v).toLocaleString('fr-BE', { maximumFractionDigits: d }); }

function Kpi({ label, value, sub, color = 'text-iip-gold' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value ?? '—'}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

export default function Pilotage() {
  const [totaux, setTotaux] = useState(null);
  const [secNiv, setSecNiv] = useState([]);
  const [secStat, setSecStat] = useState([]);
  const [secDetail, setSecDetail] = useState([]);
  const [doc23, setDoc23] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openSections, setOpenSections] = useState({});

  useEffect(() => {
    Promise.all([
      api.totaux(),
      api.pilotageSectionNiveau(),
      api.pilotageSectionStatut(),
      api.pilotageSectionDetail(),
      api.doc23()
    ]).then(([t, a, b, c, d]) => {
      setTotaux(t); setSecNiv(a); setSecStat(b); setSecDetail(c); setDoc23(d);
    }).finally(() => setLoading(false));
  }, []);

  // Agréger secNiv par section (pour résumé)
  const sectionSummary = useMemo(() => {
    const map = {};
    for (const r of secNiv) {
      if (!map[r.section]) map[r.section] = { section: r.section, per: 0, iip: 0, helb: 0, cout: 0, blocs: [] };
      map[r.section].per  += Number(r.periodes_att || 0);
      map[r.section].iip  += Number(r.iip || 0);
      map[r.section].helb += Number(r.helb || 0);
      map[r.section].cout += Number(r.per_b || 0);
      map[r.section].blocs.push(r);
    }
    return Object.values(map).sort((a, b) => b.per - a.per);
  }, [secNiv]);

  // Agréger doc23 par section
  const doc23BySection = useMemo(() => {
    const map = {};
    for (const r of doc23) {
      const sec = r.section || '?';
      if (!map[sec]) map[sec] = [];
      map[sec].push(r);
    }
    return map;
  }, [doc23]);

  // Statut par section
  const statutBySection = useMemo(() => {
    const map = {};
    for (const r of secStat) map[r.section] = r;
    return map;
  }, [secStat]);

  // Détail ETP par section
  const detailBySection = useMemo(() => {
    const map = {};
    for (const r of secDetail) {
      if (!map[r.section]) map[r.section] = [];
      map[r.section].push(r);
    }
    return map;
  }, [secDetail]);

  function toggleSection(sec) {
    setOpenSections(p => ({ ...p, [sec]: !p[sec] }));
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement…</div>;

  // Totaux globaux
  const totPerDoc2 = doc23.reduce((s, r) => s + (r.total_doc2 || 0), 0);
  const totPerDP   = doc23.reduce((s, r) => s + (r.total_dp || 0), 0);
  const nbEcartsNonZero = doc23.filter(r => Math.abs((r.total_doc2 || 0) - (r.total_dp || 0)) > 0.5).length;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl font-title text-iip-gold">Pilotage 2025-2026</h1>

      {/* ═══════════════ KPIs ═══════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Attributions" value={totaux?.nb_attributions} sub={`${totaux?.nb_ue || 0} UE · ${totaux?.nb_professeurs || 0} profs`} />
        <Kpi label="Périodes totales" value={n(totaux?.total_periodes)} />
        <Kpi label="IIP" value={n(totaux?.total_iip)} color="text-iip-gold" />
        <Kpi label="HELB" value={n(totaux?.total_helb)} color="text-iip-mauve" />
        <Kpi label="Solde dispo"
          value={totaux?.solde != null ? n(totaux.solde) : '—'}
          sub={totaux?.periodes_disponibles ? `sur ${n(totaux.periodes_disponibles)}` : ''}
          color={totaux?.solde >= 0 ? 'text-green-600' : 'text-red-600'} />
      </div>

      {/* ═══════════════ Récap global par section ═══════════════ */}
      <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <h2 className="font-title text-lg text-iip-gold p-3 border-b bg-iip-gold/5">Récapitulatif par section</h2>
        <div className="overflow-auto">
          <table className="grid-excel w-full">
            <thead>
              <tr>
                <th className="text-left">Section</th>
                <th className="text-right">Périodes</th>
                <th className="text-right">IIP</th>
                <th className="text-right">HELB</th>
                <th className="text-right">Coût dot.</th>
                <th className="text-right">CC</th>
                <th className="text-right">EXP</th>
                <th className="text-right">% IIP</th>
              </tr>
            </thead>
            <tbody>
              {sectionSummary.map(s => {
                const st = statutBySection[s.section];
                const pctIIP = s.per > 0 ? Math.round(s.iip / s.per * 100) : 0;
                return (
                  <tr key={s.section}>
                    <td className="font-semibold text-iip-gold">{s.section}</td>
                    <td className="num font-semibold">{n(s.per)}</td>
                    <td className="num text-iip-gold">{n(s.iip)}</td>
                    <td className="num text-iip-mauve">{n(s.helb)}</td>
                    <td className="num">{n(s.cout)}</td>
                    <td className="num">{n(st?.cc)}</td>
                    <td className="num">{n(st?.exp)}</td>
                    <td className="num">
                      <div className="flex items-center gap-1 justify-end">
                        <div className="w-12 h-2 bg-gray-200 rounded overflow-hidden">
                          <div className="h-full bg-iip-gold rounded" style={{ width: pctIIP + '%' }} />
                        </div>
                        <span className="text-xs">{pctIIP}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {/* Ligne total */}
              <tr className="font-bold bg-gray-50">
                <td>TOTAL</td>
                <td className="num">{n(sectionSummary.reduce((s, r) => s + r.per, 0))}</td>
                <td className="num text-iip-gold">{n(sectionSummary.reduce((s, r) => s + r.iip, 0))}</td>
                <td className="num text-iip-mauve">{n(sectionSummary.reduce((s, r) => s + r.helb, 0))}</td>
                <td className="num">{n(sectionSummary.reduce((s, r) => s + r.cout, 0))}</td>
                <td className="num">{n(secStat.reduce((s, r) => s + (r.cc || 0), 0))}</td>
                <td className="num">{n(secStat.reduce((s, r) => s + (r.exp || 0), 0))}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ═══════════════ Détail par section (accordéons) ═══════════════ */}
      <section>
        <h2 className="font-title text-lg text-iip-gold mb-2">Détail par section</h2>
        <div className="space-y-2">
          {sectionSummary.map(sec => {
            const open = openSections[sec.section];
            const detail = detailBySection[sec.section] || [];
            const docs = doc23BySection[sec.section] || [];
            return (
              <div key={sec.section} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {/* Bandeau section */}
                <button onClick={() => toggleSection(sec.section)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-iip-gold/5 transition text-left bg-iip-gold/5">
                  <span className={`text-iip-gold font-bold transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
                  <span className="font-bold text-iip-gold text-lg">{sec.section}</span>
                  <div className="flex items-center gap-4 text-xs text-gray-500 ml-auto">
                    <span><b className="text-iip-gold">{n(sec.per)}</b> per.</span>
                    <span>IIP {n(sec.iip)}</span>
                    <span>HELB {n(sec.helb)}</span>
                    <span>Coût {n(sec.cout)}</span>
                  </div>
                </button>

                {open && (
                  <div className="border-t border-gray-200 p-3 space-y-4">
                    {/* Sous-tableau : par bloc/niveau */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-1">Par niveau (bloc)</h3>
                      <div className="overflow-auto">
                        <table className="grid-excel w-full text-sm">
                          <thead><tr>
                            <th className="text-left">Bloc</th>
                            <th className="text-right">Périodes</th>
                            <th className="text-right">IIP</th>
                            <th className="text-right">HELB</th>
                            <th className="text-right">Coût dot.</th>
                            <th className="text-right">Q1</th>
                            <th className="text-right">Q2</th>
                            <th className="text-right">Q1/Q2</th>
                          </tr></thead>
                          <tbody>
                            {sec.blocs.map((r, i) => (
                              <tr key={i}>
                                <td className="font-medium">{r.bloc || '—'}</td>
                                <td className="num">{n(r.periodes_att)}</td>
                                <td className="num text-iip-gold">{n(r.iip)}</td>
                                <td className="num text-iip-mauve">{n(r.helb)}</td>
                                <td className="num">{n(r.per_b)}</td>
                                <td className="num">{n(r.q1)}</td>
                                <td className="num">{n(r.q2)}</td>
                                <td className="num">{n(r.q1q2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Sous-tableau : ETP */}
                    {detail.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-1">ETP par niveau</h3>
                        <div className="overflow-auto">
                          <table className="grid-excel w-full text-sm">
                            <thead><tr>
                              <th className="text-left">Bloc</th>
                              <th className="text-right">CT</th>
                              <th className="text-right">PP</th>
                              <th className="text-right">ETP IIP</th>
                              <th className="text-right">ETP HELB</th>
                            </tr></thead>
                            <tbody>
                              {detail.map((r, i) => (
                                <tr key={i}>
                                  <td className="font-medium">{r.bloc || '—'}</td>
                                  <td className="num">{n(r.ct)}</td>
                                  <td className="num">{n(r.pp)}</td>
                                  <td className="num text-iip-gold font-semibold">{n(r.etp_iip, 2)}</td>
                                  <td className="num text-iip-mauve font-semibold">{n(r.etp_helb, 2)}</td>
                                </tr>
                              ))}
                              {detail.length > 1 && (
                                <tr className="font-bold bg-gray-50">
                                  <td>Total</td>
                                  <td className="num">{n(detail.reduce((s, r) => s + (r.ct || 0), 0))}</td>
                                  <td className="num">{n(detail.reduce((s, r) => s + (r.pp || 0), 0))}</td>
                                  <td className="num text-iip-gold">{n(detail.reduce((s, r) => s + (r.etp_iip || 0), 0), 2)}</td>
                                  <td className="num text-iip-mauve">{n(detail.reduce((s, r) => s + (r.etp_helb || 0), 0), 2)}</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Sous-tableau : concordance UE (DOC 2-3) */}
                    {docs.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-1">Concordance UE (DOC 2-3)</h3>
                        <div className="overflow-auto max-h-[40vh]">
                          <table className="grid-excel w-full text-sm">
                            <thead><tr>
                              <th className="text-left">UE</th>
                              <th className="text-left">Nom</th>
                              <th className="text-left">Bloc</th>
                              <th className="text-right">Prévu</th>
                              <th className="text-right">Attribué</th>
                              <th className="text-right">Écart</th>
                            </tr></thead>
                            <tbody>
                              {docs.map((r, i) => {
                                const ecart = (r.total_doc2 || 0) - (r.total_dp || 0);
                                return (
                                  <tr key={i}>
                                    <td className="font-mono text-xs">{r.ue_num}</td>
                                    <td className="text-xs truncate max-w-[200px]">{r.ue_nom}</td>
                                    <td className="text-xs">{r.bloc || '—'}</td>
                                    <td className="num">{n(r.total_doc2)}</td>
                                    <td className="num">{n(r.total_dp)}</td>
                                    <td className={`num font-semibold ${Math.abs(ecart) > 0.5 ? 'text-red-600' : 'text-green-600'}`}>
                                      {ecart > 0 ? '+' : ''}{n(ecart)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ═══════════════ Concordance globale DOC 2-3 ═══════════════ */}
      <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <h2 className="font-title text-lg text-iip-gold p-3 border-b bg-iip-gold/5">
          Concordance DOC 2-3 — Vue globale
          <span className="ml-3 text-sm font-normal text-gray-500">
            Prévu : {n(totPerDoc2)} · Attribué : {n(totPerDP)}
            {nbEcartsNonZero > 0 && <span className="text-red-600 ml-2">· {nbEcartsNonZero} UE avec écart</span>}
          </span>
        </h2>
        <div className="overflow-auto max-h-[50vh]">
          <table className="grid-excel w-full">
            <thead>
              <tr>
                <th className="text-left">UE</th>
                <th className="text-left">Nom</th>
                <th className="text-left">Section</th>
                <th className="text-left">Bloc</th>
                <th className="text-right">Prévu cours</th>
                <th className="text-right">Prévu aut.</th>
                <th className="text-right">Prévu total</th>
                <th className="text-right">Attr. cours</th>
                <th className="text-right">Attr. aut.</th>
                <th className="text-right">Attr. total</th>
                <th className="text-right">Écart</th>
              </tr>
            </thead>
            <tbody>
              {doc23.map((r, i) => {
                const ecart = (r.total_doc2 || 0) - (r.total_dp || 0);
                return (
                  <tr key={i} className={Math.abs(ecart) > 0.5 ? 'bg-red-50' : ''}>
                    <td className="font-mono text-xs">{r.ue_num}</td>
                    <td className="text-xs truncate max-w-[200px]">{r.ue_nom}</td>
                    <td className="text-xs">{r.section}</td>
                    <td className="text-xs">{r.bloc || '—'}</td>
                    <td className="num">{n(r.per_cours_doc2)}</td>
                    <td className="num">{n(r.per_auto_doc2)}</td>
                    <td className="num font-semibold">{n(r.total_doc2)}</td>
                    <td className="num">{n(r.per_cours_dp)}</td>
                    <td className="num">{n(r.per_auto_dp)}</td>
                    <td className="num font-semibold">{n(r.total_dp)}</td>
                    <td className={`num font-bold ${Math.abs(ecart) > 0.5 ? 'text-red-600' : 'text-green-600'}`}>
                      {ecart > 0 ? '+' : ''}{n(ecart)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
