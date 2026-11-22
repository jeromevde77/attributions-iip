/* (CS) LE FILET DES ESPACES (3.5.642, Charles, 22 novembre 2026 : « écran blanc », « il faut systématiquement faire un refresh pour
   ouvrir »). Un écran qui casse au rendu ne laisse plus une page blanche : l'espace se recharge seul une fois (les données d'un aperçu
   arrivent parfois juste après l'ouverture) ; s'il casse encore, il dit l'erreur et propose de recharger. */
import React from 'react';

const CLE = 'lucie.filet.recharge';

export default class FiletErreur extends React.Component {
  constructor(p) { super(p); this.state = { erreur: null }; }
  static getDerivedStateFromError(erreur) { return { erreur }; }
  componentDidCatch(erreur) {
    let deja = null;
    try { deja = sessionStorage.getItem(CLE); } catch { /* sans mémoire */ }
    if (!deja || Date.now() - Number(deja) > 60000) {
      try { sessionStorage.setItem(CLE, String(Date.now())); } catch { /* sans mémoire */ }
      setTimeout(() => window.location.reload(), 300);
    }
    // eslint-disable-next-line no-console
    console.error('Lucie — écran en erreur :', erreur);
  }
  render() {
    if (!this.state.erreur) return this.props.children;
    return (
      <div style={{ padding: '2rem', maxWidth: 640, margin: '10vh auto', fontFamily: 'inherit' }}>
        <h1 className="titre-ecran">Un écran n’a pas pu s’afficher</h1>
        <p className="text-sm text-slate-600">L’espace se recharge. Si ce message revient, faites une capture et envoyez-la à la direction.</p>
        <pre className="text-second text-slate-500 whitespace-pre-wrap" style={{ marginTop: '1rem' }}>{String(this.state.erreur?.message || this.state.erreur)}</pre>
        <button type="button" className="bouton bouton-fort" style={{ marginTop: '1rem' }} onClick={() => window.location.reload()}>Recharger</button>
      </div>);
  }
}
