const CACHE_NAME = 'rewalk-app-cache-v11';

// 🔴 전문가님의 실제 폴더에 "있는 파일만" 남기고 없는 것은 지워주세요!
const urlsToCache = [
    './',
    './index.html',
    './manifest.json',
    // 아래 파일 중 실제 없는 파일이 있다면 삭제하세요!
    './basic_info.html',
    './foot_screening.html',
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
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache).catch(()=>console.log("기본 캐싱 일부 실패"))));
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

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'START_DOWNLOAD') {
        cacheFilesWithProgress(); 
    }
});

async function cacheFilesWithProgress() {
    const cache = await caches.open(CACHE_NAME);
    const allFiles = [...urlsToCache, ...aiFiles];
    let loadedCount = 0;
    const totalFiles = allFiles.length;
    let errorFiles = []; // 실패한 파일 추적

    for (const url of allFiles) {
        try {
            const response = await fetch(new Request(url, { cache: 'reload' }));
            if (response.ok) {
                await cache.put(url, response);
            } else {
                console.error('❌ 폴더에 없는 파일 발견 (404):', url);
                errorFiles.push(url);
            }
        } catch (error) {
            console.error('❌ 네트워크 에러:', url);
            errorFiles.push(url);
        }

        loadedCount++;
        
        // includeUncontrolled: true 옵션으로 연결 끊김 방지
        const allClients = await self.clients.matchAll({ includeUncontrolled: true });
        allClients.forEach(client => {
            client.postMessage({
                type: 'PROGRESS',
                percent: Math.round((loadedCount / totalFiles) * 100)
            });
        });
    }

    const allClients = await self.clients.matchAll({ includeUncontrolled: true });
    allClients.forEach(client => {
        if (errorFiles.length > 0) {
            client.postMessage({ type: 'ERROR', fails: errorFiles });
        } else {
            client.postMessage({ type: 'COMPLETE' });
        }
    });
}

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        }).catch(() => caches.match('./index.html'))
    );
});