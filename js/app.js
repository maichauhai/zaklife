(function(){
  const ZL=window.ZL;
  const ROUTES={
    crm:{title:"CRM Leads",subtitle:"Quan ly lead, deal, du an"},
    dashboard:{title:"Dashboard",subtitle:"Tổng quan hôm nay"},
    pos:{title:"Monstea POS",subtitle:"Theo dõi quán từ xa"},
    content:{title:"Content Manager",subtitle:"Lịch bài fanpage"},
    tasks:{title:"Tasks",subtitle:"Kanban công việc"},
    journal:{title:"Journal & Habits",subtitle:"Nhật ký và thói quen"},
    health:{title:"Health Tracker",subtitle:"Số đo body, ảnh tiến trình và PR gym"},
    ideas:{title:"Ideas",subtitle:"Inbox ý tưởng"},
    vault:{title:"Vault",subtitle:"Dữ liệu riêng"},
    quickdock:{title:"Quick Dock",subtitle:"Link, lệnh và ghi chú nhanh"},
    settings:{title:"Settings",subtitle:"Cấu hình"}
  };
  const NAV_ORDER_KEY="zaklifeNavOrder";
  let navMeta=null;
  let draggedRoute="";

  function setDate(){
    const el=document.getElementById("currentDate");
    if(el)el.textContent=new Date().toLocaleString("vi-VN",{weekday:"short",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
  }

  function routeFromHash(){
    const hash=location.hash.replace("#","");
    return ROUTES[hash]?hash:"dashboard";
  }

  function readNavMeta(){
    if(navMeta)return navMeta;
    const nav=document.querySelector(".nav-group");
    navMeta={};
    let section="";
    nav?.querySelectorAll(".nav-section,.nav-item").forEach(el=>{
      if(el.classList.contains("nav-section")){
        section=el.textContent.trim();
        return;
      }
      const route=el.dataset.route;
      if(!route||!ROUTES[route])return;
      navMeta[route]={html:el.innerHTML,section};
    });
    return navMeta;
  }

  function getNavOrder(){
    const meta=readNavMeta();
    const defaults=Object.keys(meta);
    try{
      const saved=JSON.parse(localStorage.getItem(NAV_ORDER_KEY)||"[]");
      const valid=Array.isArray(saved)?saved.filter(route=>meta[route]):[];
      defaults.forEach(route=>{if(!valid.includes(route))valid.push(route);});
      return valid;
    }catch(e){
      return defaults;
    }
  }

  function saveNavOrder(order){
    localStorage.setItem(NAV_ORDER_KEY,JSON.stringify(order));
  }

  function moveNavItem(sourceRoute,targetRoute,placeAfter){
    if(!sourceRoute||!targetRoute||sourceRoute===targetRoute)return;
    const order=getNavOrder().filter(route=>route!==sourceRoute);
    const targetIndex=order.indexOf(targetRoute);
    if(targetIndex<0)return;
    order.splice(targetIndex+(placeAfter?1:0),0,sourceRoute);
    saveNavOrder(order);
    renderNav();
  }

  function bindNavItems(){
    document.querySelectorAll(".nav-item").forEach(btn=>{
      btn.addEventListener("click",()=>renderRoute(btn.dataset.route));
      btn.addEventListener("dragstart",e=>{
        draggedRoute=btn.dataset.route;
        btn.classList.add("dragging");
        e.dataTransfer.effectAllowed="move";
        e.dataTransfer.setData("text/plain",draggedRoute);
      });
      btn.addEventListener("dragover",e=>{
        e.preventDefault();
        btn.classList.add("drag-over");
        e.dataTransfer.dropEffect="move";
      });
      btn.addEventListener("dragleave",()=>btn.classList.remove("drag-over"));
      btn.addEventListener("drop",e=>{
        e.preventDefault();
        btn.classList.remove("drag-over");
        const rect=btn.getBoundingClientRect();
        const placeAfter=e.clientY>rect.top+rect.height/2;
        moveNavItem(e.dataTransfer.getData("text/plain")||draggedRoute,btn.dataset.route,placeAfter);
      });
      btn.addEventListener("dragend",()=>{
        draggedRoute="";
        document.querySelectorAll(".nav-item").forEach(item=>item.classList.remove("dragging","drag-over"));
      });
    });
  }

  function renderNav(){
    const nav=document.querySelector(".nav-group");
    if(!nav)return;
    const meta=readNavMeta();
    const activeRoute=ZL.state.route||routeFromHash();
    let currentSection="";
    nav.innerHTML=getNavOrder().map(route=>{
      const item=meta[route];
      if(!item)return"";
      const section=item.section||"";
      const heading=section&&section!==currentSection?`<div class="nav-section">${section}</div>`:"";
      currentSection=section;
      return `${heading}<button class="nav-item ${activeRoute===route?"active":""}" data-route="${route}" draggable="true"><span class="nav-grip" aria-hidden="true">⋮⋮</span>${item.html}</button>`;
    }).join("");
    bindNavItems();
  }

  function renderRoute(route,updateHash=true){
    const meta=ROUTES[route]||ROUTES.dashboard;
    const previousRoute=ZL.state.route;
    document.getElementById("pageTitle").textContent=meta.title;
    document.getElementById("pageSubtitle").textContent=meta.subtitle;
    document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id==="view-"+route));
    document.querySelectorAll(".nav-item").forEach(n=>n.classList.toggle("active",n.dataset.route===route));
    ZL.state.route=route;
    if(previousRoute!==route)ZL.emit("route-change",{from:previousRoute,to:route});
    if(updateHash&&location.hash.replace("#","")!==route)history.replaceState(null,"","#"+route);
    if(ZL.modules[route]?.render)ZL.modules[route].render();
    document.getElementById("sidebar")?.classList.remove("open");
  }

  ZL.switchRoute=renderRoute;

  function initNav(){
    renderNav();
    document.getElementById("menuToggle").addEventListener("click",()=>document.getElementById("sidebar").classList.toggle("open"));
    document.addEventListener("click",e=>{
      const sidebar=document.getElementById("sidebar");
      const toggle=document.getElementById("menuToggle");
      if(window.innerWidth>768||!sidebar.classList.contains("open"))return;
      if(sidebar.contains(e.target)||toggle.contains(e.target))return;
      sidebar.classList.remove("open");
    });
  }

  function renderAll(){
    Object.values(ZL.modules).forEach(mod=>{if(mod&&typeof mod.render==="function")mod.render();});
    renderRoute(ZL.state.route||"dashboard");
  }

  document.addEventListener("DOMContentLoaded",()=>{
    if(localStorage.getItem("zaklifeTheme")==="light")document.body.classList.add("light");
    ZL.loadLocal();
    initNav();
    setDate();
    setInterval(setDate,30000);
    ZL.state.route=routeFromHash();
    window.addEventListener("hashchange",()=>renderRoute(routeFromHash(),false));
    renderAll();
    ZL.initFirebase().then(()=>renderAll());
  });
})();
