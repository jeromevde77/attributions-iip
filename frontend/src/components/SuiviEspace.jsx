import { useCallback, useEffect, useState } from 'react';
import { IconWorld, IconKey, IconEye } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { useDroits } from '../lib/droits.js';

/**
 * SON ESPACE ÉTUDIANT, VU DE LUCIE (3.1.475, sorti de PiecesEtudiant en 3.1.513) : la dernière connexion, les pièces
 * ouvertes et les accusés signés, tels que Lucie les a relevés de l'autre côté du mur ; et l'accès hors de Belgique.
 * Montré dans la fiche (onglet Suivi) — depuis 3.1.503, « Une personne » d'Éditions n'ouvre plus ce panneau.
 */
export default function SuiviEspace({ id }) {
  const [espace, setEspace] = useState(null);
  const charger = useCallback(() => {
    if (!id) return;
    fetch(`/api/portail-suivi/${id}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null)).then(setEspace).catch(() => {});
  }, [id]);
  useEffect(() => { charger(); }, [charger]);
  /* VOIR COMME L'ÉTUDIANT (3.1.518) : la direction ouvre son espace en lecture seule, dans un nouvel onglet. L'onglet
     s'ouvre au clic (sinon l'iPad le bloque), le lien d'une minute y arrive ensuite. */
  const { passe } = useDroits();
  const direction = passe('admin');   // la direction et l'administrateur, pas le secrétariat (même règle que le serveur)
  const [erreurApercu, setErreurApercu] = useState(null);
  const voirComme = async () => {
    setErreurApercu(null);
    const w = window.open('', '_blank');
    try {
      const r = await fetch(`/api/portail-suivi/${id}/apercu`, { method: 'POST', headers: authHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      if (w) w.location = j.url; else window.location.href = j.url;
    } catch (e) { w?.close(); setErreurApercu(e.message); }
  };
  if (!espace) return null;
  const jour = d => String(d || '').slice(0, 10).split('-').reverse().join('/');
  return <>
    {espace.actif && espace.sans_adresse_ecole && <CodeCandidat id={id} candidat={espace.candidat} onChange={charger} />}
    {espace.actif && <AccesHorsBelgique id={id} exception={espace.exception} onChange={charger} />}
    <div className="bloc-etat px-3 py-2 text-second mb-3 space-y-1" data-etat="neutre">
      {direction && espace.actif && <div className="float-right flex flex-col items-end gap-1">
        <button type="button" className="bouton inline-flex items-center gap-1.5" onClick={voirComme}><IconEye size={15} /> Voir son espace</button>
        {erreurApercu && <span className="text-red-700 max-w-[320px] text-right">{erreurApercu}</span>}
      </div>}
      <div className="font-semibold text-iip-texte">Son espace étudiant
        {espace.connexions[0]
          ? <span className="font-normal text-slate-500"> · dernière connexion le {jour(espace.connexions[0].utilise_le)} à {String(espace.connexions[0].utilise_le).slice(11, 16)}</span>
          : <span className="font-normal text-slate-500"> · jamais connecté</span>}</div>
      {espace.pae && <div className="flex flex-wrap gap-x-2">
        <span className="min-w-0 flex-1">PAE {espace.pae.annee}</span>
        <span className={espace.pae.a_jour ? 'text-emerald-700' : 'text-amber-700'}>{espace.pae.a_jour
          ? `confirmé par l'étudiant le ${jour(espace.pae.signe_le)}` : `confirmé par l'étudiant le ${jour(espace.pae.signe_le)}, programme modifié depuis`}</span>
      </div>}
      {espace.accuses.map((a, i) => (
        <div key={i} className="flex flex-wrap gap-x-2">
          <span className="min-w-0 flex-1 truncate">{a.piece}</span>
          <span className={a.signe_le ? 'text-emerald-700' : 'text-amber-700'}>
            {a.signe_le ? `accusé signé le ${jour(a.signe_le)}` : `ouvert le ${jour(a.presente_le)}, non signé`}</span>
        </div>))}
    </div>
  </>;
}

/* L'ACCÈS HORS DE BELGIQUE (3.1.513, Charles : « bloquer, avec une exception accordée par le secrétariat pour une
   période »). L'espace ne s'ouvre que depuis la Belgique ; le secrétariat et la direction l'ouvrent ici jusqu'à une
   date, avec un motif (stage, Erasmus). La coordination le lit. */
function AccesHorsBelgique({ id, exception, onChange }) {
  const { passe } = useDroits();
  const peut = passe('admin', 'editeur');
  const [ouvert, setOuvert] = useState(false);
  const [jusqu, setJusqu] = useState('');
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState(null);
  const jour = d => String(d || '').slice(0, 10).split('-').reverse().join('/');
  const envoyer = async (methode, corps) => {
    setErreur(null);
    const r = await fetch(`/api/portail-suivi/${id}/exception`, { method: methode,
      headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErreur(j.error || `Erreur ${r.status}`); return; }
    setOuvert(false); setMotif(''); setJusqu(''); onChange?.();
  };
  return (
    <div className="bloc-etat px-3 py-2 text-second mb-3 space-y-1.5" data-etat={exception ? 'disponible' : 'neutre'}>
      <div className="flex flex-wrap items-center gap-2">
        <IconWorld size={15} className="text-slate-400" />
        <span className="flex-1 min-w-0">
          {exception
            ? <>Son espace s'ouvre aussi <b>hors de Belgique</b> jusqu'au {jour(exception.jusqu_au)} — {exception.motif}
              <span className="text-slate-500"> (par {exception.par}, le {jour(exception.le)})</span></>
            : <>Son espace ne s'ouvre que <b>depuis la Belgique</b>.</>}
        </span>
        {peut && !ouvert && <button type="button" className="bouton" onClick={() => setOuvert(true)}>{exception ? 'Prolonger' : 'Ouvrir hors de Belgique'}</button>}
        {peut && exception && !ouvert && <button type="button" className="bouton" onClick={() => envoyer('DELETE')}>Retirer</button>}
      </div>
      {ouvert && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-slate-600">jusqu'au <input type="date" value={jusqu} onChange={e => setJusqu(e.target.value)} className="controle ml-1" /></label>
          <input value={motif} onChange={e => setMotif(e.target.value)} placeholder="Motif : stage à…, Erasmus à…" className="controle flex-1 min-w-[200px]" data-reponses="Motif d'ouverture hors de Belgique" />
          <button type="button" className="bouton bouton-fort" disabled={!jusqu || !motif.trim()} onClick={() => envoyer('POST', { jusqu_au: jusqu, motif })}>Enregistrer</button>
          <button type="button" className="bouton" onClick={() => { setOuvert(false); setErreur(null); }}>Annuler</button>
        </div>)}
      {erreur && <div className="text-red-700">{erreur}</div>}
    </div>
  );
}

/* LE CODE D'ACCÈS DU CANDIDAT (3.1.514, Charles : « dès qu'un étudiant est inscrit dans Lucie, il reçoit un code d'accès
   temporaire à son dossier jusqu'à avoir une adresse officielle »). Envoyé d'office aux dossiers créés depuis la mise en
   service ; ici, l'envoyer ou le renouveler (adresse privée, 60 jours). */
function CodeCandidat({ id, candidat, onChange }) {
  const { passe } = useDroits();
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const jour = d => String(d || '').slice(0, 10).split('-').reverse().join('/');
  const valable = candidat && candidat.jusqu_au >= new Date().toISOString().slice(0, 10);
  const envoyer = async () => {
    setErreur(null); setEnCours(true);
    try {
      const r = await fetch(`/api/portail-suivi/${id}/code-candidat`, { method: 'POST', headers: authHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      onChange?.();
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };
  return (
    <div className="bloc-etat px-3 py-2 text-second mb-3 space-y-1" data-etat={valable ? 'disponible' : 'neutre'}>
      <div className="flex flex-wrap items-center gap-2">
        <IconKey size={15} className="text-slate-400" />
        <span className="flex-1 min-w-0">
          Pas encore d'adresse de l'institut : {valable
            ? <>son <b>code d'accès</b> vaut jusqu'au {jour(candidat.jusqu_au)} <span className="text-slate-500">(envoyé le {jour(candidat.cree_le)} à {candidat.envoye_a}, par {candidat.par})</span>. Il ouvre sa demande de VA et ses documents.</>
            : <>{candidat ? <>son code d'accès est <b>échu</b> depuis le {jour(candidat.jusqu_au)}.</> : <>aucun code d'accès à son espace.</>}</>}
        </span>
        {passe('admin', 'editeur') && <button type="button" className="bouton" disabled={enCours} onClick={envoyer}>
          {enCours ? 'Envoi…' : candidat ? 'Envoyer un nouveau code' : "Envoyer un code d'accès"}</button>}
      </div>
      {erreur && <div className="text-red-700">{erreur}</div>}
    </div>
  );
}
