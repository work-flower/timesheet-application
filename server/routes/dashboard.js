import { Router } from 'express';
import {
  getOperationsSummary,
  getInvoiceCoverage,
  getReconciliationSummary,
  getFinancialSummary,
} from '../services/dashboardService.js';

const router = Router();

// Operations dashboard summary
router.get('/operations', async (req, res) => {
  try {
    const summary = await getOperationsSummary();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Invoice coverage (monthly breakdown for lifeline view)
router.get('/invoice-coverage', async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end query params required' });
    }
    const coverage = await getInvoiceCoverage(start, end);
    res.json(coverage);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reconciliation dashboard
router.get('/reconciliation', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const summary = await getReconciliationSummary(startDate, endDate);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Financial dashboard
router.get('/financial', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate query params required' });
    }
    const summary = await getFinancialSummary(startDate, endDate);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
