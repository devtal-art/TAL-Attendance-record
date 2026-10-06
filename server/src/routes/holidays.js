import { Router } from 'express';
import { C, oid } from '../db.js';
import { wrap } from '../utils/wrap.js';
import { holidayJson, isRealDate } from '../utils/mappers.js';

const router = Router();

router.get('/', wrap(async (req, res) => {
  const year = /^\d{4}$/.test(String(req.query.year)) ? String(req.query.year) : String(new Date().getFullYear());
  const rows = await C.holidays.find({ date: { $gte: `${year}-01-01`, $lte: `${year}-12-31` } }).sort({ date: 1 }).toArray();
  res.json(rows.map(holidayJson));
}));

router.post('/', wrap(async (req, res) => {
  const { date, name } = req.body || {};
  if (!isRealDate(date)) return res.status(400).json({ message: 'date must be a real YYYY-MM-DD date' });
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ message: 'Holiday name is required' });
  const saved = await C.holidays.findOneAndUpdate({ date }, { $set: { name: name.trim() } }, { upsert: true, returnDocument: 'after' });
  res.status(201).json(holidayJson(saved));
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = oid(req.params.id);
  if (id) await C.holidays.deleteOne({ _id: id });
  res.json({ ok: true });
}));

export default router;
