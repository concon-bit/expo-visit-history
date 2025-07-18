// =================================================================================
// Firebase SDKのインポートと初期化
// =================================================================================

import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, doc, deleteDoc, where, getDoc, updateDoc } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

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
        searchInput: null, pavilionList: null, paginationContainer: null, visitForm: null, visitHistoryList: null,
        pavilionsView: null, historyView: null, showPavilionsBtn: null, showHistoryBtn: null,
        loginBtn: null, logoutBtn: null, userInfo: null,
        visitModal: null, editModal: null, editForm: null,
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
        const D = document;
        this.elements.searchInput = D.getElementById('searchInput');
        this.elements.pavilionList = D.getElementById('pavilionList');
        this.elements.paginationContainer = D.getElementById('pagination-container');
        this.elements.visitHistoryList = D.getElementById('visit-history');
        this.elements.pavilionsView = D.getElementById('pavilions-view');
        this.elements.historyView = D.getElementById('history-view');
        this.elements.showPavilionsBtn = D.getElementById('show-pavilions-view');
        this.elements.showHistoryBtn = D.getElementById('show-history-view');
        this.elements.loginBtn = D.getElementById('login-btn');
        this.elements.logoutBtn = D.getElementById('logout-btn');
        this.elements.userInfo = D.getElementById('user-info');
        this.elements.visitModal = D.getElementById('visit-modal');
        this.elements.visitForm = D.getElementById('visit-form');
        this.elements.editModal = D.getElementById('edit-modal');
        this.elements.editForm = D.getElementById('edit-form');
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
        this.elements.visitModal.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay') || e.target.classList.contains('modal-close-btn')) {
                ExpoApp.ui.closeVisitModal();
            }
        });
        this.elements.editModal.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay') || e.target.classList.contains('modal-close-btn')) {
                ExpoApp.ui.closeEditModal();
            }
        });
        this.elements.editForm.addEventListener('submit', (event) => ExpoApp.handlers.handleEditFormSubmit(event));
    },
    setupAuthObserver() {
        onAuthStateChanged(firebaseAuth, user => {
            ExpoApp.state.currentUser = user;
            ExpoApp.ui.updateLoginStatus();
            ExpoApp.ui.renderVisitHistory();
        });
    },

    // ★★★ 修正：削除されていたapiオブジェクトを復元 ★★★
    api: {
        async fetchPavilions() {
            const response = await fetch('/pavilions.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
    },
    // ★★★ ここまで ★★★

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
                ExpoApp.ui.openVisitModal(pavilionName);
            }
        },
        async handleVisitFormSubmit(event) {
            event.preventDefault();
            if (!ExpoApp.state.currentUser) { return alert("ログインしてください。"); }
            const form = ExpoApp.elements.visitForm;
            const visitData = {
                userId: ExpoApp.state.currentUser.uid,
                name: form.querySelector('#pavilion-name').value,
                date: form.querySelector('#visit-date').value,
                waitTime: form.querySelector('#wait-time').value,
                review: form.querySelector('#review-text').value,
                createdAt: new Date()
            };
            if (visitData.name && visitData.date) {
                try {
                    await addDoc(collection(firestoreDB, "visits"), visitData);
                    ExpoApp.ui.closeVisitModal();
                    ExpoApp.ui.renderVisitHistory();
                } catch (error) { console.error("データの保存に失敗:", error); }
            }
        },
        async handleEditFormSubmit(event) {
            event.preventDefault();
            const form = ExpoApp.elements.editForm;
            const docId = form.querySelector('#edit-doc-id').value;
            if (!docId) return;
            const updatedData = {
                date: form.querySelector('#edit-visit-date').value,
                waitTime: form.querySelector('#edit-wait-time').value,
                review: form.querySelector('#edit-review-text').value,
            };
            try {
                await updateDoc(doc(firestoreDB, "visits", docId), updatedData);
                ExpoApp.ui.closeEditModal();
                ExpoApp.ui.renderVisitHistory();
            } catch (error) {
                console.error("履歴の更新に失敗:", error);
                alert("エラー：履歴の更新に失敗しました。");
            }
        },
        handleHistoryItemClick(event) {
            const target = event.target;
            if (target.classList.contains('delete-button')) {
                ExpoApp.handlers.handleDeleteHistory(target.dataset.id);
            }
            if (target.classList.contains('edit-button')) {
                ExpoApp.ui.openEditModal(target.dataset.id);
            }
        },
        async handleDeleteHistory(docId) {
            if (!ExpoApp.state.currentUser) return;
            if (confirm('この履歴を本当に削除しますか？')) {
                try {
                    await deleteDoc(doc(firestoreDB, "visits", docId));
                    ExpoApp.ui.renderVisitHistory();
                } catch (error) { console.error("削除に失敗:", error); }
            }
        },
        async handleLogin() {
            const provider = new GoogleAuthProvider();
            try { await signInWithPopup(firebaseAuth, provider); }
            catch (error) { console.error("ログインエラー", error); }
        },
        async handleLogout() {
            try { await signOut(firebaseAuth); }
            catch (error) { console.error("ログアウトエラー", error); }
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
            if (!user) {
                visitHistoryList.innerHTML = '<p style="text-align: center;">ログインすると履歴が表示されます。</p>';
                return;
            }
            visitHistoryList.innerHTML = '<p style="text-align: center;">データを読み込み中...</p>';
            const q = query(collection(firestoreDB, "visits"), where("userId", "==", user.uid), orderBy("createdAt", "desc"));
            const querySnapshot = await getDocs(q);
            const visits = [];
            querySnapshot.forEach((doc) => visits.push({ id: doc.id, ...doc.data() }));
            visitHistoryList.innerHTML = '';
            if (visits.length === 0) {
                visitHistoryList.innerHTML = '<p style="text-align: center;">まだ訪問履歴がありません。</p>';
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
                    <div class="actions">
                        <button class="edit-button" data-id="${visit.id}">編集</button>
                        <button class="delete-button" data-id="${visit.id}">削除</button>
                    </div>`;
                fragment.appendChild(historyItem);
            });
            visitHistoryList.appendChild(fragment);
        },
        openVisitModal(pavilionName) {
            if (!ExpoApp.state.currentUser) { return alert("ログインしてください。"); }
            const form = ExpoApp.elements.visitForm;
            form.reset();
            form.querySelector('#pavilion-name').value = pavilionName;
            form.querySelector('#visit-date').valueAsDate = new Date();
            ExpoApp.elements.visitModal.style.display = 'flex';
            form.querySelector('#wait-time').focus();
        },
        closeVisitModal() {
            ExpoApp.elements.visitModal.style.display = 'none';
        },
        async openEditModal(docId) {
            try {
                const docRef = doc(firestoreDB, "visits", docId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const form = ExpoApp.elements.editForm;
                    form.querySelector('#edit-doc-id').value = docId;
                    form.querySelector('#edit-pavilion-name').value = data.name;
                    form.querySelector('#edit-visit-date').value = data.date;
                    form.querySelector('#edit-wait-time').value = data.waitTime;
                    form.querySelector('#edit-review-text').value = data.review;
                    ExpoApp.elements.editModal.style.display = 'flex';
                } else {
                    alert("編集対象のデータが見つかりませんでした。");
                }
            } catch (error) {
                console.error("データ取得中にエラー:", error);
            }
        },
        closeEditModal() {
            ExpoApp.elements.editModal.style.display = 'none';
        }
    },
};

document.addEventListener('DOMContentLoaded', () => ExpoApp.initialize());