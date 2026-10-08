/** Peripheral light only: the center is deliberately free of logos and geometry. */
export function AuraBackdrop() {
  return <div className="aura-backdrop" aria-hidden="true">
    <div className="aura-nebula aura-nebula--blue" />
    <div className="aura-nebula aura-nebula--violet" />
    <div className="aura-stars" />
    <div className="aura-orbit aura-orbit--left" />
    <div className="aura-orbit aura-orbit--right" />
    <div className="aura-vignette" />
  </div>;
}
