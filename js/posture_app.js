(function () {
  'use strict';

  var STORE_KEY = 'pa_sessions_master_v10';
  var VIEWS = { front: { name: '정면', eng: 'Anterior View' }, side: { name: '측면', eng: 'Lateral View' }, back: { name: '후면', eng: 'Posterior View' } };
  
  var EXERCISE_DB = window.EXERCISE_DB || {};

  var st = {
    v: 'front', 
    metrics: {}, 
    rotDeg: { front:0, side:0, back:0 }, 
    plumbX: { front:null, side:null, back:null }, 
    color: '#D9842A',
    slides: { 
        front: { img: null, notes: '', landmarks: null, shapes: [] }, 
        side: { img: null, notes: '', landmarks: null, shapes: [] }, 
        back: { img: null, notes: '', landmarks: null, shapes: [] } 
    }
  };
  window.__paState = st;
  window.__aiMode = 'local'; 
  var cmpView = 'front';

  var G = function(id) { return document.getElementById(id); };
  var cv = G('pa-cv'), ctx = cv.getContext('2d'), imgEl = G('pa-img'), cvi = G('pa-cvi');
  var gridOn = true, gridN = 4, _showLabels = true;
  var _showMoire = false; 
  var _pose = null;

  const userStr = localStorage.getItem('rewalk_current_user');
  let userName = '이름없음';
  if(userStr) {
      try { 
          const userObj = JSON.parse(userStr); userName = userObj.name;
          if(G('display-name')) G('display-name').textContent = `[자세 분석] ${userObj.name} 님`;
          if(G('display-meta')) G('display-meta').textContent = `만 ${userObj.currentAge}세 / ${userObj.height}cm`;
      } catch(e){}
  }

  function init() { 
      renderHistory(); initCmpSelects(); switchView('front'); 
      initChecklistUI();
  }
  
  function syncCv() {
    var r = cvi.getBoundingClientRect(); if(r.width === 0) return;
    cv.width = Math.floor(r.width); cv.height = Math.floor(r.height); drawLines();
  }
  window.addEventListener('resize', syncCv);

  function handlePhoto(e) {
    var f = e.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function(ev) {
      var tmpImg = new Image();
      tmpImg.onload = function() {
        var c = document.createElement('canvas');
        var w = tmpImg.width, h = tmpImg.height, MAX = 800;
        if(w > MAX || h > MAX) { if(w > h) { h = Math.round(h*MAX/w); w=MAX; } else { w = Math.round(w*MAX/h); h=MAX; } }
        c.width = w; c.height = h; c.getContext('2d').drawImage(tmpImg, 0, 0, w, h);
        
        st.slides[st.v].img = c.toDataURL('image/jpeg', 0.8);
        st.slides[st.v].landmarks = null; 
        st.slides[st.v].shapes = [];
        
        imgEl.src = st.slides[st.v].img; imgEl.style.display = 'block';
        if(G('pa-ph')) G('pa-ph').style.display = 'none'; 
        if(G('pa-upbtn-txt')) G('pa-upbtn-txt').textContent = '사진 교체';
        if(G('pa-rotbar')) G('pa-rotbar').style.display = 'flex'; 
        
        st.rotDeg[st.v] = 0; applyRot();

        var aBtn = G('pa-auto-btn');
        if(aBtn) {
            aBtn.disabled = false; aBtn.innerHTML = '관절 자동 감지 (AI)'; aBtn.classList.remove('on');
        }
        if(G('pa-auto-st')) G('pa-auto-st').textContent = '사진 각도를 맞춘 후 AI 버튼을 눌러주세요.';
        syncCv();
      };
      tmpImg.src = ev.target.result;
    };
    r.readAsDataURL(f); e.target.value = '';
  }
  
  if(G('pa-file')) G('pa-file').addEventListener('change', handlePhoto);
  if(G('pa-camfile')) G('pa-camfile').addEventListener('change', handlePhoto);

  function applyRot(){
      var deg = st.rotDeg[st.v] || 0; cvi.style.transform = `rotate(${deg}deg)`;
      if(G('pa-rotval')) G('pa-rotval').textContent = (deg>0?'+':'')+deg+'°'; 
      if(G('pa-rot')) G('pa-rot').value = deg;
  }
  if(G('pa-rot')) G('pa-rot').addEventListener('input', function(){ st.rotDeg[st.v] = parseFloat(this.value); applyRot(); });
  if(G('pa-rot-l')) G('pa-rot-l').addEventListener('click', function(){ st.rotDeg[st.v] = Math.max(-15, (st.rotDeg[st.v]||0) - 0.5); applyRot(); });
  if(G('pa-rot-r')) G('pa-rot-r').addEventListener('click', function(){ st.rotDeg[st.v] = Math.min(15, (st.rotDeg[st.v]||0) + 0.5); applyRot(); });

  var drawerHandle = G('pa-drawer-handle');
  var drawerContainer = G('pa-overlay-drawer');
  var drawerIcon = G('pa-drawer-icon');

  if (drawerHandle && drawerContainer) {
      drawerHandle.addEventListener('click', function(e) {
          e.stopPropagation();
          var isOpen = drawerContainer.classList.toggle('open');
          if (drawerIcon) {
              drawerIcon.textContent = isOpen ? 'chevron_right' : 'chevron_left';
          }
      });
  }

  var gridDensityBtn = G('pa-grid-density-btn');
  if (gridDensityBtn) {
      gridDensityBtn.addEventListener('click', function() {
          var txtEl = this.querySelector('.ot-txt');
          var iconEl = this.querySelector('.material-icons');
          if (!gridOn) { gridOn = true; gridN = 4; } 
          else if (gridN === 4) { gridN = 6; } 
          else if (gridN === 6) { gridN = 8; } 
          else if (gridN === 8) { gridN = 12; } 
          else { gridOn = false; }

          if (gridOn) {
              this.classList.add('on');
              if (txtEl) txtEl.textContent = gridN + '×' + gridN;
              if (iconEl) iconEl.textContent = 'grid_on';
          } else {
              this.classList.remove('on');
              if (txtEl) txtEl.textContent = '격자 OFF';
              if (iconEl) iconEl.textContent = 'grid_off';
          }
          drawLines();
      });
  }

  if(G('pa-lbl-btn')) {
      G('pa-lbl-btn').addEventListener('click', function(){
          _showLabels = !_showLabels; 
          this.classList.toggle('on', _showLabels);
          drawLines();
      });
  }

  var moireBtn = G('pa-moire-btn');
  if(moireBtn) {
      moireBtn.addEventListener('click', function(){
          _showMoire = !_showMoire;
          this.classList.toggle('on', _showMoire);
          drawLines();
      });
  }
  
  function getImgMetrics() {
      if(!imgEl || !imgEl.naturalWidth) return { ox:0, oy:0, rw:cv.width, rh:cv.height };
      var S = Math.min(cv.width / imgEl.naturalWidth, cv.height / imgEl.naturalHeight);
      var RW = imgEl.naturalWidth * S;
      var RH = imgEl.naturalHeight * S;
      var OX = (cv.width - RW) / 2;
      var OY = (cv.height - RH) / 2;
      return { ox: OX, oy: OY, rw: RW, rh: RH };
  }

  var shapeTool = 'edit'; 
  var shapeColor = '#D9842A';
  var _shapeDraw = null;
  var _dragIdx = null; 

  function _shapesArr(){ return st.slides[st.v].shapes || (st.slides[st.v].shapes=[]); }
  function _canvasXY(e){
    var r = cv.getBoundingClientRect();
    var cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    var cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
    return { x: cx * (cv.width / r.width), y: cy * (cv.height / r.height) };
  }

  function _unifiedStart(e) {
      var p = _canvasXY(e);
      var normX = p.x / cv.width, normY = p.y / cv.height;

      if (shapeTool === 'edit') {
          var lm = st.slides[st.v].landmarks; 
          var imM = getImgMetrics();
          
          if (st.plumbX[st.v] != null) {
              var px = imM.ox + st.plumbX[st.v] * imM.rw;
              if (Math.abs(p.x - px) < 25 && p.y < 45) {
                  e.preventDefault(); e.stopPropagation();
                  _dragIdx = 'plumb'; return;
              }
          }

          var best = null, bestD = 30*30;
          if (lm) {
              [0,7,8,11,12,15,16,17,18,21,22,23,24,25,26,27,28].forEach(function(i){
                  if (lm[i] && lm[i].visibility > 0.3) {
                      var dx = (imM.ox + lm[i].x*imM.rw) - p.x, dy = (imM.oy + lm[i].y*imM.rh) - p.y;
                      if (dx*dx + dy*dy < bestD) { bestD = dx*dx + dy*dy; best = i; }
                  }
              });
          }
          if (best !== null) { e.preventDefault(); e.stopPropagation(); _dragIdx = best; return; }

          var shapes = _shapesArr();
          for (var i = shapes.length - 1; i >= 0; i--) {
              var sh = shapes[i];
              var d1 = Math.hypot(normX - sh.x1, normY - sh.y1);
              var d2 = Math.hypot(normX - sh.x2, normY - sh.y2);
              
              if (d1 < 0.05) { _dragIdx = 'shape_p1_' + i; e.preventDefault(); e.stopPropagation(); return; }
              if (d2 < 0.05) { _dragIdx = 'shape_p2_' + i; e.preventDefault(); e.stopPropagation(); return; }

              var sx1 = Math.min(sh.x1, sh.x2), sx2 = Math.max(sh.x1, sh.x2);
              var sy1 = Math.min(sh.y1, sh.y2), sy2 = Math.max(sh.y1, sh.y2);
              var pad = 0.04; 
              if (normX >= sx1 - pad && normX <= sx2 + pad && normY >= sy1 - pad && normY <= sy2 + pad) {
                  _dragIdx = 'shape_move_' + i;
                  window._dragLastPt = { x: normX, y: normY };
                  e.preventDefault(); e.stopPropagation();
                  return;
              }
          }
      } else {
          e.preventDefault(); e.stopPropagation();
          _shapeDraw = { type:shapeTool, color:shapeColor, x1:normX, y1:normY, x2:normX, y2:normY };
      }
  }

  function _unifiedMove(e) {
      if (shapeTool === 'edit') {
          if (_dragIdx === null) return;
          e.preventDefault(); e.stopPropagation();
          var p = _canvasXY(e);
          var normX = p.x / cv.width;
          var normY = p.y / cv.height;
          var imM = getImgMetrics();

          if (_dragIdx === 'plumb') {
              st.plumbX[st.v] = Math.max(0, Math.min(1, (p.x - imM.ox) / imM.rw));
          } else if (typeof _dragIdx === 'string' && _dragIdx.startsWith('shape_')) {
              var parts = _dragIdx.split('_');
              var action = parts[1];
              var sIdx = parseInt(parts[2]);
              var sh = _shapesArr()[sIdx];

              if (action === 'move') {
                  var dx = normX - window._dragLastPt.x;
                  var dy = normY - window._dragLastPt.y;
                  sh.x1 += dx; sh.x2 += dx;
                  sh.y1 += dy; sh.y2 += dy;
                  window._dragLastPt = { x: normX, y: normY };
              } else if (action === 'p1') {
                  sh.x1 = Math.max(0, Math.min(1, normX)); sh.y1 = Math.max(0, Math.min(1, normY));
              } else if (action === 'p2') {
                  sh.x2 = Math.max(0, Math.min(1, normX)); sh.y2 = Math.max(0, Math.min(1, normY));
              }
          } else {
              st.slides[st.v].landmarks[_dragIdx].x = Math.max(0, Math.min(1, (p.x - imM.ox) / imM.rw));
              st.slides[st.v].landmarks[_dragIdx].y = Math.max(0, Math.min(1, (p.y - imM.oy) / imM.rh));
          }
          drawLines(); 
      } else {
          if (!_shapeDraw) return;
          e.preventDefault(); e.stopPropagation();
          var p = _canvasXY(e);
          _shapeDraw.x2 = Math.max(0, Math.min(1, p.x/cv.width));
          _shapeDraw.y2 = Math.max(0, Math.min(1, p.y/cv.height));
          drawLines();
      }
  }

  function _unifiedEnd(e) {
      if (shapeTool === 'edit') { _dragIdx = null; } 
      else {
          if (!_shapeDraw) return;
          var dx = Math.abs(_shapeDraw.x2 - _shapeDraw.x1), dy = Math.abs(_shapeDraw.y2 - _shapeDraw.y1);
          if (dx > 0.02 || dy > 0.02) _shapesArr().push(_shapeDraw);
          _shapeDraw = null; drawLines();
      }
  }

  cv.addEventListener('touchstart', _unifiedStart, {passive:false}); cv.addEventListener('touchmove', _unifiedMove, {passive:false}); cv.addEventListener('touchend', _unifiedEnd);
  cv.addEventListener('mousedown', _unifiedStart); window.addEventListener('mousemove', _unifiedMove); window.addEventListener('mouseup', _unifiedEnd);

  function drawOneShape(c, sh, W, H){
    var x1=sh.x1*W, y1=sh.y1*H, x2=sh.x2*W, y2=sh.y2*H;
    c.save(); c.strokeStyle=sh.color; c.lineWidth=3; c.setLineDash([]); c.lineCap='round';
    if(sh.type==='rect'){
      c.strokeRect(Math.min(x1,x2), Math.min(y1,y2), Math.abs(x2-x1), Math.abs(y2-y1));
    } else if(sh.type==='circle'){
      var cx=(x1+x2)/2, cy=(y1+y2)/2, rx=Math.abs(x2-x1)/2, ry=Math.abs(y2-y1)/2;
      c.beginPath(); c.ellipse(cx,cy,Math.max(rx,4),Math.max(ry,4),0,0,Math.PI*2); c.stroke();
    } else if(sh.type==='arrow'){
      c.beginPath(); c.moveTo(x1,y1); c.lineTo(x2,y2); c.stroke();
      var ang=Math.atan2(y2-y1,x2-x1), hl=Math.max(12, Math.hypot(x2-x1,y2-y1)*0.18);
      c.beginPath(); c.moveTo(x2,y2); c.lineTo(x2-hl*Math.cos(ang-0.4), y2-hl*Math.sin(ang-0.4));
      c.moveTo(x2,y2); c.lineTo(x2-hl*Math.cos(ang+0.4), y2-hl*Math.sin(ang+0.4)); c.stroke();
    }
    c.restore();
  }
  
  function drawShapes(){
    _shapesArr().forEach(function(sh){ drawOneShape(ctx, sh, cv.width, cv.height); });
    if(_shapeDraw) drawOneShape(ctx, _shapeDraw, cv.width, cv.height);
  }

  document.querySelectorAll('#pa-root .pa-sh-btn').forEach(function(b){
    b.addEventListener('click', function(){
      shapeTool = b.getAttribute('data-tool');
      document.querySelectorAll('#pa-root .pa-sh-btn').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      cv.style.cursor = (shapeTool==='edit') ? 'default' : 'crosshair';
      if(G('pa-cvhint')) G('pa-cvhint').textContent = shapeTool==='edit' ? '점/도형 선택하여 이동 또는 크기 조절' : (shapeTool==='circle'?'드래그해 원 그리기':(shapeTool==='arrow'?'드래그해 화살표 그리기':'드래그해 사각형 그리기'));
    });
  });
  document.querySelectorAll('#pa-root .pa-dot').forEach(function(b) {
    b.addEventListener('click', function() {
      shapeColor = b.dataset.c;
      document.querySelectorAll('#pa-root .pa-dot').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
    });
  });
  if(G('pa-undo')) G('pa-undo').addEventListener('click', function() { var a=_shapesArr(); if(a.length) a.pop(); drawLines(); });
  if(G('pa-clear')) G('pa-clear').addEventListener('click', function() { st.slides[st.v].shapes = []; drawLines(); });

  function initChecklistUI(){
    var toggle = G('pa-chk-toggle'), body = G('pa-chk-body'), arrow = G('pa-chk-arrow');
    if (toggle && body) {
      toggle.addEventListener('click', function(){
        var collapsed = body.classList.toggle('pa-chk-collapsed');
        arrow.classList.toggle('open', !collapsed);
      });
    }
    function updateChkState(){
      var sels = document.querySelectorAll('#pa-root .pa-chk-sel'), n = 0;
      sels.forEach(function(s){
        var set = s.value && s.value !== 'none';
        s.classList.toggle('set', set);
        if (set) n++;
      });
      var badge = G('pa-chk-count');
      if (badge) { badge.textContent = n + '개 선택'; badge.classList.toggle('on', n>0); }
    }
    document.querySelectorAll('#pa-root .pa-chk-sel').forEach(function(s){ s.addEventListener('change', updateChkState); });
    window.__updateChkState = updateChkState;
  }

  function switchView(v) {
    try {
        if(st.slides[st.v]) st.slides[st.v].notes = G('pa-notes') ? G('pa-notes').value : '';
        st.v = v;
        document.querySelectorAll('.pa-vtab').forEach(b => b.classList.toggle('on', b.dataset.v === v));
        
        var sl = st.slides[v];
        if(G('pa-vname')) G('pa-vname').textContent = VIEWS[v].name; 
        if(G('pa-notes')) G('pa-notes').value = sl.notes || '';
        
        if (sl.img) {
          imgEl.src = sl.img; imgEl.style.display = 'block'; if(G('pa-ph')) G('pa-ph').style.display = 'none';
          if(G('pa-upbtn-txt')) G('pa-upbtn-txt').textContent = '사진 교체';
          if(G('pa-rotbar')) G('pa-rotbar').style.display = 'flex'; 
          if(G('pa-auto-btn')) G('pa-auto-btn').disabled = false; applyRot();
          if(sl.landmarks) { if(G('pa-auto-btn')){G('pa-auto-btn').classList.add('on'); G('pa-auto-btn').innerHTML = 'AI 감지 완료';} }
          else { if(G('pa-auto-btn')){G('pa-auto-btn').classList.remove('on'); G('pa-auto-btn').innerHTML = '관절 자동 감지 (AI)';} }
        } else {
          var cvbox = document.querySelector('.pa-cvbox');
          if (cvbox) cvbox.style.paddingTop = 'calc(100% * 4/3)'; 
          imgEl.style.display = 'none'; if(G('pa-ph')) G('pa-ph').style.display = 'flex';
          if(G('pa-upbtn-txt')) G('pa-upbtn-txt').textContent = '기기에서 선택';
          if(G('pa-rotbar')) G('pa-rotbar').style.display = 'none'; 
          if(G('pa-auto-btn')) G('pa-auto-btn').disabled = true; 
          if(G('pa-auto-st')) G('pa-auto-st').textContent='사진을 올려주세요.';
        }
        setTimeout(syncCv, 50);
    } catch(e) { console.error("View Switch Error:", e); }
  }
  document.querySelectorAll('.pa-vtab').forEach(b => b.addEventListener('click', function() { switchView(b.dataset.v); }));

  function loadScript(src) {
      return new Promise((resolve, reject) => {
          let s = document.createElement('script'); s.src = src; s.crossOrigin = 'anonymous';
          s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
      });
  }

  if(G('pa-auto-btn')) {
    G('pa-auto-btn').addEventListener('click', async function() {
      if(!st.slides[st.v].img) return;
      var btn = this, stEl = G('pa-auto-st');
      btn.disabled = true; btn.innerHTML = '<span class="pa-spin"></span> AI 로딩 중...';
      
      let finalImage = imgEl;
      if (Math.abs(st.rotDeg[st.v]) > 0.01) {
          stEl.textContent = "회전값을 적용하여 이미지를 보정 중입니다...";
          const iw = imgEl.naturalWidth, ih = imgEl.naturalHeight;
          const rad = st.rotDeg[st.v] * Math.PI / 180;
          const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
          const nw = Math.round(iw * cos + ih * sin), nh = Math.round(iw * sin + ih * cos);
          const rc = document.createElement('canvas'); rc.width = nw; rc.height = nh;
          const rctx = rc.getContext('2d');
          rctx.fillStyle = '#fff'; rctx.fillRect(0, 0, nw, nh);
          rctx.translate(nw / 2, nh / 2); rctx.rotate(rad); rctx.drawImage(imgEl, -iw / 2, -ih / 2);
          const rotatedUrl = rc.toDataURL('image/jpeg', 0.8);
          finalImage = new Image(); finalImage.src = rotatedUrl;
          await new Promise(r => finalImage.onload = r);
          imgEl.src = rotatedUrl; st.slides[st.v].img = rotatedUrl;
          st.rotDeg[st.v] = 0; applyRot(); 
      }

      const CDN_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/';
      const LOCAL_BASE = './mediapipe/';

      async function executeAI() {
          if (!_pose) {
              if (window.__aiMode === 'local') {
                  try {
                      let p1 = window.Pose ? Promise.resolve() : loadScript(LOCAL_BASE + 'pose.js');
                      await p1;
                      _pose = new window.Pose({locateFile: (file) => `${LOCAL_BASE}${file}`});
                  } catch (e) {
                      window.__aiMode = 'cdn';
                  }
              }
              if (window.__aiMode === 'cdn') {
                  stEl.textContent = '온라인 모드로 AI를 다운로드 중입니다...';
                  if (!window.Pose) {
                      try { await loadScript(CDN_BASE + 'pose.js'); } 
                      catch(e) { throw new Error("인터넷 연결 오류입니다."); }
                  }
                  _pose = new window.Pose({locateFile: (file) => `${CDN_BASE}${file}`});
              }
              
              _pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, enableSegmentation: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
              _pose.onResults(onPoseResults);
          }
          
          stEl.textContent = 'AI가 뼈대를 추출하고 있습니다...';
          try {
              const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 8000));
              await Promise.race([_pose.send({image: finalImage}), timeout]);
          } catch (e) {
              if (e.message === "TIMEOUT" && window.__aiMode === 'local') {
                  window.__aiMode = 'cdn'; _pose = null; await executeAI();
              } else {
                  let errMsg = e.message === "TIMEOUT" ? "로딩 지연 (인터넷을 확인하세요)" : e.message;
                  stEl.innerHTML = `<span style="color:#C0392B;">❌ 오류: ${errMsg}</span>`;
                  btn.innerHTML = '관절 자동 감지 (AI)'; btn.disabled = false;
              }
          }
      }
      await executeAI();
    });
  }

  function onPoseResults(results) {
    var btn = G('pa-auto-btn'), stEl = G('pa-auto-st');
    if (!results.poseLandmarks) { stEl.textContent = '❌ 전신을 찾지 못했습니다.'; btn.innerHTML = '관절 자동 감지 (AI)'; btn.disabled = false; return; }
    
    st.slides[st.v].landmarks = results.poseLandmarks.map(lm => ({ x: lm.x, y: lm.y, z: lm.z, visibility: lm.visibility }));
    btn.innerHTML = '<span class="material-icons" style="font-size:16px;">check</span> AI 감지 완료'; btn.classList.add('on'); btn.disabled = false;
    stEl.innerHTML = '감지 완료. <b style="color:#D9842A">관절 점을 직접 끌어서 교정할 수 있습니다.</b>';
    drawLines();
  }

  function drawLines() {
    ctx.clearRect(0,0,cv.width,cv.height);
    var lm = st.slides[st.v].landmarks; 
    var W = cv.width, H = cv.height;
    
    if (gridOn) {
        ctx.save(); ctx.strokeStyle = 'rgba(46,92,158,0.2)'; ctx.lineWidth = 1;
        for (var i = 1; i < gridN; i++) {
            var gx = cv.width * i / gridN, gy = cv.height * i / gridN;
            ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, cv.height); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(cv.width, gy); ctx.stroke();
        }
        ctx.restore();
    }

    if(!lm) { 
        drawShapes(); 
        if (shapeTool === 'edit') { drawShapeHandles(W, H); }
        return; 
    }
    
    var imM = getImgMetrics();
    if (_showMoire) {
        drawStaticVirtualMoire(ctx, lm, { x: imM.ox, y: imM.oy, width: imM.rw, height: imM.rh });
    }
    function pt(i) { 
        return { 
            x: imM.ox + (lm[i].x * imM.rw), 
            y: imM.oy + (lm[i].y * imM.rh), 
            v: lm[i].visibility || 1 
        }; 
    }
    
    ctx.save();
    
    function getTilt(pL, pR) {
        if(pL.v < 0.3 || pR.v < 0.3) return null;
        var dy = pR.y - pL.y; 
        var dx = Math.abs(pR.x - pL.x);
        var rawAng = Math.atan2(Math.abs(dy), dx) * 180 / Math.PI; 
        var absAng = Math.abs(rawAng);

        if (absAng < 1.0) return { text: "수평 양호", ang: absAng, val: 0 };
        if (dy > 0) return { text: "우측 " + absAng.toFixed(1) + "° 하강", ang: absAng, val: absAng };
        return { text: "좌측 " + absAng.toFixed(1) + "° 하강", ang: absAng, val: -absAng };
    }
    
    if (st.v === 'side') {
      var leftVis  = pt(7).v + pt(11).v + pt(23).v + pt(25).v + pt(27).v;
      var rightVis = pt(8).v + pt(12).v + pt(24).v + pt(26).v + pt(28).v;
      var isLeft   = leftVis > rightVis;

      var EAR = isLeft ? 7 : 8, SHOULDER = isLeft ? 11 : 12, HIP = isLeft ? 23 : 24, KNEE = isLeft ? 25 : 26, ANKLE = isLeft ? 27 : 28;
      var sidePts  = [EAR, SHOULDER, HIP, KNEE, ANKLE];

      var pAnkle = pt(ANKLE);
      var _ear0=pt(EAR), _sho0=pt(SHOULDER), _hip0=pt(HIP);
      var _bodyH = (pAnkle.v>0.3 && _ear0.v>0.3) ? Math.abs(pAnkle.y - _ear0.y) : cv.height;
      
      if(st.plumbX.side==null && pAnkle.v>0.3){ st.plumbX.side = (pAnkle.x - imM.ox) / imM.rw; }
      var plumbLineX = imM.ox + (st.plumbX.side!=null ? st.plumbX.side : 0.5) * imM.rw;
      
      if (pAnkle.v > 0.3 || st.plumbX.side!=null) {
        ctx.strokeStyle = 'rgba(217,132,42,0.85)'; ctx.lineWidth = 2.5; ctx.setLineDash([9, 6]);
        ctx.beginPath(); ctx.moveTo(plumbLineX, 0); ctx.lineTo(plumbLineX, cv.height); ctx.stroke();
        ctx.setLineDash([]); ctx.beginPath(); ctx.arc(plumbLineX, 22, 11, 0, Math.PI*2);
        ctx.fillStyle='rgba(217,132,42,0.95)'; ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke();
        ctx.strokeStyle='#fff'; ctx.lineWidth=1.8;
        ctx.beginPath(); ctx.moveTo(plumbLineX-5,22); ctx.lineTo(plumbLineX+5,22); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(plumbLineX-5,22); ctx.lineTo(plumbLineX-2,19); ctx.moveTo(plumbLineX-5,22); ctx.lineTo(plumbLineX-2,25); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(plumbLineX+5,22); ctx.lineTo(plumbLineX+2,19); ctx.moveTo(plumbLineX+5,22); ctx.lineTo(plumbLineX+2,25); ctx.stroke();
        ctx.fillStyle='rgba(217,132,42,0.95)'; ctx.font='700 10px sans-serif'; ctx.textAlign='left';
        ctx.fillText('중력선', plumbLineX + 16, 25); ctx.textAlign='left';
      }
      pAnkle = { x: plumbLineX, y: (pAnkle.v>0.3?pAnkle.y:cv.height), v: 1 };

      ctx.strokeStyle = '#10b981'; ctx.lineWidth = 3; ctx.setLineDash([]);
      ctx.beginPath();
      var isFirst = true;
      sidePts.forEach(function(i) {
        var p = pt(i);
        if (p.v > 0.3) { if (isFirst) { ctx.moveTo(p.x, p.y); isFirst = false; } else { ctx.lineTo(p.x, p.y); } }
      });
      ctx.stroke();

      sidePts.forEach(function(i) {
        var p = pt(i);
        if (p.v > 0.3) {
          ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI*2); ctx.fillStyle = '#2E8B57'; ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke();
          ctx.beginPath(); ctx.arc(p.x,p.y,3,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill();
        }
      });

      st.metrics = st.metrics || {}; st.metrics.side = st.metrics.side || {};
      var _ear=pt(EAR), _sho=pt(SHOULDER), _hip=pt(HIP), _kne=pt(KNEE);

      var faceRight = (_ear.x >= _sho.x);
      function devPct(px){ var raw = px - pAnkle.x; var signed = faceRight ? raw : -raw; return (signed / (_bodyH || 1)) * 100; }
      function devLabel(pctVal){
        var a = Math.abs(pctVal); var dir = pctVal >= 0 ? '앞' : '뒤';
        if (a < 3) return { txt:'정렬 양호', col:'#2E8B57' };
        if (a < 7) return { txt:dir+'으로 '+a.toFixed(1)+'%', col:'#D9842A' };
        return { txt:dir+'으로 '+a.toFixed(1)+'%', col:'#C0392B' };
      }
      
      var devEar = null, devSho = null, devHip = null;
      if (pAnkle.v>0.3) {
        if (_ear.v>0.3) { devEar = devPct(_ear.x); }
        if (_sho.v>0.3) { devSho = devPct(_sho.x); }
        if (_hip.v>0.3) { devHip = devPct(_hip.x); }
        function drawDev(p, pctVal, name, yOff, lineOnly){
          if (pctVal == null) return; var info = devLabel(pctVal);
          ctx.save(); ctx.strokeStyle = info.col; ctx.lineWidth = 1.5; ctx.setLineDash([3,3]);
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(pAnkle.x, p.y); ctx.stroke(); ctx.restore();
          if (lineOnly) return; 
          drawLbl(ctx, Math.min(p.x, pAnkle.x)-4, p.y+yOff, name+' '+info.txt, info.col, 'right');
        }
        drawDev(_ear, devEar, '귀', -4, true); 
        drawDev(_sho, devSho, '어깨', -4, true);
        drawDev(_hip, devHip, '고관절', 25); 
      }
      st.metrics.side.earDev = devEar!=null ? +devEar.toFixed(1) : null;
      st.metrics.side.shoulderDev = devSho!=null ? +devSho.toFixed(1) : null;
      st.metrics.side.hipDev = devHip!=null ? +devHip.toFixed(1) : null;

      if (devEar != null) {
        var d = devEar, ad = Math.abs(d); st.metrics.side.cva = +ad.toFixed(1); 
        var fLbl, fCol;
        if (d >= 7)      { fLbl='거북목 뚜렷 '+ad.toFixed(1)+'%';     fCol='#C0392B'; }
        else if (d >= 4) { fLbl='머리 약간 앞으로 '+ad.toFixed(1)+'%'; fCol='#D9842A'; }
        else if (d > -4) { fLbl='머리 정렬 양호';                      fCol='#2E8B57'; }
        else if (d > -7) { fLbl='머리 약간 뒤로 '+ad.toFixed(1)+'%';   fCol='#D9842A'; }
        else             { fLbl='머리 뒤로 치우침 '+ad.toFixed(1)+'%'; fCol='#C0392B'; }
        st.metrics.side.headVerdict = fLbl;
        drawLbl(ctx, _ear.x+15, _ear.y-25, fLbl, fCol, 'left');
      }
      if (devSho != null) {
        var s2 = devSho, as2 = Math.abs(s2); st.metrics.side.roundedShoulder = +as2.toFixed(1);
        var rLbl, rCol;
        if (s2 >= 6)      { rLbl='라운드숄더 뚜렷 '+as2.toFixed(1)+'%';  rCol='#C0392B'; }
        else if (s2 >= 3) { rLbl='어깨 약간 말림 '+as2.toFixed(1)+'%';   rCol='#D9842A'; }
        else if (s2 > -3) { rLbl='어깨 정렬 양호';                        rCol='#2E8B57'; }
        else if (s2 > -6) { rLbl='어깨 약간 뒤로 '+as2.toFixed(1)+'%';   rCol='#D9842A'; }
        else              { rLbl='어깨 뒤로 치우침 '+as2.toFixed(1)+'%'; rCol='#C0392B'; }
        st.metrics.side.shoulderVerdict = rLbl;
        drawLbl(ctx, _sho.x+15, _sho.y-25, rLbl, rCol, 'left');
      }
      
      if (devHip != null) {
        var hipLbl = Math.abs(devHip)<3 ? '골반 중립' : (devHip>0 ? '전방 편위(스웨이백)' : '후방 편위');
        st.metrics.side.pelvisPos = hipLbl;
      }
      
      if (pAnkle.v>0.3 && _ear.v>0.3 && _sho.v>0.3 && _hip.v>0.3) {
        var _k2 = pt(KNEE); var faceR2 = (_ear.x >= _sho.x);
        var kneeY = (_k2.v>0.3) ? _k2.y : _hip.y + Math.abs(_hip.y-_sho.y)*0.9;
        var ankleY = pAnkle.y;
        var devKnee = (_k2.v>0.3) ? devPct(_k2.x) : null; var devAnkle = 0; 
        
        var segs = [
          { y0: _ear.y-(_sho.y-_ear.y)*0.55, y1: _ear.y+(_sho.y-_ear.y)*0.20, dev: devEar }, 
          { y0: _ear.y+(_sho.y-_ear.y)*0.20, y1: (_sho.y+_hip.y)/2,            dev: devSho }, 
          { y0: (_sho.y+_hip.y)/2,           y1: _hip.y+(kneeY-_hip.y)*0.35,  dev: devHip }, 
          { y0: _hip.y+(kneeY-_hip.y)*0.35,  y1: kneeY+(ankleY-kneeY)*0.30,   dev: devKnee },
          { y0: kneeY+(ankleY-kneeY)*0.30,   y1: ankleY+8,                    dev: devAnkle } 
        ];
        var boxW = (_bodyH||200)*0.26;  
        segs.forEach(function(sg){
          if (sg.dev==null) return;
          var a=Math.abs(sg.dev); var col = a<3 ? 'rgba(46,139,87,0.5)' : (a<7 ? 'rgba(217,132,42,0.55)' : 'rgba(192,57,43,0.55)');
          var offPx=(sg.dev/100)*(_bodyH||200); var boxCx = pAnkle.x + (faceR2?offPx:-offPx);
          var y=Math.min(sg.y0,sg.y1), h2=Math.abs(sg.y1-sg.y0);
          ctx.save(); ctx.strokeStyle=col; ctx.lineWidth=2; ctx.setLineDash([]); ctx.strokeRect(boxCx-boxW/2, y, boxW, h2); ctx.restore();
        });
      }
    } 
    else {
      var NOSE=0, LE=7, RE=8, LS=11, RS=12, LH=23, RH=24, LK=25, RK=26, LA=27, RA=28;
      var ls=pt(LS), rs=pt(RS), lh=pt(LH), rh=pt(RH), lk=pt(LK), rk=pt(RK), la=pt(LA), ra=pt(RA);
      var le=pt(LE), re=pt(RE);
      
      var head;
      if (st.v === 'front') {
          head = pt(NOSE).v > 0.3 ? pt(NOSE) : (le.v > 0.3 && re.v > 0.3 ? {x:(le.x+re.x)/2, y:(le.y+re.y)/2, v:1} : null);
      } else {
          head = (le.v > 0.3 && re.v > 0.3) ? {x:(le.x+re.x)/2, y:(le.y+re.y)/2, v:1} : null;
      }

      var plumbX_canvas;
      if(la.v>0.3 && ra.v>0.3) plumbX_canvas = (la.x + ra.x)/2;
      else if(lk.v>0.3 && rk.v>0.3) plumbX_canvas = (lk.x + rk.x)/2;
      else if(lh.v>0.3 && rh.v>0.3) plumbX_canvas = (lh.x + rh.x)/2;
      else plumbX_canvas = cv.width/2;
      
      if(st.plumbX[st.v]==null) st.plumbX[st.v] = (plumbX_canvas - imM.ox) / imM.rw;
      plumbX_canvas = imM.ox + st.plumbX[st.v] * imM.rw;

      ctx.save();
      ctx.beginPath(); ctx.moveTo(plumbX_canvas,0); ctx.lineTo(plumbX_canvas,cv.height);
      ctx.strokeStyle='rgba(217,132,42,0.6)'; ctx.lineWidth=2; ctx.setLineDash([8,6]); ctx.stroke();
      ctx.setLineDash([]); ctx.beginPath(); ctx.arc(plumbX_canvas, 22, 11, 0, Math.PI*2);
      ctx.fillStyle='rgba(217,132,42,0.95)'; ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke();
      ctx.strokeStyle='#fff'; ctx.lineWidth=1.8;
      ctx.beginPath(); ctx.moveTo(plumbX_canvas-5,22); ctx.lineTo(plumbX_canvas+5,22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(plumbX_canvas-5,22); ctx.lineTo(plumbX_canvas-2,19); ctx.moveTo(plumbX_canvas-5,22); ctx.lineTo(plumbX_canvas-2,25); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(plumbX_canvas+5,22); ctx.lineTo(plumbX_canvas+2,19); ctx.moveTo(plumbX_canvas+5,22); ctx.lineTo(plumbX_canvas+2,25); ctx.stroke();
      ctx.fillStyle='rgba(217,132,42,0.95)'; ctx.font='700 10px sans-serif'; ctx.textAlign='left';
      ctx.fillText('중심선', plumbLineX + 16, 25);
      ctx.restore();

      if (head && ls.v>0.3 && rs.v>0.3) {
          ctx.beginPath(); ctx.moveTo(head.x, head.y); ctx.lineTo(ls.x, ls.y); ctx.lineTo(rs.x, rs.y); ctx.closePath();
          ctx.fillStyle = 'rgba(46, 92, 158, 0.2)'; ctx.fill(); 
          ctx.strokeStyle = '#2E5C9E'; ctx.lineWidth = 2.5; ctx.stroke();
      }

      if (ls.v>0.3 && rs.v>0.3 && lh.v>0.3 && rh.v>0.3) {
          ctx.beginPath(); ctx.moveTo(ls.x, ls.y); ctx.lineTo(rs.x, rs.y); ctx.lineTo(rh.x, rh.y); ctx.lineTo(lh.x, lh.y); ctx.closePath();
          ctx.fillStyle = 'rgba(217, 132, 42, 0.2)'; ctx.fill(); 
          ctx.strokeStyle = '#D9842A'; ctx.lineWidth = 2.5; ctx.stroke();
      }

      if (lh.v>0.3 && rh.v>0.3 && lk.v>0.3 && rk.v>0.3 && la.v>0.3 && ra.v>0.3) {
          ctx.beginPath();
          ctx.moveTo(lh.x, lh.y); ctx.lineTo(rh.x, rh.y);
          ctx.lineTo(rk.x, rk.y); ctx.lineTo(ra.x, ra.y);
          ctx.lineTo(la.x, la.y); ctx.lineTo(lk.x, lk.y);
          ctx.closePath();
          ctx.fillStyle = 'rgba(46, 139, 87, 0.2)'; ctx.fill(); 
          ctx.strokeStyle = '#2E8B57'; ctx.lineWidth = 2.5; ctx.stroke();
      }

      st.metrics[st.v] = st.metrics[st.v] || {};

      if (st.v === 'front' && le.v>0.3 && re.v>0.3) {
          var hTilt = getTilt(le, re);
          if (hTilt) {
              drawLbl(ctx, (le.x+re.x)/2, Math.min(le.y,re.y)-45, '머리: ' + hTilt.text, '#8E44AD');
              st.metrics[st.v].headTilt = hTilt.val;
          }
      }

      var sTilt = getTilt(ls, rs);
      if (sTilt) {
          drawLbl(ctx, (ls.x+rs.x)/2, Math.min(ls.y,rs.y)-30, '어깨: ' + sTilt.text, '#2E5C9E');
          st.metrics[st.v].shoulder = sTilt.val;
      }

      var pTilt = getTilt(lh, rh);
      if (pTilt) {
          drawLbl(ctx, (lh.x+rh.x)/2, Math.max(lh.y,rh.y)+35, '골반: ' + pTilt.text, '#D9842A');
          st.metrics[st.v].pelvis = pTilt.val;
      }

      var kTilt = getTilt(lk, rk);
      if (kTilt) {
          ctx.save(); ctx.beginPath(); ctx.moveTo(lk.x, lk.y); ctx.lineTo(rk.x, rk.y);
          ctx.strokeStyle='#2E8B57'; ctx.lineWidth=2.5; ctx.setLineDash([5,4]); ctx.stroke(); ctx.restore();
          drawLbl(ctx, (lk.x+rk.x)/2, Math.max(lk.y,rk.y)+35, '무릎: ' + kTilt.text, '#2E8B57');
          st.metrics[st.v].kneeLevel = kTilt.val;
      }

      if (st.v === 'back') {
          if (ls.v>0.3 && rs.v>0.3) {
              var sShift = (((ls.x + rs.x)/2) - plumbX_canvas) / (Math.abs(rs.x - ls.x) || 1) * 100;
              var sText = (Math.abs(sShift) <= 4) ? "상체 좌우 균형 양호" : (sShift > 0 ? `상체 우측 쏠림 (${Math.abs(sShift).toFixed(0)}%)` : `상체 좌측 쏠림 (${Math.abs(sShift).toFixed(0)}%)`);
              drawLbl(ctx, (ls.x+rs.x)/2, Math.max(ls.y,rs.y)+30, sText, '#8E44AD');
              st.metrics.back.upperShift = sShift;
          }
          if (lh.v>0.3 && rh.v>0.3) {
              var pShift = (((lh.x + rh.x)/2) - plumbX_canvas) / (Math.abs(rh.x - lh.x) || 1) * 100;
              var pText = (Math.abs(pShift) <= 4) ? "하체 좌우 균형 양호" : (pShift > 0 ? `하체 우측 쏠림 (${Math.abs(pShift).toFixed(0)}%)` : `하체 좌측 쏠림 (${Math.abs(pShift).toFixed(0)}%)`);
              drawLbl(ctx, (lh.x+rh.x)/2, Math.min(lh.y,rh.y)-30, pText, '#8E44AD');
              st.metrics.back.lowerShift = pShift;
          }
      }

      if (st.v === 'front') {
        var LPK=17,RPK=18, LTH=21,RTH=22, LWR=15,RWR=16;
        var _shoW = Math.abs(rs.x - ls.x), _midX = (ls.x + rs.x)/2;
        function armRotPct(thumb, pinky, wrist){
          if(!_shoW) return null;
          if(thumb.v<0.5 || pinky.v<0.5 || wrist.v<0.5) return null; 
          var medial = (_midX - wrist.x) >= 0 ? 1 : -1; 
          return ((thumb.x - pinky.x) * medial / _shoW) * 100; 
        }
        var rotL = armRotPct(pt(LTH), pt(LPK), pt(LWR));
        var rotR = armRotPct(pt(RTH), pt(RPK), pt(RWR));
        var rots = [rotL, rotR].filter(function(v){ return v!=null; });
        if (rots.length) {
          var rotAvg = rots.reduce(function(s,v){return s+v;},0)/rots.length;
          st.metrics[st.v].armRot = +rotAvg.toFixed(1);
          var rLbl2, rCol2;
          if (rotAvg < 6)       { rLbl2='팔 정렬 양호'; rCol2='#2E8B57'; }
          else if (rotAvg < 13) { rLbl2='팔 약간 내회전'; rCol2='#D9842A'; }
          else                  { rLbl2='팔 내회전 뚜렷'; rCol2='#C0392B'; }
          var _wm = pt(LWR).v>=0.5 ? pt(LWR) : pt(RWR);
          if (_wm && _wm.v>=0.5) {
            var _outSide = (_wm.x >= _midX) ? 'left' : 'right';
            var _dx = (_outSide==='left') ? 8 : -8;
            drawLbl(ctx, _wm.x+_dx, _wm.y+35, rLbl2, rCol2, _outSide);
          }
        }

        function kneeOffset(hip, knee, ankle){
          if(hip.v<0.3||knee.v<0.3||ankle.v<0.3) return null;
          var t = (ankle.y-hip.y)!==0 ? (knee.y-hip.y)/(ankle.y-hip.y) : 0.5;
          var lineXatKnee = hip.x + (ankle.x-hip.x)*t;
          return knee.x - lineXatKnee; 
        }
        var offL=kneeOffset(lh, lk, la), offR=kneeOffset(rh, rk, ra);
        if(offL!=null && offR!=null){
          var bodyW = Math.abs(rh.x-lh.x) || 1;
          var midHipX = (lh.x + rh.x)/2;
          function medialPct(hip, off){
            var medial = (midHipX - hip.x) >= 0 ? 1 : -1;
            return (off * medial / bodyW) * 100; 
          }
          var inL = medialPct(lh, offL), inR = medialPct(rh, offR);
          var kneeAlign = (inL+inR)/2; 
          st.metrics[st.v].legAlign = +kneeAlign.toFixed(1);
          
          var a=Math.abs(kneeAlign), alignLbl, alignCol;
          if(a<4){ alignLbl='다리 정렬 양호'; alignCol='#2E8B57'; }
          else if(kneeAlign>=4){ alignLbl='외반슬(X) 경향 '+a.toFixed(0)+'%'; alignCol=(a<8?'#D9842A':'#C0392B'); }
          else { alignLbl='내반슬(O) 경향 '+a.toFixed(0)+'%'; alignCol=(a<8?'#D9842A':'#C0392B'); }
          drawLbl(ctx, (lk.x+rk.x)/2, Math.max(lk.y,rk.y)+65, alignLbl, alignCol);
        }
      }

      var dotColors={0:'#1F3864',7:'#5A6B82',8:'#5A6B82',11:'#2E5C9E',12:'#2E5C9E',23:'#D9842A',24:'#D9842A',25:'#2E8B57',26:'#2E8B57',27:'#D9842A',28:'#D9842A'};
      [NOSE,LE,RE,LS,RS,LH,RH,LK,RK,LA,RA].forEach(function(i){
        if (st.v === 'back' && i === NOSE) return;
        var p=pt(i);
        if(p.v>0.3){
          ctx.beginPath(); ctx.arc(p.x,p.y,8,0,Math.PI*2);
          ctx.fillStyle=dotColors[i]||'#5A6B82'; ctx.fill();
          ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke();
        }
      });
    }
    
    drawShapes(); 
    
    if (shapeTool === 'edit') {
        drawShapeHandles(W, H);
    }
    
    ctx.restore();
  }

  function drawShapeHandles(W, H) {
      ctx.save();
      _shapesArr().forEach(function(sh) {
          ctx.beginPath(); ctx.arc(sh.x1*W, sh.y1*H, 5, 0, Math.PI*2); ctx.fillStyle='#fff'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle=sh.color; ctx.stroke();
          ctx.beginPath(); ctx.arc(sh.x2*W, sh.y2*H, 5, 0, Math.PI*2); ctx.fillStyle='#fff'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle=sh.color; ctx.stroke();
      });
      ctx.restore();
  }

  function drawLbl(c, x, y, txt, color, align) {
    if (!_showLabels) return;
    c.save(); 
    c.font = 'bold 11.5px sans-serif';
    var w = c.measureText(txt).width; 
    var rw = w + 16; 
    var rh = 22; 
    var cx = x;
    
    if (align === 'right') cx = x - (rw/2) - 12; 
    else if (align === 'left') cx = x + (rw/2) + 12;
    
    var bx = cx - rw/2;
    var by = y - rh/2; 
    var r = 6;
    
    c.beginPath(); 
    c.moveTo(bx+r, by); 
    c.arcTo(bx+rw, by, bx+rw, by+rh, r); 
    c.arcTo(bx+rw, by+rh, bx, by+rh, r); 
    c.arcTo(bx, by+rh, bx, by, r); 
    c.arcTo(bx, by, bx+rw, by, r); 
    c.closePath();
    
    c.fillStyle = 'rgba(24,32,46,0.88)'; 
    c.fill(); 
    c.strokeStyle = color||'#fff'; 
    c.lineWidth = 1.5; 
    c.stroke();
    
    c.fillStyle = '#fff'; 
    c.textAlign = 'center'; 
    c.textBaseline = 'middle'; 
    c.fillText(txt, cx, y + 1.5); 
    c.restore();
  }

  if(G('pa-save')) {
      G('pa-save').addEventListener('click', function() {
        st.slides[st.v].notes = G('pa-notes').value;
        var lm = st.slides[st.v].landmarks;
        if(!lm && !st.slides[st.v].img) { alert("사진을 업로드 해주세요."); return; }
        
        var sessions = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
        
        var chk = {}, anyChk = false;
        document.querySelectorAll('#pa-root .pa-chk-sel').forEach(function(sel){
          var key = sel.getAttribute('data-chk'), val = sel.value;
          if (val && val !== 'none') { chk[key] = val; anyChk = true; }
        });

        var c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; var cctx = c.getContext('2d');
        cctx.fillStyle = '#D8E0EA';
        cctx.fillRect(0,0, c.width, c.height);
        
        if(st.slides[st.v].img && imgEl.naturalWidth) { 
            var imM = getImgMetrics();
            cctx.drawImage(imgEl, imM.ox, imM.oy, imM.rw, imM.rh); 
        }
        cctx.drawImage(cv, 0,0);
        
        var todayStr = new Date().toLocaleDateString('ko-KR');

        if (sessions.length > 0) {
            var lastSession = sessions[sessions.length - 1];
            if (lastSession.date !== todayStr) { lastSession.isCompleted = true; }
        }
        
        var currentSession;
        if (sessions.length === 0 || sessions[sessions.length-1].isCompleted) {
            currentSession = { id: Date.now(), label: (sessions.length + 1) + '회차', date: todayStr, views: {}, checklist: {}, isCompleted: false };
        } else { currentSession = sessions[sessions.length-1]; }
        
        currentSession.views[st.v] = { imgData: c.toDataURL('image/jpeg', 0.8), metrics: JSON.parse(JSON.stringify(st.metrics)), notes: st.slides[st.v].notes };
        if(anyChk) currentSession.checklist = chk;

        if(!sessions.find(x => x.id === currentSession.id)) { sessions.push(currentSession); } 
        else { sessions[sessions.findIndex(x => x.id === currentSession.id)] = currentSession; }

        localStorage.setItem(STORE_KEY, JSON.stringify(sessions));
        alert(`[${currentSession.label}] ${VIEWS[st.v].name} 데이터가 성공적으로 저장되었습니다.`);
        renderHistory(); initCmpSelects();
      });
  }

  if(G('pa-new-session-btn')) {
      G('pa-new-session-btn').addEventListener('click', function(){
        var sessions = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
        if (sessions.length > 0) {
            if (sessions[sessions.length - 1].isCompleted) {
                alert("이미 마감된 상태입니다. [분석] 탭에서 새 사진을 분석하고 저장하면 자동으로 다음 회차가 생성됩니다."); return;
            }
            if(!confirm("현재 측정 중인 회차를 마감하고, 새로운 측정을 시작하시겠습니까?")) return;
            
            sessions[sessions.length - 1].isCompleted = true;
            localStorage.setItem(STORE_KEY, JSON.stringify(sessions));
            alert("새로운 회차 측정 준비가 완료되었습니다.");
            
            st.slides = { front: { img: null, notes: '', landmarks: null, shapes: [] }, side: { img: null, notes: '', landmarks: null, shapes: [] }, back: { img: null, notes: '', landmarks: null, shapes: [] } };
            imgEl.style.display = 'none'; G('pa-ph').style.display = 'flex';
            ctx.clearRect(0,0,cv.width,cv.height);
            
            renderHistory(); initCmpSelects();
            document.querySelectorAll('#pa-root .pa-nav-btn')[0].click();
        } else { alert("저장된 기록이 없습니다. [분석] 탭에서 첫 측정을 먼저 진행해주세요."); }
      });
  }

  function renderHistory() {
      var sessions = JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); var el = G('pa-slist');
      if(sessions.length === 0) { el.innerHTML = '<div style="text-align:center; padding:30px; color:#8595AD;">저장된 기록이 없습니다.</div>'; return; }
      var html = '';
      sessions.slice().reverse().forEach(function(s){
          var vc = Object.keys(s.views).length;
          html += `<div class="pa-sitem">
                      <div class="pa-sttl">${s.label} (${vc}/3 뷰 저장됨)</div>
                      <div class="pa-sdate">${s.date}</div>
                      <div style="display:flex; gap:8px; margin-top:10px;">
                          <button class="pa-sbtn" style="flex:1; background:#2E8B57; color:#fff; border:none; padding:8px; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;" onclick="printSingleReport(${s.id})">이 회차 PDF 출력</button>
                          <button class="pa-sbtn del" style="flex:0 0 80px; border:none; padding:8px; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; background:#fef2f2; color:#D9842A;" onclick="deleteSession(${s.id})">삭제</button>
                      </div>
                   </div>`;
      });
      el.innerHTML = html;
  }
  
  window.deleteSession = function(id) {
      if(!confirm("정말 삭제하시겠습니까?")) return;
      var sessions = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      localStorage.setItem(STORE_KEY, JSON.stringify(sessions.filter(s => s.id !== id))); renderHistory(); initCmpSelects();
  };

  window.printSingleReport = function(id) {
      var sessions = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      var s = sessions.find(x => x.id === id);
      if(!s) return;

      function formatTilt(val) {
          if (val == null) return null;
          if (Math.abs(val) < 1.0) return "수평 양호";
          return val > 0 ? "우측 " + Math.abs(val).toFixed(1) + "° 하강" : "좌측 " + Math.abs(val).toFixed(1) + "° 하강";
      }
      function formatShift(val) {
          if (val == null) return null;
          if (Math.abs(val) <= 4) return "균형 양호";
          return val > 0 ? "우측 " + Math.abs(val).toFixed(0) + "% 쏠림" : "좌측 " + Math.abs(val).toFixed(0) + "% 쏠림";
      }

      function getMetricsHtml(v) {
          var vd = s.views[v];
          if(!vd || !vd.metrics) return '<div style="font-size:11px; color:#8595AD;">측정 수치 없음</div>';
          var m = vd.metrics[v] || vd.metrics.side || {};
          var items = [];
          
          if (v === 'side') {
              if (m.cva !== undefined && m.cva !== null) items.push(`<b>거북목/CVA:</b> ${m.cva}% (${m.headVerdict||''})`);
              if (m.roundedShoulder !== undefined && m.roundedShoulder !== null) items.push(`<b>라운드숄더:</b> ${m.roundedShoulder}% (${m.shoulderVerdict||''})`);
              if (m.pelvisPos) items.push(`<b>골반위치:</b> ${m.pelvisPos}`);
          } else {
              if (v === 'front' && m.headTilt !== undefined && m.headTilt !== null) items.push(`<b>머리 굴곡:</b> ${formatTilt(m.headTilt)}`);
              if (m.shoulder !== undefined && m.shoulder !== null) items.push(`<b>어깨 기울기:</b> ${formatTilt(m.shoulder)}`);
              if (m.pelvis !== undefined && m.pelvis !== null) items.push(`<b>골반 기울기:</b> ${formatTilt(m.pelvis)}`);
              if (m.kneeLevel !== undefined && m.kneeLevel !== null) items.push(`<b>무릎 수평:</b> ${formatTilt(m.kneeLevel)}`);
              
              if (v === 'front') {
                  if (m.armRot !== undefined && m.armRot !== null) items.push(`<b>팔 회전:</b> ${m.armRot}%`);
                  if (m.legAlign !== undefined && m.legAlign !== null) items.push(`<b>다리 정렬:</b> ${m.legAlign}%`);
              }
              if (v === 'back') {
                  if (m.upperShift !== undefined && m.upperShift !== null) items.push(`<b>상체 중심:</b> ${formatShift(m.upperShift)}`);
                  if (m.lowerShift !== undefined && m.lowerShift !== null) items.push(`<b>하체 중심:</b> ${formatShift(m.lowerShift)}`);
              }
          }
          if (items.length === 0) return '<div style="font-size:11px; color:#8595AD;">측정 수치 없음</div>';
          return items.map(it => `<div style="font-size:11px; color:#1E293B; margin-bottom:2px; line-height:1.3;">• ${it}</div>`).join('');
      }

      var getImg = function(v) { return s.views[v] ? `<img src="${s.views[v].imgData}" style="max-width:100%; max-height:100%; object-fit:contain;">` : `<div style="color:#94A3B8; font-size:13px; text-align:center; padding: 40px 0;">미측정</div>`; };
      var getNotes = function(v) { return s.views[v] && s.views[v].notes ? s.views[v].notes : '특이사항 없음'; };

      var chkTextMap = { roundedShoulder: '라운드숄더', thoracicKyphosis: '흉추후만', lumbarLordosis: '요추전만', anteriorPelvicTilt: '골반 전방경사', posteriorPelvicTilt: '골반 후방경사', swayBack: '스웨이백', none: '해당없음', mild: '경도', moderate: '중등도', severe: '심함', present: '관찰됨' };
      var chkHtml = '';
      if (s.checklist && Object.keys(s.checklist).length > 0) {
          var chkItems = Object.keys(s.checklist).map(k => `<span style="background:#EEF3FA; border:1px solid #CBD5E1; color:#1F3864; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:700;">${chkTextMap[k] || k}: ${chkTextMap[s.checklist[k]] || s.checklist[k]}</span>`).join(' ');
          chkHtml = `<div style="margin-top:10px; padding:8px 12px; background:#F8FAFC; border-radius:8px; border:1px solid #E2E8F0;"><div style="font-size:12px; font-weight:800; color:#1F3864; margin-bottom:4px;">🔍 지도자 관찰 소견 (체크리스트)</div><div style="display:flex; flex-wrap:wrap; gap:6px;">${chkItems}</div></div>`;
      }

      var printHtml = `
          <div style="border: 1px solid #D8E0EA; border-radius: 12px; padding: 20px 24px; background: white; height:260mm; box-sizing:border-box; display:flex; flex-direction:column; font-family:'Pretendard', sans-serif;">
              <div style="border-bottom: 2px solid #1F3864; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end; flex-shrink:0;">
                  <div><h1 style="font-size: 22px; font-weight: 800; color: #1F3864; margin: 0 0 4px 0;">개별 회차 정밀 자세 분석 리포트</h1><div style="font-size: 13px; color: #5A6B82;">측정 대상: <b>${userName}</b> | 측정 회차: <b>${s.label}</b> (${s.date})</div></div>
                  <div style="font-size: 12px; font-weight: bold; color: #1F3864;">RE:WALK CENTER</div>
              </div>
              <div style="display: flex; gap: 10px; flex:1; min-height:0; margin-bottom: 5px;">
                  <div style="flex:1; background:#F8FAFC; border-radius:10px; border:1px solid #E2E8F0; padding:10px; display:flex; flex-direction:column; overflow:hidden;">
                      <div style="font-size:14px; font-weight:800; color:#1F3864; margin-bottom:6px; text-align:center;">정면 (Anterior)</div>
                      <div style="height:250px; display:flex; align-items:center; justify-content:center; background:#E2E8F0; border-radius:6px; overflow:hidden; flex-shrink:0;">${getImg('front')}</div>
                      <div style="margin-top:8px; padding:8px; background:#fff; border-radius:6px; border:1px solid #E2E8F0; flex:1; overflow-y:auto;"><div style="font-size:11.5px; font-weight:800; color:#1F3864; margin-bottom:4px; border-bottom:1px solid #EEF3FA; padding-bottom:2px;">📊 주요 측정 데이터</div>${getMetricsHtml('front')}<div style="font-size:11.5px; font-weight:800; color:#1F3864; margin:6px 0 2px 0; border-bottom:1px solid #EEF3FA; padding-bottom:2px;">📝 소견 메모</div><div style="font-size:11px; color:#475569; line-height:1.35; word-break:keep-all;">${getNotes('front')}</div></div>
                  </div>
                  <div style="flex:1; background:#F8FAFC; border-radius:10px; border:1px solid #E2E8F0; padding:10px; display:flex; flex-direction:column; overflow:hidden;">
                      <div style="font-size:14px; font-weight:800; color:#D9842A; margin-bottom:6px; text-align:center;">측면 (Lateral)</div>
                      <div style="height:250px; display:flex; align-items:center; justify-content:center; background:#E2E8F0; border-radius:6px; overflow:hidden; flex-shrink:0;">${getImg('side')}</div>
                      <div style="margin-top:8px; padding:8px; background:#fff; border-radius:6px; border:1px solid #E2E8F0; flex:1; overflow-y:auto;"><div style="font-size:11.5px; font-weight:800; color:#D9842A; margin-bottom:4px; border-bottom:1px solid #FEF6EE; padding-bottom:2px;">📊 주요 측정 데이터</div>${getMetricsHtml('side')}<div style="font-size:11.5px; font-weight:800; color:#D9842A; margin:6px 0 2px 0; border-bottom:1px solid #FEF6EE; padding-bottom:2px;">📝 소견 메모</div><div style="font-size:11px; color:#475569; line-height:1.35; word-break:keep-all;">${getNotes('side')}</div></div>
                  </div>
                  <div style="flex:1; background:#F8FAFC; border-radius:10px; border:1px solid #E2E8F0; padding:10px; display:flex; flex-direction:column; overflow:hidden;">
                      <div style="font-size:14px; font-weight:800; color:#2E8B57; margin-bottom:6px; text-align:center;">후면 (Posterior)</div>
                      <div style="height:250px; display:flex; align-items:center; justify-content:center; background:#E2E8F0; border-radius:6px; overflow:hidden; flex-shrink:0;">${getImg('back')}</div>
                      <div style="margin-top:8px; padding:8px; background:#fff; border-radius:6px; border:1px solid #E2E8F0; flex:1; overflow-y:auto;"><div style="font-size:11.5px; font-weight:800; color:#2E8B57; margin-bottom:4px; border-bottom:1px solid #F0FDF4; padding-bottom:2px;">📊 주요 측정 데이터</div>${getMetricsHtml('back')}<div style="font-size:11.5px; font-weight:800; color:#2E8B57; margin:6px 0 2px 0; border-bottom:1px solid #F0FDF4; padding-bottom:2px;">📝 소견 메모</div><div style="font-size:11px; color:#475569; line-height:1.35; word-break:keep-all;">${getNotes('back')}</div></div>
                  </div>
              </div>
              ${chkHtml}
              <div style="text-align: center; font-size: 10.5px; color: #94A3B8; margin-top: 10px; flex-shrink:0;">본 측정 및 리포트는 육안 및 AI 기반 교육/참고용이며 의학적 진단을 대신하지 않습니다. | RE:WALK CENTER</div>
          </div>
      `;
      document.getElementById('print-area').innerHTML = printHtml;
      setTimeout(function(){ window.print(); }, 400); 
  };


  function initCmpSelects() {
      var sessions = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      var opts = '<option value="">선택 안함</option>';
      sessions.forEach(function(s){ opts += `<option value="${s.id}">${s.label}</option>`; });
      if(G('pa-ca')) G('pa-ca').innerHTML = opts; 
      if(G('pa-cb')) G('pa-cb').innerHTML = opts;
      if(sessions.length >= 2) { 
          if(G('pa-ca')) G('pa-ca').value = sessions[0].id; 
          if(G('pa-cb')) G('pa-cb').value = sessions[sessions.length-1].id; 
      }
      else if(sessions.length === 1) { 
          if(G('pa-ca')) G('pa-ca').value = sessions[0].id; 
      }
      if(G('pa-ca')) G('pa-ca').addEventListener('change', renderCmp); 
      if(G('pa-cb')) G('pa-cb').addEventListener('change', renderCmp);
      renderCmp();
  }
  
  function renderCmp() {
      var sessions = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      function fill(side, val) {
          var box = G('pa-ci'+side);
          if(!box) return;
          var s = sessions.find(x => String(x.id) === val); 
          if(!s || !s.views[cmpView]) { 
              box.innerHTML = '<div class="pa-cinner" style="position:absolute; top:0; left:0; width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#8595AD; font-size:12px; font-weight:600;"><span class="material-icons" style="font-size:32px; margin-bottom:4px; opacity:0.4;">photo_size_select_actual</span>선택 대기중</div>'; 
              return; 
          }
          box.innerHTML = `<div class="pa-cinner" style="position:absolute; top:0; left:0; width:100%; height:100%;"><img src="${s.views[cmpView].imgData}" style="width:100%; height:100%; object-fit:contain; display:block;"></div>`;
      }
      if(G('pa-ca') && G('pa-cb')) {
          fill('a', G('pa-ca').value); fill('b', G('pa-cb').value);
      }
  }
  
  document.querySelectorAll('#pa-compare .pa-cvt').forEach(function(btn) {
    btn.addEventListener('click', function() {
      cmpView = btn.dataset.cv;
      document.querySelectorAll('#pa-compare .pa-cvt').forEach(b => b.classList.toggle('on', b === btn));
      renderCmp();
    });
  });

  if(G('pa-cpdf')) {
      G('pa-cpdf').addEventListener('click', function(){
          var sessions = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
          var sA = sessions.find(x => String(x.id) === G('pa-ca').value);
          var sB = sessions.find(x => String(x.id) === G('pa-cb').value);
          if(!sA || !sB || !sA.views[cmpView] || !sB.views[cmpView]) { alert(`비교할 두 회차의 ${VIEWS[cmpView].name} 분석 데이터가 모두 필요합니다.`); return; }

          var vA = sA.views[cmpView]; var vB = sB.views[cmpView];
          
          function getComparisonRoutineHtml(vB) {
              var mSide = vB.metrics && vB.metrics.side ? vB.metrics.side : {};
              var mFront = vB.metrics && vB.metrics.front ? vB.metrics.front : {};
              var mBack = vB.metrics && vB.metrics.back ? vB.metrics.back : {};
              var chk = vB.checklist || {};
              
              var selectedRoutines = [];
              
              if (mSide.cva > 3) selectedRoutines.push(EXERCISE_DB.cva);
              if (mSide.roundedShoulder > 3 || chk.roundedShoulder === 'moderate' || chk.roundedShoulder === 'severe') {
                  if(!selectedRoutines.includes(EXERCISE_DB.roundedShoulder)) selectedRoutines.push(EXERCISE_DB.roundedShoulder);
              }
              if (chk.thoracicKyphosis === 'moderate' || chk.thoracicKyphosis === 'severe') selectedRoutines.push(EXERCISE_DB.thoracicKyphosis);
              if (chk.anteriorPelvicTilt === 'moderate' || chk.anteriorPelvicTilt === 'severe' || chk.lumbarLordosis === 'moderate' || chk.lumbarLordosis === 'severe') {
                  selectedRoutines.push(EXERCISE_DB.anteriorPelvicTilt);
              }
              if (mSide.pelvisPos && mSide.pelvisPos.includes('스웨이백') || chk.swayBack === 'present') {
                  if(!selectedRoutines.includes(EXERCISE_DB.swayBack)) selectedRoutines.push(EXERCISE_DB.swayBack);
              } else if (mSide.pelvisPos && mSide.pelvisPos !== '골반 중립' && !selectedRoutines.includes(EXERCISE_DB.anteriorPelvicTilt)) {
                  selectedRoutines.push(EXERCISE_DB.pelvis);
              }

              if (mFront.headTilt && Math.abs(mFront.headTilt) > 3) selectedRoutines.push(EXERCISE_DB.neckFlexion);
              if ((mFront.shoulder && Math.abs(mFront.shoulder) >= 2.0) || (mBack.shoulder && Math.abs(mBack.shoulder) >= 2.0)) {
                  selectedRoutines.push(EXERCISE_DB.shoulderAsymmetry);
              }
              if ((mFront.pelvis && Math.abs(mFront.pelvis) >= 2.0) || (mBack.pelvis && Math.abs(mBack.pelvis) >= 2.0)) {
                  selectedRoutines.push(EXERCISE_DB.pelvicElevation);
              }
              
              if ((mBack.upperShift && Math.abs(mBack.upperShift) > 5) || (mBack.lowerShift && Math.abs(mBack.lowerShift) > 5)) {
                  selectedRoutines.push(EXERCISE_DB.lateralShift);
              }

              if (mFront.legAlign !== undefined && mFront.legAlign !== null) {
                  if (mFront.legAlign >= 4) selectedRoutines.push(EXERCISE_DB.genuValgum);
                  else if (mFront.legAlign <= -4) selectedRoutines.push(EXERCISE_DB.genuVarum);
              }
              
              if (selectedRoutines.length === 0) selectedRoutines.push(EXERCISE_DB.general);

              return selectedRoutines.map((ex, idx) => `
                  <div style="margin-bottom: 10px; margin-left: 15px;">
                      <div style="font-weight:700; font-size:14.5px; color:#1E293B; margin-bottom:4px;"><span>[${idx+1}] ${ex.title}</span></div>
                      <div style="font-size:13.5px; color:#475569; line-height:1.4;">${ex.routines.map(r => `• ${r}`).join('<br>')}</div>
                  </div>`).join('');
          }

          var printHtml = `
              <div style="border: 1px solid #E5E7EB; border-radius: 12px; padding: 25px; background: white; height:260mm; box-sizing:border-box; display:flex; flex-direction:column;">
                  <div style="border-bottom: 2px solid #1F3864; padding-bottom: 10px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: flex-end; flex-shrink:0;">
                      <div><h1 style="font-size: 24px; font-weight: 800; color: #1F3864; margin: 0 0 6px 0;">자세 정밀 분석 리포트 (${VIEWS[cmpView].name})</h1><div style="font-size: 14px; color: #6B7787;">측정 대상: ${userName}</div></div>
                      <div style="font-size: 12px; font-weight: bold; color: #1F3864;">RE:WALK CENTER</div>
                  </div>
                  <div style="display: flex; gap: 15px; margin-bottom: 15px; flex-shrink:0;">
                      <div style="flex:1; background:#F8FAFC; border-radius:12px; border:1px solid #E2E8F0; padding:15px; text-align:center;">
                          <div style="font-size:16px; font-weight:800; color:#1F3864; margin-bottom:10px;">🔵 이전 (${sA.label})</div>
                          <div style="height:360px; display:flex; align-items:center; justify-content:center; background:#E5E7EB; border-radius:8px; overflow:hidden;"><img src="${vA.imgData}" style="max-width:100%; max-height:100%; object-fit:contain;"></div>
                          <div style="margin-top:10px; font-size:13px; color:#5A6B82; text-align:left;"><b>소견:</b> ${vA.notes||'-'}</div>
                      </div>
                      <div style="flex:1; background:#F8FAFC; border-radius:12px; border:1px solid #E2E8F0; padding:15px; text-align:center;">
                          <div style="font-size:16px; font-weight:800; color:#D9842A; margin-bottom:10px;">🔴 최근 (${sB.label})</div>
                          <div style="height:360px; display:flex; align-items:center; justify-content:center; background:#E5E7EB; border-radius:8px; overflow:hidden;"><img src="${vB.imgData}" style="max-width:100%; max-height:100%; object-fit:contain;"></div>
                          <div style="margin-top:10px; font-size:13px; color:#5A6B82; text-align:left;"><b>소견:</b> ${vB.notes||'-'}</div>
                      </div>
                  </div>
                  <div style="background: #EEF3FA; border-radius: 12px; padding: 20px; flex:1; overflow:hidden;">
                      <div style="font-size: 18px; font-weight: 800; color: #1F3864; border-left: 5px solid #1F3864; padding-left: 10px; margin-bottom: 15px;">AI 맞춤형 자세 교정 솔루션</div>
                      <div style="display: flex; align-items: center; gap: 6px; font-size: 15px; font-weight: 700; color: #2E5C9E; margin: 15px 0 10px 0;"><span style="display:inline-block; width:5px; height:5px; border-radius:50%; background:#2E5C9E;"></span>관절 정렬 분석 기반 핵심 교정 루틴</div>
                      ${getComparisonRoutineHtml(vB)}
                  </div>
                  <div style="text-align: center; font-size: 11px; color: #94A3B8; margin-top: 15px; flex-shrink:0;">본 측정 및 리포트는 육안 및 AI 기반 교육/참고용이며 의학적 진단을 대신하지 않습니다. | RE:WALK CENTER</div>
              </div>
          `;
          document.getElementById('print-area').innerHTML = printHtml;
          setTimeout(function(){ window.print(); }, 400); 
      });
  }

  document.querySelectorAll('#pa-root .pa-nav-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('#pa-root .pa-nav-btn').forEach(b => b.classList.toggle('on', b === btn));
      document.querySelectorAll('#pa-root .pa-panel').forEach(p => p.classList.toggle('on', p.id === 'pa-' + btn.dataset.tab));
      if(btn.dataset.tab === 'compare') renderCmp();
      if(btn.dataset.tab === 'history') renderHistory();
    });
  });

  var dashBtn = G('pa-btn-dash');
  if (dashBtn) {
      dashBtn.addEventListener('click', function() {
          if (confirm("모든 측정을 완료하고 메인 대시보드로 돌아가시겠습니까?")) {
              if (window.parent !== window) {
                  window.parent.location.href = 'index.html'; 
              } else {
                  window.location.href = 'index.html'; 
              }
          }
      });
  }
  
  init();
})();

// =========================================================================
// [기능] 정적 자세 가상 무아레 & 🚨 생체역학적 부하 히트맵 융합 엔진
// =========================================================================
function drawStaticVirtualMoire(ctx, landmarks, metrics) {
    if (!landmarks || !metrics) return;

    let minZ = Infinity;
    let maxZ = -Infinity;

    landmarks.forEach(lm => {
        if (lm.z < minZ) minZ = lm.z;
        if (lm.z > maxZ) maxZ = lm.z;
    });

    const zRange = maxZ - minZ || 1;

    ctx.save();
    ctx.globalCompositeOperation = "source-over";

    // 1. 기본 체형 굴곡 등고선 (파스텔톤 베이스)
    landmarks.forEach(lm => {
        if(lm.visibility < 0.2) return;
        const pointX = metrics.x + (lm.x * metrics.width);
        const pointY = metrics.y + (lm.y * metrics.height);
        const normZ = (lm.z - minZ) / zRange; 
        const invertedZ = 1 - normZ;
        const hue = 240 * normZ; 
        
        const radius = (metrics.width * 0.04) + ((metrics.width * 0.04) * invertedZ);

        const gradient = ctx.createRadialGradient(pointX, pointY, 0, pointX, pointY, radius);
        gradient.addColorStop(0, `hsla(${hue}, 70%, 65%, 0.25)`);
        gradient.addColorStop(0.5, `hsla(${hue}, 70%, 65%, 0.08)`);
        gradient.addColorStop(1, `hsla(${hue}, 70%, 65%, 0)`);

        ctx.beginPath();
        ctx.arc(pointX, pointY, radius, 0, 2 * Math.PI);
        ctx.fillStyle = gradient;
        ctx.fill();
    });

    // 2. 🚨 생체역학적 부하 히트맵 (AI 분석 데이터 연동)
    const st = window.__paState;
    if (st && st.metrics && st.metrics[st.v]) {
        const mData = st.metrics[st.v];

        // [정면(Front) 분석 시 부하 맵핑]
        if (st.v === 'front') {
            if (mData.pelvis && Math.abs(mData.pelvis) >= 1.5) {
                const tiltVal = mData.pelvis; 
                const isRightLower = tiltVal > 0;
                const lh = landmarks[23], rh = landmarks[24]; 
                const lk = landmarks[25], rk = landmarks[26]; 

                if (lh && rh && lh.visibility > 0.4 && rh.visibility > 0.4) {
                    const highHip = isRightLower ? lh : rh; 
                    const overloadedKnee = isRightLower ? rk : lk;
                    const stressLevel = Math.min(Math.abs(tiltVal) / 6.0, 1.0); 

                    drawStressWave(ctx, highHip.x, highHip.y - 0.08, metrics, stressLevel * 1.2);
                    if (overloadedKnee && overloadedKnee.visibility > 0.4) {
                        drawStressWave(ctx, overloadedKnee.x, overloadedKnee.y, metrics, stressLevel * 0.9);
                    }
                }
            }
            if (mData.shoulder && Math.abs(mData.shoulder) >= 1.5) {
                const ls = landmarks[11], rs = landmarks[12];
                if (ls && rs && ls.visibility > 0.4 && rs.visibility > 0.4) {
                    const highSho = mData.shoulder > 0 ? ls : rs; 
                    const stressLevel = Math.min(Math.abs(mData.shoulder) / 5.0, 1.0);
                    drawStressWave(ctx, highSho.x + (highSho === ls ? 0.02 : -0.02), highSho.y - 0.03, metrics, stressLevel * 0.9);
                }
            }
        }

        // [측면(Side) 분석 시 부하 맵핑]
        if (st.v === 'side') {
            if (mData.earDev !== undefined && mData.earDev !== null) {
                if (mData.earDev > 3.0) { 
                    const c7 = landmarks[11] || landmarks[12]; 
                    if (c7 && c7.visibility > 0.4) {
                        const stressLevel = Math.min(mData.earDev / 8.0, 1.0);
                        drawStressWave(ctx, c7.x, c7.y - 0.06, metrics, stressLevel * 1.5);
                    }
                }
            }
            if (mData.hipDev !== undefined && mData.hipDev > 2.0) {
                const hip = landmarks[23] || landmarks[24];
                const knee = landmarks[25] || landmarks[26];
                if (hip && hip.visibility > 0.4) {
                    const stressLevel = Math.min(mData.hipDev / 6.0, 1.0);
                    drawStressWave(ctx, hip.x + 0.02, hip.y, metrics, stressLevel);
                    if (knee && knee.visibility > 0.4) {
                        drawStressWave(ctx, knee.x - 0.02, knee.y, metrics, stressLevel * 0.8);
                    }
                }
            }
        }
    }
    ctx.restore();
}

// 🚨 특정 좌표에 경고 파동을 '고대비 열화상' 느낌으로 매우 선명하게 그려주는 함수
function drawStressWave(ctx, normX, normY, metrics, intensity) {
    if (intensity <= 0.1) return; // 부하가 너무 약하면 패스
    
    const px = metrics.x + (normX * metrics.width);
    const py = metrics.y + (normY * metrics.height);
    
    // 파동의 크기 
    const radius = metrics.width * 0.08 * (0.5 + intensity);
    
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    
    // 투명도(Alpha) 최솟값 보장: 강도가 낮아도 색상이 배경에 묻히지 않도록 강제 끌어올림
    const coreAlpha = Math.min(0.7 + (intensity * 0.3), 1.0); 
    const midAlpha  = Math.min(0.5 + (intensity * 0.4), 0.9); 
    
    // 시뻘겋게 타오르는 고대비(High Contrast) 열화상 그라디언트
    const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius);
    gradient.addColorStop(0, `rgba(255, 0, 0, ${coreAlpha})`);          // 1. 아주 진한 순수 빨강 (코어 통증)
    gradient.addColorStop(0.3, `rgba(255, 80, 0, ${midAlpha})`);        // 2. 강렬한 주황
    gradient.addColorStop(0.7, `rgba(255, 160, 0, ${midAlpha * 0.4})`); // 3. 밝은 노랑주황빛 확산
    gradient.addColorStop(1, `rgba(255, 200, 0, 0)`);                   // 4. 자연스럽게 투명해짐
    
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, 2 * Math.PI);
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // 🚀 [수정] 너무 튀지 않게 중앙 발광점을 은은하고 부드럽게 조절
    ctx.beginPath();
    ctx.arc(px, py, radius * 0.1, 0, 2 * Math.PI); // 크기를 0.12에서 0.1로 약간 축소
    // 색상을 눈부신 형광 노랑에서 따뜻한 금빛으로 바꾸고, 투명도를 45% 수준으로 대폭 낮춤
    ctx.fillStyle = `rgba(255, 215, 0, ${coreAlpha * 0.45})`; 
    ctx.fill();
    
    ctx.restore();
}