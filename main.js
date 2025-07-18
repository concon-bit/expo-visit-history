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
        COLLECTIONS: { VISITS: 'visits', WISHES: 'wishes' }
    },
    state: {
        allPavilions: [],
        filteredPavilions: [],
        wishlist: [],
        currentPage: 1,
        currentUser: null,
        visitCount: 0,
        filters: { area: 'all', reservation: 'all', sortBy: 'default' },
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
            this.ui.populateAreaFilter();
            this.ui.applyFiltersAndSort();
        } catch (error) {
            console.error("パビリオンデータの読み込みに失敗しました:", error);
        }
    },

    cacheDOMElements() {
        const D = document;
        this.elements = {
            pavilionsView: D.getElementById('pavilions-view'), historyView: D.getElementById('history-view'), wishlistView: D.getElementById('wishlist-view'),
            showPavilionsBtn: D.getElementById('show-pavilions-view'), showHistoryBtn: D.getElementById('show-history-view'), showWishlistBtn: D.getElementById('show-wishlist-view'),
            loginBtn: D.getElementById('login-btn'), pavilionList: D.getElementById('pavilionList'), visitHistoryList: D.getElementById('visit-history'),
            wishlistList: D.getElementById('wishlist'), paginationContainer: D.getElementById('pagination-container'), searchInput: D.getElementById('searchInput'),
            visitModal: D.getElementById('visit-modal'), visitForm: D.getElementById('visit-form'), editModal: D.getElementById('edit-modal'),
            editForm: D.getElementById('edit-form'), userInfo: D.getElementById('user-info'), conquestCounter: D.getElementById('conquest-counter'),
            accountPopup: D.getElementById('account-popup'), popupUserInfo: D.getElementById('popup-user-info'), popupLogoutBtn: D.getElementById('popup-logout-btn'),
            areaFilter: D.getElementById('area-filter'), reservationFilter: D.getElementById('reservation-filter'), sortBy: D.getElementById('sort-by'),
        };
    },

    addEventListeners() {
        const { elements } = this;
        elements.showPavilionsBtn.addEventListener('click', () => ExpoApp.ui.switchView('pavilions'));
        elements.showWishlistBtn.addEventListener('click', () => ExpoApp.ui.switchView('wishlist'));
        elements.showHistoryBtn.addEventListener('click', () => ExpoApp.ui.switchView('history'));
        elements.searchInput.addEventListener('input', (e) => ExpoApp.handlers.handleSearchInput(e));
        elements.pavilionList.addEventListener('click', (e) => ExpoApp.handlers.handlePavilionClick(e));
        elements.visitHistoryList.addEventListener('click', (e) => ExpoApp.handlers.handleHistoryItemClick(e));
        elements.wishlistList.addEventListener('click', (e) => ExpoApp.handlers.handleWishlistItemClick(e));
        elements.loginBtn.addEventListener('click', () => ExpoApp.handlers.handleLogin());
        elements.userInfo.addEventListener('click', (e) => { e.stopPropagation(); ExpoApp.ui.toggleAccountPopup(); });
        elements.popupLogoutBtn.addEventListener('click', () => ExpoApp.handlers.handleLogout());
        document.addEventListener('click', (e) => {
            if (elements.accountPopup && !elements.accountPopup.contains(e.target) && !elements.userInfo.contains(e.target)) {
                ExpoApp.ui.toggleAccountPopup(false);
            }
        });
        elements.visitForm.addEventListener('submit', (e) => ExpoApp.handlers.handleVisitFormSubmit(e));
        elements.editForm.addEventListener('submit', (e) => ExpoApp.handlers.handleEditFormSubmit(e));
        const closeModalHandler = (modal) => (e) => { if (e.target.classList.contains('modal-overlay') || e.target.classList.contains('modal-close-btn')) modal.style.display = 'none'; };
        elements.visitModal.addEventListener('click', closeModalHandler(elements.visitModal));
        elements.editModal.addEventListener('click', closeModalHandler(elements.editModal));
        elements.areaFilter.addEventListener('change', () => { ExpoApp.state.filters.area = ExpoApp.elements.areaFilter.value; ExpoApp.ui.applyFiltersAndSort(); });
        elements.reservationFilter.addEventListener('change', () => { ExpoApp.state.filters.reservation = ExpoApp.elements.reservationFilter.value; ExpoApp.ui.applyFiltersAndSort(); });
        elements.sortBy.addEventListener('change', () => { ExpoApp.state.filters.sortBy = ExpoApp.elements.sortBy.value; ExpoApp.ui.applyFiltersAndSort(); });
        const setupStarRating = (container) => {
            container.addEventListener('click', e => { if (e.target.matches('span')) container.dataset.rating = e.target.dataset.value; });
            container.addEventListener('mouseover', e => {
                if (e.target.matches('span')) {
                    const ratingValue = e.target.dataset.value;
                    container.querySelectorAll('span').forEach(star => { star.style.color = star.dataset.value <= ratingValue ? 'var(--star-color)' : 'var(--border-color)'; });
                }
            });
            container.addEventListener('mouseout', () => {
                const rating = container.dataset.rating;
                container.querySelectorAll('span').forEach(star => { star.style.color = star.dataset.value <= rating ? 'var(--star-color)' : 'var(--border-color)'; });
            });
        };
        setupStarRating(elements.visitForm.querySelector('.star-rating-input'));
        setupStarRating(elements.editForm.querySelector('.star-rating-input'));
    },

    setupAuthObserver() {
        onAuthStateChanged(firebaseAuth, user => {
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
            } catch (error) { console.error("ログインエラー", error); }
        },
        async handleLogout() {
            try {
                await signOut(firebaseAuth);
                ExpoApp.ui.toggleAccountPopup(false);
            } catch (error) { console.error("ログアウトエラー", error); }
        },
        handleSearchInput(event) {
            ExpoApp.state.filters.area = 'all';
            ExpoApp.state.filters.reservation = 'all';
            ExpoApp.state.filters.sortBy = 'default';
            ExpoApp.elements.areaFilter.value = 'all';
            ExpoApp.elements.reservationFilter.value = 'all';
            ExpoApp.elements.sortBy.value = 'default';
            ExpoApp.ui.applyFiltersAndSort(event.target.value);
        },
        handlePavilionClick(event) {
            const pavilionName = event.target.dataset.pavilionName;
            if (event.target.classList.contains("add-to-history-btn")) ExpoApp.ui.openVisitModal(pavilionName);
            if (event.target.classList.contains("add-to-wishlist-btn")) ExpoApp.handlers.handleAddWish(pavilionName);
        },
        handleHistoryItemClick(event) {
            const docId = event.target.dataset.id;
            if (event.target.classList.contains("delete-button")) ExpoApp.handlers.handleDeleteHistory(docId);
            if (event.target.classList.contains("edit-button")) ExpoApp.ui.openEditModal(docId);
        },
        handleWishlistItemClick(event) {
            const pavilionName = event.target.dataset.pavilionName;
            if (event.target.classList.contains("delete-wish-btn")) ExpoApp.handlers.handleDeleteWish(event.target.dataset.id);
            if (event.target.classList.contains("move-to-history-btn")) ExpoApp.ui.openVisitModal(pavilionName);
        },
        async handleVisitFormSubmit(event) {
            event.preventDefault();
            const { currentUser } = ExpoApp.state;
            if (!currentUser) return alert("ログインしてください。");
            const form = ExpoApp.elements.visitForm;
            const rating = form.querySelector('.star-rating-input').dataset.rating;
            const visitData = {
                userId: currentUser.uid, name: form.querySelector("#pavilion-name").value,
                date: form.querySelector("#visit-date").value, rating: parseInt(rating, 10) || 0,
                waitTime: form.querySelector("#wait-time").value, review: form.querySelector("#review-text").value,
                createdAt: new Date(),
            };
            if (visitData.name && visitData.date) {
                try {
                    await addDoc(collection(firestoreDB, ExpoApp.constants.COLLECTIONS.VISITS), visitData);
                    ExpoApp.ui.closeVisitModal();
                    ExpoApp.ui.renderVisitHistory();
                } catch (error) { console.error("訪問履歴の保存に失敗:", error); }
            }
        },
        async handleEditFormSubmit(event) {
            event.preventDefault();
            const form = ExpoApp.elements.editForm;
            const docId = form.querySelector("#edit-doc-id").value;
            if (!docId) return;
            const rating = form.querySelector('.star-rating-input').dataset.rating;
            const updatedData = {
                date: form.querySelector("#edit-visit-date").value,
                waitTime: form.querySelector("#edit-wait-time").value,
                review: form.querySelector("#edit-review-text").value,
                rating: parseInt(rating, 10) || 0,
            };
            try {
                await updateDoc(doc(firestoreDB, ExpoApp.constants.COLLECTIONS.VISITS, docId), updatedData);
                ExpoApp.ui.closeEditModal();
                ExpoApp.ui.renderVisitHistory();
            } catch (error) { console.error("履歴の更新に失敗:", error); }
        },
        async handleDeleteHistory(docId) {
            if (!confirm("この履歴を本当に削除しますか？")) return;
            try {
                await deleteDoc(doc(firestoreDB, ExpoApp.constants.COLLECTIONS.VISITS, docId));
                ExpoApp.ui.renderVisitHistory();
            } catch (error) { console.error("履歴の削除に失敗:", error); }
        },
        async handleAddWish(pavilionName) {
            const { currentUser, wishlist } = ExpoApp.state;
            if (!currentUser) return alert("ログインしてください。");
            if (wishlist.some(item => item.pavilionName === pavilionName)) return alert("既に行きたいリストに追加されています。");
            const wishData = { userId: currentUser.uid, pavilionName, createdAt: new Date() };
            try {
                await addDoc(collection(firestoreDB, ExpoApp.constants.COLLECTIONS.WISHES), wishData);
                ExpoApp.ui.renderWishlist();
            } catch (error) { console.error("行きたいリストへの追加に失敗:", error); }
        },
        async handleDeleteWish(docId) {
            if (!confirm("このパビリオンを行きたいリストから削除しますか？")) return;
            try {
                await deleteDoc(doc(firestoreDB, ExpoApp.constants.COLLECTIONS.WISHES, docId));
                ExpoApp.ui.renderWishlist();
            } catch (error) { console.error("行きたいリストからの削除に失敗:", error); }
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
                if (isTargetView && views[key].renderFn) views[key].renderFn();
            }
        },
        async renderVisitHistory() {
            const { visitHistoryList } = ExpoApp.elements;
            const { currentUser } = ExpoApp.state;
            if (!currentUser) { visitHistoryList.innerHTML = '<p style="text-align: center;">ログインすると履歴が表示されます。</p>'; return; }
            visitHistoryList.innerHTML = '<p style="text-align: center;">データを読み込み中...</p>';
            const q = query(collection(firestoreDB, ExpoApp.constants.COLLECTIONS.VISITS), where("userId", "==", currentUser.uid));
            const querySnapshot = await getDocs(q);
            const uniqueVisitNames = new Set();
            const visitsForRender = [];
            querySnapshot.forEach(doc => { const d = doc.data(); uniqueVisitNames.add(d.name); visitsForRender.push({ id: doc.id, ...d }); });
            ExpoApp.state.visitCount = uniqueVisitNames.size;
            ExpoApp.ui.updateConquestCounter();
            visitsForRender.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
            visitHistoryList.innerHTML = "";
            if (visitsForRender.length === 0) { visitHistoryList.innerHTML = '<p style="text-align: center;">まだ訪問履歴がありません。</p>'; return; }
            const fragment = document.createDocumentFragment();
            visitsForRender.forEach(visit => {
                const item = document.createElement("li");
                item.className = "history-card";
                const rating = visit.rating || 0;
                const starsHTML = rating > 0 ? Array.from({ length: 5 }, (_, i) => `<span class="star ${i < rating ? '' : 'empty'}">★</span>`).join('') : '';
                const waitTimeHTML = visit.waitTime ? `待ち時間: <strong>${visit.waitTime}</strong>分` : '';
                const reviewHTML = visit.review ? `<p class="review">${visit.review}</p>` : '';

                item.innerHTML = `
                    <div class="info">
                        <strong>${visit.name}</strong>
                        <div class="history-meta-item">訪問日: ${visit.date}</div>
                        <div class="history-meta-item">${waitTimeHTML}</div>
                        <div class="star-rating-display">${starsHTML}</div>
                        ${reviewHTML}
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
            const { currentPage, filteredPavilions } = ExpoApp.state;
            const { itemsPerPage } = ExpoApp.config;
            pavilionList.innerHTML = "";
            const startIndex = (currentPage - 1) * itemsPerPage;
            const paginatedItems = filteredPavilions.slice(startIndex, startIndex + itemsPerPage);
            if (paginatedItems.length === 0) { pavilionList.innerHTML = "<p>該当するパビリオンが見つかりません。</p>"; return; }
            const fragment = document.createDocumentFragment();
            paginatedItems.forEach(pavilion => { const card = ExpoApp.ui.createPavilionCard(pavilion); fragment.appendChild(card); });
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
                button.addEventListener("click", () => { ExpoApp.state.currentPage = i; ExpoApp.ui.renderPavilions(); });
                paginationContainer.appendChild(button);
            }
        },
        async renderWishlist() {
            const { wishlistList } = ExpoApp.elements;
            const { currentUser, allPavilions } = ExpoApp.state;
            if (!currentUser) { wishlistList.innerHTML = '<p style="text-align: center;">ログインすると「行きたいリスト」が表示されます。</p>'; return; }
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
                        if (pavilion) { fragment.appendChild(ExpoApp.ui.createWishlistItemCard(pavilion, wish.id)); }
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
                conquestCounter.innerHTML = `<span class="count">${visitCount}</span><span class="total">/ ${allPavilions.length}</span><span class="label">制覇</span>`;
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
            const starContainer = visitForm.querySelector('.star-rating-input');
            starContainer.dataset.rating = 0;
            starContainer.querySelectorAll('span').forEach(star => star.style.color = 'var(--border-color)');
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
                    const starContainer = editForm.querySelector('.star-rating-input');
                    starContainer.dataset.rating = data.rating || 0;
                    starContainer.querySelectorAll('span').forEach(star => {
                        star.style.color = star.dataset.value <= starContainer.dataset.rating ? 'var(--star-color)' : 'var(--border-color)';
                    });
                    editModal.style.display = "flex";
                }
            } catch (error) {
                console.error("編集データの取得中にエラー:", error);
            }
        },
        closeEditModal() {
            ExpoApp.elements.editModal.style.display = "none";
        },
        applyFiltersAndSort(searchTerm = ExpoApp.elements.searchInput.value) {
            const { allPavilions } = ExpoApp.state;
            const { area, reservation, sortBy } = ExpoApp.state.filters;
            let processedPavilions = [...allPavilions];
            if (area !== 'all') { processedPavilions = processedPavilions.filter(p => p.area === area); }
            if (reservation !== 'all') { const required = reservation === 'required'; processedPavilions = processedPavilions.filter(p => p.reservation?.some(r => r.startsWith('reservation')) === required); }
            if (searchTerm) { const lowerSearchTerm = searchTerm.toLowerCase(); processedPavilions = processedPavilions.filter(p => p.name.toLowerCase().includes(lowerSearchTerm) || p.searchTags?.some(t => t.toLowerCase().includes(lowerSearchTerm))); }
            if (sortBy.startsWith('duration')) { processedPavilions.sort((a, b) => { const dA = a.duration || 0; const dB = b.duration || 0; return sortBy === 'duration_asc' ? dA - dB : dB - dA; }); }
            ExpoApp.state.filteredPavilions = processedPavilions;
            ExpoApp.state.currentPage = 1;
            ExpoApp.ui.renderPavilions();
        },
        populateAreaFilter() {
            const { areaFilter } = ExpoApp.elements;
            const { areaMap } = ExpoApp.config;
            const fragment = document.createDocumentFragment();
            for (const key in areaMap) {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = areaMap[key];
                fragment.appendChild(option);
            }
            areaFilter.appendChild(fragment);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => ExpoApp.initialize());