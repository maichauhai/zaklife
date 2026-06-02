(function(){
  const ZL=window.ZL;
  const VAULT_PWD="060997";
  const AUTO_LOCK_MS=30*1000;
  const EMPTY={passwords:[],links:[],notes:[]};
  let unlocked=false;
  let tab="passwords";
  let edit={type:null,index:-1};
  let timer=null;
  let linkImage="";

  function xorEncode(str){
    const key="monstea";
    let raw="";
    for(let i=0;i<str.length;i++)raw+=String.fromCharCode(str.charCodeAt(i)^key.charCodeAt(i%key.length));
    return btoa(encodeURIComponent(raw));
  }

  function xorDecode(b64){
    try{
      const raw=decodeURIComponent(atob(b64));
      const key="monstea";
      let out="";
      for(let i=0;i<raw.length;i++)out+=String.fromCharCode(raw.charCodeAt(i)^key.charCodeAt(i%key.length));
      return out;
    }catch(e){return b64;}
  }

  function loadData(){
    try{
      const remote=ZL.state.vaultEncrypted?.data;
      const raw=localStorage.getItem("zkv")||remote;
      if(remote&&!localStorage.getItem("zkv"))localStorage.setItem("zkv",remote);
      if(!raw)return {...EMPTY};
      return {...EMPTY,...JSON.parse(xorDecode(raw))};
    }catch(e){
      console.warn(e);
      return {...EMPTY};
    }
  }

  function saveData(data){
    const encrypted=xorEncode(JSON.stringify({...EMPTY,...data}));
    localStorage.setItem("zkv",encrypted);
    if(ZL.fb.db)ZL.fb.db.ref("zaklife/vault_encrypted").set({data:encrypted,ts:ZL.nowIso()});
  }

  function resetTimer(){
    clearTimeout(timer);
    if(unlocked)timer=setTimeout(()=>{if(unlocked)lock();},AUTO_LOCK_MS);
  }

  function unlock(){
    const input=document.getElementById("vaultPassword");
    const error=document.getElementById("vaultError");
    if(input.value===VAULT_PWD){
      unlocked=true;
      input.value="";
      if(error)error.textContent="";
      resetTimer();
      render();
      return;
    }
    if(error)error.textContent="Sai khóa";
    input.value="";
    input.focus();
  }

  function lock(){
    unlocked=false;
    edit={type:null,index:-1};
    linkImage="";
    clearTimeout(timer);
    render();
  }

  function copy(text){
    navigator.clipboard?.writeText(text).then(()=>ZL.toast("Đã copy"));
    resetTimer();
  }

  function remove(type,index){
    if(!confirm("Xóa mục này?"))return;
    const data=loadData();
    data[type].splice(index,1);
    saveData(data);
    render();
  }

  function startEdit(type,index){
    edit={type,index};
    const data=loadData();
    const item=data[type][index];
    if(!item)return;
    tab=type;
    linkImage=type==="links"?(item.image||""):"";
    render();
    if(type==="passwords"){
      document.getElementById("vpSite").value=item.site||"";
      document.getElementById("vpUser").value=item.user||"";
      document.getElementById("vpPass").value=item.pass||"";
    }
    if(type==="links"){
      document.getElementById("vlLabel").value=item.label||"";
      document.getElementById("vlUrl").value=item.url||"";
    }
    if(type==="notes"){
      document.getElementById("vnTitle").value=item.title||"";
      document.getElementById("vnBody").value=item.body||"";
    }
  }

  function savePassword(){
    const site=document.getElementById("vpSite").value.trim();
    const user=document.getElementById("vpUser").value.trim();
    const pass=document.getElementById("vpPass").value.trim();
    if(!site||!pass){ZL.toast("Nhập site và mật khẩu");return;}
    const data=loadData();
    const item={site,user,pass};
    if(edit.type==="passwords"&&edit.index>=0)data.passwords[edit.index]=item;
    else data.passwords.push(item);
    edit={type:null,index:-1};
    saveData(data);
    render();
  }

  function saveLink(){
    const label=document.getElementById("vlLabel").value.trim();
    const url=document.getElementById("vlUrl").value.trim();
    if(!label||!url){ZL.toast("Nhập tên và URL");return;}
    const data=loadData();
    const item={label,url,image:linkImage||""};
    if(edit.type==="links"&&edit.index>=0)data.links[edit.index]=item;
    else data.links.push(item);
    edit={type:null,index:-1};
    linkImage="";
    saveData(data);
    render();
  }

  function saveNote(){
    const title=document.getElementById("vnTitle").value.trim();
    const body=document.getElementById("vnBody").value.trim();
    if(!title){ZL.toast("Nhập tiêu đề");return;}
    const data=loadData();
    const item={title,body};
    if(edit.type==="notes"&&edit.index>=0)data.notes[edit.index]=item;
    else data.notes.push(item);
    edit={type:null,index:-1};
    saveData(data);
    render();
  }

  function addLinkImageFiles(files){
    const file=Array.from(files||[]).find(f=>f.type&&f.type.startsWith("image/"));
    if(!file)return;
    const reader=new FileReader();
    reader.onload=e=>{
      const img=new Image();
      img.onload=()=>{
        const ratio=Math.min(900/img.width,900/img.height,1);
        const canvas=document.createElement("canvas");
        canvas.width=Math.round(img.width*ratio);
        canvas.height=Math.round(img.height*ratio);
        canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
        linkImage=canvas.toDataURL("image/jpeg",0.7);
        render();
      };
      img.src=e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function openImage(src){
    const old=document.querySelector(".image-modal");
    if(old)old.remove();
    const modal=document.createElement("div");
    modal.className="image-modal";
    modal.innerHTML=`<button class="image-modal-close" aria-label="Đóng">×</button><img src="${ZL.escape(src)}" alt="">`;
    document.body.appendChild(modal);
    const close=()=>modal.remove();
    modal.querySelector(".image-modal-close").onclick=close;
    modal.onclick=e=>{if(e.target===modal)close();};
  }

  function passwordPanel(data){
    return `<div class="vault-panel ${tab==="passwords"?"active":""}">
      <div class="grid grid-3">
        <div class="field compact"><label>Site</label><input id="vpSite"></div>
        <div class="field compact"><label>User</label><input id="vpUser"></div>
        <div class="field compact"><label>Password</label><input id="vpPass" type="password"></div>
      </div>
      <button class="btn primary" id="vpSave">${edit.type==="passwords"?"Cập nhật":"Thêm password"}</button>
      <div class="vault-list">${data.passwords.length?data.passwords.map((p,i)=>`<div class="vault-item">
        <div>
          <div class="item-title">${ZL.escape(p.site)}</div>
          <div class="item-meta">${ZL.escape(p.user||"")}</div>
          <code id="pwd${i}" class="secret">••••••••</code>
        </div>
        <div class="row-actions">
          <button class="btn sm" data-show-pwd="${i}">Hiện</button>
          <button class="btn sm" data-copy-pwd="${i}">Copy</button>
          <button class="btn sm" data-edit="passwords:${i}">Sửa</button>
          <button class="btn sm danger" data-remove="passwords:${i}">Xóa</button>
        </div>
      </div>`).join(""):`<div class="empty slim">Chưa có password</div>`}</div>
    </div>`;
  }

  function linkImageInput(){
    return `<div class="vault-link-image-box" id="vlImageZone" tabindex="0">
      ${linkImage?`<div class="vault-link-image-preview"><img src="${ZL.escape(linkImage)}" data-vault-open-image><button data-remove-link-image>×</button></div>`:`<div class="vault-link-image-empty">Dán/thêm ảnh thumbnail mô tả link</div>`}
      <label class="btn sm"><input type="file" id="vlImageFile" accept="image/*" hidden>Thêm ảnh</label>
    </div>`;
  }

  function linksPanel(data){
    return `<div class="vault-panel ${tab==="links"?"active":""}">
      <div class="grid grid-2">
        <div class="field compact"><label>Tên link</label><input id="vlLabel"></div>
        <div class="field compact"><label>URL</label><input id="vlUrl"></div>
      </div>
      ${linkImageInput()}
      <button class="btn primary" id="vlSave">${edit.type==="links"?"Cập nhật":"Thêm link"}</button>
      <div class="vault-list">${data.links.length?data.links.map((l,i)=>`<div class="vault-item vault-link-item">
        ${l.image?`<img class="vault-link-thumb" src="${ZL.escape(l.image)}" data-vault-open-image alt="">`:`<div class="vault-link-thumb placeholder">Link</div>`}
        <div class="vault-link-main">
          <div class="item-title">${ZL.escape(l.label)}</div>
          <a class="idea-link" href="${ZL.escape(l.url)}" target="_blank">${ZL.escape(l.url)}</a>
        </div>
        <div class="row-actions">
          <button class="btn sm" data-copy-link="${i}">Copy</button>
          <button class="btn sm" data-edit="links:${i}">Sửa</button>
          <button class="btn sm danger" data-remove="links:${i}">Xóa</button>
        </div>
      </div>`).join(""):`<div class="empty slim">Chưa có link</div>`}</div>
    </div>`;
  }

  function notesPanel(data){
    return `<div class="vault-panel ${tab==="notes"?"active":""}">
      <div class="field compact"><label>Tiêu đề</label><input id="vnTitle"></div>
      <div class="field"><label>Nội dung</label><textarea id="vnBody"></textarea></div>
      <button class="btn primary" id="vnSave">${edit.type==="notes"?"Cập nhật":"Thêm ghi chú"}</button>
      <div class="vault-list">${data.notes.length?data.notes.map((n,i)=>`<div class="vault-item">
        <div>
          <div class="item-title">${ZL.escape(n.title)}</div>
          <div class="idea-note">${ZL.escape(n.body||"")}</div>
        </div>
        <div class="row-actions">
          <button class="btn sm" data-edit="notes:${i}">Sửa</button>
          <button class="btn sm danger" data-remove="notes:${i}">Xóa</button>
        </div>
      </div>`).join(""):`<div class="empty slim">Chưa có ghi chú</div>`}</div>
    </div>`;
  }

  function bind(root,data){
    const unlockBtn=document.getElementById("vaultUnlock");
    if(unlockBtn){
      unlockBtn.onclick=unlock;
      document.getElementById("vaultPassword").onkeydown=e=>{if(e.key==="Enter")unlock();};
      return;
    }
    document.getElementById("vaultLock").onclick=lock;
    root.querySelectorAll("[data-vault-tab]").forEach(btn=>btn.onclick=()=>{tab=btn.dataset.vaultTab;edit={type:null,index:-1};render();});
    const vp=document.getElementById("vpSave");if(vp)vp.onclick=savePassword;
    const vl=document.getElementById("vlSave");if(vl)vl.onclick=saveLink;
    const vn=document.getElementById("vnSave");if(vn)vn.onclick=saveNote;
    root.querySelectorAll("[data-remove]").forEach(btn=>btn.onclick=()=>{const [type,index]=btn.dataset.remove.split(":");remove(type,Number(index));});
    root.querySelectorAll("[data-edit]").forEach(btn=>btn.onclick=()=>{const [type,index]=btn.dataset.edit.split(":");startEdit(type,Number(index));});
    root.querySelectorAll("[data-copy-pwd]").forEach(btn=>btn.onclick=()=>copy(data.passwords[Number(btn.dataset.copyPwd)]?.pass||""));
    root.querySelectorAll("[data-copy-link]").forEach(btn=>btn.onclick=()=>copy(data.links[Number(btn.dataset.copyLink)]?.url||""));
    root.querySelectorAll("[data-show-pwd]").forEach(btn=>btn.onclick=()=>{
      const i=Number(btn.dataset.showPwd);
      const el=document.getElementById("pwd"+i);
      if(!el)return;
      el.textContent=el.textContent==="••••••••"?(data.passwords[i]?.pass||""):"••••••••";
      resetTimer();
    });
    root.querySelectorAll("[data-vault-open-image]").forEach(img=>img.onclick=()=>openImage(img.src));
    const file=document.getElementById("vlImageFile");
    if(file)file.onchange=e=>addLinkImageFiles(e.target.files);
    const zone=document.getElementById("vlImageZone");
    if(zone){
      zone.onpaste=e=>{
        const items=e.clipboardData?.items||[];
        for(const item of items){
          if(item.type.startsWith("image/")){
            e.preventDefault();
            const file=item.getAsFile();
            if(file)addLinkImageFiles([file]);
            return;
          }
        }
      };
    }
    const removeImage=document.querySelector("[data-remove-link-image]");
    if(removeImage)removeImage.onclick=e=>{e.preventDefault();linkImage="";render();};
    root.onpointerdown=resetTimer;
    root.onkeydown=resetTimer;
    root.oninput=resetTimer;
    root.onchange=resetTimer;
    root.onpaste=resetTimer;
    root.ondrop=resetTimer;
  }

  function render(){
    const root=document.getElementById("vaultRoot");
    if(!root)return;
    if(!unlocked){
      root.innerHTML=`<div class="vault-lock panel">
        <div class="brand-mark">◆</div>
        <h2>Vault</h2>
        <input id="vaultPassword" type="password" placeholder="Nhập khóa">
        <button class="btn primary" id="vaultUnlock">Mở khóa</button>
        <div id="vaultError" class="danger-value small"></div>
      </div>`;
      bind(root);
      return;
    }
    const data=loadData();
    root.innerHTML=`<div class="panel">
      <div class="panel-title">
        <div><h2>Vault</h2><p>${data.passwords.length} password · ${data.links.length} link · ${data.notes.length} ghi chú</p></div>
        <button class="btn sm" id="vaultLock">Khóa</button>
      </div>
      <div class="segmented vault-tabs">
        ${["passwords","links","notes"].map(t=>`<button class="${tab===t?"active":""}" data-vault-tab="${t}">${t==="passwords"?"Passwords":t==="links"?"Links":"Notes"}</button>`).join("")}
      </div>
      ${passwordPanel(data)}
      ${linksPanel(data)}
      ${notesPanel(data)}
    </div>`;
    bind(root,data);
  }

  document.addEventListener("visibilitychange",()=>{if(document.hidden&&unlocked)lock();});
  ZL.on("route-change",payload=>{if(payload?.to!=="vault"&&unlocked)lock();});
  ZL.modules.vault={render};
  ZL.on("vault",render);
})();
