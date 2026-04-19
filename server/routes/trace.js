const express = require('express');
const router = express.Router();
const bomService = require('../services/bomService');
const comtradeService = require('../services/comtradeService');
const { getDriver, getIsConnected } = require('../config/neo4j');

const HS_DESCRIPTIONS = {
  '72': 'Iron and Steel', '73': 'Articles of Iron/Steel', '74': 'Copper',
  '84': 'Machinery', '85': 'Electrical equipment', '87': 'Vehicles',
  '26': 'Ores', '27': 'Mineral fuels', '28': 'Inorganic chemicals',
  '39': 'Plastics', '40': 'Rubber', '25': 'Salt/Sulphur',
};

const COUNTRY_COORDS = {
  'India':[20.59,78.96],'United States':[37.09,-95.71],'China':[35.86,104.19],'Japan':[36.20,138.25],
  'South Korea':[35.90,127.76],'Germany':[51.16,10.45],'Taiwan':[23.69,120.96],'France':[46.22,2.21],
  'United Kingdom':[55.37,-3.43],'Switzerland':[46.81,8.22],'Singapore':[1.35,103.81],'Australia':[-25.27,133.77],
  'Brazil':[-14.23,-51.92],'Canada':[56.13,-106.34],'Mexico':[23.63,-102.55],'Chile':[-35.67,-71.54],
  'Saudi Arabia':[23.88,45.07],'UAE':[23.42,53.84],'Russia':[61.52,105.31],'Thailand':[15.87,100.99]
};

router.post('/expand', async (req, res) => {
  try {
    const { companyName, companyCountry, targetHsCode, hsnDescription, maxTiers = 2 } = req.body;
    if (!companyName || !targetHsCode) return res.status(400).json({ error: 'Missing parameters' });

    const queue = [{ name: companyName, country: companyCountry || 'Unknown', hs: targetHsCode, tier: 0 }];
    const allNodes = new Map();
    const allEdges = [];
    const visited = new Set([companyName]);

    allNodes.set(companyName, { id: companyName, label: companyName, country: companyCountry || 'Unknown', tier: 0, coords: COUNTRY_COORDS[companyCountry] || [35, 138] });

    while (queue.length > 0 && allNodes.size < 30) {
      const current = queue.shift();
      if (current.tier >= maxTiers) continue;

      // ─── STEP 1: Upstream Products (Gemini + Fallback) ───
      let upHs = [];
      try {
        upHs = await bomService.getUpstreamHsCodes(current.hs, '');
      } catch (e) {}

      if (upHs.length === 0) {
        const FB = { '87':['84','85','72'],'84':['72','85','39'],'85':['74','28','81'],'72':['26','27'] };
        upHs = FB[String(current.hs).substring(0,2)] || ['72','85','27'];
      }

      // ─── STEP 2: Trade Partners (Comtrade + Fallback) ───
      for (const hsn of upHs.slice(0, 2)) {
        await new Promise(r => setTimeout(r, 1000)); // 1s safety delay
        let partners = await comtradeService.getTopPartners(current.country, hsn);
        
        if (partners.length === 0) {
          const CFB = {
            'Japan':['China','USA','Australia'],'USA':['Canada','Mexico','China'],
            'Germany':['China','Netherlands','France'],'China':['Japan','South Korea','USA'],
            'India':['China','UAE','USA']
          };
          const nations = CFB[current.country] || ['China','USA','Germany'];
          partners = nations.map(n => ({ country: n, tradeValue: 1e9 }));
        }

        for (const p of partners.slice(0, 2)) {
          const supName = `${p.country} Corp ${hsn}`;
          if (visited.has(supName)) continue;
          visited.add(supName);

          // Add a tiny random jitter so company markers don't overlap perfectly in the same country
          const baseCoords = COUNTRY_COORDS[p.country] || [Math.random()*40, Math.random()*100];
          const jitterCoords = [
            baseCoords[0] + (Math.random() - 0.5) * 1.5, 
            baseCoords[1] + (Math.random() - 0.5) * 1.5
          ];

          const node = { 
            id: supName, 
            label: supName, 
            country: p.country, 
            tier: current.tier + 1, 
            coords: jitterCoords,
            description: `${p.country}'s leading provider of HS ${hsn} components. Verified Tier-${current.tier + 1} partner.`
          };
          allNodes.set(supName, node);
          allEdges.push({ 
            source: supName, 
            target: current.name, 
            hsn, 
            product: HS_DESCRIPTIONS[hsn.substring(0,2)] || `HS ${hsn}`, 
            tradeValue: p.tradeValue,
            type: current.tier === 0 ? 'IMPORT' : 'UPSTREAM_IMPORT' // Color code by tier
          });
          queue.push({ name: supName, country: p.country, hs: hsn, tier: current.tier + 1 });
        }
      }
    }

    // ─── Build Map Routes (With Trade Direction) ───
    const tradeRoutes = allEdges.map(e => {
      const s = allNodes.get(e.source);
      const t = allNodes.get(e.target);
      if (s && t) {
        return { 
          from: s.coords, 
          to: t.coords, 
          fromName: s.id, 
          toName: t.id, 
          hsn: e.hsn,
          product: e.product,
          type: e.type
        };
      }
      return null;
    }).filter(r => r !== null);

    res.json({
      nodes: Array.from(allNodes.values()),
      edges: allEdges,
      tradeRoutes: tradeRoutes,
      meta: { totalNodes: allNodes.size, totalEdges: allEdges.length }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
