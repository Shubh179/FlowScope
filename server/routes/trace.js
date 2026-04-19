const express = require('express');
const router = express.Router();
const bomService = require('../services/bomService');
const comtradeService = require('../services/comtradeService');
const csvService = require('../services/csvService');
const { getDriver, getIsConnected } = require('../config/neo4j');

// ─── HS Chapter → Relevant description keywords for company matching ───
const HS_PROFILE_KEYWORDS = {
  '72': ['steel', 'iron', 'metal', 'smelting', 'foundry', 'metallurg'],
  '73': ['steel', 'iron', 'metal', 'fabricat'],
  '74': ['copper', 'metal', 'wire', 'cable'],
  '75': ['nickel', 'metal', 'mining', 'mineral'],
  '76': ['aluminum', 'aluminium', 'metal'],
  '78': ['lead', 'metal', 'mining'],
  '79': ['zinc', 'metal', 'mining'],
  '80': ['tin', 'metal', 'mining'],
  '85': ['electronic', 'electrical', 'semiconductor', 'chip', 'battery', 'motor', 'circuit', 'technology'],
  '84': ['machinery', 'machine', 'engine', 'industrial', 'pump', 'compressor', 'equipment'],
  '87': ['automotive', 'vehicle', 'car', 'motor', 'auto', 'truck'],
  '39': ['plastic', 'polymer', 'resin', 'chemical'],
  '40': ['rubber', 'tire', 'tyre', 'elastomer'],
  '29': ['chemical', 'organic', 'pharmaceutical', 'synthesis'],
  '28': ['chemical', 'inorganic', 'industrial'],
  '30': ['pharma', 'drug', 'medicine', 'health'],
  '27': ['oil', 'fuel', 'petroleum', 'energy', 'gas', 'mining'],
  '26': ['ore', 'mining', 'mineral', 'extraction'],
  '25': ['mineral', 'mining', 'earth', 'sand', 'stone'],
  '90': ['instrument', 'optical', 'precision', 'medical'],
  '61': ['clothing', 'textile', 'garment', 'fashion', 'apparel'],
  '62': ['clothing', 'textile', 'garment', 'fashion', 'apparel'],
  '52': ['cotton', 'textile', 'fiber', 'fabric'],
  '54': ['synthetic', 'fiber', 'textile', 'filament'],
  '48': ['paper', 'pulp', 'packaging'],
  '70': ['glass', 'optical'],
  '38': ['chemical', 'industrial', 'compound'],
};

const COUNTRY_COORDS = {
  'India':[20.59,78.96],'United States':[37.09,-95.71],'China':[35.86,104.19],'Japan':[36.20,138.25],
  'South Korea':[35.90,127.76],'Germany':[51.16,10.45],'Taiwan':[23.69,120.96],'France':[46.22,2.21],
  'United Kingdom':[55.37,-3.43],'Switzerland':[46.81,8.22],'Singapore':[1.35,103.81],'Australia':[-25.27,133.77],
  'Brazil':[-14.23,-51.92],'Canada':[56.13,-106.35],'Netherlands':[52.13,5.29],'Italy':[41.87,12.56],
  'Spain':[40.46,-3.75],'Sweden':[60.12,18.64],'Norway':[60.47,8.47],'Finland':[61.92,25.75],
  'Denmark':[56.26,9.50],'Belgium':[50.50,4.47],'Austria':[47.52,14.55],'Poland':[51.92,19.14],
  'Czech Republic':[49.82,15.47],'Russia':[61.52,105.32],'Mexico':[23.63,-102.55],'Indonesia':[-0.79,113.92],
  'Thailand':[15.87,100.99],'Vietnam':[14.06,108.28],'Malaysia':[4.21,101.97],'Philippines':[12.88,121.77],
  'Turkey':[38.96,35.24],'Saudi Arabia':[23.88,45.08],'South Africa':[-30.56,22.94],'Luxembourg':[49.82,6.13],
  'Ireland':[53.14,-7.69],'Israel':[31.05,34.85],'Peru':[-9.19,-75.02],'Chile':[-35.67,-71.54],
  'Argentina':[-38.42,-63.62],'Colombia':[4.57,-74.30],'Portugal':[39.40,-8.22],'Greece':[39.07,21.82],
  'Romania':[45.94,24.97],'Hungary':[47.16,19.50],'Croatia':[45.10,15.20],'Serbia':[44.02,21.01],
  'Ukraine':[48.38,31.17],'Egypt':[26.82,30.80],'Nigeria':[9.08,8.68],'Kenya':[-0.02,37.91],
  'Pakistan':[30.37,69.34],'Bangladesh':[23.68,90.36],'Sri Lanka':[7.87,80.77],'Ivory Coast':[7.54,-5.55],
  'Congo':[-4.04,21.76],'Kuwait':[29.31,47.48],'Qatar':[25.35,51.18],'Oman':[21.47,55.97],
};

/**
 * Build description-based profile keywords for a given HS chapter.
 * Falls back to generic manufacturing keywords.
 */
function getProfileKeywords(hsChapter) {
  const chapter = String(hsChapter).substring(0, 2);
  return HS_PROFILE_KEYWORDS[chapter] || ['industr', 'manufactur', 'company', 'producer'];
}

/**
 * Get HS description from csvService taxonomy or HS_PROFILE_KEYWORDS.
 */
function getHsLabel(hsCode) {
  const desc = csvService.getHsDescription?.(hsCode);
  if (desc) return desc;
  // Fallback to generic labels
  const labels = {
    '72':'Iron/Steel','73':'Steel articles','74':'Copper','75':'Nickel','76':'Aluminum',
    '85':'Electronics','84':'Machinery','87':'Vehicles','39':'Plastics','40':'Rubber',
    '29':'Organic chemicals','28':'Inorganic chemicals','30':'Pharmaceuticals',
    '27':'Mineral fuels','26':'Ores','25':'Minerals','90':'Instruments',
  };
  return labels[String(hsCode).substring(0, 2)] || `HS ${hsCode}`;
}

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

        const hsLabel = getHsLabel(hsInput);
        const profileKeywords = getProfileKeywords(hsInput);

        // ─── STEP 3: Resolve supplier entities in partner countries ───
        for (const partner of partnerCountries.slice(0, 3)) {
          const partnerCountry = partner.country;

          let matchedCompanies = [];

          if (getIsConnected()) {
            const session = getDriver().session();
            try {
              // Build a Cypher WHERE clause that filters by description keywords
              // to ensure we pick industrially-relevant companies
              let keywordClauses = '';
              if (profileKeywords && profileKeywords.length > 0) {
                keywordClauses = 'AND (' + profileKeywords.slice(0, 4)
                  .map((_, i) => `toLower(s.description) CONTAINS $kw${i}`)
                  .join(' OR ') + ')';
              }

              const params = {
                partnerCountry,
                currentName: current.name,
              };
              if (profileKeywords) {
                profileKeywords.slice(0, 4).forEach((kw, i) => { params[`kw${i}`] = kw.toLowerCase(); });
              }

              const result = await session.run(`
                MATCH (s:Company)
                WHERE toLower(s.country) = toLower($partnerCountry)
                  AND s.name <> $currentName
                  AND s.description IS NOT NULL
                  ${keywordClauses}
                RETURN s.name AS name,
                       s.country AS country,
                       s.description AS desc
                ORDER BY size(s.description) DESC
                LIMIT 2
              `, params);

              matchedCompanies = result.records.map(r => ({
                name: r.get('name'),
                country: r.get('country') || partnerCountry,
                description: r.get('desc') || '',
              }));

              // Fallback: if no description-matched companies, try any company in that country
              if (matchedCompanies.length === 0) {
                const fallbackResult = await session.run(`
                  MATCH (s:Company)
                  WHERE toLower(s.country) = toLower($partnerCountry)
                    AND s.name <> $currentName
                    AND s.description IS NOT NULL
                    AND size(s.description) > 5
                  RETURN s.name AS name,
                         s.country AS country,
                         s.description AS desc
                  LIMIT 1
                `, { partnerCountry, currentName: current.name });

                matchedCompanies = fallbackResult.records.map(r => ({
                  name: r.get('name'),
                  country: r.get('country') || partnerCountry,
                  description: r.get('desc') || '',
                }));
              }
            } finally {
              await session.close();
            }
          } else {
            // CSV fallback: use description-based matching from csvService
            const csvCandidates = csvService.findCompaniesByCountryAndProfile(partnerCountry, profileKeywords);
            matchedCompanies = csvCandidates
              .filter(c => c.name !== current.name)
              .slice(0, 2)
              .map(c => ({ name: c.name, country: c.country, description: c.description }));

            // If no keyword match, just pick companies from that country
            if (matchedCompanies.length === 0) {
              const anyInCountry = Array.from(csvService.companies.values())
                .filter(c => c.country && c.country.toLowerCase() === String(partnerCountry).toLowerCase() && c.name !== current.name)
                .slice(0, 1);
              matchedCompanies = anyInCountry.map(c => ({
                name: c.name,
                country: c.country,
                description: csvService.getCompanyDescription(c.name) || '',
              }));
            }
          }

          // ─── STEP 4: Add matched companies to graph ───
          for (const matched of matchedCompanies) {
            if (visited.has(matched.name)) continue;
            visited.add(matched.name);

            const supCountry = matched.country || partnerCountry || 'Unknown';
            const supDesc = csvService.getCompanyDescription(matched.name) || matched.description || 'Supply chain partner.';
            const baseCoords = COUNTRY_COORDS[supCountry] || [Math.random()*40, Math.random()*100];
            const jitterCoords = [baseCoords[0] + (Math.random()-0.5)*2, baseCoords[1] + (Math.random()-0.5)*2];

            allNodes.set(matched.name, {
              id: matched.name,
              label: matched.name,
              country: supCountry,
              tier: current.tier + 1,
              coords: jitterCoords,
              description: supDesc,
              source: usedGemini ? 'gemini+comtrade' : (usedFallbackBom ? 'fallback-bom+comtrade' : 'comtrade-only'),
              confidence: usedGemini ? 'high' : (usedFallbackBom ? 'medium' : 'low'),
            });

            allEdges.push({
              source: matched.name,
              target: current.name,
              hsn: hsInput,
              product: hsLabel,
              type: current.tier === 0 ? 'IMPORT' : 'UPSTREAM_IMPORT',
              partnerCountry,
              tradeValue: partner.tradeValue || 0,
              provenance: usedGemini ? 'gemini+comtrade' : (usedFallbackBom ? 'fallback-bom+comtrade' : 'comtrade-only'),
              evidence: {
                mode: usedGemini ? 'gemini+comtrade' : (usedFallbackBom ? 'fallback-bom+comtrade' : 'comtrade-only'),
                upstreamHsInput: hsInput,
                partnerCountry,
                tradeValue: partner.tradeValue || 0,
              },
            });

            queue.push({ name: matched.name, country: supCountry, hs: hsInput, tier: current.tier + 1 });
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
    console.error('[TRACE] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
