/* ===================================================================
   ระบบประเมินผลการดำเนินงาน คปสอ. 2570  — frontend (vanilla JS)  v2
   =================================================================== */
const cfg = window.APP_CONFIG;
const db  = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

const DISTRICTS = [
  {no:1,name:'เมืองพิษณุโลก'},{no:2,name:'นครไทย'},{no:3,name:'ชาติตระการ'},
  {no:4,name:'บางระกำ'},{no:5,name:'บางกระทุ่ม'},{no:6,name:'พรหมพิราม'},
  {no:7,name:'วัดโบสถ์'},{no:8,name:'วังทอง'},{no:9,name:'เนินมะปราง'},
];
const DNAME = Object.fromEntries(DISTRICTS.map(d=>[d.no,d.name]));
const COMPS = [
  ['p','Plan','การวางแผน'],['d','Do','การดำเนินการ'],['c','Check','การตรวจสอบ/ติดตาม'],
  ['a','Act','การปรับปรุงพัฒนา'],['r','Results','ผลผลิต/ผลลัพธ์'],
];
const CATS = ['งานประจำ/ภารกิจพื้นฐาน','งานนโยบาย','งานยุทธศาสตร์','อื่นๆ'];

const esc=s=>(s==null?'':String(s)).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const $=id=>document.getElementById(id);

let ST = { user:null, role:null, groupId:null, weights:{w1:60,w2:40},
  grades:[{min:90,label:'ดีเยี่ยม',color:'#067647'},{min:80,label:'ดีมาก',color:'#175cd3'},
          {min:50,label:'ดี',color:'#b54708'},{min:0,label:'ต้องปรับปรุง',color:'#b42318'}],
  labels:{part1:'ผลสำเร็จตามตัวชี้วัด (KPI)',part2:'ผลการดำเนินงานประจำ/นโยบาย (PDCA)',title:''} };
let CHART=null;

function gradeOf(s){
  if(s==null||isNaN(s)) return null;
  const g=[...ST.grades].sort((a,b)=>b.min-a.min);
  for(const x of g){ if(s>=x.min) return x; }
  return g[g.length-1]||null;
}
// ประเด็นนี้ใช้กับอำเภอใดบ้าง (ว่าง = ครบ 9)
function topicDistricts(t){
  if(!t.districts || !t.districts.length) return DISTRICTS.map(d=>d.no);
  return t.districts;
}
// S ของประเด็น ณ อำเภอหนึ่ง = 15*ค่าเฉลี่ย(5 องค์ประกอบ)+25 (ต้องครบ 5 ช่อง)
function sOfRow(row){
  if(!row) return null;
  const v=[row.p,row.d,row.c,row.a,row.r];
  if(v.some(x=>x==null)) return null;
  return 15*(v.reduce((a,b)=>a+b,0)/5)+25;
}

/* ---------------- Auth ---------------- */
async function init(){
  if(cfg.TITLE){ $('loginTitle').textContent=cfg.TITLE; $('appTitle').textContent=cfg.TITLE; }
  if(cfg.SUBTITLE){ $('appSub').textContent=cfg.SUBTITLE; }
  const {data}=await db.auth.getSession();
  if(data.session){ await afterLogin(data.session.user); } else { showLogin(); }
}
function showLogin(){ $('app').classList.add('hidden'); $('login').classList.remove('hidden'); }

$('loginForm').addEventListener('submit', async e=>{
  e.preventDefault(); $('loginMsg').innerHTML='';
  const u=$('username').value.trim().toLowerCase();
  const email=u.includes('@')?u:(u+'@'+cfg.LOGIN_DOMAIN);
  const {data,error}=await db.auth.signInWithPassword({email,password:$('password').value});
  if(error){ $('loginMsg').innerHTML='<div class="msg err">เข้าสู่ระบบไม่สำเร็จ: ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง</div>'; return; }
  await afterLogin(data.user);
});
$('logoutBtn').addEventListener('click', async ()=>{ await db.auth.signOut(); location.reload(); });

async function loadSettings(){
  const {data:set}=await db.from('settings').select('*').eq('id',1).single();
  if(set){
    ST.weights={w1:Number(set.weight1),w2:Number(set.weight2)};
    if(set.grades) ST.grades=set.grades;
    if(set.labels) ST.labels=Object.assign(ST.labels,set.labels);
  }
  if(ST.labels.title){ $('appTitle').textContent=ST.labels.title; }
}

async function afterLogin(user){
  ST.user=user;
  const {data:prof,error}=await db.from('profiles').select('role,group_id').eq('user_id',user.id).single();
  if(error||!prof){ $('loginMsg').innerHTML='<div class="msg err">บัญชีนี้ยังไม่ได้ผูกกลุ่ม/บทบาท กรุณาแจ้งผู้ดูแลระบบ</div>'; await db.auth.signOut(); return; }
  ST.role=prof.role; ST.groupId=prof.group_id;
  await loadSettings();
  $('login').classList.add('hidden'); $('app').classList.remove('hidden');
  if(ST.role==='admin'){
    $('whoBox').innerHTML='ผู้ดูแลระบบ (Admin)';
    buildTabs([['members','บัญชีสมาชิก'],['criteria','เกณฑ์/ประเด็น'],['kpi','KPI 60%'],
               ['dashboard','แดชบอร์ด/อันดับ'],['results','ผลรวม 60/40'],['settings','ตั้งค่า']]);
  }else{
    const {data:g}=await db.from('groups').select('name').eq('id',ST.groupId).single();
    $('whoBox').innerHTML=esc(g?g.name:('กลุ่ม '+ST.groupId));
    buildTabs([['topics','ประเด็นการประเมิน'],['score','ให้คะแนน PDCA'],['result','ผลของกลุ่ม'],['info','ข้อมูลกลุ่ม']]);
  }
}

/* ---------------- Tabs ---------------- */
function buildTabs(tabs){
  $('tabs').innerHTML=tabs.map(([k,label],i)=>`<button data-k="${k}" class="${i===0?'active':''}">${esc(label)}</button>`).join('');
  $('tabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{
    $('tabs').querySelectorAll('button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); route(b.dataset.k);
  });
  route(tabs[0][0]);
}
function route(k){
  if(CHART){ CHART.destroy(); CHART=null; }
  $('view').innerHTML='<div class="card">กำลังโหลด…</div>';
  ({topics:viewTopics,score:viewScore,result:viewGroupResult,info:viewInfo,
    members:viewMembers,criteria:viewCriteria,kpi:viewKpi,dashboard:viewDashboard,
    results:viewResults,settings:viewSettings}[k])();
}

/* ============ GROUP: จัดการประเด็น ============ */
async function viewTopics(){
  const [{data:g},{data:topics}]=await Promise.all([
    db.from('groups').select('topics_locked').eq('id',ST.groupId).single(),
    db.from('topics').select('*').eq('group_id',ST.groupId).order('id'),
  ]);
  const locked=g&&g.topics_locked;
  const dBadge=t=>{ const ds=t.districts&&t.districts.length; return ds?`<div style="color:#175cd3;font-size:12px">เฉพาะ: ${t.districts.map(n=>esc(DNAME[n])).join(', ')}</div>`:''; };
  const list=(topics||[]).map(t=>`
    <tr><td class="name">${esc(t.name)}${dBadge(t)}</td><td>${esc(t.category||'')}</td>
      <td class="name">${esc(t.resp_name||'')}${t.resp_position?'<br><span style="color:#667085;font-size:12.5px">'+esc(t.resp_position)+'</span>':''}</td>
      <td>${locked?'':`<button class="btn danger sm" data-del="${t.id}">ลบ</button>`}</td></tr>`).join('');
  $('view').innerHTML=`
    <div class="card">
      <h2>ประเด็นการประเมินของกลุ่ม
        <span class="pill ${locked?'lock':'open'}">${locked?'ล็อกแล้ว (แก้ไขไม่ได้)':'เปิดให้เพิ่ม/แก้ไข'}</span></h2>
      <p class="hint">เพิ่มเฉพาะประเด็น/งานย่อยที่กลุ่มของท่านรับผิดชอบ</p>
      <table><thead><tr><th class="name">ชื่อประเด็น/งานย่อย</th><th>ประเภทงาน</th><th class="name">ผู้รับผิดชอบ</th><th>จัดการ</th></tr></thead>
        <tbody>${list||'<tr><td colspan="4" style="color:#667085">ยังไม่มีประเด็น</td></tr>'}</tbody></table>
    </div>
    ${locked?'':`<div class="card"><h2>เพิ่มประเด็นใหม่</h2>
      <div class="row"><div style="flex:2"><label class="fld">ชื่อประเด็น/งานย่อย *</label><input id="nt_name"></div>
        <div><label class="fld">ประเภทงาน</label><select id="nt_cat">${CATS.map(c=>`<option>${c}</option>`).join('')}</select></div></div>
      <div class="row"><div><label class="fld">ผู้รับผิดชอบ (ชื่อ)</label><input id="nt_rn"></div>
        <div><label class="fld">ตำแหน่ง</label><input id="nt_rp"></div></div>
      <div id="nt_msg"></div><button class="btn" id="nt_add" style="margin-top:14px">+ เพิ่มประเด็น</button></div>`}`;
  $('view').querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
    if(!confirm('ลบประเด็นนี้และคะแนนที่เกี่ยวข้อง?')) return;
    await db.from('topics').delete().eq('id',b.dataset.del); viewTopics();
  });
  const add=$('nt_add');
  if(add) add.onclick=async()=>{
    const name=$('nt_name').value.trim();
    if(!name){ $('nt_msg').innerHTML='<div class="msg err">กรุณากรอกชื่อประเด็น</div>'; return; }
    const {error}=await db.from('topics').insert({group_id:ST.groupId,name,category:$('nt_cat').value,
      resp_name:$('nt_rn').value.trim(),resp_position:$('nt_rp').value.trim()});
    if(error){ $('nt_msg').innerHTML='<div class="msg err">บันทึกไม่สำเร็จ: '+esc(error.message)+'</div>'; return; }
    viewTopics();
  };
}

/* ============ GROUP: ให้คะแนน PDCA ============ */
async function viewScore(){
  const {data:topics}=await db.from('topics').select('*').eq('group_id',ST.groupId).order('id');
  if(!topics||!topics.length){ $('view').innerHTML='<div class="card">ยังไม่มีประเด็น กรุณาเพิ่มในแท็บ “ประเด็นการประเมิน” ก่อน</div>'; return; }
  const ids=topics.map(t=>t.id);
  const {data:scores}=await db.from('scores').select('*').in('topic_id',ids);
  const map={}; (scores||[]).forEach(s=>map[s.topic_id+'_'+s.dno]=s);
  renderScoreCards(topics,map,'sv_msg');
}
function renderScoreCards(topics,map,msgId,containerHead=''){
  const cards=topics.map(t=>{
    const dnos=topicDistricts(t);
    const rows=DISTRICTS.filter(dc=>dnos.includes(dc.no)).map(dc=>{
      const s=map[t.id+'_'+dc.no]||{};
      const inputs=COMPS.map(([k])=>`<td><input type="number" min="1" max="5" data-t="${t.id}" data-dno="${dc.no}" data-f="${k}" value="${s[k]??''}"></td>`).join('');
      const sv=sOfRow(s);
      return `<tr><td class="name">${esc(dc.name)}</td>${inputs}<td data-s="${t.id}_${dc.no}">${sv==null?'-':sv.toFixed(1)}</td></tr>`;
    }).join('');
    return `<div class="topic-card"><div class="topic-head"><div class="t"><b>${esc(t.name)}</b>
        <div class="meta">${esc(t.category||'')}${t.resp_name?' · '+esc(t.resp_name):''}${(t.districts&&t.districts.length)?' · เฉพาะ '+t.districts.length+' อำเภอ':''}</div></div></div>
      <table class="score-tbl"><thead><tr><th class="name">อำเภอ</th>${COMPS.map(c=>`<th title="${c[2]}">${c[1]}</th>`).join('')}<th>S</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
  }).join('');
  $('view').innerHTML=`<div class="card"><h2>ให้คะแนน PDCA (ระดับ 1–5)</h2>
    <p class="hint">P=วางแผน · D=ดำเนินการ · C=ตรวจสอบ/ติดตาม · A=ปรับปรุงพัฒนา · R=ผลลัพธ์ | S = 15×ค่าเฉลี่ย + 25 (ครบ 5 ช่อง) · บันทึกอัตโนมัติ</p>
    ${containerHead}<span id="${msgId}"></span></div>${cards}`;
  $('view').querySelectorAll('input[type=number]').forEach(inp=>{
    inp.onchange=async()=>{
      let val=inp.value===''?null:Math.round(Number(inp.value));
      if(val!=null && (val<1||val>5)){ val=Math.min(5,Math.max(1,val)); inp.value=val; }
      const tid=inp.dataset.t, dno=Number(inp.dataset.dno), f=inp.dataset.f;
      const key=tid+'_'+dno; const cur=map[key]||{topic_id:Number(tid),dno};
      cur[f]=val; map[key]=cur;
      const payload={topic_id:Number(tid),dno,p:cur.p??null,d:cur.d??null,c:cur.c??null,a:cur.a??null,r:cur.r??null};
      const {error}=await db.from('scores').upsert(payload,{onConflict:'topic_id,dno'});
      const m=$(msgId);
      if(error){ m.innerHTML='<div class="msg err">บันทึกไม่สำเร็จ: '+esc(error.message)+'</div>'; }
      else{ m.innerHTML='<div class="msg ok">บันทึกแล้ว</div>'; setTimeout(()=>m.innerHTML='',1000); }
      const sv=sOfRow(cur); const cell=$('view').querySelector(`[data-s="${key}"]`);
      if(cell) cell.textContent=sv==null?'-':sv.toFixed(1);
    };
  });
}

/* ============ GROUP: ผลของกลุ่ม ============ */
async function viewGroupResult(){
  const {data:topics}=await db.from('topics').select('id').eq('group_id',ST.groupId);
  const ids=(topics||[]).map(t=>t.id);
  let scores=[]; if(ids.length){ const r=await db.from('scores').select('*').in('topic_id',ids); scores=r.data||[]; }
  const perDist=DISTRICTS.map(dc=>{
    const ss=scores.filter(s=>s.dno===dc.no).map(sOfRow).filter(x=>x!=null);
    return {name:dc.name, s:ss.length? ss.reduce((a,b)=>a+b,0)/ss.length : null};
  });
  const valid=perDist.filter(d=>d.s!=null).map(d=>d.s);
  const avg=valid.length? valid.reduce((a,b)=>a+b,0)/valid.length : null;
  $('view').innerHTML=`<div class="card"><h2>ผลคะแนนส่วนที่ 2 (PDCA) ของกลุ่มท่าน รายอำเภอ</h2>
    <table><thead><tr><th class="name">อำเภอ</th><th>คะแนน S ของกลุ่ม</th></tr></thead>
    <tbody>${perDist.map(d=>`<tr><td class="name">${esc(d.name)}</td><td>${d.s==null?'-':d.s.toFixed(2)}</td></tr>`).join('')}
    <tr style="font-weight:700;background:#f4f7f9"><td class="name">เฉลี่ยทั้งกลุ่ม</td><td>${avg==null?'-':avg.toFixed(2)}</td></tr>
    </tbody></table></div>`;
}

/* ============ GROUP: ข้อมูลกลุ่ม ============ */
async function viewInfo(){
  const {data:g}=await db.from('groups').select('*').eq('id',ST.groupId).single();
  $('view').innerHTML=`<div class="card"><h2>ข้อมูลกลุ่มงาน</h2>
    <label class="fld">ชื่อกลุ่มงาน</label><input value="${esc(g.name)}" disabled>
    <label class="fld">ผู้ประสานงานหลัก</label><input id="g_co" value="${esc(g.coordinator||'')}">
    <label class="fld">เมลล์กลางของกลุ่มงาน</label><input id="g_mail" value="${esc(g.central_email||'')}">
    <div id="g_msg"></div><button class="btn" id="g_save" style="margin-top:14px">บันทึก</button></div>`;
  $('g_save').onclick=async()=>{
    const {error}=await db.from('groups').update({coordinator:$('g_co').value.trim(),central_email:$('g_mail').value.trim()}).eq('id',ST.groupId);
    $('g_msg').innerHTML=error?'<div class="msg err">บันทึกไม่สำเร็จ</div>':'<div class="msg ok">บันทึกแล้ว</div>';
  };
}

/* ============ ADMIN: บัญชีสมาชิก ============ */
async function viewMembers(){
  const [{data:profs},{data:groups}]=await Promise.all([
    db.from('profiles').select('*'),
    db.from('groups').select('id,name').order('id'),
  ]);
  const gName=Object.fromEntries((groups||[]).map(g=>[g.id,g.name]));
  const rows=(profs||[]).sort((a,b)=>(a.role>b.role?1:-1)||((a.group_id||0)-(b.group_id||0))).map(p=>`
    <tr><td class="name">${esc(p.email||'(ไม่ทราบ)')}</td>
      <td>${p.role==='admin'?'<span class="pill g2">แอดมิน</span>':'กลุ่ม'}</td>
      <td class="name">${p.role==='admin'?'—':esc(gName[p.group_id]||('กลุ่ม '+p.group_id))}</td>
      <td style="white-space:nowrap">
        <button class="btn sec sm" data-pw="${p.user_id}">ตั้งรหัสใหม่</button>
        <button class="btn danger sm" data-del="${p.user_id}" data-email="${esc(p.email||'')}">ลบ</button></td></tr>`).join('');
  const gopts=(groups||[]).map(g=>`<option value="${g.id}">${g.id} - ${esc(g.name)}</option>`).join('');
  $('view').innerHTML=`
    <div class="card"><h2>สร้างบัญชีสมาชิกใหม่</h2>
      <p class="hint">ชื่อผู้ใช้ไม่ต้องใส่ @ ระบบเติม <b>@${esc(cfg.LOGIN_DOMAIN)}</b> ให้เอง · รหัสผ่านอย่างน้อย 6 ตัว</p>
      <div class="row">
        <div><label class="fld">ชื่อผู้ใช้ *</label><input id="m_user" placeholder="เช่น group3 หรือ somchai"></div>
        <div><label class="fld">รหัสผ่าน *</label><input id="m_pass"></div>
        <div><label class="fld">บทบาท</label><select id="m_role"><option value="group">กลุ่มงาน</option><option value="admin">แอดมิน</option></select></div>
        <div id="m_gwrap"><label class="fld">กลุ่มงาน</label><select id="m_group">${gopts}</select></div>
      </div>
      <div id="m_msg"></div><button class="btn" id="m_create" style="margin-top:12px">+ สร้างบัญชี</button>
    </div>
    <div class="card"><h2>รายชื่อสมาชิก (${(profs||[]).length})</h2>
      <table><thead><tr><th class="name">ชื่อผู้ใช้ / อีเมล</th><th>บทบาท</th><th class="name">กลุ่มงาน</th><th>จัดการ</th></tr></thead>
      <tbody>${rows||'<tr><td colspan="4" style="color:#667085">ยังไม่มีสมาชิก</td></tr>'}</tbody></table></div>`;
  const roleSel=$('m_role');
  const toggleG=()=>{ $('m_gwrap').style.display=roleSel.value==='admin'?'none':'block'; };
  roleSel.onchange=toggleG; toggleG();
  $('m_create').onclick=async()=>{
    const username=$('m_user').value.trim(), password=$('m_pass').value;
    if(!username||!password){ $('m_msg').innerHTML='<div class="msg err">กรอกชื่อผู้ใช้และรหัสผ่าน</div>'; return; }
    $('m_msg').innerHTML='กำลังสร้าง…';
    const body={action:'create',username,password,role:roleSel.value,domain:cfg.LOGIN_DOMAIN};
    if(roleSel.value!=='admin') body.group_id=Number($('m_group').value);
    const {data,error}=await db.functions.invoke('admin-users',{body});
    if(error||(data&&data.error)){ $('m_msg').innerHTML='<div class="msg err">ไม่สำเร็จ: '+esc((data&&data.error)||error.message)+'</div>'; return; }
    viewMembers();
  };
  $('view').querySelectorAll('[data-pw]').forEach(b=>b.onclick=async()=>{
    const pw=prompt('ตั้งรหัสผ่านใหม่ (อย่างน้อย 6 ตัว):'); if(!pw) return;
    const {data,error}=await db.functions.invoke('admin-users',{body:{action:'password',user_id:b.dataset.pw,password:pw}});
    alert((error||(data&&data.error))?('ไม่สำเร็จ: '+((data&&data.error)||error.message)):'ตั้งรหัสผ่านใหม่แล้ว');
  });
  $('view').querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
    if(!confirm('ลบบัญชี '+b.dataset.email+' ?')) return;
    const {data,error}=await db.functions.invoke('admin-users',{body:{action:'delete',user_id:b.dataset.del}});
    if(error||(data&&data.error)){ alert('ไม่สำเร็จ: '+((data&&data.error)||error.message)); return; }
    viewMembers();
  });
}

/* ============ ADMIN: เกณฑ์/ประเด็น (เลือกอำเภอ) ============ */
async function viewCriteria(){
  const {data:groups}=await db.from('groups').select('*').order('id');
  const sel=window._critGroup||((groups&&groups[0]&&groups[0].id)||1);
  window._critGroup=sel;
  const g=(groups||[]).find(x=>x.id==sel)||{};
  const {data:topics}=await db.from('topics').select('*').eq('group_id',sel).order('id');
  const gopts=(groups||[]).map(x=>`<option value="${x.id}" ${x.id==sel?'selected':''}>${x.id} - ${esc(x.name)}</option>`).join('');
  const dd=t=>{ const ds=t.districts&&t.districts.length; return ds?t.districts.map(n=>esc(DNAME[n])).join(', '):'ครบ 9 อำเภอ'; };
  const list=(topics||[]).map(t=>`<tr><td class="name">${esc(t.name)}</td><td>${esc(t.category||'')}</td>
      <td class="name" style="font-size:13px">${dd(t)}</td>
      <td><button class="btn danger sm" data-del="${t.id}">ลบ</button></td></tr>`).join('');
  const dchecks=DISTRICTS.map(d=>`<label style="display:inline-flex;gap:5px;align-items:center;margin:3px 10px 3px 0;font-size:13.5px">
      <input type="checkbox" class="dchk" value="${d.no}" checked style="width:auto"> ${esc(d.name)}</label>`).join('');
  $('view').innerHTML=`
    <div class="card"><h2>เกณฑ์/ประเด็นการประเมิน</h2>
      <p class="hint">แอดมินสร้างประเด็นให้กลุ่มใดก็ได้ และเลือกว่าจะใช้ประเมินกับอำเภอใดบ้าง · กด “ล็อก” เพื่อปิดไม่ให้กลุ่มแก้ไขเมื่อเริ่มให้คะแนน</p>
      <div class="row"><div><label class="fld">เลือกกลุ่มงาน</label><select id="c_group">${gopts}</select></div>
        <div style="flex:0 0 auto"><label class="fld">สถานะประเด็น</label>
          <button class="btn sec" id="c_lock">${g.topics_locked?'🔒 ล็อกอยู่ — กดปลดล็อก':'🔓 เปิดอยู่ — กดล็อก'}</button></div></div>
    </div>
    <div class="card"><h2>ประเด็นของ: ${esc(g.name||'')}</h2>
      <table><thead><tr><th class="name">ชื่อประเด็น</th><th>ประเภท</th><th class="name">ใช้กับอำเภอ</th><th></th></tr></thead>
      <tbody>${list||'<tr><td colspan="4" style="color:#667085">ยังไม่มีประเด็น</td></tr>'}</tbody></table></div>
    <div class="card"><h2>+ เพิ่มประเด็นให้กลุ่มนี้</h2>
      <div class="row"><div style="flex:2"><label class="fld">ชื่อประเด็น/งานย่อย *</label><input id="c_name"></div>
        <div><label class="fld">ประเภทงาน</label><select id="c_cat">${CATS.map(c=>`<option>${c}</option>`).join('')}</select></div></div>
      <label class="fld">ใช้ประเมินกับอำเภอ <button class="btn sec sm" id="c_all" type="button">เลือกทั้งหมด</button> <button class="btn sec sm" id="c_none" type="button">ไม่เลือก</button></label>
      <div style="border:1px solid var(--line);border-radius:9px;padding:10px">${dchecks}</div>
      <div id="c_msg"></div><button class="btn" id="c_add" style="margin-top:12px">เพิ่มประเด็น</button></div>`;
  $('c_group').onchange=e=>{ window._critGroup=Number(e.target.value); viewCriteria(); };
  $('c_lock').onclick=async()=>{ await db.from('groups').update({topics_locked:!g.topics_locked}).eq('id',sel); viewCriteria(); };
  $('c_all').onclick=()=>$('view').querySelectorAll('.dchk').forEach(c=>c.checked=true);
  $('c_none').onclick=()=>$('view').querySelectorAll('.dchk').forEach(c=>c.checked=false);
  $('view').querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
    if(!confirm('ลบประเด็นนี้และคะแนน?')) return;
    await db.from('topics').delete().eq('id',b.dataset.del); viewCriteria();
  });
  $('c_add').onclick=async()=>{
    const name=$('c_name').value.trim();
    if(!name){ $('c_msg').innerHTML='<div class="msg err">กรอกชื่อประเด็น</div>'; return; }
    const chosen=[...$('view').querySelectorAll('.dchk:checked')].map(c=>Number(c.value));
    const districts=(chosen.length===0||chosen.length===9)?null:chosen;
    const {error}=await db.from('topics').insert({group_id:sel,name,category:$('c_cat').value,districts});
    if(error){ $('c_msg').innerHTML='<div class="msg err">ไม่สำเร็จ: '+esc(error.message)+'</div>'; return; }
    viewCriteria();
  };
}

/* ============ ADMIN: KPI 60% ============ */
async function viewKpi(){
  const {data:kpi}=await db.from('kpi_scores').select('*');
  const map={}; (kpi||[]).forEach(k=>map[k.dno]=k.percent);
  $('view').innerHTML=`<div class="card"><h2>ส่วนที่ 1 — ร้อยละผ่านเกณฑ์ Health KPI (${ST.weights.w1}%)</h2>
    <p class="hint">กรอกร้อยละผ่านตัวชี้วัดของแต่ละอำเภอ (0–100) ผู้ดูแลระบบกรอกเอง</p>
    <div class="kpi-grid">${DISTRICTS.map(dc=>`<div class="kbox"><div class="t">${esc(dc.name)}</div>
      <input type="number" min="0" max="100" step="0.01" data-kpi="${dc.no}" value="${map[dc.no]??''}"></div>`).join('')}</div>
    <div id="kpi_msg"></div><button class="btn" id="kpi_save" style="margin-top:16px">บันทึก KPI</button></div>`;
  $('kpi_save').onclick=async()=>{
    const rows=DISTRICTS.map(dc=>{const v=$('view').querySelector(`[data-kpi="${dc.no}"]`).value; return {dno:dc.no,percent:v===''?null:Number(v)};}).filter(r=>r.percent!=null);
    const {error}=await db.from('kpi_scores').upsert(rows,{onConflict:'dno'});
    $('kpi_msg').innerHTML=error?'<div class="msg err">ไม่สำเร็จ: '+esc(error.message)+'</div>':'<div class="msg ok">บันทึกแล้ว</div>';
  };
}

/* ============ คำนวณผลรวมรายอำเภอ (ใช้ร่วม dashboard+results) ============ */
async function computeDistrictTotals(){
  const [{data:topics},{data:kpi}]=await Promise.all([
    db.from('topics').select('id,group_id'), db.from('kpi_scores').select('*'),
  ]);
  const ids=(topics||[]).map(t=>t.id);
  let scores=[]; if(ids.length){ const r=await db.from('scores').select('*').in('topic_id',ids); scores=r.data||[]; }
  const topicGroup={}; (topics||[]).forEach(t=>topicGroup[t.id]=t.group_id);
  const kpiMap={}; (kpi||[]).forEach(k=>kpiMap[k.dno]=Number(k.percent));
  const w1=ST.weights.w1/100, w2=ST.weights.w2/100;
  return DISTRICTS.map(dc=>{
    const byGroup={};
    scores.filter(s=>s.dno===dc.no).forEach(s=>{const sv=sOfRow(s); if(sv==null) return;
      const gid=topicGroup[s.topic_id]; (byGroup[gid]=byGroup[gid]||[]).push(sv);});
    const groupS=Object.values(byGroup).map(a=>a.reduce((x,y)=>x+y,0)/a.length);
    const part2=groupS.length? groupS.reduce((a,b)=>a+b,0)/groupS.length : null;
    const part1=kpiMap[dc.no]!=null? kpiMap[dc.no] : null;
    let total=null; if(part1!=null&&part2!=null) total=part1*w1+part2*w2;
    return {no:dc.no,name:dc.name,part1,part2,total,g:gradeOf(total),ng:groupS.length};
  });
}

/* ============ ADMIN: แดชบอร์ด/อันดับ ============ */
async function viewDashboard(){
  const rows=await computeDistrictTotals();
  const done=rows.filter(r=>r.total!=null);
  const ranked=[...done].sort((a,b)=>b.total-a.total);
  const avg=done.length? done.reduce((a,b)=>a+b.total,0)/done.length : null;
  const top=ranked[0], low=ranked[ranked.length-1];
  const pass=done.filter(r=>r.total>=(ST.grades.find(g=>g.label==='ดี')?.min??50)).length;
  const cards=[
    ['อำเภอที่ประเมินแล้ว',`${done.length}/9`],
    ['คะแนนเฉลี่ย',avg==null?'-':avg.toFixed(2)],
    ['สูงสุด',top?`${top.name} (${top.total.toFixed(1)})`:'-'],
    ['ต่ำสุด',low?`${low.name} (${low.total.toFixed(1)})`:'-'],
  ].map(([t,v])=>`<div class="kbox"><div class="t">${t}</div><div class="big" style="font-size:19px">${esc(v)}</div></div>`).join('');
  $('view').innerHTML=`
    <div class="card"><h2>แดชบอร์ดสรุปผล</h2>
      <div class="kpi-grid" style="margin-bottom:6px">${cards}</div></div>
    <div class="card"><h2>อันดับคะแนนรายอำเภอ</h2>
      ${done.length?'<canvas id="rankChart" height="120"></canvas>':'<p class="hint">ยังไม่มีอำเภอที่ประเมินครบ (ต้องมีทั้ง KPI และ PDCA)</p>'}
      <table style="margin-top:14px"><thead><tr><th>อันดับ</th><th class="name">อำเภอ</th><th>${esc(ST.labels.part1)}</th><th>${esc(ST.labels.part2)}</th><th>รวม</th><th>ระดับ</th></tr></thead>
      <tbody>${ranked.map((r,i)=>`<tr><td><b>${i+1}</b></td><td class="name">${esc(r.name)}</td>
        <td>${r.part1==null?'-':r.part1.toFixed(2)}</td><td>${r.part2==null?'-':r.part2.toFixed(2)}</td>
        <td class="big" style="font-size:17px">${r.total.toFixed(2)}</td>
        <td>${r.g?`<span class="pill" style="background:${r.g.color}22;color:${r.g.color}">${esc(r.g.label)}</span>`:'-'}</td></tr>`).join('')
        || '<tr><td colspan="6" style="color:#667085">ยังไม่มีข้อมูล</td></tr>'}</tbody></table>
    </div>`;
  if(done.length){
    const ctx=$('rankChart');
    CHART=new Chart(ctx,{type:'bar',data:{labels:ranked.map(r=>r.name),
      datasets:[{label:'คะแนนรวม',data:ranked.map(r=>+r.total.toFixed(2)),
        backgroundColor:ranked.map(r=>(r.g?r.g.color:'#0e6a5f'))}]},
      options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,max:100}},
        responsive:true,maintainAspectRatio:true}});
  }
}

/* ============ ADMIN: ผลรวม 60/40 ============ */
async function viewResults(){
  const rows=await computeDistrictTotals();
  const done=rows.filter(r=>r.total!=null).map(r=>r.total);
  const avg=done.length? done.reduce((a,b)=>a+b,0)/done.length : null;
  $('view').innerHTML=`<div class="card"><h2>ผลการประเมินรวม ${ST.weights.w1}/${ST.weights.w2} รายอำเภอ</h2>
    <p class="hint">รวม = (${esc(ST.labels.part1)} × ${ST.weights.w1}%) + (${esc(ST.labels.part2)} × ${ST.weights.w2}%)</p>
    <table><thead><tr><th class="name">อำเภอ</th><th>ส่วนที่ 1 (${ST.weights.w1}%)</th><th>ส่วนที่ 2 (${ST.weights.w2}%)</th><th>คะแนนรวม</th><th>ระดับ</th><th>กลุ่มที่ประเมิน</th></tr></thead>
    <tbody>${rows.map(r=>`<tr><td class="name">${esc(r.name)}</td>
      <td>${r.part1==null?'-':r.part1.toFixed(2)}</td><td>${r.part2==null?'-':r.part2.toFixed(2)}</td>
      <td class="big" style="font-size:18px">${r.total==null?'-':r.total.toFixed(2)}</td>
      <td>${r.g?`<span class="pill" style="background:${r.g.color}22;color:${r.g.color}">${esc(r.g.label)}</span>`:'-'}</td>
      <td>${r.ng}/15</td></tr>`).join('')}
      <tr style="font-weight:700;background:#f4f7f9"><td class="name">เฉลี่ยทั้งจังหวัด</td><td></td><td></td><td>${avg==null?'-':avg.toFixed(2)}</td><td></td><td></td></tr>
    </tbody></table>
    <button class="btn sec sm" id="csv" style="margin-top:14px">ดาวน์โหลด CSV</button></div>`;
  $('csv').onclick=()=>{
    const head=['อำเภอ','ส่วนที่1','ส่วนที่2','รวม','ระดับ'];
    const lines=[head.join(',')].concat(rows.map(r=>[r.name,r.part1==null?'':r.part1.toFixed(2),r.part2==null?'':r.part2.toFixed(2),r.total==null?'':r.total.toFixed(2),r.g?r.g.label:''].join(',')));
    const blob=new Blob(['﻿'+lines.join('\n')],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='ผลประเมินคปสอ2570.csv'; a.click();
  };
}

/* ============ ADMIN: ตั้งค่า (เกณฑ์เกรด/คำ/น้ำหนัก) ============ */
async function viewSettings(){
  const grows=ST.grades.map((g,i)=>`<tr>
    <td><input type="number" step="0.01" data-gi="${i}" data-gf="min" value="${g.min}" style="width:80px"></td>
    <td><input data-gi="${i}" data-gf="label" value="${esc(g.label)}" style="width:150px"></td>
    <td><input type="color" data-gi="${i}" data-gf="color" value="${g.color||'#0e6a5f'}" style="width:52px;padding:2px"></td>
    <td><button class="btn danger sm" data-grm="${i}">ลบ</button></td></tr>`).join('');
  $('view').innerHTML=`
    <div class="card"><h2>น้ำหนักการประเมิน</h2>
      <div class="row"><div><label class="fld">ส่วนที่ 1 (%)</label><input type="number" id="w1" value="${ST.weights.w1}"></div>
        <div><label class="fld">ส่วนที่ 2 (%)</label><input type="number" id="w2" value="${ST.weights.w2}"></div></div></div>
    <div class="card"><h2>เกณฑ์การจัดระดับ (เกรด)</h2>
      <p class="hint">กำหนดคะแนนขั้นต่ำของแต่ละระดับ แก้คำและสีได้ · ระบบจะจัดระดับจากคะแนนรวม 0–100</p>
      <table><thead><tr><th>คะแนนขั้นต่ำ</th><th class="name">ชื่อระดับ</th><th>สี</th><th></th></tr></thead><tbody id="gbody">${grows}</tbody></table>
      <button class="btn sec sm" id="gadd" style="margin-top:10px">+ เพิ่มระดับ</button></div>
    <div class="card"><h2>เปลี่ยนคำเรียก</h2>
      <label class="fld">ชื่อระบบ (หัวเว็บ)</label><input id="l_title" value="${esc(ST.labels.title||cfg.TITLE)}">
      <label class="fld">คำเรียกส่วนที่ 1</label><input id="l_p1" value="${esc(ST.labels.part1)}">
      <label class="fld">คำเรียกส่วนที่ 2</label><input id="l_p2" value="${esc(ST.labels.part2)}"></div>
    <div id="s_msg"></div><button class="btn" id="s_save" style="margin-bottom:20px">บันทึกการตั้งค่าทั้งหมด</button>`;
  $('gadd').onclick=()=>{ ST.grades.push({min:0,label:'ระดับใหม่',color:'#667085'}); viewSettings(); };
  $('view').querySelectorAll('[data-grm]').forEach(b=>b.onclick=()=>{ ST.grades.splice(Number(b.dataset.grm),1); viewSettings(); });
  const readGrades=()=>{
    const g=ST.grades.map(x=>({...x}));
    $('view').querySelectorAll('[data-gi]').forEach(inp=>{
      const i=Number(inp.dataset.gi), f=inp.dataset.gf;
      g[i][f]= f==='min'? Number(inp.value) : inp.value;
    });
    return g;
  };
  $('s_save').onclick=async()=>{
    const grades=readGrades();
    const labels={title:$('l_title').value.trim(),part1:$('l_p1').value.trim(),part2:$('l_p2').value.trim()};
    const weight1=Number($('w1').value), weight2=Number($('w2').value);
    const {error}=await db.from('settings').update({weight1,weight2,grades,labels}).eq('id',1);
    if(error){ $('s_msg').innerHTML='<div class="msg err">ไม่สำเร็จ: '+esc(error.message)+'</div>'; return; }
    ST.weights={w1:weight1,w2:weight2}; ST.grades=grades; ST.labels=Object.assign(ST.labels,labels);
    if(labels.title) $('appTitle').textContent=labels.title;
    $('s_msg').innerHTML='<div class="msg ok">บันทึกแล้ว</div>';
  };
}

init();
