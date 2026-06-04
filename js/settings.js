(function(){
  const ZL=window.ZL;
  const ICONS=["🌱","💧","📚","🧘","🐟","🧹","🧺","💊","🏋️","🚶","🛌","☀️","📝","💰","☕","🍵","🍎","🥗","🧠","🎯","🔥","⭐","✅","🌙"];
  let selectedIcon="🌱";
  let iconPickerOpen=false;
  let pendingHabitName="";
  let pendingHabitCycle=1;

  function exportJson(){
    const blob=new Blob([JSON.stringify({zaklife:ZL.state.zak,exportedAt:ZL.nowIso()},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download="zaklife-export-"+ZL.today()+".json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleTheme(){
    document.body.classList.toggle("light");
    localStorage.setItem("zaklifeTheme",document.body.classList.contains("light")?"light":"dark");
  }

  function addHabit(){
    const icon=selectedIcon||"•";
    const name=(document.getElementById("habitName").value||pendingHabitName).trim();
    const cycleDays=Math.max(1,Number(document.getElementById("habitCycle").value||pendingHabitCycle)||1);
    if(!name){ZL.toast("Nhập tên habit");return;}
    ZL.state.zak.habits=Array.isArray(ZL.state.zak.habits)?ZL.state.zak.habits:[];
    const next=Math.max(0,...ZL.state.zak.habits.map(h=>Number(h.id)||0))+1;
    ZL.state.zak.habits.push({id:next,icon,name,cycleDays});
    selectedIcon="🌱";
    iconPickerOpen=false;
    pendingHabitName="";
    pendingHabitCycle=1;
    ZL.syncZakData({replaceHabits:true});
    ZL.toast("Đã thêm habit");
    render();
  }

  function removeHabit(id){
    if(!confirm("Xóa habit này? Dữ liệu log cũ vẫn giữ trong ngày đã ghi."))return;
    ZL.state.zak.habits=(ZL.state.zak.habits||[]).filter(h=>String(h.id)!==String(id));
    ZL.syncZakData({replaceHabits:true});
    render();
  }

  function updateCycle(id,value){
    const h=(ZL.state.zak.habits||[]).find(x=>String(x.id)===String(id));
    if(!h)return;
    h.cycleDays=Math.max(1,Number(value)||1);
    delete h.cycle;
    ZL.syncZakData({replaceHabits:true});
  }

  function updateIcon(id,icon){
    const h=(ZL.state.zak.habits||[]).find(x=>String(x.id)===String(id));
    if(!h)return;
    h.icon=icon||"•";
    ZL.syncZakData({replaceHabits:true});
    render();
  }

  function iconPickerHtml(){
    if(!iconPickerOpen)return "";
    return `<div class="icon-picker">
      ${ICONS.map(icon=>`<button class="${selectedIcon===icon?"selected":""}" data-pick-icon="${ZL.escape(icon)}">${ZL.escape(icon)}</button>`).join("")}
    </div>`;
  }

  function renderHabitManager(){
    const habits=ZL.state.zak.habits||[];
    return `<div class="panel">
      <div class="panel-title"><div><h2>Habits</h2><p>Icon và chu kỳ riêng</p></div></div>
      <div class="grid grid-3">
        <div class="field compact">
          <label>Icon</label>
          <button class="icon-select" id="iconSelect" type="button">${ZL.escape(selectedIcon)}</button>
          ${iconPickerHtml()}
        </div>
        <div class="field compact"><label>Tên habit</label><input id="habitName" placeholder="Tưới cây" value="${ZL.escape(pendingHabitName)}"></div>
        <div class="field compact"><label>Chu kỳ ngày</label><input id="habitCycle" type="number" min="1" max="90" value="${ZL.escape(pendingHabitCycle)}"></div>
      </div>
      <button class="btn primary" id="addHabitBtn">Thêm habit</button>
      <div class="habit-settings-list">
        ${habits.length?habits.map(h=>`<div class="habit-row">
          <div>
            <div class="item-title">${ZL.escape(h.icon||"•")} ${ZL.escape(h.name)}</div>
            <div class="item-meta">ID ${ZL.escape(h.id)}</div>
          </div>
          <div class="habit-cycle-control">
            <select data-existing-icon="${ZL.escape(h.id)}">
              ${ICONS.map(icon=>`<option value="${ZL.escape(icon)}" ${String(h.icon||"")===icon?"selected":""}>${ZL.escape(icon)}</option>`).join("")}
            </select>
            <input type="number" min="1" max="90" value="${Number(h.cycleDays)||1}" data-habit-cycle="${ZL.escape(h.id)}">
            <button class="btn sm danger" data-remove-habit="${ZL.escape(h.id)}">Xóa</button>
          </div>
        </div>`).join(""):`<div class="empty slim">Chưa có habit</div>`}
      </div>
    </div>`;
  }

  function render(){
    const root=document.getElementById("settingsRoot");
    if(!root)return;
    const localSize=(localStorage.getItem("zaklife")||"").length;
    const vaultSize=(localStorage.getItem("zkv")||"").length;
    const zak=ZL.state.zak||{};
    const entryCount=Object.keys(zak.entries||{}).length;
    const habitLogDays=Object.keys(zak.habitLog||{}).length;
    const habitCount=Array.isArray(zak.habits)?zak.habits.length:0;
    const ideaCount=Array.isArray(zak.ideas)?zak.ideas.length:0;
    root.innerHTML=`
      <div class="grid grid-4" style="margin-bottom:16px">
        <div class="stat-card"><div class="stat-label">Firebase</div><div class="stat-value ${ZL.fb.ready?"accent-value":"danger-value"}">${ZL.fb.ready?"Ready":"Offline"}</div><div class="stat-note">RTDB</div></div>
        <div class="stat-card"><div class="stat-label">Local ZakLife</div><div class="stat-value blue-value">${Math.round(localSize/1024)}KB</div><div class="stat-note">localStorage/zaklife</div></div>
        <div class="stat-card"><div class="stat-label">Vault</div><div class="stat-value warning-value">${Math.round(vaultSize/1024)}KB</div><div class="stat-note">localStorage/zkv</div></div>
        <div class="stat-card"><div class="stat-label">Remote ZakLife</div><div class="stat-value ${ZL.zakDataLoaded?"accent-value":"warning-value"}">${ZL.zakDataLoaded?"Loaded":"Waiting"}</div><div class="stat-note">Chống ghi đè sớm</div></div>
      </div>
      <div class="layout-2">
        ${renderHabitManager()}
        <div class="panel">
          <div class="panel-title"><div><h2>Data Safety</h2><p>Đồng bộ an toàn, không ghi đè root khi Firebase chưa tải xong</p></div></div>
          <div class="grid grid-2" style="margin-bottom:12px">
            <div class="stat-card"><div class="stat-label">Journal</div><div class="stat-value">${entryCount}</div><div class="stat-note">ngày có dữ liệu</div></div>
            <div class="stat-card"><div class="stat-label">Habit log</div><div class="stat-value">${habitLogDays}</div><div class="stat-note">ngày đã tick</div></div>
            <div class="stat-card"><div class="stat-label">Habits</div><div class="stat-value">${habitCount}</div><div class="stat-note">định nghĩa habit</div></div>
            <div class="stat-card"><div class="stat-label">Ideas</div><div class="stat-value">${ideaCount}</div><div class="stat-note">inbox ý tưởng</div></div>
          </div>
          <div class="grid">
            <button class="btn primary" id="syncNowBtn" ${ZL.zakDataLoaded?"":"disabled"}>Đồng bộ an toàn</button>
            <button class="btn" id="exportBtn">Export local JSON</button>
            <button class="btn" id="themeBtn">Đổi dark/light</button>
          </div>
          <div class="empty slim">Mỗi lần ghi lên Firebase, app giữ một backup ngày tại <code>zaklife/data_backups/YYYY-MM-DD</code>.</div>
          <div class="path-list">
            ${[
              "state/todayInvoices",
              "state/invoiceArchive/{date}",
              "state/dailyNotes",
              "state/purchases",
              "state/expenses",
              "state/salaryPayments",
              "zaklife/data",
              "zaklife/content-calendar",
              "zaklife/vault_encrypted"
            ].map(path=>`<div class="agent-row"><div class="item-title">${ZL.escape(path)}</div><span class="badge success">mapped</span></div>`).join("")}
          </div>
        </div>
      </div>`;
    document.getElementById("syncNowBtn").onclick=()=>ZL.syncZakData().then(()=>ZL.toast("Đã đồng bộ"));
    document.getElementById("exportBtn").onclick=exportJson;
    document.getElementById("themeBtn").onclick=toggleTheme;
    document.getElementById("addHabitBtn").onclick=addHabit;
    document.getElementById("iconSelect").onclick=()=>{iconPickerOpen=!iconPickerOpen;render();};
    document.getElementById("habitName").oninput=e=>{pendingHabitName=e.target.value;};
    document.getElementById("habitCycle").oninput=e=>{pendingHabitCycle=e.target.value;};
    root.querySelectorAll("[data-pick-icon]").forEach(btn=>btn.onclick=()=>{
      selectedIcon=btn.dataset.pickIcon;
      iconPickerOpen=false;
      render();
    });
    root.querySelectorAll("[data-existing-icon]").forEach(sel=>sel.onchange=()=>updateIcon(sel.dataset.existingIcon,sel.value));
    root.querySelectorAll("[data-remove-habit]").forEach(btn=>btn.onclick=()=>removeHabit(btn.dataset.removeHabit));
    root.querySelectorAll("[data-habit-cycle]").forEach(input=>input.onchange=()=>updateCycle(input.dataset.habitCycle,input.value));
  }

  ZL.modules.settings={render};
  ZL.on("zak",render);
})();
