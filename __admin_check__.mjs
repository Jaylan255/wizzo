
        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
        import { getDatabase, ref, get, set, push, remove, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

       const firebaseConfig = {
            apiKey: "AIzaSyAAWjWH55_WogACWc3vNVWrlLrwPYPfgmo",
            authDomain: "swamediaweb.firebaseapp.com",
            databaseURL: "https://swamediaweb-default-rtdb.firebaseio.com",
            projectId: "swamediaweb",
            storageBucket: "swamediaweb.firebasestorage.app",
            messagingSenderId: "70354150749",
            appId: "1:70354150749:web:046e78eb57ce1fe427f4b4"
        };
        const app = initializeApp(firebaseConfig);
        const db = getDatabase(app);
        
        let currentView = 'movies';
        let editId = null;
        let categoriesCache = [];
        let djGenresCache = [];
        let storyGenresCache = [];
        let moviesCache = [];
        let seriesCache = [];
        let storiesCache = [];
        let adultContentCache = [];
        let connectionContentCache = [];
        let xxxContentCache = [];
        let usersCache = [];
        let movieListFilter = 'all';
        let seriesListFilter = 'all';

        const formContainer = document.getElementById('form-container');
        const listContainer = document.getElementById('list-container');
        const listTitle = document.getElementById('list-title');
        const listViewContainer = document.getElementById('list-view-container');

        const inputClass = "w-full bg-gray-900 border border-gray-700 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-red-500";
        const labelClass = "block text-sm font-medium text-slate-400 mb-1";
        const buttonClass = "bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:bg-gray-600";
        const subButtonClass = "bg-gray-600 hover:bg-gray-500 text-white font-bold py-1 px-3 rounded text-sm";
        const fieldsetStyles = "border border-gray-700 p-4 rounded-lg space-y-4";
        const legendStyles = "px-2 text-red-400 font-semibold";

        const getDisplayName = (view) => {
            const names = {
                movies: 'Movie',
                series: 'Series',
                genres: 'Genre',
                djgenres: 'DJ Genre',
                adultContent: 'Wakubwa Tu Content',
                connection: 'Connection Content',
                xxx: 'XXX Content',
                stories: 'Story',
                'story-genres': 'Story Genre',
                banners: 'Home Banner',
                'series-banners': 'Series Banner',
                'story-banners': 'Story Banner',
                'connection-banners': 'Connection Banner',
                'xxx-banners': 'XXX Banner',
                'swa-media-ads': 'SwaMedia Ad',
                'update-ad': 'Update App Ad',
                'feedback': 'Maoni'
            };
            return names[view] || view;
        };
        
        const getCategoryOptions = (selectedCategory = "") => {
            let options = '<option value="">-- Select Category --</option>';
            categoriesCache.forEach(c => {
                options += `<option value="${c.name}" ${selectedCategory === c.name ? 'selected' : ''}>${c.name}</option>`;
            });
            return options;
        };
        
        const getDjGenreOptions = (selectedDj = "") => {
            let options = '<option value="">-- Select DJ --</option>';
            djGenresCache.forEach(c => {
                options += `<option value="${c.name}" ${selectedDj === c.name ? 'selected' : ''}>${c.name}</option>`;
            });
            return options;
        };

        const getStoryGenreOptions = (selectedGenre = "") => {
            let options = '<option value="">-- Select Story Genre --</option>';
            storyGenresCache.forEach(c => {
                options += `<option value="${c.name}" ${selectedGenre === c.name ? 'selected' : ''}>${c.name}</option>`;
            });
            return options;
        };

        const escapeHtml = (value = '') => String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        const normalizeDuplicateValue = (value = '') => String(value).replace(/\s+/g, ' ').trim().toLowerCase();

        const getContentCacheByView = (view) => {
            const viewCacheMap = {
                movies: moviesCache,
                series: seriesCache,
                adultContent: adultContentCache,
                connection: connectionContentCache,
                xxx: xxxContentCache,
                stories: storiesCache
            };
            return viewCacheMap[view] || [];
        };

        const getDuplicateContentMessage = (view, currentId, rawTitle = '', rawDj = '') => {
            const cache = getContentCacheByView(view);
            const normalizedTitle = normalizeDuplicateValue(rawTitle);
            const normalizedDj = normalizeDuplicateValue(rawDj);

            if (!normalizedTitle || cache.length === 0) return '';

            const duplicate = cache.find(item =>
                item &&
                item.id !== currentId &&
                normalizeDuplicateValue(item.title) === normalizedTitle &&
                normalizeDuplicateValue(item.dj) === normalizedDj
            );

            if (!duplicate) return '';

            const contentName = getDisplayName(view);
            const duplicateDjLabel = normalizedDj ? ` | ${rawDj.trim()}` : '';
            return `${contentName} hii tayari ilishawekwa: ${rawTitle.trim()}${duplicateDjLabel}`;
        };

        const timeSince = (timestamp) => {
            if (!timestamp) return '';
            const seconds = Math.floor((Date.now() - Number(timestamp)) / 1000);
            let interval = seconds / 31536000;
            if (interval > 1) { const val = Math.floor(interval); return `${val} ${val === 1 ? 'year' : 'years'} ago`; }
            interval = seconds / 2592000;
            if (interval > 1) { const val = Math.floor(interval); return `${val} ${val === 1 ? 'month' : 'months'} ago`; }
            interval = seconds / 86400;
            if (interval > 1) { const val = Math.floor(interval); return `${val} ${val === 1 ? 'day' : 'days'} ago`; }
            interval = seconds / 3600;
            if (interval > 1) { const val = Math.floor(interval); return `${val} ${val === 1 ? 'hour' : 'hours'} ago`; }
            interval = seconds / 60;
            if (interval > 1) { const val = Math.floor(interval); return `${val} ${val === 1 ? 'minute' : 'minutes'} ago`; }
            return `${Math.max(1, Math.floor(seconds))} seconds ago`;
        };

        const normalizeNotificationItem = (item) => {
            const replies = item?.replies && typeof item.replies === 'object'
                ? Object.keys(item.replies).map(key => ({ id: key, ...item.replies[key] }))
                : [];

            return {
                ...item,
                authorId: item?.authorId || 'admin',
                authorName: item?.authorName || 'Admin',
                reactions: item?.reactions && typeof item.reactions === 'object' ? item.reactions : {},
                replies: replies.sort((a, b) => Number(a.time || 0) - Number(b.time || 0))
            };
        };

        const getReactionSummary = (reactions = {}) => {
            const counts = Object.values(reactions).reduce((acc, emoji) => {
                if (!emoji) return acc;
                acc[emoji] = (acc[emoji] || 0) + 1;
                return acc;
            }, {});
            const entries = Object.entries(counts);
            return entries.length > 0 ? entries.map(([emoji, count]) => `${emoji} ${count}`).join('  ') : 'No reactions yet';
        };

        const getBlockButtonLabel = (authorId) => {
            const matchedUser = usersCache.find(user => user.id === authorId || user.uid === authorId);
            if (matchedUser && (matchedUser.isBlocked === true || matchedUser.blocked === true)) {
                return 'Blocked';
            }
            return 'Block User';
        };

        const getBannerLinkItemsByType = (type) => {
            switch (type) {
                case 'movie':
                    return moviesCache;
                case 'series':
                    return seriesCache;
                case 'adultContent':
                    return adultContentCache;
                case 'connection':
                    return connectionContentCache;
                case 'xxx':
                    return xxxContentCache;
                case 'story':
                    return storiesCache;
                default:
                    return [];
            }
        };

        const getBannerLinkFilters = () => {
            const searchValue = document.getElementById('linkSearch')?.value?.trim().toLowerCase() || '';
            const sortValue = document.getElementById('linkSort')?.value || 'newest';
            return { searchValue, sortValue };
        };

        const getProcessedBannerLinkItems = (type) => {
            const { searchValue, sortValue } = getBannerLinkFilters();
            const items = [...getBannerLinkItemsByType(type)];

            const filteredItems = items.filter(item => {
                if (!searchValue) return true;
                const haystack = [
                    item.title,
                    item.year,
                    item.category,
                    item.genre,
                    item.dj
                ].filter(Boolean).join(' ').toLowerCase();
                return haystack.includes(searchValue);
            });

            filteredItems.sort((a, b) => {
                switch (sortValue) {
                    case 'title-asc':
                        return String(a.title || '').localeCompare(String(b.title || ''));
                    case 'title-desc':
                        return String(b.title || '').localeCompare(String(a.title || ''));
                    case 'year-desc':
                        return Number(b.year || 0) - Number(a.year || 0);
                    case 'year-asc':
                        return Number(a.year || 0) - Number(b.year || 0);
                    case 'oldest':
                        return Number(a.createdAt || a.timestamp || 0) - Number(b.createdAt || b.timestamp || 0);
                    case 'newest':
                    default:
                        return Number(b.createdAt || b.timestamp || 0) - Number(a.createdAt || a.timestamp || 0);
                }
            });

            return filteredItems;
        };

        const getFilteredAdminItems = (items, view) => {
            if (view === 'movies' && movieListFilter === 'unpublished') {
                return items.filter(item => item.isPublished === false);
            }
            if (view === 'series' && seriesListFilter === 'unpublished') {
                return items.filter(item => item.isPublished === false);
            }
            return items;
        };

        const renderBulkActions = (view) => {
            const container = document.getElementById('bulk-actions-container');
            if (!container) return;

            if (view === 'movies') {
                container.innerHTML = `
                    <button id="show-all-movies-btn" class="${subButtonClass} ${movieListFilter === 'all' ? 'bg-red-700 hover:bg-red-600' : ''}">All Movies</button>
                    <button id="show-unpublished-movies-btn" class="${subButtonClass} ${movieListFilter === 'unpublished' ? 'bg-yellow-700 hover:bg-yellow-600' : 'bg-gray-700 hover:bg-gray-600'}">Show All Unpublish Movie</button>
                `;
                document.getElementById('show-all-movies-btn')?.addEventListener('click', () => {
                    movieListFilter = 'all';
                    renderList('movies');
                });
                document.getElementById('show-unpublished-movies-btn')?.addEventListener('click', () => {
                    movieListFilter = 'unpublished';
                    renderList('movies');
                });
                return;
            }

            if (view === 'series') {
                container.innerHTML = `
                    <button id="show-all-series-btn" class="${subButtonClass} ${seriesListFilter === 'all' ? 'bg-red-700 hover:bg-red-600' : ''}">All Series</button>
                    <button id="show-unpublished-series-btn" class="${subButtonClass} ${seriesListFilter === 'unpublished' ? 'bg-yellow-700 hover:bg-yellow-600' : 'bg-gray-700 hover:bg-gray-600'}">Show All Unpublish Series</button>
                `;
                document.getElementById('show-all-series-btn')?.addEventListener('click', () => {
                    seriesListFilter = 'all';
                    renderList('series');
                });
                document.getElementById('show-unpublished-series-btn')?.addEventListener('click', () => {
                    seriesListFilter = 'unpublished';
                    renderList('series');
                });
                return;
            }

            container.innerHTML = '';
        };

        const storyFormTemplate = () => {
            const displayName = getDisplayName(currentView);
            return `
            <h2 class="text-2xl font-bold mb-4">${editId ? `Edit ${displayName}` : `Add New ${displayName}`}</h2>
            <form id="content-form" class="space-y-6">
                <fieldset class="${fieldsetStyles}">
                    <legend class="${legendStyles}">Story Details</legend>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label class="${labelClass}">Story Title</label><input required id="title" class="${inputClass}" type="text"></div>
                        <div><label class="${labelClass}">Poster URL</label><input id="posterUrl" class="${inputClass}" type="url" placeholder="Optional cover image"></div>
                        <div><label class="${labelClass}">Genre</label><select id="genre" class="${inputClass}">${getStoryGenreOptions()}</select></div>
                    </div>
                </fieldset>
                <fieldset class="${fieldsetStyles}">
                    <legend class="${legendStyles}">Chapters</legend>
                    <div class="flex justify-between items-center mb-2">
                         <h3 class="text-lg font-semibold text-slate-300">Story Chapters</h3>
                         <button type="button" id="add-chapter-btn" class="${subButtonClass}">+ Add Chapter</button>
                    </div>
                    <div id="chapters-container" class="space-y-4"></div>
                </fieldset>
                <div class="flex space-x-4 pt-4">
                     <button type="submit" class="${buttonClass}" id="submit-btn">Save ${displayName}</button>
                     <button type="button" id="cancel-btn" class="bg-gray-700 hover:bg-gray-600 p-2 px-4 rounded">Cancel</button>
                </div>
            </form>
        `};
        
        const advertisementFormTemplate = () => `
            <h2 class="text-2xl font-bold mb-4">Pop-up Advertisement & Bando Settings</h2>
            <form id="advertisement-form" class="space-y-6">
                <fieldset class="${fieldsetStyles}">
                    <legend class="${legendStyles}">Global Ad Settings</legend>
                    <div class="flex items-center justify-between">
                        <div>
                            <label for="ad-enabled-toggle" class="font-semibold text-lg">Enable Ad System</label>
                            <p class="text-slate-400 text-sm">If ON, the configured ad will pop up for all users.</p>
                        </div>
                        <div class="relative inline-block w-14 h-7 align-middle select-none">
                            <input type="checkbox" name="ad-enabled-toggle" id="ad-enabled-toggle" class="toggle-checkbox absolute block w-7 h-7 rounded-full bg-white border-4 border-gray-600 appearance-none cursor-pointer"/>
                            <label for="ad-enabled-toggle" class="toggle-label block overflow-hidden h-7 rounded-full bg-gray-600 cursor-pointer"></label>
                        </div>
                    </div>
                </fieldset>

                <fieldset class="${fieldsetStyles}">
                    <legend class="${legendStyles}">Pop-up Ad Content</legend>
                    <div class="flex space-x-4 mb-4 border-b border-gray-700">
                        <label class="flex items-center space-x-2 pb-2 border-b-2 border-red-500 cursor-pointer">
                            <input type="radio" name="adType" value="image" class="form-radio text-red-500" checked>
                            <span>Image Ad</span>
                        </label>
                        <label class="flex items-center space-x-2 pb-2 border-b-2 border-transparent cursor-pointer">
                            <input type="radio" name="adType" value="text" class="form-radio text-red-500">
                            <span>Text Ad</span>
                        </label>
                    </div>
                    <div id="ad-type-image">
                        <label class="${labelClass}">Image URL</label>
                        <input id="ad-imageUrl" class="${inputClass}" type="url" placeholder="https://example.com/ad.png">
                    </div>
                    <div id="ad-type-text" class="hidden space-y-4">
                        <div><label class="${labelClass}">Ad Title</label><input id="ad-title" class="${inputClass}" type="text" placeholder="Special Offer!"></div>
                        <div><label class="${labelClass}">Ad Message</label><textarea id="ad-message" class="${inputClass}" rows="3" placeholder="Get 50% off on premium subscription."></textarea></div>
                    </div>
                </fieldset>

                <fieldset class="${fieldsetStyles}">
                    <legend class="${legendStyles}">Bando Modal Settings</legend>
                    <div><label class="${labelClass}">Logo Name</label><input id="bando-logoName" class="${inputClass}" type="text" value="Drama Zone Bando"></div>
                    <div><label class="${labelClass}">WhatsApp Number</label><input id="bando-whatsappNumber" class="${inputClass}" type="text" placeholder="255617799684"></div>
                    <div>
                        <label class="${labelClass}">WhatsApp Message Template</label>
                        <textarea id="bando-messageTemplate" class="${inputClass}" rows="4"></textarea>
                        <p class="text-xs text-slate-400 mt-1">Use {logoName}, {gb}, and {amount} as placeholders.</p>
                    </div>

                    <div class="border-t border-gray-600 pt-4">
                        <div class="flex justify-between items-center mb-2">
                             <h3 class="text-lg font-semibold text-slate-300">Bando Plans</h3>
                             <button type="button" id="add-bando-plan-btn" class="${subButtonClass}">+ Add Plan</button>
                        </div>
                        <div id="bando-plans-container" class="space-y-2"></div>
                    </div>
                </fieldset>
                
                <div class="flex space-x-4 pt-4">
                     <button type="submit" class="${buttonClass}" id="submit-btn">Save All Ad Settings</button>
                </div>
            </form>
        `;

        const updateAdFormTemplate = () => `
            <h2 class="text-2xl font-bold mb-4">Full-Screen Update App Advertisement</h2>
            <form id="update-ad-form" class="space-y-6">
                <fieldset class="${fieldsetStyles}">
                    <legend class="${legendStyles}">Global Update Ad Settings</legend>
                    <div class="flex items-center justify-between">
                        <div>
                            <label for="update-ad-enabled" class="font-semibold text-lg">Enable Update Popup</label>
                            <p class="text-slate-400 text-sm">If ON, this full-screen popup will show to all users upon app load.</p>
                        </div>
                        <div class="relative inline-block w-14 h-7 align-middle select-none">
                            <input type="checkbox" id="update-ad-enabled" class="toggle-checkbox absolute block w-7 h-7 rounded-full bg-white border-4 border-gray-600 appearance-none cursor-pointer"/>
                            <label for="update-ad-enabled" class="toggle-label block overflow-hidden h-7 rounded-full bg-gray-600 cursor-pointer"></label>
                        </div>
                    </div>
                </fieldset>

                <fieldset class="${fieldsetStyles}">
                    <legend class="${legendStyles}">Popup Content</legend>
                    <div>
                        <label class="${labelClass}">Message</label>
                        <textarea id="update-ad-message" class="${inputClass}" rows="4" placeholder="e.g., Habari Tumeongeza Features Zaidi Ili kuongeza Performance ya App Yetu"></textarea>
                    </div>
                    <div>
                        <label class="${labelClass}">Download Link (for "Update Sasa" button)</label>
                        <input id="update-ad-downloadUrl" class="${inputClass}" type="url" placeholder="https://www.swamedia.online/download">
                    </div>
                </fieldset>

                 <fieldset class="${fieldsetStyles}">
                    <legend class="${legendStyles}">Popup Behavior</legend>
                     <div class="flex items-center justify-between">
                        <div>
                            <label for="update-ad-showCloseButton" class="font-semibold text-lg">Show "Baadae" (Later) Button</label>
                            <p class="text-slate-400 text-sm">If OFF, users must click "Update Sasa" to proceed, making the update mandatory.</p>
                        </div>
                        <div class="relative inline-block w-14 h-7 align-middle select-none">
                            <input type="checkbox" id="update-ad-showCloseButton" class="toggle-checkbox absolute block w-7 h-7 rounded-full bg-white border-4 border-gray-600 appearance-none cursor-pointer"/>
                            <label for="update-ad-showCloseButton" class="toggle-label block overflow-hidden h-7 rounded-full bg-gray-600 cursor-pointer"></label>
                        </div>
                    </div>
                </fieldset>
                
                <div class="flex space-x-4 pt-4">
                     <button type="submit" class="${buttonClass}" id="submit-btn">Save Update Ad Settings</button>
                </div>
            </form>
        `;

        const pushNotificationFormTemplate = () => `
            <h2 class="text-2xl font-bold mb-4">Send Push Notification</h2>
            <form id="push-notification-form" class="space-y-6">
                 <fieldset class="${fieldsetStyles}">
                    <legend class="${legendStyles}">Notification Content</legend>
                    <div>
                        <label for="fcm-title" class="${labelClass}">Title</label>
                        <input id="fcm-title" required class="${inputClass}" type="text" placeholder="New Movie Alert!">
                    </div>
                    <div>
                        <label for="fcm-message" class="${labelClass}">Message</label>
                        <textarea id="fcm-message" required class="${inputClass}" rows="4" placeholder="Check out the latest action movie..."></textarea>
                    </div>
                    <div>
                        <label for="fcm-icon" class="${labelClass}">Icon URL (Optional)</label>
                        <input id="fcm-icon" class="${inputClass}" type="url" placeholder="https://example.com/icon.png">
                    </div>
                     <div>
                        <label for="fcm-click-action" class="${labelClass}">Click Action URL (Optional)</label>
                        <input id="fcm-click-action" class="${inputClass}" type="url" placeholder="https://swamedia.web.app">
                    </div>
                </fieldset>
                <div class="pt-4">
                    <button type="submit" class="${buttonClass}" id="submit-btn">
                        <i class="fas fa-paper-plane mr-2"></i>Send to All Users
                    </button>
                </div>
            </form>
        `;

        const videoContentFormTemplate = (displayName) => {
            return `
            <h2 class="text-2xl font-bold mb-4">${editId ? `Edit ${displayName}` : `Add New ${displayName}`}</h2>
            <form id="content-form" class="space-y-6">
                <fieldset class="${fieldsetStyles}">
                    <legend class="${legendStyles}">Content Details</legend>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label class="${labelClass}">Name</label><input required id="title" class="${inputClass}" type="text"></div>
                        <div><label class="${labelClass}">Poster URL</label><input required id="posterUrl" class="${inputClass}" type="url"></div>
                    </div>
                     <div><label class="${labelClass}">Video URL / Embed URL</label><input required id="videoUrl" class="${inputClass}" type="url"></div>
                     <div class="flex items-center justify-between pt-4 border-t border-gray-800">
                        <div>
                            <label for="published-toggle" class="font-semibold text-lg">Published</label>
                            <p class="text-slate-400 text-sm">If ON, this content will be visible to users.</p>
                        </div>
                        <div class="relative inline-block w-14 h-7 align-middle select-none">
                            <input type="checkbox" name="published-toggle" id="published-toggle" class="toggle-checkbox absolute block w-7 h-7 rounded-full bg-white border-4 border-gray-600 appearance-none cursor-pointer" checked/>
                            <label for="published-toggle" class="toggle-label block overflow-hidden h-7 rounded-full bg-gray-600 cursor-pointer"></label>
                        </div>
                    </div>
                </fieldset>
                <div class="flex space-x-4 pt-4">
                     <button type="submit" class="${buttonClass}" id="submit-btn">Save ${displayName}</button>
                     <button type="button" id="cancel-btn" class="bg-gray-700 hover:bg-gray-600 p-2 px-4 rounded">Cancel</button>
                </div>
            </form>
        `};


        const movieFormTemplate = () => {
            const displayName = getDisplayName(currentView);
            return `
            <h2 class="text-2xl font-bold mb-4">${editId ? `Edit ${displayName}` : `Add New ${displayName}`}</h2>
            <form id="content-form" class="space-y-6">
                <fieldset class="${fieldsetStyles}">
                    <legend class="${legendStyles}">Core Information</legend>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label class="${labelClass}">Title</label><input required id="title" class="${inputClass}" type="text"></div>
                        <div><label class="${labelClass}">Poster URL</label><input required id="posterUrl" class="${inputClass}" type="url"></div>
                        <div><label class="${labelClass}">Year</label><input id="year" class="${inputClass}" type="number" placeholder="e.g., 2024"></div>
                        <div><label class="${labelClass}">Rating</label><input id="rating" class="${inputClass}" type="text" placeholder="e.g., 8.5"></div>
                    </div>
                     <div class="flex items-center justify-between pt-4 border-t border-gray-800">
                        <div>
                            <label for="published-toggle" class="font-semibold text-lg">Published</label>
                            <p class="text-slate-400 text-sm">If ON, this content will be visible to users in the app.</p>
                        </div>
                        <div class="relative inline-block w-14 h-7 align-middle select-none">
                            <input type="checkbox" name="published-toggle" id="published-toggle" class="toggle-checkbox absolute block w-7 h-7 rounded-full bg-white border-4 border-gray-600 appearance-none cursor-pointer" checked/>
                            <label for="published-toggle" class="toggle-label block overflow-hidden h-7 rounded-full bg-gray-600 cursor-pointer"></label>
                        </div>
                    </div>
                    <div class="flex items-center justify-between pt-4 border-t border-gray-800">
                        <div>
                            <label for="movie-of-the-week-toggle" class="font-semibold text-lg">Movie of The Week</label>
                            <p class="text-slate-400 text-sm">If ON, this will be featured in the "Movies of This Week" section.</p>
                        </div>
                        <div class="relative inline-block w-14 h-7 align-middle select-none">
                            <input type="checkbox" name="movie-of-the-week-toggle" id="movie-of-the-week-toggle" class="toggle-checkbox absolute block w-7 h-7 rounded-full bg-white border-4 border-gray-600 appearance-none cursor-pointer"/>
                            <label for="movie-of-the-week-toggle" class="toggle-label block overflow-hidden h-7 rounded-full bg-gray-600 cursor-pointer"></label>
                        </div>
                    </div>
                </fieldset>
                <fieldset class="${fieldsetStyles}">
                    <legend class="${legendStyles}">Metadata</legend>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label class="${labelClass}">Category</label><select id="category" class="${inputClass}">${getCategoryOptions()}</select></div>
                        <div><label class="${labelClass}">DJ</label><select id="dj" class="${inputClass}">${getDjGenreOptions()}</select></div>
                    </div>
                    <div><label class="${labelClass}">Description</label><textarea id="description" class="${inputClass}" rows="3"></textarea></div>
                    <div><label class="${labelClass}">Cast</label><input id="cast" class="${inputClass}" type="text" placeholder="Comma separated actors"></div>
                </fieldset>
                 <fieldset class="${fieldsetStyles}">
                    <legend class="${legendStyles}">Streaming & Share Links</legend>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label class="${labelClass}">Watch URL (Main)</label><input id="watchUrl" class="${inputClass}" type="url"></div>
                        <div><label class="${labelClass}">Download URL (Main)</label><input id="downloadUrl" class="${inputClass}" type="url"></div>
                    </div>
                    <div><label class="${labelClass}">Share URL</label><input id="shareUrl" class="${inputClass}" type="url" placeholder="Link for the share button"></div>
                </fieldset>
                <fieldset class="${fieldsetStyles}">
                    <legend class="${legendStyles}">Movie Parts (if applicable)</legend>
                    <div class="flex justify-between items-center mb-2">
                         <h3 class="text-lg font-semibold text-slate-300">Parts</h3>
                         <button type="button" id="add-part-btn" class="${subButtonClass}">+ Add Part</button>
                    </div>
                    <div id="parts-container" class="space-y-3"></div>
                </fieldset>
                <div class="flex space-x-4 pt-4">
                     <button type="submit" class="${buttonClass}" id="submit-btn">Save ${displayName}</button>
                     <button type="button" id="cancel-btn" class="bg-gray-700 hover:bg-gray-600 p-2 px-4 rounded">Cancel</button>
                </div>
            </form>
        `};

        const seriesFormTemplate = () => {
            const displayName = getDisplayName(currentView);
            return `
             <h2 class="text-2xl font-bold mb-4">${editId ? `Edit ${displayName}` : `Add New ${displayName}`}</h2>
            <form id="content-form" class="space-y-6">
                 <fieldset class="${fieldsetStyles}">
                    <legend class="${legendStyles}">Core Information</legend>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label class="${labelClass}">Title</label><input required id="title" class="${inputClass}" type="text"></div>
                        <div><label class="${labelClass}">Poster URL</label><input required id="posterUrl" class="${inputClass}" type="url"></div>
                        <div><label class="${labelClass}">Year</label><input id="year" class="${inputClass}" type="number" placeholder="e.g., 2024"></div>
                        <div><label class="${labelClass}">Rating</label><input id="rating" class="${inputClass}" type="text" placeholder="e.g., 8.5"></div>
                    </div>
                    <div class="flex items-center justify-between pt-4 border-t border-gray-800">
                        <div>
                            <label for="published-toggle" class="font-semibold text-lg">Published</label>
                            <p class="text-slate-400 text-sm">If ON, this content will be visible to users in the app.</p>
                        </div>
                        <div class="relative inline-block w-14 h-7 align-middle select-none">
                            <input type="checkbox" name="published-toggle" id="published-toggle" class="toggle-checkbox absolute block w-7 h-7 rounded-full bg-white border-4 border-gray-600 appearance-none cursor-pointer" checked/>
                            <label for="published-toggle" class="toggle-label block overflow-hidden h-7 rounded-full bg-gray-600 cursor-pointer"></label>
                        </div>
                    </div>
                    <div class="flex items-center justify-between pt-4 border-t border-gray-800">
                        <div>
                            <label for="movie-of-the-week-toggle" class="font-semibold text-lg">Movie of The Week</label>
                            <p class="text-slate-400 text-sm">If ON, this will be featured in the "Movies of This Week" section.</p>
                        </div>
                        <div class="relative inline-block w-14 h-7 align-middle select-none">
                            <input type="checkbox" name="movie-of-the-week-toggle" id="movie-of-the-week-toggle" class="toggle-checkbox absolute block w-7 h-7 rounded-full bg-white border-4 border-gray-600 appearance-none cursor-pointer"/>
                            <label for="movie-of-the-week-toggle" class="toggle-label block overflow-hidden h-7 rounded-full bg-gray-600 cursor-pointer"></label>
                        </div>
                    </div>
                 </fieldset>
                 <fieldset class="${fieldsetStyles}">
                    <legend class="${legendStyles}">Metadata</legend>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label class="${labelClass}">Category</label><select id="category" class="${inputClass}">${getCategoryOptions()}</select></div>
                        <div><label class="${labelClass}">DJ</label><select id="dj" class="${inputClass}">${getDjGenreOptions()}</select></div>
                    </div>
                    <div><label class="${labelClass}">Description</label><textarea id="description" class="${inputClass}" rows="3"></textarea></div>
                    <div><label class="${labelClass}">Cast</label><input id="cast" class="${inputClass}" type="text" placeholder="Comma separated actors"></div>
                    <div><label class="${labelClass}">Share URL</label><input id="shareUrl" class="${inputClass}" type="url" placeholder="Link for the share button"></div>
                 </fieldset>
                <fieldset class="${fieldsetStyles}">
                    <legend class="${legendStyles}">Seasons & Episodes</legend>
                    <div class="flex justify-between items-center mb-2">
                         <h3 class="text-lg font-semibold">Seasons</h3>
                         <button type="button" id="add-season-btn" class="${subButtonClass}">+ Add Season</button>
                    </div>
                    <div id="seasons-container" class="space-y-4"></div>
                </fieldset>
                <div class="flex space-x-4 pt-4">
                     <button type="submit" class="${buttonClass}" id="submit-btn">Save ${displayName}</button>
                     <button type="button" id="cancel-btn" class="bg-gray-700 hover:bg-gray-600 p-2 px-4 rounded">Cancel</button>
                </div>
            </form>
        `};
        
        const genreFormTemplate = (title = "Genre") => `
            <h2 class="text-2xl font-bold mb-4">${editId ? `Edit ${title}` : `Add New ${title}`}</h2>
            <form id="content-form" class="space-y-4">
                <div><label class="${labelClass}">${title} Name</label><input required id="name" class="${inputClass}" type="text"></div>
                <div class="flex space-x-4">
                     <button type="submit" class="${buttonClass}" id="submit-btn">Save ${title}</button>
                     <button type="button" id="cancel-btn" class="bg-gray-700 hover:bg-gray-600 p-2 px-4 rounded">Cancel</button>
                </div>
            </form>
        `;

        const swaMediaAdsFormTemplate = () => {
            const displayName = 'SwaMedia Ad';
            const allWatchableContent = [...moviesCache, ...seriesCache, ...adultContentCache, ...connectionContentCache, ...xxxContentCache];
            const movieOptions = allWatchableContent.map(item => `<option value="${item.id}">${item.title} (${item.type})</option>`).join('');

            return `
            <h2 class="text-2xl font-bold mb-4">${editId ? `Edit ${displayName}` : `Add New ${displayName}`}</h2>
            <form id="content-form" class="space-y-6">
                <fieldset class="${fieldsetStyles}">
                    <legend class="${legendStyles}">Ad Details</legend>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label class="${labelClass}">Ad Title</label><input id="title" class="${inputClass}" type="text" placeholder="e.g., New Movies This Week!"></div>
                        <div>
                            <label for="type" class="${labelClass}">Ad Type</label>
                            <select id="type" class="${inputClass}">
                                <option value="image">Image</option>
                                <option value="video">Video</option>
                                <option value="movie-list">Movie List</option>
                            </select>
                        </div>
                    </div>
                    <div id="ad-link-url-container">
                        <label class="${labelClass}">Link URL (when ad is clicked)</label>
                        <input id="linkUrl" class="${inputClass}" type="url" placeholder="https://example.com/product (optional)">
                    </div>
                     <div class="flex items-center justify-between pt-4 border-t border-gray-800">
                        <div>
                            <label for="is-active-toggle" class="font-semibold text-lg">Ad Active</label>
                            <p class="text-slate-400 text-sm">If ON, this ad will be shown on the search page.</p>
                        </div>
                        <div class="relative inline-block w-14 h-7 align-middle select-none">
                            <input type="checkbox" name="is-active-toggle" id="is-active-toggle" class="toggle-checkbox absolute block w-7 h-7 rounded-full bg-white border-4 border-gray-600 appearance-none cursor-pointer" checked/>
                            <label for="is-active-toggle" class="toggle-label block overflow-hidden h-7 rounded-full bg-gray-600 cursor-pointer"></label>
                        </div>
                    </div>
                </fieldset>

                <fieldset id="ad-content-image" class="${fieldsetStyles}">
                    <legend class="${legendStyles}">Image Ad Content</legend>
                    <div><label class="${labelClass}">Image URL</label><input id="imageUrl" class="${inputClass}" type="url" placeholder="https://example.com/ad.png"></div>
                </fieldset>

                <fieldset id="ad-content-video" class="${fieldsetStyles} hidden">
                    <legend class="${legendStyles}">Video Ad Content</legend>
                    <div><label class="${labelClass}">Video URL</label><input id="videoUrl" class="${inputClass}" type="url" placeholder="https://example.com/ad.mp4"></div>
                </fieldset>

                <fieldset id="ad-content-movie-list" class="${fieldsetStyles} hidden">
                    <legend class="${legendStyles}">Movie List Content</legend>
                    <div>
                        <label class="${labelClass}">Select Movies/Series</label>
                        <p class="text-xs text-slate-400 mb-2">Hold Ctrl/Cmd to select multiple items.</p>
                        <select id="movieIds" class="${inputClass}" multiple size="10">
                            ${movieOptions}
                        </select>
                    </div>
                </fieldset>
                
                <div class="flex space-x-4 pt-4">
                     <button type="submit" class="${buttonClass}" id="submit-btn">Save ${displayName}</button>
                     <button type="button" id="cancel-btn" class="bg-gray-700 hover:bg-gray-600 p-2 px-4 rounded">Cancel</button>
                </div>
            </form>
            `;
        };

        const storyBannerFormTemplate = () => `
            <h2 class="text-2xl font-bold mb-4">${editId ? 'Edit Story Banner' : 'Add New Story Banner'}</h2>
            <form id="content-form" class="space-y-4">
                <div><label class="${labelClass}">Image URL</label><input required id="imageUrl" class="${inputClass}" type="url"></div>
                <div><label class="${labelClass}">Overlay Text</label><input id="overlayText" class="${inputClass}" type="text" placeholder="Text to display on the banner"></div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label class="${labelClass}">Direct Link URL</label><input id="directLinkUrl" class="${inputClass}" type="url" placeholder="https://example.com/promotion"></div>
                    <div class="flex items-end">
                        <label class="flex items-center gap-3 cursor-pointer">
                            <input id="isPromotion" type="checkbox" class="w-4 h-4">
                            <span class="text-sm text-slate-300">Mark as Promotion Ad</span>
                        </label>
                    </div>
                </div>
                <fieldset class="${fieldsetStyles}">
                    <legend class="${legendStyles}">Link to a Story</legend>
                    <div id="linkPickerControls" class="hidden grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div class="md:col-span-2">
                            <label for="linkSearch" class="${labelClass}">Search</label>
                            <input id="linkSearch" class="${inputClass}" type="search" placeholder="Search story by title, year or genre">
                        </div>
                        <div>
                            <label for="linkSort" class="${labelClass}">Sort By</label>
                            <select id="linkSort" class="${inputClass}">
                                <option value="newest">Newest</option>
                                <option value="oldest">Oldest</option>
                                <option value="title-asc">Title A-Z</option>
                                <option value="title-desc">Title Z-A</option>
                                <option value="year-desc">Year High-Low</option>
                                <option value="year-asc">Year Low-High</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label for="linkId" class="${labelClass}">Link To Story</label>
                        <select id="linkId" class="${inputClass}">
                            <option value="">-- Select a story --</option>
                            ${storiesCache.map(story => `<option value="${story.id}">${story.title}</option>`).join('')}
                        </select>
                    </div>
                </fieldset>
                <div class="flex space-x-4">
                     <button type="submit" class="${buttonClass}" id="submit-btn">Save Story Banner</button>
                     <button type="button" id="cancel-btn" class="bg-gray-700 hover:bg-gray-600 p-2 px-4 rounded">Cancel</button>
                </div>
            </form>
        `;


        const notificationFormTemplate = () => `
            <h2 class="text-2xl font-bold mb-4">Send New Notification</h2>
            <form id="notification-form" class="space-y-4">
                <div><label class="${labelClass}">Title</label><input required id="title" class="${inputClass}" type="text"></div>
                <div><label class="${labelClass}">Message</label><textarea required id="message" class="${inputClass}" rows="4" placeholder="Enter the notification message for all users..."></textarea></div>
                <div class="flex space-x-4">
                     <button type="submit" class="${buttonClass}" id="submit-btn">Send Notification</button>
                </div>
            </form>
        `;
        
        const bannerFormTemplate = () => {
            const displayName = getDisplayName(currentView);
            return `
            <h2 class="text-2xl font-bold mb-4">${editId ? `Edit ${displayName}` : `Add New ${displayName}`}</h2>
            <form id="content-form" class="space-y-4">
                <div><label class="${labelClass}">Image URL</label><input required id="imageUrl" class="${inputClass}" type="url"></div>
                <div><label class="${labelClass}">Overlay Text</label><input id="overlayText" class="${inputClass}" type="text" placeholder="Text to display on the banner"></div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label class="${labelClass}">Direct Link URL</label><input id="directLinkUrl" class="${inputClass}" type="url" placeholder="https://example.com/promotion"></div>
                    <div class="flex items-end">
                        <label class="flex items-center gap-3 cursor-pointer">
                            <input id="isPromotion" type="checkbox" class="w-4 h-4">
                            <span class="text-sm text-slate-300">Mark as Promotion Ad</span>
                        </label>
                    </div>
                </div>
                <fieldset class="${fieldsetStyles}">
                    <legend class="${legendStyles}">Banner Link (Optional)</legend>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label for="linkType" class="${labelClass}">Link Type</label>
                            <select id="linkType" class="${inputClass}">
                                <option value="none">None</option>
                                <option value="movie">Movie</option>
                                <option value="series">Series</option>
                                <option value="adultContent">Wakubwa Tu</option>
                                <option value="connection">Connection</option>
                                <option value="xxx">XXX</option>
                            </select>
                        </div>
                    </div>
                    <div id="linkPickerControls" class="hidden grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                        <div class="md:col-span-2">
                            <label for="linkSearch" class="${labelClass}">Search</label>
                            <input id="linkSearch" class="${inputClass}" type="search" placeholder="Search content by title, year or genre">
                        </div>
                        <div>
                            <label for="linkSort" class="${labelClass}">Sort By</label>
                            <select id="linkSort" class="${inputClass}">
                                <option value="newest">Newest</option>
                                <option value="oldest">Oldest</option>
                                <option value="title-asc">Title A-Z</option>
                                <option value="title-desc">Title Z-A</option>
                                <option value="year-desc">Year High-Low</option>
                                <option value="year-asc">Year Low-High</option>
                            </select>
                        </div>
                    </div>
                    <div class="mt-4">
                        <label for="linkId" class="${labelClass}">Link To Content</label>
                        <select id="linkId" class="${inputClass}" disabled>
                            <option value="">Select a type first</option>
                        </select>
                    </div>
                </fieldset>
                <div class="flex space-x-4">
                     <button type="submit" class="${buttonClass}" id="submit-btn">Save Banner</button>
                     <button type="button" id="cancel-btn" class="bg-gray-700 hover:bg-gray-600 p-2 px-4 rounded">Cancel</button>
                </div>
            </form>
        `};

        const seriesBannerFormTemplate = () => `
            <h2 class="text-2xl font-bold mb-4">${editId ? 'Edit Series Banner' : 'Add New Series Banner'}</h2>
            <form id="content-form" class="space-y-4">
                <div><label class="${labelClass}">Image URL</label><input required id="imageUrl" class="${inputClass}" type="url"></div>
                <div><label class="${labelClass}">Overlay Text</label><input id="overlayText" class="${inputClass}" type="text" placeholder="Text to display on the banner"></div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label class="${labelClass}">Direct Link URL</label><input id="directLinkUrl" class="${inputClass}" type="url" placeholder="https://example.com/promotion"></div>
                    <div class="flex items-end">
                        <label class="flex items-center gap-3 cursor-pointer">
                            <input id="isPromotion" type="checkbox" class="w-4 h-4">
                            <span class="text-sm text-slate-300">Mark as Promotion Ad</span>
                        </label>
                    </div>
                </div>
                <fieldset class="${fieldsetStyles}">
                    <legend class="${legendStyles}">Link to a Series</legend>
                    <div id="linkPickerControls" class="hidden grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div class="md:col-span-2">
                            <label for="linkSearch" class="${labelClass}">Search</label>
                            <input id="linkSearch" class="${inputClass}" type="search" placeholder="Search series by title, year or genre">
                        </div>
                        <div>
                            <label for="linkSort" class="${labelClass}">Sort By</label>
                            <select id="linkSort" class="${inputClass}">
                                <option value="newest">Newest</option>
                                <option value="oldest">Oldest</option>
                                <option value="title-asc">Title A-Z</option>
                                <option value="title-desc">Title Z-A</option>
                                <option value="year-desc">Year High-Low</option>
                                <option value="year-asc">Year Low-High</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label for="linkId" class="${labelClass}">Link To Series</label>
                        <select id="linkId" class="${inputClass}">
                            <option value="">Select a series</option>
                        </select>
                    </div>
                </fieldset>
                <div class="flex space-x-4">
                     <button type="submit" class="${buttonClass}" id="submit-btn">Save Series Banner</button>
                     <button type="button" id="cancel-btn" class="bg-gray-700 hover:bg-gray-600 p-2 px-4 rounded">Cancel</button>
                </div>
            </form>
        `;

        const premiumFormTemplate = () => `
             <h2 class="text-2xl font-bold mb-4">Premium Settings</h2>
             <form id="premium-form" class="space-y-4 bg-gray-900 p-6 rounded-lg">
                <div class="flex items-center justify-between">
                    <div>
                        <label for="premium-toggle" class="font-semibold text-lg">Enable Global Premium System</label>
                        <p class="text-slate-400 text-sm">If enabled, ALL content (including Wakubwa Tu) will require a subscription.</p>
                    </div>
                    <div class="relative inline-block w-14 h-7 align-middle select-none">
                        <input type="checkbox" name="premium-toggle" id="premium-toggle" class="toggle-checkbox absolute block w-7 h-7 rounded-full bg-white border-4 border-gray-600 appearance-none cursor-pointer"/>
                        <label for="premium-toggle" class="toggle-label block overflow-hidden h-7 rounded-full bg-gray-600 cursor-pointer"></label>
                    </div>
                </div>
                <div class="pt-4"><button type="submit" class="${buttonClass}" id="submit-btn">Save Settings</button></div>
             </form>
        `;

        const userManagementFormTemplate = () => `
            <h2 class="text-2xl font-bold mb-4">Verify & Update User Premium Status</h2>
            <form id="user-premium-form" class="space-y-4 bg-gray-900 p-6 rounded-lg">
                <p class="text-slate-400 text-sm mb-4">Find a user by their ID and add premium days to their account. This grants access to ALL premium content.</p>
                <div class="rounded-lg border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-slate-300">
                    Referral system summary:
                    <div class="mt-2 text-slate-400">Each qualified invite earns 2 points. When a user reaches 60 points they unlock 1 day of free movie access.</div>
                </div>
                <div>
                    <label for="user-uid" class="${labelClass}">User ID</label>
                    <input id="user-uid" required class="${inputClass}" type="text" placeholder="Enter the user's unique ID to verify">
                </div>
                <div>
                    <label for="premium-days" class="${labelClass}">Premium Days to Add</label>
                    <input id="premium-days" required class="${inputClass}" type="number" min="1" placeholder="e.g., 30">
                </div>
                <p id="user-form-error" class="text-red-400 text-sm h-5"></p>
                <div class="pt-2">
                    <button type="submit" class="${buttonClass}" id="submit-btn">Grant Premium Access</button>
                </div>
            </form>
        `;
        
        const pagesFormTemplate = () => `
             <h2 class="text-2xl font-bold mb-4">Edit Static Pages</h2>
             <form id="pages-form" class="space-y-4">
                <div class="space-y-6">
                    <div><label class="${labelClass} text-lg">Disclaimer</label><textarea id="disclaimer" class="${inputClass}" rows="5" placeholder="Enter disclaimer content..."></textarea></div>
                    <div><label class="${labelClass} text-lg">Help</label><textarea id="help" class="${inputClass}" rows="5" placeholder="Enter help page content..."></textarea></div>
                    <div><label class="${labelClass} text-lg">Privacy Policy</label><textarea id="privacyPolicy" class="${inputClass}" rows="5" placeholder="Enter privacy policy..."></textarea></div>
                    <div><label class="${labelClass} text-lg">About Us</label><textarea id="aboutUs" class="${inputClass}" rows="5" placeholder="Enter about us content..."></textarea></div>
                </div>
                <div class="pt-4"><button type="submit" class="${buttonClass}" id="submit-btn">Save All Pages</button></div>
             </form>
        `;

        const socialLinksFormTemplate = () => `
            <h2 class="text-2xl font-bold mb-4">Manage Social & App Links</h2>
            <form id="social-links-form" class="space-y-6 bg-gray-900 p-6 rounded-lg">
                <fieldset class="${fieldsetStyles} border-none p-0">
                    <legend class="${legendStyles}">Social Media Profiles</legend>
                    <p class="text-slate-400 text-sm mb-4">Enter the full URLs for your social media profiles.</p>
                    <div class="space-y-4">
                        <div class="relative">
                            <i class="fab fa-whatsapp absolute left-3 top-1/2 -translate-y-1/2 text-green-500"></i>
                            <input id="whatsapp" class="${inputClass} pl-10" type="url" placeholder="WhatsApp Group/Community Link">
                        </div>
                        <div class="relative">
                            <i class="fab fa-facebook absolute left-3 top-1/2 -translate-y-1/2 text-blue-500"></i>
                            <input id="facebook" class="${inputClass} pl-10" type="url" placeholder="Facebook Profile URL">
                        </div>
                         <div class="relative">
                            <i class="fab fa-instagram absolute left-3 top-1/2 -translate-y-1/2 text-pink-500"></i>
                            <input id="instagram" class="${inputClass} pl-10" type="url" placeholder="Instagram Profile URL">
                        </div>
                         <div class="relative">
                            <i class="fab fa-tiktok absolute left-3 top-1/2 -translate-y-1/2 text-white"></i>
                            <input id="tiktok" class="${inputClass} pl-10" type="url" placeholder="TikTok Profile URL">
                        </div>
                    </div>
                </fieldset>

                <fieldset class="${fieldsetStyles} border-none p-0">
                    <legend class="${legendStyles}">Global App Share Link</legend>
                    <div class="relative">
                        <i class="fas fa-share-alt absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
                        <input id="appShareLink" class="${inputClass} pl-10" type="url" placeholder="Link used in the 'Share App' button">
                    </div>
                </fieldset>
                
                <div class="pt-4"><button type="submit" class="${buttonClass}" id="submit-btn">Save Links</button></div>
            </form>
        `;

        const renderForm = async () => {
            editId = null;
            formContainer.style.display = 'block';
            formContainer.innerHTML = '';
            listViewContainer.style.display = 'block';

            switch(currentView) {
                case 'movies':
                case 'adultContent':
                    formContainer.innerHTML = movieFormTemplate(); break;
                case 'series': formContainer.innerHTML = seriesFormTemplate(); break;
                 case 'connection':
                    formContainer.innerHTML = videoContentFormTemplate('Connection Content'); break;
                case 'xxx':
                    formContainer.innerHTML = videoContentFormTemplate('XXX Content'); break;
                case 'genres': formContainer.innerHTML = genreFormTemplate("Genre"); break;
                case 'djgenres': formContainer.innerHTML = genreFormTemplate("DJ Genre"); break;
                case 'stories': formContainer.innerHTML = storyFormTemplate(); break;
                case 'story-genres': formContainer.innerHTML = genreFormTemplate("Story Genre"); break;
                case 'story-banners':
                    formContainer.innerHTML = storyBannerFormTemplate();
                    updateBannerLinkOptions('story');
                    break;
                case 'notifications': formContainer.innerHTML = notificationFormTemplate(); break;
                case 'feedback': formContainer.style.display = 'none'; break;
                case 'push-notifications':
                    formContainer.innerHTML = pushNotificationFormTemplate();
                    listViewContainer.style.display = 'none';
                    break;
                case 'advertisements':
                    formContainer.innerHTML = advertisementFormTemplate();
                    listViewContainer.style.display = 'none';
                    await loadAdvertisementSettings();
                    break;
                case 'update-ad':
                    formContainer.innerHTML = updateAdFormTemplate();
                    listViewContainer.style.display = 'none';
                    await loadUpdateAdSettings();
                    break;
                case 'swa-media-ads':
                    formContainer.innerHTML = swaMediaAdsFormTemplate();
                    break;
                case 'banners': 
                case 'connection-banners':
                case 'xxx-banners':
                    formContainer.innerHTML = bannerFormTemplate(); 
                    break;
                case 'series-banners':
                    formContainer.innerHTML = seriesBannerFormTemplate();
                    updateSeriesBannerLinkOptions();
                    break;
                case 'users': 
                    formContainer.innerHTML = userManagementFormTemplate(); 
                    break;
                case 'premium':
                    formContainer.innerHTML = premiumFormTemplate();
                    listViewContainer.style.display = 'none';
                    await loadPremiumSettings();
                    break;
                case 'pages':
                    formContainer.innerHTML = pagesFormTemplate();
                    listViewContainer.style.display = 'none';
                    await loadPagesContent();
                    break;
                case 'social-links':
                    formContainer.innerHTML = socialLinksFormTemplate();
                    listViewContainer.style.display = 'none';
                    await loadSocialLinks();
                    break;
                default: 
                    formContainer.style.display = 'block';
            }
            addFormEventListeners();
        };

        const addFormEventListeners = () => {
            document.getElementById('content-form')?.addEventListener('submit', handleFormSubmit);
            document.getElementById('notification-form')?.addEventListener('submit', handleNotificationSubmit);
            document.getElementById('push-notification-form')?.addEventListener('submit', handlePushNotificationSubmit);
            document.getElementById('advertisement-form')?.addEventListener('submit', handleAdvertisementSave);
            document.getElementById('update-ad-form')?.addEventListener('submit', handleUpdateAdSave);
            document.getElementById('premium-form')?.addEventListener('submit', handlePremiumSave);
            document.getElementById('pages-form')?.addEventListener('submit', handlePagesSave);
            document.getElementById('social-links-form')?.addEventListener('submit', handleSocialLinksSave);
            document.getElementById('user-premium-form')?.addEventListener('submit', handleGrantPremium);
            document.getElementById('cancel-btn')?.addEventListener('click', () => { editId=null; renderForm(); });
            document.getElementById('add-part-btn')?.addEventListener('click', () => addMoviePart());
            document.getElementById('add-season-btn')?.addEventListener('click', () => addSeason());
            document.getElementById('add-chapter-btn')?.addEventListener('click', () => addChapter());
            document.getElementById('add-bando-plan-btn')?.addEventListener('click', () => addBandoPlan());

            const linkTypeSelect = document.getElementById('linkType');
            const linkIdSelect = document.getElementById('linkId');
            const linkPickerControls = document.getElementById('linkPickerControls');
            if (linkTypeSelect) {
                linkTypeSelect.addEventListener('change', (e) => {
                    if (linkPickerControls && e.target.value === 'none') {
                        linkPickerControls.classList.add('hidden');
                    }
                    updateBannerLinkOptions(e.target.value);
                });
            }

            const showLinkPickerControls = () => {
                if (linkPickerControls && !linkIdSelect?.disabled) {
                    linkPickerControls.classList.remove('hidden');
                }
            };

            linkIdSelect?.addEventListener('focus', showLinkPickerControls);
            linkIdSelect?.addEventListener('click', showLinkPickerControls);

            document.getElementById('linkSearch')?.addEventListener('input', () => {
                if (currentView === 'series-banners') {
                    updateSeriesBannerLinkOptions(document.getElementById('linkId')?.value || '');
                } else if (currentView === 'story-banners') {
                    updateBannerLinkOptions('story', document.getElementById('linkId')?.value || '');
                } else {
                    updateBannerLinkOptions(document.getElementById('linkType')?.value, document.getElementById('linkId')?.value || '');
                }
            });

            document.getElementById('linkSort')?.addEventListener('change', () => {
                if (currentView === 'series-banners') {
                    updateSeriesBannerLinkOptions(document.getElementById('linkId')?.value || '');
                } else if (currentView === 'story-banners') {
                    updateBannerLinkOptions('story', document.getElementById('linkId')?.value || '');
                } else {
                    updateBannerLinkOptions(document.getElementById('linkType')?.value, document.getElementById('linkId')?.value || '');
                }
            });

             document.querySelectorAll('input[name="adType"]')?.forEach(radio => {
                radio.addEventListener('change', (e) => {
                    document.getElementById('ad-type-image').classList.toggle('hidden', e.target.value !== 'image');
                    document.getElementById('ad-type-text').classList.toggle('hidden', e.target.value !== 'text');
                    e.target.parentElement.classList.add('border-red-500');
                    e.target.parentElement.classList.remove('border-transparent');
                    document.querySelectorAll('input[name="adType"]:not(:checked)').forEach(other => {
                        other.parentElement.classList.remove('border-red-500');
                        other.parentElement.classList.add('border-transparent');
                    });
                });
            });

            const adTypeSelect = document.getElementById('type');
            if (adTypeSelect && currentView === 'swa-media-ads') {
                adTypeSelect.addEventListener('change', e => {
                    const type = e.target.value;
                    document.getElementById('ad-content-image').classList.toggle('hidden', type !== 'image');
                    document.getElementById('ad-content-video').classList.toggle('hidden', type !== 'video');
                    document.getElementById('ad-content-movie-list').classList.toggle('hidden', type !== 'movie-list');
                    document.getElementById('ad-link-url-container').classList.toggle('hidden', type === 'movie-list');
                });
            }
        };

        const addMoviePart = (part = { title: '', watchUrl: '', downloadUrl: '' }) => {
            const container = document.getElementById('parts-container');
            const partId = `part-${Date.now()}`;
            const partEl = document.createElement('div');
            partEl.className = 'part-item bg-gray-800 p-3 rounded-lg space-y-2 dynamic-item';
            partEl.id = partId;
            partEl.innerHTML = `
                <div class="flex justify-between items-center">
                    <span class="font-semibold text-slate-300">New Part</span>
                    <button type="button" class="text-red-500 hover:text-red-400 remove-btn">&times;</button>
                </div>
                <input class="${inputClass} part-title" type="text" placeholder="Part Title (e.g., Part 1)" value="${part.title}">
                <input class="${inputClass} part-watchUrl" type="url" placeholder="Watch URL" value="${part.watchUrl}">
                <input class="${inputClass} part-downloadUrl" type="url" placeholder="Download URL" value="${part.downloadUrl}">
            `;
            partEl.querySelector('.remove-btn').addEventListener('click', () => partEl.remove());
            container.appendChild(partEl);
        };

        const addChapter = (chapter = { id: null, title: '', content: '' }) => {
            const container = document.getElementById('chapters-container');
            if (!container) return;
            const chapterId = chapter.id || `new-${Date.now()}`;
            const chapterEl = document.createElement('div');
            chapterEl.className = 'chapter-item bg-gray-800 p-3 rounded-lg space-y-2 dynamic-item';
            chapterEl.id = `chapter-${chapterId}`;
            chapterEl.dataset.chapterId = chapterId;
            chapterEl.innerHTML = `
                <div class="flex justify-between items-center">
                     <input class="${inputClass} chapter-title" type="text" placeholder="Chapter Title (e.g., Chapter 1)" value="${chapter.title}">
                    <button type="button" class="text-red-500 hover:text-red-400 remove-btn text-xl ml-4">&times;</button>
                </div>
                <textarea class="${inputClass} chapter-content" rows="6" placeholder="Enter story content for this chapter...">${chapter.content}</textarea>
            `;
            chapterEl.querySelector('.remove-btn').addEventListener('click', () => chapterEl.remove());
            container.appendChild(chapterEl);
        };

        const addEpisodePart = (partsContainer, part = { title: '', watchUrl: '', downloadUrl: '' }) => {
            const partEl = document.createElement('div');
            partEl.className = 'episode-part-item bg-gray-950 p-2 rounded-md space-y-2 mt-2 dynamic-item';
            partEl.innerHTML = `
                <div class="flex justify-between items-center">
                    <input class="${inputClass} part-title" type="text" placeholder="Part Title (e.g., Part A)" value="${part.title}">
                    <button type="button" class="text-red-500 hover:text-red-400 remove-btn text-lg ml-2">&times;</button>
                </div>
                <input class="${inputClass} part-watchUrl" type="url" placeholder="Part Watch URL" value="${part.watchUrl}">
                <input class="${inputClass} part-downloadUrl" type="url" placeholder="Part Download URL" value="${part.downloadUrl}">
            `;
            partEl.querySelector('.remove-btn').addEventListener('click', () => partEl.remove());
            partsContainer.appendChild(partEl);
        };

        const addBandoPlan = (plan = { gb: '', price: '' }) => {
            const container = document.getElementById('bando-plans-container');
            const planEl = document.createElement('div');
            planEl.className = 'bando-plan-item flex items-center gap-2 dynamic-item';
            planEl.innerHTML = `
                <input class="bando-gb ${inputClass}" type="number" placeholder="GB" value="${plan.gb}">
                <input class="bando-price ${inputClass}" type="number" placeholder="Price" value="${plan.price}">
                <button type="button" class="remove-plan-btn text-red-500 hover:text-red-400 flex-shrink-0 w-8 h-8 rounded bg-gray-800">&times;</button>
            `;
            planEl.querySelector('.remove-plan-btn').addEventListener('click', () => planEl.remove());
            container.appendChild(planEl);
        };

        const addEpisode = (seasonEl, episode = null) => {
            const container = seasonEl.querySelector('.episodes-container');
            const isNew = !episode;
            
            const episodeNumber = isNew 
                ? container.querySelectorAll('.episode-item').length + 1
                : (episode.episodeNumber || episode.number);
            
            const episodeTitle = isNew ? `Episode ${episodeNumber}` : (episode.title || `Episode ${episodeNumber}`);
            const watchUrl = episode?.watchUrl || '';
            const downloadUrl = episode?.downloadUrl || '';
            const parts = episode?.parts ? Object.values(episode.parts) : [];
            const isFinal = episode?.isFinal || false;

            const episodeId = `episode-${Date.now()}`;
            const episodeEl = document.createElement('div');
            episodeEl.className = 'episode-item bg-gray-900 p-3 rounded-lg space-y-2 dynamic-item ml-4';
            episodeEl.id = episodeId;

            episodeEl.innerHTML = `
                <div class="flex justify-between items-center">
                    <span class="font-semibold text-slate-300 episode-title-display">${episodeTitle}</span>
                    <div class="flex items-center space-x-4">
                        <label class="flex items-center space-x-2 text-sm cursor-pointer">
                            <input type="checkbox" class="form-checkbox text-red-500 bg-gray-700 border-gray-600 rounded episode-isFinal" ${isFinal ? 'checked' : ''}>
                            <span>Final</span>
                        </label>
                        <button type="button" class="text-red-500 hover:text-red-400 remove-btn">&times;</button>
                    </div>
                </div>
                
                <div class="single-link-container space-y-2 ${parts.length > 0 ? 'hidden' : ''}">
                    <input class="${inputClass} episode-watchUrl" type="url" placeholder="Watch URL (for single-part episode)" value="${watchUrl}">
                    <input class="${inputClass} episode-downloadUrl" type="url" placeholder="Download URL (for single-part episode)" value="${downloadUrl}">
                </div>

                <div class="parts-container mt-2 space-y-2"></div>
                
                <button type="button" class="${subButtonClass} add-part-btn text-xs mt-2">+ Add Part</button>
                
                <input type="hidden" class="episode-number-hidden" value="${episodeNumber}">
                <input type="hidden" class="episode-title-hidden" value="${episodeTitle}">
            `;
            
            const partsContainer = episodeEl.querySelector('.parts-container');
            const addPartBtn = episodeEl.querySelector('.add-part-btn');
            const singleLinkContainer = episodeEl.querySelector('.single-link-container');

            addPartBtn.addEventListener('click', () => {
                addEpisodePart(partsContainer);
                singleLinkContainer.classList.add('hidden');
                singleLinkContainer.querySelector('.episode-watchUrl').value = '';
                singleLinkContainer.querySelector('.episode-downloadUrl').value = '';
            });

            if (parts.length > 0) {
                parts.forEach(part => addEpisodePart(partsContainer, part));
            }
            
            episodeEl.querySelector('.remove-btn').addEventListener('click', () => {
                episodeEl.remove();
            });
            
            container.appendChild(episodeEl);
        };

        const addSeason = (season = { number: '', episodes: {} }) => {
            const container = document.getElementById('seasons-container');
            const seasonId = `season-${Date.now()}`;
            const seasonEl = document.createElement('div');
            seasonEl.className = 'season-item bg-gray-800 p-4 rounded-lg space-y-3 dynamic-item';
            seasonEl.id = seasonId;
            seasonEl.innerHTML = `
                <div class="flex justify-between items-center">
                    <input class="${inputClass} w-1/4 season-number" type="number" placeholder="Season #" value="${season.number}">
                    <button type="button" class="text-red-500 hover:text-red-400 remove-btn text-xl">&times;</button>
                </div>
                <div class="episodes-container border-t border-gray-700 pt-3 mt-3 space-y-2"></div>
                <button type="button" class="${subButtonClass} add-episode-btn">+ Add Episode</button>
            `;
            seasonEl.querySelector('.remove-btn').addEventListener('click', () => seasonEl.remove());
            seasonEl.querySelector('.add-episode-btn').addEventListener('click', () => addEpisode(seasonEl));
            container.appendChild(seasonEl);
            if (season.episodes && Object.keys(season.episodes).length > 0) {
                 Object.values(season.episodes).sort((a, b) => {
                    const numA = parseInt(a.episodeNumber || a.number, 10);
                    const numB = parseInt(b.episodeNumber || b.number, 10);
                    return (isNaN(numA) ? Infinity : numA) - (isNaN(numB) ? Infinity : numB);
                }).forEach(ep => addEpisode(seasonEl, ep));
            }
        };
        
        const handleAdvertisementSave = async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('submit-btn');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';

            try {
                const bandoPlans = [];
                document.querySelectorAll('.bando-plan-item').forEach(item => {
                    const gb = parseInt(item.querySelector('.bando-gb').value, 10);
                    const price = parseInt(item.querySelector('.bando-price').value, 10);
                    if (!isNaN(gb) && !isNaN(price)) {
                        bandoPlans.push({ gb, price });
                    }
                });

                const adData = {
                    isEnabled: document.getElementById('ad-enabled-toggle').checked,
                    type: document.querySelector('input[name="adType"]:checked').value,
                    imageUrl: document.getElementById('ad-imageUrl').value,
                    title: document.getElementById('ad-title').value,
                    message: document.getElementById('ad-message').value,
                    bandoSettings: {
                        logoName: document.getElementById('bando-logoName').value,
                        whatsappNumber: document.getElementById('bando-whatsappNumber').value,
                        messageTemplate: document.getElementById('bando-messageTemplate').value,
                        plans: bandoPlans
                    }
                };
                await set(ref(db, 'settings/advertisement'), adData);
                alert('Advertisement settings saved successfully!');
            } catch (error) {
                console.error('Error saving ad:', error);
                alert('An error occurred.');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Save All Ad Settings';
            }
        };

        const handleUpdateAdSave = async(e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('submit-btn');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';
            
            try {
                const adData = {
                    isEnabled: document.getElementById('update-ad-enabled').checked,
                    message: document.getElementById('update-ad-message').value,
                    downloadUrl: document.getElementById('update-ad-downloadUrl').value,
                    showCloseButton: document.getElementById('update-ad-showCloseButton').checked
                };
                await set(ref(db, 'settings/updateAd'), adData);
                alert('Update Ad settings saved successfully!');
            } catch (error) {
                console.error('Error saving update ad:', error);
                alert('An error occurred while saving update ad settings.');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Save Update Ad Settings';
            }
        };

        const handlePushNotificationSubmit = async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('submit-btn');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Sending...';

            const FCM_SERVER_KEY = "PASTE_YOUR_SERVER_KEY_HERE";
            if (FCM_SERVER_KEY === "PASTE_YOUR_SERVER_KEY_HERE") {
                alert("Error: Please set your FCM_SERVER_KEY in admin.html.");
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i>Send to All Users';
                return;
            }

            try {
                const tokensSnap = await get(ref(db, 'fcmTokens'));
                if (!tokensSnap.exists()) {
                    throw new Error("No users have enabled notifications.");
                }

                const allTokens = Object.keys(tokensSnap.val());
                if (allTokens.length === 0) {
                     throw new Error("No users have enabled notifications.");
                }

                const notificationPayload = {
                    notification: {
                        title: document.getElementById('fcm-title').value,
                        body: document.getElementById('fcm-message').value,
                        icon: document.getElementById('fcm-icon').value || window.location.origin + '/images/icon-192x192.png',
                        click_action: document.getElementById('fcm-click-action').value || window.location.origin
                    },
                    registration_ids: allTokens
                };
                
                const response = await fetch('https://fcm.googleapis.com/fcm/send', {
                    method: 'POST',
                    headers: {
                        'Authorization': `key=${FCM_SERVER_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(notificationPayload)
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`FCM Error: ${JSON.stringify(errorData)}`);
                }
                
                const responseData = await response.json();
                alert(`Notification sent successfully to ${responseData.success} devices! (${responseData.failure} failures)`);
                e.target.reset();

            } catch (error) {
                console.error('Error sending push notification:', error);
                alert(`An error occurred: ${error.message}`);
            } finally {
                 submitBtn.disabled = false;
                 submitBtn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i>Send to All Users';
            }
        };

        const handleNotificationSubmit = async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('submit-btn');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending...';

            const title = document.getElementById('title').value;
            const message = document.getElementById('message').value;

            if (!title || !message) {
                alert('Title and message cannot be empty.');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Send Notification';
                return;
            }
            try {
                await push(ref(db, 'notifications'), {
                    title,
                    message,
                    timestamp: Date.now(),
                    authorId: 'admin',
                    authorName: 'Admin'
                });
                alert('Notification sent successfully!');
                e.target.reset();
                await fetchInitialData();
            } catch (error) {
                console.error('Error sending notification:', error);
                alert('An error occurred while sending the notification.');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Send Notification';
            }
        };

        const handleFormSubmit = async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('submit-btn');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';
            
            const id = editId || push(ref(db, currentView)).key;
            let data = {};
            const titleInput = document.getElementById('title');
            const djInput = document.getElementById('dj');
            const duplicateMessage = getDuplicateContentMessage(
                currentView,
                editId,
                titleInput ? titleInput.value : '',
                djInput ? djInput.value : ''
            );

            if (duplicateMessage) {
                alert(duplicateMessage);
                submitBtn.disabled = false;
                submitBtn.textContent = `Save ${getDisplayName(currentView)}`;
                return;
            }
            
            try {
                switch(currentView) {
                    case 'movies':
                    case 'adultContent':
                        let existingMovieData = {};
                        if(editId) {
                           const cache = currentView === 'movies' ? moviesCache : adultContentCache;
                           existingMovieData = cache.find(item => item.id === editId) || {};
                        }
                        const parts = {};
                        document.querySelectorAll('.part-item').forEach((p, i) => {
                            parts[`part_${i+1}`] = {
                                title: p.querySelector('.part-title').value,
                                watchUrl: p.querySelector('.part-watchUrl').value,
                                downloadUrl: p.querySelector('.part-downloadUrl').value,
                            };
                        });
                        data = {
                            title: document.getElementById('title').value,
                            posterUrl: document.getElementById('posterUrl').value,
                            year: document.getElementById('year').value,
                            rating: document.getElementById('rating').value,
                            isPublished: document.getElementById('published-toggle').checked,
                            description: document.getElementById('description').value,
                            cast: document.getElementById('cast').value,
                            watchUrl: document.getElementById('watchUrl').value,
                            downloadUrl: document.getElementById('downloadUrl').value,
                            shareUrl: document.getElementById('shareUrl').value,
                            category: document.getElementById('category').value,
                            dj: document.getElementById('dj').value,
                            parts: parts,
                            isMovieOfTheWeek: document.getElementById('movie-of-the-week-toggle').checked,
                            type: currentView === 'movies' ? 'movie' : 'adult',
                            likes: existingMovieData.likes || 0,
                            dislikes: existingMovieData.dislikes || 0,
                            createdAt: existingMovieData.createdAt || Date.now()
                        };
                        break;
                    case 'series':
                        let existingSeriesData = {};
                        if (editId) {
                            existingSeriesData = seriesCache.find(item => item.id === editId) || {};
                        }
                        const seasons = {};
                        document.querySelectorAll('.season-item').forEach((s, i) => {
                            const seasonNum = s.querySelector('.season-number').value || (i + 1);
                            const episodes = {};
                            s.querySelectorAll('.episode-item').forEach((ep, j) => {
                                const episodeNumber = parseInt(ep.querySelector('.episode-number-hidden').value, 10);
                                let epData = {
                                    episodeNumber: episodeNumber,
                                    title: ep.querySelector('.episode-title-hidden').value,
                                    isFinal: ep.querySelector('.episode-isFinal').checked,
                                };

                                const partItems = ep.querySelectorAll('.episode-part-item');
                                if (partItems.length > 0) {
                                    const episodeParts = {};
                                    partItems.forEach((partEl, k) => {
                                        episodeParts[`part_${k+1}`] = {
                                            title: partEl.querySelector('.part-title').value,
                                            watchUrl: partEl.querySelector('.part-watchUrl').value,
                                            downloadUrl: partEl.querySelector('.part-downloadUrl').value
                                        };
                                    });
                                    epData.parts = episodeParts;
                                } else {
                                    epData.watchUrl = ep.querySelector('.episode-watchUrl').value;
                                    epData.downloadUrl = ep.querySelector('.episode-downloadUrl').value;
                                }

                                episodes[`ep_${episodeNumber}`] = epData;
                            });
                            seasons[`season_${seasonNum}`] = { number: seasonNum, episodes: episodes };
                        });
                         data = {
                            title: document.getElementById('title').value,
                            posterUrl: document.getElementById('posterUrl').value,
                            year: document.getElementById('year').value,
                            rating: document.getElementById('rating').value,
                            isPublished: document.getElementById('published-toggle').checked,
                            description: document.getElementById('description').value,
                            cast: document.getElementById('cast').value,
                            shareUrl: document.getElementById('shareUrl').value,
                            category: document.getElementById('category').value,
                            dj: document.getElementById('dj').value,
                            seasons: seasons,
                            isMovieOfTheWeek: document.getElementById('movie-of-the-week-toggle').checked,
                            type: 'series',
                            likes: existingSeriesData.likes || 0,
                            dislikes: existingSeriesData.dislikes || 0,
                            createdAt: existingSeriesData.createdAt || Date.now()
                        };
                        break;
                    case 'connection':
                    case 'xxx':
                         data = {
                            title: document.getElementById('title').value,
                            posterUrl: document.getElementById('posterUrl').value,
                            videoUrl: document.getElementById('videoUrl').value,
                            isPublished: document.getElementById('published-toggle').checked,
                            type: currentView,
                            createdAt: editId ? ( (currentView === 'connection' ? connectionContentCache : xxxContentCache).find(i => i.id === editId)?.createdAt || Date.now() ) : Date.now()
                        };
                        break;
                    case 'genres':
                        data = { name: document.getElementById('name').value };
                        await set(ref(db, `categories/${id}`), data);
                        break;
                    case 'djgenres':
                        data = { name: document.getElementById('name').value };
                        await set(ref(db, `djgenres/${id}`), data);
                        break;
                    case 'story-genres':
                        data = { name: document.getElementById('name').value };
                        await set(ref(db, `story-genres/${id}`), data);
                        break;
                    case 'stories':
                        const chapters = {};
                        document.querySelectorAll('.chapter-item').forEach(ch => {
                            const chapterId = ch.dataset.chapterId.startsWith('new-') ? push(ref(db, `stories/${id}/chapters`)).key : ch.dataset.chapterId;
                            chapters[chapterId] = {
                                title: ch.querySelector('.chapter-title').value,
                                content: ch.querySelector('.chapter-content').value
                            };
                        });
                        data = { 
                            title: document.getElementById('title').value,
                            posterUrl: document.getElementById('posterUrl').value,
                            genre: document.getElementById('genre').value,
                            timestamp: Date.now(),
                            chapters: chapters
                        };
                        break;
                    case 'swa-media-ads':
                        const selectedMovieIds = Array.from(document.getElementById('movieIds').selectedOptions).map(option => option.value);
                        data = {
                            title: document.getElementById('title').value,
                            type: document.getElementById('type').value,
                            isActive: document.getElementById('is-active-toggle').checked,
                            imageUrl: document.getElementById('imageUrl').value,
                            videoUrl: document.getElementById('videoUrl').value,
                            linkUrl: document.getElementById('linkUrl').value,
                            movieIds: selectedMovieIds,
                            timestamp: editId ? (await get(ref(db, `swaMediaAds/${editId}`))).val().timestamp || Date.now() : Date.now()
                        };
                        await set(ref(db, `swaMediaAds/${id}`), data);
                        break;
                    case 'banners':
                    case 'connection-banners':
                    case 'xxx-banners':
                    case 'series-banners':
                    case 'story-banners':
                        const dbPath = currentView.replace(/-/g,''); // e.g. series-banners -> seriesbanners
                        const existingBannerData = editId ? (await get(ref(db, `${dbPath}/${id}`))).val() || {} : {};
                        data = { 
                            imageUrl: document.getElementById('imageUrl').value,
                            overlayText: document.getElementById('overlayText').value,
                            linkType: document.getElementById('linkType')?.value || 'none',
                            linkId: document.getElementById('linkId').value,
                            directLinkUrl: document.getElementById('directLinkUrl')?.value || '',
                            isPromotion: document.getElementById('isPromotion')?.checked === true,
                            timestamp: existingBannerData.timestamp || Date.now()
                        };
                        if (currentView === 'story-banners') {
                            data.linkType = 'story'; // Hardcode for story banners
                        }
                        await set(ref(db, `${dbPath}/${id}`), data);
                        break;
                }
                
                if (!currentView.includes('banner') && currentView !== 'genres' && currentView !== 'story-genres' && currentView !== 'djgenres' && currentView !== 'swa-media-ads') {
                    await set(ref(db, `${currentView}/${id}`), data);
                }
            } catch (error) {
                console.error("Save error:", error);
                alert("An error occurred while saving.");
            } finally {
                editId = null;
                await fetchInitialData();
                renderForm();
            }
        };

        const handlePremiumSave = async(e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('submit-btn');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';
            
            const settings = {
                isActive: document.getElementById('premium-toggle').checked,
            };
            
            try {
                await set(ref(db, 'settings/premium'), settings);
                alert('Premium settings saved successfully!');
            } catch(err) {
                console.error("Failed to save premium settings:", err);
                alert('An error occurred.');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Save Settings';
            }
        };

        const handlePagesSave = async(e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('submit-btn');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';
             const pagesData = {
                disclaimer: document.getElementById('disclaimer').value,
                help: document.getElementById('help').value,
                privacyPolicy: document.getElementById('privacyPolicy').value,
                aboutUs: document.getElementById('aboutUs').value
             };
              try {
                await set(ref(db, 'pages'), pagesData);
                alert('Pages content saved successfully!');
            } catch(err) {
                console.error("Failed to save pages:", err);
                alert('An error occurred.');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Save All Pages';
            }
        };

        const handleSocialLinksSave = async(e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('submit-btn');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';
            const linksData = {
                whatsapp: document.getElementById('whatsapp').value,
                facebook: document.getElementById('facebook').value,
                instagram: document.getElementById('instagram').value,
                tiktok: document.getElementById('tiktok').value,
                appShareLink: document.getElementById('appShareLink').value,
            };
             try {
                await set(ref(db, 'settings/socialLinks'), linksData);
                alert('Social links saved successfully!');
            } catch(err) {
                console.error("Failed to save social links:", err);
                alert('An error occurred.');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Save Links';
            }
        };

        const handleGrantPremium = async(e) => {
             e.preventDefault();
             const submitBtn = document.getElementById('submit-btn');
             const errorEl = document.getElementById('user-form-error');
             submitBtn.disabled = true;
             submitBtn.textContent = 'Processing...';
             errorEl.textContent = '';

             const userId = document.getElementById('user-uid').value.trim();
             const daysToAdd = parseInt(document.getElementById('premium-days').value, 10);

             if (!userId || isNaN(daysToAdd) || daysToAdd <= 0) {
                 errorEl.textContent = 'Please enter a valid User ID and number of days.';
                 submitBtn.disabled = false;
                 submitBtn.textContent = 'Grant Premium Access';
                 return;
             }

             try {
                const userRef = ref(db, `users/${userId}`);
                const userSnap = await get(userRef);

                if (!userSnap.exists()) {
                    throw new Error('User not found. Please check the ID.');
                }
                
                const userData = userSnap.val();
                const now = Date.now();
                const currentExpiry = (userData.premiumExpiry && userData.premiumExpiry > now) ? userData.premiumExpiry : now;
                const newExpiry = currentExpiry + (daysToAdd * 24 * 60 * 60 * 1000);

                await update(userRef, { premiumExpiry: newExpiry });

                alert(`Success! User ${userId} has been granted ${daysToAdd} days of premium. New expiry is on ${new Date(newExpiry).toLocaleDateString()}.`);
                e.target.reset();
                renderList('users'); // Re-render the user list to show updated status

             } catch(err) {
                console.error("Error granting premium:", err);
                errorEl.textContent = err.message;
             } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Grant Premium Access';
             }
        };
        
        const renderListItems = (items, view) => {
            listContainer.innerHTML = '';
            listTitle.textContent = `${getDisplayName(view) || view.charAt(0).toUpperCase() + view.slice(1)} List`;
            const isGenreView = ['genres', 'djgenres', 'story-genres'].includes(view);

            items.sort((a, b) => {
                if (isGenreView) {
                    return String(a.name || a.title || '').localeCompare(String(b.name || b.title || ''));
                }
                return (b.createdAt || b.timestamp || 0) - (a.createdAt || a.timestamp || 0);
            });

            if (items.length === 0) {
                listContainer.innerHTML = `<p class="text-slate-500 text-center">No items found for ${getDisplayName(view)}.</p>`;
                return;
            }
            items.forEach((item, index) => {
                const itemEl = document.createElement('div');
                itemEl.className = isGenreView
                    ? 'bg-gray-800 p-3 rounded-lg flex justify-between items-center gap-4'
                    : 'bg-gray-800 p-3 rounded-lg flex justify-between gap-4';
                itemEl.innerHTML = renderListItem(item, view, index);
                listContainer.appendChild(itemEl);
            });
        };

        const renderListItem = (item, view, index = 0) => {
            let title = item.title || item.name || `Notification`;
            
            switch(view) {
                case 'movies':
                case 'series':
                case 'adultContent':
                case 'connection':
                case 'xxx':
                case 'stories':
                    const subtext = `<span class="text-xs ${item.isPublished === false ? 'text-yellow-400' : 'text-green-400'} border ${item.isPublished === false ? 'border-yellow-400' : 'border-green-400'} rounded-full px-2 py-0.5">${item.isPublished === false ? 'Unpublished' : 'Published'}</span>`;
                    const createdDate = new Date(item.createdAt || item.timestamp || 0).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                    return `
                        <div class="flex items-start gap-4 w-full">
                            <img src="${item.posterUrl}" class="w-16 h-24 object-cover rounded flex-shrink-0 bg-gray-700" onerror="this.style.display='none'">
                            <div class="flex-1 min-w-0">
                                <p class="font-bold text-lg text-slate-100 truncate" title="${title}">${title}</p>
                                <div class="text-sm text-slate-400 mt-1 flex items-center gap-x-4 gap-y-1 flex-wrap">
                                    ${createdDate !== '01 Jan 1970' ? `<span><i class="fas fa-calendar-alt w-4 mr-1 text-slate-500"></i>${createdDate}</span>` : ''}
                                    ${item.category ? `<span><i class="fas fa-tag w-4 mr-1 text-slate-500"></i>${item.category}</span>` : ''}
                                    ${item.dj ? `<span><i class="fas fa-headphones w-4 mr-1 text-slate-500"></i>${item.dj}</span>` : ''}
                                </div>
                                <div class="mt-2">${item.isPublished !== undefined ? subtext : ''}</div>
                            </div>
                            <div class="flex flex-col space-y-2 flex-shrink-0">
                                <button data-id="${item.id}" class="edit-btn ${subButtonClass} w-full px-4">Edit</button>
                                <button data-id="${item.id}" class="delete-btn ${subButtonClass} bg-red-800/80 hover:bg-red-700 w-full px-4">Delete</button>
                            </div>
                        </div>
                    `;
                case 'users':
                    const createdDateUser = item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
                    const now = Date.now();
                    const isPremium = item.premiumExpiry && item.premiumExpiry > now;
                    const hasRewardAccess = item.rewardAccessExpiry && item.rewardAccessExpiry > now;
                    const rewardExpiryText = hasRewardAccess ? new Date(item.rewardAccessExpiry).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Inactive';
                    let premiumStatus = '';
                    if (isPremium) {
                        const expiryDate = new Date(item.premiumExpiry).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                        const remainingDays = Math.ceil((item.premiumExpiry - now) / (1000 * 60 * 60 * 24));
                        premiumStatus = `<div class="text-sm text-green-400 font-semibold">
                                            <i class="fas fa-gem mr-2"></i>Premium | Expires: ${expiryDate} (${remainingDays} days left)
                                         </div>`;
                    } else {
                        premiumStatus = `<div class="text-sm text-slate-500">
                                            <i class="far fa-gem mr-2"></i>Not Premium
                                         </div>`;
                    }
                    return `
                        <div class="flex items-center gap-4 w-full">
                            <div class="bg-gray-700 w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0">
                                <i class="fas fa-user text-xl text-slate-400"></i>
                            </div>
                            <div class="flex-1 min-w-0">
                                <p class="font-semibold text-slate-100 truncate" title="${item.uid}">${item.uid}</p>
                                <p class="text-xs text-slate-400 mt-1">Joined: ${createdDateUser}</p>
                                <div class="mt-1">${premiumStatus}</div>
                                <div class="mt-2 text-xs text-slate-400 space-y-1">
                                    <p>Referral code: <span class="text-slate-200 font-mono">${item.referralCode || 'N/A'}</span></p>
                                    <p>Invited by: <span class="text-slate-200 font-mono">${item.invitedBy || 'Direct signup'}</span></p>
                                    <p>Points: <span class="text-pink-400 font-semibold">${Number(item.rewardPoints || 0)}</span> | Qualified invites: <span class="text-blue-400 font-semibold">${Number(item.successfulReferralPurchases || 0)}</span></p>
                                    <p>Reward access: <span class="${hasRewardAccess ? 'text-green-400' : 'text-slate-500'}">${rewardExpiryText}</span></p>
                                </div>
                            </div>
                            <div class="flex flex-col space-y-2 flex-shrink-0">
                                <button data-id="${item.id}" class="edit-btn ${subButtonClass} w-full px-4">Manage</button>
                            </div>
                        </div>
                    `;
                case 'feedback':
                    const date = new Date(item.timestamp).toLocaleString();
                    return `
                        <div class="w-full">
                            <p class="text-slate-300 whitespace-pre-wrap">${item.comment}</p>
                            <div class="text-xs text-slate-500 mt-3 pt-3 border-t border-gray-700 flex justify-between items-center">
                                <span>From: <strong>${item.user || item.userId}</strong></span>
                                <span>${date}</span>
                            </div>
                        </div>
                        <div class="flex-shrink-0">
                             <button data-id="${item.id}" class="delete-btn ${subButtonClass} bg-red-800/80 hover:bg-red-700">Delete</button>
                        </div>
                    `;
                case 'notifications':
                    const notification = normalizeNotificationItem(item);
                    const notificationDate = new Date(notification.timestamp || Date.now()).toLocaleString();
                    const repliesHtml = notification.replies.length > 0 ? notification.replies.map(reply => `
                        <div class="bg-gray-900 rounded-lg p-3 border border-gray-700">
                            <div class="flex items-start justify-between gap-3">
                                <div class="min-w-0">
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <span class="text-sm font-semibold text-blue-300">${escapeHtml(reply.authorName || 'User')}</span>
                                        <span class="text-xs text-slate-500">${timeSince(reply.time || Date.now())}</span>
                                        ${reply.replyToName ? `<span class="text-xs text-slate-500">reply to ${escapeHtml(reply.replyToName)}</span>` : ''}
                                    </div>
                                    <p class="text-sm text-slate-200 mt-2 whitespace-pre-wrap">${escapeHtml(reply.text || '')}</p>
                                </div>
                                <div class="flex flex-col gap-2 flex-shrink-0">
                                    <button data-notification-id="${notification.id}" data-reply-id="${reply.id}" class="notification-reply-btn ${subButtonClass}">Reply</button>
                                    <button data-notification-id="${notification.id}" data-reply-id="${reply.id}" class="notification-delete-reply-btn ${subButtonClass} bg-red-800/80 hover:bg-red-700">Delete</button>
                                    <button data-actor-id="${reply.authorId || ''}" class="notification-block-user-btn ${subButtonClass} bg-yellow-700 hover:bg-yellow-600 ${!reply.authorId || reply.authorId === 'admin' ? 'opacity-50 pointer-events-none' : ''}">${getBlockButtonLabel(reply.authorId)}</button>
                                </div>
                            </div>
                        </div>
                    `).join('') : `<p class="text-sm text-slate-500">No replies yet.</p>`;

                    return `
                        <div class="w-full space-y-4">
                            <div class="flex items-start justify-between gap-4">
                                <div class="min-w-0">
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <p class="font-bold text-lg text-slate-100">${escapeHtml(notification.title || 'Notification')}</p>
                                        <span class="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300">${escapeHtml(notification.authorName)}</span>
                                    </div>
                                    <p class="text-slate-300 mt-2 whitespace-pre-wrap">${escapeHtml(notification.message || '')}</p>
                                    <div class="text-xs text-slate-500 mt-3 flex flex-wrap gap-4">
                                        <span>${notificationDate}</span>
                                        <span>${notification.replies.length} repl${notification.replies.length === 1 ? 'y' : 'ies'}</span>
                                        <span>${getReactionSummary(notification.reactions)}</span>
                                    </div>
                                </div>
                                <div class="flex flex-col gap-2 flex-shrink-0">
                                    <button data-notification-id="${notification.id}" class="notification-reply-btn ${subButtonClass}">Reply</button>
                                    <button data-id="${notification.id}" class="delete-btn ${subButtonClass} bg-red-800/80 hover:bg-red-700">Delete</button>
                                    <button data-actor-id="${notification.authorId || ''}" class="notification-block-user-btn ${subButtonClass} bg-yellow-700 hover:bg-yellow-600 ${notification.authorId === 'admin' ? 'opacity-50 pointer-events-none' : ''}">${getBlockButtonLabel(notification.authorId)}</button>
                                </div>
                            </div>
                            <div class="space-y-3">
                                <h4 class="text-sm font-semibold text-slate-300">Replies</h4>
                                ${repliesHtml}
                            </div>
                        </div>
                    `;
                default: // Fallback for genres, banners, etc.
                    if (['genres', 'djgenres', 'story-genres'].includes(view)) {
                        return `
                            <div class="flex items-center gap-4 flex-1 min-w-0">
                                <span class="inline-flex items-center justify-center min-w-10 h-10 px-3 rounded-lg bg-red-600/15 border border-red-500/30 text-red-300 font-bold text-sm">
                                    ${index + 1}
                                </span>
                                <div class="min-w-0">
                                    <p class="font-semibold text-slate-100 truncate">${item.name || item.title || 'Item'}</p>
                                    <p class="text-xs text-slate-400 mt-1">Label ${index + 1}</p>
                                </div>
                            </div>
                            <div class="flex space-x-2 flex-shrink-0">
                                <button data-id="${item.id}" class="edit-btn ${subButtonClass}">Edit</button>
                                <button data-id="${item.id}" class="delete-btn ${subButtonClass} bg-red-800/80 hover:bg-red-700">Delete</button>
                            </div>
                        `;
                    }

                     return `
                        <div class="flex items-center gap-4 truncate flex-1">
                            ${item.imageUrl ? `<img src="${item.imageUrl}" class="w-10 h-10 object-cover rounded flex-shrink-0 bg-gray-700">` : ''}
                            <div class="truncate">
                                <p class="font-semibold truncate">${item.name || item.title || 'Item'}</p>
                                ${(item.overlayText || item.directLinkUrl || item.isPromotion) ? `<p class="text-xs text-slate-400 truncate mt-1">${item.overlayText || item.directLinkUrl || ''}</p>` : ''}
                                ${item.isPromotion ? `<span class="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-300 border border-yellow-500/20">ADS</span>` : ''}
                            </div>
                        </div>
                        <div class="flex space-x-2 flex-shrink-0">
                            <button data-id="${item.id}" class="edit-btn ${subButtonClass}">Edit</button>
                            <button data-id="${item.id}" class="delete-btn ${subButtonClass} bg-red-800/80 hover:bg-red-700">Delete</button>
                        </div>
                    `;
            }
        };
        
        const renderList = async (view) => {
            listContainer.innerHTML = '<div class="text-center text-slate-400">Loading...</div>';
            document.getElementById('user-stats-container').innerHTML = ''; // Clear stats on every render
            renderBulkActions(view);
            try {
                switch(view) {
                    case 'movies': renderListItems(getFilteredAdminItems(moviesCache, view), view); break;
                    case 'series': renderListItems(getFilteredAdminItems(seriesCache, view), view); break;
                    case 'adultContent': renderListItems(adultContentCache, view); break;
                    case 'connection': renderListItems(connectionContentCache, view); break;
                    case 'xxx': renderListItems(xxxContentCache, view); break;
                    case 'stories': renderListItems(storiesCache, view); break;
                    case 'genres': renderListItems(await fetchDataAsArray('categories'), view); break;
                    case 'djgenres': renderListItems(await fetchDataAsArray('djgenres'), view); break;
                    case 'story-genres': renderListItems(await fetchDataAsArray('story-genres'), view); break;
                    case 'notifications': renderListItems(await fetchDataAsArray('notifications'), view); break;
                    case 'feedback': renderListItems(await fetchDataAsArray('feedback'), view); break;
                    case 'swa-media-ads': renderListItems(await fetchDataAsArray('swaMediaAds'), view); break;
                    case 'banners': 
                    case 'series-banners': 
                    case 'story-banners':
                    case 'connection-banners':
                    case 'xxx-banners':
                        renderListItems(await fetchDataAsArray(view.replace(/-/g,'')), view); break;
                    case 'users':
                        const users = await fetchDataAsArray('users');
                        const now = Date.now();
                        const premiumUsers = users.filter(u => u.premiumExpiry && u.premiumExpiry > now).length;
                        const nonPremiumUsers = users.length - premiumUsers;

                        const statsContainer = document.getElementById('user-stats-container');
                        statsContainer.innerHTML = `
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div class="bg-gray-800 p-4 rounded-lg text-center">
                                    <p class="text-sm text-slate-400">Total Users</p>
                                    <p class="text-2xl font-bold">${users.length}</p>
                                </div>
                                <div class="bg-gray-800 p-4 rounded-lg text-center">
                                    <p class="text-sm text-green-400">Paid Users</p>
                                    <p class="text-2xl font-bold text-green-400">${premiumUsers}</p>
                                </div>
                                <div class="bg-gray-800 p-4 rounded-lg text-center">
                                    <p class="text-sm text-yellow-400">Unpaid Users</p>
                                    <p class="text-2xl font-bold text-yellow-400">${nonPremiumUsers}</p>
                                </div>
                            </div>
                        `;
                        renderListItems(users, view);
                        break;
                    default: listContainer.innerHTML = '<p class="text-center text-slate-500">Select a category to view items.</p>';
                }
            } catch(error) {
                console.error(`Error rendering list for ${view}:`, error);
                listContainer.innerHTML = '<p class="text-center text-red-500">Failed to load items.</p>';
            }
        };

        const handleSwitchView = (e) => {
            const newView = e.target.dataset.view;
            if (newView === currentView) return;
            
            document.querySelector('.admin-nav-item.bg-gray-800').classList.remove('bg-gray-800');
            e.target.classList.add('bg-gray-800');
            currentView = newView;
            document.getElementById('admin-search-bar').value = '';
            document.getElementById('admin-search-bar').placeholder = `Search in ${getDisplayName(newView) || newView}...`;
            renderForm();
            renderList(currentView);
        };

        const handleDelete = async (e) => {
            const id = e.target.dataset.id;
            if (!id) return;
            let dbPath = currentView;
            
            const bannerViews = ['banners', 'series-banners', 'story-banners', 'connection-banners', 'xxx-banners'];
            if (bannerViews.includes(currentView)) {
                dbPath = currentView.replace(/-/g, '');
            } else if (currentView === 'genres') {
                dbPath = 'categories';
            } else if (currentView === 'story-genres') {
                dbPath = 'story-genres';
            } else if (currentView === 'djgenres') {
                 dbPath = 'djgenres';
            } else if (currentView === 'swa-media-ads') {
                 dbPath = 'swaMediaAds';
            }

            if (confirm(`Are you sure you want to delete this ${getDisplayName(currentView)}? This cannot be undone.`)) {
                try {
                    await remove(ref(db, `${dbPath}/${id}`));
                    alert('Item deleted successfully.');
                    await fetchInitialData();
                    renderList(currentView);
                } catch (error) {
                    console.error('Delete error:', error);
                    alert('Failed to delete item.');
                }
            }
        };

        const handleEdit = async (e) => {
            const id = e.target.dataset.id;
            editId = id;
            
            if (currentView === 'users') {
                document.getElementById('user-uid').value = id;
                document.getElementById('user-uid').focus();
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return; 
            }

            let data;
            const bannerViews = ['banners', 'series-banners', 'story-banners', 'connection-banners', 'xxx-banners'];
            if (bannerViews.includes(currentView)) {
                const dbPath = currentView.replace(/-/g, '');
                data = (await get(ref(db, `${dbPath}/${id}`))).val();
                formContainer.innerHTML = currentView === 'series-banners' ? seriesBannerFormTemplate() : bannerFormTemplate();
                addFormEventListeners();
                document.getElementById('imageUrl').value = data.imageUrl || '';
                document.getElementById('overlayText').value = data.overlayText || '';
                if(document.getElementById('directLinkUrl')) document.getElementById('directLinkUrl').value = data.directLinkUrl || '';
                if(document.getElementById('isPromotion')) document.getElementById('isPromotion').checked = data.isPromotion === true;
                if(document.getElementById('linkType')) {
                    document.getElementById('linkType').value = data.linkType || 'none';
                    await updateBannerLinkOptions(data.linkType, data.linkId);
                }
                if (currentView === 'series-banners') {
                    await updateSeriesBannerLinkOptions(data.linkId);
                } else if (currentView === 'story-banners') {
                    await updateBannerLinkOptions('story', data.linkId);
                }
            } else if(currentView === 'genres' || currentView === 'djgenres' || currentView === 'story-genres') {
                const dbPath = currentView === 'genres' ? 'categories' : currentView === 'djgenres' ? 'djgenres' : 'story-genres';
                data = (await get(ref(db, `${dbPath}/${id}`))).val();
                formContainer.innerHTML = genreFormTemplate(getDisplayName(currentView));
                addFormEventListeners();
                document.getElementById('name').value = data.name || '';
            } else if(currentView === 'stories') {
                data = (await get(ref(db, `stories/${id}`))).val();
                formContainer.innerHTML = storyFormTemplate();
                addFormEventListeners();
                document.getElementById('title').value = data.title || '';
                document.getElementById('posterUrl').value = data.posterUrl || '';
                document.getElementById('genre').value = data.genre || '';
                if(data.chapters) {
                    Object.keys(data.chapters).forEach(key => addChapter({ id: key, ...data.chapters[key] }));
                }
            } else if (currentView === 'swa-media-ads') {
                data = (await get(ref(db, `swaMediaAds/${id}`))).val();
                formContainer.innerHTML = swaMediaAdsFormTemplate();
                addFormEventListeners();
                document.getElementById('title').value = data.title || '';
                const typeSelect = document.getElementById('type');
                typeSelect.value = data.type || 'image';
                typeSelect.dispatchEvent(new Event('change')); // Trigger change to show/hide sections
                document.getElementById('is-active-toggle').checked = data.isActive === true;
                document.getElementById('imageUrl').value = data.imageUrl || '';
                document.getElementById('videoUrl').value = data.videoUrl || '';
                document.getElementById('linkUrl').value = data.linkUrl || '';
                if (data.movieIds && Array.isArray(data.movieIds)) {
                     const movieIdsSelect = document.getElementById('movieIds');
                     data.movieIds.forEach(movieId => {
                        const option = movieIdsSelect.querySelector(`option[value="${movieId}"]`);
                        if(option) option.selected = true;
                    });
                }
            } else { // movies, series, etc.
                 data = (await get(ref(db, `${currentView}/${id}`))).val();
                 switch(currentView) {
                    case 'movies':
                    case 'adultContent':
                        formContainer.innerHTML = movieFormTemplate();
                        addFormEventListeners();
                        if (data.parts) Object.values(data.parts).forEach(p => addMoviePart(p));
                        break;
                    case 'series':
                        formContainer.innerHTML = seriesFormTemplate();
                        addFormEventListeners();
                         if (data.seasons) {
                             Object.values(data.seasons).sort((a,b) => (a.number || 0) - (b.number || 0)).forEach(s => addSeason(s));
                         }
                        break;
                    case 'connection':
                    case 'xxx':
                        formContainer.innerHTML = videoContentFormTemplate(getDisplayName(currentView));
                        addFormEventListeners();
                        document.getElementById('videoUrl').value = data.videoUrl || '';
                        break;
                 }
                document.getElementById('title').value = data.title || '';
                document.getElementById('posterUrl').value = data.posterUrl || '';
                if(document.getElementById('year')) document.getElementById('year').value = data.year || '';
                if(document.getElementById('rating')) document.getElementById('rating').value = data.rating || '';
                if(document.getElementById('description')) document.getElementById('description').value = data.description || '';
                if(document.getElementById('cast')) document.getElementById('cast').value = data.cast || '';
                if(document.getElementById('watchUrl')) document.getElementById('watchUrl').value = data.watchUrl || '';
                if(document.getElementById('downloadUrl')) document.getElementById('downloadUrl').value = data.downloadUrl || '';
                if(document.getElementById('shareUrl')) document.getElementById('shareUrl').value = data.shareUrl || '';
                if(document.getElementById('category')) document.getElementById('category').value = data.category || '';
                if(document.getElementById('dj')) document.getElementById('dj').value = data.dj || '';
                if(document.getElementById('published-toggle')) document.getElementById('published-toggle').checked = data.isPublished !== false;
                if(document.getElementById('movie-of-the-week-toggle')) document.getElementById('movie-of-the-week-toggle').checked = data.isMovieOfTheWeek === true;
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };
        
        const fetchDataAsArray = async (path) => {
            const snapshot = await get(ref(db, path));
            if (!snapshot.exists()) return [];
            return Object.entries(snapshot.val()).map(([id, value]) => ({ id, ...value }));
        };
        
        const fetchInitialData = async () => {
             try {
                const [
                    categoriesData, djGenresData, storyGenresData, moviesData, seriesData, storiesData, 
                    adultData, connectionData, xxxData, usersData
                ] = await Promise.all([
                    fetchDataAsArray('categories'),
                    fetchDataAsArray('djgenres'),
                    fetchDataAsArray('story-genres'),
                    fetchDataAsArray('movies'),
                    fetchDataAsArray('series'),
                    fetchDataAsArray('stories'),
                    fetchDataAsArray('adultContent'),
                    fetchDataAsArray('connection'),
                    fetchDataAsArray('xxx'),
                    fetchDataAsArray('users'),
                ]);
                categoriesCache = categoriesData;
                djGenresCache = djGenresData;
                storyGenresCache = storyGenresData;
                moviesCache = moviesData;
                seriesCache = seriesData;
                storiesCache = storiesData;
                adultContentCache = adultData;
                connectionContentCache = connectionData;
                xxxContentCache = xxxData;
                usersCache = usersData;
                
                renderList(currentView);
            } catch (error) {
                console.error("Error fetching initial data:", error);
                listContainer.innerHTML = '<p class="text-center text-red-500">Could not load initial data.</p>';
            }
        };

        const loadAdvertisementSettings = async () => {
            const snapshot = await get(ref(db, 'settings/advertisement'));
            if (snapshot.exists()) {
                const data = snapshot.val();
                document.getElementById('ad-enabled-toggle').checked = data.isEnabled;
                document.querySelector(`input[name="adType"][value="${data.type || 'image'}"]`).checked = true;
                document.querySelector(`input[name="adType"][value="${data.type || 'image'}"]`).dispatchEvent(new Event('change'));

                document.getElementById('ad-imageUrl').value = data.imageUrl || '';
                document.getElementById('ad-title').value = data.title || '';
                document.getElementById('ad-message').value = data.message || '';
                
                if (data.bandoSettings) {
                    document.getElementById('bando-logoName').value = data.bandoSettings.logoName || '';
                    document.getElementById('bando-whatsappNumber').value = data.bandoSettings.whatsappNumber || '';
                    document.getElementById('bando-messageTemplate').value = data.bandoSettings.messageTemplate || '';
                    if (data.bandoSettings.plans) {
                        data.bandoSettings.plans.forEach(plan => addBandoPlan(plan));
                    }
                 }
            }
        };

        const handleNotificationReply = async (notificationId, replyId = '') => {
            const message = window.prompt('Write your admin reply:');
            if (!message || !message.trim()) return;

            try {
                const notificationSnap = await get(ref(db, `notifications/${notificationId}`));
                const notificationData = notificationSnap.exists() ? normalizeNotificationItem({ id: notificationId, ...notificationSnap.val() }) : null;
                const targetReply = replyId ? notificationData?.replies?.find(entry => entry.id === replyId) : null;
                const replyRef = push(ref(db, `notifications/${notificationId}/replies`));
                await set(replyRef, {
                    text: message.trim(),
                    time: Date.now(),
                    authorId: 'admin',
                    authorName: 'Admin',
                    replyToId: replyId || null,
                    replyToName: targetReply?.authorName || notificationData?.authorName || 'Admin'
                });
                alert('Reply posted successfully.');
                renderList(currentView);
            } catch (error) {
                console.error('Reply error:', error);
                alert('Failed to post reply.');
            }
        };

        const handleDeleteNotificationReply = async (notificationId, replyId) => {
            if (!notificationId || !replyId) return;
            if (!confirm('Delete this reply?')) return;

            try {
                await remove(ref(db, `notifications/${notificationId}/replies/${replyId}`));
                alert('Reply deleted successfully.');
                renderList(currentView);
            } catch (error) {
                console.error('Delete reply error:', error);
                alert('Failed to delete reply.');
            }
        };

        const handleBlockActor = async (actorId) => {
            if (!actorId || actorId === 'admin') return;
            if (!confirm(`Block user ${actorId}? They will no longer be able to comment or reply.`)) return;

            try {
                await set(ref(db, `blockedActors/${actorId}`), {
                    isBlocked: true,
                    blockedAt: Date.now(),
                    blockedBy: 'admin',
                    reason: 'Blocked from admin notification moderation'
                });

                const matchedUser = usersCache.find(user => user.id === actorId || user.uid === actorId);
                if (matchedUser?.id) {
                    await update(ref(db, `users/${matchedUser.id}`), {
                        isBlocked: true,
                        blocked: true
                    });
                }

                alert('User blocked successfully.');
                usersCache = await fetchDataAsArray('users');
                renderList(currentView);
            } catch (error) {
                console.error('Block user error:', error);
                alert('Failed to block user.');
            }
        };

        const loadUpdateAdSettings = async () => {
             const snapshot = await get(ref(db, 'settings/updateAd'));
            if (snapshot.exists()) {
                const data = snapshot.val();
                document.getElementById('update-ad-enabled').checked = data.isEnabled;
                document.getElementById('update-ad-message').value = data.message || '';
                document.getElementById('update-ad-downloadUrl').value = data.downloadUrl || '';
                document.getElementById('update-ad-showCloseButton').checked = data.showCloseButton !== false;
            }
        }
        
        const loadPremiumSettings = async () => {
            const snapshot = await get(ref(db, 'settings/premium'));
            if(snapshot.exists()) {
                document.getElementById('premium-toggle').checked = snapshot.val().isActive;
            }
        };

        const loadPagesContent = async () => {
             const snapshot = await get(ref(db, 'pages'));
            if(snapshot.exists()) {
                const data = snapshot.val();
                document.getElementById('disclaimer').value = data.disclaimer || '';
                document.getElementById('help').value = data.help || '';
                document.getElementById('privacyPolicy').value = data.privacyPolicy || '';
                document.getElementById('aboutUs').value = data.aboutUs || '';
            }
        };

        const loadSocialLinks = async () => {
            const snapshot = await get(ref(db, 'settings/socialLinks'));
            if(snapshot.exists()) {
                const data = snapshot.val();
                document.getElementById('whatsapp').value = data.whatsapp || '';
                document.getElementById('facebook').value = data.facebook || '';
                document.getElementById('instagram').value = data.instagram || '';
                document.getElementById('tiktok').value = data.tiktok || '';
                document.getElementById('appShareLink').value = data.appShareLink || '';
            }
        };

        const updateBannerLinkOptions = async (type, selectedId = '') => {
            const linkIdSelect = document.getElementById('linkId');
            const linkPickerControls = document.getElementById('linkPickerControls');
            const linkSortSelect = document.getElementById('linkSort');
            if (!linkIdSelect) return;
            if (linkSortSelect && !linkSortSelect.value) {
                linkSortSelect.value = 'newest';
            }
            linkIdSelect.innerHTML = '<option value="">Loading...</option>';
            linkIdSelect.disabled = true;

            if (type === 'none' || !type) {
                linkIdSelect.innerHTML = '<option value="">Select a type first</option>';
                linkPickerControls?.classList.add('hidden');
                return;
            }

            try {
                const items = getProcessedBannerLinkItems(type);
                let options = '<option value="">-- Select Content --</option>';
                items.forEach(item => {
                    const meta = [item.year, item.category || item.genre].filter(Boolean).join(' | ');
                    options += `<option value="${item.id}" ${selectedId === item.id ? 'selected' : ''}>${item.title}${meta ? ` (${meta})` : ''}</option>`;
                });
                linkIdSelect.innerHTML = options;
                linkIdSelect.disabled = false;
            } catch (error) {
                console.error("Error loading link options:", error);
                linkIdSelect.innerHTML = '<option value="">Error loading</option>';
                linkPickerControls?.classList.add('hidden');
            }
        };
        
        const updateSeriesBannerLinkOptions = async (selectedId = '') => {
            const linkIdSelect = document.getElementById('linkId');
            const linkPickerControls = document.getElementById('linkPickerControls');
            const linkSortSelect = document.getElementById('linkSort');
             if (!linkIdSelect) return;
            if (linkSortSelect && !linkSortSelect.value) {
                linkSortSelect.value = 'newest';
            }
            linkIdSelect.innerHTML = '<option value="">Loading...</option>';

            try {
                const seriesItems = getProcessedBannerLinkItems('series');
                let options = '<option value="">-- Select Series --</option>';
                seriesItems.forEach(item => {
                    const meta = [item.year, item.category || item.genre].filter(Boolean).join(' | ');
                    options += `<option value="${item.id}" ${selectedId === item.id ? 'selected' : ''}>${item.title}${meta ? ` (${meta})` : ''}</option>`;
                });
                linkIdSelect.innerHTML = options;
                linkIdSelect.disabled = false;
            } catch (error) {
                console.error("Error loading series link options:", error);
                linkIdSelect.innerHTML = '<option value="">Error loading series</option>';
                linkPickerControls?.classList.add('hidden');
            }
        };
        
        const handleSearch = (e) => {
            const query = e.target.value.toLowerCase();
            let itemsToFilter = [];

            switch(currentView) {
                case 'movies': itemsToFilter = moviesCache; break;
                case 'series': itemsToFilter = seriesCache; break;
                case 'adultContent': itemsToFilter = adultContentCache; break;
                case 'connection': itemsToFilter = connectionContentCache; break;
                case 'xxx': itemsToFilter = xxxContentCache; break;
                case 'stories': itemsToFilter = storiesCache; break;
                case 'users': itemsToFilter = [...document.querySelectorAll('.list-container > div')].map(div => ({ id: div.querySelector('.delete-btn').dataset.id, email: div.querySelector('.font-semibold').textContent })); break;
                default: 
                    const listItems = document.querySelectorAll('.list-container > div');
                    listItems.forEach(item => {
                        const title = item.querySelector('.font-semibold').textContent.toLowerCase();
                        item.style.display = title.includes(query) ? 'flex' : 'none';
                    });
                    return;
            }
            
            const filteredItems = itemsToFilter.filter(item => {
                 if (currentView === 'users') {
                     return (item.email || item.phone || item.uid || '').toLowerCase().includes(query);
                 }
                return (item.title || item.name || '').toLowerCase().includes(query)
            });
            renderListItems(filteredItems, currentView);
        };
        
        const initAdmin = async () => {
            await fetchInitialData();
            renderForm();
            
            document.querySelectorAll('.admin-nav-item').forEach(btn => btn.addEventListener('click', handleSwitchView));
            document.getElementById('admin-search-bar').addEventListener('input', handleSearch);

            document.addEventListener('click', (e) => {
                const deleteBtn = e.target.closest('.delete-btn');
                const editBtn = e.target.closest('.edit-btn');
                const notificationReplyBtn = e.target.closest('.notification-reply-btn');
                const notificationDeleteReplyBtn = e.target.closest('.notification-delete-reply-btn');
                const notificationBlockUserBtn = e.target.closest('.notification-block-user-btn');
                
                if (notificationReplyBtn) {
                    handleNotificationReply(notificationReplyBtn.dataset.notificationId, notificationReplyBtn.dataset.replyId || '');
                } else if (notificationDeleteReplyBtn) {
                    handleDeleteNotificationReply(notificationDeleteReplyBtn.dataset.notificationId, notificationDeleteReplyBtn.dataset.replyId);
                } else if (notificationBlockUserBtn) {
                    handleBlockActor(notificationBlockUserBtn.dataset.actorId);
                } else if (deleteBtn) {
                    handleDelete(e);
                } else if (editBtn) {
                    handleEdit(e);
                }
            });
        };

        initAdmin();
    