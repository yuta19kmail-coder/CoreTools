// ========================================
// firebase-init.js（CoreTools v0.8.0〜）
// CoreFlow と同じ Firebase プロジェクト(carflow-9d500)に接続し、
// window.fb で auth / db を公開する。CarFlow の firebase-init.js と同方式。
// ----------------------------------------
// ・projectId は CoreFlow/CarFlow と共通 = 同じ Google 認証・同じ portalMembers 名簿で入れる
// ・authDomain は CoreTools 自身のサブドメイン（coretools.kobayashi-motors.com）にする。
//   別サブドメインの authDomain だと iOS Safari がリダイレクト戻りでログインループするため
//   （CarFlow v2.18.12 の教訓）、アプリと同一オリジンの /__/auth/handler を使う。
//   ※ Firebase Console > Authentication > Settings > 承認済みドメイン に
//      coretools.kobayashi-motors.com を追加しておくこと。
// ========================================
(function () {
  var firebaseConfig = {
    apiKey: "AIzaSyBmhI5SzkmPvZUiuTn_ttCZ4tUikKv_iHI",
    authDomain: "coretools.kobayashi-motors.com",  // ← CoreTools 自身のサブドメイン（本番公開後に有効）
    projectId: "carflow-9d500",
    storageBucket: "carflow-9d500.firebasestorage.app",
    messagingSenderId: "235121541987",
    appId: "1:235121541987:web:8f96dfadc23fe1de7f4956"
  };

  if (typeof firebase === 'undefined') {
    console.error('[firebase-init] Firebase SDK が読み込まれていません');
    return;
  }
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  var auth = firebase.auth();
  var db = firebase.firestore();

  window.fb = {
    auth: auth,
    db: db,
    config: firebaseConfig,
    serverTimestamp: function () { return firebase.firestore.FieldValue.serverTimestamp(); },
    FieldValue: firebase.firestore.FieldValue,
    currentUser: null,        // Firebase Auth User
    currentCompanyId: null,   // 'kobayashi_motors'
    currentMember: null       // portalMembers の中身
  };

  console.log('[firebase-init] CoreTools OK', { projectId: firebaseConfig.projectId });
})();
