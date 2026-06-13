(function(){
  const ZL=window.ZL;
  const LOCAL_KEY="zaklifeHealth";
  const CONDITIONS=[
    {key:"relaxed",label:"Relaxed",tone:"gray"},
    {key:"flexed_normal",label:"Flexed",tone:"blue"},
    {key:"flexed_post_workout",label:"Pump",tone:"orange"}
  ];
  const METRICS=[
    {key:"weight_kg",label:"Weight",unit:"kg"},
    {key:"waist_cm",label:"Waist",unit:"cm"},
    {key:"chest_cm",label:"Chest",unit:"cm"},
    {key:"shoulder_cm",label:"Shoulder",unit:"cm"},
    {key:"bicep_avg",label:"Arms",unit:"cm"},
    {key:"body_fat",label:"Body Fat",unit:"%"},
    {key:"lean_mass",label:"Lean Mass",unit:"kg"},
    {key:"v_taper",label:"V-Taper",unit:""}
  ];
  const BODY_FIELDS=[
    ["weight_kg","Weight (kg)",30,200],
    ["neck_cm","Neck (cm)",20,80],
    ["shoulder_cm","Shoulder (cm)",40,200],
    ["chest_cm","Chest (cm)",40,200],
    ["waist_cm","Waist (cm)",40,200],
    ["hip_cm","Hip (cm)",40,200],
    ["bicep_left_cm","L. Bicep (cm)",20,80],
    ["bicep_right_cm","R. Bicep (cm)",20,80],
    ["thigh_left_cm","L. Thigh (cm)",20,100],
    ["thigh_right_cm","R. Thigh (cm)",20,100],
    ["calf_cm","Calf (cm)",20,80]
  ];
  const PHOTO_SLOTS=[
    {key:"front",label:"Front"},
    {key:"side",label:"Side"},
    {key:"back",label:"Back"}
  ];
  const EXERCISES=["Squat","Bench Press","Deadlift","Overhead Press","Barbell Row","Pull-up weighted"];
  let measurements=[];
  let prs=[];
  let profile={height_cm:170};
  let loaded=false;
  let loading=false;
  let sourceMode="demo";
  let errorText="";
  let chartMetric="weight_kg";
  let conditionFilter="relaxed";
  let selectedPr="Bench Press";
  let editingId="";
  let pendingPhotos={};

  function today(){return ZL.today();}
  function num(value){
    const n=Number(value);
    return Number.isFinite(n)?n:null;
  }
  function round(value,digits=1){
    const n=num(value);
    if(n===null)return null;
    const factor=Math.pow(10,digits);
    return Math.round(n*factor)/factor;
  }
  function fmt(value,unit="",digits=1){
    const n=round(value,digits);
    if(n===null)return "--";
    return `${n.toLocaleString("vi-VN",{maximumFractionDigits:digits})}${unit?` ${unit}`:""}`;
  }
  function safeDate(value){
    const raw=String(value||today()).slice(0,10);
    return /^\d{4}-\d{2}-\d{2}$/.test(raw)?raw:today();
  }
  function conditionLabel(key){
    return CONDITIONS.find(item=>item.key===key)?.label||"Relaxed";
  }
  function conditionTone(key){
    return CONDITIONS.find(item=>item.key===key)?.tone||"gray";
  }
  function bodyFat(entry){
    if(!entry)return null;
    const waist=num(entry.waist_cm);
    const neck=num(entry.neck_cm);
    const height=num(profile.height_cm);
    if(!waist||!neck||!height||waist<=neck)return null;
    const density=1.0324-0.19077*Math.log10(waist-neck)+0.15456*Math.log10(height);
    if(!Number.isFinite(density)||density<=0)return null;
    return round(495/density-450,1);
  }
  function leanMass(entry){
    const weight=num(entry.weight_kg);
    const bf=bodyFat(entry);
    if(!weight||bf===null)return null;
    return round(weight*(1-bf/100),1);
  }
  function vTaper(entry){
    if(!entry)return null;
    const shoulder=num(entry.shoulder_cm);
    const waist=num(entry.waist_cm);
    if(!shoulder||!waist)return null;
    return round(shoulder/waist,2);
  }
  function whr(entry){
    if(!entry)return null;
    const waist=num(entry.waist_cm);
    const hip=num(entry.hip_cm);
    if(!waist||!hip)return null;
    return round(waist/hip,2);
  }
  function bicepAvg(entry){
    const left=num(entry.bicep_left_cm);
    const right=num(entry.bicep_right_cm);
    if(!left&&!right)return null;
    return round(((left||right)+(right||left))/2,1);
  }
  function metricValue(entry,key){
    if(!entry)return null;
    if(key==="body_fat")return bodyFat(entry);
    if(key==="lean_mass")return leanMass(entry);
    if(key==="v_taper")return vTaper(entry);
    if(key==="bicep_avg")return bicepAvg(entry);
    return num(entry[key]);
  }
  function epley(weight,reps){
    const w=num(weight);
    const r=Math.max(1,Number(reps)||1);
    return w?round(w*(1+r/30),1):null;
  }
  function normalizeMeasurement(row){
    const photos=row.photos&&typeof row.photos==="object"?row.photos:{};
    return {
      id:String(row.id||"m-"+Date.now()+"-"+Math.random().toString(36).slice(2)),
      measured_on:safeDate(row.measured_on||row.date),
      measurement_condition:row.measurement_condition||row.condition||"relaxed",
      weight_kg:num(row.weight_kg),
      neck_cm:num(row.neck_cm),
      shoulder_cm:num(row.shoulder_cm),
      chest_cm:num(row.chest_cm),
      waist_cm:num(row.waist_cm),
      hip_cm:num(row.hip_cm),
      bicep_left_cm:num(row.bicep_left_cm),
      bicep_right_cm:num(row.bicep_right_cm),
      thigh_left_cm:num(row.thigh_left_cm),
      thigh_right_cm:num(row.thigh_right_cm),
      calf_cm:num(row.calf_cm),
      notes:row.notes||"",
      photos,
      is_seed:!!row.is_seed,
      created_at:row.created_at||ZL.nowIso(),
      updated_at:row.updated_at||ZL.nowIso()
    };
  }
  function normalizePr(row){
    return {
      id:String(row.id||"pr-"+Date.now()+"-"+Math.random().toString(36).slice(2)),
      performed_on:safeDate(row.performed_on||row.date),
      exercise_name:row.exercise_name||"Bench Press",
      weight_kg:num(row.weight_kg),
      reps:Math.max(1,Number(row.reps)||1),
      notes:row.notes||"",
      is_seed:!!row.is_seed,
      created_at:row.created_at||ZL.nowIso(),
      updated_at:row.updated_at||ZL.nowIso()
    };
  }
  function sampleMeasurements(){
    const base=today();
    return [
      {id:"seed-m-1",measured_on:ZL.addDays(base,-45),measurement_condition:"relaxed",weight_kg:73.8,neck_cm:37.5,shoulder_cm:123.5,chest_cm:103.2,waist_cm:80.4,hip_cm:97.2,bicep_left_cm:34.2,bicep_right_cm:34.5,thigh_left_cm:57.3,thigh_right_cm:57.6,calf_cm:36.0,notes:"Seed sample",is_seed:true},
      {id:"seed-m-2",measured_on:ZL.addDays(base,-28),measurement_condition:"relaxed",weight_kg:73.1,neck_cm:37.2,shoulder_cm:124.0,chest_cm:103.8,waist_cm:79.5,hip_cm:96.8,bicep_left_cm:34.4,bicep_right_cm:34.6,thigh_left_cm:57.5,thigh_right_cm:57.6,calf_cm:36.2,notes:"Seed sample",is_seed:true},
      {id:"seed-m-3",measured_on:ZL.addDays(base,-14),measurement_condition:"flexed_normal",weight_kg:72.8,neck_cm:37.0,shoulder_cm:125.0,chest_cm:104.4,waist_cm:79.1,hip_cm:96.6,bicep_left_cm:35.2,bicep_right_cm:35.5,thigh_left_cm:57.6,thigh_right_cm:57.9,calf_cm:36.3,notes:"Seed sample",is_seed:true},
      {id:"seed-m-4",measured_on:ZL.addDays(base,-7),measurement_condition:"relaxed",weight_kg:72.5,neck_cm:37.0,shoulder_cm:125.0,chest_cm:104.2,waist_cm:78.9,hip_cm:96.4,bicep_left_cm:34.6,bicep_right_cm:35.0,thigh_left_cm:57.4,thigh_right_cm:57.8,calf_cm:36.3,notes:"Seed sample",is_seed:true},
      {id:"seed-m-5",measured_on:base,measurement_condition:"relaxed",weight_kg:72.4,neck_cm:37.0,shoulder_cm:125.0,chest_cm:104.5,waist_cm:78.5,hip_cm:96.5,bicep_left_cm:34.9,bicep_right_cm:36.0,thigh_left_cm:57.5,thigh_right_cm:58.0,calf_cm:36.5,notes:"Seed sample",is_seed:true}
    ].map(normalizeMeasurement);
  }
  function samplePrs(){
    const base=today();
    return [
      {id:"seed-pr-1",performed_on:ZL.addDays(base,-30),exercise_name:"Bench Press",weight_kg:70,reps:5,is_seed:true},
      {id:"seed-pr-2",performed_on:ZL.addDays(base,-14),exercise_name:"Bench Press",weight_kg:75,reps:5,is_seed:true},
      {id:"seed-pr-3",performed_on:base,exercise_name:"Bench Press",weight_kg:82.5,reps:5,is_seed:true},
      {id:"seed-pr-4",performed_on:ZL.addDays(base,-12),exercise_name:"Squat",weight_kg:100,reps:3,is_seed:true}
    ].map(normalizePr);
  }
  function loadLocal(){
    try{
      const raw=JSON.parse(localStorage.getItem(LOCAL_KEY)||"{}");
      profile={height_cm:170,...(raw.profile||{})};
      measurements=(Array.isArray(raw.measurements)&&raw.measurements.length?raw.measurements:sampleMeasurements()).map(normalizeMeasurement);
      prs=(Array.isArray(raw.prs)&&raw.prs.length?raw.prs:samplePrs()).map(normalizePr);
    }catch(e){
      profile={height_cm:170};
      measurements=sampleMeasurements();
      prs=samplePrs();
    }
  }
  function saveLocal(){
    localStorage.setItem(LOCAL_KEY,JSON.stringify({profile,measurements,prs,updatedAt:ZL.nowIso()}));
  }
  function sortedMeasurements(list=measurements){
    return [...list].sort((a,b)=>String(a.measured_on).localeCompare(String(b.measured_on))||String(a.created_at).localeCompare(String(b.created_at)));
  }
  function latest(condition=""){
    const list=sortedMeasurements().filter(item=>!condition||item.measurement_condition===condition);
    return list[list.length-1]||null;
  }
  function previousSame(entry){
    if(!entry)return null;
    const list=sortedMeasurements().filter(item=>item.measurement_condition===entry.measurement_condition&&String(item.id)!==String(entry.id)&&item.measured_on<=entry.measured_on);
    return list[list.length-1]||null;
  }
  function delta(entry,key){
    const prev=previousSame(entry);
    const now=metricValue(entry,key);
    const old=metricValue(prev,key);
    if(now===null||old===null)return null;
    return round(now-old,key==="v_taper"?2:1);
  }
  function trendClass(value,lowerIsGood=false){
    const n=num(value);
    if(n===null||n===0)return "";
    const good=lowerIsGood?n<0:n>0;
    return good?"accent-value":"danger-value";
  }
  function statCard(label,key,unit,lowerIsGood=false){
    const row=latest("relaxed")||latest();
    const value=metricValue(row,key);
    const diff=delta(row,key);
    const diffText=diff===null?"Chưa có mốc trước":`${diff>0?"+":""}${fmt(diff,unit,key==="v_taper"?2:1)}`;
    return `<div class="health-stat-card">
      <div class="health-stat-top"><span>${ZL.escape(label)}</span><button data-health-metric="${ZL.escape(key)}">›</button></div>
      <strong>${fmt(value,unit,key==="v_taper"?2:1)}</strong>
      <em class="${trendClass(diff,lowerIsGood)}">${ZL.escape(diffText)}</em>
      <i>${ZL.escape(row?conditionLabel(row.measurement_condition):"Chưa có dữ liệu")}</i>
    </div>`;
  }
  function chartPoints(){
    return sortedMeasurements()
      .filter(item=>item.measurement_condition===conditionFilter)
      .map(item=>({date:item.measured_on,value:metricValue(item,chartMetric)}))
      .filter(item=>item.value!==null);
  }
  function sparkPath(points,w=720,h=250,pad=26){
    if(points.length<2)return "";
    const values=points.map(p=>p.value);
    const min=Math.min(...values);
    const max=Math.max(...values);
    const span=max-min||1;
    return points.map((p,i)=>{
      const x=pad+(i/(points.length-1))*(w-pad*2);
      const y=h-pad-((p.value-min)/span)*(h-pad*2);
      return `${i?"L":"M"}${round(x,1)} ${round(y,1)}`;
    }).join(" ");
  }
  function renderChart(){
    const metric=METRICS.find(item=>item.key===chartMetric)||METRICS[0];
    const points=chartPoints();
    if(points.length<2)return `<div class="health-chart-empty">Chưa đủ dữ liệu cùng điều kiện đo để vẽ biểu đồ.</div>`;
    const path=sparkPath(points);
    const first=points[0];
    const last=points[points.length-1];
    return `<svg class="health-chart-svg" viewBox="0 0 720 250" role="img" aria-label="${ZL.escape(metric.label)} chart">
      <defs>
        <linearGradient id="healthFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#3b82f6" stop-opacity=".32"/>
          <stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <line x1="26" x2="694" y1="58" y2="58" class="health-grid-line"/>
      <line x1="26" x2="694" y1="125" y2="125" class="health-grid-line"/>
      <line x1="26" x2="694" y1="192" y2="192" class="health-grid-line"/>
      <path d="${path} L694 224 L26 224 Z" fill="url(#healthFill)"/>
      <path d="${path}" class="health-line"/>
      ${points.map((p,i)=>{
        const values=points.map(x=>x.value);
        const min=Math.min(...values);
        const max=Math.max(...values);
        const span=max-min||1;
        const x=26+(i/(points.length-1))*668;
        const y=224-((p.value-min)/span)*196;
        return `<circle cx="${round(x,1)}" cy="${round(y,1)}" r="${i===points.length-1?5:3}" class="health-dot"><title>${ZL.escape(p.date)}: ${fmt(p.value,metric.unit,metric.key==="v_taper"?2:1)}</title></circle>`;
      }).join("")}
      <text x="28" y="24" class="health-chart-label">${ZL.escape(metric.label)} ${fmt(first.value,metric.unit,metric.key==="v_taper"?2:1)} → ${fmt(last.value,metric.unit,metric.key==="v_taper"?2:1)}</text>
      <text x="28" y="238" class="health-chart-axis">${ZL.escape(first.date.slice(5))}</text>
      <text x="650" y="238" class="health-chart-axis">${ZL.escape(last.date.slice(5))}</text>
    </svg>`;
  }
  function analyzeProgress(entries){
    const relaxed=sortedMeasurements(entries).filter(item=>item.measurement_condition==="relaxed");
    if(relaxed.length<3)return [{tone:"blue",title:"Chưa đủ dữ liệu",text:"Cần ít nhất 3 lần đo cùng điều kiện để phân tích đáng tin."}];
    const last=relaxed[relaxed.length-1];
    const prev=relaxed[relaxed.length-2];
    const first=relaxed[Math.max(0,relaxed.length-5)];
    const insights=[];
    const weightDiff=round((last.weight_kg||0)-(first.weight_kg||0),1);
    const waistDiff=last.waist_cm&&first.waist_cm?round(last.waist_cm-first.waist_cm,1):null;
    if(weightDiff!==null&&waistDiff!==null){
      if(weightDiff<=0&&waistDiff<=0)insights.push({tone:"green",title:"Xu hướng gọn hơn",text:`Cân nặng ${weightDiff}kg, eo ${waistDiff}cm so với mốc ${first.measured_on}.`});
      else insights.push({tone:"amber",title:"Theo dõi lại vòng eo",text:`Eo đổi ${waistDiff}cm. Nên đo cùng buổi sáng và cùng trạng thái relaxed.`});
    }
    const armGap=Math.abs((last.bicep_left_cm||0)-(last.bicep_right_cm||0));
    if(armGap>1)insights.push({tone:"amber",title:`Lệch tay ${round(armGap,1)}cm`,text:"Ưu tiên bài unilateral 2-3 buổi tới và ghi rõ tay yếu."});
    const legGap=Math.abs((last.thigh_left_cm||0)-(last.thigh_right_cm||0));
    if(legGap>1.5)insights.push({tone:"amber",title:`Lệch đùi ${round(legGap,1)}cm`,text:"Theo dõi squat/lunge một bên, đừng so với buổi pump."});
    const vt=vTaper(last);
    if(vt)insights.push({tone:vt>=1.5?"green":"blue",title:`V-Taper ${fmt(vt,"",2)}/1.618`,text:vt>=1.5?"Vai/eo đang tiến gần mục tiêu.":"Tập trung giữ eo ổn và tăng vai/lưng xô."});
    const bfNow=bodyFat(last);
    const bfPrev=bodyFat(prev);
    if(bfNow!==null&&bfPrev!==null)insights.push({tone:bfNow<=bfPrev?"green":"amber",title:`Body fat ước tính ${fmt(bfNow,"%")}`,text:`So với lần trước ${fmt(round(bfNow-bfPrev,1),"%")}. Công thức chỉ là ước lượng.`});
    return insights.slice(0,4);
  }
  function latestWithPhotos(){
    return [...sortedMeasurements()].reverse().find(item=>PHOTO_SLOTS.some(slot=>item.photos?.[slot.key]))||latest()||null;
  }
  function photoBox(entry,slot){
    const src=entry?.photos?.[slot.key]||"";
    return `<div class="health-photo-box">
      ${src?`<img src="${ZL.escape(src)}" alt="${ZL.escape(slot.label)}">`:`<span>${ZL.escape(slot.label)}</span>`}
    </div>`;
  }
  function renderPhotos(){
    const entry=latestWithPhotos();
    return `<section class="panel health-photo-panel">
      <div class="panel-title"><div><h3>Progress Photos</h3><p>Front / Side / Back, nén tối đa 800px</p></div></div>
      <div class="health-photo-grid">
        ${PHOTO_SLOTS.map(slot=>photoBox(entry,slot)).join("")}
      </div>
      <div class="item-meta">${entry?`Mốc đang xem: ${ZL.escape(entry.measured_on)} (${ZL.escape(conditionLabel(entry.measurement_condition))})`:"Chưa có ảnh"}</div>
    </section>`;
  }
  function renderInsights(){
    return `<section class="panel health-insights">
      <div class="panel-title"><div><h3>AI Progress Insights</h3><p>Rule engine offline, chưa gọi AI ngoài</p></div></div>
      <div class="health-insight-list">
        ${analyzeProgress(measurements).map(item=>`<div class="health-insight ${item.tone}">
          <strong>${ZL.escape(item.title)}</strong>
          <span>${ZL.escape(item.text)}</span>
        </div>`).join("")}
      </div>
    </section>`;
  }
  function renderPrChart(){
    const list=[...prs].filter(item=>item.exercise_name===selectedPr).sort((a,b)=>a.performed_on.localeCompare(b.performed_on));
    if(list.length<2)return `<div class="health-chart-empty small">Chưa đủ PR để vẽ biểu đồ.</div>`;
    const points=list.map(item=>({date:item.performed_on,value:epley(item.weight_kg,item.reps)})).filter(item=>item.value!==null);
    const path=sparkPath(points,360,150,20);
    return `<svg class="health-pr-svg" viewBox="0 0 360 150">
      <line x1="20" x2="340" y1="45" y2="45" class="health-grid-line"/>
      <line x1="20" x2="340" y1="95" y2="95" class="health-grid-line"/>
      <path d="${path}" class="health-line"/>
      ${points.map((p,i)=>{
        const min=Math.min(...points.map(x=>x.value));
        const max=Math.max(...points.map(x=>x.value));
        const span=max-min||1;
        const x=20+(i/(points.length-1))*320;
        const y=130-((p.value-min)/span)*110;
        return `<circle cx="${round(x,1)}" cy="${round(y,1)}" r="3" class="health-dot"></circle>`;
      }).join("")}
    </svg>`;
  }
  function renderPrTracker(){
    const list=[...prs].filter(item=>item.exercise_name===selectedPr).sort((a,b)=>b.performed_on.localeCompare(a.performed_on));
    const best=[...list].sort((a,b)=>(epley(b.weight_kg,b.reps)||0)-(epley(a.weight_kg,a.reps)||0))[0];
    return `<section class="panel health-pr-panel">
      <div class="panel-title">
        <div><h3>PR Tracker</h3><p>1RM ước tính theo Epley</p></div>
        <select id="healthPrExercise">${EXERCISES.map(ex=>`<option ${selectedPr===ex?"selected":""}>${ZL.escape(ex)}</option>`).join("")}</select>
      </div>
      ${renderPrChart()}
      <div class="health-best-pr">${best?`Best PR: ${fmt(epley(best.weight_kg,best.reps),"kg")} • ${fmt(best.weight_kg,"kg")} x ${best.reps}`:"Chưa có PR"}</div>
      <form id="healthPrForm" class="health-pr-form">
        <input id="healthPrDate" type="date" value="${today()}">
        <input id="healthPrWeight" type="number" step="0.5" placeholder="kg">
        <input id="healthPrReps" type="number" min="1" max="50" placeholder="reps">
        <button class="btn primary sm" type="submit">Lưu PR</button>
      </form>
      <div class="segmented health-pr-tabs">${EXERCISES.map(ex=>`<button class="${selectedPr===ex?"active":""}" data-health-pr="${ZL.escape(ex)}">${ZL.escape(ex.replace(" Press",""))}</button>`).join("")}</div>
    </section>`;
  }
  function placeholder(field){
    const row=latest(conditionFilter)||latest();
    const value=row?row[field]:null;
    return value?String(value):"";
  }
  function editingEntry(){
    return measurements.find(item=>String(item.id)===String(editingId))||null;
  }
  function formValue(field){
    const item=editingEntry();
    return item&&item[field]!==null&&item[field]!==undefined?String(item[field]):"";
  }
  function renderForm(){
    const item=editingEntry();
    const condition=item?.measurement_condition||conditionFilter;
    return `<section class="panel health-form-panel">
      <div class="panel-title"><div><h3>Quick Measurement Log</h3><p>${item?"Đang sửa mốc "+item.measured_on:"Điền nhanh, ô trống sẽ bỏ qua"}</p></div></div>
      <form id="healthForm">
        <div class="health-form-grid">
          <div class="field"><label>Date</label><input id="healthDate" type="date" value="${ZL.escape(item?.measured_on||today())}"></div>
          <div class="field"><label>Condition</label><select id="healthCondition">${CONDITIONS.map(c=>`<option value="${c.key}" ${condition===c.key?"selected":""}>${c.label}</option>`).join("")}</select></div>
          <div class="field"><label>Height (cm)</label><input id="healthHeight" type="number" min="120" max="230" step="0.1" value="${ZL.escape(profile.height_cm||170)}"></div>
        </div>
        <div class="health-input-grid">
          ${BODY_FIELDS.map(([key,label,min,max])=>`<div class="field compact"><label>${ZL.escape(label)}</label><input data-health-field="${key}" type="number" step="0.1" min="${min}" max="${max}" value="${ZL.escape(formValue(key))}" placeholder="${ZL.escape(placeholder(key))}"></div>`).join("")}
        </div>
        <div class="health-photo-inputs">
          ${PHOTO_SLOTS.map(slot=>`<label><span>${slot.label}</span><input type="file" accept="image/*" data-health-photo="${slot.key}"></label>`).join("")}
        </div>
        <div class="field"><label>Notes</label><textarea id="healthNotes" placeholder="Ghi chú buổi đo, trạng thái tập, ăn uống...">${ZL.escape(item?.notes||"")}</textarea></div>
        <div class="health-actions">
          <button class="btn primary" type="submit">${item?"Lưu thay đổi":"Save Check-in"}</button>
          ${item?`<button class="btn" type="button" id="healthCancelEdit">Hủy sửa</button>`:""}
        </div>
      </form>
    </section>`;
  }
  function renderHistory(){
    const rows=[...sortedMeasurements()].reverse().slice(0,12);
    return `<section class="panel health-history-panel">
      <div class="panel-title"><div><h3>Measurement History</h3><p>${measurements.length} lần đo</p></div></div>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Date</th><th>Condition</th><th>Weight</th><th>Waist</th><th>Chest</th><th>Arms</th><th>Actions</th></tr></thead>
          <tbody>${rows.map(row=>`<tr>
            <td>${ZL.escape(row.measured_on)}${row.is_seed?` <span class="badge warning">mẫu</span>`:""}</td>
            <td><span class="health-condition ${conditionTone(row.measurement_condition)}">${ZL.escape(conditionLabel(row.measurement_condition))}</span></td>
            <td>${fmt(row.weight_kg,"kg")}</td>
            <td>${fmt(row.waist_cm,"cm")}</td>
            <td>${fmt(row.chest_cm,"cm")}</td>
            <td>${fmt(bicepAvg(row),"cm")}</td>
            <td><button class="btn sm" data-health-edit="${ZL.escape(row.id)}">Sửa</button> <button class="btn sm danger" data-health-delete="${ZL.escape(row.id)}">Xóa</button></td>
          </tr>`).join("")}</tbody>
        </table>
      </div>
    </section>`;
  }
  function renderBodyProgress(){
    return `<section class="panel health-chart-panel">
      <div class="panel-title">
        <div><h2>Body Progress</h2><p>Chỉ so sánh khi cùng điều kiện đo.</p></div>
        <div class="health-toolbar-actions">
          <button class="btn sm" id="healthReload">${loading?"Đang tải":"Đồng bộ"}</button>
          <button class="btn sm" id="healthExport">Export JSON</button>
          <label class="btn sm">Import JSON<input id="healthImport" type="file" accept="application/json" hidden></label>
        </div>
      </div>
      <div class="health-chip-row">
        <div class="segmented">${METRICS.map(metric=>`<button class="${chartMetric===metric.key?"active":""}" data-health-metric="${metric.key}">${metric.label}</button>`).join("")}</div>
        <div class="segmented">${CONDITIONS.map(c=>`<button class="${conditionFilter===c.key?"active":""}" data-health-condition="${c.key}">${c.label}</button>`).join("")}</div>
      </div>
      <div class="health-chart-wrap">${renderChart()}</div>
    </section>`;
  }
  function renderSummaryCards(){
    const row=latest("relaxed")||latest();
    const taper=vTaper(row);
    return `<div class="health-summary-grid">
      ${statCard("Weight","weight_kg","kg",true)}
      ${statCard("Waist","waist_cm","cm",true)}
      ${statCard("Body Fat Estimate","body_fat","%",true)}
      <div class="health-stat-card">
        <div class="health-stat-top"><span>V-Taper Index</span><button data-health-metric="v_taper">›</button></div>
        <strong>${fmt(taper,"",2)} <small>/ 1.618</small></strong>
        <em class="${taper>=1.5?"accent-value":"blue-value"}">${taper>=1.5?"Good":"Đang xây"}</em>
        <i>Shoulder / waist</i>
      </div>
    </div>`;
  }
  function render(){
    const root=document.getElementById("healthRoot");
    if(!root)return;
    root.innerHTML=`<div class="health-shell">
      <div class="health-topline">
        <div class="crm-search"><span>⌕</span><input value="" placeholder="Tìm số đo, ghi chú, bài tập..." disabled></div>
        <div class="crm-toolbar-actions">
          <span class="badge ${sourceMode==="supabase"?"success":"warning"}">${sourceMode==="supabase"?"Supabase":"Local demo"}</span>
          <span class="badge blue">${measurements.length} check-in</span>
        </div>
      </div>
      ${errorText?`<div class="crm-warning">${ZL.escape(errorText)}</div>`:""}
      ${renderSummaryCards()}
      <div class="health-main-grid">
        <div class="health-primary">
          ${renderBodyProgress()}
          <div class="health-bottom-grid">
            ${renderForm()}
            ${renderHistory()}
          </div>
        </div>
        <aside class="health-side">
          ${renderInsights()}
          ${renderPhotos()}
          ${renderPrTracker()}
        </aside>
      </div>
    </div>`;
    bind();
  }
  function tablePayload(entry){
    return {
      measured_on:entry.measured_on,
      measurement_condition:entry.measurement_condition,
      weight_kg:entry.weight_kg,
      neck_cm:entry.neck_cm,
      shoulder_cm:entry.shoulder_cm,
      chest_cm:entry.chest_cm,
      waist_cm:entry.waist_cm,
      hip_cm:entry.hip_cm,
      bicep_left_cm:entry.bicep_left_cm,
      bicep_right_cm:entry.bicep_right_cm,
      thigh_left_cm:entry.thigh_left_cm,
      thigh_right_cm:entry.thigh_right_cm,
      calf_cm:entry.calf_cm,
      notes:entry.notes,
      photos:entry.photos||{}
    };
  }
  function validateEntry(entry){
    if(!entry.measured_on||entry.measured_on>today())return "Ngày đo không được ở tương lai.";
    if(!entry.weight_kg)return "Weight là bắt buộc.";
    for(const [key,label,min,max] of BODY_FIELDS){
      const value=entry[key];
      if(value===null||value===undefined||value==="")continue;
      if(value<min||value>max)return `${label} nằm ngoài khoảng hợp lý.`;
    }
    return "";
  }
  function collectEntry(){
    const current=editingEntry();
    const entry=normalizeMeasurement({
      ...(current||{}),
      id:current?.id||"local-"+Date.now(),
      measured_on:document.getElementById("healthDate").value,
      measurement_condition:document.getElementById("healthCondition").value,
      notes:document.getElementById("healthNotes").value.trim(),
      photos:{...(current?.photos||{}),...pendingPhotos}
    });
    rootFields().forEach(input=>{
      entry[input.dataset.healthField]=input.value===""?null:Number(input.value);
    });
    return entry;
  }
  function rootFields(){
    return [...document.querySelectorAll("[data-health-field]")];
  }
  async function saveEntry(event){
    event.preventDefault();
    profile.height_cm=Math.max(120,Math.min(230,Number(document.getElementById("healthHeight").value)||170));
    const entry=collectEntry();
    const error=validateEntry(entry);
    if(error){ZL.toast(error);return;}
    if(sourceMode!=="supabase"){
      measurements=measurements.filter(item=>String(item.id)!==String(entry.id));
      measurements.push({...entry,is_seed:false,updated_at:ZL.nowIso()});
      pendingPhotos={};
      editingId="";
      saveLocal();
      ZL.toast("Đã lưu Health local");
      render();
      return;
    }
    try{
      const client=ZL.supabase.getClient();
      const user=await ZL.supabase.getUser();
      if(!user?.id)throw new Error("Chua dang nhap Supabase");
      await client.from("health_profiles").upsert({user_id:user.id,height_cm:profile.height_cm},{onConflict:"user_id"});
      const payload=tablePayload(entry);
      const result=editingId?
        await client.from("health_measurements").update(payload).eq("id",entry.id).select("*").single():
        await client.from("health_measurements").insert(payload).select("*").single();
      if(result.error)throw result.error;
      measurements=measurements.filter(item=>String(item.id)!==String(entry.id));
      measurements.push(normalizeMeasurement(result.data));
      pendingPhotos={};
      editingId="";
      ZL.toast("Đã lưu Health vào Supabase");
      render();
    }catch(e){
      ZL.toast(e.message||"Không lưu được Health");
    }
  }
  async function deleteEntry(id){
    if(!confirm("Xóa mốc đo này?"))return;
    if(sourceMode==="supabase"&&!String(id).startsWith("seed-")){
      try{
        const result=await ZL.supabase.getClient().from("health_measurements").delete().eq("id",id);
        if(result.error)throw result.error;
      }catch(e){
        ZL.toast(e.message||"Không xóa được mốc đo");
        return;
      }
    }
    measurements=measurements.filter(item=>String(item.id)!==String(id));
    saveLocal();
    if(editingId===id)editingId="";
    ZL.toast("Đã xóa mốc đo");
    render();
  }
  async function savePr(event){
    event.preventDefault();
    const row=normalizePr({
      id:"local-pr-"+Date.now(),
      performed_on:document.getElementById("healthPrDate").value,
      exercise_name:selectedPr,
      weight_kg:document.getElementById("healthPrWeight").value,
      reps:document.getElementById("healthPrReps").value
    });
    if(!row.weight_kg){ZL.toast("Nhập kg cho PR");return;}
    if(sourceMode!=="supabase"){
      prs.push({...row,is_seed:false});
      saveLocal();
      render();
      return;
    }
    try{
      const result=await ZL.supabase.getClient().from("health_pr_records").insert({
        performed_on:row.performed_on,
        exercise_name:row.exercise_name,
        weight_kg:row.weight_kg,
        reps:row.reps,
        notes:row.notes
      }).select("*").single();
      if(result.error)throw result.error;
      prs.push(normalizePr(result.data));
      ZL.toast("Đã lưu PR");
      render();
    }catch(e){
      ZL.toast(e.message||"Không lưu được PR");
    }
  }
  function compressImage(file){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>{
        const img=new Image();
        img.onload=()=>{
          const max=800;
          const ratio=Math.min(1,max/Math.max(img.width,img.height));
          const canvas=document.createElement("canvas");
          canvas.width=Math.round(img.width*ratio);
          canvas.height=Math.round(img.height*ratio);
          const ctx=canvas.getContext("2d");
          ctx.drawImage(img,0,0,canvas.width,canvas.height);
          resolve(canvas.toDataURL("image/jpeg",0.78));
        };
        img.onerror=reject;
        img.src=reader.result;
      };
      reader.onerror=reject;
      reader.readAsDataURL(file);
    });
  }
  async function handlePhoto(input){
    const file=input.files?.[0];
    if(!file)return;
    try{
      pendingPhotos[input.dataset.healthPhoto]=await compressImage(file);
      ZL.toast("Đã nén ảnh, bấm Save Check-in để lưu");
    }catch(e){
      ZL.toast("Không đọc được ảnh");
    }
  }
  function exportJson(){
    const blob=new Blob([JSON.stringify({profile,measurements,prs,exportedAt:ZL.nowIso()},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download="zaklife-health-"+today()+".json";
    a.click();
    URL.revokeObjectURL(url);
  }
  async function importJson(file){
    if(!file)return;
    try{
      const raw=JSON.parse(await file.text());
      profile={height_cm:170,...(raw.profile||{})};
      measurements=(raw.measurements||[]).map(normalizeMeasurement);
      prs=(raw.prs||[]).map(normalizePr);
      saveLocal();
      ZL.toast("Đã import Health JSON vào local");
      render();
    }catch(e){
      ZL.toast("File import không hợp lệ");
    }
  }
  async function load(force=false){
    if(loading)return;
    if(loaded&&!force)return;
    loading=true;
    if(!loaded)loadLocal();
    if(!ZL.supabase?.hasConfig()){
      loaded=true;
      loading=false;
      sourceMode="demo";
      errorText="Chưa cấu hình Supabase Health, đang dùng local/demo để test.";
      saveLocal();
      render();
      return;
    }
    try{
      const client=ZL.supabase.getClient();
      const user=await ZL.supabase.getUser();
      if(!user)throw new Error("Health cần đăng nhập Supabase để đọc dữ liệu cá nhân.");
      const prof=await client.from("health_profiles").select("*").maybeSingle();
      if(prof.error)throw prof.error;
      profile={height_cm:170,...(prof.data||{})};
      const body=await client.from("health_measurements").select("*").order("measured_on",{ascending:true});
      if(body.error)throw body.error;
      const pr=await client.from("health_pr_records").select("*").order("performed_on",{ascending:true});
      if(pr.error)throw pr.error;
      measurements=(body.data||[]).map(normalizeMeasurement);
      prs=(pr.data||[]).map(normalizePr);
      sourceMode="supabase";
      errorText="";
      loaded=true;
    }catch(e){
      sourceMode="demo";
      errorText=e.message||"Không đọc được Supabase Health, đang dùng local/demo.";
      loaded=true;
    }finally{
      loading=false;
      render();
    }
  }
  function bind(){
    document.querySelectorAll("[data-health-metric]").forEach(btn=>btn.onclick=()=>{
      chartMetric=btn.dataset.healthMetric;
      render();
    });
    document.querySelectorAll("[data-health-condition]").forEach(btn=>btn.onclick=()=>{
      conditionFilter=btn.dataset.healthCondition;
      render();
    });
    document.getElementById("healthForm")?.addEventListener("submit",saveEntry);
    document.getElementById("healthCancelEdit")?.addEventListener("click",()=>{editingId="";pendingPhotos={};render();});
    document.querySelectorAll("[data-health-edit]").forEach(btn=>btn.onclick=()=>{editingId=btn.dataset.healthEdit;pendingPhotos={};render();});
    document.querySelectorAll("[data-health-delete]").forEach(btn=>btn.onclick=()=>deleteEntry(btn.dataset.healthDelete));
    document.querySelectorAll("[data-health-photo]").forEach(input=>input.onchange=()=>handlePhoto(input));
    document.getElementById("healthReload")?.addEventListener("click",()=>load(true));
    document.getElementById("healthExport")?.addEventListener("click",exportJson);
    document.getElementById("healthImport")?.addEventListener("change",e=>importJson(e.target.files?.[0]));
    document.getElementById("healthPrExercise")?.addEventListener("change",e=>{selectedPr=e.target.value;render();});
    document.getElementById("healthPrForm")?.addEventListener("submit",savePr);
    document.querySelectorAll("[data-health-pr]").forEach(btn=>btn.onclick=()=>{selectedPr=btn.dataset.healthPr;render();});
  }

  ZL.modules.health={render:()=>{render();load();}};
})();
