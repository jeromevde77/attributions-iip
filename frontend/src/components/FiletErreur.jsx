/* (CS) LE FILET DES ESPACES (3.5.642, Charles, 22 novembre 2026 : « écran blanc », « il faut systématiquement faire un refresh pour
   ouvrir »). Un écran qui casse au rendu ne laisse plus une page blanche : l'espace se recharge seul une fois (les données d'un aperçu
   arrivent parfois juste après l'ouverture) ; s'il casse encore, il dit l'erreur et propose de recharger. */
import React from 'react';

const CLE = 'lucie.filet.recharge';

export default class FiletErreur extends React.Component {
  constructor(p) { super(p); this.state = { erreur: null, recharge: false }; }
  static getDerivedStateFromError(erreur) { return { erreur }; }
  componentDidCatch(erreur) {
    let deja = null;
    try { deja = sessionStorage.getItem(CLE); } catch { /* sans mémoire */ }
    if (!deja || Date.now() - Number(deja) > 60000) {
      try { sessionStorage.setItem(CLE, String(Date.now())); } catch { /* sans mémoire */ }
      // Le message reste 6 s, le temps de le lire ou d'en faire une capture (3.5.643).
      this.setState({ recharge: true });
      setTimeout(() => window.location.reload(), 6000);
    }
    // eslint-disable-next-line no-console
    console.error('Lucie — écran en erreur :', erreur);
  }
  render() {
    if (!this.state.erreur) return this.props.children;
    return (
      <div style={{ padding: '2rem', maxWidth: 640, margin: '10vh auto', fontFamily: 'inherit' }}>
        <h1 className="titre-ecran">Un écran n’a pas pu s’afficher</h1>
        <p className="text-sm text-slate-600">{this.state.recharge ? 'L’espace se recharge dans quelques secondes. ' : ''}Si ce message revient, faites une capture et envoyez-la à la direction.</p>
        <pre className="text-second text-slate-500 whitespace-pre-wrap" style={{ marginTop: '1rem' }}>{String(this.state.erreur?.message || this.state.erreur)}{'\n'}{String(this.state.erreur?.stack || '').split('\n').slice(0, 4).join('\n')}</pre>
        <button type="button" className="bouton bouton-fort" style={{ marginTop: '1rem' }} onClick={() => window.location.reload()}>Recharger</button>
      </div>);
  }
}
