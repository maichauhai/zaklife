(function(){
  const ZL=window.ZL;
  let weekStart=getMonday(new Date());
  let selectedId="";
  const HOURS=Array.from({length:13},(_,i)=>8+i);
  const MEDIA_BASE_PATH="zaklife/content-media";

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
    return {
      id:"",
      title:"",
      caption:"",
      photoUrl:"",
      thumbUrl:"",
      storagePath:"",
      thumbStoragePath:"",
      mediaStatus:"empty",
      deleteOriginalAfterPost:true,
      scheduledDate:ZL.today(),
      scheduledTime:"09:00",
      status:"draft"
    };
  }

  function statusText(status){
    return ({draft:"Draft",scheduled:"Scheduled",approved:"Approved",posted:"Posted",missed:"Missed",failed:"Failed"})[status]||status||"Draft";
  }

  function scheduledIso(date,time){
    return `${date}T${time}:00+07:00`;
  }

  function mediaStatusText(status){
    return ({
      empty:"Chưa có ảnh",
      external_url:"Link ngoài",
      ready:"Ảnh gốc sẵn sàng",
      posting:"Đang đăng",
      posted:"Đã đăng",
      original_deleted:"Đã dọn ảnh gốc",
      failed:"Lỗi ảnh"
    })[status]||status||"Chưa có ảnh";
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

  function previewUrl(post){
    return post.thumbUrl||driveThumbUrl(post.driveFileId)||post.photoUrl||"";
  }

  function extractDriveFileId(url){
    const raw=String(url||"").trim();
    if(!raw)return "";
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

  function driveThumbUrl(fileId){
    return fileId?`https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1000`:"";
  }

  function mediaFromUrl(url){
    const value=String(url||"").trim();
    const driveFileId=extractDriveFileId(value);
    if(driveFileId){
      return {
        photoUrl:value,
        thumbUrl:driveThumbUrl(driveFileId),
        mediaProvider:"google_drive",
        driveFileId,
        mediaStatus:"external_url"
      };
    }
    return {
      photoUrl:value,
      thumbUrl:"",
      mediaProvider:value?"external_url":"",
      driveFileId:"",
      mediaStatus:value?"external_url":"empty"
    };
  }

  function renderMediaPreview(post){
    const url=previewUrl(post);
    const status=post.mediaProvider==="google_drive"?"Google Drive":mediaStatusText(post.mediaStatus||(post.photoUrl?"external_url":"empty"));
    if(!url){
      return `<div class="content-media-empty">
        <strong>Thả ảnh vào đây</strong>
        <span>Dán link Google Drive hoặc link ảnh trực tiếp.</span>
      </div>`;
    }
    return `<div class="content-media-preview">
      <img src="${ZL.escape(url)}" alt="" data-content-preview onerror="this.closest('.content-media-preview').classList.add('preview-failed');this.remove();">
      <div>
        <strong>${ZL.escape(status)}</strong>
        <span>${post.driveFileId?`File ID: ${ZL.escape(post.driveFileId)}`:(post.storagePath?"Có ảnh gốc cho n8n":"Chỉ có URL/thumbnail")}</span>
      </div>
    </div>`;
  }

  function renderForm(post){
    const canCleanup=post.id&&post.storagePath&&(post.status==="posted"||post.mediaStatus==="posted");
    return `<div class="panel content-form-panel">
      <div class="panel-title"><div><h2>${post.id?"Sửa bài":"Create New Post"}</h2><p>Bài approved sẽ để n8n xử lý</p></div></div>
      <input type="hidden" id="contentId" value="${ZL.escape(post.id)}">
      <input type="hidden" id="contentStoragePath" value="${ZL.escape(post.storagePath||"")}">
      <input type="hidden" id="contentThumbUrl" value="${ZL.escape(post.thumbUrl||"")}">
      <input type="hidden" id="contentThumbStoragePath" value="${ZL.escape(post.thumbStoragePath||"")}">
      <input type="hidden" id="contentMediaStatus" value="${ZL.escape(post.mediaStatus||"")}">
      <input type="hidden" id="contentMediaMime" value="${ZL.escape(post.mediaMime||"")}">
      <input type="hidden" id="contentMediaSize" value="${ZL.escape(post.mediaSize||"")}">
      <input type="hidden" id="contentMediaProvider" value="${ZL.escape(post.mediaProvider||"")}">
      <input type="hidden" id="contentDriveFileId" value="${ZL.escape(post.driveFileId||"")}">
      <div class="field"><label>Title</label><input id="contentTitle" value="${ZL.escape(post.title)}" placeholder="Exploring New Product Features"></div>
      <div class="field"><label>Caption</label><textarea id="contentCaption" class="content-caption-input" rows="14" style="min-height:340px;height:340px;max-height:520px;" placeholder="Excited to share...">${ZL.escape(post.caption)}</textarea></div>
      <div class="upload-box content-upload-box" id="contentUploadZone" tabindex="0">
        <div id="contentMediaBox">${renderMediaPreview(post)}</div>
        <input id="contentPhoto" value="${ZL.escape(post.photoUrl)}" placeholder="URL ảnh public hoặc link ảnh gốc">
        <div class="content-upload-actions">
          <label class="btn sm file-btn" for="contentFile">Chọn ảnh</label>
          <input type="file" id="contentFile" accept="image/*">
          <button class="btn sm" id="clearContentMediaBtn" type="button">Gỡ khỏi form</button>
          <button class="btn sm danger" id="cleanupContentMediaBtn" type="button" ${canCleanup?"":"disabled"}>Dọn ảnh gốc</button>
        </div>
        <label class="inline-check">
          <input type="checkbox" id="contentDeleteOriginal" ${post.deleteOriginalAfterPost===false?"":"checked"}>
          <span>Xóa ảnh gốc sau khi n8n đăng xong, giữ thumbnail để xem lịch sử.</span>
        </label>
        <p class="content-media-meta">n8n dùng <code>photoUrl</code> hoặc <code>storagePath</code>; sau khi đăng thành công thì xóa <code>storagePath</code>.</p>
      </div>
      <div class="grid grid-2">
        <div class="field"><label>Schedule Date</label><input type="date" id="contentDate" value="${ZL.escape(post.scheduledDate)}"></div>
        <div class="field"><label>Time</label><input type="time" id="contentTime" value="${ZL.escape(post.scheduledTime)}"></div>
      </div>
      <div class="field"><label>Status</label><select id="contentStatus">
        ${["draft","scheduled","approved","posted","missed","failed"].map(s=>`<option value="${s}" ${post.status===s?"selected":""}>${statusText(s)}</option>`).join("")}
      </select></div>
      <div class="grid grid-2">
        <button class="btn primary" id="saveContentBtn">${post.id?"Lưu bài":"Schedule Post"}</button>
        <button class="btn danger" id="deleteContentBtn" ${post.id?"":"disabled"}>Xóa</button>
      </div>
    </div>`;
  }

  function ensurePostId(){
    const input=document.getElementById("contentId");
    if(!input)return "post-"+Date.now();
    if(!input.value)input.value="post-"+Date.now();
    return input.value;
  }

  function setField(id,value){
    const el=document.getElementById(id);
    if(el)el.value=value||"";
  }

  function currentMedia(){
    const photoUrl=document.getElementById("contentPhoto")?.value.trim()||"";
    const thumbUrl=document.getElementById("contentThumbUrl")?.value.trim()||"";
    const storagePath=document.getElementById("contentStoragePath")?.value.trim()||"";
    const mediaProvider=document.getElementById("contentMediaProvider")?.value.trim()||"";
    const driveFileId=document.getElementById("contentDriveFileId")?.value.trim()||"";
    const mediaStatus=document.getElementById("contentMediaStatus")?.value.trim()||(photoUrl?"external_url":"empty");
    return {photoUrl,thumbUrl,storagePath,mediaProvider,driveFileId,mediaStatus};
  }

  function setMediaFields(media){
    const next={...currentMedia(),...media};
    setField("contentPhoto",next.photoUrl);
    setField("contentStoragePath",next.storagePath);
    setField("contentThumbUrl",next.thumbUrl);
    setField("contentThumbStoragePath",next.thumbStoragePath);
    setField("contentMediaStatus",next.mediaStatus);
    setField("contentMediaMime",next.mediaMime);
    setField("contentMediaSize",next.mediaSize);
    setField("contentMediaProvider",next.mediaProvider);
    setField("contentDriveFileId",next.driveFileId);
    const box=document.getElementById("contentMediaBox");
    if(box)box.innerHTML=renderMediaPreview(next);
    bindPreviewZoom();
  }

  function readForm(){
    const id=document.getElementById("contentId").value||("post-"+Date.now());
    const title=document.getElementById("contentTitle").value.trim()||"Bài chưa đặt tên";
    const caption=document.getElementById("contentCaption").value.trim();
    const photoUrl=document.getElementById("contentPhoto").value.trim();
    const scheduledDate=document.getElementById("contentDate").value||ZL.today();
    const scheduledTime=document.getElementById("contentTime").value||"09:00";
    const status=document.getElementById("contentStatus").value||"draft";
    const storagePath=document.getElementById("contentStoragePath").value.trim();
    const thumbUrl=document.getElementById("contentThumbUrl").value.trim();
    const thumbStoragePath=document.getElementById("contentThumbStoragePath").value.trim();
    const mediaMime=document.getElementById("contentMediaMime").value.trim();
    const mediaSize=Number(document.getElementById("contentMediaSize").value)||0;
    const mediaProvider=document.getElementById("contentMediaProvider").value.trim();
    const driveFileId=document.getElementById("contentDriveFileId").value.trim();
    const mediaStatus=document.getElementById("contentMediaStatus").value.trim()||(photoUrl?"external_url":"empty");
    const deleteOriginalAfterPost=document.getElementById("contentDeleteOriginal")?.checked!==false;
    return {
      id,title,caption,message:caption,photoUrl,
      photo_path:photoUrl,image_url:photoUrl,
      storagePath,thumbUrl,thumbStoragePath,
      mediaStatus,mediaMime,mediaSize,mediaProvider,driveFileId,deleteOriginalAfterPost,
      scheduledDate,scheduledTime,
      scheduled_at:scheduledIso(scheduledDate,scheduledTime),
      timezone:"Asia/Ho_Chi_Minh",
      status,updated_at:ZL.nowIso()
    };
  }

  function fileExt(file){
    const fromName=String(file.name||"").split(".").pop().toLowerCase();
    const clean=fromName.replace(/[^a-z0-9]/g,"");
    if(clean&&clean.length<=5)return clean;
    const fromType=String(file.type||"").split("/").pop().toLowerCase();
    return fromType.replace(/[^a-z0-9]/g,"")||"jpg";
  }

  function makeThumb(file){
    return new Promise((resolve,reject)=>{
      const img=new Image();
      const url=URL.createObjectURL(file);
      img.onload=()=>{
        const max=960;
        const scale=Math.min(1,max/Math.max(img.width,img.height));
        const canvas=document.createElement("canvas");
        canvas.width=Math.max(1,Math.round(img.width*scale));
        canvas.height=Math.max(1,Math.round(img.height*scale));
        const ctx=canvas.getContext("2d");
        ctx.drawImage(img,0,0,canvas.width,canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Không tạo được thumbnail")),"image/jpeg",0.78);
      };
      img.onerror=()=>{
        URL.revokeObjectURL(url);
        reject(new Error("Không đọc được ảnh để tạo thumbnail"));
      };
      img.src=url;
    });
  }

  async function uploadBlob(path,blob,contentType){
    return uploadBlobWithProgress(path,blob,contentType);
  }

  function uploadBlobWithProgress(path,blob,contentType,onProgress){
    return new Promise((resolve,reject)=>{
      const ref=ZL.fb.storage.ref(path);
      const task=ref.put(blob,{contentType});
      const timeout=setTimeout(()=>{
        try{task.cancel();}catch(e){console.warn(e);}
        const err=new Error("Firebase Storage không phản hồi sau 25 giây");
        err.code="storage/timeout";
        reject(err);
      },25000);
      task.on("state_changed",snap=>{
        if(onProgress&&snap.totalBytes){
          onProgress(Math.round((snap.bytesTransferred/snap.totalBytes)*100));
        }
      },error=>{
        clearTimeout(timeout);
        reject(error);
      },async()=>{
        clearTimeout(timeout);
        try{
          const url=await ref.getDownloadURL();
          resolve({path,url});
        }catch(e){
          reject(e);
        }
      });
    });
  }

  function storageErrorMessage(error){
    const code=String(error?.code||"");
    if(code.includes("unauthorized"))return "Firebase Storage đang chặn quyền upload. Cần mở rule write cho đường zaklife/content-media hoặc thêm auth.";
    if(code.includes("canceled"))return "Upload đã bị hủy.";
    if(code.includes("timeout"))return "Firebase Storage không phản hồi. Thường là rule/bucket/CORS hoặc mạng đang chặn upload.";
    if(code.includes("retry-limit-exceeded"))return "Mạng hoặc Firebase Storage quá chậm, upload vượt giới hạn thử lại.";
    return error?.message||"Không rõ lỗi Firebase Storage";
  }

  function setUploadProgress(label,percent,preview){
    const box=document.getElementById("contentMediaBox");
    const safePercent=Math.max(0,Math.min(100,Number(percent)||0));
    if(!box)return;
    box.innerHTML=`<div class="content-media-progress">
      ${preview?`<img src="${ZL.escape(preview)}" alt="Ảnh đang upload">`:`<div class="content-progress-placeholder">IMG</div>`}
      <div>
        <strong>${ZL.escape(label)}</strong>
        <div class="content-progress-bar"><span style="width:${safePercent}%"></span></div>
        <em>${safePercent}%</em>
      </div>
    </div>`;
  }

  async function handleImageFile(file){
    if(!file)return;
    if(!file.type||!file.type.startsWith("image/")){
      ZL.toast("Chỉ nhận file ảnh");
      return;
    }
    if(!ZL.fb.storage){
      ZL.toast("Firebase Storage chưa sẵn sàng");
      return;
    }
    const postId=ensurePostId();
    const stamp=Date.now();
    const ext=fileExt(file);
    const originalPath=`${MEDIA_BASE_PATH}/${postId}/original-${stamp}.${ext}`;
    const thumbPath=`${MEDIA_BASE_PATH}/${postId}/thumb-${stamp}.jpg`;
    const oldLabel=document.getElementById("contentMediaStatus")?.value||"";
    setField("contentMediaStatus","posting");
    let previewUrl="";
    let thumbBlob=null;
    setUploadProgress("Đang chuẩn bị ảnh...",5,"");
    try{
      try{
        thumbBlob=await makeThumb(file);
        previewUrl=URL.createObjectURL(thumbBlob);
      }catch(e){
        console.warn(e);
        previewUrl=URL.createObjectURL(file);
      }
      setUploadProgress("Đang upload ảnh gốc...",10,previewUrl);
      ZL.toast("Đang upload ảnh gốc...");
      const original=await uploadBlobWithProgress(originalPath,file,file.type||"application/octet-stream",percent=>{
        setUploadProgress("Đang upload ảnh gốc...",Math.max(10,percent),previewUrl);
      });
      setUploadProgress("Đang lưu thumbnail...",96,previewUrl);
      const thumb=thumbBlob
        ? await uploadBlobWithProgress(thumbPath,thumbBlob,"image/jpeg",percent=>{
          setUploadProgress("Đang lưu thumbnail...",96+Math.round(percent*0.04),previewUrl);
        }).catch(e=>{console.warn(e);return {path:"",url:""};})
        : {path:"",url:""};
      if(previewUrl)URL.revokeObjectURL(previewUrl);
      setUploadProgress("Upload xong",100,thumb.url||original.url);
      setMediaFields({
        photoUrl:original.url,
        storagePath:original.path,
        thumbUrl:thumb.url,
        thumbStoragePath:thumb.path,
        mediaProvider:"firebase_storage",
        driveFileId:"",
        mediaStatus:"ready",
        mediaMime:file.type,
        mediaSize:file.size
      });
      ZL.toast("Đã upload ảnh cho bài content");
    }catch(e){
      if(previewUrl)URL.revokeObjectURL(previewUrl);
      setField("contentMediaStatus",oldLabel||"failed");
      setMediaFields({mediaStatus:"failed"});
      ZL.toast("Lỗi upload ảnh: "+storageErrorMessage(e));
      const box=document.getElementById("contentMediaBox");
      if(box){
        box.innerHTML=`<div class="content-media-empty error">
          <strong>Upload ảnh lỗi</strong>
          <span>${ZL.escape(storageErrorMessage(e))}</span>
        </div>`;
      }
    }
  }

  function clearMediaFields(){
    setMediaFields({
      photoUrl:"",
      storagePath:"",
      thumbUrl:"",
      thumbStoragePath:"",
      mediaStatus:"empty",
      mediaProvider:"",
      driveFileId:"",
      mediaMime:"",
      mediaSize:""
    });
  }

  async function cleanupOriginalMedia(){
    const post=readForm();
    if(!post.id||!post.storagePath){
      ZL.toast("Không có ảnh gốc để dọn");
      return;
    }
    if(post.status!=="posted"&&post.mediaStatus!=="posted"){
      ZL.toast("Chỉ dọn ảnh gốc sau khi bài đã đăng xong");
      return;
    }
    if(!ZL.fb.db||!ZL.fb.storage){
      ZL.toast("Firebase chưa sẵn sàng");
      return;
    }
    if(!confirm("Xóa ảnh gốc khỏi Firebase Storage? Thumbnail vẫn được giữ để xem lại."))return;
    const oldPath=post.storagePath;
    try{
      await ZL.fb.storage.ref(oldPath).delete().catch(e=>{
        if(!String(e.code||"").includes("object-not-found"))throw e;
      });
      const keepUrl=post.thumbUrl||"";
      const updates={
        mediaStatus:"original_deleted",
        photoUrl:keepUrl,
        image_url:keepUrl,
        photo_path:keepUrl,
        storagePath:null,
        deletedStoragePath:oldPath,
        originalDeletedAt:ZL.nowIso(),
        updated_at:ZL.nowIso()
      };
      await ZL.fb.db.ref("zaklife/content-calendar/"+post.id).update(updates);
      setMediaFields({
        photoUrl:keepUrl,
        storagePath:"",
        mediaStatus:"original_deleted"
      });
      ZL.toast("Đã dọn ảnh gốc");
    }catch(e){
      ZL.toast("Lỗi dọn ảnh gốc: "+e.message);
    }
  }

  function openImage(url){
    if(!url)return;
    const modal=document.createElement("div");
    modal.className="image-modal";
    modal.innerHTML=`<button class="image-modal-close" type="button">×</button><img src="${ZL.escape(url)}" alt="">`;
    modal.onclick=e=>{if(e.target===modal||e.target.closest(".image-modal-close"))modal.remove();};
    document.body.appendChild(modal);
  }

  function bindPreviewZoom(){
    document.querySelectorAll("[data-content-preview]").forEach(img=>{
      img.onclick=()=>openImage(img.getAttribute("src"));
    });
  }

  function bindMedia(root){
    const fileInput=document.getElementById("contentFile");
    const zone=document.getElementById("contentUploadZone");
    const clearBtn=document.getElementById("clearContentMediaBtn");
    const cleanupBtn=document.getElementById("cleanupContentMediaBtn");
    const urlInput=document.getElementById("contentPhoto");
    if(fileInput)fileInput.onchange=()=>handleImageFile(fileInput.files&&fileInput.files[0]);
    if(clearBtn)clearBtn.onclick=clearMediaFields;
    if(cleanupBtn)cleanupBtn.onclick=cleanupOriginalMedia;
    if(urlInput){
      const updateExternalUrl=()=>{
        const url=urlInput.value.trim();
        if(url&&!document.getElementById("contentStoragePath").value.trim()){
          setMediaFields(mediaFromUrl(url));
        }
      };
      urlInput.onchange=updateExternalUrl;
      urlInput.onblur=updateExternalUrl;
    }
    if(zone){
      zone.ondragover=e=>{
        e.preventDefault();
        zone.classList.add("drag-over");
      };
      zone.ondragleave=()=>zone.classList.remove("drag-over");
      zone.ondrop=e=>{
        e.preventDefault();
        zone.classList.remove("drag-over");
        handleImageFile(e.dataTransfer.files&&e.dataTransfer.files[0]);
      };
      zone.onpaste=e=>{
        const item=[...(e.clipboardData?.items||[])].find(x=>x.type&&x.type.startsWith("image/"));
        if(item)handleImageFile(item.getAsFile());
      };
    }
    bindPreviewZoom();
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
    bindMedia(root);
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
