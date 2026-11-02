import { useEffect, useState } from 'react';
import { IconCar, IconChevronLeft, IconChevronRight, IconPlus, IconPrinter, IconSignature, IconCheck, IconPencil, IconTrash, IconMapPin } from '@tabler/icons-react';
import { Fenetre, OutilFenetre, Tableau, Th, Td, Tr, Encadre, PastilleEtat, EnteteCarte } from './ui.jsx';
import PreviewModal from './PreviewModal.jsx';
import { authHeaders } from '../lib/api.js';
import { demander, informer } from '../lib/dialogue.jsx';

/**
 * LES VISITES DE STAGE ET LA FICHE DE TRANSPORT (3.5.058, Charles, 2 novembre 2026). Trois faces :
 * les visites (planifier, marquer faite avec les kilomètres), la fiche de transport du mois (signée par la
 * personne puis par la direction), et — pour le secrétariat et la direction — le départ remboursé de chacun
 * et le taux au kilomètre. Serveur : `routes/visitesStage.js`, métier `lib/visitesStage.js`.
 */
const api = async (url, opts = {}) => {
  const r = await fetch(`/api/visites-stage${url}`, { ...opts, headers: { ...authHeaders(), ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Opération refusée.');
  return j;
};
const envoyer = (url, methode, corps) => api(url, { method: methode, body: JSON.stringify(corps || {}) });
const moisCourant = () => new Date().toISOString().slice(0, 7);
const decalerMois = (m, n) => { const d = new Date(`${m}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
const nomMois = m => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });
const jma = d => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '';
const eur = n => n == null ? '—' : n.toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const tx = n => n == null ? '—' : n.toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + ' € / km';
const nomEtud = x => `${String(x.etud_nom || '').toUpperCase()} ${x.etud_prenom || ''}`.trim();
const ETAT_STATUT = { prevue: 'disponible', faite: 'reussi', annulee: 'indisponible' };
const aujourdhui = () => new Date().toISOString().slice(0, 10);

function FormVisite({ info, stages, visite, onFini, onAnnuler }) {
  const [v, setV] = useState(() => visite ? { ...visite, km_ar: visite.km_ar ?? '' }
    : { stage_id: stages[0]?.id || '', date: aujourdhui(), heure_debut: '', heure_fin: '', depart: info.regle === 'domicile' ? 'domicile' : 'ecole',
        depart_texte: '', km_ar: '', statut: 'prevue', remarques: '' });
  const [erreur, setErreur] = useState('');
  const maj = (k, x) => setV(p => ({ ...p, [k]: x }));
  // LA DISTANCE SE CALCULE (3.5.059) : la carte (OpenStreetMap) propose l'aller-retour routier ; à défaut, la dernière
  // distance tapée pour ce lieu depuis ce départ. Ce qu'on tape reste ce qui compte — un écart se signale sur la fiche.
  const [carte, setCarte] = useState(null);       // { km_calcule, raison } | 'calcul'
  useEffect(() => {
    if (!v.stage_id) return;
    if (v.depart === 'autre' && !String(v.depart_texte || '').trim()) { setCarte(null); return; }
    let vivant = true;
    const t = setTimeout(() => {
      setCarte('calcul');
      api(`/km?stage=${v.stage_id}&depart=${v.depart}&texte=${encodeURIComponent(v.depart_texte || '')}`).then(j => {
        if (!vivant) return;
        setCarte({ km_calcule: j.km_calcule, raison: j.raison });
        const propose = j.km_calcule ?? j.km_ar;
        if (propose != null) setV(p => (p.km_ar === '' || p.km_ar == null ? { ...p, km_ar: propose } : p));
      }).catch(() => vivant && setCarte(null));
    }, v.depart === 'autre' ? 700 : 0);
    return () => { vivant = false; clearTimeout(t); };
  }, [v.stage_id, v.depart, v.depart_texte]);
  const ecart = carte && carte !== 'calcul' && carte.km_calcule != null && v.km_ar !== '' && v.km_ar != null
    && Math.abs(Number(String(v.km_ar).replace(',', '.')) - carte.km_calcule) > Math.max(3, 0.1 * carte.km_calcule);
  const st = stages.find(s => String(s.id) === String(v.stage_id));
  async function enregistrer() {
    setErreur('');
    try {
      if (visite?.id) await envoyer(`/${visite.id}`, 'PUT', v); else await envoyer('', 'POST', v);
      onFini();
    } catch (e) { setErreur(e.message); }
  }
  const champ = 'controle border border-slate-300 rounded-champ bg-white text-sm w-full';
  return (
    <div className="carte">
      <EnteteCarte titre={visite?.id ? 'Modifier la visite' : 'Planifier une visite'} />
      <div className="p-3 grid gap-3 md:grid-cols-3">
        <label className="md:col-span-3 text-second text-slate-600">Le stage (l’étudiant et son lieu)
          <select className={champ} value={v.stage_id} disabled={!!visite?.id} onChange={e => setV(p => ({ ...p, stage_id: e.target.value, km_ar: '' }))}>
            {stages.map(s => <option key={s.id} value={s.id}>{nomEtud(s)} — {s.lieu_nom || 'lieu non désigné'}{s.lieu_localite ? `, ${s.lieu_localite}` : ''}{info.gestion && s.professeur ? ` · ${s.professeur}` : ''}</option>)}
          </select>
          {st && <span className="text-mention text-slate-500 inline-flex items-center gap-1 mt-1"><IconMapPin size={11} />
            {[st.lieu_adresse, [st.lieu_cp, st.lieu_localite].filter(Boolean).join(' ')].filter(Boolean).join(', ') || 'adresse du lieu absente (fiche du lieu de stage)'}</span>}
        </label>
        <label className="text-second text-slate-600">Date<input type="date" className={champ} value={v.date} onChange={e => maj('date', e.target.value)} /></label>
        <label className="text-second text-slate-600">De<input type="time" className={champ} value={v.heure_debut || ''} onChange={e => maj('heure_debut', e.target.value)} /></label>
        <label className="text-second text-slate-600">À<input type="time" className={champ} value={v.heure_fin || ''} onChange={e => maj('heure_fin', e.target.value)} /></label>
        <label className="text-second text-slate-600">Départ du trajet
          <select className={champ} value={v.depart} onChange={e => setV(p => ({ ...p, depart: e.target.value, km_ar: '' }))}>
            {Object.entries(info.departs).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select></label>
        {v.depart === 'autre'
          ? <label className="text-second text-slate-600">D’où ?<input className={champ} value={v.depart_texte || ''} onChange={e => maj('depart_texte', e.target.value)} /></label>
          : <div className="text-mention text-slate-500 self-end pb-2">{v.depart === 'domicile' ? (info.domicile || 'adresse de domicile : fiche du professeur') : info.ecole}</div>}
        <label className="text-second text-slate-600">Kilomètres aller-retour<input inputMode="decimal" className={champ} value={v.km_ar ?? ''} onChange={e => maj('km_ar', e.target.value)} placeholder="ex. 46" />
          <span className="text-mention text-slate-500 block mt-1">
            {carte === 'calcul' ? 'calcul de l’itinéraire…'
              : carte?.km_calcule != null ? <>Itinéraire calculé : <b>{carte.km_calcule} km</b> aller-retour{ecart && <> — <span className="text-amber-700">écart avec votre chiffre, il sera signalé sur la fiche</span></>}
                {String(v.km_ar) !== String(carte.km_calcule) && <> · <button type="button" className="underline text-iip-blue" onClick={() => maj('km_ar', carte.km_calcule)}>reprendre</button></>}</>
              : carte?.raison ? `Pas de calcul : ${carte.raison}.` : ''}
          </span></label>
        <label className="text-second text-slate-600">Statut
          <select className={champ} value={v.statut} onChange={e => maj('statut', e.target.value)}>
            {Object.entries(info.statuts).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select></label>
        <label className="md:col-span-2 text-second text-slate-600">Remarque<input className={champ} value={v.remarques || ''} onChange={e => maj('remarques', e.target.value)} /></label>
      </div>
      {info.regle && info.regle !== 'aucun' && v.depart !== info.regle && v.statut === 'faite' && (
        <div className="px-3"><Encadre etat="surveiller">Vos déplacements sont remboursés {info.regles[info.regle].replace('remboursé ', '')} : un trajet encodé depuis un autre départ ne se rembourse pas tel quel.</Encadre></div>)}
      {erreur && <div className="px-3"><Encadre etat="corriger">{erreur}</Encadre></div>}
      <div className="p-3 flex gap-2 justify-end">
        <button className="bouton" onClick={onAnnuler}>Annuler</button>
        <button className="bouton bouton-fort" onClick={enregistrer} disabled={!v.stage_id}>Enregistrer</button>
      </div>
    </div>
  );
}

function FaceVisites({ info, prof }) {
  const [mois, setMois] = useState(moisCourant());
  const [liste, setListe] = useState([]);
  const [stages, setStages] = useState([]);
  const [edition, setEdition] = useState(null);     // null | 'nouvelle' | visite
  const [erreur, setErreur] = useState('');
  const charger = () => {
    const q = prof ? `&prof=${prof}` : '';
    api(`/?du=${mois}-01&au=${mois}-31${q}`).then(j => setListe(j.visites)).catch(e => setErreur(e.message));
    api(`/stages${prof ? `?prof=${prof}` : ''}`).then(j => setStages(j.stages)).catch(e => setErreur(e.message));
  };
  useEffect(charger, [mois, prof]);
  async function faite(v) {
    let km = v.km_ar;
    if (km == null) {
      const p = await api(`/km?stage=${v.stage_id}&depart=${v.depart}&texte=${encodeURIComponent(v.depart_texte || '')}`).catch(() => ({}));
      km = p.km_calcule ?? p.km_ar ?? null;
      if (km == null) { setEdition({ ...v, statut: 'faite' }); return; }
    }
    try { await envoyer(`/${v.id}`, 'PUT', { statut: 'faite', km_ar: km }); charger(); } catch (e) { informer({ message: e.message }); }
  }
  async function retirer(v) {
    if (!(await demander(`Supprimer la visite du ${jma(v.date)} chez ${v.lieu_nom || 'ce lieu'} ?`))) return;
    try { await api(`/${v.id}`, { method: 'DELETE' }); charger(); } catch (e) { informer({ message: e.message }); }
  }
  const sansVisite = stages.filter(s => !s.nb_visites);
  return (
    <div className="space-y-3">
      <div className="flex flex-nowrap items-center gap-2">
        <button className="bouton px-2" onClick={() => setMois(decalerMois(mois, -1))} aria-label="Mois précédent"><IconChevronLeft size={16} /></button>
        <span className="text-sm font-semibold text-iip-texte capitalize min-w-[9rem] text-center">{nomMois(mois)}</span>
        <button className="bouton px-2" onClick={() => setMois(decalerMois(mois, 1))} aria-label="Mois suivant"><IconChevronRight size={16} /></button>
        <button className="bouton bouton-fort ml-auto inline-flex items-center gap-1.5" disabled={!stages.length} onClick={() => setEdition('nouvelle')}>
          <IconPlus size={16} /> Planifier une visite</button>
      </div>
      {erreur && <Encadre etat="corriger">{erreur}</Encadre>}
      {!stages.length && <Encadre etat="neutre" titre="Aucun stage à suivre cette année">
        Les stages se rattachent à leur professeur de stage dans la fiche de l’étudiant → onglet Stages (champ « professeur de stage »). Une fois désigné, le stage paraît ici avec son lieu.</Encadre>}
      {edition && <FormVisite info={info} stages={stages} visite={edition === 'nouvelle' ? null : edition}
        onAnnuler={() => setEdition(null)} onFini={() => { setEdition(null); charger(); }} />}
      {liste.length > 0 ? (
        <Tableau>
          <thead><tr><Th>Date</Th><Th>Étudiant</Th><Th>Lieu de stage</Th>{info.gestion && <Th>Professeur</Th>}<Th>Départ</Th><Th align="droite">km A/R</Th><Th>Statut</Th><Th /></tr></thead>
          <tbody>{liste.map(v => (
            <Tr key={v.id}>
              <Td className="tabular-nums whitespace-nowrap">{jma(v.date)}{v.heure_debut && <span className="text-slate-500"> · {v.heure_debut}{v.heure_fin ? `–${v.heure_fin}` : ''}</span>}</Td>
              <Td>{nomEtud(v)}</Td>
              <Td>{v.lieu_nom || '—'}<div className="text-mention text-slate-500">{[v.lieu_adresse, [v.lieu_cp, v.lieu_localite].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</div></Td>
              {info.gestion && <Td ton="secondaire">{v.professeur}</Td>}
              <Td ton="secondaire">{info.departs[v.depart]}{v.depart === 'autre' && v.depart_texte ? ` (${v.depart_texte})` : ''}</Td>
              <Td align="droite" className="tabular-nums" title={v.km_calcule != null ? `Itinéraire calculé : ${v.km_calcule} km A/R` : undefined}>{v.km_ar ?? '—'}{v.ecart && <div><PastilleEtat etat="surveiller" title={`Calculé : ${v.km_calcule} km`}>carte : {v.km_calcule}</PastilleEtat></div>}</Td>
              <Td><PastilleEtat etat={ETAT_STATUT[v.statut]}>{info.statuts[v.statut]}</PastilleEtat></Td>
              <Td align="droite" className="whitespace-nowrap">
                {!v.verrouillee && <>
                  {v.statut === 'prevue' && v.date <= aujourdhui() && <button className="bouton px-2 py-1 text-second inline-flex items-center gap-1" onClick={() => faite(v)}><IconCheck size={14} /> Faite</button>}
                  <button className="p-1.5 text-slate-500 hover:text-iip-blue" title="Modifier" aria-label="Modifier" onClick={() => setEdition(v)}><IconPencil size={15} /></button>
                  {v.statut !== 'faite' && <button className="p-1.5 text-slate-500 hover:text-red-700" title="Supprimer" aria-label="Supprimer" onClick={() => retirer(v)}><IconTrash size={15} /></button>}
                </>}
                {v.verrouillee && <span className="text-mention text-slate-400">mois approuvé</span>}
              </Td>
            </Tr>))}
          </tbody>
        </Tableau>
      ) : stages.length > 0 && <div className="text-second text-slate-500">Aucune visite en {nomMois(mois)}.</div>}
      {sansVisite.length > 0 && (
        <div className="carte">
          <EnteteCarte titre={`Stages sans visite (${sansVisite.length})`} />
          <ul className="divide-y" style={{ borderColor: 'var(--c-filet)' }}>
            {sansVisite.map(s => (
              <li key={s.id} className="px-3 py-2 flex items-center gap-2 text-sm">
                <span className="flex-1 min-w-0">{nomEtud(s)} <span className="text-slate-500">— {s.lieu_nom || 'lieu non désigné'}{s.lieu_localite ? `, ${s.lieu_localite}` : ''}{s.date_debut ? ` · du ${jma(s.date_debut)} au ${jma(s.date_fin)}` : ''}</span></span>
                <button className="bouton px-2 py-1 text-second inline-flex items-center gap-1" onClick={() => setEdition({ stage_id: s.id, date: aujourdhui(), heure_debut: '', heure_fin: '',
                  depart: info.regle === 'domicile' ? 'domicile' : 'ecole', depart_texte: '', km_ar: null, statut: 'prevue', remarques: '', nouvelle: true })}>
                  <IconPlus size={14} /> Visite</button>
              </li>))}
          </ul>
        </div>)}
    </div>
  );
}

function FaceFiche({ info, prof, mois, setMois }) {
  const [f, setF] = useState(null);
  const [erreur, setErreur] = useState('');
  const pid = prof || info.professeur_id;
  const charger = () => { if (!pid) return; setErreur(''); api(`/fiche/${pid}/${mois}`).then(setF).catch(e => setErreur(e.message)); };
  useEffect(charger, [mois, pid]);
  if (!pid) return <Encadre etat="neutre">{info.gestion ? 'Choisissez une personne.' : 'Votre compte n’est relié à aucune fiche de professeur.'}</Encadre>;
  async function signer(etape) {
    if (!(await demander(etape === 'personne' ? `Certifier les déplacements de ${nomMois(mois)} ?` : `Approuver la fiche de transport de ${f.professeur} pour ${nomMois(mois)} ? Ses visites ne se modifieront plus.`))) return;
    try { await envoyer(`/fiche/${pid}/${mois}/signer`, 'POST', { etape }); charger(); } catch (e) { informer({ message: e.message }); }
  }
  const moi = info.professeur_id === pid;
  return (
    <div className="space-y-3">
      <div className="flex flex-nowrap items-center gap-2">
        <button className="bouton px-2" onClick={() => setMois(decalerMois(mois, -1))} aria-label="Mois précédent"><IconChevronLeft size={16} /></button>
        <span className="text-sm font-semibold text-iip-texte capitalize min-w-[9rem] text-center">{nomMois(mois)}</span>
        <button className="bouton px-2" onClick={() => setMois(decalerMois(mois, 1))} aria-label="Mois suivant"><IconChevronRight size={16} /></button>
      </div>
      {erreur && <Encadre etat="corriger">{erreur}</Encadre>}
      {f && <>
        <div className="text-second text-slate-600">{f.professeur} · <b>{f.regle_libelle}</b>{f.regle !== 'aucun' && <> · taux : <b>{f.taux ? tx(f.taux) : 'à régler'}</b></>}</div>
        {f.lignes.length ? (
          <Tableau>
            <thead><tr><Th>Date</Th><Th>Étudiant</Th><Th>Lieu</Th><Th>Départ</Th><Th align="droite">km A/R</Th>{f.regle !== 'aucun' && <Th align="droite">Montant</Th>}</tr></thead>
            <tbody>{f.lignes.map(l => (
              <Tr key={l.id}><Td className="tabular-nums">{jma(l.date)}</Td><Td>{l.etudiant}</Td>
                <Td>{l.lieu}<div className="text-mention text-slate-500">{l.adresse}</div></Td>
                <Td ton="secondaire">{info.departs[l.depart]}<div className="text-mention">{l.depart_adresse}</div>{!l.conforme && <PastilleEtat etat="surveiller">hors règle</PastilleEtat>}</Td>
                <Td align="droite" className="tabular-nums">{l.km_ar ?? '—'}{l.km_calcule != null && <div className="text-mention text-slate-500">carte : {l.km_calcule}</div>}{l.ecart && <PastilleEtat etat="surveiller">écart</PastilleEtat>}</Td>{f.regle !== 'aucun' && <Td align="droite" className="tabular-nums">{eur(l.montant)}</Td>}</Tr>))}
              <tr className="ligne-total"><Td colSpan={4}>Total · {f.lignes.length} visite(s)</Td><Td align="droite" className="tabular-nums">{f.km}</Td>{f.regle !== 'aucun' && <Td align="droite" className="tabular-nums">{eur(f.total)}</Td>}</tr>
            </tbody>
          </Tableau>) : <div className="text-second text-slate-500">Aucune visite faite en {nomMois(mois)}.</div>}
        {f.problemes.length > 0 && f.lignes.length > 0 && <Encadre etat="surveiller" titre="À compléter avant de signer">{f.problemes.join(' ; ')}.</Encadre>}
        {f.lignes.some(l => l.ecart) && <Encadre etat="surveiller" titre="Kilomètres à regarder">
          {f.lignes.filter(l => l.ecart).length} visite(s) déclarent une distance qui s’écarte de plus de 10 % de l’itinéraire calculé (« carte »). La signature reste possible : un détour peut se justifier, mieux vaut l’écrire en remarque.</Encadre>}
        <div className="grid gap-2 md:grid-cols-2">
          {['personne', 'direction'].map(e => {
            const s = f.signatures.find(x => x.etape === e && x.valable);
            const peut = e === 'personne' ? moi && !s && f.lignes.length && !f.problemes.length : info.direction && f.signe_personne && !s;
            return (
              <div key={e} className="bloc-etat px-3 py-2 text-second" data-etat={s ? 'reussi' : 'neutre'}>
                <div className="font-semibold">{e === 'personne' ? 'La personne certifie ses déplacements' : 'La direction approuve'}</div>
                {s ? <div className="text-slate-600">{s.par_nom} · {String(s.le).slice(0, 16)}</div> : <div className="text-slate-500">à signer</div>}
                {peut && <button className="bouton bouton-fort mt-2 inline-flex items-center gap-1.5" onClick={() => signer(e)}><IconSignature size={15} />{e === 'personne' ? 'Je certifie' : 'Approuver'}</button>}
              </div>);
          })}
        </div>
      </>}
    </div>
  );
}

function FaceReglages({ info }) {
  const [d, setD] = useState(null);
  const [taux, setTaux] = useState('');
  const [erreur, setErreur] = useState('');
  const charger = () => api('/regles').then(j => { setD(j); setTaux(j.taux ?? ''); }).catch(e => setErreur(e.message));
  useEffect(charger, []);
  async function regle(p, valeur) {
    try { await envoyer(`/regles/${p.id}`, 'PUT', { regle: valeur, remarque: p.remarque }); charger(); } catch (e) { informer({ message: e.message }); }
  }
  async function poserTaux() {
    try { const j = await envoyer('/taux', 'PUT', { taux }); setTaux(j.taux ?? ''); informer({ ton: 'reussi', message: j.taux ? `Taux enregistré : ${tx(j.taux)}.` : 'Taux effacé : « à régler ».' }); }
    catch (e) { informer({ message: e.message }); }
  }
  if (!d) return <div className="text-second text-slate-500">{erreur || 'Chargement…'}</div>;
  return (
    <div className="space-y-3">
      <div className="carte">
        <EnteteCarte titre="Le taux au kilomètre" />
        <div className="p-3 flex flex-nowrap items-center gap-2 text-sm">
          <input inputMode="decimal" className="controle border border-slate-300 rounded-champ bg-white w-28" value={taux} disabled={!info.taux_modifiable}
            onChange={e => setTaux(e.target.value)} placeholder="à régler" />
          <span className="text-slate-600">€ par kilomètre</span>
          {info.taux_modifiable && <button className="bouton bouton-fort ml-2" onClick={poserTaux}>Enregistrer</button>}
          <span className="text-mention text-slate-500 ml-auto">Le taux que l’école applique ; il vaut pour toutes les fiches qui ne sont pas encore approuvées.</span>
        </div>
      </div>
      <Tableau>
        <thead><tr><Th>Professeur de stage</Th><Th>Domicile (fiche)</Th><Th>Frais de déplacement</Th><Th>Réglé par</Th></tr></thead>
        <tbody>{d.personnes.map(p => (
          <Tr key={p.id}>
            <Td>{p.nom}</Td>
            <Td ton="secondaire">{p.domicile || <span className="text-amber-700">adresse absente</span>}</Td>
            <Td>{info.regle_modifiable
              ? <select className="controle border border-slate-300 rounded-champ bg-white text-sm" value={p.regle} onChange={e => regle(p, e.target.value)}>
                  {Object.entries(d.regles).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              : d.regles[p.regle]}</Td>
            <Td ton="secondaire">{p.maj_par ? `${p.maj_par} · ${String(p.maj_le || '').slice(0, 10)}` : '—'}</Td>
          </Tr>))}
          {!d.personnes.length && <Tr><Td colSpan={4} ton="secondaire">Aucun professeur de stage désigné cette année.</Td></Tr>}
        </tbody>
      </Tableau>
    </div>
  );
}

/* LE CONTENU, SANS LA FENÊTRE (3.5.068) : servi en fenêtre depuis Mes cours (le professeur, ses visites) et en page dans
   Organisation → Stages → Visites et trajets (le secrétariat et la direction). Une seule source, deux portes. */
export function VisitesTrajets({ onOutil = null }) {
  const [info, setInfo] = useState(null);
  const [face, setFace] = useState('visites');
  const [prof, setProf] = useState('');
  const [personnes, setPersonnes] = useState([]);
  const [apercu, setApercu] = useState(null);
  const [moisFiche, setMoisFiche] = useState(moisCourant());
  const [erreur, setErreur] = useState('');
  useEffect(() => { api('/moi').then(setInfo).catch(e => setErreur(e.message)); }, []);
  useEffect(() => { if (info?.gestion) api('/regles').then(j => setPersonnes(j.personnes)).catch(() => {}); }, [info?.gestion]);
  const ouvrir = async url => { try { setApercu(await api(url)); } catch (e) { informer({ message: e.message }); } };
  const faces = [['visites', 'Les visites'], ['fiche', 'Fiche de transport'], ...(info?.gestion ? [['reglages', 'Frais de déplacement']] : [])];
  // En fenêtre, la sortie va au bandeau (la règle des fenêtres) ; en page, elle reste dans la barre des faces.
  const cible = face === 'fiche' && info && (prof || info.professeur_id) ? `/fiche/${prof || info.professeur_id}/${moisFiche}/document` : null;
  useEffect(() => { if (onOutil) onOutil(cible ? <OutilFenetre Icone={IconPrinter} titre="Fiche de transport du mois" onClick={() => ouvrir(cible)} /> : null); }, [cible]);
  if (!info) return <div className="text-second text-slate-500">{erreur || 'Chargement…'}</div>;
  return (
    <div className="space-y-3">
      <div className="flex flex-nowrap items-end gap-4 border-b" style={{ borderColor: 'var(--c-filet)' }}>
        {faces.map(([k, l]) => <button key={k} className={`onglet-page ${face === k ? 'onglet-page-actif' : ''}`} onClick={() => setFace(k)}>{l}</button>)}
        <span className="ml-auto" />
        {info.gestion && face !== 'reglages' && (
          <select className="controle border border-slate-300 rounded-champ bg-white text-sm mb-1" value={prof} onChange={e => setProf(e.target.value)}>
            <option value="">{face === 'fiche' ? (info.professeur_id ? 'Ma fiche' : '— choisir une personne —') : 'Tous les professeurs de stage'}</option>
            {personnes.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
          </select>)}
        {!onOutil && cible && <button className="bouton-sortir px-2.5 py-1 text-second inline-flex items-center gap-1.5 mb-1" onClick={() => ouvrir(cible)}><IconPrinter size={14} /> Fiche du mois</button>}
      </div>
      {!info.relie && !info.gestion && <Encadre etat="surveiller" titre="Votre compte n’est relié à aucune fiche de professeur">
        La direction le relie dans Personnel → fiche de l’enseignant → Accès Lucie.</Encadre>}
      {face === 'visites' && <FaceVisites info={info} prof={prof} />}
      {face === 'fiche' && <FaceFiche info={info} prof={prof} mois={moisFiche} setMois={setMoisFiche} />}
      {face === 'reglages' && <FaceReglages info={info} />}
      {apercu && <PreviewModal html={apercu.html} titre={apercu.titre} nomFichier={apercu.nom_fichier} envoiPossible={false} onClose={() => setApercu(null)} />}
    </div>
  );
}

export default function VisitesStage({ onFermer }) {
  const [outil, setOutil] = useState(null);
  return (
    <Fenetre icone={IconCar} titre="Visites de stage" sous="Dans l’agenda, avec le lieu de l’étudiant ; et la fiche de transport du mois" large="grande"
      onFermer={onFermer} outils={outil} pied={<button className="bouton ml-auto" onClick={onFermer}>Fermer</button>}>
      <VisitesTrajets onOutil={setOutil} />
    </Fenetre>
  );
}
