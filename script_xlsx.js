
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

/* ====== Logic Helpers (Classification) ====== */
function extractAirInterface(text){
  if(!text || typeof text !== 'string') return null;
  const m = text.match(/Air Interface\s+(\d+)/i);
  return m ? m[1] : null;
}

function classifyAlarm(sd, desc){
  const t = ((sd||'')+' '+(desc||'')).toLowerCase();
  if(t.includes('rx potency') || t.includes('air interface')){
    const ai = extractAirInterface(sd+' '+desc);
    return ai ? `RX Potency < -60 (AI ${ai})` : 'RX Potency < -60';
  }
  if(t.includes('unavailable by icmp') || (t.includes('icmp') && t.includes('timeout'))) return 'Indisponibilidade ICMP';
  if(t.includes('snmp')) return 'SNMP não responde';
  if(t.includes('transport')) return 'Falha camada de transporte';
  if(t.includes('port') && t.includes('down')) return 'Porta/Interface Down';
  if(t.includes('energia') || t.includes('concession') || t.includes('aliment')) return 'Energia/Alimentação';
  return 'Outro';
}

function classifyResolution(closeNotes){
  const t = (closeNotes||'').toLowerCase();
  if(t.includes('desbloque')) return 'Desbloqueio (TX/Canal)';
  if(t.includes('reset')) return 'Reset remoto';
  if(t.includes('relig') || t.includes('restabelec') || t.includes('energia')) return 'Restabelecimento de energia';
  if(t.includes('sem interv') || t.includes('normaliz')) return 'Normalizado/sem intervenção';
  if(t.includes('repar')) return 'Reparo';
  if(t.includes('reconfig') || (t.includes('config') && t.includes('tx'))) return 'Ajuste/Configuração';
  return 'Outro';
}

let MATCHES = [];

/* ====== Analysis Logic ====== */

function analyzeSmartPatterns(rows){
  const insights = [];
  // Sort by time
  const sorted = rows.slice().sort((a,b) => (a.eventTime||0) - (b.eventTime||0));

  // 1. Mass Event Detection
  if(sorted.length > 5){
    const windowMs = 15 * 60 * 1000;
    let i=0;
    while(i < sorted.length){
      const start = sorted[i].eventTime;
      if(!start) { i++; continue; }
      const assetsInWindow = new Set();
      let j=i;
      while(j < sorted.length && (sorted[j].eventTime - start) < windowMs){
        if(sorted[j].asset && sorted[j].asset !== 'Desconhecido') assetsInWindow.add(sorted[j].asset);
        j++;
      }
      if(assetsInWindow.size >= 4){
         insights.push({
           type: 'mass',
           level: 'critical',
           html: `<b>Evento Massivo Detectado:</b> ${assetsInWindow.size} ativos distintos falharam entre ${Z.fmtDT(start)} e ${Z.fmtDT(sorted[j-1].eventTime)}. Possível falha de switch core, fibra rompida ou queda de energia na região.`
         });
         i = j;
      } else {
        i++;
      }
    }
  }

  // Group by Asset
  const byAsset = new Map();
  rows.forEach(r => {
    if(!r.asset || r.asset === 'Desconhecido') return;
    if(!byAsset.has(r.asset)) byAsset.set(r.asset, []);
    byAsset.get(r.asset).push(r);
  });

  byAsset.forEach((events, asset) => {
    events.sort((a,b) => (a.eventTime||0) - (b.eventTime||0));

    // 2. Chronic
    if(events.length >= 3){
      const first = events[0].eventTime;
      const last = events[events.length-1].eventTime;
      if(first && last && (last - first) > 48*3600*1000){
        insights.push({
           type: 'chronic',
           level: 'high',
           html: `<b>Falha Crônica:</b> O ativo <b>${Z.escape(asset)}</b> apresenta falhas recorrentes há mais de 2 dias (${events.length} eventos).`
        });
      }
    }

    // 3. Flapping
    for(let i=0; i < events.length - 3; i++){
      const t1 = events[i].eventTime;
      const t4 = events[i+3].eventTime;
      if(t1 && t4 && (t4 - t1) < 60*60*1000) {
        insights.push({
          type: 'flapping',
          level: 'critical',
          html: `<b>Instabilidade/Flapping:</b> O ativo <b>${Z.escape(asset)}</b> oscilou 4+ vezes em < 1h.`
        });
        break;
      }
    }

    // 4. Ineffective Repair
    for(let i=0; i < events.length - 1; i++){
      const curr = events[i];
      const next = events[i+1];
      if(curr.eventTime && next.eventTime && curr.action !== 'Outro') {
        const diffH = (next.eventTime - curr.eventTime) / (3600*1000);
        if(diffH < 24 && diffH > 0.05 && curr.alarm === next.alarm){
           insights.push({
            type: 'ineffective',
            level: 'medium',
            html: `<b>Reparo Inefetivo:</b> O ativo <b>${Z.escape(asset)}</b> falhou novamente (${curr.alarm}) apenas ${diffH.toFixed(1)}h após a ação "${curr.action}".`
          });
          break;
        }
      }
    }
  });

  const score = (x) => {
    if(x.type === 'mass') return 100;
    if(x.type === 'flapping') return 80;
    if(x.type === 'chronic') return 60;
    return 10;
  };
  return insights.sort((a,b) => score(b) - score(a)).slice(0, 10).map(x=>x.html);
}

function analyzeAssetRecurrence(rows){
  const m=new Map();
  rows.forEach(r=>{
    if(r.asset && r.asset!=='Desconhecido') m.set(r.asset,(m.get(r.asset)||0)+1);
  });
  return [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 10);
}


/* ====== Processing ====== */

function normalizeRecords(records) {
  if (!records || !records.length) return [];
  const isPT = 'Número' in records[0] || 'Descrição resumida' in records[0];

  if (!isPT) return records;

  return records.map(r => {
    const desc = (r['Descrição'] || '') + '\n' + (r['IC Impactado'] || '');
    const short = r['Descrição resumida'] || '';
    const open = Z.parseDate(r['Aberto']);
    const closeNotes = ''; // Not usually in short exports, but assume empty

    return {
      number: r['Número'],
      short_description: short,
      description: desc,
      opened_at: r['Aberto'], // Raw string
      eventTime: open, // Date obj
      asset: r['IC Impactado'] || 'Desconhecido',
      alarm: classifyAlarm(short, desc),
      action: classifyResolution(closeNotes),
      close_notes: closeNotes,
      work_notes: ''
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

  // 1. Keyword Matches
  MATCHES = [];
  normalized.forEach(r => {
    const hits = searchKeywords(r);
    if (hits.length > 0) {
      MATCHES.push({
        number: r.number || '?',
        date: r.eventTime,
        hits: hits,
        desc: (r.short_description || '')
      });
    }
  });

  // 2. Smart Insights
  const suggestions = analyzeSmartPatterns(normalized);
  const smartEl = document.getElementById('smartList');
  if(!suggestions.length) smartEl.innerHTML = '<span class="muted">Nenhum insight detectado.</span>';
  else smartEl.innerHTML = suggestions.map(s=>`<div class="callout" style="border-left-color:var(--warn);background:rgba(240,179,35,.1)">${s}</div>`).join('');

  // 3. Recurrence
  const rec = analyzeAssetRecurrence(normalized).slice(0, 5);
  const tRec = document.querySelector('#tblRec tbody');
  tRec.innerHTML = rec.map(([asset, count])=>`
    <tr>
      <td>${Z.escape(asset)}</td>
      <td style="text-align:center">${count}</td>
    </tr>`).join('');

  // 4. Repeatability (Simplistic: Top 5 Recent)
  const sorted = normalized.slice().sort((a,b)=>(b.eventTime||0)-(a.eventTime||0)).slice(0,5);
  const tRep = document.querySelector('#tblRep tbody');
  tRep.innerHTML = sorted.map(r=>`
    <tr>
      <td>${Z.escape(r.asset)}</td>
      <td>${Z.escape(r.alarm)}</td>
      <td>${Z.escape(r.action)}</td>
    </tr>`).join('');

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
