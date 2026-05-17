import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';

function Kpi({ label, value, sub, color = 'iip-gold' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`text-3xl font-bold mt-1 text-${color}`}>{value ?? '—'}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [k, setK] = useState(null);
  const [section, setSection] = useState([]);

  useEffect(() => {
    api.totaux().then(setK).catch(console.error);
    api.pilotageSectionNiveau().then(rows => {
      // Agréger par section uniquement (pour le graphe)
      const map = {};
      for (const r of rows) {
        if (!map[r.section]) map[r.section] = { section: r.section, IIP: 0, HELB: 0 };
        map[r.section].IIP += Number(r.iip || 0);
        map[r.section].HELB += Number(r.helb || 0);
      }
      setSection(Object.values(map).sort((a,b) => (b.IIP+b.HELB) - (a.IIP+a.HELB)));
    }).catch(console.error);
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-title text-iip-gold mb-6">Tableau de bord 2025-2026</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Kpi label="Attributions" value={k?.nb_attributions} sub={`${k?.nb_ue || 0} UE, ${k?.nb_professeurs || 0} profs`} />
        <Kpi label="Périodes IIP"  value={k?.total_iip?.toLocaleString('fr-BE')} color="iip-gold" />
        <Kpi label="Périodes HELB" value={k?.total_helb?.toLocaleString('fr-BE')} color="iip-mauve" />
        <Kpi label="Solde dispo" value={k?.solde?.toLocaleString('fr-BE')}
             sub={`sur ${k?.periodes_disponibles?.toLocaleString('fr-BE')} disponibles`}
             color={k?.solde >= 0 ? 'green-600' : 'red-600'} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h2 className="font-title text-lg text-iip-gold mb-4">Répartition des périodes par section</h2>
        <ResponsiveContainer width="100%" height={380}>
          <BarChart data={section}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="section" tick={{ fontSize: 12 }} />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="IIP"  stackId="a" fill="#1B2B4B" />
            <Bar dataKey="HELB" stackId="a" fill="#00AACC" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-6 bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h2 className="font-title text-lg text-iip-gold mb-4">Coût dotation total</h2>
        <div className="text-3xl font-bold text-iip-orange">
          {k?.cout_dotation_total?.toLocaleString('fr-BE', { maximumFractionDigits: 0 })}
        </div>
        <div className="text-sm text-gray-500 mt-1">Périodes pondérées (SUP × 1.5, DS × 1.25)</div>
      </div>
    </div>
  );
}
