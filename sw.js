const CACHE_NAME = 'rewalk-app-cache-v9';

// 1. 기본 UI 및 도구 파일들 (가벼운 파일)
const urlsToCache = [
    './',
    './index.html',
    './manifest.json',
    './basic_info.html',
    './foot_screen.html',
    './posture_analysis.html',
    './front_gait.html',
    './side_gait.html',   
    './js/posture_app.js', 
    './js/front_gait.js',
    './js/side_gait.js',
    './js/rewalk_store.js',
    './js/foot_screening.js',
    './js/data.js',
    './css/analysis_tool.css',
    './css/foot_screen.css',
    './css/front_gait.css',
    './css/side_gait.css',
    './css/local_font.css',
    './fonts/Pretendard-Regular.woff2',
    './fonts/Pretendard-Bold.woff2',
    './fonts/MaterialIcons-Regular.woff2'
];

// 2. 무거운 MediaPipe AI 파일들 (진행률 표시의 핵심)
const aiFiles = [
    './mediapipe/camera_utils.js',
    './mediapipe/control_utils.js',
    './mediapipe/drawing_utils.js',
    './mediapipe/pose.js',
    './mediapipe/pose_solution_packed_assets.data',
    './mediapipe/pose_solution_simd_wasm_bin.js',
    './mediapipe/pose_solution_simd_wasm_bin.wasm',
    './mediapipe/pose_web.binarypb'
];

// 앱 최초 실행 시 기본 파일만 우선 설치
self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
    self.skipWaiting();
});

// 구버전 캐시 삭제
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) return caches.delete(cache);
                })
            );
        })
    );
    self.clients.claim();
});

// 화면(HTML)에서 다운로드 시작 버튼을 눌렀을 때 실행되는 로직
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'START_DOWNLOAD') {
        const clientId = event.source.id; // 요청한 브라우저 창의 ID
        cacheFilesWithProgress(clientId);
    }
});

// 파일을 한 개씩 받으면서 퍼센트(%)를 화면으로 쏴주는 함수
async function cacheFilesWithProgress(clientId) {
    const cache = await caches.open(CACHE_NAME);
    const allFiles = [...urlsToCache, ...aiFiles];
    let loadedCount = 0;
    const totalFiles = allFiles.length;

    for (const url of allFiles) {
        try {
            const response = await fetch(new Request(url, { cache: 'reload' }));
            if (response.ok) {
                await cache.put(url, response);
                loadedCount++;
                
                // 화면으로 진행률 전송
                const client = await clients.get(clientId);
                if (client) {
                    client.postMessage({
                        type: 'PROGRESS',
                        percent: Math.round((loadedCount / totalFiles) * 100)
                    });
                }
            }
        } catch (error) {
            console.error('다운로드 실패:', url);
        }
    }

    // 100% 완료 메시지 전송
    const client = await clients.get(clientId);
    if (client) {
        client.postMessage({ type: 'COMPLETE' });
    }
}

// 오프라인 요청 처리 (기존과 동일)
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        }).catch(() => caches.match('./index.html'))
    );
});