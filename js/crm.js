(function(){
  const ZL=window.ZL;
  const STAGES=[
    {key:"new",label:"New Lead"},
    {key:"contacted",label:"Contacted"},
    {key:"quoted",label:"Quoted"},
    {key:"negotiating",label:"Negotiating"},
    {key:"won",label:"Won"}
  ];
  const SOURCES=[
    {id:"demo-zalo",slug:"zalo",name:"Zalo",color:"#3b82f6"},
    {id:"demo-facebook",slug:"facebook",name:"Facebook",color:"#2563eb"},
    {id:"demo-website",slug:"website",name:"Website",color:"#10b981"},
    {id:"demo-referral",slug:"referral",name:"Referral",color:"#f59e0b"}
  ];
  const SERVICES=[
    {key:"ai_mentoring",label:"AI mentoring"},
    {key:"website",label:"Website"},
    {key:"portfolio",label:"Portfolio"},
    {key:"pos",label:"POS"},
    {key:"crm",label:"CRM"},
    {key:"automation",label:"Automation"},
    {key:"content",label:"Content"},
    {key:"maintenance",label:"Maintenance"},
    {key:"other",label:"Other"}
  ];
  const DEMO_CARDS=[
    {deal_id:"demo-1",title:"Anh Minh - Quan cafe",stage:"quoted",value_amount:18000000,service_type:"automation",follow_up_at:ZL.addDays(ZL.today(),0)+"T19:30:00",client_id:"client-1",full_name:"Anh Minh",company_name:"Quan cafe",phone:"0989 123 456",tags:["F&B","POS","Automation"],source_slug:"zalo",source_name:"Zalo",source_color:"#3b82f6",detail:"Da nhan tin Zalo, gui bao gia POS mini, hen call 20:00."},
    {deal_id:"demo-2",title:"Spa Linh",stage:"new",value_amount:12000000,service_type:"crm",follow_up_at:ZL.addDays(ZL.today(),1)+"T10:00:00",client_id:"client-2",full_name:"Spa Linh",company_name:"Spa Linh",tags:["Booking","CRM"],source_slug:"facebook",source_name:"Facebook",source_color:"#2563eb",detail:"Lead moi can booking CRM va nhac lich."},
    {deal_id:"demo-3",title:"Salon Tuan Anh",stage:"contacted",value_amount:15000000,service_type:"pos",follow_up_at:ZL.addDays(ZL.today(),0)+"T17:00:00",client_id:"client-3",full_name:"Salon Tuan Anh",company_name:"Salon Tuan Anh",tags:["POS","CRM"],source_slug:"zalo",source_name:"Zalo",source_color:"#3b82f6",detail:"Da trao doi POS + CRM nho gon."},
    {deal_id:"demo-4",title:"Agency Nova",stage:"negotiating",value_amount:30000000,service_type:"website",follow_up_at:ZL.addDays(ZL.today(),2)+"T15:00:00",client_id:"client-4",full_name:"Agency Nova",company_name:"Agency Nova",tags:["Website","SEO"],source_slug:"website",source_name:"Website",source_color:"#10b981",detail:"Dang thuong luong goi website va SEO."},
    {deal_id:"demo-5",title:"Nha hang Tre Viet",stage:"won",value_amount:24000000,service_type:"pos",follow_up_at:"",client_id:"client-5",full_name:"Nha hang Tre Viet",company_name:"Nha hang Tre Viet",tags:["POS","Inventory"],source_slug:"website",source_name:"Website",source_color:"#10b981",detail:"Da chot du an POS + kho, bat dau build MVP."}
  ];
  let rows=[...DEMO_CARDS];
  let sources=[...SOURCES];
  let summary=null;
  let selectedId="demo-1";
  let search="";
  let loading=false;
  let sourceMode="demo";
  let errorText="";
  let addStage="";
  let realtimeChannel=null;
  let connectionOpen=false;
  let authEmail="";
  let authPassword="";
  let currentUserEmail="";
  let draggedDealId="";

  function moneyShort(value){
    const n=Number(value)||0;
    if(n>=1000000000)return (n/1000000000).toFixed(n%1000000000?1:0)+"ty";
    if(n>=1000000)return Math.round(n/1000000)+"tr";
    if(n>=1000)return Math.round(n/1000)+"k";
    return String(n);
  }

  function moneyVnd(value){
    return (Number(value)||0).toLocaleString("vi-VN")+" đ";
  }

  function splitTags(value){
    return String(value||"").split(",").map(item=>item.trim()).filter(Boolean).slice(0,12);
  }

  function inputDateTime(value){
    if(!value)return "";
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return "";
    const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);
    return local.toISOString().slice(0,16);
  }

  function inputToIso(value){
    if(!value)return null;
    const date=new Date(value);
    return Number.isNaN(date.getTime())?null:date.toISOString();
  }

  function serviceOptions(value){
    return SERVICES.map(service=>`<option value="${ZL.escape(service.key)}" ${service.key===value?"selected":""}>${ZL.escape(service.label)}</option>`).join("");
  }

  function stageOptions(value){
    return STAGES.map(stage=>`<option value="${ZL.escape(stage.key)}" ${stage.key===value?"selected":""}>${ZL.escape(stage.label)}</option>`).join("");
  }

  function mergeNote(row,text){
    const line=String(text||"").trim();
    if(!line)return row.detail||"";
    const current=String(row.detail||"").trim();
    if(current.includes(line))return current;
    return current?`${current}\n${line}`:line;
  }

  function patchRows(dealId,patch){
    rows=rows.map(row=>String(row.deal_id)===String(dealId)?normalizeCard({...row,...patch}):row);
  }

  function normalizeCard(card){
    return {
      deal_id:String(card.deal_id||card.id||"deal-"+Math.random().toString(36).slice(2)),
      title:String(card.title||"Lead chưa đặt tên"),
      stage:String(card.stage||"new"),
      value_amount:Number(card.value_amount)||0,
      currency:card.currency||"VND",
      service_type:card.service_type||"other",
      follow_up_at:card.follow_up_at||"",
      expected_close_date:card.expected_close_date||"",
      client_id:card.client_id||"",
      full_name:card.full_name||"",
      company_name:card.company_name||"",
      phone:card.phone||"",
      email:card.email||"",
      zalo_handle:card.zalo_handle||"",
      tags:Array.isArray(card.tags)?card.tags:[],
      source_slug:card.source_slug||"manual",
      source_name:card.source_name||"Manual",
      source_color:card.source_color||"#64748b",
      detail:card.detail||card.notes||""
    };
  }

  function stageRows(stage){
    const q=search.trim().toLowerCase();
    return rows.filter(row=>{
      if(row.stage!==stage)return false;
      if(!q)return true;
      return `${row.title} ${row.full_name} ${row.company_name} ${row.phone} ${row.tags.join(" ")}`.toLowerCase().includes(q);
    });
  }

  function selectedRow(){
    return rows.find(row=>String(row.deal_id)===String(selectedId))||rows[0]||null;
  }

  function calcSummary(){
    const active=rows.filter(row=>row.stage!=="lost");
    const won=rows.filter(row=>row.stage==="won").length;
    const followups=active.filter(row=>row.follow_up_at&&new Date(row.follow_up_at)<=new Date(ZL.addDays(ZL.today(),1)+"T23:59:59")).length;
    return {
      new_leads:rows.filter(row=>row.stage==="new").length,
      due_followups:followups,
      pipeline_value_amount:active.reduce((sum,row)=>sum+Number(row.value_amount||0),0),
      won_count:won,
      total_deals:rows.length,
      unpaid_invoice_amount:Number(summary?.unpaid_invoice_amount)||0,
      upcoming_deadlines:Number(summary?.upcoming_deadlines)||0
    };
  }

  function leadRate(data){
    const total=Number(data.total_deals)||0;
    if(!total)return 0;
    return Math.round(Number(data.won_count||0)/total*100);
  }

  async function loadSources(client){
    const result=await client.from("crm_lead_sources").select("id,slug,name,color").eq("is_active",true).order("name");
    if(!result.error&&Array.isArray(result.data)&&result.data.length)sources=result.data;
  }

  function subscribeRealtime(client){
    if(realtimeChannel||sourceMode!=="supabase")return;
    realtimeChannel=client.channel("zaklife-crm-changes")
      .on("postgres_changes",{event:"*",schema:"public",table:"crm_clients"},()=>load(true))
      .on("postgres_changes",{event:"*",schema:"public",table:"crm_deals"},()=>load(true))
      .on("postgres_changes",{event:"*",schema:"public",table:"crm_tasks"},()=>load(true))
      .on("postgres_changes",{event:"*",schema:"public",table:"crm_invoices"},()=>load(true))
      .subscribe();
  }

  async function load(force=false){
    if(loading)return;
    if(!force&&sourceMode!=="demo")return;
    if(!ZL.supabase?.hasConfig()){
      sourceMode="demo";
      currentUserEmail="";
      errorText="";
      rows=[...DEMO_CARDS];
      sources=[...SOURCES];
      summary=null;
      return;
    }
    loading=true;
    try{
      const client=ZL.supabase.getClient();
      const user=await ZL.supabase.getUser();
      if(!user){
        throw new Error("Da luu Supabase config, nhung chua dang nhap tai khoan CRM.");
      }
      currentUserEmail=user.email||"Supabase user";
      await loadSources(client);
      const cards=await client.from("crm_pipeline_cards").select("*").order("updated_at",{ascending:false});
      if(cards.error)throw cards.error;
      const sum=await client.from("crm_dashboard_summary").select("*").maybeSingle();
      if(sum.error)throw sum.error;
      const clientIds=[...new Set((cards.data||[]).map(card=>card.client_id).filter(Boolean))];
      const clientNotes=new Map();
      if(clientIds.length){
        const notes=await client.from("crm_clients").select("id,notes,metadata").in("id",clientIds);
        if(!notes.error){
          (notes.data||[]).forEach(item=>clientNotes.set(item.id,item.notes||item.metadata?.customer_notes||""));
        }
      }
      sourceMode="supabase";
      errorText="";
      rows=(cards.data||[]).map(card=>normalizeCard({...card,detail:card.detail||clientNotes.get(card.client_id)||""}));
      summary=sum.data||null;
      if(rows.length&&!rows.some(row=>String(row.deal_id)===String(selectedId)))selectedId=rows[0].deal_id;
      subscribeRealtime(client);
    }catch(e){
      sourceMode="demo";
      currentUserEmail="";
      errorText=e.message||"Không đọc được Supabase, đang dùng demo.";
      rows=[...DEMO_CARDS];
      sources=[...SOURCES];
      summary=null;
    }finally{
      loading=false;
      render();
    }
  }

  function metricCards(){
    const data={...calcSummary(),...(summary||{})};
    const metrics=[
      {label:"Lead mới",value:data.new_leads,trend:"+ realtime",icon:"👥",tone:"green"},
      {label:"Cần follow-up",value:data.due_followups,trend:"Trong 24h",icon:"🕘",tone:"amber"},
      {label:"Pipeline value",value:moneyShort(data.pipeline_value_amount),trend:moneyVnd(data.pipeline_value_amount),icon:"💵",tone:"green"},
      {label:"Tỉ lệ chốt",value:leadRate(data)+"%",trend:`${data.won_count}/${data.total_deals} deal`,icon:"🎯",tone:"green"}
    ];
    return `<div class="crm-metrics">${metrics.map(item=>`<div class="crm-metric ${item.tone}">
      <div class="crm-metric-icon">${item.icon}</div>
      <div><span>${ZL.escape(item.label)}</span><strong>${ZL.escape(item.value)}</strong><em>${ZL.escape(item.trend)}</em></div>
    </div>`).join("")}</div>`;
  }

  function sourceChip(row){
    const color=row.source_color||"#64748b";
    return `<span class="crm-source" style="--source:${ZL.escape(color)}">${ZL.escape(row.source_name||row.source_slug||"Manual")}</span>`;
  }

  function tagList(tags){
    return (Array.isArray(tags)?tags:[]).slice(0,3).map(tag=>`<span>${ZL.escape(tag)}</span>`).join("");
  }

  function dueText(value){
    if(!value)return "Chưa hẹn";
    const d=new Date(value);
    if(Number.isNaN(d.getTime()))return String(value).slice(0,16);
    return d.toLocaleString("vi-VN",{weekday:"short",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
  }

  function dealCard(row){
    return `<button class="crm-deal-card ${String(selectedId)===String(row.deal_id)?"active":""}" data-crm-select="${ZL.escape(row.deal_id)}" data-crm-deal-id="${ZL.escape(row.deal_id)}" draggable="true">
      <div class="crm-deal-head"><strong>${ZL.escape(row.title)}</strong>${sourceChip(row)}</div>
      <p>${ZL.escape(row.service_type||"other")}</p>
      <div class="crm-deal-tags">${tagList(row.tags)}</div>
      <div class="crm-deal-foot"><span>${moneyShort(row.value_amount)}</span><em>${dueText(row.follow_up_at)}</em></div>
    </button>`;
  }

  function board(){
    return `<div class="crm-board">
      ${STAGES.map(stage=>{
        const list=stageRows(stage.key);
        return `<section class="crm-column" data-crm-stage="${ZL.escape(stage.key)}">
          <div class="crm-column-head"><h2>${stage.label}</h2><span>${list.length}</span><button data-crm-add="${stage.key}" title="Thêm lead">+</button></div>
          <div class="crm-column-list" data-crm-stage="${ZL.escape(stage.key)}">${list.length?list.map(dealCard).join(""):`<div class="empty slim">Trống</div>`}</div>
          <button class="crm-add-row" data-crm-add="${stage.key}">+ Thêm lead</button>
        </section>`;
      }).join("")}
    </div>`;
  }

  function detailPanel(){
    const row=selectedRow();
    if(!row)return `<aside class="crm-detail"><div class="empty">Chưa có lead</div></aside>`;
    return `<aside class="crm-detail">
      <div class="crm-detail-head">
        <div><h2>${ZL.escape(row.title)}</h2>${sourceChip(row)}</div>
        <button class="icon-btn" data-crm-close-detail>×</button>
      </div>
      <form class="crm-edit-form" id="crmLeadForm">
        <div class="field"><label>Tên deal / nhu cầu</label><input id="crmEditTitle" value="${ZL.escape(row.title)}"></div>
        <div class="crm-form-grid">
          <div class="field"><label>Tên khách</label><input id="crmEditName" value="${ZL.escape(row.full_name||row.company_name||"")}"></div>
          <div class="field"><label>SĐT / Zalo</label><input id="crmEditPhone" value="${ZL.escape(row.phone||row.zalo_handle||"")}"></div>
        </div>
        <div class="field"><label>Email</label><input id="crmEditEmail" value="${ZL.escape(row.email||"")}"></div>
        <div class="crm-form-grid">
          <div class="field"><label>Giá trị deal</label><input id="crmEditValue" type="number" min="0" step="100000" value="${Number(row.value_amount)||0}"></div>
          <div class="field"><label>Giai đoạn</label><select id="crmEditStage">${stageOptions(row.stage)}</select></div>
        </div>
        <div class="crm-form-grid">
          <div class="field"><label>Nhu cầu</label><select id="crmEditService">${serviceOptions(row.service_type||"other")}</select></div>
          <div class="field"><label>Lịch follow-up</label><input id="crmEditFollowup" type="datetime-local" value="${inputDateTime(row.follow_up_at)}"></div>
        </div>
        <div class="field"><label>Tags</label><input id="crmEditTags" value="${ZL.escape((row.tags||[]).join(", "))}" placeholder="F&B, POS, Automation"></div>
        <div class="field"><label>Ghi chú / sở thích / lưu ý khách</label><textarea id="crmEditNote" placeholder="Khách quan tâm gì, tính cách ra sao, ngân sách, điều cần tránh...">${ZL.escape(row.detail||"")}</textarea></div>
        <button class="btn primary" id="crmSaveDetail" type="submit">Lưu thay đổi</button>
      </form>
      <h3>Hoạt động gần đây</h3>
      <div class="crm-timeline">
        <div><i></i><strong>Lead được ghi nhận</strong><span>${ZL.escape(row.source_name||"Manual")}</span></div>
        <div><i></i><strong>Cần follow-up</strong><span>${dueText(row.follow_up_at)}</span></div>
        <div><i></i><strong>Ghi chú</strong><span>${ZL.escape(row.detail||"Chưa có ghi chú chi tiết.")}</span></div>
      </div>
      <h3>Hành động nhanh</h3>
      <div class="crm-quick-actions">
        <button class="btn sm" data-crm-action="zalo">Ghi log Zalo</button>
        <button class="btn sm" data-crm-action="task">Tạo task</button>
        <button class="btn sm" data-crm-action="quote">Đã báo giá</button>
      </div>
      <div class="crm-project-hint">
        <strong>Dự án sẽ tự tạo nếu chốt deal</strong>
        <p>Checklist mẫu: khảo sát yêu cầu, thiết kế hệ thống, triển khai, test, bàn giao.</p>
      </div>
    </aside>`;
  }

  function bottomPanels(){
    const bySource=sources.map(source=>{
      const count=rows.filter(row=>row.source_slug===source.slug).length;
      return {source,count};
    }).filter(item=>item.count);
    const deadlines=rows.filter(row=>row.expected_close_date).slice(0,4);
    return `<div class="crm-bottom-grid">
      <div class="panel">
        <div class="panel-title"><div><h2>Lead source effectiveness</h2><p>Nguồn nào đang mang lead về</p></div></div>
        <div class="crm-source-bars">${bySource.length?bySource.map(({source,count})=>`<div><span style="--source:${ZL.escape(source.color||"#10b981")}"></span><strong>${ZL.escape(source.name)}</strong><em>${count} lead</em></div>`).join(""):`<div class="empty slim">Chưa có nguồn</div>`}</div>
      </div>
      <div class="panel">
        <div class="panel-title"><div><h2>Unpaid invoices</h2><p>Theo dõi tiền cần thu</p></div></div>
        <div class="crm-money-large">${moneyVnd(calcSummary().unpaid_invoice_amount)}</div>
        <p class="muted small">Khi noi Supabase that, so nay doc tu crm_invoices.</p>
      </div>
      <div class="panel">
        <div class="panel-title"><div><h2>Upcoming project deadlines</h2><p>Deal / dự án sắp tới hạn</p></div></div>
        <div class="crm-deadlines">${deadlines.length?deadlines.map(row=>`<div><strong>${ZL.escape(row.title)}</strong><span>${ZL.escape(row.expected_close_date)}</span></div>`).join(""):`<div class="empty slim">Chưa có deadline</div>`}</div>
      </div>
    </div>`;
  }

  function addLeadModal(){
    if(!addStage)return "";
    return `<div class="task-modal">
      <div class="task-modal-card crm-modal-card">
        <div class="panel-title"><div><h2>Thêm lead</h2><p>${ZL.escape(addStage)}</p></div><button class="icon-btn" id="crmCloseModal">×</button></div>
        <div class="grid grid-2">
          <div class="field"><label>Tên khách</label><input id="crmLeadName" placeholder="VD: Anh Minh"></div>
          <div class="field"><label>Công ty / quán</label><input id="crmLeadCompany" placeholder="VD: Quán cafe"></div>
        </div>
        <div class="grid grid-2">
          <div class="field"><label>SĐT / Zalo</label><input id="crmLeadPhone" placeholder="090..."></div>
          <div class="field"><label>Nguồn</label><select id="crmLeadSource">${sources.map(source=>`<option value="${ZL.escape(source.id)}">${ZL.escape(source.name)}</option>`).join("")}</select></div>
        </div>
        <div class="grid grid-2">
          <div class="field"><label>Nhu cầu</label><input id="crmDealTitle" placeholder="POS + automation"></div>
          <div class="field"><label>Giá trị dự kiến</label><input id="crmDealValue" type="number" placeholder="18000000"></div>
        </div>
        <div class="field"><label>Ghi chú</label><textarea id="crmLeadNote" placeholder="Khách cần gì, đã nói gì, bước tiếp theo..."></textarea></div>
        <button class="btn primary" id="crmSaveLead">Lưu lead</button>
      </div>
    </div>`;
  }

  function connectionModal(){
    if(!connectionOpen)return "";
    const config=ZL.supabase?.readConfig?.()||{};
    return `<div class="task-modal">
      <div class="task-modal-card crm-modal-card">
        <div class="panel-title"><div><h2>Kết nối Supabase CRM</h2><p>Chỉ dùng URL + anon key public. Không nhập service_role ở frontend.</p></div><button class="icon-btn" id="crmCloseConnection">×</button></div>
        <div class="grid">
          <div class="field"><label>Supabase URL</label><input id="crmSupabaseUrl" value="${ZL.escape(config.url||"")}" placeholder="https://xxx.supabase.co"></div>
          <div class="field"><label>Anon / publishable key</label><input id="crmSupabaseAnon" value="${ZL.escape(config.anonKey||"")}" placeholder="eyJ..."></div>
        </div>
        <div class="crm-modal-actions">
          <button class="btn primary" id="crmSaveSupabaseConfig">Lưu cấu hình</button>
          <button class="btn danger" id="crmClearSupabaseConfig">Xóa cấu hình</button>
        </div>
        <div class="crm-auth-box">
          <div class="grid grid-2">
            <div class="field"><label>Email CRM</label><input id="crmAuthEmail" value="${ZL.escape(authEmail)}" placeholder="anh@example.com"></div>
            <div class="field"><label>Mật khẩu</label><input id="crmAuthPassword" type="password" value="${ZL.escape(authPassword)}" placeholder="••••••••"></div>
          </div>
          <div class="crm-modal-actions">
            <button class="btn primary" id="crmSignInSupabase">Đăng nhập</button>
            <button class="btn" id="crmSignOutSupabase">Đăng xuất</button>
          </div>
          <p class="muted small">Sau khi đăng nhập, tài khoản cần có dòng trong <code>crm_members</code> với role <code>owner</code> hoặc <code>admin</code>.</p>
        </div>
      </div>
    </div>`;
  }

  function render(){
    const root=document.getElementById("crmRoot");
    if(!root)return;
    root.innerHTML=`<div class="crm-shell">
      <div class="crm-toolbar">
        <div class="crm-search"><span>⌕</span><input id="crmSearch" value="${ZL.escape(search)}" placeholder="Tìm lead, deal, dự án"></div>
        <div class="crm-toolbar-actions">
          <span class="badge ${sourceMode==="supabase"?"success":"warning"}">${sourceMode==="supabase"?"Supabase":"Demo"}</span>
          ${currentUserEmail?`<span class="badge">${ZL.escape(currentUserEmail)}</span>`:""}
          <button class="btn sm" id="crmOpenConnection">Kết nối</button>
          <button class="btn sm" id="crmReload">${loading?"Đang tải":"Đồng bộ"}</button>
          <button class="btn primary sm" data-crm-add="new">+ Lead</button>
        </div>
      </div>
      ${errorText?`<div class="crm-warning">${ZL.escape(errorText)}</div>`:""}
      ${metricCards()}
      <div class="crm-main-grid">
        ${board()}
        ${detailPanel()}
      </div>
      ${bottomPanels()}
      ${addLeadModal()}
      ${connectionModal()}
    </div>`;
    bind();
  }

  async function createLead(){
    const fullName=document.getElementById("crmLeadName").value.trim();
    const company=document.getElementById("crmLeadCompany").value.trim();
    const phone=document.getElementById("crmLeadPhone").value.trim();
    const sourceId=document.getElementById("crmLeadSource").value;
    const title=document.getElementById("crmDealTitle").value.trim()||company||fullName||"Lead mới";
    const value=Number(document.getElementById("crmDealValue").value)||0;
    const note=document.getElementById("crmLeadNote").value.trim();
    if(!fullName&&!company){ZL.toast("Nhập tên khách hoặc tên doanh nghiệp");return;}
    if(sourceMode!=="supabase"){
      const source=sources.find(item=>String(item.id)===String(sourceId))||sources[0]||{};
      const row=normalizeCard({
        deal_id:"demo-"+Date.now(),
        title,
        stage:addStage||"new",
        value_amount:value,
        service_type:"other",
        follow_up_at:ZL.addDays(ZL.today(),1)+"T09:00:00",
        full_name:fullName,
        company_name:company,
        phone,
        tags:["Manual"],
        source_slug:source.slug,
        source_name:source.name,
        source_color:source.color,
        detail:note
      });
      rows=[row,...rows];
      selectedId=row.deal_id;
      addStage="";
      ZL.toast("Đã thêm lead demo");
      render();
      return;
    }
    try{
      const client=ZL.supabase.getClient();
      const clientInsert=await client.from("crm_clients").insert({
        full_name:fullName||company,
        company_name:company||null,
        phone:phone||null,
        source_id:sourceId||null,
        tags:["Manual"],
        notes:note||null
      }).select("id").single();
      if(clientInsert.error)throw clientInsert.error;
      const dealInsert=await client.from("crm_deals").insert({
        client_id:clientInsert.data.id,
        title,
        stage:addStage||"new",
        value_amount:value,
        service_type:"other",
        follow_up_at:ZL.addDays(ZL.today(),1)+"T09:00:00+07:00"
      }).select("id").single();
      if(dealInsert.error)throw dealInsert.error;
      if(note){
        await client.from("crm_interactions").insert({
          client_id:clientInsert.data.id,
          deal_id:dealInsert.data.id,
          type:"note",
          title:"Ghi chú lead",
          content:note
        });
      }
      selectedId=dealInsert.data.id;
      addStage="";
      ZL.toast("Đã lưu lead vào Supabase");
      await load(true);
    }catch(e){
      ZL.toast(e.message||"Không lưu được lead");
    }
  }

  async function moveDeal(dealId,stage){
    const row=rows.find(item=>String(item.deal_id)===String(dealId));
    if(!row||row.stage===stage)return;
    if(sourceMode!=="supabase"){
      patchRows(dealId,{stage});
      selectedId=dealId;
      ZL.toast("Đã chuyển lead sang "+(STAGES.find(item=>item.key===stage)?.label||stage));
      render();
      return;
    }
    try{
      const client=ZL.supabase.getClient();
      const result=await client.from("crm_deals").update({stage}).eq("id",dealId);
      if(result.error)throw result.error;
      patchRows(dealId,{stage});
      selectedId=dealId;
      ZL.toast("Đã cập nhật giai đoạn lead");
      await load(true);
    }catch(e){
      ZL.toast(e.message||"Không kéo thả được lead");
      render();
    }
  }

  async function saveLeadDetail(){
    const row=selectedRow();
    if(!row)return;
    const title=(document.getElementById("crmEditTitle")?.value||"").trim()||row.title;
    const fullName=(document.getElementById("crmEditName")?.value||"").trim()||title;
    const phone=(document.getElementById("crmEditPhone")?.value||"").trim();
    const email=(document.getElementById("crmEditEmail")?.value||"").trim();
    const value=Number(document.getElementById("crmEditValue")?.value)||0;
    const stage=document.getElementById("crmEditStage")?.value||row.stage;
    const service=document.getElementById("crmEditService")?.value||"other";
    const followUp=inputToIso(document.getElementById("crmEditFollowup")?.value||"");
    const tags=splitTags(document.getElementById("crmEditTags")?.value||"");
    const note=(document.getElementById("crmEditNote")?.value||"").trim();
    const patch={
      title,
      full_name:fullName,
      phone,
      email,
      value_amount:value,
      stage,
      service_type:service,
      follow_up_at:followUp||"",
      tags,
      detail:note
    };
    if(sourceMode!=="supabase"){
      patchRows(row.deal_id,patch);
      ZL.toast("Đã lưu lead demo");
      render();
      return;
    }
    try{
      const client=ZL.supabase.getClient();
      const clientResult=await client.from("crm_clients").update({
        full_name:fullName,
        phone:phone||null,
        email:email||null,
        tags,
        notes:note||null
      }).eq("id",row.client_id);
      if(clientResult.error)throw clientResult.error;
      const dealResult=await client.from("crm_deals").update({
        title,
        value_amount:value,
        stage,
        service_type:service,
        follow_up_at:followUp
      }).eq("id",row.deal_id);
      if(dealResult.error)throw dealResult.error;
      patchRows(row.deal_id,patch);
      ZL.toast("Đã lưu thay đổi lead");
      await load(true);
    }catch(e){
      ZL.toast(e.message||"Không lưu được thay đổi lead");
    }
  }

  async function persistQuickAction(row,type,title,content,dealPatch={}){
    const stamp=new Date().toLocaleString("vi-VN",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
    const line=`[${stamp}] ${content}`;
    const detail=mergeNote(row,line);
    if(sourceMode!=="supabase"){
      patchRows(row.deal_id,{...dealPatch,detail});
      ZL.toast(title);
      render();
      return;
    }
    const client=ZL.supabase.getClient();
    const interaction=await client.from("crm_interactions").insert({
      client_id:row.client_id,
      deal_id:row.deal_id,
      type,
      title,
      content
    });
    if(interaction.error)throw interaction.error;
    const noteResult=await client.from("crm_clients").update({notes:detail}).eq("id",row.client_id);
    if(noteResult.error)throw noteResult.error;
    if(Object.keys(dealPatch).length){
      const dealResult=await client.from("crm_deals").update(dealPatch).eq("id",row.deal_id);
      if(dealResult.error)throw dealResult.error;
    }
    patchRows(row.deal_id,{...dealPatch,detail});
    await load(true);
  }

  async function handleQuickAction(action){
    const row=selectedRow();
    if(!row)return;
    try{
      if(action==="zalo"){
        const content=window.prompt("Ghi lại nội dung đã trao đổi trên Zalo:",`Đã nhắn Zalo với ${row.full_name||row.title}.`);
        if(!content)return;
        await persistQuickAction(row,"zalo","Đã ghi log Zalo",content);
        ZL.toast("Đã lưu log Zalo");
      }else if(action==="quote"){
        const content=window.prompt("Ghi chú báo giá:",`Đã gửi báo giá ${moneyVnd(row.value_amount)} cho ${row.title}.`);
        if(!content)return;
        await persistQuickAction(row,"note","Đã đánh dấu báo giá",content,{stage:"quoted",probability:55});
        selectedId=row.deal_id;
        ZL.toast("Đã chuyển sang Quoted");
      }else if(action==="task"){
        const title=window.prompt("Task cần làm tiếp theo:",`Follow-up ${row.title}`);
        if(!title)return;
        if(sourceMode!=="supabase"){
          await persistQuickAction(row,"note","Đã tạo task demo",`Task: ${title}`);
          ZL.toast("Đã ghi task demo vào note");
          return;
        }
        const client=ZL.supabase.getClient();
        const task=await client.from("crm_tasks").insert({
          client_id:row.client_id,
          deal_id:row.deal_id,
          title,
          status:"todo",
          priority:"high",
          due_at:ZL.addDays(ZL.today(),1)+"T09:00:00+07:00"
        });
        if(task.error)throw task.error;
        await persistQuickAction(row,"system","Đã tạo task",`Task: ${title}`);
        ZL.toast("Đã tạo task follow-up");
      }
    }catch(e){
      ZL.toast(e.message||"Không thực hiện được hành động CRM");
    }
  }

  function saveConnectionConfig(){
    const url=document.getElementById("crmSupabaseUrl")?.value||"";
    const anonKey=document.getElementById("crmSupabaseAnon")?.value||"";
    ZL.supabase.saveConfig({url,anonKey});
    ZL.toast("Đã lưu Supabase config");
    load(true);
  }

  async function signInConnection(){
    authEmail=(document.getElementById("crmAuthEmail")?.value||authEmail).trim();
    authPassword=document.getElementById("crmAuthPassword")?.value||authPassword;
    if(!authEmail||!authPassword){ZL.toast("Nhập email và mật khẩu Supabase");return;}
    try{
      const client=ZL.supabase.getClient();
      const result=await client.auth.signInWithPassword({email:authEmail,password:authPassword});
      if(result.error)throw result.error;
      authPassword="";
      connectionOpen=false;
      ZL.toast("Đã đăng nhập Supabase");
      await load(true);
    }catch(e){
      ZL.toast(e.message||"Không đăng nhập được Supabase");
    }
  }

  async function signOutConnection(){
    try{
      const client=ZL.supabase.getClient();
      await client.auth.signOut();
    }catch(e){}
    sourceMode="demo";
    currentUserEmail="";
    rows=[...DEMO_CARDS];
    summary=null;
    ZL.toast("Đã đăng xuất Supabase");
    render();
  }

  function bind(){
    document.getElementById("crmSearch")?.addEventListener("input",e=>{search=e.target.value;render();});
    document.getElementById("crmOpenConnection")?.addEventListener("click",()=>{connectionOpen=true;render();});
    document.getElementById("crmReload")?.addEventListener("click",()=>load(true));
    document.querySelectorAll("[data-crm-select]").forEach(btn=>btn.addEventListener("click",()=>{
      selectedId=btn.dataset.crmSelect;
      render();
    }));
    document.querySelectorAll("[data-crm-deal-id]").forEach(card=>{
      card.addEventListener("dragstart",event=>{
        draggedDealId=card.dataset.crmDealId||"";
        card.classList.add("dragging");
        event.dataTransfer.effectAllowed="move";
        event.dataTransfer.setData("text/plain",draggedDealId);
      });
      card.addEventListener("dragend",()=>{
        draggedDealId="";
        document.querySelectorAll(".crm-column.drop-target,.crm-deal-card.dragging").forEach(el=>el.classList.remove("drop-target","dragging"));
      });
    });
    document.querySelectorAll("[data-crm-stage]").forEach(zone=>{
      zone.addEventListener("dragover",event=>{
        if(!draggedDealId)return;
        event.preventDefault();
        zone.closest(".crm-column")?.classList.add("drop-target");
      });
      zone.addEventListener("dragleave",event=>{
        if(zone.contains(event.relatedTarget))return;
        zone.closest(".crm-column")?.classList.remove("drop-target");
      });
      zone.addEventListener("drop",event=>{
        event.preventDefault();
        const stage=zone.dataset.crmStage||zone.closest("[data-crm-stage]")?.dataset.crmStage;
        document.querySelectorAll(".crm-column.drop-target").forEach(el=>el.classList.remove("drop-target"));
        if(stage&&draggedDealId)moveDeal(draggedDealId,stage);
      });
    });
    document.querySelectorAll("[data-crm-add]").forEach(btn=>btn.addEventListener("click",()=>{
      addStage=btn.dataset.crmAdd||"new";
      render();
    }));
    document.getElementById("crmLeadForm")?.addEventListener("submit",event=>{
      event.preventDefault();
      saveLeadDetail();
    });
    document.querySelectorAll("[data-crm-action]").forEach(btn=>btn.addEventListener("click",()=>handleQuickAction(btn.dataset.crmAction)));
    document.getElementById("crmCloseModal")?.addEventListener("click",()=>{addStage="";render();});
    document.getElementById("crmSaveLead")?.addEventListener("click",createLead);
    document.getElementById("crmCloseConnection")?.addEventListener("click",()=>{connectionOpen=false;render();});
    document.getElementById("crmSaveSupabaseConfig")?.addEventListener("click",saveConnectionConfig);
    document.getElementById("crmClearSupabaseConfig")?.addEventListener("click",()=>{
      ZL.supabase.clearConfig();
      sourceMode="demo";
      currentUserEmail="";
      errorText="";
      connectionOpen=false;
      rows=[...DEMO_CARDS];
      summary=null;
      ZL.toast("Đã xóa Supabase config");
      render();
    });
    document.getElementById("crmSignInSupabase")?.addEventListener("click",signInConnection);
    document.getElementById("crmSignOutSupabase")?.addEventListener("click",signOutConnection);
  }

  ZL.modules.crm={render:()=>{render();load();}};
})();
