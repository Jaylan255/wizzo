
        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
        import { getDatabase, ref, get, set, update, push } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
        import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
        import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

        const firebaseConfig = {
            apiKey: "AIzaSyAAWjWH55_WogACWc3vNVWrlLrwPYPfgmo",
            authDomain: "swamediaweb.firebaseapp.com",
            databaseURL: "https://swamediaweb-default-rtdb.firebaseio.com",
            projectId: "swamediaweb",
            storageBucket: "swamediaweb.firebasestorage.app",
            messagingSenderId: "70354150749",
            appId: "1:70354150749:web:046e78eb57ce1fe427f4b4"
        };
        const VAPID_KEY = "BAAqqy2D1WVfTWahieAkQg_aHnVlZ2T8lxISwVaWqgzA351paRTvz16d0aEJbspNNiHrYkK6xNSsxyDJ9W4pXRg"; // VAPID key for FCM Push Notifications

        const app = initializeApp(firebaseConfig);
        const database = getDatabase(app);
        const auth = getAuth(app);

        const appContainer = document.getElementById('app-container');
        const bottomNav = document.getElementById('bottom-nav');
        let historyStack = ['home'];
        let premiumSettings = { isActive: false };
        let allContentCache = null;
        let currentUser = null;
        let notificationsCache = [];
        let adSettings = null;
        let adInterval = null;
        let socialLinksCache = null;
        let appShareLinkCache = 'https://www.swamedia.online';
        let scrollSaveTimeout = null;
        let deferredInstallPrompt = null;
        const PENDING_REFERRAL_CODE_KEY = 'swamedia_pending_referral_code';
        const DEVICE_ID_KEY = 'swamedia_device_id';
        const WATCH_HISTORY_KEY = 'swamedia_watch_history';
        const REWARD_POINT_THRESHOLD = 60;
        const REFERRAL_REWARD_POINTS = 2;
        const REWARD_ACCESS_DURATION_MS = 24 * 60 * 60 * 1000;
        const SOCIAL_POST_REWARD_POINTS = 120;
        const APP_DOWNLOAD_URL = 'https://files.catbox.moe/amf6ef.apk';

        const isPhoneNumber = (str) => {
            if (typeof str !== 'string') return false;
            // Matches Tanzanian phone numbers like 07... or 06... (10 digits)
            return /^0[67]\d{8}$/.test(str.trim());
        };

        const normalizeAuthIdentifier = (identifier) => {
            const trimmedIdentifier = identifier.trim();
            if (isPhoneNumber(trimmedIdentifier)) {
                return `${trimmedIdentifier}@swamedia.app`;
            }
            return trimmedIdentifier;
        };

        const getOrCreateDeviceId = () => {
            let deviceId = localStorage.getItem(DEVICE_ID_KEY);
            if (!deviceId) {
                deviceId = `device_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
                localStorage.setItem(DEVICE_ID_KEY, deviceId);
            }
            return deviceId;
        };

        const getBaseShareUrl = () => {
            try {
                const rawUrl = appShareLinkCache && /^https?:\/\//i.test(appShareLinkCache)
                    ? appShareLinkCache
                    : `${window.location.origin}${window.location.pathname}`;
                const url = new URL(rawUrl, window.location.origin);
                url.search = '';
                url.hash = '';
                return url.toString().replace(/\/$/, '');
            } catch (error) {
                return `${window.location.origin}${window.location.pathname}`;
            }
        };

        const buildReferralLink = (code = '') => `${getBaseShareUrl()}?ref=${encodeURIComponent(code)}&download=1`;

        const hasPremiumAccess = (userData = currentUser) => {
            if (!premiumSettings.isActive) return true;
            const now = Date.now();
            return Boolean(
                (userData?.premiumExpiry && Number(userData.premiumExpiry) > now) ||
                (userData?.rewardAccessExpiry && Number(userData.rewardAccessExpiry) > now)
            );
        };

        const generateUniqueReferralCode = async (uid) => {
            let attempts = 0;
            while (attempts < 5) {
                attempts += 1;
                const code = `SWA${uid.slice(0, 4).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
                const referralCodeSnap = await get(ref(database, `referralCodes/${code}`));
                if (!referralCodeSnap.exists()) {
                    return code;
                }
            }
            return `SWA${uid.slice(0, 6).toUpperCase()}${Date.now().toString(36).toUpperCase()}`;
        };

        const ensureCurrentUserReferralProfile = async () => {
            if (!currentUser?.uid) return;

            const updates = {};
            let referralCode = currentUser.referralCode;

            if (!referralCode) {
                referralCode = await generateUniqueReferralCode(currentUser.uid);
                updates.referralCode = referralCode;
                updates.referralLink = buildReferralLink(referralCode);
            } else if (!currentUser.referralLink) {
                updates.referralLink = buildReferralLink(referralCode);
            }

            if (typeof currentUser.rewardPoints !== 'number') updates.rewardPoints = 0;
            if (typeof currentUser.rewardAccessExpiry !== 'number') updates.rewardAccessExpiry = 0;
            if (typeof currentUser.successfulReferralPurchases !== 'number') updates.successfulReferralPurchases = 0;
            if (typeof currentUser.referralRewardsClaimed !== 'number') updates.referralRewardsClaimed = 0;

            if (Object.keys(updates).length > 0) {
                await update(ref(database, `users/${currentUser.uid}`), updates);
                currentUser = { ...currentUser, ...updates };
            }

            if (referralCode) {
                await set(ref(database, `referralCodes/${referralCode}`), {
                    uid: currentUser.uid,
                    createdAt: currentUser.createdAt || Date.now()
                });
            }
        };

        const applyPendingReferralToCurrentUser = async () => {
            const pendingReferralCode = localStorage.getItem(PENDING_REFERRAL_CODE_KEY);
            if (!pendingReferralCode || !currentUser?.uid) return;
            if (currentUser.invitedByUid || currentUser.invitedBy) {
                localStorage.removeItem(PENDING_REFERRAL_CODE_KEY);
                return;
            }
            if (currentUser.referralCode === pendingReferralCode) {
                localStorage.removeItem(PENDING_REFERRAL_CODE_KEY);
                return;
            }

            const referralCodeSnap = await get(ref(database, `referralCodes/${pendingReferralCode}`));
            if (!referralCodeSnap.exists()) return;

            const referralOwner = referralCodeSnap.val();
            if (!referralOwner?.uid || referralOwner.uid === currentUser.uid) {
                localStorage.removeItem(PENDING_REFERRAL_CODE_KEY);
                return;
            }

            const deviceId = getOrCreateDeviceId();
            const userUpdates = {
                invitedBy: pendingReferralCode,
                invitedByUid: referralOwner.uid,
                invitedAt: Date.now(),
                referralSourceDeviceId: deviceId
            };

            await update(ref(database, `users/${currentUser.uid}`), userUpdates);
            await set(ref(database, `referrals/${referralOwner.uid}/${currentUser.uid}`), {
                inviteeUid: currentUser.uid,
                inviteeEmail: currentUser.email || '',
                inviteePhone: currentUser.phone || '',
                code: pendingReferralCode,
                status: 'joined',
                createdAt: Date.now(),
                rewardGranted: false,
                rewardPoints: 0,
                deviceId
            });

            currentUser = { ...currentUser, ...userUpdates };
            localStorage.removeItem(PENDING_REFERRAL_CODE_KEY);
        };

        const handleIncomingReferralLink = () => {
            const url = new URL(window.location.href);
            const referralCode = (url.searchParams.get('ref') || '').trim().toUpperCase();
            const shouldDownload = url.searchParams.get('download') === '1';

            if (referralCode) {
                localStorage.setItem(PENDING_REFERRAL_CODE_KEY, referralCode);
            }

            if (referralCode || shouldDownload) {
                window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash}`);
            }

            if (shouldDownload) {
                const downloadSessionKey = `swamedia-ref-download-${referralCode || 'direct'}`;
                if (!sessionStorage.getItem(downloadSessionKey)) {
                    sessionStorage.setItem(downloadSessionKey, '1');
                    setTimeout(() => {
                window.location.href = APP_DOWNLOAD_URL;
                    }, 1200);
                }
            }
        };

        const getStoredWatchHistory = () => {
            try {
                const raw = localStorage.getItem(WATCH_HISTORY_KEY);
                const parsed = raw ? JSON.parse(raw) : [];
                return Array.isArray(parsed) ? parsed : [];
            } catch (error) {
                console.error('Failed to parse watch history:', error);
                return [];
            }
        };

        const saveStoredWatchHistory = (historyItems) => {
            localStorage.setItem(WATCH_HISTORY_KEY, JSON.stringify(historyItems.slice(0, 100)));
        };

        const addWatchHistoryItem = (payload = {}) => {
            const historyKey = payload.parentId || payload.watchId || payload.sourceId || '';
            if (!historyKey) return;

            const existing = getStoredWatchHistory().filter(item => item.historyKey !== historyKey);
            existing.unshift({
                historyKey,
                watchId: payload.watchId || '',
                parentId: payload.parentId || '',
                parentType: payload.parentType || payload.sourceType || 'movie',
                title: payload.title || payload.parentTitle || 'Now Playing',
                posterUrl: payload.posterUrl || '',
                year: payload.year || '',
                genre: payload.genre || '',
                watchedAt: Date.now()
            });
            saveStoredWatchHistory(existing);
        };

        const getLikedMovieIds = () => {
            const likedIds = [];
            for (let index = 0; index < localStorage.length; index += 1) {
                const key = localStorage.key(index);
                if (!key || !key.startsWith('vote_')) continue;
                if (localStorage.getItem(key) === 'like') {
                    likedIds.push(key.replace('vote_', ''));
                }
            }
            return likedIds;
        };

        const resolveStoredItemsByIds = async (ids = []) => {
            const allContent = await fetchAllContent();
            return ids
                .map(id => allContent.find(item => item.id === id))
                .filter(Boolean);
        };

        const renderVerticalContentGrid = (items = [], emptyMessage = 'Hakuna content bado.') => {
            if (!items.length) {
                return `
                    <div class="bg-gray-900 rounded-2xl p-8 text-center">
                        <i class="fas fa-film text-4xl text-slate-600 mb-3"></i>
                        <p class="text-slate-400">${emptyMessage}</p>
                    </div>
                `;
            }

            return `
                <div class="space-y-4">
                    ${items.map(item => `
                        <div class="item-card bg-gray-900 rounded-2xl overflow-hidden border border-white/5 flex gap-4 p-3 cursor-pointer hover:border-red-500/30 transition-colors" data-id="${item.id}" data-type="${item.type || 'movie'}">
                            <div class="w-24 sm:w-28 flex-shrink-0">
                                ${item.posterUrl ? `<img src="${item.posterUrl}" alt="${escapeHtml(item.title || '')}" class="w-full h-32 object-cover rounded-xl" loading="lazy">` : `<div class="w-full h-32 bg-gray-800 rounded-xl flex items-center justify-center"><i class="fas fa-film text-gray-600 text-3xl"></i></div>`}
                            </div>
                            <div class="min-w-0 flex-1 py-1">
                                <div class="flex items-start justify-between gap-3">
                                    <div class="min-w-0">
                                        <h3 class="font-semibold text-white text-base truncate">${escapeHtml(item.title || '')}</h3>
                                        <p class="text-xs text-slate-500 mt-1">${escapeHtml(item.type || 'movie')}</p>
                                    </div>
                                    <span class="text-xs text-slate-400 whitespace-nowrap">${escapeHtml(String(item.year || ''))}</span>
                                </div>
                                <p class="text-sm text-slate-400 mt-2 line-clamp-2">${escapeHtml(item.description || 'No description available.')}</p>
                                <div class="flex items-center gap-2 flex-wrap mt-3">
                                    ${item.category ? `<span class="text-xs px-2 py-1 rounded-full bg-white/5 text-slate-300">${escapeHtml(item.category)}</span>` : ''}
                                    ${item.genre ? `<span class="text-xs px-2 py-1 rounded-full bg-red-500/10 text-red-300">${escapeHtml(item.genre)}</span>` : ''}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        };

        const processReferralRewardOnPackagePurchase = async (planAmount = '') => {
            if (!currentUser?.uid || !currentUser.invitedByUid || currentUser.referralPurchaseQualified) return;

            const inviterRef = ref(database, `users/${currentUser.invitedByUid}`);
            const inviterSnap = await get(inviterRef);
            if (!inviterSnap.exists()) return;

            const inviterData = inviterSnap.val();
            const now = Date.now();
            const currentPoints = Number(inviterData.rewardPoints || 0);
            const nextPoints = currentPoints + REFERRAL_REWARD_POINTS;
            const previousThresholds = Math.floor(currentPoints / REWARD_POINT_THRESHOLD);
            const reachedThresholds = Math.floor(nextPoints / REWARD_POINT_THRESHOLD);

            const inviterUpdates = {
                rewardPoints: nextPoints,
                successfulReferralPurchases: Number(inviterData.successfulReferralPurchases || 0) + 1,
                lastReferralRewardAt: now
            };

            if (reachedThresholds > previousThresholds) {
                const rewardDaysEarned = reachedThresholds - previousThresholds;
                const baseExpiry = inviterData.rewardAccessExpiry && inviterData.rewardAccessExpiry > now
                    ? Number(inviterData.rewardAccessExpiry)
                    : now;
                inviterUpdates.rewardAccessExpiry = baseExpiry + (rewardDaysEarned * REWARD_ACCESS_DURATION_MS);
                inviterUpdates.referralRewardsClaimed = Number(inviterData.referralRewardsClaimed || 0) + rewardDaysEarned;
            }

            const inviteeUpdates = {
                referralPurchaseQualified: true,
                referralQualifiedAt: now,
                lastPackageRequestedAt: now,
                lastPackageRequestedPlan: planAmount
            };

            await update(inviterRef, inviterUpdates);
            await update(ref(database, `users/${currentUser.uid}`), inviteeUpdates);
            await update(ref(database, `referrals/${currentUser.invitedByUid}/${currentUser.uid}`), {
                status: 'qualified',
                rewardGranted: true,
                rewardPoints: REFERRAL_REWARD_POINTS,
                qualifiedAt: now,
                packagePlan: planAmount
            });

            currentUser = { ...currentUser, ...inviteeUpdates };
        };

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredInstallPrompt = e;
            console.log(`'beforeinstallprompt' event was fired.`);
        });

        const NOTIFICATIONS_LAST_READ_KEY = 'swamedia_last_read_ts';

        const SwaMediaHeader = `
            <header class="flex justify-between items-center">
                <div class="flex items-center space-x-2">
                    <!-- Static Logo (Not Clickable) -->
                    <svg class="w-8 h-8 text-red-500" viewBox="0 0 24 24" fill="currentColor"><path d="M6.5 10.5C5.67 10.5 5 11.17 5 12s.67 1.5 1.5 1.5S8 12.83 8 12 7.33 10.5 6.5 10.5zm11 0C16.67 10.5 16 11.17 16 12s.67 1.5 1.5 1.5S19 12.83 19 12s-.67-1.5-1.5-1.5zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-4c-1.48 0-2.75-.81-3.45-2H6.88c.8 2.05 2.79 3.5 5.12 3.5s4.32-1.45 5.12-3.5h-1.67c-.7 1.19-1.97 2-3.45 2z"/></svg>
                    <span class="text-2xl font-bold text-red-500 select-none">SwaMedia</span>
                </div>
                <div id="notification-bell-container" class="relative">
                    <button id="notification-bell-btn" class="text-slate-400 hover:text-blue-500 text-2xl w-10 h-10 flex items-center justify-center">
                        <i class="fas fa-bell"></i>
                    </button>
                    <span id="notification-dot" class="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-black hidden"></span>
                </div>
            </header>
        `;

        const pageLoader = document.getElementById('page-loader');
        const showPageLoader = () => {
            if (pageLoader) pageLoader.classList.add('page-loader-visible');
            appContainer.classList.add('page-transitioning');
        };

        const hidePageLoader = () => {
            if (pageLoader) pageLoader.classList.remove('page-loader-visible');
            appContainer.classList.remove('page-transitioning');
        };
        
        const showUpdatePopup = (settings) => {
            const popup = document.createElement('div');
            popup.id = 'update-app-popup';
            popup.className = 'fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center p-8';
            
            let closeButtonHtml = '';
            if (settings.showCloseButton) {
                closeButtonHtml = `<button id="update-popup-close-btn" class="mt-4 text-slate-400 hover:text-white transition-colors">Close</button>`;
            }

            popup.innerHTML = `
                <div class="bg-gray-900 p-8 rounded-lg text-center max-w-md w-full border border-blue-500/50 shadow-2xl modal-content">
                    <h2 class="text-2xl font-bold text-red-500 mb-4">New Update Available!</h2>
                    <p class="text-slate-300 mb-8">${settings.message || 'Habari Tumeongeza Features Zaidi Ili kuongeza Performance ya App Yetu'}</p>
                    <a href="${settings.downloadUrl || '#'}" target="_blank" class="block w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors">Download Now</a>
                    ${closeButtonHtml}
                </div>
            `;
            
            document.body.appendChild(popup);
            
            if (settings.showCloseButton) {
                document.getElementById('update-popup-close-btn').addEventListener('click', () => {
                    popup.remove();
                });
            }
        };

        const getGoogleDriveUrls = (url) => {
            if (!url || typeof url !== 'string') return { previewUrl: null, downloadUrl: null };

            const trimmedUrl = url.trim();
            let fileId = null;

            try {
                const parsedUrl = new URL(trimmedUrl);
                const hostname = parsedUrl.hostname.toLowerCase();

                if (hostname.includes('drive.google.com') || hostname.includes('docs.google.com')) {
                    fileId = parsedUrl.searchParams.get('id');

                    if (!fileId) {
                        const pathMatch = parsedUrl.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
                        if (pathMatch && pathMatch[1]) {
                            fileId = pathMatch[1];
                        }
                    }

                    if (!fileId) {
                        const altPathMatch = trimmedUrl.match(/[-\w]{25,}/);
                        if (altPathMatch && altPathMatch[0]) {
                            fileId = altPathMatch[0];
                        }
                    }
                }
            } catch (error) {
                const fallbackMatch = trimmedUrl.match(/(?:\/d\/|id=)([a-zA-Z0-9_-]+)/);
                if (fallbackMatch && fallbackMatch[1]) {
                    fileId = fallbackMatch[1];
                }
            }

            if (fileId) {
                return {
                    previewUrl: `https://drive.google.com/file/d/${fileId}/preview`,
                    downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`
                };
            }

            return { previewUrl: trimmedUrl, downloadUrl: trimmedUrl };
        };

        const PLAYER_IFRAME_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-presentation';

        const isGoogleDrivePreviewUrl = (url = '') => typeof url === 'string' && url.toLowerCase().indexOf('drive.google.com') !== -1;

        const getPlayerLogoOverlay = () => `
            <div class="absolute top-0 right-0 z-20 w-24 h-24 sm:w-28 sm:h-28 bg-gradient-to-bl from-black via-black/95 to-transparent pointer-events-none" aria-hidden="true"></div>
            <div class="absolute top-3 right-3 z-30 w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center pointer-events-none" aria-hidden="true">
                <svg class="w-10 h-10 sm:w-11 sm:h-11 text-red-500 drop-shadow-[0_10px_18px_rgba(0,0,0,0.55)]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6.5 10.5C5.67 10.5 5 11.17 5 12s.67 1.5 1.5 1.5S8 12.83 8 12 7.33 10.5 6.5 10.5zm11 0C16.67 10.5 16 11.17 16 12s.67 1.5 1.5 1.5S19 12.83 19 12s-.67-1.5-1.5-1.5zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-4c-1.48 0-2.75-.81-3.45-2H6.88c.8 2.05 2.79 3.5 5.12 3.5s4.32-1.45 5.12-3.5h-1.67c-.7 1.19-1.97 2-3.45 2z"/>
                </svg>
            </div>
        `;

        const renderEmbeddedPlayer = (src, title, containerClass, iframeClass = 'w-full h-full', extraIframeAttributes = '') => {
            const sandboxAttribute = isGoogleDrivePreviewUrl(src) ? ` sandbox="${PLAYER_IFRAME_SANDBOX}"` : '';
            const safeTitle = escapeHtml(title || 'Player');
            return `
                <div class="${containerClass}">
                    <div class="absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-black/55 via-black/20 to-transparent pointer-events-none"></div>
                    <div class="absolute inset-x-0 bottom-0 z-10 h-20 bg-gradient-to-t from-black/50 via-black/10 to-transparent pointer-events-none"></div>
                    <iframe src="${src}" class="${iframeClass}" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="no-referrer"${sandboxAttribute}${extraIframeAttributes} title="${safeTitle}"></iframe>
                    ${getPlayerLogoOverlay()}
                </div>
            `;
        };

        const getEpisodeNumber = (ep) => {
            if (!ep) return Infinity;
            let num = ep.episodeNumber !== undefined && ep.episodeNumber !== null ? ep.episodeNumber : ep.number;
            if (num === null || num === undefined) return Infinity;
            const numStr = String(num);
            const match = numStr.match(/\d+/);
            if (match) {
                const parsed = parseInt(match[0], 10);
                return isNaN(parsed) ? Infinity : parsed;
            }
            return Infinity;
        };

        const transformSnapshotToArray = (snapshot) => {
            const snapshotVal = snapshot.val();
            if (!snapshotVal) return [];
            return Object.keys(snapshotVal).map(key => {
                const value = snapshotVal[key];
                if (value && typeof value === 'object') {
                    return { id: key, ...value };
                }
                return { id: key, value: value };
            }).filter(item => item !== null);
        };

        const fetchData = async (type) => {
            try {
                const snapshot = await get(ref(database, type));
                return snapshot;
            } catch (error) {
                console.error(`Error fetching ${type}:`, error);
                return { val: () => null, exists: () => false };
            }
        };

        const fetchAllContent = async () => {
            if (allContentCache !== null) {
                return allContentCache;
            }
            try {
                const [moviesSnap, seriesSnap, adultContentSnap, connectionSnap, EducationSnap] = await Promise.all([
                    fetchData('movies'), 
                    fetchData('series'),
                    fetchData('adultContent'),
                    fetchData('connection'),
                    fetchData('Education')
                ]);
                const movies = transformSnapshotToArray(moviesSnap);
                const series = transformSnapshotToArray(seriesSnap);
                const adultContent = transformSnapshotToArray(adultContentSnap);
                const connectionContent = transformSnapshotToArray(connectionSnap);
                const EducationContent = transformSnapshotToArray(EducationSnap);
                
                const moviesWithTypes = (movies || []).map(m => ({ ...m, type: m.type || 'movie' }));
                const seriesWithTypes = (series || []).map(s => ({ ...s, type: s.type || 'series' }));
                const adultContentWithTypes = (adultContent || []).map(m => ({ ...m, type: m.type || 'adult' }));
                const connectionWithTypes = (connectionContent || []).map(m => ({ ...m, type: m.type || 'connection' }));
                const EducationWithTypes = (EducationContent || []).map(m => ({ ...m, type: m.type || 'Education' }));

                allContentCache = [...moviesWithTypes, ...seriesWithTypes, ...adultContentWithTypes, ...connectionWithTypes, ...EducationWithTypes];
                allContentCache.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                return allContentCache;
            } catch (error) {
                console.error("Failed to fetch and cache content", error);
                allContentCache = [];
                return allContentCache;
            }
        };

        const fetchAndCheckNotifications = async () => {
            try {
                const notificationsSnap = await fetchData('notifications');
                if (notificationsSnap.exists()) {
                    notificationsCache = transformSnapshotToArray(notificationsSnap)
                        .map(normalizeNotification)
                        .sort((a, b) => getLatestNotificationActivityTimestamp(b) - getLatestNotificationActivityTimestamp(a));
                    const lastReadTimestamp = localStorage.getItem(NOTIFICATIONS_LAST_READ_KEY) || 0;
                    const latestTimestamp = notificationsCache.length > 0 ? getLatestNotificationActivityTimestamp(notificationsCache[0]) : 0;
                    const notificationDot = document.getElementById('notification-dot');
                    if (notificationDot && latestTimestamp > lastReadTimestamp) {
                        notificationDot.classList.remove('hidden');
                    } else if (notificationDot) {
                        notificationDot.classList.add('hidden');
                    }
                } else {
                    notificationsCache = [];
                    const notificationDot = document.getElementById('notification-dot');
                    if (notificationDot) notificationDot.classList.add('hidden');
                }
            } catch (error) {
                console.error("Failed to fetch notifications:", error);
            }
        };

        const fetchAdSettings = async () => {
            try {
                const adSnap = await fetchData('settings/advertisement');
                if (adSnap.exists()) {
                    adSettings = adSnap.val();
                    if (adSettings && adSettings.isEnabled) {
                        startAdInterval();
                    }
                }
            } catch (error) {
                console.error("Failed to fetch ad settings:", error);
            }
        };
        
        const fetchUpdateAdSettings = async () => {
            try {
                const updateAdSnap = await fetchData('settings/updateAd');
                if (updateAdSnap.exists()) {
                    const updateAdSettings = updateAdSnap.val();
                    if (updateAdSettings && updateAdSettings.isEnabled) {
                        showUpdatePopup(updateAdSettings);
                    }
                }
            } catch (error) {
                console.error("Failed to fetch update ad settings:", error);
            }
        };

        const fetchSocialLinks = async () => {
             try {
                const socialSnap = await fetchData('settings/socialLinks');
                if (socialSnap.exists()) {
                    socialLinksCache = socialSnap.val();
                    if (socialLinksCache.appShareLink) {
                        appShareLinkCache = socialLinksCache.appShareLink;
                        if (currentUser?.uid && currentUser.referralCode) {
                            const refreshedReferralLink = buildReferralLink(currentUser.referralCode);
                            if (currentUser.referralLink !== refreshedReferralLink) {
                                currentUser = { ...currentUser, referralLink: refreshedReferralLink };
                                update(ref(database, `users/${currentUser.uid}`), { referralLink: refreshedReferralLink }).catch(error => {
                                    console.error('Failed to refresh referral link:', error);
                                });
                            }
                        }
                    }
                }
             } catch(error) {
                console.error("Failed to fetch social links:", error);
             }
        };

        const showFcmToast = (title, body) => {
            const toast = document.getElementById('fcm-toast');
            if (!toast) return;

            toast.innerHTML = `
                <div class="flex items-start">
                    <i class="fas fa-bell text-red-400 mt-1 mr-3"></i>
                    <div class="flex-1">
                        <h4 class="font-bold text-slate-100">${title}</h4>
                        <p class="text-sm text-slate-300 mt-1">${body}</p>
                    </div>
                    <button id="close-fcm-toast" class="ml-2 text-slate-500 hover:text-white">&times;</button>
                </div>
            `;
            toast.classList.remove('hidden');
            setTimeout(() => {
                toast.classList.remove('translate-x-full');
            }, 10);
            
            const closeToast = () => {
                toast.classList.add('translate-x-full');
                setTimeout(() => toast.classList.add('hidden'), 300);
            };

            toast.querySelector('#close-fcm-toast').addEventListener('click', closeToast);
            setTimeout(closeToast, 6000);
        };

        // Show custom notification/toast
        const showNotification = (message, type = 'success') => {
            const toast = document.getElementById('fcm-toast');
            if (!toast) return;
            
            const borderColor = type === 'error' ? 'border-red-500' : 'border-blue-500';
            const textColor = type === 'error' ? 'text-red-500' : 'text-blue-500';
            toast.style.borderColor = type === 'error' ? '#ef4444' : '#3b82f6';
            toast.innerHTML = `
                <div class="flex items-center">
                    <i class="fas ${type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle'} ${textColor} mr-2"></i>
                    <span class="text-white">${message}</span>
                </div>
            `;
            toast.classList.remove('translate-x-full');
            setTimeout(() => {
                toast.classList.add('translate-x-full');
            }, 3000);
        };
        window.showNotification = showNotification;
        
        // Global comment functions (accessible from onclick)
        let currentVideoId = null;
        let currentCommentsCache = [];
        let commentReplyTarget = null;
        const GUEST_USER_KEY = 'swamedia_guest_user_id';

        const getOrCreateGuestUserId = () => {
            let guestId = localStorage.getItem(GUEST_USER_KEY);
            if (!guestId) {
                guestId = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
                localStorage.setItem(GUEST_USER_KEY, guestId);
            }
            return guestId;
        };

        const getCommentAuthor = () => {
            if (currentUser && currentUser.uid) {
                return {
                    authorId: currentUser.uid,
                    authorName: currentUser.phone || currentUser.email || 'SwaMedia User'
                };
            }

            return {
                authorId: getOrCreateGuestUserId(),
                authorName: 'Guest User'
            };
        };

        const isActorBlocked = async (actorId) => {
            if (!actorId) return false;
            if (currentUser && currentUser.uid && currentUser.uid === actorId && (currentUser.isBlocked === true || currentUser.blocked === true)) {
                return true;
            }

            try {
                const blockedSnap = await get(ref(database, `blockedActors/${actorId}`));
                return blockedSnap.exists() && blockedSnap.val() && blockedSnap.val().isBlocked === true;
            } catch (error) {
                console.error('Failed to verify blocked actor status:', error);
                return false;
            }
        };

        const ensureParticipationAllowed = async () => {
            const { authorId } = getCommentAuthor();
            const blocked = await isActorBlocked(authorId);
            if (blocked) {
                showNotification('Your account has been blocked from commenting and replying.', 'error');
                return false;
            }
            return true;
        };

        const getCommentsDbPath = (videoId) => `comments/${videoId}`;

        const renderReplyTarget = () => {
            const replyBox = document.getElementById('reply-target-box');
            const replyText = document.getElementById('reply-target-text');
            if (!replyBox || !replyText) return;

            if (!commentReplyTarget) {
                replyBox.classList.add('hidden');
                replyText.textContent = '';
                return;
            }

            replyText.textContent = `Replying to ${commentReplyTarget.authorName}: "${commentReplyTarget.text.slice(0, 80)}${commentReplyTarget.text.length > 80 ? '...' : ''}"`;
            replyBox.classList.remove('hidden');
        };

        function clearReplyTarget() {
            commentReplyTarget = null;
            renderReplyTarget();
        }

        function setReplyTarget(commentId) {
            const comment = currentCommentsCache.find(entry => entry.id === commentId);
            if (!comment) return;

            commentReplyTarget = {
                id: comment.id,
                authorName: comment.authorName || 'User',
                text: comment.text || ''
            };
            renderReplyTarget();
            const commentInput = document.getElementById('comment-input');
            if (commentInput) commentInput.focus();
        }
        
        async function saveComment() {
            const textarea = document.getElementById('comment-input');
            if (!textarea) {
                alert('Comment textbox not found!');
                return;
            }
            const text = textarea.value.trim();
            if (!text) {
                alert('Andika comment!');
                return;
            }
            if (!currentVideoId) {
                alert('Video ID not set!');
                return;
            }
            
            try {
                if (!(await ensureParticipationAllowed())) return;
                const { authorId, authorName } = getCommentAuthor();
                const commentRef = push(ref(database, getCommentsDbPath(currentVideoId)));
                await set(commentRef, {
                    text,
                    time: Date.now(),
                    authorId,
                    authorName,
                    parentId: commentReplyTarget ? commentReplyTarget.id : null
                });
                
                textarea.value = '';
                clearReplyTarget();
                await showCommentList(currentVideoId);
                showNotification('Your comment has been posted successfully.', 'success');
            } catch (e) {
                console.error(e);
                showNotification('We could not post your comment. Please try again.', 'error');
            }
        }
        
        async function removeComment(commentId) {
            if (!confirm('Unataka kufuta comment?')) return;
            if (!currentVideoId) return;

            try {
                const comment = currentCommentsCache.find(entry => entry.id === commentId);
                const { authorId } = getCommentAuthor();

                if (!comment || comment.authorId !== authorId) {
                    showNotification('You can only remove comments you posted.', 'error');
                    return;
                }

                await update(ref(database, getCommentsDbPath(currentVideoId)), {
                    [commentId]: null
                });
                await showCommentList(currentVideoId);
                showNotification('Your comment has been removed.', 'success');
            } catch (error) {
                console.error(error);
                showNotification('We could not remove that comment right now.', 'error');
            }
        }
        
        async function showCommentList(videoId) {
            const container = document.getElementById('comments-list');
            if (!container) return;

            try {
                const snapshot = await get(ref(database, getCommentsDbPath(videoId)));
                const comments = transformSnapshotToArray(snapshot)
                    .map(comment => ({
                        ...comment,
                        time: Number(comment.time || 0),
                        parentId: comment.parentId || null
                    }))
                    .sort((a, b) => a.time - b.time);

                currentCommentsCache = comments;

                if (comments.length === 0) {
                    container.innerHTML = '<p class="text-slate-400 text-sm py-2">No comments yet. Be the first!</p>';
                    return;
                }

                const { authorId } = getCommentAuthor();
                const repliesByParent = comments.reduce((acc, comment) => {
                    if (!comment.parentId) return acc;
                    if (!acc[comment.parentId]) acc[comment.parentId] = [];
                    acc[comment.parentId].push(comment);
                    return acc;
                }, {});

                const rootComments = comments.filter(comment => !comment.parentId || !comments.some(entry => entry.id === comment.parentId));
                const renderCommentCard = (comment, isReply = false) => {
                    const canDelete = comment.authorId === authorId;
                    const replies = repliesByParent[comment.id] || [];
                    return `
                        <div class="${isReply ? 'ml-6 border-l border-gray-700 pl-4 mt-3' : 'bg-gray-800 rounded-xl p-3'}">
                            <div class="flex items-start justify-between gap-3">
                                <div class="min-w-0">
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <span class="text-blue-400 text-sm font-bold">${escapeHtml(comment.authorName || 'User')}</span>
                                        <span class="text-slate-500 text-xs">${new Date(comment.time).toLocaleString()}</span>
                                    </div>
                                    <p class="text-slate-300 text-sm mt-1 leading-relaxed">${escapeHtml(comment.text || '')}</p>
                                </div>
                                <div class="flex items-center gap-3 flex-shrink-0">
                                    <button onclick="setReplyTarget('${comment.id}')" class="text-xs text-slate-400 hover:text-blue-400 transition-colors">Reply</button>
                                    ${canDelete ? `<button onclick="removeComment('${comment.id}')" class="text-blue-500 hover:text-blue-400 transition-colors"><i class="fas fa-trash"></i></button>` : ''}
                                </div>
                            </div>
                            ${replies.length > 0 ? `<div class="mt-2 space-y-2">${replies.map(reply => renderCommentCard(reply, true)).join('')}</div>` : ''}
                        </div>
                    `;
                };

                container.innerHTML = rootComments.map(comment => renderCommentCard(comment)).join('');
            } catch (error) {
                console.error(error);
                container.innerHTML = '<p class="text-red-400 text-sm py-2">Comments could not be loaded right now.</p>';
            }
        }
        
        // Store current video ID when modal opens
        function setCurrentVideoId(id) {
            currentVideoId = id;
        }
        window.removeComment = removeComment;
        window.setReplyTarget = setReplyTarget;
        window.clearReplyTarget = clearReplyTarget;
        window.setNotificationReplyTarget = setNotificationReplyTarget;
        window.clearNotificationReplyTarget = clearNotificationReplyTarget;
        window.saveNotificationReply = saveNotificationReply;
        window.removeNotificationReply = removeNotificationReply;
        window.removeNotificationPost = removeNotificationPost;
        window.toggleNotificationReaction = toggleNotificationReaction;

        const escapeHtml = (value = '') => String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        const formatGenreText = (item = {}) => {
            if (Array.isArray(item.genres) && item.genres.length > 0) {
                return item.genres.join(', ');
            }
            if (typeof item.genre === 'string' && item.genre.trim()) {
                return item.genre;
            }
            if (typeof item.category === 'string' && item.category.trim()) {
                return item.category;
            }
            return 'Unknown Genre';
        };

        const getContentDbPath = (itemType = '') => {
            const pathMap = {
                movie: 'movies',
                movies: 'movies',
                series: 'series',
                story: 'stories',
                stories: 'stories',
                adultContent: 'adultContent',
                connection: 'connection',
                Education: 'xxx',
                xxx: 'xxx'
            };
            return pathMap[itemType] || `${itemType}s`;
        };

        const getItemGenreList = (item = {}) => {
            const genres = [];
            if (Array.isArray(item.genres)) genres.push(...item.genres);
            if (typeof item.genre === 'string' && item.genre.trim()) genres.push(item.genre.trim());
            if (typeof item.category === 'string' && item.category.trim()) genres.push(item.category.trim());
            const uniqueGenres = [...new Set(genres.map(genre => String(genre).trim()).filter(Boolean))];
            return uniqueGenres.length > 0 ? uniqueGenres : ['Unknown Genre'];
        };

        const getPrimaryMediaUrls = (mediaItem = {}) => {
            const watchableUrl = mediaItem.mediaUrl || mediaItem.watchUrl || mediaItem.videoUrl;
            const downloadableUrlForOldData = mediaItem.downloadUrl;
            const { previewUrl, downloadUrl: downloadUrlFromMedia } = getGoogleDriveUrls(watchableUrl);

            return {
                watchUrl: previewUrl,
                downloadUrl: downloadableUrlForOldData || downloadUrlFromMedia
            };
        };

        const getWatchPageStorageKey = (watchId) => `watchPayload_${watchId}`;

        const buildCommentThreadId = ({ parentId, parentType, sourceId, title }) => {
            const rawThreadId = [parentType || 'content', parentId || 'item', sourceId || title || 'main']
                .join('_')
                .replace(/[^a-zA-Z0-9_-]/g, '')
                .slice(0, 120);
            return rawThreadId || `content_${Date.now()}`;
        };

        const storeWatchPagePayload = (payload) => {
            if (!payload || !payload.watchId) return;
            sessionStorage.setItem(getWatchPageStorageKey(payload.watchId), JSON.stringify(payload));
        };

        const getStoredWatchPagePayload = (watchId) => {
            try {
                const raw = sessionStorage.getItem(getWatchPageStorageKey(watchId));
                return raw ? JSON.parse(raw) : null;
            } catch (error) {
                console.error('Could not parse watch page payload:', error);
                return null;
            }
        };

        const saveFcmToken = async (token) => {
            if (!token) {
                console.error('FCM Token is missing.');
                return;
            }
            try {
                await set(ref(database, `fcmTokens/${token}`), {
                    uid: currentUser ? currentUser.uid : 'anonymous',
                    timestamp: Date.now()
                });
                console.log('FCM token saved to database.');
            } catch (error) {
                console.error('Error saving FCM token:', error);
            }
        };

        const requestNotificationPermission = async () => {
            console.log('Requesting notification permission...');
            try {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    console.log('Notification permission granted.');
                    const messaging = getMessaging(app);
                    const currentToken = await getToken(messaging, { vapidKey: VAPID_KEY });
                    if (currentToken) {
                        console.log('FCM Token:', currentToken);
                        await saveFcmToken(currentToken);
                        alert('Notifications enabled successfully!');
                    } else {
                        console.log('No registration token available. Request permission to generate one.');
                        alert('Could not get notification token. Please try again or check browser settings.');
                    }
                } else {
                    console.log('Unable to get permission to notify.');
                    alert('Notification permission was denied. You can enable it in your browser settings.');
                }
            } catch (error) {
                console.error('An error occurred while getting token.', error);
                alert('An error occurred while enabling notifications.');
            }
        };

        const setupFirebaseMessaging = () => {
            try {
                if ('serviceWorker' in navigator) {
                    const swUrl = `${location.origin}/firebase-messaging-sw.js`;
                    navigator.serviceWorker.register(swUrl)
                        .then((registration) => {
                            console.log('Service Worker registered with scope:', registration.scope);
                            const messaging = getMessaging(app);
                            onMessage(messaging, (payload) => {
                                console.log('Message received in foreground. ', payload);
                                const { title, body } = payload.notification;
                                showFcmToast(title, body);
                            });
                        }).catch((err) => {
                            console.error('Service Worker registration failed:', err);
                        });
                }
            } catch(err) {
                console.error("Firebase Messaging not supported in this browser or an error occurred.", err);
            }
        };

        const initApp = async () => {
            let initializationComplete = false;
            handleIncomingReferralLink();

            const hideLoader = () => {
                const loader = document.getElementById('app-loader');
                if (loader && !loader.classList.contains('loader-hidden')) {
                    loader.classList.add('loader-hidden');
                    setTimeout(() => {
                        if (loader.parentNode) loader.parentNode.removeChild(loader);
                    }, 500); 
                }
            };
            
            const safetyTimeout = setTimeout(async () => {
                if (!initializationComplete) {
                    console.warn("App initialization timed out after 5 seconds. Forcing UI render.");
                    hideLoader();
                    await navigateTo('home').catch(e => {
                        console.error("Failed to render home page on timeout", e);
                        appContainer.innerHTML = `<div class="p-8 text-center text-red-400">App failed to load. Please refresh the page.</div>`;
                    });
                }
            }, 5000);

            try {
                let isAuthReady = false;
                const authReadyPromise = new Promise(resolve => {
                    onAuthStateChanged(auth, async (user) => {
                        if (user) {
                            try {
                                const userSnap = await get(ref(database, `users/${user.uid}`));
                                currentUser = userSnap.exists() ? { ...user, ...userSnap.val() } : user;
                                await ensureCurrentUserReferralProfile();
                                await applyPendingReferralToCurrentUser();
                            } catch (error) {
                                console.error("Error fetching user profile:", error);
                                currentUser = user;
                            }
                        } else {
                            currentUser = null;
                        }
                        if (isAuthReady && historyStack[historyStack.length - 1] === 'profile') {
                            renderProfilePage();
                        }
                        if (!isAuthReady) {
                            isAuthReady = true;
                            resolve();
                        }
                    });
                });

                const premiumSettingsPromise = fetchData('settings/premium').then(snap => {
                    if (snap.exists()) premiumSettings = snap.val();
                });
                
                await Promise.all([authReadyPromise, premiumSettingsPromise]);
                
                await navigateTo('home');

                setupFirebaseMessaging();

                Promise.all([
                    fetchAllContent(),
                    fetchAndCheckNotifications(),
                    fetchAdSettings(),
                    fetchSocialLinks(),
                    fetchUpdateAdSettings()
                ]).catch(error => {
                    console.error("Could not load background data, some features might be degraded.", error);
                });

                setInterval(() => {
                    fetchAndCheckNotifications().catch(error => {
                        console.error('Background notification refresh failed:', error);
                    });
                }, 15000);

            } catch (error) {
                console.error("Critical error during app initialization:", error);
                try {
                    await navigateTo('home');
                } catch(renderError) {
                    console.error("Failed to render home page after an error:", renderError);
                    appContainer.innerHTML = `<div class="p-8 text-center text-red-400">A critical error occurred. Please refresh the page.</div>`;
                }
            } finally {
                initializationComplete = true;
                clearTimeout(safetyTimeout);
                hideLoader();
            }
        };

        const itemCardTemplate = (item, type, extraClasses = '') => {
            if (!item || !item.id || !item.title) return '';
            const isStory = type === 'story';
            const isSeries = type === 'series';
            const icon = isStory ? 'fa-book-open' : isSeries ? 'fa-tv' : 'fa-film';
            const genreText = escapeHtml(formatGenreText(item));
            const yearText = escapeHtml(item.year || '');
            const { downloadUrl } = getPrimaryMediaUrls(item);
            const posterHtml = item.posterUrl ? `<img src="${item.posterUrl}" alt="${item.title}" class="w-full h-40 md:h-52 object-cover rounded-xl shadow-lg group-hover:shadow-red-600/40" loading="lazy">` : `<div class="w-full h-40 md:h-52 bg-gray-800 rounded-xl flex items-center justify-center"><i class="fas ${icon} text-gray-600 text-3xl"></i></div>`;
            const widthClass = extraClasses.includes('search-result-item') ? 'w-full' : 'flex-shrink-0 w-36 md:w-44';
            return `
            <div class="item-card ${widthClass} cursor-pointer group ${extraClasses}" data-id="${item.id}" data-type="${type}" data-title="${item.title}">
                <div class="relative transform hover:scale-105 transition-transform duration-300">
                    ${posterHtml}
                    ${downloadUrl ? `
                        <button class="card-download-btn absolute right-2 bottom-2 w-9 h-9 rounded-full bg-black/80 hover:bg-blue-600 text-white border border-white/10 transition-colors flex items-center justify-center" data-url="${downloadUrl}" title="Download">
                            <i class="fas fa-download text-xs"></i>
                        </button>
                    ` : ''}
                </div>
                <div class="mt-2 space-y-1">
                    <h3 class="text-sm font-semibold truncate group-hover:text-red-400">${item.title}</h3>
                    ${!isStory ? `
                        <div class="flex items-center justify-between gap-2">
                            <div class="min-w-0">
                                <p class="text-xs text-slate-400 truncate">${yearText}${yearText && genreText ? ' • ' : ''}${genreText}</p>
                            </div>
                            <span class="flex-shrink-0 text-[11px] text-slate-500"><i class="fas ${icon}"></i></span>
                        </div>
                    ` : ''}
                </div>
            </div>`;
        };

        const EducationItemCardTemplate = (item) => {
            if (!item || !item.id || !item.title) return '';
            const posterHtml = item.posterUrl ? `
                <img src="${item.posterUrl}" alt="${item.title}" class="w-full h-full object-cover rounded-lg group-hover:scale-110 transition-transform duration-300">
                <div class="absolute inset-0 bg-black/40 flex items-center justify-center rounded-lg">
                    <i class="fas fa-play-circle text-white/80 text-5xl drop-shadow-lg group-hover:text-white transition-colors"></i>
                </div>
            ` : `
                <div class="w-full h-full bg-gray-800 rounded-lg flex items-center justify-center">
                    <i class="fas fa-play-circle text-gray-600 text-5xl"></i>
                </div>
            `;

            return `
            <div class="item-card w-full cursor-pointer group" data-id="${item.id}" data-type="Education" data-title="${item.title}">
                <div class="relative transform hover:scale-105 transition-transform duration-300 aspect-video overflow-hidden rounded-lg shadow-lg bg-black">
                    ${posterHtml}
                </div>
                <h3 class="text-sm font-semibold mt-2 truncate group-hover:text-red-400">${item.title}</h3>
            </div>`;
        };

        const carouselTemplate = (title, items, defaultType) => {
            if (!items || items.length === 0) return '';
            const typedItems = items.map(item => ({...item, type: item.type || defaultType }));
            const itemsJsonString = JSON.stringify(typedItems).replace(/'/g, '&apos;');

            return `
            <div class="my-6">
                <div class="flex justify-between items-center mb-3 px-4">
                    <h2 class="text-xl font-bold">${title}</h2>
                    <button class="see-all-btn text-sm text-red-400 hover:text-red-300 transition-colors" data-see-all-title="${title}" data-see-all-items='${itemsJsonString}'>
                        See All <i class="fas fa-chevron-right text-xs"></i>
                    </button>
                </div>
                <div class="flex overflow-x-auto space-x-4 px-4 pb-4 -mb-4 horizontal-scroll">
                    ${typedItems.map(item => itemCardTemplate(item, item.type)).join('')}
                    <div class="flex-shrink-0 w-1"></div>
                </div>
            </div>`;
        };

        const djCarouselTemplate = (title, items) => {
            if (!items || items.length === 0) return '';
            const typedItems = items.map(item => ({...item, type: item.type || (item.seasons ? 'series' : 'movie') }));

            return `
            <div class="my-6">
                <div class="flex justify-between items-center mb-3 px-4">
                    <h2 class="text-xl font-bold">${title}</h2>
                    <button class="see-all-btn text-sm text-red-400 hover:text-red-300 transition-colors" data-page="djPage">
                        See All <i class="fas fa-chevron-right text-xs"></i>
                    </button>
                </div>
                <div class="flex overflow-x-auto space-x-4 px-4 pb-4 -mb-4 horizontal-scroll">
                    ${typedItems.map(item => itemCardTemplate(item, item.type)).join('')}
                    <div class="flex-shrink-0 w-1"></div>
                </div>
            </div>`;
        };

        const recommendationsCarouselTemplate = (title, items) => {
            if (!items || items.length === 0) return '';
             const typedItems = items.map(item => ({...item, type: item.type || (item.seasons ? 'series' : 'movie') }));
            return `
            <div class="my-6">
                <h2 class="text-xl font-bold mb-3 px-4">${title}</h2>
                <div class="flex overflow-x-auto space-x-4 px-4 pb-4 -mb-4 horizontal-scroll">
                    ${typedItems.map(item => itemCardTemplate(item, item.type)).join('')}
                    <div class="flex-shrink-0 w-1"></div>
                </div>
            </div>
            `;
        };

        const genreCarouselTemplate = (categories) => {
            if (!categories || categories.length === 0) return '';
            return `
            <div class="my-6">
                <h2 class="text-xl font-bold mb-3 px-4">Browse by Genre</h2>
                <div class="flex overflow-x-auto space-x-3 px-4 pb-4 -mb-4 horizontal-scroll">
                    ${categories.map(cat => cat.name ? `
                        <button class="genre-item flex-shrink-0 bg-gray-800 hover:bg-red-600 text-slate-200 font-semibold py-2 px-4 rounded-lg transition-colors" data-genre-name="${cat.name}">
                            ${cat.name}
                        </button>
                    ` : '').join('')}
                    <div class="flex-shrink-0 w-1"></div>
                </div>
            </div>
            `;
        };

const renderActionButtons = (item, size = 'large', itemType = null) => {
            const { watchUrl: finalWatchUrl, downloadUrl: finalDownloadUrl } = getPrimaryMediaUrls(item);

            if (!finalWatchUrl && !finalDownloadUrl) {
                return `<p class="text-slate-400 text-center">Content unavailable</p>`;
            }

            const hasWatchUrl = !!finalWatchUrl;
            const hasDownloadUrl = !!finalDownloadUrl;
            
            if (!hasWatchUrl && !hasDownloadUrl) {
                return `<p class="text-slate-400 text-center">Content unavailable</p>`;
            }
            
            const baseClasses = "flex-1 text-center rounded-lg transition-colors flex items-center justify-center";
            const largeClasses = "py-3 font-bold";
            const smallClasses = "text-sm py-1.5";
            const currentSizeClass = size === 'large' ? largeClasses : smallClasses;

            const actionBtnBaseClasses = `${baseClasses} action-btn disabled:opacity-75 disabled:cursor-not-allowed`;

            const resolvedType = itemType || item.type || 'movie';
            const watchBtnHtml = hasWatchUrl ? `<button data-action="watch" data-id="${item.id || ''}" data-type="${resolvedType}" data-url="${finalWatchUrl}" data-title="${escapeHtml(item.title || 'Now Playing')}" data-download-url="${finalDownloadUrl || ''}" class="${actionBtnBaseClasses} ${currentSizeClass} bg-blue-600 hover:bg-blue-700">
                                    <span class="btn-text"><i class="fas fa-play mr-2"></i>Watch</span>
                                    <span class="btn-loader" style="display: none;"><i class="fas fa-spinner fa-spin"></i></span>
                                  </button>` : '';
            const downloadBtnHtml = hasDownloadUrl ? `<button data-action="download" data-url="${finalDownloadUrl}" class="${actionBtnBaseClasses} ${currentSizeClass} bg-gray-600 hover:bg-gray-500">
                                        <span class="btn-text"><i class="fas fa-download mr-2"></i>Download</span>
                                        <span class="btn-loader" style="display: none;"><i class="fas fa-spinner fa-spin"></i></span>
                                      </button>` : '';
            const fullAccessHtml = `<div class="flex space-x-2 mt-2">${watchBtnHtml}${downloadBtnHtml}</div>`;

            if (!premiumSettings.isActive) {
                return fullAccessHtml;
            }

            const isPremium = hasPremiumAccess(currentUser);

            if (!isPremium) {
                const lockedBtnBaseClasses = `${baseClasses} locked-content-btn`;
                const lockedWatchBtnHtml = hasWatchUrl ? `<button class="${lockedBtnBaseClasses} ${currentSizeClass} bg-gray-700 text-gray-400 cursor-pointer"><i class="fas fa-lock mr-2"></i>Watch</button>` : '';
                const lockedDownloadBtnHtml = hasDownloadUrl ? `<button class="${lockedBtnBaseClasses} ${currentSizeClass} bg-gray-700 text-gray-400 cursor-pointer"><i class="fas fa-lock mr-2"></i>Download</button>` : '';
                return `<div class="flex space-x-2 mt-2">${lockedWatchBtnHtml}${lockedDownloadBtnHtml}</div>`;
            }
            
            return fullAccessHtml;
        };

        const renderHomePage = async () => {
            const [bannersSnap, categoriesSnap] = await Promise.all([
                fetchData('banners'), fetchData('categories')
            ]);
            const allContent = await fetchAllContent();
            const publishedContent = allContent.filter(c => c.isPublished !== false);
            
            const banners = transformSnapshotToArray(bannersSnap);
            const categories = transformSnapshotToArray(categoriesSnap);

            const moviesOfTheWeek = publishedContent.filter(c => c.isMovieOfTheWeek === true);
            
            const moviesWithTypes = publishedContent.filter(c => (c.type || 'movie') === 'movie');
            const seriesWithTypes = publishedContent.filter(c => (c.type || 'series') === 'series');

            const popularMovies = [...moviesWithTypes].sort((a,b) => (b.rating || 0) - (a.rating || 0)).slice(0, 10);
            const popularSeries = [...seriesWithTypes].sort((a,b) => (b.rating || 0) - (a.rating || 0)).slice(0, 10);
            const djContent = publishedContent.filter(c => c.dj && c.dj.trim() !== '').slice(0, 15);
            
            const trendingContent = publishedContent.slice(0, 15);

            const categoryCarousels = (categories || []).map(cat => {
                if (!cat || !cat.name) return '';
                const categoryContent = publishedContent.filter(item => 
                    item && (item.category === cat.name || (Array.isArray(item.genres) && item.genres.includes(cat.name)))
                );
                return carouselTemplate(cat.name, categoryContent, 'movie');
            }).join('');

            appContainer.innerHTML = `
                <div class="page">
                    <div class="px-4 pt-6">${SwaMediaHeader}</div>
                    <div id="home-banner-carousel-container" class="mt-4 px-4"></div>
                    ${genreCarouselTemplate(categories)}
                    ${carouselTemplate('Movies of This Week', moviesOfTheWeek)}
                    ${carouselTemplate('Popular Movies', popularMovies, 'movie')}
                    ${carouselTemplate('Popular Series', popularSeries, 'series')}
                    ${djCarouselTemplate('DJ Mixes', djContent)}
                    <div id="trending-carousel-container"></div>
                    ${categoryCarousels}
                </div>`;
            renderBannerCarousel(banners, 'home-banner-carousel-container', allContent);
            renderTrendingCarousel(trendingContent);
        };

        const renderCustomVideoPage = async (pageType) => {
            const title = pageType.charAt(0).toUpperCase() + pageType.slice(1);
            const [bannersSnap] = await Promise.all([
                fetchData(`${pageType}banners`)
            ]);
            const allContent = await fetchAllContent();
            const banners = transformSnapshotToArray(bannersSnap);
            const content = allContent
                .filter(c => c.type === pageType && c.isPublished !== false);

            const pageHeader = `
                <header class="flex items-center space-x-4 pt-4 mb-4 px-4">
                    <button id="back-btn" class="bg-gray-800 hover:bg-gray-700 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors flex-shrink-0"><i class="fas fa-arrow-left"></i></button>
                    <h1 class="text-2xl font-bold">${title}</h1>
                </header>
            `;
            
            const gridClasses = pageType === 'Education' 
                ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5';
            
            const cardRenderer = (item) => (pageType === 'Education' ? EducationItemCardTemplate(item) : itemCardTemplate(item, pageType));

            appContainer.innerHTML = `
                <div class="page">
                    ${pageHeader}
                    <div id="${pageType}-banner-carousel-container" class="mt-4 px-4"></div>
                    <div class="p-4">
                        <div id="${pageType}-grid" class="grid ${gridClasses} gap-4">
                            ${content.length > 0 ? content.map(item => cardRenderer(item)).join('') : `<p class="col-span-full text-center text-slate-400 mt-8">No content available right now.</p>`}
                        </div>
                    </div>
                </div>`;

            const customVideoBackBtn = document.getElementById('back-btn');
            if (customVideoBackBtn) customVideoBackBtn.addEventListener('click', handleBack);
                    renderBannerCarousel(banners, `${pageType}-banner-carousel-container`, allContent);
        };

        const renderTrendingCarousel = (items) => {
            const container = document.getElementById('trending-carousel-container');
            if (!container || !items || items.length === 0) return;
            const itemsJsonString = JSON.stringify(items).replace(/'/g, '&apos;');

            container.innerHTML = `
                <div class="my-6">
                    <div class="flex justify-between items-center mb-3 px-4">
                        <h2 class="text-xl font-bold">Trending</h2>
                        <button class="see-all-btn text-sm text-red-400 hover:text-red-300 transition-colors" data-see-all-title="Trending" data-see-all-items='${itemsJsonString}'>
                            See All <i class="fas fa-chevron-right text-xs"></i>
                        </button>
                    </div>
                    <div id="trending-scroll" class="flex overflow-x-auto space-x-4 px-4 pb-4 -mb-4 horizontal-scroll">
                        ${items.map(item => itemCardTemplate(item, item.type)).join('')}
                        <div class="flex-shrink-0 w-1"></div>
                    </div>
                </div>`;

            const scrollContainer = document.getElementById('trending-scroll');
            if (scrollContainer && scrollContainer.children.length > 4) { 
                let isHovering = false;
                scrollContainer.addEventListener('mouseenter', () => isHovering = true);
                scrollContainer.addEventListener('mouseleave', () => isHovering = false);

                setInterval(() => {
                    if (isHovering) return; 

                    const scrollWidth = scrollContainer.scrollWidth;
                    const clientWidth = scrollContainer.clientWidth;
                    
                    if (Math.round(scrollContainer.scrollLeft) >= (scrollWidth - clientWidth - 1)) {
                        scrollContainer.scrollTo({ left: 0, behavior: 'smooth' });
                    } else {
                        scrollContainer.scrollBy({ left: 300, behavior: 'smooth' });
                    }
                }, 5000);
            }
        };

        const renderBannerCarousel = (banners, containerId, allContent = []) => {
            const container = document.getElementById(containerId);
            if (!container || !banners || banners.length === 0) {
                 if(container) container.remove();
                 return;
            }
            const sortedBanners = [...banners].sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
            
            container.innerHTML = `
                <div id="${containerId}-carousel" class="relative w-full h-52 md:h-72 overflow-hidden rounded-2xl shadow-lg">
                    ${sortedBanners.map((banner, index) => {
                        if (!banner || !banner.imageUrl) return '';
                        const linkedItem = allContent.find(item => item.id === banner.linkId && (banner.linkType === 'story' || item.type === banner.linkType));
                        const resolvedLinkType = banner.linkType || (linkedItem ? linkedItem.type : '') || '';
                        const resolvedLinkId = banner.linkId || (linkedItem ? linkedItem.id : '') || '';
                        const resolvedExternalUrl = banner.directLinkUrl || '';
                        const isPromotion = banner.isPromotion === true || !!resolvedExternalUrl;
                        const linkedType = banner.linkType === 'series' ? 'fa-tv' : banner.linkType === 'story' ? 'fa-book-open' : 'fa-film';
                        const bannerTitle = escapeHtml((linkedItem ? linkedItem.title : '') || banner.overlayText || 'Featured');
                        const bannerYear = escapeHtml((linkedItem ? linkedItem.year : '') || '');
                        const bannerGenre = escapeHtml(linkedItem ? formatGenreText(linkedItem) : '');
                        const bannerPoster = linkedItem && linkedItem.posterUrl
                            ? `<img src="${linkedItem.posterUrl}" alt="${bannerTitle}" class="w-12 h-12 md:w-14 md:h-14 object-cover rounded-lg border border-white/10 shadow-lg flex-shrink-0">`
                            : `<div class="w-12 h-12 md:w-14 md:h-14 bg-gray-900/80 rounded-lg border border-white/10 flex items-center justify-center flex-shrink-0"><i class="fas ${linkedType} text-slate-300 text-sm"></i></div>`;
                        const { downloadUrl } = linkedItem ? getPrimaryMediaUrls(linkedItem) : { downloadUrl: '' };
                        const detailsHtml = `
                            <div class="absolute inset-x-0 bottom-0 p-3 md:p-4 bg-gradient-to-t from-black via-black/75 to-transparent">
                                <div class="max-w-[calc(100%-1rem)] md:max-w-[calc(100%-1.5rem)]">
                                    <div class="flex items-center gap-3 rounded-xl bg-[#24262d]/92 border border-white/5 shadow-2xl px-3 py-2">
                                        ${bannerPoster}
                                        <div class="min-w-0 flex-1">
                                            <h3 class="text-white text-sm md:text-base font-bold truncate leading-tight">${bannerTitle}</h3>
                                            <div class="flex items-center gap-2 mt-1 text-[11px] md:text-xs text-slate-300 min-w-0">
                                                ${isPromotion ? `<span class="inline-flex items-center rounded bg-yellow-400/15 border border-yellow-400/20 px-1.5 py-0.5 text-[9px] font-semibold text-yellow-300 flex-shrink-0">ADS</span>` : ''}
                                                <span class="truncate">${bannerGenre || 'Featured'}</span>
                                                ${bannerYear ? `<span class="text-slate-500">|</span><span class="truncate">${bannerYear}</span>` : ''}
                                                <span class="inline-flex items-center justify-center w-4 h-4 rounded bg-white/10 text-[9px] flex-shrink-0 ml-1">
                                                    <i class="fas ${linkedType}"></i>
                                                </span>
                                            </div>
                                        </div>
                                        ${downloadUrl ? `
                                            <button class="banner-download-btn w-10 h-10 rounded-full bg-emerald-400 hover:bg-emerald-300 text-slate-950 transition-colors flex items-center justify-center flex-shrink-0 shadow-lg" data-url="${downloadUrl}" title="Download">
                                                <i class="fas fa-download text-sm"></i>
                                            </button>
                                        ` : `
                                            <span class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/10 text-slate-300 flex-shrink-0">
                                                <i class="fas ${isPromotion ? 'fa-chevron-right' : linkedType} text-sm"></i>
                                            </span>
                                        `}
                                    </div>
                                </div>
                            </div>
                        `;
                        return `
                        <div class="banner-slide absolute inset-0 transition-opacity duration-1000 ease-in-out ${index === 0 ? 'opacity-100' : 'opacity-0'} cursor-pointer" data-link-type="${resolvedLinkType}" data-link-id="${resolvedLinkId}" data-external-url="${resolvedExternalUrl}">
                            <img src="${banner.imageUrl}" class="w-full h-full object-cover">
                            ${detailsHtml}
                        </div>`;
                    }).join('')}
                    <div class="absolute top-4 right-4 flex space-x-2">${sortedBanners.map((_, index) => `<button data-slide-to="${index}" class="banner-dot w-2 h-2 rounded-full ${index === 0 ? 'bg-red-500' : 'bg-white/40'}"></button>`).join('')}</div>
                </div>`;

            let currentIndex = 0;
            const slides = container.querySelectorAll('.banner-slide');
            const dots = container.querySelectorAll('.banner-dot');
            if (slides.length <= 1) return;
            
            const intervalId = setInterval(() => {
                currentIndex = (currentIndex + 1) % slides.length;
                updateBanner(currentIndex, slides, dots);
            }, 5000);
            
            dots.forEach(dot => dot.addEventListener('click', (e) => {
                e.stopPropagation();
                currentIndex = parseInt(dot.dataset.slideTo || '0');
                updateBanner(currentIndex, slides, dots);
                clearInterval(intervalId);
            }));
        };

        const updateBanner = (index, slides, dots) => {
            slides.forEach((slide, i) => {
                slide.classList.toggle('opacity-100', i === index);
                slide.classList.toggle('opacity-0', i !== index);
            });
            dots.forEach((dot, i) => {
                dot.classList.toggle('bg-red-500', i === index);
                dot.classList.toggle('bg-slate-500', i !== index);
            });
        };

        const renderDetailsPage = async (itemId, itemType) => {
            if (!itemId || !itemType) { appContainer.innerHTML = 'Content ID or Type is missing.'; return; }
            
            const allContent = await fetchAllContent();
            const item = allContent.find(c => c.id === itemId);

            if (!item) {
                appContainer.innerHTML = `<div class="page text-center p-8"><p>Content unavailable. It might have been removed.</p><button id="back-btn" class="mt-4 bg-red-600 text-white font-bold py-2 px-4 rounded">Go Back</button></div>`;
                const missingBackBtn = document.getElementById('back-btn');
                if (missingBackBtn) missingBackBtn.addEventListener('click', handleBack);
                return;
            }
            
            const header = `
                <div class="relative h-64 md:h-96">
                    ${item.posterUrl ? `<img src="${item.posterUrl}" class="w-full h-full object-cover opacity-30">` : ''}
                    <div class="absolute inset-0 bg-gradient-to-t from-black to-transparent"></div>
                    <button id="back-btn" class="absolute top-4 left-4 bg-black/50 hover:bg-gray-800 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors z-10"><i class="fas fa-arrow-left"></i></button>
                    <div class="absolute bottom-0 left-0 right-0 p-4 flex items-end space-x-4">
                        ${item.posterUrl ? `<img src="${item.posterUrl}" class="w-28 md:w-36 h-auto object-cover rounded-lg shadow-2xl flex-shrink-0">` : ''}
                        <div class="flex-grow"><h1 class="text-2xl md:text-4xl font-bold">${item.title || ''}</h1><p class="text-slate-400">${item.year || ''}</p></div>
                    </div>
                </div>`;
            
            const metaInfo = `
                <div class="p-4 pt-4 space-y-6">
                    <div class="flex items-center justify-between bg-gray-900 rounded-lg p-3 flex-wrap gap-4">
                        <div class="flex items-center space-x-4 flex-wrap gap-x-6 gap-y-2">
                            <div class="flex items-center space-x-2">
                                <button data-vote="like" class="vote-btn text-xl text-slate-400 hover:text-green-500 transition-colors"><i class="fas fa-thumbs-up"></i></button>
                                <span id="likes-count" class="font-bold text-base w-6 text-center">${item.likes || 0}</span>
                                <button data-vote="dislike" class="vote-btn text-xl text-slate-400 hover:text-blue-500 transition-colors"><i class="fas fa-thumbs-down"></i></button>
                                <span id="dislikes-count" class="font-bold text-base w-6 text-center">${item.dislikes || 0}</span>
                            </div>
                            ${item.rating ? `<div class="flex items-center space-x-1"><i class="fas fa-star text-yellow-400"></i><span class="font-bold text-lg text-white">${item.rating}</span><span class="text-slate-400">/10</span></div>` : ''}
                        </div>
                        <div class="flex items-center space-x-2">
                            <button id="add-to-list-btn" class="bg-gray-800 hover:bg-yellow-600 text-slate-300 hover:text-white font-bold py-2 px-3 rounded-lg flex items-center transition-colors">
                                <i class="fas fa-bookmark"></i>
                            </button>
                            <button id="share-btn" class="bg-gray-800 hover:bg-blue-600 text-slate-300 hover:text-white font-bold py-2 px-3 rounded-lg flex items-center transition-colors">
                                <i class="fas fa-share-alt"></i>
                            </button>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2 text-slate-400 flex-wrap gap-2">
                        ${item.category ? `<span class="border border-slate-600 rounded px-2 py-0.5 text-sm">${item.category}</span>` : ''}
                    </div>
                    <div><h2 class="text-lg font-semibold mb-2">Description</h2><p class="text-slate-300 leading-relaxed">${item.description || 'No description available.'}</p></div>
                    <div><h2 class="text-lg font-semibold mb-2">Cast</h2><p class="text-slate-400">${item.cast || 'N/A'}</p></div>
                </div>`;
            
            let contentBody = '';
            if (item.type === 'movie' || item.type === 'adult') {
                const parts = (item.parts && typeof item.parts === 'object') ? Object.values(item.parts) : [];
                if (parts.length > 0) {
                    contentBody = `<div class="px-4 pb-4 space-y-3">${parts.map((part, i) => part ? `
                        <div class="bg-gray-900 p-3 rounded-lg"><h3 class="font-semibold mb-2">${part.title || `Part ${i+1}`}</h3>
                            ${renderActionButtons(part, 'small', item.type)}
                        </div>` : '').join('')}</div>`;
                } else {
                    contentBody = `<div class="px-4 pb-4">${renderActionButtons(item, 'large', item.type)}</div>`;
                }
            } else if (item.type === 'series') {
                const seasons = item.seasons && typeof item.seasons === 'object' ? Object.values(item.seasons).sort((a,b) => (a.number || 0) - (b.number || 0)) : [];
                const totalEpisodes = seasons.reduce((count, season) => {
                    const episodes = season && season.episodes && typeof season.episodes === 'object' ? Object.values(season.episodes) : [];
                    return count + episodes.length;
                }, 0);
                const seriesSummaryHtml = `
                    <div class="flex items-center gap-2 text-xs text-slate-300 flex-wrap">
                        <span class="bg-gray-900 border border-gray-700 rounded-full px-3 py-1">S ${seasons.length}</span>
                        <span class="bg-gray-900 border border-gray-700 rounded-full px-3 py-1">EP ${totalEpisodes}</span>
                    </div>
                `;
                contentBody = `
                    <div class="px-4 pb-4 space-y-4">
                        ${seriesSummaryHtml}
                        <div class="relative"><input id="episode-search" type="text" placeholder="Search episodes by number or title..." class="w-full bg-gray-900 border border-gray-700 rounded-lg py-2 pl-10 pr-4 focus:outline-none focus:ring-1 focus:ring-red-500"><i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i></div>
                        <div id="seasons-container" class="space-y-4">
                        ${seasons.length > 0 ? seasons.map((season, i) => {
                            if (!season) return '';
                            const episodes = season.episodes && typeof season.episodes === 'object' ? Object.values(season.episodes).sort((a, b) => getEpisodeNumber(a) - getEpisodeNumber(b)) : [];
                            return `
                            <div class="season-block"><h3 class="text-xl font-bold mb-2">Season ${season.number || i + 1}</h3>
                                <div class="episodes-list space-y-2">
                                ${episodes.length > 0 ? episodes.map(ep => {
                                    if (!ep) return '';
                                    const parts = ep.parts && typeof ep.parts === 'object' ? Object.values(ep.parts) : [];
                                    const partsHtml = parts.map(part => `
                                        <div class="bg-gray-950 p-2 rounded-md mt-2 ml-4">
                                            <p class="font-semibold text-sm">${part.title}</p>
                                            ${renderActionButtons(part, 'small', 'series')}
                                        </div>`).join('');
                                    
                                    return `
                                    <div class="episode-item bg-gray-900 p-3 rounded-lg" data-title="e${ep.episodeNumber || ep.number} ${ep.title || ''}">
                                        <div class="flex items-center justify-between gap-3">
                                            <p class="font-semibold">E${ep.episodeNumber || ep.number} - ${ep.title || 'Untitled Episode'}</p>
                                            ${ep.isFinal ? `<span class="text-[10px] font-bold tracking-wide px-2 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-red-300">FINAL</span>` : ''}
                                        </div>
                                        ${renderActionButtons(ep, 'small', 'series')}
                                        ${partsHtml}
                                    </div>`;
                                }).join('') : '<p class="text-slate-400 px-3">No episodes available for this season.</p>'}
                                </div>
                            </div>`;
                        }).join('') : '<p class="text-slate-400">No seasons available for this series.</p>'}
                        </div>
                    </div>`;
            }

            appContainer.innerHTML = `<div class="page">${header}${metaInfo}${contentBody}<div id="recommendations-container" class="border-t border-gray-800 mt-4"></div></div>`;
            
            if (item.category) {
                const recommendations = allContent.filter(c => c.category === item.category && c.id !== itemId && c.isPublished !== false);
                const recommendationsContainer = document.getElementById('recommendations-container');
                if (recommendationsContainer && recommendations.length > 0) {
                    recommendationsContainer.innerHTML = recommendationsCarouselTemplate('You May Also Like', recommendations);
                }
            }
            
            addDetailsPageEventListeners(item.id, item.type, item);
            const episodeSearch = document.getElementById('episode-search');
            if (episodeSearch) episodeSearch.addEventListener('input', handleEpisodeSearch);
        };

        const renderWatchPage = async (watchId) => {
            const payload = getStoredWatchPagePayload(watchId);

            if (!payload || !payload.watchUrl) {
                appContainer.innerHTML = `<div class="page text-center p-8"><p>Video not available.</p><button id="back-btn" class="mt-4 bg-red-600 text-white font-bold py-2 px-4 rounded">Go Back</button></div>`;
                const backBtn = document.getElementById('back-btn');
                if (backBtn) backBtn.addEventListener('click', handleBack);
                return;
            }

            const {
                parentId,
                parentType,
                parentTitle,
                title,
                description,
                rating,
                year,
                genre,
                watchUrl,
                downloadUrl,
                threadId
            } = payload;

            const imdbRate = rating || 'N/A';
            const releaseYear = year || 'N/A';
            const genreText = genre || 'Unknown Genre';
            const contentTitle = title || parentTitle || 'Now Playing';
            const itemRoute = parentId && parentType ? `details:${parentId}:${parentType}` : null;
            const safeContentTitle = escapeHtml(contentTitle);
            const safeGenreText = escapeHtml(genreText);
            const safeDescription = escapeHtml(description || 'No description available.');

            addWatchHistoryItem({
                watchId,
                parentId,
                parentType,
                title: contentTitle,
                posterUrl: payload.posterUrl || '',
                year: releaseYear,
                genre: genreText
            });

            appContainer.innerHTML = `
                <div class="page min-h-screen bg-black pb-32">
                    <div class="sticky top-0 z-20 bg-black/95 backdrop-blur border-b border-gray-800">
                        <div class="flex items-center justify-between p-4">
                            <button id="back-btn" class="bg-gray-800 hover:bg-gray-700 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors"><i class="fas fa-arrow-left"></i></button>
                            <span class="text-sm uppercase tracking-[0.25em] text-slate-400">Player</span>
                            <button id="watch-share-top-btn" class="bg-gray-800 hover:bg-blue-600 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors"><i class="fas fa-share-alt"></i></button>
                        </div>
                    </div>

                    <div class="p-4 space-y-6 max-w-5xl mx-auto">
                        <section class="bg-[#111317] border border-white/10 rounded-[1.85rem] shadow-[0_24px_80px_rgba(0,0,0,0.55)] ring-1 ring-white/5 overflow-hidden">
                            <div class="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/5 bg-gradient-to-r from-[#1a1d22] via-[#121418] to-[#1a1d22]">
                                <div class="min-w-0">
                                    <p class="text-[10px] uppercase tracking-[0.35em] text-orange-300/80">SwaMedia Player</p>
                                    <h1 class="text-sm md:text-base font-semibold text-white truncate">${safeContentTitle}</h1>
                                </div>
                                <div class="flex items-center gap-2 text-xs text-slate-400">
                                    <span class="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-emerald-300">
                                        <span class="w-2 h-2 rounded-full bg-emerald-400"></span>Playing
                                    </span>
                                </div>
                            </div>

                            <div id="watch-player-shell" class="p-3 md:p-4 space-y-4">
                                ${renderEmbeddedPlayer(watchUrl, contentTitle, 'relative aspect-video bg-gradient-to-br from-gray-950 via-black to-gray-900 rounded-[1.75rem] overflow-hidden border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.45)] ring-1 ring-white/5')}

                                <div class="space-y-3">
                                    <div class="h-1.5 rounded-full bg-white/10 overflow-hidden">
                                        <div class="h-full w-[38%] bg-gradient-to-r from-orange-400 via-yellow-300 to-orange-500 rounded-full"></div>
                                    </div>
                                    <div class="flex items-center justify-between gap-3 text-[11px] sm:text-xs text-slate-400">
                                        <span>Network stream ready</span>
                                        <span>Google Drive source</span>
                                    </div>
                                </div>

                                <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/5 bg-black/30 px-3 py-3">
                                    <div class="flex flex-wrap items-center gap-2">
                                        <button id="watch-fullscreen-btn" class="bg-white/5 hover:bg-orange-500 text-white text-xs md:text-sm font-medium py-2 px-3 rounded-xl transition-colors">
                                            <i class="fas fa-expand mr-2"></i>Fullscreen
                                        </button>
                                        <button id="watch-add-to-list-btn" class="bg-white/5 hover:bg-yellow-600 text-white text-xs md:text-sm font-medium py-2 px-3 rounded-xl transition-colors">
                                            <i class="fas fa-bookmark mr-2"></i>Save
                                        </button>
                                        <button id="watch-share-btn" class="bg-white/5 hover:bg-blue-600 text-white text-xs md:text-sm font-medium py-2 px-3 rounded-xl transition-colors">
                                            <i class="fas fa-share-alt mr-2"></i>Share
                                        </button>
                                        <button id="watch-details-btn" class="bg-white/5 hover:bg-red-600 text-white text-xs md:text-sm font-medium py-2 px-3 rounded-xl transition-colors ${itemRoute ? '' : 'opacity-50 cursor-not-allowed'}" ${itemRoute ? '' : 'disabled'}>
                                            <i class="fas fa-layer-group mr-2"></i>Details
                                        </button>
                                        <button id="watch-download-btn" class="bg-white/5 hover:bg-emerald-600 text-white text-xs md:text-sm font-medium py-2 px-3 rounded-xl transition-colors ${downloadUrl ? '' : 'opacity-50 cursor-not-allowed'}" ${downloadUrl ? '' : 'disabled'}>
                                            <i class="fas fa-download mr-2"></i>Download
                                        </button>
                                    </div>
                                    <div class="flex flex-wrap items-center gap-2 text-xs">
                                        <span class="bg-yellow-500/15 text-yellow-300 border border-yellow-500/30 rounded-full px-3 py-1"><i class="fas fa-star mr-2"></i>IMDB ${imdbRate}</span>
                                        <span class="bg-white/5 text-slate-200 border border-white/10 rounded-full px-3 py-1">${releaseYear}</span>
                                        <span class="bg-white/5 text-slate-200 border border-white/10 rounded-full px-3 py-1">${safeGenreText}</span>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section class="bg-gray-950 border border-gray-800 rounded-2xl p-4">
                            <h2 class="text-lg font-semibold text-white mb-2">Description</h2>
                            <p class="text-slate-300 leading-relaxed">${safeDescription}</p>
                        </section>

                        <section class="bg-gray-950 border border-gray-800 rounded-2xl p-4">
                            <div class="flex items-center justify-between gap-3 mb-4">
                                <h2 class="text-lg font-semibold text-white">Comments</h2>
                                <span class="text-xs text-slate-500">Share your thoughts</span>
                            </div>
                            <div class="space-y-3">
                                <div id="reply-target-box" class="hidden bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-3">
                                    <div class="flex items-center justify-between gap-3">
                                        <p id="reply-target-text" class="text-sm text-blue-200"></p>
                                        <button id="cancel-reply-btn" class="text-xs text-blue-300 hover:text-white transition-colors">Cancel</button>
                                    </div>
                                </div>
                                <textarea id="comment-input" rows="4" placeholder="Andika comment yako hapa..." class="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"></textarea>
                                <button id="comment-submit-btn" class="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-5 rounded-xl transition-colors">
                                    <i class="fas fa-paper-plane mr-2"></i>Post Comment
                                </button>
                            </div>
                            <div id="comments-list" class="mt-4"></div>
                        </section>
                    </div>
                </div>
            `;

            setCurrentVideoId(threadId || watchId);
            clearReplyTarget();
            renderReplyTarget();
            showCommentList(threadId || watchId);

            const watchBackBtn = document.getElementById('back-btn');
            if (watchBackBtn) watchBackBtn.addEventListener('click', handleBack);
            const cancelReplyBtn = document.getElementById('cancel-reply-btn');
            if (cancelReplyBtn) cancelReplyBtn.addEventListener('click', clearReplyTarget);

            const shareHandler = async () => {
                const shareData = {
                    title: contentTitle,
                    text: `Watch ${contentTitle} on SwaMedia`,
                    url: window.location.href
                };

                try {
                    if (navigator.share) {
                        await navigator.share(shareData);
                    } else if (navigator.clipboard) {
                        await navigator.clipboard.writeText(window.location.href);
                        showNotification('Link copied!', 'success');
                    } else {
                        alert('Sharing is not supported on this browser.');
                    }
                } catch (error) {
                    if (!error || error.name !== 'AbortError') {
                        console.error('Sharing failed:', error);
                    }
                }
            };

            const watchShareBtn = document.getElementById('watch-share-btn');
            if (watchShareBtn) watchShareBtn.addEventListener('click', shareHandler);
            const watchShareTopBtn = document.getElementById('watch-share-top-btn');
            if (watchShareTopBtn) watchShareTopBtn.addEventListener('click', shareHandler);
            const watchFullscreenBtn = document.getElementById('watch-fullscreen-btn');
            if (watchFullscreenBtn) watchFullscreenBtn.addEventListener('click', async () => {
                const playerShell = document.getElementById('watch-player-shell');
                if (!playerShell) return;
                try {
                    if (document.fullscreenElement) {
                        await document.exitFullscreen();
                    } else if (playerShell.requestFullscreen) {
                        await playerShell.requestFullscreen();
                    }
                } catch (error) {
                    console.error('Fullscreen failed:', error);
                }
            });
            const watchAddToListBtn = document.getElementById('watch-add-to-list-btn');
            if (watchAddToListBtn) watchAddToListBtn.addEventListener('click', () => addToList(parentId || watchId));
            const watchDownloadBtn = document.getElementById('watch-download-btn');
            if (watchDownloadBtn) watchDownloadBtn.addEventListener('click', () => {
                if (downloadUrl) {
                    window.open(downloadUrl, '_blank');
                }
            });
            const watchDetailsBtn = document.getElementById('watch-details-btn');
            if (watchDetailsBtn) watchDetailsBtn.addEventListener('click', () => {
                if (itemRoute) {
                    navigateTo(itemRoute);
                }
            });
            const commentSubmitBtn = document.getElementById('comment-submit-btn');
            if (commentSubmitBtn) commentSubmitBtn.addEventListener('click', saveComment);
        };
        
        const renderXXXVideoPage = async (itemId) => {
            const allContent = await fetchAllContent();
            const item = allContent.find(c => c.id === itemId && c.type === 'Education');

            if (!item || !item.videoUrl) {
                appContainer.innerHTML = `<div class="page text-center p-8"><p>Video not available.</p><button id="back-btn" class="mt-4 bg-red-600 text-white font-bold py-2 px-4 rounded">Go Back</button></div>`;
                const xxxBackBtn = document.getElementById('back-btn');
                if (xxxBackBtn) xxxBackBtn.addEventListener('click', handleBack);
                return;
            }

            const { previewUrl } = getGoogleDriveUrls(item.videoUrl);

            appContainer.innerHTML = `
                <div class="page">
                    <header class="flex items-center space-x-4 p-4 sticky top-0 bg-black z-10">
                        <button id="back-btn" class="bg-gray-800 hover:bg-gray-700 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors flex-shrink-0"><i class="fas fa-arrow-left"></i></button>
                        <h1 class="text-xl font-bold truncate">${item.title}</h1>
                    </header>
                    <div class="p-4">
                        ${renderEmbeddedPlayer(previewUrl || item.videoUrl, item.title, 'relative aspect-video bg-black rounded-lg overflow-hidden', 'w-full h-full absolute inset-0')}
                        <div class="mt-4">
                            <h2 class="text-2xl font-bold">${item.title}</h2>
                        </div>
                    </div>
                </div>
            `;
            const xxxVideoBackBtn = document.getElementById('back-btn');
            if (xxxVideoBackBtn) xxxVideoBackBtn.addEventListener('click', handleBack);
        };


        const renderVideoDetailPage = async (itemId, itemType) => {
             const allContent = await fetchAllContent();
             const item = allContent.find(c => c.id === itemId && c.type === itemType);

            if (!item) {
                appContainer.innerHTML = `<div class="page text-center p-8"><p>Content unavailable. It might have been removed.</p><button id="back-btn" class="mt-4 bg-red-600 text-white font-bold py-2 px-4 rounded">Go Back</button></div>`;
                const videoMissingBackBtn = document.getElementById('back-btn');
                if (videoMissingBackBtn) videoMissingBackBtn.addEventListener('click', handleBack);
                return;
            }

            const { previewUrl } = getGoogleDriveUrls(item.videoUrl);

            appContainer.innerHTML = `
                <div class="page">
                    <header class="flex items-center space-x-4 p-4 sticky top-0 bg-black z-10">
                        <button id="back-btn" class="bg-gray-800 hover:bg-gray-700 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors flex-shrink-0"><i class="fas fa-arrow-left"></i></button>
                        <h1 class="text-xl font-bold truncate">${item.title}</h1>
                    </header>
                    <div class="p-4">
                        ${previewUrl ? `
                            ${renderEmbeddedPlayer(previewUrl, item.title, 'relative aspect-video bg-black rounded-lg overflow-hidden')}
                        ` : `
                            <div class="aspect-video bg-gray-900 rounded-lg flex items-center justify-center">
                                <p class="text-slate-400">Video not available.</p>
                            </div>
                        `}
                        <div class="mt-4">
                            <h2 class="text-2xl font-bold">${item.title}</h2>
                            ${item.posterUrl ? `<img src="${item.posterUrl}" class="w-full h-auto object-cover rounded-lg mt-4 shadow-lg">` : ''}
                        </div>
                    </div>
                </div>
            `;
            const videoDetailBackBtn = document.getElementById('back-btn');
            if (videoDetailBackBtn) videoDetailBackBtn.addEventListener('click', handleBack);
        };

        const handleEpisodeSearch = (e) => {
            const query = e.target.value.toLowerCase().trim();
            document.querySelectorAll('.episode-item').forEach(item => {
                const title = item.dataset.title ? item.dataset.title.toLowerCase() : '';
                item.style.display = title.includes(query) ? 'block' : 'none';
            });
        };

        const renderSearchPage = async () => {
            appContainer.innerHTML = `
                <div class="page p-4">
                    <div class="pt-4 mb-4">${SwaMediaHeader}</div>
                    
                    <!-- Standard Search -->
                    <div class="mb-6">
                        <label for="standard-search-input" class="block text-lg font-semibold text-slate-300 mb-2">Standard Search</label>
                        <div class="relative">
                            <input id="standard-search-input" placeholder="Search by exact title..." class="w-full bg-gray-900 border border-gray-700 rounded-lg py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
                        </div>
                    </div>

                    <!-- AI Search -->
                    <div class="mb-6">
                        <label for="ai-search-input" class="block text-lg font-semibold text-slate-300 mb-2">
                            <i class="fas fa-robot text-red-500 mr-2"></i>AI Search Bar
                        </label>
                        <div class="relative">
                            <textarea id="ai-search-input" placeholder="Describe a movie... e.g., 'action movie ya 2023'" class="w-full bg-gray-900 border border-gray-700 rounded-lg py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none" rows="1"></textarea>
                             <i class="fas fa-magic absolute left-3 top-5 -translate-y-1/2 text-slate-400"></i>
                        </div>
                    </div>

                    <div id="swamedia-ads-container" class="mb-6"></div>
                    <div id="search-results" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"><p class="col-span-full text-center text-slate-400 mt-8">Start typing in a search bar to see results.</p></div>
                </div>`;
            
            const standardSearchInput = document.getElementById('standard-search-input');
            const aiSearchInput = document.getElementById('ai-search-input');

            aiSearchInput.addEventListener('input', (e) => {
                 standardSearchInput.value = ''; // Clear the other input
                 e.target.style.height = 'auto';
                 e.target.style.height = (e.target.scrollHeight) + 'px';
                 handleAISearch(e);
            });
            
            standardSearchInput.addEventListener('input', (e) => {
                aiSearchInput.value = ''; // Clear the other input
                aiSearchInput.style.height = 'auto'; // Reset height
                handleStandardSearch(e);
            });

            renderSwaMediaAds();
        };

        const calculateAIScore = (item, query) => {
            if (!query) return 0;

            const stopWords = new Set(['the', 'a', 'an', 'is', 'in', 'on', 'of', 'for', 'with', 'to', 'and', 'or', 'but', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'who', 'when', 'where', 'why', 'how', 'movie', 'movies', 'series', 'dj', 'ya', 'za', 'na', 'kama', 'kwa', 'au', 'ni']);
            
            const processText = (text) => (text || '').toLowerCase();
            
            const processQuery = (q) => {
                const tokens = processText(q).split(/[\s,.-]+/).filter(w => w.length > 1 && !stopWords.has(w));
                // Simple stemming
                return tokens.map(token => {
                    if (token.endsWith('s')) return token.slice(0, -1);
                    if (token.endsWith('ing')) return token.slice(0, -3);
                    if (token.endsWith('ed')) return token.slice(0, -2);
                    return token;
                });
            };

            const queryTokens = processQuery(query);
            if (queryTokens.length === 0 && !query.match(/\d/)) return 0; // Don't search if only stopwords
            
            let score = 0;
            const weights = {
                title: 50,
                fullTitle: 200,
                category: 30,
                dj: 30,
                description: 3,
                fullDescription: 50,
                year: 40,
                cast: 2,
                rating: 10
            };

            const title = processText(item.title);
            const description = processText(item.description);
            const category = processText(item.category);
            const dj = processText(item.dj);
            const cast = processText(item.cast);
            const itemType = processText(item.type);

            // Full phrase matching (higher weight)
            if (title.includes(query.toLowerCase())) score += weights.fullTitle;
            if (description.includes(query.toLowerCase())) score += weights.fullDescription;
            
            // Token-based matching
            queryTokens.forEach(token => {
                if (title.includes(token)) score += weights.title;
                if (category.includes(token)) score += weights.category;
                if (itemType.includes(token)) score += weights.category; // Treat type like a category
                if (dj.includes(token)) score += weights.dj;
                if (description.includes(token)) score += weights.description;
                if (cast.includes(token)) score += weights.cast;
            });
            
            // Contextual & Numeric Keyword Matching
            const numbers = query.match(/\d+(\.\d+)?/g) || [];
            numbers.forEach(numStr => {
                const num = parseFloat(numStr);
                // Year match
                if (num >= 1900 && num <= new Date().getFullYear() + 1) {
                    if (item.year && item.year.toString() === numStr) {
                        score += weights.year;
                    }
                }
                // Rating match
                else if (num >= 0 && num <= 10) {
                     if (item.rating && Math.abs(parseFloat(item.rating) - num) < 1.0) {
                         score += weights.rating * (10 - Math.abs(parseFloat(item.rating) - num));
                     }
                }
            });

            if ((query.includes('new') || query.includes('mpya') || query.includes('recent')) && item.year >= new Date().getFullYear() - 2) {
                score += 25;
            }
            if ((query.includes('old') || query.includes('zamani')) && item.year < 2010) {
                score += 20;
            }
            if ((query.includes('best') || query.includes('kali') || query.includes('nzuri')) && item.rating) {
                score += parseFloat(item.rating) * 5;
            }
            
            // Partial word matching bonus for title
            if (query.length > 3 && title.startsWith(query.toLowerCase())) {
                 score += 60;
            }

            return score;
        };

        const handleAISearch = async (e) => {
            const query = e.target.value;
            const resultsContainer = document.getElementById('search-results');
            
            if (!query || query.trim().length < 2) {
                resultsContainer.innerHTML = '<p class="col-span-full text-center text-slate-400 mt-8">Describe the movie or series you are looking for in the AI Search Bar.</p>';
                return;
            }
            
            resultsContainer.innerHTML = `<div class="col-span-full flex justify-center mt-8"><div class="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>`;
            
            const allContent = await fetchAllContent();
            const publishedContent = allContent.filter(item => item && item.title && item.isPublished !== false);

            const scoredResults = publishedContent
                .map(item => ({ ...item, score: calculateAIScore(item, query) }))
                .filter(item => item.score > 0)
                .sort((a, b) => b.score - a.score);

            if (scoredResults.length > 0) {
                resultsContainer.innerHTML = scoredResults.map((item, index) => 
                    itemCardTemplate(item, item.type, `search-result-item" style="animation-delay: ${Math.min(index * 30, 500)}ms;`)
                ).join('');
            } else {
                resultsContainer.innerHTML = `<p class="col-span-full text-center text-slate-400 mt-8">No results found for "${e.target.value}"</p>`;
            }
        };

        const handleStandardSearch = async (e) => {
            const query = e.target.value.toLowerCase().trim();
            const resultsContainer = document.getElementById('search-results');
            
            if (!query) {
                resultsContainer.innerHTML = '<p class="col-span-full text-center text-slate-400 mt-8">Start typing in a search bar to see results.</p>';
                return;
            }
            
            resultsContainer.innerHTML = `<div class="col-span-full flex justify-center mt-8"><div class="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>`;
            
            const allContent = await fetchAllContent();
            const publishedContent = allContent.filter(item => item && item.title && item.isPublished !== false);

            const filteredResults = publishedContent.filter(item => 
                (item.title || '').toLowerCase().includes(query)
            );

            if (filteredResults.length > 0) {
                resultsContainer.innerHTML = filteredResults.map((item, index) => 
                    itemCardTemplate(item, item.type, `search-result-item" style="animation-delay: ${Math.min(index * 30, 500)}ms;`)
                ).join('');
            } else {
                resultsContainer.innerHTML = `<p class="col-span-full text-center text-slate-400 mt-8">No results found for "${e.target.value}"</p>`;
            }
        };

        const renderSwaMediaAds = async () => {
            const container = document.getElementById('swamedia-ads-container');
            if (!container) return;

            try {
                const adsSnap = await fetchData('swaMediaAds');
                if (!adsSnap.exists()) {
                    container.style.display = 'none';
                    return;
                }

                const allAds = transformSnapshotToArray(adsSnap);
                const activeAds = allAds.filter(ad => ad.isActive === true);

                if (activeAds.length === 0) {
                    container.style.display = 'none';
                    return;
                }

                // Render the most recent active ad.
                const ad = activeAds.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];

                let adHtml = '';
                const adTitleHtml = ad.title ? `<h3 class="text-lg font-bold mb-3">${ad.title}</h3>` : '';

                if (ad.type === 'image' && ad.imageUrl) {
                    adHtml = `
                        ${adTitleHtml}
                        <a href="${ad.linkUrl || '#'}" target="_blank" class="block w-full rounded-lg overflow-hidden shadow-lg hover:shadow-red-500/50 transition-shadow">
                            <img src="${ad.imageUrl}" alt="${ad.title || 'Advertisement'}" class="w-full h-auto object-cover">
                        </a>
                    `;
                } else if (ad.type === 'video' && ad.videoUrl) {
                    adHtml = `
                        ${adTitleHtml}
                        <div class="w-full rounded-lg overflow-hidden shadow-lg aspect-video bg-black">
                            <video src="${ad.videoUrl}" controls muted playsinline class="w-full h-full"></video>
                        </div>
                    `;
                } else if (ad.type === 'movie-list' && ad.movieIds && ad.movieIds.length > 0) {
                    const allContent = await fetchAllContent();
                    const adMovies = allContent.filter(item => ad.movieIds.includes(item.id));
                    if (adMovies.length > 0) {
                        adHtml = `
                            <div>
                                ${adTitleHtml || `<h3 class="text-lg font-bold mb-3">Featured Content</h3>`}
                                <div class="flex overflow-x-auto space-x-4 pb-4 -mb-4 horizontal-scroll">
                                    ${adMovies.map(item => itemCardTemplate(item, item.type)).join('')}
                                    <div class="flex-shrink-0 w-1"></div>
                                </div>
                            </div>
                        `;
                    }
                }

                if (adHtml) {
                    container.innerHTML = adHtml;
                    container.style.display = 'block';
                } else {
                    container.style.display = 'none';
                }

            } catch (error) {
                console.error("Error rendering SwaMedia Ads:", error);
                container.style.display = 'none';
            }
        };

        const renderAllSeriesPage = async () => {
            const [seriesBannersSnap, categoriesSnap] = await Promise.all([
                fetchData('seriesbanners'),
                fetchData('categories')
            ]);
            const allContent = await fetchAllContent();
            const seriesBanners = transformSnapshotToArray(seriesBannersSnap);
            const categories = transformSnapshotToArray(categoriesSnap);

            const seriesWithTypes = allContent.filter(c => c.type === 'series' && c.isPublished !== false);

            const trendingSeries = [...seriesWithTypes].sort((a,b) => (b.rating || 0) - (a.rating || 0)).slice(0, 15);
            const recentlyAddedSeries = seriesWithTypes.slice(0, 15);
            const groupedSeriesGenres = [...new Set(seriesWithTypes.flatMap(item => getItemGenreList(item)))];
            const seriesByGenreSections = groupedSeriesGenres.map(genreName => {
                const genreSeries = seriesWithTypes.filter(item => getItemGenreList(item).includes(genreName));
                return {
                    genreName,
                    items: genreSeries
                };
            }).filter(section => section.items.length > 0);

            appContainer.innerHTML = `
                <div class="page">
                    <div class="px-4 pt-6">${SwaMediaHeader}</div>
                    <div id="series-banner-carousel-container" class="mt-4 px-4"></div>
                    
                    ${genreCarouselTemplate(categories)}

                    <div class="px-4 mt-6">
                        <div class="relative">
                            <input id="series-search-input" type="text" placeholder="Search all series..." class="w-full bg-gray-900 border border-gray-700 rounded-lg py-2 pl-10 pr-4 focus:outline-none focus:ring-1 focus:ring-red-500">
                            <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
                        </div>
                    </div>

                    ${carouselTemplate('Trending Series', trendingSeries, 'series')}
                    ${carouselTemplate('Recently Added', recentlyAddedSeries, 'series')}
                    <div class="p-4">
                        <h1 class="text-2xl font-bold mb-4 mt-4">Series By Genre</h1>
                        <div id="all-series-grid" class="space-y-8">
                            ${seriesByGenreSections.length > 0 ? seriesByGenreSections.map(section => `
                                <section>
                                    <div class="flex items-center justify-between mb-4 gap-3">
                                        <h2 class="text-xl font-semibold text-white">${escapeHtml(section.genreName)}</h2>
                                        <span class="text-xs text-slate-400">${section.items.length} series</span>
                                    </div>
                                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                        ${section.items.map(item => itemCardTemplate(item, 'series')).join('')}
                                    </div>
                                </section>
                            `).join('') : `<p class="col-span-full text-center text-slate-400 mt-8">No series found.</p>`}
                        </div>
                         <p id="no-series-results" class="col-span-full text-center text-slate-400 mt-8 hidden">No series found matching your search.</p>
                    </div>
                </div>
            `;
            
            renderBannerCarousel(seriesBanners, 'series-banner-carousel-container', allContent);
            document.getElementById('series-search-input').addEventListener('input', handleSeriesSearch);
        };

        const handleSeriesSearch = (e) => {
            const query = e.target.value.toLowerCase().trim();
            const grid = document.getElementById('all-series-grid');
            const items = grid.querySelectorAll('.item-card');
            const sections = grid.querySelectorAll('section');
            const noResultsMessage = document.getElementById('no-series-results');
            let visibleCount = 0;

            items.forEach(item => {
                const title = item.dataset.title.toLowerCase();
                const isVisible = title.includes(query);
                item.style.display = isVisible ? 'block' : 'none';
                if (isVisible) {
                    visibleCount++;
                }
            });

            sections.forEach(section => {
                const visibleItemsInSection = section.querySelectorAll('.item-card[style="display: block;"], .item-card:not([style*="display: none"])').length;
                section.style.display = visibleItemsInSection > 0 ? 'block' : 'none';
            });

            noResultsMessage.style.display = visibleCount === 0 ? 'block' : 'none';
        };

        const renderCategoriesPage = async () => {
            const categoriesSnap = await fetchData('categories');
            const categories = transformSnapshotToArray(categoriesSnap)
                .filter(cat => cat && cat.name)
                .sort((a, b) => String(a.name).localeCompare(String(b.name)));
            appContainer.innerHTML = `
                <div class="page p-4">
                    <div class="pt-4 mb-4">${SwaMediaHeader}</div>
                    <div class="relative mb-6">
                        <input id="category-search-input" type="text" placeholder="Search for a genre..." class="w-full bg-gray-900 border border-gray-700 rounded-lg py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-red-500">
                        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
                    </div>
                    <div id="categories-grid" class="space-y-3">
                        ${(categories || []).map((cat, index) => cat ? `
                            <div data-category-name="${escapeHtml(cat.name)}" class="category-item bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-red-500/60 transition-colors cursor-pointer flex items-center justify-between gap-4 p-4 rounded-xl shadow-lg">
                                <div class="flex items-center gap-4 min-w-0">
                                    <span class="inline-flex items-center justify-center min-w-10 h-10 px-3 rounded-lg bg-red-600/15 border border-red-500/30 text-red-300 font-bold text-sm">
                                        ${index + 1}
                                    </span>
                                    <div class="min-w-0">
                                        <span class="block font-semibold text-slate-100 truncate">${escapeHtml(cat.name)}</span>
                                        <span class="block text-xs text-slate-400 mt-1">Label ${index + 1}</span>
                                    </div>
                                </div>
                                <i class="fas fa-chevron-right text-slate-500 flex-shrink-0"></i>
                            </div>` : '').join('')}
                    </div>
                    <p id="no-category-results" class="text-center text-slate-400 mt-8 hidden">No genres found.</p>
                </div>`;
            document.getElementById('category-search-input').addEventListener('input', handleCategorySearch);
        };

        const handleCategorySearch = (e) => {
            const query = e.target.value.toLowerCase().trim();
            const grid = document.getElementById('categories-grid');
            const items = grid.querySelectorAll('.category-item');
            const noResultsMessage = document.getElementById('no-category-results');
            let visibleCount = 0;

            items.forEach(item => {
                const name = item.dataset.categoryName.toLowerCase();
                const isVisible = name.includes(query);
                item.style.display = isVisible ? 'flex' : 'none';
                if (isVisible) {
                    visibleCount++;
                }
            });

            if (visibleCount === 0) {
                noResultsMessage.classList.remove('hidden');
            } else {
                noResultsMessage.classList.add('hidden');
            }
        };

        const renderCategoryContentPage = async (categoryName) => {
             const allContent = await fetchAllContent();
             const filtered = allContent.filter(item => item && (item.category === categoryName || (Array.isArray(item.genres) && item.genres.includes(categoryName))) && item.isPublished !== false);
             
             appContainer.innerHTML = `
                <div class="page p-4">
                    <header class="flex items-center space-x-4 pt-4 mb-4">
                        <button id="back-btn" class="bg-gray-800 hover:bg-gray-700 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors flex-shrink-0"><i class="fas fa-arrow-left"></i></button>
                        <h1 class="text-2xl font-bold">${categoryName}</h1>
                    </header>
                     <div id="category-results" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        ${filtered.length > 0 ? filtered.map(item => itemCardTemplate(item, item.type)).join('') : `<p class="col-span-full text-center text-slate-400 mt-8">No content found in this category.</p>`}
                     </div>
                </div>
             `;
             const categoryBackBtn = document.getElementById('back-btn');
             if (categoryBackBtn) categoryBackBtn.addEventListener('click', handleBack);
        };

        const renderGenreContentPage = async (genreName) => {
             const allContent = await fetchAllContent();
             const filtered = allContent.filter(item => item && (item.category === genreName || (Array.isArray(item.genres) && item.genres.includes(genreName))) && item.isPublished !== false);
             
             appContainer.innerHTML = `
                <div class="page p-4">
                    <header class="flex items-center space-x-4 pt-4 mb-4">
                        <button id="back-btn" class="bg-gray-800 hover:bg-gray-700 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors flex-shrink-0"><i class="fas fa-arrow-left"></i></button>
                        <h1 class="text-2xl font-bold">${genreName}</h1>
                    </header>
                     <div id="genre-results" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        ${filtered.length > 0 ? filtered.map(item => itemCardTemplate(item, item.type)).join('') : `<p class="col-span-full text-center text-slate-400 mt-8">No content found in this genre.</p>`}
                     </div>
                </div>
             `;
             const genreBackBtn = document.getElementById('back-btn');
             if (genreBackBtn) genreBackBtn.addEventListener('click', handleBack);
        };
        
        const renderDjPage = async () => {
             const allContent = await fetchAllContent();
             const djContent = allContent.filter(item => item && item.dj && item.dj.trim() !== '' && item.isPublished !== false);

             appContainer.innerHTML = `
                <div class="page p-4">
                    <header class="flex items-center space-x-4 pt-4 mb-4">
                        <button id="back-btn" class="bg-gray-800 hover:bg-gray-700 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors flex-shrink-0"><i class="fas fa-arrow-left"></i></button>
                        <h1 class="text-2xl font-bold">DJ Movies & Series</h1>
                    </header>
                     <div id="dj-results" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        ${djContent.length > 0 ? djContent.map(item => itemCardTemplate(item, item.type)).join('') : `<p class="col-span-full text-center text-slate-400 mt-8">No DJ content found.</p>`}
                     </div>
                </div>
             `;
             const djBackBtn = document.getElementById('back-btn');
             if (djBackBtn) djBackBtn.addEventListener('click', handleBack);
        };

        const renderSeeAllPage = async (title, items) => {
             const categoriesSnap = await fetchData('categories');
             const categories = transformSnapshotToArray(categoriesSnap).map(cat => cat.name).filter(Boolean);
             const allContent = (await fetchAllContent()).filter(item => item.isPublished !== false && (item.type || 'movie') === 'movie');
             const selectedGenre = sessionStorage.getItem('seeAllSelectedGenre') || title;

             const availableGenres = [...new Set([
                ...categories,
                ...items.flatMap(item => {
                    const genres = [];
                    if (item.category) genres.push(item.category);
                    if (item.genre) genres.push(item.genre);
                    if (Array.isArray(item.genres)) genres.push(...item.genres);
                    return genres;
                })
             ])]
                .filter(Boolean)
                .sort((a, b) => String(a).localeCompare(String(b)));

             const filteredItems = allContent
                .filter(item => {
                    if (!selectedGenre) return true;
                    return item.category === selectedGenre || item.genre === selectedGenre || (Array.isArray(item.genres) && item.genres.includes(selectedGenre));
                })
                .sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));

             appContainer.innerHTML = `
                <div class="page p-4 space-y-5">
                    <header class="flex items-center space-x-4 pt-4">
                        <button id="back-btn" class="bg-gray-800 hover:bg-gray-700 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors flex-shrink-0"><i class="fas fa-arrow-left"></i></button>
                        <div>
                            <h1 class="text-2xl font-bold">${selectedGenre || title}</h1>
                            <p class="text-sm text-slate-400">Sorted by ranking</p>
                        </div>
                    </header>
                    <div class="grid grid-cols-3 gap-3 sm:gap-4 md:gap-5 items-start">
                        <div class="space-y-3 col-span-2">
                            ${filteredItems.length > 0 ? filteredItems.map((item, index) => `
                                <div class="bg-gray-900 border border-gray-800 rounded-2xl p-3 flex items-center gap-2 sm:gap-3 item-card cursor-pointer" data-id="${item.id}" data-type="${item.type || 'movie'}" data-title="${escapeHtml(item.title)}">
                                    <div class="flex-shrink-0 flex flex-col items-center justify-center gap-1 w-10 sm:w-12 md:w-14">
                                        <span class="inline-flex items-center justify-center px-1.5 sm:px-2 py-1 rounded-md bg-yellow-400 text-black text-[9px] sm:text-[10px] font-black tracking-wide uppercase">IMDb</span>
                                        <span class="text-lg sm:text-xl md:text-2xl font-black text-yellow-300 leading-none">${index + 1}</span>
                                    </div>
                                    <div class="relative flex-shrink-0 w-14 h-20 sm:w-16 sm:h-20 rounded-xl overflow-hidden bg-gray-800">
                                        ${item.posterUrl ? `<img src="${item.posterUrl}" alt="${escapeHtml(item.title)}" class="w-full h-full object-cover">` : `<div class="w-full h-full flex items-center justify-center text-slate-500"><i class="fas fa-film"></i></div>`}
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <h3 class="font-semibold text-white truncate text-sm sm:text-base">${item.title}</h3>
                                        <p class="text-[11px] sm:text-xs text-slate-400 mt-1 truncate">${item.year || 'N/A'} • ${formatGenreText(item)}</p>
                                        <div class="flex items-center gap-2 mt-2 text-[11px] sm:text-xs text-slate-500">
                                            <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/5">
                                                <i class="fas ${(item.type || 'movie') === 'series' ? 'fa-tv' : 'fa-film'}"></i>
                                            </span>
                                            <span>Rating ${item.rating || 'N/A'}</span>
                                        </div>
                                    </div>
                                    ${getPrimaryMediaUrls(item).downloadUrl ? `
                                        <button class="card-download-btn flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-black/80 hover:bg-blue-600 text-white border border-white/10 transition-colors flex items-center justify-center" data-url="${getPrimaryMediaUrls(item).downloadUrl}" title="Download">
                                            <i class="fas fa-download text-xs"></i>
                                        </button>
                                    ` : ''}
                                </div>
                            `).join('') : `<p class="text-center text-slate-400 mt-8 col-span-full">No content found for this genre.</p>`}
                        </div>
                        <aside class="col-span-1 bg-gray-950/70 border border-gray-800 rounded-2xl p-2 sm:p-3 space-y-2 sm:space-y-3 sticky top-4">
                            <div class="px-1">
                                <h2 class="text-[11px] sm:text-sm font-bold text-white uppercase tracking-wide">Genres</h2>
                                <p class="text-[10px] sm:text-xs text-slate-400 mt-1">Chagua genre upande wa kulia</p>
                            </div>
                            ${availableGenres.map((genre, genreIndex) => `
                                <button class="seeall-genre-btn w-full text-left bg-gray-900 border rounded-xl sm:rounded-2xl px-2 sm:px-4 py-2 sm:py-3 transition-colors flex items-center justify-between gap-2 sm:gap-4 ${genre === selectedGenre ? 'border-red-500 bg-red-600/10 text-white' : 'border-gray-800 text-slate-300 hover:border-red-500'}" data-genre="${escapeHtml(genre)}">
                                    <span class="flex items-center gap-2 sm:gap-3 min-w-0">
                                        <span class="inline-flex items-center justify-center min-w-7 h-7 sm:min-w-9 sm:h-9 px-2 rounded-lg bg-red-600/15 border border-red-500/30 text-red-300 font-bold text-[10px] sm:text-sm">
                                            ${genreIndex + 1}
                                        </span>
                                        <span class="truncate text-[11px] sm:text-sm">${genre}</span>
                                    </span>
                                    <i class="fas fa-chevron-right text-slate-500 flex-shrink-0 text-[10px] sm:text-xs"></i>
                                </button>
                            `).join('')}
                        </aside>
                    </div>
                </div>
             `;
             const seeAllBackBtn = document.getElementById('back-btn');
             if (seeAllBackBtn) seeAllBackBtn.addEventListener('click', handleBack);
        };

        const renderStaticPage = async (pageKey) => {
            const title = pageKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            const pageSnap = await fetchData(`pages/${pageKey}`);
            let content = pageSnap.exists() ? pageSnap.val() : null;

            if (!content) {
                if (pageKey === 'disclaimer') {
                    content = `Hakuna Hati ya Umiliki wa Filamu
        Swamedia App haina umiliki wa movies, series, au maudhui yote yaliyopo kwenye app. Yote yanatolewa kwa kusambaza burudani kwa watumiaji tu.
        Matumizi Binafsi Pekee
        Maudhui yote yanayopatikana kwenye Swamedia App ni kwa matumizi binafsi. Utoaji, mauzo, au usambazaji wa maudhui bila idhini ya wamiliki ni kinyume cha sheria.
        Hakuna Udhibiti wa Mwanga wa Internet
        Ubora wa streaming na download unategemea ubora wa internet yako. Swamedia App haiwezi kudhibiti kasi ya mtandao wako.
        Responsibility ya Premium
        Malipo ya Premium yanapokelewa moja kwa moja. Hakikisha chanzo cha malipo ni sahihi. Swamedia App haiwezi kurudisha malipo baada ya huduma kutumika.
        Maudhui ya Wateja
        Maoni, reviews, au uploads zinazofanywa na watumiaji ni jambo la kibinafsi la mtumiaji. Swamedia App haiwezi kuchukua jukumu lolote juu ya maudhui hayo.
        Sheria na Vikwazo
        Watumiaji wanapaswa kufuata sheria za nchi yao kuhusu usambazaji na kutazama maudhui ya burudani.
        Kwa ufupi: Swamedia App ni jukwaa la burudani, na yote ni kwa kusoma na kutazama binafsi, bila dhamana ya kisheria kwa maudhui yaliyosambazwa.`;
                } else if (pageKey === 'privacyPolicy') {
                    content = `You can view our privacy policy by visiting the following link:\n\nhttps://www.termsfeed.com/live/69477a34-04d1-4625-bc7e-bbeb72583a6c`;
                } else if (pageKey === 'help') {
                    content = `Help – Swamedia App (Step by Step)
        Karibu kwenye Swamedia App! Hapa utajifunza jinsi ya kutumia app kuangalia movies na series zilizotafsiriwa Kiswahili, kupanua Premium, na features nyingine.

        1. Jinsi ya Kutazama Movies na Series
        Step 1: Fungua app ya Swamedia
        Step 2: Chagua Home page ili kuona movies na series zilizopendekezwa
        Step 3: Bonyeza movie au series unayotaka kutazama
        Step 4: Bonyeza Play ili kuanza streaming
        Step 5: Kwa watumiaji wa Premium, streaming ni bila matangazo na kwa ubora wa juu

        2. Jinsi ya Kupanua Premium
        Step 1: Fungua Profile
        Step 2: Chagua Upgrade to Premium
        Step 3: Chagua package unayotaka kulipa:
        Tsh 1,000 – Siku 1
        Tsh 1,500 – Wiki 1
        Tsh 3,000 – Wiki 2
        Tsh 5,000 – Mwezi 1
        Step 4: Lipa kupitia njia uliyochagua (Tigo Pesa, M-Pesa, Airtel Money, n.k.)
        Step 5: Baada ya malipo, utapata faida zote za Premium moja kwa moja

        3. Jinsi ya Kuangalia Movies Offline (Download)
        Step 1: Chagua movie au series unayotaka kupakua
        Step 2: Bonyeza Download icon
        Step 3: Subiri download ikamilike
        Step 4: Fungua Downloads kwenye app ili kuangalia movie bila internet

        4. Jinsi ya Kureset Password
        Step 1: Fungua screen ya Login
        Step 2: Bonyeza Forgot Password?
        Step 3: Ingiza email uliyojisajili nayo
        Step 4: Fuata maelekezo ya ku-reset password kupitia email yako

        5. Mambo ya Kuzingatia
        - Hakikisha una internet yenye nguvu kwa streaming
        - Premium inatoa streaming bila matangazo na access ya maudhui yote
        - Zingatia storage ya simu kama unapakua movies`;
                } else if (pageKey === 'aboutUs') {
                    content = `About Us – Swamedia App
        Swamedia App ni jukwaa la kisasa la burudani lililoundwa kwa ajili ya Watanzania na wapenda filamu kwa ujumla, likiwa na lengo la kukuleta movies na series zilizotafsiriwa kwa Kiswahili kwa ubora wa hali ya juu.

        Tunatoa maudhui mbalimbali yakiwemo:
        🎬 Movies za Kimataifa zilizotafsiriwa Kiswahili
        📺 TV Series maarufu
        🎥 Action, Drama, Romance, Horror, Comedy na Genres nyingine nyingi
        📱 Muonekano rahisi na rafiki kwa mtumiaji (user-friendly)

        Huduma ya Premium
        Kwa watumiaji wanaotaka kufurahia bila usumbufu wa matangazo na kupata access kamili ya maudhui yote, Swamedia App inatoa huduma ya Premium kwa bei nafuu sana:
        💰 Tsh 1,000 – Siku 1
        💰 Tsh 1,500 – Wiki 1
        💰 Tsh 3,000 – Wiki 2
        💰 Tsh 5,000 – Mwezi 1

        Faida za Premium:
        ✅ Kutazama bila matangazo
        ✅ Access ya movies & series zote
        ✅ Streaming yenye kasi na ubora mzuri
        ✅ Content mpya mapema

        Dhamira Yetu
        Dhamira ya Swamedia App ni:
        - Kukuza matumizi ya lugha ya Kiswahili kwenye burudani
        - Kuwapa watumiaji maudhui bora kwa gharama nafuu
        - Kuweka mazingira salama, rahisi na ya kuaminika kwa watumiaji wote

        Kwa Nini Uchague Swamedia App?
        ⭐ Kiswahili safi na kinachoeleweka
        ⭐ Content mpya inaongezwa mara kwa mara
        ⭐ Inafanya kazi vizuri kwenye simu za kawaida
        ⭐ Huduma kwa wateja iko tayari kukusaidia

        Swamedia App – Burudani Halisi kwa Kiswahili 🇹🇿`;
                } else {
                    content = 'Content not available.';
                }
            }
            
            appContainer.innerHTML = `
                <div class="page p-4">
                     <header class="flex items-center space-x-4 pt-4 mb-4">
                        <button id="back-btn" class="bg-gray-800 hover:bg-gray-700 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors flex-shrink-0"><i class="fas fa-arrow-left"></i></button>
                        <h1 class="text-2xl font-bold">${title}</h1>
                    </header>
                    <div class="bg-gray-900 p-4 rounded-lg whitespace-pre-wrap text-slate-300 leading-relaxed">${content}</div>
                </div>
            `;
            const staticBackBtn = document.getElementById('back-btn');
            if (staticBackBtn) staticBackBtn.addEventListener('click', handleBack);
        };

        const renderStoryZonePage = async () => {
            const [storiesSnap, storyBannersSnap] = await Promise.all([
                fetchData('stories'),
                fetchData('storybanners')
            ]);
            const stories = transformSnapshotToArray(storiesSnap).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            const storyBanners = transformSnapshotToArray(storyBannersSnap);

            appContainer.innerHTML = `
                <div id="storyZonePage" class="page p-4">
                    <header class="flex items-center space-x-4 pt-4 mb-4">
                        <button id="back-btn" class="bg-gray-800 hover:bg-gray-700 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors flex-shrink-0"><i class="fas fa-arrow-left"></i></button>
                        <h1 class="text-2xl font-bold">StoryZone</h1>
                    </header>
                    <div id="story-banner-carousel-container" class="mb-6"></div>
                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        ${stories.length > 0 ? stories.map(story => itemCardTemplate(story, 'story')).join('') : `<p class="col-span-full text-center text-slate-400 mt-8">No stories available right now.</p>`}
                    </div>
                </div>
            `;
            const storyZoneBackBtn = document.getElementById('back-btn');
            if (storyZoneBackBtn) storyZoneBackBtn.addEventListener('click', handleBack);
            renderBannerCarousel(storyBanners, 'story-banner-carousel-container', []);
        };

        const renderStoryDetailPage = async (storyId) => {
            const storySnap = await fetchData(`stories/${storyId}`);
            if (!storySnap.exists()) {
                appContainer.innerHTML = `<div class="page text-center p-8"><p>Story not found.</p><button id="back-btn" class="mt-4 bg-red-600 text-white font-bold py-2 px-4 rounded">Go Back</button></div>`;
                const storyMissingBackBtn = document.getElementById('back-btn');
                if (storyMissingBackBtn) storyMissingBackBtn.addEventListener('click', handleBack);
                return;
            }
            const story = { id: storyId, ...storySnap.val() };
            const chapters = story.chapters ? Object.keys(story.chapters).map(key => ({ id: key, ...story.chapters[key] })) : [];

            appContainer.innerHTML = `
                <div class="page">
                    <div class="relative h-64">
                        ${story.posterUrl ? `<img src="${story.posterUrl}" class="w-full h-full object-cover opacity-30">` : ''}
                        <div class="absolute inset-0 bg-gradient-to-t from-black to-transparent"></div>
                        <button id="back-btn" class="absolute top-4 left-4 bg-black/50 hover:bg-gray-800 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors z-10"><i class="fas fa-arrow-left"></i></button>
                        <div class="absolute bottom-0 left-0 right-0 p-4">
                            <h1 class="text-3xl font-bold">${story.title || 'Untitled Story'}</h1>
                        </div>
                    </div>
                    <div class="p-4">
                        <h2 class="text-xl font-bold mb-3">Chapters</h2>
                        <div class="space-y-2">
                            ${chapters.length > 0 ? chapters.map(ch => `
                                <div class="chapter-link bg-gray-900 hover:bg-gray-800 transition-colors cursor-pointer p-4 rounded-lg flex justify-between items-center" data-story-id="${story.id}" data-chapter-id="${ch.id}">
                                    <span class="font-semibold">${ch.title}</span>
                                    <i class="fas fa-chevron-right text-slate-500"></i>
                                </div>
                            `).join('') : '<p class="text-slate-400">No chapters available for this story.</p>'}
                        </div>
                    </div>
                </div>
            `;
            const storyDetailBackBtn = document.getElementById('back-btn');
            if (storyDetailBackBtn) storyDetailBackBtn.addEventListener('click', handleBack);
        };

        const renderChapterReaderPage = async (storyId, chapterId) => {
            const storySnap = await fetchData(`stories/${storyId}`);
            if (!storySnap.exists()) {
                appContainer.innerHTML = `<div class="page text-center p-8"><p>Story not found.</p><button id="back-btn" class="mt-4 bg-red-600 text-white font-bold py-2 px-4 rounded">Go Back</button></div>`;
                const chapterMissingBackBtn = document.getElementById('back-btn');
                if (chapterMissingBackBtn) chapterMissingBackBtn.addEventListener('click', handleBack);
                return;
            }
            const story = storySnap.val();
            const chapter = story.chapters ? story.chapters[chapterId] : null;
             const allChapters = story.chapters ? Object.keys(story.chapters).map(key => ({ id: key, ...story.chapters[key] })) : [];

            if (!chapter) {
                appContainer.innerHTML = `<div class="page text-center p-8"><p>Chapter not found.</p><button id="back-btn" class="mt-4 bg-red-600 text-white font-bold py-2 px-4 rounded">Go Back</button></div>`;
                const chapterBackBtn = document.getElementById('back-btn');
                if (chapterBackBtn) chapterBackBtn.addEventListener('click', handleBack);
                return;
            }
            
            const savedTheme = localStorage.getItem('readerTheme') || 'dark';
            const savedFontSize = localStorage.getItem('readerFontSize') || '18';

            appContainer.innerHTML = `
                <div id="reader-container" class="reader-container page fixed inset-0 overflow-y-auto reader-theme-${savedTheme}" style="padding-bottom: 0;">
                    <header class="reader-header sticky top-0 z-10 p-2 border-b border-gray-700 flex flex-col gap-2">
                        <div class="flex items-center gap-2">
                            <button id="back-btn" class="flex-shrink-0 bg-gray-800/50 hover:bg-gray-700/80 rounded-full w-9 h-9 flex items-center justify-center transition-colors"><i class="fas fa-arrow-left"></i></button>
                            <select id="chapter-selector" class="bg-gray-800/50 border border-gray-600 rounded-md p-1.5 text-sm w-full focus:ring-1 focus:ring-red-500 focus:outline-none">
                                ${allChapters.map(ch => `<option value="${ch.id}" ${ch.id === chapterId ? 'selected' : ''}>${ch.title}</option>`).join('')}
                            </select>
                        </div>
                        <div class="flex items-center justify-between gap-2 px-2">
                             <div class="flex items-center gap-3">
                                <button data-theme="dark" class="theme-btn w-6 h-6 rounded-full bg-gray-800 border-2 ${savedTheme === 'dark' ? 'border-blue-500' : 'border-gray-600'}"></button>
                                <button data-theme="sepia" class="theme-btn w-6 h-6 rounded-full bg-[#fbf0d9] border-2 ${savedTheme === 'sepia' ? 'border-blue-500' : 'border-gray-600'}"></button>
                                <button data-theme="light" class="theme-btn w-6 h-6 rounded-full bg-gray-200 border-2 ${savedTheme === 'light' ? 'border-blue-500' : 'border-gray-600'}"></button>
                            </div>
                            <div class="flex items-center gap-2">
                                <button id="decrease-font" class="text-lg bg-gray-800/50 hover:bg-gray-700/80 rounded-md w-9 h-9 leading-none">A-</button>
                                <button id="increase-font" class="text-xl bg-gray-800/50 hover:bg-gray-700/80 rounded-md w-9 h-9 leading-none">A+</button>
                            </div>
                        </div>
                    </header>
                    <div id="reader-content" class="reader-content p-4 sm:p-6 md:p-8 max-w-3xl mx-auto whitespace-pre-wrap" style="font-size: ${savedFontSize}px;">
                        ${chapter.content}
                    </div>
                </div>
            `;
            
            const readerContainer = document.getElementById('reader-container');
            const readerContent = document.getElementById('reader-content');

            const scrollKey = `reading-progress-${storyId}-${chapterId}`;
            const savedScroll = localStorage.getItem(scrollKey);
            if (savedScroll) {
                setTimeout(() => {
                    readerContainer.scrollTop = parseInt(savedScroll, 10);
                }, 100);
            }

            readerContainer.addEventListener('scroll', () => {
                if(scrollSaveTimeout) clearTimeout(scrollSaveTimeout);
                scrollSaveTimeout = setTimeout(() => {
                    localStorage.setItem(scrollKey, readerContainer.scrollTop.toString());
                }, 500);
            });

            const pagesBackBtn = document.getElementById('back-btn');
            if (pagesBackBtn) pagesBackBtn.addEventListener('click', handleBack);
            document.getElementById('chapter-selector').addEventListener('change', (e) => {
                const newChapterId = e.target.value;
                navigateTo(`chapterReader:${storyId}:${newChapterId}`);
            });
            document.querySelectorAll('.theme-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const theme = e.target.dataset.theme;
                    readerContainer.className = readerContainer.className.replace(/reader-theme-\w+/, `reader-theme-${theme}`);
                    localStorage.setItem('readerTheme', theme);
                    document.querySelectorAll('.theme-btn').forEach(b => b.classList.replace('border-blue-500','border-gray-600'));
                    e.target.classList.replace('border-gray-600', 'border-blue-500');
                });
            });
            document.getElementById('increase-font').addEventListener('click', () => {
                let currentSize = parseInt(readerContent.style.fontSize);
                if (currentSize < 32) {
                    const newSize = currentSize + 1;
                    readerContent.style.fontSize = `${newSize}px`;
                    localStorage.setItem('readerFontSize', newSize.toString());
                }
            });
             document.getElementById('decrease-font').addEventListener('click', () => {
                let currentSize = parseInt(readerContent.style.fontSize);
                if (currentSize > 12) {
                    const newSize = currentSize - 1;
                    readerContent.style.fontSize = `${newSize}px`;
                    localStorage.setItem('readerFontSize', newSize.toString());
                }
            });
        };

        const renderWakubwaTuPage = async () => {
            const allContent = await fetchAllContent();
            
            const wakubwaContent = allContent.filter(item => {
                if (!item || item.isPublished === false) return false;
                if (item.type === 'adult') return true;
                if (item.category === 'Education') return true;
                return false;
            });

            const uniqueIds = new Set();
            const uniqueContent = wakubwaContent.filter(item => {
                if (uniqueIds.has(item.id)) {
                    return false;
                } else {
                    uniqueIds.add(item.id);
                    return true;
                }
            });

            appContainer.innerHTML = `
                <div class="page p-4">
                    <header class="flex items-center space-x-4 pt-4 mb-4">
                        <button id="back-btn" class="bg-gray-800 hover:bg-gray-700 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors flex-shrink-0"><i class="fas fa-arrow-left"></i></button>
                        <h1 class="text-2xl font-bold">Education</h1>
                    </header>
                    <div id="wakubwa-tu-results" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        ${uniqueContent.length > 0 ? uniqueContent.map(item => itemCardTemplate(item, item.type || 'adult')).join('') : `<p class="col-span-full text-center text-slate-400 mt-8">No content found in this section.</p>`}
                    </div>
                </div>
            `;
            const profileBackBtn = document.getElementById('back-btn');
            if (profileBackBtn) profileBackBtn.addEventListener('click', handleBack);
        };

        const showContactModal = () => {
            const modal = document.getElementById('premium-modal');
            const modalContent = modal.querySelector('.modal-content');

            modalContent.innerHTML = `
                <button id="close-contact-modal-btn" class="absolute top-2 right-2 w-8 h-8 bg-gray-800 hover:bg-gray-700 transition-colors rounded-full text-slate-400 z-10">&times;</button>
                <h3 class="text-center font-semibold text-xl mb-4 text-red-400"><i class="fas fa-headset mr-2"></i>Contact Support</h3>
                <div class="space-y-3 text-center">
                    <p class="text-slate-300">For help or inquiries, use the options below.</p>
                    <div class="bg-gray-800 p-3 rounded-lg">
                        <p class="text-slate-400 text-sm">Phone Number</p>
                        <p class="font-mono text-lg">0748472076</p>
                    </div>
                    <button id="copy-number-btn" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"><i class="fas fa-copy mr-2"></i>Copy Number</button>
                    <a href="https://wa.me/255772822552" target="_blank" class="block w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"><i class="fab fa-whatsapp mr-2"></i>Chat on WhatsApp</a>
                </div>
            `;

            modal.classList.remove('hidden');
            modal.classList.add('flex');

            modal.querySelector('#close-contact-modal-btn').addEventListener('click', () => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            });

            modal.querySelector('#copy-number-btn').addEventListener('click', (e) => {
                const number = '0748472076';
                navigator.clipboard.writeText(number).then(() => {
                    const btn = e.currentTarget;
                    btn.innerHTML = '<i class="fas fa-check mr-2"></i>Copied!';
                    setTimeout(() => {
                        btn.innerHTML = '<i class="fas fa-copy mr-2"></i>Copy Number';
                    }, 2000);
                }).catch(err => {
                    console.error('Failed to copy: ', err);
                    alert('Failed to copy number.');
                });
            });
        }

        const showLoginRequiredModal = () => {
            const modal = document.getElementById('premium-modal');
            const modalContent = modal.querySelector('.modal-content');
            modalContent.innerHTML = `
                <button id="close-login-required-modal" class="absolute top-2 right-2 w-8 h-8 bg-gray-800 hover:bg-gray-700 transition-colors rounded-full text-slate-400 z-10">&times;</button>
                <h3 class="text-center font-semibold text-xl mb-4 text-red-400"><i class="fas fa-sign-in-alt mr-2"></i>Access Required</h3>
                <p class="text-center text-slate-300 mb-6">Jisajili kwanza ili ku access premium au ku watch.</p>
                <button id="go-to-profile-btn" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">Ingia / Jisajili</button>
            `;
            modal.classList.remove('hidden');
            modal.classList.add('flex');

            modal.querySelector('#close-login-required-modal').addEventListener('click', () => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            });

            modal.querySelector('#go-to-profile-btn').addEventListener('click', () => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
                navigateTo('profile');
            });
        };

        const showIosInstallInstructions = () => {
            const modal = document.getElementById('premium-modal');
            const modalContent = modal.querySelector('.modal-content');
            modalContent.innerHTML = `
                <button id="close-ios-modal" class="absolute top-2 right-2 w-8 h-8 bg-gray-800 hover:bg-gray-700 transition-colors rounded-full text-slate-400 z-10">&times;</button>
                <h3 class="text-center font-semibold text-xl mb-4 text-red-400"><i class="fab fa-apple mr-2"></i>Install on iPhone</h3>
                <div class="space-y-4 text-slate-300">
                    <p>To install this app on your iPhone, please follow these steps:</p>
                    <ol class="list-decimal list-inside space-y-2 bg-gray-800 p-4 rounded-lg text-left">
                        <li>First, ensure you are using the <strong>Safari</strong> browser.</li>
                        <li>Tap the 'Share' button <i class="fas fa-share-square"></i> at the bottom of the screen.</li>
                        <li>Scroll down and tap on <strong>'Add to Home Screen'</strong>.</li>
                        <li>Confirm by tapping 'Add' in the top right corner.</li>
                    </ol>
                </div>
            `;
            modal.classList.remove('hidden');
            modal.classList.add('flex');

            modal.querySelector('#close-ios-modal').addEventListener('click', () => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            });
        };

        const showPremiumRequiredModal = () => {
            const modal = document.getElementById('premium-modal');
            const modalContent = modal.querySelector('.modal-content');
            modalContent.innerHTML = `
                <button id="close-premium-required-modal" class="absolute top-2 right-2 w-8 h-8 bg-gray-800 hover:bg-gray-700 transition-colors rounded-full text-slate-400 z-10">&times;</button>
                <h3 class="text-center font-semibold text-xl mb-4 text-red-400"><i class="fas fa-lock mr-2"></i>Premium Content</h3>
                <p class="text-center text-slate-300 mb-2">Lipia kwanza ili uangalie movizite kwenye app.</p>
                ${getPremiumPlansHtml('')}
            `;
            modal.classList.remove('hidden');
            modal.classList.add('flex');

            modal.querySelector('#close-premium-required-modal').addEventListener('click', () => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            });
        };

        const timeSince = (timestamp) => {
            if (!timestamp) return '';
            const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
            let interval = seconds / 31536000;
            if (interval > 1) { const val = Math.floor(interval); return val + (val === 1 ? " year ago" : " years ago"); }
            interval = seconds / 2592000;
            if (interval > 1) { const val = Math.floor(interval); return val + (val === 1 ? " month ago" : " months ago"); }
            interval = seconds / 86400;
            if (interval > 1) { const val = Math.floor(interval); return val + (val === 1 ? " day ago" : " days ago"); }
            interval = seconds / 3600;
            if (interval > 1) { const val = Math.floor(interval); return val + (val === 1 ? " hour ago" : " hours ago"); }
            interval = seconds / 60;
            if (interval > 1) { const val = Math.floor(interval); return val + (val === 1 ? " minute ago" : " minutes ago"); }
            return Math.floor(seconds) + " seconds ago";
        };

        const NOTIFICATION_REACTIONS = ['\u{1F44D}', '\u2764\uFE0F', '\u{1F602}', '\u{1F525}'];
        let notificationReplyTargets = {};

        const isCurrentUserAdmin = () => Boolean(currentUser && (
            currentUser.role === 'admin' ||
            currentUser.isAdmin === true ||
            currentUser.admin === true
        ));

        const normalizeNotification = (notification) => {
            const replies = notification && notification.replies && typeof notification.replies === 'object'
                ? Object.keys(notification.replies).map(key => ({ id: key, ...notification.replies[key] }))
                : [];

            return {
                ...notification,
                authorId: (notification && notification.authorId) || 'admin',
                authorName: (notification && notification.authorName) || 'Admin',
                timestamp: Number((notification && notification.timestamp) || Date.now()),
                replies: replies.sort((a, b) => Number(a.time || 0) - Number(b.time || 0)),
                reactions: notification && notification.reactions && typeof notification.reactions === 'object' ? notification.reactions : {}
            };
        };

        const getLatestNotificationActivityTimestamp = (notification) => {
            const baseTimestamp = Number((notification && notification.timestamp) || 0);
            const latestReplyTimestamp = ((notification && notification.replies) || []).reduce((latest, reply) => {
                return Math.max(latest, Number((reply && reply.time) || 0));
            }, 0);
            return Math.max(baseTimestamp, latestReplyTimestamp);
        };

        const getNotificationActor = () => getCommentAuthor();
        const getNotificationReplyTextareaId = (notificationId) => `notification-reply-input-${notificationId}`;

        const renderNotificationReplyTarget = (notificationId) => {
            const box = document.getElementById(`notification-reply-target-${notificationId}`);
            const text = document.getElementById(`notification-reply-target-text-${notificationId}`);
            if (!box || !text) return;

            const target = notificationReplyTargets[notificationId];
            if (!target) {
                box.classList.add('hidden');
                text.textContent = '';
                return;
            }

            text.textContent = `Replying to ${target.authorName}: "${target.text.slice(0, 80)}${target.text.length > 80 ? '...' : ''}"`;
            box.classList.remove('hidden');
        };

        function clearNotificationReplyTarget(notificationId) {
            delete notificationReplyTargets[notificationId];
            renderNotificationReplyTarget(notificationId);
        }

        function setNotificationReplyTarget(notificationId, replyId = '') {
            const notification = notificationsCache.find(entry => entry.id === notificationId);
            if (!notification) return;

            if (!replyId) {
                notificationReplyTargets[notificationId] = {
                    id: notification.id,
                    authorName: notification.authorName || 'Admin',
                    text: notification.message || notification.title || ''
                };
            } else {
                const reply = (notification.replies || []).find(entry => entry.id === replyId);
                if (!reply) return;
                notificationReplyTargets[notificationId] = {
                    id: reply.id,
                    authorName: reply.authorName || 'User',
                    text: reply.text || ''
                };
            }

            renderNotificationReplyTarget(notificationId);
            const replyTextarea = document.getElementById(getNotificationReplyTextareaId(notificationId));
            if (replyTextarea) replyTextarea.focus();
        }

        const getNotificationReactionCounts = (reactions = {}) => {
            return Object.values(reactions).reduce((acc, emoji) => {
                if (!emoji) return acc;
                acc[emoji] = (acc[emoji] || 0) + 1;
                return acc;
            }, {});
        };

        async function toggleNotificationReaction(notificationId, emoji) {
            try {
                const { authorId } = getNotificationActor();
                const notification = notificationsCache.find(entry => entry.id === notificationId);
                const currentReaction = notification && notification.reactions ? notification.reactions[authorId] : undefined;

                await update(ref(database, `notifications/${notificationId}/reactions`), {
                    [authorId]: currentReaction === emoji ? null : emoji
                });

                await openNotificationsPanel();
            } catch (error) {
                console.error('Could not update reaction:', error);
                showNotification('We could not update your reaction right now.', 'error');
            }
        }

        async function saveNotificationReply(notificationId) {
            const textarea = document.getElementById(getNotificationReplyTextareaId(notificationId));
            if (!textarea) return;

            const text = textarea.value.trim();
            if (!text) {
                showNotification('Please write a reply first.', 'error');
                return;
            }

            try {
                if (!(await ensureParticipationAllowed())) return;
                const { authorId, authorName } = getNotificationActor();
                const target = notificationReplyTargets[notificationId] || null;
                const replyRef = push(ref(database, `notifications/${notificationId}/replies`));

                await set(replyRef, {
                    text,
                    time: Date.now(),
                    authorId,
                    authorName,
                    replyToId: target ? target.id : null,
                    replyToName: target ? target.authorName : null
                });

                textarea.value = '';
                clearNotificationReplyTarget(notificationId);
                await openNotificationsPanel();
                showNotification('Your reply has been posted successfully.', 'success');
            } catch (error) {
                console.error('Could not save notification reply:', error);
                showNotification('We could not post your reply. Please try again.', 'error');
            }
        }

        async function removeNotificationReply(notificationId, replyId) {
            try {
                const notification = notificationsCache.find(entry => entry.id === notificationId);
                const reply = notification && notification.replies ? notification.replies.find(entry => entry.id === replyId) : null;
                const { authorId } = getNotificationActor();

                if (!reply) return;
                if (!(isCurrentUserAdmin() || reply.authorId === authorId)) {
                    showNotification('Only the author or admin can remove this reply.', 'error');
                    return;
                }

                await update(ref(database, `notifications/${notificationId}/replies`), {
                    [replyId]: null
                });

                await openNotificationsPanel();
                showNotification('Reply removed successfully.', 'success');
            } catch (error) {
                console.error('Could not remove reply:', error);
                showNotification('We could not remove that reply right now.', 'error');
            }
        }

        async function removeNotificationPost(notificationId) {
            try {
                const notification = notificationsCache.find(entry => entry.id === notificationId);
                const { authorId } = getNotificationActor();

                if (!notification) return;
                if (!(isCurrentUserAdmin() || notification.authorId === authorId)) {
                    showNotification('Only the sender or admin can remove this notification.', 'error');
                    return;
                }
                if (!confirm('Unataka kufuta notification hii?')) return;

                await update(ref(database, 'notifications'), {
                    [notificationId]: null
                });

                await openNotificationsPanel();
                showNotification('Notification removed successfully.', 'success');
            } catch (error) {
                console.error('Could not remove notification:', error);
                showNotification('We could not remove that notification right now.', 'error');
            }
        }

        const showNotificationModal = () => {
            const modal = document.getElementById('notification-modal');
            if (!modal) return;
            const modalContent = modal.querySelector('.modal-content');

            let contentHtml = `
                <div class="flex justify-between items-center mb-4 flex-shrink-0">
                    <h3 class="font-semibold text-xl text-red-400"><i class="fas fa-bell mr-2"></i>Notifications</h3>
                    <button id="close-notification-modal-btn" class="w-8 h-8 bg-gray-800 hover:bg-gray-700 transition-colors rounded-full text-slate-400 z-10">&times;</button>
                </div>
                <div class="overflow-y-auto space-y-3 pr-2">`;
            
            if (notificationsCache.length > 0) {
                contentHtml += notificationsCache.map(n => {
                    const { authorId } = getNotificationActor();
                    const canDeleteNotification = isCurrentUserAdmin() || n.authorId === authorId;
                    const reactionCounts = getNotificationReactionCounts(n.reactions);
                    const currentReaction = n.reactions[authorId] || '';
                    const repliesHtml = n.replies.length > 0 ? n.replies.map(reply => {
                        const canDeleteReply = isCurrentUserAdmin() || reply.authorId === authorId;
                        return `
                            <div class="bg-gray-900/80 rounded-xl p-3 border border-gray-700">
                                <div class="flex items-start justify-between gap-3">
                                    <div class="min-w-0">
                                        <div class="flex items-center gap-2 flex-wrap">
                                            <span class="text-sm font-semibold text-blue-300">${escapeHtml(reply.authorName || 'User')}</span>
                                            <span class="text-xs text-slate-500">${timeSince(reply.time || Date.now())}</span>
                                        </div>
                                        ${reply.replyToName ? `<p class="text-xs text-slate-500 mt-1">Reply to ${escapeHtml(reply.replyToName)}</p>` : ''}
                                        <p class="text-sm text-slate-200 mt-1 leading-relaxed">${escapeHtml(reply.text || '')}</p>
                                    </div>
                                    <div class="flex items-center gap-3 flex-shrink-0">
                                        <button onclick="setNotificationReplyTarget('${n.id}', '${reply.id}')" class="text-xs text-slate-400 hover:text-blue-400 transition-colors">Reply</button>
                                        ${canDeleteReply ? `<button onclick="removeNotificationReply('${n.id}', '${reply.id}')" class="text-slate-400 hover:text-red-400 transition-colors"><i class="fas fa-trash"></i></button>` : ''}
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('') : `<p class="text-sm text-slate-500">No replies yet.</p>`;

                    return `
                        <div class="bg-gray-800 p-4 rounded-xl border-l-4 border-blue-500 space-y-4">
                            <div class="flex items-start justify-between gap-3">
                                <div class="min-w-0">
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <h4 class="font-bold text-slate-100">${escapeHtml(n.title || 'Notification')}</h4>
                                        <span class="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">${escapeHtml(n.authorName || 'Admin')}</span>
                                    </div>
                                    <p class="text-slate-300 mt-2 text-sm leading-relaxed">${escapeHtml(n.message || '')}</p>
                                </div>
                                <div class="flex items-center gap-3 flex-shrink-0">
                                    <span class="text-xs text-slate-400">${timeSince(n.timestamp)}</span>
                                    ${canDeleteNotification ? `<button onclick="removeNotificationPost('${n.id}')" class="text-slate-400 hover:text-red-400 transition-colors"><i class="fas fa-trash"></i></button>` : ''}
                                </div>
                            </div>

                            <div class="flex flex-wrap items-center gap-2">
                                ${NOTIFICATION_REACTIONS.map(emoji => `
                                    <button onclick="toggleNotificationReaction('${n.id}', '${emoji}')" class="px-2.5 py-1 rounded-full border text-sm transition-colors ${currentReaction === emoji ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-900 border-gray-700 text-slate-300 hover:border-blue-500'}">
                                        <span>${emoji}</span>${reactionCounts[emoji] ? `<span class="ml-1">${reactionCounts[emoji]}</span>` : ''}
                                    </button>
                                `).join('')}
                                <button onclick="setNotificationReplyTarget('${n.id}')" class="px-3 py-1 rounded-full bg-gray-900 border border-gray-700 text-sm text-slate-300 hover:border-blue-500 transition-colors">
                                    Reply
                                </button>
                            </div>

                            <div id="notification-reply-target-${n.id}" class="hidden bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2">
                                <div class="flex items-center justify-between gap-3">
                                    <p id="notification-reply-target-text-${n.id}" class="text-xs text-blue-200"></p>
                                    <button onclick="clearNotificationReplyTarget('${n.id}')" class="text-xs text-blue-300 hover:text-white transition-colors">Cancel</button>
                                </div>
                            </div>

                            <div class="space-y-2">
                                <textarea id="${getNotificationReplyTextareaId(n.id)}" rows="2" placeholder="Write a reply..." class="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"></textarea>
                                <button onclick="saveNotificationReply('${n.id}')" class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors">
                                    Post Reply
                                </button>
                            </div>

                            <div class="space-y-2">
                                <h5 class="text-sm font-semibold text-slate-200">Replies</h5>
                                ${repliesHtml}
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                contentHtml += `<p class="text-center text-slate-400 py-8">No new notifications.</p>`;
            }
            
            contentHtml += `</div>`;
            modalContent.innerHTML = contentHtml;

            modal.classList.remove('hidden');
            modal.classList.add('flex');

            Object.keys(notificationReplyTargets).forEach(renderNotificationReplyTarget);

            modal.querySelector('#close-notification-modal-btn').addEventListener('click', () => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            });

            const notificationDot = document.getElementById('notification-dot');
            if (notificationDot) notificationDot.classList.add('hidden');
            if (notificationsCache.length > 0) {
                localStorage.setItem(NOTIFICATIONS_LAST_READ_KEY, getLatestNotificationActivityTimestamp(notificationsCache[0]));
            }
        };

        const openNotificationsPanel = async () => {
            try {
                await fetchAndCheckNotifications();
            } catch (error) {
                console.error('Could not refresh notifications before opening modal:', error);
            }
            showNotificationModal();
        };

        const showAdPopup = () => {
            const adPopup = document.getElementById('ad-popup');
            if (!adSettings || !adPopup) return;

            let adContent = '';
            if (adSettings.type === 'image' && adSettings.imageUrl) {
                adContent = `<img src="${adSettings.imageUrl}" class="w-full h-auto rounded-md object-contain max-h-48">`;
            } else if (adSettings.type === 'text' && adSettings.title) {
                adContent = `
                    <h4 class="font-bold text-red-400">${adSettings.title}</h4>
                    <p class="text-sm text-slate-300 mt-1">${adSettings.message}</p>
                `;
            } else {
                return;
            }

            adPopup.innerHTML = `
                <button id="close-ad-btn" class="absolute -top-2 -right-2 w-6 h-6 bg-gray-900 hover:bg-red-600 border-2 border-blue-500 transition-colors rounded-full text-slate-200 text-xs">&times;</button>
                <div id="ad-content-wrapper" class="cursor-pointer">
                    ${adContent}
                </div>
            `;
            adPopup.classList.remove('hidden');

            adPopup.querySelector('#close-ad-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                hideAdPopup();
            });
            adPopup.querySelector('#ad-content-wrapper').addEventListener('click', showBandoModal);

            setTimeout(hideAdPopup, 7000);
        };

        const hideAdPopup = () => {
            const adPopup = document.getElementById('ad-popup');
            if (adPopup) adPopup.classList.add('hidden');
        };

        const startAdInterval = () => {
            if (adInterval) clearInterval(adInterval); 
            setTimeout(showAdPopup, 3000);
            adInterval = setInterval(showAdPopup, 60000);
        };

        const getMyListSection = () => {
            const watchlist = JSON.parse(localStorage.getItem('watchlist') || '[]');
            
            if (watchlist.length === 0) {
                return `
                    <div class="mb-6">
                        <h2 class="text-xl font-bold mb-3">My List</h2>
                        <div class="bg-gray-900 rounded-lg p-6 text-center">
                            <i class="fas fa-list text-4xl text-slate-600 mb-3"></i>
                            <p class="text-slate-400">Hakuna movies kwenye list yako</p>
                            <p class="text-slate-500 text-sm mt-2">Click "Add to List" kwenye movie ili kuongeza</p>
                        </div>
                    </div>`;
            }

            const allContent = allContentCache || [];
            const myMovies = watchlist.map(id => allContent.find(item => item.id === id)).filter(Boolean);

            if (myMovies.length === 0) {
                return `
                    <div class="mb-6">
                        <h2 class="text-xl font-bold mb-3">My List</h2>
                        <div class="bg-gray-900 rounded-lg p-6 text-center">
                            <i class="fas fa-list text-4xl text-slate-600 mb-3"></i>
                            <p class="text-slate-400">Hakuna movies kwenye list yako</p>
                        </div>
                    </div>`;
            }

            const itemsJsonString = JSON.stringify(myMovies.map(m => ({...m, type: m.type || 'movie'}))).replace(/'/g, '&apos;');
            
            return `
                <div class="mb-6">
                    <div class="flex justify-between items-center mb-3">
                        <h2 class="text-xl font-bold">My List</h2>
                        <button class="see-all-btn text-sm text-red-400 hover:text-red-300 transition-colors" data-see-all-title="My List" data-see-all-items='${itemsJsonString}'>
                            See All <i class="fas fa-chevron-right text-xs"></i>
                        </button>
                    </div>
                    <div class="flex overflow-x-auto space-x-4 pb-4 horizontal-scroll -mx-4 px-4">
                        ${myMovies.map(item => `
                            <div class="flex-shrink-0 w-32 md:w-40 relative group">
                                <div class="cursor-pointer" onclick="window.location.href='?id=${item.id}&type=${item.type || 'movie'}'">
                                    ${item.posterUrl ? `<img src="${item.posterUrl}" alt="${item.title}" class="w-full h-48 md:h-60 object-cover rounded-lg shadow-lg" loading="lazy">` : `<div class="w-full h-48 md:h-60 bg-gray-800 rounded-lg flex items-center justify-center"><i class="fas fa-film text-gray-600 text-3xl"></i></div>`}
                                </div>
                                <button onclick="removeFromList('${item.id}')" class="absolute top-1 right-1 bg-red-600 hover:bg-red-700 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity" title="Remove from list">
                                    <i class="fas fa-times"></i>
                                </button>
                                <h3 class="text-sm font-semibold mt-2 truncate">${item.title}</h3>
                            </div>
                        `).join('')}
                        <div class="flex-shrink-0 w-1"></div>
                    </div>
                </div>`;
        };

        const getPremiumPlansHtml = (title = 'Upgrade to Premium') => {
            if (!premiumSettings.isActive) return '';
            
            const premiumPlans = [
                { price: '2000', duration: '1 DAY', subtitle: 'Starter access', benefits: ['No ads', 'Series access', 'Movie access'] },
                { price: '3000', duration: '1 WEEK', subtitle: 'Popular plan', benefits: ['No ads', 'Series access', 'Movie access'] },
                { price: '5000', duration: '2 WEEKS', subtitle: 'Better value', benefits: ['No ads', 'Series access', 'Movie access'] },
                { price: '9000', duration: '1 MONTH', subtitle: 'Full premium', benefits: ['No ads', 'Series access', 'Movie access'] }
            ];
            const titleHtml = title ? `
                <div class="text-center max-w-2xl mx-auto mb-6">
                    <p class="text-[11px] uppercase tracking-[0.35em] text-red-300/80 mb-2">Get Premium</p>
                    <h2 class="text-2xl md:text-3xl font-bold text-white">${title}</h2>
                    <p class="text-sm text-slate-400 mt-2">Chagua plan inayokufaa na upate access ya movies na series bila matangazo.</p>
                </div>
            ` : '';

            return `
                <div id="premium-section" class="mb-4 mt-6">
                    ${titleHtml}
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        ${premiumPlans.map(plan => `
                            <div class="group rounded-[1.2rem] border border-white/10 bg-gradient-to-b from-[#1c1f26] via-[#111318] to-black p-4 shadow-[0_14px_30px_rgba(0,0,0,0.28)] flex flex-col justify-between min-h-[290px]">
                                <div>
                                    <div class="flex items-start justify-between gap-3 mb-4">
                                        <div>
                                            <p class="text-[11px] uppercase tracking-[0.28em] text-red-300/80">${plan.subtitle}</p>
                                            <h3 class="text-lg font-bold text-white mt-2">${plan.duration}</h3>
                                        </div>
                                        <span class="inline-flex items-center rounded-full bg-red-500/12 border border-red-500/25 px-3 py-1 text-xs font-semibold text-red-300">Premium</span>
                                    </div>
                                    <div class="mb-4">
                                        <div class="text-xs text-slate-400">TZS</div>
                                        <div class="text-3xl font-black text-white tracking-tight">${plan.price}</div>
                                    </div>
                                    <div class="space-y-2.5">
                                        ${plan.benefits.map(benefit => `
                                            <div class="flex items-center gap-3 text-sm text-slate-200">
                                                <span class="w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center justify-center flex-shrink-0">
                                                    <i class="fas fa-check text-[10px]"></i>
                                                </span>
                                                <span>${benefit}</span>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                                <div class="pt-4 mt-4 border-t border-white/10">
                                    <button class="pay-btn w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 px-4 rounded-xl transition-colors" data-price="Tsh ${plan.price} - ${plan.duration}">PAY</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="mt-5 rounded-[1.4rem] border border-green-500/20 bg-green-500/8 px-4 py-4 text-center">
                        <a href="https://wa.me/255748472076" target="_blank" class="inline-flex items-center gap-3 text-green-300 hover:text-green-200 transition-colors">
                            <i class="fab fa-whatsapp text-2xl"></i>
                            <span class="text-sm md:text-base font-medium">Contact us for help: 0748472076</span>
                        </a>
                    </div>
                </div>
            `;
        };

        const renderProfilePage = () => {
            let userSectionHtml = '';
            if (currentUser) {
                let statusHtml = '';
                let remainderHtml = '';
                const now = Date.now();
                
                if (!premiumSettings.isActive) {
                    statusHtml = `<span class="px-2 py-1 text-xs font-semibold text-blue-100 bg-blue-600 rounded-full">Free Access</span>`;
                    remainderHtml = 'Unlimited';
                } else {
                    if (hasPremiumAccess(currentUser)) {
                        const activeExpiry = Math.max(Number(currentUser.premiumExpiry || 0), Number(currentUser.rewardAccessExpiry || 0));
                        const remainingDays = Math.max(1, Math.ceil((activeExpiry - now) / (1000 * 60 * 60 * 24)));
                        const accessLabel = currentUser.premiumExpiry && Number(currentUser.premiumExpiry) > now ? 'Paid' : 'Reward Active';
                        statusHtml = `<span class="px-2 py-1 text-xs font-semibold text-green-100 bg-green-600 rounded-full">${accessLabel}</span>`;
                        remainderHtml = `${remainingDays} days`;
                    } else {
                        statusHtml = `<span class="px-2 py-1 text-xs font-semibold text-yellow-100 bg-yellow-600 rounded-full">Unpaid</span>`;
                        remainderHtml = '0 days';
                    }
                }

                userSectionHtml = `
                    <div class="bg-gray-900 rounded-lg p-4 mb-6 text-center relative">
                        <i class="fas fa-user-circle text-6xl text-slate-500 mx-auto -mt-10 bg-gray-900 p-2 rounded-full border-4 border-black"></i>
                        <p class="font-semibold text-lg mt-2">${currentUser.phone || currentUser.email}</p>
                        <p class="text-xs text-slate-400 font-mono">ID: ${currentUser.uid}</p>
                        <div class="flex items-center justify-center space-x-6 mt-4 pt-4 border-t border-gray-700">
                            <div class="text-sm"><span class="text-slate-400 block">Status</span> ${statusHtml}</div>
                            <div class="text-sm"><span class="text-slate-400 block">Remainder</span> <span class="font-semibold">${remainderHtml}</span></div>
                        </div>
                        <button id="logout-btn" class="absolute top-2 right-2 bg-red-800/50 hover:bg-red-700 text-white text-xs font-bold py-1 px-3 rounded-lg transition-colors">Logout</button>
                    </div>`;
            } else {
                userSectionHtml = `
                    <div class="bg-gray-900 rounded-lg p-6 text-center mb-6">
                        <i class="fas fa-user-circle text-6xl text-slate-500 mb-4"></i>
                        <h3 class="font-bold text-xl mb-4">Ingia au Jisajili</h3>
                        <form id="auth-form" class="space-y-4">
                            <div>
                                <input id="auth-email" type="text" placeholder="Andika email au namba ya simu" required class="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-red-500">
                                <p class="text-xs text-slate-500 mt-1">Tumia email au namba ya simu (mf. 0712345678)</p>
                            </div>
                            <div>
                                <input id="auth-password" type="password" placeholder="Password" required class="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-red-500" minlength="6">
                            </div>
                            <div id="auth-feedback" class="text-sm h-5 mb-2 min-h-[20px]"></div>
                            <div class="flex space-x-2">
                                <button type="submit" id="login-btn" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                                    <span class="btn-text">Ingia</span>
                                    <i class="fas fa-spinner fa-spin btn-loader hidden"></i>
                                </button>
                                <button type="button" id="signup-btn" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                                    <span class="btn-text">Jisajili</span>
                                    <i class="fas fa-spinner fa-spin btn-loader hidden"></i>
                                </button>
                            </div>
                            <button type="button" id="forgot-password-btn" class="text-sm text-slate-400 hover:text-red-400 mt-2">Umesahau password?</button>
                        </form>
                    </div>
                `;
            }
            
            let socialLinksHtml = '';
            if (socialLinksCache) {
                 const icons = [
                    { key: 'whatsapp', url: socialLinksCache.whatsapp, icon: 'fab fa-whatsapp', color: 'hover:text-green-500' },
                    { key: 'facebook', url: socialLinksCache.facebook, icon: 'fab fa-facebook', color: 'hover:text-blue-500' },
                    { key: 'instagram', url: socialLinksCache.instagram, icon: 'fab fa-instagram', color: 'hover:text-pink-500' },
                    { key: 'tiktok', url: socialLinksCache.tiktok, icon: 'fab fa-tiktok', color: 'hover:text-white' },
                 ];
                 const visibleIcons = icons.filter(i => i.url && i.url.trim() !== '');

                 if (visibleIcons.length > 0) {
                     socialLinksHtml = `
                        <div class="mb-6">
                             <h2 class="text-xl font-bold mb-3">Follow Us</h2>
                             <div class="bg-gray-900 rounded-lg p-4 text-center">
                                 <div class="flex justify-center space-x-6">
                                    ${visibleIcons.map(icon => `
                                        <a href="${icon.url}" target="_blank" class="text-slate-400 ${icon.color} transition-colors text-3xl">
                                            <i class="${icon.icon}"></i>
                                        </a>
                                    `).join('')}
                                 </div>
                             </div>
                        </div>
                     `;
                 }
            }
             
             const myListHtml = getMyListSection();
              
              appContainer.innerHTML = `
                <div class="page p-4">
                    <div class="pt-4 mb-12">${SwaMediaHeader}</div>
                    ${userSectionHtml}
                    ${myListHtml}
                    ${socialLinksHtml}
                    <div id="profile-navigation" class="mt-8">
                        <h2 class="text-xl font-bold mb-3">Profile Navigation</h2>
                        <div class="space-y-2 bg-gray-900 rounded-lg p-2">
                             <a href="#" data-page="premiumPlans" class="profile-link flex items-center p-3 hover:bg-gray-800 rounded-lg"><i class="fas fa-gem w-6 mr-4 text-center text-yellow-400"></i><span>Get Premium</span><i class="fas fa-chevron-right ml-auto text-slate-500"></i></a>
                             <a href="#" id="invite-rewards-link" data-page="inviteRewards" class="profile-link flex items-center p-3 hover:bg-gray-800 rounded-lg"><i class="fas fa-gift w-6 mr-4 text-center text-pink-400"></i><span>Reward by Invite Friend</span><i class="fas fa-chevron-right ml-auto text-slate-500"></i></a>
                             <a href="#" data-page="likedMovies" class="profile-link flex items-center p-3 hover:bg-gray-800 rounded-lg"><i class="fas fa-heart w-6 mr-4 text-center text-red-400"></i><span>My List Like</span><i class="fas fa-chevron-right ml-auto text-slate-500"></i></a>
                             <a href="#" data-page="watchHistory" class="profile-link flex items-center p-3 hover:bg-gray-800 rounded-lg"><i class="fas fa-history w-6 mr-4 text-center text-cyan-400"></i><span>Watch History</span><i class="fas fa-chevron-right ml-auto text-slate-500"></i></a>
                             <a href="#" data-page="newPosts" class="profile-link flex items-center p-3 hover:bg-gray-800 rounded-lg"><i class="fas fa-bolt w-6 mr-4 text-center text-orange-400"></i><span>New Post</span><i class="fas fa-chevron-right ml-auto text-slate-500"></i></a>
                             <a href="#" class="profile-link flex items-center p-3 hover:bg-gray-800 rounded-lg"><i class="fas fa-cog w-6 mr-4 text-center text-slate-300"></i><span>Settings</span><i class="fas fa-chevron-right ml-auto text-slate-500"></i></a>
                             <a href="#" class="profile-link flex items-center p-3 hover:bg-gray-800 rounded-lg"><i class="fas fa-comment-dots w-6 mr-4 text-center text-green-400"></i><span>Feedback</span><i class="fas fa-chevron-right ml-auto text-slate-500"></i></a>
                        </div>
                    </div>
                    <div id="more-info-links" class="mt-8">
                        <h2 class="text-xl font-bold mb-3">More Information</h2>
                        <div class="space-y-2 bg-gray-900 rounded-lg p-2">
                             <a href="#" data-page="Review" class="profile-link flex items-center p-3 hover:bg-gray-800 rounded-lg"><i class="fas fa-user-secret w-6 mr-4 text-center text-red-500"></i><span>Treanding </span><i class="fas fa-chevron-right ml-auto text-slate-500"></i></a>
                             <a href="#" data-page="connection" class="profile-link flex items-center p-3 hover:bg-gray-800 rounded-lg"><i class="fas fa-link w-6 mr-4 text-center text-cyan-500"></i><span>Conntion</span><i class="fas fa-chevron-right ml-auto text-slate-500"></i></a>
                             <a href="#" data-page="Education" class="profile-link flex items-center p-3 hover:bg-gray-800 rounded-lg"><i class="fas fa-fire w-6 mr-4 text-center text-orange-500"></i><span>Viral</span><i class="fas fa-chevron-right ml-auto text-slate-500"></i></a>
                             <div class="border-t border-gray-700/50 mx-3 my-1"></div>
                             <a href="#" id="enable-notifications-link" class="profile-link flex items-center p-3 hover:bg-gray-800 rounded-lg"><i class="fas fa-bell w-6 mr-4 text-center text-orange-400"></i><span>Enable Notifications</span><i class="fas fa-chevron-right ml-auto text-slate-500"></i></a>
                             <a href="#" data-page="storyZone" class="profile-link flex items-center p-3 hover:bg-gray-800 rounded-lg"><i class="fas fa-book-open w-6 mr-4 text-center text-purple-500"></i><span>StoryZone</span><i class="fas fa-chevron-right ml-auto text-slate-500"></i></a>
                             <a href="#" data-page="static:disclaimer" class="profile-link flex items-center p-3 hover:bg-gray-800 rounded-lg"><i class="fas fa-shield-alt w-6 mr-4 text-center text-red-500"></i><span>Disclaimer</span><i class="fas fa-chevron-right ml-auto text-slate-500"></i></a>
                             <a href="#" data-page="static:help" class="profile-link flex items-center p-3 hover:bg-gray-800 rounded-lg"><i class="fas fa-question-circle w-6 mr-4 text-center text-yellow-500"></i><span>Help</span><i class="fas fa-chevron-right ml-auto text-slate-500"></i></a>
                             <a href="#" id="contact-us-link" class="profile-link flex items-center p-3 hover:bg-gray-800 rounded-lg"><i class="fas fa-envelope w-6 mr-4 text-center text-green-500"></i><span>Contact Us</span><i class="fas fa-chevron-right ml-auto text-slate-500"></i></a>
                             <a href="#" data-page="static:privacyPolicy" class="profile-link flex items-center p-3 hover:bg-gray-800 rounded-lg"><i class="fas fa-user-secret w-6 mr-4 text-center text-indigo-500"></i><span>Privacy Policy</span><i class="fas fa-chevron-right ml-auto text-slate-500"></i></a>
                             <a href="#" data-page="static:aboutUs" class="profile-link flex items-center p-3 hover:bg-gray-800 rounded-lg"><i class="fas fa-info-circle w-6 mr-4 text-center text-teal-500"></i><span>About Us</span><i class="fas fa-chevron-right ml-auto text-slate-500"></i></a>
                        </div>
      <div class="mt-8">
    <h2 class="text-xl font-bold mb-3">App</h2>
    <div class="space-y-3 bg-gray-900 rounded-lg p-4">

        <a href="${APP_DOWNLOAD_URL}" target="_blank" 
           class="w-full flex items-center justify-center p-3 bg-green-600 hover:bg-green-700 rounded-lg font-semibold transition-colors inline-flex">
            <i class="fab fa-android mr-3 text-xl"></i> Download Andro App
        </a>

        <button id="install-ios-btn" class="w-full flex items-center justify-center p-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors">
            <i class="fab fa-apple mr-3 text-xl"></i> Download iOS App
        </button>

    </div>
</div>
                    </div>
                     <div class="mt-8">
                        <h2 class="text-xl font-bold mb-3">Agiza Movie / Toa Maoni</h2>
                        <div class="bg-gray-900 rounded-lg p-4">
                            <form id="feedback-form">
                                <textarea id="feedback-textarea" class="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-red-500" rows="4" placeholder="Andika ushauri wako, maoni, au ombi la movie hapa..."></textarea>
                                <div id="feedback-message" class="text-sm text-green-400 h-5 mt-2"></div>
                                <button type="submit" class="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                                    <span class="btn-text">Tuma Maoni</span>
                                    <i class="fas fa-spinner fa-spin btn-loader hidden"></i>
                                </button>
                            </form>
                        </div>
                    </div>
                </div>`;
            
            const authForm = document.getElementById('auth-form');
            if (authForm) {
                document.getElementById('login-btn').addEventListener('click', handleLogin);
                document.getElementById('signup-btn').addEventListener('click', handleSignup);
                document.getElementById('forgot-password-btn').addEventListener('click', handleForgotPassword);
                authForm.addEventListener('submit', e => e.preventDefault());
            } else {
                const logoutBtn = document.getElementById('logout-btn');
                if (logoutBtn) logoutBtn.addEventListener('click', () => {
                    signOut(auth).then(() => {
                        showNotification('Umefanikiwa kutoka.再见!', 'success');
                    });
                });
            }
            
            const feedbackForm = document.getElementById('feedback-form');
            if (feedbackForm) feedbackForm.addEventListener('submit', handleFeedbackSubmit);

            const inviteRewardsLink = document.getElementById('invite-rewards-link');
            if (inviteRewardsLink) {
                inviteRewardsLink.addEventListener('click', async (e) => {
                    e.preventDefault();
                    await navigateTo('inviteRewards');
                });
            }
        };

        const renderInviteRewardsPage = async () => {
            if (!currentUser) {
                appContainer.innerHTML = `
                    <div class="page p-4">
                        <header class="flex items-center space-x-4 pt-4 mb-5">
                            <button id="back-btn" class="bg-gray-800 hover:bg-gray-700 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors flex-shrink-0"><i class="fas fa-arrow-left"></i></button>
                            <div>
                                <h1 class="text-2xl font-bold text-white">Invite Friend</h1>
                                <p class="text-sm text-slate-400">Ingia kwanza ili upate link yako ya kipekee.</p>
                            </div>
                        </header>
                        <div class="bg-gray-900 rounded-2xl p-6 text-center border border-blue-500/20">
                            <i class="fas fa-user-lock text-4xl text-blue-400 mb-4"></i>
                            <p class="text-slate-300 mb-4">Ukishajisajili utaweza kuinvite marafiki na kupata point 2 kwa kila rafiki anayenunua package yoyote.</p>
                            <button data-page="profile" class="profile-link w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-colors">Ingia / Jisajili</button>
                        </div>
                    </div>
                `;
                document.getElementById('back-btn')?.addEventListener('click', handleBack);
                return;
            }

            await ensureCurrentUserReferralProfile();
            const referralSnap = await get(ref(database, `referrals/${currentUser.uid}`));
            const referrals = referralSnap.exists()
                ? Object.entries(referralSnap.val()).map(([id, value]) => ({ id, ...value }))
                : [];
            const joinedReferrals = referrals.filter(item => item.status === 'joined' || item.status === 'qualified').length;
            const qualifiedReferrals = referrals.filter(item => item.status === 'qualified').length;
            const rewardPoints = Number(currentUser.rewardPoints || 0);
            const pointsRemaining = Math.max(0, REWARD_POINT_THRESHOLD - (rewardPoints % REWARD_POINT_THRESHOLD || 0));
            const rewardLink = currentUser.referralLink || buildReferralLink(currentUser.referralCode || '');
            const rewardAccessActive = currentUser.rewardAccessExpiry && Number(currentUser.rewardAccessExpiry) > Date.now();
            const rewardAccessText = rewardAccessActive
                ? `Inaisha ${new Date(Number(currentUser.rewardAccessExpiry)).toLocaleString()}`
                : 'Bado haijaanza';

            appContainer.innerHTML = `
                <div class="page p-4">
                    <header class="flex items-center space-x-4 pt-4 mb-5">
                        <button id="back-btn" class="bg-gray-800 hover:bg-gray-700 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors flex-shrink-0"><i class="fas fa-arrow-left"></i></button>
                        <div>
                            <h1 class="text-2xl font-bold text-white">Invite Friend Rewards</h1>
                            <p class="text-sm text-slate-400">Pata point 2 kila rafiki aki-submit package.</p>
                        </div>
                    </header>

                    <div class="space-y-4">
                        <div class="bg-gradient-to-br from-pink-600/20 via-gray-900 to-blue-600/20 rounded-3xl p-5 border border-pink-500/20">
                            <p class="text-xs uppercase tracking-[0.35em] text-pink-300 mb-3">Referral Link</p>
                            <div class="bg-black/40 border border-white/10 rounded-2xl p-3 text-sm break-all text-slate-200">${escapeHtml(rewardLink)}</div>
                            <div class="grid grid-cols-2 gap-3 mt-4">
                                <button id="copy-referral-link-btn" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-2xl transition-colors">Copy Link</button>
                                <button id="share-referral-link-btn" class="bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded-2xl transition-colors">Share Link</button>
                            </div>
                            <p class="text-xs text-slate-400 mt-3">Link hii ni unique. Rafiki akiifungua atawekwa referral yako na download itaanza moja kwa moja.</p>
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <div class="bg-gray-900 rounded-2xl p-4 border border-white/5">
                                <p class="text-slate-400 text-sm">Reward Points</p>
                                <p class="text-3xl font-bold text-white mt-2">${rewardPoints}</p>
                                <p class="text-xs text-slate-500 mt-2">Target: ${REWARD_POINT_THRESHOLD} points</p>
                            </div>
                            <div class="bg-gray-900 rounded-2xl p-4 border border-white/5">
                                <p class="text-slate-400 text-sm">Qualified Invites</p>
                                <p class="text-3xl font-bold text-white mt-2">${qualifiedReferrals}</p>
                                <p class="text-xs text-slate-500 mt-2">Joined: ${joinedReferrals}</p>
                            </div>
                        </div>

                        <div class="bg-gray-900 rounded-2xl p-5 border border-green-500/20">
                            <div class="flex items-center justify-between gap-3">
                                <div>
                                    <p class="text-lg font-semibold text-white">Free Movie Reward</p>
                                    <p class="text-sm text-slate-400">Ukifikisha point 60 unafunguliwa siku 1 ya kutazama movie bure.</p>
                                </div>
                                <span class="px-3 py-1 rounded-full text-xs font-semibold ${rewardAccessActive ? 'bg-green-600 text-white' : 'bg-gray-700 text-slate-300'}">${rewardAccessActive ? 'Active' : 'Locked'}</span>
                            </div>
                            <div class="mt-4 h-3 bg-black/40 rounded-full overflow-hidden">
                                <div class="h-full bg-gradient-to-r from-pink-500 to-blue-500" style="width: ${Math.min(100, (rewardPoints % REWARD_POINT_THRESHOLD || (rewardPoints >= REWARD_POINT_THRESHOLD ? REWARD_POINT_THRESHOLD : rewardPoints)) / REWARD_POINT_THRESHOLD * 100)}%"></div>
                            </div>
                            <p class="text-xs text-slate-400 mt-3">${rewardPoints >= REWARD_POINT_THRESHOLD ? 'Ukifikisha kila 60 points unaongezewa siku 1 nyingine.' : `Bado points ${pointsRemaining} kufika reward inayofuata.`}</p>
                            <p class="text-xs text-slate-500 mt-1">Reward access: ${rewardAccessText}</p>
                        </div>

                        <div class="bg-gray-900 rounded-2xl p-5">
                            <h2 class="text-lg font-semibold text-white mb-3">Jinsi Inavyofanya Kazi</h2>
                            <div class="space-y-3 text-sm text-slate-300">
                                <p>1. Tuma link yako ya unique kwa rafiki.</p>
                                <p>2. Rafiki akibonyeza link, app download inaanza na referral yako inahifadhiwa.</p>
                                <p>3. Rafiki huyo akichagua package yoyote, unapata point ${REFERRAL_REWARD_POINTS}.</p>
                                <p>4. Ukifikisha point ${REWARD_POINT_THRESHOLD}, unafunguliwa kuangalia movie bure kwa masaa 24.</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            document.getElementById('back-btn')?.addEventListener('click', handleBack);
            document.getElementById('copy-referral-link-btn')?.addEventListener('click', async () => {
                await navigator.clipboard.writeText(rewardLink);
                showNotification('Referral link ime-copy.', 'success');
            });
            document.getElementById('share-referral-link-btn')?.addEventListener('click', async () => {
                const shareData = {
                    title: 'Join SwaMedia',
                    text: 'Pakua app kwa link yangu na ukinunua package yoyote nitapata reward points.',
                    url: rewardLink
                };
                if (navigator.share) {
                    await navigator.share(shareData);
                } else {
                    await navigator.clipboard.writeText(rewardLink);
                    showNotification('Sharing haipo hapa, link ime-copy.', 'success');
                }
            });
        };

        const renderLikedMoviesPage = async () => {
            const likedIds = getLikedMovieIds();
            const likedItems = await resolveStoredItemsByIds(likedIds);

            appContainer.innerHTML = `
                <div class="page p-4">
                    <header class="flex items-center space-x-4 pt-4 mb-5">
                        <button id="back-btn" class="bg-gray-800 hover:bg-gray-700 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors flex-shrink-0"><i class="fas fa-arrow-left"></i></button>
                        <div>
                            <h1 class="text-2xl font-bold text-white">My Liked Movies</h1>
                            <p class="text-sm text-slate-400">Hapa utaona movie zote ulizo-like.</p>
                        </div>
                    </header>
                    ${renderVerticalContentGrid(likedItems, 'Bado huja-like movie yoyote.')}
                </div>
            `;

            document.getElementById('back-btn')?.addEventListener('click', handleBack);
        };

        const renderWatchHistoryPage = async () => {
            const historyItems = getStoredWatchHistory();
            const allContent = await fetchAllContent();
            const resolvedHistory = historyItems.map(entry => {
                const content = allContent.find(item => item.id === entry.parentId);
                return {
                    ...(content || {}),
                    id: content?.id || entry.parentId || entry.watchId,
                    type: content?.type || entry.parentType || 'movie',
                    title: content?.title || entry.title,
                    posterUrl: content?.posterUrl || entry.posterUrl,
                    year: content?.year || entry.year,
                    genre: content?.genre || entry.genre,
                    description: content?.description || `Last watched ${new Date(entry.watchedAt).toLocaleString()}`,
                    watchedAt: entry.watchedAt
                };
            }).filter(item => item.id);

            appContainer.innerHTML = `
                <div class="page p-4">
                    <header class="flex items-center space-x-4 pt-4 mb-5">
                        <button id="back-btn" class="bg-gray-800 hover:bg-gray-700 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors flex-shrink-0"><i class="fas fa-arrow-left"></i></button>
                        <div>
                            <h1 class="text-2xl font-bold text-white">Watch History</h1>
                            <p class="text-sm text-slate-400">Movies ulizowahi kutazama zinabaki hapa hata baada ya refresh.</p>
                        </div>
                    </header>
                    <div class="space-y-4">
                        ${resolvedHistory.length ? resolvedHistory.map(item => `
                            <div class="item-card bg-gray-900 rounded-2xl overflow-hidden border border-white/5 flex gap-4 p-3 cursor-pointer hover:border-cyan-500/30 transition-colors" data-id="${item.id}" data-type="${item.type || 'movie'}">
                                <div class="w-24 sm:w-28 flex-shrink-0">
                                    ${item.posterUrl ? `<img src="${item.posterUrl}" alt="${escapeHtml(item.title || '')}" class="w-full h-32 object-cover rounded-xl" loading="lazy">` : `<div class="w-full h-32 bg-gray-800 rounded-xl flex items-center justify-center"><i class="fas fa-film text-gray-600 text-3xl"></i></div>`}
                                </div>
                                <div class="min-w-0 flex-1 py-1">
                                    <div class="flex items-start justify-between gap-3">
                                        <div class="min-w-0">
                                            <h3 class="font-semibold text-white text-base truncate">${escapeHtml(item.title || '')}</h3>
                                            <p class="text-xs text-cyan-300 mt-1">Last watched: ${new Date(item.watchedAt).toLocaleString()}</p>
                                        </div>
                                        <span class="text-xs text-slate-400 whitespace-nowrap">${escapeHtml(String(item.year || ''))}</span>
                                    </div>
                                    <p class="text-sm text-slate-400 mt-2 line-clamp-2">${escapeHtml(item.description || '')}</p>
                                </div>
                            </div>
                        `).join('') : `
                            <div class="bg-gray-900 rounded-2xl p-8 text-center">
                                <i class="fas fa-history text-4xl text-slate-600 mb-3"></i>
                                <p class="text-slate-400">Bado hujatazama movie yoyote hapa.</p>
                            </div>
                        `}
                    </div>
                </div>
            `;

            document.getElementById('back-btn')?.addEventListener('click', handleBack);
        };

        const renderNewPostsPage = async () => {
            const allContent = await fetchAllContent();
            const newPosts = [...allContent]
                .filter(item => item.isPublished !== false)
                .sort((a, b) => Number(b.createdAt || b.timestamp || 0) - Number(a.createdAt || a.timestamp || 0));

            appContainer.innerHTML = `
                <div class="page p-4">
                    <header class="flex items-center space-x-4 pt-4 mb-5">
                        <button id="back-btn" class="bg-gray-800 hover:bg-gray-700 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors flex-shrink-0"><i class="fas fa-arrow-left"></i></button>
                        <div>
                            <h1 class="text-2xl font-bold text-white">New Post</h1>
                            <p class="text-sm text-slate-400">Movie zote mpya zimepangwa vertical hapa.</p>
                        </div>
                    </header>
                    ${renderVerticalContentGrid(newPosts, 'Hakuna post mpya kwa sasa.')}
                </div>
            `;

            document.getElementById('back-btn')?.addEventListener('click', handleBack);
        };

        const renderPremiumPlansPage = () => {
            appContainer.innerHTML = `
                <div class="page p-4">
                    <header class="flex items-center space-x-4 pt-4 mb-5">
                        <button id="back-btn" class="bg-gray-800 hover:bg-gray-700 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors flex-shrink-0"><i class="fas fa-arrow-left"></i></button>
                        <div>
                            <h1 class="text-2xl font-bold text-white">Get Premium</h1>
                            <p class="text-sm text-slate-400">Chagua premium plan yako hapa chini</p>
                        </div>
                    </header>
                    ${getPremiumPlansHtml('Choose Your Premium Plan')}
                </div>
            `;

            const premiumBackBtn = document.getElementById('back-btn');
            if (premiumBackBtn) premiumBackBtn.addEventListener('click', handleBack);
        };

        const handleFeedbackSubmit = async (e) => {
            e.preventDefault();
            if (!currentUser) {
                showLoginRequiredModal();
                return;
            }

            const form = e.target;
            const textarea = form.querySelector('#feedback-textarea');
            const messageEl = form.querySelector('#feedback-message');
            const button = form.querySelector('button[type="submit"]');
            const comment = textarea.value.trim();

            if (!comment) {
                messageEl.textContent = 'Tafadhali andika maoni yako.';
                messageEl.classList.remove('text-green-400');
                messageEl.classList.add('text-red-400');
                return;
            }

            button.disabled = true;
            button.querySelector('.btn-text').classList.add('hidden');
            button.querySelector('.btn-loader').classList.add('active');
            messageEl.textContent = '';

            try {
                await push(ref(database, 'feedback'), {
                    userId: currentUser.uid,
                    user: currentUser.phone || currentUser.email,
                    comment: comment,
                    timestamp: Date.now()
                });
                textarea.value = '';
                messageEl.textContent = 'Asante! Maoni yako yamepokelewa.';
                messageEl.classList.add('text-green-400');
                messageEl.classList.remove('text-red-400');
            } catch (error) {
                console.error("Error submitting feedback:", error);
                messageEl.textContent = 'Imeshindwa kutuma. Tafadhali jaribu tena.';
                messageEl.classList.remove('text-green-400');
                messageEl.classList.add('text-red-400');
            } finally {
                button.disabled = false;
                button.querySelector('.btn-text').classList.remove('hidden');
                button.querySelector('.btn-loader').classList.remove('active');
                setTimeout(() => { messageEl.textContent = '' }, 4000);
            }
        };

        const handleForgotPassword = async () => {
            const identifier = document.getElementById('auth-email').value;
            const feedbackEl = document.getElementById('auth-feedback');
            
            if (!identifier) {
                feedbackEl.textContent = 'Andika email yako ili uweze kubadili password.';
                feedbackEl.className = 'text-sm text-red-400 h-5 mb-2';
                return;
            }
             if (isPhoneNumber(identifier)) {
                feedbackEl.textContent = 'Kubadili password hakupo kwa simu. Wasiliana na support.';
                feedbackEl.className = 'text-sm text-red-400 h-5 mb-2';
                return;
            }

            try {
                await sendPasswordResetEmail(auth, identifier);
                feedbackEl.textContent = 'Email ya kubadili password imetumwa. Angalia inbox yako (na spam pia).';
                feedbackEl.className = 'text-sm text-green-400 h-5 mb-2';
            } catch (error) {
                console.error(error);
                // alert removed - using custom message
                let errorMessage = 'Imeshindwa kutuma email. Hakikisha email ni sahihi.';
                if (error.code === 'auth/user-not-found') {
                    errorMessage = 'Hii email haijajisajili.';
                } else if (error.code === 'auth/invalid-email') {
                    errorMessage = 'Email si sahihi.';
                } else if (error.code === 'auth/missing-android-pkg-name') {
                    errorMessage = 'Tatizo la app. Jaribu tena.';
                }
                feedbackEl.textContent = errorMessage;
                feedbackEl.className = 'text-sm text-red-400 h-5 mb-2';
            }
        };

        const handleAuthAction = async (action, email, password, feedbackEl, btn, originalIdentifier) => {
            feedbackEl.textContent = '';
            feedbackEl.className = 'text-sm h-5 mb-2';
            btn.querySelector('.btn-text').classList.add('hidden');
            btn.querySelector('.btn-loader').classList.add('active');
            btn.disabled = true;

            try {
                if (action === 'signup') {
                    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                    const referralCode = await generateUniqueReferralCode(userCredential.user.uid);
                    const dbData = {
                        email: userCredential.user.email,
                        uid: userCredential.user.uid,
                        premiumExpiry: 0,
                        rewardPoints: 0,
                        rewardAccessExpiry: 0,
                        referralRewardsClaimed: 0,
                        successfulReferralPurchases: 0,
                        referralPurchaseQualified: false,
                        referralCode,
                        referralLink: buildReferralLink(referralCode),
                        createdAt: Date.now()
                    };
                    if (isPhoneNumber(originalIdentifier)) {
                        dbData.phone = originalIdentifier;
                    }
                    await set(ref(database, 'users/' + userCredential.user.uid), dbData);
                    await set(ref(database, `referralCodes/${referralCode}`), {
                        uid: userCredential.user.uid,
                        createdAt: dbData.createdAt
                    });
                    showNotification('Usajili umefanikiwa! Karibu SwaMedia.', 'success');
                    feedbackEl.textContent = 'Usajili umefanikiwa!';
                    feedbackEl.classList.add('text-green-400');
                } else {
                    await signInWithEmailAndPassword(auth, email, password);
                    showNotification('Umefanikiwa kuingia!', 'success');
                }
            } catch (error) {
                console.error(error);
                let errorMessage = 'Hitilafu imetokea. Jaribu tena.';
                const errorCode = error.code;

                if (errorCode === 'auth/invalid-credential' || errorCode === 'auth/wrong-password' || errorCode === 'auth/invalid-email') {
                    errorMessage = 'Email au password si sahihi. Jaribu tena.';
                } else if (errorCode === 'auth/email-not-found' || errorCode === 'auth/user-not-found') {
                    errorMessage = 'Hii email haijajisajili. Jisajili ili uingie.';
                } else if (errorCode === 'auth/email-already-in-use') {
                    errorMessage = 'Email hii tayari ina account. Ingia au tumia email nyingine.';
                } else if (errorCode === 'auth/invalid-email') {
                    errorMessage = 'Email si sahihi.';
                } else if (errorCode === 'auth/weak-password') {
                    errorMessage = 'Password ni dhaifu. Tumia angalau herufi 6.';
                } else if (errorCode === 'auth/missing-password') {
                    errorMessage = 'Andika password.';
                } else if (errorCode === 'auth/too-many-requests') {
                    errorMessage = 'Majaribio mengi sana. Subiri kidogo.';
                } else if (errorCode === 'auth/unauthorized-continue-uri') {
                    errorMessage = 'Tatizo la server. Wasiliana na support.';
                } else {
                    // Show raw error for debugging
                    errorMessage = 'Error: ' + errorCode;
                }

                feedbackEl.textContent = errorMessage;
                feedbackEl.classList.add('text-red-400');
            } finally {
                btn.querySelector('.btn-text').classList.remove('hidden');
                btn.querySelector('.btn-loader').classList.remove('active');
                btn.disabled = false;
            }
        };

        const handleLogin = (e) => {
            e.preventDefault();
            const identifier = document.getElementById('auth-email').value;
            const password = document.getElementById('auth-password').value;
            const feedbackEl = document.getElementById('auth-feedback');
            const normalizedEmail = normalizeAuthIdentifier(identifier);
            
            // Get the clicked button
            const btn = e.target.closest('button') || e.target;
            handleAuthAction('login', normalizedEmail, password, feedbackEl, btn, identifier);
        };
        const handleSignup = (e) => {
            e.preventDefault();
            const identifier = document.getElementById('auth-email').value;
            const password = document.getElementById('auth-password').value;
            const feedbackEl = document.getElementById('auth-feedback');
            const normalizedEmail = normalizeAuthIdentifier(identifier);
            
            // Get the clicked button
            const btn = e.target.closest('button') || e.target;
            handleAuthAction('signup', normalizedEmail, password, feedbackEl, btn, identifier);
        };

        const navigateTo = async (pageRoute, replaceState = false) => {
            const sensitivePages = ['Education', 'Review', 'connection'];
            const [page] = pageRoute.split(':');
            
            if (sensitivePages.includes(page) && sessionStorage.getItem('ageVerified') !== 'true') {
                 showAgeGateModal(pageRoute);
                 return; 
            }

            showPageLoader();
            try {
                // const [page, param1, param2] = pageRoute.split(':'); // This is already destructured above
                const [, param1, param2] = pageRoute.split(':');
                
                if (!replaceState) {
                    historyStack.push(pageRoute);
                }
                
                const navItems = document.querySelectorAll('.nav-item');
                navItems.forEach(item => {
                    item.classList.toggle('text-red-500', item.dataset.page === page);
                    item.classList.toggle('text-slate-400', item.dataset.page !== page);
                });

                // Save scroll position for the current page
                const previousPageRoute = historyStack[historyStack.length - 2] || 'home';
                const previousPageElement = document.querySelector('.page');
                if (previousPageElement) {
                     sessionStorage.setItem(`scrollpos-${previousPageRoute}`, previousPageElement.scrollTop || appContainer.scrollTop);
                }

                switch(page) {
                    case 'home': await renderHomePage(); break;
                    case 'search': await renderSearchPage(); break;
                    case 'series': await renderAllSeriesPage(); break;
                    case 'profile': renderProfilePage(); break;
                    case 'inviteRewards': await renderInviteRewardsPage(); break;
                    case 'likedMovies': await renderLikedMoviesPage(); break;
                    case 'watchHistory': await renderWatchHistoryPage(); break;
                    case 'newPosts': await renderNewPostsPage(); break;
                    case 'premiumPlans': renderPremiumPlansPage(); break;
                    case 'details': await renderDetailsPage(param1, param2); break;
                    case 'watch': await renderWatchPage(param1); break;
                    case 'seeAll': 
                        const seeAllTitle = sessionStorage.getItem('seeAllTitle');
                        const seeAllItems = JSON.parse(sessionStorage.getItem('seeAllItems'));
                        await renderSeeAllPage(seeAllTitle, seeAllItems);
                        break;
                    case 'categoryContent': await renderCategoryContentPage(param1); break;
                    case 'genreContent': await renderGenreContentPage(param1); break;
                    case 'djPage': await renderDjPage(); break;
                    case 'static': await renderStaticPage(param1); break;
                    case 'Review': await renderWakubwaTuPage(); break;
                    case 'storyZone': await renderStoryZonePage(); break;
                    case 'storyDetail': await renderStoryDetailPage(param1); break;
                    case 'chapterReader': await renderChapterReaderPage(param1, param2); break;
                    case 'connection': await renderCustomVideoPage('connection'); break;
                    case 'Education': 
                        if (param1) { // If there's an ID, it's a detail page
                            await renderXXXVideoPage(param1);
                        } else { // Otherwise, it's the list page
                            await renderCustomVideoPage('Education');
                        }
                        break;
                    default: appContainer.innerHTML = 'Page not found';
                }

                // Restore scroll position
                const savedScrollPos = sessionStorage.getItem(`scrollpos-${pageRoute}`);
                const currentPageElement = document.querySelector('.page');
                if (savedScrollPos && currentPageElement) {
                    currentPageElement.scrollTop = parseInt(savedScrollPos, 10);
                    appContainer.scrollTop = parseInt(savedScrollPos, 10);
                } else {
                    appContainer.scrollTop = 0;
                }

            } catch (error) {
                console.error("Navigation error:", error);
                appContainer.innerHTML = `<div class="p-8 text-center text-red-400">Could not load page. Please try again.</div>`;
            } finally {
                hidePageLoader();
            }
        };

        const handleBack = () => {
            if (historyStack.length > 1) {
                historyStack.pop();
                navigateTo(historyStack[historyStack.length - 1], true);
            }
        };
        
        bottomNav.addEventListener('click', (e) => {
            const navItem = e.target.closest('.nav-item');
            const page = navItem && navItem.dataset ? navItem.dataset.page : undefined;
            if (page) navigateTo(page);
        });

        appContainer.addEventListener('click', async (e) => {
            const cardDownloadBtn = e.target.closest('.card-download-btn');
            const bannerDownloadBtn = e.target.closest('.banner-download-btn');
            const itemCard = e.target.closest('.item-card');
            const genreItem = e.target.closest('.genre-item');
            const djPageBtn = e.target.closest('[data-page="djPage"]');
            const seeAllBtn = e.target.closest('.see-all-btn');
            const profileLink = e.target.closest('.profile-link');
            const notificationBellBtn = e.target.closest('#notification-bell-btn');
            const seeAllGenreBtn = e.target.closest('.seeall-genre-btn');
            const payBtn = e.target.closest('.pay-btn');
            const contactBtn = e.target.closest('#contact-us-link');
            const lockedContentBtn = e.target.closest('.locked-content-btn');
            const enableNotificationsLink = e.target.closest('#enable-notifications-link');
            const installAndroidBtn = e.target.closest('#install-android-btn');
            const installIosBtn = e.target.closest('#install-ios-btn');
            const bannerSlide = e.target.closest('.banner-slide');
            const chapterLink = e.target.closest('.chapter-link');

            if (cardDownloadBtn) {
                e.stopPropagation();
                const url = cardDownloadBtn.dataset.url;
                if (url) {
                    window.open(url, '_blank');
                } else {
                    showNotification('Download link is not available.', 'error');
                }
            } else if (seeAllGenreBtn) {
                sessionStorage.setItem('seeAllSelectedGenre', seeAllGenreBtn.dataset.genre || '');
                const title = sessionStorage.getItem('seeAllTitle');
                const items = JSON.parse(sessionStorage.getItem('seeAllItems') || '[]');
                renderSeeAllPage(title, items);
            } else if (bannerDownloadBtn) {
                e.stopPropagation();
                const url = bannerDownloadBtn.dataset.url;
                if (url) {
                    window.open(url, '_blank');
                } else {
                    showNotification('Download link is not available.', 'error');
                }
            } else if (notificationBellBtn) {
                openNotificationsPanel();
            } else if (itemCard) {
                const { id, type } = itemCard.dataset;
                if (type === 'Education') {
                    navigateTo(`Education:${id}`);
                } else if (type === 'connection') {
                    renderVideoDetailPage(id, type);
                } else if (type === 'story') {
                    navigateTo(`storyDetail:${id}`);
                }
                else {
                    navigateTo(`details:${id}:${type}`);
                }
            } else if (genreItem) {
                const genreName = genreItem.dataset.genreName;
                navigateTo(`genreContent:${genreName}`);
            } else if (seeAllBtn) {
                const title = seeAllBtn.dataset.seeAllTitle;
                const itemsStr = seeAllBtn.dataset.seeAllItems;
                if(title && itemsStr) {
                    sessionStorage.setItem('seeAllTitle', title);
                    sessionStorage.setItem('seeAllItems', itemsStr);
                    sessionStorage.setItem('seeAllSelectedGenre', title);
                    navigateTo('seeAll');
                } else if (seeAllBtn.dataset.page === 'djPage') {
                     navigateTo('djPage');
                }
            } else if (djPageBtn) {
                navigateTo('djPage');
            } else if (profileLink) {
                e.preventDefault();
                const page = profileLink.dataset.page;
                const targetId = profileLink.dataset.target;
                if (targetId) {
                    const targetEl = document.getElementById(targetId);
                    if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else if(page) navigateTo(page);
            } else if (payBtn) {
                if (!currentUser) { 
                    showLoginRequiredModal(); 
                    return; 
                }
                
                const planAmount = payBtn.dataset.price;
                const userIdentifier = currentUser.phone || currentUser.email || 'N/A';
                const userId = currentUser.uid;
                await push(ref(database, 'packageRequests'), {
                    userId,
                    user: userIdentifier,
                    planAmount,
                    requestedAt: Date.now(),
                    invitedByUid: currentUser.invitedByUid || '',
                    invitedByCode: currentUser.invitedBy || '',
                    status: 'submitted'
                });
                await processReferralRewardOnPackagePurchase(planAmount);
                
                const message = `Hello SwaMedia\nEmail: ${userIdentifier}\nUser ID: ${userId}\nAmount: ${planAmount}\nNaomba Namba nilipia\n(usifute ujumbe huu tuma kama ulivo)`;
                
                const whatsappNumber = '255748472076';
                const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
                
                window.open(whatsappUrl, '_blank');
            } else if (contactBtn) {
                e.preventDefault();
                showContactModal();
            } else if (lockedContentBtn) {
                if (!currentUser) { showLoginRequiredModal(); }
                else { showPremiumRequiredModal(); }
            } else if (enableNotificationsLink) {
                e.preventDefault();
                requestNotificationPermission();
            } else if (installAndroidBtn) {
                if (deferredInstallPrompt) {
                    deferredInstallPrompt.prompt();
                    deferredInstallPrompt.userChoice.then((choiceResult) => {
                        if (choiceResult.outcome === 'accepted') {
                            console.log('User accepted the A2HS prompt');
                        } else {
                            console.log('User dismissed the A2HS prompt');
                        }
                        deferredInstallPrompt = null;
                    });
                } else {
                    alert('Installation prompt is not available right now. The app might already be installed or your browser doesn\'t support it.');
                }
            } else if (installIosBtn) {
                 showIosInstallInstructions();
            } else if (bannerSlide) {
                const { linkType, linkId, externalUrl } = bannerSlide.dataset;
                if (externalUrl) {
                    window.open(externalUrl, '_blank');
                } else if(linkType && linkId && linkType !== 'none') {
                    if (linkType === 'story') {
                         navigateTo(`storyDetail:${linkId}`);
                    } else {
                         navigateTo(`details:${linkId}:${linkType}`);
                    }
                }
            } else if (chapterLink) {
                const { storyId, chapterId } = chapterLink.dataset;
                navigateTo(`chapterReader:${storyId}:${chapterId}`);
            }
        });
        
        const addDetailsPageEventListeners = (itemId, itemType, item) => {
            const detailsBackBtn = document.getElementById('back-btn');
            if (detailsBackBtn) detailsBackBtn.addEventListener('click', handleBack);
            const shareBtn = document.getElementById('share-btn');
            if (shareBtn) shareBtn.addEventListener('click', () => {
                const shareData = {
                    title: `Check out this ${itemType} on SwaMedia!`,
                    text: `Watch or download from SwaMedia.`,
                    url: appShareLinkCache
                };
                try {
                    navigator.share(shareData);
                } catch(err) {
                    alert('Sharing is not supported on this browser.');
                }
            });

            const addToListBtn = document.getElementById('add-to-list-btn');
            if (addToListBtn) addToListBtn.addEventListener('click', () => {
                addToList(itemId);
            });

            const actionButtons = document.querySelectorAll('.action-btn');
            actionButtons.forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    // No login required - allow all users to watch
                    
                    const button = e.currentTarget;
                    const action = button.dataset.action;
                    let url = button.dataset.url;
                    const videoId = button.dataset.id;
                    const videoType = button.dataset.type;
                    
                    // For watch action, we don't need URL check - watch page loads from Firebase
                    if (action !== 'watch' && (!url || url === 'null')) {
                        alert('Link for this action is not available.');
                        return;
                    }

                    button.disabled = true;
                    button.querySelector('.btn-text').style.display = 'none';
                    button.querySelector('.btn-loader').style.display = 'inline';

                    try {
                        console.log('Watch button clicked - id:', videoId, 'type:', videoType);
                        if (action === 'download') {
                             window.open(url, '_blank');
                        } else if (action === 'watch') {
                            const watchId = `${itemId}_${videoId || button.dataset.title || 'watch'}_${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, '');
                            storeWatchPagePayload({
                                watchId,
                                parentId: itemId,
                                parentType: itemType,
                                parentTitle: item.title || '',
                                title: button.dataset.title || item.title || 'Now Playing',
                                description: item.description || 'No description available.',
                                rating: item.rating || item.imdbRating || 'N/A',
                                year: item.year || 'N/A',
                                genre: formatGenreText(item),
                                watchUrl: url,
                                downloadUrl: button.dataset.downloadUrl || '',
                                posterUrl: item.posterUrl || '',
                                threadId: buildCommentThreadId({
                                    parentId: itemId,
                                    parentType: itemType,
                                    sourceId: videoId || '',
                                    title: button.dataset.title || item.title || 'watch'
                                }),
                                sourceId: videoId || '',
                                sourceType: videoType || itemType
                            });
                            await navigateTo(`watch:${watchId}`);
                        }
                    } catch (error) {
                        console.error(`Error during ${action}:`, error);
                        alert(`Could not perform ${action}. Please try again.`);
                    } finally {
                        setTimeout(() => {
                           button.disabled = false;
                           button.querySelector('.btn-text').style.display = 'inline';
                           button.querySelector('.btn-loader').style.display = 'none';
                        }, 1000);
                    }
                });
            });

            const closePreviewModalBtn = document.getElementById('close-preview-modal-btn');
            if (closePreviewModalBtn) closePreviewModalBtn.addEventListener('click', () => {
                const previewModal = document.getElementById('preview-modal');
                const iframeContainer = document.getElementById('preview-iframe-container');
                iframeContainer.innerHTML = '';
                previewModal.classList.add('hidden');
                previewModal.classList.remove('flex');
            });
            
            const voteButtons = document.querySelectorAll('.vote-btn');
            const VOTE_STORAGE_KEY = `vote_${itemId}`;

            const updateVoteUI = () => {
                const userVote = localStorage.getItem(VOTE_STORAGE_KEY);
                voteButtons.forEach(btn => {
                    btn.classList.remove('voted-like', 'voted-dislike');
                    if (userVote && btn.dataset.vote === userVote) {
                        btn.classList.add(userVote === 'like' ? 'voted-like' : 'voted-dislike');
                    }
                });
            };
            
            updateVoteUI();
            
            voteButtons.forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    if (!currentUser) { showLoginRequiredModal(); return; }

                    const button = e.currentTarget;
                    const voteType = button.dataset.vote; // 'like' or 'dislike'
                    const userVote = localStorage.getItem(VOTE_STORAGE_KEY);
                    
                    button.disabled = true;

                    try {
                        const itemRef = ref(database, `${getContentDbPath(itemType)}/${itemId}`);
                        const currentDataSnap = await get(itemRef);
                        if (!currentDataSnap.exists()) return;
                        
                        let currentLikes = currentDataSnap.val().likes || 0;
                        let currentDislikes = currentDataSnap.val().dislikes || 0;
                        let updates = {};

                        if (userVote === voteType) { // User is undoing their vote
                            updates[`${voteType}s`] = voteType === 'like' ? currentLikes - 1 : currentDislikes - 1;
                            localStorage.removeItem(VOTE_STORAGE_KEY);
                        } else {
                             updates[`${voteType}s`] = voteType === 'like' ? currentLikes + 1 : currentDislikes + 1;
                             if (userVote) { // User is changing their vote
                                const oppositeType = voteType === 'like' ? 'dislike' : 'like';
                                updates[`${oppositeType}s`] = oppositeType === 'like' ? currentLikes - 1 : currentDislikes - 1;
                             }
                             localStorage.setItem(VOTE_STORAGE_KEY, voteType);
                        }
                        
                        await update(itemRef, updates);
                        
                        document.getElementById('likes-count').textContent = updates.likes !== undefined && updates.likes !== null ? updates.likes : currentLikes;
                        document.getElementById('dislikes-count').textContent = updates.dislikes !== undefined && updates.dislikes !== null ? updates.dislikes : currentDislikes;

                        updateVoteUI();

                    } catch(error) {
                        console.error("Voting error:", error);
                    } finally {
                        button.disabled = false;
                    }
                });
            });
        };

        const showBandoModal = () => {
            if (!adSettings || !adSettings.bandoSettings) return;

            const bando = adSettings.bandoSettings;
            const modal = document.getElementById('premium-modal');
            const modalContent = modal.querySelector('.modal-content');
            
            const logoName = bando.logoName || 'SwaMedia Bando';
            const plansHtml = (bando.plans || [])
                .map(plan => `
                    <div class="bando-plan border-2 rounded-lg p-3 text-center cursor-pointer" data-gb="${plan.gb}" data-price="${plan.price}">
                        <div class="font-bold text-xl">${plan.gb} GB</div>
                        <div class="text-slate-400">Tsh ${plan.price}</div>
                    </div>
                `).join('');

            modalContent.innerHTML = `
                <button id="close-bando-modal-btn" class="absolute top-2 right-2 w-8 h-8 bg-gray-800 hover:bg-gray-700 transition-colors rounded-full text-slate-400 z-10">&times;</button>
                <h3 class="text-center font-semibold text-xl mb-4 text-red-400">${logoName}</h3>
                <div class="space-y-4">
                    <p class="text-slate-300 text-center text-sm">Chagua kifurushi cha internet unachotaka kununua.</p>
                    <div class="grid grid-cols-2 gap-3" id="bando-plans-container">${plansHtml}</div>
                    <a id="bando-whatsapp-btn" href="#" target="_blank" class="block w-full text-center bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors pointer-events-none">
                        <i class="fab fa-whatsapp mr-2"></i>Nunua Kifurushi
                    </a>
                </div>
            `;

            modal.classList.remove('hidden');
            modal.classList.add('flex');

            modal.querySelector('#close-bando-modal-btn').addEventListener('click', () => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            });
            
            const plansContainer = modal.querySelector('#bando-plans-container');
            const whatsappBtn = modal.querySelector('#bando-whatsapp-btn');

            plansContainer.addEventListener('click', (e) => {
                const selectedPlanEl = e.target.closest('.bando-plan');
                if (!selectedPlanEl) return;

                plansContainer.querySelectorAll('.bando-plan').forEach(p => p.classList.remove('selected'));
                selectedPlanEl.classList.add('selected');

                const gb = selectedPlanEl.dataset.gb;
                const price = selectedPlanEl.dataset.price;
                const number = bando.whatsappNumber || '255772822552';
                const template = bando.messageTemplate || "Hello {logoName}, I would like to buy a {gb}GB bundle for Tsh {}.";
                const message = template.replace('{logoName}', logoName).replace('{gb}', gb).replace('{}', price);
                
                whatsappBtn.href = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
                whatsappBtn.classList.remove('bg-gray-600', 'pointer-events-none');
                whatsappBtn.classList.add('bg-green-600', 'hover:bg-green-700');
            });
        };

        const showAgeGateModal = (pageRoute) => {
            const modal = document.getElementById('age-gate-modal');
            const modalContent = document.getElementById('age-gate-modal-content');

            const renderVerificationStep = () => {
                modalContent.innerHTML = `
                    <div class="text-center">
                        <i class="fas fa-exclamation-triangle text-4xl text-yellow-400 mb-4"></i>
                        <h3 class="font-bold text-2xl mb-3 text-yellow-400">Tahadhari</h3>
                        <p class="text-slate-300 mb-6 text-sm leading-relaxed">
                            Kwenye Hii Page unayo taka kuingia kuna mauthui ya kingono, video zilizo vuja , picha za uchi , lugha chafu zina weza ku haribu maadili yako.
                            <br><br>
                            Ukibonyeza "Ndio" unathibitisha umekubaliana na maudhui utakayo kutana nayo.
                        </p>
                        <p class="font-semibold text-lg mb-6">Je, una miaka 18 na zaidi?</p>
                        <div class="flex justify-center space-x-4">
                            <button id="age-gate-yes" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-8 rounded-lg transition-colors">Ndio</button>
                            <button id="age-gate-no" class="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-8 rounded-lg transition-colors">Hapana</button>
                        </div>
                    </div>
                `;
                modal.querySelector('#age-gate-yes').addEventListener('click', () => {
                    sessionStorage.setItem('ageVerified', 'true');
                    modal.classList.add('hidden');
                    modal.classList.remove('flex');
                    navigateTo(pageRoute); // Proceed to navigation
                });
                modal.querySelector('#age-gate-no').addEventListener('click', () => {
                    renderRejectionStep();
                });
            };

            const renderRejectionStep = () => {
                 modalContent.innerHTML = `
                    <div class="text-center">
                        <i class="fas fa-ban text-4xl text-red-500 mb-4"></i>
                        <h3 class="font-bold text-2xl mb-4 text-red-400">Access Denied</h3>
                        <p class="text-slate-300 mb-6">Umri wako bado mdogo kuangalia maudhui haya. Asante kwa kujali maadili yako.</p>
                        <button id="age-gate-back" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-8 rounded-lg transition-colors">Back</button>
                    </div>
                `;
                modalContent.classList.remove('border-yellow-500');
                modalContent.classList.add('border-blue-500');

                modal.querySelector('#age-gate-back').addEventListener('click', () => {
                    modal.classList.add('hidden');
                    modal.classList.remove('flex');
                    // Reset border for next time
                    setTimeout(() => {
                         modalContent.classList.remove('border-blue-500');
                         modalContent.classList.add('border-yellow-500');
                    }, 300);
                });
            };

            renderVerificationStep();
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        };
        
        window.addEventListener('popstate', (event) => {
            if (historyStack.length > 1) {
                 historyStack.pop();
                 navigateTo(historyStack[historyStack.length-1], true);
            }
        });

        // Additional functions for watch page features
        function shareVideo() {
            if (navigator.share) {
                navigator.share({ title: 'Check out this video!', url: window.location.href });
            } else {
                navigator.clipboard.writeText(window.location.href);
                alert('Link copied!');
            }
        }

        function addToList(id) {
            let list = JSON.parse(localStorage.getItem('watchlist') || '[]');
            if (!list.includes(id)) {
                list.push(id);
                localStorage.setItem('watchlist', JSON.stringify(list));
                showNotification('Movie imeongezwa kwenye list yako!', 'success');
            } else {
                showNotification('Movie tayari iko kwenye list yako', 'error');
            }
        }
        window.addToList = addToList;

        function removeFromList(id) {
            let list = JSON.parse(localStorage.getItem('watchlist') || '[]');
            if (list.includes(id)) {
                list = list.filter(itemId => itemId !== id);
                localStorage.setItem('watchlist', JSON.stringify(list));
                showNotification('Movie imeondolewa kwenye list yako!', 'success');
                renderProfilePage();
            }
        }
        window.removeFromList = removeFromList;

        function rateVideo(id, rating) {
            localStorage.setItem('rating_' + id, rating);
            alert('You rated ' + rating + ' stars!');
        }

        function voteVideo(id, type) {
            let current = localStorage.getItem('vote_' + id);
            const likesEl = document.getElementById('likes-' + id);
            const dislikesEl = document.getElementById('dislikes-' + id);
            let likes = parseInt((likesEl ? likesEl.textContent : '0') || '0');
            let dislikes = parseInt((dislikesEl ? dislikesEl.textContent : '0') || '0');
            
            if (current === type) {
                // Remove vote
                if (type === 'like') likes = Math.max(0, likes - 1);
                else dislikes = Math.max(0, dislikes - 1);
                localStorage.removeItem('vote_' + id);
            } else {
                // Add vote
                if (type === 'like') likes++; else likes--;
                if (type === 'dislike') dislikes++; else dislikes--;
                if (current === 'like') likes--;
                if (current === 'dislike') dislikes--;
                localStorage.setItem('vote_' + id, type);
            }
            
            if (document.getElementById('likes-' + id)) document.getElementById('likes-' + id).textContent = likes;
            if (document.getElementById('dislikes-' + id)) document.getElementById('dislikes-' + id).textContent = dislikes;
        }

        function playNext(nextId) {
            const previewModal = document.getElementById('preview-modal');
            previewModal.classList.add('hidden');
            previewModal.classList.remove('flex');
            // Navigate to next episode
            navigateTo('details:' + nextId + ':series');
        }
        
        initApp();
    