import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';

/**
 * CHOISIR UN NOUVEAU MOT DE PASSE, depuis le lien reçu par courriel.
 *
 * Cette page ne connecte pas et ne reçoit aucune session : elle pose un mot de
 * passe, puis renvoie à la connexion — où le second facteur sera demandé comme
 * d'habitude. C'est ce qui empêche la messagerie de devenir un chemin de
 * contournement de la vérification en deux temps.
 *
 * LE LIEN EST VÉRIFIÉ AVANT QUE QUOI QUE CE SOIT NE SE SAISISSE. Faire taper
 * deux fois un mot de passe pour répondre ensuite « ce lien a expiré » est une
 * politesse qu'on ne rattrape pas — et la personne ne sait alors pas si c'est
 * son mot de passe ou le lien qui posait problème.
 */
export default function MotDePasse() {
  const navigate = useNavigate();
  const jeton = new URLSearchParams(window.location.search).get('jeton') || '';

  const [etat, setEtat] = useState('verification');   // verification | pret | expire | pose
  const [email, setEmail] = useState('');
  const [longueurMin, setLongueurMin] = useState(12);
  const [mdp, setMdp] = useState('');
  const [confirme, setConfirme] = useState('');
  const [err, setErr] = useState('');
  const [mfaActif, setMfaActif] = useState(false);
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    if (!jeton) { setEtat('expire'); return; }
    api.motDePasseJeton(jeton)
      .then(r => { setEmail(r.email || ''); setLongueurMin(r.longueur_min || 12); setEtat('pret'); })
      .catch(() => setEtat('expire'));
  }, [jeton]);

  const trop_court = mdp.length > 0 && mdp.length < longueurMin;
  const discordent = confirme.length > 0 && mdp !== confirme;
  const peut = mdp.length >= longueurMin && mdp === confirme && !occupe;

  async function poser(e) {
    e.preventDefault();
    setErr(''); setOccupe(true);
    try {
      const r = await api.motDePasseNouveau(jeton, mdp);
      setMfaActif(!!r?.mfa_actif);
      setEtat('pose');
    } catch (e2) { setErr(e2.message); }
    finally { setOccupe(false); }
  }

  const Cadre = ({ children }) => (
    <div style={{
      minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'#16294d', padding:'24px', fontFamily:"'Segoe UI',sans-serif",
    }}>
      <div style={{
        width:'100%', maxWidth:'420px', background:'rgba(255,255,255,.04)',
        border:'1px solid rgba(0,170,204,.18)', borderRadius:'16px', padding:'32px 28px',
      }}>{children}</div>
    </div>
  );
  const Titre = ({ children }) => (
    <div style={{ color:'white', fontSize:'15px', fontWeight:600, marginBottom:'6px' }}>{children}</div>
  );
  const Texte = ({ children }) => (
    <div style={{ fontSize:'12.5px', color:'rgba(255,255,255,.5)', lineHeight:1.55,
                  marginBottom:'20px' }}>{children}</div>
  );
  const champ = {
    width:'100%', padding:'12px 14px', background:'rgba(255,255,255,.06)',
    border:'1px solid rgba(255,255,255,.12)', borderRadius:'8px',
    color:'white', fontSize:'14px', outline:'none', boxSizing:'border-box',
  };
  const Bouton = ({ children, ...p }) => (
    <button {...p} style={{
      width:'100%', padding:'13px', background: p.disabled ? 'rgba(0,170,204,.35)' : '#00AACC',
      border:'none', borderRadius:'8px', color:'white', fontSize:'14px', fontWeight:600,
      cursor: p.disabled ? 'not-allowed' : 'pointer',
    }}>{children}</button>
  );

  if (etat === 'verification') {
    return <Cadre><Texte>Vérification du lien…</Texte></Cadre>;
  }

  if (etat === 'expire') {
    return (
      <Cadre>
        <Titre>Ce lien n’est plus valable</Titre>
        <Texte>
          Un lien ne sert qu’une fois et reste valable une heure. Demandez-en un nouveau
          depuis l’écran de connexion.
        </Texte>
        <Bouton onClick={() => navigate('/login')}>Revenir à la connexion</Bouton>
      </Cadre>
    );
  }

  if (etat === 'pose') {
    return (
      <Cadre>
        <Titre>Mot de passe enregistré</Titre>
        <Texte>
          {mfaActif
            /* ON LE DIT AVANT, et non au moment où l'écran le réclamera : la
               personne vient de changer son mot de passe, elle peut croire que
               le code à six chiffres qu'on lui demande ensuite est une erreur. */
            ? 'Connectez-vous avec ce nouveau mot de passe. Votre application d’authentification vous demandera ensuite le code à six chiffres, comme d’habitude.'
            : 'Vous pouvez maintenant vous connecter avec ce nouveau mot de passe.'}
        </Texte>
        <Bouton onClick={() => navigate('/login')}>Se connecter</Bouton>
      </Cadre>
    );
  }

  return (
    <Cadre>
      <Titre>Choisir un nouveau mot de passe</Titre>
      <Texte>
        Pour <strong style={{color:'rgba(255,255,255,.75)'}}>{email}</strong>.
        {' '}Au moins {longueurMin} caractères — une phrase dont vous vous souvenez
        vaut mieux qu’un mot compliqué.
      </Texte>

      <form onSubmit={poser}>
        <div style={{marginBottom:'14px'}}>
          <input type="password" autoFocus required value={mdp} autoComplete="new-password"
            onChange={e => { setMdp(e.target.value); setErr(''); }}
            placeholder="Nouveau mot de passe" style={champ} />
          {trop_court && (
            <div style={{fontSize:'11.5px', color:'#e0a96d', marginTop:'6px'}}>
              Encore {longueurMin - mdp.length} caractère(s).
            </div>
          )}
        </div>

        <div style={{marginBottom:'18px'}}>
          <input type="password" required value={confirme} autoComplete="new-password"
            onChange={e => { setConfirme(e.target.value); setErr(''); }}
            placeholder="Répéter le mot de passe" style={champ} />
          {discordent && (
            <div style={{fontSize:'11.5px', color:'#e0a96d', marginTop:'6px'}}>
              Les deux saisies diffèrent.
            </div>
          )}
        </div>

        {err && (
          <div style={{
            background:'rgba(220,80,80,.12)', border:'1px solid rgba(220,80,80,.35)',
            borderRadius:'8px', padding:'10px 12px', fontSize:'12.5px',
            color:'rgba(255,220,220,.9)', marginBottom:'16px', lineHeight:1.5,
          }}>{err}</div>
        )}

        <Bouton type="submit" disabled={!peut}>
          {occupe ? 'Enregistrement…' : 'Enregistrer'}
        </Bouton>
      </form>
    </Cadre>
  );
}
