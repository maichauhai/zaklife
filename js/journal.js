(function(){
  const ZL=window.ZL;
  const MOODS=[
    {emoji:"😁",label:"Tốt",score:9},
    {emoji:"🙂",label:"Ổn",score:7},
    {emoji:"😐",label:"Bình thường",score:5},
    {emoji:"😟",label:"Lo",score:3},
    {emoji:"😴",label:"Mệt",score:2}
  ];
  let selectedDate=ZL.today();
  let calendarMonth=ZL.today().slice(0,7);
  let saveTimer=null;
  const HABIT_TASK_SOURCE="habit-cycle";
  const pendingHabitTasks=new Set();

  function entryFor(date){
    return (ZL.state.zak.entries||{})[date]||{};
  }

  function habitLog(date){
    return (ZL.state.zak.habitLog||{})[date]||{};
  }

  function habits(){
    return Array.isArray(ZL.state.zak.habits)?ZL.state.zak.habits:[];
  }

  function habitStreak(id){
    let streak=0;
    const base=ZL.today();
    for(let i=0;i<180;i++){
      const key=ZL.addDays(base,-i);
      if(habitLog(key)[id])streak++;
      else if(i>0)break;
    }
    return streak;
  }

  function dayDiff(from,to){
    const start=new Date(`${from}T00:00:00`);
    const end=new Date(`${to}T00:00:00`);
    return Math.round((end-start)/86400000);
  }

  function lastHabitDoneDate(habitId,date){
    const logMap=ZL.state.zak.habitLog||{};
    return Object.keys(logMap)
      .filter(key=>key<date&&logMap[key]?.[habitId])
      .sort()
      .pop()||"";
  }

  function isHabitDueOnDate(habit,date){
    if(!habit||!habit.id||date>ZL.today())return false;
    if(habitLog(date)[habit.id])return false;
    const cycleDays=Math.max(1,Number(habit.cycleDays)||1);
    const lastDone=lastHabitDoneDate(habit.id,date);
    if(!lastDone)return true;
    return dayDiff(lastDone,date)>=cycleDays;
  }

  function openHabitTask(habitId){
    return ZL.normalizeList(ZL.state.tasks).some(task=>
      task.source===HABIT_TASK_SOURCE&&
      String(task.habitId)===String(habitId)&&
      task.status!=="done"
    );
  }

  function habitTaskRef(id){
    return ZL.fb.db?.ref("zaklife/tasks/"+id);
  }

  function saveHabitTask(task){
    if(!ZL.fb.db){
      ZL.state.tasks=ZL.state.tasks||{};
      ZL.state.tasks[task.id]=task;
      ZL.emit("tasks");
      return Promise.resolve();
    }
    return habitTaskRef(task.id).set(task);
  }

  function patchHabitTask(id,patch){
    if(!ZL.fb.db){
      ZL.state.tasks=ZL.state.tasks||{};
      ZL.state.tasks[id]={...(ZL.state.tasks[id]||{}),id,...patch};
      ZL.emit("tasks");
      return Promise.resolve();
    }
    return habitTaskRef(id).update({...patch,updatedAt:ZL.nowIso()});
  }

  function completeHabitTasks(habitId,date){
    const updates=ZL.normalizeList(ZL.state.tasks)
      .filter(task=>
        task.source===HABIT_TASK_SOURCE&&
        String(task.habitId)===String(habitId)&&
        task.status!=="done"&&
        (!task.dueDate||task.dueDate<=date)
      )
      .map(task=>patchHabitTask(task.id,{status:"done",completedAt:ZL.nowIso()}));
    return Promise.all(updates);
  }

  function syncHabitDueTasks(){
    if(ZL.fb.db&&(!ZL.zakDataLoaded||!ZL.tasksLoaded))return Promise.resolve();
    const date=ZL.today();
    const due=habits().filter(h=>isHabitDueOnDate(h,date));
    const creates=due
      .filter(h=>!openHabitTask(h.id)&&!pendingHabitTasks.has(String(h.id)))
      .map(h=>{
        pendingHabitTasks.add(String(h.id));
        const id=`habit-cycle-${String(h.id).replace(/[^a-zA-Z0-9_-]/g,"_")}-${date}`;
        const task={
          id,
          title:`Làm habit: ${h.icon||""} ${h.name||"Habit"}`.trim(),
          category:"personal",
          priority:"medium",
          status:"todo",
          dueDate:date,
          source:HABIT_TASK_SOURCE,
          habitId:h.id,
          habitName:h.name||"",
          habitCycleDays:Math.max(1,Number(h.cycleDays)||1),
          createdAt:ZL.nowIso(),
          updatedAt:ZL.nowIso()
        };
        return saveHabitTask(task).finally(()=>pendingHabitTasks.delete(String(h.id)));
      });
    return Promise.all(creates);
  }

  function collectJournalEntry(){
    const value=id=>document.getElementById(id)?.value||"";
    const current=entryFor(selectedDate);
    const active=document.querySelector(".mood-btn.active");
    const mood=MOODS[Number(active?.dataset.mood||2)]||MOODS[2];
    const gratitude=[1,2,3].map(i=>value("gratitude"+i).trim()).filter(Boolean);
    const energyInput=document.getElementById("energyMorning");
    const brainDumpInput=document.getElementById("brainDump");
    return {
      ...current,
      mood:mood.score,
      moodEmoji:mood.emoji,
      moodLabel:mood.label,
      energy:energyInput?{
        morning:Number(value("energyMorning"))||5,
        afternoon:Number(value("energyAfternoon"))||5,
        evening:Number(value("energyEvening"))||5
      }:(current.energy||{morning:5,afternoon:5,evening:5}),
      sleepQuality:Number(value("sleepQuality"))||3,
      sleepHours:Number(value("sleepHours"))||0,
      text:value("journalText").trim(),
      brainDump:brainDumpInput?brainDumpInput.value.trim():String(current.brainDump||""),
      gratitude,
      win:value("winOfDay").trim(),
      timestamp:ZL.nowIso()
    };
  }
  function persistJournal(options={}){
    if(!document.getElementById("journalText"))return Promise.resolve();
    ZL.state.zak.entries=ZL.state.zak.entries||{};
    ZL.state.zak.entries[selectedDate]=collectJournalEntry();
    const sync=ZL.syncZakData({silent:options.silent!==false});
    if(options.toast)ZL.toast("Đã lưu journal");
    if(options.renderAfter)sync.then(render);
    return sync;
  }

  function queueJournalSave(){
    clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>persistJournal(),1000);
  }

  function isJournalEditing(){
    const root=document.getElementById("journalRoot");
    const active=document.activeElement;
    if(!root||!active||!root.contains(active))return false;
    return ["INPUT","TEXTAREA","SELECT"].includes(active.tagName);
  }

  function saveJournal(){
    clearTimeout(saveTimer);
    persistJournal({toast:true,renderAfter:true});
  }

  function legacySaveJournal(){
    const active=document.querySelector(".mood-btn.active");
    const mood=MOODS[Number(active?.dataset.mood||2)];
    const gratitude=[1,2,3].map(i=>document.getElementById("gratitude"+i).value.trim()).filter(Boolean);
    const current=entryFor(selectedDate);
    const energyMorning=document.getElementById("energyMorning");
    const brainDump=document.getElementById("brainDump");
    ZL.state.zak.entries=ZL.state.zak.entries||{};
    ZL.state.zak.entries[selectedDate]={
      ...current,
      mood:mood.score,
      moodEmoji:mood.emoji,
      moodLabel:mood.label,
      energy:energyMorning?{
        morning:Number(document.getElementById("energyMorning").value)||5,
        afternoon:Number(document.getElementById("energyAfternoon").value)||5,
        evening:Number(document.getElementById("energyEvening").value)||5
      }:(current.energy||{morning:5,afternoon:5,evening:5}),
      sleepQuality:Number(document.getElementById("sleepQuality").value)||3,
      sleepHours:Number(document.getElementById("sleepHours").value)||0,
      text:document.getElementById("journalText").value.trim(),
      brainDump:brainDump?brainDump.value.trim():String(current.brainDump||""),
      gratitude,
      win:document.getElementById("winOfDay").value.trim(),
      timestamp:ZL.nowIso()
    };
    ZL.syncZakData();
    ZL.toast("Đã lưu journal");
    render();
  }
  function toggleHabit(id,date=selectedDate){
    ZL.state.zak.habitLog=ZL.state.zak.habitLog||{};
    ZL.state.zak.habitLog[date]=ZL.state.zak.habitLog[date]||{};
    ZL.state.zak.habitLog[date][id]=!ZL.state.zak.habitLog[date][id];
    const done=!!ZL.state.zak.habitLog[date][id];
    ZL.syncZakData().then(()=>{
      if(done)return completeHabitTasks(id,date);
    }).then(syncHabitDueTasks);
    render();
  }

  function drawMoodMini(){
    const canvas=document.getElementById("moodMiniChart");
    if(!canvas)return;
    const box=canvas.getBoundingClientRect(),ratio=window.devicePixelRatio||1;
    canvas.width=Math.max(1,Math.floor(box.width*ratio));
    canvas.height=Math.max(1,Math.floor(box.height*ratio));
    const ctx=canvas.getContext("2d");
    ctx.scale(ratio,ratio);
    const w=box.width,h=box.height,pad=18;
    const entries=ZL.state.zak.entries||{};
    const dates=ZL.lastDates(7);
    const values=dates.map(d=>Number(entries[d]?.mood)||0);
    ctx.clearRect(0,0,w,h);
    ctx.strokeStyle="rgba(255,255,255,.08)";
    for(let i=0;i<3;i++){
      const y=pad+(h-pad*2)*i/2;
      ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(w-pad,y);ctx.stroke();
    }
    const pts=values.map((v,i)=>({x:pad+(w-pad*2)*i/(values.length-1||1),y:h-pad-(h-pad*2)*(v/10)}));
    ctx.beginPath();
    pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.strokeStyle="#34d399";ctx.lineWidth=3;ctx.stroke();
    pts.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fillStyle="#10b981";ctx.fill();});
  }

  function renderEnergy(entry){
    const energy=entry.energy||{};
    return `<div class="well-card">
      <div class="well-head"><div><h2>Năng lượng</h2><p>Sáng / chiều / tối</p></div><span class="badge blue">${Math.round(((Number(energy.morning)||5)+(Number(energy.afternoon)||5)+(Number(energy.evening)||5))/3)}/10</span></div>
      <div class="range-row"><label>Sáng</label><input type="range" min="1" max="10" id="energyMorning" value="${ZL.escape(energy.morning||5)}"></div>
      <div class="range-row"><label>Chiều</label><input type="range" min="1" max="10" id="energyAfternoon" value="${ZL.escape(energy.afternoon||5)}"></div>
      <div class="range-row"><label>Tối</label><input type="range" min="1" max="10" id="energyEvening" value="${ZL.escape(energy.evening||5)}"></div>
    </div>`;
  }

  function renderSleep(entry){
    const quality=Number(entry.sleepQuality||entry.sleep||3);
    return `<div class="well-card">
      <div class="well-head"><div><h2>Giấc ngủ</h2><p>Chất lượng + số giờ</p></div><span class="badge warning">${quality}/5</span></div>
      <input type="hidden" id="sleepQuality" value="${quality}">
      <div class="star-row">
        ${[1,2,3,4,5].map(n=>`<button class="star-btn ${n<=quality?"active":""}" data-sleep="${n}">★</button>`).join("")}
      </div>
      <div class="field compact"><label>Số giờ ngủ</label><input type="number" min="0" max="14" step="0.5" id="sleepHours" value="${ZL.escape(entry.sleepHours||"")}"></div>
    </div>`;
  }

  function renderMood(entry,moodIndex){
    return `<div class="well-card">
      <div class="well-head"><div><h2>Tâm trạng</h2><p>7 ngày gần nhất</p></div><span class="badge success">${ZL.escape(entry.moodLabel||"Chưa ghi")}</span></div>
      <div class="mood-grid">
        ${MOODS.map((m,i)=>`<button class="mood-btn ${i===moodIndex?"active":""}" data-mood="${i}" title="${ZL.escape(m.label)}">${m.emoji}</button>`).join("")}
      </div>
      <div class="mini-chart"><canvas id="moodMiniChart"></canvas></div>
    </div>`;
  }

  function renderHabitList(date=selectedDate){
    const log=habitLog(date);
    if(!habits().length)return `<div class="empty slim">Chưa có habit</div>`;
    return habits().map(h=>{
      const due=isHabitDueOnDate(h,date);
      return `<div class="habit-row ${due&&!log[h.id]?"habit-due":""}">
      <div>
        <div class="item-title">${ZL.escape(h.icon||"•")} ${ZL.escape(h.name)}</div>
        <div class="item-meta">Mỗi ${Number(h.cycleDays)||1} ngày · streak ${habitStreak(h.id)}${due&&!log[h.id]?" · tới chu kỳ":""}</div>
      </div>
      <button class="btn sm ${log[h.id]?"primary":""}" data-habit-id="${ZL.escape(h.id)}">${log[h.id]?"Đã xong":"Chọn"}</button>
    </div>`;
    }).join("");
  }

  function monthLabel(monthKey){
    const [y,m]=monthKey.split("-").map(Number);
    return `Tháng ${m} ${y}`;
  }

  function shiftMonth(delta){
    const d=new Date(calendarMonth+"-01T00:00:00");
    d.setMonth(d.getMonth()+delta);
    calendarMonth=ZL.dateKey(d).slice(0,7);
    render();
  }

  function doneIconsFor(date){
    const log=habitLog(date);
    return habits().filter(h=>log[h.id]).map(h=>h.icon||"•");
  }

  function renderHabitCalendar(){
    const [year,month]=calendarMonth.split("-").map(Number);
    const last=new Date(year,month,0).getDate();
    const firstDay=new Date(year,month-1,1).getDay();
    const cells=[];
    for(let i=0;i<firstDay;i++)cells.push(`<div class="habit-cal-cell blank"></div>`);
    for(let day=1;day<=last;day++){
      const key=ZL.dateKey(new Date(year,month-1,day));
      const icons=doneIconsFor(key);
      const isSelected=key===selectedDate;
      const isToday=key===ZL.today();
      const missed=key<=ZL.today()&&habits().some(h=>isHabitDueOnDate(h,key));
      cells.push(`<button class="habit-cal-cell ${isSelected?"selected":""} ${isToday?"today":""}" data-select-date="${key}">
        <strong>${day}</strong>
        <div class="habit-cal-icons">${icons.slice(0,5).map(icon=>`<span>${ZL.escape(icon)}</span>`).join("")}${icons.length>5?`<small>+${icons.length-5}</small>`:""}${missed?`<em>⚠</em>`:""}</div>
      </button>`);
    }
    const selectedLog=habitLog(selectedDate);
    const selectedDone=habits().filter(h=>selectedLog[h.id]);
    const selectedEntry=entryFor(selectedDate);
    return `<div class="habit-calendar-card">
      <div class="habit-cal-head">
        <button class="icon-btn" id="habitPrevMonth">‹</button>
        <h2>📅 ${monthLabel(calendarMonth)}</h2>
        <button class="icon-btn" id="habitNextMonth">›</button>
      </div>
      <div class="habit-cal-weekdays">${["CN","T2","T3","T4","T5","T6","T7"].map(d=>`<span>${d}</span>`).join("")}</div>
      <div class="habit-cal-grid">${cells.join("")}</div>
      <div class="selected-day-panel">
        <div class="panel-title">
          <div><h2>Ngày ${selectedDate}</h2><p>${selectedDone.length?selectedDone.map(h=>`${h.icon||"•"} ${h.name}`).join(" · "):"Chưa tick habit"}</p></div>
        </div>
        <div class="selected-habit-list">
          ${renderHabitList(selectedDate)}
        </div>
        <div class="selected-day-notes">
          <div><strong>Journal</strong><p>${ZL.escape((selectedEntry.text||"").slice(0,160)||"Chưa ghi")}</p></div>
          <div><strong>Brain dump</strong><p>${ZL.escape((selectedEntry.brainDump||"").slice(0,160)||"Chưa ghi")}</p></div>
          <div><strong>Win</strong><p>${ZL.escape((selectedEntry.win||"").slice(0,180)||"Chưa ghi")}</p></div>
        </div>
      </div>
    </div>`;
  }

  function buildWinSuggestion(){
    const entry=entryFor(selectedDate);
    const log=habitLog(selectedDate);
    const done=habits().filter(h=>log[h.id]).map(h=>`${h.icon||"•"} ${h.name}`);
    const stats=ZL.invoiceStats(selectedDate);
    const parts=[];
    if(stats.count)parts.push(`Monstea ghi nhận ${stats.count} đơn, doanh thu ${ZL.money(stats.total)}.`);
    if(done.length)parts.push(`Anh hoàn thành ${done.length} habit: ${done.join(", ")}.`);
    if((entry.text||"").trim())parts.push("Anh đã dành thời gian ghi lại nhật ký để nhìn rõ ngày hôm nay.");
    if((entry.brainDump||"").trim())parts.push("Anh đã xả suy nghĩ trong Brain Dump, giúp đầu óc nhẹ và rõ hơn.");
    if(!parts.length)parts.push(`Anh đã quay lại ZakLife kiểm tra ngày ${selectedDate}, đây là một bước giữ nhịp tốt.`);
    return `Hôm nay anh đã hoàn thành:\n\n${parts.map(p=>"- "+p).join("\n")}`;
  }

  function normalizeWinLine(value){
    return String(value||"")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g,"")
      .replace(/[^a-z0-9]+/g," ")
      .trim();
  }

  function newWinSuggestionLines(current,suggestion){
    const seen=new Set(String(current||"").split(/\r?\n/).map(normalizeWinLine).filter(Boolean));
    const header=normalizeWinLine("Hôm nay anh đã hoàn thành:");
    const lines=[];
    String(suggestion||"").split(/\r?\n/).forEach(raw=>{
      const line=raw.trim();
      if(!line){
        if(lines.length&&lines[lines.length-1]!=="")lines.push("");
        return;
      }
      const key=normalizeWinLine(line);
      if(!key||seen.has(key))return;
      lines.push(line);
      seen.add(key);
    });
    while(lines[0]==="")lines.shift();
    while(lines[lines.length-1]==="")lines.pop();
    const nonBlank=lines.filter(Boolean);
    if(nonBlank.length===1&&normalizeWinLine(nonBlank[0])===header)return "";
    return lines.join("\n").replace(/\n{3,}/g,"\n\n").trim();
  }

  function fillWinSuggestion(){
    const el=document.getElementById("winOfDay");
    if(!el)return;
    const suggestion=buildWinSuggestion();
    const current=el.value.trim();
    const addition=newWinSuggestionLines(current,suggestion);
    if(!addition){
      ZL.toast("Chưa có gợi ý mới để thêm");
      return;
    }
    el.value=current?`${current}\n\n${addition}`:addition;
    queueJournalSave();
  }

  function recentEntries(){
    const entries=ZL.state.zak.entries||{};
    const rows=Object.keys(entries).sort().reverse().slice(0,5);
    if(!rows.length)return `<div class="empty slim">Chưa có journal</div>`;
    return rows.map(d=>{
      const e=entries[d]||{};
      const text=e.text||e.brainDump||e.win||"";
      return `<button class="note-row journal-history-row" data-select-date="${ZL.escape(d)}">
        <div>
          <div class="item-title">${ZL.escape(e.moodEmoji||"•")} ${ZL.escape(d)}</div>
          <div class="item-meta">${ZL.escape(text.slice(0,100))}</div>
        </div>
        <span class="badge">${ZL.escape(e.moodLabel||"--")}</span>
      </button>`;
    }).join("");
  }

  function bind(root){
    root.querySelectorAll(".mood-btn").forEach(btn=>btn.onclick=()=>{
      root.querySelectorAll(".mood-btn").forEach(x=>x.classList.remove("active"));
      btn.classList.add("active");
      queueJournalSave();
    });
    root.querySelectorAll(".star-btn").forEach(btn=>btn.onclick=()=>{
      document.getElementById("sleepQuality").value=btn.dataset.sleep;
      root.querySelectorAll(".star-btn").forEach(x=>x.classList.toggle("active",Number(x.dataset.sleep)<=Number(btn.dataset.sleep)));
      queueJournalSave();
    });
    root.querySelectorAll("[data-habit-id]").forEach(btn=>btn.onclick=()=>toggleHabit(btn.dataset.habitId,selectedDate));
    root.querySelectorAll("[data-select-date]").forEach(btn=>btn.onclick=()=>{
      persistJournal();
      selectedDate=btn.dataset.selectDate;
      calendarMonth=selectedDate.slice(0,7);
      render();
    });
    document.getElementById("habitPrevMonth").onclick=()=>shiftMonth(-1);
    document.getElementById("habitNextMonth").onclick=()=>shiftMonth(1);
    document.getElementById("saveJournalBtn").onclick=saveJournal;
    document.getElementById("suggestWinBtn").onclick=fillWinSuggestion;
    root.querySelectorAll("#journalText,#brainDump,#winOfDay,#sleepHours,#gratitude1,#gratitude2,#gratitude3,#energyMorning,#energyAfternoon,#energyEvening")
      .forEach(el=>{
        el.oninput=queueJournalSave;
        el.onchange=queueJournalSave;
      });
  }

  function render(){
    const root=document.getElementById("journalRoot");
    if(!root)return;
    const entry=entryFor(selectedDate);
    const foundMood=MOODS.findIndex(m=>m.emoji===entry.moodEmoji);
    const moodIndex=foundMood>=0?foundMood:2;
    const gratitude=Array.isArray(entry.gratitude)?entry.gratitude:[];
    root.innerHTML=`
      <div class="selected-date-bar">
        <div>
          <span class="badge blue">Đang ghi ngày</span>
          <strong>${selectedDate}</strong>
        </div>
        <button class="btn sm" data-select-date="${ZL.today()}">Về hôm nay</button>
      </div>
      <div class="wellbeing-grid">
        ${renderMood(entry,moodIndex)}
        ${renderSleep(entry)}
      </div>
      <div class="journal-write-grid" style="margin-top:16px">
        <div class="panel">
          <div class="panel-title"><div><h2>Daily Journal</h2><p>${selectedDate}</p></div></div>
          <div class="field"><textarea id="journalText" placeholder="Hôm nay có gì đáng ghi?">${ZL.escape(entry.text||"")}</textarea></div>
          <div class="grid grid-2">
            <div class="field compact"><label>Biết ơn 1</label><input id="gratitude1" value="${ZL.escape(gratitude[0]||"")}"></div>
            <div class="field compact"><label>Biết ơn 2</label><input id="gratitude2" value="${ZL.escape(gratitude[1]||"")}"></div>
          </div>
          <div class="field compact"><label>Biết ơn 3</label><input id="gratitude3" value="${ZL.escape(gratitude[2]||"")}"></div>
          <div class="field"><label>Win of the Day</label><textarea id="winOfDay" class="win-textarea" placeholder="Hôm nay anh đã hoàn thành điều gì?">${ZL.escape(entry.win||"")}</textarea></div>
          <div class="journal-actions">
            <button class="btn" id="suggestWinBtn">Gợi ý từ dữ liệu hôm nay</button>
            <button class="btn primary" id="saveJournalBtn">Lưu ngày đang chọn</button>
          </div>
        </div>
      </div>
      <div class="layout-2 habit-layout" style="margin-top:16px">
        <div class="panel">
          <div class="panel-title"><div><h2>Habit Tracker</h2><p>Tick cho ngày ${selectedDate}</p></div><span class="badge success">${habits().length} habits</span></div>
          ${renderHabitList(selectedDate)}
        </div>
        <div class="panel">
          ${renderHabitCalendar()}
          <div class="panel-title" style="margin-top:18px"><div><h2>Journal gần đây</h2></div></div>
          ${recentEntries()}
        </div>
      </div>`;
    bind(root);
    requestAnimationFrame(drawMoodMini);
  }

  ZL.modules.journal={render};
  ZL.on("zak",()=>{
    syncHabitDueTasks();
    if(ZL.state.route==="journal"&&isJournalEditing())return;
    render();
  });
  ZL.on("tasks",syncHabitDueTasks);
  ZL.on("route-change",payload=>{
    if(payload?.from==="journal"){
      clearTimeout(saveTimer);
      persistJournal();
    }
  });
  window.addEventListener("resize",()=>{if(ZL.state.route==="journal")drawMoodMini();});
})();
