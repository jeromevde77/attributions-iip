import { useEffect, useState } from 'react';
import {
  IconX, IconPrinter, IconAlertTriangle, IconCertificate,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * LA LISTE DES ÉTUDIANTS DIPLÔMÉS.
 *
 * Le document que la Fédération réclame en fin de cycle. Il se tapait à la main
 * dans un Word recopié d'année en année, en relisant les dossiers un par un
 * pour savoir qui avait terminé.
 *
 * Seuls les parcours COMPLETS y figurent : un diplôme ne se délivre pas à
 * moitié, et faire défiler ceux qui n'ont pas tout acquis, c'est offrir de les
 * cocher. Parmi eux, Lucie coche ceux qui ont terminé cette année ; les
 * diplômés des années précédentes restent listés, décochés, car on réédite
 * parfois une liste ancienne.
 *
 * Les dossiers incomplets sont signalés AVANT l'impression : une date de
 * naissance manquante fait un document à refaire.
 */
export default function ListeDiplomes({ annee, onClose }) {
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [etat, setEtat] = useState(null);
  const [choisis, setChoisis] = useState(new Set());
  const [lieu, setLieu] = useState('');
  const [date, setDate] = useState('');
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    // Les référentiels sont montés sur /api/ref, non /api/referentiels :
    // l'appel tombait donc dans le vide et la liste restait déserte.
    fetch('/api/ref/sections', { headers: authHeaders() })
      .then(r => r.json())
      .then(l => setSections(Array.isArray(l) ? l : (l.sections || [])))
      .catch(() => {});
  }, []);

  async function charger(code) {
    setSection(code); setEtat(null); setErreur(null);
    if (!code) return;
    try {
      const rep = await fetch(`/api/diplomes/candidats`
        + `?annee=${encodeURIComponent(annee)}&section=${encodeURIComponent(code)}`,
      { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error);
      setEtat(j);
      setChoisis(new Set(j.proposes || []));
    } catch (e) { setErreur(e.message); }
  }

  function basculer(id) {
    setChoisis(s => {
      const t = new Set(s);
      if (t.has(id)) t.delete(id); else t.add(id);
      return t;
    });
  }

  async function imprimer() {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/diplomes/document', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ section, annee, etudiants: [...choisis], lieu, date }),
      });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error);
      if (j.manques?.length) {
        setErreur(`Document produit, mais des dossiers sont incomplets : ${
          j.manques.slice(0, 4).join(' · ')}${j.manques.length > 4 ? ' …' : ''}`);
      }
      const f = window.open('', '_blank');
      if (!f) { setErreur("Le navigateur a bloqué la fenêtre d'impression."); return; }
      f.document.write(j.html); f.document.close();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const cands = etat?.candidats || [];

  const Ligne = ({ c }) => (
    <label className="flex items-start gap-2 px-3 py-1.5 border-b border-slate-50
                      hover:bg-slate-50 cursor-pointer">
      <input type="checkbox" checked={choisis.has(c.id)} onChange={() => basculer(c.id)}
        className="mt-0.5 w-4 h-4 accent-iip-blue flex-none" />
      <span className="flex-1 min-w-0">
        <span className="text-[12.5px] text-slate-800">
          <b>{c.nom}</b> {c.prenom}
        </span>
        <span className="block text-[11px] text-slate-500">
          {c.reussies}/{c.total} unités · {c.ects} ECTS
          {c.annee_fin ? ` · dernière en ${c.annee_fin}` : ''}
          {c.manquantes.length ? ` · manque UE ${c.manquantes.slice(0, 6).join(', ')}` : ''}
        </span>
        {!!c.manques.length && (
          <span className="block text-[11px] text-amber-700 flex items-center gap-1">
            <IconAlertTriangle size={11} /> dossier incomplet : {c.manques.join(', ')}
          </span>
        )}
      </span>
      <span className={`flex-none text-[10px] px-2 py-0.5 rounded-full font-semibold ${c.complet
        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
        : 'bg-slate-50 text-slate-500 border border-slate-200'}`}>
        {c.complet ? 'complet' : 'en cours'}
      </span>
    </label>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mt-8
                      max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex-none px-5 py-3 border-b border-slate-100 flex items-start
                        justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-iip-blue flex items-center gap-2">
              <IconCertificate size={17} className="text-iip-gold" />
              Liste des étudiants diplômés
            </h3>
            <p className="text-[12px] text-slate-500">
              Document de la Fédération · année académique {String(annee).replace('-', '/')}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <IconX size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {erreur && (
            <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                            text-[12px] text-amber-900 flex items-start gap-1.5">
              <IconAlertTriangle size={14} className="mt-0.5 flex-none" /> {erreur}
            </div>
          )}

          <label className="block">
            <span className="block text-[11px] font-semibold text-slate-500 mb-0.5">Section</span>
            <select value={section} onChange={e => charger(e.target.value)}
              className="w-full text-[12.5px] border border-slate-300 rounded-lg px-2 py-1.5">
              <option value="">— choisir la section —</option>
              {sections.map(s => (
                <option key={s.code} value={s.code}>{s.code} — {s.libelle}</option>
              ))}
            </select>
          </label>

          {etat?.avertissement && (
            <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                            text-[12px] text-amber-900">{etat.avertissement}</div>
          )}

          {etat && !!cands.length && (
            <>
              <p className="text-[11.5px] text-slate-500">
                {etat.requises.length} unités composent la section
                {etat.ects_total ? `, soit ${etat.ects_total} ECTS` : ''}.
                Seuls les parcours complets figurent ici ; sont cochés ceux qui ont terminé
                cette année.
              </p>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-800">
                  Parcours complet ({cands.length})
                </div>
                {cands.map(c => <Ligne key={c.id} c={c} />)}
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="block text-[11px] font-semibold text-slate-500 mb-0.5">Fait à</span>
                  <input value={lieu} placeholder="Anderlecht"
                    onChange={e => setLieu(e.target.value)}
                    className="w-full text-[12.5px] border border-slate-300 rounded-lg px-2 py-1.5" />
                </label>
                <label className="block">
                  <span className="block text-[11px] font-semibold text-slate-500 mb-0.5">Le</span>
                  <input value={date} placeholder="laisser vide pour compléter à la main"
                    onChange={e => setDate(e.target.value)}
                    className="w-full text-[12.5px] border border-slate-300 rounded-lg px-2 py-1.5" />
                </label>
              </div>
            </>
          )}

          {etat && !cands.length && !etat.avertissement && (
            <div className="py-6 text-center text-[12.5px] text-slate-500">
              Aucun étudiant n'a encore acquis toutes les unités de cette section.
            </div>
          )}
        </div>

        <div className="flex-none px-5 py-3 border-t border-slate-100 flex items-center
                        justify-between gap-2">
          <span className="text-[11.5px] text-slate-500">
            {choisis.size} étudiant(s) sur la liste
          </span>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-3 py-1.5 text-[12.5px] rounded-lg border border-slate-300 text-slate-600">
              Fermer
            </button>
            <button onClick={imprimer} disabled={enCours || !choisis.size}
              className="px-4 py-2 text-[12.5px] rounded-lg bg-iip-blue text-white font-semibold
                         disabled:opacity-40 flex items-center gap-1.5">
              <IconPrinter size={14} /> Produire la liste
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
