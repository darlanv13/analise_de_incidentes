const records = [
  {
    number: "INC_NET",
    short_description: "Network Issue",
    category: "Network"
  },
  {
    number: "INC_OTHER",
    short_description: "Server Issue",
    category: "Software"
  },
  {
    number: "INC_EMPTY",
    short_description: "Unknown Issue"
  }
];

// Mock basic environment for buildRows
const Z = {
  safe: (o,k,d='') => (o && o[k] != null) ? o[k] : d,
  parseDate: (s) => null,
};
const PRIORITY_KEYWORDS = [];
function detectPriorityTags(){ return []; }
function classifyRegion(){ return 'OUTROS'; }
function extractFailureTime(){ return null; }
function extractResolvedInSec(){ return null; }
function parseSimpleDuration(){ return null; }
function classifyAlarm(){ return 'Outro'; }
function classifyResolution(){ return 'Outro'; }
function extractZabbixLink(){ return null; }
function extractProblemId(){ return null; }
function extractAsset(){ return 'Desconhecido'; }
function parseCloseNotesFields(){ return {}; }

function buildRows(records){
  return records.map(r=>{
    // Minimal mapping for test
    const sd = Z.safe(r,'short_description','');
    return {
      number: Z.safe(r,'number',''),
      category: Z.safe(r,'category',''),
      short: sd
    };
  }).filter(x => {
    // Exclude OT
    if(!x.number) return false;
    const s = (x.short || '');
    if(/\bOT\s*[|]?\b/i.test(s)) return false;

    // Filter by Category
    if(x.category && x.category !== 'Network') return false;

    return true;
  });
}

const result = buildRows(records);
console.log(JSON.stringify(result, null, 2));
