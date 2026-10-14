// Audit mobile : parcours complets sur plusieurs téléphones, détection des textes qui se chevauchent, débordent ou sont coupés
import { chromium, webkit, devices } from 'playwright';
import fs from 'fs';
const BASE=process.env.BASE||'http://localhost:8765';const LOCAL=process.env.LOCAL==='1';const OUT=process.env.OUT||'captures';fs.mkdirSync(OUT,{recursive:true});
const PHONES=[['iphone14',devices['iPhone 14']],['iphoneSE',devices['iPhone SE']],['pixel7',devices['Pixel 7']],['galaxyS9',devices['Galaxy S9+']]];
const only=process.argv[2];
const browsers={chromium:await chromium.launch()};
if(!LOCAL){try{browsers.webkit=await webkit.launch()}catch(e){console.log('WebKit indisponible, les iPhone passent par Chromium')}}
const report=[];
async function audit(p,label){
  const r=await p.evaluate(()=>{
    const vw=innerWidth,vh=innerHeight,out={overlap:[],overflowX:document.documentElement.scrollWidth>vw+1?document.documentElement.scrollWidth:0,clipped:[],tiny:[],smallTap:[]};
    const vis=el=>{const s=getComputedStyle(el);if(s.visibility==='hidden'||s.display==='none'||+s.opacity===0)return false;const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<vh&&r.right>0&&r.left<vw};
    const boxes=[];const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
    while((n=walker.nextNode())){if(!n.textContent.trim())continue;const el=n.parentElement;if(!el||!vis(el))continue;
      if(el.closest('.maplibregl-canvas-container,.maplibregl-ctrl-attrib,svg,script,style,datalist,option'))continue;
      const rg=document.createRange();rg.selectNodeContents(n);const er=el.getBoundingClientRect();for(const r0 of rg.getClientRects()){const L=Math.max(r0.left,er.left),R=Math.min(r0.right,er.right),T=Math.max(r0.top,er.top),B=Math.min(r0.bottom,er.bottom);const rc={left:L,right:R,top:T,bottom:B,width:R-L,height:B-T};if(rc.width<2||rc.height<2)continue;if(rc.bottom<0||rc.top>vh)continue;boxes.push({el,rc,t:n.textContent.trim().slice(0,40)})}}
    // chevauchements entre textes de blocs différents (hors fenêtres modales qui recouvrent volontairement)
    const top=(x)=>{const e=document.elementFromPoint(Math.min(vw-1,Math.max(0,x.rc.left+x.rc.width/2)),Math.min(vh-1,Math.max(0,x.rc.top+x.rc.height/2)));return e};
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],c=boxes[j];if(a.el===c.el||a.el.contains(c.el)||c.el.contains(a.el))continue;
      const w=Math.min(a.rc.right,c.rc.right)-Math.max(a.rc.left,c.rc.left),h=Math.min(a.rc.bottom,c.rc.bottom)-Math.max(a.rc.top,c.rc.top);
      if(w>3&&h>3&&w*h>40){const ta=top(a),tc=top(c);const va=ta&&(ta===a.el||a.el.contains(ta)||ta.contains(a.el)),vc=tc&&(tc===c.el||c.el.contains(tc)||tc.contains(c.el));
        const cx=(Math.max(a.rc.left,c.rc.left)+Math.min(a.rc.right,c.rc.right))/2,cy=(Math.max(a.rc.top,c.rc.top)+Math.min(a.rc.bottom,c.rc.bottom))/2;
        const t0=document.elementFromPoint(cx,cy);let cache=false;
        if(t0){const autre=(a.el.contains(t0)||t0.contains(a.el))?c.el:a.el;let x=t0;while(x&&x!==document.body&&!x.contains(autre)){const bg=getComputedStyle(x).backgroundColor;if(bg&&!/rgba\(0, 0, 0, 0\)|transparent/.test(bg)&&x!==a.el&&x!==c.el){cache=true;break}x=x.parentElement}}
        if(va&&vc&&!cache)out.overlap.push(a.t+'  ⟂  '+c.t+' ['+Math.round(w)+'x'+Math.round(h)+']')}}
    // textes coupés (overflow caché sans ellipse voulue) et éléments plus larges que l'écran
    document.querySelectorAll('body *').forEach(el=>{if(!vis(el))return;const s=getComputedStyle(el);const r=el.getBoundingClientRect();
      if(r.right>vw+2&&!el.closest('.sbl-rail,.sbl-mh .mc,.maplibregl-map,.tbl,.sbl-tabs,.seg,.api pre,.api-nav,.tabs-bar,.dlc-map'))out.clipped.push('déborde: '+(el.id||el.className||el.tagName)+' '+Math.round(r.right));
      if(!el.closest('svg')&&[...el.childNodes].some(x=>x.nodeType===3&&x.textContent.trim())){const fs=parseFloat(s.fontSize);if(fs<11.5)out.tiny.push((el.className||el.tagName)+'='+fs);
        if(!el.matches('.vh,.sr-only,.sbl-vh')&&(s.overflow==='hidden'||s.overflowX==='hidden')&&s.textOverflow!=='ellipsis'&&el.scrollWidth>el.clientWidth+2)out.clipped.push('coupé: '+(el.className||el.tagName)+' «'+el.textContent.trim().slice(0,30)+'»')}
      if(el.matches('button,a,input,select,[role=tab]')&&!el.closest('p,li,dd,label,.sbl-fine')){const af=getComputedStyle(el,'::after'),g=af.content!=='none'&&af.position==='absolute'?Math.max(0,-parseFloat(af.top)||0):0;if(r.height+2*g<24||r.width+2*g<24)out.smallTap.push((el.id||el.className||el.tagName)+' '+Math.round(r.width)+'x'+Math.round(r.height))}});
    out.overlap=[...new Set(out.overlap)].slice(0,12);out.clipped=[...new Set(out.clipped)].slice(0,10);out.tiny=[...new Set(out.tiny)].slice(0,8);out.smallTap=[...new Set(out.smallTap)].slice(0,10);return out});
  report.push({label,...r});
}
for(const [name,dev] of PHONES){ if(only&&name!==only)continue;
  const {defaultBrowserType,...opts}=dev;const br=browsers[defaultBrowserType]||browsers.chromium;
  const ctx=await br.newContext({...opts,locale:'fr-FR'});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  if(LOCAL){
  await p.route(/jsdelivr/,r=>r.fulfill({path:'/home/claude/build/ml/package/dist/maplibre-gl.js',contentType:'application/javascript'}));
  await p.route(/geopf.*\.json/,r=>r.fulfill({contentType:'application/json',body:JSON.stringify({version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':'#ece8de'}}]})}));
  await p.route(/wikipedia\.org\/api/,r=>r.fulfill({contentType:'application/json',body:JSON.stringify({type:'standard',description:'commune française',extract:'',thumbnail:{source:'https://upload.wikimedia.org/x/320px-photo.jpg'},content_urls:{desktop:{page:'https://fr.wikipedia.org'}}})}));
  await p.route(/upload\.wikimedia|openagenda|cdt|tourisme|\.jpe?g|\.png|\.webp/i,r=>{const u=r.request().url();if(u.startsWith('http://localhost'))return r.continue();return r.fulfill({path:/affiche|poster|openagenda/i.test(u)?'/tmp/claude-0/affiche.jpg':'/tmp/claude-0/photo.jpg',contentType:'image/jpeg'})});
  await p.route(/commons\.wikimedia|overpass/,r=>r.abort());
  }
  const shot=async n=>p.screenshot({path:`${OUT}/${name}-${n}.png`});
  await p.goto(BASE+'/index.html'); await p.waitForTimeout(LOCAL?5000:9000);
  await audit(p,name+' accueil'); await shot('1-accueil');
  await p.evaluate(()=>scrollTo(0,700)); await p.waitForTimeout(600); await audit(p,name+' liste'); await shot('2-liste');
  await p.evaluate(()=>scrollTo(0,0)); await p.tap('#sbl-q'); await p.waitForTimeout(600); await audit(p,name+' suggestions'); await shot('3-suggestions');
  await p.fill('#sbl-q','Moulins'); await p.press('#sbl-q','Enter'); await p.waitForTimeout(2500); await audit(p,name+' recherche'); await shot('4-recherche');
  const ev=await p.$('.sbl-ev'); if(ev){await ev.tap(); await p.waitForTimeout(1200); await audit(p,name+' fiche sortie'); await shot('5-fiche'); await p.evaluate(()=>{const s=document.querySelector('.sbl-sheet');if(s)s.scrollTop=9999}); await p.waitForTimeout(300); await audit(p,name+' fiche bas'); await shot('5b-fiche-bas'); await p.tap('#sbl-x')}
  const lv=await p.$('.lvc'); if(lv){await lv.tap(); await p.waitForTimeout(1000); await audit(p,name+' fiche lieu'); await shot('6-lieu'); await p.tap('#sbl-x')}
  await p.evaluate(()=>scrollTo(0,0)); await p.tap('.sbl-tab[data-v="map"]'); await p.waitForTimeout(1500); await audit(p,name+' carte'); await shot('7-carte');
  const pin=await p.$('.sbl-pin'); if(pin){await pin.tap({force:true}); await p.waitForTimeout(1500); await audit(p,name+' bulle'); await shot('8-bulle')}
  await p.tap('.sbl-tab[data-v="cal"]'); await p.waitForTimeout(800); await audit(p,name+' calendrier'); await shot('9-calendrier');
  const day=await p.$('#sbl-cal button .n'); if(day){await (await day.evaluateHandle(e=>e.closest('button'))).tap(); await p.waitForTimeout(800); await audit(p,name+' jour'); await shot('10-jour')}
  await p.tap('.sbl-tab[data-v="list"]'); await p.evaluate(()=>scrollTo(0,0)); await p.tap('#sbl-prop'); await p.waitForTimeout(800); await audit(p,name+' proposer'); await shot('11-proposer');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300); await p.tap('#sbl-reg'); await p.waitForTimeout(800); await audit(p,name+' départements'); await shot('12-region');
  // page API (documentation, widgets en direct, console « Essayer »)
  await p.goto(BASE+'/api.html'); await p.waitForTimeout(LOCAL?3000:7000); await audit(p,name+' api haut'); await shot('13-api');
  for(const [id,n] of [['widgets','14-api-widgets'],['rest','15-api-rest']]){await p.evaluate(i=>document.getElementById(i).scrollIntoView(),id); await p.waitForTimeout(700); await audit(p,name+' api '+id); await shot(n)}
  await p.evaluate(()=>document.getElementById('essayer').scrollIntoView()); await p.tap('#ex button[type=submit]'); await p.waitForTimeout(1500);
  await p.evaluate(()=>document.getElementById('ex-out').scrollIntoView({block:'start'})); await p.waitForTimeout(400); await audit(p,name+' api essayer'); await shot('16-api-essayer');
  report.push({label:name+' erreurs JS',errs});
  await ctx.close();
}
for(const x of Object.values(browsers))await x.close();
for(const r of report){const keys=['overlap','overflowX','clipped','tiny','smallTap','errs'].filter(k=>r[k]&&(Array.isArray(r[k])?r[k].length:r[k]));if(!keys.length){console.log('OK  ',r.label);continue}
  console.log('PB  ',r.label);keys.forEach(k=>console.log('     '+k+':',Array.isArray(r[k])?r[k].join(' || '):r[k]))}

fs.writeFileSync(OUT+'/rapport.json',JSON.stringify(report,null,1));
const graves=report.filter(r=>(r.overlap&&r.overlap.length)||r.overflowX||(r.errs&&r.errs.length));
if(graves.length){console.log('\n'+graves.length+' écran(s) avec chevauchement, débordement ou erreur');process.exitCode=1}
