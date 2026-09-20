// ─────────────────────────────────────────────────────────────────────────────
// MonCompte.jsx — Ce que chacun règle sur son propre accès.
//
// Aujourd'hui : le second facteur, et lui seul. L'écran est nommé « Mon
// compte » plutôt que « Second facteur » parce que le mot de passe et la
// signature y viendront, et qu'une fenêtre qu'il faut renommer à chaque
// ajout finit par s'appeler « Divers ».
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  IconShieldLock, IconShieldCheck, IconCopy, IconCheck, IconAlertTriangle,
} from '@tabler/icons-react';
import { Fenetre, GroupeFenetre, BoutonFenetre } from './ui.jsx';
import { api } from '../lib/api.js';

/**
 * Le QR, dessiné dans un <canvas> par la bibliothèque, à partir de la SEULE
 * URI otpauth. Rien n'est demandé au serveur : l'image d'un secret ne doit pas
 * faire un aller-retour de plus que le secret lui-même.
 */
function QrOtpauth({ uri }) {
  const toile = useRef(null);
  const [rate, setRate] = useState(false);
  useEffect(() => {
    if (!uri || !toile.current) return;
    QRCode.toCanvas(toile.current, uri, { width: 190, margin: 1,
      color: { dark: '#1B2B4B', light: '#FFFFFF' } })
      .catch(() => setRate(true));
  }, [uri]);
  if (rate) {
    return (
      <div className="text-[12px] text-slate-500 w-[190px] text-center">
        Le QR n'a pas pu être dessiné — recopiez la clé à la main, ci-contre.
      </div>
    );
  }
  return <canvas ref={toile} className="rounded-champ border border-slate-200" />;
}

/** La clé en clair, coupée en groupes de quatre : on la recopie sans se perdre. */
function CleALaMain({ secret }) {
  const [copie, setCopie] = useState(false);
  const groupes = (secret || '').match(/.{1,4}/g)?.join(' ') || '';
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[.13em] text-slate-400 mb-1">
        Ou saisir la clé à la main
      </div>
      <div className="flex items-center gap-2">
        <code className="text-[13px] font-mono text-slate-700 break-all leading-relaxed">
          {groupes}
        </code>
        <button onClick={() => { navigator.clipboard?.writeText(secret); setCopie(true); }}
          title="Copier la clé"
          className="flex-none w-7 h-7 grid place-items-center rounded-champ
                     text-slate-400 hover:text-iip-blue hover:bg-slate-100">
          {copie ? <IconCheck size={14} /> : <IconCopy size={14} />}
        </button>
      </div>
    </div>
  );
}

/**
 * Les codes de secours. Ils ne PARAISSENT QU'UNE FOIS, et l'écran le dit —
 * fermer la fenêtre sans les noter, c'est dépendre pour toujours d'un seul
 * téléphone.
 */
function CodesSecours({ codes, onFini }) {
  const [copie, setCopie] = useState(false);
  const texte = codes.join('\n');
  return (
    <div>
      <div className="flex items-start gap-2 mb-3 p-3 rounded-carte"
        style={{ background: '#fdf6ec', border: '1px solid #e8d5b0' }}>
        <IconAlertTriangle size={16} className="flex-none mt-0.5" style={{ color: '#9d6b28' }} />
        <div className="text-[12px] leading-relaxed" style={{ color: '#6b4a16' }}>
          <strong>Notez ces codes maintenant.</strong> Ils ne seront plus jamais
          affichés — Lucie n'en garde qu'une empreinte, comme d'un mot de passe.
          Chacun ouvre la connexion <strong>une seule fois</strong>, le jour où
          vous n'avez pas votre téléphone.
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 mb-3">
        {codes.map(c => (
          <code key={c} className="text-[13px] font-mono tracking-wider text-slate-700">{c}</code>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={() => { navigator.clipboard?.writeText(texte); setCopie(true); }}
          className="controle text-[12px] px-3 rounded-champ flex items-center gap-1.5">
          {copie ? <IconCheck size={14} /> : <IconCopy size={14} />}
          {copie ? 'Copiés' : 'Copier les dix'}
        </button>
        {/* `.controle` pose sa propre couleur de texte (--menu-texte), qui vient
            APRÈS `text-white` dans la feuille : le libellé se retrouvait en
            marine sur un fond marine, donc illisible. La couleur voyage avec
            le fond, dans le même style en ligne. */}
        <button onClick={onFini}
          className="controle text-[12px] px-3 rounded-champ font-semibold"
          style={{ background: '#1B2B4B', color: '#fff', borderColor: '#1B2B4B' }}>
          Je les ai notés
        </button>
      </div>
    </div>
  );
}

export default function MonCompte({ onFermer }) {
  const [etat, setEtat]       = useState(null);
  const [erreur, setErreur]   = useState('');
  const [occupe, setOccupe]   = useState(false);
  // 'repos' | 'enrolement' | 'codes' | 'desactivation'
  const [phase, setPhase]     = useState('repos');
  const [enrol, setEnrol]     = useState(null);     // { secret, uri }
  const [code, setCode]       = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [codes, setCodes]     = useState(null);

  const charger = () => api.mfaEtat().then(setEtat).catch(e => setErreur(e.message));
  useEffect(() => { charger(); }, []);

  const agir = async (fn) => {
    setErreur(''); setOccupe(true);
    try { return await fn(); }
    catch (e) { setErreur(e.message); return null; }
    finally { setOccupe(false); }
  };

  async function commencer() {
    const r = await agir(() => api.mfaEnroler());
    if (r) { setEnrol(r); setCode(''); setPhase('enrolement'); }
  }

  async function activer() {
    const r = await agir(() => api.mfaActiver(code));
    if (r) { setCodes(r.codes); setPhase('codes'); setEnrol(null); setCode(''); await charger(); }
  }

  async function regenerer() {
    const r = await agir(() => api.mfaCodes(code));
    if (r) { setCodes(r.codes); setPhase('codes'); setCode(''); await charger(); }
  }

  async function desactiver() {
    const r = await agir(() => api.mfaDesactiver(motDePasse));
    if (r) { setMotDePasse(''); setPhase('repos'); await charger(); }
  }

  // CHANGER SON MOT DE PASSE N'EXISTAIT NULLE PART. Le seul chemin passait par
  // un administrateur, qui le choisissait et le communiquait — donc le
  // connaissait. Un mot de passe que quelqu'un d'autre connaît n'en est plus un.
  const [ancien, setAncien] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirme, setConfirme] = useState('');
  const [mdpFait, setMdpFait] = useState(false);
  const LONGUEUR_MIN = 12;
  const mdpPret = ancien && nouveau.length >= LONGUEUR_MIN && nouveau === confirme;

  async function changerMotDePasse() {
    setErreur(''); setOccupe(true);
    try {
      await api.motDePasseChanger(ancien, nouveau);
      setAncien(''); setNouveau(''); setConfirme('');
      setMdpFait(true); setPhase('repos');
      setTimeout(() => setMdpFait(false), 6000);
    } catch (e) { setErreur(e.message); }
    finally { setOccupe(false); }
  }

  const actif = !!etat?.mfa_actif;

  // Le pied porte l'action ET ce qui dit pourquoi elle est grise : une
  // explication rangée dans le contenu qui défile n'est lue par personne.
  const pied = (() => {
    if (phase === 'codes') return null;             // « Je les ai notés » est dans le corps
    if (phase === 'enrolement') return (
      <>
        <BoutonFenetre principal desactive={occupe || code.length !== 6} onClick={activer}>
          Activer
        </BoutonFenetre>
        <BoutonFenetre onClick={() => { setPhase('repos'); setEnrol(null); setCode(''); }}>
          Annuler
        </BoutonFenetre>
        {code.length !== 6 && (
          <span className="text-[12px] text-slate-400">
            Saisissez les six chiffres affichés par votre application.
          </span>
        )}
      </>
    );
    if (phase === 'regeneration') return (
      <>
        <BoutonFenetre principal desactive={occupe || code.length !== 6} onClick={regenerer}>
          Régénérer
        </BoutonFenetre>
        <BoutonFenetre onClick={() => { setPhase('repos'); setCode(''); }}>Annuler</BoutonFenetre>
        {code.length !== 6 && (
          <span className="text-[12px] text-slate-400">
            Saisissez le code affiché par votre application.
          </span>
        )}
      </>
    );
    if (phase === 'mot_de_passe') return (
      <>
        <BoutonFenetre principal desactive={occupe || !mdpPret} onClick={changerMotDePasse}>
          Changer le mot de passe
        </BoutonFenetre>
        <BoutonFenetre onClick={() => {
          setPhase('repos'); setAncien(''); setNouveau(''); setConfirme(''); setErreur('');
        }}>Annuler</BoutonFenetre>
        {/* CE QUI MANQUE SE DIT À CÔTÉ DU BOUTON GRIS, jamais dans le contenu
            qui défile : sinon on cherche pourquoi il ne se passe rien. */}
        {!mdpPret && (
          <span className="text-[12px] text-slate-400">
            {!ancien ? 'Votre mot de passe actuel est exigé.'
              : nouveau.length < LONGUEUR_MIN ? `Au moins ${LONGUEUR_MIN} caractères.`
              : 'Les deux saisies diffèrent.'}
          </span>
        )}
      </>
    );
    if (phase === 'desactivation') return (
      <>
        <BoutonFenetre principal ton="alerte" desactive={occupe || !motDePasse} onClick={desactiver}>
          Désactiver
        </BoutonFenetre>
        <BoutonFenetre onClick={() => { setPhase('repos'); setMotDePasse(''); }}>Annuler</BoutonFenetre>
        {!motDePasse && (
          <span className="text-[12px] text-slate-400">Votre mot de passe est exigé.</span>
        )}
      </>
    );
    return <BoutonFenetre onClick={onFermer}>Fermer</BoutonFenetre>;
  })();

  return (
    <Fenetre icone={actif ? IconShieldCheck : IconShieldLock}
      titre="Mon compte" sous="Vérification en deux temps"
      large="moyenne" pied={pied} onFermer={onFermer}>

      {erreur && (
        <div className="mb-4 p-3 rounded-carte text-[12px]"
          style={{ background: '#fbeceb', border: '1px solid #e3bdb6', color: '#7d3a2c' }}>
          {erreur}
        </div>
      )}

      {etat && !etat.cle_serveur && (
        <div className="mb-4 p-3 rounded-carte text-[12px]"
          style={{ background: '#fdf6ec', border: '1px solid #e8d5b0', color: '#6b4a16' }}>
          La clé de chiffrement du serveur n'est pas configurée : la vérification
          en deux temps est indisponible. Signalez-le à la direction.
        </div>
      )}

      {/* ── État ───────────────────────────────────────────────────────── */}
      {phase === 'repos' && (
        <>
          <GroupeFenetre titre="Vérification en deux temps">
            <div className="flex items-start gap-3 px-3 py-2.5 rounded-carte border"
              style={{ borderColor: actif ? '#b7d5c4' : '#e2e8f0',
                       borderLeftWidth: 3, borderLeftColor: actif ? '#4a7c59' : '#cbd5e1',
                       background: '#fff' }}>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-slate-700 font-semibold">
                  {actif ? 'Active' : 'Inactive'}
                </div>
                <div className="text-[12px] text-slate-500 leading-relaxed mt-0.5">
                  {actif
                    ? `Votre mot de passe ne suffit plus : un code à six chiffres est demandé
                       à chaque connexion. Il vous reste ${etat.codes_restants} code(s) de secours.`
                    : `Votre compte s'ouvre avec le seul mot de passe. En ajoutant un
                       second facteur, un mot de passe volé ne suffit plus à entrer.`}
                </div>
              </div>
            </div>
          </GroupeFenetre>

          <div className="flex flex-wrap gap-2 mt-3">
            {!actif && (
              <BoutonFenetre principal desactive={occupe || !etat?.cle_serveur} onClick={commencer}>
                Configurer
              </BoutonFenetre>
            )}
            {actif && (
              <>
                <BoutonFenetre onClick={() => { setPhase('regeneration'); setCode(''); }}>
                  Nouveaux codes de secours
                </BoutonFenetre>
                <BoutonFenetre ton="alerte" onClick={() => setPhase('desactivation')}>
                  Désactiver
                </BoutonFenetre>
              </>
            )}
          </div>

          {/* ── Le mot de passe ───────────────────────────────────────── */}
          <GroupeFenetre titre="Mot de passe">
            {mdpFait ? (
              <div className="px-3 py-2.5 rounded-carte border text-[13px]"
                style={{ borderColor: '#b7d5c4', borderLeftWidth: 3, borderLeftColor: '#4a7c59',
                         background: '#fff', color: '#2f5d43' }}>
                Mot de passe modifié. Il sera demandé à votre prochaine connexion.
              </div>
            ) : (
              <div className="flex items-start gap-3 px-3 py-2.5 rounded-carte border"
                style={{ borderColor: '#e2e8f0', borderLeftWidth: 3, borderLeftColor: '#cbd5e1',
                         background: '#fff' }}>
                <div className="min-w-0 flex-1 text-[12.5px] text-slate-600 leading-relaxed">
                  Choisissez-le vous-même : personne d'autre n'a à le connaître.
                  Au moins {LONGUEUR_MIN} caractères.
                </div>
                <BoutonFenetre onClick={() => { setPhase('mot_de_passe'); setErreur(''); }}>
                  Changer
                </BoutonFenetre>
              </div>
            )}
          </GroupeFenetre>
        </>
      )}

      {/* ── Changer le mot de passe ───────────────────────────────────── */}
      {phase === 'mot_de_passe' && (
        <GroupeFenetre titre="Changer le mot de passe">
          <p className="text-[12.5px] text-slate-600 leading-relaxed mb-3">
            {/* L'ANCIEN EST EXIGÉ MÊME ICI : une session laissée ouverte deux
                minutes sur un poste partagé suffirait sinon à s'approprier le
                compte, et le titulaire ne s'en apercevrait qu'après coup. */}
            Votre mot de passe actuel est demandé, même connecté. Une phrase dont vous
            vous souvenez vaut mieux qu'un mot compliqué.
          </p>
          <div className="space-y-2.5 max-w-[360px]">
            <input type="password" autoFocus value={ancien} autoComplete="current-password"
              onChange={e => { setAncien(e.target.value); setErreur(''); }}
              placeholder="Mot de passe actuel"
              className="controle w-full border border-slate-300 rounded-champ text-[13px]" />
            <input type="password" value={nouveau} autoComplete="new-password"
              onChange={e => { setNouveau(e.target.value); setErreur(''); }}
              placeholder={`Nouveau mot de passe (${LONGUEUR_MIN} caractères au moins)`}
              className="controle w-full border border-slate-300 rounded-champ text-[13px]" />
            <input type="password" value={confirme} autoComplete="new-password"
              onChange={e => { setConfirme(e.target.value); setErreur(''); }}
              placeholder="Répéter le nouveau mot de passe"
              className="controle w-full border border-slate-300 rounded-champ text-[13px]" />
          </div>
        </GroupeFenetre>
      )}

      {/* ── Enrôlement ─────────────────────────────────────────────────── */}
      {phase === 'enrolement' && enrol && (
        <GroupeFenetre titre="Configurer l'application">
          <ol className="text-[13px] text-slate-600 leading-relaxed list-decimal ml-4 mb-3 space-y-1">
            <li>Ouvrez votre application d'authentification (Microsoft Authenticator,
                Google Authenticator, votre gestionnaire de mots de passe…).</li>
            <li>Scannez ce QR, ou saisissez la clé à la main.</li>
            <li>Recopiez ci-dessous le code à six chiffres qu'elle affiche.</li>
          </ol>
          <div className="flex flex-wrap items-start gap-5">
            <QrOtpauth uri={enrol.uri} />
            <div className="flex-1 min-w-[220px] space-y-4">
              <CleALaMain secret={enrol.secret} />
              <div>
                <div className="text-[11px] uppercase tracking-[.13em] text-slate-400 mb-1">
                  Code affiché
                </div>
                <input autoFocus value={code} inputMode="numeric" placeholder="••••••"
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={e => { if (e.key === 'Enter' && code.length === 6) activer(); }}
                  className="controle w-40 text-center font-semibold tracking-[8px]
                             text-[18px] border border-slate-300 rounded-champ bg-white" />
              </div>
            </div>
          </div>
        </GroupeFenetre>
      )}

      {/* ── Régénération des codes ─────────────────────────────────────── */}
      {phase === 'regeneration' && (
        <GroupeFenetre titre="Nouveaux codes de secours">
          <p className="text-[13px] text-slate-600 leading-relaxed mb-3">
            Les dix anciens codes cesseront de fonctionner immédiatement.
            Saisissez le code affiché par votre application pour confirmer que
            c'est bien vous.
          </p>
          <input autoFocus value={code} inputMode="numeric" placeholder="••••••"
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={e => { if (e.key === 'Enter' && code.length === 6) regenerer(); }}
            className="controle w-40 text-center font-semibold tracking-[8px]
                       text-[18px] border border-slate-300 rounded-champ bg-white" />
        </GroupeFenetre>
      )}

      {/* ── Codes rendus ───────────────────────────────────────────────── */}
      {phase === 'codes' && codes && (
        <GroupeFenetre titre="Vos dix codes de secours">
          <CodesSecours codes={codes} onFini={() => { setCodes(null); setPhase('repos'); }} />
        </GroupeFenetre>
      )}

      {/* ── Désactivation ──────────────────────────────────────────────── */}
      {phase === 'desactivation' && (
        <GroupeFenetre titre="Désactiver la vérification en deux temps" ton="alerte">
          <p className="text-[13px] text-slate-600 leading-relaxed mb-3">
            Votre compte s'ouvrira de nouveau avec le seul mot de passe, et vos
            codes de secours seront effacés. Votre mot de passe est demandé :
            sans lui, un poste laissé ouvert deux minutes suffirait à retirer
            la protection.
          </p>
          <input type="password" autoFocus value={motDePasse} autoComplete="current-password"
            onChange={e => setMotDePasse(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && motDePasse) desactiver(); }}
            placeholder="Mot de passe"
            className="controle w-64 px-3 border border-slate-300 rounded-champ bg-white text-[13px]" />
        </GroupeFenetre>
      )}
    </Fenetre>
  );
}
