// Ghana Ozone Trend Explorer: needs data.js (START, OZ) to be loaded first.
/*CORE-START*/
function lgamma(x){const c=[76.18009172947146,-86.50532032941677,24.01409824083091,-1.231739572450155,0.1208650973866179e-2,-0.5395239384953e-5];let y=x,t=x+5.5;t-=(x+.5)*Math.log(t);let s=1.000000000190015;for(let j=0;j<6;j++)s+=c[j]/++y;return -t+Math.log(2.5066282746310005*s/x);}
function betacf(a,b,x){const T=1e-300;let qab=a+b,qap=a+1,qam=a-1,c=1,d=1-qab*x/qap;if(Math.abs(d)<T)d=T;d=1/d;let h=d;for(let m=1;m<=200;m++){const m2=2*m;let aa=m*(b-m)*x/((qam+m2)*(a+m2));d=1+aa*d;if(Math.abs(d)<T)d=T;c=1+aa/c;if(Math.abs(c)<T)c=T;d=1/d;h*=d*c;aa=-(a+m)*(qab+m)*x/((a+m2)*(qap+m2));d=1+aa*d;if(Math.abs(d)<T)d=T;c=1+aa/c;if(Math.abs(c)<T)c=T;d=1/d;const dl=d*c;h*=dl;if(Math.abs(dl-1)<3e-14)break;}return h;}
function ibeta(a,b,x){if(x<=0)return 0;if(x>=1)return 1;const bt=Math.exp(lgamma(a+b)-lgamma(a)-lgamma(b)+a*Math.log(x)+b*Math.log(1-x));return x<(a+1)/(a+b+2)?bt*betacf(a,b,x)/a:1-bt*betacf(b,a,1-x)/b;}
function tP2(t,df){return ibeta(df/2,.5,df/(df+t*t));}
function tCrit(df){let lo=0,hi=100;for(let i=0;i<80;i++){const m=(lo+hi)/2;tP2(m,df)>.05?lo=m:hi=m;}return(lo+hi)/2;}
function erf(x){const s=x<0?-1:1;x=Math.abs(x);const t=1/(1+.3275911*x);return s*(1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-x*x));}
function normP2(z){return 1-erf(Math.abs(z)/Math.SQRT2);}
const sum=a=>a.reduce((p,q)=>p+q,0),mean=a=>sum(a)/a.length;
function pearson(a,b){const ma=mean(a),mb=mean(b);let n=0,da=0,db=0;for(let i=0;i<a.length;i++){n+=(a[i]-ma)*(b[i]-mb);da+=(a[i]-ma)**2;db+=(b[i]-mb)**2;}return n/Math.sqrt(da*db);}
function trend(x,y){const n=x.length,mx=mean(x),my=mean(y);let sxx=0,sxy=0;for(let i=0;i<n;i++){sxx+=(x[i]-mx)**2;sxy+=(x[i]-mx)*(y[i]-my);}
 const b=sxy/sxx,a=my-b*mx,res=x.map((v,i)=>y[i]-(a+b*v)),se=Math.sqrt(sum(res.map(r=>r*r))/(n-2)/sxx);
 const r1=Math.max(0,Math.min(.99,pearson(res.slice(0,-1),res.slice(1)))),ne=Math.max(n*(1-r1)/(1+r1),3),sa=se*Math.sqrt((n-2)/(ne-2)),df=ne-2,tc=tCrit(df);
 return{a,b,n,ne,r1,p:tP2(b/sa,df),lo:b-tc*sa,hi:b+tc*sa};}
function mk(x,y){const n=y.length;let S=0;const sl=[];for(let i=0;i<n-1;i++)for(let j=i+1;j<n;j++){S+=Math.sign(y[j]-y[i]);sl.push((y[j]-y[i])/(x[j]-x[i]));}
 sl.sort((p,q)=>p-q);const m=sl.length>>1,sen=sl.length%2?sl[m]:(sl[m-1]+sl[m])/2,z=S===0?0:(S-Math.sign(S))/Math.sqrt(n*(n-1)*(2*n+5)/18);return{p:normP2(z),sen};}
function prep(OZ){const N=OZ.length,yrs={};OZ.forEach((v,i)=>{const y=START+(i/12|0);(yrs[y]=yrs[y]||[]).push(v);});
 const full=Object.keys(yrs).filter(k=>yrs[k].length===12),CL=[];for(let m=0;m<12;m++)CL[m]=mean(full.map(k=>yrs[k][m]));
 const ANOM=OZ.map((v,i)=>v-CL[i%12]);
 return{OZ,N,ANOM,ROLL:ANOM.map((_,i)=>i<6||i>N-6?null:mean(ANOM.slice(i-6,i+6)))};}
const PREP={};for(const k in REGIONS)PREP[k]=prep(REGIONS[k].values);
function analyze(key,y0,y1){const{OZ,N,ANOM,ROLL}=PREP[key];const idx=[];for(let i=0;i<N;i++){const y=START+(i/12|0);if(y>=y0&&y<=y1)idx.push(i);}
 const x=idx.map(i=>START+(i/12|0)+(i%12+.5)/12),y=idx.map(i=>ANOM[i]),by={};
 idx.forEach(i=>{const k=START+(i/12|0);(by[k]=by[k]||[]).push(ANOM[i]);});
 const yrs=Object.keys(by).map(Number).filter(k=>by[k].length===12),ax=yrs.map(k=>k+.5),av=yrs.map(k=>mean(by[k]));
 return{x,y,roll:idx.map(i=>ROLL[i]),mon:trend(x,y),ann:yrs.length>=6?{n:yrs.length,ax,av,mk:mk(ax,av),ols:trend(ax,av)}:null,rawMean:mean(idx.map(i=>OZ[i])),span:x[x.length-1]-x[0]};}
function compare(y0,y1){const a=analyze('north',y0,y1),b=analyze('south',y0,y1),dy=a.y.map((v,i)=>v-b.y[i]);
 let ann=null;if(a.ann&&b.ann){ann={n:a.ann.n,mk:mk(a.ann.ax,a.ann.av.map((v,i)=>v-b.ann.av[i])),corr:pearson(a.ann.av,b.ann.av)};}
 return{a,b,x:a.x,mon:trend(a.x,dy),ann,corrM:pearson(a.y,b.y)};}
/*CORE-END*/
const $=id=>document.getElementById(id);
const sg=(v,d=2)=>(v<0?'−':'+')+Math.abs(v).toFixed(d),pf=p=>p<.001?'<0.001':p.toFixed(3);
let y0=1980,y1=2026,rg='ghana';
function nice(s){const p=Math.pow(10,Math.floor(Math.log10(s))),f=s/p;return(f<1.5?1:f<3.5?2:f<7.5?5:10)*p;}
function level(pm,pk){if(pk===null)return pm<.05?'sig':pm<.1?'mixed':'none';const s=(pm<.05)+(pk<.05);return s===2?'sig':(s===1||Math.min(pm,pk)<.1)?'mixed':'none';}
const lg=(c,t,dash)=>'<span><i style="'+(dash?'height:0;background:none;border-top:3px dashed var('+c+')':'background:var('+c+')')+'"></i>'+t+'</span>';
function draw(x,lines){
 const cv=$('chart'),d=window.devicePixelRatio||1,W=cv.parentElement.clientWidth-34,H=Math.max(260,Math.min(400,W*.55));
 cv.width=W*d;cv.height=H*d;cv.style.height=H+'px';const c=cv.getContext('2d');c.setTransform(d,0,0,d,0,0);
 const cs=getComputedStyle(document.documentElement),C=n=>cs.getPropertyValue(n).trim(),P={l:42,r:8,t:8,b:26},w=W-P.l-P.r,h=H-P.t-P.b;
 const all=[].concat(...lines.map(l=>l.v.filter(v=>v!==null)));let lo=Math.min(...all),hi=Math.max(...all);const pd=(hi-lo)*.08;lo-=pd;hi+=pd;
 const xa=x[0],xb=x[x.length-1],X=v=>P.l+(v-xa)/(xb-xa)*w,Y=v=>P.t+(hi-v)/(hi-lo)*h;
 c.font='12px system-ui,sans-serif';c.lineJoin='round';
 const st=nice((hi-lo)/5);c.textAlign='right';c.textBaseline='middle';
 for(let v=Math.ceil(lo/st)*st;v<=hi;v+=st){c.strokeStyle=C('--line');c.lineWidth=1;c.beginPath();c.moveTo(P.l,Y(v));c.lineTo(W-P.r,Y(v));c.stroke();c.fillStyle=C('--muted');c.fillText((+v.toFixed(2)).toString(),P.l-6,Y(v));}
 const sp=xb-xa,xs=sp>30?10:sp>15?5:sp>8?2:1;c.textAlign='center';c.textBaseline='top';
 for(let v=Math.ceil(xa/xs)*xs;v<=xb;v+=xs){c.fillStyle=C('--muted');c.fillText(v,X(v),H-P.b+7);}
 c.strokeStyle=C('--muted');c.setLineDash([4,4]);c.beginPath();c.moveTo(P.l,Y(0));c.lineTo(W-P.r,Y(0));c.stroke();
 lines.forEach(l=>{c.setLineDash(l.d||[]);c.strokeStyle=C(l.c);c.lineWidth=l.w;c.beginPath();let on=false;l.v.forEach((v,i)=>{if(v===null){on=false;return;}on?c.lineTo(X(x[i]),Y(v)):c.moveTo(X(x[i]),Y(v));on=true;});c.stroke();});
 c.setLineDash([]);
}
function ui(){const cmp=rg==='compare';$('v0').textContent=y0;$('v1').textContent=y1;$('s0').value=y0;$('s1').value=y1;
 $('ctitle').textContent=cmp?'Northern vs southern Ghana: 12-month average ozone anomaly with trend lines (DU)':'Ozone anomaly over '+REGIONS[rg].name+': difference from each month’s normal (DU)';
 $('extent').textContent=cmp?'North: '+REGIONS.north.extent+'  |  South: '+REGIONS.south.extent:'Area: '+REGIONS[rg].extent+' (grid cells of the MERRA-2 model, so edges are approximate)';
 document.querySelectorAll('#regions button').forEach(b=>b.classList.toggle('active',b.dataset.k===rg));}
function caveats(yrs,extra){const cv=[];if(yrs<10)cv.push('This is a short window ('+yrs+' years). Natural cycles have a big influence on short windows, so the trend is less reliable.');
 if(y0<2004&&y1>=2004)cv.push('This range crosses 2004, when MERRA-2 began using different satellite instruments, so part of any change may come from the data source.');
 if(y1===2026)cv.push('2026 only has data through September.');extra.forEach(t=>cv.push(t));
 $('caveats').innerHTML=cv.map(t=>'<li>'+t+'</li>').join('');}
function renderSingle(){
 const r=analyze(rg,y0,y1),m=r.mon,yrs=y1-y0+1,pm=m.p,pk=r.ann?r.ann.mk.p:null,dec=m.b*10,pct=dec/r.rawMean*100,tot=m.b*r.span,lv=level(pm,pk);
 const B=$('badge');B.className='badge '+lv;B.textContent={sig:'Significant change',mixed:'Borderline: mixed evidence',none:'No significant change'}[lv];
 const cards=[['Trend',sg(dec)+' DU/decade'],['95% range',sg(m.lo*10,1)+' to '+sg(m.hi*10,1)],['p-value (adjusted)',pf(pm)],['Mann–Kendall p (annual)',pk===null?'n/a (under 6 full years)':pf(pk)]];
 $('stats').innerHTML=cards.map(c=>'<div class="stat"><small>'+c[0]+'</small><strong>'+c[1]+'</strong></div>').join('');
 const dir=dec>=0?'rose':'fell',pS=pk===null?'':', Mann–Kendall p = '+pf(pk);
 const sigT={sig:'Yes, this looks like a real change. It passes the significance tests (regression p = '+pf(pm)+pS+'), so it is unlikely to be just natural year-to-year variation.',
  mixed:'The evidence is mixed. The p-values (regression p = '+pf(pm)+pS+') sit close to the usual 5% cut-off, so treat this as a possible trend, not a confirmed one.',
  none:'The change is not statistically significant (regression p = '+pf(pm)+pS+'). A shift this size could easily come from natural variability, so ozone looks roughly stable over this period.'}[lv];
 $('text').innerHTML='<p>From <b>'+y0+'</b> to <b>'+y1+'</b>, total column ozone over '+REGIONS[rg].name+' '+dir+' by about <b>'+Math.abs(dec).toFixed(2)+' DU per decade</b> ('+sg(pct)+'% per decade), roughly '+Math.abs(tot).toFixed(1)+' DU in total across the period. The 95% confidence range is '+sg(m.lo*10)+' to '+sg(m.hi*10)+' DU per decade'+(m.lo*m.hi<0?', which includes zero':'')+'.</p><p>'+sigT+'</p>';
 caveats(yrs,['Monthly values are strongly linked to the previous month, so p-values are adjusted for that (about '+Math.round(m.ne)+' independent points out of '+m.n+').']);
 draw(r.x,[{v:r.y,c:'--gray',w:1},{v:r.roll,c:'--accent',w:2},{v:r.x.map(v=>m.a+m.b*v),c:'--trend',w:3}]);
 $('legend').innerHTML=lg('--gray','Monthly anomaly')+lg('--accent','12-month average')+lg('--trend','Trend line');
}
function renderCompare(){
 const k=compare(y0,y1),A=k.a.mon,Bm=k.b.mon,D=k.mon,pm=D.p,pk=k.ann?k.ann.mk.p:null,lv=level(pm,pk),yrs=y1-y0+1,dd=D.b*10;
 const lN=level(A.p,k.a.ann?k.a.ann.mk.p:null),lS=level(Bm.p,k.b.ann?k.b.ann.mk.p:null),W={sig:'statistically significant',mixed:'borderline',none:'not statistically significant'};
 const B=$('badge');B.className='badge '+lv;B.textContent={sig:'Regions differ significantly',mixed:'Borderline difference',none:'No significant difference'}[lv];
 const r=k.ann?k.ann.corr:k.corrM;
 const cards=[['Northern trend',sg(A.b*10)+' DU/decade'],['Southern trend',sg(Bm.b*10)+' DU/decade'],['Gap trend (north − south)',sg(dd)+' DU/decade'],['Gap p-value (adjusted)',pf(pm)],['Gap Mann–Kendall p (annual)',pk===null?'n/a (under 6 full years)':pf(pk)],['Correlation north vs south',r.toFixed(2)]];
 $('stats').innerHTML=cards.map(c=>'<div class="stat"><small>'+c[0]+'</small><strong>'+c[1]+'</strong></div>').join('');
 const pS=pk===null?'':', Mann–Kendall p = '+pf(pk);
 const dT={sig:'The two regions are changing at significantly different rates (gap p = '+pf(pm)+pS+').',
  mixed:'There are signs that the regions differ, but the evidence is borderline (gap p = '+pf(pm)+pS+'), so it is not a confirmed difference.',
  none:'The difference between the two trends is not statistically significant (gap p = '+pf(pm)+pS+'). Ozone appears to be changing in much the same way in the north and the south, and any gap in the trend numbers could just be noise.'}[lv];
 const cT=r>=.7?'Their annual anomalies move closely together (correlation '+r.toFixed(2)+'), so most year-to-year ups and downs are shared across the country.':'Their annual anomalies move only loosely together (correlation '+r.toFixed(2)+'), so the regions have their own variations.';
 $('text').innerHTML='<p>From <b>'+y0+'</b> to <b>'+y1+'</b>, ozone over northern Ghana changed by about <b>'+sg(A.b*10)+' DU per decade</b> and over southern Ghana by about <b>'+sg(Bm.b*10)+' DU per decade</b>. The gap between them (north minus south) changed by '+sg(dd)+' DU per decade (95% range '+sg(D.lo*10)+' to '+sg(D.hi*10)+').</p><p>Taken separately, the northern trend is '+W[lN]+' and the southern trend is '+W[lS]+'. '+dT+'</p><p>'+cT+'</p>';
 caveats(yrs,['Monthly values are strongly linked to the previous month, so p-values are adjusted for that (about '+Math.round(D.ne)+' independent points out of '+D.n+').','Each region is only a few model grid cells wide, so small differences between them are hard to detect.']);
 const f=m=>k.x.map(v=>m.a+m.b*v);
 draw(k.x,[{v:k.a.roll,c:'--accent',w:2},{v:k.b.roll,c:'--trend',w:2},{v:f(A),c:'--accent',w:2.5,d:[7,5]},{v:f(Bm),c:'--trend',w:2.5,d:[7,5]}]);
 $('legend').innerHTML=lg('--accent','Northern Ghana (12-month average)')+lg('--trend','Southern Ghana (12-month average)')+lg('--gray','Dashed lines = trend lines',true);
}
function render(){ui();rg==='compare'?renderCompare():renderSingle();}
function setRange(a,b){y0=a;y1=b;render();}
$('s0').oninput=e=>{let a=+e.target.value;if(y1-a<3){a=Math.min(a,2023);y1=a+3;}setRange(a,y1);};
$('s1').oninput=e=>{let b=+e.target.value;if(b-y0<3){b=Math.max(b,1983);y0=b-3;}setRange(y0,b);};
[['Full record',1980,2026],['Before 2004',1980,2003],['2004 onward',2004,2026],['Last 20 years',2007,2026]].forEach(p=>{const b=document.createElement('button');b.textContent=p[0];b.onclick=()=>setRange(p[1],p[2]);$('presets').appendChild(b);});
Object.keys(REGIONS).concat('compare').forEach(k=>{const b=document.createElement('button');b.textContent=k==='compare'?'Compare North vs South':REGIONS[k].label;b.dataset.k=k;b.onclick=()=>{rg=k;render();};$('regions').appendChild(b);});
addEventListener('resize',render);matchMedia('(prefers-color-scheme: dark)').addEventListener('change',render);
render();
