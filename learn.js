/* ============================================================
   KNOWLEDGE MODE (ความรู้งานผลิต) — review material for new staff
   Loaded after main.js + knowledge-data.js. Reference built from the
   factory's "ปริมาณวัตถุดิบ" sheets (see knowledge-data.js), plus a quiz.

   The numbers are editable (✏️ in the top bar). Edits are saved on this device
   (localStorage) and synced to Firestore doc qc_meta/knowledge so every device
   gets the update. "รีเซ็ต" goes back to the values shipped in knowledge-data.js.
   ============================================================ */

const LN_KEY = 'qc_knowledge_v1';
const LN_SECTIONS = ['mix', 'ring', 'wire', 'plate'];
const KNOWLEDGE_DEFAULT = JSON.parse(JSON.stringify(KNOWLEDGE));
const LN = {edit:false, syncing:false};

const LEARN_TOPICS = [
  {view:'learnMix',   icon:'🧱', title:'สูตรคอนกรีต (Mix Design)', sub:'ปูน หิน ทราย น้ำ น้ำยา ของสินค้าแต่ละชนิด', get upd(){ return KNOWLEDGE.mix.update; }},
  {view:'learnRing',  icon:'⭕', title:'ปลอกแหวน',               sub:'จำนวนคู่ปลอกแหวนตามความยาวเสาเข็ม',          get upd(){ return KNOWLEDGE.ring.update; }},
  {view:'learnWire',  icon:'🧵', title:'PC Wire',                 sub:'จำนวนเส้นลวด 4 / 5 มม. ตามความยาวเสา',        get upd(){ return KNOWLEDGE.wire.update; }},
  {view:'learnPlate', icon:'🔩', title:'หัวเพลท & ขาเพลท',        sub:'เหล็กเพลท และเหล็กหนวดกุ้ง (ตัว L)',          get upd(){ return KNOWLEDGE.plate.update; }}
];

/* ---------------- storage + sync ---------------- */
function lnApply(data){ LN_SECTIONS.forEach(k=>{ if (data && data[k]) KNOWLEDGE[k] = data[k]; }); }
(function(){ const o = load(LN_KEY, null); if (o && o.data) lnApply(o.data); })();

function lnCloudOn(){
  return typeof FIREBASE_CONFIGURED !== 'undefined' && FIREBASE_CONFIGURED && typeof firebase !== 'undefined' && !!firebase.firestore;
}
function lnPersist(){
  const data = JSON.parse(JSON.stringify(KNOWLEDGE));
  const savedAt = Date.now();
  save(LN_KEY, {data, savedAt});
  if (lnCloudOn()){
    try{
      cloudDocRef('knowledge').set({json: JSON.stringify(data), savedAt})
        .catch(err=>{ console.error(err); toast('บันทึกในเครื่องนี้แล้ว แต่ส่งให้เครื่องอื่นไม่สำเร็จ','err'); });
    }catch(err){ console.error(err); }
  }
}
// Pull edits made on other devices. Started lazily when the knowledge tab opens.
function lnStartSync(){
  if (LN.syncing || !lnCloudOn()) return;
  LN.syncing = true;
  let attached = false;
  firebase.auth().onAuthStateChanged(user=>{
    if (!user || attached) return;
    attached = true;
    try{
      cloudDocRef('knowledge').onSnapshot(snap=>{
        if (!snap.exists) return;
        const d = snap.data();
        const local = load(LN_KEY, null);
        if (!d.json || (local && local.savedAt >= d.savedAt)) return;
        try{
          const data = JSON.parse(d.json);
          lnApply(data);
          save(LN_KEY, {data, savedAt: d.savedAt});
          if (state.tab === 'learn' && !LN.edit) safeRender();
        }catch(err){ console.error('bad knowledge doc', err); }
      }, err=>console.warn('knowledge listener failed', err));
    }catch(err){ console.warn(err); }
  });
}
function lnReset(){
  if (!confirm('รีเซ็ตตัวเลขทุกหัวข้อกลับเป็นค่าตั้งต้น?\n(การแก้ไขที่ทำไว้ทั้งหมดจะหายไป และเครื่องอื่นจะถูกรีเซ็ตด้วย)')) return;
  lnApply(JSON.parse(JSON.stringify(KNOWLEDGE_DEFAULT)));
  lnPersist();
  toast('รีเซ็ตแล้ว');
  render();
}

/* ---------------- helpers ---------------- */
function lnNum(v, d=2){
  if (v == null || v === '-' || v === '') return '–';
  if (typeof v !== 'number') return String(v);
  return String(Math.round(v * 10**d) / 10**d);
}
function lnParse(s, text){
  s = String(s).trim();
  if (text) return s;
  if (s === '') return '-';
  const n = Number(s.replace(/,/g, ''));
  return isNaN(n) ? s : n;
}
const lnRound2 = n => Math.round(n * 100) / 100;

// A value that is plain text normally and an input box in edit mode.
//   opts.d      decimals when shown as text      opts.text   keep what was typed as text
//   opts.zero   store 0 instead of '-' for empty opts.after  recalculate other fields (re-renders)
//   opts.w      input width in px
function lnEd(obj, key, opts={}){
  const v = obj[key];
  if (!LN.edit) return opts.show ? opts.show(v) : lnNum(v, opts.d == null ? 2 : opts.d);
  const inp = h('input', {class:'ln-in', type:'text', inputmode: opts.text ? 'text' : 'decimal', value: v == null ? '' : String(v),
    style:{width:(opts.w || 72) + 'px'},
    onfocus:(e)=>e.target.select(),
    onchange:(e)=>{
      let nv = lnParse(e.target.value, opts.text);
      if (opts.zero && nv === '-') nv = 0;
      obj[key] = nv;
      if (opts.after){ opts.after(); }
      lnPersist();
      if (opts.after) render();
    }});
  return inp;
}
function lnUpdated(K){
  return h('div', {class:'ln-upd'}, 'ข้อมูลอัปเดต ', lnEd(K, 'update', {text:true, w:130}), ' · จากเอกสารมาตรฐานโรงงาน');
}
function lnTable(head, rows){
  return h('div', {class:'ln-table-wrap'},
    h('table', {class:'ln-table'},
      h('thead', {}, h('tr', {}, head.map(t=>h('th', {}, t)))),
      h('tbody', {}, rows.map(r=>h('tr', {class: r._hl ? 'hl' : ''}, r.cells.map((c,i)=>h('td', {class: i===0 ? 'first' : ''}, c)))))
    )
  );
}
function lnTip(text){ return h('div', {class:'ln-tip'}, h('b', {}, '💡 จำไว้ '), text); }
// Top-bar ✏️ toggles edit mode; the banner explains it and offers reset.
function lnEditChrome(wrap){
  state.chrome.menu = {icon: LN.edit ? '✔' : '✏️', action:()=>{ LN.edit = !LN.edit; render(); }};
  if (!LN.edit) return;
  wrap.appendChild(h('div', {class:'ln-edit-banner'},
    h('div', {}, h('b', {}, '✏️ โหมดแก้ไข'), ' แตะที่ตัวเลขเพื่อแก้ ระบบบันทึกให้ทันทีและส่งให้เครื่องอื่นด้วย'),
    h('div', {class:'bt'},
      h('button', {class:'btn small', onclick:()=>{ LN.edit = false; render(); }}, 'เสร็จสิ้น'),
      h('button', {class:'btn secondary small', onclick:lnReset}, 'รีเซ็ตเป็นค่าตั้งต้น')
    )
  ));
}

/* ---------------- home ---------------- */
VIEWS.learnHome = function(){
  LN.edit = false;
  lnStartSync();
  state.chrome.title = 'ความรู้งานผลิต';
  state.chrome.subtitle = 'ไว้ทบทวนสำหรับพนักงาน';
  const wrap = h('div', {class:'ln-home'});
  wrap.appendChild(h('div', {class:'ln-hero'},
    h('div', {class:'t'}, 'ทบทวนก่อนเริ่มงาน'),
    h('div', {class:'s'}, 'เลือกหัวข้อที่ต้องการดู หรือกดทำแบบทดสอบเพื่อเช็กความจำ')
  ));
  LEARN_TOPICS.forEach(t=>{
    wrap.appendChild(h('div', {class:'card ln-topic', onclick:()=>go(t.view)},
      h('div', {class:'ic'}, t.icon),
      h('div', {class:'tx'}, h('div', {class:'tt'}, t.title), h('div', {class:'ts'}, t.sub), h('div', {class:'tu'}, 'อัปเดต ' + t.upd)),
      h('div', {class:'chev'}, '›')
    ));
  });
  wrap.appendChild(h('div', {class:'card ln-topic quiz', onclick:()=>go('learnQuiz')},
    h('div', {class:'ic'}, '📝'),
    h('div', {class:'tx'}, h('div', {class:'tt'}, 'ทำแบบทดสอบ'), h('div', {class:'ts'}, 'สุ่มโจทย์ 10 ข้อ จากข้อมูลทุกหัวข้อ')),
    h('div', {class:'chev'}, '›')
  ));
  wrap.appendChild(h('div', {class:'ln-hint'}, 'หัวหน้าแก้ตัวเลขได้ในแต่ละหัวข้อ โดยกดปุ่ม ✏️ มุมขวาบน'));
  return wrap;
};

/* ---------------- mix design ---------------- */
// Total weight = every ingredient (water & admixture included), as in the sheet.
function lnMixTotal(r){
  r.total = lnRound2(['cement','s1','s34','s38','sand','adm','water'].reduce((s,k)=>s + (typeof r[k] === 'number' ? r[k] : 0), 0));
}
VIEWS.learnMix = function(){
  state.chrome.title = 'สูตรคอนกรีต';
  state.chrome.subtitle = 'Mix Design · กก. ต่อ 1 ลบ.ม.';
  const M = KNOWLEDGE.mix;
  const st = VIEWS.learnMix._s || (VIEWS.learnMix._s = {i:0, full:false});
  if (st.i >= M.rows.length) st.i = 0;
  if (LN.edit) st.full = false;
  const wrap = h('div', {class:'ln-page'});
  lnEditChrome(wrap);
  const body = h('div', {});

  const draw = ()=>{
    body.replaceChildren();
    if (st.full){
      body.appendChild(lnTable(
        ['สูตร','สินค้า','สูตรบนแพล้น','Slump','ปูน','หิน 1"','หิน 3/4"','หิน 3/8"','ทราย','น้ำยา (ล.)','น้ำ','รวม'],
        M.rows.map(r=>({cells:[r.label, r.name, r.formula, r.slump, lnNum(r.cement), lnNum(r.s1), lnNum(r.s34), lnNum(r.s38), lnNum(r.sand), lnNum(r.adm), lnNum(r.water), lnNum(r.total)]}))
      ));
      return;
    }
    const r = M.rows[st.i];
    const ings = [['ปูนผง','cement','กก.'], ['หิน 1 นิ้ว','s1','กก.'], ['หิน 3/4 นิ้ว','s34','กก.'], ['หิน 3/8 นิ้ว','s38','กก.'],
                  ['ทราย','sand','กก.'], ['น้ำยาผสมเพิ่ม','adm','ลิตร'], ['น้ำ','water','กก.']];
    const unit = (u)=>' ' + u;
    const card = h('div', {class:'card ln-detail'});
    if (LN.edit){
      card.append(
        h('div', {class:'ln-meta'}, h('span', {}, 'รหัส'), lnEd(r, 'label', {text:true, w:90})),
        h('div', {class:'ln-meta'}, h('span', {}, 'สินค้า'), lnEd(r, 'name', {text:true, w:230})),
        h('div', {class:'ln-meta'}, h('span', {}, 'สูตรบนแพล้น'), lnEd(r, 'formula', {text:true, w:110})),
        h('div', {class:'ln-meta'}, h('span', {}, 'ต้องการ'), lnEd(r, 'need', {text:true, w:150})),
        h('div', {class:'ln-meta'}, h('span', {}, 'Slump (ซม.)'), lnEd(r, 'slump', {text:true, w:110})),
        h('div', {class:'ln-meta'}, h('span', {}, 'แอมป์สลัมป์ (%)'), lnEd(r, 'amp', {w:80})),
        h('div', {class:'ln-meta'}, h('span', {}, 'ชื่อน้ำยา'), lnEd(r, 'admName', {text:true, w:110}))
      );
    } else {
      card.append(
        h('div', {class:'ln-dt'}, r.label + ' · ' + r.name),
        h('div', {class:'ln-slump'}, 'สูตรบนแพล้น ', h('b', {}, r.formula), ' · ต้องการ ', h('b', {}, r.need), h('br'), 'Slump ', h('b', {}, r.slump), ' ซม. · ค่าแอมป์สลัมป์ ', h('b', {}, r.amp + '%'))
      );
    }
    card.appendChild(h('div', {class:'ln-ing'},
      ings.filter(x=>LN.edit || (r[x[1]] !== '-' && r[x[1]] != null)).map(x=>h('div', {class:'row'},
        h('span', {}, x[0] === 'น้ำยาผสมเพิ่ม' ? 'น้ำยา ' + r.admName : x[0]),
        h('b', {}, lnEd(r, x[1], {d:3, after:()=>lnMixTotal(r)}), unit(x[2]))
      ))
    ));
    card.appendChild(h('div', {class:'ln-total'}, h('span', {}, 'น้ำหนักรวม'), h('b', {}, lnEd(r, 'total', {d:2}), unit('กก.'))));
    if (LN.edit) card.appendChild(h('div', {class:'ln-hint'}, 'น้ำหนักรวมคำนวณใหม่อัตโนมัติเมื่อแก้ส่วนผสม (แก้ทับเองได้)'));
    body.appendChild(card);
  };

  const pick = h('div', {class:'filter-chips'});
  const drawChips = ()=>{
    pick.replaceChildren(
      ...M.rows.map((r,i)=>h('button', {class:'filter-chip' + (!st.full && st.i===i ? ' active' : ''), onclick:()=>{ st.i=i; st.full=false; drawChips(); draw(); }}, r.label)),
      LN.edit ? null : h('button', {class:'filter-chip' + (st.full ? ' active' : ''), onclick:()=>{ st.full=true; drawChips(); draw(); }}, 'ดูตารางรวม')
    );
  };
  drawChips(); draw();
  wrap.append(pick, body, h('div', {class:'ln-tip'}, h('b', {}, '💡 จำไว้ '), lnEd(M, 'note', {text:true, w:280, show:v=>v})), lnUpdated(M));
  return wrap;
};

/* ---------------- ring (ปลอกแหวน) ---------------- */
VIEWS.learnRing = function(){
  state.chrome.title = 'ปลอกแหวน';
  state.chrome.subtitle = 'จำนวนคู่ตามความยาวเสาเข็ม';
  const R = KNOWLEDGE.ring;
  const st = VIEWS.learnRing._s || (VIEWS.learnRing._s = {t:'I-18', len:null});
  if (!R.rings.some(x=>x.type===st.t)) st.t = R.rings[0].type;
  const wrap = h('div', {class:'ln-page'});
  lnEditChrome(wrap);
  const body = h('div', {});

  const draw = ()=>{
    const ring = R.rings.find(x=>x.type===st.t);
    body.replaceChildren();
    body.appendChild(h('div', {class:'ln-sub'}, lnEd(ring, 'title', {text:true, w:280, show:v=>v})));
    const sel = !LN.edit && ring.rows.find(r=>r[0]===st.len);
    if (sel){
      body.appendChild(h('div', {class:'card ln-result'},
        h('div', {class:'q'}, ring.type + ' ยาว ' + lnNum(sel[0]) + ' ม. ต้องใช้ปลอกแหวน'),
        h('div', {class:'big'}, lnNum(sel[3]), h('span', {}, ' คู่')),
        h('div', {class:'brk'}, 'หัว A+B (รวม 2 ด้าน) ', h('b', {}, lnNum(sel[1])), ' คู่  +  ช่วงกลาง C ', h('b', {}, lnNum(sel[2])), ' คู่')
      ));
    } else if (!LN.edit){
      body.appendChild(h('div', {class:'ln-hint'}, 'แตะแถวในตาราง เพื่อดูสรุปของความยาวนั้น'));
    }
    const total = (row)=>{ if (typeof row[1] === 'number' && typeof row[2] === 'number') row[3] = lnRound2(row[1] + row[2]); };
    body.appendChild(lnTable(
      ['ยาว (ม.)','หัว A+B (คู่)','ช่วงกลาง C (คู่)','รวม (คู่)'],
      ring.rows.map(r=>({_hl: !LN.edit && r[0]===st.len, cells:[
        lnEd(r, 0, {w:60}), lnEd(r, 1, {after:()=>total(r)}), lnEd(r, 2, {after:()=>total(r)}), LN.edit ? lnEd(r, 3) : h('b', {}, lnNum(r[3]))
      ]}))
    ));
    if (LN.edit) body.appendChild(h('div', {class:'ln-hint'}, 'รวม (คู่) = หัว A+B + ช่วงกลาง C คำนวณให้อัตโนมัติ'));
    else body.querySelectorAll('tbody tr').forEach((tr,i)=>{
      tr.addEventListener('click', ()=>{ st.len = ring.rows[i][0]; draw(); });
    });
  };
  const chips = h('div', {class:'filter-chips'});
  const drawChips = ()=>{
    chips.replaceChildren(...R.rings.map(x=>h('button', {class:'filter-chip' + (st.t===x.type ? ' active' : ''), onclick:()=>{ st.t=x.type; st.len=null; drawChips(); draw(); }}, x.type)));
  };
  drawChips(); draw();
  wrap.append(chips, body,
    lnTip('ปลอกแหวนนับเป็น "คู่" · ช่วงหัว A+B คือรวมทั้ง 2 ด้านของเสา ส่วนช่วงกลาง C คือช่วงที่เหลือ · เสา I ใช้ลวด 2.50–2.80 มม. ส่วน SQ (มอก.) ใช้ลวด 2.80 มม.'),
    lnUpdated(R));
  return wrap;
};

/* ---------------- PC wire ---------------- */
VIEWS.learnWire = function(){
  state.chrome.title = 'PC Wire';
  state.chrome.subtitle = 'จำนวนเส้นตามชนิดและความยาวเสา';
  const W = KNOWLEDGE.wire;
  const wrap = h('div', {class:'ln-page'});
  lnEditChrome(wrap);
  const groups = [];
  W.rows.forEach(r=>{ let g = groups.find(x=>x.pile===r.pile); if (!g){ g = {pile:r.pile, rows:[]}; groups.push(g); } g.rows.push(r); });
  groups.forEach(g=>{
    wrap.appendChild(h('div', {class:'card ln-group'},
      h('div', {class:'ln-gt'}, g.pile),
      lnTable(['ความยาว (ม.)','ลวด 4 มม. (เส้น)','ลวด 5 มม. (เส้น)'],
        g.rows.map(r=>({cells:[
          lnEd(r, 'len', {text:true, w:110, show:v=>v}),
          LN.edit ? lnEd(r, 'w4', {zero:true}) : h('b', {}, lnNum(r.w4)),
          LN.edit ? lnEd(r, 'w5', {zero:true}) : (r.w5 ? h('b', {}, lnNum(r.w5)) : '–')
        ]})))
    ));
  });
  wrap.append(lnTip('เสาสั้นใช้ลวดน้อยเส้นกว่า เสายาวใช้เพิ่ม · ช่วงยาวมากๆ (เช่น 12–14 ม.) จะมีลวด 5 มม. เพิ่มเข้ามา'), lnUpdated(W));
  return wrap;
};

/* ---------------- plate + shrimp-whisker bars ---------------- */
VIEWS.learnPlate = function(){
  state.chrome.title = 'หัวเพลท & ขาเพลท';
  state.chrome.subtitle = 'มาตรฐานโรงงาน';
  const P = KNOWLEDGE.plate;
  const wrap = h('div', {class:'ln-page'});
  lnEditChrome(wrap);
  wrap.appendChild(h('div', {class:'card ln-group'},
    h('div', {class:'ln-gt'}, 'เหล็กเพลท (หัวเสา)'),
    lnTable(['เสา','หนา (มม.)','น.น./แผ่น สำเร็จรูป (กก.)','ตัดได้ (แผ่น / 1.5×6 ม.)'],
      P.plates.map(p=>({cells:[lnEd(p, 'pile', {text:true, w:70, show:v=>v}), lnEd(p, 'thick'), LN.edit ? lnEd(p, 'kg', {d:3}) : h('b', {}, lnNum(p.kg, 3)), lnEd(p, 'perSheet')]})))
  ));
  wrap.appendChild(h('div', {class:'card ln-group'},
    h('div', {class:'ln-gt'}, 'เหล็กหนวดกุ้ง (ขาเพลท ตัว L)'),
    lnTable(['เสา','ยาวเสา (ม.)','ขนาดเหล็ก','ยาว (ซม.)','จำนวน','น.น.มาตรฐาน (กก.)'],
      P.legs.map(l=>({cells:[lnEd(l, 'pile', {text:true, w:70, show:v=>v}), lnEd(l, 'len', {text:true, w:100, show:v=>v}), lnEd(l, 'bar', {text:true, w:110, show:v=>v}),
        lnEd(l, 'cm'), lnEd(l, 'n', {text:true, w:70, show:v=>v}), LN.edit ? lnEd(l, 'std', {d:3}) : h('b', {}, lnNum(l.std, 3))]})))
  ));
  wrap.append(lnTip('เหล็กหนวดกุ้ง I-22 ใช้ 2 ขนาดผสมกัน: RB9 จำนวน 2 เส้น + DB12 จำนวน 2 เส้น'), lnUpdated(P));
  return wrap;
};

/* ---------------- quiz ---------------- */
function lnShuffle(a){ a = a.slice(); for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function lnPickOptions(correct, pool, fmt){
  const uniq = [...new Set(pool.map(v=>fmt(v)))].filter(v=>v !== fmt(correct));
  return lnShuffle([fmt(correct), ...lnShuffle(uniq).slice(0,3)]);
}
function lnBuildQuestions(){
  const K = KNOWLEDGE, qs_ = [];
  const mk = (q, correct, pool, fmt, why)=>{ const f = fmt || (v=>lnNum(v,3)); const opts = lnPickOptions(correct, pool, f); if (opts.length >= 3) qs_.push({q, opts, ans:f(correct), why}); };
  K.mix.rows.forEach(r=>{
    mk(`สูตร ${r.label} (${r.name}) ใช้ปูนกี่ กก. ต่อ 1 ลบ.ม.?`, r.cement, K.mix.rows.map(x=>x.cement), v=>lnNum(v)+' กก.', 'ดูที่หัวข้อ สูตรคอนกรีต');
    mk(`สูตร ${r.label} (${r.name}) ใช้น้ำกี่ กก.?`, r.water, K.mix.rows.map(x=>x.water), v=>lnNum(v)+' กก.', 'ดูที่หัวข้อ สูตรคอนกรีต');
    mk(`สูตร ${r.label} (${r.name}) ค่า Slump เท่าไร?`, r.slump, K.mix.rows.map(x=>x.slump), v=>v+' ซม.', 'Slump คือค่าความข้นเหลวของคอนกรีตสด');
  });
  K.ring.rings.forEach(rg=>{
    lnShuffle(rg.rows).slice(0,3).forEach(row=>{
      mk(`เสา ${rg.type} ยาว ${lnNum(row[0])} ม. ใช้ปลอกแหวนรวมกี่คู่?`, row[3], rg.rows.map(x=>x[3]), v=>lnNum(v,1)+' คู่', `หัว A+B ${lnNum(row[1])} + ช่วงกลาง C ${lnNum(row[2])}`);
    });
  });
  K.wire.rows.forEach(r=>{
    mk(`PC Wire 4 มม. เสา ${r.pile.replace(' (โรงงาน)','')} ยาว ${r.len} ม. ใช้กี่เส้น?`, r.w4, K.wire.rows.map(x=>x.w4), v=>lnNum(v)+' เส้น', 'ดูที่หัวข้อ PC Wire');
  });
  K.plate.plates.forEach(p=>{
    mk(`เหล็กเพลทของเสา ${p.pile} หนากี่ มม.?`, p.thick, K.plate.plates.map(x=>x.thick).concat([4,10]), v=>lnNum(v)+' มม.', 'ดูที่หัวข้อ หัวเพลท');
  });
  K.plate.legs.forEach(l=>{
    mk(`เหล็กหนวดกุ้งของเสา ${l.pile} ใช้ขนาดอะไร?`, l.bar, K.plate.legs.map(x=>x.bar).concat(['RB9 ตัวL','DB12 ตัวL']), v=>v, 'ดูที่หัวข้อ ขาเพลท');
  });
  return lnShuffle(qs_).slice(0,10);
}

VIEWS.learnQuiz = function(){
  state.chrome.title = 'แบบทดสอบ';
  state.chrome.subtitle = 'สุ่ม 10 ข้อ';
  const wrap = h('div', {class:'ln-page'});
  let qsList = lnBuildQuestions(), idx = 0, score = 0;
  const box = h('div', {});
  const draw = ()=>{
    box.replaceChildren();
    if (idx >= qsList.length){
      const pct = Math.round(score / qsList.length * 100);
      box.appendChild(h('div', {class:'card ln-score'},
        h('div', {class:'em'}, pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '📖'),
        h('div', {class:'big'}, `${score} / ${qsList.length}`),
        h('div', {class:'msg'}, pct >= 80 ? 'เยี่ยมมาก จำได้แม่นเลย' : pct >= 50 ? 'ใช้ได้ ลองทบทวนอีกนิดนะ' : 'ลองกลับไปอ่านหัวข้อต่างๆ แล้วทำใหม่อีกครั้ง'),
        h('button', {class:'btn', onclick:()=>{ qsList = lnBuildQuestions(); idx = 0; score = 0; draw(); }}, 'ทำใหม่ (สุ่มโจทย์ใหม่)'),
        h('button', {class:'btn secondary', style:{marginTop:'8px'}, onclick:()=>switchTab('learn')}, 'กลับหน้าความรู้')
      ));
      return;
    }
    const q = qsList[idx];
    let answered = false;
    const fb = h('div', {class:'ln-fb'});
    const opts = h('div', {class:'ln-opts'}, q.opts.map(o=>{
      const b = h('button', {class:'ln-opt', onclick:()=>{
        if (answered) return; answered = true;
        const ok = o === q.ans; if (ok) score++;
        [...opts.children].forEach(c=>{ if (c.textContent === q.ans) c.classList.add('right'); });
        if (!ok) b.classList.add('wrong');
        fb.textContent = (ok ? '✓ ถูกต้อง' : '✗ ยังไม่ถูก · คำตอบคือ ' + q.ans) + (q.why ? ' — ' + q.why : '');
        fb.className = 'ln-fb ' + (ok ? 'ok' : 'bad');
        next.hidden = false;
      }}, o);
      return b;
    }));
    const next = h('button', {class:'btn', hidden:true, onclick:()=>{ idx++; draw(); }}, idx === qsList.length-1 ? 'ดูคะแนน' : 'ข้อถัดไป');
    box.append(
      h('div', {class:'ln-prog'}, h('span', {}, `ข้อ ${idx+1} / ${qsList.length}`), h('span', {}, `ถูก ${score}`)),
      h('div', {class:'ln-bar'}, h('i', {style:{width:(idx/qsList.length*100)+'%'}})),
      h('div', {class:'card ln-q'}, q.q), opts, fb, next
    );
  };
  draw();
  wrap.appendChild(box);
  return wrap;
};
