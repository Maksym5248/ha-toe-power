/* Lovelace wrapper for the React application. Host the app with its API proxy. */
class ToePowerCard extends HTMLElement {
  setConfig(config) {
    if (!config.url) throw new Error('Вкажіть url нового застосунку ТОЕ');
    const url = new URL(config.url, window.location.href);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Потрібна HTTP або HTTPS адреса');
    const height = Number(config.height ?? 900);
    if (!Number.isFinite(height) || height < 300) throw new Error('height має бути не менше 300');
    if (!this.shadowRoot) this.attachShadow({mode:'open'});
    this.shadowRoot.replaceChildren();
    const card = document.createElement('ha-card');
    const iframe = document.createElement('iframe');
    iframe.src = url.href; iframe.title = 'ТОЕ — графік електропостачання';
    iframe.style.cssText = `display:block;width:100%;height:${height}px;border:0;border-radius:12px;`;
    card.append(iframe); this.shadowRoot.append(card);
  }
  set hass(value) {}
  getCardSize() { return 12; }
}
if (!customElements.get('toe-power-card')) customElements.define('toe-power-card', ToePowerCard);
window.customCards = window.customCards || [];
window.customCards.push({type:'toe-power-card', name:'ТОЕ — Світло вдома', description:'React застосунок із вибором адреси та графіком'});
