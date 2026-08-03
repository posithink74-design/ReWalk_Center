// 캐시 이름 설정 (버전이 올라가면 이름을 바꿔주어 캐시를 갱신합니다)
const CACHE_NAME = 'rewalk-app-cache-v6';
const AI_CACHE_NAME = 'rewalk-ai-cache-v1';

// 1. 설치 시 캐싱할 기본 파일들 (원하시는 UI 파일들을 추가하시면 됩니다)
const uiFiles = [
    '/',
    '/index.html',
    '/manifest.json',
    '/basic_info.html',
    '/foot_screen.html',
    '/posture_screen.html',
    '/front_gait_screen.html',
    '/side_gait_screen.html',   

    '/js/posture_app.js', 
    '/js/front_gait.js',
    '/js/side_gait.js',
    '/js/rewalk_store.js',

    '/css/analysis_tool.css',
    '/css/foot_screen.css',
    '/css/front_gait.css',
    '/css/side_gait.css',
    '/css/local_font.css',
    '/fonts/Pretendard-Regular.woff2',
    '/fonts/Pretendard-Bold.woff2',
    '/fonts/MaterialIcons-Regular.woff2'
];

// 2. 반드시 로컬에서 가져와야 할 MediaPipe AI 파일들
const aiFiles = [
    '/mediapipe/pose.js',
    '/mediapipe/pose_solution_packed_assets.data',
    '/mediapipe/pose_solution_simd_wasm_bin.js',
    '/mediapipe/pose_solution_simd_wasm_bin.wasm',
    '/mediapipe/pose_web.binarypb'
];

// [설치 이벤트] 앱이 처음 실행될 때 파일들을 스마트폰에 다운로드(저장)합니다.
self.addEventListener('install', event => {
    event.waitUntil(
        Promise.all([
            caches.open(CACHE_NAME).then(cache => cache.addAll(uiFiles)),
            caches.open(AI_CACHE_NAME).then(cache => cache.addAll(aiFiles))
        ])
);
self.skipWaiting();
});

// [통신(Fetch) 이벤트] 교통경찰 역할: 요청의 종류에 따라 길을 안내합니다.
self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);

  // 전략 A. MediaPipe 파일 요청 시 -> [오프라인 우선 (Cache First)]
    if (requestUrl.pathname.includes('/mediapipe/')) {
        event.respondWith(
            caches.match(event.request).then(cachedResponse => {
        // 캐시에 있으면 즉시 반환 (지연시간 0초), 없으면 인터넷에서 다운로드
            return cachedResponse || fetch(event.request);
        })
    );
    return;
}

  // 전략 B. 일반 앱 화면/데이터 요청 시 -> [온라인 우선 (Network First) + 오프라인 폴백]
    event.respondWith(
        fetch(event.request)
        .then(networkResponse => {
        // 온라인 통신이 원활하면 최신 데이터를 보여주고, 몰래 캐시도 업데이트
        return caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
        });
    })
    .catch(() => {
        // 통신이 끊겼을 때(오프라인) 에러를 띄우지 않고 기존 저장된 화면을 보여줌
        return caches.match(event.request);
    })
);
});