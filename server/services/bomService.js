const csvService = require('./csvService');

// Map of common keywords to generic HS chapters/headings
const KEYWORD_HS_MAP = {
  'battery': '8507', 'cell': '8507', 'lithium': '2836', 'copper': '74', 'steel': '72', 'iron': '72',
  'aluminum': '76', 'aluminium': '76', 'metal': '72', 'bauxite': '2606', 'nickel': '75', 'gold': '71',
  'silver': '71', 'rare earth': '2805', 'silicon': '2804', 'chip': '8541', 'semiconductor': '8541',
  'microprocessor': '8542', 'circuit': '8534', 'display': '8528', 'sensor': '9031', 'software': '8523',
  'server': '8471', 'data center': '8471', 'computer': '8471', 'network': '8517', 'router': '8517',
  'machinery': '84', 'engine': '8407', 'motor': '8501', 'turbine': '8406', 'pump': '8413', 'valve': '8481',
  'plastic': '39', 'polymer': '39', 'rubber': '40', 'glass': '70', 'wood': '44', 'paper': '48',
  'textile': '52', 'fabric': '54', 'cotton': '52', 'chemical': '28', 'organic': '29', 'fuel': '27',
  'oil': '27', 'petroleum': '27', 'gas': '27', 'pharmaceutical': '30', 'medicine': '30', 'drug': '30',
  'packaging': '48', 'vehicles': '87', 'car': '87', 'aircraft': '88', 'ship': '89', 'boat': '89',
  'food': '21', 'beverage': '22', 'agriculture': '10', 'dairy': '04', 'meat': '02', 'grain': '10'
};

function guessHsCode(keyword) {
  const lower = keyword.toLowerCase();
  for (const [key, hs] of Object.entries(KEYWORD_HS_MAP)) {
    if (lower.includes(key)) return hs;
  }
  return '85'; // Default fallback chapter
}

class BomService {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Given a target HS code and its description, returns an array of upstream 
   * HS chapters/headings (2 or 4 digit codes) required to manufacture it.
   * Now dynamically uses the BOM_filter from the new dataset.
   */
  async getStructuredBOM(targetHsCode, targetDescription, companyName = null) {
    const cacheKey = `${companyName || 'generic'}_${String(targetHsCode).substring(0, 2)}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // If a company is provided, try to use its dataset BOM_filter
    if (companyName) {
      const companyGeo = csvService.resolveCompanyGeo(companyName);
      if (companyGeo && companyGeo.bomFilter && companyGeo.bomFilter.length > 0) {
        console.log(`[BOM] Using dataset BOM_filter for ${companyName}`);
        const result = companyGeo.bomFilter.slice(0, 5).map(keyword => {
          return {
            component: keyword.charAt(0).toUpperCase() + keyword.slice(1),
            hs: guessHsCode(keyword),
            keywords: [keyword.toLowerCase()]
          };
        });
        this.cache.set(cacheKey, result);
        return result;
      }
    }

    // Fallback if no company-specific BOM filter is found
    const chapter = String(targetHsCode).substring(0, 2);
    const result = this._fallbackStructuredBom(chapter);
    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Comprehensive static fallback BOM rules when dataset BOM_filter is not available.
   */
  _fallbackStructuredBom(hsChapter) {
    const fallback = {
      // Finished Goods
      '87': [
        { component: "Steel", hs: "72", keywords: ["steel", "metal"] },
        { component: "Aluminum", hs: "76", keywords: ["aluminum", "metal"] },
        { component: "Electronics", hs: "85", keywords: ["electronic", "circuit"] }
      ],
      '88': [
        { component: "Aluminum", hs: "76", keywords: ["aluminum", "metal"] },
        { component: "Titanium", hs: "81", keywords: ["titanium", "metal"] },
        { component: "Electronics", hs: "85", keywords: ["electronic", "avionics"] }
      ],
      // Electronics & Machinery
      '85': [
        { component: "Copper Wire", hs: "74", keywords: ["copper", "wire"] },
        { component: "Plastics", hs: "39", keywords: ["plastic", "polymer"] },
        { component: "Semiconductors", hs: "8541", keywords: ["chip", "silicon"] }
      ],
      '84': [
        { component: "Steel", hs: "72", keywords: ["steel", "iron"] },
        { component: "Aluminum", hs: "76", keywords: ["aluminum", "metal"] },
        { component: "Electronics", hs: "85", keywords: ["electronic", "circuit"] }
      ],
      // Pharmaceuticals & Chemicals
      '30': [
        { component: "Organic Chemicals", hs: "29", keywords: ["organic", "chemical"] },
        { component: "Inorganic Chemicals", hs: "28", keywords: ["inorganic", "chemical"] }
      ],
      // Base Materials
      '72': [
        { component: "Iron Ore", hs: "2601", keywords: ["iron", "ore"] },
        { component: "Coal", hs: "2701", keywords: ["coal", "carbon"] }
      ],
      '73': [
        { component: "Steel", hs: "72", keywords: ["steel", "iron"] }
      ],
      '76': [
        { component: "Bauxite", hs: "2606", keywords: ["bauxite", "ore"] }
      ]
    };
    
    const defaultFallback = [
      { component: "Steel", hs: "72", keywords: ["steel", "iron"] },
      { component: "Electronics", hs: "85", keywords: ["electronic", "circuit"] },
      { component: "Chemicals", hs: "28", keywords: ["chemical"] }
    ];
    
    const terminalChapters = ['27', '26', '25', '01', '02', '03', '10'];
    if (terminalChapters.includes(hsChapter)) {
      return [];
    }

    const result = fallback[hsChapter] || defaultFallback;
    console.log(`[BOM] Using static fallback for HS ${hsChapter}`);
    return result;
  }
}

module.exports = new BomService();
