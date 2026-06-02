(function(){
  const ZL=window.ZL;
  let selectedDate=ZL.today();
  let cashRange="month";

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

  function dateValue(x){
    if(!x)return "";
    if(typeof x==="number")return ZL.dateKey(new Date(x));
    if(String(x).length>=10)return String(x).slice(0,10);
    return "";
  }

  function sumRows(rows,fields){
    return ZL.normalizeList(rows).reduce((sum,row)=>{
      for(const f of fields){
        if(row[f]!=null)return sum+(Number(row[f])||0);
      }
      return sum;
    },0);
  }

  function salaryForDate(date){
    const rows=ZL.normalizeList((ZL.state.pos||{}).salaryPayments);
    return rows.filter(r=>dateValue(r.paidAt||r.date||r.createdAt||r.ts)===date)
      .reduce((s,r)=>s+(Number(r.amount)||Number(r.paid)||Number(r.total)||0),0);
  }

  function dateRange(key){
    const end=new Date(ZL.today()+"T00:00:00");
    const start=new Date(end);
    if(key==="month")start.setDate(1);
    if(key==="3m"){start.setMonth(start.getMonth()-2);start.setDate(1);}
    if(key==="6m"){start.setMonth(start.getMonth()-5);start.setDate(1);}
    if(key==="1y"){start.setFullYear(start.getFullYear()-1);start.setDate(start.getDate()+1);}
    const out=[];
    for(const d=new Date(start);d<=end;d.setDate(d.getDate()+1))out.push(ZL.dateKey(d));
    return out;
  }

  function cashflowForDate(date){
    const pos=ZL.state.pos||{};
    const stats=ZL.invoiceStats(date);
    const hist=pos.history||{};
    const income=stats.invoices.length?stats.total:(Number(hist[date]?.totalRevenue)||0);
    const purchases=sumRows((pos.purchases||{})[date],["totalCost","amount","cost","total"]);
    const expenses=sumRows((pos.expenses||{})[date],["amount","total","cost"]);
    const salary=salaryForDate(date);
    const out=purchases+expenses+salary;
    return {date,income,purchases,expenses,salary,out,net:income-out};
  }

  function renderCashflow(){
    const rows=dateRange(cashRange).map(cashflowForDate);
    const total=rows.reduce((s,r)=>({
      income:s.income+r.income,
      purchases:s.purchases+r.purchases,
      expenses:s.expenses+r.expenses,
      salary:s.salary+r.salary,
      out:s.out+r.out,
      net:s.net+r.net
    }),{income:0,purchases:0,expenses:0,salary:0,out:0,net:0});
    const labels={month:"Tháng này","3m":"3 tháng","6m":"6 tháng","1y":"1 năm"};
    const visible=rows.filter(r=>r.income||r.out).reverse().slice(0,45);
    return `<div class="panel" style="margin-top:16px">
      <div class="panel-title">
        <div><h2>Dòng tiền thu / chi</h2><p>${labels[cashRange]}</p></div>
        <div class="segmented">
          ${Object.keys(labels).map(key=>`<button class="${cashRange===key?"active":""}" data-cash-range="${key}">${labels[key]}</button>`).join("")}
        </div>
      </div>
      <div class="grid grid-4 cashflow-cards">
        <div class="stat-card"><div class="stat-label">Tiền thu</div><div class="stat-value accent-value">${ZL.money(total.income)}</div></div>
        <div class="stat-card"><div class="stat-label">Chi nguyên liệu</div><div class="stat-value danger-value">${ZL.money(total.purchases)}</div></div>
        <div class="stat-card"><div class="stat-label">Chi khác</div><div class="stat-value warning-value">${ZL.money(total.expenses)}</div></div>
        <div class="stat-card"><div class="stat-label">Lương đã trả</div><div class="stat-value blue-value">${ZL.money(total.salary)}</div></div>
        <div class="stat-card wide"><div class="stat-label">Tổng chi</div><div class="stat-value danger-value">${ZL.money(total.out)}</div></div>
        <div class="stat-card wide"><div class="stat-label">Dòng tiền còn lại</div><div class="stat-value ${total.net>=0?"accent-value":"danger-value"}">${ZL.money(total.net)}</div></div>
      </div>
      <details class="details-block">
        <summary>Chi tiết theo ngày</summary>
        <div class="table-scroll">
          <table>
            <thead><tr><th>Ngày</th><th>Thu</th><th>NL</th><th>Chi khác</th><th>Lương</th><th>Còn lại</th></tr></thead>
            <tbody>${visible.length?visible.map(r=>`<tr>
              <td>${r.date}</td>
              <td class="money">${ZL.money(r.income)}</td>
              <td class="danger-value">${ZL.money(r.purchases)}</td>
              <td>${ZL.money(r.expenses)}</td>
              <td class="blue-value">${ZL.money(r.salary)}</td>
              <td class="${r.net>=0?"accent-value":"danger-value"}">${ZL.money(r.net)}</td>
            </tr>`).join(""):`<tr><td colspan="6"><div class="empty">Chưa có dòng tiền trong kỳ này</div></td></tr>`}</tbody>
          </table>
        </div>
      </details>
    </div>`;
  }

  function render(){
    const root=document.getElementById("posRoot");
    if(!root)return;
    const stats=ZL.invoiceStats(selectedDate);
    const invoices=stats.invoices.slice().sort((a,b)=>String(b.time||"").localeCompare(String(a.time||"")));
    root.innerHTML=`
      <div class="panel" style="margin-bottom:16px">
        <div class="panel-title">
          <div><h2>Monstea POS Viewer</h2><p>Ngày đang xem</p></div>
          <div style="max-width:190px"><input type="date" id="posDate" value="${selectedDate}"></div>
        </div>
      </div>
      <div class="grid grid-4">
        <div class="stat-card"><div class="stat-label">Doanh thu</div><div class="stat-value accent-value">${ZL.money(stats.total)}</div><div class="stat-note">${selectedDate}</div></div>
        <div class="stat-card"><div class="stat-label">Số đơn</div><div class="stat-value">${stats.invoices.length}</div><div class="stat-note">Đơn hợp lệ</div></div>
        <div class="stat-card"><div class="stat-label">TB/đơn</div><div class="stat-value blue-value">${ZL.money(stats.avg)}</div><div class="stat-note">Average order value</div></div>
        <div class="stat-card"><div class="stat-label">Món top</div><div class="stat-value warning-value fit-text">${ZL.escape(stats.top?.name||"Chưa có")}</div><div class="stat-note">${stats.top?stats.top.qty+" lượt bán":"--"}</div></div>
      </div>
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
          <div class="panel-title"><div><h2>Top món bán chạy</h2><p>Theo hóa đơn</p></div></div>
          ${renderTopItems(stats.topItems)}
        </div>
      </div>`;
    document.getElementById("posDate").addEventListener("change",e=>{
      selectedDate=e.target.value||ZL.today();
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
