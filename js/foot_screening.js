// 코어 로직 및 UI 연산
(function(){
  var $=function(id){return document.getElementById(id);};
  
  var S = { left: { sit: null, stand: null }, right: { sit: null, stand: null } };
  window.__fsState=S;

  var tabs=[$('fsTab1'),$('fsTab2')];
  var panes=[$('fsPane1'),$('fsPane2')];
  function go(i){
    for(var k=0;k<2;k++){ tabs[k].classList.toggle('on',k===i); panes[k].classList.toggle('fs-off',k!==i); }
    if(i===1) renderLoad();
  }
  if(tabs[0]) tabs[0].addEventListener('click',function(){ go(0); });
  if(tabs[1]) tabs[1].addEventListener('click',function(){ go(1); });

  var PROG = {
    flat: { title: '평발(저아치) · 아치 세우기 4주', goal: '발바닥 안쪽 근육(내재근)을 깨워 아치를 끌어올리고, 발이 안으로 무너지지 않는 걸음을 만듭니다.', walk: '뒤꿈치로 착지한 뒤 발 안쪽을 지나 엄지발가락으로 지면을 밀어내며 나아갑니다. 걷는 내내 바깥으로 체중을 싣지 마세요. 발목이 안쪽으로 무너지면 속도를 줄이고 아치를 세우세요.', ex: [['숏풋 운동', '발가락을 구부리지 않고 발바닥 아치만 끌어올려 5초 유지.', '10회 × 2세트'], ['타월 컬', '바닥에 수건을 펴고 발가락으로 끌어당기기.', '15회 × 3세트'], ['까치발 들기', '3초에 올리고 3초에 내리기. 엄지 쪽으로 힘이 실리게.', '15회 × 2세트'], ['한발 서기', '아치를 세운 상태 유지하며 균형 잡기.', '30초 × 좌우 2회']] },
    high: { title: '요족(고아치) · 유연성·충격흡수 4주', goal: '뻣뻣한 발바닥과 종아리를 풀어 충격 흡수를 돕고, 발 전체가 고르게 닿는 걸음을 만듭니다.', walk: '딱딱한 바닥에서 장시간 걷기는 피하고, 쿠션이 좋은 신발을 신으세요. 보폭을 약간 줄이고 부드럽게 착지하되, 마지막에 엄지발가락으로 지면을 밀어내는 느낌을 의식합니다.', ex: [['발바닥 볼 마사지', '골프공·마사지볼을 발바닥 전체로 천천히 굴리기.', '2분 × 좌우'], ['종아리 스트레칭', '벽을 밀며 뒷다리 무릎을 편 자세 30초, 살짝 굽힌 자세 30초.', '각 30초 × 3회'], ['발가락 벌리기', '발가락을 최대한 부채처럼 펼쳤다 오므리기.', '10회 × 2세트'], ['발목 가동성', '발목으로 크게 원 그리기(안·밖 방향).', '10회씩 × 2세트']] },
    normal: { title: '정상 아치 · 유지 프로그램', goal: '좋은 아치를 유지하고 바른 걸음 습관을 굳힙니다.', walk: '뒤꿈치로 착지해 발 안쪽을 지나 엄지발가락으로 밀어내며 나아가고, 11자 발 정렬을 유지하세요. 하루 6,000~8,000보, 약간 숨이 찰 정도의 속도로 걸으면 매우 좋습니다.', ex: [['까치발 들기', '3초에 올리고 3초에 내리기.', '15회 × 1세트'], ['한발 서기', '좌우 균형 감각 유지.', '30초 × 좌우 1회'], ['발가락 가위바위보', '발가락으로 주먹·보 모양 만들기.', '10회']] }
  };

  var fileInput=$('paFile'), canvas=$('paCanvas');
  if(!canvas) return; 
  var ctx=canvas.getContext('2d');
  var img=new Image();
  var work=document.createElement('canvas'), wctx=work.getContext('2d',{willReadFrequently:true});
  var MAXW=480;
  
  var state={ rot:0, invert:false, thOff:0, bright:0, contrast:0, imgBrightness:100, imgContrast:100, brushPct:8, mask:null, w:0, h:0, bbox:null, toeY:0, heelY:0, dpr:Math.min(window.devicePixelRatio||1,2), drag:null, mode:'none', brushPt:null, polyPts:[], bin:null, prevCanvas:null, linesManual:false, undoStack:[], diag:false };

  function prepWork(){ var iw=img.naturalWidth, ih=img.naturalHeight; var rot=state.rot%360; var sw=iw, sh=ih; if(rot===90||rot===270){ sw=ih; sh=iw; } var sc=Math.min(1, MAXW/Math.max(sw,sh)); var W=Math.max(1,Math.round(sw*sc)), H=Math.max(1,Math.round(sh*sc)); work.width=W; work.height=H; wctx.save(); wctx.clearRect(0,0,W,H); wctx.translate(W/2,H/2); wctx.rotate(rot*Math.PI/180); wctx.scale(sc,sc); wctx.filter='brightness('+(1+state.bright/100)+') contrast('+(1+state.contrast/100)+')'; wctx.drawImage(img,-iw/2,-ih/2); wctx.filter='none'; wctx.restore(); state.w=W; state.h=H; }
  function otsu(gray){ var hist=new Array(256).fill(0), i, n=gray.length; for(i=0;i<n;i++) hist[gray[i]]++; var sum=0; for(i=0;i<256;i++) sum+=i*hist[i]; var sumB=0,wB=0,max=0,th=127; for(i=0;i<256;i++){ wB+=hist[i]; if(!wB)continue; var wF=n-wB; if(!wF)break; sumB+=i*hist[i]; var mB=sumB/wB, mF=(sum-sumB)/wF, between=wB*wF*(mB-mF)*(mB-mF); if(between>max){max=between;th=i;} } return th; }
  function integralImage(gray,W,H){ var I=new Float64Array((W+1)*(H+1)); for(var y=0;y<H;y++){ var r=0; for(var x=0;x<W;x++){ r+=gray[y*W+x]; I[(y+1)*(W+1)+x+1]=I[y*(W+1)+x+1]+r; } } return I; }
  function boxMean(I,IW,x,y,W,H,half){ var x1=Math.max(0,x-half),x2=Math.min(W-1,x+half),y1=Math.max(0,y-half),y2=Math.min(H-1,y+half); var c=(x2-x1+1)*(y2-y1+1); return (I[(y2+1)*IW+x2+1]-I[y1*IW+x2+1]-I[(y2+1)*IW+x1]+I[y1*IW+x1])/c; }
  function buildPreview(dark,mx,W,H){ var c=state.prevCanvas; if(!c){ c=document.createElement('canvas'); state.prevCanvas=c; } c.width=W; c.height=H; var pc=c.getContext('2d'), im=pc.createImageData(W,H), p=im.data; for(var i=0;i<dark.length;i++){ var s=255-Math.round(dark[i]/mx*205); var j=i*4; p[j]=s; p[j+1]=s; p[j+2]=s; p[j+3]=255; } pc.putImageData(im,0,0); }
  function binarize(){ var W=state.w,H=state.h, d=wctx.getImageData(0,0,W,H).data, n=W*H; var gray=new Uint8Array(n); for(var i=0;i<n;i++){ var j=i*4; gray[i]=(d[j]*0.299+d[j+1]*0.587+d[j+2]*0.114)|0; } var IW=W+1, I=integralImage(gray,W,H), half=Math.max(8,Math.round(Math.min(W,H)*0.5)); var dark=new Uint8Array(n), mx=1; for(i=0;i<n;i++){ var x=i%W, y=(i/W)|0, bg=boxMean(I,IW,x,y,W,H,half); var v = state.invert ? (gray[i]-bg) : (bg-gray[i]); if(v<0)v=0; if(v>255)v=255; dark[i]=v|0; if(dark[i]>mx)mx=dark[i]; } buildPreview(dark,mx,W,H); var th=Math.max(2,otsu(dark)+state.thOff); var bin=new Uint8Array(n); for(i=0;i<n;i++) bin[i]= dark[i]>th ?1:0; var bd=Math.round(Math.min(W,H)*0.02); if(bd>0){ for(var yy=0;yy<H;yy++) for(var xx=0;xx<W;xx++){ if(xx<bd||xx>=W-bd||yy<bd||yy>=H-bd) bin[yy*W+xx]=0; } } state.bin=bin; return bin; }
  function dilate(m,r){ var W=state.w,H=state.h,n=W*H,o=new Uint8Array(n); for(var y=0;y<H;y++)for(var x=0;x<W;x++){ var a=0; for(var dy=-r;dy<=r&&!a;dy++)for(var dx=-r;dx<=r;dx++){ var ny=y+dy,nx=x+dx; if(ny>=0&&ny<H&&nx>=0&&nx<W&&m[ny*W+nx]){a=1;break;} } o[y*W+x]=a; } return o; }
  function erode(m,r){ var W=state.w,H=state.h,n=W*H,o=new Uint8Array(n); for(var y=0;y<H;y++)for(var x=0;x<W;x++){ var ok=1; for(var dy=-r;dy<=r&&ok;dy++)for(var dx=-r;dx<=r;dx++){ var ny=y+dy,nx=x+dx; if(ny<0||ny>=H||nx<0||nx>=W||!m[ny*W+nx]){ok=0;break;} } o[y*W+x]=ok; } return o; }
  function cleanMask(bin){ var b=erode(dilate(bin,3),3); b=dilate(erode(b,1),1); state.bin=b; return b; }
  function largestComponent(bin){ var W=state.w,H=state.h,n=W*H, lab=new Int32Array(n), cur=0, best=0,bestSize=0; var stack=new Int32Array(n); for(var p=0;p<n;p++){ if(bin[p]&&!lab[p]){ cur++; var sp=0; stack[sp++]=p; lab[p]=cur; var size=0; while(sp){ var q=stack[--sp]; size++; var x=q%W,y=(q/W)|0; if(x>0){var l=q-1; if(bin[l]&&!lab[l]){lab[l]=cur;stack[sp++]=l;}} if(x<W-1){var r=q+1; if(bin[r]&&!lab[r]){lab[r]=cur;stack[sp++]=r;}} if(y>0){var u=q-W; if(bin[u]&&!lab[u]){lab[u]=cur;stack[sp++]=u;}} if(y<H-1){var dn=q+W; if(bin[dn]&&!lab[dn]){lab[dn]=cur;stack[sp++]=dn;}} } if(size>bestSize){bestSize=size;best=cur;} } } var out=new Uint8Array(n); if(best) for(p=0;p<n;p++) out[p]=lab[p]===best?1:0; return out; }
  function fillHoles(m){ var W=state.w,H=state.h,n=W*H, bg=new Uint8Array(n), st=new Int32Array(n),sp=0,p; function push(q){ if(!m[q]&&!bg[q]){bg[q]=1;st[sp++]=q;} } for(var x=0;x<W;x++){push(x);push((H-1)*W+x);} for(var y=0;y<H;y++){push(y*W);push(y*W+W-1);} while(sp){ var q=st[--sp],qx=q%W,qy=(q/W)|0; if(qx>0)push(q-1); if(qx<W-1)push(q+1); if(qy>0)push(q-W); if(qy<H-1)push(q+W); } var out=new Uint8Array(n); for(p=0;p<n;p++) out[p]=(m[p]||!bg[p])?1:0; return out; }
  function rowWidth(m,y){ var W=state.w,lo=-1,hi=-1; for(var x=0;x<W;x++){ if(m[y*W+x]){if(lo<0)lo=x;hi=x;} } return lo<0?0:hi-lo+1; }
  function bandArea(m,y0,y1){ var W=state.w,a=0; for(var y=y0;y<y1;y++) for(var x=0;x<W;x++) if(m[y*W+x])a++; return a; }
  
  function compute(){
    var m=state.mask; if(!m) return null;
    var t=Math.round(state.toeY), hl=Math.round(state.heelY);
    if(!(hl>t)){ 
      var bb=maskBBox(); if(bb.h<3) return null;
      t=Math.round(bb.top+bb.h*0.20); hl=bb.bot; if(!(hl>t)) return null;
    }
    var L=hl-t, r1=Math.round(t+L/3), r2=Math.round(t+2*L/3);
    var fA=bandArea(m,t,r1), mA=bandArea(m,r1,r2), hA=bandArea(m,r2,hl), tot=fA+mA+hA;
    var AI=tot>0?mA/tot:0, foreMax=0, y, k;
    var raw=[]; for(y=r1;y<r2;y++) raw.push(rowWidth(m,y));
    var mws=[], zeros=0;
    for(k=0;k<raw.length;k++){
      var a=raw[Math.max(0,k-1)], b=raw[k], c=raw[Math.min(raw.length-1,k+1)];
      var med=Math.max(Math.min(a,b),Math.min(Math.max(a,b),c)); mws.push(med); if(med===0) zeros++;
    }
    var midMin, nz=[]; for(k=0;k<mws.length;k++) if(mws[k]>0) nz.push(mws[k]);
    if(mws.length===0||nz.length===0) midMin=0;
    else if(zeros/mws.length>0.6) midMin=0;
    else { nz.sort(function(a2,b2){return a2-b2;}); midMin=nz[Math.min(nz.length-1,Math.floor(nz.length*0.12))]; }
    for(y=t;y<r1;y++) foreMax=Math.max(foreMax,rowWidth(m,y));
    if(foreMax===0){ for(y=t;y<hl;y++) foreMax=Math.max(foreMax,rowWidth(m,y)); } 
    var CSI=foreMax>0?Math.min(100,(midMin/foreMax)*100):0;
    var arch = AI<=0.21?'high' : (AI<=0.26?'normal':'flat');
    return {AI:AI, CSI:CSI, arch:arch, r1:r1, r2:r2};
  }

  function autoLines(){
    var m=state.mask,W=state.w,H=state.h, top=-1,bot=-1,y;
    for(y=0;y<H;y++){ if(rowWidth(m,y)>0){ if(top<0)top=y; bot=y; } }
    if(top<0){top=0;bot=H-1;} state.bbox=[top,bot];
    state.toeY=Math.round(top+(bot-top)*0.20); state.heelY=bot;
  }

  function render(){
    var W=state.w,H=state.h,dpr=state.dpr;
    canvas.width=W*dpr; canvas.height=H*dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,W,H);
    
    ctx.save();
    ctx.filter = `brightness(${state.imgBrightness}%) contrast(${state.imgContrast}%)`;

    if(state.prevCanvas){ ctx.globalAlpha=0.92; ctx.drawImage(state.prevCanvas,0,0,W,H); ctx.globalAlpha=1; }
    else { ctx.globalAlpha=0.55; ctx.drawImage(work,0,0,W,H); ctx.globalAlpha=1; }
    
    ctx.filter = 'none';
    ctx.restore();

    var res=compute(); var m=state.mask;
    
    if(m){
      var t=state.toeY,hl=state.heelY,r1=res?res.r1:t,r2=res?res.r2:t;
      var buf=ctx.createImageData(W,H), bd=buf.data;
      for(var y=0;y<H;y++){ var col;
        if(y>=t&&y<r1)col=[217,132,42]; else if(y>=r1&&y<r2)col=[46,139,87]; else if(y>=r2&&y<hl)col=[46,92,158]; else col=null;
        for(var x=0;x<W;x++){ var p=y*W+x, q=p*4;
          if(m[p]){ if(col){bd[q]=col[0];bd[q+1]=col[1];bd[q+2]=col[2];bd[q+3]=170;} else {bd[q]=120;bd[q+1]=130;bd[q+2]=145;bd[q+3]=130;} }
        }
      }
      var tmp=document.createElement('canvas'); tmp.width=W; tmp.height=H; tmp.getContext('2d').putImageData(buf,0,0);
      ctx.drawImage(tmp,0,0,W,H);
    }
    drawLine(state.toeY,'위 · 발볼'); drawLine(state.heelY,'아래 · 뒤꿈치');
    
    if((state.mode==='erase'||state.mode==='fill') && state.brushPt){
      var R=brushR();
      ctx.strokeStyle=(state.mode==='fill')?'#2E5C9E':'#E23B3B'; ctx.lineWidth=2; ctx.setLineDash([4,3]);
      ctx.beginPath(); ctx.arc(state.brushPt.x,state.brushPt.y,R,0,7); ctx.stroke(); ctx.setLineDash([]);
    }

    if(state.mode==='poly' && state.polyPts.length > 0) {
      ctx.strokeStyle = '#2E8B57';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(state.polyPts[0].x, state.polyPts[0].y);
      for(var i=1; i<state.polyPts.length; i++){
          ctx.lineTo(state.polyPts[i].x, state.polyPts[i].y);
      }
      if(state.polyPts.length > 2) ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#D9842A';
      for(var i=0; i<state.polyPts.length; i++){
          ctx.beginPath();
          ctx.arc(state.polyPts[i].x, state.polyPts[i].y, 4, 0, 7);
          ctx.fill();
          ctx.stroke();
      }
    }
  }

  function drawLine(y,label){
    var W=state.w; 
    ctx.strokeStyle='#FFC24D'; ctx.lineWidth=2; ctx.setLineDash([7,5]);
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); ctx.setLineDash([]);
    
    ctx.fillStyle='#FFC24D'; 
    ctx.beginPath(); ctx.arc(16, y, 10, 0, 7); ctx.fill();

    ctx.fillStyle='#FFC24D'; ctx.font='700 12px Pretendard,sans-serif'; 
    ctx.fillText(label, 32, y - 6);
  }

  function refresh(){ updatePanel(); try{ render(); }catch(e){} }
  
  function updatePanel(){
    var r = compute();
    if(!r){ 
        if($('paAI')) $('paAI').textContent='–'; 
        if($('paCSI')) $('paCSI').textContent='–'; 
        if($('paCat')) $('paCat').textContent='–'; 
        if($('paInterp')) $('paInterp').textContent='발 인식 후 결과가 표시됩니다.';
        return; 
    }
    if($('paAI')) $('paAI').textContent=r.AI.toFixed(3);
    var map={high:['요족 (고아치)','#2E5C9E','충격 흡수가 적어 쿠션이 중요합니다.'], normal:['정상','#2E8B57','안정적인 아치 형태입니다.'], flat:['평발 (저아치)','#D9842A','아치 지지가 필요한 형태입니다.']};
    var c=map[r.arch];
    if($('paCat')) { $('paCat').textContent=c[0]; $('paCat').style.background=c[1]; }
    if($('paAI')) $('paAI').style.color=c[1];
    if($('paCSI')) $('paCSI').textContent=r.CSI.toFixed(1);
    if($('paInterp')) $('paInterp').textContent=c[2]; 
  }

  function maskBBox(){
    var W=state.w,H=state.h,m=state.mask,top=H,bot=-1,left=W,right=-1;
    for(var y=0;y<H;y++)for(var x=0;x<W;x++)if(m[y*W+x]){ if(y<top)top=y; if(y>bot)bot=y; if(x<left)left=x; if(x>right)right=x; }
    if(bot<0) return {w:0,h:0,top:0,bot:H-1,left:0,right:W-1};
    return {w:right-left+1,h:bot-top+1,top:top,bot:bot,left:left,right:right};
  }
  function reanalyze(keepLines){
    prepWork(); var bin=binarize(); bin=cleanMask(bin); var comp=largestComponent(bin); state.mask=fillHoles(comp);
    if(!keepLines){
      if(!state.autoRot){
        var bb=maskBBox();
        if(bb.w > bb.h*1.15){ state.autoRot=true; state.rot=(state.rot+90)%360; reanalyze(false); return; }
      }
      autoLines();
    } else { 
      var top=-1,bot=-1; for(var y=0;y<state.h;y++){ if(rowWidth(state.mask,y)>0){if(top<0)top=y;bot=y;} }
      if(top<0){top=0;bot=state.h-1;} state.bbox=[top,bot];
      state.toeY=Math.max(top,Math.min(state.toeY,bot-2)); state.heelY=Math.max(state.toeY+2,Math.min(state.heelY,bot));
    }
    refresh();
  }

  if($('paPick')) $('paPick').addEventListener('click',function(){ fileInput.click(); });
  if(fileInput) fileInput.addEventListener('change',function(e){
    var f=e.target.files&&e.target.files[0]; if(!f) return;
    var url=URL.createObjectURL(f);
    img.onload=function(){ state.rot=0; state.invert=false; state.thOff=0; state.bright=0; state.contrast=0; state.bbox=null; state.mode='none'; state.linesManual=false; state.autoRot=false; state.undoStack=[]; state.polyPts=[];
      
      state.imgBrightness = 100; state.imgContrast = 100;
      if($('paBrightness')) $('paBrightness').value=100;
      if($('paContrast')) $('paContrast').value=100;
      
      if($('paTh')) $('paTh').value=0; updateThLbl();
      if($('paBright')) $('paBright').value=0; if($('paContrast')) $('paContrast').value=0; updateAdjLbl();
      if($('paInvert')) $('paInvert').classList.remove('on');
      if($('paIntake')) $('paIntake').classList.add('pa-hide');
      if($('paAdjust')) $('paAdjust').classList.remove('pa-hide'); 
      if($('paResult')) $('paResult').classList.remove('pa-hide');
      reanalyze(false); applyModeUI();
      URL.revokeObjectURL(url);
    };
    img.src=url;
  });
  
  if($('paBrightness')) {
      $('paBrightness').addEventListener('input', function(e){ state.imgBrightness = e.target.value; render(); });
  }
  if($('paContrast')) {
      $('paContrast').addEventListener('input', function(e){ state.imgContrast = e.target.value; render(); });
  }
  if($('paFilterReset')) {
      $('paFilterReset').addEventListener('click', function(){
          state.imgBrightness = 100; state.imgContrast = 100; state.thOff = 0;
          if($('paBrightness')) $('paBrightness').value = 100;
          if($('paContrast')) $('paContrast').value = 100;
          if($('paTh')) $('paTh').value = 0;
          updateThLbl();
          render();
          reanalyze(true);
      });
  }

  function updateThLbl(){ if($('paTh') && $('paThVal')){ var v=parseInt($('paTh').value,10); $('paThVal').textContent=(v>0?'+':'')+v; } }
  function updateAdjLbl(){
    if($('paBright') && $('paBrightVal')){ var b=parseInt($('paBright').value,10); $('paBrightVal').textContent=(b>0?'+':'')+b; }
    if($('paContrast') && $('paContrastVal')){ var c=parseInt($('paContrast').value,10); $('paContrastVal').textContent=(c>0?'+':'')+c; }
  }
  function pctile(hist,n,p){ var t=n*p, c=0; for(var i=0;i<256;i++){ c+=hist[i]; if(c>=t) return i; } return 255; }
  function autoContrast(){
    var sb=state.bright, scv=state.contrast; state.bright=0; state.contrast=0; prepWork();
    var W=state.w,H=state.h,d=wctx.getImageData(0,0,W,H).data,n=W*H, hist=new Array(256).fill(0);
    for(var i=0;i<n;i++){ var j=i*4; hist[(d[j]*0.299+d[j+1]*0.587+d[j+2]*0.114)|0]++; }
    var lo=pctile(hist,n,0.02), hi=pctile(hist,n,0.98), mid=pctile(hist,n,0.5), range=Math.max(8,hi-lo);
    var bf=Math.max(0.55,Math.min(1.7,128/Math.max(1,mid)));      
    var cf=Math.max(1,Math.min(2.6,235/Math.max(8,bf*range)));   
    var bv=Math.max(-60,Math.min(60,Math.round((bf-1)*100)));
    var cv=Math.max(-50,Math.min(120,Math.round((cf-1)*100)));
    state.bright=bv; state.contrast=cv;
    if($('paBright')) $('paBright').value=bv; if($('paContrast')) $('paContrast').value=cv; updateAdjLbl();
    reanalyze(true);
  }
  
  if($('paTh')) $('paTh').addEventListener('change',function(){ state.thOff=parseInt(this.value,10); updateThLbl(); reanalyze(true); });
  if($('paBright')) $('paBright').addEventListener('input',function(){ state.bright=parseInt(this.value,10); updateAdjLbl(); reanalyze(true); });
  if($('paContrast')) $('paContrast').addEventListener('input',function(){ state.contrast=parseInt(this.value,10); updateAdjLbl(); reanalyze(true); });
  if($('paAutoC')) $('paAutoC').addEventListener('click',autoContrast);
  if($('paInvert')) $('paInvert').addEventListener('click',function(){ state.invert=!state.invert; this.classList.toggle('on',state.invert); reanalyze(true); });
  if($('paRotate')) $('paRotate').addEventListener('click',function(){ state.rot=(state.rot+90)%360; state.mode='none'; state.linesManual=false; state.autoRot=true; applyModeUI(); reanalyze(false); });
  if($('paAuto')) $('paAuto').addEventListener('click',function(){ state.mode='none'; state.brushPt=null; state.linesManual=false; state.undoStack=[]; state.polyPts=[]; applyModeUI(); reanalyze(false); });
  
  function updateBrushLbl(){ if($('paBrushVal')) $('paBrushVal').textContent=state.brushPct+'%'; }
  if($('paBrush')) $('paBrush').addEventListener('input',function(){ state.brushPct=parseInt(this.value,10); updateBrushLbl(); if(state.brushPt) render(); });
  
  function applyModeUI(){
    if($('paPickFoot')) $('paPickFoot').classList.toggle('on', state.mode==='fill');
    if($('paSeed')) $('paSeed').classList.toggle('on', state.mode==='erase');
    if($('paPoly')) $('paPoly').classList.toggle('on', state.mode==='poly');
    
    var h=$('paSeedHint'), bw=$('paBrushWrap');
    if(h && bw) {
        if(state.mode==='fill'){ 
            h.innerHTML='<b>✏️ 브러시 채우기: 빈 곳을 손가락으로 문지르면 채워집니다.</b>'; 
            h.classList.remove('pa-hide'); 
            bw.classList.remove('pa-hide');
        }
        else if(state.mode==='erase'){ 
            h.innerHTML='<b>🩹 브러시 지우개: 잘못 잡힌 부분을 문질러 지우세요.</b>'; 
            h.classList.remove('pa-hide'); 
            bw.classList.remove('pa-hide');
        }
        else if(state.mode==='poly'){ 
            h.innerHTML='<b>📍 다각형 올가미: 화면을 터치해 점을 찍으세요. (이전 점 취소는 되돌리기 ↩️ 버튼)</b>' +
                        '<div style="margin-top:10px; display:flex; gap:8px;">' +
                        '<button id="btnPolyFill" class="pa-btn" style="padding:8px; font-size:13px; flex:1;">영역 채우기</button>' +
                        '<button id="btnPolyErase" class="pa-btn" style="padding:8px; font-size:13px; background:var(--amber); flex:1;">영역 지우기</button>' +
                        '<button id="btnPolyReset" class="pa-btn sec" style="padding:8px; font-size:13px; flex:0.5;">초기화</button>' +
                        '</div>'; 
            h.classList.remove('pa-hide'); 
            bw.classList.add('pa-hide');
            
            $('btnPolyFill').onclick = function() { applyPoly(true); };
            $('btnPolyErase').onclick = function() { applyPoly(false); };
            $('btnPolyReset').onclick = function() { state.polyPts = []; refresh(); };
        }
        else { 
            h.classList.add('pa-hide'); 
            bw.classList.add('pa-hide');
        }
    }
  }

  function setMode(mode){ state.mode=(state.mode===mode)?'none':mode; state.brushPt=null; state.polyPts=[]; applyModeUI(); render(); }
  
  if($('paUndo')) $('paUndo').addEventListener('click',undo);
  
  function undo(){ 
      if(state.mode === 'poly' && state.polyPts.length > 0) {
          state.polyPts.pop();
          refresh();
          return;
      }
      var s = state.undoStack.pop(); 
      if(!s) return; 
      state.mask = s.m; 
      state.toeY = s.t; 
      state.heelY = s.h; 
      state.linesManual = s.lm; 
      state.polyPts = []; 
      refresh(); 
  }

  if($('paPickFoot')) $('paPickFoot').addEventListener('click',function(){ setMode('fill'); });
  if($('paSeed')) $('paSeed').addEventListener('click',function(){ setMode('erase'); });
  if($('paPoly')) $('paPoly').addEventListener('click',function(){ setMode('poly'); });
  
  if($('paReset')) $('paReset').addEventListener('click',function(){
    if($('paAdjust')) $('paAdjust').classList.add('pa-hide'); 
    if($('paResult')) $('paResult').classList.add('pa-hide');
    if($('paIntake')) $('paIntake').classList.remove('pa-hide'); 
    fileInput.value='';
  });

  function evtY(e){ var rect=canvas.getBoundingClientRect(); return ((e.touches?e.touches[0].clientY:e.clientY)-rect.top)*(state.h/rect.height); }
  function evtX(e){ var rect=canvas.getBoundingClientRect(); return ((e.touches?e.touches[0].clientX:e.clientX)-rect.left)*(state.w/rect.width); }
  function brushR(){ return Math.max(4,Math.round(Math.min(state.w,state.h)*(state.brushPct||8)/100)); }
  function paintAt(x,y,val){
    var W=state.w,H=state.h,m=state.mask; if(!m) return;
    var R=brushR(), R2=R*R;
    var x0=Math.max(0,Math.round(x-R)),x1=Math.min(W-1,Math.round(x+R));
    var y0=Math.max(0,Math.round(y-R)),y1=Math.min(H-1,Math.round(y+R));
    for(var yy=y0;yy<=y1;yy++) for(var xx=x0;xx<=x1;xx++){ var dx=xx-x,dy=yy-y; if(dx*dx+dy*dy<=R2) m[yy*W+xx]=val; }
  }
  function eraseAt(x,y){ paintAt(x,y,0); }
  function fillAt(x,y){ paintAt(x,y,1); }
  function pushUndo(){ if(!state.mask) return; state.undoStack.push({m:state.mask.slice(0), t:state.toeY, h:state.heelY, lm:state.linesManual}); if(state.undoStack.length>12) state.undoStack.shift(); }
  
  // 🚀 핵심 수정: 올가미 채우기/지우기 실행 시 마스크 영역 경계선(toeY, heelY, 핸들바) 자동 재계산 및 하단 이동
  function applyPoly(isFill) {
      if(state.polyPts.length < 3) { alert("점을 3개 이상 찍어 영역을 만들어주세요."); return; }
      pushUndo();
      
      var W = state.w, H = state.h;
      var tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = W; tmpCanvas.height = H;
      var tCtx = tmpCanvas.getContext('2d');
      
      tCtx.fillStyle = '#FFFFFF';
      tCtx.beginPath();
      tCtx.moveTo(state.polyPts[0].x, state.polyPts[0].y);
      for(var i=1; i<state.polyPts.length; i++) {
          tCtx.lineTo(state.polyPts[i].x, state.polyPts[i].y);
      }
      tCtx.closePath();
      tCtx.fill();
      
      var polyData = tCtx.getImageData(0, 0, W, H).data;
      var m = state.mask;
      
      for(var i=0; i<W*H; i++) {
          if(polyData[i*4] > 128) { 
              m[i] = isFill ? 1 : 0;
          }
      }
      
      if(isFill) {
          state.mask = fillHoles(m);
      }

      // 💡 마스크 영역 변경에 따라 조절선(핸들바) 위치 재조정
      if(!state.linesManual) {
          autoLines();
      } else {
          var bb = maskBBox();
          state.bbox = [bb.top, bb.bot];
          if(bb.bot > 0) {
              if(bb.bot > state.heelY) state.heelY = bb.bot;
              if(bb.top < state.toeY) state.toeY = Math.max(bb.top, Math.min(state.toeY, bb.bot - 2));
          }
      }
      
      state.polyPts = []; 
      refresh();
  }

  function startDrag(e){
    if(!state.mask) return; e.preventDefault();
    var y=evtY(e), x=evtX(e);
    
    if(state.mode==='poly') {
        state.polyPts.push({x: x, y: y});
        refresh();
        return;
    }
    
    if(state.mode==='erase'){ pushUndo(); state.drag='erase'; state.brushPt={x:x,y:y}; eraseAt(x,y); refresh(); return; }
    if(state.mode==='fill'){ pushUndo(); state.drag='fill'; state.brushPt={x:x,y:y}; fillAt(x,y); refresh(); return; }
    state.drag=(Math.abs(y-state.toeY)<=Math.abs(y-state.heelY))?'toe':'heel';
    moveDrag(e);
  }
  function moveDrag(e){
    if(!state.drag) return; e.preventDefault();
    if(state.mode==='poly') return; 
    
    if(state.drag==='erase'||state.drag==='fill'){ var ex=evtX(e),ey=evtY(e); state.brushPt={x:ex,y:ey}; (state.drag==='fill'?fillAt:eraseAt)(ex,ey); refresh(); return; }
    var y=Math.round(Math.max(0,Math.min(state.h-1,evtY(e))));
    var bb=state.bbox||[0,state.h-1];
    if(state.drag==='toe') state.toeY=Math.round(Math.max(bb[0],Math.min(y,state.heelY-3)));
    else state.heelY=Math.round(Math.min(bb[1],Math.max(y,state.toeY+3)));
    state.linesManual=true;
    refresh();
  }
  function endDrag(){
    if(state.drag==='erase'||state.drag==='fill'){ 
        if(state.drag==='fill') state.mask=fillHoles(state.mask); 
        // 💡 브러시 드래그 완료 후에도 조절선 자동 업데이트
        if(!state.linesManual) {
            autoLines();
        } else {
            var bb = maskBBox();
            state.bbox = [bb.top, bb.bot];
            if(bb.bot > 0) {
                if(bb.bot > state.heelY) state.heelY = bb.bot;
                if(bb.top < state.toeY) state.toeY = Math.max(bb.top, Math.min(state.toeY, bb.bot - 2));
            }
        }
        refresh(); 
    }
    state.drag=null;
  }
  
  if(canvas) {
    canvas.addEventListener('touchstart',startDrag,{passive:false});
    canvas.addEventListener('touchmove',moveDrag,{passive:false});
    canvas.addEventListener('touchend',endDrag);
    canvas.addEventListener('mousedown',startDrag);
  }
  window.addEventListener('mousemove',moveDrag);
  window.addEventListener('mouseup',endDrag);

  window.__fsCurrentCapture = function() {
      var r = compute();
      if(!r || !state.mask) return null;
      var W = state.w, H = state.h, m = state.mask;
      var tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
      var tCtx = tmp.getContext('2d');
      
      tCtx.save();
      tCtx.filter = `brightness(${state.imgBrightness}%) contrast(${state.imgContrast}%)`;
      tCtx.drawImage(state.prevCanvas ? state.prevCanvas : work, 0, 0, W, H);
      tCtx.filter = 'none';
      tCtx.restore();

      var buf = tCtx.createImageData(W, H), bd = buf.data;
      var t = state.toeY, hl = state.heelY, r1=Math.round(t+(hl-t)/3), r2=Math.round(t+2*(hl-t)/3);
      for(var y=0; y<H; y++){
          var col = null;
          if(y>=t && y<r1) col = [217,132,42]; else if(y>=r1 && y<r2) col = [46,139,87]; else if(y>=r2 && y<hl) col = [46,92,158]; 
          for(var x=0; x<W; x++){
              var pt = y*W+x, q = pt*4;
              if(m[pt]){ if(col){ bd[q]=col[0]; bd[q+1]=col[1]; bd[q+2]=col[2]; bd[q+3]=255; } else { bd[q]=150; bd[q+1]=160; bd[q+2]=170; bd[q+3]=255; } }
              else { bd[q]=255; bd[q+1]=255; bd[q+2]=255; bd[q+3]=0; }
          }
      }
      tCtx.putImageData(buf, 0, 0);
      return { AI: r.AI, CSI: r.CSI, arch: r.arch, imgData: tmp.toDataURL('image/png') };
  };

  window.saveToSlot = function(side, pose) {
      var current = window.__fsCurrentCapture();
      if(!current) { alert('먼저 발자국 이미지를 분석해 주세요.'); return; }
      window.__fsState[side === 'L' ? 'left' : 'right'][pose] = current;
      var btn = $('btn-' + side + '-' + pose);
      if(btn) { btn.classList.add('on'); btn.textContent = (pose==='sit'?'앉기':'서기') + ' ✓'; }
      if($('ldSlotStatus')) $('ldSlotStatus').innerHTML = `<span style="color:#2E8B57; font-weight:bold;">${side === 'L'?'좌측':'우측'} ${pose==='sit'?'앉기':'서기'} 저장 완료!</span><br>다른 자세나 반대쪽 발을 측정하세요.`;
  };

  function loadGrade(d){
    if(d<-0.02) return ['재측정 요망','#6B7787','오히려 아치가 높아졌습니다.'];
    if(d<=0.02) return ['안정','#2E8B57','부하를 잘 버팁니다.'];
    if(d<=0.05) return ['보통','#2E5C9E','일반적인 수준으로 내려앉습니다.'];
    return ['큰 변화','#D9842A','아치가 크게 무너집니다.'];
  }
  var AN={high:'요족', normal:'정상', flat:'평발'};
  
  function renderLoad(){
    var S = window.__fsState;
    var hasAny = S.left.sit || S.left.stand || S.right.sit || S.right.stand;
    if(!hasAny){ if($('ldEmpty')) $('ldEmpty').classList.remove('pa-hide'); if($('ldBody')) $('ldBody').classList.add('pa-hide'); return; }
    if($('ldEmpty')) $('ldEmpty').classList.add('pa-hide'); if($('ldBody')) $('ldBody').classList.remove('pa-hide');
    
    if(S.left.sit) { if($('ldSitAI-L')) $('ldSitAI-L').textContent=S.left.sit.AI.toFixed(3); if($('ldSitSub-L')) $('ldSitSub-L').textContent=AN[S.left.sit.arch]; }
    if(S.left.stand) { if($('ldStandAI-L')) $('ldStandAI-L').textContent=S.left.stand.AI.toFixed(3); if($('ldStandSub-L')) $('ldStandSub-L').textContent=AN[S.left.stand.arch]; }
    if(S.left.sit && S.left.stand) {
        var dL = S.left.stand.AI - S.left.sit.AI; var gL = loadGrade(dL);
        if($('ldDelta-L')){ $('ldDelta-L').textContent=(dL>=0?'+':'−')+Math.abs(dL).toFixed(3); $('ldDelta-L').style.color=gL[1]; }
        if($('ldBadge-L')){ $('ldBadge-L').textContent=gL[0]; $('ldBadge-L').style.background=gL[1]; }
        if($('ldNote-L')) $('ldNote-L').innerHTML=gL[2];
    }
    
    if(S.right.sit) { if($('ldSitAI-R')) $('ldSitAI-R').textContent=S.right.sit.AI.toFixed(3); if($('ldSitSub-R')) $('ldSitSub-R').textContent=AN[S.right.sit.arch]; }
    if(S.right.stand) { if($('ldStandAI-R')) $('ldStandAI-R').textContent=S.right.stand.AI.toFixed(3); if($('ldStandSub-R')) $('ldStandSub-R').textContent=AN[S.right.stand.arch]; }
    if(S.right.sit && S.right.stand) {
        var dR = S.right.stand.AI - S.right.sit.AI; var gR = loadGrade(dR);
        if($('ldDelta-R')) { $('ldDelta-R').textContent=(dR>=0?'+':'−')+Math.abs(dR).toFixed(3); $('ldDelta-R').style.color=gR[1]; }
        if($('ldBadge-R')) { $('ldBadge-R').textContent=gR[0]; $('ldBadge-R').style.background=gR[1]; }
        if($('ldNote-R')) $('ldNote-R').innerHTML=gR[2];
    }
  }

  if($('paPrintPDF')) {
      $('paPrintPDF').addEventListener('click', function() {
        var S = window.__fsState;
        var L = S.left.stand || S.left.sit;
        var R = S.right.stand || S.right.sit;
        
        if(!L && !R) { alert("측정된 데이터가 없습니다. 먼저 저장해주세요."); return; }

        var userStr = localStorage.getItem('rewalk_current_user');
        var userName = '측정 대상자', userMeta = '';
        if(userStr) {
            try { var userObj = JSON.parse(userStr); userName = userObj.name + ' 님'; userMeta = '(' + (userObj.gender==='M'?'남':'여') + ', 만 ' + userObj.currentAge + '세)'; } catch(e){}
        }

        var worstArch = 'normal';
        if((L && L.arch === 'flat') || (R && R.arch === 'flat')) worstArch = 'flat';
        else if((L && L.arch === 'high') || (R && R.arch === 'high')) worstArch = 'high';
        var p = PROG[worstArch];

        function makeFootCard(sideName, data, colorObj) {
            if(!data) return `<div style="flex:1; background:#F8FAFC; border-radius:12px; border:1px solid #E2E8F0; display:flex; align-items:center; justify-content:center; color:#94A3B8;">${sideName} 데이터 없음</div>`;
            return `
                <div style="flex:1; background:#F8FAFC; border-radius:12px; border:1px solid #E2E8F0; padding:20px; text-align:center;">
                    <div style="font-size:18px; font-weight:800; color:#334155; border-bottom:1px dashed #CBD5E1; padding-bottom:10px; margin-bottom:15px;">${sideName}</div>
                    <div style="font-size:42px; font-weight:800; font-family:monospace; color:${colorObj[1]}; line-height:1;">${data.AI.toFixed(3)}</div>
                    <div style="font-size:13px; font-weight:700; color:#64748B; margin-bottom:10px;">ARCH INDEX</div>
                    <div style="display:inline-block; background:${colorObj[1]}; color:white; padding:6px 16px; border-radius:20px; font-weight:700; font-size:14px; margin-bottom:10px;">${colorObj[0]}</div>
                    <div style="font-size:16px; font-weight:700; color:#1E293B;">CSI 지수: ${data.CSI.toFixed(1)}%</div>
                    <div style="margin-top:15px; height:200px; display:flex; align-items:center; justify-content:center;">
                        <img src="${data.imgData}" style="max-width:100%; max-height:100%; object-fit:contain;">
                    </div>
                </div>
            `;
        }

        var htmlL = makeFootCard('좌측 발 (LEFT)', L, L ? {high:['요족','#2E5C9E'], normal:['정상','#2E8B57'], flat:['평발','#D9842A']}[L.arch] : null);
        var htmlR = makeFootCard('우측 발 (RIGHT)', R, R ? {high:['요족','#2E5C9E'], normal:['정상','#2E8B57'], flat:['평발','#D9842A']}[R.arch] : null);

        var routineHtml = p.ex.map(function(ex, i) {
            return `
            <div style="margin-bottom: 12px; margin-left: 15px;">
                <div style="display:flex; justify-content:space-between; font-weight:700; font-size:14.5px; color:#1E293B; margin-bottom:4px;">
                    <span>${i+1}. ${ex[0]}</span>
                    <span style="color:#D9842A;">${ex[2]}</span>
                </div>
                <div style="font-size:13.5px; color:#475569; line-height:1.4;">${ex[1]}</div>
            </div>`;
        }).join('');

        var printHtml = `
            <div style="border: 1px solid #E5E7EB; border-radius: 12px; padding: 25px; background: white; height:260mm; box-sizing:border-box; display:flex; flex-direction:column;">
                <div style="border-bottom: 2px solid #1F3864; padding-bottom: 10px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: flex-end; flex-shrink:0;">
                    <div>
                        <h1 style="font-size: 24px; font-weight: 800; color: #1F3864; margin: 0 0 6px 0;">발자국 정밀 스크리닝 (양발)</h1>
                        <div style="font-size: 14px; color: #6B7787;">측정 대상: ${userName} ${userMeta}</div>
                    </div>
                    <div style="font-size: 12px; font-weight: bold; color: #1F3864;">RE:WALK CENTER</div>
                </div>

                <div style="display: flex; gap: 15px; margin-bottom: 15px; flex-shrink:0;">
                    ${htmlL}
                    ${htmlR}
                </div>

                <div style="background: #EEF3FA; border-radius: 12px; padding: 20px; flex:1; overflow:hidden;">
                    <div style="font-size: 18px; font-weight: 800; color: #1F3864; border-left: 5px solid #1F3864; padding-left: 10px; margin-bottom: 15px;">종합 맞춤형 솔루션: ${p.title}</div>
                    
                    <div style="display: flex; align-items: center; gap: 6px; font-size: 15px; font-weight: 700; color: #2E5C9E; margin: 10px 0 6px 0;">
                        <span style="display:inline-block; width:5px; height:5px; border-radius:50%; background:#2E5C9E;"></span>운동 목표
                    </div>
                    <div style="font-size: 13.5px; line-height: 1.5; color: #334155; margin-left: 15px;">${p.goal}</div>

                    <div style="display: flex; align-items: center; gap: 6px; font-size: 15px; font-weight: 700; color: #2E5C9E; margin: 15px 0 10px 0;">
                        <span style="display:inline-block; width:5px; height:5px; border-radius:50%; background:#2E5C9E;"></span>핵심 실천 루틴
                    </div>
                    <div>${routineHtml}</div>

                    <div style="display: flex; align-items: center; gap: 6px; font-size: 15px; font-weight: 700; color: #2E5C9E; margin: 15px 0 6px 0;">
                        <span style="display:inline-block; width:5px; height:5px; border-radius:50%; background:#2E5C9E;"></span>보행 및 생활 가이드
                    </div>
                    <div style="font-size: 13.5px; line-height: 1.5; color: #334155; margin-left: 15px;">${p.walk}</div>
                </div>

                <div style="text-align: center; font-size: 11px; color: #94A3B8; margin-top: 15px; flex-shrink:0;">
                    본 측정 및 프로그램은 양발 중 더 보완이 필요한 상태를 기준으로 작성된 교육/참고용이며 의학적 진단을 대신하지 않습니다.
                </div>
            </div>
        `;

        document.getElementById('print-area').innerHTML = printHtml;
        setTimeout(function(){ window.print(); }, 500); 
      });
  }
})();

window.onload = function() {
    const user = JSON.parse(localStorage.getItem('rewalk_current_user'));
    if(user) {
        var n = document.getElementById('display-name');
        var m = document.getElementById('display-meta');
        if(n) n.textContent = `[발 스크리닝] ${user.name} 님`;
        if(m) m.textContent = `만 ${user.currentAge}세 / ${user.height}cm`;
    }
};

window.saveToDashboard = function() {
    const S = window.__fsState;
    if(!S.left.sit && !S.left.stand && !S.right.sit && !S.right.stand) {
        if(!confirm("측정된 데이터가 없습니다. 이대로 대시보드로 돌아가시겠습니까?")) return;
    }

    const footData = { left: S.left, right: S.right, measuredAt: new Date().toISOString() };
    localStorage.setItem('rewalk_temp_foot', JSON.stringify(footData));
    alert("측정 결과가 대시보드에 연동되었습니다!");
    window.parent.postMessage({ action: 'MEASUREMENT_DONE', module: 'foot_screening' }, '*');
}