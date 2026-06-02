(function(){
  const ZL=window.ZL;
  let weekStart=getMonday(new Date());
  let selectedId="";
  const HOURS=Array.from({length:13},(_,i)=>8+i);

  function getMonday(date){
    const d=new Date(date);
    const day=(d.getDay()+6)%7;
    d.setDate(d.getDate()-day);
    d.setHours(0,0,0,0);
    return d;
  }

  function dateKey(date){
    return ZL.dateKey(date);
  }

  function weekDates(){
    return Array.from({length:7},(_,i)=>{
      const d=new Date(weekStart);
      d.setDate(d.getDate()+i);
      return dateKey(d);
    });
  }

  function postForForm(){
    if(selectedId){
      const existing=ZL.contentPosts().find(p=>String(p.id)===String(selectedId));
      if(existing)return existing;
    }
    return {id:"",title:"",caption:"",photoUrl:"",scheduledDate:ZL.today(),scheduledTime:"09:00",status:"draft"};
  }

  function statusText(status){
    return ({draft:"Draft",scheduled:"Scheduled",approved:"Approved",posted:"Posted"})[status]||status||"Draft";
  }

  function eventTop(time){
    const [h,m]=String(time||"09:00").split(":").map(Number);
    const hour=Number.isFinite(h)?h:9;
    const minute=Number.isFinite(m)?m:0;
    return Math.max(0,Math.min(12*64,((hour-8)*64)+(minute/60*64)));
  }

  function renderEventsForDate(date, items){
    let nextAvailableTop=0;
    return (items||[]).sort((a,b)=>a.scheduledTime.localeCompare(b.scheduledTime)).map(p=>{
      const baseTop=eventTop(p.scheduledTime)+6;
      const top=Math.max(baseTop,nextAvailableTop);
      nextAvailableTop=top+78;
      return `<button class="content-event ${ZL.escape(p.status)}" data-post-id="${ZL.escape(p.id)}" style="top:${top}px">
        <strong>${ZL.escape(p.scheduledTime)}</strong>
        <span>${ZL.escape(p.title)}</span>
        <em>${statusText(p.status)}</em>
      </button>`;
    }).join("");
  }

  function renderCalendar(posts){
    const dates=weekDates();
    const byDate={};
    posts.forEach(p=>{
      if(!byDate[p.scheduledDate])byDate[p.scheduledDate]=[];
      byDate[p.scheduledDate].push(p);
    });
    const dayNames=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
    return `<div class="content-calendar-wrap">
      <div class="content-calendar-head">
        <div></div>
        ${dates.map((date,i)=>`<div class="content-day-head ${date===ZL.today()?"today":""}">
          <strong>${dayNames[i]}</strong>
          <span>${date.slice(5)}</span>
        </div>`).join("")}
      </div>
      <div class="content-calendar-body">
        <div class="time-axis">
          ${HOURS.map(h=>`<div>${String(h).padStart(2,"0")}:00</div>`).join("")}
        </div>
        ${dates.map(date=>`<div class="content-day-lane" data-date="${date}">
          ${HOURS.map(()=>`<span class="hour-line"></span>`).join("")}
          ${renderEventsForDate(date,byDate[date])}
        </div>`).join("")}
      </div>
    </div>`;
  }

  function renderForm(post){
    return `<div class="panel content-form-panel">
      <div class="panel-title"><div><h2>${post.id?"Sửa bài":"Create New Post"}</h2><p>Bài approved sẽ để n8n xử lý</p></div></div>
      <input type="hidden" id="contentId" value="${ZL.escape(post.id)}">
      <div class="field"><label>Title</label><input id="contentTitle" value="${ZL.escape(post.title)}" placeholder="Exploring New Product Features"></div>
      <div class="field"><label>Caption</label><textarea id="contentCaption" placeholder="Excited to share...">${ZL.escape(post.caption)}</textarea></div>
      <div class="upload-box">
        <div>▧</div>
        <span>Add Image/Video</span>
        <input id="contentPhoto" value="${ZL.escape(post.photoUrl)}" placeholder="URL ảnh public">
      </div>
      <div class="grid grid-2">
        <div class="field"><label>Schedule Date</label><input type="date" id="contentDate" value="${ZL.escape(post.scheduledDate)}"></div>
        <div class="field"><label>Time</label><input type="time" id="contentTime" value="${ZL.escape(post.scheduledTime)}"></div>
      </div>
      <div class="field"><label>Status</label><select id="contentStatus">
        ${["draft","scheduled","approved","posted"].map(s=>`<option value="${s}" ${post.status===s?"selected":""}>${statusText(s)}</option>`).join("")}
      </select></div>
      <div class="grid grid-2">
        <button class="btn primary" id="saveContentBtn">${post.id?"Lưu bài":"Schedule Post"}</button>
        <button class="btn danger" id="deleteContentBtn" ${post.id?"":"disabled"}>Xóa</button>
      </div>
    </div>`;
  }

  function readForm(){
    const id=document.getElementById("contentId").value||("post-"+Date.now());
    const title=document.getElementById("contentTitle").value.trim()||"Bài chưa đặt tên";
    const caption=document.getElementById("contentCaption").value.trim();
    const photoUrl=document.getElementById("contentPhoto").value.trim();
    const scheduledDate=document.getElementById("contentDate").value||ZL.today();
    const scheduledTime=document.getElementById("contentTime").value||"09:00";
    const status=document.getElementById("contentStatus").value||"draft";
    return {
      id,title,caption,message:caption,photoUrl,
      photo_path:photoUrl,image_url:photoUrl,
      scheduledDate,scheduledTime,
      scheduled_at:`${scheduledDate}T${scheduledTime}:00`,
      status,updated_at:ZL.nowIso()
    };
  }

  function savePost(){
    const post=readForm();
    if(!ZL.fb.db){ZL.toast("Chưa kết nối Firebase, chưa thể lưu content");return;}
    ZL.fb.db.ref("zaklife/content-calendar/"+post.id).set(post).then(()=>{
      selectedId=post.id;
      ZL.toast("Đã lưu bài content");
    }).catch(e=>ZL.toast("Lỗi lưu: "+e.message));
  }

  function deletePost(){
    const id=document.getElementById("contentId").value;
    if(!id||!ZL.fb.db)return;
    ZL.fb.db.ref("zaklife/content-calendar/"+id).remove().then(()=>{
      selectedId="";
      ZL.toast("Đã xóa bài");
      render();
    });
  }

  function render(){
    const root=document.getElementById("contentRoot");
    if(!root)return;
    const posts=ZL.contentPosts();
    const monthPosts=posts.filter(p=>p.scheduledDate.slice(0,7)===ZL.today().slice(0,7));
    const scheduled=posts.filter(p=>p.status==="scheduled").length;
    const approved=posts.filter(p=>p.status==="approved").length;
    const formPost=postForForm();
    root.innerHTML=`
      <div class="content-layout">
        <div class="content-main">
          <div class="content-header-row">
            <div>
              <h2>Content Calendar</h2>
              <div class="content-week-nav">
                <button class="btn sm" id="prevWeek">‹</button>
                <span>${weekDates()[0]} - ${weekDates()[6]}</span>
                <button class="btn sm" id="nextWeek">›</button>
              </div>
            </div>
            <div class="content-metrics">
              <div><strong>${monthPosts.length}</strong><span>this month</span></div>
              <div><strong>${scheduled}</strong><span>scheduled</span></div>
              <div><strong>${approved}</strong><span>approved</span></div>
            </div>
          </div>
          ${renderCalendar(posts)}
        </div>
        ${renderForm(formPost)}
      </div>`;
    document.getElementById("prevWeek").onclick=()=>{weekStart.setDate(weekStart.getDate()-7);render();};
    document.getElementById("nextWeek").onclick=()=>{weekStart.setDate(weekStart.getDate()+7);render();};
    document.getElementById("saveContentBtn").onclick=savePost;
    document.getElementById("deleteContentBtn").onclick=deletePost;
    root.querySelectorAll(".content-event").forEach(el=>el.onclick=e=>{
      e.stopPropagation();
      selectedId=el.dataset.postId;
      render();
    });
    root.querySelectorAll(".content-day-lane").forEach(el=>el.onclick=e=>{
      if(e.target.closest(".content-event"))return;
      selectedId="";
      render();
      document.getElementById("contentDate").value=el.dataset.date;
    });
  }

  ZL.modules.content={render};
  ZL.on("content",render);
})();
