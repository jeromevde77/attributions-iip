import { useCallback, useEffect, useState } from 'react';
import { IconReceipt, IconCreditCard, IconCar, IconDeviceMobile, IconFileTypePdf, IconTrash, IconPaperclip, IconPlus, IconUser, IconLock, IconDeviceFloppy, IconPencil, IconCheck, IconX, IconSend } from '@tabler/icons-react';
import { EnteteCarte, Encadre, Fenetre, OutilFenetre, Tableau, TableauEntete, Th, Td, Tr, TableauVide } from './ui.jsx';
import { authHeaders } from '../lib/api.js';
import { demander, informer } from '../lib/dialogue.jsx';
import ChampsAdresse from './ChampsAdresse.jsx';

/* MES FRAIS (3.5.197, Charles : « dans l'espace finances, je dois pouvoir compléter ce genre de documents pour moi — confidentiel
   et à moi ! »). Trois pièces de l'ASBL : note de frais (et la note GSM du semestre), justificatif de dépense payée par la carte de
   l'ASBL, relevé de frais de parcours (kilomètres aller-retour calculés). Chaque pièce sort en PDF au modèle de l'ASBL, signée,
   avec ses justificatifs à la suite. Personne d'autre ne voit vos pièces : le serveur ne les rend qu'à vous. */
const NATURES = {
  note: { l: 'Note de frais', I: IconReceipt },
  carte: { l: 'Dépense Visa (carte de l’ASBL)', I: IconCreditCard },
  km: { l: 'Frais de parcours', I: IconCar },
};
// Les cases « À charge de » du formulaire Visa de l'ASBL (3.5.653), les mêmes que A_CHARGE_CARTE du serveur.
const A_CHARGE_CARTE = ['Institut Ilya Prigogine — GDE', 'Institut Ilya Prigogine — Agence qualité', 'Institut Ilya Prigogine — Optique-optométrie',
  'Institut Ilya Prigogine — Psychomotricité', 'Institut Ilya Prigogine — TIM', 'ASBL — GDA', 'ASBL — GDI'];
// Les cases « À charge de » de la note de frais de l'ASBL (3.5.696), les mêmes que A_CHARGE_NOTE du serveur : son modèle ne porte pas TIM.
const A_CHARGE_NOTE = ['Institut Ilya Prigogine — GDE', 'Institut Ilya Prigogine — Agence qualité', 'Institut Ilya Prigogine — Optique-optométrie',
  'Institut Ilya Prigogine — Psychomotricité', 'ASBL — GDA', 'ASBL — GDI'];
const eur = n => (n == null || n === '' ? '—' : `${Number(n).toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
const jj = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const auj = () => new Date().toISOString().slice(0, 10);

async function appel(methode, chemin, corps) {
  const r = await fetch(`/api/mes-frais${chemin}`, { method: methode, headers: { ...authHeaders(), ...(corps ? { 'Content-Type': 'application/json' } : {}) },
    body: corps ? JSON.stringify(corps) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
  return j;
}

export default function MesFrais() {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [ouverte, setOuverte] = useState(null);     // id de la pièce ouverte
  const [profil, setProfil] = useState(false);
  /* ENVOYER À LA COMPTABILITÉ (3.5.694, Charles : « envoyer les pièces que je coche par mail à la comptabilité »). */
  const [coches, setCoches] = useState(() => new Set());
  const [envoi, setEnvoi] = useState(false);
  const basculer = id => setCoches(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const charger = useCallback(() => appel('GET', '').then(setD).catch(e => setErreur(e.message)), []);
  useEffect(() => { charger(); }, [charger]);

  const creer = async (nature) => {
    try {
      const j = await appel('POST', '/piece', { nature, date: auj(), date_piece: auj(), a_charge: nature === 'carte' ? A_CHARGE_CARTE[0] : nature === 'note' ? A_CHARGE_NOTE[0] : (d?.profil?.entite || 'Institut Ilya Prigogine'), ...(nature === 'carte' ? { carte: 'credit' } : {}),
        ...(nature === 'km' ? { periode: `${new Date().getFullYear()}` } : {}) });
      await charger(); setOuverte(j.id);
    } catch (e) { setErreur(e.message); }
  };
  const gsm = async () => {
    const m = new Date().getMonth() + 1;
    try { const j = await appel('POST', '/gsm', { annee: new Date().getFullYear(), semestre: m > 6 ? 2 : 1 }); await charger(); setOuverte(j.id); }
    catch (e) { setErreur(e.message); }
  };
  if (!d) return <p className="text-sm text-slate-500">{erreur || 'Chargement…'}</p>;
  const p = d.pieces.find(x => x.id === ouverte);
  const choisies = d.pieces.filter(x => coches.has(x.id));
  const toutes = d.pieces.length > 0 && choisies.length === d.pieces.length;
  const envoyer = async () => {
    if (!choisies.length) return;
    const total = choisies.filter(x => x.nature !== 'km').reduce((t, x) => t + (Number(x.montant) || 0), 0);
    const deja = choisies.filter(x => x.envoye_le).length;
    const sans = choisies.filter(x => x.nature !== 'km' && !x.justificatifs.length).length;
    if (!(await demander(`Envoyer ${choisies.length} pièce${choisies.length > 1 ? 's' : ''} à la comptabilité (compta.asbl@helb-prigogine.be) ?\n\n`
      + `Un courriel, un PDF par pièce avec ses justificatifs${total ? ` — total ${eur(total)}` : ''}.`
      + (deja ? `\n\n⚠ ${deja} pièce${deja > 1 ? 's ont' : ' a'} déjà été envoyée${deja > 1 ? 's' : ''}.` : '')
      + (sans ? `\n⚠ ${sans} pièce${sans > 1 ? 's n’ont' : ' n’a'} aucun justificatif joint.` : '')))) return;
    setEnvoi(true); setErreur(null);
    try {
      const j = await appel('POST', '/envoyer', { ids: choisies.map(x => x.id) });
      setCoches(new Set()); await charger();
      informer(`✓ ${j.envoyees} pièce${j.envoyees > 1 ? 's envoyées' : ' envoyée'} à ${j.a}.${j.simule ? ' (Serveur de courriel non configuré : envoi simulé.)' : ''}`);
    } catch (e) { setErreur(e.message); }
    finally { setEnvoi(false); }
  };
  return (
    <div className="space-y-4">
      <Encadre etat="neutre" icone={IconLock}>Vos pièces ne sont visibles que de vous : ni la direction adjointe, ni l’administrateur ne les lisent.</Encadre>
      {erreur && <Encadre etat="corriger">{erreur}</Encadre>}
      <div className="flex flex-wrap gap-2">
        <button className="bouton bouton-fort inline-flex items-center gap-1.5" onClick={() => creer('note')}><IconPlus size={15} />Note de frais</button>
        <button className="bouton inline-flex items-center gap-1.5" onClick={gsm}><IconDeviceMobile size={15} />Note GSM du semestre</button>
        <button className="bouton inline-flex items-center gap-1.5" onClick={() => creer('carte')}><IconCreditCard size={15} />Dépense Visa (carte de l’ASBL)</button>
        <button className="bouton inline-flex items-center gap-1.5" onClick={() => creer('km')}><IconCar size={15} />Frais de parcours</button>
        <span className="flex-1" />
        <button className="bouton inline-flex items-center gap-1.5" onClick={() => setProfil(true)}><IconUser size={15} />Mes coordonnées</button>
      </div>
      <section className="carte overflow-hidden">
        <EnteteCarte icone={IconReceipt} titre="Mes pièces" sous="Une ligne ouvre la pièce ; le PDF sort au modèle de l’ASBL, signé, justificatifs à la suite. Cochez des pièces pour les envoyer à la comptabilité.">
          <button className="bouton bouton-sortir inline-flex items-center gap-1.5" disabled={!choisies.length || envoi} onClick={envoyer}
            title="Un courriel à compta.asbl@helb-prigogine.be, un PDF par pièce cochée">
            <IconSend size={15} />{envoi ? 'Envoi…' : `Envoyer à la comptabilité${choisies.length ? ` (${choisies.length})` : ''}`}
          </button>
        </EnteteCarte>
        <Tableau className="!border-0 !rounded-none">
          <TableauEntete><Th style={{ width: 36 }}><input type="checkbox" checked={toutes} title="Tout cocher"
            onChange={() => setCoches(toutes ? new Set() : new Set(d.pieces.map(x => x.id)))} /></Th><Th>Pièce</Th><Th>Date</Th><Th>Fournisseur / période</Th><Th align="droite">Montant / km</Th><Th align="droite">Justif.</Th><Th>Envoyée</Th></TableauEntete>
          <tbody>
            {!d.pieces.length && <TableauVide colonnes={7}>Aucune pièce pour l’instant.</TableauVide>}
            {d.pieces.map(x => {
              const N = NATURES[x.nature] || NATURES.note;
              const km = x.trajets.reduce((s, t) => s + (Number(t.km) || 0), 0);
              return (
                <Tr key={x.id} actif={x.id === ouverte} className="cursor-pointer" onClick={() => setOuverte(x.id)}>
                  <Td onClick={e => e.stopPropagation()}><input type="checkbox" checked={coches.has(x.id)} onChange={() => basculer(x.id)} /></Td>
                  <Td><span className="inline-flex items-center gap-1.5"><N.I size={15} className="text-slate-500" />{N.l}</span></Td>
                  <Td>{x.nature === 'km' && x.date_du ? (x.date_du === x.date_au ? jj(x.date_du) : `${jj(x.date_du)} → ${jj(x.date_au)}`) : jj(x.date)}</Td>
                  <Td>{x.nature === 'km' ? `${x.trajets.length} trajet(s)${x.periode ? ` · ${x.periode}` : ''}` : x.fournisseur || '—'}{x.periode && x.nature === 'note' ? ` · ${x.periode}` : ''}</Td>
                  <Td align="droite">{x.nature === 'km' ? `${Math.round(km * 10) / 10} km` : eur(x.montant)}</Td>
                  <Td align="droite">{x.justificatifs.length || ''}</Td>
                  <Td>{x.envoye_le ? <span className="inline-flex items-center gap-1 text-second text-slate-600" title={`Envoyée à ${x.envoye_a || 'la comptabilité'}`}>
                    <IconCheck size={14} style={{ color: 'var(--c-reussi)' }} />{jj(x.envoye_le)}</span> : ''}</Td>
                </Tr>);
            })}
          </tbody>
        </Tableau>
      </section>
      {p && <FenetrePiece p={p} profil={d.profil} lieux={d.lieux || []} onFermer={() => setOuverte(null)} recharger={charger} />}
      {profil && <FenetreProfil profil={d.profil} lieux={d.lieux || []} onFermer={() => setProfil(false)} recharger={charger} />}
    </div>);
}

function Champ({ l, children }) {
  return <label className="block"><span className="block text-second text-slate-600 mb-0.5">{l}</span>{children}</label>;
}

function FenetreProfil({ profil, lieux, onFermer, recharger }) {
  const [v, setV] = useState({ prenom: '', nom: '', fonction: 'Directeur(rice)', iban: '', depart: '', entite: '', domicile: '', ...profil });
  const [err, setErr] = useState(null);
  const enreg = async () => { try { await appel('PUT', '/profil', v); await recharger(); onFermer(); } catch (e) { setErr(e.message); } };
  const c = k => ({ value: v[k] || '', onChange: e => setV({ ...v, [k]: e.target.value }), className: 'controle w-full' });
  return (
    <Fenetre icone={IconUser} titre="Mes coordonnées" sous="Reprises sur chaque pièce" onFermer={onFermer}
      pied={<><span className="text-second text-slate-500 min-w-0 flex-1">{err}</span><button className="bouton bouton-fort" onClick={enreg}>Enregistrer</button></>}>
      <div className="grid sm:grid-cols-2 gap-3">
        <Champ l="Prénom"><input {...c('prenom')} /></Champ>
        <Champ l="Nom"><input {...c('nom')} /></Champ>
        <Champ l="Fonction"><select {...c('fonction')}>{['Directeur(rice)', 'Directeur(rice) adjoint(e)', 'Responsable'].map(f => <option key={f}>{f}</option>)}</select></Champ>
        <Champ l="IBAN pour le remboursement"><input {...c('iban')} placeholder="BE.." /></Champ>
        <Champ l="Lieu de travail (départ des trajets)"><input {...c('depart')} /></Champ>
        <Champ l="Domicile (repris de votre fiche du personnel)"><input {...c('domicile')} placeholder="rue, n°, code postal, commune" /></Champ>
        <Champ l="À charge de (par défaut)"><input {...c('entite')} /></Champ>
      </div>
      {lieux.length > 0 && (<>
        <div className="intertitre mt-4 mb-1">Mes lieux favoris</div>
        <ul className="divide-y divide-slate-100 text-sm">
          {lieux.map(l => (
            <li key={l.id} className="py-1.5 flex items-center gap-2">
              <span className="min-w-0 flex-1"><b>{l.nom}</b> <span className="text-slate-500">{[l.rue, [l.cp, l.localite].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</span></span>
              <button type="button" className="text-slate-400 hover:text-red-700" title="Retirer des favoris" onClick={async () => { await appel('DELETE', `/lieu/${l.id}`); recharger(); }}><IconTrash size={14} /></button>
            </li>))}
        </ul></>)}
    </Fenetre>);
}

function FenetrePiece({ p, profil, lieux, onFermer, recharger }) {
  const [v, setV] = useState(p);
  const [err, setErr] = useState(null);
  const VIDE = { date: auj(), depart_type: 'travail', depart: '', cp: '', localite: '', rue: '', entreprise: '', raison: '', a_charge: 'Entité', km: '', favori: false };
  const [t, setT] = useState(VIDE);
  // L'ARRIVÉE SE SAISIT AVEC L'AIDE BPOST (code postal → localité → rue), comme une adresse de fiche ; elle se recompose en une ligne.
  const arrivee = [t.rue, [t.cp, t.localite].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const [calc, setCalc] = useState(null);
  useEffect(() => { setV(p); }, [p]);
  const N = NATURES[p.nature] || NATURES.note;
  const maj = async (patch) => { setV({ ...v, ...patch }); try { await appel('PUT', `/piece/${p.id}`, patch); recharger(); } catch (e) { setErr(e.message); } };
  const c = k => ({ value: v[k] ?? '', onChange: e => setV({ ...v, [k]: e.target.value }), onBlur: e => maj({ [k]: e.target.value }), className: 'controle w-full' });
  const pdf = async () => {
    setErr(null);
    const r = await fetch(`/api/mes-frais/piece/${p.id}/pdf`, { headers: authHeaders() });
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error || 'PDF refusé.'); return; }
    window.open(URL.createObjectURL(await r.blob()), '_blank');
  };
  const joindre = async (f) => {
    if (!f) return;
    const data = await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(f); });
    try { await appel('POST', `/piece/${p.id}/justificatif`, { nom: f.name, data }); recharger(); } catch (e) { setErr(e.message); }
  };
  const voirJ = async (j) => {
    const r = await fetch(`/api/mes-frais/justificatif/${j.id}`, { headers: authHeaders() });
    if (r.ok) window.open(URL.createObjectURL(await r.blob()), '_blank');
  };
  /* UN BOUTON ENREGISTRER (3.5.250, Charles : « pas de bouton sauver ! »). Les champs s'enregistraient déjà en les quittant ;
     le bouton écrit tout ce qui diffère encore de la pièce, puis ferme — et dit « enregistré » quand rien ne restait. */
  const [enreg, setEnreg] = useState(false);
  const enregistrer = async () => {
    setErr(null); setEnreg(true);
    const champs = ['date', 'date_piece', 'carte', 'fournisseur', 'montant', 'periode', 'a_charge', 'objet', 'commentaire', 'motif', 'description'];
    const patch = Object.fromEntries(Object.entries(v).filter(([k, x]) => (champs.includes(k) || (k in p && typeof x !== 'object')) && String(x ?? '') !== String(p[k] ?? '') && k !== 'id'));
    try {
      if (Object.keys(patch).length) await appel('PUT', `/piece/${p.id}`, patch);
      // Un trajet saisi mais pas encore ajouté ne se perd plus : il s'ajoute avec le reste.
      if (p.nature === 'km' && (t.cp || t.rue || t.km)) {
        if (!t.cp || !t.rue) throw new Error('Le trajet en cours n’a pas d’adresse d’arrivée complète (code postal et rue).');
        await appel('POST', `/piece/${p.id}/trajet`, { ...t, arrivee });
        if (t.favori) await appel('POST', '/lieu', { nom: t.entreprise || arrivee, entreprise: t.entreprise, rue: t.rue, cp: t.cp, localite: t.localite, raison: t.raison });
      }
      await recharger(); onFermer();
    }
    catch (e) { setErr(e.message); } finally { setEnreg(false); }
  };
  const supprimer = async () => {
    if (!(await demander('Supprimer cette pièce et ses justificatifs ?'))) return;
    try { await appel('DELETE', `/piece/${p.id}`); await recharger(); onFermer(); } catch (e) { setErr(e.message); }
  };
  const calculer = async (x = t) => {
    const arr = [x.rue, [x.cp, x.localite].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    if (!x.cp || !x.rue) return;
    try {
      const j = await appel('GET', `/km?type=${x.depart_type}&depart=${encodeURIComponent(x.depart)}&arrivee=${encodeURIComponent(arr)}`);
      setCalc(j.km_ar ?? j.raison); if (j.km_ar != null) setT(x => ({ ...x, km: String(j.km_ar) }));
    } catch (e) { setCalc(e.message); }
  };
  const ajouterTrajet = async () => {
    if (!t.cp || !t.rue) { setErr('L’adresse d’arrivée est requise (code postal et rue).'); return; }
    try {
      await appel('POST', `/piece/${p.id}/trajet`, { ...t, arrivee });
      if (t.favori) await appel('POST', '/lieu', { nom: t.entreprise || arrivee, entreprise: t.entreprise, rue: t.rue, cp: t.cp, localite: t.localite, raison: t.raison });
      setT(VIDE); setCalc(null); recharger();
    }
    catch (e) { setErr(e.message); }
  };
  /* CORRIGER UN TRAJET DÉJÀ AJOUTÉ (3.5.263) : le crayon rend la ligne modifiable ; une adresse changée fait recalculer la carte. */
  const [edite, setEdite] = useState(null);
  const corrigerTrajet = async () => {
    const x = p.trajets.find(y => y.id === edite.id); if (!x) return;
    const patch = Object.fromEntries(['date', 'depart', 'arrivee', 'entreprise', 'raison', 'a_charge', 'km']
      .filter(k => String(edite[k] ?? '') !== String((k === 'date' ? String(x.date || '').slice(0, 10) : x[k]) ?? '')).map(k => [k, edite[k]]));
    if ((('depart' in patch) || ('arrivee' in patch)) && !('km' in patch)) patch.km = '';
    try { if (Object.keys(patch).length) await appel('PUT', `/trajet/${x.id}`, patch); setEdite(null); recharger(); } catch (e) { setErr(e.message); }
  };
  const totalKm = p.trajets.reduce((s, x) => s + (Number(x.km) || 0), 0);
  return (
    <Fenetre icone={N.I} large="grande" titre={N.l} sous={`${profil.prenom || ''} ${profil.nom || ''}`.trim() || 'Complétez « Mes coordonnées »'} onFermer={onFermer}
      outils={<OutilFenetre Icone={IconFileTypePdf} titre="Le PDF au modèle de l’ASBL" onClick={pdf} />}
      pied={<><button className="bouton bouton-detruire inline-flex items-center gap-1.5" onClick={supprimer}><IconTrash size={15} />Supprimer</button>
        <span className="text-second min-w-0 flex-1 text-right" style={err ? { color: 'var(--c-refuse)' } : { color: 'rgb(var(--gris-500))' }}>{err || ''}</span>
        <button className="bouton" onClick={onFermer}>Fermer</button>
        <button className="bouton bouton-fort inline-flex items-center gap-1.5" disabled={enreg} onClick={enregistrer}><IconDeviceFloppy size={15} />{enreg ? 'Enregistrement…' : 'Enregistrer'}</button></>}>
      <div className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <Champ l="Date de la dépense"><input type="date" {...c('date')} /></Champ>
          <Champ l="Date de la pièce (signature)"><input type="date" {...c('date_piece')} /></Champ>
          {p.nature === 'carte' && <Champ l="Carte"><select {...c('carte')} value={v.carte || 'credit'} onChange={e => maj({ carte: e.target.value })}><option value="credit">Carte de crédit (VISA)</option><option value="debit">Carte de débit</option></select></Champ>}
          {p.nature !== 'km' && <Champ l="Fournisseur"><input {...c('fournisseur')} /></Champ>}
          {p.nature !== 'km' && <Champ l="Montant EUR TTC"><input type="number" step="0.01" {...c('montant')} /></Champ>}
          <Champ l="Période (facultatif)"><input {...c('periode')} placeholder="juillet-décembre 2026" /></Champ>
          {p.nature !== 'km'
            ? (() => { const liste = p.nature === 'carte' ? A_CHARGE_CARTE : A_CHARGE_NOTE; return (
              <Champ l="À charge de (case du formulaire)"><select {...c('a_charge')} onChange={e => maj({ a_charge: e.target.value })}>{!liste.includes(v.a_charge) && <option value={v.a_charge || ''}>{v.a_charge || '—'}</option>}{liste.map(o => <option key={o} value={o}>{o}</option>)}</select></Champ>); })()
            : <Champ l="À charge de"><input {...c('a_charge')} /></Champ>}
        </div>
        {p.nature !== 'km' && <Champ l="Objet et localisation de la dépense"><textarea rows={3} {...c('objet')} className="controle w-full h-auto py-1.5" /></Champ>}
        {p.nature === 'km' && (
          <section className="carte overflow-hidden">
            <EnteteCarte icone={IconCar} titre="Trajets" sous={`Kilomètres aller-retour · total ${Math.round(totalKm * 10) / 10} km`} />
            <Tableau dense className="!border-0 !rounded-none">
              <TableauEntete><Th>Date</Th><Th>Départ</Th><Th>Arrivée</Th><Th>Entreprise</Th><Th>Raison</Th><Th>À charge</Th><Th align="droite">KM</Th><Th /></TableauEntete>
              <tbody>
                {p.trajets.map(x => (edite?.id === x.id ? (
                  <Tr key={x.id}>
                    {['date', 'depart', 'arrivee', 'entreprise', 'raison', 'a_charge'].map(k => (
                      <Td key={k}><input type={k === 'date' ? 'date' : 'text'} className="controle !h-8 w-full min-w-[6rem]" value={edite[k] ?? ''}
                        onChange={e => setEdite({ ...edite, [k]: e.target.value })} /></Td>))}
                    <Td align="droite"><input type="number" step="0.1" className="controle !h-8 w-20 text-right" value={edite.km ?? ''}
                      onChange={e => setEdite({ ...edite, km: e.target.value })} /></Td>
                    <Td align="droite" className="whitespace-nowrap">
                      <button type="button" className="text-slate-500 hover:text-iip-blue mr-2" title="Enregistrer le trajet" onClick={corrigerTrajet}><IconCheck size={15} /></button>
                      <button type="button" className="text-slate-400 hover:text-slate-700" title="Annuler" onClick={() => setEdite(null)}><IconX size={15} /></button>
                    </Td>
                  </Tr>) : (
                  <Tr key={x.id}>
                    <Td>{jj(x.date)}</Td><Td>{x.depart}</Td><Td>{x.arrivee}</Td><Td>{x.entreprise}</Td><Td>{x.raison}</Td><Td>{x.a_charge}</Td>
                    <Td align="droite">{x.km ?? '—'}{x.km_calcule != null && Number(x.km_calcule) !== Number(x.km) ? <span className="text-slate-400"> (carte : {x.km_calcule})</span> : ''}</Td>
                    <Td align="droite" className="whitespace-nowrap">
                      <button type="button" className="text-slate-400 hover:text-iip-blue mr-2" title="Corriger ce trajet" onClick={() => setEdite({ ...x, date: String(x.date || '').slice(0, 10) })}><IconPencil size={14} /></button>
                      <button type="button" className="text-slate-400 hover:text-red-700" title="Retirer" onClick={async () => { await appel('DELETE', `/trajet/${x.id}`); recharger(); }}><IconTrash size={14} /></button>
                    </Td>
                  </Tr>)))}
              </tbody>
            </Tableau>
            <div className="p-3 space-y-3">
              <div className="grid sm:grid-cols-4 gap-2 items-end">
                <Champ l="Date"><input type="date" className="controle w-full" value={t.date} onChange={e => setT({ ...t, date: e.target.value })} /></Champ>
                <Champ l="Départ">
                  <div className="segments w-full">{[['travail', 'Lieu de travail'], ['domicile', 'Domicile'], ['autre', 'Autre']].map(([k, l]) => (
                    <button key={k} type="button" className={`flex-1 ${t.depart_type === k ? 'choisi bg-iip-blue text-white font-semibold' : 'text-slate-600'}`}
                      onClick={() => setT({ ...t, depart_type: k })}>{l}</button>))}</div>
                </Champ>
                <div className="sm:col-span-2 text-second text-slate-500 pb-2">
                  {t.depart_type === 'travail' ? profil.depart : t.depart_type === 'domicile' ? (profil.domicile || 'domicile inconnu : complétez « Mes coordonnées »') : ''}
                  {t.depart_type === 'autre' && <input className="controle w-full" value={t.depart} onChange={e => setT({ ...t, depart: e.target.value })} placeholder="adresse de départ" />}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="intertitre">Arrivée</span>
                {/* LES LIEUX FAVORIS (3.5.200) : un clic remplit l'adresse, l'entreprise et la raison, et calcule les km. */}
                {lieux.length > 0 && (
                  <select className="controle" value="" onChange={e => {
                    const l = lieux.find(x => String(x.id) === e.target.value); if (!l) return;
                    const n = { ...t, rue: l.rue || '', cp: l.cp || '', localite: l.localite || '', entreprise: l.entreprise || l.nom, raison: l.raison || t.raison, km: '' };
                    setT(n); calculer(n);
                  }}>
                    <option value="">★ Un lieu favori…</option>
                    {lieux.map(l => <option key={l.id} value={l.id}>{l.nom}{l.localite ? ` — ${l.localite}` : ''}</option>)}
                  </select>)}
              </div>
              <div onBlur={() => calculer()}>
                <ChampsAdresse valeurs={t} poser={(k, val) => setT(x => ({ ...x, [k]: val }))} classe="controle w-full" />
              </div>
              <div className="grid sm:grid-cols-4 gap-2 items-end">
                <Champ l="Entreprise"><input className="controle w-full" value={t.entreprise} onChange={e => setT({ ...t, entreprise: e.target.value })} /></Champ>
                <Champ l="Raison du déplacement"><input className="controle w-full" value={t.raison} onChange={e => setT({ ...t, raison: e.target.value })} /></Champ>
                <Champ l="À charge de"><input className="controle w-full" value={t.a_charge} onChange={e => setT({ ...t, a_charge: e.target.value })} /></Champ>
                <Champ l={`KM aller-retour${typeof calc === 'number' ? ` (carte : ${calc})` : ''}`}><input type="number" step="0.1" className="controle w-full" value={t.km} onChange={e => setT({ ...t, km: e.target.value })} /></Champ>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button className="bouton inline-flex items-center gap-1.5" onClick={ajouterTrajet}><IconPlus size={15} />Ajouter le trajet</button>
                <button className="bouton" onClick={() => calculer()}>Calculer les km</button>
                <label className="inline-flex items-center gap-1.5 text-second text-slate-600"><input type="checkbox" checked={t.favori} onChange={e => setT({ ...t, favori: e.target.checked })} />Garder ce lieu en favori</label>
                <span className="text-second text-slate-500">{typeof calc === 'string' ? calc : 'Kilomètres calculés par Lucie (OpenStreetMap, trajet le plus court en voiture), aller-retour ; le chiffre tapé l’emporte.'}</span>
              </div>
            </div>
          </section>)}
        <section className="carte overflow-hidden">
          <EnteteCarte icone={IconPaperclip} titre="Justificatifs" sous="PDF, JPEG ou PNG — joints à la suite de la pièce." >
            <label className="bouton inline-flex items-center gap-1.5 cursor-pointer"><IconPlus size={15} />Joindre<input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => joindre(e.target.files?.[0])} /></label>
          </EnteteCarte>
          <ul className="divide-y divide-slate-100">
            {!p.justificatifs.length && <li className="px-4 py-3 text-second text-slate-500">Aucun justificatif.</li>}
            {p.justificatifs.map(j => (
              <li key={j.id} className="px-4 py-2 flex items-center gap-2 text-sm">
                <button type="button" className="text-iip-blue underline min-w-0 flex-1 text-left truncate" onClick={() => voirJ(j)}>{j.nom}</button>
                <span className="text-second text-slate-500">{Math.round(j.taille / 1024)} Ko</span>
                <button type="button" className="text-slate-400 hover:text-red-700" title="Retirer" onClick={async () => { await appel('DELETE', `/justificatif/${j.id}`); recharger(); }}><IconTrash size={14} /></button>
              </li>))}
          </ul>
        </section>
      </div>
    </Fenetre>);
}
