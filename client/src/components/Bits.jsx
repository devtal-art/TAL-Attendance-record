import { DEPARTMENTS, NO_DEPARTMENT } from '../utils.js';

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

// Department + shift dropdowns shared by the Employees and Daily Attendance toolbars ('' means all).
export function GroupFilters({ shifts, extraDepartments = [], dept, onDept, shift, onShift }) {
  const departments = [...DEPARTMENTS, ...[...new Set(extraDepartments)].filter((d) => d && !DEPARTMENTS.includes(d)).sort()];
  return (
    <>
      <select className="filter-select" value={dept} onChange={(e) => onDept(e.target.value)} aria-label="Filter by department">
        <option value="">All departments</option>
        {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        <option value={NO_DEPARTMENT}>No department</option>
      </select>
      <select className="filter-select" value={shift} onChange={(e) => onShift(e.target.value)} aria-label="Filter by shift">
        <option value="">All shifts</option>
        {shifts.map((s) => <option key={s.key} value={s.key}>{s.label} · {s.days}</option>)}
      </select>
    </>
  );
}
