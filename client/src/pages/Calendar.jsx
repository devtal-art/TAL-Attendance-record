import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { GroupFilters, PageHead, Stepper } from '../components/Bits.jsx';
import { useConfig } from '../config.jsx';
import { LEGEND, dayTag } from '../components/dayTag.js';
import { Row } from './Daily.jsx';
import { WEEKDAY_LETTER, addMonths, matchesGroup, prettyDate, prettyMonth, thisMonth, todayISO } from '../utils.js';

// Edit one employee's attendance for one day (the same row and rules as Daily Attendance), and set whether
// that day is a working day or a week off for them.
function EditDay({ row, date, onClose, onChanged }) {
  const { employee } = row;
  const [item, setItem] = useState(null);
  const [holiday, setHoliday] = useState(null);
  const [version, setVersion] = useState(0); // bumped after a week-off change so the row restarts with the new rules
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadItem = useCallback(async () => {
    const d = await api.get(`/attendance/daily?date=${date}`);
    setHoliday(d.holiday);
    setItem(d.items.find((i) => i.employee._id === employee._id) || null);
  }, [date, employee._id]);

  useEffect(() => { loadItem().catch((e) => setError(e.message)); }, [loadItem]);

  const off = row.off[date];
  const dayType = off?.type === 'holiday' ? 'holiday' : off ? 'off' : 'work';

  const setDayType = async (value) => {
    setBusy(true);
    setError('');
    try {
      await api.put('/attendance/weekoff', { employee: employee._id, date, weekOff: value === 'off' });
      await loadItem();
      setVersion((v) => v + 1);
      await onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card modal xl">
        <h2>{employee.name} · {prettyDate(date)}</h2>
        <div className="day-type">
          <label>Day type
            <select value={dayType} disabled={busy || dayType === 'holiday'} onChange={(e) => setDayType(e.target.value)}>
              {dayType === 'holiday' && <option value="holiday">Company holiday{holiday ? ` · ${holiday}` : ''}</option>}
              <option value="work">Working day</option>
              <option value="off">Week off</option>
            </select>
          </label>
          <span className="muted small">Applies to {employee.name} only. Changing it updates every screen and the monthly numbers.</span>
        </div>
        {error && <div className="error">{error}</div>}
        <h3 className="modal-sub">Attendance</h3>
        <div className="table-card">
          <table className="table">
            <thead><tr><th>ID</th><th>Employee</th><th>Status</th><th>Total time</th><th>Reason</th><th /></tr></thead>
            <tbody>
              {!item && !error && <tr><td colSpan="6" className="muted pad">Loading…</td></tr>}
              {item && <Row key={`${date}-${employee._id}-${version}`} item={item} date={date} onSaved={onChanged} />}
            </tbody>
          </table>
        </div>
        <div className="modal-actions"><button onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

export default function Calendar() {
  const cfg = useConfig();
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState(null);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [shiftFilter, setShiftFilter] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // { id, date }
  const today = todayISO();

  const load = useCallback(() => api.get(`/attendance/monthly?month=${month}`).then(setData), [month]);
  useEffect(() => {
    setData(null);
    setError('');
    load().catch((e) => setError(e.message));
  }, [load]);

  const q = search.trim().toLowerCase();
  const rows = data?.rows.filter((r) =>
    (!q || r.employee.name.toLowerCase().includes(q) || (r.employee.employeeId || '').toLowerCase().includes(q))
    && matchesGroup(r.employee.department, r.shift, deptFilter, shiftFilter, cfg.shifts[0]?.key));
  const editRow = editing && data?.rows.find((r) => r.employee._id === editing.id);

  return (
    <>
      <PageHead title="Attendance Calendar" sub="Every employee, every day. Click a day to change that employee's attendance (status, time, reason) or make it a week off." />
      <div className="toolbar">
        <Stepper label="month" onPrev={() => setMonth(addMonths(month, -1))} onNext={() => setMonth(addMonths(month, 1))} onToday={() => setMonth(thisMonth())}>
          <span className="stepper-label">{prettyMonth(month)}</span>
        </Stepper>
        <input className="search" placeholder="Search name or ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <GroupFilters shifts={cfg.shifts} extraDepartments={data?.rows.map((r) => r.employee.department)}
          dept={deptFilter} onDept={setDeptFilter} shift={shiftFilter} onShift={setShiftFilter} />
      </div>
      <div className="chips">
        {LEGEND.map(([kind, code, text]) => (
          <span key={code + text} className="legend-item"><span className={`tag ${kind}`}>{code}</span>{text}</span>
        ))}
      </div>
      {error && <div className="error">{error}</div>}
      {!data && !error && <div className="muted pad">Loading…</div>}
      {rows && rows.length === 0 && <div className="muted pad">No employees found</div>}
      {rows && rows.length > 0 && (
        <div className="card table-card">
          <table className="table register">
            <thead>
              <tr>
                <th className="sticky-col">Employee</th>
                {data.meta.days.map((d) => (
                  <th key={d.date} className={`day ${d.off ? 'off' : ''} ${d.date === today ? 'today' : ''}`} title={d.off || ''}>
                    <div>{d.day}</div>
                    <div className="dow">{WEEKDAY_LETTER[d.dow]}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.employee._id}>
                  <td className="sticky-col"><div className="strong">{row.employee.name}</div><div className="muted small">{cfg.shiftOf(row.shift).label} · {cfg.shiftOf(row.shift).days}</div></td>
                  {data.meta.days.map((d) => {
                    const r = row.days[d.date];
                    const o = row.off[d.date];
                    const { kind, code, tip, cls } = dayTag(r, o, cfg);
                    return (
                      <td key={d.date} title={tip} className={`cell editable ${o ? 'off' : ''}`} onClick={() => setEditing({ id: row.employee._id, date: d.date })}>
                        {kind && <span className={cls}>{code}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editRow && <EditDay row={editRow} date={editing.date} onClose={() => setEditing(null)} onChanged={load} />}
    </>
  );
}
