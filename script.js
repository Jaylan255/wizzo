// SwaMedia - Watch Page JavaScript

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyAAWjWH55_WogACWc3vNVWrlLrwPYPfgmo",
    authDomain: "swamediaweb.firebaseapp.com",
    databaseURL: "https://swamediaweb-default-rtdb.firebaseio.com",
    projectId: "swamediaweb",
    storageBucket: "swamediaweb.firebasestorage.app",
    messagingSenderId: "70354150749",
    appId: "1:70354150749:web:046e78eb57ce1fe427f4b4"
};

// Initialize Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get, set, update, push, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);

// DOM Elements
const videoLoader = document.getElementById('video-loader');
const videoPlayer = document.getElementById('video-player');
const videoTitle = document.getElementById('video-title');
const videoYear = document.getElementById('video-year');
const videoGenre = document.getElementById('video-genre');
const videoDescription = document.getElementById('video-description');
const genreTagsContainer = document.getElementById('genre-tags');
const likesCount = document.getElementById('likes-count');
const dislikesCount = document.getElementById('dislikes-count');
const ratingDisplay = document.getElementById('rating-display');
const commentsList = document.getElementById('comments-list');
const commentForm = document.getElementById('comment-form');
const commentInput = document.getElementById('comment-input');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

// State
let currentVideo = null;
let currentUser = null;
let videoData = null;

// URL Parameters
const urlParams = new URLSearchParams(window.location.search);
const videoId = urlParams.get('id');
const videoType = urlParams.get('type') || 'movie';

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await initAuth();
    if (videoId) {
        await loadVideoData();
    } else {
        showToast('No video specified');
        setTimeout(() => window.history.back(), 1500);
    }
});

// Authentication
async function initAuth() {
    return new Promise((resolve) => {
        onAuthStateChanged(auth, (user) => {
            currentUser = user;
            resolve();
        });
    });
}

// Load Video Data
async function loadVideoData() {
    try {
        const videoRef = ref(database, `${videoType}s/${videoId}`);
        const snapshot = await get(videoRef);
        
        if (snapshot.exists()) {
            videoData = { id: videoId, ...snapshot.val() };
            renderVideoDetails();
            loadComments();
            hideLoader();
        } else {
            showToast('Video not found');
            setTimeout(() => window.history.back(), 1500);
        }
    } catch (error) {
        console.error('Error loading video:', error);
        showToast('Failed to load video');
    }
}

// Render Video Details
function renderVideoDetails() {
    videoTitle.textContent = videoData.title || 'Untitled';
    videoYear.textContent = videoData.year || '';
    videoGenre.textContent = videoData.category || '';
    videoDescription.textContent = videoData.description || 'No description available.';
    
    // Set video source
    if (videoData.mediaUrl) {
        const { previewUrl } = getGoogleDriveUrls(videoData.mediaUrl);
        videoPlayer.src = previewUrl || videoData.mediaUrl;
    } else if (videoData.videoUrl) {
        const { previewUrl } = getGoogleDriveUrls(videoData.videoUrl);
        videoPlayer.src = previewUrl || videoData.videoUrl;
    }
    
    // Set poster
    if (videoData.posterUrl) {
        videoPlayer.poster = videoData.posterUrl;
    }
    
    // Update likes/dislikes
    likesCount.textContent = videoData.likes || 0;
    dislikesCount.textContent = videoData.dislikes || 0;
    
    // Update rating display
    if (videoData.rating) {
        ratingDisplay.textContent = `(${videoData.rating}/10)`;
    }
    
    // Render genre tags
    renderGenreTags();
    
    // Setup Play Next button
    setupPlayNext();
    
    // Setup action buttons
    setupActionButtons();
}

// Google Drive URL Handler
function getGoogleDriveUrls(url) {
    if (!url || typeof url !== 'string') return { previewUrl: null, downloadUrl: null };
    const regex = /drive\.google\.com.*\/file\/d\/([a-zA-Z0-9_-]+)/;
    const match = url.match(regex);
    if (match && match[1]) {
        const fileId = match[1];
        return {
            previewUrl: `https://drive.google.com/file/d/${fileId}/preview`,
            downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`
        };
    }
    return { previewUrl: url, downloadUrl: url };
}

// Render Genre Tags
function renderGenreTags() {
    genreTagsContainer.innerHTML = '';
    
    const genres = videoData.genres || (videoData.category ? [videoData.category] : []);
    
    genres.forEach(genre => {
        const tag = document.createElement('span');
        tag.className = 'genre-tag';
        tag.textContent = genre;
        genreTagsContainer.appendChild(tag);
    });
}

// Setup Play Next Button
function setupPlayNext() {
    const playNextBtn = document.getElementById('play-next-btn');
    
    // Check if there's a next episode
    const hasNextEpisode = videoData.nextEpisodeId || (videoData.parts && Object.keys(videoData.parts).length > 1);
    
    if (!hasNextEpisode) {
        playNextBtn.disabled = true;
        playNextBtn.innerHTML = '<i class="fas fa-check-circle"></i><span>No Next Episode</span>';
        return;
    }
    
    playNextBtn.addEventListener('click', async () => {
        if (videoData.nextEpisodeId) {
            // Navigate to next episode
            window.location.href = `watch.html?id=${videoData.nextEpisodeId}&type=${videoType}`;
        } else if (videoData.parts) {
            // Find next part
            const parts = Object.values(videoData.parts);
            const currentIndex = parts.findIndex(p => p.mediaUrl === videoData.mediaUrl);
            if (currentIndex < parts.length - 1) {
                const nextPart = parts[currentIndex + 1];
                // Update current video and reload
                videoData = { ...videoData, ...nextPart };
                renderVideoDetails();
                showToast('Playing next part...');
            }
        }
    });
}

// Setup Action Buttons
function setupActionButtons() {
    // Share Button
    document.getElementById('share-btn').addEventListener('click', () => {
        const shareData = {
            title: videoData.title,
            text: `Watch ${videoData.title} on SwaMedia`,
            url: window.location.href
        };
        
        if (navigator.share) {
            navigator.share(shareData).catch(err => console.log('Share cancelled'));
        } else {
            // Fallback: copy to clipboard
            navigator.clipboard.writeText(window.location.href);
            showToast('Link copied to clipboard!');
        }
    });
    
    // Add to List Button
    document.getElementById('add-to-list-btn').addEventListener('click', () => {
        if (!currentUser) {
            showToast('Please login to add to watchlist');
            return;
        }
        
        // Save to local storage for now (can be moved to Firebase)
        const watchlist = JSON.parse(localStorage.getItem('watchlist') || '[]');
        if (!watchlist.includes(videoId)) {
            watchlist.push(videoId);
            localStorage.setItem('watchlist', JSON.stringify(watchlist));
            showToast('Added to watchlist!');
        } else {
            showToast('Already in watchlist');
        }
    });
    
    // Star Rating
    setupStarRating();
    
    // Like/Dislike
    setupVoteButtons();
}

// Star Rating
function setupStarRating() {
    const stars = document.querySelectorAll('.star-btn');
    const savedRating = localStorage.getItem(`rating_${videoId}`);
    
    if (savedRating) {
        updateStars(parseInt(savedRating));
    }
    
    stars.forEach(star => {
        star.addEventListener('click', async () => {
            if (!currentUser) {
                showToast('Please login to rate');
                return;
            }
            
            const rating = parseInt(star.dataset.rating);
            updateStars(rating);
            localStorage.setItem(`rating_${videoId}`, rating.toString());
            
            // Save to Firebase
            try {
                await update(ref(database, `${videoType}s/${videoId}`), {
                    rating: rating
                });
                showToast(`You rated ${rating} stars!`);
            } catch (error) {
                console.error('Error saving rating:', error);
            }
        });
        
        star.addEventListener('mouseenter', () => {
            const rating = parseInt(star.dataset.rating);
            updateStars(rating, true);
        });
    });
    
    document.getElementById('star-rating').addEventListener('mouseleave', () => {
        const savedRating = localStorage.getItem(`rating_${videoId}`);
        updateStars(savedRating ? parseInt(savedRating) : 0);
    });
}

function updateStars(rating, hover = false) {
    const stars = document.querySelectorAll('.star-btn');
    stars.forEach((star, index) => {
        if (index < rating) {
            star.classList.add('active');
            if (!hover) {
                star.innerHTML = '<i class="fas fa-star"></i>';
            }
        } else {
            star.classList.remove('active');
            star.innerHTML = '<i class="fas fa-star"></i>';
        }
    });
}

// Like/Dislike Buttons
function setupVoteButtons() {
    const likeBtn = document.getElementById('like-btn');
    const dislikeBtn = document.getElementById('dislike-btn');
    
    const userVote = localStorage.getItem(`vote_${videoId}`);
    
    if (userVote === 'like') {
        likeBtn.classList.add('voted');
    } else if (userVote === 'dislike') {
        dislikeBtn.classList.add('voted');
    }
    
    likeBtn.addEventListener('click', async () => {
        if (!currentUser) {
            showToast('Please login to vote');
            return;
        }
        
        const currentVote = localStorage.getItem(`vote_${videoId}`);
        let newLikes = videoData.likes || 0;
        
        if (currentVote === 'like') {
            // Remove like
            newLikes--;
            localStorage.removeItem(`vote_${videoId}`);
            likeBtn.classList.remove('voted');
        } else {
            // Add like
            newLikes++;
            if (currentVote === 'dislike') {
                videoData.dislikes = (videoData.dislikes || 1) - 1;
                dislikeBtn.classList.remove('voted');
            }
            localStorage.setItem(`vote_${videoId}`, 'like');
            likeBtn.classList.add('voted');
        }
        
        // Update UI
        likesCount.textContent = newLikes;
        videoData.likes = newLikes;
        
        // Save to Firebase
        try {
            await update(ref(database, `${videoType}s/${videoId}`), {
                likes: newLikes
            });
        } catch (error) {
            console.error('Error updating likes:', error);
        }
    });
    
    dislikeBtn.addEventListener('click', async () => {
        if (!currentUser) {
            showToast('Please login to vote');
            return;
        }
        
        const currentVote = localStorage.getItem(`vote_${videoId}`);
        let newDislikes = videoData.dislikes || 0;
        
        if (currentVote === 'dislike') {
            // Remove dislike
            newDislikes--;
            localStorage.removeItem(`vote_${videoId}`);
            dislikeBtn.classList.remove('voted');
        } else {
            // Add dislike
            newDislikes++;
            if (currentVote === 'like') {
                videoData.likes = (videoData.likes || 1) - 1;
                likeBtn.classList.remove('voted');
            }
            localStorage.setItem(`vote_${videoId}`, 'dislike');
            dislikeBtn.classList.add('voted');
        }
        
        // Update UI
        dislikesCount.textContent = newDislikes;
        videoData.dislikes = newDislikes;
        
        // Save to Firebase
        try {
            await update(ref(database, `${videoType}s/${videoId}`), {
                dislikes: newDislikes
            });
        } catch (error) {
            console.error('Error updating dislikes:', error);
        }
    });
}

// Comments System
function loadComments() {
    const commentsRef = ref(database, `comments/${videoId}`);
    
    onValue(commentsRef, (snapshot) => {
        const comments = [];
        snapshot.forEach(child => {
            comments.push({ id: child.key, ...child.val() });
        });
        
        // Sort by timestamp (newest first)
        comments.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        
        renderComments(comments);
    });
}

function renderComments(comments) {
    if (comments.length === 0) {
        commentsList.innerHTML = '<p class="text-slate-400 text-center py-4">No comments yet. Be the first to comment!</p>';
        return;
    }
    
    commentsList.innerHTML = comments.map(comment => `
        <div class="comment-item">
            <div class="comment-header">
                <span class="comment-user">${comment.userName || 'Anonymous'}</span>
                <span class="comment-time">${timeSince(comment.timestamp)}</span>
            </div>
            <p class="comment-content">${escapeHtml(comment.text)}</p>
        </div>
    `).join('');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function timeSince(timestamp) {
    if (!timestamp) return '';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + ' years ago';
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + ' months ago';
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + ' days ago';
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + ' hours ago';
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + ' minutes ago';
    return 'Just now';
}

commentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!currentUser) {
        showToast('Please login to comment');
        return;
    }
    
    const commentText = commentInput.value.trim();
    if (!commentText) {
        showToast('Please write a comment');
        return;
    }
    
    try {
        await push(ref(database, `comments/${videoId}`), {
            userId: currentUser.uid,
            userName: currentUser.phone || currentUser.email || 'Anonymous',
            text: commentText,
            timestamp: Date.now()
        });
        
        commentInput.value = '';
        showToast('Comment posted!');
    } catch (error) {
        console.error('Error posting comment:', error);
        showToast('Failed to post comment');
    }
});

// Back Button
document.getElementById('back-btn').addEventListener('click', () => {
    window.history.back();
});

// Video Player Events
videoPlayer.addEventListener('loadeddata', () => {
    hideLoader();
});

videoPlayer.addEventListener('error', () => {
    showToast('Error loading video');
    hideLoader();
});

// Helper Functions
function hideLoader() {
    videoLoader.classList.add('hidden');
}

function showToast(message) {
    toastMessage.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    
    switch(e.key) {
        case 'ArrowLeft':
            videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 10);
            break;
        case 'ArrowRight':
            videoPlayer.currentTime = Math.min(videoPlayer.duration, videoPlayer.currentTime + 10);
            break;
        case ' ':
        case 'k':
            if (videoPlayer.paused) {
                videoPlayer.play();
            } else {
                videoPlayer.pause();
            }
            break;
        case 'f':
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                videoPlayer.requestFullscreen();
            }
            break;
    }
});