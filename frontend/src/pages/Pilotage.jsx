import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

function num(v, d = 0) { return v == null ? '—' : Number(v).toLocaleString('fr-BE', { maximumFractionDigits: d }); }

export default function Pilotage() {
  const [secNiv, setSecNiv] = useState([]);
  const [secStat, setSecStat] = useState([]);
  const [secDetail, setSecDetail] = useState([]);
  const [doc23, setDoc23] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.pilotageSectionNiveau(),
      api.pilotageSectionStatut(),
      api.pilotageSectionDetail(),
      api.doc23()
    ]).then(([a,b,c,d]) => { setSecNiv(a); setSecStat(b); setSecDetail(c); setDoc23(d); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement…</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <h1 className="text-2xl font-title text-iip-gold">Pilotage 2025-2026</h1>

      {/* Tableau8 : par section × niveau */}
      <section className="bg-white rounded-lg border border-gray-200 overflow-auto">
        <h2 className="font-title text-lg text-iip-gold p-3 border-b">Par section × niveau (= Tableau8)</h2>
        <table className="grid-excel">
          <thead>
            <tr>
              <th>Section</th><th>Niveau</th>
              <th className="text-right">Périodes att.</th>
              <th className="text-right">IIP</th>
              <th className="text-right">HELB</th>
              <th className="text-right">Coût (Per B)</th>
              <th className="text-right">Q1</th>
              <th className="text-right">Q2</th>
              <th className="text-right">Q1/Q2</th>
              <th className="text-right">S-D</th>
              <th className="text-right">J-J</th>
            </tr>
          </thead>
          <tbody>
            {secNiv.map((r, i) => (
              <tr key={i}>
                <td className="font-medium">{r.section}</td>
                <td>{r.bloc}</td>
                <td className="num">{num(r.periodes_att)}</td>
                <td className="num text-iip-gold">{num(r.iip)}</td>
                <td className="num text-iip-mauve">{num(r.helb)}</td>
                <td className="num">{num(r.per_b)}</td>
                <td className="num">{num(r.q1)}</td>
                <td className="num">{num(r.q2)}</td>
                <td className="num">{num(r.q1q2)}</td>
                <td className="num">{num(r.sd, 1)}</td>
                <td className="num">{num(r.jj, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Tableau11 : par section × statut */}
      <section className="bg-white rounded-lg border border-gray-200 overflow-auto">
        <h2 className="font-title text-lg text-iip-gold p-3 border-b">Par section × statut (= Tableau11)</h2>
        <table className="grid-excel">
          <thead>
            <tr>
              <th>Section</th>
              <th className="text-right">CC</th>
              <th className="text-right">EXP</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {secStat.map((r, i) => (
              <tr key={i}>
                <td className="font-medium">{r.section}</td>
                <td className="num">{num(r.cc)}</td>
                <td className="num">{num(r.exp)}</td>
                <td className="num font-semibold">{num(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Tableau18 : détail ETP et coordinations */}
      <section className="bg-white rounded-lg border border-gray-200 overflow-auto">
        <h2 className="font-title text-lg text-iip-gold p-3 border-b">Détail ETP et coordinations (= Tableau18)</h2>
        <table className="grid-excel">
          <thead>
            <tr>
              <th>Section</th><th>Niv.</th>
              <th className="text-right">CT</th><th className="text-right">PP</th><th className="text-right">ETP IIP</th>
              <th className="text-right">ETP HELB</th>
              <th className="text-right">COCUR</th><th className="text-right">COSTA</th><th className="text-right">COTFE</th>
              <th className="text-right">COPEDA</th><th className="text-right">COQUAL</th><th className="text-right">CREF</th>
              <th className="text-right">EI</th><th className="text-right">ES</th>
            </tr>
          </thead>
          <tbody>
            {secDetail.map((r, i) => (
              <tr key={i}>
                <td>{r.section}</td><td>{r.bloc}</td>
                <td className="num">{num(r.ct)}</td>
                <td className="num">{num(r.pp)}</td>
                <td className="num text-iip-gold font-semibold">{num(r.etp_iip, 2)}</td>
                <td className="num text-iip-mauve font-semibold">{num(r.etp_helb, 2)}</td>
                <td className="num">{num(r.cocur)}</td>
                <td className="num">{num(r.costa)}</td>
                <td className="num">{num(r.cotfe)}</td>
                <td className="num">{num(r.copeda)}</td>
                <td className="num">{num(r.coqual)}</td>
                <td className="num">{num(r.cref)}</td>
                <td className="num">{num(r.ei)}</td>
                <td className="num">{num(r.es)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* DOC2-3 */}
      <section className="bg-white rounded-lg border border-gray-200 overflow-auto">
        <h2 className="font-title text-lg text-iip-gold p-3 border-b">DOC 2-3 — Concordance par UE</h2>
        <table className="grid-excel">
          <thead>
            <tr>
              <th>UE</th><th>Nom</th><th>Section</th><th>Niveau</th>
              <th className="text-right">DOC2 cours</th><th className="text-right">DOC2 auto</th><th className="text-right">DOC2 total</th>
              <th className="text-right">DP cours</th><th className="text-right">DP auto</th><th className="text-right">DP total</th>
              <th className="text-right">Écart</th>
            </tr>
          </thead>
          <tbody>
            {doc23.map((r, i) => {
              const ecart = (r.total_doc2 || 0) - (r.total_dp || 0);
              return (
                <tr key={i}>
                  <td>{r.ue_num}</td>
                  <td className="text-xs">{r.ue_nom}</td>
                  <td>{r.section}</td>
                  <td>{r.bloc}</td>
                  <td className="num">{num(r.per_cours_doc2)}</td>
                  <td className="num">{num(r.per_auto_doc2)}</td>
                  <td className="num font-semibold">{num(r.total_doc2)}</td>
                  <td className="num">{num(r.per_cours_dp)}</td>
                  <td className="num">{num(r.per_auto_dp)}</td>
                  <td className="num font-semibold">{num(r.total_dp)}</td>
                  <td className={`num ${Math.abs(ecart) > 0.5 ? 'text-red-600 font-bold' : 'text-green-600'}`}>{num(ecart)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
