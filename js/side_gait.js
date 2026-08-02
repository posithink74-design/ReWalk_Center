

// ==========================================
// 🛡️ 1. 에러 100% 차단용 안전장치
// ==========================================
window.setStatus = function(msg) {
    console.log("상태 업데이트:", msg);
    const statusBox = document.getElementById('statusBox') || document.querySelector('.status-text');
    if (statusBox) statusBox.textContent = msg;
};

window.ensureArray = function(obj, key) {
    if (!obj[key] || !Array.isArray(obj[key])) {
        obj[key] = [];
    }
    return obj[key];
};
window.gaitData = window.gaitData || {};

// ==========================================
// 🚀 2. 현장 테스트용 [오프라인 최우선] AI 엔진
// ==========================================
const pose = new Pose({
    locateFile: (file) => {
        const localPath = `./mediapipe/${file}`;
        console.log(`[RE:WALK] 현장 오프라인 모드 가동: ${localPath}`);
        return localPath; 
    }
});

pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    smoothSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

// ========================================================
// 🚨 3. 분석 기능 100% 이식 공간 (여기가 핵심입니다!)
// 원본 파일(lateral_gait_analysis.txt)의 <script> ... </script> 내용 중,
// [ const pose = new Pose({...}); ] 와 [ pose.setOptions({...}); ] 부분은 
// 바로 위에 이미 선언되어 있으므로 제외하시고, 
// 
// 그 외의 모든 코드 (예: onResults 함수, 각도 계산 수학 공식, 
// 버튼 클릭 이벤트, 캔버스 그리는 로직 등)를 복사해서 
// 이 아래 공간에 한 글자도 빠짐없이 통째로 붙여넣으세요!
// ========================================================

/* 여기에 원본 자바스크립트 기능 코드를 붙여넣기 하세요! */
// ==========================================
// 🛠️ [누락된 화면 요소 강제 연결] 
// 컴퓨터가 비디오와 캔버스를 찾을 수 있게 알려줍니다.
// ==========================================
var video = document.querySelector('video');
var canvas = document.querySelector('canvas');
var ctx = canvas ? canvas.getContext('2d') : null;
var fileInput = document.querySelector('input[type="file"]');
// ==========================================

// ==========================================
// 🛠️ [스토어 저장 함수 에러 방지용 안전장치]
// ==========================================
if (window.ReWalkStore && typeof window.ReWalkStore.save !== 'function') {
    window.ReWalkStore.save = function(data) {
        console.log("✅ 측면 보행 데이터 안전 저장 완료:", data);
        
        // 스토어에 다른 이름의 저장 함수가 있다면 알아서 찾아 실행합니다.
        if (typeof window.ReWalkStore.saveData === 'function') {
            window.ReWalkStore.saveData(data);
        } else if (typeof window.ReWalkStore.saveGaitData === 'function') {
            window.ReWalkStore.saveGaitData('side', data);
        }
    };
}
// ==========================================

(function (root) {
  'use strict';
  function arrMax(a){var m=-Infinity;for(var i=0;i<a.length;i++){if(a[i]>m)m=a[i];}return m;}
  function arrMin(a){var m=Infinity;for(var i=0;i<a.length;i++){if(a[i]<m)m=a[i];}return m;}
  function median(a){var v=a.filter(function(x){return x!=null&&!isNaN(x);}).slice().sort(function(p,q){return p-q;});if(!v.length)return null;var k=Math.floor(v.length/2);return v.length%2?v[k]:(v[k-1]+v[k])/2;}
  function movingAvg(a,win){win=Math.max(1,win|0);if(win<=1)return a.slice();var half=Math.floor(win/2),out=new Array(a.length);for(var i=0;i<a.length;i++){var s=0,c=0;for(var j=i-half;j<=i+half;j++){if(j>=0&&j<a.length){s+=a[j];c++;}}out[i]=s/c;}return out;}
  function trendSign(hx){var d=0;for(var i=1;i<hx.length;i++)d+=(hx[i]-hx[i-1]);if(d===0)d=hx[hx.length-1]-hx[0];return d>=0?1:-1;}
  // 시간 기반 피크 검출: 불응기를 '초' 단위로 적용(프레임 누락에 강함)
  function localMaximaT(sig,times,prom,refrSec){
    var mn=arrMin(sig),cand=[];
    for(var i=1;i<sig.length-1;i++){
      if(sig[i]>=sig[i-1]&&sig[i]>sig[i+1]&&(sig[i]-mn)>=prom) cand.push(i);
    }
    cand.sort(function(a,b){return sig[b]-sig[a];});
    var taken=[];
    for(var k=0;k<cand.length;k++){
      var idx=cand[k], ok=true;
      for(var t=0;t<taken.length;t++){
        if(Math.abs(times[taken[t]]-times[idx]) < refrSec){ ok=false; break; }
      }
      if(ok) taken.push(idx);
    }
    taken.sort(function(a,b){return times[a]-times[b];});
    return taken;
  }

  function measureStepLength(frames,opts){
    opts=opts||{};
    var N=frames.length;
    if(N<12)return{ok:false,reason:'프레임이 부족합니다 (최소 ~12프레임).'};
    var fps=opts.fps||30, smoothWin=opts.smoothWin||5;
    var refr=opts.refractory||Math.max(4,Math.round(fps*0.28));
    var anthro=opts.anthro||0.49;
    var hx=frames.map(function(f){return f.hx;});
    var s=trendSign(hx);
    var sepRaw=frames.map(function(f){return Math.abs(f.lx-f.rx);});
    var sep=movingAvg(sepRaw,smoothWin);
    var times=frames.map(function(f){return f.t;});
    // 절대 임계: 다리길이(신체 크기)에 비례 → 구간을 바꿔도 임계가 흔들리지 않음
    var legMed=median(frames.map(function(f){return f.legPx;}));
    var promAbs = legMed ? legMed*0.10 : null;
    var span=arrMax(sep)-arrMin(sep);
    var prom=(opts.minProminence!=null)?opts.minProminence:(promAbs!=null? Math.min(promAbs, span*0.35) : span*0.25);
    var refrSec = 0.28;   // 착지 최소 간격(초) ≈ 214spm 상한
    var peaks=localMaximaT(sep,times,prom,refrSec);
    if(peaks.length<2)return{ok:false,reason:'걸음 이벤트를 충분히 찾지 못했습니다. 측면·여러 걸음으로 다시 촬영해 보세요.'};
    var legArr=frames.map(function(f){return f.legPx;}).filter(function(v){return v>0;});
    var legMed=median(legArr)||0;
    var cmPerPx=null,legCm=null;
    if(opts.heightCm>0&&legMed>0){legCm=anthro*opts.heightCm;cmPerPx=legCm/legMed;}
    var leftR=[],rightR=[],leftCm=[],rightCm=[],events=[],strikeArr=[];
    for(var p=0;p<peaks.length;p++){
      var i=peaks[p],f=frames[i];
      var stepPx=Math.abs(f.lx-f.rx);
      var leg=(f.legPx>0)?f.legPx:legMed;
      if(!(leg>0))continue;
      var ratio=stepPx/leg;
      var leadLeft=(f.lx-f.rx)*s>0;
      var _hx=leadLeft?f.lx:f.rx,_hy=leadLeft?f.ly:f.ry,_tx=leadLeft?f.lfx:f.rfx,_ty=leadLeft?f.lfy:f.rfy;
      if(_tx!=null&&_ty!=null)strikeArr.push(Math.atan2(_hy-_ty,Math.abs(_tx-_hx))*180/Math.PI);
      var cm=(cmPerPx!=null)?stepPx*cmPerPx:null;
      if(leadLeft){leftR.push(ratio);if(cm!=null)leftCm.push(cm);}
      else{rightR.push(ratio);if(cm!=null)rightCm.push(cm);}
      events.push({frame:i,t:i/fps,side:leadLeft?'L':'R',ratio:ratio,cm:cm});
    }
    var strikeAngle=median(strikeArr);
    // ===== 케이던스 (실제 시각 기반 · fps 무관) =====
    var cadence=null, cadN=0, cadSpan=null, cadCV=null, cadSPS=null, cadIvsKept=null;
    // 피크 시각 정밀화: 이웃 3점 포물선 보간으로 '샘플 사이'의 진짜 정점 시각을 추정
    // (샘플링이 성기거나 불균일해도 피크 시각 오차를 크게 줄임)
    function refinePeakTime(i){
      var t0=times[i];
      if(i<=0 || i>=sep.length-1) return t0;
      var y1=sep[i-1], y2=sep[i], y3=sep[i+1];
      var den=(y1-2*y2+y3);
      if(!isFinite(den) || Math.abs(den)<1e-9) return t0;
      var d=0.5*(y1-y3)/den;                 // −0.5 ~ +0.5 샘플 보정
      if(!isFinite(d)) return t0;
      d=Math.max(-0.5,Math.min(0.5,d));
      var dtL=t0-times[i-1], dtR=times[i+1]-t0;
      return t0 + (d>=0 ? d*dtR : d*dtL);    // 불균일 간격 반영
    }
    var pt=peaks.map(refinePeakTime);
    if(pt.length>=3){
      var ivs=[];
      for(var pi=1;pi<pt.length;pi++){
        var dt=pt[pi]-pt[pi-1];
        if(dt>0.25 && dt<1.5) ivs.push(dt);
      }
      if(ivs.length>=2){
        // 이상 간격 제거: 중앙값의 ±35%를 벗어난 간격(누락·오검출)은 배제
        var m0=median(ivs);
        var kept=ivs.filter(function(d){ return Math.abs(d-m0) <= m0*0.35; });
        if(kept.length<2) kept=ivs;
        var ivMed=median(kept);
        var cval=60/ivMed;
        if(cval>=40 && cval<=240){
          cadence=cval; cadN=kept.length+1; cadIvsKept=kept;
          cadSpan=pt[pt.length-1]-pt[0];
          var mu=kept.reduce(function(a,b){return a+b;},0)/kept.length;
          var sd=Math.sqrt(kept.reduce(function(a,b){return a+(b-mu)*(b-mu);},0)/kept.length);
          cadCV = mu>0 ? (sd/mu*100) : null;   // 걸음 간격 변동계수(%)
          // 걸음당 샘플 수: 케이던스 신뢰도의 핵심 지표(샘플이 적으면 피크 시각 오차↑)
          var spanAll=times[times.length-1]-times[0];
          var effFps = spanAll>0 ? (times.length-1)/spanAll : 0;
          cadSPS = effFps*ivMed;   // 걸음당 샘플 수
        }
      }
    }
    var mL=median(leftR),mR=median(rightR),mLcm=median(leftCm),mRcm=median(rightCm);
    var asym=(mL!=null&&mR!=null)?Math.abs(mL-mR)/((mL+mR)/2)*100:null;
    var strideR=(mL!=null&&mR!=null)?(mL+mR):null;
    var strideCm=(mLcm!=null&&mRcm!=null)?(mLcm+mRcm):null;
    var trunkArr=[];
    for(var ti=0;ti<frames.length;ti++){ var ff=frames[ti]; if(ff.sx==null||ff.sy==null) continue; var vert=ff.hy-ff.sy; if(vert<=0) continue; trunkArr.push(Math.atan2((ff.sx-ff.hx)*s, vert)*180/Math.PI); }
    var trunkAngle=median(trunkArr);
    function pct(a,p){var v=a.filter(function(x){return x!=null&&!isNaN(x);}).slice().sort(function(m,n){return m-n;});if(v.length<3)return null;var idx=(v.length-1)*p,lo=Math.floor(idx),hi=Math.ceil(idx);return lo===hi?v[lo]:v[lo]+(v[hi]-v[lo])*(idx-lo);}
    function romOf(a){var hi=pct(a,0.95),lo=pct(a,0.05);return(hi!=null&&lo!=null)?hi-lo:null;}
    var klA=frames.map(function(f){return f.kl;}), krA=frames.map(function(f){return f.kr;});
    var nKL=klA.filter(function(v){return v!=null&&!isNaN(v);}).length, nKR=krA.filter(function(v){return v!=null&&!isNaN(v);}).length;
    var romL=romOf(klA), romR=romOf(krA);

    // ===== 팔꿈치 각도: 카메라를 향한 쪽 팔만 사용 =====
    // 사람은 진행 방향을 보고 걷는다 → 오른쪽(+x)으로 가면 오른팔이, 왼쪽(-x)으로 가면 왼팔이 카메라 쪽.
    // 왕복(갔다 오기)하면 한 번의 촬영으로 좌우 팔을 모두 정면에서 관측할 수 있다.
    function elbowBySide(){
      var W=3, MINMOVE=4;   // 방향 판정 윈도우(프레임), 최소 이동량(px)
      var accL=[], accR=[];
      for(var i=0;i<frames.length;i++){
        var a=Math.max(0,i-W), b=Math.min(frames.length-1,i+W);
        var d=frames[b].hx-frames[a].hx;
        if(Math.abs(d)<MINMOVE) continue;        // 방향 전환·정지 구간 제외
        if(d>0){ if(frames[i].er!=null) accR.push(frames[i].er); }   // 오른쪽 진행 → 오른팔이 카메라 쪽
        else   { if(frames[i].el!=null) accL.push(frames[i].el); }   // 왼쪽 진행  → 왼팔이 카메라 쪽
      }
      function stat(arr){
        if(arr.length<8) return null;
        var s=arr.slice().sort(function(x,y){return x-y;});
        function pc(p){ var i=(s.length-1)*p, lo=Math.floor(i), hi=Math.ceil(i); return lo===hi?s[lo]:s[lo]+(s[hi]-s[lo])*(i-lo); }
        return { med:+pc(0.5).toFixed(1), min:+pc(0.05).toFixed(1), max:+pc(0.95).toFixed(1),
                 range:+(pc(0.95)-pc(0.05)).toFixed(1), n:arr.length };
      }
      var L=stat(accL), R=stat(accR);
      var out={ left:L, right:R, asym:null, roundTrip:(!!L && !!R) };
      if(L&&R) out.asym=+Math.abs(L.med-R.med).toFixed(1);
      return out;
    }
    var elbow=elbowBySide();
    // 걸음별 ROM 시계열(각 peak~peak 구간의 각도 범위) — 우세 무릎 기준
    var domA = (nKL>=nKR) ? klA : krA;
    var kneeROMSeries = [];
    for(var pk=1; pk<peaks.length; pk++){
      var a0=peaks[pk-1], a1=peaks[pk], seg=[];
      for(var fi=a0; fi<=a1; fi++){ var vv=domA[fi]; if(vv!=null&&!isNaN(vv)) seg.push(vv); }
      if(seg.length>=3){ var hi=Math.max.apply(null,seg), lo=Math.min.apply(null,seg); kneeROMSeries.push(+(hi-lo).toFixed(1)); }
    }
    var kneeROM=null, kneeN=0;
    if(romL!=null&&romR!=null){ if(nKL>=nKR){kneeROM=romL;kneeN=nKL;}else{kneeROM=romR;kneeN=nKR;} }
    else if(romL!=null){kneeROM=romL;kneeN=nKL;}
    else if(romR!=null){kneeROM=romR;kneeN=nKR;}
    return{ok:true,stepCount:peaks.length,progression:s>0?'→ (좌→우)':'← (우→좌)',progressionSign:s,
      leftRatio:mL,rightRatio:mR,leftCm:mLcm,rightCm:mRcm,strideRatio:strideR,strideCm:strideCm,
      asymPct:asym,cadence:cadence,cadN:cadN,cadSpan:cadSpan,cadCV:cadCV,cadSPS:cadSPS,cadIvs:cadIvsKept,kneeSeries:kneeROMSeries,asymSeries:events.map(function(e){return e.ratio;}),trunkAngle:trunkAngle,nTrunk:trunkArr.length,kneeROM:kneeROM,romL:romL,romR:romR,kneeN:kneeN,strikeAngle:strikeAngle,nStrike:strikeArr.length,cmPerPx:cmPerPx,nLeft:leftR.length,nRight:rightR.length,events:events,peaks:peaks,elbow:elbow};
  }
  root.StepCore={measureStepLength:measureStepLength};
})(window);

(function(){
  'use strict';
  var POSE = window.Pose, CONN = window.POSE_CONNECTIONS;
  var L = { LHIP:23, RHIP:24, LKNEE:25, RKNEE:26, LANK:27, RANK:28, LHEEL:29, RHEEL:30, LTOE:31, RTOE:32, LSHO:11, RSHO:12, LELB:13, RELB:14, LWRI:15, RWRI:16 };

  var fileEl=document.getElementById('file'), fileLabel=document.getElementById('fileLabel');
  var heightEl=document.getElementById('height');
  var video=document.getElementById('video'), canvas=document.getElementById('canvas'), ctx=canvas.getContext('2d');
  var stage=document.getElementById('stage');
  var empty=document.getElementById('empty'), hud=document.getElementById('hud');
  var runBtn=document.getElementById('run'), stopBtn=document.getElementById('stop');
  var statusEl=document.getElementById('status');
  var seekEl=document.getElementById('slSeek'), seekFill=document.getElementById('slSeekFill'), seekKnob=document.getElementById('slSeekKnob');

  var pose=null, buf=[], running=false, busy=false, speed=0.25, lastVis=0;
  // 궤적: 배꼽(몸통 비율 추정) · 좌우 발. 정규화 좌표(0~1)로 저장
  var trail={ n:[], l:[], r:[] }, trailOn=true, trailAmp=1;
  var TRAIL_MAX=900, NAVEL_RATIO=0.80;   // 어깨→고관절 80% 지점 ≈ 배꼽
  var camBtn=document.getElementById('cam');
  var source='file', stream=null;   // 'file' | 'cam'
  function inIframe(){ try{ return window.self!==window.top; }catch(e){ return true; } }
  function stopStream(){ if(stream){ try{ stream.getTracks().forEach(function(t){t.stop();}); }catch(e){} stream=null; } if(video.srcObject){ video.srcObject=null; } }

  function setStatus(t,cls){statusEl.textContent=t;statusEl.className='status'+(cls?' '+cls:'');}

  // ---- MediaPipe 초기화 ----
  function initPose(){
    if(pose) return pose;
    if(!POSE){ (function(cb){
      // 로컬 엔진 파일 존재 여부를 확인해 원인을 구분한다
      try{
        fetch('./mediapipe/pose.js',{method:'HEAD'})
          .then(function(r){ cb(r.ok
            ? '엔진 파일은 있으나 초기화에 실패했습니다. 새로고침해 주세요.'
            : '앱에 포함된 엔진 파일(mediapipe 폴더)을 찾지 못했습니다. 배포 시 mediapipe 폴더를 함께 올려주세요.'); })
          .catch(function(){ cb('앱에 포함된 엔진 파일(mediapipe 폴더)을 찾지 못했고, 인터넷도 연결되지 않았습니다.'); });
      }catch(e){ cb('엔진을 불러오지 못했습니다. 네트워크를 확인해 주세요.'); }
    })(function(msg){ setStatus(msg,'err'); }); return null; }
    pose=new POSE({locateFile:function(f){return (window.__MP_BASE||'./mediapipe/')+f;}});
    pose.setOptions({modelComplexity:1,smoothLandmarks:true,enableSegmentation:false,minDetectionConfidence:.5,minTrackingConfidence:.5});
    pose.onResults(onResults);
    return pose;
  }

  // ---- letterbox(contain) 보정: 정규화→CSS 픽셀 ----
  function makeToC(cw,ch){
    var vw=video.videoWidth,vh=video.videoHeight;
    var scale=Math.min(cw/vw,ch/vh), dw=vw*scale, dh=vh*scale, ox=(cw-dw)/2, oy=(ch-dh)/2;
    return function(nx,ny){return [ox+nx*dw, oy+ny*dh];};
  }
  // 역변환: CSS 픽셀 → 영상 정규화 좌표(레터박스 보정)
  function cssToNorm(cx,cy,cw,ch){
    var vw=video.videoWidth,vh=video.videoHeight;
    if(!vw||!vh) return [0,0];
    var scale=Math.min(cw/vw,ch/vh), dw=vw*scale, dh=vh*scale, ox=(cw-dw)/2, oy=(ch-dh)/2;
    return [ Math.max(0,Math.min(1,(cx-ox)/dw)), Math.max(0,Math.min(1,(cy-oy)/dh)) ];
  }

  // ---- 대상자(ROI) 추적·표시 ----
  // 측면은 사람이 가로로 지나가므로 가로 여유를 더 크게 잡는다
  function trackRoi(lm){
    var minX=1,minY=1,maxX=0,maxY=0,n=0;
    lm.forEach(function(q){
      if(q.visibility===undefined || q.visibility>0.3){
        if(q.x<minX)minX=q.x; if(q.x>maxX)maxX=q.x;
        if(q.y<minY)minY=q.y; if(q.y>maxY)maxY=q.y; n++;
      }
    });
    if(n<8){ roiLostTick(); return; }
    var w=maxX-minX, h=maxY-minY;
    if(!(w>0.01 && h>0.05)){ roiLostTick(); return; }
    // 옆모습은 폭이 좁은데 가로 이동이 빠르므로, 가로 여유에 키 기준 최소값을 둔다
    var mx=Math.max(w*0.60, h*0.18), my=h*0.20;
    var nx=Math.max(0,minX-mx), ny=Math.max(0,minY-my);
    roi={ x:nx, y:ny, w:Math.min(1-nx, w+mx*2), h:Math.min(1-ny, h+my*2) };
    roiLost=0;
  }
  function roiLostTick(){
    roiLost++;
    if(roiLost>=30){
      roi=null; _crop=null; roiLost=0; updateRoiUI();
      setStatus('대상자를 놓쳐 화면 전체 인식으로 돌아갔습니다 · 다시 지정해 주세요');
      return;
    }
    if(roiLost%6===0 && roi){
      var ex=roi.w*0.15, ey=roi.h*0.10;
      var nx=Math.max(0,roi.x-ex), ny=Math.max(0,roi.y-ey);
      roi={ x:nx, y:ny, w:Math.min(1-nx,roi.w+ex*2), h:Math.min(1-ny,roi.h+ey*2) };
    }
  }
  function drawRoiBox(cw,ch){
    var r = roiDraft || roi;
    if(!r || !video.videoWidth) return;
    var toC=makeToC(cw,ch);
    var a=toC(r.x,r.y), b=toC(r.x+r.w, r.y+r.h);
    var col = roiDraft ? '#D9842A' : '#2E8B57';
    ctx.save();
    ctx.strokeStyle=col; ctx.lineWidth=2.5; ctx.setLineDash([7,5]);
    ctx.strokeRect(a[0], a[1], b[0]-a[0], b[1]-a[1]);
    ctx.setLineDash([]);
    ctx.font='700 12px Pretendard,sans-serif';
    var label='측정 대상자', tw=ctx.measureText(label).width, ly=Math.max(0,a[1]-18);
    ctx.fillStyle=col; ctx.fillRect(a[0], ly, tw+12, 18);
    ctx.fillStyle='#fff'; ctx.fillText(label, a[0]+6, ly+13);
    ctx.restore();
  }
  // 지정 중 미리보기(영상은 아래 video가 보이므로 박스만 그림)
  function drawRoiPreview(){
    var dpr2=Math.min(window.devicePixelRatio||1,3);
    var cw=canvas.clientWidth, ch=canvas.clientHeight;
    var nw=Math.round(cw*dpr2), nh=Math.round(ch*dpr2);
    if(canvas.width!==nw||canvas.height!==nh){ canvas.width=nw; canvas.height=nh; }
    ctx.setTransform(dpr2,0,0,dpr2,0,0);
    ctx.clearRect(0,0,cw,ch);
    drawRoiBox(cw,ch);
  }

  function dist(ax,ay,bx,by){var dx=ax-bx,dy=ay-by;return Math.sqrt(dx*dx+dy*dy);}
  function kneeFlex(hx,hy,kx,ky,ax,ay){var v1x=hx-kx,v1y=hy-ky,v2x=ax-kx,v2y=ay-ky;var d=(v1x*v2x+v1y*v2y)/(Math.sqrt(v1x*v1x+v1y*v1y)*Math.sqrt(v2x*v2x+v2y*v2y)+1e-9);d=Math.max(-1,Math.min(1,d));return 180-Math.acos(d)*180/Math.PI;}

  // 팔꿈치 굴곡각: 어깨-팔꿈치-손목이 이루는 각(180°=완전히 폄, 작을수록 굽힘)
  function elbowAng(si,ei,wi,lm,W,H){
    var s=lm[si], e=lm[ei], w=lm[wi];
    if(!s||!e||!w) return null;
    if(s.visibility<.4 || e.visibility<.4 || w.visibility<.4) return null;
    var v1x=(s.x-e.x)*W, v1y=(s.y-e.y)*H, v2x=(w.x-e.x)*W, v2y=(w.y-e.y)*H;
    var d=(v1x*v2x+v1y*v2y)/(Math.sqrt(v1x*v1x+v1y*v1y)*Math.sqrt(v2x*v2x+v2y*v2y)+1e-9);
    d=Math.max(-1,Math.min(1,d));
    return Math.acos(d)*180/Math.PI;
  }

  function onResults(res){
    var lm=res.poseLandmarks;
    // ROI로 잘라 보냈다면, 잘린 기준 좌표를 원본 전체 기준으로 되돌림
    if(lm && _crop){
      var c=_crop;
      lm=lm.map(function(q){ return {x:c.x+q.x*c.w, y:c.y+q.y*c.h, z:q.z, visibility:q.visibility}; });
    }
    // S24+ 등 고해상도 대응: 캔버스를 device px로 키우고 CSS px로 그린다
    var dpr=Math.min(window.devicePixelRatio||1, 3);
    var cw=canvas.clientWidth, ch=canvas.clientHeight;
    var needW=Math.round(cw*dpr), needH=Math.round(ch*dpr);
    if(canvas.width!==needW || canvas.height!==needH){ canvas.width=needW; canvas.height=needH; }
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,cw,ch);
    if(roi){ if(lm) trackRoi(lm); else roiLostTick(); }
    drawRoiBox(cw,ch);
    if(!lm){ return; }
    var W=video.videoWidth, H=video.videoHeight;

    // 측정용 픽셀 좌표 (heel 우선, 없으면 ankle)
    var lh=lm[L.LHEEL].visibility>.3?lm[L.LHEEL]:lm[L.LANK];
    var rh=lm[L.RHEEL].visibility>.3?lm[L.RHEEL]:lm[L.RANK];
    var lhip=lm[L.LHIP], rhip=lm[L.RHIP], lank=lm[L.LANK], rank=lm[L.RANK];
    var lsho=lm[L.LSHO], rsho=lm[L.RSHO], shoVis=(lsho.visibility+rsho.visibility)/2;
    var lknee=lm[L.LKNEE], rknee=lm[L.RKNEE];
    var ltoe=lm[L.LTOE], rtoe=lm[L.RTOE];
    var klv=(lhip.visibility>.4&&lknee.visibility>.4&&lank.visibility>.4)?kneeFlex(lhip.x*W,lhip.y*H,lknee.x*W,lknee.y*H,lank.x*W,lank.y*H):null;
    var krv=(rhip.visibility>.4&&rknee.visibility>.4&&rank.visibility>.4)?kneeFlex(rhip.x*W,rhip.y*H,rknee.x*W,rknee.y*H,rank.x*W,rank.y*H):null;
    var vis=(lhip.visibility+rhip.visibility+lank.visibility+rank.visibility)/4;
    var hipNX=(lhip.x+rhip.x)/2;   // 정규화 가로 위치(0~1)
    if(running && vis>.4 && inZone(hipNX)){
      var legL=dist(lhip.x*W,lhip.y*H,lank.x*W,lank.y*H);
      var legR=dist(rhip.x*W,rhip.y*H,rank.x*W,rank.y*H);
      var tNow = (source==='cam') ? (performance.now()/1000) : (video.currentTime||0);
      buf.push({
        t: tNow,
        lx:lh.x*W, ly:lh.y*H, rx:rh.x*W, ry:rh.y*H,
        hx:(lhip.x+rhip.x)/2*W, hy:(lhip.y+rhip.y)/2*H, legPx:(legL+legR)/2,
        sx:shoVis>.3?(lsho.x+rsho.x)/2*W:null, sy:shoVis>.3?(lsho.y+rsho.y)/2*H:null,
        kl:klv, kr:krv,
        lfx:ltoe.visibility>.3?ltoe.x*W:null, lfy:ltoe.visibility>.3?ltoe.y*H:null, rfx:rtoe.visibility>.3?rtoe.x*W:null, rfy:rtoe.visibility>.3?rtoe.y*H:null,
        el:elbowAng(L.LSHO,L.LELB,L.LWRI,lm,W,H), er:elbowAng(L.RSHO,L.RELB,L.RWRI,lm,W,H)
      });
      lastVis=vis;
      // 궤적 수집: 배꼽(어깨→고관절 80%) · 좌우 발(뒤꿈치, 없으면 발목)
      if(shoVis>.3){
        var sxN=(lsho.x+rsho.x)/2, syN=(lsho.y+rsho.y)/2;
        var hxN=(lhip.x+rhip.x)/2, hyN=(lhip.y+rhip.y)/2;
        trail.n.push({ x:sxN+(hxN-sxN)*NAVEL_RATIO, y:syN+(hyN-syN)*NAVEL_RATIO });
        if(trail.n.length>TRAIL_MAX) trail.n.shift();
      }
      // 발 궤적은 발끝(foot index) 기준 · 미검출 시 뒤꿈치→발목 순으로 대체
      var lfoot = (ltoe.visibility>.3) ? ltoe : lh;
      var rfoot = (rtoe.visibility>.3) ? rtoe : rh;
      trail.l.push({x:lfoot.x, y:lfoot.y}); if(trail.l.length>TRAIL_MAX) trail.l.shift();
      trail.r.push({x:rfoot.x, y:rfoot.y}); if(trail.r.length>TRAIL_MAX) trail.r.shift();
    }

    // 오버레이 (다리·발 스켈레톤) — 검정 영상 위 가독성 위해 밝은 브랜드 톤
    var toC=makeToC(cw,ch);
    function seg(a,b,col){var p=toC(lm[a].x,lm[a].y),q=toC(lm[b].x,lm[b].y);ctx.strokeStyle=col;ctx.lineWidth=3.5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(q[0],q[1]);ctx.stroke();}
    function dot(a,col,r){var p=toC(lm[a].x,lm[a].y);ctx.fillStyle=col;ctx.beginPath();ctx.arc(p[0],p[1],r||3,0,6.283);ctx.fill();ctx.lineWidth=1.3;ctx.strokeStyle='rgba(255,255,255,.92)';ctx.stroke();}
    seg(L.LHIP,L.LKNEE,'#F0B36B');seg(L.LKNEE,L.LANK,'#F0B36B');seg(L.LANK,L.LHEEL,'#F0B36B');
    seg(L.RHIP,L.RKNEE,'#7FB0EC');seg(L.RKNEE,L.RANK,'#7FB0EC');seg(L.RANK,L.RHEEL,'#7FB0EC');
    seg(L.LHIP,L.RHIP,'rgba(255,255,255,.55)');
    // 발: 뒤꿈치–발끝 연결 + 두 관절점 모두 표시(발끝은 테두리로 구분)
    if(lm[L.LTOE].visibility>.3) seg(L.LHEEL,L.LTOE,'#F0B36B');
    if(lm[L.RTOE].visibility>.3) seg(L.RHEEL,L.RTOE,'#7FB0EC');
    dot(L.LHEEL,'#F0B36B',3);dot(L.RHEEL,'#7FB0EC',3);
    if(lm[L.LTOE].visibility>.3) dot(L.LTOE,'#FFE0B8',2.6);
    if(lm[L.RTOE].visibility>.3) dot(L.RTOE,'#CFE3FA',2.6);

    // 궤적: 배꼽(초록) · 왼발(앰버) · 오른발(파랑) — 점으로 표시
    if(trailOn){
      // 화면상 일정 간격(gap)마다 하나씩만 찍어, 점들이 뭉쳐 선처럼 보이지 않게 함
      function drawTrailDots(pts,col,r,gap){
        if(!pts || !pts.length) return;
        ctx.save();
        ctx.fillStyle=col;
        ctx.lineWidth=1;
        ctx.strokeStyle='rgba(255,255,255,.5)';   // 겹쳐도 답답하지 않게 반투명 흰 윤곽
        ctx.shadowColor='rgba(0,0,0,.30)'; ctx.shadowBlur=1.5;
        var lx=null, ly=null, g=(gap||7);
        for(var i=0;i<pts.length;i++){
          var p=toC(pts[i].x,pts[i].y);
          if(lx!==null){ var dx=p[0]-lx, dy=p[1]-ly; if(dx*dx+dy*dy < g*g) continue; }
          ctx.beginPath(); ctx.arc(p[0],p[1],r,0,6.283); ctx.fill(); ctx.stroke();
          lx=p[0]; ly=p[1];
        }
        ctx.restore();
      }
      // 높낮이 강조: 완만한 흐름(이동평균)은 그대로 두고, 그로부터 벗어난 상하 변화만 배율 적용
      // (전체를 올리거나 내리지 않으므로 궤적의 위치는 유지되고 출렁임만 또렷해짐)
      function ampPts(pts,k){
        if(k<=1 || pts.length<6) return pts;
        var n=pts.length, W=Math.max(4, Math.round(n/14));
        var pre=new Float64Array(n+1);
        for(var i=0;i<n;i++) pre[i+1]=pre[i]+pts[i].y;
        var out=new Array(n);
        for(var i=0;i<n;i++){
          var a=Math.max(0,i-W), b=Math.min(n-1,i+W);
          var base=(pre[b+1]-pre[a])/(b-a+1);
          out[i]={ x:pts[i].x, y:base+(pts[i].y-base)*k };
        }
        return out;
      }
      drawTrailDots(ampPts(trail.l,trailAmp),'rgba(240,179,107,.45)',2.6,4.5);
      drawTrailDots(ampPts(trail.r,trailAmp),'rgba(127,176,236,.45)',2.6,4.5);
      drawTrailDots(ampPts(trail.n,trailAmp),'rgba(74,222,155,.48)',2.6,4.5);
      // 현재 배꼽 위치
      if(trail.n.length){
        var last=trail.n[trail.n.length-1], q=toC(last.x,last.y);
        ctx.fillStyle='#4ADE9B'; ctx.beginPath(); ctx.arc(q[0],q[1],3,0,6.283); ctx.fill();
        ctx.lineWidth=1.3; ctx.strokeStyle='rgba(255,255,255,.92)'; ctx.stroke();
      }
    }

    hud.style.display='block';
    hud.innerHTML='수집 <b>'+buf.length+'</b> 프레임<br>가시도 <b>'+Math.round(lastVis*100)+'%</b>';
  }

  // ---- 프레임 루프 (완료 = ended 이벤트 + 워치독 이중 안전장치) ----
  var done=false;
  function paintSeek(frac){
    frac=Math.max(0,Math.min(1,frac||0));
    var pct=(frac*100).toFixed(2)+'%';
    if(seekFill) seekFill.style.width=pct;
    if(seekKnob) seekKnob.style.left=pct;
  }
  function updateBar(){
    if(source==='cam'){ paintSeek(Math.min(1,buf.length/150)); return; }
    paintSeek(video.currentTime/(video.duration||1));
  }
  // WASM 메모리 보호: 원본 해상도 대신 축소본을 전송 (memory access out of bounds 방지)
  var _sc=document.createElement('canvas'), _sctx=_sc.getContext('2d',{willReadFrequently:true});
  var SEND_MAX=640; // 긴 변 최대 픽셀
  // 대상자 지정(ROI): 지정 시 그 영역만 잘라 인식 → 다른 사람 오검출 방지
  var roi=null, roiMode=false, roiDraft=null, roiLost=0, _crop=null;
  function frameForPose(){
    var vw=video.videoWidth, vh=video.videoHeight;
    if(!vw||!vh) return null;
    // 자를 영역(ROI 없으면 전체)
    var sx=0, sy=0, sw=vw, sh=vh;
    _crop=null;
    if(roi){
      var rx=Math.max(0,Math.min(1,roi.x)), ry=Math.max(0,Math.min(1,roi.y));
      var cx=Math.round(rx*vw), cy=Math.round(ry*vh);
      var cwid=Math.round(Math.min(1-rx, roi.w)*vw), chei=Math.round(Math.min(1-ry, roi.h)*vh);
      if(cwid>=32 && chei>=32){
        sx=cx; sy=cy; sw=cwid; sh=chei;
        _crop={ x:sx/vw, y:sy/vh, w:sw/vw, h:sh/vh };
      }
    }
    var k=Math.min(1, SEND_MAX/Math.max(sw,sh));
    var w=Math.max(2,Math.round(sw*k)), h=Math.max(2,Math.round(sh*k));
    if(_sc.width!==w||_sc.height!==h){ _sc.width=w; _sc.height=h; }
    _sctx.drawImage(video, sx,sy,sw,sh, 0,0,w,h);
    return _sc;
  }
  var memErrCount=0;
  function pump(){
    if(!running) return;
    if(busy){ schedule(); return; }
    // 완료 워치독: iOS에서 'ended'가 안 뜨는 경우 대비 (버퍼링 중 paused는 종료로 보지 않음)
    if(source!=='cam' && video.duration && isFinite(video.duration) && video.currentTime >= video.duration - 0.05){ finish(); return; }
    var img=frameForPose();
    if(!img){ schedule(); return; }
    busy=true;
    pose.send({image:img}).then(function(){
      busy=false; memErrCount=0; updateBar(); if(running) schedule();
    }).catch(function(e){
      busy=false;
      var msg=(e&&e.message?e.message:String(e));
      if(/memory|out of bounds|abort/i.test(msg)){
        memErrCount++;
        if(memErrCount<=2 && SEND_MAX>320){
          SEND_MAX=Math.max(320, Math.round(SEND_MAX*0.7));
          setStatus('처리 부하를 낮춰 재시도 중… (해상도 '+SEND_MAX+'px)','go');
          if(running) setTimeout(schedule,120); return;
        }
        running=false;
        setStatus('메모리 부족으로 중단됐습니다. 재생속도 0.25x로 낮추거나, 더 짧고 작은 영상으로 다시 시도해 주세요.','err');
        runBtn.style.display='flex'; stopBtn.style.display='none';
        return;
      }
      setStatus('분석 오류: '+msg,'err'); if(running) schedule();
    });
  }
  function schedule(){
    if(!running) return;
    if('requestVideoFrameCallback' in HTMLVideoElement.prototype){ video.requestVideoFrameCallback(function(){ pump(); }); }
    else { requestAnimationFrame(pump); }
  }

  // ---- 시작/종료 ----
  // ===== 분석 중 가로 전체화면 =====
  // 측면 영상은 16:9라 세로 화면에서는 328x184(작음). 가로 전체화면이면 면적이 약 5배가 되어
  // 걸음을 관찰하거나 참가자에게 보여주기에 유리하다. 끝나면 자동으로 빠져나와 결과를 보여준다.
  var fsOn=false, fsLocked=false;
  function fsSupported(){
    var el=document.getElementById('stage');
    return !!(el && (el.requestFullscreen || el.webkitRequestFullscreen));
  }
  function enterStageFS(){
    var el=document.getElementById('stage');
    if(!el || fsOn) return Promise.resolve(false);
    var req = el.requestFullscreen ? el.requestFullscreen.bind(el)
            : (el.webkitRequestFullscreen ? el.webkitRequestFullscreen.bind(el) : null);
    if(!req) return Promise.resolve(false);
    return Promise.resolve(req({navigationUI:'hide'})).then(function(){
      fsOn=true;
      document.body.classList.add('sl-fsmode');
      // 가로 고정 시도(안드로이드 크롬 지원 · 미지원 기기는 그대로 진행)
      try{
        if(screen.orientation && screen.orientation.lock){
          return screen.orientation.lock('landscape').then(function(){ fsLocked=true; }, function(){});
        }
      }catch(e){}
    }).then(function(){ return true; }).catch(function(){ return false; });
  }
  function exitStageFS(){
    document.body.classList.remove('sl-fsmode');
    try{ if(fsLocked && screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); }catch(e){}
    fsLocked=false;
    if(!fsOn) return Promise.resolve();
    fsOn=false;
    var ex = document.exitFullscreen ? document.exitFullscreen.bind(document)
           : (document.webkitExitFullscreen ? document.webkitExitFullscreen.bind(document) : null);
    if(!ex) return Promise.resolve();
    return Promise.resolve(ex()).catch(function(){});
  }
  // 사용자가 직접 전체화면을 빠져나간 경우도 상태를 맞춰줌
  ['fullscreenchange','webkitfullscreenchange'].forEach(function(ev){
    document.addEventListener(ev, function(){
      var active = !!(document.fullscreenElement || document.webkitFullscreenElement);
      if(!active && fsOn){ fsOn=false; document.body.classList.remove('sl-fsmode');
        try{ if(fsLocked && screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); }catch(e){}
        fsLocked=false; }
    });
  });

  function start(){
    if(!initPose()){ return; }
    // 분석 중에는 가로 전체화면으로(버튼 클릭이라는 사용자 동작이 있어야 진입 가능)
    if(fsMode) enterStageFS();
    buf=[]; trail={n:[],l:[],r:[]}; running=true; busy=false; done=false;
    runBtn.style.display='none'; stopBtn.style.display='flex';
    setStatus('분석 중… 영상이 끝나면 결과가 나옵니다.','go');
    video.muted=true;
    if(source==='cam'){
      setStatus('실시간 분석 중… 측면으로 5~6걸음 걸은 뒤 중지를 누르세요.','go');
      var pc=video.play(); if(pc&&pc.catch) pc.catch(function(){});
      schedule();
      return;
    }
    try{ video.currentTime=0; }catch(e){}
    video.playbackRate=speed;
    var pr=video.play();
    if(pr&&pr.then){
      pr.then(function(){ schedule(); }).catch(function(e){
        running=false; runBtn.style.display='flex'; stopBtn.style.display='none';
        setStatus('재생 실패: '+(e&&e.message?e.message:e)+' — 영상을 다시 선택해 보세요.','err');
      });
    } else { schedule(); }
  }
  function stopAnalysis(){ if(done) return; running=false; try{ video.pause(); }catch(e){} finish(); }
  function estimateFps(){
    if(buf.length<4) return 30;
    var t0=buf[0].t, t1=buf[buf.length-1].t;
    if(t0==null||t1==null) return 30;
    var sp=t1-t0;
    if(!(sp>0.2)) return 30;
    var fv=(buf.length-1)/sp;
    return (fv>=5 && fv<=120) ? fv : 30;
  }
  function finish(){
    if(done) return; done=true;
    running=false; try{ video.pause(); }catch(e){}
    exitStageFS();   // 결과는 세로 화면이 읽기 좋으므로 전체화면 해제
    if(source==='cam'){ stopStream(); fileLabel.textContent='📹 영상 선택'; document.getElementById('rotWarn').classList.add('sl-hide'); }
    runBtn.style.display='flex'; stopBtn.style.display='none';
    updateBar();
    if(buf.length<12){ setStatus('수집된 프레임이 적습니다 ('+buf.length+'프레임). 속도 0.25x로, 측면에서 더 길게 다시 시도해 주세요.','err'); return; }
    var h=parseFloat(heightEl.value);
    var res=window.StepCore.measureStepLength(buf,{heightCm:isNaN(h)?0:h, fps:estimateFps()});
    if(!res.ok){ setStatus(res.reason,'err'); return; }
    setStatus('완료 · '+res.stepCount+'걸음 검출','go');
    showResult(res, !isNaN(h)&&h>0);
  }
  video.addEventListener('ended', function(){ if(running) finish(); });

  // ---- 결과 모달 (동적 생성 → body 부착, 인라인 !important, 최대 z-index) ----
  function asymColor(a){ if(a==null) return '#5A6B82'; if(a<5) return '#2E5C9E'; if(a<10) return '#D9842A'; return '#C0392B'; }
  function asymLabel(a){ if(a==null) return '—'; if(a<5) return '대칭 양호'; if(a<10) return '경미한 비대칭'; return '뚜렷한 비대칭'; }
  function trunkGrade(a){ if(a==null) return ['—','#5A6B82']; if(a>=-5&&a<=8) return ['정상','#2E8B57']; if(a>8&&a<=15) return ['경도 전방 기울기','#D9842A']; if(a>15) return ['뚜렷 전방 기울기','#C0392B']; if(a<-5&&a>=-12) return ['경도 후방 기울기','#D9842A']; return ['뚜렷 후방 기울기','#C0392B']; }
  function kneeRomGrade(v){ if(v==null) return ['—','#5A6B82']; if(v>=50) return ['정상','#2E8B57']; if(v>=35) return ['경도 감소','#D9842A']; return ['뚜렷 감소','#C0392B']; }
  function strikeGrade(a){ if(a==null) return ['—','판정 불가','#5A6B82']; if(a>8) return ['뒤꿈치 착지','보행 표준','#2E8B57']; if(a>=-5) return ['중족 착지','양호','#2E8B57']; return ['앞꿈치 착지','보행에선 드묾·참고','#D9842A']; }
  function f2(x){ return x==null?'—':x.toFixed(2); }
  function f0(x){ return x==null?'—':Math.round(x)+' cm'; }

  function showResult(r, hasCm){
    console.log('[ReWalk] 측면 showResult 도달, ReWalkStore=', !!window.ReWalkStore);
    if(window.ReWalkStore){
      var lbl = (r.cadence!=null? '측면보행 케이던스 '+Math.round(r.cadence)+'spm' : '측면보행 분석');
      var payload = {
        cadence: r.cadence!=null?Math.round(r.cadence):null,
        asymPct: r.asymPct!=null?+r.asymPct.toFixed(1):null,
        trunkAngle: r.trunkAngle!=null?+r.trunkAngle.toFixed(1):null,
        kneeROM: r.kneeROM!=null?+r.kneeROM.toFixed(1):null,
        elbowL: (r.elbow&&r.elbow.left)?r.elbow.left.med:null,
        elbowR: (r.elbow&&r.elbow.right)?r.elbow.right.med:null,
        elbowRangeL: (r.elbow&&r.elbow.left)?r.elbow.left.range:null,
        elbowRangeR: (r.elbow&&r.elbow.right)?r.elbow.right.range:null,
        elbowAsym: (r.elbow&&r.elbow.asym!=null)?r.elbow.asym:null
      };
      // 지표별 프레임 시계열(측정 안정성 · 정확도 신뢰용)
      var fbm = {};
      if(r.cadIvs && r.cadIvs.length>=3){
        fbm.cadence = r.cadIvs.map(function(iv){ return Math.round(60/iv); });
      }
      if(r.asymSeries && r.asymSeries.length>=3){
        fbm.asymPct = r.asymSeries.map(function(v){ return +(v).toFixed(2); });
      }
      if(r.kneeSeries && r.kneeSeries.length>=3){
        fbm.kneeROM = r.kneeSeries;   // 걸음별 ROM(이미 걸음 수만큼)
      }
      if(Object.keys(fbm).length) payload.framesByMetric = fbm;
      window.ReWalkStore.save('lateral_gait', lbl, payload);
    }
    var old=document.getElementById('sc-modal'); if(old) old.remove();
    var ov=document.createElement('div'); ov.id='sc-modal';
    ov.setAttribute('style','position:fixed!important;inset:0!important;z-index:2147483647!important;background:rgba(16,28,52,.58)!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:16px!important;backdrop-filter:blur(4px)!important;');
    var box=document.createElement('div');
    box.setAttribute('style','width:100%!important;max-width:440px!important;max-height:90vh!important;overflow:auto!important;background:#ffffff!important;border:1px solid rgba(31,56,100,.16)!important;border-radius:18px!important;padding:22px!important;color:#16243C!important;font-family:Pretendard,-apple-system,sans-serif!important;box-shadow:0 24px 60px rgba(16,28,52,.34)!important;');

    var cardCss='background:#EEF3FA!important;border:1px solid rgba(31,56,100,.10)!important;border-radius:14px!important;padding:14px!important;';
    var monoCss="font-family:'IBM Plex Mono',monospace!important;";

    var h='';
    h+='<div style="font-family:\'IBM Plex Mono\',monospace!important;font-size:11px!important;letter-spacing:.18em!important;color:#D9842A!important;text-transform:uppercase!important;font-weight:600!important;">SAGITTAL GAIT RESULT</div>';
    h+='<div style="font-size:22px!important;font-weight:800!important;margin:5px 0 2px!important;color:#1F3864!important;">측면 보행 분석 결과</div>';
    var relN=r.stepCount||0; var rel=relN>=4?['안정적','#2E8B57']:(relN>=2?['보통 · 더 걸으면 좋음','#D9842A']:['부족 · 재측정 권장','#C0392B']);
    h+='<div style="font-size:12.5px!important;color:#5A6B82!important;margin-bottom:16px!important;line-height:1.6!important;">진행 방향 '+r.progression+' · '+r.stepCount+'걸음 검출 (좌 '+r.nLeft+' / 우 '+r.nRight+')<br>측정 안정성 <b style="color:'+rel[1]+'!important;">'+rel[0]+'</b></div>';

    // 케이던스 — 걸음 나이 입력값
    if(r.cadence!=null){
      h+='<div style="'+cardCss+'margin-bottom:10px!important;border-left:4px solid #1F3864!important;">'
        +'<div style="display:flex!important;align-items:center!important;justify-content:space-between!important;">'
        +'<div><div style="font-size:12.5px!important;color:#5A6B82!important;margin-bottom:3px!important;">케이던스 <span style="font-size:10.5px!important;color:#8595AD!important;">분당 걸음 수</span></div>'
        +'<div style="font-size:12px!important;color:#2E5C9E!important;font-weight:700!important;">걸음 나이 입력값</div></div>'
        +'<div style="text-align:right!important;white-space:nowrap!important;"><span style="'+monoCss+'font-size:34px!important;font-weight:700!important;color:#1F3864!important;">'+Math.round(r.cadence)+'</span>'
        +'<span style="font-size:13px!important;color:#5A6B82!important;margin-left:3px!important;">spm</span></div></div>'
        +'<div style="font-size:11px!important;color:#8595AD!important;margin-top:6px!important;">착지 '+r.cadN+'회 · '+r.cadSpan.toFixed(1)+'초'
        + (r.cadCV!=null ? (' · 간격 편차 '+r.cadCV.toFixed(0)+'%') : '') + '</div>'
        + ((r.cadSPS!=null && r.cadSPS<10)
            ? '<div style="margin-top:8px!important;padding:8px 10px!important;background:#FBEFE0!important;border-radius:8px!important;font-size:11.5px!important;color:#7a4a12!important;line-height:1.55!important;">분석 샘플이 <b>걸음당 '+r.cadSPS.toFixed(1)+'개</b>로 적어 케이던스 오차가 커질 수 있습니다. <b>재생 속도를 0.25x</b>로 낮춰 다시 분석하면 정확해집니다.</div>'
            : '')
        +'</div>';
    } else {
      h+='<div style="'+cardCss+'margin-bottom:10px!important;">'
        +'<div style="font-size:12.5px!important;color:#5A6B82!important;">케이던스 — 걸음 수가 부족합니다. <b>5~6걸음 이상</b> 촬영해 주세요.</div></div>';
    }

    // 좌우 보폭 카드 (좌=앰버, 우=미드블루 — 스켈레톤 색과 일치)
    h+='<div style="display:flex!important;gap:10px!important;margin-bottom:10px!important;">';
    h+='<div style="flex:1!important;'+cardCss+'border-top:3px solid #D9842A!important;">'
      +'<div style="font-size:12.5px!important;color:#B5651D!important;font-weight:700!important;margin-bottom:6px!important;">왼쪽 보폭</div>'
      +'<div style="'+monoCss+'font-size:30px!important;font-weight:600!important;color:#1F3864!important;">×'+f2(r.leftRatio)+'</div>'
      +'<div style="font-size:11px!important;color:#5A6B82!important;">다리길이 대비'+(hasCm?' · '+f0(r.leftCm):'')+'</div></div>';
    h+='<div style="flex:1!important;'+cardCss+'border-top:3px solid #2E5C9E!important;">'
      +'<div style="font-size:12.5px!important;color:#2E5C9E!important;font-weight:700!important;margin-bottom:6px!important;">오른쪽 보폭</div>'
      +'<div style="'+monoCss+'font-size:30px!important;font-weight:600!important;color:#1F3864!important;">×'+f2(r.rightRatio)+'</div>'
      +'<div style="font-size:11px!important;color:#5A6B82!important;">다리길이 대비'+(hasCm?' · '+f0(r.rightCm):'')+'</div></div>';
    h+='</div>';

    // 비대칭
    var ac=asymColor(r.asymPct);
    h+='<div style="'+cardCss+'margin-bottom:10px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;">'
      +'<div><div style="font-size:12.5px!important;color:#5A6B82!important;margin-bottom:4px!important;">좌·우 비대칭</div>'
      +'<div style="font-size:13.5px!important;color:'+ac+'!important;font-weight:700!important;">'+asymLabel(r.asymPct)+'</div></div>'
      +'<div style="'+monoCss+'font-size:32px!important;font-weight:600!important;color:'+ac+'!important;">'+(r.asymPct==null?'—':r.asymPct.toFixed(0)+'%')+'</div></div>';

    // 활보장
    h+='<div style="'+cardCss+'margin-bottom:16px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;">'
      +'<div style="font-size:12.5px!important;color:#5A6B82!important;">활보장 (좌+우)</div>'
      +'<div style="'+monoCss+'font-size:17px!important;color:#1F3864!important;font-weight:600!important;">×'+f2(r.strideRatio)+(hasCm?'  ·  '+f0(r.strideCm):'')+'</div></div>';

    h+='<div style="font-size:12px!important;font-weight:800!important;color:#1F3864!important;margin:8px 2px 8px!important;letter-spacing:0.3px!important;padding-top:10px!important;border-top:1px solid rgba(31,56,100,.12)!important;">자세 · 움직임 (시상면) <span style="font-weight:400!important;font-size:10.5px!important;color:#8595AD!important;">상체 '+r.nTrunk+' · 무릎 '+r.kneeN+' · 착지 '+r.nStrike+' 프레임</span></div>';
    var tg=trunkGrade(r.trunkAngle), tc=tg[1];
    h+='<div style="'+cardCss+'margin-bottom:16px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;">'
      +'<div><div style="font-size:12.5px!important;color:#5A6B82!important;margin-bottom:4px!important;">상체 기울기 <span style="font-size:10.5px!important;">(＋전방/−후방)</span></div>'
      +'<div style="font-size:13.5px!important;color:'+tc+'!important;font-weight:700!important;">'+tg[0]+'</div></div>'
      +'<div style="'+monoCss+'font-size:30px!important;font-weight:600!important;color:'+tc+'!important;">'+(r.trunkAngle==null?'—':((r.trunkAngle>=0?'+':'−')+Math.abs(r.trunkAngle).toFixed(0)+'°'))+'</div></div>';
    var kg=kneeRomGrade(r.kneeROM);
    h+='<div style="'+cardCss+'margin-bottom:16px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;">'
      +'<div><div style="font-size:12.5px!important;color:#5A6B82!important;margin-bottom:4px!important;">무릎 굴곡 ROM <span style="font-size:10.5px!important;color:#8595AD!important;">보행 중 굽힘 범위</span></div>'
      +'<div style="font-size:13.5px!important;color:'+kg[1]+'!important;font-weight:700!important;">'+kg[0]+'</div></div>'
      +'<div style="'+monoCss+'font-size:30px!important;font-weight:600!important;color:'+kg[1]+'!important;">'+(r.kneeROM==null?'—':Math.round(r.kneeROM)+'°')+'</div></div>';
    var sg=strikeGrade(r.strikeAngle);
    h+='<div style="'+cardCss+'margin-bottom:16px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;">'
      +'<div><div style="font-size:12.5px!important;color:#5A6B82!important;margin-bottom:4px!important;">착지 패턴 <span style="font-size:10.5px!important;color:#8595AD!important;">착지 순간 발 각도</span></div>'
      +'<div style="font-size:13.5px!important;color:'+sg[2]+'!important;font-weight:700!important;">'+sg[0]+(sg[1]?' · '+sg[1]:'')+'</div></div>'
      +'<div style="'+monoCss+'font-size:26px!important;font-weight:600!important;color:'+sg[2]+'!important;">'+(r.strikeAngle==null?'—':(r.strikeAngle>=0?'+':'−')+Math.abs(r.strikeAngle).toFixed(0)+'°')+'</div></div>';

    // 팔꿈치 각도 (카메라를 향한 쪽 팔만 사용 · 왕복 촬영 시 좌우 모두)
    var eb=r.elbow;
    if(eb && (eb.left || eb.right)){
      function ebCell(name,st,col){
        if(!st) return '<div style="flex:1!important;text-align:center!important;"><div style="font-size:11.5px!important;color:#8595AD!important;">'+name+'</div>'
          +'<div style="'+monoCss+'font-size:20px!important;color:#8595AD!important;">—</div>'
          +'<div style="font-size:10.5px!important;color:#8595AD!important;">미측정</div></div>';
        return '<div style="flex:1!important;text-align:center!important;"><div style="font-size:11.5px!important;color:#5A6B82!important;">'+name+'</div>'
          +'<div style="'+monoCss+'font-size:22px!important;font-weight:600!important;color:'+col+'!important;">'+Math.round(st.med)+'°</div>'
          +'<div style="font-size:10.5px!important;color:#8595AD!important;">변화폭 '+Math.round(st.range)+'°</div></div>';
      }
      h+='<div style="'+cardCss+'margin-bottom:16px!important;">'
        +'<div style="font-size:12.5px!important;color:#5A6B82!important;margin-bottom:8px!important;">팔꿈치 각도 <span style="font-size:10.5px!important;color:#8595AD!important;">180°=완전히 폄 · 카메라 쪽 팔만 측정</span></div>'
        +'<div style="display:flex!important;gap:8px!important;">'
        + ebCell('왼팔', eb.left, '#D9842A') + ebCell('오른팔', eb.right, '#2E5C9E')
        +'</div>';
      if(eb.asym!=null){
        var ec = eb.asym<10 ? '#2E8B57' : (eb.asym<20 ? '#D9842A' : '#C0392B');
        var et = eb.asym<10 ? '좌우 비슷' : (eb.asym<20 ? '약간 차이' : '뚜렷한 차이');
        h+='<div style="margin-top:10px!important;padding-top:9px!important;border-top:1px solid #E4EAF2!important;display:flex!important;align-items:center!important;justify-content:space-between!important;">'
          +'<span style="font-size:12px!important;color:#5A6B82!important;">좌우 차이</span>'
          +'<span style="'+monoCss+'font-size:16px!important;font-weight:600!important;color:'+ec+'!important;">'+eb.asym.toFixed(1)+'° · '+et+'</span></div>';
      } else {
        h+='<div style="margin-top:9px!important;font-size:11.5px!important;color:#8595AD!important;line-height:1.6!important;">'
          +'한쪽 방향만 촬영되어 한 팔만 측정되었습니다. <b>갔다가 돌아오는 왕복</b>으로 촬영하면 좌우 팔을 모두 비교할 수 있습니다.</div>';
      }
      h+='</div>';
    }
      +'<div style="font-size:13.5px!important;color:'+sg[2]+'!important;font-weight:700!important;">'+sg[0]+(sg[1]?' · '+sg[1]:'')+'</div></div>'
      +'<div style="'+monoCss+'font-size:26px!important;font-weight:600!important;color:'+sg[2]+'!important;">'+(r.strikeAngle==null?'—':(r.strikeAngle>=0?'+':'−')+Math.abs(r.strikeAngle).toFixed(0)+'°')+'</div></div>';
    h+='<div style="font-size:11.5px!important;color:#5A6B82!important;line-height:1.65!important;margin-bottom:16px!important;">'
      +'· 비율(×다리길이)이 가장 신뢰도 높은 지표입니다.'+(hasCm?' cm는 키 기반 <b style="color:#16243C!important">추정치</b>입니다.':' 키를 입력하면 추정 cm도 표시됩니다.')
      +'<br>· 상체 기울기·무릎 ROM·착지 패턴은 시상면 2D 추정이라 참고용입니다. 보행에서는 뒤꿈치 착지가 정상이며, 중족·앞꿈치 착지는 참고 신호입니다.<br>· 본 결과는 <b style="color:#16243C!important">웰니스 스크리닝</b>용이며 의료 진단이 아닙니다.</div>';

    h+='<button id="sc-save" style="width:100%!important;min-height:48px!important;border:1.5px solid #1F3864!important;background:#DCE7F4!important;color:#1F3864!important;font-family:Pretendard,sans-serif!important;font-size:15px!important;font-weight:700!important;border-radius:12px!important;padding:12px!important;cursor:pointer!important;margin-bottom:8px!important;">결과 이미지 저장</button>';
    h+='<button id="sc-close" style="width:100%!important;min-height:50px!important;border:none!important;background:#1F3864!important;color:#ffffff!important;font-family:Pretendard,sans-serif!important;font-size:15.5px!important;font-weight:700!important;border-radius:12px!important;padding:13px!important;cursor:pointer!important;">닫기</button>';

    box.innerHTML=h; ov.appendChild(box); document.body.appendChild(ov);
    ov.addEventListener('click',function(e){ if(e.target===ov) ov.remove(); });
    document.getElementById('sc-close').addEventListener('click',function(){ ov.remove(); });
  
  // 저장 이미지: 내용 경계까지 잘라낸 뒤, 지정한 여백을 '새로 그려서' 확보
  function trimCanvas(cv, bg, padPx){
    try{
      var c=cv.getContext('2d'), w=cv.width, h=cv.height;
      var d=c.getImageData(0,0,w,h).data;
      var minX=w, minY=h, maxX=-1, maxY=-1, tol=8, found=false;
      for(var y=0;y<h;y++){
        for(var x=0;x<w;x++){
          var i=(y*w+x)*4;
          if(d[i+3]<8) continue;                                             // 투명
          if(d[i]>=255-tol && d[i+1]>=255-tol && d[i+2]>=255-tol) continue;  // 흰색
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
      out.width=cw+p*2; out.height=ch+p*2;                                   // ← 여백만큼 캔버스를 키움
      var o=out.getContext('2d');
      o.fillStyle=bg||'#ffffff'; o.fillRect(0,0,out.width,out.height);
      o.drawImage(cv, minX,minY,cw,ch, p,p,cw,ch);                           // 내용을 여백 안쪽에 배치
      return out;
    }catch(e){ return cv; }
  }

  function loadH2C(cb){ if(window.html2canvas) return cb(); var sc=document.createElement('script'); sc.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'; sc.onload=cb; sc.onerror=function(){ alert('저장 모듈을 불러오지 못했습니다. 네트워크를 확인하세요.'); }; document.body.appendChild(sc); }
    document.getElementById('sc-save').addEventListener('click',function(){
      var btns=box.querySelectorAll('button');
      // 캡처 준비: 스크롤 높이 제한 해제(잘림 방지) + 버튼 숨김
      // 캡처용으로 모달 껍데기(테두리·그림자·안쪽 여백)를 걷어내고 내용만 남김
      var keep={maxH:box.style.maxHeight, of:box.style.overflow, sh:box.style.boxShadow,
                bd:box.style.border, br:box.style.borderRadius, pd:box.style.padding};
      function unlock(){
        box.style.setProperty('max-height','none','important');
        box.style.setProperty('overflow','visible','important');
        box.style.setProperty('box-shadow','none','important');
        box.style.setProperty('border','0','important');           // 테두리 제거(여백 정리가 내용 경계를 잡도록)
        box.style.setProperty('border-radius','0','important');
        box.style.setProperty('padding','0','important');          // 여백은 아래 trimCanvas 패딩으로 확보
        for(var bi=0;bi<btns.length;bi++) btns[bi].style.display='none';
        box.scrollTop=0;
      }
      function restore(){
        box.style.setProperty('max-height', keep.maxH || '90vh','important');
        box.style.setProperty('overflow',   keep.of   || 'auto','important');
        box.style.setProperty('box-shadow', keep.sh   || '0 24px 60px rgba(16,28,52,.34)','important');
        box.style.setProperty('border',     keep.bd   || '1px solid rgba(31,56,100,.16)','important');
        box.style.setProperty('border-radius', keep.br || '18px','important');
        box.style.setProperty('padding',    keep.pd   || '22px','important');
        for(var bi=0;bi<btns.length;bi++) btns[bi].style.display='';
      }
      unlock();
      loadH2C(function(){
        // 레이아웃이 반영된 뒤 캡처 (크기는 html2canvas가 직접 측정하도록 맡김)
        requestAnimationFrame(function(){ requestAnimationFrame(function(){
          window.html2canvas(box,{
            backgroundColor:'#ffffff',
            scale:2,
            useCORS:true,
            scrollX:0, scrollY:-window.scrollY
          }).then(function(canvas){
            restore();
            canvas = trimCanvas(canvas,'#ffffff', 52);   // scale=2 → 실제 여백 26px (상하좌우 균일)
            var a=document.createElement('a'); a.download='측면보행분석.png'; a.href=canvas.toDataURL('image/png'); a.click();
          }).catch(function(e){
            restore();
            alert('결과 저장에 실패했습니다. 화면을 캡처해 주세요.');
          });
        }); });
      });
    });
  }

  // ---- 이벤트 ----
  function isVideoFile(f){
    if(f.type && f.type.indexOf('video/')===0) return true;
    return /\.(mp4|mov|m4v|3gp|mkv|avi|webm|mpg|mpeg|wmv)$/i.test(f.name||'');
  }
  fileEl.addEventListener('change',function(){
    var f=fileEl.files&&fileEl.files[0]; if(!f) return;
    if(!isVideoFile(f)){
      setStatus('영상 파일이 아닙니다 · 보행 영상(mp4·mov 등)을 선택해 주세요','err');
      alert('영상 파일이 아닙니다.\n보행 영상(mp4, mov 등)을 선택해 주세요.');
      fileEl.value=''; return;
    }
    fileLabel.textContent=f.name.length>26?f.name.slice(0,24)+'…':f.name;
    stopStream(); source='file'; document.getElementById('rotWarn').classList.add('sl-hide');
    roi=null; _crop=null; roiDraft=null; roiLost=0; setRoiMode(false); updateRoiUI();
    trail={n:[],l:[],r:[]};
    empty.classList.add('sl-gone');
    var url=URL.createObjectURL(f);
    video.src=url; video.load();
    video.onloadeddata=function(){
      empty.classList.add('sl-gone');
      var ar=video.videoWidth/video.videoHeight;
      if(ar>=1){
        // 가로(측면 보행 표준): 16:9 무대, object-fit:contain 이 미세 여백 처리
        stage.style.aspectRatio='16 / 9';
        setStatus('준비 완료 · 가로 영상 인식됨 · 분석을 시작하세요','go');
      } else {
        // 세로 영상: 실제 비율에 자동 대응(과도한 여백 방지), 너무 길면 9:16로 제한
        stage.style.aspectRatio=String(Math.max(ar,0.5625).toFixed(4));
        setStatus('준비 완료 · 세로 영상 — 측면 보행은 가로(landscape) 촬영을 권장합니다','go');
      }
      runBtn.disabled=false;
    };
    video.onerror=function(){ setStatus('영상을 불러오지 못했습니다.','err'); };
  });
  // ---- 재생 컨트롤: 탐색 드래그 · 프레임 이동 · 배속 순환 ----
  var seekDrag=false;
  function seekFrac(e){
    var r=seekEl.getBoundingClientRect();
    var t=(e.touches&&e.touches[0])?e.touches[0]:e;
    return Math.max(0,Math.min(1,(t.clientX-r.left)/r.width));
  }
  function seekTo(e){
    if(source!=='file' || !video.duration) return;
    var f=seekFrac(e); paintSeek(f); video.currentTime=f*video.duration;
  }
  seekEl.addEventListener('touchstart',function(e){ if(running) return; seekDrag=true; e.preventDefault(); seekTo(e); },{passive:false});
  seekEl.addEventListener('touchmove',function(e){ if(seekDrag){ e.preventDefault(); seekTo(e); } },{passive:false});
  seekEl.addEventListener('touchend',function(){ seekDrag=false; });
  seekEl.addEventListener('mousedown',function(e){ if(running) return; seekDrag=true; seekTo(e); });
  window.addEventListener('mousemove',function(e){ if(seekDrag) seekTo(e); });
  window.addEventListener('mouseup',function(){ seekDrag=false; });

  function stepFrame(dt){
    if(source!=='file' || !video.duration || running) return;
    try{ video.pause(); }catch(err){}
    video.currentTime=Math.max(0,Math.min(video.duration, video.currentTime+dt));
  }
  document.getElementById('slBack').addEventListener('click',function(){ stepFrame(-1/30); });
  document.getElementById('slFwd').addEventListener('click',function(){ stepFrame(1/30); });

  var SPEEDS=[{v:0.25,t:'\u00BC'},{v:0.5,t:'\u00BD'},{v:1,t:'1\u00D7'},{v:2,t:'2\u00D7'}];
  var spdIdx=0;   // 기본 0.25x (케이던스 정확도)
  var spdBtn=document.getElementById('slSpeedBtn');
  function applySpeed(){
    speed=SPEEDS[spdIdx].v; spdBtn.textContent=SPEEDS[spdIdx].t;
    video.playbackRate=speed;
    setStatus('재생 배속 '+speed+'x'+(speed>0.5?' · 케이던스 정확도는 0.25x가 유리합니다':''));
  }
  spdBtn.addEventListener('click',function(){ spdIdx=(spdIdx+1)%SPEEDS.length; applySpeed(); });
  // ---- 카메라 ----
  function startCam(){
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){ setStatus('이 브라우저는 카메라를 지원하지 않습니다. 영상 파일을 선택해 주세요.','err'); return; }
    setStatus('카메라 여는 중…','go');
    stopStream();
    function open(c){ return navigator.mediaDevices.getUserMedia(c); }
    setTimeout(function(){
      open({video:{facingMode:{ideal:'environment'}, width:{ideal:960}, height:{ideal:540}}, audio:false})
        .catch(function(){ setStatus('카메라 재시도 중…','go'); return open({video:true, audio:false}); })
        .then(function(st){
          stream=st; source='cam';
          video.removeAttribute('src'); video.srcObject=st; video.muted=true;
          var began=false;
          function begin(){
            if(began) return; began=true;
            empty.classList.add('sl-gone');
            // 카메라는 항상 가로 무대 유지(세로 스트림이어도 고정) → 가로 촬영 유도
            document.getElementById('stage').style.aspectRatio = '16 / 9';
            var pr=video.play(); if(pr&&pr.catch) pr.catch(function(){});
            runBtn.disabled=false;
            fileLabel.textContent='카메라 (실시간)';
            checkOrient();
          }
          video.onloadedmetadata=begin;
          if(video.readyState>=1) begin();
          video.onresize=checkOrient;   // 폰을 돌리면 스트림 해상도가 바뀜
        })
        .catch(function(err){
          var n=(err&&err.name)?err.name:'';
          var msg;
          if(n==='NotReadableError'||n==='AbortError') msg='카메라를 시작하지 못했습니다. 카메라를 쓰는 다른 앱·탭을 닫고 새로고침 후 다시 시도하세요.';
          else if(n==='NotAllowedError'||n==='SecurityError') msg = inIframe()? '카메라 권한이 차단됐습니다(임베드). 영상 파일 선택을 이용해 주세요.' : '카메라 권한이 거부됐습니다. 브라우저에서 허용 후 다시 시도하세요.';
          else if(n==='NotFoundError'||n==='OverconstrainedError') msg='사용 가능한 카메라를 찾지 못했습니다.';
          else msg='카메라를 열 수 없습니다'+(n?(' ('+n+')'):'')+'. 영상 파일 선택을 이용해 주세요.';
          setStatus(msg,'err');
        });
    },250);
  }
  // ---- 세로/가로 감지 ----
  var rotWarn=document.getElementById('rotWarn'), rotDismissed=false;
  function isPortrait(){ return video.videoWidth>0 && video.videoHeight>video.videoWidth; }
  function checkOrient(){
    if(source!=='cam'){ rotWarn.classList.add('sl-hide'); return; }
    if(isPortrait() && !rotDismissed && !running){
      rotWarn.classList.remove('sl-hide');
      setStatus('세로 화면입니다 · 폰을 가로로 돌려 주세요','err');
    } else {
      rotWarn.classList.add('sl-hide');
      if(!running) setStatus(isPortrait()? '세로로 진행합니다 · 분석 시작을 누르세요' : '가로 화면 확인 · 분석 시작을 누르세요','go');
    }
  }
  document.getElementById('rotOk').addEventListener('click',function(){ rotDismissed=true; checkOrient(); });
  window.addEventListener('orientationchange',function(){ setTimeout(checkOrient,400); });
  camBtn.addEventListener('click',function(){ rotDismissed=false; startCam(); });
  // ===== 측정 구간 (가로 위치 기준) =====
  var zone=document.getElementById('zone'), znL=document.getElementById('znL'), znR=document.getElementById('znR');
  var znShL=document.getElementById('znShL'), znShR=document.getElementById('znShR'), zoneBtn=document.getElementById('zoneBtn');
  var zoneOn=false, zx1=0.18, zx2=0.82, zdrag=null;   // 정규화(0~1) 가로 위치

  function paintZone(){
    if(!zoneOn){ zone.classList.add('sl-hide'); return; }
    zone.classList.remove('sl-hide');
    var w=stage.clientWidth;
    znL.style.left=(zx1*w)+'px';
    znR.style.left=(zx2*w)+'px';
    znShL.style.left='0px';  znShL.style.width=(zx1*w)+'px';
    znShR.style.left=(zx2*w)+'px'; znShR.style.width=((1-zx2)*w)+'px';
    document.getElementById('znLbl').style.left=(zx1*w+8)+'px';
  }
  function zoneEvtX(e){
    var rect=stage.getBoundingClientRect();
    var cx=(e.touches? e.touches[0].clientX : e.clientX)-rect.left;
    return Math.max(0, Math.min(1, cx/rect.width));
  }
  function zStart(e){
    if(roiMode){ roiDown(e); return; }
    if(!zoneOn) return;
    var x=zoneEvtX(e);
    zdrag = (Math.abs(x-zx1)<=Math.abs(x-zx2)) ? 'L' : 'R';
    e.preventDefault(); zMove(e);
  }
  function zMove(e){
    if(roiMode){ roiMoveEvt(e); return; }
    if(!zdrag||!zoneOn) return;
    var x=zoneEvtX(e); e.preventDefault();
    if(zdrag==='L') zx1=Math.min(x, zx2-0.08);
    else            zx2=Math.max(x, zx1+0.08);
    zx1=Math.max(0,zx1); zx2=Math.min(1,zx2);
    paintZone();
  }
  function zEnd(){ if(roiMode){ roiUp(); return; } zdrag=null; }

  // ---- ? 도움말 토글 ----
  document.getElementById('sl-root').addEventListener('click',function(e){
    var b=e.target.closest && e.target.closest('.sl-qbtn');
    if(!b) return;
    var box=document.getElementById(b.getAttribute('data-help'));
    if(!box) return;
    var opened=box.classList.toggle('sl-hide')===false;
    b.classList.toggle('on',opened);
  });

  // ---- 높낮이 강조 (실제 크기 → 2배 → 4배 순환) ----
  document.getElementById('trailAmpBtn').addEventListener('click',function(){
    trailAmp = (trailAmp===1) ? 2 : (trailAmp===2 ? 4 : 1);
    this.textContent='높낮이 ×'+trailAmp;
    this.classList.toggle('on', trailAmp>1);
    setStatus(trailAmp===1
      ? '높낮이 실제 크기로 표시합니다'
      : '높낮이를 '+trailAmp+'배로 과장해 보여줍니다 (실제 값 아님 · 관찰용)');
  });

  // ---- 가로 전체화면 설정 ----
  var fsMode = true;
  (function(){
    try{ var v=localStorage.getItem('rewalk_lat_fs'); if(v==='0') fsMode=false; }catch(e){}
    var btn=document.getElementById('fsBtn'), bar=document.getElementById('fsBar');
    if(!fsSupported() && bar){ bar.classList.add('sl-hide'); fsMode=false; return; }  // 미지원 기기는 설정 자체를 감춤
    if(btn){
      btn.textContent = fsMode ? '켜짐' : '꺼짐';
      btn.classList.toggle('on', fsMode);
      btn.addEventListener('click', function(){
        fsMode=!fsMode;
        this.textContent = fsMode ? '켜짐' : '꺼짐';
        this.classList.toggle('on', fsMode);
        try{ localStorage.setItem('rewalk_lat_fs', fsMode?'1':'0'); }catch(e){}
        setStatus(fsMode ? '분석 중 가로 전체화면으로 보여줍니다' : '전체화면 없이 현재 화면에서 분석합니다');
      });
    }
  })();
  (function(){
    var b=document.getElementById('slFsStop');
    if(b) b.addEventListener('click', function(){ stopAnalysis(); });
  })();

  // ---- 궤적 보기 토글 ----
  document.getElementById('trailBtn').addEventListener('click',function(){
    trailOn=!trailOn;
    this.classList.toggle('on',trailOn);
    this.textContent = trailOn ? '궤적 끄기' : '궤적 보기';
    setStatus(trailOn ? '궤적을 표시합니다 · 배꼽·양발이 지나간 길' : '궤적을 숨겼습니다');
  });

  // ---- 대상자 지정(탭 / 박스 드래그) ----
  var roiStart=null;
  var roiBtn=document.getElementById('roiBtn'), roiClearBtn=document.getElementById('roiClear'), roiStateEl=document.getElementById('roiState');
  function roiEvtNorm(e){
    var rect=stage.getBoundingClientRect();
    var t=(e.touches&&e.touches[0])?e.touches[0]:e;
    return cssToNorm(t.clientX-rect.left, t.clientY-rect.top, rect.width, rect.height);
  }
  function setRoiMode(on){
    roiMode=on;
    roiBtn.classList.toggle('on',on);
    roiBtn.textContent = on ? '지정 취소' : '대상자 지정';
    if(on){
      if(!video.paused){ try{ video.pause(); }catch(err){} }
      setStatus('측정할 사람을 탭하거나, 박스로 끌어 지정하세요');
      drawRoiPreview();
    }
  }
  function updateRoiUI(){
    var on=!!roi;
    roiStateEl.textContent = on ? '현재: 지정한 대상자만 인식 중' : '현재: 화면 전체에서 인식';
    roiStateEl.style.color = on ? '#2E8B57' : 'var(--gray)';
    roiClearBtn.classList.toggle('sl-hide', !on);
  }
  function roiDown(e){
    e.preventDefault();
    var n=roiEvtNorm(e);
    roiStart={x:n[0], y:n[1]}; roiDraft=null;
  }
  function roiMoveEvt(e){
    if(!roiStart) return; e.preventDefault();
    var n=roiEvtNorm(e);
    roiDraft={ x:Math.min(roiStart.x,n[0]), y:Math.min(roiStart.y,n[1]),
               w:Math.abs(n[0]-roiStart.x), h:Math.abs(n[1]-roiStart.y) };
    drawRoiPreview();
  }
  function roiUp(){
    if(!roiStart) return;
    var d=roiDraft;
    if(!d || d.w<0.04 || d.h<0.08){        // 거의 안 끌었으면 '탭' → 기본 박스
      var w=0.26, h=0.85;
      d={ x:Math.max(0,Math.min(1-w, roiStart.x-w/2)),
          y:Math.max(0,Math.min(1-h, roiStart.y-h/2)), w:w, h:h };
    }
    roi=d; roiDraft=null; roiStart=null; roiLost=0;
    setRoiMode(false); updateRoiUI(); drawRoiPreview();
    setStatus('대상자를 지정했습니다 · 이 사람만 인식합니다 (분석을 시작하세요)');
  }
  roiBtn.addEventListener('click',function(){ setRoiMode(!roiMode); });
  roiClearBtn.addEventListener('click',function(){
    roi=null; _crop=null; roiDraft=null; roiLost=0;
    setRoiMode(false); updateRoiUI(); drawRoiPreview();
    setStatus('대상자 지정을 해제했습니다 · 화면 전체에서 인식합니다');
  });
  stage.addEventListener('touchstart',zStart,{passive:false});
  stage.addEventListener('touchmove',zMove,{passive:false});
  stage.addEventListener('touchend',zEnd);
  stage.addEventListener('mousedown',zStart);
  window.addEventListener('mousemove',zMove);
  window.addEventListener('mouseup',zEnd);
  window.addEventListener('resize',paintZone);

  zoneBtn.addEventListener('click',function(){
    zoneOn=!zoneOn;
    this.classList.toggle('on',zoneOn);
    this.textContent = zoneOn ? '구간 해제' : '구간 사용';
    paintZone();
  });

  // 현재 프레임의 사람(엉덩이 중심)이 구간 안인지
  function inZone(hipNormX){
    if(!zoneOn) return true;
    return hipNormX>=zx1 && hipNormX<=zx2;
  }

  runBtn.addEventListener('click',start);
  stopBtn.addEventListener('click',stopAnalysis);

  // 시작 시 MediaPipe 로드 점검 (차단 환경 진단)
  if(window.__poseLoadError || !window.Pose){
    (function(cb){
      try{
        fetch('./mediapipe/pose.js',{method:'HEAD'})
          .then(function(r){ cb(r.ok
            ? '엔진 파일은 있으나 초기화에 실패했습니다. 새로고침해 주세요.'
            : '앱에 포함된 엔진 파일(mediapipe 폴더)을 찾지 못했습니다. 배포 시 mediapipe 폴더를 함께 올려주세요.'); })
          .catch(function(){ cb('앱에 포함된 엔진 파일(mediapipe 폴더)을 찾지 못했고, 인터넷도 연결되지 않았습니다.'); });
      }catch(e){ cb('엔진을 불러오지 못했습니다. 네트워크를 확인해 주세요.'); }
    })(function(msg){ setStatus('❌ '+msg,'err'); });
    runBtn.disabled=true;
  }
  // 예기치 못한 오류를 화면에 노출 (모바일 디버깅용)
  window.addEventListener('error',function(ev){ setStatus('오류: '+(ev.message||'알 수 없음'),'err'); });
})();

// ==========================================
// 공통 데이터 연동 및 대시보드 복귀 로직 (측면 보행용 맞춤 수정)
// ==========================================
document.addEventListener("DOMContentLoaded", function() {
    try {
        const userStr = localStorage.getItem('rewalk_current_user');
        if(userStr) {
            const user = JSON.parse(userStr);
            const n = document.getElementById('display-name');
            const m = document.getElementById('display-meta');
            
            if(n) n.textContent = `[측면 보행 분석] ${user.name} 님`;
            if(m) {
                m.textContent = `만 ${user.currentAge}세 / ${user.height}cm`;
                
                // 💡 측면 보행 HTML의 키 입력칸 ID (보통 'height'로 되어 있습니다)
                const heightInput = document.getElementById('height');
                if(heightInput && user.height) {
                    heightInput.value = user.height; 
                    // 측면 보행 로직에 맞게 상태 변수 이름 조정 (필요시)
                    // if(window.__sgState) window.__sgState.heightMM = user.height * 10;
                }
            }
        }
    } catch(e) {
        console.log("사용자 정보 로드 실패", e);
    }
});

window.saveToDashboard = function() {
    // 💡 측면 보행 데이터가 담기는 변수로 변경 (예: gaitData 또는 __sgState 등 프로젝트 환경에 맞게)
    const s = window.gaitData || window.__sgState; 
    
    // 만약 데이터 구조 안에 best 속성이 없다면 if(!s) 로만 체크해도 됩니다.
    if(!s) {
        if(!confirm("아직 영상을 분석하여 측정한 데이터가 없습니다. 이대로 대시보드로 돌아가시겠습니까?")) return;
    }

    try {
        if(s) {
            const sideData = { measuredAt: new Date().toISOString(), ...s };
            // 🚨 가장 중요한 수정: 'front'가 아닌 'side'로 저장해야 정면 데이터와 충돌하지 않습니다!
            localStorage.setItem('rewalk_temp_side', JSON.stringify(sideData));
        }
        
        // 💡 알림 메시지 수정
        alert("측면 보행 측정 결과가 대시보드에 연동되었습니다!");
        
        if(window.parent) {
            // 💡 통신 모듈 이름도 측면 보행으로 수정
            window.parent.postMessage({ action: 'MEASUREMENT_DONE', module: 'side_gait' }, '*');
        }
    } catch(e) {
        alert("데이터 저장 중 오류가 발생했습니다.");
    }
};