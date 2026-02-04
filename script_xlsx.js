
const TARGET_KEYWORDS = ['flaaping', 'flapping', 'icmp', 'fibra', 'portdown', 'port down', 'rompimento'];

/* ====== Utils ====== */
const Z = {
  safe: (o,k,d='') => (o && o[k] != null) ? o[k] : d,
  parseDate: (s) => {
    if(!s) return null;
    if(s instanceof Date) return isNaN(s) ? null : s;
    if(typeof s !== 'string') return null;
    const t = s.replace(' ', 'T');
    const d = new Date(t);
    return isNaN(d) ? null : d;
  },
  fmtDT: (d) => {
    if(!d) return '';
    const z=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
  },
  escape: (s) => {
    if(!s || typeof s !== 'string') return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
};

let MATCHES = [];

/* ====== Logic ====== */
function normalizeRecords(records) {
  if (!records || !records.length) return [];
  const isPT = 'Número' in records[0] || 'Descrição resumida' in records[0];

  if (!isPT) return records;

  return records.map(r => {
    return {
      number: r['Número'],
      short_description: r['Descrição resumida'],
      description: (r['Descrição'] || '') + '\n' + (r['IC Impactado'] || ''),
      opened_at: r['Aberto'],
      // We only care about text fields for search
    };
  });
}

function searchKeywords(row) {
  const text = (
    (row.short_description || '') + ' ' +
    (row.description || '') + ' ' +
    (row.close_notes || '') + ' ' +
    (row.work_notes || '')
  ).toLowerCase();

  const found = new Set();
  TARGET_KEYWORDS.forEach(k => {
    if (text.includes(k)) {
      // normalize 'flapping' / 'flaaping'
      if (k.includes('flap')) found.add('Flapping');
      else if (k.includes('port')) found.add('Port Down');
      else if (k.includes('fibra') || k === 'rompimento') found.add('Fibra/Rompimento');
      else if (k === 'icmp') found.add('ICMP');
    }
  });
  return Array.from(found);
}

function processData(json) {
  const records = Array.isArray(json) ? json : (json.records || []);
  const normalized = normalizeRecords(records);

  MATCHES = [];

  normalized.forEach(r => {
    const hits = searchKeywords(r);
    if (hits.length > 0) {
      MATCHES.push({
        number: r.number || '?',
        date: Z.parseDate(r.opened_at),
        hits: hits,
        desc: (r.short_description || '')
      });
    }
  });

  renderTable();
}

function renderTable() {
  const tbody = document.querySelector('#tbl tbody');
  const countEl = document.getElementById('countDisplay');
  const exportBtn = document.getElementById('exportBtn');

  if (MATCHES.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px">Nenhum resultado encontrado para as palavras-chave.</td></tr>';
    countEl.textContent = '(0)';
    exportBtn.style.display = 'none';
    return;
  }

  countEl.textContent = `(${MATCHES.length})`;
  exportBtn.style.display = 'inline-block';

  tbody.innerHTML = MATCHES.map(m => `
    <tr>
      <td class="mono">${Z.escape(m.number)}</td>
      <td class="mono">${Z.fmtDT(m.date)}</td>
      <td>${m.hits.map(h => `<span class="keyword-tag">${h}</span>`).join('')}</td>
      <td>${Z.escape(m.desc)}</td>
    </tr>
  `).join('');
}

/* ====== File Handling ====== */
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('file');

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('dragover'); });
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if(e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => {
  if(fileInput.files.length) handleFile(fileInput.files[0]);
});

async function handleFile(file) {
  dropZone.textContent = `Carregando ${file.name}...`;
  try {
    let json;
    if (file.name.toLowerCase().endsWith('.xlsx')) {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const firstSheet = workbook.SheetNames[0];
      json = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { cellDates: true, defval: '' });
    } else {
      alert('Por favor, apenas arquivos .xlsx');
      dropZone.textContent = 'Formato inválido (use XLSX).';
      return;
    }
    processData(json);
    dropZone.innerHTML = `Arquivo <b>${Z.escape(file.name)}</b> analisado!`;
  } catch (e) {
    console.error(e);
    alert('Erro ao processar arquivo.');
    dropZone.textContent = 'Erro ao carregar.';
  }
}

/* ====== Export ====== */
document.getElementById('exportBtn').addEventListener('click', () => {
  const lines = ['Incidente;Data;Tags;Descricao'];
  MATCHES.forEach(m => {
    lines.push(`"${m.number}";"${Z.fmtDT(m.date)}";"${m.hits.join(',')}";"${(m.desc||'').replace(/"/g,'""')}"`);
  });
  const blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'analise_keywords.csv';
  document.body.appendChild(a); a.click(); a.remove();
});
