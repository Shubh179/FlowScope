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
    const {
      companyName,
      companyCountry,
      targetHsCode,
      maxTiers = 2,
      traceMode = 'hybrid',
      strictGemini = false,
    } = req.body;
    if (!companyName || !targetHsCode) return res.status(400).json({ error: 'Missing parameters' });

    const normalizedMode = String(traceMode || 'hybrid').toLowerCase();
    const allowGemini = normalizedMode !== 'comtrade-only';

    let geminiAttemptCount = 0;
    let geminiSuccessCount = 0;
    let geminiFailureCount = 0;

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
      coords: COUNTRY_COORDS[companyCountry] || [20, 77],
      source: 'user-input',
      confidence: 'anchor'
    });

    while (queue.length > 0 && allNodes.size < 40) {
      const current = queue.shift();
      if (current.tier >= maxTiers) continue;

      // ─── STEP 1: Gemini proposes upstream HS inputs for the current node HS ───
      let upstreamHsCodes = [];
      let usedGemini = false;
      let usedFallbackBom = false;
      if (allowGemini) {
        geminiAttemptCount += 1;
        try {
          upstreamHsCodes = await bomService.getUpstreamHsCodes(current.hs, current.description || '');
          usedGemini = Array.isArray(upstreamHsCodes) && upstreamHsCodes.length > 0;
          if (usedGemini) {
            geminiSuccessCount += 1;
          }
        } catch (err) {
          geminiFailureCount += 1;
          if (strictGemini) {
            return res.status(502).json({
              error: `Gemini upstream inference failed for HS ${current.hs}`,
              detail: err.message,
              mode: normalizedMode,
            });
          }
          // In non-strict mode, use static BOM fallback chapters before collapsing to current HS.
          if (typeof bomService._fallbackBom === 'function') {
            try {
              const chapter = String(current.hs).substring(0, 2);
              const fallbackCodes = bomService._fallbackBom(chapter);
              if (Array.isArray(fallbackCodes) && fallbackCodes.length > 0) {
                upstreamHsCodes = fallbackCodes;
                usedFallbackBom = true;
              }
            } catch (_fallbackErr) {
              // Keep traversal alive with current HS if fallback lookup also fails.
            }
          }

          // Keep traversal alive with current HS if Gemini is temporarily unavailable.
          usedGemini = false;
          console.warn(`[TRACE] Gemini unavailable for HS ${current.hs}: ${err.message}`);
        }
      }

      const hsInputs = (Array.isArray(upstreamHsCodes) && upstreamHsCodes.length > 0
        ? upstreamHsCodes
        : [String(current.hs).substring(0, 2)]
      )
        .map((code) => String(code).replace('.', '').substring(0, 2))
        .filter(Boolean)
        .filter((code, idx, arr) => arr.indexOf(code) === idx)
        .slice(0, 4);

      // ─── STEP 2: For each upstream HS input, fetch Comtrade import partners ───
      for (const hsInput of hsInputs) {
        const partnerCountries = await comtradeService.getTopPartners(current.country, hsInput);
        if (!Array.isArray(partnerCountries) || partnerCountries.length === 0) continue;

        // ─── STEP 3: Resolve supplier entities in partner countries ───
        for (const partner of partnerCountries.slice(0, 4)) {
          const partnerCountry = partner.country;
          const hsPrefix = hsInput;

          if (getIsConnected()) {
            const session = getDriver().session();
            try {
              const result = await session.run(`
              MATCH (s:Company)
              WHERE toLower(s.country) = toLower($partnerCountry)
                AND s.name <> $currentName
              OPTIONAL MATCH (s)-[r:SUPPLIES_TO]-(imp:Company)
              WHERE r.hsn CONTAINS $hsPrefix
              RETURN s.name AS name,
                     s.country AS country,
                     s.description AS desc,
                     COLLECT(DISTINCT imp.name)[0..3] AS importers
              LIMIT 2
            `, {
              partnerCountry,
              currentName: current.name,
              hsPrefix,
            });

              for (const record of result.records) {
                const supName = record.get('name');
                const supCountry = record.get('country') || partnerCountry || 'Unknown';
                const supDesc = csvService.getCompanyDescription(supName) || record.get('desc') || 'Verified supply chain tier partner.';
                const realImporters = (record.get('importers') || []).filter(Boolean);

                if (visited.has(supName)) continue;
                visited.add(supName);

                const baseCoords = COUNTRY_COORDS[supCountry] || [Math.random()*40, Math.random()*100];
                const jitterCoords = [baseCoords[0] + (Math.random()-0.5)*2, baseCoords[1] + (Math.random()-0.5)*2];

                allNodes.set(supName, {
                  id: supName,
                  label: supName,
                  country: supCountry,
                  tier: current.tier + 1,
                  coords: jitterCoords,
                  description: supDesc,
                  source: usedGemini ? 'gemini+comtrade' : 'comtrade-only',
                  confidence: usedGemini ? 'high' : (usedFallbackBom ? 'medium' : 'low'),
                });

                allEdges.push({
                  source: supName,
                  target: current.name,
                  hsn: hsPrefix,
                  product: `HS ${hsPrefix} upstream input`,
                  type: current.tier === 0 ? 'IMPORT' : 'UPSTREAM_IMPORT',
                  importers: realImporters.length > 0 ? realImporters : [current.name],
                  partnerCountry,
                  tradeValue: partner.tradeValue || 0,
                  provenance: usedGemini ? 'gemini+comtrade' : (usedFallbackBom ? 'fallback-bom+comtrade' : 'comtrade-only'),
                  evidence: {
                    mode: usedGemini ? 'gemini+comtrade' : (usedFallbackBom ? 'fallback-bom+comtrade' : 'comtrade-only'),
                    upstreamHsInput: hsPrefix,
                    partnerCountry,
                    tradeValue: partner.tradeValue || 0,
                  },
                });

                queue.push({ name: supName, country: supCountry, hs: hsPrefix, tier: current.tier + 1 });
              }
            } finally {
              await session.close();
            }
          } else {
            const csvCandidates = Array.from(csvService.companies.values())
              .filter((c) => c.country && c.country.toLowerCase() === String(partnerCountry).toLowerCase() && c.name !== current.name)
              .slice(0, 2);

            for (const candidate of csvCandidates) {
              if (visited.has(candidate.name)) continue;
              visited.add(candidate.name);

              const supCountry = candidate.country || partnerCountry || 'Unknown';
              const baseCoords = COUNTRY_COORDS[supCountry] || [Math.random()*40, Math.random()*100];
              const jitterCoords = [baseCoords[0] + (Math.random()-0.5)*2, baseCoords[1] + (Math.random()-0.5)*2];

              allNodes.set(candidate.name, {
                id: candidate.name,
                label: candidate.name,
                country: supCountry,
                tier: current.tier + 1,
                coords: jitterCoords,
                description: csvService.getCompanyDescription(candidate.name) || 'CSV-derived supply chain partner.',
                source: usedGemini ? 'gemini+comtrade' : 'comtrade-only',
                confidence: usedGemini ? 'medium' : (usedFallbackBom ? 'medium' : 'low'),
              });

              allEdges.push({
                source: candidate.name,
                target: current.name,
                hsn: hsPrefix,
                product: `HS ${hsPrefix} upstream input`,
                type: current.tier === 0 ? 'IMPORT' : 'UPSTREAM_IMPORT',
                importers: [current.name],
                partnerCountry,
                tradeValue: partner.tradeValue || 0,
                provenance: usedGemini ? 'gemini+comtrade' : (usedFallbackBom ? 'fallback-bom+comtrade' : 'comtrade-only'),
                evidence: {
                  mode: usedGemini ? 'gemini+comtrade' : (usedFallbackBom ? 'fallback-bom+comtrade' : 'comtrade-only'),
                  upstreamHsInput: hsPrefix,
                  partnerCountry,
                  tradeValue: partner.tradeValue || 0,
                },
              });

              queue.push({ name: candidate.name, country: supCountry, hs: hsPrefix, tier: current.tier + 1 });
            }
          }
        }
      }
    }

    const tradeRoutes = allEdges.map(e => {
      const s = allNodes.get(e.source), t = allNodes.get(e.target);
      return (s && t) ? { from: s.coords, to: t.coords, fromName: s.id, toName: t.id, hsn: e.hsn, type: e.type } : null;
    }).filter(r => r);

    res.json({
      nodes: Array.from(allNodes.values()),
      edges: allEdges,
      tradeRoutes,
      meta: {
        totalNodes: allNodes.size,
        totalEdges: allEdges.length,
        mode: normalizedMode,
        gemini: {
          enabled: allowGemini,
          attempts: geminiAttemptCount,
          successes: geminiSuccessCount,
          failures: geminiFailureCount,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
