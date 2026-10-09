/* ============================================================
   REPAIR-BEFORE-STOCK WORKFLOW (งานซ่อมสินค้าก่อนเก็บเข้าสต๊อก)
   Loaded after main.js — reuses its h(), DB, VIEWS, go(), toast(), etc.

   Flow:  1 ตรวจสภาพ + รูปก่อนซ่อม  →  2 ระหว่างซ่อม (บันทึกได้ ไม่บังคับ)
          →  3 ซ่อมเสร็จ + รูปหลังซ่อม  →  4 หัวหน้างานอนุมัติเก็บเข้าสต๊อก
   Status: repairing → awaiting → approved | scrapped
           (หัวหน้าส่งกลับ: awaiting → repairing)
   ============================================================ */

const REPAIR_KEY = 'qc_repairs_v1';
const REPAIR_WHO_KEY = 'qc_repair_who';
const REPAIR_MAX_BYTES = 900000; // Firestore docs are capped at 1 MiB
const REPAIR_STATUS = {
  repairing: {label:'กำลังซ่อม',            chip:'warn'},
  awaiting:  {label:'รอหัวหน้าอนุมัติ',     chip:'brand'},
  approved:  {label:'อนุมัติเข้าสต๊อกแล้ว', chip:'ok'},
  scrapped:  {label:'ตัดจำหน่าย',           chip:'fail'}
};

/* ---------------- data ---------------- */
// Use Firestore only once the "repairs" listener has delivered data; otherwise
// (offline, or Firestore rules don't cover this collection) fall back to
// localStorage so work is never lost.
function repairCloudOn(){
  return typeof FIREBASE_CONFIGURED !== 'undefined' && FIREBASE_CONFIGURED && CLOUD._repairs !== undefined;
}
DB.repairs = function(){ return repairCloudOn() ? CLOUD._repairs : load(REPAIR_KEY, []); };
DB.repair = function(id){ return this.repairs().find(r=>r.id===id); };
DB.saveRepair = function(job){
  const json = JSON.stringify(job);
  if (json.length > REPAIR_MAX_BYTES){
    toast('รูปภาพในงานซ่อมนี้มากเกินไป กรุณาลบรูปบางส่วนก่อน','err');
    return false;
  }
  const clean = JSON.parse(json);
  const list = this.repairs().slice();
  const i = list.findIndex(r=>r.id===clean.id);
  if (i>=0) list[i] = clean; else list.unshift(clean);
  if (repairCloudOn()){
    CLOUD._repairs = list;
    try{ cloudCol('repairs').doc(clean.id).set(clean).catch(cloudErr); }catch(err){ cloudErr(err); }
    return true;
  }
  return save(REPAIR_KEY, list);
};
function repairClone(id){ const j = DB.repair(id); return j ? JSON.parse(JSON.stringify(j)) : null; }
function repairNo(){
  const d = new Date();
  const ymd = String(d.getFullYear()).slice(2) + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0');
  const n = DB.repairs().filter(r=>r.no && r.no.startsWith('RP-'+ymd)).length + 1;
  return `RP-${ymd}-${String(n).padStart(2,'0')}`;
}
function repairWho(){ try{ return localStorage.getItem(REPAIR_WHO_KEY) || ''; }catch(e){ return ''; } }
function setRepairWho(v){ try{ localStorage.setItem(REPAIR_WHO_KEY, v); }catch(e){} }
function repairCounts(){
  const c = {repairing:0, awaiting:0, approved:0, scrapped:0};
  DB.repairs().forEach(r=>{ if (c[r.status] != null) c[r.status]++; });
  return c;
}
function repairChip(status){
  const s = REPAIR_STATUS[status] || REPAIR_STATUS.repairing;
  return h('span', {class:'chip '+s.chip}, s.label);
}

/* ---------------- small UI helpers ---------------- */
function rpField(label, control, hint){
  return h('div', {class:'field'}, h('label', {}, label), control, hint ? h('div',{class:'hint'},hint) : null);
}
function rpEmpSelect(initial, onChange, filterFn){
  let emps = DB.employees();
  if (filterFn){ const f = emps.filter(filterFn); if (f.length) emps = f; }
  return h('select', {onchange:(e)=>onChange(e.target.value)},
    h('option', {value:''}, '— เลือกชื่อ —'),
    emps.map(e=>h('option', {value:e.name, selected: e.name===initial}, e.name))
  );
}
function rpZoom(src){
  openModal(h('div', {},
    h('img', {src, style:{width:'100%', borderRadius:'8px', display:'block'}}),
    h('button', {class:'btn secondary', style:{marginTop:'10px'}, onclick:closeModal}, 'ปิด')
  ), {center:true});
}
// photos: the array to mutate in place; onChange() is called after any add/remove
function rpPhotoStrip(photos, {max=4, editable=true, onChange}){
  const strip = h('div', {class:'photo-strip big'});
  photos.forEach((src, i)=>{
    strip.appendChild(h('div', {class:'photo-thumb', onclick:()=>rpZoom(src)},
      h('img', {src}),
      editable ? h('button', {class:'rm', 'aria-label':'ลบรูป', onclick:(e)=>{ e.stopPropagation(); photos.splice(i,1); onChange(); }}, '×') : null
    ));
  });
  if (editable && photos.length < max){
    const fileInput = h('input', {type:'file', accept:'image/*', capture:'environment', style:{display:'none'}, onchange: async (e)=>{
      const file = e.target.files[0]; if (!file) return;
      try{ photos.push(await fileToCompressedDataURL(file, 800, 0.6)); onChange(); }
      catch(err){ toast('เพิ่มรูปไม่สำเร็จ','err'); }
      e.target.value = '';
    }});
    strip.appendChild(h('div', {class:'photo-add', onclick:()=>fileInput.click()}, '📷', fileInput));
  }
  if (!photos.length && !editable) strip.appendChild(h('div', {style:{color:'var(--text-dim)', fontSize:'13px'}}, 'ไม่มีรูป'));
  return strip;
}
/* ---------------- entry points from other screens ---------------- */
// Card on the home screen
function repairHomeCard(){
  const c = repairCounts();
  const open = c.repairing + c.awaiting;
  return h('div', {class:'card', style:{borderLeft:'4px solid '+(c.awaiting?'var(--brand)':c.repairing?'var(--warn)':'var(--border)'), cursor:'pointer'}, onclick:()=>go('repairList')},
    h('div', {class:'card-title'}, '🔧 สินค้าชำรุด · งานซ่อมก่อนเก็บเข้าสต๊อก'),
    h('div', {style:{display:'flex', gap:'14px', fontSize:'13.5px', flexWrap:'wrap'}},
      h('span', {}, h('b', {}, c.repairing), ' กำลังซ่อม'),
      h('span', {}, h('b', {}, c.awaiting), ' รออนุมัติ'),
      h('span', {style:{color:'var(--text-dim)'}}, open ? 'แตะเพื่อดูรายการ →' : 'แตะเพื่อดูงานซ่อม →')
    ),
    h('button', {class:'btn', style:{marginTop:'12px'}, onclick:(e)=>{ e.stopPropagation(); go('repairNew',{}); }}, '＋ เพิ่มสินค้าชำรุด')
  );
}
/* ---------------- list ---------------- */
VIEWS.repairList = function(){
  state.chrome.title = 'งานซ่อมสินค้า';
  state.chrome.subtitle = 'ก่อนเก็บเข้าสต๊อก';
  state.chrome.menu = {icon:'＋', action:()=>go('repairNew',{})};
  const f = VIEWS.repairList._f || (VIEWS.repairList._f = {status:'repairing'});
  const wrap = h('div', {});
  const counts = repairCounts();

  const chips = h('div', {class:'filter-chips'});
  [['repairing','กำลังซ่อม'],['awaiting','รออนุมัติ'],['approved','อนุมัติแล้ว'],['scrapped','ตัดจำหน่าย'],['all','ทั้งหมด']].forEach(([k,l])=>{
    const n = k==='all' ? DB.repairs().length : counts[k];
    chips.appendChild(h('div', {class:'filter-chip'+(f.status===k?' active':''), onclick:()=>{ f.status=k; render(); }}, `${l} (${n})`));
  });
  wrap.appendChild(chips);
  wrap.appendChild(h('button', {class:'btn secondary sm', style:{marginBottom:'12px'}, onclick:()=>go('repairNew',{})}, '＋ เปิดงานซ่อมใหม่'));

  let list = [...DB.repairs()].sort((a,b)=>b.createdAt-a.createdAt);
  if (f.status !== 'all') list = list.filter(r=>r.status===f.status);
  if (!list.length){
    wrap.appendChild(h('div', {class:'empty'}, h('span',{class:'ic'},'🔧'), 'ไม่มีงานซ่อมในสถานะนี้'));
    return wrap;
  }
  const card = h('div', {class:'card'});
  list.forEach(j=>{
    card.appendChild(h('div', {class:'list-row', style:{cursor:'pointer'}, onclick:()=>go('repairDetail',{id:j.id})},
      h('div', {class:'main'},
        h('b', {}, `${j.no} • ${j.pieceName}`),
        h('small', {}, `${j.productName} • ${fmtDateTimeTH(j.createdAt)}`)
      ),
      repairChip(j.status)
    ));
  });
  wrap.appendChild(card);
  return wrap;
};

/* ---------------- step 1: new job ---------------- */
VIEWS.repairNew = function(){
  state.chrome.title = 'เปิดงานซ่อมใหม่';
  state.chrome.subtitle = 'ขั้นที่ 1 · ตรวจสภาพ + ถ่ายรูปก่อนซ่อม';
  const form = VIEWS.repairNew._form || (VIEWS.repairNew._form = {productName:'', pieceName:'', defect:'', inspector:repairWho(), photos:[]});
  const wrap = h('div', {});
  wrap.appendChild(h('div', {class:'card'},
    rpField('ผลิตภัณฑ์ *', h('input', {type:'text', value:form.productName, placeholder:'เช่น เสาเข็ม I 22×22', oninput:(e)=>{ form.productName = e.target.value; }})),
    rpField('ชิ้นงาน / รหัส / เลขล็อต *', h('input', {type:'text', value:form.pieceName, placeholder:'เช่น เสาเข็ม 12', oninput:(e)=>{ form.pieceName = e.target.value; }})),
    rpField('ลักษณะที่ชำรุด *', h('textarea', {placeholder:'เช่น แตกร้าวยาว 30 ซม. ที่ปลายด้านซ้าย', oninput:(e)=>{ form.defect = e.target.value; }}, form.defect)),
    rpField('ผู้ตรวจสภาพ *', rpEmpSelect(form.inspector, (v)=>{ form.inspector = v; }))
  ));

  wrap.appendChild(h('div', {class:'section-title'}, '📷 รูปก่อนซ่อม * (อย่างน้อย 1 รูป)'));
  wrap.appendChild(h('div', {class:'card'}, rpPhotoStrip(form.photos, {max:4, onChange:()=>render()})));

  wrap.appendChild(h('button', {class:'btn', onclick:()=>{
    if (!form.productName.trim() || !form.pieceName.trim()) return toast('กรุณากรอกผลิตภัณฑ์และชิ้นงาน','err');
    if (!form.defect.trim()) return toast('กรุณาระบุลักษณะที่ชำรุด','err');
    if (!form.inspector) return toast('กรุณาเลือกผู้ตรวจสภาพ','err');
    if (!form.photos.length) return toast('ต้องถ่ายรูปก่อนซ่อมอย่างน้อย 1 รูป','err');
    const now = Date.now();
    const job = {
      id: uid(), no: repairNo(), createdAt: now, status: 'repairing',
      productName: form.productName.trim(), pieceName: form.pieceName.trim(), defect: form.defect.trim(),
      inspector: form.inspector,
      beforePhotos: form.photos, log: [], afterPhotos: [], methodDraft: '',
      history: [{at:now, by:form.inspector, action:'created', note:form.defect.trim()}]
    };
    if (!DB.saveRepair(job)) return;
    setRepairWho(form.inspector);
    VIEWS.repairNew._form = null;
    toast('เปิดงานซ่อมแล้ว','ok');
    replaceTop('repairDetail', {id:job.id});
  }}, 'บันทึกและเริ่มซ่อม →'));
  return wrap;
};

/* ---------------- steps 2-4: detail ---------------- */
const _rpUI = {}; // per-job transient form state (survives re-render, not reload)

VIEWS.repairDetail = function({id}){
  const job = repairClone(id);
  if (!job){ back(); return h('div'); }
  state.chrome.title = job.no;
  state.chrome.subtitle = job.productName;
  const ui = _rpUI[id] || (_rpUI[id] = {by:repairWho(), note:'', photos:[], sup:'', supNote:'', sig:{signature:null}});
  const saveLater = debounce(()=>{ DB.saveRepair(job); }, 500);
  const commit = ()=>{ DB.saveRepair(job); render(); };
  const wrap = h('div', {});
  const st = job.status;

  // progress steps
  const curStep = st==='repairing' ? 1 : st==='awaiting' ? 3 : -1;
  wrap.appendChild(h('div', {class:'rp-steps'},
    ['ตรวจสภาพ','ระหว่างซ่อม','ซ่อมเสร็จ','อนุมัติ'].map((l,i)=>{
      const done = curStep===-1 || i<curStep;
      return h('div', {class:'rp-step'+(done?' done':'')+(i===curStep?' cur':'')}, h('span',{}, i+1), l);
    })
  ));

  // summary
  wrap.appendChild(h('div', {class:'card kv-list'},
    h('div',{class:'kv'}, h('b',{},'สถานะ'), repairChip(st)),
    h('div',{class:'kv'}, h('b',{},'ผลิตภัณฑ์'), job.productName),
    h('div',{class:'kv'}, h('b',{},'ชิ้นงาน'), job.pieceName),
    h('div',{class:'kv'}, h('b',{},'ที่ชำรุด'), h('span',{style:{whiteSpace:'pre-line'}}, job.defect)),
    h('div',{class:'kv'}, h('b',{},'ผู้ตรวจ'), `${job.inspector} • ${fmtDateTimeTH(job.createdAt)}`),
  ));

  if (st==='repairing' && job.rejectNote){
    wrap.appendChild(h('div', {class:'card', style:{borderLeft:'4px solid var(--danger)', background:'var(--danger-light)'}},
      h('div', {class:'card-title', style:{color:'var(--danger)'}}, '↩ หัวหน้าส่งกลับให้ซ่อมแก้'),
      h('div', {style:{whiteSpace:'pre-line'}}, job.rejectNote),
      job.approver ? h('small', {style:{color:'var(--text-dim)'}}, '— '+job.approver) : null
    ));
  }

  // before / after photos
  const editing = st==='repairing';
  wrap.appendChild(h('div', {class:'section-title'}, '1 · รูปก่อนซ่อม'));
  wrap.appendChild(h('div', {class:'card'}, rpPhotoStrip(job.beforePhotos, {max:4, editable:editing, onChange:()=>{
    if (!job.beforePhotos.length) { toast('ต้องมีรูปก่อนซ่อมอย่างน้อย 1 รูป','err'); render(); return; }
    commit();
  }})));

  // progress log
  if (job.log.length){
    wrap.appendChild(h('div', {class:'section-title'}, '2 · ระหว่างซ่อม'));
    const card = h('div', {class:'card'});
    job.log.forEach(e=>{
      card.appendChild(h('div', {class:'rp-log'},
        h('small', {}, `${fmtDateTimeTH(e.at)} • ${e.by}`),
        e.note ? h('div', {style:{whiteSpace:'pre-line'}}, e.note) : null,
        e.photos && e.photos.length ? rpPhotoStrip(e.photos, {editable:false}) : null
      ));
    });
    wrap.appendChild(card);
  }

  if (st==='repairing'){
    // step 2 — optional progress note
    wrap.appendChild(h('div', {class:'section-title'}, '2 · ระหว่างซ่อม (ไม่บังคับ)'));
    wrap.appendChild(h('div', {class:'card'},
      rpField('ผู้บันทึก', rpEmpSelect(ui.by, (v)=>{ ui.by = v; })),
      rpField('ความคืบหน้า', h('textarea', {placeholder:'เช่น อุดรอยร้าวด้วยปูนซ่อม รอแห้ง 24 ชม.', oninput:(e)=>{ ui.note = e.target.value; }}, ui.note)),
      rpPhotoStrip(ui.photos, {max:3, onChange:()=>render()}),
      h('button', {class:'btn secondary', style:{marginTop:'12px'}, onclick:()=>{
        if (!ui.by) return toast('กรุณาเลือกผู้บันทึก','err');
        if (!ui.note.trim() && !ui.photos.length) return toast('กรอกความคืบหน้าหรือเพิ่มรูปอย่างน้อยหนึ่งอย่าง','err');
        setRepairWho(ui.by);
        job.log.push({at:Date.now(), by:ui.by, note:ui.note.trim(), photos:ui.photos});
        job.history.push({at:Date.now(), by:ui.by, action:'progress', note:ui.note.trim()});
        ui.note = ''; ui.photos = [];
        toast('บันทึกความคืบหน้าแล้ว','ok'); commit();
      }}, 'บันทึกความคืบหน้า')
    ));

    // step 3 — finish & submit
    wrap.appendChild(h('div', {class:'section-title'}, '3 · ซ่อมเสร็จ → ส่งขออนุมัติ'));
    const outcome = ui.outcome || (ui.outcome = 'repaired');
    const seg = h('div', {class:'segmented', style:{marginBottom:'12px'}},
      h('button', {class:outcome==='repaired'?'active':'', onclick:()=>{ ui.outcome='repaired'; render(); }}, 'ซ่อมเสร็จแล้ว'),
      h('button', {class:outcome==='unrepairable'?'active':'', onclick:()=>{ ui.outcome='unrepairable'; render(); }}, 'ซ่อมไม่ได้')
    );
    const card = h('div', {class:'card'}, seg,
      rpField(outcome==='repaired' ? 'วิธีซ่อม *' : 'เหตุผลที่ซ่อมไม่ได้ *',
        h('textarea', {placeholder: outcome==='repaired' ? 'เช่น ฉีดอีพ๊อกซี่เข้ารอยร้าว ขัดผิวเรียบ' : 'เช่น รอยร้าวทะลุตลอดหน้าตัด', oninput:(e)=>{ job.methodDraft = e.target.value; saveLater(); }}, job.methodDraft || ''))
    );
    if (outcome==='repaired'){
      card.appendChild(h('label', {style:{display:'block', fontSize:'13px', fontWeight:600, color:'var(--text-dim)', marginBottom:'6px'}}, '📷 รูปหลังซ่อม * (อย่างน้อย 1 รูป)'));
      card.appendChild(rpPhotoStrip(job.afterPhotos, {max:4, onChange:commit}));
    }
    card.appendChild(h('button', {class:'btn', style:{marginTop:'14px'}, onclick:()=>{
      const by = ui.by || repairWho();
      const method = (job.methodDraft||'').trim();
      if (!by) return toast('กรุณาเลือกผู้บันทึกในขั้นที่ 2 ก่อน','err');
      if (!method) return toast('กรุณาระบุ'+(outcome==='repaired'?'วิธีซ่อม':'เหตุผล'),'err');
      if (outcome==='repaired' && !job.afterPhotos.length) return toast('ต้องถ่ายรูปหลังซ่อมอย่างน้อย 1 รูป','err');
      confirmDialog('ส่งให้หัวหน้างานอนุมัติ', outcome==='repaired' ? 'ยืนยันว่าซ่อมเสร็จแล้ว และส่งขออนุมัติเก็บเข้าสต๊อก?' : 'ยืนยันว่าซ่อมไม่ได้ และส่งให้หัวหน้าพิจารณา?', ()=>{
        job.status = 'awaiting'; job.proposed = outcome; job.repairMethod = method; job.repairedBy = by;
        job.submittedAt = Date.now(); job.rejectNote = null;
        job.history.push({at:Date.now(), by, action:'submitted', note:(outcome==='repaired'?'ซ่อมเสร็จ: ':'ซ่อมไม่ได้: ')+method});
        ui.outcome = null;
        toast('ส่งให้หัวหน้างานแล้ว','ok'); commit();
      }, 'ส่งอนุมัติ', false);
    }}, 'ส่งให้หัวหน้างานอนุมัติ →'));
    wrap.appendChild(card);
  }

  if (st!=='repairing'){
    wrap.appendChild(h('div', {class:'section-title'}, st==='awaiting' ? '3 · ผลการซ่อม' : 'ผลการซ่อม'));
    wrap.appendChild(h('div', {class:'card'},
      h('div', {class:'kv-list'},
        h('div',{class:'kv'}, h('b',{}, job.proposed==='repaired'?'วิธีซ่อม':'ซ่อมไม่ได้เพราะ'), h('span',{style:{whiteSpace:'pre-line'}}, job.repairMethod||'-')),
        h('div',{class:'kv'}, h('b',{},'ผู้ซ่อม'), `${job.repairedBy||'-'} • ${job.submittedAt?fmtDateTimeTH(job.submittedAt):''}`)
      ),
      job.afterPhotos.length ? h('div', {}, h('div',{style:{fontSize:'13px',fontWeight:600,color:'var(--text-dim)',margin:'10px 0 4px'}}, 'รูปหลังซ่อม'), rpPhotoStrip(job.afterPhotos,{editable:false})) : null
    ));
  }

  // step 4 — supervisor decision
  if (st==='awaiting'){
    const canApprove = job.proposed==='repaired';
    const isSup = (e)=>/หัวหน้า|ผู้จัดการ|วิศวกร|supervisor|manager/i.test(e.role||'');
    const sigWrap = h('div', {});
    wrap.appendChild(h('div', {class:'section-title'}, '4 · หัวหน้างานตรวจและตัดสินใจ'));
    const card = h('div', {class:'card', style:{borderLeft:'4px solid var(--brand)'}},
      h('div', {style:{fontSize:'13px', color:'var(--text-dim)', marginBottom:'10px'}}, canApprove ? 'เทียบรูปก่อน/หลังซ่อมด้านบน แล้วตัดสินใจ' : 'พนักงานแจ้งว่าซ่อมไม่ได้ — ตรวจเหตุผลแล้วตัดสินใจ'),
      rpField('ชื่อหัวหน้างาน *', rpEmpSelect(ui.sup, (v)=>{ ui.sup = v; }, isSup), DB.employees().some(isSup) ? null : 'ยังไม่มีพนักงานที่ตำแหน่งเป็น "หัวหน้า…" — ตั้งตำแหน่งได้ที่เมนูตั้งค่า › พนักงาน'),
      rpField('หมายเหตุ (จำเป็นถ้าส่งกลับ/ตัดจำหน่าย)', h('textarea', {oninput:(e)=>{ ui.supNote = e.target.value; }}, ui.supNote)),
      canApprove ? h('div', {}, h('label', {style:{display:'block', fontSize:'13px', fontWeight:600, color:'var(--text-dim)', marginBottom:'6px'}}, 'ลายเซ็นหัวหน้างาน (เมื่ออนุมัติ) *'), buildSignaturePad(ui.sig, ()=>{})) : null
    );
    const decide = (kind)=>{
      if (!ui.sup) return toast('กรุณาเลือกชื่อหัวหน้างาน','err');
      if (kind==='approve' && !ui.sig.signature) return toast('กรุณาลงลายเซ็นก่อนอนุมัติ','err');
      if (kind!=='approve' && !ui.supNote.trim()) return toast('กรุณาระบุเหตุผลในหมายเหตุ','err');
      const label = {approve:'อนุมัติเก็บเข้าสต๊อก', reject:'ส่งกลับซ่อมแก้', scrap:'ตัดจำหน่าย'}[kind];
      confirmDialog(label, `ยืนยัน "${label}" งาน ${job.no} ?`, ()=>{
        const now = Date.now(), note = ui.supNote.trim();
        job.approver = ui.sup; job.decisionNote = note; job.decidedAt = now;
        if (kind==='approve'){ job.status='approved'; job.approverSignature = ui.sig.signature; }
        else if (kind==='scrap'){ job.status='scrapped'; }
        else { job.status='repairing'; job.rejectNote = note; job.proposed = null; job.decidedAt = null; }
        job.history.push({at:now, by:ui.sup, action:{approve:'approved',reject:'rejected',scrap:'scrapped'}[kind], note});
        delete _rpUI[id];
        toast(label+'แล้ว','ok'); commit();
      }, 'ยืนยัน', kind==='scrap');
    };
    card.appendChild(h('div', {style:{display:'flex', flexDirection:'column', gap:'8px', marginTop:'14px'}},
      canApprove ? h('button', {class:'btn', onclick:()=>decide('approve')}, '✔ อนุมัติเก็บเข้าสต๊อก') : null,
      h('button', {class:'btn secondary', onclick:()=>decide('reject')}, '↩ ส่งกลับซ่อมแก้'),
      h('button', {class:'btn danger', onclick:()=>decide('scrap')}, 'ตัดจำหน่าย (ซ่อมไม่ได้)')
    ));
    wrap.appendChild(card);
  }

  if (st==='approved' || st==='scrapped'){
    wrap.appendChild(h('div', {class:'card', style:{borderLeft:'4px solid '+(st==='approved'?'var(--ok)':'var(--danger)')}},
      h('div', {class:'card-title'}, st==='approved' ? '✔ อนุมัติให้เก็บเข้าสต๊อก' : 'ตัดจำหน่าย (ไม่เข้าสต๊อก)'),
      h('div', {class:'kv-list'},
        h('div',{class:'kv'}, h('b',{},'โดย'), job.approver||'-'),
        h('div',{class:'kv'}, h('b',{},'เมื่อ'), job.decidedAt?fmtDateTimeTH(job.decidedAt):'-'),
        job.decisionNote ? h('div',{class:'kv'}, h('b',{},'หมายเหตุ'), job.decisionNote) : null
      ),
      job.approverSignature ? h('img', {src:job.approverSignature, style:{width:'100%', maxWidth:'220px', background:'#fff', borderRadius:'8px', border:'1px solid var(--border)', marginTop:'8px'}}) : null
    ));
    wrap.appendChild(h('button', {class:'btn secondary no-print', onclick:()=>window.print()}, '🖨 พิมพ์ / PDF'));
  }

  // history
  wrap.appendChild(h('div', {class:'section-title'}, 'ประวัติ'));
  const labels = {created:'เปิดงานซ่อม', progress:'บันทึกความคืบหน้า', submitted:'ส่งขออนุมัติ', approved:'อนุมัติเก็บเข้าสต๊อก', rejected:'ส่งกลับซ่อมแก้', scrapped:'ตัดจำหน่าย'};
  const hist = h('div', {class:'card'});
  [...job.history].reverse().forEach(e=>{
    hist.appendChild(h('div', {class:'rp-log'},
      h('small', {}, `${fmtDateTimeTH(e.at)} • ${e.by}`),
      h('div', {style:{whiteSpace:'pre-line'}}, h('b', {}, labels[e.action]||e.action), e.note ? ': '+e.note : '')
    ));
  });
  wrap.appendChild(hist);
  return wrap;
};
