(function(){
  const ZL=window.ZL;
  const CATEGORIES={
    monstea:{label:"Monstea",icon:"🍵",color:"#10b981"},
    content:{label:"Content",icon:"📣",color:"#3b82f6"},
    personal:{label:"Personal",icon:"🧘",color:"#14b8a6"},
    dev:{label:"Dev",icon:"💻",color:"#f59e0b"},
    trading:{label:"Trading",icon:"📈",color:"#8b5cf6"}
  };
  const PRIORITY={high:{label:"High",color:"#ef4444"},medium:{label:"Medium",color:"#facc15"},low:{label:"Low",color:"#22c55e"}};
  const STATUS=[
    {key:"todo",title:"📋 To Do"},
    {key:"doing",title:"↻ Doing"},
    {key:"done",title:"✅ Done"}
  ];
  let filter="all";
  let search="";
  let categoryFilter="";
  let editingId="";
  const DONE_RETENTION_DAYS=3;
  const DONE_RETENTION_MS=DONE_RETENTION_DAYS*24*60*60*1000;
  let cleanupDoneRunning=false;

  function allTasks(){
    return ZL.normalizeList(ZL.state.tasks).map(t=>({
      status:"todo",
      category:"personal",
      priority:"medium",
      starred:false,
      ...t
    }));
  }

  function doneTimestamp(task){
    if(task.status!=="done")return 0;
    const raw=task.completedAt||task.doneAt||task.updatedAt||"";
    if(!raw)return 0;
    const time=new Date(raw).getTime();
    return Number.isFinite(time)?time:0;
  }

  function isExpiredDone(task){
    const time=doneTimestamp(task);
    return Boolean(time&&Date.now()-time>=DONE_RETENTION_MS);
  }

  function tasks(){
    return allTasks().filter(t=>!isExpiredDone(t));
  }

  function normalizePatch(id,patch){
    const old=allTasks().find(t=>String(t.id)===String(id))||{};
    const next={...patch};
    if(Object.prototype.hasOwnProperty.call(next,"status")){
      if(next.status==="done"){
        next.completedAt=next.completedAt||old.completedAt||old.doneAt||ZL.nowIso();
      }else{
        next.completedAt=null;
        next.doneAt=null;
      }
    }
    return {...next,updatedAt:ZL.nowIso()};
  }

  function taskRef(id){
    return ZL.fb.db?.ref("zaklife/tasks/"+id);
  }

  function saveTask(task){
    if(!ZL.fb.db){
      ZL.state.tasks=ZL.state.tasks||{};
      ZL.state.tasks[task.id]=task;
      ZL.emit("tasks");
      ZL.toast("Đã lưu local");
      return Promise.resolve();
    }
    return taskRef(task.id).set(task);
  }

  function patchTask(id,patch){
    const nextPatch=normalizePatch(id,patch);
    if(!ZL.fb.db){
      ZL.state.tasks=ZL.state.tasks||{};
      ZL.state.tasks[id]={...(ZL.state.tasks[id]||{}),id,...nextPatch};
      ZL.emit("tasks");
      return Promise.resolve();
    }
    return taskRef(id).update(nextPatch);
  }

  function cleanupExpiredDoneTasks(){
    if(cleanupDoneRunning)return;
    const expired=allTasks().filter(isExpiredDone);
    if(!expired.length)return;
    cleanupDoneRunning=true;
    if(!ZL.fb.db){
      ZL.state.tasks=ZL.state.tasks||{};
      expired.forEach(task=>delete ZL.state.tasks[task.id]);
      cleanupDoneRunning=false;
      ZL.emit("tasks");
      ZL.emit("dashboard");
      return;
    }
    const updates={};
    expired.forEach(task=>{updates[task.id]=null;});
    ZL.fb.db.ref("zaklife/tasks").update(updates).finally(()=>{cleanupDoneRunning=false;});
  }

  function deleteTask(id){
    if(!confirm("Xóa task này?"))return;
    if(!ZL.fb.db){
      delete ZL.state.tasks[id];
      ZL.emit("tasks");
      return;
    }
    taskRef(id).remove();
  }

  function today(){return ZL.today();}

  function weekBounds(){
    const d=new Date(today()+"T00:00:00");
    const day=(d.getDay()+6)%7;
    const start=new Date(d);start.setDate(d.getDate()-day);
    const end=new Date(start);end.setDate(start.getDate()+6);
    return {start:ZL.dateKey(start),end:ZL.dateKey(end)};
  }

  function isOverdue(t){
    return t.dueDate&&t.dueDate<today()&&t.status!=="done";
  }

  function dueLabel(t){
    if(!t.dueDate)return "No date";
    if(t.dueDate===today())return "Today";
    if(t.dueDate===ZL.addDays(today(),1))return "Tomorrow";
    if(isOverdue(t))return "Overdue";
    return t.dueDate;
  }

  function addMonths(dateKey,months){
    const d=new Date(dateKey+"T00:00:00");
    d.setMonth(d.getMonth()+months);
    return ZL.dateKey(d);
  }

  function quickDueDate(type){
    if(type==="3d")return ZL.addDays(today(),3);
    if(type==="7d")return ZL.addDays(today(),7);
    if(type==="14d")return ZL.addDays(today(),14);
    if(type==="1m")return addMonths(today(),1);
    return today();
  }

  function filteredTasks(){
    const q=search.trim().toLowerCase();
    const bounds=weekBounds();
    return tasks().filter(t=>{
      if(categoryFilter&&t.category!==categoryFilter)return false;
      if(q&&!`${t.title||""} ${t.category||""}`.toLowerCase().includes(q))return false;
      if(filter==="today")return t.dueDate===today();
      if(filter==="week")return t.dueDate&&t.dueDate>=bounds.start&&t.dueDate<=bounds.end;
      if(filter==="overdue")return isOverdue(t);
      return true;
    });
  }

  function taskCard(t){
    const cat=CATEGORIES[t.category]||CATEGORIES.personal;
    const pri=PRIORITY[t.priority]||PRIORITY.medium;
    const progress=t.status==="done"?100:(t.status==="doing"?60:0);
    return `<article class="task-card ${t.status==="done"?"done":""}" draggable="true" data-task-id="${ZL.escape(t.id)}">
      <div class="task-card-top">
        <button class="drag-handle" title="Kéo thả">⋮⋮</button>
        <button class="task-title-btn" data-edit-task="${ZL.escape(t.id)}">${ZL.escape(t.title||"Task chưa đặt tên")}</button>
        <button class="star-toggle ${t.starred?"active":""}" data-star-task="${ZL.escape(t.id)}">★</button>
      </div>
      <div class="task-badge" style="--cat:${cat.color}">${cat.icon} ${cat.label}</div>
      <div class="task-meta">
        <span class="${isOverdue(t)?"danger-value":""}">${dueLabel(t)}</span>
        <span>Priority <i style="background:${pri.color}"></i></span>
      </div>
      <div class="task-due-actions" aria-label="Quick due date">
        ${[["3d","3D"],["7d","7D"],["14d","14D"],["1m","1M"]].map(([key,label])=>`<button type="button" data-task-due="${ZL.escape(t.id)}" data-due-shortcut="${key}">${label}</button>`).join("")}
      </div>
      ${t.status==="doing"?`<div class="task-progress"><span style="width:${progress}%"></span><em>${progress}%</em></div>`:""}
    </article>`;
  }

  function renderColumns(list){
    return `<div class="task-board">
      ${STATUS.map(col=>{
        const rows=list.filter(t=>t.status===col.key);
        return `<section class="task-column" data-drop-status="${col.key}">
          <div class="task-column-head"><h2>${col.title}</h2><span>${rows.length}</span></div>
          <div class="task-column-list">${rows.length?rows.map(taskCard).join(""):`<div class="empty slim">Trống</div>`}</div>
        </section>`;
      }).join("")}
    </div>`;
  }

  function renderFocus(list){
    const focus=list.filter(t=>t.starred&&t.status!=="done").slice(0,3);
    return `<div class="panel task-side-card">
      <div class="panel-title"><div><h2>Today's Focus</h2><p>${focus.length} starred priority</p></div></div>
      ${focus.length?focus.map(t=>`<label class="focus-row">
        <input type="checkbox" data-complete-focus="${ZL.escape(t.id)}">
        <span>${ZL.escape(t.title)}</span>
        <button data-star-task="${ZL.escape(t.id)}">★</button>
      </label>`).join(""):`<div class="empty slim">Chưa có focus</div>`}
    </div>`;
  }

  function renderStats(list){
    const bounds=weekBounds();
    const week=list.filter(t=>(t.dueDate&&t.dueDate>=bounds.start&&t.dueDate<=bounds.end)||String(t.updatedAt||"").slice(0,10)>=bounds.start);
    const done=week.filter(t=>t.status==="done").length;
    const overdue=list.filter(isOverdue).length;
    const pct=week.length?Math.round(done/week.length*100):0;
    return `<div class="panel task-side-card">
      <div class="panel-title"><div><h2>Stats</h2></div></div>
      <div class="task-stats">
        <div><strong class="accent-value">${done}</strong><span>completed this week</span><strong class="danger-value">${overdue}</strong><span>overdue</span></div>
        <div class="progress-ring" style="--pct:${pct}"><span>${pct}%</span></div>
      </div>
    </div>`;
  }

  function renderCategories(list){
    return `<div class="panel task-side-card">
      <div class="panel-title"><div><h2>Categories</h2></div></div>
      ${Object.entries(CATEGORIES).map(([key,cat])=>{
        const count=list.filter(t=>t.category===key&&t.status!=="done").length;
        return `<button class="category-row ${categoryFilter===key?"active":""}" data-category-filter="${key}">
          <span style="--cat:${cat.color}"></span>${cat.label}<em>${count}</em>
        </button>`;
      }).join("")}
    </div>`;
  }

  function renderModal(task){
    if(!task)return "";
    const isEdit=Boolean(task.id);
    const id=task.id||("task-"+Date.now());
    return `<div class="task-modal">
      <div class="task-modal-card">
        <div class="panel-title"><div><h2>${isEdit?"Sửa task":"New Task"}</h2><p>${isEdit?id:"Tạo công việc mới"}</p></div><button class="icon-btn" id="closeTaskModal">×</button></div>
        <input type="hidden" id="taskId" value="${ZL.escape(id)}">
        <div class="field"><label>Title</label><input id="taskTitle" value="${ZL.escape(task.title||"")}" placeholder="Nhập việc cần làm"></div>
        <div class="grid grid-2">
          <div class="field"><label>Category</label><select id="taskCategory">${Object.entries(CATEGORIES).map(([key,cat])=>`<option value="${key}" ${task.category===key?"selected":""}>${cat.icon} ${cat.label}</option>`).join("")}</select></div>
          <div class="field"><label>Due date</label><input type="date" id="taskDue" value="${ZL.escape(task.dueDate||"")}"></div>
        </div>
        <div class="field"><label>Priority</label><div class="priority-picker">
          ${Object.entries(PRIORITY).map(([key,p])=>`<button class="${(task.priority||"medium")===key?"active":""}" data-priority="${key}" style="--pri:${p.color}">${p.label}</button>`).join("")}
        </div></div>
        <label class="toggle-row"><input type="checkbox" id="taskStarred" ${task.starred?"checked":""}> Đưa vào Today's Focus</label>
        <div class="grid grid-2">
          <button class="btn primary" id="saveTaskBtn">Lưu task</button>
          <button class="btn danger" id="deleteTaskBtn" ${isEdit?"":"disabled"}>Xóa</button>
        </div>
      </div>
    </div>`;
  }

  function openModal(id){
    editingId=id||"new";
    render();
  }

  function modalTask(){
    if(!editingId)return null;
    if(editingId==="new")return {id:"",title:"",status:"todo",category:"personal",priority:"medium",dueDate:today(),starred:false};
    return tasks().find(t=>String(t.id)===String(editingId))||null;
  }

  function readTaskForm(){
    const active=document.querySelector(".priority-picker button.active");
    const id=document.getElementById("taskId").value;
    const old=tasks().find(t=>String(t.id)===String(id))||{};
    return {
      ...old,
      id,
      title:document.getElementById("taskTitle").value.trim()||"Task chưa đặt tên",
      category:document.getElementById("taskCategory").value,
      priority:active?.dataset.priority||"medium",
      dueDate:document.getElementById("taskDue").value,
      starred:document.getElementById("taskStarred").checked,
      status:old.status||"todo",
      createdAt:old.createdAt||ZL.nowIso(),
      updatedAt:ZL.nowIso()
    };
  }

  function saveTaskFromForm(){
    const task=readTaskForm();
    saveTask(task).then(()=>{
      editingId="";
      ZL.toast("Đã lưu task");
      render();
    });
  }

  function quickAdd(value){
    const title=String(value||"").trim();
    if(!title)return;
    const id="task-"+Date.now();
    saveTask({id,title,status:"todo",category:"personal",priority:"medium",dueDate:today(),starred:false,createdAt:ZL.nowIso(),updatedAt:ZL.nowIso()}).then(()=>{
      ZL.toast("Đã thêm task");
    });
  }

  function bind(root){
    root.querySelector("#newTaskBtn").onclick=()=>openModal("new");
    root.querySelectorAll("[data-task-filter]").forEach(btn=>btn.onclick=()=>{filter=btn.dataset.taskFilter;render();});
    root.querySelector("#taskSearch").oninput=e=>{search=e.target.value;render();};
    root.querySelector("#quickTaskInput").onkeydown=e=>{if(e.key==="Enter"){quickAdd(e.target.value);e.target.value="";}};
    root.querySelectorAll("[data-category-filter]").forEach(btn=>btn.onclick=()=>{
      categoryFilter=categoryFilter===btn.dataset.categoryFilter?"":btn.dataset.categoryFilter;
      render();
    });
    root.querySelectorAll("[data-edit-task]").forEach(btn=>btn.onclick=()=>openModal(btn.dataset.editTask));
    root.querySelectorAll("[data-star-task]").forEach(btn=>btn.onclick=e=>{
      e.stopPropagation();
      const id=btn.dataset.starTask;
      const t=tasks().find(x=>String(x.id)===String(id));
      if(t)patchTask(id,{starred:!t.starred});
    });
    root.querySelectorAll("[data-task-due]").forEach(btn=>btn.onclick=e=>{
      e.stopPropagation();
      const id=btn.dataset.taskDue;
      patchTask(id,{dueDate:quickDueDate(btn.dataset.dueShortcut)});
    });
    root.querySelectorAll("[data-complete-focus]").forEach(input=>input.onchange=()=>patchTask(input.dataset.completeFocus,{status:"done",completedAt:ZL.nowIso()}));
    root.querySelectorAll(".task-card").forEach(card=>{
      card.ondragstart=e=>{
        e.dataTransfer.setData("text/plain",card.dataset.taskId);
        card.classList.add("dragging");
      };
      card.ondragend=()=>card.classList.remove("dragging");
    });
    root.querySelectorAll(".task-column").forEach(col=>{
      col.ondragover=e=>{e.preventDefault();col.classList.add("drop-target");};
      col.ondragleave=()=>col.classList.remove("drop-target");
      col.ondrop=e=>{
        e.preventDefault();
        col.classList.remove("drop-target");
        const id=e.dataTransfer.getData("text/plain");
        if(id)patchTask(id,{status:col.dataset.dropStatus,completedAt:col.dataset.dropStatus==="done"?ZL.nowIso():null});
      };
    });
    if(editingId){
      root.querySelector("#closeTaskModal").onclick=()=>{editingId="";render();};
      root.querySelectorAll(".priority-picker button").forEach(btn=>btn.onclick=()=>{
        root.querySelectorAll(".priority-picker button").forEach(x=>x.classList.remove("active"));
        btn.classList.add("active");
      });
      root.querySelector("#saveTaskBtn").onclick=saveTaskFromForm;
      root.querySelector("#deleteTaskBtn").onclick=()=>{
        const id=document.getElementById("taskId").value;
        editingId="";
        deleteTask(id);
      };
    }
  }

  function render(){
    const root=document.getElementById("tasksRoot");
    if(!root)return;
    cleanupExpiredDoneTasks();
    const list=filteredTasks();
    root.innerHTML=`
      <div class="tasks-layout">
        <main class="tasks-main">
          <div class="tasks-top">
            <div>
              <h2>My Tasks</h2>
              <div class="task-tabs">
                ${[
                  ["all","All"],["today","Today"],["week","This Week"],["overdue","Overdue"]
                ].map(([key,label])=>`<button class="${filter===key?"active":""}" data-task-filter="${key}">${label}</button>`).join("")}
              </div>
            </div>
            <div class="tasks-actions">
              <input id="taskSearch" value="${ZL.escape(search)}" placeholder="Search">
              <button class="btn primary" id="newTaskBtn">+ New Task</button>
            </div>
          </div>
          ${renderColumns(list)}
        </main>
        <aside class="tasks-side">
          ${renderFocus(tasks())}
          <div class="panel task-side-card">
            <div class="panel-title"><div><h2>Quick Add</h2><p>Enter để thêm vào To Do</p></div></div>
            <input id="quickTaskInput" placeholder="Nhập task nhanh">
          </div>
          ${renderStats(tasks())}
          ${renderCategories(tasks())}
        </aside>
      </div>
      ${renderModal(modalTask())}`;
    bind(root);
  }

  ZL.modules.tasks={render};
  ZL.on("tasks",render);
})();
