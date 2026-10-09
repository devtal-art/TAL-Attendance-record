import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { GroupFilters, PageHead, Stepper } from '../components/Bits.jsx';
import { useConfig } from '../config.jsx';
import { LEGEND, dayTag } from '../components/dayTag.js';
import { WEEKDAY_LETTER, addMonths, downloadCSV, fmtMinutes, fmtNum, matchesGroup, prettyMonth, thisMonth, todayISO } from '../utils.js';

const Icon = ({ children }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const ICONS = {
  emp: <Icon><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><circle cx="17.5" cy="9" r="2.5" /><path d="M17 14.2c2.7.2 4.5 2.2 4.5 5.3" /></Icon>,
  month: <Icon><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Icon>,
  att: <Icon><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>,
  pay: <Icon><path d="M12 3a9 9 0 1 0 9 9h-9z" /><path d="M15 3.5A9 9 0 0 1 20.5 9H15z" /></Icon>,
};

// Four parent sections, each with its own colour: dark parent row, lighter sub-headings, lightest striped body.
const GROUPS = [
  { key: 'emp', label: 'Employee', cols: [
    { h: 'ID', left: true, cell: ({ e }) => <span className="mono">{e.employeeId || '—'}</span> },
    { h: 'Name', left: true, cell: ({ e }) => <span className="strong">{e.name}</span> },
    { h: 'Shift', left: true, cell: ({ shift, cfg }) => <>{cfg.shiftOf(shift).label} <span className="muted small">({cfg.shiftOf(shift).days})</span></> },
  ] },
  { key: 'month', label: 'Month', cols: [
    { h: 'Total days', cell: ({ mo }) => mo.totalDays },
    { h: 'Working days', cell: ({ mo }) => mo.workingDays },
    { h: 'Week offs', cell: ({ mo }) => mo.weekOffs },
  ] },
  { key: 'att', label: 'Attendance', cols: [
    { h: 'Days worked', cell: ({ s }) => fmtNum(s.daysWorked) },
    { h: 'Paid leaves', cell: ({ s }) => fmtNum(s.paidLeaves) },
    { h: 'Unpaid leaves', cell: ({ s }) => fmtNum(s.unpaidLeaves) },
    { h: 'Holidays', cell: ({ mo }) => mo.holidays },
    { h: 'Overtime', cell: ({ s }) => fmtMinutes(s.overtimeMinutes) },
  ] },
  { key: 'pay', label: 'Payable', cols: [
    { h: 'Payable days', cell: ({ s }) => <span className="strong">{fmtNum(s.payableDays)}</span> },
    { h: 'Deduction days', cell: ({ s }) => <span className={`strong ${s.deductionDays ? 'neg' : ''}`}>{fmtNum(s.deductionDays)}</span> },
  ] },
];

function Summary({ data }) {
  const cfg = useConfig();
  const { rows } = data;
  return (
    <div className="card table-card">
      <table className="table sum-table">
        <thead>
          <tr className="group-row">
            {GROUPS.map((g) => (
              <th key={g.key} colSpan={g.cols.length} className={`gc gc-${g.key} ge`}>
                <span className="g-title">{ICONS[g.key]}{g.label}</span>
              </th>
            ))}
          </tr>
          <tr className="sub-row">
            {GROUPS.flatMap((g) => g.cols.map((c, i) => (
              <th key={g.key + c.h} className={`gc gc-${g.key} ${c.left ? 'left' : ''} ${i === g.cols.length - 1 ? 'ge' : ''}`}>{c.h}</th>
            )))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const ctx = { e: row.employee, shift: row.shift, mo: row.month, s: row.summary, cfg };
            return (
              <tr key={row.employee._id}>
                {GROUPS.flatMap((g) => g.cols.map((c, i) => (
                  <td key={g.key + c.h} className={`gc gc-${g.key} ${c.left ? 'left' : 'num'} ${i === g.cols.length - 1 ? 'ge' : ''}`}>{c.cell(ctx)}</td>
                )))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Register({ data }) {
  const cfg = useConfig();
  const navigate = useNavigate();
  const { meta, rows } = data;
  const today = todayISO();
  return (
    <>
      <div className="chips">
        {LEGEND.map(([kind, code, text]) => (
          <span key={code} className="legend-item"><span className={`tag ${kind}`}>{code}</span>{text}</span>
        ))}
        <span className="muted small">Hover a cell for the reason. Click a date to edit that day.</span>
      </div>
      <div className="card table-card">
        <table className="table register">
          <thead>
            <tr>
              <th className="sticky-col">Employee</th>
              {meta.days.map((d) => (
                <th key={d.date} className={`day ${d.off ? 'off' : ''} ${d.date === today ? 'today' : ''}`} title={d.off || ''}
                  onClick={() => navigate(`/daily?date=${d.date}`)}>
                  <div>{d.day}</div>
                  <div className="dow">{WEEKDAY_LETTER[d.dow]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ employee: e, shift, off, days }) => (
              <tr key={e._id}>
                <td className="sticky-col"><div className="strong">{e.name}</div><div className="muted small">{cfg.shiftOf(shift).label} · {cfg.shiftOf(shift).days}</div></td>
                {meta.days.map((d) => {
                  const r = days[d.date];
                  const o = off[d.date]; // this employee's week off, or a company holiday
                  const { kind, code, tip } = dayTag(r, o, cfg);
                  return (
                    <td key={d.date} title={tip} className={`cell ${o ? 'off' : ''}`}>
                      {kind && <span className={`tag ${kind} ${r && o ? 'on-off' : ''}`}>{code}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function Monthly() {
  const cfg = useConfig();
  const [month, setMonth] = useState(thisMonth());
  const [tab, setTab] = useState('summary');
  const [data, setData] = useState(null);
  const [deptFilter, setDeptFilter] = useState('');
  const [shiftFilter, setShiftFilter] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    setError('');
    api.get(`/attendance/monthly?month=${month}`).then(setData).catch((e) => setError(e.message));
  }, [month]);

  // Department / shift filters apply to both tabs (and the CSV export).
  const view = data && { ...data, rows: data.rows.filter((r) => matchesGroup(r.employee.department, r.shift, deptFilter, shiftFilter, cfg.shifts[0]?.key)) };

  const exportCSV = () => {
    const { rows } = view;
    downloadCSV(`attendance-${month}.csv`, [
      ['Employee ID', 'Employee Name', 'Shift', 'Total Days', 'Working Days', 'Week Offs', 'Days Worked', 'Paid Leaves', 'Unpaid Leaves', 'Holidays', 'Overtime (h:mm)', 'Payable Days', 'Deduction Days'],
      ...rows.map(({ employee: e, shift, month: mo, summary: s }) => [e.employeeId, e.name, cfg.shiftOf(shift).label, mo.totalDays, mo.workingDays, mo.weekOffs, s.daysWorked, s.paidLeaves, s.unpaidLeaves, mo.holidays, `${Math.floor(s.overtimeMinutes / 60)}:${String(s.overtimeMinutes % 60).padStart(2, '0')}`, s.payableDays, s.deductionDays]),
    ]);
  };

  return (
    <>
      <PageHead title="Monthly Record" sub="Built automatically from daily attendance. Use this for salary calculation.">
        <button onClick={exportCSV} disabled={!data}>Export CSV</button>
      </PageHead>
      <div className="toolbar">
        <Stepper label="month" onPrev={() => setMonth(addMonths(month, -1))} onNext={() => setMonth(addMonths(month, 1))} onToday={() => setMonth(thisMonth())}>
          <span className="stepper-label">{prettyMonth(month)}</span>
        </Stepper>
        <GroupFilters shifts={cfg.shifts} extraDepartments={data?.rows.map((r) => r.employee.department)}
          dept={deptFilter} onDept={setDeptFilter} shift={shiftFilter} onShift={setShiftFilter} />
        <div className="tabs">
          <button className={tab === 'summary' ? 'on' : ''} onClick={() => setTab('summary')}>Salary summary</button>
          <button className={tab === 'register' ? 'on' : ''} onClick={() => setTab('register')}>Day-wise register</button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {!data && !error && <div className="muted pad">Loading…</div>}
      {view && view.rows.length === 0 && <div className="muted pad">No employees found</div>}
      {view && view.rows.length > 0 && (tab === 'summary' ? <Summary data={view} /> : <Register data={view} />)}
    </>
  );
}
