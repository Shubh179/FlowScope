const axios = require('axios');

// ─── Country Name → M49 Code ───
const NAME_TO_M49 = {
  'afghanistan':'004','albania':'008','algeria':'012','argentina':'032',
  'australia':'036','austria':'040','bahrain':'048','bangladesh':'050',
  'belarus':'112','belgium':'056','bolivia':'068','brazil':'076',
  'brunei':'096','bulgaria':'100','cambodia':'116','cameroon':'120',
  'canada':'124','chile':'152','china':'156','colombia':'170',
  'congo':'180','costa rica':'188','croatia':'191','cuba':'192',
  'czech republic':'203','czechia':'203','denmark':'208','ecuador':'218',
  'egypt':'818','estonia':'233','ethiopia':'231','finland':'246',
  'france':'251','germany':'276','ghana':'288','greece':'300',
  'hong kong':'344','hungary':'348','iceland':'352','india':'356',
  'indonesia':'360','iran':'364','iraq':'368','ireland':'372',
  'israel':'376','italy':'380','ivory coast':'384','jamaica':'388',
  'japan':'392','jordan':'400','kazakhstan':'398','kenya':'404',
  'south korea':'410','korea':'410','kuwait':'414','latvia':'428',
  'lebanon':'422','libya':'434','lithuania':'440','luxembourg':'442',
  'malaysia':'458','mexico':'484','mongolia':'496','morocco':'504',
  'mozambique':'508','myanmar':'104','nepal':'524','netherlands':'528',
  'new zealand':'554','nigeria':'566','norway':'578','oman':'512',
  'pakistan':'586','panama':'591','paraguay':'600','peru':'604',
  'philippines':'608','poland':'616','portugal':'620','qatar':'634',
  'romania':'642','russia':'643','saudi arabia':'682',
  'senegal':'686','serbia':'688','singapore':'702','slovakia':'703',
  'slovenia':'705','south africa':'710','spain':'724','sri lanka':'144',
  'sweden':'752','switzerland':'756','taiwan':'158','tanzania':'834',
  'thailand':'764','tunisia':'788','turkey':'792','turkiye':'792',
  'ukraine':'804','united arab emirates':'784','uae':'784',
  'united kingdom':'826','united states':'842','usa':'842',
  'uruguay':'858','uzbekistan':'860','venezuela':'862',
  'vietnam':'704','zambia':'894','zimbabwe':'716',
};

// ─── M49 Code → Country Name (reverse map) ───
const M49_TO_NAME = {};
for (const [name, code] of Object.entries(NAME_TO_M49)) {
  // Only store first name for each code (avoid duplicates like 'korea' overwriting 'south korea')
  if (!M49_TO_NAME[code] || name.length > M49_TO_NAME[code].length) {
    M49_TO_NAME[code] = name.charAt(0).toUpperCase() + name.slice(1);
  }
}
// Manual overrides for cleaner names
M49_TO_NAME['842'] = 'United States';
M49_TO_NAME['826'] = 'United Kingdom';
M49_TO_NAME['410'] = 'South Korea';
M49_TO_NAME['784'] = 'United Arab Emirates';
M49_TO_NAME['682'] = 'Saudi Arabia';
M49_TO_NAME['710'] = 'South Africa';
M49_TO_NAME['384'] = 'Ivory Coast';
M49_TO_NAME['144'] = 'Sri Lanka';
M49_TO_NAME['203'] = 'Czech Republic';
M49_TO_NAME['792'] = 'Turkey';

function getM49(countryName) {
  if (!countryName) return null;
  const key = countryName.toLowerCase().trim();
  
  // Exact match first
  if (NAME_TO_M49[key]) return NAME_TO_M49[key];
  
  // Fuzzy: check if any known name is contained IN the input
  // e.g. "People's Republic of China" contains "china"
  for (const [name, code] of Object.entries(NAME_TO_M49)) {
    if (key.includes(name) || name.includes(key)) return code;
  }
  
  // Handle "Country-XXX" synthetic names — extract the M49 code directly
  const m49Match = countryName.match(/Country-(\d+)/);
  if (m49Match) return m49Match[1];

  return null;
}

function getCountryName(m49Code) {
  return M49_TO_NAME[String(m49Code)] || `Country-${m49Code}`;
}

class ComtradeService {
  constructor() {
    this.cache = new Map(); // Cache: "reporterCode:cmdCode" -> partners[]
  }

  /**
   * Fetch top trade partner countries for a reporter importing a specific HS code.
   * Uses UN Comtrade Public Preview API (free, no key required).
   * 
   * Correct endpoint: GET /public/v1/preview/C/A/HS
   * 
   * Returns array of { country, tradeValue } objects.
   */
  async getTopPartners(reporterCountry, hsCode) {
    const reporterCode = getM49(reporterCountry);

    if (!reporterCode) {
      console.log(`[Comtrade] No M49 code found for "${reporterCountry}", skipping.`);
      return [];
    }

    // Normalize HS code to 2-digit chapter for broader results from the preview API
    const cmdCode = String(hsCode).substring(0, 2);

    // Check cache first
    const cacheKey = `${reporterCode}:${cmdCode}`;
    if (this.cache.has(cacheKey)) {
      console.log(`[Comtrade] Cache hit for ${reporterCountry} importing HS ${cmdCode}`);
      return this.cache.get(cacheKey);
    }

    console.log(`[Comtrade] GET imports of HS ${cmdCode} into ${reporterCountry} (M49: ${reporterCode})`);

    try {
      // Correct URL structure: /public/v1/preview/{typeCode}/{freqCode}/{clCode}
      const response = await axios.get('https://comtradeapi.un.org/public/v1/preview/C/A/HS', {
        params: {
          reporterCode: reporterCode,
          cmdCode: cmdCode,
          flowCode: 'M',        // M = Import
          period: '2022',
          partnerCode: '',      // Empty = all partners
        },
        timeout: 15000,
      });

      const records = response.data?.data || [];
      if (records.length === 0) {
        console.log(`[Comtrade] No records returned.`);
        return [];
      }

      // Filter out World aggregate (code 0) and self-trade
      const valid = records.filter(t =>
        t.partnerCode !== 0 &&
        String(t.partnerCode) !== '0' &&
        String(t.partnerCode) !== reporterCode
      );

      valid.sort((a, b) => (b.primaryValue || 0) - (a.primaryValue || 0));

      // Unique by partner code
      const uniquePartners = [];
      const seen = new Set();
      for (const t of valid) {
        if (!seen.has(t.partnerCode)) {
          seen.add(t.partnerCode);
          uniquePartners.push(t);
        }
      }

      const top = uniquePartners.slice(0, 5).map(t => ({
        country: getCountryName(t.partnerCode),
        tradeValue: t.primaryValue || 0,
        partnerCode: t.partnerCode,
      }));

      console.log(`[Comtrade] Top partners: ${top.map(t => `${t.country} ($${(t.tradeValue/1e6).toFixed(0)}M)`).join(', ')}`);
      this.cache.set(cacheKey, top);
      return top;

    } catch (error) {
      console.error(`[Comtrade] API error: ${error.message}`);
      return [];
    }
  }
}

module.exports = new ComtradeService();
