(function(){
  const ZL=window.ZL;
  let selectedDate=ZL.today();
  let selectedDateTouched=false;
  let cashRange="all";

  function activeItems(value){
    return ZL.normalizeList(value).filter(item=>!item._deleted);
  }

  function statusBadge(inv){
    if(inv.cancelled)return `<span class="badge danger">Đã hủy</span>`;
    if(inv.method==="staff")return `<span class="badge blue">Nội bộ</span>`;
    if(inv.method==="grab")return `<span class="badge warning">Grab</span>`;
    return `<span class="badge success">Hoàn tất</span>`;
  }

  function itemText(inv){
    return (inv.items||[]).map(i=>`${ZL.escape(i.name||"Món")} x${Number(i.qty)||1}`).join("<br>")||"<span class='muted'>Không có món</span>";
  }

  function renderTopItems(items){
    if(!items.length)return `<div class="empty">Chưa có món bán</div>`;
    return items.slice(0,5).map((item,idx)=>`<div class="agent-row">
      <div><div class="item-title">${idx+1}. ${ZL.escape(item.name)}</div><div class="item-meta">${item.qty} lượt bán</div></div>
      <div class="money">${ZL.money(item.revenue)}</div>
    </div>`).join("");
  }

  function parseDateKey(key){
    const m=String(key||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m?new Date(Number(m[1]),Number(m[2])-1,Number(m[3])):new Date();
  }

  function dateBetween(startKey,endKey){
    const out=[];
    let start=parseDateKey(startKey),end=parseDateKey(endKey);
    if(start>end){const tmp=start;start=end;end=tmp;}
    for(const d=new Date(start);d<=end;d.setDate(d.getDate()+1))out.push(ZL.dateKey(d));
    return out;
  }

  function recentDates(days){
    const out=[];
    const base=parseDateKey(ZL.today());
    for(let i=days-1;i>=0;i--){
      const d=new Date(base);
      d.setDate(d.getDate()-i);
      out.push(ZL.dateKey(d));
    }
    return out;
  }

  function allFinancialDates(){
    const pos=ZL.state.pos||{};
    const keys=new Set(Object.keys(pos.history||{}));
    Object.keys(pos.attendance||{}).forEach(k=>keys.add(k));
    Object.keys(pos.purchases||{}).forEach(k=>keys.add(k));
    Object.keys(pos.expenses||{}).forEach(k=>keys.add(k));
    activeItems(pos.salaryPayments).forEach(p=>{
      if(p.paidDate)keys.add(p.paidDate);
      if(p.periodStart)keys.add(p.periodStart);
      if(p.periodEnd)keys.add(p.periodEnd);
    });
    return [...keys].filter(k=>/^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
  }

  function dateRange(key){
    const today=ZL.today();
    if(key==="all"){
      const keys=allFinancialDates();
      if(!keys.length)return {dates:[today],label:"Toàn bộ thời gian",allTime:true,start:today,end:today};
      const end=keys[keys.length-1]>today?keys[keys.length-1]:today;
      return {dates:dateBetween(keys[0],end),label:"Toàn bộ thời gian",allTime:true,start:keys[0],end};
    }
    if(key==="month"){
      const d=parseDateKey(today);
      const start=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`;
      return {dates:dateBetween(start,today),label:"Tháng này",start,end:today};
    }
    if(key==="3m"){
      const d=parseDateKey(today);
      d.setMonth(d.getMonth()-2);d.setDate(1);
      const start=ZL.dateKey(d);
      return {dates:dateBetween(start,today),label:"3 tháng",start,end:today};
    }
    if(key==="6m"){
      const d=parseDateKey(today);
      d.setMonth(d.getMonth()-5);d.setDate(1);
      const start=ZL.dateKey(d);
      return {dates:dateBetween(start,today),label:"6 tháng",start,end:today};
    }
    if(key==="1y"){
      const dates=recentDates(365);
      return {dates,label:"1 năm",start:dates[0],end:dates[dates.length-1]};
    }
    return {dates:[today],label:"Hôm nay",start:today,end:today};
  }

  function latestRevenueDate(){
    const pos=ZL.state.pos||{};
    const dates=new Set(Object.keys(pos.history||{}));
    Object.keys(pos.invoiceArchive||{}).forEach(d=>dates.add(d));
    activeItems(pos.todayInvoices).forEach(inv=>{if(inv.date)dates.add(inv.date);});
    const sorted=[...dates].filter(Boolean).sort();
    for(let i=sorted.length-1;i>=0;i--){
      const stats=ZL.invoiceStats(sorted[i]);
      if(stats.total||stats.count)return sorted[i];
    }
    return ZL.today();
  }

  function ensureSelectedDate(){
    if(selectedDateTouched)return;
    const stats=ZL.invoiceStats(selectedDate);
    if(selectedDate===ZL.today()&&!stats.total&&!stats.count)selectedDate=latestRevenueDate();
  }

  function eachSoldEntry(dayData,cb){
    if(!dayData)return;
    const pos=ZL.state.pos||{};
    const byId=dayData.itemsSoldById&&Object.keys(dayData.itemsSoldById).length?dayData.itemsSoldById:null;
    if(byId){
      Object.entries(byId).forEach(([menuId,data])=>{
        const menuItem=activeItems(pos.menu).find(m=>String(m.id)===String(menuId));
        cb({menuId,name:data.name||menuItem?.name||String(menuId),qty:Number(data.qty)||0,revenue:Number(data.revenue)||0});
      });
      return;
    }
    Object.entries(dayData.itemsSold||{}).forEach(([name,data])=>{
      const menuItem=activeItems(pos.menu).find(m=>m.name===name);
      cb({menuId:menuItem?.id,name,qty:Number(data.qty)||0,revenue:Number(data.revenue)||0});
    });
  }

  function collectSalesForDates(dates){
    const pos=ZL.state.pos||{};
    let totalRevenue=0,totalInvoices=0,cashTotal=0,transferTotal=0,grabTotal=0,grabNet=0;
    const itemMap={};
    dates.forEach(date=>{
      const day=(pos.history||{})[date];
      if(!day)return;
      totalRevenue+=Number(day.totalRevenue)||0;
      totalInvoices+=Number(day.invoices)||0;
      cashTotal+=Number(day.cashTotal)||0;
      transferTotal+=Number(day.transferTotal)||0;
      grabTotal+=Number(day.grabTotal)||0;
      grabNet+=Number(day.grabNet)||Number(day.grabTotal)||0;
      eachSoldEntry(day,entry=>{
        if(!itemMap[entry.name])itemMap[entry.name]={name:entry.name,qty:0,revenue:0};
        itemMap[entry.name].qty+=entry.qty;
        itemMap[entry.name].revenue+=entry.revenue;
      });
    });
    const transferNonGrab=Math.max(0,transferTotal-grabTotal);
    const realRevenue=(cashTotal||transferTotal||grabTotal||grabNet)
      ? cashTotal+transferNonGrab+grabNet
      : totalRevenue-Math.max(0,grabTotal-grabNet);
    return {
      dates,totalRevenue,totalInvoices,cashTotal,transferTotal,grabTotal,grabNet,
      grabFee:Math.max(0,grabTotal-grabNet),
      realRevenue,
      topItems:Object.values(itemMap).sort((a,b)=>b.qty-a.qty||b.revenue-a.revenue)
    };
  }

  function calcIngredientCostForDates(dates){
    const pos=ZL.state.pos||{};
    let total=0;
    dates.forEach(date=>{
      eachSoldEntry((pos.history||{})[date],entry=>{
        const recipe=entry.menuId!==undefined?((pos.recipes||{})[entry.menuId]||[]):[];
        recipe.forEach(r=>{
          const ing=activeItems(pos.ingredients).find(i=>i.id===r.ingId);
          if(ing)total+=(Number(r.qty)||0)*(Number(entry.qty)||0)*(Number(ing.unitPrice)||0);
        });
      });
    });
    return Math.round(total);
  }

  function calcWageForRecord(record,staff){
    const otHour=22*60,otMult=1.3;
    if(!record.checkIn||!record.checkOut||!record.hours)return {total:0};
    const rate=Number(record.wageRate)||Number(staff?.wageRate)||25000;
    const [iH,iM]=String(record.checkIn).split(":").map(Number);
    const [oH,oM]=String(record.checkOut).split(":").map(Number);
    const inMin=(iH||0)*60+(iM||0),outMin=(oH||0)*60+(oM||0);
    let normalH=Number(record.hours)||0,otH=0;
    if(outMin>otHour){
      normalH=Math.max(0,(Math.min(outMin,otHour)-inMin)/60);
      otH=Math.max(0,(outMin-Math.max(inMin,otHour))/60);
    }
    return {total:Math.round(normalH*rate+otH*rate*otMult)};
  }

  function calcLaborBreakdown(dates){
    const pos=ZL.state.pos||{};
    const byStaff=new Map();
    activeItems(pos.staff).forEach(staff=>byStaff.set(String(staff.id),{staffId:staff.id,staffName:staff.name,days:0,totalH:0,totalWage:0}));
    dates.forEach(date=>{
      activeItems((pos.attendance||{})[date]).forEach(record=>{
        if(!record.checkIn||!record.checkOut||!record.hours)return;
        const staff=activeItems(pos.staff).find(s=>String(s.id)===String(record.staffId));
        const key=String(record.staffId||record.name||"unknown");
        if(!byStaff.has(key))byStaff.set(key,{staffId:record.staffId||key,staffName:record.name||staff?.name||"Nhân viên",days:0,totalH:0,totalWage:0});
        const row=byStaff.get(key);
        row.days+=1;
        row.totalH+=Number(record.hours)||0;
        row.totalWage+=calcWageForRecord(record,staff).total;
      });
    });
    const staff=[...byStaff.values()].map(row=>({...row,totalWage:Math.round(row.totalWage)}));
    return {total:staff.reduce((sum,row)=>sum+row.totalWage,0),staff};
  }

  function sumBucket(dates,bucket,field){
    let total=0;
    dates.forEach(date=>activeItems((bucket||{})[date]).forEach(row=>{total+=Number(row[field])||0;}));
    return Math.round(total);
  }

  function paymentInPeriod(payment,range){
    if(range.allTime)return true;
    const start=payment.periodStart||payment.paidDate;
    const end=payment.periodEnd||start;
    return start>=range.start&&end<=range.end;
  }

  function paymentPaidInDates(payment,dateSet){
    return payment.paidDate&&dateSet.has(payment.paidDate);
  }

  function financialData(){
    const pos=ZL.state.pos||{};
    const range=dateRange(cashRange);
    const dates=range.dates||[];
    const dateSet=new Set(dates);
    const sales=collectSalesForDates(dates);
    const ingredientCost=calcIngredientCostForDates(dates);
    const labor=calcLaborBreakdown(dates);
    const purchasesCost=sumBucket(dates,pos.purchases,"totalCost");
    const otherExpenses=sumBucket(dates,pos.expenses,"amount");
    const payments=activeItems(pos.salaryPayments);
    const salaryPaidForPeriod=payments.filter(p=>paymentInPeriod(p,range)).reduce((sum,p)=>sum+(Number(p.amount)||0),0);
    const salaryPaidCashOut=payments.filter(p=>paymentPaidInDates(p,dateSet)).reduce((sum,p)=>sum+(Number(p.amount)||0),0);
    const salaryRemaining=Math.max(0,labor.total-salaryPaidForPeriod);
    const cashOutPaid=purchasesCost+otherExpenses+salaryPaidCashOut;
    const cashNet=sales.realRevenue-cashOutPaid;
    const netProfit=sales.realRevenue-ingredientCost-labor.total-otherExpenses;
    const netAfterPayables=cashNet-salaryRemaining;
    const dailyRows=dates.map(date=>{
      const ds=collectSalesForDates([date]);
      const dp=sumBucket([date],pos.purchases,"totalCost");
      const doe=sumBucket([date],pos.expenses,"amount");
      const dsp=payments.filter(p=>p.paidDate===date).reduce((sum,p)=>sum+(Number(p.amount)||0),0);
      const dlabor=calcLaborBreakdown([date]);
      const dcogs=calcIngredientCostForDates([date]);
      return {date,revenue:ds.realRevenue,purchases:dp,otherExpenses:doe,salaryPaid:dsp,cashNet:ds.realRevenue-dp-doe-dsp,netProfit:ds.realRevenue-dcogs-dlabor.total-doe};
    });
    return {range,sales,ingredientCost,labor,purchasesCost,otherExpenses,salaryPaidForPeriod,salaryPaidCashOut,salaryRemaining,cashOutPaid,cashNet,netProfit,netAfterPayables,dailyRows};
  }

  function renderCashflow(){
    const data=financialData();
    const labels={all:"Tất cả",month:"Tháng này","3m":"3 tháng","6m":"6 tháng","1y":"1 năm"};
    const visible=data.dailyRows.filter(r=>r.revenue||r.purchases||r.otherExpenses||r.salaryPaid).reverse().slice(0,45);
    return `<div class="panel" style="margin-top:16px">
      <div class="panel-title">
        <div><h2>Dòng tiền & Lương</h2><p>Kỳ: ${data.range.label} · Grab tính theo tiền thực nhận</p></div>
        <div class="segmented">
          ${Object.keys(labels).map(key=>`<button class="${cashRange===key?"active":""}" data-cash-range="${key}">${labels[key]}</button>`).join("")}
        </div>
      </div>
      <div class="grid grid-4 cashflow-cards">
        <div class="stat-card"><div class="stat-label">Tiền vào thực nhận</div><div class="stat-value accent-value">${ZL.money(data.sales.realRevenue)}</div></div>
        <div class="stat-card"><div class="stat-label">Đã chi NL+khác+lương</div><div class="stat-value danger-value">${ZL.money(data.cashOutPaid)}</div></div>
        <div class="stat-card"><div class="stat-label">Dòng tiền</div><div class="stat-value ${data.cashNet>=0?"accent-value":"danger-value"}">${ZL.money(data.cashNet)}</div></div>
        <div class="stat-card"><div class="stat-label">Lãi ròng</div><div class="stat-value ${data.netProfit>=0?"accent-value":"danger-value"}">${ZL.money(data.netProfit)}</div></div>
        <div class="stat-card"><div class="stat-label">Phải trả lương</div><div class="stat-value blue-value">${ZL.money(data.labor.total)}</div></div>
        <div class="stat-card"><div class="stat-label">Đã trả cho kỳ</div><div class="stat-value accent-value">${ZL.money(data.salaryPaidForPeriod)}</div></div>
        <div class="stat-card"><div class="stat-label">Còn phải trả</div><div class="stat-value ${data.salaryRemaining?"danger-value":"accent-value"}">${ZL.money(data.salaryRemaining)}</div></div>
        <div class="stat-card"><div class="stat-label">Sau khi trả lương</div><div class="stat-value ${data.netAfterPayables>=0?"accent-value":"danger-value"}">${ZL.money(data.netAfterPayables)}</div></div>
      </div>
      <details class="details-block">
        <summary>Chi tiết theo ngày</summary>
        <div class="table-scroll">
          <table>
            <thead><tr><th>Ngày</th><th>Tiền vào</th><th>Chi NL/khác</th><th>Lương đã trả</th><th>Dòng tiền</th><th>Lãi ròng</th></tr></thead>
            <tbody>${visible.length?visible.map(r=>`<tr>
              <td>${r.date}</td>
              <td class="money">${ZL.money(r.revenue)}</td>
              <td class="danger-value">${ZL.money(r.purchases+r.otherExpenses)}</td>
              <td class="blue-value">${ZL.money(r.salaryPaid)}</td>
              <td class="${r.cashNet>=0?"accent-value":"danger-value"}">${ZL.money(r.cashNet)}</td>
              <td class="${r.netProfit>=0?"accent-value":"danger-value"}">${ZL.money(r.netProfit)}</td>
            </tr>`).join(""):`<tr><td colspan="6"><div class="empty">Chưa có dòng tiền trong kỳ này</div></td></tr>`}</tbody>
          </table>
        </div>
      </details>
    </div>`;
  }

  function render(){
    const root=document.getElementById("posRoot");
    if(!root)return;
    ensureSelectedDate();
    const stats=ZL.invoiceStats(selectedDate);
    const invoices=stats.invoices.slice().sort((a,b)=>String(b.time||"").localeCompare(String(a.time||"")));
    const auditNote=stats.hasHistory?`Đang dùng số tổng hợp Monstea POS. Hóa đơn thô: ${ZL.money(stats.invoiceTotal)}${stats.diff?` · lệch ${ZL.money(stats.diff)}`:""}`:"Đang dùng hóa đơn thô vì ngày này chưa có history.";
    root.innerHTML=`
      <div class="panel" style="margin-bottom:16px">
        <div class="panel-title">
          <div><h2>Monstea POS Viewer</h2><p>Ngày đang xem</p></div>
          <div style="max-width:190px"><input type="date" id="posDate" value="${selectedDate}"></div>
        </div>
      </div>
      <div class="grid grid-4">
        <div class="stat-card"><div class="stat-label">Doanh thu</div><div class="stat-value accent-value">${ZL.money(stats.total)}</div><div class="stat-note">${stats.hasHistory?"Theo history POS":selectedDate}</div></div>
        <div class="stat-card"><div class="stat-label">Số đơn</div><div class="stat-value">${stats.count}</div><div class="stat-note">Đơn hợp lệ</div></div>
        <div class="stat-card"><div class="stat-label">TB/đơn</div><div class="stat-value blue-value">${ZL.money(stats.avg)}</div><div class="stat-note">Average order value</div></div>
        <div class="stat-card"><div class="stat-label">Món top</div><div class="stat-value warning-value fit-text">${ZL.escape(stats.top?.name||"Chưa có")}</div><div class="stat-note">${stats.top?stats.top.qty+" lượt bán":"--"}</div></div>
      </div>
      <div class="panel" style="margin-top:16px"><div class="item-meta">${ZL.escape(auditNote)}</div></div>
      ${renderCashflow()}
      <div class="layout-2" style="margin-top:16px">
        <div class="table-panel">
          <div class="panel-title" style="padding:16px 16px 0"><div><h2>Hóa đơn</h2><p>${invoices.length} đơn trong ngày</p></div></div>
          <div class="table-scroll">
            <table>
              <thead><tr><th>Mã</th><th>Giờ</th><th>Món</th><th>Tổng</th><th>Trạng thái</th></tr></thead>
              <tbody>
                ${invoices.length?invoices.map(inv=>`<tr>
                  <td>#${ZL.escape(inv.id||inv.syncId||"--")}</td>
                  <td>${ZL.escape(inv.time||"--")}</td>
                  <td>${itemText(inv)}</td>
                  <td class="money">${ZL.money(inv.total)}</td>
                  <td>${statusBadge(inv)}</td>
                </tr>`).join(""):`<tr><td colspan="5"><div class="empty">Chưa có hóa đơn</div></td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
        <div class="panel">
          <div class="panel-title"><div><h2>Top món bán chạy</h2><p>Theo POS dashboard</p></div></div>
          ${renderTopItems(stats.topItems)}
        </div>
      </div>`;
    document.getElementById("posDate").addEventListener("change",e=>{
      selectedDate=e.target.value||ZL.today();
      selectedDateTouched=true;
      render();
    });
    root.querySelectorAll("[data-cash-range]").forEach(btn=>btn.onclick=()=>{
      cashRange=btn.dataset.cashRange;
      render();
    });
  }

  ZL.modules.pos={render};
  ZL.on("pos",render);
})();
