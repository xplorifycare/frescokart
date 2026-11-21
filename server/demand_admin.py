"""The /admin/leads page for the demand test. demand.py serves it after the admin password check.
Everything on it comes from POST /admin/leads/api; it refreshes on its own every 20 seconds."""

PAGE = r"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Sign-ups · FrescoKart</title>
<style>
:root{--green:#006B48;--green-d:#0B3D2C;--green-t:#E6F5EC;--lime:#A8E63D;--orange:#C8380A;--sea:#0A5C8C;--ink:#0E1F17;--muted:#5E6B63;--line:#E1E8E3;--bg:#F3F5F4;--err:#B3261E}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header{background:var(--green);color:#fff;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;position:sticky;top:0;z-index:5}
header b{font-size:18px;letter-spacing:-.02em}header nav a{color:#fff;opacity:.92;margin-left:14px;font-size:13px}
.live{display:inline-flex;align-items:center;gap:6px;font-size:12px;opacity:.95;margin-left:12px}
.live i{width:8px;height:8px;border-radius:50%;background:var(--lime)}.live.off i{background:#F28B82}
main{max-width:1320px;margin:0 auto;padding:18px 20px 60px}
h2{font-size:16px;margin:28px 0 10px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}h2 small{font-weight:500;color:var(--muted);font-size:12px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px}
.card b{display:block;font-size:26px;line-height:1.1;font-variant-numeric:tabular-nums}.card span{color:var(--muted);font-size:12.5px}
.card em{font-style:normal;color:var(--green);font-weight:700;font-size:12px}
.box{background:#fff;border:1px solid var(--line);border-radius:14px;overflow:auto}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media(max-width:900px){.grid2{grid-template-columns:1fr}}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:9px 11px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);background:#FAFCFA;position:sticky;top:0;white-space:nowrap}
tr:last-child td{border-bottom:0}.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
tr.click{cursor:pointer}tr.click:hover td{background:#F7FAF8}
.muted{color:var(--muted);font-size:12.5px}.empty{padding:18px;color:var(--muted)}
.bar{height:8px;border-radius:9px;background:#E4EAE6;overflow:hidden;min-width:90px;margin-top:5px}.bar i{display:block;height:100%;background:var(--green)}
.ready{color:var(--green);font-weight:800}.notyet{color:var(--muted)}
.tag{display:inline-block;padding:1px 8px;border-radius:99px;font-size:11.5px;font-weight:700}
.tag.customer{background:var(--green-t);color:var(--green)}.tag.shop{background:#FCE8DF;color:var(--orange)}.tag.rider{background:#E1EEF6;color:var(--sea)}
.days{display:flex;align-items:flex-end;gap:6px;height:150px;padding:14px 14px 0}
.day{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:stretch;height:100%}
.day .stack{display:flex;flex-direction:column-reverse;border-radius:5px 5px 0 0;overflow:hidden;min-height:2px;background:#E4EAE6}
.day .c{background:var(--green)}.day .s{background:var(--orange)}.day .r{background:var(--sea)}
.day .lbl{font-size:10px;color:var(--muted);text-align:center;margin-top:4px;white-space:nowrap}.day .v{font-size:10.5px;text-align:center;font-weight:700}
.legend{display:flex;gap:14px;padding:8px 14px 12px;font-size:12px;color:var(--muted)}.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
.filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center}
input,select,textarea,button{font:inherit}input[type=text],input[type=tel],input[type=number],select,textarea{padding:7px 9px;border:1px solid #C9D3CC;border-radius:9px;background:#fff}
button{padding:7px 12px;border:1px solid #C9D3CC;border-radius:9px;background:#fff;cursor:pointer}
button.pri{background:var(--green);color:#fff;border-color:var(--green);font-weight:700}button.warn{color:var(--err)}
a.wa{display:inline-block;margin-top:4px;padding:3px 9px;border-radius:99px;background:#E7F6EC;color:#0F7A3E;font-weight:700;text-decoration:none;font-size:12px}
.answers{max-width:300px;font-size:12.5px;color:#2B3830}.answers b{font-weight:600}
.note{width:150px;font-size:12.5px}
#leads table{min-width:980px}#zones table{min-width:820px}
select.flash,input.flash{outline:3px solid var(--lime)}
details.tool{background:#fff;border:1px solid var(--line);border-radius:14px;margin-bottom:10px}
details.tool>summary{padding:13px 16px;font-weight:700;cursor:pointer;list-style:none}details.tool>summary::before{content:"▸ ";color:var(--muted)}details.tool[open]>summary::before{content:"▾ "}
.tbody{padding:0 16px 16px}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}
.row label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--muted)}
.msg{font-weight:600;margin-left:6px}.msg.ok{color:var(--green)}.msg.bad{color:var(--err)}
code,.code{font-family:ui-monospace,Consolas,monospace;font-size:12.5px;background:#F1F4F2;padding:2px 6px;border-radius:6px;word-break:break-all}
.qr img{width:200px;height:200px;border:1px solid var(--line);border-radius:10px;margin-top:8px;image-rendering:pixelated}
ol.steps{margin:6px 0 10px;padding-left:20px}ol.steps li{margin:4px 0}
.small{font-size:12px}.chipf{display:inline-flex;align-items:center;gap:6px;background:var(--green-t);color:var(--green-d);border-radius:99px;padding:3px 10px;font-weight:600;font-size:12.5px}
.chipf button{border:0;background:none;padding:0 2px;color:var(--green-d);font-weight:800}
</style></head><body>
<header><div><b>FrescoKart · Sign-ups</b><span class="live" id="live"><i></i><span id="liveText">Connecting…</span></span></div>
<nav><a href="/join/" target="_blank" rel="noopener">Join page</a><a href="/admin/leads/export.csv">Download CSV</a><a href="/admin">Orders admin</a></nav></header>
<main>
<div class="cards" id="kpis"></div>

<h2>Top places <small>areas are PIN codes · a tick means homes, shops and riders all reached their targets · click a row to see its people</small></h2>
<div class="box" id="zones" style="max-height:420px"></div>

<div class="grid2">
  <div><h2>Districts <small>click to filter the people list</small></h2><div class="box" id="districts"></div></div>
  <div><h2>Sign-ups per day <small>last 15 days, IST</small></h2><div class="box" id="days"></div>
       <h2>Where sign-ups come from <small>visits are one per person per day</small></h2><div class="box" id="sources" style="max-height:260px"></div></div>
</div>

<div class="grid2">
  <div><h2>Shops customers asked for <small>visit these first</small></h2><div class="box" id="shops" style="max-height:340px"></div></div>
  <div><h2>Top sharers</h2><div class="box" id="refs" style="max-height:170px"></div>
       <h2>Places we couldn't match <small>typed by hand, no PIN</small></h2><div class="box" id="typed" style="max-height:150px"></div></div>
</div>

<h2>People <small id="matched"></small></h2>
<div class="filters">
  <select id="f_role"><option value="">Everyone</option><option value="customer">Customers</option><option value="shop">Shops</option><option value="rider">Riders</option></select>
  <select id="f_district"><option value="">All districts</option></select>
  <select id="f_status"><option value="">All but spam</option><option value="all">Including spam</option></select>
  <input type="text" id="f_q" placeholder="Search name, number, place, PIN, shop…" style="min-width:240px">
  <span id="f_zone"></span>
  <span class="muted small">The WhatsApp button opens a ready welcome message and marks the person "welcomed".</span>
</div>
<div class="box" id="leads"></div>

<h2>Tools</h2>
<details class="tool" id="t_link"><summary>Make a tracked link and QR code (one for each poster, place or ad)</summary><div class="tbody">
  <p class="muted">Give every poster location and every ad its own source name, so you see exactly which one brings sign-ups.
  Use short names like <code>poster-edappally-skyline</code>, <code>meta-thrissur-fishingnet</code>, <code>rwa-kaloor</code>.
  Pick a place and the page opens with it chosen (good for local posters and town ads). Pick only a district for district-wide ads.</p>
  <div class="row">
    <label>Source name<input type="text" id="l_src" placeholder="poster-edappally-flat12" style="width:230px"></label>
    <label>Who it's for<select id="l_role"><option value="">Customers</option><option value="shop">Shop owners</option><option value="rider">Riders</option></select></label>
    <label>District<select id="l_district"><option value="">All Kerala</option></select></label>
    <label>Place or PIN (optional)<input type="text" id="l_place" list="l_places" placeholder="682024 or Kakkanad" style="width:200px"></label>
    <label>Language<select id="l_lang"><option value="">English</option><option value="ml">Malayalam</option></select></label>
    <button class="pri" id="l_make" style="align-self:flex-end">Make link + QR</button>
  </div>
  <datalist id="l_places"></datalist>
  <div id="l_out"></div>
</div></details>

<details class="tool"><summary>Add someone by hand (from a WhatsApp chat, a call or a shop visit)</summary><div class="tbody">
  <div class="row">
    <label>Role<select id="a_role"><option value="customer">Customer</option><option value="shop">Shop owner</option><option value="rider">Rider</option></select></label>
    <label>Name<input type="text" id="a_name"></label>
    <label>Mobile<input type="tel" id="a_phone" placeholder="98765 43210"></label>
    <label>PIN code<input type="tel" id="a_pin" placeholder="682024" style="width:100px"></label>
    <label>or district<select id="a_district"><option value="">–</option></select></label>
    <label>Place<input type="text" id="a_place" placeholder="Kakkanad"></label>
    <label>Source<input type="text" id="a_src" value="whatsapp" style="width:120px"></label>
    <label>Note<input type="text" id="a_note" placeholder="e.g. Sea Pearl Fish Mart, owner Thomas" style="width:230px"></label>
    <button class="pri" id="a_go" style="align-self:flex-end">Add</button><span class="msg" id="a_msg"></span>
  </div>
  <p class="muted small">Only add people who agreed to be contacted. They count in the same totals as page sign-ups.</p>
</div></details>

<details class="tool"><summary>Import leads from a Meta (Facebook / Instagram) lead form</summary><div class="tbody">
  <ol class="steps"><li>In Meta Business Suite open <b>All tools → Instant Forms</b> (or Ads Manager → your lead ad → Leads) and download the leads as CSV.</li>
  <li>Choose who the form was for, then pick the file. People already on the list are skipped. A PIN code, a place or a district in the form's answers is matched to Kerala places.</li></ol>
  <div class="row">
    <label>The form was for<select id="i_role"><option value="customer">Customers</option><option value="shop">Shop owners</option><option value="rider">Riders</option></select></label>
    <label>Source name if the file has no ad name<input type="text" id="i_src" value="meta-form" style="width:160px"></label>
    <label>CSV file<input type="file" id="i_file" accept=".csv,text/csv,text/plain"></label>
  </div>
  <div id="i_preview"></div>
</div></details>

<details class="tool"><summary>Targets and WhatsApp group links</summary><div class="tbody">
  <p class="muted">Every PIN area starts with the usual target. Give your focus places their own target below. For group links: in WhatsApp open the group → <b>Invite via link</b> → copy.
  A customer sees their PIN area's group if there is one, otherwise their district's, otherwise the "everyone" group. Without any link they see "Say hi to us on WhatsApp".</p>
  <div class="row">
    <label>Usual target (homes per area)<input type="number" id="s_default" min="5" style="width:110px"></label>
    <label>Shops needed per area<input type="number" id="s_shop" min="1" style="width:110px"></label>
    <label>Riders needed per area<input type="number" id="s_rider" min="1" style="width:110px"></label>
    <label>Your WhatsApp number<input type="tel" id="s_wa" style="width:150px"></label>
  </div>
  <h3 class="small" style="margin:14px 0 6px">Places with their own target</h3>
  <div class="box"><table><thead><tr><th>PIN</th><th>Area</th><th class="num">Target homes</th><th></th></tr></thead><tbody id="s_targets"></tbody></table></div>
  <div class="row"><button id="s_addt">+ Add a place</button></div>
  <h3 class="small" style="margin:14px 0 6px">WhatsApp groups</h3>
  <div class="box"><table><thead><tr><th>For</th><th>Group link</th><th></th></tr></thead><tbody id="s_groups"></tbody></table></div>
  <div class="row"><button id="s_addg">+ Add a group</button><span class="muted small">"For" can be a PIN code (682024), a district (ernakulam), or shops / riders / everyone.</span></div>
  <div class="row"><button class="pri" id="s_save">Save</button><span class="msg" id="s_msg"></span></div>
</div></details>

<details class="tool" id="t_tg"><summary>Phone alerts on Telegram (every sign-up + a summary each evening)</summary><div class="tbody">
  <div id="tg_state"></div>
  <ol class="steps">
    <li>In Telegram, open <b>@BotFather</b>, send <code>/newbot</code>, pick a name (e.g. FrescoKart Alerts) and copy the token it gives you.</li>
    <li>In Vercel → your project → Settings → Environment Variables, add <code>FK_TG_TOKEN</code> with that token, then redeploy.</li>
    <li>Open your new bot in Telegram and press <b>Start</b> (or send "hi").</li>
    <li>Come back here and press <b>Find my chat</b>.</li>
  </ol>
  <div class="row"><button class="pri" id="tg_find">Find my chat</button><button id="tg_test">Send a test</button><button id="tg_sum">Send today's summary now</button><span class="msg" id="tg_msg"></span></div>
  <p class="muted small">The evening summary is sent by Vercel Cron once a day, around 9 PM IST. On the free Vercel plan it can arrive any time within that hour.</p>
</div></details>
<p class="muted">Times are IST. Phone numbers are private: only people with the admin password see this page. Delete someone's details when they ask (🗑 in their row).
Places come from the Department of Posts PIN directory, so some names use postal spellings (Edapally, Calicut).</p>
</main>
<script>
(function(){
"use strict";
var STATUSES=/*STATUSES*/,DISTRICTS=/*DISTRICTS*/;
var SL={new:"New",welcomed:"Welcomed",in_group:"In group",prebooked:"Pre-booked",not_interested:"Not interested",spam:"Spam"};
var DN={};DISTRICTS.forEach(function(d){DN[d[0]]=d[1]});
var S={d:null,filter:{role:"",district:"",zone:"",zoneName:"",status:"",q:""},settingsShown:false,places:null,placesP:null};
var $=function(id){return document.getElementById(id)};
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function api(body){return fetch(location.origin+"/admin/leads/api",{method:"POST",headers:{"Content-Type":"application/json","X-FK-Admin":"1"},body:JSON.stringify(body)}).then(function(r){return r.json()})}
function ist(iso){return new Date(iso).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",day:"numeric",month:"short",hour:"numeric",minute:"2-digit"})}
function ago(iso){var s=(Date.now()-new Date(iso))/1000;if(s<60)return"just now";if(s<3600)return Math.floor(s/60)+" min ago";if(s<86400)return Math.floor(s/3600)+" h ago";return Math.floor(s/86400)+" d ago"}
function msg(id,text,ok){var el=$(id);el.textContent=text;el.className="msg "+(ok?"ok":"bad");if(ok)setTimeout(function(){if(el.textContent===text)el.textContent=""},4000)}
function table(head,rows,empty){if(!rows.length)return'<div class="empty">'+esc(empty)+"</div>";return"<table><thead><tr>"+head.map(function(h){return"<th"+(h.charAt(0)==="#"?' class="num">'+h.slice(1):">"+h)+"</th>"}).join("")+"</tr></thead><tbody>"+rows.join("")+"</tbody></table>"}
function districtOptions(first){return'<option value="">'+esc(first)+"</option>"+DISTRICTS.map(function(d){return'<option value="'+d[0]+'">'+esc(d[1])+"</option>"}).join("")}
function loadPlaces(){if(!S.placesP)S.placesP=fetch(location.origin+"/join/data/places.json").then(function(r){return r.json()}).then(function(P){
  var zones=P.zones.map(function(z){return{name:z[0],pin:z[1],d:P.districts[z[2]][0],slug:z[3]}}),byPin={};zones.forEach(function(z){byPin[z.pin]=z});
  S.places={zones:zones,byPin:byPin,places:P.places.map(function(p){return{name:p[0],pin:zones[p[1]].pin,d:P.districts[p[2]][0]}})};return S.places});return S.placesP}
function norm(x){return String(x||"").toLowerCase().replace(/[^a-z]/g,"").replace(/(.)\1+/g,"$1")}

function setLive(ok,text){$("live").classList.toggle("off",!ok);$("liveText").textContent=text}
function load(){
  if(document.hidden&&S.d)return;
  var f={role:S.filter.role,district:S.filter.district,zone:S.filter.zone,status:S.filter.status,q:S.filter.q};
  api({action:"dash",filter:f}).then(function(d){
    if(!d.ok){setLive(false,"Error: "+(d.message||d.error));return}
    S.d=d;render();setLive(true,"Live · updated "+new Date().toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit",second:"2-digit"}));
  }).catch(function(){setLive(false,"Offline, retrying…")});
}

function render(){
  var d=S.d,k=d.kpis,s=d.settings;
  var ingroup=(k.status.in_group||0)+(k.status.prebooked||0),all=k.roles.customer+k.roles.shop+k.roles.rider;
  $("kpis").innerHTML=[
    ["New today",k.today,k.today_roles.customer+" customers · "+k.today_roles.shop+" shops · "+k.today_roles.rider+" riders"],
    ["Customers",k.roles.customer,"homes on the list"],["Shops",k.roles.shop,"shop owners"],["Riders",k.roles.rider,"delivery riders"],
    ["Places",k.places_with_leads,"PIN areas · "+k.districts_with_leads+" of 14 districts"],
    ["In WhatsApp group",ingroup,all?Math.round(ingroup/all*100)+"% of everyone":""],
    ["Will order in week 1",k.first_week.yes||0,(k.first_week.maybe||0)+" maybe"],
    ["Pre-booked",k.status.prebooked||0,"the strongest signal"]
  ].map(function(c){return'<div class="card"><b>'+c[1]+"</b><span>"+esc(c[0])+"</span><br><em>"+esc(c[2])+"</em></div>"}).join("");
  $("zones").innerHTML=table(["#","Area","District","#Homes","Progress","#Today","#Shops","#Riders","#In group","#Week-1 yes","Ready?"],d.zones.map(function(z,i){
    var pct=Math.min(100,Math.round(z.customer/Math.max(1,z.target)*100)),ready=z.customer>=z.target&&z.shop>=s.shop_target&&z.rider>=s.rider_target;
    return'<tr class="click" data-zone="'+esc(z.pin)+'" data-zname="'+esc(z.name)+'"><td class="muted">'+(i+1)+"</td><td><b>"+esc(z.name)+'</b> <span class="muted">'+esc(z.pin)+"</span>"+(z.places.length?'<div class="muted">also '+esc(z.places.join(", "))+"</div>":"")+"</td><td>"+esc(z.district)+
      '</td><td class="num">'+z.customer+" / "+z.target+'</td><td><div class="bar"><i style="width:'+pct+'%"></i></div><span class="muted">'+pct+'%</span></td><td class="num">+'+z.today+
      '</td><td class="num">'+z.shop+" / "+s.shop_target+'</td><td class="num">'+z.rider+" / "+s.rider_target+'</td><td class="num">'+z.in_group+'</td><td class="num">'+z.first_week+"</td><td>"+(ready?'<span class="ready">✓ Ready</span>':'<span class="notyet">Not yet</span>')+"</td></tr>"}),
    "No sign-ups with a PIN area yet.");
  var dmax=1;d.districts.forEach(function(x){dmax=Math.max(dmax,x.customer)});
  $("districts").innerHTML=table(["District","#Homes","","#Shops","#Riders","#Places","#Today"],d.districts.slice().sort(function(a,b){return b.customer-a.customer||b.shop+b.rider-a.shop-a.rider}).map(function(x){
    return'<tr class="click" data-district="'+x.id+'"><td><b>'+esc(x.name)+'</b></td><td class="num">'+x.customer+'</td><td><div class="bar"><i style="width:'+Math.round(x.customer/dmax*100)+'%"></i></div></td><td class="num">'+x.shop+'</td><td class="num">'+x.rider+'</td><td class="num">'+x.places+'</td><td class="num">+'+x.today+"</td></tr>"}),"");
  var max=1;d.days.forEach(function(x){max=Math.max(max,x.customer+x.shop+x.rider)});
  $("days").innerHTML='<div class="days">'+d.days.map(function(x){var tot=x.customer+x.shop+x.rider,h=Math.round(tot/max*100);
    return'<div class="day" title="'+esc(x.day)+": "+x.customer+" customers, "+x.shop+" shops, "+x.rider+' riders"><div class="v">'+(tot||"")+'</div><div class="stack" style="height:'+Math.max(h,1)+'%">'+
      (tot?'<div class="c" style="flex:'+x.customer+'"></div><div class="s" style="flex:'+x.shop+'"></div><div class="r" style="flex:'+x.rider+'"></div>':"")+'</div><div class="lbl">'+esc(x.day.slice(8))+"</div></div>"}).join("")+
    '</div><div class="legend"><span><i style="background:var(--green)"></i>Customers</span><span><i style="background:var(--orange)"></i>Shops</span><span><i style="background:var(--sea)"></i>Riders</span></div>';
  $("sources").innerHTML=table(["Source","#Visits","#Sign-ups","#Conversion","#Today"],d.sources.map(function(x){var n=x.customer+x.shop+x.rider;
    return"<tr><td><code>"+esc(x.src)+'</code><div class="muted">'+x.customer+" customers · "+x.shop+" shops · "+x.rider+' riders</div></td><td class="num">'+x.visits+'</td><td class="num"><b>'+n+'</b></td><td class="num">'+(x.visits?Math.round(n/x.visits*100)+"%":"–")+'</td><td class="num">+'+x.today+"</td></tr>"}),"No visits yet. Share the join page or put up a poster.");
  $("shops").innerHTML=table(["Shop","Kind","Area","#Customers asking","Signed up?"],d.shops.map(function(x){
    return"<tr><td><b>"+esc(x.name)+"</b></td><td>"+esc(x.kind)+"</td><td>"+esc(x.area)+'</td><td class="num"><b>'+x.asked+"</b></td><td>"+(x.signed_up?'<span class="ready">✓ yes</span>':'<span class="muted">not yet: visit with this number</span>')+"</td></tr>"}),"When customers name the shops they buy from, the list appears here.");
  $("refs").innerHTML=table(["Person","Area","#Brought"],d.referrers.map(function(x){return"<tr><td>"+esc(x.name||"No name")+'<div class="muted">'+esc(x.phone)+"</div></td><td>"+esc(x.area)+'</td><td class="num"><b>'+x.count+"</b></td></tr>"}),"Nobody has brought anyone yet.");
  $("typed").innerHTML=table(["Place typed","District","#Customers","#Shops","#Riders"],d.typed.map(function(x){return"<tr><td>"+esc(x.name)+"</td><td>"+esc(x.district)+'</td><td class="num">'+x.customer+'</td><td class="num">'+x.shop+'</td><td class="num">'+x.rider+"</td></tr>"}),"Nothing yet.");
  var fd=$("f_district");if(fd.options.length<2)fd.innerHTML=districtOptions("All districts");fd.value=S.filter.district;
  var fs=$("f_status"),cs=fs.value;
  fs.innerHTML='<option value="">All but spam</option><option value="all">Including spam</option>'+STATUSES.map(function(x){return'<option value="'+x+'">'+SL[x]+"</option>"}).join("");fs.value=cs;
  $("f_zone").innerHTML=S.filter.zone?'<span class="chipf">Area: '+esc(S.filter.zoneName+" "+S.filter.zone)+' <button id="f_zone_x" title="Show all areas">×</button></span>':"";
  $("matched").textContent=d.matched+" shown"+(d.matched>d.leads.length?" (first "+d.leads.length+")":"");
  if(!document.activeElement||!document.activeElement.closest||!document.activeElement.closest("#leads"))renderLeads();
  if(!S.settingsShown){renderSettings();S.settingsShown=true}
  var tg=d.telegram;
  $("tg_state").innerHTML="<p>"+(tg.token?"✓ Bot token found.":"✗ No bot token yet (steps 1–2).")+" "+(tg.chat?"✓ Chat connected: sign-ups reach your phone.":"✗ Chat not connected yet (steps 3–4).")+
    (tg.summary_sent_today?" Today's summary has been sent.":"")+"</p>";
}

function answers(l){
  var x=l.extra||{},p=[];
  if(l.role==="customer"){if(x.buys&&x.buys.length)p.push("<b>Buys:</b> "+esc(x.buys.join(", ")));if(x.often)p.push("<b>How often:</b> "+esc(x.often));
    if(x.shops&&x.shops.length)p.push("<b>Shops:</b> "+esc(x.shops.map(function(s){return s.name+" ("+s.kind+")"}).join(", ")));
    if(l.first_week)p.push("<b>Week 1:</b> "+esc(l.first_week));if(l.flat)p.push("<b>Flat/street:</b> "+esc(l.flat))}
  else if(l.role==="shop"){if(x.shop_name)p.push("<b>Shop:</b> "+esc(x.shop_name));if(x.sells&&x.sells.length)p.push("<b>Sells:</b> "+esc(x.sells.join(", ")));
    if(x.delivers)p.push("<b>Delivers now:</b> "+esc(x.delivers));if(x.visit&&x.visit.length)p.push("<b>Visit:</b> "+esc(x.visit.join(", ")))}
  else{if(x.vehicle)p.push("<b>Vehicle:</b> "+esc(x.vehicle));if(x.licence)p.push("<b>Licence:</b> "+esc(x.licence));if(x.times&&x.times.length)p.push("<b>Times:</b> "+esc(x.times.join(", ")))}
  return p.join("<br>")||'<span class="muted">–</span>';
}
function areaOf(l){return l.zone_name||l.place||"your area"}
function joinLink(l){var p=["ref="+l.code];if(l.role!=="customer")p.push("role="+l.role);if(l.lang==="ml")p.push("lang=ml");return location.origin+"/join/"+(l.pin||"")+"?"+p.join("&")}
function welcome(l){
  var area=areaOf(l),first=(l.name||"").trim().split(/\s+/)[0],link=joinLink(l),ml=l.lang==="ml";
  var hi=ml?("നമസ്കാരം"+(first?" "+first:"")+"!"):("Hi"+(first?" "+first:"")+"!");
  if(l.role==="shop")return ml?hi+" FrescoKart-ൽ കട രജിസ്റ്റർ ചെയ്തതിന് നന്ദി. കടയിൽ വന്ന് 10 മിനിറ്റിൽ എല്ലാം വിശദീകരിക്കാം. ഈ ആഴ്ച ഏത് സമയമാണ് സൗകര്യം?"
    :hi+" Thanks for registering your shop with FrescoKart for "+area+". We'd like to visit and explain how it works. It takes about 10 minutes. What time suits you this week?";
  if(l.role==="rider")return ml?hi+" FrescoKart ഡെലിവറി റൈഡറായി രജിസ്റ്റർ ചെയ്തതിന് നന്ദി. തുടങ്ങും മുൻപ് ഷിഫ്റ്റും പേയ്‌മെന്റും വിശദീകരിക്കാൻ ഞങ്ങൾ വിളിക്കാം. ടൂവീലറും ലൈസൻസും ഉണ്ടോ?"
    :hi+" Thanks for registering as a FrescoKart delivery rider for "+area+". Before we start, we'll call you to explain shifts and pay. Do you have a two-wheeler and a licence?";
  return ml?hi+" FrescoKart "+area+" ലിസ്റ്റിൽ ചേർന്നതിന് നന്ദി 🙌 ആവശ്യത്തിന് വീടുകൾ ചേർന്നാൽ ഞങ്ങൾ തുടങ്ങും. വേഗം എത്താൻ ഈ ലിങ്ക് അയൽക്കാർക്ക് അയക്കൂ: "+link+"\n\nFrescoKart വിവരങ്ങൾ മാത്രമേ അയക്കൂ. വേണ്ടെങ്കിൽ STOP എന്ന് മറുപടി അയക്കൂ."
    :hi+" Thanks for joining FrescoKart's list for "+area+" 🙌 We start in a place once enough homes join. Share your link with neighbours to get "+area+" there faster: "+link+"\n\nWe'll only message you about FrescoKart. Reply STOP anytime.";
}
function weekAsk(l){
  var area=areaOf(l),first=(l.name||"").trim().split(/\s+/)[0];
  var link=location.origin+"/join/?id="+l.id+"&t="+l.t+"&prebook=1"+(l.lang==="ml"?"&lang=ml":"");
  return l.lang==="ml"?("നമസ്കാരം"+(first?" "+first:"")+"! FrescoKart "+area+" ഏരിയയിൽ തുടങ്ങാൻ ഒരുങ്ങുന്നു. ആദ്യ ആഴ്ചയിൽ തന്നെ ഓർഡർ ചെയ്യുമോ? ഇവിടെ അറിയിക്കൂ (5 സെക്കൻഡ്): "+link)
    :("Hi"+(first?" "+first:"")+"! FrescoKart is getting ready in "+area+". Would you order in our first week? Tell us here, it takes 5 seconds: "+link);
}
function renderLeads(){
  var d=S.d;
  $("leads").innerHTML=table(["Joined","Who","Lives in","Answers","Came from","Status","Note",""],d.leads.map(function(l){
    var wa="https://wa.me/"+l.phone.replace(/\D/g,"")+"?text="+encodeURIComponent(welcome(l));
    var opts=STATUSES.map(function(x){return'<option value="'+x+'"'+(x===l.status?" selected":"")+">"+SL[x]+"</option>"}).join("");
    var where="<b>"+esc(l.place||"–")+"</b>"+(l.pin?' <span class="muted">'+esc(l.pin)+"</span>":' <span class="muted">(no PIN)</span>')+
      ((l.zone_name&&l.zone_name!==l.place&&l.pin)?'<div class="muted">'+esc(l.zone_name)+" area</div>":"")+'<div class="muted">'+esc(l.district_name||"")+"</div>";
    return'<tr data-id="'+l.id+'"><td title="'+esc(ist(l.created_at))+'">'+esc(ago(l.created_at))+'<div class="muted">'+esc(ist(l.created_at))+"</div></td>"+
      '<td><span class="tag '+l.role+'">'+l.role+"</span> <b>"+esc(l.name||"No name")+"</b><div>"+esc(l.phone)+(l.lang==="ml"?' <span class="muted">· മലയാളം</span>':"")+'</div><a class="wa" target="_blank" rel="noopener" href="'+esc(wa)+'" data-wa="'+l.id+'">WhatsApp welcome</a>'+
      (l.role==="customer"?' <a class="wa" target="_blank" rel="noopener" title="Personal link that opens their page on the week-1 question" href="'+esc("https://wa.me/"+l.phone.replace(/\D/g,"")+"?text="+encodeURIComponent(weekAsk(l)))+'">Week-1 ask</a>':"")+"</td>"+
      "<td>"+where+'</td><td class="answers">'+answers(l)+"</td>"+
      "<td><code>"+esc(l.src)+"</code>"+(l.ref_name?'<div class="muted">invited by '+esc(l.ref_name)+"</div>":"")+(l.referrals?'<div class="muted">brought '+l.referrals+"</div>":"")+(l.origin!=="page"?'<div class="muted">'+esc(l.origin)+"</div>":"")+"</td>"+
      '<td><select data-status="'+l.id+'">'+opts+'</select></td><td><input class="note" data-note="'+l.id+'" value="'+esc(l.note)+'" placeholder="note"></td>'+
      '<td><button class="warn" data-del="'+l.id+'" title="Delete this person">🗑</button></td></tr>'}),"No sign-ups match.");
}

function renderSettings(){
  var s=S.d.settings;
  $("s_default").value=s.default_target;$("s_shop").value=s.shop_target;$("s_rider").value=s.rider_target;$("s_wa").value=s.support_wa;
  $("s_targets").innerHTML=s.targets.map(targetRow).join("");
  $("s_groups").innerHTML=s.groups.map(groupRow).join("");
  $("l_district").innerHTML=districtOptions("All Kerala");$("a_district").innerHTML=districtOptions("–");
}
function targetRow(t){t=t||{pin:"",name:"",district:"",target:200};return'<tr><td><input type="tel" class="s_pin" value="'+esc(t.pin)+'" placeholder="682024" style="width:100px"></td><td class="muted s_zname">'+esc(t.name?t.name+", "+t.district:"")+'</td><td class="num"><input type="number" class="s_target" value="'+t.target+'" min="5" style="width:100px"></td><td><button class="warn s_rm">Remove</button></td></tr>'}
function groupRow(g){g=g||{key:"",label:"",link:""};var shown={_shop:"shops",_rider:"riders",_all:"everyone"}[g.key]||g.key;
  return'<tr><td><input type="text" class="g_key" value="'+esc(shown)+'" placeholder="682024 / ernakulam / shops" style="width:170px"><div class="muted">'+esc(g.label)+'</div></td><td><input type="text" class="g_link" value="'+esc(g.link)+'" placeholder="https://chat.whatsapp.com/..." style="width:320px"></td><td><button class="warn s_rm">Remove</button></td></tr>'}

// ---------- events ----------
var qTimer;
$("f_role").addEventListener("change",function(){S.filter.role=this.value;load()});
$("f_status").addEventListener("change",function(){S.filter.status=this.value;load()});
$("f_district").addEventListener("change",function(){S.filter.district=this.value;load()});
$("f_q").addEventListener("input",function(){clearTimeout(qTimer);qTimer=setTimeout(function(){S.filter.q=$("f_q").value;load()},350)});
document.addEventListener("change",function(e){
  var st=e.target.getAttribute&&e.target.getAttribute("data-status");
  if(st){var el=e.target;api({action:"status",id:+st,status:el.value}).then(function(j){if(!j.ok)return alert("Could not save: "+(j.message||j.error));el.classList.add("flash");setTimeout(function(){el.classList.remove("flash")},800)})}
  var nt=e.target.getAttribute&&e.target.getAttribute("data-note");
  if(nt){var ne=e.target;api({action:"note",id:+nt,note:ne.value}).then(function(j){if(!j.ok)return alert("Could not save the note.");ne.classList.add("flash");setTimeout(function(){ne.classList.remove("flash")},800)})}
  if(e.target.classList&&e.target.classList.contains("s_pin")){var inp=e.target,pin=inp.value.replace(/\D/g,"");loadPlaces().then(function(P){var z=P.byPin[pin];inp.closest("tr").querySelector(".s_zname").textContent=z?z.name+", "+DN[z.d]:(pin?"not a Kerala PIN we know":"")})}
});
document.addEventListener("click",function(e){
  var zr=e.target.closest("[data-zone]");
  if(zr){S.filter.zone=zr.getAttribute("data-zone");S.filter.zoneName=zr.getAttribute("data-zname");load();$("leads").scrollIntoView({behavior:"smooth"});return}
  var dr=e.target.closest("[data-district]");
  if(dr){S.filter.district=dr.getAttribute("data-district");S.filter.zone="";load();$("leads").scrollIntoView({behavior:"smooth"});return}
  if(e.target.id==="f_zone_x"){S.filter.zone="";S.filter.zoneName="";load();return}
  var w=e.target.closest("[data-wa]");
  if(w){var id=+w.getAttribute("data-wa"),l=S.d.leads.filter(function(x){return x.id===id})[0];if(l&&l.status==="new"){api({action:"status",id:id,status:"welcomed"}).then(function(){setTimeout(load,500)})}return}
  var del=e.target.closest("[data-del]");
  if(del){var did=+del.getAttribute("data-del");if(!confirm("Delete this person and their answers for good? Do this when they ask to be removed."))return;
    api({action:"delete",id:did}).then(function(j){if(!j.ok)alert("Could not delete.");load()});return}
  if(e.target.classList.contains("s_rm")){e.target.closest("tr").remove()}
});
$("s_addt").addEventListener("click",function(){$("s_targets").insertAdjacentHTML("beforeend",targetRow(null))});
$("s_addg").addEventListener("click",function(){$("s_groups").insertAdjacentHTML("beforeend",groupRow(null))});
$("s_save").addEventListener("click",function(){
  var targets=[],groups=[];
  Array.prototype.forEach.call($("s_targets").querySelectorAll("tr"),function(tr){var p=tr.querySelector(".s_pin").value.trim();if(p)targets.push({pin:p,target:+tr.querySelector(".s_target").value})});
  Array.prototype.forEach.call($("s_groups").querySelectorAll("tr"),function(tr){var k=tr.querySelector(".g_key").value.trim().toLowerCase(),l=tr.querySelector(".g_link").value.trim();
    k={shops:"_shop",shop:"_shop",riders:"_rider",rider:"_rider",everyone:"_all",all:"_all"}[k]||k;if(k||l)groups.push({key:k,link:l})});
  api({action:"settings",default_target:+$("s_default").value,shop_target:+$("s_shop").value,rider_target:+$("s_rider").value,support_wa:$("s_wa").value,targets:targets,groups:groups}).then(function(j){
    if(!j.ok)return msg("s_msg",j.message||j.error,false);msg("s_msg","Saved. The join page uses it now.",true);S.d.settings=j.settings;renderSettings();load()});
});
// tracked link + QR
$("l_district").addEventListener("change",function(){var dsel=this.value;loadPlaces().then(function(P){
  $("l_places").innerHTML=P.zones.filter(function(z){return!dsel||z.d===dsel}).slice(0,800).map(function(z){return'<option value="'+esc(z.pin)+'">'+esc(z.name+" · "+DN[z.d])+"</option>"}).join("")})});
$("l_make").addEventListener("click",function(){
  var src=$("l_src").value.trim().toLowerCase().replace(/[^a-z0-9._:-]+/g,"-").replace(/^-+|-+$/g,"");
  if(!src){$("l_out").innerHTML='<p class="msg bad">Give it a source name first.</p>';return}
  loadPlaces().then(function(P){
    var place=$("l_place").value.trim(),dsel=$("l_district").value,path="",z=null;
    if(/^\d{6}$/.test(place))z=P.byPin[place];
    else if(place){var hit=P.places.filter(function(p){return norm(p.name)===norm(place)&&(!dsel||p.d===dsel)});if(hit.length)z=P.byPin[hit[0].pin];}
    if(place&&!z){$("l_out").innerHTML='<p class="msg bad">Could not find that place'+(dsel?" in "+esc(DN[dsel]):"")+". Try its PIN code.</p>";return}
    if(z)path=z.slug;else if(dsel)path=dsel;
    var p=["src="+encodeURIComponent(src)];if($("l_role").value)p.push("role="+$("l_role").value);if($("l_lang").value)p.push("lang=ml");
    var url=location.origin+"/join/"+path+"?"+p.join("&");
    $("l_out").innerHTML='<p>'+(z?"Opens with <b>"+esc(z.name)+"</b> ("+esc(z.pin)+", "+esc(DN[z.d])+") picked. ":dsel?"Opens with <b>"+esc(DN[dsel])+"</b> district picked. ":"")+'Link: <span class="code">'+esc(url)+'</span> <button id="l_copy">Copy</button></p><div class="qr" id="l_qr"><span class="muted">Making QR…</span></div>';
    $("l_copy").onclick=function(){navigator.clipboard&&navigator.clipboard.writeText(url).then(function(){$("l_copy").textContent="Copied"})};
    if(/^http:\/\/(localhost|127\.)/.test(url))$("l_out").insertAdjacentHTML("beforeend",'<p class="muted small">This is your computer\'s address. Make the QR codes for printing from the live site so they point to the real page.</p>');
    api({action:"qr",url:url}).then(function(j){$("l_qr").innerHTML=j.ok?'<img alt="QR code" src="'+j.png+'"><br><a download="qr-'+esc(src)+'.png" href="'+j.png+'">Download PNG</a> <span class="muted small">· put it on the poster in Canva</span>':'<p class="msg bad">'+esc(j.message||j.error)+"</p>"});
  });
});
// add by hand
$("a_go").addEventListener("click",function(){
  api({action:"add",role:$("a_role").value,name:$("a_name").value,phone:$("a_phone").value,pin:$("a_pin").value,district:$("a_district").value,place:$("a_place").value,src:$("a_src").value,note:$("a_note").value}).then(function(j){
    if(!j.ok)return msg("a_msg",j.message||j.error,false);msg("a_msg",j.result==="dup"?"Already on the list.":"Added to "+j.area+".",j.result!=="dup");
    if(j.result==="added"){$("a_name").value="";$("a_phone").value="";$("a_note").value="";$("a_pin").value="";$("a_place").value=""}load()});
});
// Meta CSV import
function parseCSV(text){
  var first=text.split(/\r?\n/)[0]||"",delim=(first.split("\t").length>first.split(",").length)?"\t":",";
  var rows=[],row=[],cell="",q=false;
  for(var i=0;i<text.length;i++){var c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else q=false}else cell+=c}
    else if(c==='"')q=true;else if(c===delim){row.push(cell);cell=""}else if(c==="\n"){row.push(cell);rows.push(row);row=[];cell=""}else if(c!=="\r")cell+=c}
  if(cell||row.length){row.push(cell);rows.push(row)}
  return rows.filter(function(r){return r.some(function(x){return x.trim()})});
}
function findCol(head,re,not){for(var i=0;i<head.length;i++){if(re.test(head[i])&&!(not&&not.test(head[i])))return i}return -1}
var IMPORT=null;
$("i_file").addEventListener("change",function(){
  var f=this.files[0];if(!f)return;var rd=new FileReader();
  rd.onload=function(){
    var b=new Uint8Array(rd.result),text;
    if(b[0]===0xFF&&b[1]===0xFE)text=new TextDecoder("utf-16le").decode(b.subarray(2));else if(b[0]===0xFE&&b[1]===0xFF)text=new TextDecoder("utf-16be").decode(b.subarray(2));
    else text=new TextDecoder("utf-8").decode(b).replace(/^\uFEFF/,"");
    var rows=parseCSV(text);if(rows.length<2){$("i_preview").innerHTML='<p class="msg bad">No rows found in this file.</p>';return}
    var head=rows[0].map(function(h){return h.trim().toLowerCase()});
    var ci={phone:findCol(head,/phone|mobile|whatsapp/),name:findCol(head,/full.?name|^name$|first.?name/),pin:findCol(head,/pin|post.?code|zip/,/phone|pinterest/),
      district:findCol(head,/district|jilla/),place:findCol(head,/area|place|location|locality|where|city|town/,/phone|district/),
      created:findCol(head,/created/),ad:findCol(head,/^ad.?name/),camp:findCol(head,/campaign.?name/),form:findCol(head,/form.?name/)};
    if(ci.phone<0){$("i_preview").innerHTML='<p class="msg bad">Could not find a phone number column. Columns in the file: '+esc(head.join(", "))+"</p>";return}
    var def=$("i_src").value.trim()||"meta-form";
    function col(r,i){return i>=0?(r[i]||""):""}
    IMPORT=rows.slice(1).map(function(r){var ad=col(r,ci.ad)||col(r,ci.camp)||col(r,ci.form);
      return{phone:col(r,ci.phone).replace(/^p:/,""),name:col(r,ci.name),pin:col(r,ci.pin),district:col(r,ci.district).toLowerCase().replace(/[^a-z]/g,""),place:col(r,ci.place),created:col(r,ci.created),src:ad?("meta-"+ad):def}});
    var used=["phone","name","pin","district","place"].filter(function(k){return ci[k]>=0}).map(function(k){return k+" = <code>"+esc(head[ci[k]])+"</code>"}).join(", ");
    $("i_preview").innerHTML="<p><b>"+IMPORT.length+"</b> rows. Using "+used+".</p>"+
      table(["Phone","Name","PIN","District","Place","Source"],IMPORT.slice(0,5).map(function(x){return"<tr><td>"+esc(x.phone)+"</td><td>"+esc(x.name)+"</td><td>"+esc(x.pin)+"</td><td>"+esc(x.district)+"</td><td>"+esc(x.place)+"</td><td><code>"+esc(x.src)+"</code></td></tr>"}),"")+
      '<div class="row"><button class="pri" id="i_go">Import '+IMPORT.length+' rows</button><span class="msg" id="i_msg"></span></div>';
    $("i_go").onclick=runImport;
  };
  rd.readAsArrayBuffer(f);
});
function runImport(){
  var rows=IMPORT.slice(),tot={added:0,dup:0,bad:0},role=$("i_role").value;$("i_go").disabled=true;
  (function next(){
    if(!rows.length){msg("i_msg","Done: "+tot.added+" added, "+tot.dup+" already on the list, "+tot.bad+" without a valid number.",true);load();return}
    var batch=rows.splice(0,100);
    api({action:"import",role:role,rows:batch}).then(function(j){if(!j.ok){msg("i_msg",j.message||j.error,false);return}tot.added+=j.added;tot.dup+=j.dup;tot.bad+=j.bad;msg("i_msg","Importing… "+tot.added+" added so far",true);next()})
      .catch(function(){msg("i_msg","Lost the connection. Run the import again: people already added are skipped.",false)});
  })();
}
// Telegram
$("tg_find").addEventListener("click",function(){api({action:"tg_find"}).then(function(j){if(!j.ok)return msg("tg_msg",j.message||j.error,false);msg("tg_msg","Connected to "+j.chat+". Check Telegram for a message.",true);load()})});
$("tg_test").addEventListener("click",function(){api({action:"tg_test"}).then(function(j){msg("tg_msg",j.ok?"Sent. Check Telegram.":(j.message||j.error),j.ok)})});
$("tg_sum").addEventListener("click",function(){api({action:"summary_now"}).then(function(j){msg("tg_msg",j.ok?"Summary sent.":(j.message||j.error),j.ok)})});

load();setInterval(load,20000);
document.addEventListener("visibilitychange",function(){if(!document.hidden)load()});
})();
</script></body></html>"""
