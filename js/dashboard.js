(function(){
  const ZL=window.ZL;
  let dashboardSearch="";

  function habitStreak(){
    const log=ZL.state.zak.habitLog||{};
    let streak=0;
    const base=ZL.today();
    for(let i=0;i<120;i++){
      const key=ZL.addDays(base,-i);
      const done=Object.values(log[key]||{}).some(Boolean);
      if(done)streak++;
      else if(i>0)break;
    }
    return streak;
  }

  function scheduledContentCount(){
    return ZL.contentPosts().filter(p=>p.status==="scheduled"||p.status==="approved").length;
  }

  function taskRows(){
    return ZL.normalizeList(ZL.state.tasks).map(t=>({
      status:"todo",
      category:"personal",
      priority:"medium",
      starred:false,
      ...t
    }));
  }

  function entryRows(){
    const entries=ZL.state.zak.entries||{};
    return Object.entries(entries).map(([date,entry])=>({date,...entry}));
  }

  function habitsDone(date){
    const log=(ZL.state.zak.habitLog||{})[date]||{};
    const habits=Array.isArray(ZL.state.zak.habits)?ZL.state.zak.habits:[];
    return habits.filter(h=>log[h.id]);
  }

  function taskDoneOn(task,date){
    const doneDate=String(task.completedAt||task.doneAt||task.updatedAt||"").slice(0,10);
    return task.status==="done"&&doneDate===date;
  }

  function isTaskOverdue(task,today=ZL.today()){
    return task.dueDate&&task.dueDate<today&&task.status!=="done";
  }

  function staleMinutes(value){
    if(!value)return Infinity;
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return Infinity;
    return Math.round((Date.now()-date.getTime())/60000);
  }

  function noteRows(){
    const raw=(ZL.state.pos||{}).dailyNotes;
    if(Array.isArray(raw))return raw.map((n,idx)=>n?{...n,_path:String(idx)}:null).filter(Boolean);
    if(raw&&typeof raw==="object")return Object.entries(raw).map(([key,n])=>n?{...n,_path:key}:null).filter(Boolean);
    return [];
  }

  function noteTime(){
    return new Date().toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"});
  }

  function writeNote(path,patch){
    if(!ZL.fb.db){
      const raw=(ZL.state.pos.dailyNotes||[]);
      const list=Array.isArray(raw)?raw.slice():ZL.normalizeList(raw);
      const idx=Number(path);
      if(Number.isFinite(idx)&&list[idx])list[idx]={...list[idx],...patch};
      ZL.state.pos.dailyNotes=list;
      ZL.emit("dashboard");
      ZL.toast("Đã cập nhật local");
      return Promise.resolve();
    }
    return ZL.fb.db.ref("state/dailyNotes/"+path).update(patch);
  }

  function toggleNote(path){
    const note=noteRows().find(n=>n._path===String(path));
    if(!note)return;
    const done=!note.done;
    writeNote(note._path,{done,doneDate:done?ZL.today():null}).then(()=>ZL.toast(done?"Đã xong ghi chú":"Đã mở lại ghi chú"));
  }

  function saveDashboardTask(task){
    if(!ZL.fb.db){
      ZL.state.tasks=ZL.state.tasks||{};
      ZL.state.tasks[task.id]=task;
      ZL.emit("tasks");
      ZL.emit("dashboard");
      return Promise.resolve();
    }
    return ZL.fb.db.ref("zaklife/tasks/"+task.id).set(task);
  }

  function addNoteToTask(path){
    const note=noteRows().find(n=>n._path===String(path));
    if(!note)return;
    if(note.taskId){ZL.toast("Ghi chú này đã có task");return;}
    const id="task-monstea-note-"+Date.now();
    const now=ZL.nowIso();
    const task={
      id,
      title:String(note.text||"").trim()||"Ghi chú Monstea",
      status:"todo",
      category:"monstea",
      priority:"medium",
      dueDate:ZL.today(),
      starred:false,
      source:"monstea-note",
      sourcePath:note._path,
      createdAt:now,
      updatedAt:now
    };
    saveDashboardTask(task)
      .then(()=>writeNote(note._path,{taskId:id,taskCreatedAt:now}))
      .then(()=>ZL.toast("Đã thêm vào To Do Monstea"));
  }

  function addNote(text){
    const value=String(text||"").trim();
    if(!value){ZL.toast("Nhập nội dung ghi chú");return;}
    const note={id:Date.now(),text:value,time:noteTime(),date:ZL.today(),done:false};
    if(!ZL.fb.db){
      const list=noteRows().map(({_path,...n})=>n);
      list.push(note);
      ZL.state.pos.dailyNotes=list;
      ZL.emit("dashboard");
      ZL.toast("Đã thêm local");
      return;
    }
    const raw=(ZL.state.pos||{}).dailyNotes;
    if(Array.isArray(raw)){
      const list=raw.slice();
      list.push(note);
      ZL.fb.db.ref("state/dailyNotes").set(list).then(()=>ZL.toast("Đã thêm ghi chú"));
    }else{
      ZL.fb.db.ref("state/dailyNotes").push(note).then(()=>ZL.toast("Đã thêm ghi chú"));
    }
  }

  function renderMonsteaToday(){
    const today=ZL.today();
    const stats=ZL.invoiceStats(today);
    const yesterday=ZL.addDays(today,-1);
    const history=(ZL.state.pos||{}).history||{};
    const oldRevenue=Number(history[yesterday]?.totalRevenue)||ZL.invoiceStats(yesterday).total;
    const pct=oldRevenue?Math.round((stats.total-oldRevenue)/oldRevenue*100):null;
    const active=noteRows().filter(n=>!n.done).sort((a,b)=>String(a.time||"").localeCompare(String(b.time||""))).slice(0,8);
    return `<div class="panel monstea-today">
      <div class="panel-title">
        <div><h2>Monstea hôm nay</h2><p>${today}</p></div>
        <button class="btn sm" data-route-jump="content">Lịch bài</button>
      </div>
      <div class="monstea-line">
        <strong class="accent-value">${ZL.money(stats.total)}</strong>
        <span class="badge blue">${stats.count} đơn</span>
        ${pct===null?`<span class="muted small">Chưa có số hôm qua</span>`:`<span class="${pct>=0?"accent-value":"danger-value"} small">${pct>=0?"+":""}${pct}% vs hôm qua</span>`}
      </div>
      <div class="note-input-row">
        <input id="monsteaNoteInput" placeholder="Thêm ghi chú vận hành">
        <button class="btn primary" id="monsteaNoteAdd">Thêm</button>
      </div>
      <div class="note-list compact">
        ${active.length?active.map(n=>`<div class="monstea-note">
          <button class="check-box" data-note-toggle="${ZL.escape(n._path)}" title="Đánh dấu xong"></button>
          <span>${ZL.escape(n.text||"")}</span>
          <button class="btn sm note-task-btn" data-note-task="${ZL.escape(n._path)}" ${n.taskId?"disabled":""}>${n.taskId?"Đã thêm":"+ Task"}</button>
          <time>${ZL.escape(n.time||"")}</time>
        </div>`).join(""):`<div class="empty slim">Không có ghi chú đang mở</div>`}
      </div>
    </div>`;
  }

  function renderAgents(){
    const agents=ZL.state.agents||{};
    const names=["kyoko","nana","longnhi"];
    return names.map(name=>{
      const data=agents[name]||{};
      const status=String(data.status||data.state||"offline").toLowerCase();
      const online=status.includes("online")||status.includes("active")||status.includes("ready");
      return `<div class="agent-row">
        <div>
          <div class="agent-name">${ZL.escape(name[0].toUpperCase()+name.slice(1))}</div>
          <div class="item-meta">${ZL.escape(data.note||data.last_seen||"Chưa có tín hiệu")}</div>
        </div>
        <span class="badge ${online?"success":"danger"}">${online?"Online":"Offline"}</span>
      </div>`;
    }).join("");
  }

  function renderNanaMessages(){
    const rows=ZL.normalizeList(ZL.state.nana).sort((a,b)=>String(b.timestamp||"").localeCompare(String(a.timestamp||""))).slice(0,4);
    if(!rows.length)return `<div class="empty">Chưa có tin nhắn mới</div>`;
    return rows.map(m=>`<div class="note-row">
      <div>
        <div class="item-title">${ZL.escape(m.title||m.from||"Nana")}</div>
        <div class="item-meta">${ZL.escape(m.message||m.text||"")}</div>
      </div>
      <span class="muted small">${ZL.escape(String(m.timestamp||"").slice(0,10))}</span>
    </div>`).join("");
  }

  function fmtAsset(value,digits=2){
    const n=Number(value)||0;
    return n.toLocaleString("vi-VN",{maximumFractionDigits:digits});
  }

  function fmtTime(value){
    if(!value)return "Chưa có dữ liệu";
    const d=new Date(value);
    if(Number.isNaN(d.getTime()))return String(value);
    return d.toLocaleString("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
  }

  function walletExchangeRows(balance){
    const exchanges=balance?.exchanges||{};
    return Object.entries(exchanges).map(([name,data])=>({
      name,
      status:String(data.status||"unknown"),
      usdt:Number(data.usdt)||0,
      totalUsdt:Number(data.totalUsdt??data.usdt)||0,
      assets:Array.isArray(data.assets)?data.assets:[],
      updatedAt:data.updatedAt||balance.updatedAt||""
    }));
  }

  function renderWalletBalance(){
    const balance=ZL.state.wallet?.balances||null;
    const rows=walletExchangeRows(balance);
    const totalUsdt=Number(balance?.totalUsdt)||rows.reduce((sum,row)=>sum+row.totalUsdt,0);
    const totalVnd=Number(balance?.totalVnd)||0;
    const updatedAt=balance?.updatedAt||rows.map(r=>r.updatedAt).filter(Boolean).sort().pop();
    return `<div class="panel wallet-panel" style="margin-top:16px">
      <div class="panel-title">
        <div><h2>Exchange balance</h2><p>Binance / OKX read-only, dữ liệu dùng để đối soát</p></div>
        <span class="badge ${balance?"success":"warning"}">${balance?"Synced":"Waiting"}</span>
      </div>
      <div class="wallet-summary">
        <div><span>Tổng USDT</span><strong class="accent-value">${fmtAsset(totalUsdt,4)}</strong></div>
        <div><span>Quy đổi VND</span><strong class="blue-value">${totalVnd?ZL.money(totalVnd):"--"}</strong></div>
        <div><span>Cập nhật</span><strong>${ZL.escape(fmtTime(updatedAt))}</strong></div>
      </div>
      ${rows.length?`<div class="wallet-table">
        ${rows.map(row=>`<div class="wallet-row">
          <div>
            <div class="item-title">${ZL.escape(row.name.toUpperCase())}</div>
            <div class="item-meta">${row.assets.length} tài sản · ${ZL.escape(fmtTime(row.updatedAt))}</div>
          </div>
          <div class="wallet-row-value">
            <strong>${fmtAsset(row.usdt,4)} USDT</strong>
            <span class="badge ${row.status==="ok"?"success":"danger"}">${ZL.escape(row.status)}</span>
          </div>
        </div>`).join("")}
      </div>`:`<div class="empty slim">Chưa có dữ liệu balance. Chạy worker VPS để ghi vào Firebase path <code>zaklife/wallet/balances/current</code>.</div>`}
      <div class="item-meta wallet-disclaimer">Dữ liệu này chỉ hỗ trợ đối soát, không thay thế sao kê sàn hoặc chứng từ thuế chính thức.</div>
    </div>`;
  }

  function commandItems(today,stats,posts,streak){
    const tasks=taskRows();
    const dueToday=tasks.filter(t=>t.status!=="done"&&t.dueDate===today);
    const overdue=tasks.filter(t=>isTaskOverdue(t,today));
    const activeNotes=noteRows().filter(n=>!n.done);
    const todayEntry=(ZL.state.zak.entries||{})[today]||{};
    const todayPosts=ZL.contentPosts().filter(p=>p.scheduledDate===today&&p.status!=="posted");
    const balance=ZL.state.wallet?.balances;
    const balanceAge=staleMinutes(balance?.updatedAt);
    const items=[];
    if(!stats.count)items.push({route:"pos",label:"Kiểm tra POS hôm nay",meta:"Chưa có đơn ghi nhận"});
    if(activeNotes.length)items.push({route:"dashboard",label:`Xử lý ${activeNotes.length} ghi chú Monstea`,meta:activeNotes[0]?.text||"Ghi chú vận hành"});
    if(overdue.length)items.push({route:"tasks",label:`Dọn ${overdue.length} task quá hạn`,meta:overdue[0]?.title||"Task quá hạn"});
    if(dueToday.length)items.push({route:"tasks",label:`Làm ${dueToday.length} task hôm nay`,meta:dueToday[0]?.title||"Task hôm nay"});
    if(todayPosts.length)items.push({route:"content",label:`Theo dõi ${todayPosts.length} bài content hôm nay`,meta:todayPosts[0]?.title||"Content"});
    if(posts<3)items.push({route:"content",label:"Bổ sung lịch content",meta:"Scheduled + Approved còn mỏng"});
    if(!todayEntry.text&&!todayEntry.brainDump&&!todayEntry.win)items.push({route:"journal",label:"Ghi Daily Review",meta:"Journal hôm nay còn trống"});
    if(balance&&balanceAge>30)items.push({route:"dashboard",label:"Kiểm tra worker balance",meta:`Balance đã ${balanceAge} phút chưa cập nhật`});
    if(!items.length)items.push({route:"tasks",label:"Ngày đang ổn",meta:`Doanh thu ${ZL.money(stats.total)} · streak ${streak}`});
    return items.slice(0,6);
  }

  function renderCommandCenter(today,stats,posts,streak){
    const tasks=taskRows();
    const doneToday=tasks.filter(t=>taskDoneOn(t,today)).length;
    const dueToday=tasks.filter(t=>t.status!=="done"&&t.dueDate===today).length;
    const entry=(ZL.state.zak.entries||{})[today]||{};
    const doneHabits=habitsDone(today).length;
    const items=commandItems(today,stats,posts,streak);
    return `<div class="command-shell">
      <div class="command-hero panel">
        <div>
          <span class="badge success">Today Command</span>
          <h2>Hôm nay cần chú ý gì?</h2>
          <p>${today} · ${stats.count} đơn · ${dueToday} task hôm nay · ${doneHabits} habit đã xong</p>
        </div>
        <div class="command-score">
          <strong>${ZL.money(stats.total)}</strong>
          <span>${doneToday} task xong · streak ${streak}</span>
        </div>
      </div>
      <div class="command-grid">
        <button class="command-card" data-route-jump="pos"><span>Monstea</span><strong>${ZL.money(stats.total)}</strong><em>${stats.count} đơn hôm nay</em></button>
        <button class="command-card" data-route-jump="tasks"><span>Tasks</span><strong>${dueToday}</strong><em>cần làm hôm nay</em></button>
        <button class="command-card" data-route-jump="content"><span>Content</span><strong>${posts}</strong><em>scheduled + approved</em></button>
        <button class="command-card" data-route-jump="journal"><span>Journal</span><strong>${entry.win?"Done":"Open"}</strong><em>${entry.win?"đã có win":"chưa review"}</em></button>
      </div>
      <div class="panel command-actions">
        <div class="panel-title"><div><h2>Ưu tiên tiếp theo</h2><p>Tự tổng hợp từ POS, Tasks, Content, Journal</p></div></div>
        <div class="action-list">
          ${items.map(item=>`<button class="action-item" data-route-jump="${ZL.escape(item.route)}">
            <span>${ZL.escape(item.label)}</span>
            <em>${ZL.escape(item.meta||"")}</em>
          </button>`).join("")}
        </div>
      </div>
    </div>`;
  }

  function dailyReview(today,stats){
    const tasks=taskRows();
    const entry=(ZL.state.zak.entries||{})[today]||{};
    const done=tasks.filter(t=>taskDoneOn(t,today));
    const pending=tasks.filter(t=>t.status!=="done"&&t.dueDate===today);
    const doneHabits=habitsDone(today);
    const posts=ZL.contentPosts().filter(p=>p.scheduledDate===today);
    const openNotes=noteRows().filter(n=>!n.done);
    const lines=[];
    lines.push(stats.count?`Monstea có ${stats.count} đơn, doanh thu ${ZL.money(stats.total)}.`:"Monstea hôm nay chưa có đơn ghi nhận.");
    if(stats.top)lines.push(`Món nổi bật: ${stats.top.name} (${stats.top.qty} lượt).`);
    lines.push(done.length?`Hoàn thành ${done.length} task: ${done.slice(0,3).map(t=>t.title).join(", ")}.`:"Chưa có task nào được đánh dấu xong hôm nay.");
    if(pending.length)lines.push(`Còn ${pending.length} task hôm nay chưa xong.`);
    lines.push(doneHabits.length?`Đã tick ${doneHabits.length} habit: ${doneHabits.slice(0,4).map(h=>`${h.icon||""} ${h.name}`).join(", ")}.`:"Chưa tick habit hôm nay.");
    if(posts.length)lines.push(`Có ${posts.length} bài content trong lịch hôm nay.`);
    if(openNotes.length)lines.push(`Monstea còn ${openNotes.length} ghi chú vận hành đang mở.`);
    if(entry.win)lines.push(`Win of the day: ${entry.win.slice(0,180)}`);
    else if(entry.text||entry.brainDump)lines.push("Journal/Brain dump đã có dữ liệu, còn thiếu Win of the day.");
    else lines.push("Journal hôm nay chưa có nội dung.");
    return lines;
  }

  function renderDailyReview(today,stats){
    const lines=dailyReview(today,stats);
    return `<div class="panel daily-review-panel" style="margin-top:16px">
      <div class="panel-title">
        <div><h2>Daily Review tự động</h2><p>Nana có thể dùng phần này để báo cáo cuối ngày</p></div>
        <button class="btn sm" data-route-jump="journal">Mở Journal</button>
      </div>
      <div class="review-lines">
        ${lines.map(line=>`<div class="review-line">${ZL.escape(line)}</div>`).join("")}
      </div>
    </div>`;
  }

  function searchCorpus(){
    const corpus=[];
    taskRows().forEach(t=>corpus.push({type:"Task",route:"tasks",title:t.title||"Task",detail:`${t.category||"personal"} · ${t.status||"todo"} · ${t.dueDate||"no date"}`,text:`${t.title||""} ${t.category||""} ${t.status||""} ${t.priority||""}`}));
    ZL.contentPosts().forEach(p=>corpus.push({type:"Content",route:"content",title:p.title||"Content",detail:`${p.scheduledDate||""} ${p.scheduledTime||""} · ${p.status||""}`,text:`${p.title||""} ${p.caption||""} ${p.status||""}`}));
    (ZL.state.zak.ideas||[]).forEach(i=>corpus.push({type:"Idea",route:"ideas",title:i.title||"Idea",detail:(i.tags||[]).join(", ")||String(i.created||"").slice(0,10),text:`${i.title||""} ${i.note||""} ${(i.tags||[]).join(" ")} ${(i.links||[]).join(" ")}`}));
    entryRows().forEach(e=>corpus.push({type:"Journal",route:"journal",title:`Journal ${e.date}`,detail:e.moodLabel||"Daily note",text:`${e.date} ${e.text||""} ${e.brainDump||""} ${e.win||""} ${(e.gratitude||[]).join(" ")}`}));
    noteRows().forEach(n=>corpus.push({type:"Monstea note",route:"dashboard",title:n.text||"Ghi chú Monstea",detail:`${n.date||""} ${n.time||""}`,text:`${n.text||""} ${n.date||""}`}));
    return corpus;
  }

  function searchResults(){
    const q=dashboardSearch.trim().toLowerCase();
    if(q.length<2)return [];
    return searchCorpus().filter(item=>item.text.toLowerCase().includes(q)||item.title.toLowerCase().includes(q)).slice(0,10);
  }

  function renderGlobalSearch(){
    const q=dashboardSearch.trim();
    const results=searchResults();
    return `<div class="panel global-search-panel" style="margin-top:16px">
      <div class="panel-title"><div><h2>Tìm kiếm toàn hệ thống</h2><p>Tasks, Ideas, Journal, Content, ghi chú Monstea. Vault không đưa vào search khi khóa.</p></div></div>
      <div class="search-input-wrap">
        <input id="dashboardSearchInput" value="${ZL.escape(dashboardSearch)}" placeholder="Tìm task, idea, journal, content...">
        ${q?`<button class="btn sm" id="dashboardSearchClear">Xóa</button>`:""}
      </div>
      <div class="search-results">
        ${q.length<2?`<div class="empty slim">Nhập ít nhất 2 ký tự để tìm.</div>`:results.length?results.map(item=>`<button class="search-result" data-route-jump="${ZL.escape(item.route)}">
          <span class="search-type">${ZL.escape(item.type)}</span>
          <strong>${ZL.escape(item.title)}</strong>
          <em>${ZL.escape(item.detail||"")}</em>
        </button>`).join(""):`<div class="empty slim">Không tìm thấy kết quả.</div>`}
      </div>
    </div>`;
  }

  function drawRevenueChart(){
    const canvas=document.getElementById("dashboardRevenueChart");
    if(!canvas)return;
    const box=canvas.getBoundingClientRect();
    const ratio=window.devicePixelRatio||1;
    canvas.width=Math.max(1,Math.floor(box.width*ratio));
    canvas.height=Math.max(1,Math.floor(box.height*ratio));
    const ctx=canvas.getContext("2d");
    ctx.scale(ratio,ratio);
    const w=box.width,h=box.height,pad=28;
    ctx.clearRect(0,0,w,h);
    const dates=ZL.lastDates(7);
    const values=dates.map(d=>ZL.invoiceStats(d).total);
    const max=Math.max(1,...values);
    ctx.strokeStyle="rgba(255,255,255,.08)";
    ctx.lineWidth=1;
    for(let i=0;i<4;i++){
      const y=pad+(h-pad*2)*i/3;
      ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(w-pad,y);ctx.stroke();
    }
    const pts=values.map((v,i)=>({x:pad+(w-pad*2)*(i/(values.length-1||1)),y:h-pad-(h-pad*2)*(v/max)}));
    const grad=ctx.createLinearGradient(0,pad,0,h-pad);
    grad.addColorStop(0,"rgba(16,185,129,.36)");
    grad.addColorStop(1,"rgba(16,185,129,0)");
    ctx.beginPath();
    pts.forEach((pt,i)=>i?ctx.lineTo(pt.x,pt.y):ctx.moveTo(pt.x,pt.y));
    ctx.lineTo(pts[pts.length-1].x,h-pad);ctx.lineTo(pts[0].x,h-pad);ctx.closePath();
    ctx.fillStyle=grad;ctx.fill();
    ctx.beginPath();
    pts.forEach((pt,i)=>i?ctx.lineTo(pt.x,pt.y):ctx.moveTo(pt.x,pt.y));
    ctx.strokeStyle="#34d399";ctx.lineWidth=3;ctx.stroke();
    ctx.fillStyle="#94a3b8";ctx.font="11px Inter";
    dates.forEach((d,i)=>ctx.fillText(d.slice(5),pts[i].x-15,h-8));
  }

  function bind(root){
    root.querySelectorAll("[data-note-toggle]").forEach(btn=>btn.onclick=()=>toggleNote(btn.dataset.noteToggle));
    root.querySelectorAll("[data-note-task]").forEach(btn=>btn.onclick=()=>addNoteToTask(btn.dataset.noteTask));
    root.querySelectorAll("[data-route-jump]").forEach(btn=>btn.onclick=()=>ZL.switchRoute(btn.dataset.routeJump));
    const searchInput=root.querySelector("#dashboardSearchInput");
    if(searchInput){
      searchInput.oninput=e=>{
        dashboardSearch=e.target.value;
        render();
        requestAnimationFrame(()=>{
          const next=document.getElementById("dashboardSearchInput");
          if(next){
            next.focus();
            next.selectionStart=next.selectionEnd=next.value.length;
          }
        });
      };
    }
    const searchClear=root.querySelector("#dashboardSearchClear");
    if(searchClear)searchClear.onclick=()=>{dashboardSearch="";render();};
    const addBtn=root.querySelector("#monsteaNoteAdd");
    const input=root.querySelector("#monsteaNoteInput");
    if(addBtn&&input){
      addBtn.onclick=()=>{addNote(input.value);input.value="";};
      input.onkeydown=e=>{if(e.key==="Enter"){addNote(input.value);input.value="";}};
    }
  }

  function render(){
    const root=document.getElementById("dashboardRoot");
    if(!root)return;
    const today=ZL.today();
    const stats=ZL.invoiceStats(today);
    const posts=scheduledContentCount();
    const streak=habitStreak();
    const alerts=[];
    if(!stats.count)alerts.push("Monstea hôm nay chưa có đơn ghi nhận.");
    if(posts<3)alerts.push("Lịch content còn mỏng.");
    const approved=ZL.contentPosts().filter(p=>p.status==="approved").length;
    if(approved)alerts.push(`${approved} bài đã approved.`);
    root.innerHTML=`
      ${renderCommandCenter(today,stats,posts,streak)}
      ${renderGlobalSearch()}
      ${renderDailyReview(today,stats)}
      <div class="grid grid-4">
        <div class="stat-card"><div class="stat-label">Doanh thu hôm nay</div><div class="stat-value accent-value">${ZL.money(stats.total)}</div><div class="stat-note">${today}</div></div>
        <div class="stat-card"><div class="stat-label">Số đơn</div><div class="stat-value">${stats.count}</div><div class="stat-note">Không tính nội bộ</div></div>
        <div class="stat-card"><div class="stat-label">Content chờ lịch</div><div class="stat-value warning-value">${posts}</div><div class="stat-note">Scheduled + Approved</div></div>
        <div class="stat-card"><div class="stat-label">Habit streak</div><div class="stat-value blue-value">${streak}</div><div class="stat-note">Ngày liên tiếp</div></div>
      </div>
      ${renderWalletBalance()}
      <div class="layout-2 dashboard-main" style="margin-top:16px">
        <div class="panel">
          <div class="panel-title">
            <div><h2>Doanh thu 7 ngày</h2><p>Theo dữ liệu POS</p></div>
            <span class="badge success">Realtime</span>
          </div>
          <div class="chart-wrap"><canvas id="dashboardRevenueChart"></canvas></div>
        </div>
        ${renderMonsteaToday()}
      </div>
      <div class="grid grid-3" style="margin-top:16px">
        <div class="panel"><div class="panel-title"><div><h2>Việc cần chú ý</h2></div></div>${alerts.length?alerts.map(a=>`<div class="note-row"><div class="item-title">${ZL.escape(a)}</div></div>`).join(""):`<div class="empty">Không có cảnh báo lớn</div>`}</div>
        <div class="panel"><div class="panel-title"><div><h2>AI Team</h2></div></div>${renderAgents()}</div>
        <div class="panel"><div class="panel-title"><div><h2>Nana messages</h2></div></div>${renderNanaMessages()}</div>
      </div>`;
    bind(root);
    requestAnimationFrame(drawRevenueChart);
  }

  ZL.modules.dashboard={render};
  ["dashboard","pos","content","agents","nana","zak","wallet"].forEach(evt=>ZL.on(evt,render));
  window.addEventListener("resize",()=>{if(ZL.state.route==="dashboard")drawRevenueChart();});
})();
