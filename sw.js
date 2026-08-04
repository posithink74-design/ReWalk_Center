// 캐시 버전 업데이트
const CACHE_NAME = 'rewalk-app-cache-v10';

// 1. 기본 UI 및 도구 파일들
const urlsToCache = [
    './',
    './index.html',
    './manifest.json',
    './basic_info.html',
    './foot_screen.html',
    './posture_screen.html',
    './front_gait_screen.html',
    './side_gait_screen.html',   
    './js/posture_app.js', 
    './js/front_gait.js',
    './js/side_gait.js',
    './js/rewalk_store.js',
    './css/analysis_tool.css',
    './css/foot_screen.css',
    './css/front_gait.css',
    './css/side_gait.css',
    './css/local_font.css',
    './fonts/Pretendard-Regular.woff2',
    './fonts/Pretendard-Bold.woff2',
    './fonts/MaterialIcons-Regular.woff2'
];

// 2. 무거운 MediaPipe AI 파일들
const aiFiles = [
    './mediapipe/camera_utils.js',
    './mediapipe/control_utils.js',
    './mediapipe/drawing_utils.js',
    './mediapipe/pose.js',
    './mediapipe/pose_solution_packed_assets.data',
    './mediapipe/pose_solution_simd_wasm_bin.js',
    './mediapipe/pose_solution_simd_wasm_bin.wasm',
    './mediapipe/pose_web.binarypb',
    './mediapipe/pose_solution_packed_assets.loader.js',
    './mediapipe/pose_solution_wasm_bin.js',
];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
    self.skipWaiting();
});

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

// 🔴 수정된 부분 1: 특정 ID(clientId) 대신 즉시 실행
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'START_DOWNLOAD') {
        cacheFilesWithProgress(); 
    }
});

// 🔴 수정된 부분 2: 방송(Broadcast) 방식으로 100% 도달 보장
async function cacheFilesWithProgress() {
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
                
                // 모든 클라이언트(화면)에 진행률 방송
                const allClients = await clients.matchAll();
                allClients.forEach(client => {
                    client.postMessage({
                        type: 'PROGRESS',
                        percent: Math.round((loadedCount / totalFiles) * 100)
                    });
                });
            }
        } catch (error) {
            console.error('다운로드 실패:', url);
        }
    }

    // 모든 클라이언트(화면)에 완료 방송
    const allClients = await clients.matchAll();
    allClients.forEach(client => {
        client.postMessage({ type: 'COMPLETE' });
    });
}

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        }).catch(() => caches.match('./index.html'))
    );
});