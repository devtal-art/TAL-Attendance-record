export function Stepper({ label, onPrev, onNext, onToday, children }) {
  return (
    <div className="stepper">
      <button onClick={onPrev} aria-label={`Previous ${label}`}>‹</button>
      {children}
      <button onClick={onNext} aria-label={`Next ${label}`}>›</button>
      <button onClick={onToday}>{label === 'day' ? 'Today' : 'This month'}</button>
    </div>
  );
}

export const PageHead = ({ title, sub, children }) => (
  <div className="page-head">
    <div>
      <h1>{title}</h1>
      {sub && <p className="muted">{sub}</p>}
    </div>
    <div className="actions">{children}</div>
  </div>
);
