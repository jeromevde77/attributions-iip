/**
 * MON HORAIRE DANS MON AGENDA (28 octobre 2026). Le lien d'abonnement que
 * l'agenda du téléphone relit de lui-même. Le lien est SECRET et ne se montre
 * qu'à sa création (la base n'en garde que l'empreinte) : perdu, il se remplace,
 * et l'ancien cesse aussitôt. Serveur : `routes/agenda.js`.
 */
import { useEffect, useState } from 'react';
import { IconCalendarShare, IconCopy, IconRefresh } from '@tabler/icons-react';
import { Fenetre, Encadre } from './ui.jsx';
import { authHeaders } from '../lib/api.js';
import { demander } from '../lib/dialogue.jsx';

const fr = d => (d ? new Date(String(d).replace(' ', 'T') + 'Z').toLocaleString('fr-BE', { dateStyle: 'short', timeStyle: 'short' }) : '—');
async function appel(methode = 'GET') {
  const r = await fetch('/api/agenda/lien', { method: methode, headers: { 'Content-Type': 'application/json', ...authHeaders() } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
  return j;
}

export default function AgendaAbonnement({ onFermer }) {
  const [etat, setEtat] = useState(null);
  const [lien, setLien] = useState(null);       // { url, webcal } — seulement juste après la création
  const [erreur, setErreur] = useState(null);
  const [copie, setCopie] = useState(false);
  const charger = () => appel().then(setEtat).catch(e => setErreur(e.message));
  useEffect(() => { charger(); }, []);

  async function creer() {
    if (etat?.lien && !(await demander({ titre: 'Remplacer le lien ?', confirmer: 'Remplacer',
      message: 'L’ancien lien cessera aussitôt : l’agenda qui l’utilise ne recevra plus l’horaire. Il faudra y ajouter le nouveau.' }))) return;
    try { setLien(await appel('POST')); setCopie(false); await charger(); } catch (e) { setErreur(e.message); }
  }
  async function revoquer() {
    if (!(await demander({ titre: 'Désactiver le lien ?', message: 'L’agenda qui l’utilise ne recevra plus l’horaire.' }))) return;
    try { await appel('DELETE'); setLien(null); await charger(); } catch (e) { setErreur(e.message); }
  }
  async function copier() {
    try { await navigator.clipboard.writeText(lien.url); setCopie(true); } catch { setCopie(false); }
  }

  return (
    <Fenetre icone={IconCalendarShare} titre="Mon horaire dans mon agenda" large="moyenne" onFermer={onFermer}
      sous="L’horaire de Lucie dans l’agenda de votre téléphone ; il suit les changements de lui-même"
      pied={<>
        <span className="text-second min-w-0 flex-1" style={{ color: 'var(--c-refuse)' }}>{erreur}</span>
        {etat?.lien && <button type="button" className="bouton bouton-detruire" onClick={revoquer}>Désactiver le lien</button>}
        {etat?.professeur && <button type="button" className="bouton bouton-fort" onClick={creer}>
          {etat?.lien ? <><IconRefresh size={15} /> Nouveau lien</> : 'Créer mon lien'}</button>}
      </>}>
      {!etat && !erreur && <p className="text-sm text-slate-400">Chargement…</p>}
      {etat && !etat.professeur && (
        <Encadre etat="neutre" titre="Pas d’horaire à publier">Ce compte n’est relié à aucune fiche d’enseignant : l’horaire ne connaît que les cours des enseignants. La direction le relie dans Personnel → fiche de l’enseignant → Accès Lucie, en y indiquant l’adresse de connexion de ce compte (son rôle ne change pas).</Encadre>)}
      {etat?.professeur && (
        <div className="space-y-3 text-sm">
          <p className="m-0">Ajoutez ce lien une fois à votre agenda : vos cours y paraissent avec l’heure et le local, et un cours déplacé
            ou annulé s’y met à jour tout seul (l’agenda relit le lien toutes les quelques heures). {etat.seances} séance(s) à venir ou
            des deux derniers mois.</p>
          {lien ? (
            <div className="bloc-etat px-3 py-2 space-y-2" data-etat="reussi">
              <div className="font-semibold">Votre lien — copiez-le maintenant, il ne s’affichera plus</div>
              <div className="flex gap-2 items-center">
                <input readOnly value={lien.url} className="controle flex-1 min-w-0 border border-slate-300 rounded-champ bg-white text-second" onFocus={e => e.target.select()} />
                <button type="button" className="bouton" onClick={copier}><IconCopy size={15} /> {copie ? 'Copié' : 'Copier'}</button>
              </div>
              <a className="bouton bouton-sortir inline-flex" href={lien.webcal}>Ouvrir dans l’agenda de cet appareil</a>
            </div>
          ) : etat.lien ? (
            <Encadre etat="neutre" titre="Un lien est actif">
              Créé le {fr(etat.lien.cree_le)} · dernier passage de votre agenda : {fr(etat.lien.dernier_acces)}.
              Le lien ne se réaffiche pas : s’il est perdu, créez-en un nouveau (l’ancien cessera).
            </Encadre>
          ) : null}
          <div className="grid gap-2 md:grid-cols-3 text-second">
            <div className="carte px-3 py-2"><b>iPhone, iPad, Mac</b><br />Touchez « Ouvrir dans l’agenda de cet appareil » depuis l’appareil, ou Réglages → Calendrier → Comptes → Ajouter un compte → Autre → Calendrier avec abonnement, puis collez le lien.</div>
            <div className="carte px-3 py-2"><b>Google Agenda (Android)</b><br />Sur ordinateur : calendar.google.com → « Autres agendas » → « + » → « À partir de l’URL », collez le lien. Il paraît ensuite sur le téléphone. Google relit le lien moins souvent : un changement peut y mettre jusqu’à un jour.</div>
            <div className="carte px-3 py-2"><b>Outlook</b><br />Agenda → Ajouter un calendrier → « S’abonner à partir du web », collez le lien.</div>
          </div>
          <p className="text-second text-slate-500 m-0">Le lien est personnel : qui l’a voit votre horaire (cours, heures, locaux), rien d’autre — ni étudiant, ni note. Ne le partagez pas ; en cas de doute, créez-en un nouveau.</p>
        </div>
      )}
    </Fenetre>
  );
}
