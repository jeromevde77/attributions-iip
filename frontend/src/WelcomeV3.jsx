import { useState, useEffect } from 'react';

// Écran d'accueil "magique" affiché une seule fois par utilisateur au premier lancement v3.
// Séquence : noir → lueur/étoile qui surgit → titre en grand → bouton entrer.
export default function WelcomeV3({ onClose }) {
  const [phase, setPhase] = useState(0); // 0 noir, 1 étoile surgit, 2 texte, 3 bouton

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 400);   // l'étoile surgit
    const t2 = setTimeout(() => setPhase(2), 1700);  // le texte apparaît
    const t3 = setTimeout(() => setPhase(3), 3200);  // le bouton apparaît
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div
      onClick={() => phase >= 3 && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'radial-gradient(circle at 50% 42%, #102a4c 0%, #0a1730 45%, #050b18 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', cursor: phase >= 3 ? 'pointer' : 'default',
      }}>

      <style>{`
        @keyframes v3-star-burst {
          0%   { transform: scale(0) rotate(-90deg); opacity: 0; }
          55%  { transform: scale(1.35) rotate(8deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes v3-glow-pulse {
          0%,100% { opacity: .55; transform: scale(1); }
          50%     { opacity: 1;   transform: scale(1.12); }
        }
        @keyframes v3-rays {
          0%   { opacity: 0; transform: scale(.3) rotate(0deg); }
          60%  { opacity: .9; }
          100% { opacity: .65; transform: scale(1) rotate(45deg); }
        }
        @keyframes v3-rise {
          0%   { opacity: 0; transform: translateY(22px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes v3-twinkle {
          0%,100% { opacity: 0; }
          50%     { opacity: 1; }
        }
        .v3-fade { transition: opacity 1s ease; }
      `}</style>

      {/* Petites étoiles scintillantes en fond */}
      {phase >= 1 && [...Array(28)].map((_, i) => {
        const top = (i * 37) % 100, left = (i * 53 + 11) % 100;
        const dur = 1.6 + (i % 5) * 0.5, delay = (i % 7) * 0.3, sz = 1 + (i % 3);
        return (
          <span key={i} style={{
            position: 'absolute', top: `${top}%`, left: `${left}%`,
            width: sz, height: sz, borderRadius: '50%', background: '#cfe8ff',
            animation: `v3-twinkle ${dur}s ease-in-out ${delay}s infinite`,
          }} />
        );
      })}

      {/* Halo + étoile centrale */}
      <div style={{ position: 'relative', width: 220, height: 220, marginBottom: 30 }}>
        {phase >= 1 && (
          <>
            {/* Halo lumineux */}
            <div style={{
              position: 'absolute', inset: '-60px', borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(0,170,204,.55) 0%, rgba(0,170,204,.12) 45%, transparent 70%)',
              animation: 'v3-glow-pulse 2.8s ease-in-out infinite',
            }} />
            {/* Rayons */}
            <div style={{
              position: 'absolute', inset: 0,
              animation: 'v3-rays 1.4s ease-out forwards',
            }}>
              <svg viewBox="0 0 220 220" width="220" height="220">
                <g stroke="#7fdcef" strokeWidth="2" strokeLinecap="round" opacity=".6">
                  {[...Array(12)].map((_, i) => {
                    const a = (i * 30) * Math.PI / 180;
                    const x1 = 110 + Math.cos(a) * 70, y1 = 110 + Math.sin(a) * 70;
                    const x2 = 110 + Math.cos(a) * 100, y2 = 110 + Math.sin(a) * 100;
                    return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
                  })}
                </g>
              </svg>
            </div>
            {/* L'étoile */}
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'v3-star-burst 1.2s cubic-bezier(.2,.8,.2,1) forwards',
            }}>
              <svg viewBox="0 0 100 100" width="130" height="130">
                <defs>
                  <radialGradient id="v3star" cx="50%" cy="42%" r="60%">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="45%" stopColor="#9fe8f7" />
                    <stop offset="100%" stopColor="#00AACC" />
                  </radialGradient>
                </defs>
                <path fill="url(#v3star)"
                  d="M50 4 L61 38 L97 38 L68 60 L79 95 L50 73 L21 95 L32 60 L3 38 L39 38 Z" />
              </svg>
            </div>
          </>
        )}
      </div>

      {/* Texte */}
      <div className="v3-fade" style={{
        textAlign: 'center', padding: '0 24px', maxWidth: 720,
        opacity: phase >= 2 ? 1 : 0,
      }}>
        {phase >= 2 && (
          <>
            <div style={{
              fontSize: 11, letterSpacing: 5, textTransform: 'uppercase',
              color: '#7fdcef', fontWeight: 600, marginBottom: 14,
              animation: 'v3-rise .8s ease-out forwards',
            }}>
              Institut Ilya Prigogine · Version 3.0
            </div>
            <h1 style={{
              fontSize: 'clamp(28px, 5vw, 46px)', fontWeight: 700, lineHeight: 1.15,
              color: '#ffffff', margin: 0,
              fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '-0.02em',
              animation: 'v3-rise 1s ease-out .15s forwards', opacity: 0,
            }}>
              Lucie s'est réinventée<br />
              <span style={{ color: '#00AACC' }}>et passe à la 3<sup style={{ fontSize: '.55em' }}>e</sup> vitesse&nbsp;!</span>
            </h1>
            <p style={{
              fontSize: 'clamp(15px, 2.2vw, 19px)', color: '#aac4e0', marginTop: 18,
              fontFamily: "'Inter', system-ui, sans-serif",
              animation: 'v3-rise 1s ease-out .4s forwards', opacity: 0,
            }}>
              Bienvenue dans ton nouvel environnement.
            </p>
          </>
        )}
      </div>

      {/* Bouton entrer */}
      {phase >= 3 && (
        <button
          onClick={onClose}
          style={{
            marginTop: 40, padding: '12px 32px', fontSize: 15, fontWeight: 600,
            color: '#0a1730', background: '#00AACC', border: 'none', borderRadius: 12,
            cursor: 'pointer', fontFamily: "'Inter', system-ui, sans-serif",
            boxShadow: '0 0 30px rgba(0,170,204,.5)',
            animation: 'v3-rise .7s ease-out forwards', opacity: 0,
          }}>
          Découvrir Lucie 3.0
        </button>
      )}
      {phase >= 3 && (
        <div style={{ marginTop: 16, fontSize: 12, color: '#5a7099', animation: 'v3-rise .7s ease-out .2s forwards', opacity: 0 }}>
          ou cliquez n'importe où pour entrer
        </div>
      )}
    </div>
  );
}
