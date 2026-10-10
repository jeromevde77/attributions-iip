import { ouvrirApercuPdf } from '../lib/apercu.js';
/**
 * COMPLÉTER UNE ANNEXE DANS LUCIE (Charles, 27 septembre 2026 : « cela ne me
 * sert à rien d'avoir un document Word à compléter dans Word… il faut que
 * Lucie s'en charge ! »).
 *
 * Ce que Lucie sait arrive déjà écrit ; ce qu'elle ne sait pas se saisit ici,
 * s'enregistre, et la pièce sort COMPLÈTE — en Word pour GEDI, en PDF pour
 * l'archive. Le serveur refuse de produire tant qu'il manque quelque chose, et
 * le pied de la fenêtre dit quoi.
 */
import { useEffect, useState } from 'react';
import { IconFileCheck } from '@tabler/icons-react';
import { Fenetre } from './ui.jsx';
import { authHeaders } from '../lib/api.js';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const champ = 'controle w-full border border-slate-300 rounded-champ bg-white text-sm';
const Etiq = ({ children }) => <div className="text-xs text-slate-500 mb-0.5">{children}</div>;

export default function SaisieAnnexe({ annexe, membre, annee, moisInitial, onFermer }) {
  const [mois, setMois] = useState(moisInitial || new Date().getMonth() + 1);
  const [v, setV] = useState(null);
  const [info, setInfo] = useState(null);     // { enregistre, manques }
  const [erreur, setErreur] = useState(null);
  const [busy, setBusy] = useState(null);
  const [sale, setSale] = useState(false);
  const q = () => new URLSearchParams({ professeur_id: membre.id, annee, ...(annexe.mois ? { mois } : {}) });

  useEffect(() => {
    setV(null); setErreur(null);
    fetch(`/api/formulaires/${annexe.cle}/saisie?${q()}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); return j; })
      .then(j => { setV(j.valeurs); setInfo({ enregistre: j.enregistre, manques: j.manques }); setSale(false); })
      .catch(e => setErreur(e.message));
    // eslint-disable-next-line
  }, [annexe.cle, membre.id, annee, mois]);

  const maj = patch => { setV(x => ({ ...x, ...patch })); setSale(true); };
  const enregistrer = async () => {
    setBusy('save'); setErreur(null);
    try {
      const r = await fetch(`/api/formulaires/${annexe.cle}/saisie`, { method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ professeur_id: membre.id, annee, mois, valeurs: v }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      setInfo({ enregistre: { par: 'vous', le: new Date().toISOString() }, manques: j.manques }); setSale(false);
      return true;
    } catch (e) { setErreur(e.message); return false; } finally { setBusy(null); }
  };
  const produire = async format => {
    if (sale && !(await enregistrer())) return;
    setBusy(format); setErreur(null);
    try {
      const r = await fetch(`/api/formulaires/${annexe.cle}?${q()}${format === 'pdf' ? '&format=pdf' : ''}`, { headers: authHeaders() });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `Erreur ${r.status}`); }
      const cd = r.headers.get('Content-Disposition') || '';
      const nom = decodeURIComponent((/filename\*=UTF-8''([^;]+)/.exec(cd) || [])[1] || `${annexe.cle}.${format === 'pdf' ? 'pdf' : 'docx'}`);
      // Le PDF s'aperçoit avant de s'enregistrer ; le Word se télécharge (il se retouche).
      if (format === 'pdf') { ouvrirApercuPdf({ blob: await r.blob(), titre: annexe.titre, nomFichier: nom }); return; }
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a'); a.href = url; a.download = nom; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { setErreur(e.message); } finally { setBusy(null); }
  };

  const manque = info?.manques || [];
  const pied = (
    <div className="flex items-center gap-3 w-full">
      <div className="flex-1 min-w-0 text-second text-slate-500">
        {sale ? 'Modifications non enregistrées.'
          : manque.length ? <span className="text-amber-700">À compléter : {manque.join(' ; ')}.</span>
          : info?.enregistre ? `Complète — enregistrée${info.enregistre.par && info.enregistre.par !== 'vous' ? ` par ${info.enregistre.par}` : ''}${info.enregistre.le ? ` le ${String(info.enregistre.le).slice(0, 10).split('-').reverse().join('/')}` : ''}.` : ''}
      </div>
      <button type="button" className="bouton" disabled={!v || busy || !sale} onClick={enregistrer}>{busy === 'save' ? '…' : 'Enregistrer'}</button>
      <button type="button" className="bouton bouton-sortir" disabled={!v || busy || (!sale && manque.length > 0)} onClick={() => produire('docx')}>{busy === 'docx' ? '…' : 'Word'}</button>
      <button type="button" className="bouton bouton-sortir" disabled={!v || busy || (!sale && manque.length > 0)} onClick={() => produire('pdf')}>{busy === 'pdf' ? '…' : 'Aperçu PDF'}</button>
    </div>
  );

  return (
    <Fenetre icone={IconFileCheck} titre={`${annexe.titre}`} sous={`${membre.nom} · ${annee}`} large="grande" pied={pied} onFermer={onFermer}>
      <div className="space-y-4">
        {erreur && <div data-etat="corriger" className="bloc-etat px-3 py-2 text-second">{erreur}</div>}
        {annexe.mois && (
          <label className="inline-flex items-center gap-2 text-sm">Mois
            <select value={mois} onChange={e => setMois(Number(e.target.value))} className="controle border border-slate-300 rounded-champ bg-white text-sm">
              {MOIS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </label>
        )}
        {!v ? (!erreur && <p className="text-sm text-slate-400">Chargement…</p>)
          : annexe.cle === 'A27' ? <FormA27 v={v} maj={maj} />
          : annexe.cle === 'A1ter' ? <FormA1ter v={v} maj={maj} />
          : null}
      </div>
    </Fenetre>
  );
}

/* A27 — les prestations du mois : une ligne par cours, ses dates et ses périodes. */
function FormA27({ v, maj }) {
  const majCours = (iu, ic, patch) => maj({ ues: v.ues.map((u, i) => i !== iu ? u : { ...u, cours: u.cours.map((c, j) => j !== ic ? c : { ...c, ...patch }) }) });
  return (
    <>
      {!v.ues?.length && <p className="text-sm text-slate-500">Aucune prestation d'expert cette année.</p>}
      {v.ues?.map((u, iu) => (
        <div key={iu} data-etat="neutre" className="bloc-etat px-3 py-2.5">
          <div className="text-sm font-semibold mb-1.5">{u.intitule}</div>
          <table className="w-full text-sm">
            <thead><tr className="tab-entete text-left text-xs text-slate-500">
              <th className="px-2 py-1 font-medium">Cours</th><th className="px-2 py-1 font-medium w-16">CLA</th>
              <th className="px-2 py-1 font-medium w-14">F</th><th className="px-2 py-1 font-medium">Dates des prestations du mois</th>
              <th className="px-2 py-1 font-medium w-24">Périodes</th></tr></thead>
            <tbody>
              {u.cours.map((c, ic) => (
                <tr key={ic} className="border-t border-slate-100">
                  <td className="px-2 py-1">{c.denomination}</td>
                  <td className="px-2 py-1">{c.cla}</td>
                  <td className="px-2 py-1">{c.f}</td>
                  <td className="px-2 py-1">
                    <input value={c.dates || ''} onChange={e => majCours(iu, ic, { dates: e.target.value })} placeholder="ex. 02, 09, 16/10" className={champ} />
                    {c.depuis_horaire && <div className="text-mention text-slate-400 mt-0.5">repris de l'horaire</div>}
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" min="0" step="1" value={c.periodes ?? ''} onChange={e => majCours(iu, ic, { periodes: e.target.value === '' ? '' : Math.round(Number(e.target.value)) })} className={champ} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Etiq>Date de la signature</Etiq><input type="date" value={v.date_signature || ''} onChange={e => maj({ date_signature: e.target.value })} className={champ} /></div>
        <div><Etiq>Chef d'établissement qui signe (prénom, nom)</Etiq><input value={v.signataire || ''} onChange={e => maj({ signataire: e.target.value })} className={champ} /></div>
      </div>
    </>
  );
}

/* A1 ter — le Doc12 de l'expert : l'en-tête, l'événement, les attributions. */
function FormA1ter({ v, maj }) {
  const majA = (i, patch) => maj({ attributions: v.attributions.map((a, j) => j !== i ? a : { ...a, ...patch }) });
  const Case = ({ k, children }) => (
    <label className="inline-flex items-center gap-1.5 text-sm"><input type="checkbox" checked={!!v[k]} onChange={e => maj({ [k]: e.target.checked })} />{children}</label>
  );
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <div><Etiq>N° du Doc12</Etiq><input type="number" min="1" value={v.num_doc ?? ''} onChange={e => maj({ num_doc: e.target.value })} className={champ} /></div>
        <div><Etiq>Dernier Doc12 transmis le</Etiq><input type="date" value={v.dernier_doc12 || ''} onChange={e => maj({ dernier_doc12: e.target.value })} className={champ} /></div>
        <div><Etiq>Début des prestations</Etiq><input type="date" value={v.date_debut || ''} onChange={e => maj({ date_debut: e.target.value })} className={champ} /></div>
        <div><Etiq>Cumul</Etiq>
          <select value={v.cumul || ''} onChange={e => maj({ cumul: e.target.value })} className={champ}>
            <option value="">—</option><option value="aucun">Pas de cumul interne</option><option value="A2">Cumul interne (A2)</option>
          </select>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        <Case k="joint_profil">Profil joint</Case>
        <Case k="joint_diplome">Diplôme joint</Case>
        <Case k="tardive">Transmission tardive par la faute du membre du personnel</Case>
      </div>
      <div data-etat="neutre" className="bloc-etat px-3 py-2.5">
        <div className="text-sm font-semibold mb-1.5">Attributions d'expert</div>
        <table className="w-full text-sm">
          <thead><tr className="tab-entete text-left text-xs text-slate-500">
            <th className="px-2 py-1 font-medium">U.E.</th><th className="px-2 py-1 font-medium w-14">F</th><th className="px-2 py-1 font-medium">Cours</th>
            <th className="px-2 py-1 font-medium w-14">CLA</th><th className="px-2 py-1 font-medium w-20">Sous-niv.</th>
            <th className="px-2 py-1 font-medium">Période d'occupation</th><th className="px-2 py-1 font-medium w-20">Périodes</th><th className="px-2 py-1 font-medium w-16">DI</th></tr></thead>
          <tbody>
            {(v.attributions || []).map((a, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="px-2 py-1 text-second">{a.ue}</td><td className="px-2 py-1">{a.f}</td><td className="px-2 py-1">{a.denomination}</td><td className="px-2 py-1">{a.cla}</td>
                <td className="px-2 py-1"><select value={a.sous_niveau || 'SU'} onChange={e => majA(i, { sous_niveau: e.target.value })} className={champ}>
                  {['SU', 'SS', 'SI'].map(x => <option key={x}>{x}</option>)}</select></td>
                <td className="px-2 py-1"><input value={a.periode_occ || ''} onChange={e => majA(i, { periode_occ: e.target.value })} placeholder="jjmmaa-jjmmaa" className={champ} /></td>
                <td className="px-2 py-1"><input type="number" min="0" value={a.nb_periodes ?? ''} onChange={e => majA(i, { nb_periodes: e.target.value })} className={champ} /></td>
                <td className="px-2 py-1"><input value={a.di || ''} onChange={e => majA(i, { di: e.target.value })} className={champ} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div><Etiq>Situation ancienne-nouvelle / observations</Etiq>
        <textarea rows={2} value={v.observations || ''} onChange={e => maj({ observations: e.target.value })} className="w-full border border-slate-300 rounded-champ bg-white text-sm p-2" /></div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div><Etiq>Signataire — NOM</Etiq><input value={v.signataire_nom || ''} onChange={e => maj({ signataire_nom: e.target.value.toUpperCase() })} className={champ} /></div>
        <div><Etiq>Prénom</Etiq><input value={v.signataire_prenom || ''} onChange={e => maj({ signataire_prenom: e.target.value })} className={champ} /></div>
        <div><Etiq>Qualité</Etiq><input value={v.signataire_qualite || ''} onChange={e => maj({ signataire_qualite: e.target.value })} className={champ} /></div>
        <div><Etiq>Date</Etiq><input type="date" value={v.date_signature || ''} onChange={e => maj({ date_signature: e.target.value })} className={champ} /></div>
      </div>
    </>
  );
}
