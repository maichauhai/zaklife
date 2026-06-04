(function(){
  const ZL=window.ZL;
  const ROUTES={
    dashboard:{title:"Dashboard",subtitle:"Tổng quan hôm nay"},
    pos:{title:"Monstea POS",subtitle:"Theo dõi quán từ xa"},
    content:{title:"Content Manager",subtitle:"Lịch bài fanpage"},
    tasks:{title:"Tasks",subtitle:"Kanban công việc"},
    journal:{title:"Journal & Habits",subtitle:"Nhật ký và thói quen"},
    ideas:{title:"Ideas",subtitle:"Inbox ý tưởng"},
    vault:{title:"Vault",subtitle:"Dữ liệu riêng"},
    quickdock:{title:"Quick Dock",subtitle:"Link, lệnh và ghi chú nhanh"},
    settings:{title:"Settings",subtitle:"Cấu hình"}
  };

  function setDate(){
    const el=document.getElementById("currentDate");
    if(el)el.textContent=new Date().toLocaleString("vi-VN",{weekday:"short",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
  }

  function routeFromHash(){
    const hash=location.hash.replace("#","");
    return ROUTES[hash]?hash:"dashboard";
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
    document.querySelectorAll(".nav-item").forEach(btn=>btn.addEventListener("click",()=>renderRoute(btn.dataset.route)));
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
