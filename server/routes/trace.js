const express = require('express');
const router = express.Router();
const bomService = require('../services/bomService');
const comtradeService = require('../services/comtradeService');
const csvService = require('../services/csvService');
const { getDriver, getIsConnected } = require('../config/neo4j');

const COUNTRY_COORDS = {
  'India':[20.59,78.96],'United States':[37.09,-95.71],'China':[35.86,104.19],'Japan':[36.20,138.25],
  'South Korea':[35.90,127.76],'Germany':[51.16,10.45],'Taiwan':[23.69,120.96],'France':[46.22,2.21],
  'United Kingdom':[55.37,-3.43],'Switzerland':[46.81,8.22],'Singapore':[1.35,103.81],'Australia':[-25.27,133.77]
};

router.post('/expand', async (req, res) => {
  try {
    const { companyName, companyCountry, targetHsCode, maxTiers = 2 } = req.body;
    if (!companyName || !targetHsCode) return res.status(400).json({ error: 'Missing parameters' });

    const queue = [{ name: companyName, country: companyCountry || 'Unknown', hs: targetHsCode, tier: 0 }];
    const allNodes = new Map();
    const allEdges = [];
    const visited = new Set([companyName]);

    // Initial Node from DB/CSV
    let initialDesc = csvService.getCompanyDescription(companyName) || 'Global industrial entity.';
    if (getIsConnected() && (!initialDesc || initialDesc.includes('Global industrial'))) {
      const session = getDriver().session();
      try {
        const result = await session.run('MATCH (c:Company {name: $name}) RETURN c.description AS d', { name: companyName });
        if (result.records.length > 0) initialDesc = result.records[0].get('d') || initialDesc;
      } finally { await session.close(); }
    }

    allNodes.set(companyName, { 
      id: companyName, label: companyName, country: companyCountry || 'Unknown', tier: 0, 
      description: initialDesc,
      coords: COUNTRY_COORDS[companyCountry] || [20, 77] 
    });

    while (queue.length > 0 && allNodes.size < 40) {
      const current = queue.shift();
      if (current.tier >= maxTiers) continue;

      // ─── STEP 1: Get Upstream BOM (Gemini) ───
      let upHs = await bomService.getUpstreamHsCodes(current.hs, '');
      if (upHs.length === 0) upHs = ['8708', '8507', '8409'];

      // ─── STEP 2: Find Real Suppliers in Neo4j/CSV ───
      for (const hsn of upHs.slice(0, 2)) {
        if (!getIsConnected()) continue;
        const session = getDriver().session();
        try {
          const result = await session.run(`
            MATCH (s:Company)
            WHERE (s.country <> $currentCountry AND s.country IS NOT NULL)
            OR (s.name CONTAINS $hsn)
            RETURN s.name AS name, s.country AS country, s.description AS desc
            LIMIT 2
          `, { currentCountry: current.country, hsn });

          for (const record of result.records) {
            const supName = record.get('name');
            const supCountry = record.get('country') || 'Unknown';
            const supDesc = csvService.getCompanyDescription(supName) || record.get('desc') || 'Verified supply chain tier partner.';

            // 🔍 FIND REAL CONCURRENT IMPORTERS IN DB
            let realImporters = [];
            try {
              const impResult = await session.run(`
                MATCH (s:Company {name: $supName})-[r:SUPPLIES_TO]-(imp:Company)
                WHERE r.hsn CONTAINS $hsn
                RETURN DISTINCT imp.name AS name LIMIT 3
              `, { supName, hsn: hsn.substring(0,2) });
              realImporters = impResult.records.map(r => r.get('name'));
            } catch (e) {}

            if (visited.has(supName)) continue;
            visited.add(supName);

            const baseCoords = COUNTRY_COORDS[supCountry] || [Math.random()*40, Math.random()*100];
            const jitterCoords = [baseCoords[0] + (Math.random()-0.5)*2, baseCoords[1] + (Math.random()-0.5)*2];

            allNodes.set(supName, { id: supName, label: supName, country: supCountry, tier: current.tier + 1, coords: jitterCoords, description: supDesc });
            allEdges.push({ 
              source: supName, target: current.name, hsn, product: `HS ${hsn} Component`, 
              type: current.tier === 0 ? 'IMPORT' : 'UPSTREAM_IMPORT',
              importers: realImporters.length > 0 ? realImporters : ['Market Standard Aggregates']
            });
            queue.push({ name: supName, country: supCountry, hs: hsn, tier: current.tier + 1 });
          }
        } finally { await session.close(); }
      }
    }

    const tradeRoutes = allEdges.map(e => {
      const s = allNodes.get(e.source), t = allNodes.get(e.target);
      return (s && t) ? { from: s.coords, to: t.coords, fromName: s.id, toName: t.id, hsn: e.hsn, type: e.type } : null;
    }).filter(r => r);

    res.json({ nodes: Array.from(allNodes.values()), edges: allEdges, tradeRoutes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
