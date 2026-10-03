import { useEffect, useState } from 'react';
import { OuvrirEditions, Fenetre } from './ui.jsx';
import {
  IconPrinter, IconAlertTriangle, IconCertificate,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { ouvrirApercu } from '../lib/apercu.js';

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

  /**
   * DEUX PIÈCES, DEUX ACTES.
   *
   * La liste des diplômés n'est aucun modèle de la circulaire : c'est un
   * document de travail. Le PROCÈS-VERBAL DE DÉLIBÉRATION DE SECTION —
   * annexe 6 quand la section comporte une épreuve intégrée, annexe 7 sinon —
   * est l'acte par lequel le Conseil constate qu'un étudiant a terminé, et
   * c'est lui qui fonde la délivrance du titre. Il manquait.
   */
  async function imprimer(quoi = 'liste') {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch(
        quoi === 'pv' ? '/api/diplomes/pv-section' : '/api/diplomes/document', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ section, annee, etudiants: [...choisis], lieu, date }),
      });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error);
      if (j.manques?.length) {
        setErreur(`Document produit, mais des dossiers sont incomplets : ${
          j.manques.slice(0, 4).join(' · ')}${j.manques.length > 4 ? ' …' : ''}`);
      }
      ouvrirApercu({
        html: j.html,
        titre: quoi === 'pv' ? 'Procès-verbal de délibération de section' : 'Liste des diplômés',
        sousTitre: `${section} · ${annee}`,
        nomFichier: `${quoi === 'pv' ? 'PV_section' : 'Diplomes'}_${section}_${annee}`,
        envoiPossible: false, astuceImpression: 'A4 portrait',
      });
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
        <span className="text-[13px] text-slate-800">
          <b>{c.nom}</b> {c.prenom}
        </span>
        <span className="block text-[11px] text-slate-500">
          {c.reussies}/{c.total} unités · {c.ects} ECTS
          {c.annee_fin ? ` · dernière en ${c.annee_fin}` : ''}
          {c.integree ? ' · épreuve intégrée réussie' : ''}
          {c.manquantes.length ? ` · non décomptées : UE ${
            c.manquantes.slice(0, 6).join(', ')}` : ''}
        </span>
        {!!c.manques.length && (
          <span className="block text-[11px] text-amber-700 flex items-center gap-1">
            <IconAlertTriangle size={11} /> dossier incomplet : {c.manques.join(', ')}
          </span>
        )}
      </span>
      <span className={`flex-none text-[10px] px-2 py-0.5 rounded-champ font-semibold ${
        c.toutes_unites
          ? 'bg-emerald-500 text-white border border-emerald-500'
          : 'bg-amber-500 text-white border border-amber-500'}`}>
        {c.toutes_unites ? 'complet' : 'épreuve intégrée'}
      </span>
    </label>
  );

  return (
    <Fenetre icone={IconCertificate} titre="Liste des étudiants diplômés" large="moyenne" onFermer={onClose}
      sous={`Document de la Fédération · année académique ${String(annee).replace('-', '/')}`}
      pied={<>
        <span className="text-[12px] text-slate-500">
          {choisis.size} étudiant(s) sur la liste
        </span>
        <button onClick={onClose} className="bouton">
          Fermer
        </button>
        {/* L'AVION MÈNE AU CENTRE D'ÉDITION (2 octobre 2026) : l'acte et le document de travail y sont, en tête. */}
        <OuvrirEditions disabled={enCours || !choisis.size} titre="Procès-verbal de section et liste des diplômés — centre d'édition"
          pieces={[
            { cle: 'pv', label: 'Procès-verbal de section', description: "Annexe 6 (section avec épreuve intégrée) ou 7 — l'acte qui fonde le titre", onClick: () => imprimer('pv') },
            { cle: 'liste', label: 'Liste des diplômés', description: 'Document de travail — ne figure pas dans la circulaire', onClick: () => imprimer('liste') },
          ]} />
      </>}>
        <div className="space-y-3">
          {erreur && (
            <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                            text-[12px] text-amber-900 flex items-start gap-1.5">
              <IconAlertTriangle size={14} className="mt-0.5 flex-none" /> {erreur}
            </div>
          )}

          <label className="block">
            <span className="block text-[11px] font-semibold text-slate-500 mb-0.5">Section</span>
            <select value={section} onChange={e => charger(e.target.value)}
              className="w-full text-[13px] border border-slate-300 rounded-lg px-2 py-1.5">
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
              <p className="text-[12px] text-slate-500">
                {etat.requises.length} unités composent la section
                {etat.ects_total ? `, soit ${etat.ects_total} ECTS` : ''}.
                Figurent ici ceux qui ont acquis toutes les unités, et ceux qui ont réussi
                l'épreuve intégrée{etat.epreuve_integree ? ` (UE ${etat.epreuve_integree})` : ''} —
                elle sanctionne la section, et une valorisation ou une dispense échappe au
                décompte. Sont cochés ceux qui ont terminé cette année.
              </p>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-800 border-l-4 border-l-emerald-500">
                  Diplômables ({cands.length})
                </div>
                {cands.map(c => <Ligne key={c.id} c={c} />)}
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="block text-[11px] font-semibold text-slate-500 mb-0.5">Fait à</span>
                  <input value={lieu} placeholder="Anderlecht"
                    onChange={e => setLieu(e.target.value)}
                    className="w-full text-[13px] border border-slate-300 rounded-lg px-2 py-1.5" />
                </label>
                <label className="block">
                  <span className="block text-[11px] font-semibold text-slate-500 mb-0.5">Le</span>
                  <input value={date} placeholder="laisser vide pour compléter à la main"
                    onChange={e => setDate(e.target.value)}
                    className="w-full text-[13px] border border-slate-300 rounded-lg px-2 py-1.5" />
                </label>
              </div>
            </>
          )}

          {etat && !cands.length && !etat.avertissement && (
            <div className="py-6 text-center text-[13px] text-slate-500">
              Aucun étudiant n'a terminé cette section : ni toutes les unités acquises,
              ni l'épreuve intégrée réussie.
            </div>
          )}
        </div>
    </Fenetre>
  );
}
