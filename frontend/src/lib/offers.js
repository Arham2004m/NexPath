// "Keep my hours" is remembered in this browser only, so the same offer does not come back on every visit.
// Nothing important depends on it: if storage is unavailable (private window) the offer simply shows again.
const keyFor = (offer) => `nexpath:hours-offer:${offer.currentHoursPerWeek}->${offer.hoursPerWeek}`;

export function offerDismissed(offer) {
  try { return window.localStorage.getItem(keyFor(offer)) === '1'; } catch { return false; }
}

export function dismissOffer(offer) {
  try { window.localStorage.setItem(keyFor(offer), '1'); } catch { /* storage unavailable: the offer returns next time */ }
}
