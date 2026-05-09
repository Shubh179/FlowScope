const express = require('express');
const router = express.Router();
const { getIsConnected, getDriver } = require('../config/neo4j');
const csvService = require('../services/csvService');
const bomService = require('../services/bomService');

// ─── Default HSN categories for companies with no existing trade edges ───
const DEFAULT_HSN_CATEGORIES = [
  { code: '8708', description: 'Motor vehicle parts & accessories', count: 0, totalQuantity: 0 },
  { code: '8507', description: 'Electric accumulators (Batteries)', count: 0, totalQuantity: 0 },
  { code: '8542', description: 'Electronic integrated circuits', count: 0, totalQuantity: 0 },
  { code: '7208', description: 'Flat-rolled iron/steel products', count: 0, totalQuantity: 0 },
  { code: '3004', description: 'Medicaments & Pharmaceuticals', count: 0, totalQuantity: 0 },
  { code: '8471', description: 'Computing machines & data processing', count: 0, totalQuantity: 0 },
  { code: '2710', description: 'Petroleum oils & fuels', count: 0, totalQuantity: 0 },
  { code: '8517', description: 'Telephone & communication apparatus', count: 0, totalQuantity: 0 },
];

/**
 * GET /api/companies/search?q=<query>
 * Search companies by name.
 */
router.get('/search', async (req, res) => {
  try {
    const rawQuery = req.query.q || '';
    const query = rawQuery.trim().toLowerCase();
    
    console.log(`[Search] Query: "${query}" (raw: "${rawQuery}")`);

    if (query.length < 1) {
      return res.json({ companies: [] });
    }

    let companies = null;
    if (getIsConnected()) {
      const session = getDriver().session();
      try {
        const result = await session.run(
          `MATCH (c:Company)
           WHERE toLower(c.name) CONTAINS toLower($query)
           WITH c, CASE WHEN toLower(c.name) STARTS WITH toLower($query) THEN 1 ELSE 0 END AS prefixMatch
           RETURN c.name AS name, c.country AS country, c.description AS description
           ORDER BY prefixMatch DESC, c.name ASC
           LIMIT 12`,
          { query }
        );
        companies = result.records.map((r) => {
          const name = r.get('name');
          const dbDesc = r.get('description');
          return {
            name,
            country: r.get('country') || 'Unknown',
            description: csvService.getCompanyDescription(name) || dbDesc || '',
          };
        });
      } finally {
        await session.close();
      }
    }

    // Always fetch from dataset
    const datasetCompanies = csvService.searchCompanies(query);

    // Merge them, prioritizing Neo4j companies but removing duplicates
    const merged = [...(companies || [])];
    const seen = new Set(merged.map(c => c.name.toLowerCase()));

    for (const c of datasetCompanies) {
      if (!seen.has(c.name.toLowerCase())) {
        merged.push(c);
        seen.add(c.name.toLowerCase());
      }
    }

    console.log(`[Search] Found ${merged.length} matches for "${query}"`);
    res.json({ companies: merged.slice(0, 12) });
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * GET /api/companies/:name/hsn
 * Get HSN codes for a company. Returns defaults if no edges exist.
 */
router.get('/:name/hsn', async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    let hsnCodes = [];

    if (getIsConnected()) {
      const session = getDriver().session();
      try {
        const result = await session.run(
          `MATCH (c:Company {name: $name})-[r:SUPPLIES_TO]-(other)
           RETURN DISTINCT r.hsn AS code, r.product AS description,
                  count(r) AS count, sum(COALESCE(r.quantity, 0)) AS totalQuantity
           ORDER BY totalQuantity DESC`,
          { name }
        );
        hsnCodes = result.records.map((r) => ({
          code: r.get('code'),
          description: r.get('description') || 'Trade product',
          count: typeof r.get('count')?.toNumber === 'function' ? r.get('count').toNumber() : Number(r.get('count')) || 0,
          totalQuantity: typeof r.get('totalQuantity')?.toNumber === 'function' ? r.get('totalQuantity').toNumber() : Number(r.get('totalQuantity')) || 0,
        }));
      } finally {
        await session.close();
      }
    }

    // If no edges exist yet, try to use the dataset's BOM filter, else default HSN categories
    if (hsnCodes.length === 0) {
      try {
        const bomList = await bomService.getStructuredBOM('85', '', name);
        if (bomList && bomList.length > 0) {
          hsnCodes = bomList.map(b => ({
            code: b.hs,
            description: b.component.toUpperCase(),
            count: 0,
            totalQuantity: 0
          }));
        }
      } catch (err) {
        console.warn(`[Companies API] Failed to fetch BOM for ${name}`, err.message);
      }

      if (hsnCodes.length === 0) {
        hsnCodes = DEFAULT_HSN_CATEGORIES;
      }
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
    let details = null;

    if (getIsConnected()) {
      const session = getDriver().session();
      try {
        const result = await session.run(
          `MATCH (c:Company {name: $name})
           OPTIONAL MATCH (supplier)-[r1:SUPPLIES_TO]->(c)
           OPTIONAL MATCH (c)-[r2:SUPPLIES_TO]->(customer)
           RETURN c,
                  COLLECT(DISTINCT {name: supplier.name, country: supplier.country}) AS suppliers,
                  COLLECT(DISTINCT {name: customer.name, country: customer.country}) AS customers`,
          { name }
        );

        if (result.records.length > 0) {
          const record = result.records[0];
          const company = record.get('c').properties;
          const suppliers = record.get('suppliers').filter((s) => s.name);
          const customers = record.get('customers').filter((c) => c.name);

          details = {
            name: company.name,
            country: company.country || 'Unknown',
            description: company.description || '',
            supplierCount: suppliers.length,
            customerCount: customers.length,
            suppliers,
            customers,
          };
        }
      } finally {
        await session.close();
      }
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
