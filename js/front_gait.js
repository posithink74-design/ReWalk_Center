// 잃어버린 UI 상태 업데이트 함수 복구
window.setStatus = function(msg) {
    console.log("상태 업데이트:", msg);
    
    // 만약 화면에 상태를 띄우는 텍스트 박스가 있다면 글자를 바꿔줍니다.
    const statusBox = document.getElementById('statusBox') || document.querySelector('.status-text');
    if (statusBox) {
        statusBox.textContent = msg;
    }
};
// ==========================================
// 정면 보행 분석 모듈 (UI/AI 병렬 처리 마스터 버전)
// ==========================================
(function(){
  var $=function(id){return document.getElementById(id);};
  var video=$('fgVideo'), canvas=$('fgCanvas'), ctx=canvas.getContext('2d');
  var dpr=Math.min(window.devicePixelRatio||1, 2.5);

  var state={
    mirror:false, playing:false, speed:0.5, ready:false, source:null, 
    dispW:0, dispH:0, band:[0.55,0.78], bandOn:true, drag:null,
    heightMM:0, last:null, best:null, camera:null, samples:null,
    roi:null, roiMode:false, roiDraft:null, roiLost:0
  };
  var roiCv=document.createElement('canvas'), roiCtx=roiCv.getContext('2d'), _crop=null;

  // ---------- 🚀 1. Pose 초기화 (안전한 CDN 로드) ----------
  var pose = null;
  var poseLoading = null;

  function ensurePose() {
      if (pose) return Promise.resolve(pose);
      if (poseLoading) return poseLoading;

      setStatus('AI 분석 모델을 준비하는 중입니다...');
      
      poseLoading = new Promise(function(resolve, reject) {
          var attempts = 0;
          var checkInterval = setInterval(function() {
              attempts++;
              if (typeof window.Pose === 'function') {
                  clearInterval(checkInterval);
                  try {
                      pose = new window.Pose({
                          locateFile: function(file) {
                              return 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/' + file;
                          }
                      });
                      pose.setOptions({
                          modelComplexity: 1,
                          smoothLandmarks: true,
                          minDetectionConfidence: 0.5,
                          minTrackingConfidence: 0.5
                      });
                      pose.onResults(onResults);
                      state.ready = true;
                      setStatus('준비 완료! 영상을 재생하면 분석이 시작됩니다.');
                      resolve(pose);
                  } catch(e) {
                      setStatus('모델 초기화 실패: ' + e.message);
                      reject(e);
                  }
              } else if (attempts > 50) {
                  clearInterval(checkInterval);
                  var msg = 'AI 라이브러리 로드 지연. 새로고침 후 다시 시도해 주세요.';
                  setStatus(msg);
                  reject(new Error(msg));
              }
          }, 200);
      });
      return poseLoading;
  }
  
  function sendPose(image){
    return ensurePose().then(function(p){
      var src=image, r=state.roi, vw=video.videoWidth, vh=video.videoHeight;
      if(!vw || !vh) return; // 영상 크기가 0일 때 뻗는 현상 방지
      
      _crop=null;
      if(r && vw && vh){
        var rx=Math.max(0,Math.min(1,r.x)), ry=Math.max(0,Math.min(1,r.y));
        var sx=Math.round(rx*vw), sy=Math.round(ry*vh);
        var sw=Math.round(Math.min(1-rx, r.w)*vw), sh=Math.round(Math.min(1-ry, r.h)*vh);
        if(sw>=32 && sh>=32){
          roiCv.width=sw; roiCv.height=sh;
          roiCtx.drawImage(video, sx,sy,sw,sh, 0,0,sw,sh);
          src=roiCv;
          _crop={ x:sx/vw, y:sy/vh, w:sw/vw, h:sh/vh };
        }
      }
      return p.send({image:src});
    }).catch(function(err){
        console.warn("MediaPipe 대기 중...", err);
    });
  }

  // ---------- 2. 수학 및 좌표 계산 유틸 ----------
  function vis(l){ return l && (l.visibility===undefined || l.visibility>0.4); }
  function angle(ax,ay,bx,by,cx,cy){
    var v1x=ax-bx,v1y=ay-by,v2x=cx-bx,v2y=cy-by;
    var d=(v1x*v2x+v1y*v2y)/(Math.hypot(v1x,v1y)*Math.hypot(v2x,v2y)+1e-9);
    d=Math.max(-1,Math.min(1,d)); return Math.acos(d)*180/Math.PI;
  }
  function lineXat(x1,y1,x2,y2,y){ if(Math.abs(y2-y1)<1e-6) return x1; return x1+(x2-x1)*((y-y1)/(y2-y1)); }
  function median(a){ if(!a.length) return null; var b=a.slice().sort(function(x,y){return x-y;}); var n=b.length,m=n>>1; return n%2?b[m]:(b[m-1]+b[m])/2; }
  function percentile(a,p){ if(!a.length) return null; var b=a.slice().sort(function(x,y){return x-y;}); var idx=(b.length-1)*p, lo=Math.floor(idx), hi=Math.ceil(idx); return lo===hi?b[lo]:b[lo]+(b[hi]-b[lo])*(idx-lo); }
  function majority(a){ var s=0,i; for(i=0;i<a.length;i++) s+=a[i]; return s*2>=a.length; }
  function clearSamples(){ state.samples={sw:[],stat:[],kLm:[],kLmed:[],kRm:[],kRmed:[],fL:[],fR:[],leg:[],armL:[],armR:[],pel:[],vp:[]}; state.best=null; }
  
  function collectSample(m){
    var st=staturePx(m.lm); if(!st) return;
    var S=state.samples; if(!S) return;
    var pv=state.last;
    var vL=(m.motL!=null)?m.motL:0, vR=(m.motR!=null)?m.motR:0;
    S.sw.push({v:m.swNorm, mv:Math.max(vL,vR)});
    S.stat.push(st);
    S.kLm.push(m.kneeL.mag); S.kLmed.push(m.kneeL.medial?1:0);
    S.kRm.push(m.kneeR.mag); S.kRmed.push(m.kneeR.medial?1:0);
    S.vp.push({ u:((m.lm[23].x+m.lm[24].x)/2)*state.dispW, v:((m.lm[23].y+m.lm[24].y)/2)*state.dispH, s:st });
    if(m.footL){ S.fL.push({hx:m.footL.hx, hy:m.footL.hy, tx:m.footL.tx, ty:m.footL.ty, side:m.footL.side, mot:vL, i:S.stat.length}); }
    if(m.footR){ S.fR.push({hx:m.footR.hx, hy:m.footR.hy, tx:m.footR.tx, ty:m.footR.ty, side:m.footR.side, mot:vR, i:S.stat.length}); }
    if(m.kneeGap!=null && m.ankNorm!=null){ S.leg.push((m.kneeGap - m.ankNorm)*state.dispW/st*100); }
    if(m.pelvicAng!=null){ S.pel.push({ang:m.pelvicAng, lean:m.trunkLean, vL:vL, vR:vR}); }
    if(m.arm && m.arm.torsoLen>0.01 && m.arm.shMidY!=null){
      if(m.arm.wL!=null) S.armL.push({y:(m.arm.wL-m.arm.shMidY)/m.arm.torsoLen, zone:m.arm.zoneL, wy:m.arm.wL});
      if(m.arm.wR!=null) S.armR.push({y:(m.arm.wR-m.arm.shMidY)/m.arm.torsoLen, zone:m.arm.zoneR, wy:m.arm.wR});
    }
  }

  function robustStepWidth(arr){
    if(!arr || !arr.length) return null;
    if(arr.length<3) return median(arr.map(function(o){return o.v;}));
    var medMv=median(arr.map(function(o){return o.mv;}));
    var kept=arr.filter(function(o){return o.mv<=medMv;}).map(function(o){return o.v;});
    if(!kept.length) kept=arr.map(function(o){return o.v;});
    return median(kept);
  }

  function estimateVP(arr){
    if(!arr || arr.length<8) return null;
    var n=0,sS=0,sU=0,sV=0,sSS=0,sSU=0,sSV=0;
    arr.forEach(function(o){
      if(!(o.s>0)) return;
      n++; sS+=o.s; sU+=o.u; sV+=o.v; sSS+=o.s*o.s; sSU+=o.s*o.u; sSV+=o.s*o.v;
    });
    if(n<8) return null;
    var d=n*sSS-sS*sS;
    if(Math.abs(d)<1e-6) return null;
    return { u:(sSS*sU-sS*sSU)/d, v:(sSS*sV-sS*sSV)/d, n:n };
  }

  function footAngleVP(o, vp){
    var mx=(o.hx+o.tx)/2, my=(o.hy+o.ty)/2;
    var rx=mx-vp.u, ry=my-vp.v, rn=Math.hypot(rx,ry);
    if(rn<1e-6) return null;
    var dx=o.tx-o.hx, dy=o.ty-o.hy;
    var cross=(rx*dy-ry*dx)/rn, dot=(rx*dx+ry*dy)/rn;
    var mag=Math.atan2(Math.abs(cross), Math.abs(dot))*180/Math.PI;
    var outward = (cross*(o.side>=0?1:-1)) < 0; 
    return outward ? mag : -mag;
  }

  function footAngleTrue(o, vp, fpx){
    var proj=footAngleVP(o, vp);
    if(proj==null || !(fpx>0)) return null;
    var my=(o.hy+o.ty)/2, dv=my-vp.v;
    if(!(dv>1e-6)) return null;
    var t=Math.tan(Math.abs(proj)*Math.PI/180)*(dv/fpx);
    var deg=Math.atan(t)*180/Math.PI;
    return proj>=0 ? deg : -deg;
  }

  function midStanceFrames(arr){
    var real = arr.filter(function(o){ return o.mot > 1e-6; });
    if(real.length<10) return null;
    var mots = real.map(function(o){ return o.mot; });
    var swingRef = percentile(mots, 0.75);
    if(swingRef==null || swingRef<=0) return null;
    var lo = swingRef*0.35;
    var segs=[], cur=null;
    for(var i=0;i<real.length;i++){
      var o=real[i], isSt=(o.mot<=lo);
      var gap=(i>0)&&(o.i-real[i-1].i>2);
      if(!isSt||gap){ if(cur){ segs.push(cur); cur=null; } if(!isSt) continue; }
      if(!cur) cur=[];
      cur.push(o);
    }
    if(cur) segs.push(cur);
    var out=[];
    segs.forEach(function(sg){
      if(sg.length<5) return;
      var a=Math.floor(sg.length*0.30), b=Math.ceil(sg.length*0.70);
      for(var k=a;k<b;k++) out.push(sg[k]);
    });
    return out;
  }

  function robustFoot(arr, vp, fpx){
    if(!arr || !arr.length) return null;
    var frames = midStanceFrames(arr);
    var isMid = !!(frames && frames.length>=4);
    if(!isMid){
      if(arr.length<3){ frames=arr.slice(); }
      else{
        var mm=median(arr.map(function(o){return o.mot;}));
        frames=arr.filter(function(o){return o.mot<=mm;});
        if(!frames.length) frames=arr.slice();
      }
    }
    var vals=[], corrected = !!(vp && fpx>0);
    frames.forEach(function(o){
      var a = corrected ? footAngleTrue(o, vp, fpx) : (vp ? footAngleVP(o, vp) : null);
      if(a==null){
        var dx=o.tx-o.hx, dy=o.ty-o.hy;
        var mg=Math.atan2(Math.abs(dx),Math.abs(dy))*180/Math.PI;
        a=((o.side*dx)>=0)?mg:-mg;
        corrected=false;
      }
      vals.push(a);
    });
    if(!vals.length) return null;
    var mv=median(vals);
    return { mag:Math.abs(mv), out:mv>=0, midStance:isMid, corrected:corrected, n:vals.length };
  }

  function computePelvis(arr){
    if(!arr || arr.length<8) return null;
    var bigs = arr.map(function(o){ return Math.max(o.vL,o.vR); });
    var swingRef = percentile(bigs, 0.75);
    if(swingRef==null || swingRef<=0) return null;
    var still = swingRef*0.35;
    var lab=new Array(arr.length), dbl=[];
    for(var i=0;i<arr.length;i++){
      var o=arr[i], big=Math.max(o.vL,o.vR), small=Math.min(o.vL,o.vR);
      if(big < still){ lab[i]='D'; dbl.push(o); }
      else if(small > big*0.40){ lab[i]=null; }
      else lab[i] = (o.vR>o.vL) ? 'L' : 'R';
    }
    if(dbl.length<2) return null;
    var base     = median(dbl.map(function(o){return o.ang;}));
    var baseLean = median(dbl.map(function(o){return o.lean;}));
    var stR=[], stL=[], cmR=[], cmL=[], k=0;
    while(k<arr.length){
      var side=lab[k];
      if(side!=='L' && side!=='R'){ k++; continue; }
      var j=k; while(j<arr.length && lab[j]===side) j++;
      var seg=arr.slice(k,j);
      if(seg.length>=3){
        var angs=seg.map(function(o){return o.ang;});
        var lns =seg.map(function(o){return o.lean;});
        if(side==='R'){
          stR.push(Math.max.apply(null,angs) - base);
          cmR.push(baseLean - Math.min.apply(null,lns));
        }else{
          stL.push(base - Math.min.apply(null,angs));
          cmL.push(Math.max.apply(null,lns) - baseLean);
        }
      }
      k=j;
    }
    if(!stR.length || !stL.length) return null;
    var dropR=median(stR), dropL=median(stL);
    return {
      dropR: dropR, dropL: dropL, asym: Math.abs(dropR-dropL),
      compR: cmR.length?median(cmR):0, compL: cmL.length?median(cmL):0,
      steps: stR.length+stL.length, n: arr.length
    };
  }

  function pelvisGrade(deg){
    if(deg==null) return ['–','#B9C7DC'];
    var v=Math.abs(deg);
    if(v<5)  return ['안정','#2E8B57'];
    if(v<=8) return ['경계','#D9842A'];
    return ['흔들림 큼','#C0392B'];
  }
  function compGrade(deg){
    if(deg==null) return ['–','#B9C7DC'];
    if(deg<3)  return ['보상 적음','#2E8B57'];
    if(deg<=6) return ['약간 보상','#D9842A'];
    return ['보상 뚜렷','#C0392B'];
  }

  function computeFootWhip(arr, vp){
    if(!arr || arr.length<12) return null;
    var real = arr.filter(function(o){ return o.mot > 1e-6; });
    if(real.length<10) return null;
    var mots = real.map(function(o){ return o.mot; });
    var hi = percentile(mots, 0.75);
    var lo = percentile(mots, 0.30);
    if(hi==null || lo==null || hi <= lo*1.5) return null;
    var air=[], gnd=[];
    function angOf(o){
      if(vp){ var a=footAngleVP(o, vp); if(a!=null) return a; }
      var dx=o.tx-o.hx, dy=o.ty-o.hy;
      var mg=Math.atan2(Math.abs(dx),Math.abs(dy))*180/Math.PI;
      return ((o.side*dx)>=0)?mg:-mg;
    }
    real.forEach(function(o){
      if(o.mot>=hi) air.push(angOf(o));
      else if(o.mot<=lo) gnd.push(angOf(o));
    });
    if(air.length<4 || gnd.length<4) return null;
    var a=median(air), g=median(gnd);
    return { diff:a-g, air:a, gnd:g, nAir:air.length, nGnd:gnd.length };
  }

  function whipGrade(d){
    if(d==null) return ['–','#B9C7DC'];
    var a=Math.abs(d);
    if(a<5)  return ['거의 없음','#2E8B57'];
    if(a<=12) return ['약간','#D9842A'];
    return ['뚜렷','#C0392B'];
  }

  function updateRobust(){
    var _vp = estimateVP(state.samples ? state.samples.vp : null);
    var _fpx = state.dispW ? state.dispW*0.96 : 0;
    var S=state.samples; if(!S || S.sw.length<3) return false;
    var robust={
      swNorm: robustStepWidth(S.sw),
      staturePx: median(S.stat),
      kneeL:{mag:median(S.kLm), medial:majority(S.kLmed)},
      kneeR:{mag:median(S.kRm), medial:majority(S.kRmed)},
      footL: robustFoot(S.fL, _vp, _fpx),
      footR: robustFoot(S.fR, _vp, _fpx),
      legDpct: S.leg.length?median(S.leg):null,
      arm: computeArmSwing(S.armL, S.armR),
      pelvis: computePelvis(S.pel),
      whipL: computeFootWhip(S.fL, _vp),
      whipR: computeFootWhip(S.fR, _vp)
    };
    state.best=robust; showResult(robust); return true;
  }

  function computeArmSwing(armL, armR){
    function swingPct(arr){
      if(!arr || arr.length<5) return null;
      var ys=arr.map(function(o){return o.y;});
      var hi=percentile(ys,0.95), lo=percentile(ys,0.05);
      return (hi-lo)*100;
    }
    function swingZone(arr){
      if(!arr || arr.length<5) return null;
      var withZone=arr.filter(function(o){return o.zone!=null;});
      if(withZone.length<5) return null;
      var sorted=withZone.slice().sort(function(a,b){return a-b;});
      var topN=sorted.slice(0, Math.max(3, Math.round(sorted.length*0.3)));
      var zones=topN.map(function(o){return o.zone;}).sort(function(a,b){return a-b;});
      var m=zones.length>>1;
      return zones.length%2?zones[m]:(zones[m-1]+zones[m])/2;
    }
    var wL=swingPct(armL), wR=swingPct(armR);
    var out={ left:wL, right:wR, asym:null, zoneL:swingZone(armL), zoneR:swingZone(armR) };
    if(wL!=null && wR!=null && (wL+wR)>0){
      out.asym = Math.abs(wL-wR)/((wL+wR)/2)*100;
    }
    return out;
  }

  function armZoneGrade(zone){
    if(zone==null) return ['–','#B9C7DC',''];
    if(zone<0.15) return ['경직·바깥','#D9842A','어깨 힘을 빼고 자연스럽게 안쪽으로 흔드세요'];
    if(zone<=1.0) return ['자연스러운 사선','#2E8B57',''];
    return ['정중선 침범','#C0392B','손이 명치를 넘어가지 않게 주의하세요'];
  }

  function computeMetrics(lm){
    var L={sh:11,hip:23,knee:25,ank:27,heel:29,toe:31}, R={sh:12,hip:24,knee:26,ank:28,heel:30,toe:32};
    var need=[11,12,23,24,25,26,27,28];
    for(var i=0;i<need.length;i++){ if(!vis(lm[need[i]])) return null; }
    var aL=lm[27], aR=lm[28];
    var ankMidY=(aL.y+aR.y)/2;
    var pelvisX=(lm[23].x+lm[24].x)/2;
    var fL = vis(lm[29]) ? lm[29] : aL;
    var fR = vis(lm[30]) ? lm[30] : aR;
    var swNorm=Math.abs(fL.x-fR.x);
    var pH_L=lm[23], pH_R=lm[24];
    var pelvicAng = Math.atan2(pH_L.y-pH_R.y, Math.max(1e-6, Math.abs(pH_L.x-pH_R.x)))*180/Math.PI;
    var sideSign = (pH_L.x >= pH_R.x) ? 1 : -1;
    var shMidX=(lm[11].x+lm[12].x)/2, shMidY=(lm[11].y+lm[12].y)/2;
    var hipMidX=(pH_L.x+pH_R.x)/2, hipMidY=(pH_L.y+pH_R.y)/2;
    var trunkLean = sideSign * Math.atan2(shMidX-hipMidX, Math.max(1e-6, hipMidY-shMidY))*180/Math.PI;

    function kneeFPPA(H){
      var hip=lm[H.hip], kn=lm[H.knee], an=lm[H.ank];
      var ang=angle(hip.x,hip.y, kn.x,kn.y, an.x,an.y);
      var fppa=180-ang;
      var lineX=lineXat(hip.x,hip.y, an.x,an.y, kn.y);
      var dir=(pelvisX-lineX)>=0?1:-1; 
      var medial=(kn.x-lineX)*dir; 
      return { mag:fppa, medial:medial>0 };
    }

    function footAng(H){
      var he=lm[H.heel], to=lm[H.toe];
      if(!vis(he)||!vis(to)) return null;
      var hx=he.x*state.dispW, hy=he.y*state.dispH;
      var tx=to.x*state.dispW, ty=to.y*state.dispH;
      var dx=tx-hx, dy=ty-hy;
      var mag=Math.atan2(Math.abs(dx), Math.abs(dy))*180/Math.PI;
      var footSide = hx - pelvisX*state.dispW;
      var toeDir   = dx;
      var out = (footSide*toeDir) > 0;
      return { mag:mag, out:out, hx:hx, hy:hy, tx:tx, ty:ty, side:footSide };
    }

    var _pv=state.last;
    var _mv=function(idx){ if(!_pv||!_pv.lm) return 0; var p1=lm[idx], p0=_pv.lm[idx]; return Math.hypot(p1.x-p0.x, p1.y-p0.y); };
    return {
      swNorm:swNorm,
      motL:_mv(27), motR:_mv(28),
      ankNorm:Math.abs(aL.x-aR.x),
      pelvicAng:pelvicAng, trunkLean:trunkLean,
      kneeGap:Math.abs(lm[25].x-lm[26].x),
      ankMidY:ankMidY,
      kneeL:kneeFPPA(L), kneeR:kneeFPPA(R),
      footL:footAng(L), footR:footAng(R),
      arm:armData(lm),
      lm:lm
    };
  }

  function armData(lm){
    var LW=15,RW=16, LS=11,RS=12, LH=23,RH=24;
    var out={};
    if(vis(lm[LS])&&vis(lm[LH])){
      var torsoL=lm[LH].y-lm[LS].y;
      out.tgtTopL=lm[LS].y+torsoL*0.45;
      out.tgtBotL=lm[LS].y+torsoL*0.80;
    }
    if(vis(lm[RS])&&vis(lm[RH])){
      var torsoR=lm[RH].y-lm[RS].y;
      out.tgtTopR=lm[RS].y+torsoR*0.45;
      out.tgtBotR=lm[RS].y+torsoR*0.80;
    }
    if(vis(lm[LW])) out.wL=lm[LW].y;
    if(vis(lm[RW])) out.wR=lm[RW].y;
    if(vis(lm[LS])&&vis(lm[RS])&&vis(lm[LH])&&vis(lm[RH])){
      var shMidY=(lm[LS].y+lm[RS].y)/2, hipMidY=(lm[LH].y+lm[RH].y)/2;
      out.torsoLen=Math.abs(hipMidY-shMidY);
      out.shMidY=shMidY;
      var midX=((lm[LS].x+lm[RS].x)/2 + (lm[LH].x+lm[RH].x)/2)/2;
      out.midX=midX;
      out.shoulderW=Math.abs(lm[LS].x-lm[RS].x) || 0.001;
      var halfW=out.shoulderW/2;
      if(vis(lm[LW])){
        var dirL=(midX-lm[LS].x)>=0?1:-1;
        out.zoneL=(lm[LW].x-lm[LS].x)*dirL/halfW;
      }
      if(vis(lm[RW])){
        var dirR=(midX-lm[RS].x)>=0?1:-1;
        out.zoneR=(lm[RW].x-lm[RS].x)*dirR/halfW;
      }
    }
    return out;
  }

  function kneeGrade(mag){ return mag<5?['정상','var(--green)','#2E8B57']:(mag<10?['경도','var(--amber)','#D9842A']:['뚜렷','var(--red)','#C0392B']); }
  function footGrade(fpa){
    if(fpa>=-3 && fpa<=15) return ['정상','var(--green)','#2E8B57'];
    if(fpa>15 && fpa<=22) return ['경도 팔자','var(--amber)','#D9842A'];
    if(fpa>22) return ['뚜렷 팔자','var(--red)','#C0392B'];
    if(fpa<-3 && fpa>=-10) return ['경도 안짱','var(--amber)','#D9842A'];
    return ['뚜렷 안짱','var(--red)','#C0392B'];
  }
  
  function kamSignal(swPct, dpct){
    if(swPct==null || dpct==null) return null;
    var varus  = dpct > 3;
    var narrow = swPct < 5;
    var lvl, msg, tip='';
    if(varus && narrow){
      lvl=['높음','#C0392B'];
      msg='<b>내반(오다리) 정렬</b>에 <b>좁은 보폭 너비</b>가 겹쳐, 걸을 때 무릎 <b>안쪽</b>에 부하가 모이기 쉬운 조합입니다.';
      tip='<b>보폭을 약간 넓혀</b> 걸어보세요. 발 사이를 조금 벌려 걷는 것은 무릎 안쪽 부하를 줄이는 것으로 알려진 방법입니다. 무리하지 말고 <b>평소보다 살짝 넓게</b>, 자연스러운 범위에서 연습하세요.';
    } else if(varus){
      lvl=['보통','#D9842A'];
      msg='<b>내반(오다리) 경향</b>이 있으나 보폭 너비는 확보돼 있습니다. 보폭 너비가 좁아지지 않도록 유지하는 것이 도움이 됩니다.';
      tip='지금의 <b>보폭 너비를 유지</b>하세요. 발을 모아 걷는 습관(일자로 붙여 걷기)은 무릎 안쪽 부하를 키울 수 있습니다.';
    } else if(narrow){
      lvl=['보통','#D9842A'];
      msg='정렬은 정상 범위이나 <b>보폭 너비가 좁은 편</b>입니다. 좁은 보폭은 균형에 불리하고 하지 부하를 높일 수 있습니다.';
      tip='발 사이를 <b>조금만 더 벌려</b> 걸어보세요. 좁게 붙여 걷기보다 안정적입니다.';
    } else {
      lvl=['낮음','#2E8B57'];
      msg='정렬과 보폭 너비 모두 무릎 안쪽 부하를 키우는 조합은 아닙니다. 현재의 걸음 습관을 이어 가세요.';
    }
    return { lvl:lvl, msg:msg, tip:tip, varus:varus, narrow:narrow };
  }

  function renderKam(swPct, dpct){
    var box=$('fgKam'), b=$('fgKamB'), r=kamSignal(swPct, dpct);
    $('fgKamSW').textContent = (swPct==null)?'–':(swPct.toFixed(1)+'%'+(swPct<5?' · 좁음':' · 확보'));
    $('fgKamLeg').textContent = (dpct==null)?'–':((dpct>=0?'+':'−')+Math.abs(dpct).toFixed(1)+'%'+(dpct>3?' · 내반':(dpct<-5?' · 외반':' · 정상')));
    if(!r){ b.textContent='–'; b.style.background='#B9C7DC'; $('fgKamMsg').textContent='보폭 너비와 다리 정렬이 모두 측정돼야 표시됩니다.'; $('fgKamTip').classList.add('fg-hide'); box.classList.remove('on'); return; }
    b.textContent=r.lvl[0]; b.style.background=r.lvl[1];
    $('fgKamMsg').innerHTML=r.msg;
    var tip=$('fgKamTip');
    if(r.tip){ tip.innerHTML='실천 <b>·</b> '+r.tip; tip.classList.remove('fg-hide'); } else tip.classList.add('fg-hide');
    box.classList.toggle('on', r.varus||r.narrow);
  }

  function legGrade(d){
    if(d>=-5 && d<=3) return ['정상','#2E8B57'];
    if(d>3 && d<=6) return ['오다리 경향','#D9842A'];
    if(d>6) return ['뚜렷 오다리','#C0392B'];
    if(d<-5 && d>=-9) return ['X자 경향','#D9842A'];
    return ['뚜렷 X자','#C0392B'];
  }

  function ensureCanvasSize(){
    var vw=video.videoWidth, vh=video.videoHeight;
    if(!vw||!vh) return false;
    var wrap=canvas.parentElement.getBoundingClientRect();
    var cw=wrap.width||360;
    var dispW=cw, dispH=Math.round(cw*(vh/vw));
    if(dispW!==state.dispW || dispH!==state.dispH){
      state.dispW=dispW; state.dispH=dispH;
      canvas.style.width='100%';
      canvas.width=Math.round(dispW*dpr); canvas.height=Math.round(dispH*dpr);
    }
    return true;
  }
  function X(nx){ return state.mirror ? (state.dispW - nx*state.dispW) : nx*state.dispW; }
  function Y(ny){ return ny*state.dispH; }

  function onResults(res){
    if(!ensureCanvasSize()) return;
    var W=state.dispW,H=state.dispH;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,W,H);
    ctx.save();
    if(state.mirror){ ctx.translate(W,0); ctx.scale(-1,1); }
    ctx.drawImage((video.videoWidth?video:res.image),0,0,W,H);
    ctx.restore();

    var lm = res.poseLandmarks;
    if(lm && _crop){
      var c=_crop;
      lm = lm.map(function(q){
        return { x:c.x+q.x*c.w, y:c.y+q.y*c.h, z:q.z, visibility:q.visibility };
      });
    }
    if(state.roi){ if(lm) updateRoiTrack(lm); else roiLostTick(); }

    var m = lm ? computeMetrics(lm) : null;
    if(m){ drawSkeleton(m); captureLogic(m); state.last=m; }

    drawBand(); drawRoi();
    if(m) drawLabels(m);
  }

  function updateRoiTrack(lm){
    var minX=1,minY=1,maxX=0,maxY=0,n=0;
    lm.forEach(function(q){
      if(q.visibility===undefined || q.visibility>0.3){
        if(q.x<minX)minX=q.x; if(q.x>maxX)maxX=q.x;
        if(q.y<minY)minY=q.y; if(q.y>maxY)maxY=q.y; n++;
      }
    });
    if(n<8) { roiLostTick(); return; }
    var w=maxX-minX, h=maxY-minY;
    if(!(w>0.01 && h>0.05)) { roiLostTick(); return; }
    var mx=w*0.45, my=h*0.20;
    var nx=Math.max(0,minX-mx), ny=Math.max(0,minY-my);
    state.roi={ x:nx, y:ny, w:Math.min(1-nx, w+mx*2), h:Math.min(1-ny, h+my*2) };
    state.roiLost=0;
  }
  function roiLostTick(){
    state.roiLost++;
    if(state.roiLost>=30){
      state.roi=null; _crop=null; state.roiLost=0; updateRoiUI();
      setStatus('대상자를 놓쳐 화면 전체 인식으로 돌아갔습니다 · 다시 지정해 주세요');
      return;
    }
    if(state.roiLost%6===0 && state.roi){
      var r=state.roi, ex=r.w*0.15, ey=r.h*0.10;
      var nx=Math.max(0,r.x-ex), ny=Math.max(0,r.y-ey);
      state.roi={ x:nx, y:ny, w:Math.min(1-nx,r.w+ex*2), h:Math.min(1-ny,r.h+ey*2) };
    }
  }
  function drawRoi(){
    var r = state.roiDraft || state.roi;
    if(!r) return;
    var x1=X(r.x), x2=X(r.x+r.w);
    var left=Math.min(x1,x2), right=Math.max(x1,x2);
    var top=Y(r.y), bot=Y(r.y+r.h);
    var col = state.roiDraft ? '#D9842A' : '#2E8B57';
    ctx.save();
    ctx.strokeStyle=col; ctx.lineWidth=2.5; ctx.setLineDash([7,5]);
    ctx.strokeRect(left, top, right-left, bot-top);
    ctx.setLineDash([]);
    ctx.font='700 12px Pretendard,sans-serif';
    var label='측정 대상자', tw=ctx.measureText(label).width, ly=Math.max(0, top-18);
    ctx.fillStyle=col; ctx.fillRect(left, ly, tw+12, 18);
    ctx.fillStyle='#fff'; ctx.fillText(label, left+6, ly+13);
    ctx.restore();
  }
  function drawRoiPreview(){
    if(!ensureCanvasSize()) return;
    var W=state.dispW,H=state.dispH;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,W,H);
    ctx.save();
    if(state.mirror){ ctx.translate(W,0); ctx.scale(-1,1); }
    if(video.videoWidth) ctx.drawImage(video,0,0,W,H);
    ctx.restore();
    drawBand(); drawRoi();
  }

  function seg(lm,a,b,color){
    ctx.strokeStyle=color; ctx.lineWidth=3; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(X(lm[a].x),Y(lm[a].y)); ctx.lineTo(X(lm[b].x),Y(lm[b].y)); ctx.stroke();
  }
  function joint(lm,i,color,r){
    ctx.fillStyle=color; ctx.beginPath(); ctx.arc(X(lm[i].x),Y(lm[i].y),r||4,0,7); ctx.fill();
  }
  function drawSkeleton(m){
    var lm=m.lm;
    var cL=kneeGrade(m.kneeL.mag)[2], cR=kneeGrade(m.kneeR.mag)[2];
    seg(lm,11,12,'#8fa6c4'); seg(lm,23,24,'#8fa6c4');
    seg(lm,11,23,'#8fa6c4'); seg(lm,12,24,'#8fa6c4');
    seg(lm,23,25,cL); seg(lm,25,27,cL);
    seg(lm,24,26,cR); seg(lm,26,28,cR);
    if(vis(lm[29])&&vis(lm[31])) seg(lm,29,31,'#DCE7F4');
    if(vis(lm[30])&&vis(lm[32])) seg(lm,30,32,'#DCE7F4');
    [11,12,23,24].forEach(function(i){ joint(lm,i,'#B9C7DC',3.5); });
    joint(lm,25,cL,5); joint(lm,27,cL,5);
    joint(lm,26,cR,5); joint(lm,28,cR,5);
    (function(){
      var mL=(m.motL!=null?m.motL:0), mR=(m.motR!=null?m.motR:0);
      function footLine(heel, toe, swinging){
        if(!vis(lm[heel])||!vis(lm[toe])) return;
        ctx.save();
        ctx.strokeStyle = swinging ? '#FFC24D' : '#7FB0EC';
        ctx.lineWidth = 3.5; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(X(lm[heel].x),Y(lm[heel].y)); ctx.lineTo(X(lm[toe].x),Y(lm[toe].y)); ctx.stroke();
        ctx.restore();
      }
      footLine(29, 31, mL > mR*1.5);
      footLine(30, 32, mR > mL*1.5);
    })();
    var hL = vis(lm[29]) ? lm[29] : lm[27], hR = vis(lm[30]) ? lm[30] : lm[28];
    var y=Y(Math.max(hL.y,hR.y));
    ctx.strokeStyle='#FFC24D'; ctx.lineWidth=2; ctx.setLineDash([6,4]);
    ctx.beginPath(); ctx.moveTo(X(hL.x),y); ctx.lineTo(X(hR.x),y); ctx.stroke(); ctx.setLineDash([]);
    drawArmGuide(m);
  }
  function drawArmGuide(m){
    var lm=m.lm;
    function oneArm(SH,EL,WR,HP){
      if(!vis(lm[SH])||!vis(lm[WR])||!vis(lm[HP])) return;
      if(vis(lm[EL])){ seg(lm,SH,EL,'#9DB4D4'); seg(lm,EL,WR,'#9DB4D4'); }
      var torso=lm[HP].y-lm[SH].y;
      var yTop=Y(lm[SH].y+torso*0.45), yBot=Y(lm[SH].y+torso*0.80);
      var xC=X(lm[WR].x), bw=state.dispW*0.11;
      ctx.fillStyle='rgba(217,132,42,0.12)';
      ctx.fillRect(xC-bw/2, yTop, bw, yBot-yTop);
      ctx.strokeStyle='rgba(217,132,42,0.7)'; ctx.lineWidth=1.5; ctx.setLineDash([5,4]);
      [yTop,yBot].forEach(function(yy){ ctx.beginPath(); ctx.moveTo(xC-bw/2,yy); ctx.lineTo(xC+bw/2,yy); ctx.stroke(); });
      ctx.setLineDash([]);
      ctx.fillStyle='#D9842A'; ctx.beginPath(); ctx.arc(X(lm[WR].x),Y(lm[WR].y),5,0,7); ctx.fill();
      ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke();
    }
    oneArm(11,13,15,23);
    oneArm(12,14,16,24);
    if(vis(lm[11])&&vis(lm[12])&&vis(lm[23])&&vis(lm[24])){
      var midX=((lm[11].x+lm[12].x)/2 + (lm[23].x+lm[24].x)/2)/2;
      ctx.strokeStyle='rgba(46,139,87,0.55)'; ctx.lineWidth=1.5; ctx.setLineDash([6,4]);
      ctx.beginPath(); ctx.moveTo(X(midX),0); ctx.lineTo(X(midX),state.dispH); ctx.stroke();
      ctx.strokeStyle='rgba(107,114,128,0.4)'; ctx.lineWidth=1.2;
      [11,12].forEach(function(si){ ctx.beginPath(); ctx.moveTo(X(lm[si].x),0); ctx.lineTo(X(lm[si].x),state.dispH); ctx.stroke(); });
      ctx.setLineDash([]);
    }
  }
  function drawLabels(m){
    var lm=m.lm;
    ctx.font='700 12px Pretendard,sans-serif'; ctx.textAlign='center';
    ctx.fillStyle='#FFD98A';
    ctx.fillText('L', X(lm[27].x), Y(lm[27].y)+18);
    ctx.fillText('R', X(lm[28].x), Y(lm[28].y)+18);
    ctx.textAlign='left';
  }
  function drawBand(){
    if(!state.bandOn) return;
    var W=state.dispW,H=state.dispH;
    var y0=state.band[0]*H, y1=state.band[1]*H;
    ctx.fillStyle='rgba(46,92,158,0.14)'; ctx.fillRect(0,y0,W,y1-y0);
    ctx.strokeStyle='#2E5C9E'; ctx.lineWidth=2; ctx.setLineDash([7,5]);
    [y0,y1].forEach(function(y){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
      ctx.fillStyle='#2E5C9E'; ctx.beginPath(); ctx.arc(W-14,y,8,0,7); ctx.fill(); });
    ctx.setLineDash([]);
    ctx.fillStyle='#DCE7F4'; ctx.font='600 11px Pretendard,sans-serif';
    ctx.fillText('측정 구간', 8, y0-6);
  }

  function captureLogic(m){
    if(!state.playing || !state.samples) return;
    var inBand = !state.bandOn || (m.ankMidY>=state.band[0] && m.ankMidY<=state.band[1]);
    if(inBand){
      collectSample(m);
      var n=state.samples.sw.length;
      if(n % 4===0) updateRobust();
      setStatus('측정 중 · '+n+' 프레임 수집');
    }
  }
  function snapshot(m){
    return {
      swNorm:m.swNorm, ankNorm:m.ankNorm, kneeGap:m.kneeGap,
      kneeL:m.kneeL, kneeR:m.kneeR, footL:m.footL, footR:m.footR,
      staturePx: staturePx(m.lm)
    };
  }
  function staturePx(lm){
    if(!vis(lm[0])) return null;
    var noseY=lm[0].y*state.dispH, ankY=((lm[27].y+lm[28].y)/2)*state.dispH;
    var h=(ankY-noseY)/0.82;
    return h>0?h:null;
  }

  function showResult(s){
    var normPct = (s.staturePx && s.swNorm!=null) ? (s.swNorm*state.dispW/s.staturePx*100) : null;
    if(normPct!=null){
      $('fgSW').textContent=normPct.toFixed(1); $('fgSWU').textContent='%';
    } else {
      $('fgSW').textContent='–'; $('fgSWU').textContent='%';
    }
    if(state.heightMM && s.staturePx){
      var mm=Math.round(s.swNorm*state.dispW*(state.heightMM/s.staturePx));
      $('fgSWmm').textContent='≈ '+mm+' mm  (키 '+(state.heightMM/10)+'cm 기준)';
    } else {
      $('fgSWmm').textContent='';
    }
    setSide('fgKneeL',s.kneeL, kneeGrade, function(o){return o.medial?'안쪽':'바깥';});
    setSide('fgKneeR',s.kneeR, kneeGrade, function(o){return o.medial?'안쪽':'바깥';});
    
    var _fn=$('fgFpaNote');
    if(_fn){
      var _ms = (s.footL&&s.footL.midStance) || (s.footR&&s.footR.midStance);
      var _cr = (s.footL&&s.footL.corrected) || (s.footR&&s.footR.corrected);
      _fn.textContent = (_ms?'(입각 중기':'(입각기 전체') + (_cr?' · 원근 보정 추정값)':' · 화면 투영값)');
    }
    setFoot('fgFootL',s.footL);
    setFoot('fgFootR',s.footR);
    
    var dpct = (s.legDpct!==undefined && s.legDpct!==null) ? s.legDpct
             : (s.staturePx && s.kneeGap!=null) ? (s.kneeGap - (s.ankNorm!=null?s.ankNorm:s.swNorm))*state.dispW/s.staturePx*100 : null;
    if(dpct!=null){
      var lg=legGrade(dpct);
      $('fgLeg').textContent=(dpct>=0?'+':'−')+Math.abs(dpct).toFixed(1)+'%';
      $('fgLegt').textContent=lg[0]; $('fgLegt').style.background=lg[1];
    } else { $('fgLeg').textContent='–'; $('fgLegt').textContent='–'; $('fgLegt').style.background='#B9C7DC'; }
    
    var swPctVal = (s.swNorm!=null && s.staturePx) ? (s.swNorm*state.dispW/s.staturePx*100) : null;
    renderKam(swPctVal, dpct);
    
    renderArm(s.arm);
    renderPelvis(s.pelvis);
    renderWhip(s.whipL, s.whipR);
    $('fgInterp').innerHTML = interpText(s);
  }

  function armGrade(pct){
    if(pct==null) return ['–','#B9C7DC'];
    if(pct<10)  return ['적음','#D9842A'];
    if(pct<=35) return ['적정','#2E8B57'];
    return ['큼','#D9842A'];
  }
  function armAsymGrade(pct){
    if(pct==null) return ['–','#B9C7DC'];
    if(pct<15) return ['대칭 양호','#2E8B57'];
    if(pct<30) return ['경도 비대칭','#D9842A'];
    return ['뚜렷한 비대칭','#C0392B'];
  }

  function renderWhip(wl, wr){
    var cue=$('fgWhipCue');
    function setOne(id, w){
      if(!w){ $(id).textContent='–'; $(id+'t').textContent='–'; $(id+'t').style.background='#B9C7DC'; return; }
      var g=whipGrade(w.diff);
      $(id).textContent=(w.diff>=0?'+':'')+w.diff.toFixed(1)+'\u00B0';
      $(id+'t').textContent=g[0]; $(id+'t').style.background=g[1];
    }
    setOne('fgWhipL', wl); setOne('fgWhipR', wr);
    if(!wl || !wr){
      $('fgWhipAsym').textContent='–'; $('fgWhipAsymt').textContent='–'; $('fgWhipAsymt').style.background='#B9C7DC';
      cue.innerHTML='💡 걸음 수가 부족해 좌우 비교를 못 했습니다 · 4~6걸음 이상 촬영해 주세요';
      cue.classList.remove('fg-hide');
      return;
    }
    var asym=Math.abs(wl.diff-wr.diff);
    var ag = asym<6 ? ['좌우 비슷','#2E8B57'] : (asym<=12 ? ['약간 차이','#D9842A'] : ['뚜렷한 차이','#C0392B']);
    $('fgWhipAsym').textContent=asym.toFixed(1)+'\u00B0';
    $('fgWhipAsymt').textContent=ag[0]; $('fgWhipAsymt').style.background=ag[1];
    var msgs=[];
    if(asym>12){
      var side=(Math.abs(wl.diff)>=Math.abs(wr.diff))?'왼발':'오른발';
      msgs.push(side+'이 착지할 때 방향이 더 많이 바뀝니다 · 무릎·고관절 회전 부담을 살펴보세요');
    } else if(asym>6){
      msgs.push('좌우 비틀림에 약간 차이가 있습니다 · 여러 번 측정해 반복되는지 확인해 보세요');
    }
    msgs.push('공중과 착지 후 발 각도를 비교한 값으로, 2D 추정이라 좌우 차이를 우선 보세요');
    cue.innerHTML='💡 '+msgs.join('<br>💡 ');
    cue.classList.remove('fg-hide');
  }

  function renderPelvis(p){
    var cue=$('fgPelCue');
    if(!p){
      ['fgPelL','fgPelR'].forEach(function(id){ $(id).textContent='–'; $(id+'t').textContent='–'; $(id+'t').style.background='#B9C7DC'; });
      $('fgPelComp').textContent='–'; $('fgPelCompt').textContent='–'; $('fgPelCompt').style.background='#B9C7DC';
      cue.classList.add('fg-hide');
      return;
    }
    function setSideD(id, deg){
      var g=pelvisGrade(deg);
      $(id).textContent = (deg>=0?'':'') + deg.toFixed(1) + '°';
      $(id+'t').textContent=g[0]; $(id+'t').style.background=g[1];
    }
    setSideD('fgPelL', p.dropL);
    setSideD('fgPelR', p.dropR);
    var comp=Math.max(p.compL, p.compR);
    var cg=compGrade(comp);
    $('fgPelComp').textContent=comp.toFixed(1)+'°';
    $('fgPelCompt').textContent=cg[0]; $('fgPelCompt').style.background=cg[1];

    var msgs=[];
    var worse = (Math.abs(p.dropR)>=Math.abs(p.dropL)) ? '오른발' : '왼발';
    var worseVal = Math.max(Math.abs(p.dropR), Math.abs(p.dropL));
    if(worseVal>8) msgs.push(worse+'로 디딜 때 반대쪽 골반이 많이 떨어집니다 · 옆으로 버티는 힘(엉덩이 옆 근육) 강화가 도움이 됩니다');
    else if(worseVal>5) msgs.push(worse+'로 디딜 때 골반이 약간 떨어집니다 · 한 발 서기 균형 연습을 권합니다');
    if(p.asym>3) msgs.push('좌우 차이 '+p.asym.toFixed(1)+'° · 한쪽이 더 불안정합니다');
    if(comp>6) msgs.push('골반 대신 상체를 기울여 버티는 보상이 뚜렷합니다');
    if(msgs.length){ cue.innerHTML='💡 '+msgs.join('<br>💡 '); cue.classList.remove('fg-hide'); }
    else cue.classList.add('fg-hide');
  }

  function renderArm(a){
    if(!a){ ['fgArmL','fgArmR','fgArmAsym'].forEach(function(id){ $(id).textContent='–'; $(id+'t').textContent='–'; $(id+'t').style.background='#B9C7DC'; }); return; }
    function setArm(id,pct){
      if(pct==null){ $(id).textContent='–'; $(id+'t').textContent='–'; $(id+'t').style.background='#B9C7DC'; return; }
      var g=armGrade(pct);
      $(id).textContent=pct.toFixed(1)+'%';
      $(id+'t').textContent=g[0]; $(id+'t').style.background=g[1];
    }
    setArm('fgArmL', a.left);
    setArm('fgArmR', a.right);
    if(a.asym!=null){
      var ag=armAsymGrade(a.asym);
      $('fgArmAsym').textContent=a.asym.toFixed(0)+'%';
      $('fgArmAsymt').textContent=ag[0]; $('fgArmAsymt').style.background=ag[1];
    } else { $('fgArmAsym').textContent='–'; $('fgArmAsymt').textContent='–'; $('fgArmAsymt').style.background='#B9C7DC'; }
    var zgL=armZoneGrade(a.zoneL), zgR=armZoneGrade(a.zoneR);
    $('fgArmZoneL').textContent=zgL[0]; $('fgArmZoneL').style.background=zgL[1];
    $('fgArmZoneR').textContent=zgR[0]; $('fgArmZoneR').style.background=zgR[1];
    var cue=zgL[2]||zgR[2];
    var cueEl=$('fgArmCue');
    if(cue){ cueEl.textContent='💡 '+cue; cueEl.classList.remove('fg-hide'); }
    else { cueEl.classList.add('fg-hide'); }
  }

  function setSide(id,o,grade,dirFn){
    if(!o){ $(id).textContent='–'; $(id+'t').textContent='–'; $(id+'t').style.background='#B9C7DC'; return; }
    var g=grade(o.mag);
    $(id).textContent=o.mag.toFixed(1)+'°';
    var t=$(id+'t'); t.textContent=g[0]+(g[0]!=='정상'?' · '+dirFn(o):''); t.style.background=g[2];
  }
  function setFoot(id,o){
    if(!o){ $(id).textContent='–'; $(id+'t').textContent='–'; $(id+'t').style.background='#B9C7DC'; return; }
    var fpa=o.out? o.mag : -o.mag;
    var g=footGrade(fpa);
    $(id).textContent=(fpa>=0?'+':'−')+Math.abs(fpa).toFixed(0)+'°';
    var t=$(id+'t'); t.textContent=g[0]; t.style.background=g[2];
  }
  
  function interpText(s){
    var parts=[];
    var kL=s.kneeL.mag, kR=s.kneeR.mag;
    if(kL>=10||kR>=10) parts.push('착지 시 한쪽 이상 무릎이 <b>안으로 무너지는 편차</b>가 보입니다.');
    else if(kL>=5||kR>=5) parts.push('무릎 무너짐(FPPA)에 <b>경도 편차</b>가 있습니다.');
    else parts.push('무릎 무너짐(FPPA)은 <b>정상 범위</b>입니다.');
    var dp=(s.legDpct!==undefined&&s.legDpct!==null)?s.legDpct
          :(s.staturePx&&s.kneeGap!=null)?(s.kneeGap-(s.ankNorm!=null?s.ankNorm:s.swNorm))*state.dispW/s.staturePx*100:null;
    if(dp!=null){
      if(dp>3) parts.push('무릎이 발목보다 벌어진 <b>오다리 경향</b>이 있습니다(+'+dp.toFixed(1)+'%).');
      else if(dp<-5) parts.push('발목이 무릎보다 벌어진 <b>X자 경향</b>이 있습니다('+dp.toFixed(1)+'%).');
    }
    var fL=s.footL?(s.footL.out?s.footL.mag:-s.footL.mag):null;
    var fR=s.footR?(s.footR.out?s.footR.mag:-s.footR.mag):null;
    if(fL!=null && (fL<-3||fL>15)) parts.push('왼발 진행각 편차('+(fL<0?'안짱':'팔자')+' '+Math.abs(fL).toFixed(0)+'°).');
    if(fR!=null && (fR<-3||fR>15)) parts.push('오른발 진행각 편차('+(fR<0?'안짱':'팔자')+' '+Math.abs(fR).toFixed(0)+'°).');
    parts.push('걷기 습관·신발·근력에 따라 달라질 수 있어 참고용으로 활용하세요.');
    return parts.join(' ');
  }

  // ---------- 🚀 4. 영상 로딩 및 AI 병렬 분리 (핵심 해결 로직) ----------
  $('fgGuideToggle').addEventListener('click',function(){
    var box=$('fgGuideBox'), open=box.classList.toggle('fg-hide')===false;
    $('fgGuideCaret').textContent = open ? '▴' : '▾';
    if(open) box.scrollIntoView({behavior:'smooth',block:'nearest'});
  });
  $('fgPick').addEventListener('click',function(){ $('fgFile').click(); });
  function isVideoFile(f){
    if(f.type && f.type.indexOf('video/')===0) return true;
    return /\.(mp4|mov|m4v|3gp|mkv|avi|webm|mpg|mpeg|wmv)$/i.test(f.name||'');
  }

  $('fgFile').addEventListener('change',function(e){
    var f=e.target.files&&e.target.files[0]; if(!f) return;
    if(!isVideoFile(f)){
      setStatus('영상 파일이 아닙니다 · 보행 영상(mp4·mov 등)을 선택해 주세요');
      alert('영상 파일이 아닙니다.\n보행 영상(mp4, mov 등)을 선택해 주세요.');
      e.target.value=''; return;
    }
    stopCam();
    state.source='file';
    video.srcObject=null; video.src=URL.createObjectURL(f); video.loop=false;
    video.load(); 

    video.onloadeddata=function(){ 
      enterStage(); 
      video.playbackRate=state.speed; 
      
      // 💡 UI 무한 루프 강제 시작 (영상 멈춤 완벽 방지)
      if(!rafId) pump();
      
      // 첫 화면 표시를 위해 0.001초 이동 (이벤트 유발)
      video.currentTime = 0.001; 
      
      setStatus('AI 분석 엔진 준비 및 영상 동기화 중...');
      ensurePose().then(function(){
        setTimeout(function(){ 
            renderPaused(); 
            setStatus('준비 완료! 재생 버튼(▶)을 눌러 분석을 시작하세요.');
        }, 300);
      });
    };
  });

  $('fgCam').addEventListener('click',function(){ startCam(); });
  var camRAF=null;
  function inIframe(){ try{ return window.self!==window.top; }catch(e){ return true; } }
  function camPump(){
    if(state.source==='cam' && video.srcObject && !video.paused){
      sendPose(video).then(function(){ camRAF=requestAnimationFrame(camPump); });
    } else { camRAF=requestAnimationFrame(camPump); }
  }
  function startCam(){
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){ setStatus('이 브라우저는 카메라를 지원하지 않습니다.'); return; }
    setStatus('카메라 여는 중…');
    if(rafId){ cancelAnimationFrame(rafId); rafId=null; }
    stopCam();
    function open(constraints){ return navigator.mediaDevices.getUserMedia(constraints); }
    setTimeout(function(){
      open({video:{facingMode:{ideal:'environment'}, width:{ideal:960}, height:{ideal:540}}, audio:false})
        .catch(function(){ setStatus('카메라 재시도 중…'); return open({video:true, audio:false}); })
        .then(function(stream){
          state.source='cam'; video.src=''; video.srcObject=stream; video.loop=false; video.muted=true;
          var started=false;
          function begin(){
            if(started) return; started=true;
            enterStage();
            var pr=video.play(); if(pr&&pr.catch) pr.catch(function(){});
            state.playing=true; setPlayLabel();
            setStatus('실시간 분석 중 · 대상이 카메라를 향해 걸어오게 하세요');
            if(camRAF) cancelAnimationFrame(camRAF); camPump();
          }
          video.onloadedmetadata=begin;
          if(video.readyState>=1) begin();
        })
        .catch(function(err){
          var name=(err&&err.name)?err.name:'';
          var msg = (name==='NotAllowedError'||name==='SecurityError') 
                  ? '카메라 권한이 거부됐습니다. 권한 허용 후 시도하세요.' 
                  : '카메라를 시작하지 못했습니다. 영상 파일 업로드를 이용해 주세요.';
          setStatus(msg);
        });
    }, 300);
  }
  function stopCam(){
    if(camRAF){ cancelAnimationFrame(camRAF); camRAF=null; }
    if(video.srcObject){ video.srcObject.getTracks().forEach(function(t){t.stop();}); video.srcObject=null; }
  }
  function enterStage(){
    $('fgIntake').classList.add('fg-hide');
    $('fgStage').classList.remove('fg-hide'); $('fgResult').classList.remove('fg-hide');
    state.roi=null; _crop=null; state.roiDraft=null; state.roiLost=0; state.roiMode=false;
    paintSeek(0);
    updateRoiUI(); $('fgRoiBtn').classList.remove('on'); $('fgRoiBtn').textContent='대상자 지정';
    clearSamples(); ensureCanvasSize();
    var h=parseFloat($('fgHeight').value); state.heightMM=(h>=80&&h<=220)?h*10:0;
  }

  // ---------- 🚀 5. 완전히 분리된 60fps UI 구동 엔진 (이전 멈춤 에러의 완벽한 해결책) ----------
  var rafId=null;
  var _lastVT = -1;
  var aiProcessing = false; // AI 지연으로 인한 화면 멈춤 차단벽

  function pump(){
    // 1. 영상 재생 바는 무조건 부드럽게 업데이트
    if(state.source==='file' && video.duration){
       paintSeek(video.currentTime/video.duration);
    }
    
    // 2. 영상이 재생 중일 때, 이전 AI 분석이 끝나면 새로운 프레임 분석
    if(state.source==='file' && !video.paused && !video.ended){
      if(video.currentTime !== _lastVT && !aiProcessing){
        _lastVT = video.currentTime;
        aiProcessing = true;
        sendPose(video).then(function(){
            aiProcessing = false;
        }).catch(function(){
            aiProcessing = false;
        });
      }
    }
    // 3. 무조건 다음 프레임 요청 (이 줄이 빠지면 화면이 멈췄음)
    rafId = requestAnimationFrame(pump);
  }

  function renderPaused(){ 
    if(state.source==='file' && !aiProcessing){
      aiProcessing = true;
      sendPose(video).then(function(){ aiProcessing = false; }).catch(function(){ aiProcessing = false; });
    }
  }

  // ---------- 재생 컨트롤 ----------
  $('fgPlay').addEventListener('click',function(){
    if(state.source!=='file') return;
    if(video.paused){ 
      var pr = video.play(); 
      if(pr !== undefined) {
         pr.catch(function(e){ console.error("재생 권한:", e); });
      }
      state.playing=true; 
      if(!rafId) pump();
    }
    else { 
      video.pause(); 
      state.playing=false; 
    }
    setPlayLabel();
  });
  function setPlayLabel(){ $('fgPlay').textContent = (state.source==='file' && video.paused)?'▶':'⏸'; }
  function step(dt){ if(state.source!=='file') return; video.pause(); state.playing=false; setPlayLabel();
    video.currentTime=Math.max(0,Math.min(video.duration||0, video.currentTime+dt)); }
  $('fgBack').addEventListener('click',function(){ step(-1/30); });
  $('fgFwd').addEventListener('click',function(){ step(1/30); });
  
  $('fgZoneBtn').addEventListener('click',function(){
    state.bandOn=!state.bandOn;
    this.classList.toggle('on',state.bandOn);
    this.textContent = state.bandOn ? '구간 해제' : '구간 사용';
    clearSamples();
    setStatus(state.bandOn ? '측정 구간 사용 · 구간 안에서만 측정합니다' : '측정 구간 해제 · 화면 전체에서 측정합니다');
    if(state.source==='file') renderPaused();
  });
  video.addEventListener('seeked',renderPaused);
  video.addEventListener('ended',function(){ state.playing=false; setPlayLabel();
    var ok=updateRobust(); var n=state.samples?state.samples.sw.length:0;
    setStatus(ok?('측정 완료 · '+n+' 프레임의 대표값(중앙값 기반)입니다'):'측정 구간에서 걸어오는 장면이 부족합니다. 구간을 맞추고 다시 재생하세요'); });

  function paintSeek(frac){
    frac=Math.max(0,Math.min(1,frac||0));
    var pct=(frac*100).toFixed(2)+'%';
    var f=$('fgSeekFill'), k=$('fgSeekKnob');
    if(f) f.style.width=pct;
    if(k) k.style.left=pct;
  }
  var seekDrag=false;
  function seekFrac(e){
    var r=$('fgSeek').getBoundingClientRect();
    var t=(e.touches&&e.touches[0])?e.touches[0]:e;
    return Math.max(0,Math.min(1,(t.clientX-r.left)/r.width));
  }
  function seekTo(e){
    if(state.source!=='file' || !video.duration) return;
    var f=seekFrac(e); paintSeek(f); video.currentTime=f*video.duration;
  }
  (function(){
    var el=$('fgSeek');
    el.addEventListener('touchstart',function(e){ seekDrag=true; e.preventDefault(); seekTo(e); },{passive:false});
    el.addEventListener('touchmove',function(e){ if(seekDrag){ e.preventDefault(); seekTo(e); } },{passive:false});
    el.addEventListener('touchend',function(){ seekDrag=false; });
    el.addEventListener('mousedown',function(e){ seekDrag=true; seekTo(e); });
    window.addEventListener('mousemove',function(e){ if(seekDrag) seekTo(e); });
    window.addEventListener('mouseup',function(){ seekDrag=false; });
  })();

  var SPEEDS=[{v:0.25,t:'\u00BC'},{v:0.5,t:'\u00BD'},{v:1,t:'1\u00D7'},{v:2,t:'2\u00D7'}];
  var spdIdx=1;
  function applySpeed(){
    state.speed=SPEEDS[spdIdx].v; video.playbackRate=state.speed;
    $('fgSpeedBtn').textContent=SPEEDS[spdIdx].t;
    setStatus('재생 배속 '+SPEEDS[spdIdx].v+'x');
  }
  $('fgSpeedBtn').addEventListener('click',function(){ spdIdx=(spdIdx+1)%SPEEDS.length; applySpeed(); });
  $('fgMirror').addEventListener('click',function(){ state.mirror=!state.mirror; this.classList.toggle('on',state.mirror); renderPaused(); });
  $('fgCapture').addEventListener('click',function(){
    if(state.samples && state.samples.sw.length>=3){ updateRobust(); setStatus('현재까지 '+state.samples.sw.length+' 프레임 대표값으로 갱신.'); }
    else if(state.last){ state.best=snapshot(state.last); showResult(state.best); setStatus('표본이 적어 현재 프레임으로 측정.'); }
  });
  $('fgReset').addEventListener('click',function(){
    stopCam(); video.pause(); state.playing=false;
    $('fgStage').classList.add('fg-hide'); $('fgResult').classList.add('fg-hide');
    $('fgIntake').classList.remove('fg-hide'); $('fgFile').value=''; state.best=null; state.last=null;
  });

  document.getElementById('fg-root').addEventListener('click',function(e){
    var b=e.target.closest && e.target.closest('.fg-qbtn');
    if(!b) return;
    var box=document.getElementById(b.getAttribute('data-help'));
    if(!box) return;
    var opened=box.classList.toggle('fg-hide')===false;
    b.classList.toggle('on',opened);
  });

  function evtXFrac(e){
    var r=canvas.getBoundingClientRect();
    var cx=(e.touches&&e.touches[0]?e.touches[0].clientX:e.clientX)-r.left;
    var f=Math.max(0,Math.min(1, cx/r.width));
    return state.mirror ? 1-f : f;
  }
  var roiStart=null;
  function setRoiMode(on){
    state.roiMode=on;
    var b=$('fgRoiBtn');
    b.classList.toggle('on',on);
    b.textContent = on ? '지정 취소' : '대상자 지정';
    var cbar=$('fgCtrl'); if(cbar) cbar.classList.toggle('fg-hide', on);
    if(on){
      if(state.source==='file' && !video.paused){ video.pause(); state.playing=false; setPlayLabel(); }
      setStatus('측정할 사람을 탭하거나, 박스로 끌어 지정하세요');
      drawRoiPreview();
    }
  }
  function updateRoiUI(){
    var on=!!state.roi;
    $('fgRoiState').textContent = on ? '현재: 지정한 대상자만 인식 중' : '현재: 화면 전체에서 인식';
    $('fgRoiState').style.color = on ? 'var(--green,#2E8B57)' : 'var(--gray)';
    $('fgRoiClear').classList.toggle('fg-hide', !on);
  }
  function roiDown(e){
    e.preventDefault();
    roiStart={ x:evtXFrac(e), y:evtYFrac(e) };
    state.roiDraft=null;
  }
  function roiMove(e){
    if(!roiStart) return; e.preventDefault();
    var x=evtXFrac(e), y=evtYFrac(e);
    state.roiDraft={ x:Math.min(roiStart.x,x), y:Math.min(roiStart.y,y),
                     w:Math.abs(x-roiStart.x), h:Math.abs(y-roiStart.y) };
    drawRoiPreview();
  }
  function roiUp(){
    if(!roiStart) return;
    var d=state.roiDraft;
    if(!d || d.w<0.05 || d.h<0.08){
      var w=0.34, h=0.80;
      d={ x:Math.max(0,Math.min(1-w, roiStart.x-w/2)),
          y:Math.max(0,Math.min(1-h, roiStart.y-h/2)), w:w, h:h };
    }
    state.roi=d; state.roiDraft=null; roiStart=null; state.roiLost=0;
    setRoiMode(false); updateRoiUI(); clearSamples();
    setStatus('대상자를 지정했습니다 · 이 사람만 인식합니다 (다시 재생해 측정하세요)');
    if(state.source==='file') renderPaused(); else drawRoiPreview();
  }
  $('fgRoiBtn').addEventListener('click',function(){ setRoiMode(!state.roiMode); });
  $('fgRoiClear').addEventListener('click',function(){
    state.roi=null; _crop=null; state.roiDraft=null; state.roiLost=0;
    setRoiMode(false); updateRoiUI(); clearSamples();
    setStatus('대상자 지정을 해제했습니다 · 화면 전체에서 인식합니다');
    if(state.source==='file') renderPaused();
  });

  function evtYFrac(e){
    var r=canvas.getBoundingClientRect();
    var cy=(e.touches&&e.touches[0]?e.touches[0].clientY:e.clientY)-r.top;
    return Math.max(0,Math.min(1, cy/r.height));
  }
  function startBandDrag(e){ if(state.roiMode){ roiDown(e); return; }
    if(!state.bandOn) return; e.preventDefault(); var y=evtYFrac(e);
    state.drag=(Math.abs(y-state.band[0])<=Math.abs(y-state.band[1]))?0:1; moveBandDrag(e); }
  function moveBandDrag(e){ if(state.roiMode){ roiMove(e); return; }
    if(state.drag===null) return; e.preventDefault(); var y=evtYFrac(e);
    if(state.drag===0) state.band[0]=Math.min(y,state.band[1]-0.03);
    else state.band[1]=Math.max(y,state.band[0]+0.03);
    renderPaused(); }
  function endBandDrag(){ if(state.roiMode){ roiUp(); return; }
    if(state.drag!==null){ clearSamples(); setStatus('측정 구간을 바꿨습니다 · 다시 재생해 측정하세요'); if(state.source==='file') renderPaused(); } state.drag=null; }
  
  canvas.addEventListener('touchstart',startBandDrag,{passive:false});
  canvas.addEventListener('touchmove',moveBandDrag,{passive:false});
  canvas.addEventListener('touchend',endBandDrag);
  canvas.addEventListener('mousedown',startBandDrag);
  window.addEventListener('mousemove',moveBandDrag);
  window.addEventListener('mouseup',endBandDrag);

  function trimCanvas(cv, bg, padPx){
    try{
      var c=cv.getContext('2d'), w=cv.width, h=cv.height;
      var d=c.getImageData(0,0,w,h).data;
      var minX=w, minY=h, maxX=-1, maxY=-1, tol=8, found=false;
      for(var y=0;y<h;y++){
        for(var x=0;x<w;x++){
          var i=(y*w+x)*4;
          if(d[i+3]<8) continue;
          if(d[i]>=255-tol && d[i+1]>=255-tol && d[i+2]>=255-tol) continue;
          found=true;
          if(x<minX)minX=x; if(x>maxX)maxX=x;
          if(y<minY)minY=y; if(y>maxY)maxY=y;
        }
      }
      if(!found || maxX<minX) return cv;
      var cw=maxX-minX+1, ch=maxY-minY+1;
      if(cw<10||ch<10) return cv;
      var p=padPx||0;
      var out=document.createElement('canvas');
      out.width=cw+p*2; out.height=ch+p*2;
      var o=out.getContext('2d');
      o.fillStyle=bg||'#ffffff'; o.fillRect(0,0,out.width,out.height);
      o.drawImage(cv, minX,minY,cw,ch, p,p,cw,ch);
      return out;
    }catch(e){ return cv; }
  }

  $('fgSave').addEventListener('click',function(){
    if(!state.best){ setStatus('먼저 영상을 재생해 측정값을 만드세요.'); return; }
    
    var P=560, pad=26;
    var imgW=P-pad*2;
    var ar=(state.dispW && state.dispH) ? (state.dispH/state.dispW) : 0.75;
    var imgH=imgW*ar;
    if(imgH>380){ imgH=380; imgW=imgH/ar; }
    var y0=84+imgH+26;
    var lines=[
      ['big', $('fgSW').textContent+' '+$('fgSWU').textContent, '정규화 보폭너비 · 걸음 나이 입력값'],
      ['row', '무릎 무너짐', 'L '+$('fgKneeL').textContent+' ('+$('fgKneeLt').textContent+')   R '+$('fgKneeR').textContent+' ('+$('fgKneeRt').textContent+')'],
      ['row', '발 진행각',  'L '+$('fgFootL').textContent+' ('+$('fgFootLt').textContent+')   R '+$('fgFootR').textContent+' ('+$('fgFootRt').textContent+')'],
      ['row', '다리 정렬',  $('fgLeg').textContent+' ('+$('fgLegt').textContent+')']
    ];
    var y=y0+52;
    for(var i=1;i<lines.length;i++) y+=26;
    
    var kamB=$('fgKamB').textContent, kamMsgEl=$('fgKamMsg');
    var kamText = kamMsgEl ? kamMsgEl.textContent.trim() : '';
    var kamTipEl=$('fgKamTip');
    var kamTip = (kamTipEl && !kamTipEl.classList.contains('fg-hide')) ? kamTipEl.textContent.replace(/^실천\s*·\s*/,'').trim() : '';
    var kamOn = kamB && kamB!=='–' && kamText;
    var kamLines=[], kamTipLines=[];
    var out=document.createElement('canvas'), o=out.getContext('2d');
    
    function wrap(text,maxW,font){
      o.font=font; var words=text.split(' '), out2=[], cur='';
      for(var w=0;w<words.length;w++){
        var t=cur?cur+' '+words[w]:words[w];
        if(o.measureText(t).width>maxW && cur){ out2.push(cur); cur=words[w]; } else cur=t;
      }
      if(cur) out2.push(cur);
      return out2;
    }
    
    out.width=P; out.height=10;
    if(kamOn){
      kamLines=wrap(kamText, P-pad*2-16, '13px Pretendard,sans-serif');
      y+=20+8+kamLines.length*19+10;
      if(kamTip){ kamTipLines=wrap(kamTip, P-pad*2-28, '12.5px Pretendard,sans-serif'); y+=10+kamTipLines.length*18+12; }
    }
    var H=y+46;
    
    out.width=P; out.height=H;
    o=out.getContext('2d');
    o.fillStyle='#fff'; o.fillRect(0,0,P,H);
    o.fillStyle='#1F3864'; o.font='800 23px Pretendard,sans-serif'; o.fillText('정면 보행 분석',pad,44);
    o.fillStyle='#6B7787'; o.font='13px Pretendard,sans-serif'; o.fillText('스크리닝·교육용 추정 · 새로e헬스커뮤니케이션',pad,68);
    try{ o.drawImage(canvas,0,0,canvas.width,canvas.height, pad, 84, imgW, imgH); }catch(e){}

    var cy=y0+34;
    o.fillStyle='#1F3864'; o.font='800 30px "IBM Plex Mono",monospace';
    o.fillText(lines[0][1], pad, cy);
    o.fillStyle='#6B7787'; o.font='12px Pretendard,sans-serif'; o.fillText(lines[0][2], pad, cy+18);
    cy+=46;
    o.font='13px Pretendard,sans-serif';
    for(var i=1;i<lines.length;i++){
      o.fillStyle='#6B7787'; o.fillText(lines[i][1], pad, cy);
      o.fillStyle='#243244'; o.fillText(lines[i][2], pad+82, cy);
      cy+=26;
    }
    if(kamOn){
      cy+=8;
      o.fillStyle='#1F3864'; o.font='800 13px Pretendard,sans-serif';
      o.fillText('무릎 내측 부하 신호 · '+kamB, pad, cy);
      cy+=20;
      o.fillStyle='#243244'; o.font='13px Pretendard,sans-serif';
      for(var k=0;k<kamLines.length;k++){ o.fillText(kamLines[k], pad, cy); cy+=19; }
      if(kamTipLines.length){
        cy+=6;
        var boxH=kamTipLines.length*18+14;
        o.fillStyle='#F6E7D3'; o.beginPath();
        if(o.roundRect) o.roundRect(pad, cy-12, P-pad*2, boxH, 8); else o.rect(pad, cy-12, P-pad*2, boxH);
        o.fill();
        o.fillStyle='#7a4a12'; o.font='12.5px Pretendard,sans-serif';
        for(var k2=0;k2<kamTipLines.length;k2++){ o.fillText(kamTipLines[k2], pad+12, cy+4+k2*18); }
        cy+=boxH;
      }
    }
    o.fillStyle='#6B7787'; o.font='11px Pretendard,sans-serif';
    o.fillText('정상 보폭너비 5~7% · 무릎 5°↓ · 발 진행각 바깥 5~15° 정상 · 의료 진단 아님', pad, H-20);
    out = trimCanvas(out,'#ffffff', 18);
    var a=document.createElement('a'); a.download='정면보행분석.png'; a.href=out.toDataURL('image/png'); a.click();
  });

  window.__fgState = state;
})();

// ==========================================
// 공통 데이터 연동 및 대시보드 복귀 로직
// ==========================================
document.addEventListener("DOMContentLoaded", function() {
    try {
        const userStr = localStorage.getItem('rewalk_current_user');
        if(userStr) {
            const user = JSON.parse(userStr);
            const n = document.getElementById('display-name');
            const m = document.getElementById('display-meta');
            
            if(n) n.textContent = `[정면 보행 분석] ${user.name} 님`;
            if(m) {
                m.textContent = `만 ${user.currentAge}세 / ${user.height}cm`;
                const heightInput = document.getElementById('fgHeight');
                if(heightInput && user.height) {
                    heightInput.value = user.height; 
                    if(window.__fgState) window.__fgState.heightMM = user.height * 10;
                }
            }
        }
    } catch(e) {
        console.log("사용자 정보 로드 실패", e);
    }
});

window.saveToDashboard = function() {
    const s = window.__fgState;
    if(!s || !s.best) {
        if(!confirm("아직 영상을 분석하여 측정한 데이터가 없습니다. 이대로 대시보드로 돌아가시겠습니까?")) return;
    }

    try {
        if(s && s.best) {
            const frontData = { measuredAt: new Date().toISOString(), ...s.best };
            localStorage.setItem('rewalk_temp_front', JSON.stringify(frontData));
        }
        alert("정면 보행 측정 결과가 대시보드에 연동되었습니다!");
        
        if(window.parent) {
            window.parent.postMessage({ action: 'MEASUREMENT_DONE', module: 'front_gait' }, '*');
        }
    } catch(e) {
        alert("데이터 저장 중 오류가 발생했습니다.");
    }
};