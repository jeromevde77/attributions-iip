import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { api, isAuthenticated } from '../lib/api.js';

function LucieLogo({ size = 220 }) {
  return (
    <svg width={size} height={Math.round(size * 0.88)} viewBox="0 0 340 116"
         xmlns="http://www.w3.org/2000/svg">
      <g stroke="white" strokeOpacity=".09" fill="none" strokeWidth="1.4" strokeLinecap="round">
        <line x1="18" y1="38" x2="34" y2="16"/>
        <line x1="18" y1="38" x2="50" y2="60"/>
        <line x1="34" y1="16" x2="66" y2="23"/>
        <line x1="50" y1="60" x2="66" y2="23"/>
        <line x1="50" y1="60" x2="66" y2="82"/>
        <line x1="66" y1="23" x2="96" y2="38"/>
        <line x1="96" y1="38" x2="96" y2="82"/>
      </g>
      <g stroke="#00AACC" strokeOpacity=".45" fill="none" strokeWidth="1.5" strokeLinecap="round">
        <line x1="18" y1="38" x2="50" y2="60"/>
        <line x1="34" y1="16" x2="66" y2="23"/>
        <line x1="50" y1="60" x2="66" y2="82"/>
        <line x1="66" y1="23" x2="96" y2="38"/>
        <line x1="66" y1="82" x2="96" y2="82"/>
      </g>
      <g stroke="#00AACC" strokeOpacity=".85" fill="none" strokeWidth="2.6" strokeLinecap="round">
        <line x1="34" y1="16" x2="34" y2="82"/>
        <line x1="34" y1="82" x2="96" y2="82"/>
      </g>
      <circle cx="18" cy="38" r="4.5" fill="white"   fillOpacity=".15"/>
      <circle cx="66" cy="23" r="4.5" fill="white"   fillOpacity=".18"/>
      <circle cx="96" cy="38" r="4"   fill="white"   fillOpacity=".12"/>
      <circle cx="50" cy="60" r="4.5" fill="#00AACC" fillOpacity=".6"/>
      <circle cx="34" cy="16" r="8"   fill="#00AACC"/>
      <circle cx="34" cy="82" r="9"   fill="#00AACC"/>
      <circle cx="96" cy="82" r="8"   fill="#00AACC"/>
      <circle cx="34" cy="16" r="3.5" fill="white" fillOpacity=".65"/>
      <circle cx="34" cy="82" r="4"   fill="white" fillOpacity=".6"/>
      <circle cx="96" cy="82" r="3.5" fill="white" fillOpacity=".6"/>
      <text x="116" y="64"
            fontFamily="'Segoe UI','Helvetica Neue',Arial,sans-serif"
            fontSize="48" fontWeight="700" letterSpacing="-1.5"
            fill="white">Lucie</text>
      <line x1="116" y1="77" x2="308" y2="77" stroke="#00AACC" strokeWidth="1.4" strokeOpacity=".5"/>
      <text x="117" y="93"
            fontFamily="'Segoe UI','Helvetica Neue',Arial,sans-serif"
            fontSize="8.5" fontWeight="500" letterSpacing="3.2"
            fill="white" fillOpacity=".38">INTELLIGENCE · CONNEXIONS · CHEMINS</text>
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
        .nl { stroke:#00AACC; stroke-width:.18; fill:none; }
        .nd { fill:#00AACC; animation: pulse 4s ease-in-out infinite; }
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
  const nav = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try { await api.login(email, password); nav('/'); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
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
      background:'#1B2B4B', position:'relative', overflow:'hidden', padding:'24px',
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
        <div style={{animation:'fadeDown .6s ease both'}}>
          <LucieLogo size={240}/>
        </div>

        {/* Formulaire */}
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
              color:'#FF8888', fontSize:'13px', fontFamily:"'Segoe UI',sans-serif",
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
            background: loading ? 'rgba(0,170,204,.4)' : '#00AACC',
            border:'none', borderRadius:'8px',
            color:'white', fontSize:'14px', fontWeight:600,
            letterSpacing:'.5px', cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily:"'Segoe UI',sans-serif",
            transition:'background .2s',
          }}
          onMouseEnter={e=>{ if(!loading) e.target.style.background='#009BBB'; }}
          onMouseLeave={e=>{ if(!loading) e.target.style.background='#00AACC'; }}
          >
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

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
          -webkit-box-shadow:0 0 0 100px #1e3560 inset !important;
          -webkit-text-fill-color:white !important;
        }
      `}</style>
    </div>
  );
}
