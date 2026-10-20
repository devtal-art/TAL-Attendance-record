import { Router } from 'express';
import { C, oid } from '../db.js';
import { wrap } from '../utils/wrap.js';
import { usedMap, balancesFor } from '../utils/balance.js';
import { employeeJson } from '../utils/mappers.js';
import { quotaReasons, defaultAllowance, isValidShift, defaultShift, labelOf, unitOf } from '../utils/rules.js';

const router = Router();
const BY_NAME = { collation: { locale: 'en', strength: 2 } }; // A-Z regardless of capitals

const clean = (v) => {
  const s = typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '';
  return s || undefined;
};
const cleanCode = (v) => clean(v)?.toUpperCase();

const withBalances = (doc, used) => ({ ...employeeJson(doc), balances: balancesFor(doc.leaveAllowance, used) });

/** One employee with balances, or null. */
async function loadOne(id) {
  const doc = await C.employees.findOne({ _id: id });
  if (!doc) return null;
  const used = await usedMap({ employee: doc._id });
  return withBalances(doc, used.get(String(doc._id)));
}

router.get('/', wrap(async (_req, res) => {
  const [docs, used] = await Promise.all([C.employees.find({}, BY_NAME).sort({ name: 1 }).toArray(), usedMap()]);
  res.json(docs.map((d) => withBalances(d, used.get(String(d._id)))));
}));

router.post('/', wrap(async (req, res) => {
  const { name, employeeId, designation, department, shift, eightHourPolicy } = req.body || {};
  if (!clean(name)) return res.status(400).json({ message: 'Name is required' });
  if (shift !== undefined && !isValidShift(shift)) return res.status(400).json({ message: 'Unknown shift' });

  const now = new Date();
  const doc = {
    name: clean(name),
    active: true,
    shift: shift ?? defaultShift(),
    eightHourPolicy: eightHourPolicy !== false,
    // New employees start with the default allowance of every tracked leave.
    leaveAllowance: Object.fromEntries(quotaReasons().map((r) => [r, defaultAllowance(r)])),
    createdAt: now,
    updatedAt: now,
  };
  if (cleanCode(employeeId)) doc.employeeCode = cleanCode(employeeId);
  if (clean(designation)) doc.designation = clean(designation);
  if (clean(department)) doc.department = clean(department);

  const { insertedId } = await C.employees.insertOne(doc); // a duplicate employee ID is rejected by the unique index (409)
  res.status(201).json(await loadOne(insertedId));
}));

router.put('/:id', wrap(async (req, res) => {
  const id = oid(req.params.id);
  if (!id || !(await C.employees.findOne({ _id: id }, { projection: { _id: 1 } }))) return res.status(404).json({ message: 'Employee not found' });

  const { name, employeeId, designation, department, active, shift, eightHourPolicy } = req.body || {};
  if (shift !== undefined && !isValidShift(shift)) return res.status(400).json({ message: 'Unknown shift' });

  const $set = { updatedAt: new Date() };
  const $unset = {};
  if (name !== undefined && clean(name)) $set.name = clean(name);
  if (employeeId !== undefined) { if (cleanCode(employeeId)) $set.employeeCode = cleanCode(employeeId); else $unset.employeeCode = ''; }
  if (designation !== undefined) { if (clean(designation)) $set.designation = clean(designation); else $unset.designation = ''; }
  if (department !== undefined) { if (clean(department)) $set.department = clean(department); else $unset.department = ''; }
  if (active !== undefined) $set.active = !!active;
  if (shift !== undefined) $set.shift = shift;
  if (eightHourPolicy !== undefined) $set.eightHourPolicy = eightHourPolicy !== false;

  await C.employees.updateOne({ _id: id }, Object.keys($unset).length ? { $set, $unset } : { $set });
  res.json(await loadOne(id));
}));

// Admin tops up (or, with a negative amount, corrects) one leave allowance. Allowances never reset by themselves.
router.post('/:id/allowance', wrap(async (req, res) => {
  const id = oid(req.params.id);
  const { reason } = req.body || {};
  const amount = Number(req.body?.amount);
  if (typeof reason !== 'string' || !quotaReasons().includes(reason)) return res.status(400).json({ message: 'That leave has no allowance' });
  if (!Number.isFinite(amount) || amount === 0) return res.status(400).json({ message: 'Enter an amount to add' });
  const doc = id && (await C.employees.findOne({ _id: id }));
  if (!doc) return res.status(404).json({ message: 'Employee not found' });

  const next = (doc.leaveAllowance?.[reason] ?? defaultAllowance(reason)) + amount;
  if (next < 0) return res.status(400).json({ message: `${labelOf(reason)} allowance can't go below 0 ${unitOf(reason)}` });

  await C.employees.updateOne({ _id: id }, { $set: { [`leaveAllowance.${reason}`]: next, updatedAt: new Date() } });
  res.json(await loadOne(id));
}));

export default router;
