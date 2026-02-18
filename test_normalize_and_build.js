const fs = require('fs');
const scriptContent = fs.readFileSync('script.js', 'utf8');

// Mock DOM/Browser globals to prevent crash during eval
const window = {
    addEventListener: () => {},
    jspdf: { jsPDF: () => ({ internal: { pageSize: { getWidth: ()=>0, getHeight: ()=>0 } }, addImage: ()=>{}, save: ()=>{} }) }
};
const document = {
    getElementById: () => ({
        getContext: () => {},
        addEventListener: () => {},
        style: {},
        classList: { add: ()=>{}, remove: ()=>{} },
        value: '',
        checked: false,
        textContent: ''
    }),
    querySelector: () => ({ innerHTML: '', appendChild: ()=>{} }),
    createElement: () => ({ innerHTML: '', appendChild: ()=>{} }),
    body: { appendChild: ()=>{} }
};
const Chart = { defaults: { color: '' } };
const XLSX = { utils: { sheet_to_json: () => [] } };
const alert = console.log;
const html2canvas = async () => ({ toDataURL: () => '' });
const location = { reload: () => {} };

// Eval the script
eval(scriptContent);

const records = [
  {
    "Número": "INC_NET",
    "Aberto": "2026-01-01 10:00",
    "Descrição resumida": "Network Issue",
    "Descrição": "...",
    "category": "Network"
  },
  {
    "Número": "INC_OTHER",
    "Aberto": "2026-01-01 11:00",
    "Descrição resumida": "Server Issue",
    "Descrição": "...",
    "category": "Software"
  },
  {
    "Número": "INC_EMPTY",
    "Aberto": "2026-01-01 12:00",
    "Descrição resumida": "Unknown Issue",
    "Descrição": "..."
  }
];

// Note: normalizeRecords logic for standard JSON (not PT) just returns records.
// But my mock data has Portuguese keys ("Número"), so normalizeRecords WILL process it.
// Does normalizeRecords map 'category'?
// Let's check.

const norm = normalizeRecords(records);
console.log("Normalized:", JSON.stringify(norm, null, 2));

const built = buildRows(norm);
console.log("Built:", JSON.stringify(built, null, 2));
