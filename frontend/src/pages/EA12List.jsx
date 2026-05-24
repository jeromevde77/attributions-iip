import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getAnnee } from '../lib/api.js';

export default function EA12List() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { setRows(await api.ea12List()); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function supprimer(id, e) {
    e.stopPropagation();
    if (!confirm('Supprimer cet EA12 ?')) return;
    await api.ea12Delete(id);
    load();
  }
  async function telecharger(row, e) {
    e.stopPropagation();
    const fn = `EA12_${row.prof_nom}_${row.prof_prenom}_${row.annee_scolaire}.docx`.replace(/\s+/g, '_');
    try { await api.ea12Document(row.id, fn); } catch (err) { alert(err.message); }
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-xl font-title text-iip-gold mb-4">Documents EA12</h1>
      {loading ? <div className="text-gray-400">Chargement…</div> : rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
          Aucun EA12 pour l’instant. Créez-en un depuis la fiche d’un professeur (bouton « Nouvel EA12 »).
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left text-xs">
              <tr>
                <th className="px-4 py-2">Professeur</th><th className="px-4 py-2">Année</th>
                <th className="px-4 py-2">Variante</th><th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2">Modifié</th><th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} onClick={() => navigate(`/ea12/${row.id}`)}
                  className="border-t border-gray-100 hover:bg-iip-gold/5 cursor-pointer">
                  <td className="px-4 py-2 font-medium">{row.prof_nom} {row.prof_prenom}</td>
                  <td className="px-4 py-2">{row.annee_scolaire}</td>
                  <td className="px-4 py-2">{row.variante}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${row.statut_doc === 'genere' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {row.statut_doc === 'genere' ? 'Généré' : 'Brouillon'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{(row.modifie_le || '').slice(0, 16).replace('T', ' ')}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button onClick={e => telecharger(row, e)} className="text-iip-gold hover:underline text-xs mr-3">Word</button>
                    <button onClick={e => supprimer(row.id, e)} className="text-red-500 hover:underline text-xs">Supprimer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
