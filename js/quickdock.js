(function(){
  const ZL=window.ZL;
  let tab="links";
  let query="";
  let modal=null;

  const LINK_CATEGORIES={
    dev:{label:"Dev Tools",icon:"🛠️"},
    monstea:{label:"Monstea",icon:"🍵"},
    trading:{label:"Trading",icon:"📈"},
    personal:{label:"Personal",icon:"🎮"}
  };
  const COMMAND_CATEGORIES={
    dev:{label:"Dev",color:"#f59e0b"},
    bot:{label:"Bot",color:"#a855f7"},
    deploy:{label:"Deploy",color:"#22c55e"},
    other:{label:"Other",color:"#64748b"}
  };
  const PIN_COLORS={
    green:"#10b981",
    blue:"#60a5fa",
    purple:"#c084fc",
    yellow:"#facc15",
    red:"#f87171"
  };

  const DEFAULT_LINKS=[
    {id:"link-firebase",name:"Firebase Console",url:"https://console.firebase.google.com/",category:"dev"},
    {id:"link-github",name:"GitHub",url:"https://github.com/maichauhai/zaklife",category:"dev"},
    {id:"link-vercel",name:"Vercel",url:"https://vercel.com/",category:"dev"},
    {id:"link-cloudflare",name:"Cloudflare",url:"https://dash.cloudflare.com/",category:"dev"},
    {id:"link-monstea-pos",name:"Monstea POS",url:"https://maichauhai.github.io/monstea-pos/",category:"monstea"},
    {id:"link-facebook",name:"Facebook Fanpage",url:"https://www.facebook.com/",category:"monstea"},
    {id:"link-maps",name:"Google Maps Listing",url:"https://www.google.com/maps",category:"monstea"},
    {id:"link-canva",name:"Canva",url:"https://www.canva.com/",category:"monstea"},
    {id:"link-tradingview",name:"TradingView",url:"https://www.tradingview.com/",category:"trading"},
    {id:"link-exness",name:"Exness",url:"https://my.exness.com/",category:"trading"},
    {id:"link-coingecko",name:"CoinGecko",url:"https://www.coingecko.com/",category:"trading"},
    {id:"link-telegram",name:"Telegram Web",url:"https://web.telegram.org/",category:"trading"},
    {id:"link-youtube",name:"YouTube",url:"https://www.youtube.com/",category:"personal"},
    {id:"link-chatgpt",name:"ChatGPT",url:"https://chatgpt.com/",category:"personal"},
    {id:"link-discord",name:"Discord",url:"https://discord.com/app",category:"personal"},
    {id:"link-drive",name:"Google Drive",url:"https://drive.google.com/",category:"personal"}
  ];
  const DEFAULT_COMMANDS=[
    {id:"cmd-longnhi",title:"SSH Long Nhi",command:"ssh -o StrictHostKeyChecking=no -p 38900 Zak@e1.chiasegpu.vn",description:"Kết nối VPS Long Nhi",category:"dev"},
    {id:"cmd-nana",title:"SSH Nana",command:"ssh -o StrictHostKeyChecking=no nana@103.241.43.184",description:"Kết nối VPS Nana",category:"dev"},
    {id:"cmd-bangchien-status",title:"Bang Chiến Status",command:"ssh -p 38900 Zak@e1.chiasegpu.vn \"curl -s http://127.0.0.1:3456/status\"",description:"Kiểm tra trạng thái Bang Chiến",category:"bot"},
    {id:"cmd-bangchien-poll",title:"Bang Chiến Poll",command:"ssh -p 38900 Zak@e1.chiasegpu.vn \"curl -s http://127.0.0.1:3456/create-poll\"",description:"Tạo poll Bang Chiến",category:"bot"},
    {id:"cmd-nana-health",title:"Check Nana Health",command:"ssh nana@103.241.43.184 \"systemctl --user status openclaw-gateway.service\"",description:"Kiểm tra gateway Nana",category:"bot"},
    {id:"cmd-git-push",title:"Git Push Kyoko",command:"cd Kyoko && git add -A && git commit -m \"update\" && git push",description:"Lệnh push nhanh khi cần",category:"deploy"}
  ];
  const DEFAULT_PINS=[
    {id:"pin-wifi",title:"WiFi Quán",content:"Lưu WiFi quán, IP máy phụ, hotline nhà cung cấp ở đây.",color:"green"},
    {id:"pin-firebase",title:"Firebase Project ID",content:"Ghi nhanh project ID, database URL, đường dẫn quan trọng.",color:"purple"},
    {id:"pin-vps",title:"IP Máy Phụ",content:"Lưu IP nội bộ, VPS, port service hay dùng.",color:"blue"}
  ];

  function qd(){
    return ZL.state.quickdock||{};
  }

  function defaults(type){
    if(type==="links")return DEFAULT_LINKS;
    if(type==="commands")return DEFAULT_COMMANDS;
    return DEFAULT_PINS;
  }

  function rows(type){
    const remote=qd()[type]||{};
    const map=new Map(defaults(type).map(item=>[item.id,{...item}]));
    Object.entries(remote).forEach(([id,item])=>{
      map.set(id,{...(map.get(id)||{}),id,...item});
    });
    return [...map.values()].filter(item=>!item._deleted);
  }

  function itemBy(type,id){
    return rows(type).find(item=>String(item.id)===String(id));
  }

  function itemRef(type,id){
    return ZL.fb.db?.ref("zaklife/quickdock/"+type+"/"+id);
  }

  function patchItem(type,id,patch){
    if(!ZL.fb.db){
      ZL.state.quickdock=ZL.state.quickdock||{};
      ZL.state.quickdock[type]=ZL.state.quickdock[type]||{};
      ZL.state.quickdock[type][id]={...(ZL.state.quickdock[type][id]||{}),id,...patch,updatedAt:ZL.nowIso()};
      ZL.emit("quickdock");
      return Promise.resolve();
    }
    return itemRef(type,id).update({...patch,updatedAt:ZL.nowIso()});
  }

  function saveItem(type,item){
    const payload={...item,updatedAt:ZL.nowIso()};
    if(!payload.createdAt)payload.createdAt=ZL.nowIso();
    if(!ZL.fb.db){
      ZL.state.quickdock=ZL.state.quickdock||{};
      ZL.state.quickdock[type]=ZL.state.quickdock[type]||{};
      ZL.state.quickdock[type][payload.id]=payload;
      ZL.emit("quickdock");
      return Promise.resolve();
    }
    return itemRef(type,payload.id).set(payload);
  }

  function deleteItem(type,id){
    if(!confirm("Xóa mục này?"))return;
    patchItem(type,id,{_deleted:true}).then(()=>ZL.toast("Đã xóa"));
  }

  function bump(type,item){
    return patchItem(type,item.id,{clickCount:(Number(item.clickCount)||0)+1,lastUsedAt:ZL.nowIso()});
  }

  function normalizeUrl(url){
    const raw=String(url||"").trim();
    if(!raw)return "";
    if(/^(https?:|mailto:|tel:)/i.test(raw))return raw;
    return "https://"+raw;
  }

  function domain(url){
    try{return new URL(normalizeUrl(url)).hostname.replace(/^www\./,"");}
    catch(e){return String(url||"").replace(/^https?:\/\//,"").split("/")[0]||"link";}
  }

  function favicon(url){
    return "https://www.google.com/s2/favicons?domain="+encodeURIComponent(domain(url))+"&sz=32";
  }

  function copyCommand(item){
    navigator.clipboard?.writeText(item.command||"").then(()=>ZL.toast("Đã copy lệnh"));
    bump("commands",item);
  }

  function runItem(type,item){
    if(type==="links"){
      const url=normalizeUrl(item.url);
      if(url)window.open(url,"_blank","noopener");
      bump(type,item);
    }else if(type==="commands"){
      copyCommand(item);
    }else{
      modal={type:"pins",item};
      render();
    }
  }

  function allSearchItems(){
    return [
      ...rows("links").map(item=>({type:"links",item,title:item.name,detail:item.url||"",label:"Link"})),
      ...rows("commands").map(item=>({type:"commands",item,title:item.title,detail:item.command||"",label:"Command"})),
      ...rows("pins").map(item=>({type:"pins",item,title:item.title,detail:item.content||"",label:"Pin"}))
    ];
  }

  function matches(item){
    const q=query.trim().toLowerCase();
    if(!q)return true;
    return `${item.name||""} ${item.title||""} ${item.url||""} ${item.command||""} ${item.description||""} ${item.content||""} ${item.category||""}`.toLowerCase().includes(q);
  }

  function frequentItems(){
    const items=[
      ...rows("links").map(item=>({type:"links",item,title:item.name})),
      ...rows("commands").map(item=>({type:"commands",item,title:item.title}))
    ].sort((a,b)=>(Number(b.item.clickCount)||0)-(Number(a.item.clickCount)||0));
    const used=items.filter(row=>Number(row.item.clickCount)>0);
    return (used.length?used:items).slice(0,5);
  }

  function searchResults(){
    const q=query.trim().toLowerCase();
    if(q.length<2)return [];
    return allSearchItems().filter(row=>`${row.title||""} ${row.detail||""}`.toLowerCase().includes(q)).slice(0,12);
  }

  function renderTop(){
    const frequent=frequentItems();
    const results=searchResults();
    const action=tab==="links"
      ?`<button class="btn primary quickdock-top-add" data-qd-add="links">+ Add Link</button>`
      :tab==="commands"
        ?`<button class="btn primary quickdock-top-add" data-qd-add="commands">+ Add Command</button>`
        :`<button class="btn primary quickdock-top-add" data-qd-add="pins">+ Add Note</button>`;
    return `<div class="quickdock-top">
      <div class="quickdock-search">
        <span>⌕</span>
        <input id="qdSearch" value="${ZL.escape(query)}" placeholder="Tìm link, lệnh, ghi chú...">
        ${query?`<button class="icon-btn" id="qdClearSearch">×</button>`:""}
      </div>
      <div class="quickdock-frequent">
        <h2>⭐ Frequently Used</h2>
        <div class="qd-chip-row">
          ${frequent.map(row=>`<button class="qd-chip" data-qd-run="${row.type}:${ZL.escape(row.item.id)}">${row.type==="commands"?"⌘":"🔗"} ${ZL.escape(row.title||"Mục nhanh")}</button>`).join("")}
        </div>
      </div>
      ${results.length?`<div class="quickdock-results">
        ${results.map(row=>`<button class="qd-result" data-qd-run="${row.type}:${ZL.escape(row.item.id)}">
          <span>${ZL.escape(row.label)}</span>
          <strong>${ZL.escape(row.title||"Không tên")}</strong>
          <em>${ZL.escape(String(row.detail||"").slice(0,120))}</em>
        </button>`).join("")}
      </div>`:""}
      <div class="quickdock-tabbar">
        <div class="quickdock-tabs">
          <button class="${tab==="links"?"active":""}" data-qd-tab="links">🔗 Links</button>
          <button class="${tab==="commands"?"active":""}" data-qd-tab="commands">📋 Commands</button>
          <button class="${tab==="pins"?"active":""}" data-qd-tab="pins">📌 Pinboard</button>
        </div>
        <div class="quickdock-top-actions">${action}</div>
      </div>
    </div>`;
  }

  function renderLinks(){
    const grouped={dev:[],monstea:[],trading:[],personal:[]};
    rows("links").filter(matches).forEach(item=>{
      const key=grouped[item.category]?item.category:"personal";
      grouped[key].push(item);
    });
    return `<div class="quickdock-section">
      ${Object.entries(LINK_CATEGORIES).map(([key,cat])=>`<section class="bookmark-group">
        <h2>${cat.icon} ${cat.label}</h2>
        <div class="bookmark-grid">
          ${grouped[key].length?grouped[key].map(link=>`<article class="bookmark-card" data-qd-run="links:${ZL.escape(link.id)}">
            <img src="${favicon(link.url)}" alt="">
            <div>
              <strong>${ZL.escape(link.name||"Link")}</strong>
              <span>${ZL.escape(domain(link.url))}</span>
            </div>
            <div class="card-actions">
              <button data-qd-edit="links:${ZL.escape(link.id)}">⋮</button>
              <button data-qd-delete="links:${ZL.escape(link.id)}">×</button>
            </div>
          </article>`).join(""):`<div class="empty slim">Chưa có link</div>`}
        </div>
      </section>`).join("")}
    </div>`;
  }

  function renderCommands(){
    const list=rows("commands").filter(matches);
    return `<div class="qd-command-list">
      ${list.length?list.map(cmd=>{
        const cat=COMMAND_CATEGORIES[cmd.category]||COMMAND_CATEGORIES.other;
        return `<article class="qd-command-card">
          <div class="qd-command-head">
            <h2>${ZL.escape(cmd.title||"Command")}</h2>
            <span style="--cmd-cat:${cat.color}">${ZL.escape(cat.label)}</span>
          </div>
          <p class="qd-command-desc">${ZL.escape(cmd.description||"Copy lệnh đã lưu.")}</p>
          <div class="qd-command-bottom">
            <code title="${ZL.escape(cmd.command||"")}">${ZL.escape(cmd.command||"")}</code>
            <button data-qd-copy="${ZL.escape(cmd.id)}">Copy</button>
          </div>
          <div class="qd-command-actions">
            <button class="btn sm" data-qd-edit="commands:${ZL.escape(cmd.id)}">Sửa</button>
            <button class="btn sm danger" data-qd-delete="commands:${ZL.escape(cmd.id)}">Xóa</button>
          </div>
        </article>`;
      }).join(""):`<div class="empty slim">Chưa có command</div>`}
    </div>`;
  }

  function renderPins(){
    const list=rows("pins").filter(matches);
    return `<div class="pinboard-wrap">
      <div class="pin-grid">
        ${list.length?list.map(pin=>`<article class="pin-card" style="--pin:${PIN_COLORS[pin.color]||PIN_COLORS.green}" data-qd-run="pins:${ZL.escape(pin.id)}">
          <span class="pin-icon">📌</span>
          <h2>${ZL.escape(pin.title||"Note")}</h2>
          <p>${ZL.escape(pin.content||"")}</p>
          <em>${ZL.escape(pin.color||"green")}</em>
          <div class="pin-actions">
            <button class="btn sm" data-qd-edit="pins:${ZL.escape(pin.id)}">Sửa</button>
            <button class="btn sm danger" data-qd-delete="pins:${ZL.escape(pin.id)}">Xóa</button>
          </div>
        </article>`).join(""):`<div class="empty slim">Chưa có pin</div>`}
      </div>
    </div>`;
  }

  function modalTitle(){
    if(!modal)return "";
    if(modal.type==="links")return modal.item?"Sửa link":"Add Link";
    if(modal.type==="commands")return modal.item?"Sửa command":"Add Command";
    return modal.item?"Sửa pin":"Add Note";
  }

  function renderModal(){
    if(!modal)return "";
    const item=modal.item||{};
    if(modal.type==="links"){
      return `<div class="qd-modal"><div class="qd-modal-card">
        <div class="panel-title"><div><h2>${modalTitle()}</h2></div><button class="icon-btn" id="qdCloseModal">×</button></div>
        <div class="field compact"><label>Name</label><input id="qdLinkName" value="${ZL.escape(item.name||"")}"></div>
        <div class="field compact"><label>URL</label><input id="qdLinkUrl" value="${ZL.escape(item.url||"")}"></div>
        <div class="field compact"><label>Category</label><select id="qdLinkCategory">${Object.entries(LINK_CATEGORIES).map(([key,cat])=>`<option value="${key}" ${(item.category||"personal")===key?"selected":""}>${cat.icon} ${cat.label}</option>`).join("")}</select></div>
        <button class="btn primary" id="qdSaveModal">Lưu</button>
      </div></div>`;
    }
    if(modal.type==="commands"){
      return `<div class="qd-modal"><div class="qd-modal-card">
        <div class="panel-title"><div><h2>${modalTitle()}</h2></div><button class="icon-btn" id="qdCloseModal">×</button></div>
        <div class="field compact"><label>Title</label><input id="qdCmdTitle" value="${ZL.escape(item.title||"")}"></div>
        <div class="field"><label>Command</label><textarea id="qdCmdCommand">${ZL.escape(item.command||"")}</textarea></div>
        <div class="field compact"><label>Description</label><input id="qdCmdDesc" value="${ZL.escape(item.description||"")}"></div>
        <div class="field compact"><label>Category</label><select id="qdCmdCategory">${Object.entries(COMMAND_CATEGORIES).map(([key,cat])=>`<option value="${key}" ${(item.category||"dev")===key?"selected":""}>${cat.label}</option>`).join("")}</select></div>
        <button class="btn primary" id="qdSaveModal">Lưu</button>
      </div></div>`;
    }
    return `<div class="qd-modal"><div class="qd-modal-card">
      <div class="panel-title"><div><h2>${modalTitle()}</h2></div><button class="icon-btn" id="qdCloseModal">×</button></div>
      <div class="field compact"><label>Title</label><input id="qdPinTitle" value="${ZL.escape(item.title||"")}"></div>
      <div class="field"><label>Content</label><textarea id="qdPinContent">${ZL.escape(item.content||"")}</textarea></div>
      <div class="pin-color-row">${Object.entries(PIN_COLORS).map(([key,color])=>`<button class="${(item.color||"green")===key?"active":""}" data-pin-color="${key}" style="--pin-color:${color}"></button>`).join("")}</div>
      <input type="hidden" id="qdPinColor" value="${ZL.escape(item.color||"green")}">
      <button class="btn primary" id="qdSaveModal">Lưu</button>
    </div></div>`;
  }

  function saveModal(){
    if(!modal)return;
    const old=modal.item||{};
    let payload=null;
    if(modal.type==="links"){
      const name=document.getElementById("qdLinkName").value.trim();
      const url=document.getElementById("qdLinkUrl").value.trim();
      if(!name||!url){ZL.toast("Nhập tên và URL");return;}
      payload={...old,id:old.id||("link-"+Date.now()),name,url,category:document.getElementById("qdLinkCategory").value,clickCount:Number(old.clickCount)||0};
    }else if(modal.type==="commands"){
      const title=document.getElementById("qdCmdTitle").value.trim();
      const command=document.getElementById("qdCmdCommand").value.trim();
      if(!title||!command){ZL.toast("Nhập title và command");return;}
      payload={...old,id:old.id||("cmd-"+Date.now()),title,command,description:document.getElementById("qdCmdDesc").value.trim(),category:document.getElementById("qdCmdCategory").value,clickCount:Number(old.clickCount)||0};
    }else{
      const title=document.getElementById("qdPinTitle").value.trim();
      const content=document.getElementById("qdPinContent").value.trim();
      if(!title){ZL.toast("Nhập title");return;}
      payload={...old,id:old.id||("pin-"+Date.now()),title,content,color:document.getElementById("qdPinColor").value||"green"};
    }
    saveItem(modal.type,payload).then(()=>{
      modal=null;
      ZL.toast("Đã lưu Quick Dock");
      render();
    });
  }

  function bind(root){
    const search=root.querySelector("#qdSearch");
    if(search){
      search.oninput=e=>{query=e.target.value;render();requestAnimationFrame(()=>document.getElementById("qdSearch")?.focus());};
    }
    const clear=root.querySelector("#qdClearSearch");
    if(clear)clear.onclick=()=>{query="";render();};
    root.querySelectorAll("[data-qd-tab]").forEach(btn=>btn.onclick=()=>{tab=btn.dataset.qdTab;render();});
    root.querySelectorAll("[data-qd-run]").forEach(node=>node.onclick=e=>{
      if(e.target.closest("button")&&e.target!==node)return;
      const [type,id]=node.dataset.qdRun.split(":");
      const item=itemBy(type,id);
      if(item)runItem(type,item);
    });
    root.querySelectorAll("[data-qd-copy]").forEach(btn=>btn.onclick=()=>{
      const item=itemBy("commands",btn.dataset.qdCopy);
      if(item)copyCommand(item);
    });
    root.querySelectorAll("[data-qd-add]").forEach(btn=>btn.onclick=()=>{modal={type:btn.dataset.qdAdd,item:null};render();});
    root.querySelectorAll("[data-qd-edit]").forEach(btn=>btn.onclick=e=>{
      e.stopPropagation();
      const [type,id]=btn.dataset.qdEdit.split(":");
      const item=itemBy(type,id);
      if(item){modal={type,item};render();}
    });
    root.querySelectorAll("[data-qd-delete]").forEach(btn=>btn.onclick=e=>{
      e.stopPropagation();
      const [type,id]=btn.dataset.qdDelete.split(":");
      deleteItem(type,id);
    });
    root.querySelectorAll("[data-pin-color]").forEach(btn=>btn.onclick=()=>{
      document.getElementById("qdPinColor").value=btn.dataset.pinColor;
      root.querySelectorAll("[data-pin-color]").forEach(x=>x.classList.toggle("active",x===btn));
    });
    const close=root.querySelector("#qdCloseModal");
    if(close)close.onclick=()=>{modal=null;render();};
    const save=root.querySelector("#qdSaveModal");
    if(save)save.onclick=saveModal;
  }

  function render(){
    const root=document.getElementById("quickdockRoot");
    if(!root)return;
    root.innerHTML=`<div class="quickdock-shell">
      ${renderTop()}
      ${tab==="links"?renderLinks():tab==="commands"?renderCommands():renderPins()}
      ${renderModal()}
    </div>`;
    bind(root);
  }

  ZL.modules.quickdock={render};
  ZL.on("quickdock",render);
})();
