// ========================================
// auth.js（CoreTools v0.8.0〜）
// CoreFlow 認証（Google サインイン → portalMembers で入室判定）。
// CarFlow の auth.js を CoreTools 用に簡約：
//   ・会社 = kobayashi_motors 固定
//   ・入室条件 = portalMembers に自分がいて active !== false（CoreTools は全社員が使える道具箱なので
//     アプリ別の利用フラグ(.on)は要求しない）
//   ・ログイン後：window.fb.currentUser / currentMember を確定し #app を表示、ヘッダーに本人のアバター/名前
// ========================================
(function () {
  var COMPANY_ID = 'kobayashi_motors';
  var _authBusy = false;

  function _isMobile() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  }
  // アプリ内ブラウザ（LINE/Instagram 等）は Google OAuth がブロックされる
  function _isInAppBrowser() {
    var ua = navigator.userAgent || '';
    if (/Line\//i.test(ua)) return true;
    if (/FBAN|FBAV|FB_IAB/.test(ua)) return true;
    if (/Instagram/i.test(ua)) return true;
    if (/Twitter/i.test(ua)) return true;
    if (/Slack\//i.test(ua)) return true;
    if (/MicroMessenger/i.test(ua)) return true;
    if (/KAKAOTALK/i.test(ua)) return true;
    if (/iPhone|iPad|iPod/.test(ua) && !/Safari\//.test(ua)) return true;
    return false;
  }

  function _el(id) { return document.getElementById(id); }
  function _setLoginBusy(b) {
    var btn = _el('ct-login-btn');
    if (btn) btn.disabled = !!b;
    var ld = _el('ct-login-loading');
    if (ld) ld.style.display = b ? 'block' : 'none';
  }

  window.doLogin = async function () {
    if (_authBusy || !window.fb || !window.fb.auth) return;
    if (window.fb.auth.currentUser) return;
    _authBusy = true; _setLoginBusy(true);
    try {
      var provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      if (_isMobile()) {
        await window.fb.auth.signInWithRedirect(provider);   // モバイルはリダイレクト（戻ってこない）
        return;
      }
      await window.fb.auth.signInWithPopup(provider);
    } catch (err) {
      console.error('[auth] signIn error:', err);
      var msg = 'ログインに失敗しました';
      if (err && err.code === 'auth/popup-closed-by-user') msg = 'ログインがキャンセルされました';
      else if (err && err.code === 'auth/popup-blocked') msg = 'ポップアップがブロックされました（ポップアップを許可してください）';
      else if (err && err.code === 'auth/unauthorized-domain') msg = 'このドメインは Firebase に未登録です';
      _loginError(msg);
    }
    _authBusy = false; _setLoginBusy(false);
  };

  window.doLogout = async function () {
    if (_authBusy || !window.fb || !window.fb.auth) return;
    _authBusy = true;
    try { await window.fb.auth.signOut(); }
    catch (e) { console.error('[auth] signOut error:', e); }
    _authBusy = false;
  };

  function _loginError(msg) {
    var e = _el('ct-login-error');
    if (e) { e.textContent = msg; e.style.display = 'block'; }
  }

  function _normEmail(s) {
    return (typeof s === 'string') ? s.normalize('NFKC').toLowerCase().trim() : '';
  }
  // portalMembers から自分を探す（uid → email → 大文字小文字違い救済）
  async function _findMyPortalMember(user) {
    var coll = window.fb.db.collection('companies').doc(COMPANY_ID).collection('portalMembers');
    try {
      var doc = await coll.doc(user.uid).get();
      if (doc.exists) { var m = doc.data() || {}; m.id = doc.id; return m; }
    } catch (e) { console.warn('[auth] uid lookup failed:', e); }
    if (user.email) {
      var norm = _normEmail(user.email);
      try {
        var snap = await coll.where('email', '==', user.email).limit(1).get();
        if (snap.empty && norm !== user.email) snap = await coll.where('email', '==', norm).limit(1).get();
        if (!snap.empty) { var d = snap.docs[0]; var mm = d.data() || {}; mm.id = d.id; return mm; }
        var all = await coll.limit(300).get();
        var matched = null;
        all.forEach(function (x) { if (matched) return; var e2 = _normEmail(String((x.data() || {}).email || '')); if (e2 && e2 === norm) matched = x; });
        if (matched) { var m3 = matched.data() || {}; m3.id = matched.id; return m3; }
      } catch (e) { console.warn('[auth] email lookup failed:', e); }
    }
    return null;
  }

  async function _onSignedIn(user) {
    var member = await _findMyPortalMember(user);
    if (!member) {
      _loginError('CoreFlow名簿に登録がありません。管理者に追加してもらってください。');
      try { await window.fb.auth.signOut(); } catch (e) {}
      return;
    }
    if (member.active === false) {
      _loginError('このアカウントは無効化されています。');
      try { await window.fb.auth.signOut(); } catch (e) {}
      return;
    }
    window.fb.currentUser = user;
    window.fb.currentCompanyId = COMPANY_ID;
    window.fb.currentMember = member;

    // 橋渡し（Firestoreルールの追加判定用・CarFlow と同方式・失敗しても継続）
    try {
      await window.fb.db.collection('companies').doc(COMPANY_ID)
        .collection('userPrefs').doc(user.uid)
        .set({ memberId: member.id, memberEmail: (member.email || user.email || '') }, { merge: true });
    } catch (e) { console.warn('[auth] userPrefs 記録に失敗（継続）:', e); }

    _showApp(user, member);
  }

  function _onSignedOut() {
    window.fb.currentUser = null;
    window.fb.currentMember = null;
    var login = _el('ct-login-screen'); if (login) login.style.display = 'flex';
    var app = _el('app'); if (app) app.style.display = 'none';
  }

  function _initials(name) {
    var s = (name || '').trim();
    if (!s) return '👤';
    return s.replace(/\s+/g, '').slice(0, 2);
  }

  function _showApp(user, member) {
    var login = _el('ct-login-screen'); if (login) login.style.display = 'none';
    var app = _el('app'); if (app) app.style.display = 'grid';

    var name = member.name || (user && user.displayName) || 'メンバー';
    var photo = member.photo || (user && user.photoURL) || '';
    var nameEl = _el('u-name'); if (nameEl) nameEl.textContent = name;
    var av = _el('u-av');
    if (av) {
      if (photo) { av.style.backgroundImage = 'url("' + photo + '")'; av.style.backgroundSize = 'cover'; av.style.backgroundPosition = 'center'; av.textContent = ''; }
      else { av.style.backgroundImage = ''; av.textContent = _initials(name); }
    }
    // PitType(iframe)へ「ログインしたよ」を通知（既に開いていれば再読込で反映）
    try {
      var ifr = document.querySelector('#main iframe');
      if (ifr && ifr.contentWindow) ifr.contentWindow.postMessage({ ct: 'signed-in' }, '*');
    } catch (e) {}
    console.log('[auth] signed in:', { uid: user.uid, name: name });
  }

  function _initAuthStateListener() {
    if (!window.fb || !window.fb.auth) { console.error('[auth] fb 未初期化'); return; }
    if (window.fb.auth.getRedirectResult) {
      window.fb.auth.getRedirectResult().catch(function (err) {
        console.error('[auth] getRedirectResult error:', err);
        _loginError('ログインに失敗しました：' + (err.code || err.message || '不明'));
      });
    }
    window.fb.auth.onAuthStateChanged(async function (user) {
      if (user) { await _onSignedIn(user); }
      else {
        _setLoginBusy(false);
        if (_isInAppBrowser()) {
          var w = _el('ct-inapp-warning'); if (w) w.style.display = 'block';
          var b = _el('ct-login-btn'); if (b) b.style.display = 'none';
        }
        _onSignedOut();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _initAuthStateListener);
  else _initAuthStateListener();
})();
