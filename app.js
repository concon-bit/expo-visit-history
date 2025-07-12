// Firebaseの機能をインポート（読み込み）
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, doc, deleteDoc, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// あなたのWebアプリのFirebase設定
const firebaseConfig = {
    apiKey: "AIzaSyCWV5vZfEPHI5nQSCMmgIj53djL6mWY1Gw",
    authDomain: "expo-visit-history.firebaseapp.com",
    projectId: "expo-visit-history",
    storageBucket: "expo-visit-history.appspot.com",
    messagingSenderId: "581174403221",
    appId: "1:581174403221:web:05594f61aace62392c7b9c",
    measurementId: "G-5RGXKEE0WK"
};

// Firebaseの初期化
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);


/**
 * 万博パビリオン履歴管理アプリケーション
 * @namespace ExpoApp
 */
const ExpoApp = {
    state: {
        allPavilions: [],
        filteredPavilions: [],
        currentPage: 1,
        currentUser: null,
    },
    config: {
        itemsPerPage: 20,
        areaMap: {
            "signature": "シグネチャー",
            "empowering": "いのちを育む",
            "future": "未来の社会",
            "saving": "いのちを守る",
            "co-creation": "共創",
            "water": "ウォーターワールド"
        }
    },
    elements: {
        searchInput: null, pavilionList: null, paginationContainer: null, visitForm: null, visitHistoryList: null,
        pavilionsView: null, historyView: null, showPavilionsBtn: null, showHistoryBtn: null,
        loginBtn: null, logoutBtn: null, userInfo: null,
    },
    async init() {
        this.cacheDOMElements();
        this.setupEventListeners();
        this.setupAuthObserver();
        try {
            this.state.allPavilions = await this.api.fetchPavilions();
            this.state.filteredPavilions = [...this.state.allPavilions];
            this.ui.renderPavilions();
        } catch (error) {
            console.error("アプリケーションの初期化に失敗しました:", error);
            this.elements.pavilionList.innerHTML = "<p>データの読み込みに失敗しました。ページを再読み込みしてください。</p>";
        }
    },
    cacheDOMElements() {
        this.elements.searchInput = document.getElementById('searchInput');
        this.elements.pavilionList = document.getElementById('pavilionList');
        this.elements.paginationContainer = document.getElementById('pagination-container');
        this.elements.visitForm = document.getElementById('visit-form');
        this.elements.visitHistoryList = document.getElementById('visit-history');
        this.elements.pavilionsView = document.getElementById('pavilions-view');
        this.elements.historyView = document.getElementById('history-view');
        this.elements.showPavilionsBtn = document.getElementById('show-pavilions-view');
        this.elements.showHistoryBtn = document.getElementById('show-history-view');
        this.elements.loginBtn = document.getElementById('login-btn');
        this.elements.logoutBtn = document.getElementById('logout-btn');
        this.elements.userInfo = document.getElementById('user-info');
    },
    setupEventListeners() {
        this.elements.showPavilionsBtn.addEventListener('click', () => ExpoApp.ui.switchView('pavilions'));
        this.elements.showHistoryBtn.addEventListener('click', () => ExpoApp.ui.switchView('history'));
        this.elements.searchInput.addEventListener('input', ExpoApp.handlers.handleSearch.bind(this));
        this.elements.pavilionList.addEventListener('click', ExpoApp.handlers.handlePavilionClick.bind(this));
        this.elements.visitForm.addEventListener('submit', ExpoApp.handlers.handleFormSubmit.bind(this));
        this.elements.visitHistoryList.addEventListener('click', ExpoApp.handlers.handleHistoryClick.bind(this));
        this.elements.loginBtn.addEventListener('click', ExpoApp.handlers.handleLogin.bind(this));
        this.elements.logoutBtn.addEventListener('click', ExpoApp.handlers.handleLogout.bind(this));
    },
    setupAuthObserver() {
        onAuthStateChanged(auth, user => {
            ExpoApp.state.currentUser = user;
            ExpoApp.ui.updateLoginStatus();
            ExpoApp.ui.renderHistory();
        });
    },
    api: {
        async fetchPavilions() {
            const response = await fetch('./pavilions.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
    },
    handlers: {
        handleSearch(e) {
            const searchTerm = e.target.value.toLowerCase();
            ExpoApp.state.filteredPavilions = ExpoApp.state.allPavilions.filter(p =>
                p.name.toLowerCase().includes(searchTerm) ||
                (p.searchTags && p.searchTags.some(tag => tag.toLowerCase().includes(searchTerm)))
            );
            ExpoApp.state.currentPage = 1;
            ExpoApp.ui.renderPavilions();
        },
        handlePavilionClick(e) {
            if (e.target.classList.contains('add-to-history-btn')) {
                const pavilionName = e.target.dataset.pavilionName;
                const form = ExpoApp.elements.visitForm;
                form.querySelector('#pavilion-name').value = pavilionName;
                form.querySelector('#visit-date').valueAsDate = new Date();
                ExpoApp.ui.switchView('history');
                form.querySelector('#wait-time').focus();
            }
        },
        async handleFormSubmit(e) {
            e.preventDefault();
            if (!ExpoApp.state.currentUser) {
                alert("履歴を保存するには、まずログインしてください。");
                return;
            }
            const form = ExpoApp.elements.visitForm;
            const pavilionName = form.querySelector('#pavilion-name').value;
            const visitDate = form.querySelector('#visit-date').value;
            if (pavilionName && visitDate) {
                const waitTime = form.querySelector('#wait-time').value;
                const reviewText = form.querySelector('#review-text').value;
                try {
                    await addDoc(collection(db, "visits"), {
                        userId: ExpoApp.state.currentUser.uid,
                        name: pavilionName,
                        date: visitDate,
                        waitTime: waitTime,
                        review: reviewText,
                        createdAt: new Date()
                    });
                    form.reset();
                    ExpoApp.ui.renderHistory();
                    alert('履歴をデータベースに保存しました！');
                } catch (error) {
                    console.error("データの保存に失敗しました:", error);
                    alert("エラー：データの保存に失敗しました。");
                }
            }
        },
        async handleHistoryClick(e) {
            if (e.target.classList.contains('delete-button')) {
                if (!ExpoApp.state.currentUser) {
                    alert("ログインしてください。");
                    return;
                }
                const docId = e.target.dataset.id;
                if (confirm('この履歴を本当に削除しますか？')) {
                    try {
                        await deleteDoc(doc(db, "visits", docId));
                        alert('履歴を削除しました。');
                        ExpoApp.ui.renderHistory();
                    } catch (error) {
                        console.error("削除に失敗しました:", error);
                        alert("エラー：削除に失敗しました。");
                    }
                }
            }
        },
        async handleLogin() {
            const provider = new GoogleAuthProvider();
            try {
                await signInWithPopup(auth, provider);
            } catch (error) {
                console.error("ログインエラー", error);
            }
        },
        async handleLogout() {
            try {
                await signOut(auth);
            } catch (error) {
                console.error("ログアウトエラー", error);
            }
        },
    },
    ui: {
        updateLoginStatus() {
            const user = ExpoApp.state.currentUser;
            if (user) {
                ExpoApp.elements.userInfo.innerHTML = `
                    <img src="${user.photoURL}" alt="プロフィール写真">
                    <span>${user.displayName}</span>
                `;
                ExpoApp.elements.loginBtn.style.display = 'none';
                ExpoApp.elements.logoutBtn.style.display = 'block';
            } else {
                ExpoApp.elements.userInfo.innerHTML = '';
                ExpoApp.elements.loginBtn.style.display = 'block';
                ExpoApp.elements.logoutBtn.style.display = 'none';
            }
        },
        switchView(viewName) {
            const { pavilionsView, historyView, showPavilionsBtn, showHistoryBtn } = ExpoApp.elements;
            if (viewName === 'history') {
                pavilionsView.style.display = 'none';
                historyView.style.display = 'block';
                showPavilionsBtn.classList.remove('active');
                showHistoryBtn.classList.add('active');
                ExpoApp.ui.renderHistory();
            } else {
                pavilionsView.style.display = 'block';
                historyView.style.display = 'none';
                showPavilionsBtn.classList.add('active');
                showHistoryBtn.classList.remove('active');
            }
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
            } else {
                const fragment = document.createDocumentFragment();
                paginatedItems.forEach(p => {
                    const pavilionCard = ExpoApp.ui.createPavilionCard(p);
                    fragment.appendChild(pavilionCard);
                });
                pavilionList.appendChild(fragment);
            }
            ExpoApp.ui.renderPagination();
        },
        createPavilionCard(p) {
            const pavilionCard = document.createElement('div');
            pavilionCard.className = 'pavilion-card';
            const { areaMap } = ExpoApp.config;
            const location = `${areaMap[p.area] || 'その他'}ゾーン / ${p.building || 'N/A'}`;
            const reservationText = p.reservation && p.reservation.some(r => r === 'reservation-a' || r === 'reservation-b') ? '<span class="tag reservation">要予約</span>' : '<span class="tag">予約不要</span>';
            const imageUrl = p.imageUrl || `https://placehold.jp/30/cccccc/ffffff/400x200.png?text=${encodeURIComponent(p.name)}`;
            pavilionCard.innerHTML = `
                <img src="${imageUrl}" alt="${p.name}" class="card-header-image">
                <div class="card-content">
                    <h3>${p.name}</h3>
                    <p><strong>場所:</strong> ${location}</p>
                    <p><strong>所要時間:</strong> 約${p.duration || 'N/A'}分</p>
                    <p><strong>予約:</strong> ${reservationText}</p>
                    <div class="card-footer">
                        <button class="add-to-history-btn" data-pavilion-name="${p.name}">訪問履歴に追加</button>
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
                const btn = document.createElement('button');
                btn.className = 'page-btn';
                btn.innerText = i;
                if (i === currentPage) { btn.classList.add('active'); }
                btn.addEventListener('click', () => {
                    ExpoApp.state.currentPage = i;
                    ExpoApp.ui.renderPavilions();
                });
                paginationContainer.appendChild(btn);
            }
        },
        async renderHistory() {
            const { visitHistoryList } = ExpoApp.elements;
            const user = ExpoApp.state.currentUser;

            if (!user) {
                visitHistoryList.innerHTML = '<p style="text-align: center; color: #6c757d;">ログインすると、あなたの訪問履歴が表示されます。</p>';
                return;
            }

            visitHistoryList.innerHTML = '<p style="text-align: center; color: #6c757d;">データを読み込み中...</p>';
            
            const q = query(collection(db, "visits"), where("userId", "==", user.uid), orderBy("createdAt", "desc"));
            const querySnapshot = await getDocs(q);
            const visits = [];
            querySnapshot.forEach((doc) => {
                visits.push({ id: doc.id, ...doc.data() });
            });

            visitHistoryList.innerHTML = '';
            if (visits.length === 0) {
                visitHistoryList.innerHTML = '<p style="text-align: center; color: #6c757d;">まだ訪問履歴がありません。</p>';
                return;
            }
            visits.forEach(visit => {
                const li = document.createElement('li');
                li.className = 'history-card';
                li.innerHTML = `
                    <div class="info">
                        <strong>${visit.name}</strong><span class="date">${visit.date}</span>
                        <p class="details">${visit.waitTime ? `待ち時間: <strong>${visit.waitTime}</strong>分` : ''}</p>
                        ${visit.review ? `<p class="review">${visit.review}</p>` : ''}
                    </div>
                    <button class="delete-button" data-id="${visit.id}">削除</button>`;
                visitHistoryList.appendChild(li);
            });
        }
    },
};

document.addEventListener('DOMContentLoaded', () => ExpoApp.init());