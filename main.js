/* ============================================================
   QC Precast — mobile QC inspection app
   Vanilla JS, offline-first, localStorage-backed.
   ============================================================ */

/* ---------------- small DOM helper (safe: text nodes by default) ---------------- */
function h(tag, attrs, ...children){
  const el = document.createElement(tag);
  if (attrs && typeof attrs === 'object' && !Array.isArray(attrs) && !attrs.nodeType){
    let hasClick = false, hasRole = false;
    for (const [k,v] of Object.entries(attrs)){
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function'){
        el.addEventListener(k.slice(2), v);
        if (k === 'onclick') hasClick = true;
      }
      else if (k === 'checked' || k === 'disabled' || k === 'hidden') { if (v) el.setAttribute(k,''); }
      else { el.setAttribute(k, v === true ? '' : v); if (k === 'role') hasRole = true; }
    }
    if (hasClick && !hasRole && (tag === 'div' || tag === 'span')){
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.addEventListener('keydown', (e)=>{
        // Only activate on Enter/Space when the div itself (or a plain,
        // non-form descendant) has focus. Otherwise a Enter/Space pressed
        // inside a nested input/textarea/select — e.g. to add a newline in
        // a textarea — would bubble up and wrongly "click" this wrapper
        // (for a modal backdrop, that means the whole modal closes).
        const t = e.target.tagName;
        if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
        if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); el.click(); }
      });
    }
  } else if (attrs != null){
    children = [attrs, ...children];
  }
  for (const c of children.flat(Infinity)){
    if (c == null || c === false || c === undefined) continue;
    el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}
const qs = (s,r=document)=>r.querySelector(s);
const qsa = (s,r=document)=>Array.from(r.querySelectorAll(s));
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }
function esc(s){ return String(s==null?'':s); }

/* ---------------- storage ---------------- */
const KEYS = {
  employees: 'qc_employees_v1',
  templates: 'qc_templates_v1',
  records: 'qc_records_v1',
  draft: 'qc_draft_v1',
  settings: 'qc_settings_v1'
};
function load(key, fallback){
  try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch(e){ console.warn('load fail', key, e); return fallback; }
}
function save(key, val){
  try{ localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch(e){
    console.warn('save fail', key, e);
    toast('บันทึกไม่สำเร็จ (พื้นที่จัดเก็บเต็ม) — ลองลบรูปภาพเก่าในเมนูตั้งค่า', 'err');
    return false;
  }
}

/* ---------------- default seed data ---------------- */
const DEFAULT_EMPLOYEES = [
  {id: uid(), name:'ธนชัย ยามดี', role:'ผู้ตรวจสอบคุณภาพ (QC)'},
  {id: uid(), name:'อดิชัย สุขสมวัฒน์', role:'ผู้ตรวจสอบคุณภาพ (QC)'}
];

function seq(prefix, from, to){ const a=[]; for(let i=from;i<=to;i++) a.push(`${prefix} ${i}`); return a; }

const PILE_A_SECTIONS = () => ([
  {id:uid(), title:'1. ความยาวเสาเข็ม', fields:[
    {id:uid(), label:'ความยาวเสาเข็ม', type:'number', unit:'ซม.'}
  ]},
  {id:uid(), title:'2. ความหนาคอนกรีตหุ้ม', fields:[
    {id:uid(), label:'บนซ้าย', type:'number', unit:'ซม.'},
    {id:uid(), label:'บนขวา', type:'number', unit:'ซม.'},
    {id:uid(), label:'ล่างซ้าย', type:'number', unit:'ซม.'},
    {id:uid(), label:'ล่างขวา', type:'number', unit:'ซม.'}
  ]},
  {id:uid(), title:'3. จำนวน Pcwire และระยะยืด', fields:[
    {id:uid(), label:'ขนาด', type:'number', unit:'มม.'},
    {id:uid(), label:'จำนวน', type:'number', unit:'เส้น'},
    {id:uid(), label:'ระยะยืด', type:'number', unit:'ซม.'}
  ]},
  {id:uid(), title:'4. ระยะห่างเหล็กปลอก และการยึดแน่น', fields:[
    {id:uid(), label:'ช่วง A (@0.05)', type:'pass'},
    {id:uid(), label:'ช่วง B (@0.15)', type:'pass'},
    {id:uid(), label:'ช่วง C (@0.25)', type:'pass'}
  ]},
  {id:uid(), title:'5. ลักษณะเหล็กปลอก และจำนวนช่วงต่างๆ', fields:[
    {id:uid(), label:'ช่วง A (เส้น)', type:'number'},
    {id:uid(), label:'ช่วง B (เส้น)', type:'number'},
    {id:uid(), label:'ช่วง C (เส้น)', type:'number'}
  ]},
  {id:uid(), title:'6. การฉีดน้ำมัน และความสะอาด', fields:[
    {id:uid(), label:'การฉีดน้ำมันและความสะอาดแบบหล่อ', type:'pass'}
  ]},
  {id:uid(), title:'7. การวางหัวต่อเชื่อมและหัวแบ่ง', fields:[
    {id:uid(), label:'ลักษณะหัวต่อ', type:'select', options:['มีหัวต่อ','ไม่มีหัวต่อ']}
  ]},
  {id:uid(), title:'8. เหล็กเสริมพิเศษตาม PO', fields:[
    {id:uid(), label:'การใส่จำนวนเหล็กเสริมพิเศษตาม PO', type:'pass'}
  ]},
  (()=>{
    const startT = {id:uid(), label:'เวลาเริ่มเท', type:'time'};
    const endT = {id:uid(), label:'เวลาเสร็จ', type:'time'};
    return {id:uid(), title:'9. การเทคอนกรีต', fields:[
      startT, endT,
      {id:uid(), label:'ระยะเวลารวมในการเทคอนกรีต', type:'duration', startFieldId:startT.id, endFieldId:endT.id},
      {id:uid(), label:'เวลาที่ตัดลวดได้', type:'time'}
    ]};
  })()
]);

function makeDefaultTemplates(){
  return [
    {
      id:'t_floor_hex_in', reportType:'inprocess', icon:'🧱',
      name:'แผ่นพื้น / เสาหกเหลี่ยม', line:'โรงผลิตแผ่นพื้น, เสาหกเหลี่ยม',
      autoNumberPrefix:'', presetPieces:['แผ่นพื้นแพที่ 1','แผ่นพื้นแพที่ 2','แผ่นพื้นแพที่ 3','แผ่นพื้นแพที่ 4','หกเหลี่ยมแพที่ 1','หกเหลี่ยมแพที่ 2','หกเหลี่ยมแพที่ 3','หกเหลี่ยมแพที่ 4'],
      sections:[
        {id:uid(), title:'1. ขนาดระบุ', fields:[
          {id:uid(), label:'ตรวจสอบความยาวก่อนเท (ทุกล็อค)', type:'number', unit:'ซม.'}
        ]},
        {id:uid(), title:'2. แบบหล่อ', fields:[
          {id:uid(), label:'ความสะอาด', type:'pass'},
          {id:uid(), label:'น้ำยาทาแบบ', type:'pass'},
          {id:uid(), label:'หูยก / หูกลาง ครบถูกต้อง', type:'pass'}
        ]},
        {id:uid(), title:'3. จำนวน Pcwire และระยะยืด', fields:[
          {id:uid(), label:'จำนวน', type:'number', unit:'เส้น'},
          {id:uid(), label:'ระยะยืด', type:'number', unit:'ซม.'}
        ]},
        (()=>{
          const startT = {id:uid(), label:'เวลาเริ่มเท', type:'time'};
          const endT = {id:uid(), label:'เวลาเทเสร็จ', type:'time'};
          return {id:uid(), title:'4. การเทคอนกรีต', fields:[
            startT, endT,
            {id:uid(), label:'ระยะเวลารวมในการเทคอนกรีต', type:'duration', startFieldId:startT.id, endFieldId:endT.id},
            {id:uid(), label:'เวลาตัดลวด', type:'time'}
          ]};
        })(),
        {id:uid(), title:'5. ลักษณะทั่วไป และตราปั้มขนาด', fields:[
          {id:uid(), label:'ลักษณะทั่วไป', type:'pass'},
          {id:uid(), label:'ตราปั้มขนาด', type:'pass'}
        ]},
        {id:uid(), title:'6. ความยาวแผ่นพื้นหลังเทเสร็จ', fields:[
          {id:uid(), label:'ความยาวหลังเทเสร็จ (ทุกล็อค)', type:'number', unit:'ซม.'}
        ]}
      ]
    },
    {
      id:'t_pile_a_in', reportType:'inprocess', icon:'🏗️',
      name:'เสาเข็ม โรงผลิต A (เสาใหญ่)', line:'โรงผลิตเสาใหญ่ A',
      autoNumberPrefix:'', presetPieces:['A1(I-22)','A2(I-22)','A3(I-22)','A4(I-22)','A5(I-22/I-26)','A6(I-22)','A7(I-22)','A8(I-22)','A9(I-26)','A10(I-26)','A11(I-26)','A12(I-22)'],
      sections: PILE_A_SECTIONS()
    },
    {
      id:'t_pile_b_in', reportType:'inprocess', icon:'🏗️',
      name:'เสาเข็ม โรงผลิต B (เสาเล็ก)', line:'โรงผลิตเสาเล็ก B',
      autoNumberPrefix:'', presetPieces:['B1(I-15)','B2(I-15)','B3(I-15)','B4(I-15)','B5(I-18)','B6(I-18)','B7(I-18)','B8(I-18/I-15)','B9(I-18)','B10(I-18/I-15)','B11(I-15)'],
      sections: PILE_A_SECTIONS()
    },
    {
      id:'t_fence_in', reportType:'inprocess', icon:'🧱',
      name:'แผ่นรั้วสำเร็จ', line:'แผ่นรั้วสำเร็จ',
      autoNumberPrefix:'', presetPieces:[...seq('แผ่นผนังรั้วสำเร็จ',1,12), ...seq('เสารั้วสำเร็จ',1,3), ...seq('ทับหลังรั้วสำเร็จ',1,3)],
      sections:[
        {id:uid(), title:'1. แบบหล่อ', fields:[
          {id:uid(), label:'ความสะอาด', type:'pass'},
          {id:uid(), label:'น้ำยาทาแบบ', type:'pass'},
          {id:uid(), label:'การวางท่อ', type:'pass'}
        ]},
        {id:uid(), title:'2. จำนวน Pcwire และระยะยืด', fields:[
          {id:uid(), label:'จำนวน', type:'number', unit:'เส้น'},
          {id:uid(), label:'ระยะยืด', type:'number', unit:'มม.'}
        ]},
        (()=>{
          const startT = {id:uid(), label:'เวลาเริ่มเท', type:'time'};
          const endT = {id:uid(), label:'เวลาเทเสร็จ', type:'time'};
          return {id:uid(), title:'3. การเทคอนกรีต', fields:[
            startT, endT,
            {id:uid(), label:'ระยะเวลารวมในการเทคอนกรีต', type:'duration', startFieldId:startT.id, endFieldId:endT.id},
            {id:uid(), label:'เวลาที่ตัดลวดได้', type:'time'}
          ]};
        })(),
        {id:uid(), title:'4. ลักษณะทั่วไป', fields:[
          {id:uid(), label:'รูพรุน', type:'pass'},
          {id:uid(), label:'ระยะรูกลวง', type:'pass'},
          {id:uid(), label:'ไม่มีครีบปูน', type:'pass'},
          {id:uid(), label:'รอยร้าว', type:'pass'},
          {id:uid(), label:'คราบดำ', type:'pass'}
        ]}
      ]
    },
    {
      id:'t_floor_post', reportType:'postprocess', icon:'✅',
      name:'แผ่นพื้นสำเร็จ (หลังผลิต)', line:'แผ่นพื้นสำเร็จ',
      autoNumberPrefix:'แผ่นพื้นสำเร็จ', presetPieces:[],
      sections:[
        {id:uid(), title:'รายการตรวจ', fields:[
          {id:uid(), label:'ความยาว', type:'number', unit:'มม.'},
          {id:uid(), label:'ความหนา', type:'number', unit:'มม.'},
          {id:uid(), label:'หูยก/หูกลาง ครบถ้วน', type:'pass'},
          {id:uid(), label:'ระยะหูยก/หูกลาง ถูกต้อง', type:'pass'},
          {id:uid(), label:'การเลื่อนของ Pcwire', type:'pass'},
          {id:uid(), label:'ความโก่ง', type:'pass'},
          {id:uid(), label:'ลักษณะทั่วไป', type:'pass'},
          {id:uid(), label:'ลักษณะการเก็บกอง', type:'pass'},
          {id:uid(), label:'การปั้มความยาว', type:'pass'}
        ]}
      ]
    },
    {
      id:'t_hex_post', reportType:'postprocess', icon:'✅',
      name:'เสาหกเหลี่ยม (หลังผลิต)', line:'เสาหกเหลี่ยม',
      autoNumberPrefix:'เสาหกเหลี่ยม', presetPieces:[],
      sections:[
        {id:uid(), title:'รายการตรวจ', fields:[
          {id:uid(), label:'ความยาว', type:'number', unit:'ซม.'},
          {id:uid(), label:'มิติของเสา', type:'text'},
          {id:uid(), label:'หูยก', type:'pass'},
          {id:uid(), label:'การเลื่อนของ Pcwire', type:'pass'},
          {id:uid(), label:'จำนวน Pcwire', type:'number'},
          {id:uid(), label:'ลักษณะทั่วไป', type:'pass'},
          {id:uid(), label:'ลักษณะการเก็บกอง', type:'pass'}
        ]}
      ]
    },
    {
      id:'t_fence_post', reportType:'postprocess', icon:'✅',
      name:'แผ่นรั้ว / ทับหลัง / เสารั้ว (หลังผลิต)', line:'แผ่นรั้วสำเร็จรูปทุกชนิด',
      autoNumberPrefix:'', presetPieces:['แผ่นรั้วสำเร็จรูป','แผ่นทับหลังสำเร็จรูป','เสารั้วสำเร็จรูป'],
      sections:[
        {id:uid(), title:'รายการตรวจ', fields:[
          {id:uid(), label:'ความยาว', type:'number', unit:'มม.'},
          {id:uid(), label:'มิติ', type:'text'},
          {id:uid(), label:'จำนวน Pcwire', type:'number'},
          {id:uid(), label:'ลักษณะทั่วไป (ผิว)', type:'pass'},
          {id:uid(), label:'ลักษณะการเก็บกอง', type:'pass'},
          {id:uid(), label:'ความถูกต้องของข้อชี้บ่ง', type:'pass'}
        ]}
      ]
    },
    {
      id:'t_pile_post', reportType:'postprocess', icon:'✅',
      name:'เสาเข็ม (หลังผลิต)', line:'เสาเข็มทุกขนาด',
      autoNumberPrefix:'', presetPieces:['เสาเข็ม I-15','เสาเข็ม I-18','เสาเข็ม I-22','เสาเข็ม I-22 มอก.','เสาเข็ม I-26','เสาเข็ม S-15 มอก.','เสาเข็ม S-18 มอก.'],
      sections:[
        {id:uid(), title:'รายการตรวจ', fields:[
          {id:uid(), label:'ความยาว', type:'number', unit:'ซม.'},
          {id:uid(), label:'มิติของเสาเข็ม', type:'text'},
          {id:uid(), label:'เหล็กเพลท', type:'pass'},
          {id:uid(), label:'จำนวน Pcwire', type:'number'},
          {id:uid(), label:'ลักษณะทั่วไป', type:'pass'},
          {id:uid(), label:'ลักษณะการเก็บกอง', type:'pass'},
          {id:uid(), label:'ความถูกต้องของข้อชี้บ่ง', type:'pass'}
        ]}
      ]
    }
  ];
}

function ensureSeedLocal(){
  if (load(KEYS.employees, null) == null) save(KEYS.employees, DEFAULT_EMPLOYEES);
  if (load(KEYS.templates, null) == null) save(KEYS.templates, makeDefaultTemplates());
  if (load(KEYS.records, null) == null) save(KEYS.records, []);
}

/* ---------------- cloud sync (Firestore) ---------------- */
const CLOUD = { _templates: undefined, _employees: undefined, _records: undefined };
function cloudErr(err){ console.error('cloud sync error', err); toast('ซิงค์ข้อมูลไม่สำเร็จ ตรวจสอบอินเทอร์เน็ต','err'); }
function cloudDocRef(name){ return firebase.firestore().collection('qc_meta').doc(name); }
function cloudCol(name){ return firebase.firestore().collection(name); }

function initCloudSync(){
  return new Promise((resolve)=>{
    let need = 3, got = 0, doneOnce = false;
    const finish = ()=>{ if (!doneOnce){ doneOnce=true; resolve(); } };
    const bump = ()=>{ got++; if (got>=need) finish(); };
    // Absolute safety net: never let a stuck/slow/broken connection block the app
    // from loading. Whatever happens with Firestore, we proceed after this.
    setTimeout(finish, 6000);

    try{
      if (typeof FIREBASE_CONFIGURED === 'undefined' || !FIREBASE_CONFIGURED){ finish(); return; }
      if (typeof firebase === 'undefined' || !firebase.firestore){
        console.error('Firebase SDK failed to load');
        toast('โหลดระบบซิงค์ไม่สำเร็จ (เครือข่ายอาจบล็อก) กำลังใช้งานแบบออฟไลน์','err');
        finish(); return;
      }
      const db = firebase.firestore();
      try{ db.enablePersistence({synchronizeTabs:true}).catch(()=>{}); }catch(e){}

      let firstTpl=false, firstEmp=false, firstRec=false;

      firebase.auth().onAuthStateChanged(user=>{
        if (!user){
          firebase.auth().signInAnonymously().catch(err=>{
            console.error('anonymous sign-in failed', err);
            toast('เชื่อมต่อระบบซิงค์ไม่สำเร็จ (ทำงานแบบออฟไลน์)','err');
            finish();
          });
          return;
        }
        try{
          db.collection('qc_meta').doc('templates').onSnapshot(snap=>{
            const next = (snap.exists && snap.data().list) || [];
            const changed = JSON.stringify(next) !== JSON.stringify(CLOUD._templates);
            CLOUD._templates = next;
            if (next.length===0 && !snap.metadata.fromCache){ DB.saveTemplates(makeDefaultTemplates()); }
            if (!firstTpl){ firstTpl=true; bump(); }
            if (changed) safeRender();
          }, err=>{ cloudErr(err); if (!firstTpl){ firstTpl=true; bump(); } });

          db.collection('qc_meta').doc('employees').onSnapshot(snap=>{
            const next = (snap.exists && snap.data().list) || [];
            const changed = JSON.stringify(next) !== JSON.stringify(CLOUD._employees);
            CLOUD._employees = next;
            if (next.length===0 && !snap.metadata.fromCache){ DB.saveEmployees(DEFAULT_EMPLOYEES); }
            if (!firstEmp){ firstEmp=true; bump(); }
            if (changed) safeRender();
          }, err=>{ cloudErr(err); if (!firstEmp){ firstEmp=true; bump(); } });

          db.collection('records').orderBy('createdAt','desc').onSnapshot(snap=>{
            const next = snap.docs.map(d=>d.data());
            const changed = JSON.stringify(next) !== JSON.stringify(CLOUD._records);
            CLOUD._records = next;
            if (!firstRec){ firstRec=true; bump(); }
            if (changed) safeRender();
          }, err=>{ cloudErr(err); if (!firstRec){ firstRec=true; bump(); } });
        }catch(err){
          console.error('failed to attach Firestore listeners', err);
          finish();
        }
      }, err=>{ console.error('auth state error', err); finish(); });
    }catch(err){
      console.error('initCloudSync failed', err);
      finish();
    }
  });
}
function updateSyncBadge(){
  const badge = qs('#syncBadge');
  if (!badge || typeof FIREBASE_CONFIGURED === 'undefined' || !FIREBASE_CONFIGURED) return;
  badge.hidden = false;
  const online = navigator.onLine;
  badge.classList.toggle('online', online);
  badge.classList.toggle('offline', !online);
  qs('#syncBadgeText').textContent = online ? 'ออนไลน์' : 'ออฟไลน์';
}

/* ---------------- data access ---------------- */
// Firestore rejects any field whose value is literally `undefined` (throws
// synchronously on .set()), but this app assigns `undefined` freely to mean
// "cleared/unanswered" (e.g. untoggling a pass/fail button). That was always
// harmless for localStorage, since JSON.stringify silently drops undefined
// keys — but the same object handed straight to Firestore's SDK is not
// JSON-serialized first, so those keys survive and the write throws. Route
// every cloud write through a JSON round-trip to strip them, matching the
// behavior localStorage already had.
function stripUndefinedForCloud(obj){ return JSON.parse(JSON.stringify(obj)); }

const DB = {
  employees(){ return (typeof FIREBASE_CONFIGURED !== 'undefined' && FIREBASE_CONFIGURED) ? (CLOUD._employees||[]) : load(KEYS.employees, []); },
  saveEmployees(v){
    if (typeof FIREBASE_CONFIGURED !== 'undefined' && FIREBASE_CONFIGURED){
      CLOUD._employees = v;
      try{ cloudDocRef('employees').set({list: stripUndefinedForCloud(v)}).catch(cloudErr); }catch(err){ cloudErr(err); }
    } else save(KEYS.employees, v);
  },
  templates(){ return (typeof FIREBASE_CONFIGURED !== 'undefined' && FIREBASE_CONFIGURED) ? (CLOUD._templates||[]) : load(KEYS.templates, []); },
  saveTemplates(v){
    if (typeof FIREBASE_CONFIGURED !== 'undefined' && FIREBASE_CONFIGURED){
      CLOUD._templates = v;
      try{ cloudDocRef('templates').set({list: stripUndefinedForCloud(v)}).catch(cloudErr); }catch(err){ cloudErr(err); }
    } else save(KEYS.templates, v);
  },
  template(id){ return this.templates().find(t=>t.id===id); },
  records(){ return (typeof FIREBASE_CONFIGURED !== 'undefined' && FIREBASE_CONFIGURED) ? (CLOUD._records||[]) : load(KEYS.records, []); },
  saveRecords(v){
    if (typeof FIREBASE_CONFIGURED !== 'undefined' && FIREBASE_CONFIGURED){
      const oldIds = new Set((CLOUD._records||[]).map(r=>r.id));
      const newIds = new Set(v.map(r=>r.id));
      CLOUD._records = v;
      try{
        const batch = firebase.firestore().batch();
        v.forEach(r=>batch.set(cloudCol('records').doc(r.id), stripUndefinedForCloud(r)));
        oldIds.forEach(id=>{ if (!newIds.has(id)) batch.delete(cloudCol('records').doc(id)); });
        batch.commit().catch(cloudErr);
      }catch(err){ cloudErr(err); }
    } else save(KEYS.records, v);
  },
  record(id){ return this.records().find(r=>r.id===id); },
  settings(){ return load(KEYS.settings, {theme:'system'}); },
  saveSettings(v){ save(KEYS.settings, v); },
  draft(){
    if (this._draftCache === undefined) this._draftCache = load(KEYS.draft, null);
    return this._draftCache;
  },
  saveDraft(v){ this._draftCache = v; save(KEYS.draft, v); },
  clearDraft(){ this._draftCache = null; localStorage.removeItem(KEYS.draft); },
  _draftCache: undefined
};

/* ---------------- date/format helpers ---------------- */
const TH_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
function todayISO(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function fmtDateTH(iso){
  if (!iso) return '-';
  const d = new Date(iso+'T00:00:00');
  if (isNaN(d)) return iso;
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear()+543}`;
}
function fmtDateTimeTH(ts){
  const d = new Date(ts);
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear()+543} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

/* ---------------- toast ---------------- */
function toast(msg, kind){
  const root = qs('#toastRoot');
  const t = h('div', {class:'toast'+(kind?' '+kind:'')}, msg);
  root.appendChild(t);
  setTimeout(()=>{ t.style.transition='opacity .25s'; t.style.opacity='0'; setTimeout(()=>t.remove(), 250); }, 2200);
}

/* ---------------- modal ---------------- */
function openModal(node, {center=false} = {}){
  const root = qs('#modalRoot');
  root.innerHTML = '';
  const overlay = h('div', {class:'modal-overlay'+(center?' center':''), role:'presentation', onclick:(e)=>{ if (e.target===overlay) closeModal(); }},
    h('div', {class:'modal-sheet'}, node)
  );
  root.appendChild(overlay);
  return overlay;
}
function closeModal(){ qs('#modalRoot').innerHTML=''; }
function confirmDialog(title, msg, onYes, yesLabel='ยืนยัน', danger=true){
  openModal(h('div', {},
    h('div', {class:'modal-title'}, title),
    h('div', {class:'modal-sub'}, msg),
    h('div', {class:'btn-row'},
      h('button', {class:'btn secondary', onclick:closeModal}, 'ยกเลิก'),
      h('button', {class:'btn'+(danger?' danger':''), onclick:()=>{ closeModal(); onYes(); }}, yesLabel)
    )
  ), {center:true});
}

/* ---------------- image helper ---------------- */
function fileToCompressedDataURL(file, maxDim=900, quality=0.72){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let {width, height} = img;
        if (width > maxDim || height > maxDim){
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width*scale); height = Math.round(height*scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ============================================================
   APP STATE / ROUTER
   ============================================================ */
const ROOT_VIEWS = {home:'home', new:'newStart', history:'historyList', settings:'settingsHome'};
const state = {
  tab: 'home',
  stacks: {
    home:[{view:'home'}], new:[{view:'newStart'}],
    history:[{view:'historyList'}], settings:[{view:'settingsHome'}]
  },
  chrome: {title:'QC Precast', subtitle:'', menu:null},
  historyFilter: {status:'all', type:'all', q:''}
};
function currentStack(){ return state.stacks[state.tab]; }
function go(view, params){ currentStack().push({view, params}); render(); }
function replaceTop(view, params){ const st=currentStack(); st[st.length-1] = {view, params}; render(); }
function back(){ const st = currentStack(); if (st.length>1){ st.pop(); render(); } else { switchTab('home'); } }
function switchTab(tab){
  if (state.tab === tab) state.stacks[tab] = [{view: ROOT_VIEWS[tab]}];
  state.tab = tab;
  render();
}
function goCrossTab(tab, view, params){
  state.stacks[tab] = [{view: ROOT_VIEWS[tab]}, {view, params}];
  state.tab = tab;
  render();
}

const VIEWS = {}; // filled below

let _renderGen = 0;
function render(){
  const myGen = ++_renderGen;
  const stack = currentStack();
  const entry = stack[stack.length-1];
  state.chrome = {title:'QC Precast', subtitle:'', menu:null};
  let node;
  try{
    node = VIEWS[entry.view](entry.params||{});
  }catch(e){
    console.error(e);
    node = h('div', {class:'empty'}, h('span',{class:'ic'},'⚠️'), 'เกิดข้อผิดพลาดในการแสดงผล');
  }
  // A view's own guard clause (e.g. "if (!draft) { switchTab('home'); return; }")
  // can call go()/back()/switchTab() while THIS call is still building `node`.
  // That nested call already ran its own render() and painted the correct
  // screen; if we kept going we'd overwrite it with this call's now-stale,
  // often-blank `node`. Bail out whenever a newer render() has since run.
  if (myGen !== _renderGen) return;
  const viewEl = qs('#view');
  viewEl.replaceChildren(node);
  qs('#topbarTitle').textContent = state.chrome.title;
  qs('#topbarSubtitle').textContent = state.chrome.subtitle || '';
  qs('#btnBack').hidden = stack.length <= 1;
  const menuBtn = qs('#btnMenuAction');
  if (state.chrome.menu){
    menuBtn.hidden = false;
    menuBtn.innerHTML = '';
    menuBtn.appendChild(document.createTextNode(state.chrome.menu.icon || '⋮'));
    menuBtn.onclick = state.chrome.menu.action;
  } else { menuBtn.hidden = true; menuBtn.onclick = null; }
  qsa('.tab-item').forEach(b=>b.classList.toggle('active', b.dataset.tab === state.tab));
  viewEl.scrollTop = 0;
}
// Like render(), but skips the rebuild if the user is actively typing in a
// field on the current page — used for background sync updates, so an
// incoming Firestore snapshot (including the echo of this device's own
// just-made edit) never yanks focus out of an input mid-keystroke.
function safeRender(){
  const active = document.activeElement;
  const viewEl = qs('#view');
  const isTypingInView = active && viewEl && viewEl.contains(active) &&
    (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
  const isTypingInModal = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') &&
    qs('#modalRoot').contains(active);
  if (isTypingInView || isTypingInModal) return;
  render();
}

/* ============================================================
   SHARED UI PIECES
   ============================================================ */
function statusChip(status){
  if (status === 'fail') return h('span',{class:'chip fail'},'✗ พบข้อบกพร่อง');
  if (status === 'pending') return h('span',{class:'chip warn'},'◐ ยังไม่ครบ');
  return h('span',{class:'chip ok'},'✓ ผ่าน');
}
function reportTypeLabel(t){ return t === 'inprocess' ? 'ระหว่างผลิต' : 'หลังผลิต'; }
function reportTypeChip(t){ return h('span',{class:'chip brand'}, reportTypeLabel(t)); }

function fieldAnswerText(field, value){
  if (value == null || value === '') return '-';
  if (field.type === 'pass') return value === 'pass' ? 'ผ่าน' : (value === 'fail' ? 'ไม่ผ่าน' : '-');
  if (field.type === 'number') return `${value}${field.unit ? ' '+field.unit : ''}`;
  return String(value);
}

/* ---------------- auto duration (start/end time -> elapsed) ---------------- */
function computeDurationText(piece, field){
  const start = piece.values[field.startFieldId];
  const end = piece.values[field.endFieldId];
  if (!start || !end) return '';
  const [sh,sm] = start.split(':').map(Number);
  const [eh,em] = end.split(':').map(Number);
  if ([sh,sm,eh,em].some(n=>Number.isNaN(n))) return '';
  let mins = (eh*60+em) - (sh*60+sm);
  if (mins < 0) mins += 24*60;
  const hh = Math.floor(mins/60), mm = mins%60;
  return hh>0 ? `${hh} ชม. ${mm} นาที` : `${mm} นาที`;
}
function syncDurationFields(tpl, piece){
  tpl.sections.forEach(sec=>sec.fields.forEach(f=>{
    if (f.type !== 'duration') return;
    const text = computeDurationText(piece, f);
    piece.values[f.id] = text || undefined;
    const el = document.querySelector(`[data-duration-id="${f.id}"]`);
    if (el) el.textContent = text || 'รอกรอกเวลาเริ่ม/เวลาเสร็จ';
  }));
}

function pieceStats(template, piece){
  let total=0, answered=0, fail=0;
  for (const sec of template.sections) for (const f of sec.fields){
    total++;
    const v = piece.values[f.id];
    if (v == null || v === '') continue;
    answered++;
    if (f.type === 'pass' && v === 'fail') fail++;
  }
  return {total, answered, fail, complete: answered===total};
}
function pieceStatus(template, piece){
  const s = pieceStats(template, piece);
  if (s.fail>0) return 'fail';
  if (!s.complete) return 'pending';
  return 'ok';
}
function recordStats(record){
  const tpl = DB.template(record.templateId) || record.templateSnapshot;
  let failPieces=0, okPieces=0, pendingPieces=0;
  for (const p of record.pieces){
    const st = pieceStatus(tpl, p);
    if (st==='fail') failPieces++; else if (st==='pending') pendingPieces++; else okPieces++;
  }
  return {failPieces, okPieces, pendingPieces, total: record.pieces.length};
}
function recordStatus(record){
  const s = recordStats(record);
  if (s.failPieces>0) return 'fail';
  if (s.pendingPieces>0) return 'pending';
  return 'ok';
}

function donutSVG(ok, fail, pending, size=84){
  const total = Math.max(1, ok+fail+pending);
  const r = size/2-8, c = size/2, circ = 2*Math.PI*r;
  let offset = 0;
  const segs = [
    {v:fail, color:'var(--danger)'}, {v:pending, color:'var(--warn)'}, {v:ok, color:'var(--ok)'}
  ];
  const circles = segs.map(s=>{
    const frac = s.v/total, len = frac*circ;
    const el = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${s.color}" stroke-width="10" stroke-dasharray="${len} ${circ-len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${c} ${c})"/>`;
    offset += len;
    return el;
  }).join('');
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--border)" stroke-width="10"/>
    ${circles}
    <text x="${c}" y="${c+5}" text-anchor="middle" font-size="16" font-weight="700" fill="var(--text)">${Math.round(ok/total*100)}%</text>
  </svg>`;
  const wrap = h('div', {class:'donut'});
  wrap.innerHTML = svg;
  return wrap;
}

/* ============================================================
   HOME VIEW
   ============================================================ */
VIEWS.home = function(){
  state.chrome.title = 'QC Precast';
  state.chrome.subtitle = 'ระบบตรวจสอบคุณภาพผลิตภัณฑ์';
  const records = DB.records();
  const today = todayISO();
  const todayRecords = records.filter(r=>r.productionDate===today);
  const todayPieces = todayRecords.reduce((a,r)=>a+r.pieces.length,0);
  const todayFail = todayRecords.reduce((a,r)=>a+recordStats(r).failPieces,0);
  const passRate = todayPieces ? Math.round((todayPieces-todayFail)/todayPieces*100) : 100;
  const draft = DB.draft();

  const wrap = h('div', {});

  wrap.appendChild(h('div', {class:'hero'},
    h('div', {class:'hero-greet'}, 'สวัสดี 👷 วันนี้'),
    h('div', {class:'hero-date'}, fmtDateTH(today)),
    h('div', {class:'hero-stats'},
      h('div', {class:'hero-stat'}, h('b',{}, todayRecords.length), h('span',{},'รอบตรวจวันนี้')),
      h('div', {class:'hero-stat'}, h('b',{}, todayPieces), h('span',{},'ชิ้นงานที่ตรวจ')),
      h('div', {class:'hero-stat'}, h('b',{}, passRate+'%'), h('span',{},'อัตราผ่าน'))
    ),
    h('button', {class:'link-btn', style:{color:'#fff', textDecoration:'underline', marginTop:'10px', padding:0}, onclick:()=>goCrossTab('history','dailyReport',{date:today})}, '📅 ดูรายงานสรุปประจำวัน →')
  ));

  if (draft){
    const tpl = DB.template(draft.templateId);
    wrap.appendChild(h('div', {class:'card', style:{borderLeft:'4px solid var(--warn)'}},
      h('div', {class:'card-title'}, '⏳ งานตรวจค้างอยู่'),
      h('div', {style:{fontWeight:700, marginBottom:'4px'}}, tpl ? tpl.name : 'แบบฟอร์ม'),
      h('div', {style:{fontSize:'12.5px', color:'var(--text-dim)', marginBottom:'12px'}}, `ผลิตวันที่ ${fmtDateTH(draft.productionDate)} • ${draft.pieces.length} ชิ้นงาน`),
      h('div', {class:'btn-row'},
        h('button', {class:'btn', onclick:()=>{ goCrossTab('new','newBuilder',{}); }}, 'ดำเนินการต่อ'),
        h('button', {class:'btn secondary', onclick:()=>confirmDialog('ยกเลิกงานค้าง','ข้อมูลที่กรอกไว้ในงานตรวจนี้จะถูกลบ ต้องการยกเลิกหรือไม่?', ()=>{ DB.clearDraft(); toast('ยกเลิกงานค้างแล้ว'); render(); })}, 'ยกเลิก')
      )
    ));
  }

  wrap.appendChild(h('div', {class:'grid-actions'},
    h('div', {class:'action-tile', onclick:()=>switchTab('new')}, h('span',{class:'ic'},'📝'), h('div',{class:'lb'},'ตรวจงานใหม่')),
    h('div', {class:'action-tile', onclick:()=>switchTab('history')}, h('span',{class:'ic'},'📋'), h('div',{class:'lb'},'ประวัติการตรวจ')),
    h('div', {class:'action-tile', onclick:()=>goCrossTab('settings','employees',{})}, h('span',{class:'ic'},'👷'), h('div',{class:'lb'},'พนักงาน')),
    h('div', {class:'action-tile', onclick:()=>goCrossTab('settings','templates',{})}, h('span',{class:'ic'},'🧩'), h('div',{class:'lb'},'แบบฟอร์มตรวจ'))
  ));

  const recent = [...records].sort((a,b)=>b.createdAt-a.createdAt).slice(0,5);
  wrap.appendChild(h('div', {class:'section-title'}, 'รายการล่าสุด'));
  if (!recent.length){
    wrap.appendChild(h('div', {class:'card empty'}, h('span',{class:'ic'},'🗂️'), 'ยังไม่มีประวัติการตรวจ'));
  } else {
    const card = h('div', {class:'card'});
    recent.forEach(r=>{
      const tpl = DB.template(r.templateId) || r.templateSnapshot;
      const st = recordStatus(r);
      card.appendChild(h('div', {class:'list-row', onclick:()=>goCrossTab('history','historyDetail',{id:r.id}), style:{cursor:'pointer'}},
        h('div', {class:'main'},
          h('b',{}, tpl ? tpl.name : 'ไม่พบแบบฟอร์ม'),
          h('small',{}, `${fmtDateTH(r.productionDate)} • ${r.inspectorName} • ${r.pieces.length} ชิ้น`)
        ),
        st==='pending' && DB.template(r.templateId) ? h('button', {class:'btn sm', style:{flex:'none'}, onclick:(e)=>{ e.stopPropagation(); resumeRecordForCompletion(r); }}, 'เข้าตรวจเพิ่มเติม') : null,
        statusChip(st)
      ));
    });
    wrap.appendChild(card);
  }
  return wrap;
};

/* ============================================================
   NEW INSPECTION FLOW
   ============================================================ */
VIEWS.newStart = function(){
  state.chrome.title = 'เริ่มตรวจงานใหม่';
  const wrap = h('div', {});
  const templates = DB.templates();
  let selType = VIEWS.newStart._type || 'inprocess';

  const body = h('div', {});
  function renderList(){
    body.innerHTML = '';
    const list = templates.filter(t=>t.reportType===selType);
    const pl = h('div', {class:'pick-list'});
    if (!list.length){
      pl.appendChild(h('div', {class:'empty'}, 'ยังไม่มีแบบฟอร์มประเภทนี้ — สร้างได้ที่เมนูตั้งค่า'));
    }
    list.forEach(t=>{
      pl.appendChild(h('div', {class:'pick-card', onclick:()=>startNewDraft(t)},
        h('span',{class:'emoji'}, t.icon || '📋'),
        h('div',{class:'info'}, h('b',{}, t.name), h('small',{}, t.line || '')),
        h('span',{class:'chev'},'›')
      ));
    });
    body.appendChild(pl);
  }

  const seg = h('div', {class:'segmented'},
    h('button', {class:'active', onclick:(e)=>{ selType='inprocess'; VIEWS.newStart._type='inprocess'; qsa('.segmented button', seg).forEach(b=>b.classList.remove('active')); e.target.classList.add('active'); renderList(); }}, 'ระหว่างผลิต'),
    h('button', {onclick:(e)=>{ selType='postprocess'; VIEWS.newStart._type='postprocess'; qsa('.segmented button', seg).forEach(b=>b.classList.remove('active')); e.target.classList.add('active'); renderList(); }}, 'หลังผลิต')
  );
  if (selType==='postprocess') { qsa('button', seg)[0].classList.remove('active'); qsa('button', seg)[1].classList.add('active'); }

  wrap.appendChild(h('div', {class:'card'},
    h('div', {class:'card-title'}, 'เลือกประเภทการตรวจ'),
    seg
  ));
  wrap.appendChild(h('div', {class:'section-title'}, 'เลือกแบบฟอร์มผลิตภัณฑ์'));
  wrap.appendChild(body);
  renderList();
  return wrap;
};

function startNewDraft(template){
  const existing = DB.draft();
  if (existing){
    confirmDialog('มีงานตรวจค้างอยู่','การเริ่มงานใหม่จะลบงานตรวจที่ค้างอยู่ก่อนหน้า ต้องการดำเนินการต่อหรือไม่?', ()=>{
      DB.clearDraft();
      createDraftAndGo(template);
    });
  } else {
    createDraftAndGo(template);
  }
}
function createDraftAndGo(template){
  const draft = {
    templateId: template.id,
    reportType: template.reportType,
    productionDate: todayISO(),
    testDate: template.reportType==='postprocess' ? todayISO() : null,
    inspectorId: null,
    inspectorName: '',
    note: '',
    pieces: []
  };
  DB.saveDraft(draft);
  go('newSetup', {templateId: template.id});
}

VIEWS.newSetup = function(){
  const draft = DB.draft();
  if (!draft){ back(); return h('div'); }
  const tpl = DB.template(draft.templateId);
  state.chrome.title = 'ข้อมูลการตรวจ';
  state.chrome.subtitle = tpl ? tpl.name : '';

  const wrap = h('div', {class:'card'});
  const employees = DB.employees();

  const dateInput = h('input', {type:'date', value:draft.productionDate, onchange:(e)=>{ draft.productionDate=e.target.value; DB.saveDraft(draft); }});
  wrap.appendChild(h('div', {class:'field'}, h('label',{},'วันที่ผลิต'), dateInput));

  if (draft.reportType==='postprocess'){
    const testDateInput = h('input', {type:'date', value:draft.testDate||todayISO(), onchange:(e)=>{ draft.testDate=e.target.value; DB.saveDraft(draft); }});
    wrap.appendChild(h('div', {class:'field'}, h('label',{},'วันที่ทดสอบ'), testDateInput));
  }

  const empSelect = h('select', {onchange:(e)=>{
    const id = e.target.value;
    draft.inspectorId = id || null;
    const emp = employees.find(x=>x.id===id);
    draft.inspectorName = emp ? emp.name : '';
    DB.saveDraft(draft);
  }},
    h('option', {value:''}, '— เลือกผู้ตรวจสอบ —'),
    ...employees.map(emp=>h('option', {value:emp.id, selected: draft.inspectorId===emp.id}, `${emp.name} (${emp.role})`))
  );
  wrap.appendChild(h('div', {class:'field'},
    h('label',{},'ผู้ตรวจสอบ'),
    empSelect,
    h('div',{class:'hint'},
      h('button',{class:'link-btn', style:{padding:0}, onclick:()=>openAddEmployeeModal((emp)=>{
        draft.inspectorId = emp.id; draft.inspectorName = emp.name; DB.saveDraft(draft); replaceTop('newSetup',{templateId:tpl.id});
      })}, '+ เพิ่มพนักงานใหม่')
    )
  ));

  const noteArea = h('textarea', {placeholder:'บันทึกเพิ่มเติม เช่น สภาพอากาศ, ล็อคการผลิต ฯลฯ', oninput: debounce((e)=>{ draft.note=e.target.value; DB.saveDraft(draft); },300)}, draft.note||'');
  wrap.appendChild(h('div', {class:'field'}, h('label',{},'หมายเหตุทั่วไป (ถ้ามี)'), noteArea));

  wrap.appendChild(h('button', {class:'btn', onclick:()=>{
    if (!draft.inspectorName){ toast('กรุณาเลือกผู้ตรวจสอบ','err'); return; }
    go('newBuilder', {});
  }}, 'ถัดไป: เพิ่มชิ้นงานตรวจ'));

  return wrap;
};

function openAddEmployeeModal(onSaved){
  const nameInput = h('input', {type:'text', placeholder:'ชื่อ-นามสกุล'});
  const roleInput = h('input', {type:'text', placeholder:'ตำแหน่ง เช่น ผู้ตรวจสอบคุณภาพ (QC)', value:'ผู้ตรวจสอบคุณภาพ (QC)'});
  openModal(h('div', {},
    h('div', {class:'modal-title'}, 'เพิ่มพนักงานใหม่'),
    h('div', {class:'field'}, h('label',{},'ชื่อ-นามสกุล'), nameInput),
    h('div', {class:'field'}, h('label',{},'ตำแหน่ง'), roleInput),
    h('div', {class:'btn-row'},
      h('button', {class:'btn secondary', onclick:closeModal}, 'ยกเลิก'),
      h('button', {class:'btn', onclick:()=>{
        const name = nameInput.value.trim();
        if (!name){ toast('กรุณากรอกชื่อ','err'); return; }
        const emp = {id:uid(), name, role: roleInput.value.trim()||'พนักงาน'};
        const list = DB.employees(); list.push(emp); DB.saveEmployees(list);
        closeModal(); toast('เพิ่มพนักงานแล้ว','ok');
        onSaved && onSaved(emp);
      }}, 'บันทึก')
    )
  ), {center:true});
  setTimeout(()=>nameInput.focus(), 50);
}

VIEWS.newBuilder = function(){
  const draft = DB.draft();
  if (!draft){ switchTab('home'); return h('div'); }
  const tpl = DB.template(draft.templateId);
  if (!tpl){ toast('ไม่พบแบบฟอร์มนี้ อาจถูกลบไปแล้ว','err'); DB.clearDraft(); switchTab('home'); return h('div'); }
  state.chrome.title = tpl.name;
  state.chrome.subtitle = `${fmtDateTH(draft.productionDate)} • ${draft.inspectorName||'-'}`;
  state.chrome.menu = {icon:'✎', action:()=>go('newSetup', {templateId: tpl.id})};

  const wrap = h('div', {});

  if (draft.editingRecordId){
    wrap.appendChild(h('div', {class:'card', style:{borderLeft:'4px solid var(--brand)', background:'var(--brand-light)'}},
      '📝 กำลังเข้าตรวจเพิ่มเติมรายการเดิม — บันทึกจะอัปเดตรายการนี้ ไม่สร้างใหม่'
    ));
  }

  wrap.appendChild(h('div', {class:'card'},
    h('div', {class:'card-title'}, 'ข้อมูลรอบตรวจ'),
    h('div', {class:'kv-list'},
      h('div',{class:'kv'}, h('b',{},'วันที่ผลิต'), fmtDateTH(draft.productionDate)),
      draft.reportType==='postprocess' ? h('div',{class:'kv'}, h('b',{},'วันที่ทดสอบ'), fmtDateTH(draft.testDate)) : null,
      h('div',{class:'kv'}, h('b',{},'ผู้ตรวจสอบ'), draft.inspectorName||'-')
    )
  ));

  wrap.appendChild(h('div', {class:'section-title'}, `ชิ้นงานที่ตรวจ (${draft.pieces.length})`));

  if (!draft.pieces.length){
    wrap.appendChild(h('div', {class:'card empty'}, h('span',{class:'ic'},'📦'), 'ยังไม่มีชิ้นงาน — กดปุ่มด้านล่างเพื่อเพิ่ม'));
  } else {
    draft.pieces.forEach((p, idx)=>{
      const st = pieceStatus(tpl, p);
      const badgeColor = st==='fail' ? 'var(--danger)' : st==='pending' ? 'var(--warn)' : 'var(--ok)';
      wrap.appendChild(h('div', {class:'piece-card'},
        h('div', {class:'badge', style:{background:'transparent', color:badgeColor, border:`2px solid ${badgeColor}`}}, idx+1),
        h('div', {class:'info', onclick:()=>go('newPiece', {pieceId:p.id}), style:{cursor:'pointer'}},
          h('b',{}, p.name),
          h('small',{}, st==='fail' ? 'พบข้อบกพร่อง' : st==='pending' ? 'กรอกข้อมูลไม่ครบ' : 'ตรวจครบถ้วน — ผ่าน')
        ),
        h('button', {class:'icon-sm', onclick:()=>go('newPiece', {pieceId:p.id})}, '✎'),
        h('button', {class:'icon-sm danger', onclick:()=>confirmDialog('ลบชิ้นงาน', `ลบ "${p.name}" ออกจากรอบตรวจนี้?`, ()=>{
          draft.pieces = draft.pieces.filter(x=>x.id!==p.id); DB.saveDraft(draft); render();
        })}, '🗑')
      ));
    });
  }

  wrap.appendChild(h('button', {class:'btn ghost', onclick:()=>openAddPieceModal(tpl, draft)}, '+ เพิ่มชิ้นงานตรวจ'));
  wrap.appendChild(h('div', {style:{height:'12px'}}));
  wrap.appendChild(h('button', {class:'btn', disabled: draft.pieces.length===0, onclick:()=>go('newFinish', {})}, 'เสร็จสิ้น / สรุปผลการตรวจ →'));

  return wrap;
};

function openAddPieceModal(tpl, draft){
  let chosenName = '';
  if (tpl.autoNumberPrefix){
    const count = draft.pieces.filter(p=>p.name.startsWith(tpl.autoNumberPrefix)).length;
    chosenName = `${tpl.autoNumberPrefix} ${count+1}`;
  }
  const nameInput = h('input', {type:'text', placeholder:'ชื่อ/รหัสชิ้นงาน', value: chosenName});
  const chipsWrap = h('div', {class:'filter-chips'});
  (tpl.presetPieces||[]).forEach(preset=>{
    chipsWrap.appendChild(h('div', {class:'filter-chip', onclick:()=>{ nameInput.value = preset; nameInput.focus(); }}, preset));
  });

  openModal(h('div', {},
    h('div', {class:'modal-title'}, 'เพิ่มชิ้นงานตรวจ'),
    (tpl.presetPieces||[]).length ? h('div', {class:'field'}, h('label',{},'เลือกจากรายการ'), chipsWrap) : null,
    h('div', {class:'field'}, h('label',{},'ชื่อ/รหัสชิ้นงาน'), nameInput),
    h('div', {class:'btn-row'},
      h('button', {class:'btn secondary', onclick:closeModal}, 'ยกเลิก'),
      h('button', {class:'btn', onclick:()=>{
        const name = nameInput.value.trim();
        if (!name){ toast('กรุณาระบุชื่อชิ้นงาน','err'); return; }
        const piece = {id:uid(), name, values:{}, notes:{}, photos:{}, remark:''};
        draft.pieces.push(piece);
        DB.saveDraft(draft);
        closeModal();
        go('newPiece', {pieceId: piece.id});
      }}, 'เพิ่มและเริ่มตรวจ')
    )
  ), {center:true});
  setTimeout(()=>nameInput.focus(), 50);
}

VIEWS.newPiece = function({pieceId}){
  const draft = DB.draft();
  if (!draft){ switchTab('home'); return h('div'); }
  const tpl = DB.template(draft.templateId);
  const piece = draft.pieces.find(p=>p.id===pieceId);
  if (!tpl || !piece){ back(); return h('div'); }
  state.chrome.title = piece.name;
  state.chrome.subtitle = tpl.name;
  syncDurationFields(tpl, piece);

  const wrap = h('div', {});
  const openSet = new Set([tpl.sections[0] && tpl.sections[0].id]);

  const listEl = h('div', {});
  function buildSections(){
    listEl.innerHTML = '';
    tpl.sections.forEach(sec=>{
      const isOpen = openSet.has(sec.id);
      const answeredCount = sec.fields.filter(f=>piece.values[f.id]!=null && piece.values[f.id]!=='').length;
      const acc = h('div', {class:'accordion'+(isOpen?' open':'')});
      const head = h('div', {class:'accordion-head', onclick:()=>{
        if (openSet.has(sec.id)) openSet.delete(sec.id); else openSet.add(sec.id);
        buildSections();
      }},
        h('span',{class:'caret'},'›'),
        h('span',{}, sec.title),
        h('span',{class:'count'}, `${answeredCount}/${sec.fields.length}`)
      );
      const bodyEl = h('div', {class:'accordion-body'});
      sec.fields.forEach(f=>bodyEl.appendChild(renderFieldControl(tpl, piece, f)));
      acc.appendChild(head); acc.appendChild(bodyEl);
      listEl.appendChild(acc);
    });
  }
  buildSections();

  const passAllCount = tpl.sections.reduce((a,sec)=>a+sec.fields.filter(f=>f.type==='pass').length, 0);
  if (passAllCount > 0){
    wrap.appendChild(h('button', {class:'btn secondary', style:{marginBottom:'12px'}, onclick:()=>{
      tpl.sections.forEach(sec=>sec.fields.forEach(f=>{ if (f.type==='pass') piece.values[f.id]='pass'; }));
      DB.saveDraft(draft);
      buildSections();
      toast('ตั้งค่าผ่านทั้งหมดแล้ว — แก้เฉพาะรายการที่ไม่ผ่านได้เลย','ok');
    }}, `✓ ผ่านทั้งหมด (${passAllCount} รายการ)`));
  }

  wrap.appendChild(listEl);

  wrap.appendChild(h('div', {class:'section-title'}, 'หมายเหตุชิ้นงานนี้'));
  wrap.appendChild(h('div', {class:'card'},
    h('textarea', {placeholder:'หมายเหตุเพิ่มเติมสำหรับชิ้นงานนี้ (ถ้ามี)', oninput: debounce((e)=>{ piece.remark=e.target.value; DB.saveDraft(draft); },300)}, piece.remark||'')
  ));

  wrap.appendChild(h('button', {class:'btn', onclick:()=>back()}, '✓ บันทึกและกลับ'));
  return wrap;
};

function renderFieldControl(tpl, piece, field){
  const item = h('div', {class:'chk-item'});
  const labelRow = h('div', {class:'chk-label'}, field.label, field.unit ? h('span',{class:'u'}, `(${field.unit})`) : null);
  item.appendChild(labelRow);

  if (field.type === 'pass'){
    const passBtn = h('button', {class:'pf-btn pass'+(piece.values[field.id]==='pass'?' active':'')}, '✓ ผ่าน');
    const failBtn = h('button', {class:'pf-btn fail'+(piece.values[field.id]==='fail'?' active':'')}, '✗ ไม่ผ่าน');
    const extra = h('div', {style:{display: piece.values[field.id]==='fail' ? 'block':'none', marginTop:'10px'}});
    function buildExtra(){
      extra.innerHTML = '';
      const note = h('textarea', {placeholder:'ระบุลักษณะข้อบกพร่องที่พบ', oninput: debounce((e)=>{ piece.notes[field.id]=e.target.value; DB.saveDraft(draft_ref); },300)}, piece.notes[field.id]||'');
      extra.appendChild(note);
      const strip = h('div', {class:'photo-strip'});
      (piece.photos[field.id]||[]).forEach((src, i)=>{
        strip.appendChild(h('div', {class:'photo-thumb'},
          h('img', {src}),
          h('button', {class:'rm', onclick:()=>{ piece.photos[field.id].splice(i,1); DB.saveDraft(draft_ref); buildExtra(); }}, '×')
        ));
      });
      const fileInput = h('input', {type:'file', accept:'image/*', capture:'environment', style:{display:'none'}, onchange: async (e)=>{
        const file = e.target.files[0]; if (!file) return;
        try{
          const dataUrl = await fileToCompressedDataURL(file);
          piece.photos[field.id] = piece.photos[field.id]||[];
          piece.photos[field.id].push(dataUrl);
          DB.saveDraft(draft_ref);
          buildExtra();
        }catch(err){ toast('เพิ่มรูปไม่สำเร็จ','err'); }
        e.target.value = '';
      }});
      strip.appendChild(h('div', {class:'photo-add', onclick:()=>fileInput.click()}, '📷', fileInput));
      extra.appendChild(strip);
    }
    const draft_ref = DB.draft();
    buildExtra();

    passBtn.addEventListener('click', ()=>{
      piece.values[field.id] = piece.values[field.id]==='pass' ? undefined : 'pass';
      passBtn.classList.toggle('active', piece.values[field.id]==='pass');
      failBtn.classList.remove('active');
      extra.style.display = 'none';
      DB.saveDraft(draft_ref);
      refreshBuilderBadgeIfNeeded();
    });
    failBtn.addEventListener('click', ()=>{
      piece.values[field.id] = piece.values[field.id]==='fail' ? undefined : 'fail';
      failBtn.classList.toggle('active', piece.values[field.id]==='fail');
      passBtn.classList.remove('active');
      extra.style.display = piece.values[field.id]==='fail' ? 'block' : 'none';
      DB.saveDraft(draft_ref);
      refreshBuilderBadgeIfNeeded();
    });

    item.appendChild(h('div', {class:'pf-toggle'}, passBtn, failBtn));
    item.appendChild(extra);
  } else if (field.type === 'select'){
    const sel = h('select', {onchange:(e)=>{ piece.values[field.id]=e.target.value||undefined; DB.saveDraft(DB.draft()); }},
      h('option', {value:''}, '— เลือก —'),
      ...(field.options||[]).map(o=>h('option', {value:o, selected: piece.values[field.id]===o}, o))
    );
    item.appendChild(sel);
  } else if (field.type === 'time'){
    item.appendChild(h('input', {type:'time', value:piece.values[field.id]||'', onchange:(e)=>{ piece.values[field.id]=e.target.value||undefined; syncDurationFields(tpl, piece); DB.saveDraft(DB.draft()); }}));
  } else if (field.type === 'duration'){
    item.appendChild(h('div', {class:'duration-box', 'data-duration-id':field.id}, computeDurationText(piece, field) || 'รอกรอกเวลาเริ่ม/เวลาเสร็จ'));
  } else if (field.type === 'number'){
    item.appendChild(h('input', {type:'number', inputmode:'decimal', placeholder:'ระบุค่า', value: piece.values[field.id]??'', oninput: debounce((e)=>{ piece.values[field.id]=e.target.value===''?undefined:e.target.value; DB.saveDraft(DB.draft()); },250)}));
  } else {
    item.appendChild(h('input', {type:'text', placeholder:'ระบุข้อมูล', value: piece.values[field.id]||'', oninput: debounce((e)=>{ piece.values[field.id]=e.target.value||undefined; DB.saveDraft(DB.draft()); },250)}));
  }
  return item;
}
function refreshBuilderBadgeIfNeeded(){ /* status recomputed on next render automatically */ }

VIEWS.newFinish = function(){
  const draft = DB.draft();
  if (!draft){ switchTab('home'); return h('div'); }
  const tpl = DB.template(draft.templateId);
  state.chrome.title = 'สรุปผลการตรวจ';
  state.chrome.subtitle = tpl.name;

  const wrap = h('div', {});
  let ok=0, fail=0, pending=0;
  draft.pieces.forEach(p=>{ const s=pieceStatus(tpl,p); if(s==='fail')fail++; else if(s==='pending')pending++; else ok++; });

  wrap.appendChild(h('div', {class:'card'},
    h('div', {class:'card-title'}, 'ภาพรวมผลการตรวจ'),
    h('div', {class:'summary-row'},
      donutSVG(ok, fail, pending),
      h('div', {class:'summary-legend'},
        h('div',{class:'lg'}, h('span',{class:'dot', style:{background:'var(--ok)'}}), `ผ่าน ${ok} ชิ้น`),
        h('div',{class:'lg'}, h('span',{class:'dot', style:{background:'var(--danger)'}}), `พบข้อบกพร่อง ${fail} ชิ้น`),
        h('div',{class:'lg'}, h('span',{class:'dot', style:{background:'var(--warn)'}}), `ยังไม่ครบ ${pending} ชิ้น`)
      )
    )
  ));

  if (fail>0){
    const failCard = h('div', {class:'card'}, h('div', {class:'card-title'}, '⚠️ ชิ้นงานที่พบข้อบกพร่อง'));
    draft.pieces.filter(p=>pieceStatus(tpl,p)==='fail').forEach(p=>{
      failCard.appendChild(h('div', {class:'list-row', onclick:()=>go('newPiece',{pieceId:p.id}), style:{cursor:'pointer'}},
        h('div', {class:'main'}, h('b',{}, p.name)),
        h('span',{class:'chev'},'›')
      ));
    });
    wrap.appendChild(failCard);
  }

  wrap.appendChild(h('div', {class:'card'},
    h('div', {class:'card-title'}, 'ลายเซ็นผู้ตรวจสอบ'),
    h('div', {style:{fontWeight:700,marginBottom:'10px'}}, draft.inspectorName || '-'),
    buildSignaturePad(draft)
  ));

  wrap.appendChild(h('button', {class:'btn', onclick:()=>saveFinalRecord(draft, tpl)}, draft.editingRecordId ? '✓ บันทึกการตรวจเพิ่มเติม' : '✓ บันทึกผลการตรวจ'));
  return wrap;
};

function buildSignaturePad(draft){
  const wrap = h('div', {class:'sig-pad-wrap'});
  const canvas = h('canvas', {class:'sig-pad'});
  wrap.appendChild(canvas);
  const clearBtn = h('button', {class:'btn secondary sm', style:{marginTop:'8px'}, onclick:()=>{ ctx.clearRect(0,0,canvas.width,canvas.height); draft.signature=null; DB.saveDraft(draft); }}, 'ล้างลายเซ็น');

  let ctx, drawing=false, last=null;
  function setup(){
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio||1;
    canvas.width = rect.width*ratio; canvas.height = 160*ratio;
    ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4; ctx.lineCap='round'; ctx.strokeStyle = '#1c2422';
    if (draft.signature){
      const img = new Image();
      img.onload = ()=>ctx.drawImage(img,0,0, rect.width, 160);
      img.src = draft.signature;
    }
  }
  setTimeout(setup, 30);
  function pos(e){
    const rect = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return {x:t.clientX-rect.left, y:t.clientY-rect.top};
  }
  function start(e){ e.preventDefault(); drawing=true; last=pos(e); }
  function move(e){
    if (!drawing) return; e.preventDefault();
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(last.x,last.y); ctx.lineTo(p.x,p.y); ctx.stroke();
    last = p;
  }
  function end(){
    if (!drawing) return; drawing=false;
    draft.signature = canvas.toDataURL('image/png');
    DB.saveDraft(draft);
  }
  canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, {passive:false}); canvas.addEventListener('touchmove', move, {passive:false}); canvas.addEventListener('touchend', end);

  return h('div', {}, wrap, clearBtn);
}

function saveFinalRecord(draft, tpl){
  const list = DB.records();
  const editingIdx = draft.editingRecordId ? list.findIndex(r=>r.id===draft.editingRecordId) : -1;

  const record = {
    id: editingIdx>=0 ? draft.editingRecordId : uid(),
    templateId: tpl.id,
    templateSnapshot: JSON.parse(JSON.stringify(tpl)),
    reportType: draft.reportType,
    productionDate: draft.productionDate,
    testDate: draft.testDate,
    inspectorId: draft.inspectorId,
    inspectorName: draft.inspectorName,
    note: draft.note,
    signature: draft.signature || null,
    pieces: draft.pieces,
    createdAt: editingIdx>=0 ? list[editingIdx].createdAt : Date.now(),
    updatedAt: editingIdx>=0 ? Date.now() : undefined
  };

  if (editingIdx>=0) list[editingIdx] = record; else list.push(record);
  DB.saveRecords(list);
  DB.clearDraft();
  toast(editingIdx>=0 ? 'บันทึกการตรวจเพิ่มเติมสำเร็จ' : 'บันทึกผลการตรวจสำเร็จ', 'ok');
  goCrossTab('history', 'historyDetail', {id: record.id});
}

function resumeRecordForCompletion(record){
  const startResume = ()=>{
    const draft = {
      templateId: record.templateId,
      reportType: record.reportType,
      productionDate: record.productionDate,
      testDate: record.testDate,
      inspectorId: record.inspectorId,
      inspectorName: record.inspectorName,
      note: record.note || '',
      signature: record.signature || null,
      pieces: JSON.parse(JSON.stringify(record.pieces)),
      editingRecordId: record.id
    };
    DB.saveDraft(draft);
    toast('กำลังเข้าตรวจเพิ่มเติม — กรอกรายการที่เหลือแล้วบันทึกได้เลย','ok');
    goCrossTab('new', 'newBuilder', {});
  };
  if (DB.draft()){
    confirmDialog('มีงานตรวจค้างอยู่','การเข้าตรวจเพิ่มเติมรายการนี้จะลบงานตรวจที่ค้างอยู่ก่อนหน้า ต้องการดำเนินการต่อหรือไม่?', ()=>{
      DB.clearDraft();
      startResume();
    });
  } else {
    startResume();
  }
}

/* ============================================================
   HISTORY
   ============================================================ */
VIEWS.historyList = function(){
  state.chrome.title = 'ประวัติการตรวจ';
  state.chrome.menu = {icon:'📅', action:()=>go('dailyReport', {date: todayISO()})};
  const wrap = h('div', {});
  const f = state.historyFilter;

  wrap.appendChild(h('button', {class:'btn secondary sm', style:{marginBottom:'12px'}, onclick:()=>go('dailyReport', {date: todayISO()})}, '📅 ดูรายงานสรุปประจำวัน'));

  const search = h('input', {type:'text', placeholder:'ค้นหาชื่อแบบฟอร์ม / ผู้ตรวจสอบ', value:f.q, oninput: debounce((e)=>{ f.q=e.target.value; renderList(); },200)});
  wrap.appendChild(h('div', {class:'searchbar'}, '🔎', search));

  const chips = h('div', {class:'filter-chips'});
  const statusOpts = [['all','ทั้งหมด'],['ok','ผ่าน'],['fail','ไม่ผ่าน'],['pending','ยังไม่ครบ']];
  function rebuildStatusChips(){
    chips.innerHTML = '';
    statusOpts.forEach(([k,l])=>{
      chips.appendChild(h('div', {class:'filter-chip'+(f.status===k?' active':''), onclick:()=>{ f.status=k; rebuildStatusChips(); renderList(); }}, l));
    });
  }
  rebuildStatusChips();
  wrap.appendChild(chips);

  const typeChips = h('div', {class:'filter-chips'});
  const typeOpts = [['all','ทุกประเภท'],['inprocess','ระหว่างผลิต'],['postprocess','หลังผลิต']];
  function rebuildTypeChips(){
    typeChips.innerHTML = '';
    typeOpts.forEach(([k,l])=>{
      typeChips.appendChild(h('div', {class:'filter-chip'+(f.type===k?' active':''), onclick:()=>{ f.type=k; rebuildTypeChips(); renderList(); }}, l));
    });
  }
  rebuildTypeChips();
  wrap.appendChild(typeChips);

  const listWrap = h('div', {});
  wrap.appendChild(listWrap);

  function renderList(){
    listWrap.innerHTML = '';
    let records = [...DB.records()].sort((a,b)=>b.createdAt-a.createdAt);
    if (f.type!=='all') records = records.filter(r=>r.reportType===f.type);
    if (f.status!=='all') records = records.filter(r=>recordStatus(r)===f.status);
    if (f.q.trim()){
      const q = f.q.trim().toLowerCase();
      records = records.filter(r=>{
        const tpl = DB.template(r.templateId) || r.templateSnapshot;
        return (tpl.name||'').toLowerCase().includes(q) || (r.inspectorName||'').toLowerCase().includes(q);
      });
    }
    if (!records.length){
      listWrap.appendChild(h('div', {class:'empty'}, h('span',{class:'ic'},'🗂️'), 'ไม่พบรายการ'));
      return;
    }
    const card = h('div', {class:'card'});
    records.forEach(r=>{
      const tpl = DB.template(r.templateId) || r.templateSnapshot;
      const st = recordStatus(r);
      card.appendChild(h('div', {class:'list-row', onclick:()=>go('historyDetail',{id:r.id}), style:{cursor:'pointer'}},
        h('div', {class:'main'},
          h('b',{}, tpl.name),
          h('small',{}, `${fmtDateTH(r.productionDate)} • ${r.inspectorName} • ${r.pieces.length} ชิ้น`)
        ),
        st==='pending' && DB.template(r.templateId) ? h('button', {class:'btn sm', style:{flex:'none'}, onclick:(e)=>{ e.stopPropagation(); resumeRecordForCompletion(r); }}, 'เข้าตรวจเพิ่มเติม') : null,
        statusChip(st)
      ));
    });
    listWrap.appendChild(card);
  }
  renderList();
  return wrap;
};

VIEWS.historyDetail = function({id}){
  const record = DB.record(id);
  if (!record){ back(); return h('div'); }
  const tpl = DB.template(record.templateId) || record.templateSnapshot;
  state.chrome.title = tpl.name;
  state.chrome.subtitle = fmtDateTH(record.productionDate);
  state.chrome.menu = {icon:'⋮', action:()=>openRecordActionsMenu(record)};

  const wrap = h('div', {});
  const stats = recordStats(record);

  wrap.appendChild(h('div', {class:'card'},
    h('div', {class:'summary-row'},
      donutSVG(stats.okPieces, stats.failPieces, stats.pendingPieces),
      h('div', {class:'summary-legend'},
        h('div',{class:'lg'}, h('span',{class:'dot', style:{background:'var(--ok)'}}), `ผ่าน ${stats.okPieces} ชิ้น`),
        h('div',{class:'lg'}, h('span',{class:'dot', style:{background:'var(--danger)'}}), `พบข้อบกพร่อง ${stats.failPieces} ชิ้น`),
        h('div',{class:'lg'}, h('span',{class:'dot', style:{background:'var(--warn)'}}), `ยังไม่ครบ ${stats.pendingPieces} ชิ้น`)
      )
    )
  ));

  if (stats.pendingPieces > 0 && DB.template(record.templateId)){
    wrap.appendChild(h('button', {class:'btn no-print', style:{marginBottom:'12px'}, onclick:()=>resumeRecordForCompletion(record)}, `📝 เข้าตรวจเพิ่มเติม (เหลือ ${stats.pendingPieces} ชิ้น)`));
  }

  wrap.appendChild(h('div', {class:'card kv-list'},
    h('div',{class:'kv'}, h('b',{},'ประเภทการตรวจ'), reportTypeLabel(record.reportType)),
    h('div',{class:'kv'}, h('b',{},'สายการผลิต'), tpl.line||'-'),
    h('div',{class:'kv'}, h('b',{},'วันที่ผลิต'), fmtDateTH(record.productionDate)),
    record.reportType==='postprocess' ? h('div',{class:'kv'}, h('b',{},'วันที่ทดสอบ'), fmtDateTH(record.testDate)) : null,
    h('div',{class:'kv'}, h('b',{},'ผู้ตรวจสอบ'), record.inspectorName),
    h('div',{class:'kv'}, h('b',{},'บันทึกเมื่อ'), fmtDateTimeTH(record.createdAt)),
    record.note ? h('div',{class:'kv'}, h('b',{},'หมายเหตุ'), record.note) : null
  ));

  wrap.appendChild(h('div', {class:'section-title'}, `รายละเอียดชิ้นงาน (${record.pieces.length})`));
  record.pieces.forEach((p, idx)=>{
    const st = pieceStatus(tpl, p);
    const card = h('div', {class:'card'});
    card.appendChild(h('div', {style:{display:'flex',alignItems:'center',gap:'8px',marginBottom:'10px'}},
      h('b',{style:{flex:1}}, `${idx+1}. ${p.name}`), statusChip(st)
    ));
    tpl.sections.forEach(sec=>{
      const rows = sec.fields.map(f=>{
        const v = piece_val(p, f.id);
        const isFailField = f.type==='pass' && p.values[f.id]==='fail';
        return h('div', {class:'kv', style: isFailField ? {color:'var(--danger)'} : null},
          h('b',{}, f.label),
          h('span',{}, fieldAnswerText(f, p.values[f.id]))
        );
      });
      card.appendChild(h('div', {style:{fontSize:'12px',fontWeight:700,color:'var(--text-dim)',margin:'8px 0 2px'}}, sec.title));
      card.appendChild(h('div', {class:'kv-list'}, rows));
      sec.fields.forEach(f=>{
        if (p.notes[f.id]) card.appendChild(h('div', {style:{fontSize:'12.5px',color:'var(--danger)',marginTop:'4px'}}, `• ${f.label}: ${p.notes[f.id]}`));
        if (p.photos[f.id] && p.photos[f.id].length){
          const strip = h('div', {class:'photo-strip'});
          p.photos[f.id].forEach(src=>strip.appendChild(h('div',{class:'photo-thumb'}, h('img',{src}))));
          card.appendChild(strip);
        }
      });
    });
    if (p.remark) card.appendChild(h('div', {style:{marginTop:'8px', fontSize:'13px'}}, h('b',{},'หมายเหตุ: '), p.remark));
    wrap.appendChild(card);
  });

  wrap.appendChild(h('div', {class:'card'},
    h('div', {class:'card-title'}, 'ลายเซ็นผู้ตรวจสอบ'),
    record.signature ? h('img', {src:record.signature, style:{width:'100%',maxWidth:'260px',background:'#fff',borderRadius:'8px',border:'1px solid var(--border)'}}) : h('div', {style:{color:'var(--text-dim)',fontSize:'13px'}}, '(ไม่มีลายเซ็น)'),
    h('div', {style:{marginTop:'6px', fontSize:'13px'}}, `(${record.inspectorName})`)
  ));

  wrap.appendChild(h('div', {class:'btn-row no-print'},
    h('button', {class:'btn secondary', onclick:()=>window.print()}, '🖨 พิมพ์ / PDF'),
    h('button', {class:'btn secondary', onclick:()=>exportRecordCSV(record, tpl)}, '⬇ CSV')
  ));

  return wrap;
};
function piece_val(p, fid){ return p.values[fid]; }

function openRecordActionsMenu(record){
  openModal(h('div', {},
    h('div', {class:'modal-title'}, 'จัดการรายการ'),
    h('button', {class:'btn secondary', style:{marginBottom:'8px'}, onclick:()=>{ closeModal(); duplicateRecordAsDraft(record); }}, '📄 ทำสำเนาเป็นรอบตรวจใหม่'),
    h('button', {class:'btn danger', onclick:()=>{
      closeModal();
      confirmDialog('ลบรายการนี้', 'ต้องการลบรายการตรวจนี้ถาวรหรือไม่?', ()=>{
        const list = DB.records().filter(r=>r.id!==record.id);
        DB.saveRecords(list);
        toast('ลบรายการแล้ว');
        back();
      });
    }}, '🗑 ลบรายการ')
  ), {center:true});
}
function duplicateRecordAsDraft(record){
  if (DB.draft()){ toast('มีงานตรวจค้างอยู่ กรุณาจัดการก่อน','err'); return; }
  const tpl = DB.template(record.templateId);
  if (!tpl){ toast('ไม่พบแบบฟอร์มต้นฉบับ (อาจถูกลบ)','err'); return; }
  const draft = {
    templateId: tpl.id, reportType: tpl.reportType, productionDate: todayISO(),
    testDate: tpl.reportType==='postprocess'?todayISO():null,
    inspectorId: record.inspectorId, inspectorName: record.inspectorName, note:'',
    pieces: record.pieces.map(p=>({id:uid(), name:p.name, values:{}, notes:{}, photos:{}, remark:''}))
  };
  DB.saveDraft(draft);
  toast('สร้างรอบตรวจใหม่จากรายการนี้แล้ว','ok');
  goCrossTab('new','newBuilder',{});
}

function exportRecordCSV(record, tpl){
  const header = ['ชิ้นงาน'];
  tpl.sections.forEach(sec=>sec.fields.forEach(f=>header.push(`${sec.title} - ${f.label}`)));
  header.push('หมายเหตุ');
  const rows = [header];
  record.pieces.forEach(p=>{
    const row = [p.name];
    tpl.sections.forEach(sec=>sec.fields.forEach(f=>row.push(fieldAnswerText(f, p.values[f.id]))));
    row.push(p.remark||'');
    rows.push(row);
  });
  const meta = [
    [`ผลิตภัณฑ์: ${tpl.name}`], [`ประเภท: ${reportTypeLabel(record.reportType)}`],
    [`วันที่ผลิต: ${fmtDateTH(record.productionDate)}`], [`ผู้ตรวจสอบ: ${record.inspectorName}`], []
  ];
  const csv = [...meta, ...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['﻿'+csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `QC_${tpl.name}_${record.productionDate}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
}

/* ---------------- daily summary report ---------------- */
function findFieldById(tpl, fieldId){
  for (const sec of tpl.sections) for (const f of sec.fields) if (f.id === fieldId) return f;
  return null;
}
function dailyGroups(date){
  const records = DB.records().filter(r=>r.productionDate===date).sort((a,b)=>a.createdAt-b.createdAt);
  const map = new Map();
  records.forEach(r=>{
    const tpl = DB.template(r.templateId) || r.templateSnapshot;
    if (!map.has(tpl.id)) map.set(tpl.id, {template: tpl, rows: []});
    const g = map.get(tpl.id);
    r.pieces.forEach(p=>{
      const st = pieceStatus(tpl, p);
      const noteParts = Object.entries(p.notes || {}).filter(([,v])=>v).map(([fid,v])=>{
        const f = findFieldById(tpl, fid);
        return `${f ? f.label : ''}: ${v}`;
      });
      if (p.remark) noteParts.push(p.remark);
      g.rows.push({
        piece: p, status: st, inspector: r.inspectorName, time: r.createdAt,
        note: noteParts.join('; '), recordId: r.id, signature: r.signature
      });
    });
  });
  return Array.from(map.values());
}
function statusRowText(st){ return st==='fail' ? '✗ ไม่ผ่าน' : st==='pending' ? '◐ ไม่ครบ' : '✓ ผ่าน'; }

function buildDetailedProductSheet(group, date, pageBreakBefore){
  const tpl = group.template;
  const headRow1 = [h('th',{rowspan:'2'},'#'), h('th',{rowspan:'2'},'ชิ้นงาน')];
  const headRow2 = [];
  tpl.sections.forEach(sec=>{
    headRow1.push(h('th',{colspan:String(sec.fields.length)}, sec.title));
    sec.fields.forEach(f=>headRow2.push(h('th',{}, f.label + (f.unit ? ` (${f.unit})` : ''))));
  });
  headRow1.push(h('th',{rowspan:'2'},'ผู้ตรวจสอบ'), h('th',{rowspan:'2'},'เวลา'), h('th',{rowspan:'2'},'หมายเหตุ'));

  const tbody = h('tbody', {}, group.rows.map((row, i)=>{
    const cells = [h('td',{}, i+1), h('td',{}, row.piece.name)];
    tpl.sections.forEach(sec=>sec.fields.forEach(f=>{
      cells.push(h('td',{}, fieldAnswerText(f, row.piece.values[f.id])));
    }));
    cells.push(
      h('td',{}, row.inspector),
      h('td',{}, new Date(row.time).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})),
      h('td',{}, row.note || '-')
    );
    return h('tr', {class: row.status==='fail' ? 'row-fail' : ''}, cells);
  }));

  return h('div', {class:'detailed-sheet'+(pageBreakBefore ? ' sheet-break' : '')},
    h('div', {class:'detailed-sheet-header'},
      h('div', {class:'detailed-sheet-title'}, `${tpl.icon || ''} ${tpl.name}`),
      h('div', {class:'detailed-sheet-sub'}, `${tpl.line || ''} • วันที่ผลิต ${fmtDateTH(date)}`)
    ),
    h('table', {class:'report-table detailed-report-table'},
      h('thead', {}, h('tr', {}, headRow1), h('tr', {}, headRow2)),
      tbody
    )
  );
}

VIEWS.dailyReport = function({date}){
  const selDate = date || todayISO();
  state.chrome.title = 'รายงานประจำวัน';
  state.chrome.subtitle = fmtDateTH(selDate);

  const wrap = h('div', {});

  wrap.appendChild(h('div', {class:'card no-print'},
    h('div', {class:'field', style:{marginBottom:0}},
      h('label',{},'เลือกวันที่ตรวจ'),
      h('input', {type:'date', value:selDate, onchange:(e)=>replaceTop('dailyReport', {date: e.target.value})})
    )
  ));

  wrap.appendChild(h('div', {class:'print-only report-cover-header', style:{textAlign:'center', marginBottom:'16px'}},
    h('div', {style:{fontSize:'18px', fontWeight:700}}, 'รายงานสรุปผลการตรวจสอบคุณภาพประจำวัน'),
    h('div', {style:{fontSize:'13px', color:'#555', marginTop:'2px'}}, fmtDateTH(selDate))
  ));

  const groups = dailyGroups(selDate);
  const allRows = groups.flatMap(g=>g.rows);
  const total = allRows.length;
  const fail = allRows.filter(r=>r.status==='fail').length;
  const pending = allRows.filter(r=>r.status==='pending').length;
  const ok = total - fail - pending;

  wrap.appendChild(h('div', {class:'card report-cover'},
    h('div', {class:'card-title'}, 'ภาพรวมวันนี้'),
    h('div', {class:'summary-row'},
      donutSVG(ok, fail, pending),
      h('div', {class:'summary-legend'},
        h('div',{class:'lg'}, h('span',{class:'dot', style:{background:'var(--ok)'}}), `ผ่าน ${ok} ชิ้น`),
        h('div',{class:'lg'}, h('span',{class:'dot', style:{background:'var(--danger)'}}), `พบข้อบกพร่อง ${fail} ชิ้น`),
        h('div',{class:'lg'}, h('span',{class:'dot', style:{background:'var(--warn)'}}), `ยังไม่ครบ ${pending} ชิ้น`)
      )
    ),
    h('div', {style:{marginTop:'10px', fontSize:'12.5px', color:'var(--text-dim)'}},
      `รวม ${groups.length} ผลิตภัณฑ์ • ${total} ชิ้นงาน${total ? ` • ${Math.round(ok/total*100)}% ผ่าน` : ''}`)
  ));

  if (!groups.length){
    wrap.appendChild(h('div', {class:'card empty'}, h('span',{class:'ic'},'📭'), 'ไม่มีข้อมูลการตรวจในวันที่นี้'));
  } else {
    // On-screen: a quick condensed overview, one product per block.
    const screenGrid = h('div', {class:'report-print-grid no-print'});
    groups.forEach(g=>{
      const group = h('div', {class:'report-group'});
      group.appendChild(h('div', {class:'section-title report-group-title'}, `${g.template.icon || ''} ${g.template.name}`));
      const tableCard = h('div', {class:'card', style:{overflowX:'auto', padding:'10px'}});
      const tbody = h('tbody', {}, g.rows.map((row, i)=>
        h('tr', {class: row.status==='fail' ? 'row-fail' : ''},
          h('td',{}, i+1),
          h('td',{}, row.piece.name),
          h('td',{}, row.inspector),
          h('td',{}, new Date(row.time).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})),
          h('td',{}, statusRowText(row.status)),
          h('td',{}, row.note || '-')
        )
      ));
      tableCard.appendChild(h('table', {class:'report-table'},
        h('thead', {}, h('tr', {}, h('th',{},'#'), h('th',{},'ชิ้นงาน'), h('th',{},'ผู้ตรวจสอบ'), h('th',{},'เวลา'), h('th',{},'ผล'), h('th',{},'หมายเหตุ'))),
        tbody
      ));
      group.appendChild(tableCard);
      screenGrid.appendChild(group);
    });
    wrap.appendChild(screenGrid);

    // Print: one full-detail sheet per product — every checklist field as
    // its own column, like the original Excel forms — on its own page.
    const printDetail = h('div', {class:'print-only'});
    groups.forEach((g, idx)=>{
      printDetail.appendChild(buildDetailedProductSheet(g, selDate, idx>0));
    });
    wrap.appendChild(printDetail);
  }

  const inspectorNames = [...new Set(allRows.map(r=>r.inspector).filter(Boolean))];
  const sigByName = {};
  allRows.forEach(r=>{ if (r.signature && !sigByName[r.inspector]) sigByName[r.inspector] = r.signature; });
  wrap.appendChild(h('div', {class:'card'},
    h('div', {class:'card-title'}, 'ลงชื่อรับรองผลการตรวจประจำวัน'),
    inspectorNames.length
      ? inspectorNames.map(name=>h('div', {class:'sig-line'},
          h('div', {class:'rule'}, sigByName[name] ? h('img',{src:sigByName[name]}) : null),
          h('div', {class:'cap'}, `ผู้ตรวจสอบคุณภาพ (${name})`)
        ))
      : h('div', {style:{color:'var(--text-dim)', fontSize:'13px'}}, '(ไม่มีรายการตรวจในวันนี้)'),
    h('div', {class:'sig-line'},
      h('div', {class:'rule'}),
      h('div', {class:'cap'}, 'ผู้จัดการฝ่ายผลิต / ผู้อนุมัติ')
    )
  ));

  wrap.appendChild(h('div', {class:'btn-row no-print'},
    h('button', {class:'btn secondary', onclick:()=>window.print()}, '🖨 พิมพ์รายงานประจำวัน'),
    h('button', {class:'btn secondary', onclick:()=>exportDailyCSV(selDate, groups)}, '⬇ CSV')
  ));

  return wrap;
};

function exportDailyCSV(date, groups){
  const rows = [[`รายงานสรุปผลการตรวจสอบคุณภาพประจำวัน`], [fmtDateTH(date)], []];
  groups.forEach(g=>{
    rows.push([g.template.name]);
    rows.push(['#','ชิ้นงาน','ผู้ตรวจสอบ','เวลา','ผล','หมายเหตุ']);
    g.rows.forEach((row, i)=>{
      rows.push([i+1, row.piece.name, row.inspector, new Date(row.time).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}), statusRowText(row.status), row.note||'']);
    });
    rows.push([]);
  });
  const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['﻿'+csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `QC_รายงานประจำวัน_${date}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
}

/* ============================================================
   SETTINGS: home / employees / templates / template editor / backup
   ============================================================ */
VIEWS.settingsHome = function(){
  state.chrome.title = 'ตั้งค่า';
  const wrap = h('div', {});
  const employees = DB.employees(), templates = DB.templates();
  const settings = DB.settings();

  wrap.appendChild(h('div', {class:'card'},
    h('div', {class:'list-row', onclick:()=>go('employees',{}), style:{cursor:'pointer'}},
      h('div',{class:'main'}, h('b',{},'👷 พนักงาน'), h('small',{}, `${employees.length} คน`)), h('span',{class:'chev'},'›')),
    h('div', {class:'list-row', onclick:()=>go('templates',{}), style:{cursor:'pointer'}},
      h('div',{class:'main'}, h('b',{},'🧩 แบบฟอร์มตรวจสอบ'), h('small',{}, `${templates.length} แบบฟอร์ม — ปรับแต่งได้`)), h('span',{class:'chev'},'›')),
    h('div', {class:'list-row', onclick:()=>go('backup',{}), style:{cursor:'pointer'}},
      h('div',{class:'main'}, h('b',{},'💾 สำรอง / กู้คืนข้อมูล')), h('span',{class:'chev'},'›'))
  ));

  const seg = h('div', {class:'segmented'},
    h('button', {class: settings.theme==='light'?'active':'', onclick:()=>setTheme('light')}, '☀️ สว่าง'),
    h('button', {class: settings.theme==='dark'?'active':'', onclick:()=>setTheme('dark')}, '🌙 มืด'),
    h('button', {class: (!settings.theme||settings.theme==='system')?'active':'', onclick:()=>setTheme('system')}, '🖥 อัตโนมัติ')
  );
  wrap.appendChild(h('div', {class:'card'}, h('div',{class:'card-title'},'ธีมการแสดงผล'), seg));

  wrap.appendChild(h('div', {style:{textAlign:'center', color:'var(--text-dim)', fontSize:'12px', marginTop:'20px'}},
    'QC Precast Mobile v1.0', h('br'), 'ระบบตรวจสอบคุณภาพผลิตภัณฑ์คอนกรีตสำเร็จรูป'
  ));

  return wrap;
};
function setTheme(theme){
  const s = DB.settings(); s.theme = theme; DB.saveSettings(s);
  applyTheme(); render();
}
function applyTheme(){
  const s = DB.settings();
  if (s.theme==='light') document.documentElement.setAttribute('data-theme','light');
  else if (s.theme==='dark') document.documentElement.setAttribute('data-theme','dark');
  else document.documentElement.removeAttribute('data-theme');
}

VIEWS.employees = function(){
  state.chrome.title = 'พนักงาน';
  state.chrome.menu = {icon:'+', action:()=>openAddEmployeeModal(()=>render())};
  const wrap = h('div', {class:'card'});
  const employees = DB.employees();
  if (!employees.length) wrap.appendChild(h('div', {class:'empty'}, 'ยังไม่มีรายชื่อพนักงาน'));
  employees.forEach(emp=>{
    wrap.appendChild(h('div', {class:'list-row'},
      h('div', {class:'main'}, h('b',{}, emp.name), h('small',{}, emp.role)),
      h('button', {class:'icon-sm', onclick:()=>openEditEmployeeModal(emp)}, '✎'),
      h('button', {class:'icon-sm danger', onclick:()=>confirmDialog('ลบพนักงาน', `ลบ "${emp.name}" ออกจากรายชื่อ?`, ()=>{
        DB.saveEmployees(DB.employees().filter(e=>e.id!==emp.id)); toast('ลบแล้ว'); render();
      })}, '🗑')
    ));
  });
  return wrap;
};
function openEditEmployeeModal(emp){
  const nameInput = h('input', {type:'text', value:emp.name});
  const roleInput = h('input', {type:'text', value:emp.role});
  openModal(h('div', {},
    h('div', {class:'modal-title'}, 'แก้ไขข้อมูลพนักงาน'),
    h('div', {class:'field'}, h('label',{},'ชื่อ-นามสกุล'), nameInput),
    h('div', {class:'field'}, h('label',{},'ตำแหน่ง'), roleInput),
    h('div', {class:'btn-row'},
      h('button', {class:'btn secondary', onclick:closeModal}, 'ยกเลิก'),
      h('button', {class:'btn', onclick:()=>{
        const list = DB.employees();
        const idx = list.findIndex(e=>e.id===emp.id);
        list[idx] = {...emp, name:nameInput.value.trim()||emp.name, role:roleInput.value.trim()||emp.role};
        DB.saveEmployees(list); closeModal(); render();
      }}, 'บันทึก')
    )
  ), {center:true});
}

VIEWS.templates = function(){
  state.chrome.title = 'แบบฟอร์มตรวจสอบ';
  state.chrome.menu = {icon:'+', action:()=>openCreateTemplateModal()};
  const wrap = h('div', {});
  const templates = DB.templates();

  ['inprocess','postprocess'].forEach(rt=>{
    wrap.appendChild(h('div', {class:'section-title'}, reportTypeLabel(rt)));
    const list = templates.filter(t=>t.reportType===rt);
    if (!list.length){ wrap.appendChild(h('div', {class:'card empty'}, 'ไม่มีแบบฟอร์ม')); return; }
    const card = h('div', {class:'card'});
    list.forEach(t=>{
      const fieldCount = t.sections.reduce((a,s)=>a+s.fields.length,0);
      card.appendChild(h('div', {class:'list-row'},
        h('span',{},t.icon||'📋'),
        h('div', {class:'main', onclick:()=>go('templateEditor',{id:t.id}), style:{cursor:'pointer'}},
          h('b',{}, t.name), h('small',{}, `${t.sections.length} หมวด • ${fieldCount} รายการตรวจ`)),
        h('button', {class:'icon-sm', onclick:()=>duplicateTemplate(t)}, '⧉'),
        h('button', {class:'icon-sm danger', onclick:()=>confirmDialog('ลบแบบฟอร์ม', `ลบแบบฟอร์ม "${t.name}"? ประวัติเก่าที่เคยบันทึกจะยังอยู่`, ()=>{
          DB.saveTemplates(DB.templates().filter(x=>x.id!==t.id)); toast('ลบแบบฟอร์มแล้ว'); render();
        })}, '🗑')
      ));
    });
    wrap.appendChild(card);
  });
  return wrap;
};
function duplicateTemplate(t){
  const copy = JSON.parse(JSON.stringify(t));
  copy.id = 't_'+uid();
  copy.name = t.name + ' (สำเนา)';
  const regen = (arr)=>arr.forEach(s=>{ s.id=uid(); s.fields.forEach(f=>f.id=uid()); });
  regen(copy.sections);
  const list = DB.templates(); list.push(copy); DB.saveTemplates(list);
  toast('ทำสำเนาแบบฟอร์มแล้ว','ok'); render();
}
function openCreateTemplateModal(){
  const nameInput = h('input', {type:'text', placeholder:'เช่น เสาเข็มหกเหลี่ยม, คานสำเร็จรูป'});
  let rt = 'inprocess';
  const seg = h('div', {class:'segmented'},
    h('button', {class:'active', onclick:(e)=>{ rt='inprocess'; qsa('button',seg).forEach(b=>b.classList.remove('active')); e.target.classList.add('active'); }}, 'ระหว่างผลิต'),
    h('button', {onclick:(e)=>{ rt='postprocess'; qsa('button',seg).forEach(b=>b.classList.remove('active')); e.target.classList.add('active'); }}, 'หลังผลิต')
  );
  const icons = ['🧱','🏗️','✅','📦','🔩','🏭','📐','🧰'];
  let chosenIcon = icons[0];
  const iconRow = h('div', {class:'filter-chips'});
  icons.forEach(ic=>{
    const btn = h('div', {class:'filter-chip'+(ic===chosenIcon?' active':''), onclick:()=>{ chosenIcon=ic; qsa('.filter-chip',iconRow).forEach(c=>c.classList.remove('active')); btn.classList.add('active'); }}, ic);
    iconRow.appendChild(btn);
  });

  openModal(h('div', {},
    h('div', {class:'modal-title'}, 'สร้างแบบฟอร์มใหม่'),
    h('div', {class:'field'}, h('label',{},'ชื่อผลิตภัณฑ์/แบบฟอร์ม'), nameInput),
    h('div', {class:'field'}, h('label',{},'ประเภทการตรวจ'), seg),
    h('div', {class:'field'}, h('label',{},'ไอคอน'), iconRow),
    h('div', {class:'btn-row'},
      h('button', {class:'btn secondary', onclick:closeModal}, 'ยกเลิก'),
      h('button', {class:'btn', onclick:()=>{
        const name = nameInput.value.trim();
        if (!name){ toast('กรุณาระบุชื่อ','err'); return; }
        const t = {
          id:'t_'+uid(), reportType:rt, icon:chosenIcon, name, line:'',
          autoNumberPrefix:'', presetPieces:[],
          sections:[{id:uid(), title:'รายการตรวจทั่วไป', fields:[]}]
        };
        const list = DB.templates(); list.push(t); DB.saveTemplates(list);
        closeModal();
        go('templateEditor', {id:t.id});
      }}, 'สร้างและแก้ไขต่อ')
    )
  ), {center:true});
  setTimeout(()=>nameInput.focus(), 50);
}

VIEWS.templateEditor = function({id}){
  const t = DB.template(id);
  if (!t){ back(); return h('div'); }
  state.chrome.title = 'แก้ไขแบบฟอร์ม';
  state.chrome.subtitle = t.name;

  function persist(){ const list = DB.templates(); const idx = list.findIndex(x=>x.id===t.id); list[idx]=t; DB.saveTemplates(list); }

  const wrap = h('div', {});

  wrap.appendChild(h('div', {class:'card'},
    h('div', {class:'field'}, h('label',{},'ชื่อแบบฟอร์ม'),
      h('input', {type:'text', value:t.name, oninput: debounce((e)=>{ t.name=e.target.value.trim()||t.name; persist(); safeRender(); },400)})),
    h('div', {class:'field'}, h('label',{},'สายการผลิต / คำอธิบาย'),
      h('input', {type:'text', value:t.line||'', oninput: debounce((e)=>{ t.line=e.target.value; persist(); },400)})),
    h('div', {class:'field'}, h('label',{},'คำนำหน้าเลขอัตโนมัติ (ถ้ามี เช่น "แผ่นพื้นสำเร็จ" จะได้ชื่อชิ้นงาน 1,2,3.. อัตโนมัติ)'),
      h('input', {type:'text', value:t.autoNumberPrefix||'', placeholder:'เว้นว่างถ้าไม่ใช้', oninput: debounce((e)=>{ t.autoNumberPrefix=e.target.value; persist(); },400)})),
    h('div', {class:'field'}, h('label',{},'รายการชื่อชิ้นงานที่แนะนำ (บรรทัดละ 1 รายการ)'),
      h('textarea', {oninput: debounce((e)=>{ t.presetPieces=e.target.value.split('\n').map(s=>s.trim()).filter(Boolean); persist(); },300)}, (t.presetPieces||[]).join('\n')))
  ));

  wrap.appendChild(h('div', {class:'section-title'}, 'หมวดรายการตรวจ'));
  t.sections.forEach((sec, secIdx)=>{
    const secCard = h('div', {class:'card'});
    secCard.appendChild(h('div', {style:{display:'flex',alignItems:'center',gap:'8px',marginBottom:'10px'}},
      h('input', {type:'text', value:sec.title, style:{flex:1,fontWeight:700}, oninput: debounce((e)=>{ sec.title=e.target.value.trim()||sec.title; persist(); },400)}),
      h('button', {class:'icon-sm', disabled:secIdx===0, onclick:()=>{ [t.sections[secIdx-1],t.sections[secIdx]]=[t.sections[secIdx],t.sections[secIdx-1]]; persist(); render(); }}, '↑'),
      h('button', {class:'icon-sm', disabled:secIdx===t.sections.length-1, onclick:()=>{ [t.sections[secIdx+1],t.sections[secIdx]]=[t.sections[secIdx],t.sections[secIdx+1]]; persist(); render(); }}, '↓'),
      h('button', {class:'icon-sm danger', onclick:()=>confirmDialog('ลบหมวดนี้', `ลบหมวด "${sec.title}" และรายการตรวจทั้งหมดในหมวดนี้?`, ()=>{ t.sections.splice(secIdx,1); persist(); render(); })}, '🗑')
    ));
    sec.fields.forEach((f, fIdx)=>{
      secCard.appendChild(h('div', {class:'field-editor-row'},
        h('div', {class:'fe-info'}, h('b',{}, f.label), h('small',{}, fieldTypeLabel(f))),
        h('div', {class:'fe-actions'},
          h('button', {class:'icon-sm', disabled:fIdx===0, onclick:()=>{ [sec.fields[fIdx-1],sec.fields[fIdx]]=[sec.fields[fIdx],sec.fields[fIdx-1]]; persist(); render(); }}, '↑'),
          h('button', {class:'icon-sm', disabled:fIdx===sec.fields.length-1, onclick:()=>{ [sec.fields[fIdx+1],sec.fields[fIdx]]=[sec.fields[fIdx],sec.fields[fIdx+1]]; persist(); render(); }}, '↓'),
          h('button', {class:'icon-sm', onclick:()=>openFieldEditModal(t, sec, f, persist)}, '✎'),
          h('button', {class:'icon-sm danger', onclick:()=>confirmDialog('ลบรายการตรวจ', `ลบ "${f.label}"?`, ()=>{ sec.fields.splice(fIdx,1); persist(); render(); })}, '🗑')
        )
      ));
    });
    secCard.appendChild(h('button', {class:'btn ghost sm', onclick:()=>openFieldEditModal(t, sec, null, persist)}, '+ เพิ่มรายการตรวจ'));
    wrap.appendChild(secCard);
  });

  wrap.appendChild(h('button', {class:'btn secondary', onclick:()=>{ t.sections.push({id:uid(), title:'หมวดใหม่', fields:[]}); persist(); render(); }}, '+ เพิ่มหมวดตรวจใหม่'));

  return wrap;
};
function fieldTypeLabel(f){
  const map = {pass:'ผ่าน/ไม่ผ่าน', text:'ข้อความ', number:`ตัวเลข${f.unit?' ('+f.unit+')':''}`, time:'เวลา', select:'ตัวเลือก', note:'บันทึกข้อความยาว', duration:'ระยะเวลา (คำนวณอัตโนมัติ)'};
  return map[f.type]||f.type;
}
function openFieldEditModal(tpl, sec, field, onSave){
  const isNew = !field;
  const draftField = field ? {...field} : {id:uid(), label:'', type:'pass', unit:'', options:[]};
  const labelInput = h('input', {type:'text', value:draftField.label, placeholder:'เช่น ความสะอาดแบบหล่อ'});
  const typeSelect = h('select', {},
    ...[['pass','ผ่าน/ไม่ผ่าน'],['number','ตัวเลข'],['text','ข้อความสั้น'],['time','เวลา'],['duration','ระยะเวลา (คำนวณจากเวลาเริ่ม-เสร็จอัตโนมัติ)'],['select','ตัวเลือก (dropdown)'],['note','บันทึกข้อความยาว']]
      .map(([v,l])=>h('option',{value:v, selected:draftField.type===v}, l))
  );
  const unitInput = h('input', {type:'text', value:draftField.unit||'', placeholder:'เช่น ซม., มม., เส้น'});
  const optionsArea = h('textarea', {placeholder:'บรรทัดละ 1 ตัวเลือก'}, (draftField.options||[]).join('\n'));
  const unitField = h('div', {class:'field', style:{display: draftField.type==='number'?'block':'none'}}, h('label',{},'หน่วย'), unitInput);
  const optField = h('div', {class:'field', style:{display: draftField.type==='select'?'block':'none'}}, h('label',{},'ตัวเลือก'), optionsArea);

  const timeFields = sec.fields.filter(f=>f.type==='time' && f.id!==draftField.id);
  const startSelect = h('select', {},
    h('option',{value:''},'— เลือกรายการเวลาเริ่ม —'),
    ...timeFields.map(f=>h('option',{value:f.id, selected:draftField.startFieldId===f.id}, f.label))
  );
  const endSelect = h('select', {},
    h('option',{value:''},'— เลือกรายการเวลาสิ้นสุด —'),
    ...timeFields.map(f=>h('option',{value:f.id, selected:draftField.endFieldId===f.id}, f.label))
  );
  const durationField = h('div', {class:'field', style:{display: draftField.type==='duration'?'block':'none'}},
    timeFields.length >= 2
      ? h('div', {},
          h('label',{},'คำนวณจากเวลาเริ่ม'), startSelect,
          h('label',{style:{marginTop:'8px'}},'ถึงเวลาสิ้นสุด'), endSelect
        )
      : h('div', {class:'hint'}, 'ต้องมีรายการตรวจประเภท "เวลา" อย่างน้อย 2 รายการในหมวดนี้ก่อน จึงจะเลือกคำนวณระยะเวลาได้')
  );

  typeSelect.addEventListener('change', ()=>{
    unitField.style.display = typeSelect.value==='number' ? 'block':'none';
    optField.style.display = typeSelect.value==='select' ? 'block':'none';
    durationField.style.display = typeSelect.value==='duration' ? 'block':'none';
  });

  openModal(h('div', {},
    h('div', {class:'modal-title'}, isNew ? 'เพิ่มรายการตรวจ' : 'แก้ไขรายการตรวจ'),
    h('div', {class:'field'}, h('label',{},'ชื่อรายการตรวจ'), labelInput),
    h('div', {class:'field'}, h('label',{},'รูปแบบการตอบ'), typeSelect),
    unitField, optField, durationField,
    h('div', {class:'btn-row'},
      h('button', {class:'btn secondary', onclick:closeModal}, 'ยกเลิก'),
      h('button', {class:'btn', onclick:()=>{
        const label = labelInput.value.trim();
        if (!label){ toast('กรุณาระบุชื่อรายการ','err'); return; }
        if (typeSelect.value==='duration' && (!startSelect.value || !endSelect.value)){ toast('กรุณาเลือกรายการเวลาเริ่มและเวลาสิ้นสุด','err'); return; }
        draftField.label = label;
        draftField.type = typeSelect.value;
        draftField.unit = unitInput.value.trim();
        draftField.options = optionsArea.value.split('\n').map(s=>s.trim()).filter(Boolean);
        if (typeSelect.value==='duration'){ draftField.startFieldId = startSelect.value; draftField.endFieldId = endSelect.value; }
        if (isNew) sec.fields.push(draftField);
        else Object.assign(field, draftField);
        onSave();
        closeModal();
        render();
      }}, 'บันทึก')
    )
  ), {center:true});
  setTimeout(()=>labelInput.focus(), 50);
}

VIEWS.backup = function(){
  state.chrome.title = 'สำรอง / กู้คืนข้อมูล';
  const wrap = h('div', {});

  let bytes = 0;
  try{ for (const k of Object.values(KEYS)) bytes += (localStorage.getItem(k)||'').length; }catch(e){}
  const kb = (bytes/1024).toFixed(0);
  const pct = clamp(bytes/(5*1024*1024)*100, 0, 100);
  wrap.appendChild(h('div', {class:'card'},
    h('div', {class:'card-title'}, 'พื้นที่จัดเก็บข้อมูล (โดยประมาณ)'),
    h('div', {class:'progress-bar'}, h('div', {style:{width:pct+'%', background: pct>80?'var(--danger)':'var(--brand)'}})),
    h('div', {style:{fontSize:'12px', color:'var(--text-dim)', marginTop:'6px'}}, `${kb} KB ใช้งานแล้ว (โควตาเบราว์เซอร์ทั่วไป ~5 MB)`)
  ));

  wrap.appendChild(h('div', {class:'card'},
    h('div', {class:'card-title'}, 'ส่งออกข้อมูลทั้งหมด'),
    h('div', {style:{fontSize:'13px', color:'var(--text-dim)', marginBottom:'10px'}}, 'บันทึกไฟล์สำรองข้อมูล (พนักงาน, แบบฟอร์ม, ประวัติการตรวจ) ไว้ในเครื่อง เพื่อป้องกันข้อมูลสูญหาย'),
    h('button', {class:'btn', onclick:exportAllData}, '⬇ ส่งออกไฟล์สำรอง (.json)')
  ));

  const fileInput = h('input', {type:'file', accept:'application/json', style:{display:'none'}, onchange:(e)=>{
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const data = JSON.parse(reader.result);
        confirmDialog('นำเข้าข้อมูล', 'การนำเข้าจะเขียนทับข้อมูลปัจจุบันทั้งหมด ต้องการดำเนินการต่อหรือไม่?', ()=>{
          if (data.employees) DB.saveEmployees(data.employees);
          if (data.templates) DB.saveTemplates(data.templates);
          if (data.records) DB.saveRecords(data.records);
          if (data.settings) DB.saveSettings(data.settings);
          toast('นำเข้าข้อมูลสำเร็จ','ok');
          applyTheme(); render();
        });
      }catch(err){ toast('ไฟล์ไม่ถูกต้อง','err'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }});
  wrap.appendChild(h('div', {class:'card'},
    h('div', {class:'card-title'}, 'นำเข้าข้อมูลจากไฟล์สำรอง'),
    h('button', {class:'btn secondary', onclick:()=>fileInput.click()}, '⬆ เลือกไฟล์ .json'), fileInput
  ));

  wrap.appendChild(h('div', {class:'card'},
    h('div', {class:'card-title'}, 'ล้างพื้นที่จัดเก็บ'),
    h('div', {style:{fontSize:'13px', color:'var(--text-dim)', marginBottom:'10px'}}, 'ลบรูปภาพในประวัติที่เก่ากว่า 90 วัน เพื่อคืนพื้นที่จัดเก็บ (ข้อมูลอื่นยังอยู่ครบ)'),
    h('button', {class:'btn secondary', onclick:clearOldPhotos}, '🧹 ล้างรูปภาพเก่า')
  ));

  return wrap;
};
function exportAllData(){
  const data = {
    exportedAt: new Date().toISOString(),
    employees: DB.employees(), templates: DB.templates(), records: DB.records(), settings: DB.settings()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `qc-precast-backup-${todayISO()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
  toast('ส่งออกไฟล์สำรองแล้ว','ok');
}
function clearOldPhotos(){
  const cutoff = Date.now() - 90*24*60*60*1000;
  const records = DB.records();
  let cleared = 0;
  records.forEach(r=>{
    if (r.createdAt < cutoff){
      r.pieces.forEach(p=>{ if (p.photos && Object.keys(p.photos).length){ p.photos = {}; cleared++; } });
    }
  });
  DB.saveRecords(records);
  toast(cleared ? `ล้างรูปภาพแล้ว ${cleared} ชิ้นงาน` : 'ไม่มีรูปภาพเก่าที่ต้องล้าง', 'ok');
  render();
}

/* ============================================================
   BOOT
   ============================================================ */
/* ---------------- dynamic, non-blocking script loading ---------------- */
// Some networks (factory/office WiFi with a restrictive firewall) block
// Google/Firebase domains outright. If those scripts were loaded as normal
// blocking <script> tags, a silently-dropped connection could stall page
// load for a very long time — the whole app would never appear. Instead we
// load them dynamically, in the background, well after the app has already
// rendered from local data, each with its own short timeout.
function loadScriptOnce(src, timeoutMs){
  return new Promise((resolve, reject)=>{
    let done = false;
    const timer = setTimeout(()=>{ if (!done){ done=true; reject(new Error('timeout: '+src)); } }, timeoutMs);
    const s = document.createElement('script');
    s.src = src;
    s.onload = ()=>{ if (!done){ done=true; clearTimeout(timer); resolve(); } };
    s.onerror = ()=>{ if (!done){ done=true; clearTimeout(timer); reject(new Error('failed to load: '+src)); } };
    document.head.appendChild(s);
  });
}
async function tryLoadFirebase(){
  try{
    await loadScriptOnce('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js', 7000);
    await loadScriptOnce('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth-compat.js', 7000);
    await loadScriptOnce('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore-compat.js', 7000);
    await loadScriptOnce('firebase-config.js', 4000);
    return typeof FIREBASE_CONFIGURED !== 'undefined' && FIREBASE_CONFIGURED;
  }catch(err){
    console.warn('Firebase SDK unavailable (network may be blocking Google/Firebase domains) — staying in offline/local mode:', err.message);
    return false;
  }
}

async function boot(){
  applyTheme();
  qs('#btnBack').addEventListener('click', back);
  qsa('.tab-item').forEach(btn=>btn.addEventListener('click', ()=>switchTab(btn.dataset.tab)));

  // Always have usable data and a rendered app immediately — never block
  // the first paint on a network-dependent cloud connection.
  ensureSeedLocal();
  render();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')){
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }

  // Cloud sync is a progressive enhancement, attached in the background.
  // If it connects, DB.* transparently switches from localStorage to
  // Firestore on the next call — no reload needed. If it can't connect
  // (blocked network, offline), the app keeps working locally, silently.
  const ok = await tryLoadFirebase();
  if (!ok) return;
  updateSyncBadge();
  window.addEventListener('online', updateSyncBadge);
  window.addEventListener('offline', updateSyncBadge);
  try{
    await Promise.race([initCloudSync(), new Promise(r=>setTimeout(r, 9000))]);
  }catch(err){
    console.error('boot: cloud sync failed', err);
  }
  render();
}
document.addEventListener('DOMContentLoaded', boot);
