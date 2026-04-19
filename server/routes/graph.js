const express = require('express');
const router = express.Router();
const { getIsConnected } = require('../config/neo4j');
const neo4jService = require('../services/neo4jService');
const csvService = require('../services/csvService');

/**
 * GET /api/graph/traverse?company=<name>&hsn=<code>&depth=<n>
 * Traverse supply chain graph from a company.
 */
router.get('/traverse', async (req, res) => {
  try {
    const { company, hsn, depth } = req.query;

    if (!company) {
      return res.status(400).json({ error: 'Company name is required' });
    }

    const maxDepth = Math.min(parseInt(depth) || 5, 10);

    let result;
    if (getIsConnected()) {
      result = await neo4jService.traverseGraph(company, hsn, maxDepth);
    }
    if (!result) {
      result = csvService.traverseGraph(company, hsn, maxDepth);
    }

    res.json(result);
  } catch (err) {
    console.error('Traversal error:', err.message);
    res.status(500).json({ error: 'Graph traversal failed' });
  }
});

/**
 * GET /api/graph/stats
 * Get overall dataset statistics.
 */
router.get('/stats', (req, res) => {
  try {
    const stats = csvService.getStats() || { totalCompanies: 0, totalTradeLinks: 0 };
    res.json({ stats });
  } catch (err) {
    res.json({ stats: { totalCompanies: 0, totalTradeLinks: 0 } });
  }
});

module.exports = router;
