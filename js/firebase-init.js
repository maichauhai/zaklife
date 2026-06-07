(function(){
  const FB_CONFIG={
    apiKey:"AIzaSyBpGeAlMcZtGTkt8JfuPSofArtTkx_XlJE",
    authDomain:"monstea-pos.firebaseapp.com",
    databaseURL:"https://monstea-pos-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId:"monstea-pos",
    storageBucket:"monstea-pos.firebasestorage.app",
    messagingSenderId:"742890598182",
    appId:"1:742890598182:web:ce67a7db065fe94b845be7"
  };

  const DEFAULT_HABITS=[
    {id:1,icon:"🐟",name:"Cho cá ăn",cycleDays:1},
    {id:2,icon:"🌱",name:"Tưới cây",cycleDays:2},
    {id:3,icon:"💧",name:"Uống 2L nước",cycleDays:1},
    {id:4,icon:"📚",name:"Đọc 20 phút",cycleDays:1},
    {id:5,icon:"🧘",name:"Thiền / thở",cycleDays:1}
  ];

  const ZL=window.ZL=window.ZL||{};
  ZL.events={};
  ZL.modules={};
  ZL.fb={db:null,storage:null,ready:false};
  ZL.zakDataLoaded=false;
  ZL.zakDataHasRemote=false;
  ZL.tasksLoaded=false;
  ZL.state={
    route:"dashboard",
    pos:{},
    zak:{entries:{},habits:[...DEFAULT_HABITS],habitLog:{},calNotes:{},ideas:[],nextIdeaId:1},
    content:{},
    tasks:{},
    quickdock:{},
    contentLog:{},
    agents:{},
    automation:{},
    wallet:{balances:null},
    nana:{},
    media:{},
    journal:{},
    vaultEncrypted:null
  };

  ZL.on=function(evt,fn){(ZL.events[evt]=ZL.events[evt]||[]).push(fn);};
  ZL.emit=function(evt,payload){(ZL.events[evt]||[]).forEach(fn=>{try{fn(payload);}catch(e){console.warn(e);}});};
  ZL.escape=function(value){
    return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  };
  ZL.dateKey=function(date){
    const d=date instanceof Date?new Date(date):new Date(date||Date.now());
    d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
    return d.toISOString().slice(0,10);
  };
  ZL.today=function(){return ZL.dateKey(new Date());};
  ZL.addDays=function(dateKey,days){
    const d=new Date((dateKey||ZL.today())+"T00:00:00");
    d.setDate(d.getDate()+days);
    return ZL.dateKey(d);
  };
  ZL.nowIso=function(){return new Date().toISOString();};
  ZL.formatDate=function(date){
    const d=date?new Date(date):new Date();
    return d.toLocaleDateString("vi-VN",{weekday:"short",day:"2-digit",month:"2-digit",year:"numeric"});
  };
  ZL.money=function(value){
    const n=Number(value)||0;
    return n.toLocaleString("vi-VN")+"đ";
  };
  ZL.normalizeList=function(value){
    if(Array.isArray(value))return value.filter(Boolean);
    if(value&&typeof value==="object")return Object.entries(value).map(([id,item])=>({id,...item})).filter(Boolean);
    return [];
  };
  ZL.invoiceKey=function(inv){
    if(!inv)return "";
    if(inv.syncId)return "sync:"+inv.syncId;
    const date=inv.date||"";
    const id=inv.id!=null?String(inv.id):"";
    if(date&&id)return `date-id:${date}:${id}`;
    const time=inv.time||inv.createdAt||inv._lastModified||"";
    const total=inv.total!=null?String(inv.total):"";
    return `${date}|${id}|${time}|${total}`;
  };
  ZL.mergeInvoices=function(){
    const map=new Map();
    Array.from(arguments).flat().filter(Boolean).forEach(inv=>{
      const key=ZL.invoiceKey(inv)||`anon:${map.size}`;
      const prev=map.get(key);
      const prevTs=Number(prev?._lastModified||prev?.createdAt||0);
      const nextTs=Number(inv?._lastModified||inv?.createdAt||0);
      if(!prev||nextTs>=prevTs)map.set(key,inv);
    });
    return [...map.values()];
  };
  ZL.lastDates=function(days){
    const out=[];
    const base=new Date(ZL.today()+"T00:00:00");
    for(let i=days-1;i>=0;i--){
      const d=new Date(base);
      d.setDate(d.getDate()-i);
      out.push(ZL.dateKey(d));
    }
    return out;
  };
  ZL.toast=function(message){
    const wrap=document.getElementById("toastWrap");
    if(!wrap)return;
    const node=document.createElement("div");
    node.className="toast";
    node.textContent=message;
    wrap.appendChild(node);
    setTimeout(()=>node.remove(),2800);
  };
  ZL.setSync=function(status,label){
    const el=document.getElementById("syncStatus");
    if(!el)return;
    el.innerHTML=`<span class="dot ${status||"muted"}"></span>${ZL.escape(label||status||"Offline")}`;
  };
  ZL.loadLocal=function(){
    try{
      const raw=localStorage.getItem("zaklife");
      if(raw){
        const local=JSON.parse(raw);
        ZL.state.zak={...ZL.state.zak,...local};
        if(!Array.isArray(ZL.state.zak.habits))ZL.state.zak.habits=[...DEFAULT_HABITS];
        if(!Array.isArray(ZL.state.zak.ideas))ZL.state.zak.ideas=[];
        if(!ZL.state.zak.nextIdeaId)ZL.state.zak.nextIdeaId=1;
      }
    }catch(e){console.warn(e);}
  };
  ZL.saveLocal=function(){
    localStorage.setItem("zaklife",JSON.stringify(ZL.state.zak));
  };

  function normalizeHabit(h){
    const habit=h&&typeof h==="object"?h:{};
    const {cycle,...rest}=habit;
    return {
      ...rest,
      name:String(habit.name||"").trim(),
      cycleDays:Math.max(1,Number(habit.cycleDays??cycle)||1)
    };
  }

  function normalizeHabitList(list){
    return (Array.isArray(list)?list:[]).filter(Boolean).map(normalizeHabit);
  }

  function isDefaultHabitList(list){
    const habits=normalizeHabitList(list);
    if(habits.length!==DEFAULT_HABITS.length)return false;
    return DEFAULT_HABITS.every(def=>habits.some(h=>String(h.id)===String(def.id)&&String(h.name||"")===def.name));
  }

  function mergeObjectMap(remote,local){
    return {...(remote&&typeof remote==="object"?remote:{}),...(local&&typeof local==="object"?local:{})};
  }

  function mergeNestedMap(remote,local){
    const out=mergeObjectMap(remote,{});
    Object.entries(local&&typeof local==="object"?local:{}).forEach(([key,value])=>{
      if(value&&typeof value==="object"&&!Array.isArray(value)){
        out[key]=mergeObjectMap(out[key],value);
      }else{
        out[key]=value;
      }
    });
    return out;
  }

  function mergeListById(remoteList,localList){
    const map=new Map();
    (Array.isArray(remoteList)?remoteList:[]).filter(Boolean).forEach(item=>map.set(String(item.id||item.name||map.size),item));
    (Array.isArray(localList)?localList:[]).filter(Boolean).forEach(item=>map.set(String(item.id||item.name||map.size),item));
    return [...map.values()];
  }

  function chooseHabits(remoteList,localList,replaceLocal){
    const remote=normalizeHabitList(remoteList);
    const local=normalizeHabitList(localList);
    if(replaceLocal&&local.length)return local;
    if(remote.length&&!isDefaultHabitList(remote))return remote;
    if(local.length&&!isDefaultHabitList(local))return local;
    if(remote.length)return remote;
    if(local.length)return local;
    return [...DEFAULT_HABITS];
  }

  function mergeZakForRead(remote,current){
    const next={...current,...remote};
    next.entries=mergeObjectMap(current.entries,remote.entries);
    next.habitLog=mergeNestedMap(current.habitLog,remote.habitLog);
    next.calNotes=mergeObjectMap(current.calNotes,remote.calNotes);
    next.habits=chooseHabits(remote.habits,current.habits,false);
    next.ideas=mergeListById(current.ideas,remote.ideas);
    next.nextIdeaId=Math.max(Number(current.nextIdeaId)||1,Number(remote.nextIdeaId)||1);
    return next;
  }

  function buildZakSyncPayload(remote,local,options={}){
    const payload={
      entries:mergeObjectMap(remote.entries,local.entries),
      habitLog:mergeNestedMap(remote.habitLog,local.habitLog),
      calNotes:mergeObjectMap(remote.calNotes,local.calNotes),
      habits:chooseHabits(remote.habits,local.habits,!!options.replaceHabits),
      ideas:mergeListById(remote.ideas,local.ideas),
      nextIdeaId:Math.max(Number(remote.nextIdeaId)||1,Number(local.nextIdeaId)||1),
      lastSync:ZL.nowIso()
    };
    return payload;
  }

  function backupZakData(remote){
    if(!remote||!Object.keys(remote).length||!ZL.fb.db)return Promise.resolve();
    const backup={...remote,backedUpAt:ZL.nowIso()};
    return ZL.fb.db.ref("zaklife/data_backups/"+ZL.today()).transaction(current=>current||backup).then(()=>{});
  }

  ZL.syncZakData=function(options={}){
    ZL.saveLocal();
    if(!ZL.fb.db)return Promise.resolve();
    if(!ZL.zakDataLoaded&&!options.allowBeforeRemote){
      if(!options.silent)ZL.setSync("syncing","Đợi dữ liệu Firebase");
      return Promise.resolve(false);
    }
    if(!options.silent)ZL.setSync("syncing","Đang đồng bộ");
    const ref=ZL.fb.db.ref("zaklife/data");
    return ref.once("value").then(snap=>{
      const remote=snap.val()||{};
      const payload=buildZakSyncPayload(remote,ZL.state.zak,options);
      ZL.state.zak={...ZL.state.zak,...payload};
      ZL.saveLocal();
      return backupZakData(remote).then(()=>ref.update(payload));
    }).then(()=>{
      if(!options.silent)ZL.setSync("online","Đã kết nối");
    }).catch(e=>{
      ZL.setSync("error","Lỗi đồng bộ");
      throw e;
    });
  };
  ZL.invoiceListForDate=function(date){
    const pos=ZL.state.pos||{};
    const archive=pos.invoiceArchive||{};
    const archived=ZL.normalizeList(archive[date]).filter(inv=>!inv.date||inv.date===date);
    if(date===ZL.today()){
      const live=ZL.normalizeList(pos.todayInvoices).filter(inv=>!inv.date||inv.date===date);
      return ZL.mergeInvoices(archived,live);
    }
    return archived;
  };
  ZL.activeInvoices=function(date){
    return ZL.invoiceListForDate(date).filter(i=>!i.cancelled&&!i._deleted);
  };
  ZL.revenueInvoices=function(date){
    return ZL.activeInvoices(date).filter(i=>i.method!=="staff");
  };
  ZL.invoiceStats=function(date){
    const pos=ZL.state.pos||{};
    const history=(pos.history||{})[date]||null;
    const invoices=ZL.revenueInvoices(date);
    const invoiceTotal=invoices.reduce((s,i)=>s+(Number(i.total)||0),0);
    const historyTotal=Number(history?.totalRevenue);
    const historyCount=Number(history?.invoices);
    const hasHistory=history&&Number.isFinite(historyTotal);
    const total=hasHistory?historyTotal:invoiceTotal;
    const count=hasHistory&&Number.isFinite(historyCount)?historyCount:invoices.length;
    const avg=count?Math.round(total/count):0;
    const itemMap={};
    const byId=history?.itemsSoldById&&Object.keys(history.itemsSoldById).length?history.itemsSoldById:null;
    if(byId){
      Object.entries(byId).forEach(([menuId,data])=>{
        const name=data?.name||String(menuId);
        itemMap[name]={name,qty:Number(data?.qty)||0,revenue:Number(data?.revenue)||0};
      });
    }else if(history?.itemsSold&&Object.keys(history.itemsSold).length){
      Object.entries(history.itemsSold).forEach(([name,data])=>{
        itemMap[name]={name,qty:Number(data?.qty)||0,revenue:Number(data?.revenue)||0};
      });
    }else{
      invoices.forEach(inv=>(inv.items||[]).forEach(item=>{
        const name=item.name||"Món";
        const qty=Number(item.qty)||1;
        const price=Number(item.price)||0;
        if(!itemMap[name])itemMap[name]={name,qty:0,revenue:0};
        itemMap[name].qty+=qty;
        itemMap[name].revenue+=price*qty;
      }));
    }
    const topItems=Object.values(itemMap).sort((a,b)=>b.qty-a.qty||b.revenue-a.revenue);
    const diff=hasHistory?historyTotal-invoiceTotal:0;
    return {invoices,total,avg,count,topItems,top:topItems[0]||null,history,hasHistory,historyTotal,invoiceTotal,diff};
  };
  ZL.contentPosts=function(){
    return ZL.normalizeList(ZL.state.content).map(p=>ZL.normalizePost(p));
  };
  ZL.normalizePost=function(p){
    const scheduled=p.scheduled_at||((p.scheduledDate||p.date||ZL.today())+"T"+(p.scheduledTime||p.time||"09:00"));
    const date=(p.scheduledDate||scheduled.slice(0,10)||ZL.today());
    const time=(p.scheduledTime||scheduled.slice(11,16)||"09:00");
    const photoUrl=p.photoUrl||p.image_url||p.photo_path||p.thumbUrl||"";
    const hasStoredOriginal=!!p.storagePath;
    const driveFileId=p.driveFileId||extractDriveFileId(photoUrl);
    const mediaProvider=p.mediaProvider||(driveFileId?"google_drive":(hasStoredOriginal?"firebase_storage":(photoUrl?"external_url":"")));
    return {
      ...p,
      id:p.id||("post-"+Date.now()),
      title:p.title||p.headline||"Bài chưa đặt tên",
      caption:p.caption||p.message||"",
      photoUrl,
      thumbUrl:p.thumbUrl||p.thumbnailUrl||(driveFileId?`https://drive.google.com/thumbnail?id=${encodeURIComponent(driveFileId)}&sz=w1000`:""),
      storagePath:p.storagePath||"",
      thumbStoragePath:p.thumbStoragePath||p.thumbnailStoragePath||"",
      mediaProvider,
      driveFileId,
      mediaStatus:p.mediaStatus||(hasStoredOriginal?"ready":(photoUrl?"external_url":"empty")),
      deleteOriginalAfterPost:p.deleteOriginalAfterPost!==false,
      reelEnabled:!!(p.reelEnabled||p.musicUrl||p.music_url),
      musicUrl:p.musicUrl||p.music_url||p.audio_url||"",
      reelScheduledTime:p.reelScheduledTime||p.reel_time||"19:15",
      reelStatus:p.reelStatus||"ready",
      scheduledDate:date,
      scheduledTime:time,
      scheduled_at:scheduled,
      status:p.status||"draft"
    };
  };
  function extractDriveFileId(url){
    const raw=String(url||"").trim();
    const patterns=[
      /drive\.google\.com\/file\/d\/([^/]+)/i,
      /drive\.google\.com\/open\?id=([^&]+)/i,
      /drive\.google\.com\/uc\?[^#]*id=([^&]+)/i,
      /[?&]id=([^&]+)/i
    ];
    for(const pattern of patterns){
      const match=raw.match(pattern);
      if(match&&match[1])return decodeURIComponent(match[1]);
    }
    return "";
  }
  ZL.initFirebase=function(){
    if(!window.firebase){
      ZL.setSync("error","Thiếu Firebase SDK");
      return Promise.resolve(false);
    }
    try{
      if(!firebase.apps.length)firebase.initializeApp(FB_CONFIG);
      ZL.fb.db=firebase.database();
      ZL.fb.storage=firebase.storage();
      ZL.fb.ready=true;
      ZL.fb.db.ref(".info/connected").on("value",snap=>{
        ZL.setSync(snap.val()?"online":"error",snap.val()?"Đã kết nối":"Mất kết nối");
      });
      ZL.fb.db.ref("state").on("value",snap=>{
        ZL.state.pos=snap.val()||{};
        ZL.emit("pos");
        ZL.emit("dashboard");
      });
      ZL.fb.db.ref("zaklife/data").on("value",snap=>{
        const remote=snap.val()||{};
        ZL.zakDataLoaded=true;
        ZL.zakDataHasRemote=snap.exists();
        ZL.state.zak=mergeZakForRead(remote,ZL.state.zak);
        if(!Array.isArray(ZL.state.zak.habits))ZL.state.zak.habits=[...DEFAULT_HABITS];
        if(!Array.isArray(ZL.state.zak.ideas))ZL.state.zak.ideas=[];
        if(!ZL.state.zak.nextIdeaId)ZL.state.zak.nextIdeaId=1;
        ZL.saveLocal();
        ZL.emit("zak");
        ZL.emit("dashboard");
      });
      ZL.fb.db.ref("zaklife/content-calendar").on("value",snap=>{
        ZL.state.content=snap.val()||{};
        ZL.emit("content");
        ZL.emit("dashboard");
      });
      ZL.fb.db.ref("zaklife/tasks").on("value",snap=>{
        ZL.state.tasks=snap.val()||{};
        ZL.tasksLoaded=true;
        ZL.emit("tasks");
        ZL.emit("dashboard");
      });
      ZL.fb.db.ref("zaklife/quickdock").on("value",snap=>{
        ZL.state.quickdock=snap.val()||{};
        ZL.emit("quickdock");
        ZL.emit("dashboard");
      });
      ZL.fb.db.ref("zaklife/agents").on("value",snap=>{
        ZL.state.agents=snap.val()||{};
        ZL.emit("agents");
        ZL.emit("dashboard");
      });
      ZL.fb.db.ref("zaklife/automation").on("value",snap=>{
        ZL.state.automation=snap.val()||{};
        ZL.emit("automation");
        ZL.emit("dashboard");
      });
      ZL.fb.db.ref("zaklife/nana_messages").on("value",snap=>{
        ZL.state.nana=snap.val()||{};
        ZL.emit("nana");
        ZL.emit("dashboard");
      });
      ZL.fb.db.ref("zaklife/wallet/balances/current").on("value",snap=>{
        ZL.state.wallet.balances=snap.val()||null;
        ZL.emit("wallet");
        ZL.emit("dashboard");
      });
      ZL.fb.db.ref("zaklife/vault_encrypted").on("value",snap=>{
        ZL.state.vaultEncrypted=snap.val()||null;
        const remote=ZL.state.vaultEncrypted;
        if(remote&&remote.data&&!localStorage.getItem("zkv")){
          localStorage.setItem("zkv",remote.data);
          if(remote.ts)localStorage.setItem("zkv_ts",remote.ts);
        }
        ZL.emit("vault");
      });
      return Promise.resolve(true);
    }catch(e){
      console.warn(e);
      ZL.setSync("error","Firebase lỗi");
      return Promise.resolve(false);
    }
  };
})();
