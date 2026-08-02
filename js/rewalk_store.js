/**
 * RE:WALK CENTER - 공통 데이터 저장소 (Store)
 * 각 측정 모듈(발, 자세, 보행)의 데이터를 통합 관리하는 파일입니다.
 */

console.log("✅ RE:WALK Store 정상 로드 완료");

window.ReWalkStore = {
    // 1. 현재 대상자 정보 저장
    saveUser: function(userObj) {
        localStorage.setItem('rewalk_current_user', JSON.stringify(userObj));
    },
    
    // 2. 현재 대상자 정보 불러오기
    getUser: function() {
        const data = localStorage.getItem('rewalk_current_user');
        return data ? JSON.parse(data) : null;
    },

    // 3. 측정 데이터 통합 저장 (추후 종합 리포트에서 사용)
    saveRecord: function(moduleName, data) {
        const record = {
            module: moduleName,
            data: data,
            timestamp: new Date().toISOString()
        };
        localStorage.setItem(`rewalk_record_${moduleName}`, JSON.stringify(record));
        console.log(`[${moduleName}] 데이터 저장 완료`);
    }
};