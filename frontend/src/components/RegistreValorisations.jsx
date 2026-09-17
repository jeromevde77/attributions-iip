import { useEffect, useMemo, useState } from 'react';
import { IconCertificate, IconSearch } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { Fenetre } from './ui.jsx';

/**
 * LE REGISTRE DES VALORISATIONS — QUI EN A, ET LESQUELLES.
 *
 * Les valorisations ne se lisaient que fiche par fiche. Pour savoir qui en
 * avait, il fallait ouvrir cinq cent quatre-vingt-huit dossiers : on ne le
 * faisait pas, donc on ne savait pas — ni combien de demandes l'année avait
 * portées, ni lesquelles avaient été refusées, ni quelles unités revenaient
 * assez souvent pour poser une question sur le programme.
 *
 * Une ligne par valorisation, l'étudiant devant, et un clic ouvre sa fiche :
 * ce qui manquait est une LECTURE, pas un comptage de plus.
 */
export default function RegistreValorisations({ onClose, onOuvrirEtudiant }) {
  const [annee, setAnnee] = useState(getAnnee());
  const [decision, setDecision] = useState('');
  const [section, setSection] = useState('');
  const [recherche, setRecherche] = useState('');
  const [lignes, setLignes] = useState(null);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (annee) qs.set('annee', annee);
    if (section) qs.set('section', section);
    if (decision) qs.set('decision', decision);
    setLignes(null);
    fetch(`/api/etudiants/valorisations/registre?${qs}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : []))
      .then(l => setLignes(Array.isArray(l) ? l : []))
      .catch(() => setLignes([]));
  }, [annee, section, decision]);

  const sections = useMemo(() => [...new Set(
    (lignes || []).map(l => l.section).filter(Boolean))].sort(), [lignes]);

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return lignes || [];
    return (lignes || []).filter(l =>
      `${l.nom} ${l.prenom}`.toLowerCase().includes(q)
      || String(l.ue_num).includes(q)
      || (l.ue_nom || '').toLowerCase().includes(q));
  }, [lignes, recherche]);

  // Les étudiants, pas les lignes : c'est le nombre que l'on cite en réunion.
  const combienEtudiants = new Set((visibles || []).map(l => l.etudiant_id)).size;
  const refus = (visibles || []).filter(l => l.decision === 'refusee').length;

  const annees = useMemo(() => {
    const a = new Set([getAnnee(), ...(lignes || []).map(l => l.annee_scolaire)]);
    return [...a].filter(Boolean).sort().reverse();
  }, [lignes]);

  return (
    <Fenetre icone={IconCertificate} large="grande" onFermer={onClose}
      titre="Valorisation des acquis"
      sous="Les demandes de l'année, accordées et refusées">
      <div className="flex-1 min-h-0 flex flex-col">

        <div className="flex-none flex flex-wrap items-center gap-2 px-5 py-3
                        border-b border-slate-200">
          <select value={annee} onChange={e => setAnnee(e.target.value)}
            className="controle text-[13px]">
            <option value="">Toutes les années</option>
            {annees.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={section} onChange={e => setSection(e.target.value)}
            className="controle text-[13px]">
            <option value="">Toutes les sections</option>
            {sections.map(sx => <option key={sx} value={sx}>{sx}</option>)}
          </select>
          <select value={decision} onChange={e => setDecision(e.target.value)}
            className="controle text-[13px]">
            <option value="">Accordées et refusées</option>
            <option value="accordee">Accordées</option>
            <option value="refusee">Refusées</option>
          </select>
          <div className="relative">
            <IconSearch size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={recherche} onChange={e => setRecherche(e.target.value)}
              placeholder="Un nom, une unité…" className="controle pl-8 text-[13px]" />
          </div>
          <span className="ml-auto text-[12px] text-slate-500">
            {combienEtudiants} étudiant(s) · {visibles.length} valorisation(s)
            {refus > 0 && <span className="text-[#9D4A38]"> · {refus} refusée(s)</span>}
          </span>
        </div>

        <div className="flex-1 overflow-auto min-h-0">
          {!lignes ? (
            <div className="p-6 text-[13px] text-slate-400">Chargement…</div>
          ) : !visibles.length ? (
            <div className="p-6 text-[13px] text-slate-400">
              Aucune valorisation ne correspond à ce filtre.
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="tab-entete sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2">Étudiant</th>
                  <th className="text-left px-3 py-2 w-[26%]">Unité</th>
                  <th className="text-left px-3 py-2 w-[18%]">Décision</th>
                  <th className="text-left px-3 py-2 w-[22%]">Portée</th>
                  <th className="text-left px-3 py-2 w-[10%]">Preuves</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map(l => {
                  const refuse = l.decision === 'refusee';
                  return (
                    <tr key={l.id} className="border-b border-slate-100 align-top">
                      <td className="px-4 py-2">
                        <button onClick={() => onOuvrirEtudiant?.(l.etudiant_id)}
                          className="text-left hover:underline text-iip-blue font-medium">
                          {(l.nom || '').toUpperCase()} {l.prenom}
                        </button>
                        <div className="text-[11px] text-slate-400">
                          {l.annee_scolaire}{l.section ? ` · ${l.section}` : ''}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-mono text-[11px] text-slate-500 mr-1">
                          {l.ue_num}
                        </span>{l.ue_nom || ''}
                      </td>
                      {/* LE RAIL PORTE L'ÉTAT, ET LUI SEUL. Un refus est une
                          information, pas une alarme : ni fond brique, ni
                          texte blanc — la teinte va au filet et à la mention. */}
                      <td className={`px-3 py-2 border-l-[3px] ${refuse
                        ? 'border-l-[#9D4A38]' : 'border-l-transparent'}`}>
                        <span className={refuse ? 'text-[#9D4A38] font-semibold' : ''}>
                          {refuse ? 'Refusée' : 'Accordée'}
                        </span>
                        {!refuse && l.pourcentage != null && (
                          <span className="text-slate-400"> · {Math.round(l.pourcentage)} %</span>
                        )}
                        {l.decision_ce_date && (
                          <div className="text-[11px] text-slate-400">
                            CE du {l.decision_ce_date}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {refuse ? (
                          <span className="text-slate-500">{l.motif_refus || '—'}</span>
                        ) : l.type === 'complete' ? 'Unité entière'
                          : l.type === 'admission' ? 'Admission'
                            : `${l.cible === 'cours' ? 'Cours' : 'Acquis'} : ${l.cible_detail || '—'}`}
                      </td>
                      {/* UNE VALORISATION SANS PIÈCE EST UNE DÉCISION SANS
                          DOSSIER : elle se voit ici, pas au moment du contrôle. */}
                      <td className="px-3 py-2">
                        {l.preuves > 0
                          ? <span className="text-slate-600">{l.preuves}</span>
                          : <span className="text-[#B45309]">aucune</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Fenetre>
  );
}
