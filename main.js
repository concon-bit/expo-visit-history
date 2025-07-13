// =================================================================================
// Firebase SDKのインポートと初期化
// =================================================================================

// npmでインストールしたfirebaseライブラリから各機能をインポート
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, doc, deleteDoc, where } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";

// .envファイルから安全に設定情報を読み込む
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Firebaseアプリを初期化
const firebaseApp = initializeApp(firebaseConfig);
const firestoreDB = getFirestore(firebaseApp);
const firebaseAuth = getAuth(firebaseApp);


// =================================================================================
// アプリケーション本体 (ExpoApp)
// =================================================================================

const ExpoApp = {
    state: {
        allPavilions: [],
        filteredPavilions: [],
        currentPage: 1,
        currentUser: null,
    },
    config: {
        itemsPerPage: 20,
        areaMap: { "signature": "シグネチャー", "empowering": "いのちを育む", "future": "未来の社会", "saving": "いのちを守る", "co-creation": "共創", "water": "ウォーターワールド" }
    },
    elements: {
        searchInput: null, pavilionList: null, paginationContainer: null,
        visitHistoryList: null,
        pavilionsView: null, historyView: null, showPavilionsBtn: null, showHistoryBtn: null,
        loginBtn: null, logoutBtn: null, userInfo: null,
        // ↓↓↓ 追加・修正 ↓↓↓
        visitModal: null,           // モーダル全体のオーバーレイ
        visitForm: null,            // モーダル内のフォーム
        modalCloseBtn: null,        // モーダルを閉じるボタン
        pavilionNameInput: null,    // フォーム内のパビリオン名入力欄
        visitDateInput: null,       // フォーム内の訪問日入力欄
        waitTimeInput: null,        // フォーム内の待ち時間入力欄
        reviewTextInput: null       // フォーム内のレビュー入力欄
        // ↑↑↑ 追加・修正 ↑↑↑
    },
    async initialize() {
        this.cacheDOMElements();
        this.addEventListeners();
        this.setupAuthObserver();
        try {
            this.state.allPavilions = await this.api.fetchPavilions();
            this.state.filteredPavilions = [...this.state.allPavilions];
            this.ui.renderPavilions();
        } catch (error) {
            console.error("パビリオンデータの読み込みに失敗しました:", error);
            this.elements.pavilionList.innerHTML = "<p>パビリオンデータの読み込みに失敗しました。</p>";
        }
    },
    cacheDOMElements() {
        this.elements.searchInput = document.getElementById('searchInput');
        this.elements.pavilionList = document.getElementById('pavilionList');
        this.elements.paginationContainer = document.getElementById('pagination-container');
        this.elements.visitHistoryList = document.getElementById('visit-history');
        this.elements.pavilionsView = document.getElementById('pavilions-view');
        this.elements.historyView = document.getElementById('history-view');
        this.elements.showPavilionsBtn = document.getElementById('show-pavilions-view');
        this.elements.showHistoryBtn = document.getElementById('show-history-view');
        this.elements.loginBtn = document.getElementById('login-btn');
        this.elements.logoutBtn = document.getElementById('logout-btn');
        this.elements.userInfo = document.getElementById('user-info');

        // ↓↓↓ 追加・修正 ↓↓↓
        this.elements.visitModal = document.getElementById('visit-modal');
        this.elements.visitForm = document.getElementById('visit-form'); // モーダル内のフォーム
        this.elements.modalCloseBtn = this.elements.visitModal.querySelector('.modal-close-btn');
        this.elements.pavilionNameInput = this.elements.visitForm.querySelector('#pavilion-name');
        this.elements.visitDateInput = this.elements.visitForm.querySelector('#visit-date');
        this.elements.waitTimeInput = this.elements.visitForm.querySelector('#wait-time');
        this.elements.reviewTextInput = this.elements.visitForm.querySelector('#review-text');
        // ↑↑↑ 追加・修正 ↑↑↑
    },
    addEventListeners() {
        this.elements.showPavilionsBtn.addEventListener('click', () => ExpoApp.ui.switchView('pavilions'));
        this.elements.showHistoryBtn.addEventListener('click', () => ExpoApp.ui.switchView('history'));
        this.elements.searchInput.addEventListener('input', (event) => ExpoApp.handlers.handleSearchInput(event));
        this.elements.pavilionList.addEventListener('click', (event) => ExpoApp.handlers.handlePavilionClick(event));
        this.elements.visitForm.addEventListener('submit', (event) => ExpoApp.handlers.handleVisitFormSubmit(event));
        this.elements.visitHistoryList.addEventListener('click', (event) => ExpoApp.handlers.handleHistoryItemClick(event));
        this.elements.loginBtn.addEventListener('click', () => ExpoApp.handlers.handleLogin());
        this.elements.logoutBtn.addEventListener('click', () => ExpoApp.handlers.handleLogout());

        // ↓↓↓ 追加・修正 ↓↓↓
        this.elements.modalCloseBtn.addEventListener('click', () => ExpoApp.ui.closeVisitModal());
        // モーダルオーバーレイをクリックで閉じる
        this.elements.visitModal.addEventListener('click', (event) => {
            if (event.target === ExpoApp.elements.visitModal) {
                ExpoApp.ui.closeVisitModal();
            }
        });
        // ↑↑↑ 追加・修正 ↑↑↑
    },
    setupAuthObserver() {
        onAuthStateChanged(firebaseAuth, user => {
            ExpoApp.state.currentUser = user;
            ExpoApp.ui.updateLoginStatus();
            // 履歴タブ表示時に renderVisitHistory が呼ばれるので、ここでは不要
            // ExpoApp.ui.renderVisitHistory(); 
        });
    },
    api: {
        async fetchPavilions() {
            const response = await fetch('/pavilions.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
    },
    handlers: {
        handleSearchInput(event) {
            const searchTerm = event.target.value.toLowerCase();
            ExpoApp.state.filteredPavilions = ExpoApp.state.allPavilions.filter(pavilion =>
                pavilion.name.toLowerCase().includes(searchTerm) ||
                (pavilion.searchTags && pavilion.searchTags.some(tag => tag.toLowerCase().includes(searchTerm)))
            );
            ExpoApp.state.currentPage = 1;
            ExpoApp.ui.renderPavilions();
        },
        handlePavilionClick(event) {
            if (event.target.classList.contains('add-to-history-btn')) {
                const pavilionName = event.target.dataset.pavilionName;
                
                // ↓↓↓ フォームではなくモーダルを開く ↓↓↓
                ExpoApp.ui.openVisitModal(pavilionName);
                // ↑↑↑ フォームではなくモーダルを開く ↑↑↑
            }
        },
        async handleVisitFormSubmit(event) {
            event.preventDefault();
            if (!ExpoApp.state.currentUser) {
                alert("履歴を保存するには、まずログインしてください。");
                return;
            }
            // form要素全体ではなく、各入力フィールドをelementsから参照
            const visitData = {
                userId: ExpoApp.state.currentUser.uid,
                name: ExpoApp.elements.pavilionNameInput.value,
                date: ExpoApp.elements.visitDateInput.value,
                waitTime: ExpoApp.elements.waitTimeInput.value,
                review: ExpoApp.elements.reviewTextInput.value,
                createdAt: new Date()
            };
            if (visitData.name && visitData.date) {
                try {
                    await addDoc(collection(firestoreDB, "visits"), visitData);
                    ExpoApp.elements.visitForm.reset(); // フォームをリセット
                    ExpoApp.ui.closeVisitModal(); // モーダルを閉じる
                    ExpoApp.ui.renderVisitHistory(); // 履歴を再描画
                    alert('履歴をデータベースに保存しました！');
                } catch (error) {
                    console.error("データの保存に失敗しました:", error);
                    alert('データの保存に失敗しました。');
                }
            } else {
                alert('パビリオン名と訪問日は必須です。');
            }
        },
        async handleHistoryItemClick(event) {
            if (event.target.classList.contains('delete-button')) {
                if (!ExpoApp.state.currentUser) { return; }
                const documentId = event.target.dataset.id;
                if (confirm('この履歴を本当に削除しますか？')) {
                    try {
                        await deleteDoc(doc(firestoreDB, "visits", documentId));
                        alert('履歴を削除しました。');
                        ExpoApp.ui.renderVisitHistory();
                    } catch (error) {
                        console.error("削除に失敗しました:", error);
                    }
                }
            }
        },
        async handleLogin() {
            const provider = new GoogleAuthProvider();
            try {
                await signInWithPopup(firebaseAuth, provider);
            } catch (error) {
                console.error("ログインエラー", error);
                alert("ログインに失敗しました。");
            }
        },
        async handleLogout() {
            try {
                await signOut(firebaseAuth);
            } catch (error) {
                console.error("ログアウトエラー", error);
                alert("ログアウトに失敗しました。");
            }
        },
    },
    ui: {
        updateLoginStatus() {
            const user = ExpoApp.state.currentUser;
            if (user) {
                ExpoApp.elements.userInfo.innerHTML = `<img src="${user.photoURL}" alt="プロフィール写真"><span>${user.displayName}</span>`;
                ExpoApp.elements.loginBtn.style.display = 'none';
                ExpoApp.elements.logoutBtn.style.display = 'block';
            } else {
                ExpoApp.elements.userInfo.innerHTML = '';
                ExpoApp.elements.loginBtn.style.display = 'block';
                ExpoApp.elements.logoutBtn.style.display = 'none';
            }
        },
        switchView(viewNameToShow) {
            const { pavilionsView, historyView, showPavilionsBtn, showHistoryBtn } = ExpoApp.elements;
            const isHistoryView = viewNameToShow === 'history';
            pavilionsView.style.display = isHistoryView ? 'none' : 'block';
            historyView.style.display = isHistoryView ? 'block' : 'none';
            showPavilionsBtn.classList.toggle('active', !isHistoryView);
            showHistoryBtn.classList.toggle('active', isHistoryView);
            // 履歴タブに切り替わった時のみ履歴をレンダリングする
            if (isHistoryView) { ExpoApp.ui.renderVisitHistory(); }
        },
        renderPavilions() {
            const { pavilionList } = ExpoApp.elements;
            const { currentPage, filteredPavilions } = ExpoApp.state;
            const { itemsPerPage } = ExpoApp.config;
            pavilionList.innerHTML = "";
            const startIndex = (currentPage - 1) * itemsPerPage;
            const paginatedItems = filteredPavilions.slice(startIndex, startIndex + itemsPerPage);
            if (paginatedItems.length === 0) {
                pavilionList.innerHTML = '<p>該当するパビリオンが見つかりません。</p>';
                return;
            }
            const fragment = document.createDocumentFragment();
            paginatedItems.forEach(pavilion => {
                const pavilionCard = ExpoApp.ui.createPavilionCard(pavilion);
                fragment.appendChild(pavilionCard);
            });
            pavilionList.appendChild(fragment);
            ExpoApp.ui.renderPagination();
        },
        createPavilionCard(pavilion) {
            const pavilionCard = document.createElement('div');
            pavilionCard.className = 'pavilion-card';
            const { areaMap } = ExpoApp.config;
            const imageUrl = pavilion.imageFile 
                ? `/images/${pavilion.imageFile}`
                : `https://placehold.jp/30/cccccc/ffffff/400x200.png?text=${encodeURIComponent(pavilion.name)}`;
            const reservationText = pavilion.reservation && pavilion.reservation.some(r => r === 'reservation-a' || r === 'reservation-b') 
                ? '<span class="tag reservation">要予約</span>' 
                : '<span class="tag">予約不要</span>';
            const location = `${areaMap[pavilion.area] || 'その他'}ゾーン / ${pavilion.building || 'N/A'}`;
            pavilionCard.innerHTML = `
                <a href="${pavilion.url}" target="_blank" rel="noopener noreferrer">
                    <img src="${imageUrl}" alt="${pavilion.name}" class="card-header-image">
                </a>
                <div class="card-content">
                    <h3>${pavilion.name}</h3>
                    <p><strong>場所:</strong> ${location}</p>
                    <p><strong>所要時間:</strong> 約${pavilion.duration || 'N/A'}分</p>
                    <p><strong>予約:</strong> ${reservationText}</p>
                    <div class="card-footer">
                        <button class="add-to-history-btn" data-pavilion-name="${pavilion.name}">訪問履歴に追加</button>
                    </div>
                </div>`;
            return pavilionCard;
        },
        renderPagination() {
            const { paginationContainer } = ExpoApp.elements;
            const { currentPage, filteredPavilions } = ExpoApp.state;
            const { itemsPerPage } = ExpoApp.config;
            paginationContainer.innerHTML = "";
            const pageCount = Math.ceil(filteredPavilions.length / itemsPerPage);
            if (pageCount <= 1) return;
            for (let i = 1; i <= pageCount; i++) {
                const button = document.createElement('button');
                button.className = 'page-btn';
                button.innerText = i;
                if (i === currentPage) { button.classList.add('active'); }
                button.addEventListener('click', () => {
                    ExpoApp.state.currentPage = i;
                    ExpoApp.ui.renderPavilions();
                });
                paginationContainer.appendChild(button);
            }
        },
        async renderVisitHistory() {
            const { visitHistoryList } = ExpoApp.elements;
            const user = ExpoApp.state.currentUser;
            console.log("renderVisitHistory called. User:", user ? user.uid : "No user");
            if (!user) {
                visitHistoryList.innerHTML = '<p style="text-align: center; color: #6c757d;">ログインすると、あなたの訪問履歴が表示されます。</p>';
                return;
            }
            visitHistoryList.innerHTML = '<p style="text-align: center; color: #6c757d;">データを読み込み中...</p>';
            try {
                const historyQuery = query(collection(firestoreDB, "visits"), where("userId", "==", user.uid), orderBy("createdAt", "desc"));
                const querySnapshot = await getDocs(historyQuery);
                const visits = [];
                console.log("Query Snapshot size:", querySnapshot.size);
                querySnapshot.forEach((doc) => {
                    visits.push({ id: doc.id, ...doc.data() });
                    console.log("Fetched visit:", doc.data());
                });
                console.log("Total visits fetched:", visits.length);

                visitHistoryList.innerHTML = '';
                if (visits.length === 0) {
                    visitHistoryList.innerHTML = '<p style="text-align: center; color: #6c757d;">まだ訪問履歴がありません。</p>';
                    return;
                }
                const fragment = document.createDocumentFragment();
                visits.forEach(visit => {
                    const historyItem = document.createElement('li');
                    historyItem.className = 'history-card';
                    historyItem.innerHTML = `
                        <div class="info">
                            <strong>${visit.name}</strong><span class="date">${visit.date}</span>
                            <p class="details">${visit.waitTime ? `待ち時間: <strong>${visit.waitTime}</strong>分` : ''}</p>
                            ${visit.review ? `<p class="review">${visit.review}</p>` : ''}
                        </div>
                        <button class="delete-button" data-id="${visit.id}">削除</button>`;
                    fragment.appendChild(historyItem);
                });
                visitHistoryList.appendChild(fragment);
            } catch (error) {
                console.error("履歴の読み込みに失敗しました:", error);
                visitHistoryList.innerHTML = '<p style="text-align: center; color: #dc3545;">履歴の読み込み中にエラーが発生しました。</p>';
            }
        },
        // ↓↓↓ 追加・修正 ↓↓↓
        openVisitModal(pavilionName = '') {
            // ログインしていない場合はモーダルを開かずにリターンする
            if (!ExpoApp.state.currentUser) {
                alert("履歴を追加するには、まずログインしてください。");
                return; // ここで処理を終了
            }
            ExpoApp.elements.pavilionNameInput.value = pavilionName;
            ExpoApp.elements.visitDateInput.valueAsDate = new Date(); // 今日の日付を自動入力
            ExpoApp.elements.waitTimeInput.value = ''; // 待ち時間をクリア
            ExpoApp.elements.reviewTextInput.value = ''; // レビューをクリア
            ExpoApp.elements.visitModal.style.display = 'flex'; // ポップアップを表示
            ExpoApp.elements.waitTimeInput.focus(); // 待ち時間入力欄にフォーカス
        },
        closeVisitModal() {
            ExpoApp.elements.visitModal.style.display = 'none'; // ポップアップを非表示
            ExpoApp.elements.visitForm.reset(); // フォームの内容をリセット
        }
        // ↑↑↑ 追加・修正 ↑↑↑
    },
};

document.addEventListener('DOMContentLoaded', () => ExpoApp.initialize());