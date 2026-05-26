let newsArticles = [];
let activeArticleIndex = 0;
let activeTab = 'translate'; 

// Filter States
let activeCategory = 'all';
let searchQuery = '';

// DOM Elements
const feedListEl = document.getElementById('feedList');
const articleTitleEl = document.getElementById('articleTitle');
const articleJapaneseEl = document.getElementById('articleJapanese');
const aiContentTextEl = document.getElementById('aiContentText');
const articleMainImageEl = document.getElementById('articleMainImage');
const articleCategoryEl = document.getElementById('articleCategory');
const articleDateEl = document.getElementById('articleDate');
const articleOriginalLinkEl = document.getElementById('articleOriginalLink'); // 💡 New Link Node mapping
const utilityButtons = document.querySelectorAll('.util-btn');
const navItems = document.querySelectorAll('.nav-item');
const searchInput = document.getElementById('searchInput');

/**
 * Fetches processed headlines directly from your Node.js application server instance
 */
async function fetchNews() {
    try {
        feedListEl.innerHTML = `<div style="padding: 16px; color: var(--text-muted); font-size: 0.85rem;">Loading live wire from local database...</div>`;
        
        const targetUrl = "http://localhost:3000/api/news";
        const response = await fetch(targetUrl);
        if (!response.ok) throw new Error(`API pipeline connection tracking issue. Status: ${response.status}`);
        
        const data = await response.json();
        
        if (data && data.length > 0) {
            newsArticles = data;
            activeArticleIndex = 0;
            renderFilteredContent();
        } else {
            feedListEl.innerHTML = `<div style="padding: 16px; color: var(--text-muted); font-size: 0.85rem;">Database syncing fresh wires. Please refresh window page...</div>`;
        }
    } catch (error) {
        console.error("Failed handling client server data fetching utility stream loop:", error);
        feedListEl.innerHTML = `<div style="padding: 16px; color: #e07a5f; font-size: 0.85rem;">Error tracking feed. Ensure your Node.js local backend is running!</div>`;
    }
}

function getFilteredArticles() {
    return newsArticles.filter(article => {
        const matchesCategory = (activeCategory === 'all' || article.category === activeCategory);
        const searchTarget = (article.title + article.japanese).toLowerCase();
        const matchesSearch = searchTarget.includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });
}

function renderFilteredContent() {
    const filtered = getFilteredArticles();
    feedListEl.innerHTML = "";

    if (filtered.length === 0) {
        feedListEl.innerHTML = `<div style="padding: 16px; color: var(--text-muted); font-size: 0.85rem;">No matches found matching criteria targets.</div>`;
        articleTitleEl.textContent = "No data packet loaded";
        articleJapaneseEl.textContent = "Try shifting active filter options navigation fields.";
        aiContentTextEl.textContent = "";
        articleMainImageEl.style.display = 'none';
        articleDateEl.innerHTML = `<i class="fa-regular fa-calendar"></i> -- --`;
        return;
    }

    if (activeArticleIndex >= filtered.length) {
        activeArticleIndex = 0;
    }

    filtered.forEach((item, index) => {
        const itemEl = document.createElement('div');
        itemEl.className = `feed-item ${index === activeArticleIndex ? 'active' : ''}`;
        itemEl.innerHTML = `
            <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom:6px;">
                <span class="feed-date">${item.date}</span>
                <span style="font-size:0.6rem; font-weight:bold; background:#e5e2d9; padding:2px 6px; border-radius:4px; text-transform:uppercase;">${item.category}</span>
            </div>
            <div class="feed-headline">${item.title}</div>
        `;
        
        itemEl.addEventListener('click', () => {
            activeArticleIndex = index;
            renderArticle(filtered[index]);
            renderFilteredContent(); 
        });
        feedListEl.appendChild(itemEl);
    });

    renderArticle(filtered[activeArticleIndex]);
}

function renderArticle(currentArticle) {
    if (!currentArticle) return;
    
    articleTitleEl.textContent = currentArticle.title;
    articleJapaneseEl.textContent = currentArticle.japanese;
    
    if (articleCategoryEl) {
        articleCategoryEl.textContent = currentArticle.category.toUpperCase();
    }

    // Render Real Published Date Text (Includes Year now)
    if (articleDateEl) {
        articleDateEl.innerHTML = `<i class="fa-regular fa-calendar"></i> ${currentArticle.date}`;
    }

    // 💡 Bind the original external source link to the HTML Anchor tag
    if (articleOriginalLinkEl && currentArticle.url) {
        articleOriginalLinkEl.href = currentArticle.url;
    }
    
    if (currentArticle.imageUrl) {
        articleMainImageEl.src = currentArticle.imageUrl;
        articleMainImageEl.style.display = 'block';
    } else {
        articleMainImageEl.style.display = 'none';
    }
    
    aiContentTextEl.style.whiteSpace = "pre-line";
    if (currentArticle.aiContent && currentArticle.aiContent[activeTab]) {
        aiContentTextEl.textContent = currentArticle.aiContent[activeTab];
    } else {
        aiContentTextEl.textContent = "No data structured here contextually.";
    }
}

searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    activeArticleIndex = 0; 
    renderFilteredContent();
});

navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        
        activeCategory = item.getAttribute('data-category');
        activeArticleIndex = 0; 
        renderFilteredContent();
    });
});

utilityButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        // Exclude the source link from tab switching animations
        if (btn.id === 'articleOriginalLink') return;

        utilityButtons.forEach(b => b.classList.remove('active'));
        const clickedBtn = e.currentTarget;
        clickedBtn.classList.add('active');
        activeTab = clickedBtn.getAttribute('data-tab');
        
        const filtered = getFilteredArticles();
        if (filtered.length > 0) {
            renderArticle(filtered[activeArticleIndex]);
        }
    });
});

document.addEventListener("DOMContentLoaded", () => {
    fetchNews();
});