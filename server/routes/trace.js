const express = require('express');
const router = express.Router();
const bomService = require('../services/bomService');
const comtradeService = require('../services/comtradeService');
const { getDriver, getIsConnected } = require('../config/neo4j');

// ─── Raw material HS sections — these are terminal nodes in the supply chain ───
const RAW_MATERIAL_SECTIONS = ['I', 'II', 'V']; // Animals, Vegetables, Minerals

// ─── HS Code -> Product description map for explainability ───
const HS_DESCRIPTIONS = {
  '72': 'Iron and Steel', '73': 'Iron/Steel articles', '74': 'Copper',
  '75': 'Nickel', '76': 'Aluminum', '78': 'Lead', '79': 'Zinc',
  '80': 'Tin', '81': 'Other base metals', '26': 'Ores and concentrates',
  '27': 'Mineral fuels and oils', '28': 'Inorganic chemicals',
  '29': 'Organic chemicals', '38': 'Chemical products',
  '39': 'Plastics', '40': 'Rubber', '84': 'Machinery',
  '85': 'Electrical equipment', '87': 'Vehicles',
  '54': 'Man-made filaments', '70': 'Glass', '32': 'Paints/dyes',
  '48': 'Paper', '44': 'Wood', '25': 'Salt/sulphur/earth/stone',
};

/**
 * POST /api/trace/expand
 * 
 * The FULL multi-tier recursive BFS trace engine.
 * Accepts a company + HS code, recursively discovers suppliers
 * using Gemini BOM inference + UN Comtrade API + Neo4j company matching.
 */
router.post('/expand', async (req, res) => {
  try {
    const {
      companyName,
      companyCountry,
      targetHsCode,
      hsnDescription,
      maxTiers = 3,
    } = req.body;

    if (!companyName || !targetHsCode) {
      return res.status(400).json({ error: 'companyName and targetHsCode are required' });
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`[Trace Engine] Starting multi-tier trace for ${companyName}`);
    console.log(`[Trace Engine] Target HS: ${targetHsCode}, Max Tiers: ${maxTiers}`);
    console.log(`${'═'.repeat(60)}`);

    // ─── BFS Queue ───
    const queue = [{
      companyName,
      companyCountry: companyCountry || 'Unknown',
      producingHsCode: targetHsCode,
      tier: 0,
    }];

    const allNodes = new Map();   // name -> node data
    const allEdges = [];          // { source, target, hsn, hsnDesc, tier }
    const visited = new Set();    // prevent cycles
    visited.add(companyName);

    // Add anchor node (Tier-0)
    allNodes.set(companyName, {
      id: companyName,
      label: companyName,
      country: companyCountry || 'Unknown',
      tier: 0,
      description: hsnDescription || '',
    });

    const driver = getIsConnected() ? getDriver() : null;

    const MAX_NODES = 40; // Global node budget to prevent timeouts

    // ─── BFS Loop ───
    while (queue.length > 0) {
      const current = queue.shift();

      // Stop if we've hit the max tier depth or node budget
      if (current.tier >= maxTiers) continue;
      if (allNodes.size >= MAX_NODES) {
        console.log(`[Trace Engine] Node budget reached (${MAX_NODES}). Stopping expansion.`);
        break;
      }

      const nextTier = current.tier + 1;

      console.log(`\n[Tier-${current.tier}] Processing: ${current.companyName} (${current.companyCountry}) | HS: ${current.producingHsCode}`);

      // ─── STEP 1: BOM Inference via Gemini ───
      console.log(`[Tier-${current.tier}] → Step 1: Gemini BOM inference for HS ${current.producingHsCode}...`);
      let upstreamCodes = [];
      try {
        upstreamCodes = await bomService.getUpstreamHsCodes(
          current.producingHsCode,
          HS_DESCRIPTIONS[String(current.producingHsCode).substring(0, 2)] || hsnDescription || ''
        );
      } catch (e) {
        console.error(`[Tier-${current.tier}] Gemini BOM failed:`, e.message);
      }

      if (upstreamCodes.length === 0) {
        console.log(`[Tier-${current.tier}] → No upstream codes found. Terminal node.`);
        continue;
      }

      console.log(`[Tier-${current.tier}] → Upstream HS codes: ${upstreamCodes.join(', ')}`);

      // Adaptive branching: fewer branches at deeper tiers
      const hsLimit = nextTier <= 1 ? 3 : 2;
      const partnerLimit = nextTier <= 1 ? 2 : 1;

      // ─── STEP 2: Query Comtrade for each upstream HS code ───
      for (const reqHsn of upstreamCodes.slice(0, hsLimit)) {
        console.log(`[Tier-${current.tier}] → Step 2: Comtrade query for HS ${reqHsn} imported by ${current.companyCountry}`);

        const partners = await comtradeService.getTopPartners(current.companyCountry, reqHsn);

        if (partners.length === 0) {
          console.log(`[Tier-${current.tier}]   No Comtrade partners found for HS ${reqHsn}`);
          continue;
        }

        // ─── STEP 3: Match companies in Neo4j for each partner country ───
        for (const partner of partners.slice(0, partnerLimit)) {
          const partnerCountry = partner.country;

          console.log(`[Tier-${current.tier}] → Step 3: Searching Neo4j for companies in "${partnerCountry}"`);

          let matchedCompanies = [];

          if (driver) {
            try {
              const session = driver.session();
              try {
                const result = await session.run(
                  `MATCH (c:Company)
                   WHERE toLower(c.country) CONTAINS toLower($country)
                   RETURN c.name AS name, c.country AS country, c.description AS description
                   LIMIT 3`,
                  { country: partnerCountry.split(',')[0].trim() }
                );

                matchedCompanies = result.records.map(r => ({
                  name: r.get('name'),
                  country: r.get('country'),
                  description: r.get('description') || '',
                }));
              } finally {
                await session.close();
              }
            } catch (neo4jErr) {
              console.warn(`[Neo4j] Read failed (non-fatal): ${neo4jErr.message}`);
            }
          }

          if (matchedCompanies.length === 0) {
            // If no match in Neo4j, create a synthetic node from Comtrade data
            const syntheticName = `${partnerCountry} (${HS_DESCRIPTIONS[String(reqHsn).substring(0, 2)] || 'HS ' + reqHsn})`;
            matchedCompanies = [{
              name: syntheticName,
              country: partnerCountry,
              description: `Major exporter of HS ${reqHsn}`,
            }];
          }

          // ─── STEP 4: Create edges and queue next tier ───
          for (const supplier of matchedCompanies) {
            if (visited.has(supplier.name)) continue;
            visited.add(supplier.name);

            // Add node
            allNodes.set(supplier.name, {
              id: supplier.name,
              label: supplier.name,
              country: supplier.country,
              tier: nextTier,
              description: supplier.description,
            });

            // Add edge
            const hsnDesc = HS_DESCRIPTIONS[String(reqHsn).substring(0, 2)] || `HS ${reqHsn}`;
            allEdges.push({
              source: supplier.name,
              target: current.companyName,
              hsn: reqHsn,
              product: hsnDesc,
              tier: nextTier,
              tradeValue: partner.tradeValue || 0,
              explainability: `${supplier.name} supplies ${hsnDesc} (HS ${reqHsn}) to ${current.companyName}. Source: UN Comtrade ${partner.country} → ${current.companyCountry}.`,
            });

            // Persist the edge in Neo4j (fire-and-forget, won't crash trace)
            if (driver) {
              try {
                const session = driver.session();
                try {
                  await session.run(
                    `MERGE (sup:Company {name: $supName})
                     ON CREATE SET sup.country = $supCountry, sup.description = $supDesc
                     WITH sup
                     MERGE (buy:Company {name: $buyName})
                     WITH sup, buy
                     MERGE (sup)-[r:SUPPLIES_TO]->(buy)
                     SET r.hsn = $hsn, r.product = $product, r.tier = $tier, r.source = "comtrade"`,
                    {
                      supName: supplier.name,
                      supCountry: supplier.country,
                      supDesc: supplier.description,
                      buyName: current.companyName,
                      hsn: reqHsn,
                      product: hsnDesc,
                      tier: nextTier,
                    }
                  );
                } finally {
                  await session.close();
                }
              } catch (neo4jErr) {
                console.warn(`[Neo4j] Write failed (non-fatal): ${neo4jErr.message}`);
              }
            }

            // ─── STEP 5: Queue this supplier for deeper traversal ───
            queue.push({
              companyName: supplier.name,
              companyCountry: supplier.country,
              producingHsCode: reqHsn,
              tier: nextTier,
            });

            console.log(`[Tier-${nextTier}] ✓ Discovered: ${supplier.name} (${supplier.country}) → supplies ${hsnDesc} to ${current.companyName}`);
          }
        }
      }
    }

    // ─── Build trade routes for the map ───
    const tradeRoutes = [];
    const routeMap = new Map();
    for (const edge of allEdges) {
      const srcNode = allNodes.get(edge.source);
      const tgtNode = allNodes.get(edge.target);
      if (srcNode && tgtNode && srcNode.country !== tgtNode.country) {
        const key = `${srcNode.country}→${tgtNode.country}`;
        if (!routeMap.has(key)) {
          routeMap.set(key, { from: srcNode.country, to: tgtNode.country, volume: 0, products: [] });
        }
        const route = routeMap.get(key);
        route.volume += edge.tradeValue || 0;
        if (!route.products.includes(edge.product)) route.products.push(edge.product);
      }
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`[Trace Engine] COMPLETE: ${allNodes.size} nodes, ${allEdges.length} edges`);
    console.log(`${'═'.repeat(60)}\n`);

    res.json({
      targetCompany: companyName,
      nodes: Array.from(allNodes.values()),
      edges: allEdges,
      tradeRoutes: Array.from(routeMap.values()),
      meta: {
        tiersTraversed: Math.max(...Array.from(allNodes.values()).map(n => n.tier), 0),
        totalNodes: allNodes.size,
        totalEdges: allEdges.length,
      },
    });

  } catch (error) {
    console.error('[Trace Engine] Fatal error:', error);
    res.status(500).json({ error: 'Trace engine failed', details: error.message });
  }
});

module.exports = router;
