(function(){
  const ZL=window.ZL;
  const TAGS=["Monstea","Tech","Game","Cá nhân","Marketing","Content","Kinh doanh","Đầu tư"];
  let ideaImages=[];
  let selectedTags=new Set();

  function ideas(){
    ZL.state.zak.ideas=Array.isArray(ZL.state.zak.ideas)?ZL.state.zak.ideas:[];
    return ZL.state.zak.ideas;
  }

  function activeIdeas(){
    return ideas().filter(idea=>idea&&!idea._deleted);
  }

  function renderImagePreview(){
    return `<div class="image-preview">
      ${ideaImages.map((src,i)=>`<div class="thumb"><img src="${src}" alt="" data-open-image><button data-remove-image="${i}">×</button></div>`).join("")}
    </div>`;
  }

  function extractLinks(text){
    return String(text||"").match(/https?:\/\/[^\s]+/gi)||[];
  }

  function addFiles(files){
    if(!files?.length)return;
    const remaining=5-ideaImages.length;
    if(remaining<=0){ZL.toast("Tối đa 5 ảnh");return;}
    Array.from(files).slice(0,remaining).forEach(file=>{
      if(!file.type.startsWith("image/"))return;
      const reader=new FileReader();
      reader.onload=e=>{
        const img=new Image();
        img.onload=()=>{
          const ratio=Math.min(900/img.width,900/img.height,1);
          const canvas=document.createElement("canvas");
          canvas.width=Math.round(img.width*ratio);
          canvas.height=Math.round(img.height*ratio);
          canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
          ideaImages.push(canvas.toDataURL("image/jpeg",0.68));
          render();
        };
        img.src=e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function saveIdea(){
    const title=document.getElementById("ideaTitle").value.trim();
    const note=document.getElementById("ideaPasteZone").innerText.trim();
    if(!title&&!note&&!ideaImages.length){ZL.toast("Ghi ý tưởng trước");return;}
    const next=Number(ZL.state.zak.nextIdeaId)||1;
    ideas().push({
      id:next,
      title:title||"Ý tưởng nhanh",
      note,
      links:extractLinks(note),
      images:[...ideaImages],
      tags:[...selectedTags],
      created:ZL.nowIso(),
      _lastModified:Date.now(),
      synced:false
    });
    ZL.state.zak.nextIdeaId=next+1;
    ideaImages=[];
    selectedTags.clear();
    ZL.syncZakData();
    ZL.toast("Đã lưu ý tưởng");
    render();
  }

  function deleteIdea(id){
    if(!confirm("Xóa ý tưởng này?"))return;
    const now=Date.now();
    ZL.state.zak.ideas=ideas().map(idea=>String(idea.id)===String(id)
      ? {...idea,_deleted:true,deletedAt:ZL.nowIso(),_lastModified:now,images:[]}
      : idea
    );
    ZL.syncZakData();
    ZL.toast("Đã xóa");
    render();
  }

  function exportIdeas(){
    const unsynced=activeIdeas().filter(i=>!i.synced);
    if(!unsynced.length){ZL.toast("Không có ý tưởng mới để export");return;}
    let md="# Ideas Inbox\n";
    md+=`> Exported: ${new Date().toLocaleString("vi-VN")}\n\n`;
    unsynced.forEach(idea=>{
      md+=`## ${idea.title}\n`;
      md+=`- Created: ${new Date(idea.created).toLocaleString("vi-VN")}\n`;
      if(idea.tags?.length)md+=`- Tags: ${idea.tags.map(t=>"#"+t.replace(/\s/g,"-")).join(" ")}\n`;
      md+="\n";
      if(idea.note)md+=idea.note+"\n\n";
      (idea.links||[]).forEach(l=>md+=`- ${l}\n`);
      if(idea.images?.length)md+=`\n> ${idea.images.length} ảnh lưu trong ZakLife.\n`;
      md+="\n---\n\n";
      idea.synced=true;
    });
    const blob=new Blob([md],{type:"text/markdown"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download=`ideas_inbox_${ZL.today()}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
    ZL.syncZakData();
    render();
  }

  function renderList(){
    const list=activeIdeas().slice().sort((a,b)=>String(b.created||"").localeCompare(String(a.created||"")));
    if(!list.length)return `<div class="empty">Chưa có ý tưởng</div>`;
    return list.map(idea=>{
      const tags=(idea.tags||[]).map(t=>`<span class="tag selected">${ZL.escape(t)}</span>`).join("");
      const links=(idea.links||[]).map(l=>`<a class="idea-link" href="${ZL.escape(l)}" target="_blank">${ZL.escape(l)}</a>`).join("");
      const imgs=(idea.images||[]).map(src=>`<img src="${src}" alt="" class="idea-img" data-open-image title="Bấm để phóng to">`).join("");
      return `<article class="idea-card">
        <div class="idea-head">
          <div>
            <h3>${ZL.escape(idea.title||"Không tiêu đề")}</h3>
            <p>${ZL.escape(new Date(idea.created||Date.now()).toLocaleString("vi-VN",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}))} ${idea.synced?"· synced":""}</p>
          </div>
          <button class="icon-btn danger" data-delete-idea="${ZL.escape(idea.id)}">×</button>
        </div>
        ${idea.note?`<div class="idea-note">${ZL.escape(idea.note)}</div>`:""}
        ${links?`<div class="idea-links">${links}</div>`:""}
        ${imgs?`<div class="idea-images">${imgs}</div>`:""}
        ${tags?`<div class="tag-row">${tags}</div>`:""}
      </article>`;
    }).join("");
  }

  function bind(root){
    root.querySelectorAll("[data-open-image]").forEach(img=>img.onclick=()=>openImage(img.src));
    root.querySelectorAll("[data-tag]").forEach(btn=>btn.onclick=()=>{
      const tag=btn.dataset.tag;
      selectedTags.has(tag)?selectedTags.delete(tag):selectedTags.add(tag);
      render();
    });
    root.querySelectorAll("[data-remove-image]").forEach(btn=>btn.onclick=()=>{
      ideaImages.splice(Number(btn.dataset.removeImage),1);
      render();
    });
    root.querySelectorAll("[data-delete-idea]").forEach(btn=>btn.onclick=()=>deleteIdea(btn.dataset.deleteIdea));
    document.getElementById("ideaSaveBtn").onclick=saveIdea;
    document.getElementById("ideaExportBtn").onclick=exportIdeas;
    document.getElementById("ideaFileInput").onchange=e=>addFiles(e.target.files);
    const zone=document.getElementById("ideaPasteZone");
    zone.onpaste=e=>{
      const items=e.clipboardData?.items||[];
      for(const item of items){
        if(item.type.startsWith("image/")){
          e.preventDefault();
          const file=item.getAsFile();
          if(file)addFiles([file]);
          return;
        }
      }
    };
  }

  function openImage(src){
    if(!src)return;
    const old=document.querySelector(".image-modal");
    if(old)old.remove();
    const modal=document.createElement("div");
    modal.className="image-modal";
    modal.innerHTML=`<button class="image-modal-close" aria-label="Đóng">×</button><img src="${src}" alt="">`;
    document.body.appendChild(modal);
    const close=()=>modal.remove();
    modal.querySelector(".image-modal-close").onclick=close;
    modal.onclick=e=>{if(e.target===modal)close();};
    document.addEventListener("keydown",function esc(e){
      if(e.key==="Escape"){close();document.removeEventListener("keydown",esc);}
    });
  }

  function render(){
    const root=document.getElementById("ideasRoot");
    if(!root)return;
    root.innerHTML=`
      <div class="layout-2">
        <div class="panel">
          <div class="panel-title"><div><h2>Ý tưởng mới</h2><p>${activeIdeas().length} ý tưởng</p></div></div>
          <div class="field compact"><label>Tiêu đề</label><input id="ideaTitle" placeholder="Tên ý tưởng"></div>
          <div class="field"><label>Nội dung</label><div id="ideaPasteZone" class="paste-zone" contenteditable="true"></div></div>
          <div class="tag-picker">${TAGS.map(tag=>`<button class="tag ${selectedTags.has(tag)?"selected":""}" data-tag="${ZL.escape(tag)}">${ZL.escape(tag)}</button>`).join("")}</div>
          <div class="idea-actions">
            <label class="btn"><input type="file" id="ideaFileInput" accept="image/*" multiple hidden>Thêm ảnh</label>
            <button class="btn primary" id="ideaSaveBtn">Lưu ý tưởng</button>
            <button class="btn" id="ideaExportBtn">Export markdown</button>
          </div>
          ${renderImagePreview()}
        </div>
        <div class="ideas-list">${renderList()}</div>
      </div>`;
    bind(root);
  }

  ZL.modules.ideas={render};
  ZL.on("zak",render);
})();
