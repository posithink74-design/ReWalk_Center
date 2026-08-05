const CACHE_NAME = 'rewalk-app-cache-v12';

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
    './css/foot_screening.css',
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
    './mediapipe/pose_solution_packed_assets_loader.js',
    './mediapipe/pose_solution_wasm_bin.js',
];

// 설치 시 기본 파일 우선 저장
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(urlsToCache).catch(err => console.log('기본 파일 캐싱 중 일부 유실 무시'));
        })
    );
    self.skipWaiting(); // 즉시 활성화
});

// 구버전 캐시 정리 및 제어권 즉시 확보
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim()) // 페이지 제어권 즉시 가로채기
    );
});

// 메시지 수신 시 파일 일괄 다운로드 실행
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'START_DOWNLOAD') {
        cacheFilesWithProgress();
    }
});

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
            }
        } catch (error) {
            console.warn('다운로드 건너뜀:', url);
        }

        loadedCount++;
        
        // 연결된 모든 화면에 진행률(%) 방송
        const clients = await self.clients.matchAll({ includeUncontrolled: true });
        clients.forEach(client => {
            client.postMessage({
                type: 'PROGRESS',
                percent: Math.round((loadedCount / totalFiles) * 100)
            });
        });
    }

    // 다운로드 완료 신호 방송
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    clients.forEach(client => {
        client.postMessage({ type: 'COMPLETE' });
    });
}

// 네트워크 통신 처리
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        }).catch(() => caches.match('./index.html'))
    );
});