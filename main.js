// =================================================================================
// Firebase SDKのインポートと初期化
// =================================================================================
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, doc, deleteDoc, where, getDoc, updateDoc } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence } from "firebase/auth";

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
    constants: {
        COLLECTIONS: {
            VISITS: 'visits',
            WISHES: 'wishes',
        }
    },
    state: {
        allPavilions: [],
        filteredPavilions: [],
        wishlist: [],
        currentPage: 1,
        currentUser: null,
        visitCount: 0,
    },
    config: {
        itemsPerPage: 20,
        areaMap: { "signature": "シグネチャー", "empowering": "いのちを育む", "future": "未来の社会", "saving": "いのちを守る", "co-creation": "共創", "water": "ウォーターワールド" }
    },
    elements: {},

    async initialize() {
        this.cacheDOMElements();
        this.addEventListeners();
        this.setupAuthObserver();
        try {
            this.state.allPavilions = await this.api.fetchPavilions();
            this.state.filteredPavilions = [...this.state.allPavilions];
            this.ui.renderPavilions();
            this.ui.updateConquestCounter();
        } catch (error) {
            console.error("パビリオンデータの読み込みに失敗しました:", error);
        }
    },

    cacheDOMElements() {
        const D = document;
        this.elements = {
            pavilionsView: D.getElementById('pavilions-view'),
            historyView: D.getElementById('history-view'),
            wishlistView: D.getElementById('wishlist-view'),
            showPavilionsBtn: D.getElementById('show-pavilions-view'),
            showHistoryBtn: D.getElementById('show-history-view'),
            showWishlistBtn: D.getElementById('show-wishlist-view'),
            loginBtn: D.getElementById('login-btn'),
            pavilionList: D.getElementById('pavilionList'),
            visitHistoryList: D.getElementById('visit-history'),
            wishlistList: D.getElementById('wishlist'),
            paginationContainer: D.getElementById('pagination-container'),
            searchInput: D.getElementById('searchInput'),
            visitModal: D.getElementById('visit-modal'),
            visitForm: D.getElementById('visit-form'),
            editModal: D.getElementById('edit-modal'),
            editForm: D.getElementById('edit-form'),
            userInfo: D.getElementById('user-info'),
            conquestCounter: D.getElementById('conquest-counter'),
            accountPopup: D.getElementById('account-popup'),
            popupUserInfo: D.getElementById('popup-user-info'),
            popupLogoutBtn: D.getElementById('popup-logout-btn'),
        };
    },

    addEventListeners() {
        const { elements } = this;
        elements.showPavilionsBtn.addEventListener('click', () => ExpoApp.ui.switchView('pavilions'));
        elements.showWishlistBtn.addEventListener('click', () => ExpoApp.ui.switchView('wishlist'));
        elements.showHistoryBtn.addEventListener('click', () => ExpoApp.ui.switchView('history'));
        elements.searchInput.addEventListener('input', (event) => ExpoApp.handlers.handleSearchInput(event));
        elements.pavilionList.addEventListener('click', (event) => ExpoApp.handlers.handlePavilionClick(event));
        elements.visitHistoryList.addEventListener('click', (event) => ExpoApp.handlers.handleHistoryItemClick(event));
        elements.wishlistList.addEventListener('click', (event) => ExpoApp.handlers.handleWishlistItemClick(event));
        elements.loginBtn.addEventListener('click', () => ExpoApp.handlers.handleLogin());
        elements.userInfo.addEventListener('click', (event) => {
            event.stopPropagation();
            ExpoApp.ui.toggleAccountPopup();
        });
        elements.popupLogoutBtn.addEventListener('click', () => ExpoApp.handlers.handleLogout());
        document.addEventListener('click', (event) => {
            if (elements.accountPopup && !elements.accountPopup.contains(event.target) && !elements.userInfo.contains(event.target)) {
                ExpoApp.ui.toggleAccountPopup(false);
            }
        });
        elements.visitForm.addEventListener('submit', (event) => ExpoApp.handlers.handleVisitFormSubmit(event));
        elements.editForm.addEventListener('submit', (event) => ExpoApp.handlers.handleEditFormSubmit(event));
        const closeModalHandler = (modal) => (event) => {
            if (event.target.classList.contains('modal-overlay') || event.target.classList.contains('modal-close-btn')) {
                modal.style.display = 'none';
            }
        };
        elements.visitModal.addEventListener('click', closeModalHandler(elements.visitModal));
        elements.editModal.addEventListener('click', closeModalHandler(elements.editModal));
    },

    setupAuthObserver() {
        onAuthStateChanged(firebaseAuth, (user) => {
            ExpoApp.state.currentUser = user;
            ExpoApp.ui.updateLoginStatus();
            ExpoApp.ui.renderVisitHistory();
            ExpoApp.ui.renderWishlist();
        });
    },

    api: {
        async fetchPavilions() {
            const response = await fetch('/pavilions.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        },
        async fetchWishes(userId) {
            const q = query(collection(firestoreDB, ExpoApp.constants.COLLECTIONS.WISHES), where("userId", "==", userId), orderBy("createdAt", "desc"));
            const querySnapshot = await getDocs(q);
            const wishes = [];
            querySnapshot.forEach((doc) => wishes.push({ id: doc.id, ...doc.data() }));
            return wishes;
        },
    },

    handlers: {
        async handleLogin() {
            try {
                await setPersistence(firebaseAuth, browserLocalPersistence);
                await signInWithPopup(firebaseAuth, new GoogleAuthProvider());
            } catch (error) {
                console.error("ログインエラー", error);
            }
        },
        async handleLogout() {
            try {
                await signOut(firebaseAuth);
                ExpoApp.ui.toggleAccountPopup(false);
            } catch (error) {
                console.error("ログアウトエラー", error);
            }
        },
        handleSearchInput(event) {
            const searchTerm = event.target.value.toLowerCase();
            ExpoApp.state.filteredPavilions = ExpoApp.state.allPavilions.filter(p =>
                p.name.toLowerCase().includes(searchTerm) || p.searchTags?.some(t => t.toLowerCase().includes(searchTerm))
            );
            ExpoApp.state.currentPage = 1;
            ExpoApp.ui.renderPavilions();
        },
        handlePavilionClick(event) {
            const pavilionName = event.target.dataset.pavilionName;
            if (event.target.classList.contains("add-to-history-btn")) {
                ExpoApp.ui.openVisitModal(pavilionName);
            }
            if (event.target.classList.contains("add-to-wishlist-btn")) {
                ExpoApp.handlers.handleAddWish(pavilionName);
            }
        },
        handleHistoryItemClick(event) {
            const docId = event.target.dataset.id;
            if (event.target.classList.contains("delete-button")) {
                ExpoApp.handlers.handleDeleteHistory(docId);
            }
            if (event.target.classList.contains("edit-button")) {
                ExpoApp.ui.openEditModal(docId);
            }
        },
        handleWishlistItemClick(event) {
            const pavilionName = event.target.dataset.pavilionName;
            if (event.target.classList.contains("delete-wish-btn")) {
                ExpoApp.handlers.handleDeleteWish(event.target.dataset.id);
            }
            if (event.target.classList.contains("move-to-history-btn")) {
                ExpoApp.ui.openVisitModal(pavilionName);
            }
        },
        async handleVisitFormSubmit(event) {
            event.preventDefault();
            const { currentUser } = ExpoApp.state;
            if (!currentUser) return alert("ログインしてください。");
            const form = ExpoApp.elements.visitForm;
            const visitData = {
                userId: currentUser.uid,
                name: form.querySelector("#pavilion-name").value,
                date: form.querySelector("#visit-date").value,
                waitTime: form.querySelector("#wait-time").value,
                review: form.querySelector("#review-text").value,
                createdAt: new Date(),
            };
            if (visitData.name && visitData.date) {
                try {
                    await addDoc(collection(firestoreDB, ExpoApp.constants.COLLECTIONS.VISITS), visitData);
                    ExpoApp.ui.closeVisitModal();
                    ExpoApp.ui.renderVisitHistory();
                } catch (error) {
                    console.error("訪問履歴の保存に失敗:", error);
                }
            }
        },
        async handleEditFormSubmit(event) {
            event.preventDefault();
            const form = ExpoApp.elements.editForm;
            const docId = form.querySelector("#edit-doc-id").value;
            if (!docId) return;
            const updatedData = {
                date: form.querySelector("#edit-visit-date").value,
                waitTime: form.querySelector("#edit-wait-time").value,
                review: form.querySelector("#edit-review-text").value,
            };
            try {
                await updateDoc(doc(firestoreDB, ExpoApp.constants.COLLECTIONS.VISITS, docId), updatedData);
                ExpoApp.ui.closeEditModal();
                ExpoApp.ui.renderVisitHistory();
            } catch (error) {
                console.error("履歴の更新に失敗:", error);
            }
        },
        async handleDeleteHistory(docId) {
            if (!confirm("この履歴を本当に削除しますか？")) return;
            try {
                await deleteDoc(doc(firestoreDB, ExpoApp.constants.COLLECTIONS.VISITS, docId));
                ExpoApp.ui.renderVisitHistory();
            } catch (error) {
                console.error("履歴の削除に失敗:", error);
            }
        },
        async handleAddWish(pavilionName) {
            const { currentUser, wishlist } = ExpoApp.state;
            if (!currentUser) return alert("ログインしてください。");
            if (wishlist.some(item => item.pavilionName === pavilionName)) return alert("既に行きたいリストに追加されています。");
            const wishData = { userId: currentUser.uid, pavilionName, createdAt: new Date() };
            try {
                await addDoc(collection(firestoreDB, ExpoApp.constants.COLLECTIONS.WISHES), wishData);
                ExpoApp.ui.renderWishlist();
            } catch (error) {
                console.error("行きたいリストへの追加に失敗:", error);
            }
        },
        async handleDeleteWish(docId) {
            if (!confirm("このパビリオンを行きたいリストから削除しますか？")) return;
            try {
                await deleteDoc(doc(firestoreDB, ExpoApp.constants.COLLECTIONS.WISHES, docId));
                ExpoApp.ui.renderWishlist();
            } catch (error) {
                console.error("行きたいリストからの削除に失敗:", error);
            }
        },
    },

    ui: {
        updateLoginStatus() {
            const { currentUser } = ExpoApp.state;
            const { userInfo, loginBtn, popupUserInfo } = ExpoApp.elements;
            if (currentUser) {
                userInfo.innerHTML = `<img src="${currentUser.photoURL}" alt="プロフィール写真">`;
                loginBtn.style.display = 'none';
                userInfo.style.display = 'flex';
                popupUserInfo.innerHTML = `<img src="${currentUser.photoURL}" alt=""><div class="name">${currentUser.displayName}</div><div class="email">${currentUser.email}</div>`;
            } else {
                userInfo.style.display = 'none';
                loginBtn.style.display = 'block';
                ExpoApp.ui.toggleAccountPopup(false);
                ExpoApp.state.visitCount = 0;
                ExpoApp.ui.updateConquestCounter();
            }
        },
        switchView(viewNameToShow) {
            const { pavilionsView, historyView, wishlistView, showPavilionsBtn, showHistoryBtn, showWishlistBtn } = ExpoApp.elements;
            const views = {
                pavilions: { view: pavilionsView, btn: showPavilionsBtn },
                history: { view: historyView, btn: showHistoryBtn, renderFn: ExpoApp.ui.renderVisitHistory },
                wishlist: { view: wishlistView, btn: showWishlistBtn, renderFn: ExpoApp.ui.renderWishlist }
            };
            for (const key in views) {
                const isTargetView = key === viewNameToShow;
                views[key].view.style.display = isTargetView ? 'block' : 'none';
                views[key].btn.classList.toggle('active', isTargetView);
                if (isTargetView && views[key].renderFn) {
                    views[key].renderFn();
                }
            }
        },
        async renderVisitHistory() {
            const { visitHistoryList } = ExpoApp.elements;
            const { currentUser } = ExpoApp.state;
            if (!currentUser) {
                visitHistoryList.innerHTML = '<p style="text-align: center;">ログインすると履歴が表示されます。</p>';
                return;
            }
            visitHistoryList.innerHTML = '<p style="text-align: center;">データを読み込み中...</p>';
            const q = query(collection(firestoreDB, ExpoApp.constants.COLLECTIONS.VISITS), where("userId", "==", currentUser.uid));
            const querySnapshot = await getDocs(q);
            const uniqueVisitNames = new Set();
            const visitsForRender = [];
            querySnapshot.forEach(doc => {
                const visitData = doc.data();
                uniqueVisitNames.add(visitData.name);
                visitsForRender.push({ id: doc.id, ...visitData });
            });
            ExpoApp.state.visitCount = uniqueVisitNames.size;
            ExpoApp.ui.updateConquestCounter();
            visitsForRender.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
            visitHistoryList.innerHTML = "";
            if (visitsForRender.length === 0) {
                visitHistoryList.innerHTML = '<p style="text-align: center;">まだ訪問履歴がありません。</p>';
                return;
            }
            const fragment = document.createDocumentFragment();
            visitsForRender.forEach(visit => {
                const item = document.createElement("li");
                item.className = "history-card";
                item.innerHTML = `
                    <div class="info">
                        <strong>${visit.name}</strong><span class="date">${visit.date}</span>
                        <p class="details">${visit.waitTime ? `待ち時間: <strong>${visit.waitTime}</strong>分` : ""}</p>
                        ${visit.review ? `<p class="review">${visit.review}</p>` : ""}
                    </div>
                    <div class="actions">
                        <button class="edit-button" data-id="${visit.id}">編集</button>
                        <button class="delete-button" data-id="${visit.id}">削除</button>
                    </div>`;
                fragment.appendChild(item);
            });
            visitHistoryList.appendChild(fragment);
        },
        renderPavilions() {
            const { pavilionList } = ExpoApp.elements;
            const { currentPage, filteredPavilions, wishlist } = ExpoApp.state;
            const { itemsPerPage, areaMap } = ExpoApp.config;
            pavilionList.innerHTML = "";
            const startIndex = (currentPage - 1) * itemsPerPage;
            const paginatedItems = filteredPavilions.slice(startIndex, startIndex + itemsPerPage);
            if (paginatedItems.length === 0) {
                pavilionList.innerHTML = "<p>該当するパビリオンが見つかりません。</p>";
                return;
            }
            const fragment = document.createDocumentFragment();
            paginatedItems.forEach(pavilion => {
                const card = ExpoApp.ui.createPavilionCard(pavilion);
                fragment.appendChild(card);
            });
            pavilionList.appendChild(fragment);
            ExpoApp.ui.renderPagination();
        },
        createPavilionCard(pavilion) {
            const { wishlist } = ExpoApp.state;
            const { areaMap } = ExpoApp.config;
            const card = document.createElement("div");
            card.className = "pavilion-card";
            const imageUrl = pavilion.imageFile ? `/images/${pavilion.imageFile}` : `https://placehold.jp/30/cccccc/ffffff/400x200.png?text=${encodeURIComponent(pavilion.name)}`;
            const reservationText = pavilion.reservation?.some(r => r.startsWith("reservation")) ? '<span class="tag reservation">要予約</span>' : '<span class="tag">予約不要</span>';
            const location = `${areaMap[pavilion.area] || "その他"}ゾーン / ${pavilion.building || "N/A"}`;
            const isInWishlist = wishlist.some(item => item.pavilionName === pavilion.name);
            card.innerHTML = `
                <a href="${pavilion.url}" target="_blank" rel="noopener noreferrer"><img src="${imageUrl}" alt="${pavilion.name}" class="card-header-image"></a>
                <div class="card-content">
                    <h3>${pavilion.name}</h3>
                    <p><strong>場所:</strong> ${location}</p>
                    <p><strong>所要時間:</strong> 約${pavilion.duration || "N/A"}分</p>
                    <p><strong>予約:</strong> ${reservationText}</p>
                    <div class="card-footer">
                        <button class="add-to-wishlist-btn ${isInWishlist ? "added" : ""}" data-pavilion-name="${pavilion.name}">${isInWishlist ? "追加済み" : "行きたい！"}</button>
                        <button class="add-to-history-btn" data-pavilion-name="${pavilion.name}">訪問履歴に追加</button>
                    </div>
                </div>`;
            return card;
        },
        renderPagination() {
            const { paginationContainer } = ExpoApp.elements;
            const { filteredPavilions, currentPage } = ExpoApp.state;
            const { itemsPerPage } = ExpoApp.config;
            paginationContainer.innerHTML = "";
            const pageCount = Math.ceil(filteredPavilions.length / itemsPerPage);
            if (pageCount <= 1) return;
            for (let i = 1; i <= pageCount; i++) {
                const button = document.createElement("button");
                button.className = "page-btn";
                button.innerText = i;
                if (i === currentPage) button.classList.add("active");
                button.addEventListener("click", () => {
                    ExpoApp.state.currentPage = i;
                    ExpoApp.ui.renderPavilions();
                });
                paginationContainer.appendChild(button);
            }
        },
        async renderWishlist() {
            const { wishlistList } = ExpoApp.elements;
            const { currentUser, allPavilions } = ExpoApp.state;
            if (!currentUser) {
                wishlistList.innerHTML = '<p style="text-align: center;">ログインすると「行きたいリスト」が表示されます。</p>';
                return;
            }
            wishlistList.innerHTML = '<p style="text-align: center;">データを読み込み中...</p>';
            try {
                const wishes = await ExpoApp.api.fetchWishes(currentUser.uid);
                ExpoApp.state.wishlist = wishes;
                wishlistList.innerHTML = "";
                if (wishes.length === 0) {
                    wishlistList.innerHTML = '<p style="text-align: center;">まだ「行きたいリスト」に登録されていません。</p>';
                } else {
                    const fragment = document.createDocumentFragment();
                    wishes.forEach(wish => {
                        const pavilion = allPavilions.find(p => p.name === wish.pavilionName);
                        if (pavilion) {
                            fragment.appendChild(ExpoApp.ui.createWishlistItemCard(pavilion, wish.id));
                        }
                    });
                    wishlistList.appendChild(fragment);
                }
                ExpoApp.ui.renderPavilions();
            } catch (error) {
                console.error("行きたいリストの読み込みに失敗しました:", error);
                wishlistList.innerHTML = '<p style="text-align: center;">リストの読み込みに失敗しました。</p>';
            }
        },
        createWishlistItemCard(pavilion, docId) {
            const { areaMap } = ExpoApp.config;
            const listItem = document.createElement("li");
            listItem.className = "wishlist-card";
            const location = `${areaMap[pavilion.area] || "その他"}ゾーン / ${pavilion.building || "N/A"}`;
            const imageUrl = pavilion.imageFile ? `/images/${pavilion.imageFile}` : `https://placehold.jp/30/cccccc/ffffff/200x120.png?text=${encodeURIComponent(pavilion.name)}`;
            listItem.innerHTML = `
                <img src="${imageUrl}" alt="${pavilion.name}" class="wishlist-card-image">
                <div class="info">
                    <h3>${pavilion.name}</h3>
                    <p><strong>場所:</strong> ${location}</p>
                    <p><strong>所要時間:</strong> 約${pavilion.duration || "N/A"}分</p>
                </div>
                <div class="actions">
                    <button class="move-to-history-btn" data-pavilion-name="${pavilion.name}">履歴に追加</button>
                    <button class="delete-wish-btn" data-id="${docId}">削除</button>
                </div>`;
            return listItem;
        },
        updateConquestCounter() {
            const { conquestCounter } = ExpoApp.elements;
            const { visitCount, allPavilions, currentUser } = ExpoApp.state;
            if (currentUser && allPavilions.length > 0) {
                conquestCounter.innerHTML = `
                    <span class="count">${visitCount}</span>
                    <span class="total">/ ${allPavilions.length}</span>
                    <span class="label">制覇</span>`;
                conquestCounter.style.display = 'flex';
            } else {
                conquestCounter.style.display = 'none';
            }
        },
        toggleAccountPopup(forceShow) {
            const { accountPopup } = ExpoApp.elements;
            if (!accountPopup) return;
            const isVisible = accountPopup.style.display === 'block';
            if (typeof forceShow === 'boolean') {
                accountPopup.style.display = forceShow ? 'block' : 'none';
            } else {
                accountPopup.style.display = isVisible ? 'none' : 'block';
            }
        },
        openVisitModal(pavilionName) {
            if (!ExpoApp.state.currentUser) return alert("ログインしてください。");
            const { visitModal, visitForm } = ExpoApp.elements;
            visitForm.reset();
            visitForm.querySelector("#pavilion-name").value = pavilionName;
            visitForm.querySelector("#visit-date").valueAsDate = new Date();
            visitModal.style.display = "flex";
            visitForm.querySelector("#wait-time").focus();
        },
        closeVisitModal() {
            ExpoApp.elements.visitModal.style.display = "none";
        },
        async openEditModal(docId) {
            try {
                const docRef = doc(firestoreDB, ExpoApp.constants.COLLECTIONS.VISITS, docId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const { editModal, editForm } = ExpoApp.elements;
                    editForm.reset();
                    editForm.querySelector("#edit-doc-id").value = docId;
                    editForm.querySelector("#edit-pavilion-name").value = data.name;
                    editForm.querySelector("#edit-visit-date").value = data.date;
                    editForm.querySelector("#edit-wait-time").value = data.waitTime;
                    editForm.querySelector("#edit-review-text").value = data.review;
                    editModal.style.display = "flex";
                }
            } catch (error) {
                console.error("編集データの取得中にエラー:", error);
            }
        },
        closeEditModal() {
            ExpoApp.elements.editModal.style.display = "none";
        }
    }
};

document.addEventListener('DOMContentLoaded', () => ExpoApp.initialize());