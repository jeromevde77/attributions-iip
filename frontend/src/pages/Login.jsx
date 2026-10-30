import { useState, useEffect, useRef } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { api, isAuthenticated } from '../lib/api.js';
import { IconFlask } from '@tabler/icons-react';
import { ETOILES, TRAITS, ECLAT, ORDRE_APPARITION, CHRONO, DISCRETES, POINTS_L, RESTE } from '../lib/logoVierge.js';

const STYLE_NAISSANCE = `
@keyframes ln-pop { 0% { opacity: 0; transform: scale(.2); } 60% { opacity: 1; transform: scale(1.35); } 100% { opacity: 1; transform: scale(1); } }
@keyframes ln-trace { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@keyframes ln-nom { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.ln-etoile { opacity: 0; transform-box: fill-box; transform-origin: center; animation: ln-pop .55s cubic-bezier(.32,.72,0,1) forwards; }
.ln-trace { stroke-dasharray: 1; stroke-dashoffset: 1; animation: ln-trace .5s ease-out forwards; }
.ln-L { animation-duration: ${CHRONO.dureeL}s; animation-timing-function: ease-in-out; }
/* Après l'animation, la figure s'efface presque : le L reste (« que le logo reste simple »). */
@keyframes ln-discret { to { opacity: ${RESTE.etoile}; } }
@keyframes ln-discret-trait { to { opacity: ${RESTE.trait}; } }
.ln-discret { animation: ln-pop .55s cubic-bezier(.32,.72,0,1) forwards, ln-discret 1.4s ease-in-out forwards; }
.ln-discret-trait { stroke-opacity: .5; animation: ln-trace .5s ease-out forwards, ln-discret-trait 1.4s ease-in-out forwards; }
.ln-nom { opacity: 0; transform-box: fill-box; animation: ln-nom .6s ease-out forwards; }
@media (prefers-reduced-motion: reduce) { .ln-etoile, .ln-trace, .ln-nom { animation: none; opacity: 1; stroke-dashoffset: 0; transform: none; }
  .ln-etoile.ln-discret { opacity: ${RESTE.etoile}; } .ln-trace.ln-discret-trait { opacity: ${RESTE.trait}; } }`;

function LucieLogo({ size = 200 }) {
  // Version verticale : le L au-dessus, « Lucie » dessous. Mêmes étoiles que la barre (lib/logoVierge.js),
  // portées à l'échelle de la figure entière (3.1.485 : toute la Vierge, x -9,8 → 60,1 ; y -3,9 → 32).
  const X = x => 10 + (x + 9.8) * 1.75, Y = y => 22 + (y + 3.9) * 1.75;
  const [h, c, b] = POINTS_L.map(([x, y]) => [X(x), Y(y)]);
  const longL = (c[1] - h[1]) + (b[0] - c[0]);
  return (
    <svg width={size} height={Math.round(size * 1.15)} viewBox="0 0 140 150" xmlns="http://www.w3.org/2000/svg">
      {/* LA NAISSANCE DU LOGO (3.1.478-3.1.480, Charles) : rien ; Spica ; les autres étoiles ; les liens de la Vierge ;
          le L, dont les extrémités sont trois de ses étoiles ; le nom. Puis la figure s'efface presque, le L reste. */}
      <style>{STYLE_NAISSANCE}</style>
      <g stroke="#00AACC" fill="none" strokeWidth="1.3" strokeLinecap="round">
        {TRAITS.map(([a, z], i) => (
          <line key={a + z} x1={X(ETOILES[a][0])} y1={Y(ETOILES[a][1])} x2={X(ETOILES[z][0])} y2={Y(ETOILES[z][1])}
            pathLength="1" className="ln-trace ln-discret-trait" style={{ animationDelay: `${CHRONO.lien(i)}s, ${CHRONO.effacement}s` }} />))}
      </g>
      {ORDRE_APPARITION.filter(k => DISCRETES.includes(k)).map(k => {
        const i = ORDRE_APPARITION.indexOf(k);
        return <circle key={k} cx={X(ETOILES[k][0])} cy={Y(ETOILES[k][1])} r={1.6 + (ECLAT[k] || 0.3) * 2.2}
          fill={k === 'spica' ? '#00AACC' : 'white'} className="ln-etoile ln-discret" style={{ animationDelay: `${CHRONO.etoile(i)}s, ${CHRONO.effacement}s` }} />;
      })}
      {/* le L : du haut (τ) vers le coin (Spica), puis vers le bout (Zaniah) */}
      <path d={`M${h[0]} ${h[1]} L${c[0]} ${c[1]} L${b[0]} ${b[1]}`} pathLength="1" stroke="#00AACC" strokeOpacity=".85" fill="none"
        strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" className="ln-trace ln-L" style={{ animationDelay: `${CHRONO.L}s` }} />
      {/* ses trois étoiles : chacune paraît à son rang dans la figure, puis grandit quand le trait l'atteint */}
      {[[h, 8.5, 3.8, 'tau', 0], [c, 9.5, 4.2, 'spica', (c[1] - h[1]) / longL], [b, 8.5, 3.8, 'eta', 1]].map(([[x, y], r, r2, k, f]) => (
        <g key={k}>
          <circle cx={x} cy={y} r={2.4} fill="#00AACC" className="ln-etoile" style={{ animationDelay: `${CHRONO.etoile(ORDRE_APPARITION.indexOf(k))}s` }} />
          <g className="ln-etoile" style={{ animationDelay: `${CHRONO.L + f * CHRONO.dureeL}s` }}>
            <circle cx={x} cy={y} r={r} fill="#00AACC" />
            <circle cx={x} cy={y} r={r2} fill="white" fillOpacity=".62" />
          </g>
        </g>))}
      <text x="70" y="128" textAnchor="middle" textLength="92" lengthAdjust="spacingAndGlyphs"
            fontFamily="'Segoe UI','Helvetica Neue',Arial,sans-serif" fontSize="38" fontWeight="700" letterSpacing="-0.5"
            fill="white" className="ln-nom" style={{ animationDelay: `${CHRONO.fin}s` }}>Lucie</text>
    </svg>
  );
}

function NetworkBg() {
  const nodes = [
    {x:8,y:12},{x:25,y:5},{x:55,y:18},{x:80,y:8},{x:95,y:22},
    {x:15,y:40},{x:40,y:35},{x:70,y:30},{x:88,y:45},
    {x:5,y:60},{x:30,y:65},{x:58,y:55},{x:85,y:68},
    {x:18,y:82},{x:45,y:78},{x:72,y:85},{x:92,y:75},
    {x:10,y:95},{x:50,y:95},{x:78,y:95},
  ];
  const links = [
    [0,1],[1,2],[2,3],[3,4],[4,8],[8,12],[12,16],[16,19],
    [0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],
    [9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],
    [1,6],[6,11],[11,15],[2,7],[7,12],[3,8],[10,14],[15,19],
  ];
  return (
    <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',opacity:.18}}
         viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"
         xmlns="http://www.w3.org/2000/svg">
      <style>{`
        .nl { stroke:var(--c-accent); stroke-width:.18; fill:none; }
        .nd { fill:var(--c-accent); animation: pulse 4s ease-in-out infinite; }
        @keyframes pulse {
          0%,100% { opacity:.5; }
          50%      { opacity:1; }
        }
        ${nodes.map((_,i)=>`.nd${i}{animation-delay:${(i*0.22).toFixed(2)}s}`).join('')}
      `}</style>
      {links.map(([a,b],i) => (
        <line key={i} x1={nodes[a].x} y1={nodes[a].y}
              x2={nodes[b].x} y2={nodes[b].y} className="nl"/>
      ))}
      {nodes.map((n,i) => (
        <circle key={i} cx={n.x} cy={n.y} r=".65" className={`nd nd${i}`}/>
      ))}
    </svg>
  );
}

export default function Login() {
  if (isAuthenticated()) return <Navigate to="/" replace />;
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [info, setInfo]         = useState({ etab_nom: '', version: '' });

  // SECOND FACTEUR — DEUXIÈME ÉTAPE DU MÊME ÉCRAN, PAS UN ÉCRAN DE PLUS.
  //
  // Le jeton intermédiaire vit ICI, dans l'état du composant : cinq minutes,
  // et il disparaît si l'on recharge la page. Le ranger dans le localStorage
  // en aurait fait une session à moitié ouverte qui survit à la fermeture de
  // l'onglet — soit exactement ce que le second facteur est censé empêcher.
  const [tokenInter, setTokenInter] = useState('');
  const [code, setCode]             = useState('');
  const [parSecours, setParSecours] = useState(false);
  // TROISIÈME FACE DE CET ÉCRAN, et non une page à part : on arrive ici parce
  // qu'on vient d'échouer à se connecter, l'adresse est déjà tapée, et la faire
  // retaper sur une autre page serait la seule chose qu'on aurait gagnée.
  const [oubli, setOubli] = useState(false);
  const [oubliMsg, setOubliMsg] = useState('');
  const champCode = useRef(null);
  const nav = useNavigate();

  // Le curseur va dans le champ du code dès qu'il paraît : l'utilisateur a son
  // téléphone en main, il ne doit pas avoir à viser à la souris.
  useEffect(() => { if (tokenInter) champCode.current?.focus(); }, [tokenInter, parSecours]);

  // Charger le nom de l'établissement et la version (route publique)
  useEffect(() => {
    fetch('/api/info').then(r => r.json()).then(setInfo).catch(() => {});
  }, []);

  const isDev = info.environnement === 'dev';

  async function submit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const r = await api.login(email, password);
      if (r?.mfa_requis) { setTokenInter(r.token_intermediaire); setCode(''); return; }
      nav('/');
    }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function demanderLien(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const r = await api.motDePasseOublie(email);
      // LE MESSAGE VIENT DU SERVEUR, et il est le même que l'adresse existe ou
      // non : l'écrire ici en deux versions ferait de cet écran public un
      // moyen de savoir qui a un compte à l'Institut.
      setOubliMsg(r?.message || 'Si un compte existe pour cette adresse, un lien vient d\u2019y être envoyé.');
    } catch (e2) { setError(e2.message); }
    finally { setLoading(false); }
  }

  async function soumettreCode(e) {
    e?.preventDefault();
    setError(''); setLoading(true);
    try {
      await api.loginMfa(tokenInter, parSecours ? { code_recuperation: code } : { code });
      nav('/');
    } catch (e) {
      setError(e.message);
      setCode('');
      // Les cinq minutes sont passées, ou la connexion a été interrompue :
      // on ne laisse pas l'utilisateur retaper des codes dans le vide.
      if (e.body?.recommencer) { setTokenInter(''); setPassword(''); }
      champCode.current?.focus();
    }
    finally { setLoading(false); }
  }

  function revenir() {
    setTokenInter(''); setCode(''); setParSecours(false); setError(''); setPassword('');
  }

  const inputStyle = {
    width:'100%', padding:'11px 14px',
    background:'rgba(255,255,255,.06)',
    border:'1px solid rgba(0,170,204,.25)',
    borderRadius:'8px', color:'white',
    fontSize:'14px', outline:'none',
    fontFamily:"'Segoe UI',sans-serif",
    transition:'border-color .2s',
  };
  const labelStyle = {
    display:'block', fontSize:'11px', fontWeight:600,
    letterSpacing:'1.5px', color:'rgba(255,255,255,.45)',
    marginBottom:'8px', textTransform:'uppercase',
    fontFamily:"'Segoe UI',sans-serif",
  };

  return (
    <div style={{
      minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'var(--c-principal)', position:'relative', overflow:'hidden', padding:'24px',
    }}>
      <NetworkBg/>

      {/* halo */}
      <div style={{
        position:'absolute', top:'50%', left:'50%',
        transform:'translate(-50%,-50%)',
        width:'540px', height:'540px', borderRadius:'50%',
        background:'radial-gradient(circle, rgba(0,170,204,.06) 0%, transparent 70%)',
        pointerEvents:'none',
      }}/>

      <div style={{
        position:'relative', zIndex:1,
        width:'100%', maxWidth:'380px',
        display:'flex', flexDirection:'column', alignItems:'center', gap:'32px',
      }}>

        {/* Logo */}
        <div style={{animation:'fadeDown .6s ease both', display:'flex', flexDirection:'column', alignItems:'center', gap:'14px'}}>
          <LucieLogo size={240}/>
          {/* Sous-titre */}
          <div style={{textAlign:'center', display:'flex', flexDirection:'column', gap:'5px'}}>
            <p style={{
              color:'rgba(255,255,255,.75)', fontSize:'13px', fontWeight:500,
              letterSpacing:'.5px', fontFamily:"'Segoe UI',sans-serif", margin:0,
            }}>Gestion des membres de personnel</p>
            {info.etab_nom && (
              <p style={{
                color:'var(--c-accent)', fontSize:'12px', fontWeight:600,
                letterSpacing:'1px', fontFamily:"'Segoe UI',sans-serif", margin:0,
              }}>{info.etab_nom}</p>
            )}
            {info.version && (
              <p style={{
                color:'rgba(255,255,255,.25)', fontSize:'10px',
                letterSpacing:'2px', fontFamily:"'Segoe UI',sans-serif", margin:0,
              }}>v{info.version}</p>
            )}
            {isDev && (
              <div style={{
                marginTop:'8px',
                display:'inline-flex', alignItems:'center',
                background: 'var(--c-attente, #E8890C)',
                color:'white', fontSize:'11px', fontWeight:700, letterSpacing:'.08em',
                padding:'5px 12px', borderRadius:'8px',
              }} title="Version de développement — données de test">
                <IconFlask size={14} stroke={2} style={{ marginRight: 5 }} />DEV
              </div>
            )}
          </div>
        </div>

        {/* Formulaire — un seul, deux étapes. L'étape du code REMPLACE celle
            des identifiants au lieu de s'ajouter dessous : on ne laisse pas à
            l'écran un mot de passe déjà accepté, ni deux boutons « valider »
            dont un seul agit. */}
        {oubli ? (
        <form onSubmit={demanderLien} style={{
          width:'100%',
          background:'rgba(255,255,255,.04)',
          border:'1px solid rgba(0,170,204,.18)',
          borderRadius:'16px',
          padding:'32px 28px',
          animation:'fadeUp .6s .15s ease both',
        }}>
          <div style={{
            color:'white', fontSize:'15px', fontWeight:600, marginBottom:'6px',
            fontFamily:"'Segoe UI',sans-serif",
          }}>Mot de passe oublié</div>
          <div style={{
            fontSize:'12px', color:'rgba(255,255,255,.45)', marginBottom:'20px',
            fontFamily:"'Segoe UI',sans-serif", lineHeight:1.5,
          }}>
            Indiquez votre adresse : un lien vous permettra d’en choisir un nouveau.
            {' '}Il ne vous connecte pas — si la vérification en deux temps est active,
            elle vous sera demandée comme d’habitude.
          </div>

          {oubliMsg ? (
            <div style={{
              background:'rgba(0,170,204,.10)', border:'1px solid rgba(0,170,204,.35)',
              borderRadius:'8px', padding:'12px 14px', fontSize:'12.5px',
              color:'rgba(255,255,255,.8)', lineHeight:1.55,
              fontFamily:"'Segoe UI',sans-serif",
            }}>
              {oubliMsg}
              <div style={{marginTop:'8px', color:'rgba(255,255,255,.45)', fontSize:'11.5px'}}>
                Pensez à regarder les indésirables. Sans nouvelle, prévenez le secrétariat.
              </div>
            </div>
          ) : (
            <>
              <div style={{marginBottom:'18px'}}>
                <label style={{
                  display:'block', color:'rgba(255,255,255,.45)', fontSize:'11px',
                  letterSpacing:'1px', textTransform:'uppercase', marginBottom:'8px',
                  fontFamily:"'Segoe UI',sans-serif",
                }}>Adresse</label>
                <input type="email" autoFocus required value={email}
                  onChange={e => setEmail(e.target.value)} autoComplete="username"
                  style={{
                    width:'100%', padding:'12px 14px', background:'rgba(255,255,255,.06)',
                    border:'1px solid rgba(255,255,255,.12)', borderRadius:'8px',
                    color:'white', fontSize:'14px', fontFamily:"'Segoe UI',sans-serif",
                    outline:'none', boxSizing:'border-box',
                  }} />
              </div>
              <button type="submit" disabled={loading} style={{
                width:'100%', padding:'13px', background:'var(--c-accent)', border:'none',
                borderRadius:'8px', color:'white', fontSize:'14px', fontWeight:600,
                letterSpacing:'.5px', cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily:"'Segoe UI',sans-serif",
              }}>
                {loading ? 'Envoi…' : 'Recevoir le lien'}
              </button>
            </>
          )}

          <div style={{marginTop:'16px', fontSize:'12px', fontFamily:"'Segoe UI',sans-serif"}}>
            <button type="button"
              onClick={() => { setOubli(false); setOubliMsg(''); setError(''); }}
              style={{background:'none',border:'none',padding:0,cursor:'pointer',
                      color:'rgba(255,255,255,.35)'}}>
              ← Revenir à la connexion
            </button>
          </div>
        </form>
        ) : tokenInter ? (
        <form onSubmit={soumettreCode} style={{
          width:'100%',
          background:'rgba(255,255,255,.04)',
          border:'1px solid rgba(0,170,204,.18)',
          borderRadius:'16px',
          padding:'32px 28px',
          animation:'fadeUp .4s ease both',
        }}>
          <div style={{
            fontSize:'13px', color:'rgba(255,255,255,.75)', marginBottom:'6px',
            fontFamily:"'Segoe UI',sans-serif", fontWeight:600,
          }}>Vérification en deux temps</div>
          <div style={{
            fontSize:'12px', color:'rgba(255,255,255,.45)', marginBottom:'20px',
            fontFamily:"'Segoe UI',sans-serif", lineHeight:1.5,
          }}>
            {parSecours
              ? "Saisissez l'un des codes de secours notés lors de la configuration. Chacun ne sert qu'une fois."
              : "Ouvrez votre application d'authentification et recopiez le code à six chiffres."}
          </div>

          <div style={{marginBottom:'20px'}}>
            <label style={labelStyle}>{parSecours ? 'Code de secours' : 'Code à six chiffres'}</label>
            <input
              ref={champCode}
              value={code}
              onChange={e => {
                // Un code TOTP n'est que des chiffres. Filtrer à la saisie évite
                // le refus poli du serveur pour une espace collée depuis un SMS.
                const v = parSecours
                  ? e.target.value.toUpperCase().slice(0, 9)
                  : e.target.value.replace(/\D/g, '').slice(0, 6);
                setCode(v);
              }}
              required
              inputMode={parSecours ? 'text' : 'numeric'}
              autoComplete={parSecours ? 'off' : 'one-time-code'}
              placeholder={parSecours ? 'ABCD-EFGH' : '••••••'}
              style={{
                ...inputStyle,
                textAlign:'center',
                fontSize: parSecours ? '18px' : '26px',
                letterSpacing: parSecours ? '3px' : '10px',
                fontWeight:600,
                fontVariantNumeric:'tabular-nums',
              }}
              onFocus={e=>e.target.style.borderColor='rgba(0,170,204,.7)'}
              onBlur={e=>e.target.style.borderColor='rgba(0,170,204,.25)'}/>
          </div>

          {error && (
            <div style={{
              background:'rgba(220,60,60,.1)', border:'1px solid rgba(220,60,60,.3)',
              borderRadius:'8px', padding:'12px 14px', marginBottom:'18px',
              color:'var(--c-texte)', fontSize:'13px', fontFamily:"'Segoe UI',sans-serif",
              display:'flex', gap:'8px', alignItems:'flex-start',
            }}>
              <span style={{fontSize:'15px',marginTop:'1px'}}>⚠</span>
              <div>
                <div style={{fontWeight:600,marginBottom:'2px'}}>Vérification impossible</div>
                <div style={{opacity:.8,fontSize:'12px'}}>{error}</div>
              </div>
            </div>
          )}

          <button type="submit"
            disabled={loading || (parSecours ? code.length < 6 : code.length !== 6)}
            style={{
              width:'100%', padding:'12px',
              background: (loading || (parSecours ? code.length < 6 : code.length !== 6))
                ? 'rgba(0,170,204,.4)' : 'var(--c-accent)',
              border:'none', borderRadius:'8px',
              color:'white', fontSize:'14px', fontWeight:600,
              letterSpacing:'.5px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily:"'Segoe UI',sans-serif", transition:'background .2s',
            }}>
            {loading ? 'Vérification…' : 'Valider'}
          </button>

          <div style={{
            display:'flex', justifyContent:'space-between', gap:'12px', marginTop:'16px',
            fontSize:'12px', fontFamily:"'Segoe UI',sans-serif",
          }}>
            <button type="button" onClick={revenir}
              style={{background:'none',border:'none',padding:0,cursor:'pointer',
                      color:'rgba(255,255,255,.35)'}}>
              ← Recommencer
            </button>
            <button type="button"
              onClick={() => { setParSecours(!parSecours); setCode(''); setError(''); }}
              style={{background:'none',border:'none',padding:0,cursor:'pointer',
                      color:'rgba(0,170,204,.85)',textAlign:'right'}}>
              {parSecours ? "J'ai mon application" : 'Téléphone perdu ? Code de secours'}
            </button>
          </div>
        </form>
        ) : (
        <form onSubmit={submit} style={{
          width:'100%',
          background:'rgba(255,255,255,.04)',
          border:'1px solid rgba(0,170,204,.18)',
          borderRadius:'16px',
          padding:'32px 28px',
          animation:'fadeUp .6s .15s ease both',
        }}>
          <div style={{marginBottom:'18px'}}>
            <label style={labelStyle}>Email</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
                   required autoComplete="username" style={inputStyle}
                   onFocus={e=>e.target.style.borderColor='rgba(0,170,204,.7)'}
                   onBlur={e=>e.target.style.borderColor='rgba(0,170,204,.25)'}/>
          </div>

          <div style={{marginBottom:'24px'}}>
            <label style={labelStyle}>Mot de passe</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
                   required autoComplete="current-password" style={inputStyle}
                   onFocus={e=>e.target.style.borderColor='rgba(0,170,204,.7)'}
                   onBlur={e=>e.target.style.borderColor='rgba(0,170,204,.25)'}/>
          </div>

          {error && (
            <div style={{
              background:'rgba(220,60,60,.1)', border:'1px solid rgba(220,60,60,.3)',
              borderRadius:'8px', padding:'12px 14px', marginBottom:'18px',
              color:'var(--c-texte)', fontSize:'13px', fontFamily:"'Segoe UI',sans-serif",
              display:'flex', gap:'8px', alignItems:'flex-start',
            }}>
              <span style={{fontSize:'15px',marginTop:'1px'}}>⚠</span>
              <div>
                <div style={{fontWeight:600,marginBottom:'2px'}}>Connexion impossible</div>
                <div style={{opacity:.8,fontSize:'12px'}}>{error}</div>
              </div>
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width:'100%', padding:'12px',
            background: loading ? 'rgba(0,170,204,.4)' : 'var(--c-accent)',
            border:'none', borderRadius:'8px',
            color:'white', fontSize:'14px', fontWeight:600,
            letterSpacing:'.5px', cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily:"'Segoe UI',sans-serif",
            transition:'background .2s',
          }}
          onMouseEnter={e=>{ if(!loading) e.target.style.background='var(--c-accent)'; }}
          onMouseLeave={e=>{ if(!loading) e.target.style.background='var(--c-accent)'; }}
          >
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>

          {/* LA PORTE EST LÀ OÙ L'ON BUTE. Celui qui a oublié son mot de passe
              s'en aperçoit ICI, au moment du refus — pas trois écrans plus
              loin. Sans ce lien, il appelle le secrétariat, qui appelle la
              direction, qui ouvre une session de serveur. */}
          <div style={{marginTop:'14px', textAlign:'center', fontSize:'12px',
                       fontFamily:"'Segoe UI',sans-serif"}}>
            <button type="button"
              onClick={() => { setOubli(true); setOubliMsg(''); setError(''); }}
              style={{background:'none',border:'none',padding:0,cursor:'pointer',
                      color:'rgba(0,170,204,.85)'}}>
              Mot de passe oublié ?
            </button>
          </div>
        </form>
        )}

        <p style={{
          color:'rgba(255,255,255,.18)', fontSize:'11px',
          letterSpacing:'1px', fontFamily:"'Segoe UI',sans-serif", textAlign:'center',
        }}>
          FELSI · Établissements libres subventionnés indépendants
        </p>
      </div>

      <style>{`
        @keyframes fadeDown {
          from { opacity:0; transform:translateY(-16px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(12px); }
          to   { opacity:1; transform:translateY(0); }
        }
        input::placeholder { color:rgba(255,255,255,.22); }
        input:-webkit-autofill {
          -webkit-box-shadow:0 0 0 100px var(--c-principal) inset !important;
          -webkit-text-fill-color:white !important;
        }
      `}</style>
    </div>
  );
}
