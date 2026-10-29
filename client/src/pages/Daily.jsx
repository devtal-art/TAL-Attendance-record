import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { GroupFilters, PageHead, Stepper } from '../components/Bits.jsx';
import { useConfig } from '../config.jsx';
import { STATUS, STATUS_KEYS, addDays, fmtMinutes, fmtNum, matchesGroup, prettyDate, todayISO } from '../utils.js';

const EMPTY = { status: '', hours: '', minutes: '', reason: '', shortLeaveHours: '', half: '', relaxHours: '', relaxMinutes: '' };
const RELAXATION = 'relaxation'; // the leave whose time (management's relaxation) can be added to the worked time

const hasTime = (status) => status === 'present' || status === 'p_available';

const toDraft = (rec) => rec
  ? {
      status: rec.status,
      hours: hasTime(rec.status) ? String(Math.floor(rec.totalMinutes / 60)) : '',
      minutes: hasTime(rec.status) ? String(rec.totalMinutes % 60) : '',
      reason: rec.reason || '',
      shortLeaveHours: rec.shortLeaveHours ? String(rec.shortLeaveHours) : '',
      half: rec.half || '',
      relaxHours: rec.relaxationMinutes ? String(Math.floor(rec.relaxationMinutes / 60)) : '',
      relaxMinutes: rec.relaxationMinutes ? String(rec.relaxationMinutes % 60) : '',
    }
  : EMPTY;

const minutesOf = (d) => (Number(d.hours) || 0) * 60 + (Number(d.minutes) || 0);
const relaxOf = (d) => (d.reason === RELAXATION ? (Number(d.relaxHours) || 0) * 60 + (Number(d.relaxMinutes) || 0) : 0);

// Which reasons the dropdown offers, and whether it is enabled, for the current status/time.
function reasonOptions(d, cfg, weekOff) {
  if (d.status === 'on_leave') return cfg.leaveReasons;
  // Working on a week off is all overtime: just a time, no leave reason.
  if (d.status === 'present' && !weekOff && minutesOf(d) < cfg.fullDayMinutes) return cfg.presentReasons;
  return null; // disabled
}

// After every change, clear whatever the new status/time no longer allows.
function normalize(d, cfg, weekOff) {
  if (d.status === '') return EMPTY;
  const next = { ...d };
  if (!hasTime(d.status)) { next.hours = ''; next.minutes = ''; }
  const options = reasonOptions(next, cfg, weekOff);
  if (!options || !options.includes(next.reason)) next.reason = '';
  if (next.reason !== cfg.shortLeaveKey) next.shortLeaveHours = '';
  if (next.reason !== RELAXATION) { next.relaxHours = ''; next.relaxMinutes = ''; }
  if (next.status !== 'present' || !next.reason) next.half = ''; // only a leave taken with Present has a half
  return next;
}

export function Row({ item, date, onSaved }) {
  const { employee, weekOff: isWeekOff } = item;
  const noPolicy = employee.eightHourPolicy === false; // no 8-hour rules: just a time, no leave reason
  const weekOff = isWeekOff || noPolicy; // drives the reason rules; the real week off is still isWeekOff
  const cfg = useConfig();
  const shift = cfg.shiftOf(employee.shift);
  const [saved, setSaved] = useState(toDraft(item.record));
  const [d, setD] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [balances, setBalances] = useState(item.balances);

  // Leave left for a reason, giving back whatever THIS day already uses (it is being re-saved).
  const leftFor = (r) => {
    if (!balances[r]) return Infinity; // not quota based (Holiday, Unpaid Leave, Relaxation)
    const own = saved.reason !== r ? 0 : cfg.isHourly(r) ? Number(saved.shortLeaveHours) || 0 : saved.status === 'on_leave' ? 1 : 0.5;
    return balances[r].left + own;
  };

  const dirty = JSON.stringify(d) !== JSON.stringify(saved);
  const change = (patch) => { setError(''); setD(normalize({ ...d, ...patch }, cfg, weekOff)); };
  const options = reasonOptions(d, cfg, weekOff);
  // Relaxation that brings the worked time up to a full day makes it a full day: no half to choose, no half-day chip.
  const relaxedFull = d.reason === RELAXATION && relaxOf(d) > 0 && minutesOf(d) + relaxOf(d) >= cfg.fullDayMinutes;
  // Overtime: everything on a week off, otherwise whatever is beyond a full day.
  const overtime = d.status === 'present' ? (isWeekOff ? minutesOf(d) : noPolicy ? 0 : Math.max(0, minutesOf(d) - cfg.fullDayMinutes)) : 0;

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const { record: rec, balances: fresh } = await api.put('/attendance/daily', {
        employee: employee._id, date, status: d.status,
        totalMinutes: hasTime(d.status) ? minutesOf(d) : 0,
        reason: d.reason || null,
        shortLeaveHours: d.shortLeaveHours ? Number(d.shortLeaveHours) : null,
        half: relaxedFull ? null : d.half || null,
        relaxationMinutes: relaxOf(d) || null,
      });
      const next = toDraft(rec);
      setSaved(next);
      setD(next);
      setBalances(fresh);
      onSaved(employee._id, rec);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <tr className={error ? 'has-error' : ''}>
        <td className="mono">{employee.employeeId || '—'}</td>
        <td><div className="strong">{employee.name}</div><div className="muted small">{shift.label} · {shift.days}</div></td>
        <td>
          <select className={`status-select ${d.status ? STATUS[d.status].cls : isWeekOff ? 'off' : 'none'}`} value={d.status} onChange={(e) => change({ status: e.target.value })}>
            <option value="">{isWeekOff ? 'Week Off' : 'Not marked'}</option>
            {STATUS_KEYS.map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}
          </select>
        </td>
        <td>
          <div className="time-cell">
            <input type="number" min="0" max="24" placeholder="hh" disabled={!hasTime(d.status)} value={d.hours} onChange={(e) => change({ hours: e.target.value })} />
            <span>h</span>
            <input type="number" min="0" max="59" placeholder="mm" disabled={!hasTime(d.status)} value={d.minutes} onChange={(e) => change({ minutes: e.target.value })} />
            <span>m</span>
            {overtime > 0 && <span className="chip paid">Overtime {fmtMinutes(overtime)}</span>}
          </div>
        </td>
        <td>
          <div className="reason-cell">
            <select disabled={!options} value={d.reason} onChange={(e) => change({ reason: e.target.value })}>
              <option value="">{options ? 'Select reason' : '—'}</option>
              {options?.map((r) => (
                <option key={r} value={r} disabled={leftFor(r) <= 0 && d.reason !== r}>
                  {cfg.reasonLabel(r)}{balances[r] && ` (${fmtNum(leftFor(r))} ${cfg.isHourly(r) ? 'h' : 'd'} left)`}
                </option>
              ))}
            </select>
            {d.reason === cfg.shortLeaveKey && (
              <select value={d.shortLeaveHours} onChange={(e) => change({ shortLeaveHours: e.target.value })}>
                <option value="">Hours</option>
                {cfg.shortLeaveHours.map((h) => <option key={h} value={h} disabled={h > leftFor(cfg.shortLeaveKey)}>{h} hour{h > 1 ? 's' : ''}</option>)}
              </select>
            )}
            {d.status === 'present' && d.reason === RELAXATION && (
              <div className="time-cell" title="Time management relaxed. Worked time + relaxation reaching a full day counts as a full day.">
                <input type="number" min="0" max="8" placeholder="hh" value={d.relaxHours} onChange={(e) => change({ relaxHours: e.target.value })} />
                <span>h</span>
                <input type="number" min="0" max="59" placeholder="mm" value={d.relaxMinutes} onChange={(e) => change({ relaxMinutes: e.target.value })} />
                <span>m relaxed</span>
              </div>
            )}
            {d.status === 'present' && d.reason && !relaxedFull && (
              <select value={d.half} onChange={(e) => change({ half: e.target.value })}>
                <option value="">Which half?</option>
                <option value="first">First half</option>
                <option value="second">Second half</option>
              </select>
            )}
            {d.status === 'present' && d.reason && d.reason !== cfg.shortLeaveKey && !relaxedFull && <span className="chip half">Half day</span>}
          </div>
        </td>
        <td className="save-cell"><div>
          <button className="primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
          <span className={`save-state ${dirty ? 'unsaved' : item.record || saved.status ? 'saved' : ''}`}>{dirty ? 'Unsaved' : saved.status ? 'Saved' : ''}</span>
        </div></td>
      </tr>
      {error && <tr className="err-row"><td colSpan="6">{error}</td></tr>}
    </>
  );
}

export default function Daily() {
  const cfg = useConfig();
  const [params] = useSearchParams();
  const [date, setDate] = useState(/^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '') ? params.get('date') : todayISO());
  const [data, setData] = useState(null);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [shiftFilter, setShiftFilter] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    api.get(`/attendance/daily?date=${date}`).then(setData).catch((e) => setError(e.message));
  }, [date]);
  useEffect(() => { setData(null); load(); }, [load]);

  const onSaved = (empId, record) =>
    setData((x) => ({ ...x, items: x.items.map((i) => (i.employee._id === empId ? { ...i, record } : i)) }));

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, on_leave: 0, p_available: 0, week_off: 0, none: 0 };
    data?.items.forEach((i) => (i.record ? (c[i.record.status] += 1) : i.weekOff ? (c.week_off += 1) : (c.none += 1)));
    return c;
  }, [data]);

  const items = data?.items.filter((i) => {
    const q = search.toLowerCase();
    return (!q || i.employee.name.toLowerCase().includes(q) || (i.employee.employeeId || '').toLowerCase().includes(q))
      && matchesGroup(i.employee.department, i.employee.shift, deptFilter, shiftFilter, cfg.shifts[0]?.key);
  });

  return (
    <>
      <PageHead title="Daily Attendance" sub="Mark each employee for the selected day and press Save. Saved days flow into the monthly record." />

      <div className="toolbar">
        <Stepper label="day" onPrev={() => setDate(addDays(date, -1))} onNext={() => setDate(addDays(date, 1))} onToday={() => setDate(todayISO())}>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </Stepper>
        <input className="search" placeholder="Search name or ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <GroupFilters shifts={cfg.shifts} extraDepartments={data?.items.map((i) => i.employee.department)}
          dept={deptFilter} onDept={setDeptFilter} shift={shiftFilter} onShift={setShiftFilter} />
      </div>

      <div className="day-title">
        {prettyDate(date)}
        {data?.holiday && <span className="chip off">{data.holiday}</span>}
      </div>

      <div className="chips">
        {STATUS_KEYS.map((k) => <span key={k} className={`chip ${STATUS[k].cls}`}>{STATUS[k].label}: <b>{counts[k]}</b></span>)}
        <span className="chip off">Week Off: <b>{counts.week_off}</b></span>
        <span className="chip none">Not marked: <b>{counts.none}</b></span>
      </div>

      {error && <div className="error">{error}</div>}
      <div className="card table-card">
        <table className="table">
          <thead>
            <tr><th>ID</th><th>Employee</th><th>Status</th><th>Total time</th><th>Reason</th><th /></tr>
          </thead>
          <tbody>
            {!data && <tr><td colSpan="6" className="muted pad">Loading…</td></tr>}
            {items?.map((i) => <Row key={`${date}-${i.employee._id}`} item={i} date={date} onSaved={onSaved} />)}
            {items?.length === 0 && <tr><td colSpan="6" className="muted pad">No employees found</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
