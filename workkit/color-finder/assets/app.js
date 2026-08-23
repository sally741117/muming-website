
const $ = (s)=>document.querySelector(s);
const $$ = (s)=>[...document.querySelectorAll(s)];
const DATA = window.COLOR_DATA || [];
let current = {r:93,g:188,b:168};
let category = "全部";
let visibleCount = 40;

function clamp(v,min,max){return Math.min(max,Math.max(min,v))}
function rgbToHex(r,g,b){return "#"+[r,g,b].map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,"0")).join("").toUpperCase()}
function hexToRgb(hex){
  let h=String(hex).trim().replace("#","");
  if(h.length===3) h=h.split("").map(c=>c+c).join("");
  if(!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {r:parseInt(h.slice(0,2),16),g:parseInt(h.slice(2,4),16),b:parseInt(h.slice(4,6),16)};
}
function rgbToCmyk({r,g,b}){
  let R=r/255,G=g/255,B=b/255,k=1-Math.max(R,G,B);
  if(k>.999) return {c:0,m:0,y:0,k:100};
  return {c:Math.round((1-R-k)/(1-k)*100),m:Math.round((1-G-k)/(1-k)*100),y:Math.round((1-B-k)/(1-k)*100),k:Math.round(k*100)};
}
function rgbToHsl({r,g,b}){
  let R=r/255,G=g/255,B=b/255,max=Math.max(R,G,B),min=Math.min(R,G,B),h=0,s=0,l=(max+min)/2;
  if(max!==min){
    let d=max-min; s=l>.5?d/(2-max-min):d/(max+min);
    switch(max){case R:h=(G-B)/d+(G<B?6:0);break;case G:h=(B-R)/d+2;break;default:h=(R-G)/d+4}
    h/=6;
  }
  return {h:Math.round(h*360),s:Math.round(s*100),l:Math.round(l*100)}
}
function hslToRgb(h,s,l){
  h=((h%360)+360)%360/360;s/=100;l/=100;
  if(s===0){let v=Math.round(l*255);return {r:v,g:v,b:v}}
  const hue2rgb=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p}
  let q=l<.5?l*(1+s):l+s-l*s,p=2*l-q;
  return {r:Math.round(hue2rgb(p,q,h+1/3)*255),g:Math.round(hue2rgb(p,q,h)*255),b:Math.round(hue2rgb(p,q,h-1/3)*255)}
}
function distance(a,b){return Math.sqrt((a.r-b.r)**2+(a.g-b.g)**2+(a.b-b.b)**2)}
function nearestColor(rgb){
  let best=null,min=1e9;
  for(const c of DATA){let d=distance(rgb,{r:c.rgb[0],g:c.rgb[1],b:c.rgb[2]});if(d<min){min=d;best=c}}
  return best;
}
function contrastText({r,g,b}){return (r*299+g*587+b*114)/1000>150?"#17202a":"#ffffff"}
function showToast(t){
  const el=$("#toast");el.textContent=t;el.classList.add("show");clearTimeout(window.__toast);
  window.__toast=setTimeout(()=>el.classList.remove("show"),1500);
}
async function copy(t){
  const value=String(t);
  try{
    if(navigator.clipboard && window.isSecureContext){
      await navigator.clipboard.writeText(value);
      showToast("已複製 "+value); return;
    }
  }catch(e){}
  try{
    const ta=document.createElement("textarea");
    ta.value=value; ta.setAttribute("readonly","");
    ta.style.position="fixed"; ta.style.opacity="0"; ta.style.pointerEvents="none";
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0,99999);
    const ok=document.execCommand("copy"); ta.remove();
    if(ok){showToast("已複製 "+value);return;}
  }catch(e){}
  showToast("已選取，請按 Ctrl+C");
}
function updateURL(hex){
  try{
    const u=new URL(location.href);u.searchParams.set("color",hex.replace("#",""));history.replaceState(null,"",u)
  }catch(e){}
}

function updateColor(rgb, updateUrl=true){
  current={r:clamp(+rgb.r||0,0,255),g:clamp(+rgb.g||0,0,255),b:clamp(+rgb.b||0,0,255)};
  const hex=rgbToHex(current.r,current.g,current.b), hsl=rgbToHsl(current), cmyk=rgbToCmyk(current), nearest=nearestColor(current);
  $("#colorPicker").value=hex;
  $("#hexInput").value=hex;
  ["r","g","b"].forEach(k=>{$("#"+k+"Range").value=current[k];$("#"+k+"Num").value=current[k]});
  if($("#previewSwatch")) $("#previewSwatch").style.background=hex;
  if($("#previewHex")) $("#previewHex").textContent=hex;
  if($("#previewRgb")) $("#previewRgb").textContent=`RGB ${current.r}, ${current.g}, ${current.b}`;
  if($("#miniHex")) $("#miniHex").textContent=hex;
  $("#hexResult").textContent=hex;
  $("#rgbResult").textContent=`${current.r}, ${current.g}, ${current.b}`;
  $("#cmykResult").textContent=`${cmyk.c}, ${cmyk.m}, ${cmyk.y}, ${cmyk.k}`;
  $("#hslResult").textContent=`${hsl.h}°, ${hsl.s}%, ${hsl.l}%`;
  $("#nearest").innerHTML=nearest?`最接近的命名色：<strong>${nearest.zh}</strong> · ${nearest.en} · <code>${nearest.hex}</code>`:"";
  if($("#miniName")) $("#miniName").textContent=nearest?nearest.zh:"自訂色";
  if($("#heroPreview")) $("#heroPreview").style.borderTop=`6px solid ${hex}`;
  renderHarmonies(hsl);
  if(updateUrl) updateURL(hex);
}
function harmonyColors(type,hsl){
  let hs=[];
  if(type==="complement") hs=[hsl.h,(hsl.h+180)%360];
  if(type==="analogous") hs=[(hsl.h+330)%360,hsl.h,(hsl.h+30)%360];
  if(type==="triad") hs=[hsl.h,(hsl.h+120)%360,(hsl.h+240)%360];
  if(type==="split") hs=[hsl.h,(hsl.h+150)%360,(hsl.h+210)%360];
  if(type==="mono") return [20,35,50,65,80].map(l=>hslToRgb(hsl.h,hsl.s,l));
  return hs.map(h=>hslToRgb(h,hsl.s,hsl.l));
}
function renderHarmonies(hsl){
  const types=[
    ["complement","互補色"],
    ["analogous","類似色"],
    ["triad","三角色"],
    ["split","分裂互補"],
    ["mono","單色漸層"]
  ];

  $("#harmonies").innerHTML=types.map(([key,label])=>{
    const colors=harmonyColors(key,hsl);
    return `<div class="harmony">
      <div class="harmony-title">${label}</div>
      <div class="harmony-grid">
        ${colors.map(c=>{
          const hx=rgbToHex(c.r,c.g,c.b);
          return `<div class="harmony-color-card">
            <button class="harmony-swatch" style="background:${hx}" data-pick="${hx}" title="套用 ${hx}" aria-label="套用 ${hx}"></button>
            <div class="harmony-info">
              <div class="harmony-hex">
                <strong>${hx}</strong>
                <button class="text-copy" data-copy-value="${hx}" title="複製 HEX">複製</button>
              </div>
              <div class="rgb-copy-row">
                <button class="rgb-copy-btn" data-copy-value="${c.r}" title="複製 R ${c.r}">
                  <span>R</span><strong>${c.r}</strong>
                </button>
                <button class="rgb-copy-btn" data-copy-value="${c.g}" title="複製 G ${c.g}">
                  <span>G</span><strong>${c.g}</strong>
                </button>
                <button class="rgb-copy-btn" data-copy-value="${c.b}" title="複製 B ${c.b}">
                  <span>B</span><strong>${c.b}</strong>
                </button>
              </div>
            </div>
          </div>`
        }).join("")}
      </div>
    </div>`
  }).join("");

  $$(".harmony-swatch").forEach(btn=>{
    btn.onclick=()=>updateColor(hexToRgb(btn.dataset.pick));
  });

  $$(".harmony [data-copy-value]").forEach(btn=>{
    btn.onclick=(e)=>{
      e.stopPropagation();
      copy(btn.dataset.copyValue);
    };
  });
}
function normalize(s){return String(s||"").toLowerCase().replace(/\s+/g,"").replace(/，/g,",")}
function cardHtml(c){
  return `<article class="color-card">
    <button class="swatch" style="background:${c.hex}" data-pick="${c.hex}" aria-label="選擇 ${c.zh}"></button>
    <div class="body">
      <div class="names"><div class="zh">${c.zh}</div><div class="en">${c.en}</div></div>
      <code>${c.hex}</code>
      <div class="card-actions">
        <button class="secondary" data-copy="${c.hex}">複製 HEX</button>
        <button class="secondary" data-copy="${c.rgb.join(", ")}">RGB</button>
      </div>
    </div>
  </article>`
}
function renderCards(){
  const q=normalize($("#searchColors").value);
  let list=DATA.filter(c=>{
    if(category!=="全部" && c.category!==category) return false;
    if(!q)return true;
    const hay=normalize([c.zh,c.en,c.hex,c.rgb.join(","),c.category,...c.tags].join(" "));
    return hay.includes(q);
  });
  $("#matchCount").textContent=`找到 ${list.length} 個命名色`;
  $("#colorCards").innerHTML=list.slice(0,visibleCount).map(cardHtml).join("");
  $("#loadMore").style.display=list.length>visibleCount?"inline-block":"none";
  $$("[data-pick]").forEach(b=>b.onclick=()=>updateColor(hexToRgb(b.dataset.pick)));
  $$("[data-copy]").forEach(b=>b.onclick=()=>copy(b.dataset.copy));
}
function setupFilters(){
  const cats=["全部","紅色系","橘色系","黃色系","綠色系","青色系","藍色系","紫色系","粉色系","灰色系","白色系","黑色系"];
  $("#filters").innerHTML=cats.map(c=>`<button class="filter ${c==="全部"?"active":""}" data-cat="${c}">${c}</button>`).join("");
  $$(".filter").forEach(b=>b.onclick=()=>{category=b.dataset.cat;visibleCount=40;$(".filter.active")?.classList.remove("active");b.classList.add("active");renderCards()});
}
function parseSearchColor(v){
  v=v.trim();
  let hex=hexToRgb(v); if(hex)return hex;
  let m=v.match(/(\d{1,3})\D+(\d{1,3})\D+(\d{1,3})/);
  if(m){let [r,g,b]=m.slice(1).map(Number);if([r,g,b].every(n=>n>=0&&n<=255))return {r,g,b}}
  let n=DATA.find(c=>normalize(c.zh)===normalize(v)||normalize(c.en)===normalize(v)||normalize(c.hex)===normalize(v));
  if(n)return {r:n.rgb[0],g:n.rgb[1],b:n.rgb[2]};
  return null;
}

$("#colorPicker").addEventListener("input",e=>updateColor(hexToRgb(e.target.value)));
$("#hexInput").addEventListener("input",e=>{
  if(/^#?[0-9a-f]{6}$/i.test(e.target.value.trim())) updateColor(hexToRgb(e.target.value));
});
$("#hexInput").addEventListener("change",e=>{let c=hexToRgb(e.target.value);if(c)updateColor(c);else showToast("HEX 格式不正確")});
["r","g","b"].forEach(k=>{
  $("#"+k+"Range").addEventListener("input",e=>updateColor({...current,[k]:+e.target.value}));
  $("#"+k+"Num").addEventListener("input",e=>updateColor({...current,[k]:+e.target.value}));
});
if($("#copyCurrent")) $("#copyCurrent").onclick=()=>copy(rgbToHex(current.r,current.g,current.b));
$("#heroSearchBtn").onclick=()=>{
  let v=$("#heroSearch").value,c=parseSearchColor(v);
  if(c){updateColor(c);document.querySelector("#pickerSection").scrollIntoView({behavior:"smooth"})}
  else{$("#searchColors").value=v;document.querySelector("#library").scrollIntoView({behavior:"smooth"});renderCards()}
};
$("#heroSearch").addEventListener("keydown",e=>{if(e.key==="Enter")$("#heroSearchBtn").click()});
$("#searchColors").addEventListener("input",()=>{visibleCount=40;renderCards()});
$("#loadMore").onclick=()=>{visibleCount+=40;renderCards()};


if($("#copyHexInline")) $("#copyHexInline").onclick=()=>copy(rgbToHex(current.r,current.g,current.b));
if($("#copyHexResult")) $("#copyHexResult").onclick=()=>copy(rgbToHex(current.r,current.g,current.b));
if($("#copyRgbResult")) $("#copyRgbResult").onclick=()=>copy(`${current.r}, ${current.g}, ${current.b}`);
$$("[data-copy-channel]").forEach(btn=>{
  btn.onclick=()=>copy(String(current[btn.dataset.copyChannel]));
});

setupFilters();renderCards();
let initial=null; try{initial=hexToRgb(new URL(location.href).searchParams.get("color")||"")}catch(e){}
updateColor(initial||current,false);
