/**
 * RE:WALK CENTER - 공통 데이터 저장소 (Store)
 * 각 측정 모듈(발, 자세, 보행)의 데이터를 통합 관리하는 파일입니다.
 */

console.log("✅ RE:WALK Store 정상 로드 완료");

window.ReWalkStore = {
    // 1. 현재 측정 대상자 정보 저장
    saveUser: function(userObj) {
        localStorage.setItem('rewalk_current_user', JSON.stringify(userObj));
    },
    
    // 2. 현재 측정 대상자 정보 불러오기
    getUser: function() {
        const data = localStorage.getItem('rewalk_current_user');
        return data ? JSON.parse(data) : null;
    },

    // 3. 측정 데이터 통합 저장 (사용자 ID 기반 분리)
    saveRecord: function(moduleName, data) {
        const currentUser = this.getUser();
        
        // 방어 코드: 대상자가 선택되지 않은 상태에서 측정되는 것 방지
        if (!currentUser || !currentUser.id) {
            console.error("❌ 대상자가 지정되지 않아 기록을 저장할 수 없습니다.");
            alert("측정 대상자를 먼저 선택해 주세요.");
            return false;
        }

        const record = {
            userId: currentUser.id,
            userName: currentUser.name,
            module: moduleName,
            data: data,
            timestamp: new Date().toISOString()
        };
        
        // 키값에 사용자 ID를 포함: 예) rewalk_record_user_12345_foot
        const storageKey = `rewalk_record_${currentUser.id}_${moduleName}`;
        localStorage.setItem(storageKey, JSON.stringify(record));
        
        console.log(`✅ [${moduleName}] ${currentUser.name}님의 데이터 저장 완료`);
        return true;
    },

    // 4. 특정 사용자의 특정 측정 데이터 불러오기 (추후 종합 리포트 생성용)
    getRecord: function(userId, moduleName) {
        const storageKey = `rewalk_record_${userId}_${moduleName}`;
        const data = localStorage.getItem(storageKey);
        return data ? JSON.parse(data) : null;
    }
};