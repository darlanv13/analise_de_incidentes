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
  compact: (s,n=220) => {
    if(!s || typeof s !== 'string') return '';
    s = s.replace(/\s+/g,' ').trim();
    return s.length>n ? s.slice(0,n)+'…' : s;
  },
  fmtDur: (sec) => {
    if(sec == null || !isFinite(sec)) return '';
    sec = Math.max(0, sec);
    const d = Math.floor(sec/86400); sec%=86400;
    const h = Math.floor(sec/3600); sec%=3600;
    const m = Math.floor(sec/60);
    if(d>0) return `${d}d ${h}h ${m}m`;
    return `${h}h ${m}m`;
  },
  mean: (a) => { a=a.filter(x=>isFinite(x)); return a.length ? a.reduce((s,x)=>s+x,0)/a.length : NaN; },
  escape: (s) => {
    if(!s || typeof s !== 'string') return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  },
  lev: (a, b) => {
    if(a.length===0) return b.length;
    if(b.length===0) return a.length;
    const matrix = [];
    for(let i=0; i<=b.length; i++) matrix[i] = [i];
    for(let j=0; j<=a.length; j++) matrix[0][j] = j;
    for(let i=1; i<=b.length; i++){
      for(let j=1; j<=a.length; j++){
        if(b.charAt(i-1)===a.charAt(j-1)) matrix[i][j] = matrix[i-1][j-1];
        else matrix[i][j] = Math.min(matrix[i-1][j-1]+1, matrix[i][j-1]+1, matrix[i-1][j]+1);
      }
    }
    return matrix[b.length][a.length];
  },
  quantile: (a,q) => {
    a=a.filter(x=>isFinite(x)).slice().sort((x,y)=>x-y);
    if(!a.length) return NaN;
    const pos=(a.length-1)*q;
    const base=Math.floor(pos);
    const rest=pos-base;
    return a[base+1]!==undefined ? a[base]+rest*(a[base+1]-a[base]) : a[base];
  }
};

/* ====== Extractors ====== */
function extractFailureTime(text){
  if(!text || typeof text !== 'string') return null;
  const m = text.match(/Failure Time:\s*(\d{4})[\./-](\d{2})[\./-](\d{2})\s*(\d{2}):(\d{2}):(\d{2})/i);
  if(!m) return null;
  const [_,y,mo,d,hh,mm,ss]=m;
  return new Date(`${y}-${mo}-${d}T${hh}:${mm}:${ss}`);
}
function extractResolvedInSec(text){
  // "Problem has been resolved in 3d 4h 39m 59s" or "6h 50m 0s" etc.
  if(!text || typeof text !== 'string') return null;
  const m = text.match(/Problem has been resolved in\s+((?:\d+d\s*)?(?:\d+h\s*)?(?:\d+m\s*)?(?:\d+s)?)/i);
  if(!m) return null;
  const chunk = m[1];
  let sec=0;
  const md = chunk.match(/(\d+)d/); if(md) sec += parseInt(md[1])*86400;
  const mh = chunk.match(/(\d+)h/); if(mh) sec += parseInt(mh[1])*3600;
  const mm = chunk.match(/(\d+)m/); if(mm) sec += parseInt(mm[1])*60;
  const ms = chunk.match(/(\d+)s/); if(ms) sec += parseInt(ms[1]);
  return sec || null;
}
function extractZabbixLink(text){
  if(!text || typeof text !== 'string') return null;
  const m = text.match(/https?:\/\/[^\s]+tr_events\.php\?triggerid=(\d+)&eventid=(\d+)/i);
  if(!m) return null;
  return {triggerid:m[1], eventid:m[2], url:m[0]};
}
function extractProblemId(text){
  if(!text || typeof text !== 'string') return null;
  const m = text.match(/Zabbix Problem ID:\s*(\d+)/i);
  return m ? m[1] : null;
}
function extractAirInterface(text){
  if(!text || typeof text !== 'string') return null;
  const m = text.match(/Air Interface\s+(\d+)/i);
  return m ? m[1] : null;
}
function extractAsset(text){
  if(!text || typeof text !== 'string') return null;
  // Matches "Equipment: XXX" or "[N2 TASK] XXX :" or similar patterns
  let m = text.match(/Equipment:\s*([^\s]+)/i);
  if(m) return m[1];
  m = text.match(/\[N2 TASK\]\s*([^:\s]+)/i);
  if(m) return m[1];
  m = text.match(/Configuration Item:\s*([^\s]+)/i);
  if(m) return m[1];
  return null;
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
function parseCloseNotesFields(notes){
  const out = {};
  if(!notes || typeof notes !== 'string') return out;
  const t = notes.replace(/\r/g,'');
  const keys = ['Tipo de Atendimento','Sistema afetado','Conjunto afetado','Item afetado','Problema','Solução','Informações adicionais','Há melhoria associada'];
  keys.forEach(k=>{
    const m = t.match(new RegExp(k+':\\s*(.*)','i'));
    if(m) out[k] = m[1].trim();
  });
  return out;
}

/* ====== Chart.js Instances ====== */
const CHARTS = {};

Chart.defaults.color = '#9fb3c8';
Chart.defaults.borderColor = 'rgba(255,255,255,0.1)';

function destroyChart(id){
  if(CHARTS[id]){ CHARTS[id].destroy(); delete CHARTS[id]; }
}

function createChart(id, type, data, options){
  destroyChart(id);
  const ctx = document.getElementById(id).getContext('2d');
  CHARTS[id] = new Chart(ctx, { type, data, options });
}

/* ====== Helper to build Matrix Data ====== */
function buildMatrixData(matrix, rowLabels, colLabels){
  const data = [];
  matrix.forEach((row, r)=>{
    row.forEach((v, c)=>{
      if(v > 0) data.push({x: c, y: r, v: v});
    });
  });
  return data;
}

/* ====== State ====== */
let RAW = [];       // tickets raw rows
let VIEW = [];      // after dedup and filters
let FILTER = { q:'', alarm:'', action:'', start:'', end:'', asset:'', region:'', matrix:null, priorityOnly:false };
let CLUSTER_MAP = new Map(); // original -> leader
let MODE_DEDUP = true;

/* ====== Priority Keywords ====== */
const PRIORITY_KEYWORDS = [
  // Short Description triggers
  { term: 'flaaping', label: 'Flapping', source: 'short' },
  { term: 'flapping', label: 'Flapping', source: 'short' },
  { term: 'portpown', label: 'Port Down', source: 'short' },
  { term: 'port down', label: 'Port Down', source: 'short' },
  { term: 'portdown', label: 'Port Down', source: 'short' },
  { term: 'wkve',     label: 'WKVE',      source: 'short' },
  { term: 'vivo',     label: 'Vivo',      source: 'short' },
  { term: 'it |',     label: 'IT',        source: 'short' },
  { term: 'it|',      label: 'IT',        source: 'short' },

  // Work Notes triggers (will check closeNotes or raw work_notes if added)
  { term: 'fibra optica', label: 'Fibra Óptica', source: 'notes' },
  { term: 'fibra ótica',  label: 'Fibra Óptica', source: 'notes' },
  { term: 'vivo',         label: 'Vivo',         source: 'notes' },
  { term: 'wkve',         label: 'WKVE',         source: 'notes' },
  { term: 'operadora',    label: 'Operadora',    source: 'notes' },
  { term: 'rompimento',   label: 'Rompimento',   source: 'notes' },
  { term: 'flaaping',     label: 'Flapping',     source: 'notes' },
  { term: 'icmp',         label: 'ICMP',         source: 'notes' },
  { term: 'portdown',     label: 'Port Down',    source: 'notes' },
  { term: 'port down',    label: 'Port Down',    source: 'notes' }
];

function detectPriorityTags(short, notes){
  const found = new Set();
  const sText = (short||'').toLowerCase();
  const nText = (notes||'').toLowerCase();

  PRIORITY_KEYWORDS.forEach(pk => {
    if(pk.source === 'short' && sText.includes(pk.term)) found.add(pk.label);
    if(pk.source === 'notes' && nText.includes(pk.term)) found.add(pk.label);
  });
  return Array.from(found).sort();
}

function classifyRegion(text) {
  if (!text) return 'OUTROS';
  const t = text.toUpperCase();
  const northKeywords = ['CARAJAS', 'SOSSEGO', 'CURIONOPOLIS', 'PARAUAPEBAS', 'SERRA LESTE'];
  if (northKeywords.some(k => t.includes(k))) return 'NORTE';
  return 'OUTROS';
}

/* ====== Build rows ====== */
function buildRows(records){
  return records.map(r=>{
    const sd = Z.safe(r,'short_description','');
    const desc = Z.safe(r,'description','');
    const ttn = Z.safe(r,'u_vale_slm_ttn_notes','');
    const tte = Z.safe(r,'u_vale_slm_tte_notes','');
    const closeNotes = Z.safe(r,'close_notes','');
    const workNotes = Z.safe(r,'work_notes',''); // Used for analysis

    const opened = Z.parseDate(Z.safe(r,'opened_at',''));
    const workStart = Z.parseDate(Z.safe(r,'work_start',''));
    const workEnd = Z.parseDate(Z.safe(r,'work_end',''));
    const resolved = Z.parseDate(Z.safe(r,'resolved_at',''));
    const closed = Z.parseDate(Z.safe(r,'closed_at',''));

    const ft = extractFailureTime(desc) || extractFailureTime(sd) || extractFailureTime(ttn) || extractFailureTime(tte);
    const eventTime = ft || opened || workStart || closed || null;

    // MTTR seconds: prefer Zabbix resolved-in
    const zSec = extractResolvedInSec(ttn) || extractResolvedInSec(tte) || extractResolvedInSec(desc);
    let mttrSec = zSec;
    if(mttrSec == null){
      if(workStart && workEnd) mttrSec = Math.round((workEnd-workStart)/1000);
      else if(opened && resolved) mttrSec = Math.round((resolved-opened)/1000);
      else if(opened && closed) mttrSec = Math.round((closed-opened)/1000);
    }

    const alarm = classifyAlarm(sd, desc);
    const action = classifyResolution(closeNotes);
    const link = extractZabbixLink(desc) || extractZabbixLink(ttn) || extractZabbixLink(tte);
    const zpid = extractProblemId(desc) || extractProblemId(ttn) || extractProblemId(tte);
    const asset = extractAsset(sd) || extractAsset(desc) || extractAsset(ttn) || extractAsset(tte) || 'Desconhecido';

    const fields = parseCloseNotesFields(closeNotes);
    const problema = fields['Problema'] || '';
    const solucao = fields['Solução'] || '';

    // Tag detection
    // Combine work_notes + close_notes for the 'notes' check
    const tags = detectPriorityTags(sd, workNotes + ' ' + closeNotes);

    // Region Classification
    const region = classifyRegion(sd);

    return {
      number: Z.safe(r,'number',''),
      asset,
      eventTime,
      month: eventTime ? `${eventTime.getFullYear()}-${String(eventTime.getMonth()+1).padStart(2,'0')}` : '',
      alarm,
      action,
      mttrSec: (mttrSec!=null && isFinite(mttrSec)) ? Math.max(0, mttrSec) : null,
      impact: Z.safe(r,'impact',''),
      urgency: Z.safe(r,'urgency',''),
      madeSla: String(Z.safe(r,'made_sla','')).toLowerCase()==='true',
      closeNotes,
      short: sd,
      zabbix: link,
      zabbix_problem_id: zpid,
      problema,
      solucao,
      tags,
      region
    };
  }).filter(x => {
    // Exclude OT | or OT
    if(!x.number) return false;
    const s = (x.short || '');
    if(/\bOT\s*[|]?\b/i.test(s)) return false;
    return true;
  });
}

function deduplicate(rows){
  // Group by zabbix_problem_id if present; else by triggerid; else by (asset + alarm + month + near time window)
  const groups = new Map();
  const sorted = rows.slice().sort((a,b)=>(a.eventTime||0)-(b.eventTime||0));
  sorted.forEach(r=>{
    const zpid = r.zabbix_problem_id;
    const trig = r.zabbix?.triggerid;
    let key = zpid ? `zpid:${zpid}` : (trig ? `tr:${trig}:${r.alarm}` : null);
    if(!key){
      const t = r.eventTime ? Math.floor(r.eventTime.getTime()/ (30*60*1000)) : 0;
      key = `win:${t}:${r.alarm}:${r.asset}`;
    }
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  });

  // Representative: earliest eventTime, longest mttr, concatenate notes, keep list of tickets
  const out=[];
  for(const [key, arr] of groups.entries()){
    arr.sort((a,b)=>(a.eventTime||0)-(b.eventTime||0));
    const rep = {...arr[0]};
    rep._tickets = arr.map(x=>x.number);
    rep._count = arr.length;
    // mttr: choose max available
    const mttrs = arr.map(x=>x.mttrSec).filter(x=>x!=null);
    rep.mttrSec = mttrs.length ? Math.max(...mttrs) : rep.mttrSec;
    // merge notes sample
    rep.closeNotes = arr.map(x=>x.closeNotes).filter(Boolean).slice(0,3).join(' | ');

    // Merge tags
    const allTags = new Set();
    arr.forEach(a => a.tags.forEach(t => allTags.add(t)));
    rep.tags = Array.from(allTags).sort();

    out.push(rep);
  }
  return out;
}

/* ====== Aggregations ====== */
function uniq(arr){ return [...new Set(arr.filter(Boolean))].sort(); }

function countsBy(rows, field){
  const m=new Map();
  rows.forEach(r=>{ const k=r[field]||'Outro'; m.set(k,(m.get(k)||0)+1); });
  return [...m.entries()].sort((a,b)=>b[1]-a[1]);
}

function monthCounts(rows){
  const m=new Map();
  rows.forEach(r=>{ if(!r.month) return; m.set(r.month,(m.get(r.month)||0)+1); });
  const labels=[...m.keys()].sort();
  return {labels, values: labels.map(k=>m.get(k))};
}

function durationHistogram(rows){
  const hours = rows.map(r=>r.mttrSec!=null ? r.mttrSec/3600 : null).filter(x=>x!=null && isFinite(x));
  if(!hours.length) return {labels:[], values:[]};
  const maxH = Math.max(...hours);
  const bins = 12;
  const step = Math.max(1, Math.ceil(maxH/bins));
  const counts = Array.from({length:bins},()=>0);
  hours.forEach(h=>{ const idx = Math.min(bins-1, Math.floor(h/step)); counts[idx]++; });
  const labels = Array.from({length:bins},(_,i)=>`${i*step}-${(i+1)*step}h`);
  return {labels, values:counts};
}

function computeMTBF(rows){
  const ts = rows.filter(r=>r.eventTime).map(r=>r.eventTime.getTime()).sort((a,b)=>a-b);
  if(ts.length<2) return NaN;
  // MTBF = (Total Time Range) / (Count - 1)
  const rangeMs = ts[ts.length-1] - ts[0];
  return (rangeMs / (3600*1000)) / Math.max(1, ts.length-1);
}

function computeAvailability(rows){
  // 1. Calculate Union of Downtime Intervals
  const intervals = rows
    .filter(r=>r.eventTime && r.mttrSec>0)
    .map(r=> ({ start: r.eventTime.getTime(), end: r.eventTime.getTime() + r.mttrSec*1000 }))
    .sort((a,b)=>a.start-b.start);

  if(!intervals.length) return 100;

  let merged = [];
  let curr = intervals[0];

  for(let i=1; i<intervals.length; i++){
    const next = intervals[i];
    if(next.start < curr.end){
      // overlap, extend current end if needed
      curr.end = Math.max(curr.end, next.end);
    } else {
      merged.push(curr);
      curr = next;
    }
  }
  merged.push(curr);

  const totalDownMs = merged.reduce((sum, iv)=> sum + (iv.end - iv.start), 0);

  // 2. Calculate Total Time Range
  const times = rows.filter(r=>r.eventTime).map(r=>r.eventTime.getTime());
  if(!times.length) return 100;
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  // Extend range to cover the last downtime
  const rangeEnd = Math.max(maxT, merged.length ? merged[merged.length-1].end : maxT);
  const totalRangeMs = Math.max(rangeEnd - minT, 1);

  // 3. Availability
  const avail = 1 - (totalDownMs / totalRangeMs);
  return Math.max(0, Math.min(100, avail * 100));
}

function buildMatrix(rows){
  // top 6 problemas x top 6 soluções
  const pCounts = countsBy(rows,'problema').filter(([k])=>k).slice(0,6);
  const sCounts = countsBy(rows,'solucao').filter(([k])=>k).slice(0,6);
  const p = pCounts.map(x=>x[0]||'(vazio)');
  const s = sCounts.map(x=>x[0]||'(vazio)');
  const mat = p.map(()=> s.map(()=>0));
  const idxP=new Map(p.map((x,i)=>[x,i]));
  const idxS=new Map(s.map((x,i)=>[x,i]));
  rows.forEach(r=>{
    if(!r.problema || !r.solucao) return;
    if(!idxP.has(r.problema) || !idxS.has(r.solucao)) return;
    mat[idxP.get(r.problema)][idxS.get(r.solucao)] += 1;
  });
  return {p, s, mat};
}

function analyzeAssetRecurrence(rows){
  const counts = countsBy(rows, 'asset').filter(x=>x[0]!=='Desconhecido');
  return counts.slice(0, 10); // Top 10
}

function computeClusters(rows){
  const alarms = uniq(rows.map(r=>r.alarm));
  const map = new Map();
  const leaders = [];

  alarms.forEach(a=>{
    // Try to find a close leader
    let bestL = null;
    let minD = Infinity;
    // Simple heuristic: must share start char? No.
    // Length diff check
    for(const l of leaders){
      if(Math.abs(a.length - l.length) > 5) continue;
      const dist = Z.lev(a, l);
      const limit = Math.max(a.length, l.length) * 0.20; // 20% diff allowed
      if(dist <= limit && dist < minD){
        minD = dist;
        bestL = l;
      }
    }
    if(bestL){
      map.set(a, bestL);
    } else {
      leaders.push(a);
      map.set(a, a);
    }
  });
  return map;
}

function analyzeHeatmap(rows){
  // 7 rows (Dom-Sat), 24 cols (0-23)
  const mat = Array.from({length:7}, ()=>Array(24).fill(0));
  rows.forEach(r=>{
    if(!r.eventTime) return;
    const d = r.eventTime.getDay();
    const h = r.eventTime.getHours();
    mat[d][h]++;
  });
  return mat;
}

function analyzeSmartPatterns(rows){
  const insights = [];

  // Sort rows by time
  const sorted = rows.slice().sort((a,b) => (a.eventTime||0) - (b.eventTime||0));

  // 1. Mass Event Detection (Global)
  // Logic: > 3 distinct assets failing within a 10 min sliding window
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
         // Found a mass event
         insights.push({
           type: 'mass',
           level: 'critical',
           html: `<b>Evento Massivo Detectado:</b> ${assetsInWindow.size} ativos distintos falharam entre ${Z.fmtDT(start)} e ${Z.fmtDT(sorted[j-1].eventTime)}. Possível falha de switch core, fibra rompida ou queda de energia na região.`
         });
         i = j; // Skip this window to avoid duplicates
      } else {
        i++;
      }
    }
  }

  // Group by Asset for other checks
  const byAsset = new Map();
  rows.forEach(r => {
    if(!r.asset || r.asset === 'Desconhecido') return;
    if(!byAsset.has(r.asset)) byAsset.set(r.asset, []);
    byAsset.get(r.asset).push(r);
  });

  byAsset.forEach((events, asset) => {
    events.sort((a,b) => (a.eventTime||0) - (b.eventTime||0));

    // 2. Chronic (Long-term Recurrence)
    // Logic: Incidents span > 48h AND count >= 3
    if(events.length >= 3){
      const first = events[0].eventTime;
      const last = events[events.length-1].eventTime;
      if(first && last && (last - first) > 48*3600*1000){
        insights.push({
           type: 'chronic',
           level: 'high',
           html: `<b>Falha Crônica:</b> O ativo <b>${Z.escape(asset)}</b> apresenta falhas recorrentes há mais de 2 dias (${events.length} eventos). Isso indica degradação progressiva ou reparo ineficaz.`
        });
      }
    }

    // 3. Flapping (Short-term Instability)
    // Logic: > 4 events in 1h
    let flapCount = 0;
    for(let i=0; i < events.length - 3; i++){
      const t1 = events[i].eventTime;
      const t4 = events[i+3].eventTime; // 4th event
      if(t1 && t4 && (t4 - t1) < 60*60*1000) {
        insights.push({
          type: 'flapping',
          level: 'critical',
          html: `<b>Instabilidade/Flapping:</b> O ativo <b>${Z.escape(asset)}</b> oscilou 4+ vezes em < 1h (${Z.fmtDT(t1)}). Verifique loops L2, erros de porta ou energia intermitente.`
        });
        flapCount++;
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
            html: `<b>Reparo Inefetivo:</b> O ativo <b>${Z.escape(asset)}</b> falhou novamente (${curr.alarm}) apenas ${diffH.toFixed(1)}h após a ação "${curr.action}". Necessário escalonamento.`
          });
          break;
        }
      }
    }

    // 5. Specific Keywords (Vivo, Fibra, CRC)
    const fullText = events.map(e => (e.short+' '+e.closeNotes).toLowerCase()).join(' ');
    if(fullText.includes('crc') || fullText.includes('fcs error')){
       insights.push({type:'physical', level:'medium', html:`<b>Erros Físicos:</b> O ativo <b>${Z.escape(asset)}</b> apresenta erros de CRC/FCS. Verifique cabeamento, conectores e módulos SFP.`});
    }
    if(fullText.includes('high temperature') || fullText.includes('temperatura alta')){
       insights.push({type:'env', level:'medium', html:`<b>Temperatura Alta:</b> O ativo <b>${Z.escape(asset)}</b> reportou superaquecimento. Verifique ar-condicionado e ventoinhas.`});
    }
  });

  // Sort by severity
  const score = (x) => {
    if(x.type === 'mass') return 100;
    if(x.type === 'flapping') return 80;
    if(x.type === 'chronic') return 60;
    return 10;
  };

  return insights.sort((a,b) => score(b) - score(a)).slice(0, 10).map(x=>x.html);
}

/* ====== FMDS Report Logic ====== */
function classifyAsset(name){
  if(!name) return {site:'Outros', cat:'Outros'};
  name = name.toUpperCase();

  let site = 'Outros';
  if(name.startsWith('BRCKS')) site = 'Carajás';
  else if(name.startsWith('BRBEL')) site = 'Belém';
  else if(name.startsWith('BRMAB')) site = 'Marabá';
  else if(name.startsWith('BRPR')) site = 'Parauapebas';
  else if(name.startsWith('BRSL')) site = 'São Luís';
  else if(name.startsWith('BR')) site = 'Regional ' + name.substr(2,3);

  let cat = 'Outros';
  if(name.includes('SW') || name.includes('SWITCH')) cat = 'Switch';
  else if(name.includes('RT') || name.includes('ROUTER')) cat = 'Router';
  else if(name.includes('AP') || name.includes('WIFI') || name.includes('AIR')) cat = 'Access Point';
  else if(name.includes('MW') || name.includes('RADIO') || name.includes('LINK')) cat = 'Radio/Link';
  else if(name.includes('OLT')) cat = 'OLT';
  else if(name.includes('SRV') || name.includes('SERVER')) cat = 'Server';

  return {site, cat};
}

function getDailyTrend(rows){
  const days = Array.from({length:31}, (_,i)=>i+1);
  const counts = new Array(31).fill(0);
  rows.forEach(r=>{
    if(r.eventTime) counts[r.eventTime.getDate()-1]++;
  });
  return {labels: days, values: counts};
}

function getSiteCounts(rows){
  const m = new Map();
  rows.forEach(r=>{
    const {site} = classifyAsset(r.asset);
    m.set(site, (m.get(site)||0)+1);
  });
  const sorted = [...m.entries()].sort((a,b)=>b[1]-a[1]);
  return {labels: sorted.map(x=>x[0]), values: sorted.map(x=>x[1])};
}

function getCategoryCounts(rows){
  const m = new Map();
  rows.forEach(r=>{
    const {cat} = classifyAsset(r.asset);
    m.set(cat, (m.get(cat)||0)+1);
  });
  const sorted = [...m.entries()].sort((a,b)=>b[1]-a[1]);
  return {labels: sorted.map(x=>x[0]), values: sorted.map(x=>x[1])};
}

function renderFMDS(rows){
  // 1. Header
  const first = rows.filter(r=>r.eventTime).sort((a,b)=>a.eventTime-b.eventTime)[0]?.eventTime;
  if(first){
    const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    document.getElementById('fmdsDate').textContent = `${months[first.getMonth()]} – ${first.getFullYear().toString().substr(2)}`;
  }

  // 2. Trend Chart
  const trend = getDailyTrend(rows);
  createChart('cFmdsTrend', 'line', {
    labels: trend.labels,
    datasets: [{
      label: 'Incidentes',
      data: trend.values,
      borderColor: '#007E7A',
      backgroundColor: 'rgba(0,126,122,0.1)',
      tension: 0.4, fill: true, pointRadius: 2
    }]
  }, {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: {display: false} },
    scales: { x: {grid:{display:false}}, y: {beginAtZero:true} }
  });

  // 3. KPIs
  const total = rows.length;
  const open = rows.filter(r=> !r.mttrSec ).length; // If no MTTR, likely open or ongoing
  const withRFO = rows.filter(r=> r.closeNotes && r.closeNotes.length > 20).length; // Heuristic
  const rfoRate = total ? (withRFO/total)*100 : 0;
  const auto = rows.filter(r=> (r.closeNotes||'').toLowerCase().includes('automatic') || r.action.includes('Normalizado')).length;

  document.getElementById('fkTotal').textContent = total;
  document.getElementById('fkOpen').textContent = open;
  document.getElementById('fkRFO').textContent = rfoRate.toFixed(1)+'%';
  document.getElementById('fkFilled').textContent = withRFO;
  document.getElementById('fkAuto').textContent = auto;

  // 4. Sub Charts
  const sites = getSiteCounts(rows);
  createChart('cFmdsSite', 'bar', {
    labels: sites.labels,
    datasets: [{ data: sites.values, backgroundColor: '#007E7A' }]
  }, { indexAxis: 'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{display:false}} });

  const cats = getCategoryCounts(rows);
  createChart('cFmdsCat', 'bar', {
    labels: cats.labels,
    datasets: [{ data: cats.values, backgroundColor: '#007E7A' }]
  }, { indexAxis: 'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{display:false}} });

  // 5. Recurrence Table (Top 5)
  const rec = analyzeAssetRecurrence(rows).slice(0, 5);
  const tRec = document.getElementById('tFmdsRec');
  tRec.innerHTML = rec.map(([asset, count])=>`
    <tr>
      <td>${Z.escape(asset)}</td>
      <td style="text-align:center">${count}</td>
      <td style="text-align:center"><span class="status-dot dot-green"></span></td>
    </tr>`).join('');

  // 6. INC Analysis Table (Top 5 by MTTR)
  const topIncs = rows.slice().sort((a,b)=>(b.mttrSec||0)-(a.mttrSec||0)).slice(0, 5);
  const tInc = document.getElementById('tFmdsInc');
  tInc.innerHTML = topIncs.map(r=>`
    <tr>
      <td>${Z.escape(r.number)}<div style="font-size:9px;color:#666">${Z.escape(r.asset)}</div></td>
      <td>${Z.escape(Z.compact(r.closeNotes || r.short, 80))}</td>
      <td class="action-green">${Z.escape(Z.compact(r.action, 30))}</td>
    </tr>`).join('');

  // 7. Repetibilidade Table (Proactive PRB format)
  const suggestions = analyzeSmartPatterns(rows).slice(0,4); // Use same logic? existing code calls analyzeProactivePRB? Wait, analyzeProactivePRB is missing in my context, likely it was analyzeSmartPatterns.
  // In read_file output, analyzeProactivePRB was not defined, but referenced in renderFMDS.
  // Wait, in my read_file output (line 622), it calls analyzeProactivePRB(rows).
  // But line 487 defines analyzeSmartPatterns.
  // And line 656 calls analyzeSmartPatterns(VIEW_RAW).
  // I suspect analyzeProactivePRB was renamed to analyzeSmartPatterns or I missed it.
  // I will check if analyzeSmartPatterns returns strings or objects.
  // analyzeSmartPatterns returns strings (HTML).
  // In renderFMDS, it maps suggestions and matches <b> tags.
  // So analyzeSmartPatterns is likely correct. I'll use analyzeSmartPatterns.
  const tRep = document.getElementById('tFmdsRep');
  tRep.innerHTML = suggestions.map(s=>{
    // Asset is usually the second bold tag (Label is first)
    const matches = s.match(/<b>(.*?)<\/b>/g);
    let asset = '—';
    if(matches && matches.length >= 2) asset = matches[1].replace(/<\/?b>/g, '');
    else if(matches && matches.length === 1) asset = matches[0].replace(/<\/?b>/g, '');

    const desc = s.replace(/<[^>]*>/g, '');
    return `
    <tr>
      <td>${asset}</td>
      <td>${desc}</td>
      <td class="action-green">Investigar</td>
    </tr>`;
  }).join('');
}

/* ====== Render ====== */
function setFMDS(rows, metrics){
  const first = rows.filter(r=>r.eventTime).sort((a,b)=>a.eventTime-b.eventTime)[0]?.eventTime;
  const last  = rows.filter(r=>r.eventTime).sort((a,b)=>b.eventTime-a.eventTime)[0]?.eventTime;
  document.getElementById('pPeriod').textContent = `Período: ${first?Z.fmtDT(first):'—'} até ${last?Z.fmtDT(last):'—'}`;
  document.getElementById('pTotal').textContent = metrics.total;
  document.getElementById('pTop').textContent = metrics.topAlarm;
  document.getElementById('pMTTR').textContent = metrics.mttr;
  document.getElementById('pP90').textContent = metrics.p90;
  document.getElementById('pMTBF').textContent = metrics.mtbf;
  document.getElementById('pSLA').textContent = metrics.sla;

  const insights = `• Padrões recorrentes: ${metrics.topAlarm}.\n`+
                   `• Ações mais frequentes: ${metrics.topAction}.\n`+
                   `• Próximos passos recomendados: revisar TX/configuração e checar degradação RF para RX < -60; correlacionar ICMP com energia/alimentação e estabilidade do enlace.`;
  document.getElementById('pInsights').textContent = insights;

  const lastItems = rows.slice().sort((a,b)=>(b.eventTime||0)-(a.eventTime||0)).slice(0,8)
    .map(r=>`- ${Z.fmtDT(r.eventTime)} | ${r.alarm} | ${r.action} | ${r.number}`).join('\n');
  document.getElementById('pLast').textContent = lastItems || '—';
}

function render(){
  MODE_DEDUP = document.getElementById('dedupToggle').checked;
  document.getElementById('modeLabel').textContent = MODE_DEDUP ? 'Deduplicado' : 'Tickets';

  // 1. Compute Cluster Map on RAW (global context)
  CLUSTER_MAP = computeClusters(RAW);

  // 2. Apply Filters to create VIEW_RAW
  const fStart = FILTER.start ? new Date(FILTER.start+'T00:00:00') : null;
  const fEnd = FILTER.end ? new Date(FILTER.end+'T23:59:59') : null;

  const VIEW_RAW = RAW.filter(r=>{
    const text = (r.number+' '+r.alarm+' '+r.action+' '+(r.closeNotes||'')+' '+(r.short||'')).toLowerCase();
    const okQ = !FILTER.q || text.includes(FILTER.q);

    const myCluster = CLUSTER_MAP.get(r.alarm) || r.alarm;
    const okA = !FILTER.alarm || myCluster===FILTER.alarm;

    const okR = !FILTER.action || r.action===FILTER.action;
    const okAsset = !FILTER.asset || r.asset===FILTER.asset;
    const okMatrix = !FILTER.matrix || (r.problema===FILTER.matrix.p && r.solucao===FILTER.matrix.s);
    const okPrio = !FILTER.priorityOnly || (r.tags && r.tags.length > 0);
    const okRegion = !FILTER.region || r.region === FILTER.region;

    let okDate = true;
    if(r.eventTime){
      if(fStart && r.eventTime < fStart) okDate = false;
      if(fEnd && r.eventTime > fEnd) okDate = false;
    }
    return okQ && okA && okR && okAsset && okMatrix && okDate && okPrio && okRegion;
  });

  // 3. Deduplicate if needed to create VIEW (for table/charts)
  VIEW = MODE_DEDUP ? deduplicate(VIEW_RAW) : VIEW_RAW;

  // 4. Run Smart Insights on VIEW_RAW (always full resolution)
  const suggestions = analyzeSmartPatterns(VIEW_RAW);
  const prbEl = document.getElementById('prbList');
  if(!suggestions.length) prbEl.innerHTML = '<span class="muted">Nenhum padrão crítico detectado para o filtro atual.</span>';
  else prbEl.innerHTML = suggestions.map(s=>`<div class="callout" style="border-left-color:var(--warn);background:rgba(240,179,35,.1)">${s}</div>`).join('');

  // Metrics
  const total = VIEW.length;
  const prioCount = VIEW.filter(x => x.tags && x.tags.length > 0).length;
  const slaRate = total ? (VIEW.filter(x=>x.madeSla).length/total)*100 : 0;
  const mttrs = VIEW.map(r=>r.mttrSec).filter(x=>x!=null);
  const mttrAvg = Z.mean(mttrs);
  const p90 = Z.quantile(mttrs, 0.90);
  const mtbfH = computeMTBF(VIEW);

  const alarmCounts = countsBy(VIEW,'alarm');
  const topAlarm = alarmCounts[0] ? `${alarmCounts[0][0]} (${alarmCounts[0][1]})` : '—';
  const actionCounts = countsBy(VIEW,'action');
  const topAction = actionCounts[0] ? `${actionCounts[0][0]} (${actionCounts[0][1]})` : '—';

  document.getElementById('kpiTotal').textContent = total ? String(total) : '—';
  document.getElementById('slaRate').textContent = total ? `${slaRate.toFixed(0)}%` : '—';
  const avail = computeAvailability(VIEW);

  document.getElementById('kpiMTTR').textContent = isFinite(mttrAvg) ? Z.fmtDur(mttrAvg) : '—';
  document.getElementById('kpiP90').textContent = isFinite(p90) ? Z.fmtDur(p90) : '—';
  document.getElementById('kpiMTBF').textContent = isFinite(mtbfH) ? `${(mtbfH/24).toFixed(1)}d` : '—';
  document.getElementById('kpiAvail').textContent = isFinite(avail) ? `${avail.toFixed(4)}%` : '—';

  // Exec summary + FMDS
  const first = VIEW.filter(r=>r.eventTime).sort((a,b)=>a.eventTime-b.eventTime)[0]?.eventTime;
  const last  = VIEW.filter(r=>r.eventTime).sort((a,b)=>b.eventTime-a.eventTime)[0]?.eventTime;
  document.getElementById('execSummary').innerHTML = `
    <b>Principais achados (filtro atual):</b>
    <ul>
      <li>Total: <b>${total}</b> (${MODE_DEDUP?'eventos deduplicados':'tickets'})</li>
      <li>Prioritários (Tags): <b class="warnTxt">${prioCount}</b></li>
      <li>Período: <b>${first?Z.fmtDT(first):'—'}</b> até <b>${last?Z.fmtDT(last):'—'}</b></li>
      <li>SLA: <b class="okTxt">${slaRate.toFixed(0)}%</b></li>
      <li>Top alarme: <b>${topAlarm}</b></li>
      <li>Top ação: <b>${topAction}</b></li>
    </ul>`;

  setFMDS(VIEW, {
    total: total?String(total):'—',
    topAlarm,
    topAction,
    mttr: isFinite(mttrAvg) ? Z.fmtDur(mttrAvg) : '—',
    p90: isFinite(p90) ? Z.fmtDur(p90) : '—',
    mtbf: isFinite(mtbfH) ? `${(mtbfH/24).toFixed(1)}d` : '—',
    sla: total ? `${slaRate.toFixed(0)}%` : '—'
  });

  // Charts - Chart.js Implementation

  // 1. Month Chart
  const mc = monthCounts(VIEW);
  createChart('cMonth', 'bar', {
    labels: mc.labels,
    datasets: [{
      label: 'Incidentes',
      data: mc.values,
      backgroundColor: 'rgba(78,161,255,0.6)',
      borderColor: '#4ea1ff',
      borderWidth: 1
    }]
  }, {
    responsive: true,
    maintainAspectRatio: false,
    onClick: (e, els) => {
      if(!els.length) return;
      const idx = els[0].index;
      const label = mc.labels[idx];
      if(label){
        const [y, m] = label.split('-');
        const lastDay = new Date(y, m, 0).getDate();
        FILTER.start = `${y}-${m}-01`;
        FILTER.end = `${y}-${m}-${lastDay}`;
        FILTER.matrix=null;
        syncControls(); render();
      }
    }
  });

  // 2. Type Chart (Top 8)
  const typeMap = new Map();
  VIEW.forEach(r=>{
    const k = CLUSTER_MAP.get(r.alarm) || r.alarm;
    typeMap.set(k, (typeMap.get(k)||0)+1);
  });
  const types = [...typeMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8);
  createChart('cType', 'bar', {
    labels: types.map(x=>x[0]),
    datasets: [{
      label: 'Volume',
      data: types.map(x=>x[1]),
      backgroundColor: 'rgba(255,176,32,0.6)',
      borderColor: '#F0B323',
      borderWidth: 1
    }]
  }, {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    onClick: (e, els) => {
      if(!els.length) return;
      const label = types[els[0].index][0];
      if(label){ FILTER.alarm = label; FILTER.matrix=null; syncControls(); render(); }
    }
  });

  // 3. Duration Histogram
  const hist = durationHistogram(VIEW);
  createChart('cDur', 'bar', {
    labels: hist.labels,
    datasets: [{
      label: 'Ocorrências',
      data: hist.values,
      backgroundColor: 'rgba(52,211,153,0.6)',
      borderColor: '#34d399',
      borderWidth: 1
    }]
  }, {
    responsive: true,
    maintainAspectRatio: false
  });

  // 4. Matrix (Problem x Solution)
  const mx = buildMatrix(VIEW);
  console.log('Matrix Data:', mx);
  const mxData = [];
  mx.p.forEach((p, y)=>{
    mx.s.forEach((s, x)=>{
      const v = mx.mat[y][x];
      if(v>0) mxData.push({x: s, y: p, v});
    });
  });
  const maxMx = Math.max(1, ...mxData.map(d=>d.v));
  createChart('cMatrix', 'matrix', {
    datasets: [{
      label: 'Incidentes',
      data: mxData,
      backgroundColor(c){
        const val = c.raw?.v || 0;
        return `rgba(78,161,255,${0.1 + 0.9*(val/maxMx)})`;
      },
      width: ({chart})=> (chart.chartArea?.width / mx.s.length) - 2,
      height: ({chart})=> (chart.chartArea?.height / mx.p.length) - 2
    }]
  }, {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { type: 'category', labels: mx.s, ticks: {autoSkip:false, maxRotation:45, minRotation:45, font:{size:10}} },
      y: { type: 'category', labels: mx.p, offset: true, ticks:{font:{size:10}} }
    },
    plugins: {
      tooltip: {
        callbacks: {
          title:()=>'',
          label:(c)=> `${c.raw.y} x ${c.raw.x}: ${c.raw.v}`
        }
      }
    },
    onClick: (e, els) => {
      if(!els.length) return;
      const raw = els[0].element.$context.raw;
      if(raw){
        FILTER.matrix = {p: raw.y, s: raw.x};
        syncControls(); render();
      }
    }
  });

  // 5. Heatmap (Day x Hour)
  const hmMatrix = analyzeHeatmap(VIEW);
  const hmData = [];
  const days = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  hmMatrix.forEach((row, d)=>{
    row.forEach((v, h)=>{
      if(v>0) hmData.push({x: h, y: d, v});
    });
  });
  const maxHm = Math.max(1, ...hmData.map(d=>d.v));
  createChart('cHeatmap', 'matrix', {
    datasets: [{
      label: 'Incidentes',
      data: hmData,
      backgroundColor(c){
        const val = c.raw?.v || 0;
        return `rgba(240,179,35,${0.2 + 0.8*(val/maxHm)})`;
      },
      width: ({chart})=> (chart.chartArea?.width / 24) - 1,
      height: ({chart})=> (chart.chartArea?.height / 7) - 1
    }]
  }, {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { type: 'linear', min: 0, max: 23, ticks: {stepSize:1} },
      y: { type: 'category', labels: days, offset: true }
    },
    plugins: {
      tooltip: {
        callbacks: {
          title:()=>'',
          label:(c)=> `${days[c.raw.y]} ${c.raw.x}h: ${c.raw.v}`
        }
      }
    }
  });

  // 6. Asset Recurrence
  const assetRec = analyzeAssetRecurrence(VIEW);
  console.log('Asset Recurrence:', assetRec);
  createChart('cAsset', 'bar', {
    labels: assetRec.map(x=>x[0]),
    datasets: [{
      label: 'Recorrência',
      data: assetRec.map(x=>x[1]),
      backgroundColor: 'rgba(217,83,79,0.6)',
      borderColor: '#D9534F',
      borderWidth: 1
    }]
  }, {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    onClick: (e, els) => {
      if(!els.length) return;
      const label = assetRec[els[0].index][0];
      if(label){ FILTER.asset = label; syncControls(); render(); }
    }
  });

  // 7. Top 6 Secondary Incidents
  // Logic: Items with _count > 1, sort by _count, take top 6
  const secondaryData = VIEW.filter(r => r._count && r._count > 1)
                            .sort((a,b) => b._count - a._count)
                            .slice(0, 6);
  createChart('cSecondary', 'bar', {
    labels: secondaryData.map(r => r.number),
    datasets: [{
       label: 'Tickets Agrupados',
       data: secondaryData.map(r => r._count),
       backgroundColor: '#007E7A', // Vale Teal
       borderColor: '#rgba(255,255,255,0.1)',
       borderWidth: 1
    }]
  }, {
     indexAxis: 'y',
     responsive: true,
     maintainAspectRatio: false,
     plugins: { legend: { display: false } },
     scales: { x: { beginAtZero: true } }
  });


  // Filters selects - Populate fAlarm with CLUSTERS, not raw
  fillSelect('fAlarm', uniq([...new Set(RAW.map(x=>CLUSTER_MAP.get(x.alarm)||x.alarm))]));
  fillSelect('fRes', uniq(RAW.map(x=>x.action)));
  fillSelect('fRegion', uniq(RAW.map(x=>x.region))); // Populate region select

  // Set date inputs boundaries if empty
  if(!FILTER.start && !FILTER.end && RAW.length){
    const times = RAW.filter(x=>x.eventTime).map(x=>x.eventTime.getTime());
    if(times.length){
      const minT = new Date(Math.min(...times));
      const maxT = new Date(Math.max(...times));
      // Just set placeholders or values? Let's leave values empty to show "All time"
      // but we could set min/max attributes on inputs.
      document.getElementById('fStart').min = minT.toISOString().split('T')[0];
      document.getElementById('fEnd').max = maxT.toISOString().split('T')[0];
    }
  }

  // Timeline (top 10)
  renderTimeline(VIEW);

  // Table
  renderTable(VIEW);
}

function fillSelect(id, values){
  const sel = document.getElementById(id);
  let label = 'Todos';
  if(id==='fAlarm') label = 'Todos os alarmes';
  else if(id==='fRes') label = 'Todas as ações';
  else if(id==='fRegion') label = 'Todas as regiões';

  sel.innerHTML = `<option value="">${label}</option>`;
  values.forEach(v=>{
    if(!v) return;
    const o=document.createElement('option'); o.value=v; o.textContent=v; sel.appendChild(o);
  });
  // set current value
  if(id==='fAlarm') sel.value = FILTER.alarm || '';
  if(id==='fRes') sel.value = FILTER.action || '';
  if(id==='fRegion') sel.value = FILTER.region || '';
}

function renderTimeline(rows){
  const el = document.getElementById('timeline');
  const items = rows.slice().sort((a,b)=>(b.eventTime||0)-(a.eventTime||0)).slice(0,12);
  if(!items.length){ el.innerHTML = '<span class="muted">Sem dados.</span>'; return; }
  const html = items.map(r=>{
    const ticketInfo = (r._tickets && r._tickets.length>1) ? ` <span class="pill warn" title="Tickets agrupados">${r._tickets.length} tickets</span>` : '';
    const z = r.zabbix?.url ? `<a href="${r.zabbix.url}" target="_blank">Zabbix</a>` : '';
    return `<div style="margin-bottom:8px">
      <span class="mono">${Z.fmtDT(r.eventTime)}</span> — <b>${r.alarm}</b> — ${r.action} — <span class="mono">${r.number}</span>${ticketInfo}
      <span class="small" style="margin-left:8px">${Z.fmtDur(r.mttrSec)} ${z?(' • '+z):''}</span>
    </div>`;
  }).join('');
  el.innerHTML = html;
}

function renderTable(rows){
  const tb = document.querySelector('#tbl tbody');
  tb.innerHTML='';
  rows.slice().sort((a,b)=>(b.eventTime||0)-(a.eventTime||0)).forEach(r=>{
    const tr = document.createElement('tr');
    const zlink = r.zabbix?.url ? `<a href="${r.zabbix.url}" target="_blank">abrir</a>` : '';
    const notes = Z.compact(r.closeNotes, 240);
    const badges = (r.tags||[]).map(t=>`<span class="badge" style="margin:0 2px;padding:2px 6px;color:var(--warn);border-color:var(--warn)">${t}</span>`).join('');

    tr.innerHTML = `
      <td class="mono">
        ${r.number}
        ${badges ? '<div>'+badges+'</div>' : ''}
        ${r._tickets && r._tickets.length>1 ? `<div class="small">Agrupa: ${r._tickets.join(', ')}</div>`:''}
      </td>
      <td class="mono">${r.eventTime?Z.fmtDT(r.eventTime):''}<div class="small">${r.month||''}</div></td>
      <td>${r.alarm}</td>
      <td>${r.action}</td>
      <td class="mono">${Z.fmtDur(r.mttrSec)}</td>
      <td class="mono">${r.impact||''}/${r.urgency||''}</td>
      <td>${zlink}</td>
      <td>${notes}</td>`;
    tb.appendChild(tr);
  });
}

/* ===== Controls ===== */
function syncControls(){
  document.getElementById('q').value = FILTER.q || '';
  document.getElementById('fAlarm').value = FILTER.alarm || '';
  document.getElementById('fRes').value = FILTER.action || '';
  document.getElementById('fRegion').value = FILTER.region || '';
  document.getElementById('fStart').value = FILTER.start || '';
  document.getElementById('fEnd').value = FILTER.end || '';
}

function clearFilters(){
  FILTER = { q:'', alarm:'', action:'', start:'', end:'', asset:'', region:'', matrix:null, priorityOnly:false };
  syncControls();
  render();
}

/* ===== Export CSV (filtered table) ===== */
function exportCSV(){
  const rows = VIEW.slice().sort((a,b)=>(b.eventTime||0)-(a.eventTime||0));
  const cols = ['Incidente','Data_evento','Mes','Tipo','Acao','MTTR','Impact','Urgency','Zabbix_URL','Anotacoes'];
  const lines=[cols.join(';')];
  rows.forEach(r=>{
    const vals = [
      r.number,
      r.eventTime?Z.fmtDT(r.eventTime):'',
      r.month||'',
      r.alarm||'',
      r.action||'',
      Z.fmtDur(r.mttrSec),
      r.impact||'',
      r.urgency||'',
      r.zabbix?.url||'',
      (r.closeNotes||'').replace(/\s+/g,' ').trim()
    ].map(v=>(''+v).replace(/;/g,',').replace(/\n/g,' '));
    lines.push(vals.map(v=>`"${v.replace(/"/g,'""')}"`).join(';'));
  });
  const blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=`dashboard_export_${MODE_DEDUP?'dedup':'tickets'}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* ===== Init ===== */
function loadFromJSON(json){
  const records = Array.isArray(json) ? json : (json.records || []);
  RAW = buildRows(records);
  clearFilters();
}

/* ===== Drag & Drop Logic ===== */
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('file');

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const files = e.dataTransfer.files;
  if(files.length) handleFile(files[0]);
});

fileInput.addEventListener('change', () => {
  if(fileInput.files.length) handleFile(fileInput.files[0]);
});

async function handleFile(file){
  dropZone.textContent = `Carregando ${file.name}...`;
  try {
    let json;
    if(file.name.toLowerCase().endsWith('.json')){
      const text = await file.text();
      json = JSON.parse(text);
    } else if(file.name.toLowerCase().endsWith('.xlsx')){
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const firstSheet = workbook.SheetNames[0];
      // cellDates: true ensures dates are parsed as JS Date objects, which Z.parseDate now handles
      json = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { cellDates: true, defval: '' });
    } else {
      alert('Por favor, envie um arquivo .json ou .xlsx');
      dropZone.textContent = 'Formato inválido.';
      return;
    }

    loadFromJSON(json);
    dropZone.innerHTML = `Arquivo <b>${Z.escape(file.name)}</b> carregado com sucesso!`;
  } catch(e){
    console.error(e);
    alert('Erro ao ler arquivo. Verifique o formato.');
    dropZone.textContent = 'Erro. Tente novamente.';
  }
}

['q','fAlarm','fRes','fRegion','fStart','fEnd'].forEach(id=>{
  const el = document.getElementById(id);
  if(!el) return;
  const handler = (e)=>{
    if(id==='q') FILTER.q = (e.target.value||'').toLowerCase();
    if(id==='fAlarm') FILTER.alarm = e.target.value;
    if(id==='fRes') FILTER.action = e.target.value;
    if(id==='fRegion') FILTER.region = e.target.value;
    if(id==='fStart') FILTER.start = e.target.value;
    if(id==='fEnd') FILTER.end = e.target.value;
    FILTER.matrix = null;
    render();
  };
  el.addEventListener('input', handler);
  el.addEventListener('change', handler);
});

document.getElementById('dedupToggle').addEventListener('change', ()=>render());
document.getElementById('priorityToggle').addEventListener('change', (e)=>{ FILTER.priorityOnly=e.target.checked; render(); });
document.getElementById('clearFilter').addEventListener('click', ()=>clearFilters());
document.getElementById('exportBtn').addEventListener('click', ()=>exportCSV());
document.getElementById('printBtn').addEventListener('click', ()=>window.print());

async function downloadPDF(){
  const btn = document.getElementById('pdfBtn');
  const oldText = btn.textContent;
  btn.textContent = 'Gerando FMDS...';
  btn.disabled = true;

  try {
    // 1. Prepare Report
    renderFMDS(VIEW); // Render current filtered view

    // Wait for charts to animate/render
    await new Promise(r => setTimeout(r, 800));

    const element = document.getElementById('fmdsReport');

    // 2. Capture
    // Temporarily bring into view if needed (html2canvas handles off-screen mostly ok but Z-index helps)
    element.style.top = '0';
    element.style.left = '0';
    element.style.zIndex = '9999';

    const canvas = await html2canvas(element, {
      scale: 2, // High quality
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: 1600,
      windowHeight: 1200
    });

    // Hide again
    element.style.top = '-9999px';
    element.style.left = '-9999px';
    element.style.zIndex = '';

    // 3. Generate PDF (Landscape A4)
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('l', 'mm', 'a4'); // Landscape
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();

    const imgData = canvas.toDataURL('image/png');
    const imgProps = pdf.getImageProperties(imgData);

    // Fit width
    const imgH = (imgProps.height * pdfW) / imgProps.width;

    pdf.addImage(imgData, 'PNG', 0, 0, pdfW, imgH);
    pdf.save('relatorio_fmds.pdf');

  } catch(err){
    console.error(err);
    alert('Erro ao gerar PDF FMDS. Verifique o console.');
  } finally {
    btn.textContent = oldText;
    btn.disabled = false;
  }
}
document.getElementById('pdfBtn').addEventListener('click', downloadPDF);

window.addEventListener('resize', ()=>render());

// boot with embedded data if available
if(typeof EMBEDDED !== 'undefined'){
  loadFromJSON(EMBEDDED);
}
