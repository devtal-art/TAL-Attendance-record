import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { PageHead } from '../components/Bits.jsx';
import { useConfig } from '../config.jsx';
import { DEPARTMENTS, fmtNum } from '../utils.js';


const OTHER = '__other__';

const EMPTY = { name: '', employeeId: '', department: '', shift: 'shift1' };

function EmployeeForm({ initial, onCancel, onSaved }) {
  const cfg = useConfig();
  const editing = !!initial._id;
  const [f, setF] = useState({ ...EMPTY, ...initial });
  // A saved department outside the preset list is shown as "Other" with its name in the text box.
  const [deptChoice, setDeptChoice] = useState(
    !f.department ? '' : DEPARTMENTS.includes(f.department) ? f.department : OTHER
  );
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const pickDept = (e) => {
    const v = e.target.value;
    setDeptChoice(v);
    setF({ ...f, department: v === OTHER ? (DEPARTMENTS.includes(f.department) ? '' : f.department || '') : v });
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await (editing ? api.put(`/employees/${initial._id}`, f) : api.post('/employees', f));
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="card modal" onSubmit={submit}>
        <h2>{editing ? 'Edit employee' : 'Add employee'}</h2>
        <div className="grid2">
          <label>Name<input value={f.name} onChange={set('name')} required autoFocus /></label>
          <label>Employee ID<input value={f.employeeId || ''} onChange={set('employeeId')} placeholder="Optional" /></label>
          <label>Department
            <select value={deptChoice} onChange={pickDept}>
              <option value="">Select department</option>
              {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              <option value={OTHER}>Other</option>
            </select>
          </label>
          {deptChoice === OTHER && (
            <label>Department name<input value={f.department || ''} onChange={set('department')} placeholder="Type department name" required /></label>
          )}
          <label>Shift
            <select value={f.shift || 'shift1'} onChange={set('shift')}>
              {cfg.shifts.map((s) => <option key={s.key} value={s.key}>{s.label} · {s.days}</option>)}
            </select>
          </label>
        </div>
        {!editing && <p className="muted small">New employees start with 5 days of every leave and 10 hours of Short Leave.</p>}
        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button className="primary">{editing ? 'Save changes' : 'Add'}</button>
        </div>
      </form>
    </div>
  );
}

// Per-employee leave record: allowed / used / left, with a manual top-up for each leave.
function LeaveModal({ employeeId, list, onChanged, onClose }) {
  const cfg = useConfig();
  const employee = list.find((e) => e._id === employeeId);
  const [add, setAdd] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const topUp = async (reason) => {
    setError('');
    setBusy(reason);
    try {
      await api.post(`/employees/${employeeId}/allowance`, { reason, amount: Number(add[reason]) });
      setAdd({ ...add, [reason]: '' });
      await onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card modal wide">
        <h2>Leave record · {employee.name} {employee.employeeId && <span className="muted">({employee.employeeId})</span>}</h2>
        <p className="muted small">Used is counted from saved daily attendance. Allowances never reset; add more here when needed (a negative number corrects a mistake).</p>
        <table className="table leave-table">
          <thead>
            <tr><th>Leave</th><th className="num">Allowed</th><th className="num">Used</th><th className="num">Left</th><th>Add to allowance</th></tr>
          </thead>
          <tbody>
            {cfg.quotaReasons.map((r) => {
              const b = employee.balances[r];
              const unit = cfg.unitOf(r);
              return (
                <tr key={r}>
                  <td className="strong">{cfg.reasonLabel(r)}</td>
                  <td className="num">{fmtNum(b.allowed)} {unit}</td>
                  <td className="num">{fmtNum(b.used)} {unit}</td>
                  <td className={`num strong ${b.left <= 0 ? 'neg' : ''}`}>{fmtNum(b.left)} {unit}</td>
                  <td>
                    <div className="add-cell">
                      <input type="number" step={cfg.isHourly(r) ? 1 : 0.5} placeholder={`+ ${unit}`} value={add[r] ?? ''} onChange={(e) => setAdd({ ...add, [r]: e.target.value })} />
                      <button disabled={!Number(add[r]) || busy === r} onClick={() => topUp(r)}>Add</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {error && <div className="error">{error}</div>}
        <div className="modal-actions"><button className="primary" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}

export default function Admin() {
  const cfg = useConfig();
  const [list, setList] = useState(null);
  const [form, setForm] = useState(null);
  const [leaveFor, setLeaveFor] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const load = () => api.get('/employees').then(setList).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const toggle = async (u) => {
    setError('');
    try { await api.put(`/employees/${u._id}`, { active: !u.active }); load(); } catch (e) { setError(e.message); }
  };

  const shown = list?.filter((u) => {
    const q = search.toLowerCase();
    return !q || u.name.toLowerCase().includes(q) || (u.employeeId || '').toLowerCase().includes(q);
  });

  return (
    <>
      <PageHead title="Admin" sub="Manage employees and their leave allowances. Leave used is taken from Daily Attendance.">
        <button className="primary" onClick={() => setForm({})}>+ Add employee</button>
      </PageHead>
      <div className="toolbar">
        <input className="search" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="muted small">Leave columns show <b>left / allowed</b>. Short Leave is in hours, all others in days.</span>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>ID</th><th>Name</th><th>Department</th><th>Shift</th>
              {cfg.quotaReasons.map((r) => <th key={r} className="num">{cfg.reasonLabel(r)}</th>)}
              <th>Status</th><th />
            </tr>
          </thead>
          <tbody>
            {!list && <tr><td colSpan={cfg.quotaReasons.length + 6} className="muted pad">Loading…</td></tr>}
            {shown?.map((u) => (
              <tr key={u._id} className={u.active ? '' : 'inactive'}>
                <td className="mono">{u.employeeId || '—'}</td>
                <td className="strong">{u.name}</td>
                <td>{u.department || '—'}</td>
                <td>{(() => { const s = cfg.shifts.find((x) => x.key === (u.shift || 'shift1')); return s ? `${s.label} · ${s.days}` : '—'; })()}</td>
                {cfg.quotaReasons.map((r) => {
                  const b = u.balances[r];
                  return <td key={r} className={`num ${b.left <= 0 ? 'neg' : ''}`}>{fmtNum(b.left)} / {fmtNum(b.allowed)}</td>;
                })}
                <td>{u.active ? 'Active' : 'Inactive'}</td>
                <td className="row-actions">
                  <button className="link" onClick={() => setLeaveFor(u._id)}>Leaves</button>
                  <button className="link" onClick={() => setForm(u)}>Edit</button>
                  <button className="link" onClick={() => toggle(u)}>{u.active ? 'Deactivate' : 'Activate'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {form && <EmployeeForm initial={form} onCancel={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />}
      {leaveFor && list && <LeaveModal employeeId={leaveFor} list={list} onChanged={load} onClose={() => setLeaveFor(null)} />}
    </>
  );
}
