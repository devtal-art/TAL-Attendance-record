import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { GroupFilters, PageHead, Stepper } from '../components/Bits.jsx';
import { useConfig } from '../config.jsx';
import { LEGEND, dayTag } from '../components/dayTag.js';
import { WEEKDAY_LETTER, addMonths, fmtCompact, fmtHM, fmtNum, matchesGroup, prettyMonth, thisMonth, todayISO } from '../utils.js';

// One employee's record for the month, as a day-wise register.
function Detail({ data }) {
  const cfg = useConfig();
  const navigate = useNavigate();
  const today = todayISO();
  const { days } = data;
  const overtimeOf = (d) => {
    const r = d.record;
    if (!r || r.status !== 'present') return 0;
    return d.off?.type === 'week_off' ? r.totalMinutes : Math.max(0, r.totalMinutes - cfg.fullDayMinutes);
  };

  return (
    <div className="emp-detail">
      <h4>Day-wise register</h4>
      <div className="chips">
        {LEGEND.map(([kind, code, text]) => (
          <span key={code} className="legend-item"><span className={`tag ${kind}`}>{code}</span>{text}</span>
        ))}
        <span className="muted small">Hover a day for the details. Click a date to edit that day.</span>
      </div>
      <div className="card table-card flat-card">
        <table className="table register emp-register">
          <thead>
            <tr>
              <th className="sticky-col" />
              {days.map((d) => (
                <th key={d.date} className={`day ${d.off ? 'off' : ''} ${d.date === today ? 'today' : ''}`} title={d.off?.name || ''}
                  onClick={() => navigate(`/daily?date=${d.date}`)}>
                  <div>{d.day}</div>
                  <div className="dow">{WEEKDAY_LETTER[d.dow]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="sticky-col strong">Status</td>
              {days.map((d) => {
                const { kind, code, tip } = dayTag(d.record, d.off, cfg);
                const time = d.record?.status === 'present' ? ` · ${fmtHM(d.record.totalMinutes)}` : '';
                return (
                  <td key={d.date} title={tip + time} className={`cell ${d.off ? 'off' : ''}`}>
                    {kind && <span className={`tag ${kind} ${d.record && d.off ? 'on-off' : ''}`}>{code}</span>}
                  </td>
                );
              })}
            </tr>
            <tr>
              <td className="sticky-col strong">Hours</td>
              {days.map((d) => (
                <td key={d.date} className={`cell ${d.off ? 'off' : ''}`}>
                  <span className="mini">{d.record?.status === 'present' ? fmtCompact(d.record.totalMinutes) : ''}</span>
                </td>
              ))}
            </tr>
            <tr>
              <td className="sticky-col strong">Overtime</td>
              {days.map((d) => {
                const ot = overtimeOf(d);
                return (
                  <td key={d.date} className={`cell ${d.off ? 'off' : ''}`}>
                    <span className="mini ot">{ot ? `+${fmtCompact(ot)}` : ''}</span>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Employees() {
  const cfg = useConfig();
  const [month, setMonth] = useState(thisMonth());
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);       // id of the employee whose accordion is open
  const [details, setDetails] = useState({});   // `${id}|${month}` -> loaded detail (or { error })
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [shiftFilter, setShiftFilter] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setRows(null);
    setError('');
    api.get(`/public/employees?month=${month}`).then((d) => setRows(d.rows)).catch((e) => setError(e.message));
  }, [month]);

  const load = (id) => {
    const key = `${id}|${month}`;
    if (details[key]) return;
    api.get(`/public/employees/${id}/register?month=${month}`)
      .then((d) => setDetails((x) => ({ ...x, [key]: d })))
      .catch((e) => setDetails((x) => ({ ...x, [key]: { error: e.message } })));
  };
  const toggle = (id) => {
    setOpen(open === id ? null : id);
    if (open !== id) load(id);
  };
  // Switching month keeps the same employee open and loads their new month.
  useEffect(() => { if (open) load(open); }, [month]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = rows?.filter(({ employee: e, shift, department }) => {
    const q = search.toLowerCase();
    return (!q || e.name.toLowerCase().includes(q) || (e.employeeId || '').toLowerCase().includes(q))
      && matchesGroup(department, shift, deptFilter, shiftFilter, cfg.shifts[0]?.key);
  });

  return (
    <>
      <PageHead title="Employees" sub="Open an employee to see their attendance record for the month: days, hours, leaves and every day." />
      <div className="toolbar">
        <Stepper label="month" onPrev={() => setMonth(addMonths(month, -1))} onNext={() => setMonth(addMonths(month, 1))} onToday={() => setMonth(thisMonth())}>
          <span className="stepper-label">{prettyMonth(month)}</span>
        </Stepper>
        <input className="search" placeholder="Search name or ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <GroupFilters shifts={cfg.shifts} extraDepartments={rows?.map((r) => r.department)}
          dept={deptFilter} onDept={setDeptFilter} shift={shiftFilter} onShift={setShiftFilter} />
      </div>

      {error && <div className="error">{error}</div>}
      {!rows && !error && <div className="muted pad">Loading…</div>}
      {shown?.length === 0 && <div className="muted pad">No employees found</div>}

      <div className="acc">
        {shown?.map(({ employee: e, shift, summary: s, leavesTaken }) => {
          const isOpen = open === e._id;
          const detail = details[`${e._id}|${month}`];
          return (
            <div key={e._id} className={`card acc-item ${isOpen ? 'open' : ''}`}>
              <button className="acc-head" onClick={() => toggle(e._id)} aria-expanded={isOpen}>
                <span className="acc-chevron" aria-hidden="true">›</span>
                <span className="acc-name">
                  <span className="strong">{e.name}</span>
                  <span className="muted small">{e.employeeId || 'No ID'} · {cfg.shiftOf(shift).label} ({cfg.shiftOf(shift).days})</span>
                </span>
                <span className="acc-chips">
                  <span className="chip present">Worked {fmtNum(s.daysWorked)}d</span>
                  <span className="chip paid">Leaves {fmtNum(leavesTaken)}d</span>
                  {s.overtimeMinutes > 0 && <span className="chip half">OT {fmtHM(s.overtimeMinutes)}</span>}
                  <span className="chip none">Payable {fmtNum(s.payableDays)}d</span>
                </span>
              </button>
              {isOpen && (
                <div className="acc-body">
                  {!detail && <div className="muted pad">Loading…</div>}
                  {detail?.error && <div className="error">{detail.error}</div>}
                  {detail && !detail.error && <Detail data={detail} />}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
