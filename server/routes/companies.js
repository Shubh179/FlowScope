const express = require('express');
const router = express.Router();
const { getIsConnected } = require('../config/neo4j');
const neo4jService = require('../services/neo4jService');
const csvService = require('../services/csvService');

/**
 * GET /api/companies/search?q=<query>
 * Search companies by name.
 */
router.get('/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    if (query.length < 1) {
      return res.json({ companies: [] });
    }

    let companies;
    if (getIsConnected()) {
      companies = await neo4jService.searchCompanies(query);
    }
    if (!companies) {
      companies = csvService.searchCompanies(query);
    }

    res.json({ companies });
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * GET /api/companies/:name/hsn
 * Get HSN codes for a company.
 */
router.get('/:name/hsn', async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);

    let hsnCodes;
    if (getIsConnected()) {
      hsnCodes = await neo4jService.getHSNCodes(name);
    }
    if (!hsnCodes) {
      hsnCodes = csvService.getHSNCodes(name);
    }

    res.json({ hsnCodes });
  } catch (err) {
    console.error('HSN lookup error:', err.message);
    res.status(500).json({ error: 'HSN lookup failed' });
  }
});

/**
 * GET /api/companies/:name/details
 * Get detailed company information.
 */
router.get('/:name/details', async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);

    let details;
    if (getIsConnected()) {
      details = await neo4jService.getCompanyDetails(name);
    }
    if (!details) {
      details = csvService.getCompanyDetails(name);
    }

    if (!details) {
      return res.status(404).json({ error: 'Company not found' });
    }

    res.json({ company: details });
  } catch (err) {
    console.error('Details error:', err.message);
    res.status(500).json({ error: 'Details lookup failed' });
  }
});

module.exports = router;
