/**
 * CHANGER LE COURS DE PLUSIEURS SÉANCES (Charles, 24 novembre 2026 : « dans l'horaire importé
 * d'Hyperplanning, du 19/09 au 4/12, Perez donne psychologie générale et non pédagogie générale ;
 * un moyen de changer en un coup tous les cours »). Un professeur, une période, le cours que
 * l'horaire lui donne, le cours qu'il donne réellement. Vérifier d'abord : la liste des séances
 * touchées, avec les présences déjà encodées (elles suivent la séance). Rien n'est écrit avant
 * de confirmer ; une séance changée ici ne sera pas écrasée par un réimport.
 */
import { useEffect, useMemo, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import { demander } from '../lib/dialogue.jsx';
import { Fenetre, Tableau, TableauEntete, Th, Td, Tr, TableauVide } from './ui.jsx';

async function appel(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: authHeaders() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
  return j;
}
const fr = d => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');

export default function ChangerCoursSeances({ annee, onFermer, onFini }) {
  const debutAnnee = `${String(annee).slice(0, 4)}-08-15`;
  const finAnnee = `${Number(String(annee).slice(0, 4)) + 1}-08-14`;
  const [profs, setProfs] = useState([]);
  const [cours, setCours] = useState([]);
  const [actuels, setActuels] = useState([]);
  const [prof, setProf] = useState('');
  const [du, setDu] = useState(debutAnnee);
  const [au, setAu] = useState(finAnnee);
  const [de, setDe] = useState('');
  const [vers, setVers] = useState('');
  const [filtre, setFiltre] = useState('');
  const [apercu, setApercu] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);

  // Les professeurs de l'horaire, les cours de l'année ; puis les cours du professeur sur la période.
  useEffect(() => {
    const q = new URLSearchParams({ annee });
    if (prof) { q.set('professeur_id', prof); q.set('du', du); q.set('au', au); }
    appel(`/api/horaire/changer-cours/choix?${q}`).then(j => {
      setProfs(j.profs || []); setCours(j.cours || []); setActuels(j.actuels || []);
      if (de && !(j.actuels || []).some(c => c.cours_code === de)) setDe('');
    }).catch(e => setErreur(e.message));
  }, [annee, prof, du, au]);   // eslint-disable-line

  // Tout changement de choix rend l'aperçu caduc.
  useEffect(() => { setApercu(null); setErreur(null); }, [prof, du, au, de, vers]);

  const coursFiltres = useMemo(() => {
    const t = filtre.trim().toLowerCase();
    const l = cours.filter(c => c.cours_code !== de);
    return t ? l.filter(c => `${c.cours_code} ${c.cours_nom || ''} ${c.section || ''}`.toLowerCase().includes(t)) : l;
  }, [cours, filtre, de]);
  const nomDe = code => cours.find(c => c.cours_code === code)?.cours_nom || actuels.find(c => c.cours_code === code)?.cours_nom || '';

  const corps = simulation => JSON.stringify({ annee, professeur_id: Number(prof), du, au,
    cours_code_de: de, cours_code_vers: vers, simulation });
  const verifier = async () => {
    setEnCours(true); setErreur(null);
    try { setApercu(await appel('/api/horaire/changer-cours', { method: 'POST', body: corps(true) })); }
    catch (e) { setErreur(e.message); }
    setEnCours(false);
  };
  const appliquer = async () => {
    if (!apercu?.total) return;
    const p = profs.find(x => String(x.id) === String(prof));
    const ok = await demander({ titre: 'Changer le cours des séances', confirmer: `Changer ${apercu.total} séance(s)`, annuler: 'Annuler',
      message: `${apercu.total} séance(s) de ${p ? `${p.nom.toUpperCase()} ${p.prenom || ''}` : 'ce professeur'} passeront de `
        + `${de} ${nomDe(de)} à ${apercu.vers.cours_code} ${apercu.vers.cours_nom || ''}.`
        + (apercu.presences ? `\n\nLes ${apercu.presences} présence(s) déjà encodée(s) suivent leur séance.` : '')
        + '\n\nUn nouvel import d’Hyperplanning ne remettra pas l’ancien cours sur ces séances.' });
    if (!ok) return;
    setEnCours(true); setErreur(null);
    try { await appel('/api/horaire/changer-cours', { method: 'POST', body: corps(false) }); onFini?.(); }
    catch (e) { setErreur(e.message); setEnCours(false); }
  };

  const pret = prof && de && vers && du && au && au >= du;
  return (
    <Fenetre titre="Changer le cours de plusieurs séances" large="grande" onFermer={onFermer}
      sous="Corriger, en un geste, un cours mal attribué par l’import de l’horaire"
      pied={<>
        <span className="flex-1 min-w-0 text-second text-slate-500">
          {apercu ? `${apercu.total} séance(s) seront changées.` : pret ? 'Vérifiez d’abord : rien n’est écrit avant de confirmer.' : 'Choisissez le professeur, la période, le cours actuel et le nouveau cours.'}
        </span>
        <button className="bouton" onClick={onFermer}>Annuler</button>
        {!apercu
          ? <button className="bouton bouton-fort" disabled={!pret || enCours} onClick={verifier}>Vérifier</button>
          : <button className="bouton bouton-fort" disabled={!apercu.total || enCours} onClick={appliquer}>Changer {apercu.total} séance(s)</button>}
      </>}>
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="block md:col-span-1">
            <span className="text-second text-slate-500">Professeur</span>
            <select className="controle w-full" value={prof} onChange={e => setProf(e.target.value)}>
              <option value="">— choisir —</option>
              {profs.map(p => <option key={p.id} value={String(p.id)}>{p.nom.toUpperCase()} {p.prenom || ''}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-second text-slate-500">Du</span>
            <input type="date" className="controle w-full" value={du} onChange={e => setDu(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-second text-slate-500">Au</span>
            <input type="date" className="controle w-full" value={au} onChange={e => setAu(e.target.value)} />
          </label>
        </div>

        <label className="block">
          <span className="text-second text-slate-500">Cours actuel (dans l’horaire de ce professeur, sur la période)</span>
          <select className="controle w-full" value={de} disabled={!prof} onChange={e => setDe(e.target.value)}>
            <option value="">{prof ? (actuels.length ? '— choisir —' : 'aucune séance sur la période') : 'choisissez d’abord le professeur'}</option>
            {actuels.map(c => <option key={c.cours_code} value={c.cours_code}>
              {c.cours_code} {c.cours_nom || ''} — {c.seances} séance(s), du {fr(c.premiere)} au {fr(c.derniere)}
            </option>)}
          </select>
        </label>

        <div className="grid grid-cols-1 md:grid-cols-[14rem_minmax(0,1fr)] gap-3 items-end">
          <label className="block">
            <span className="text-second text-slate-500">Chercher le nouveau cours</span>
            <input className="controle w-full" placeholder="code, intitulé, section" value={filtre} onChange={e => setFiltre(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-second text-slate-500">Nouveau cours ({coursFiltres.length})</span>
            <select className="controle w-full" value={vers} onChange={e => setVers(e.target.value)}>
              <option value="">— choisir —</option>
              {coursFiltres.map(c => <option key={c.cours_code} value={c.cours_code}>
                {c.cours_code} {c.cours_nom || ''}{c.section ? ` · ${c.section}` : ''}
              </option>)}
            </select>
          </label>
        </div>

        {erreur && <div data-etat="corriger" className="bloc-etat px-3 py-2">{erreur}</div>}

        {apercu && (
          <>
            <p className="text-second text-slate-500">
              De <strong>{apercu.de} {nomDe(apercu.de)}</strong> à <strong>{apercu.vers.cours_code} {apercu.vers.cours_nom || ''}</strong>
              {apercu.presences ? ` · ${apercu.presences} présence(s) déjà encodée(s), qui suivent leur séance` : ''}
            </p>
            <Tableau dense>
              <TableauEntete>
                <Th>Date</Th><Th>Heures</Th><Th>Classe</Th><Th>Professeur</Th><Th align="droite">Présences encodées</Th>
              </TableauEntete>
              <tbody>
                {!apercu.seances.length && <TableauVide colonnes={5}>Aucune séance ne correspond.</TableauVide>}
                {apercu.seances.map(s => (
                  <Tr key={s.id}>
                    <Td>{fr(s.date)}{s.annule ? <span className="text-second text-slate-500"> · annulée</span> : null}</Td>
                    <Td>{s.heure_debut}–{s.heure_fin}</Td>
                    <Td>{s.classe || ''}</Td>
                    <Td>{s.professeur}</Td>
                    <Td align="droite">{s.presences || ''}</Td>
                  </Tr>
                ))}
              </tbody>
            </Tableau>
          </>
        )}
      </div>
    </Fenetre>
  );
}
