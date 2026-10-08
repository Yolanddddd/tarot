/** One card back is shared by the deck and every selected card, on all devices. */
export function CardBack() {
  return (
    <span className="card-back" aria-hidden="true">
      <span className="card-back__frame" />
      <span className="card-back__star card-back__star--top">✧</span>
      <span className="card-back__sigil">∞</span>
      <span className="card-back__star card-back__star--bottom">✧</span>
    </span>
  );
}
