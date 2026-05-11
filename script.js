// Menu Toggle for Mobile
const menuToggle = document.getElementById('menuToggle');
const sidebar = document.querySelector('.sidebar');
const mainContent = document.querySelector('.main-content');

menuToggle.addEventListener('click', () => {
    sidebar.classList.toggle('active');
    mainContent.classList.toggle('sidebar-open');
});

// Close sidebar when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.sidebar') && !e.target.closest('.menu-toggle')) {
        sidebar.classList.remove('active');
        mainContent.classList.remove('sidebar-open');
    }
});

// Subject Card Click Handler
const subjectCards = document.querySelectorAll('.subject-card');
subjectCards.forEach(card => {
    card.addEventListener('click', () => {
        const subject = card.querySelector('h2').textContent;
        console.log(`${subject} clicked`);
        // Add your logic here - maybe navigate to subject details
    });
});

// Download Button Handlers
const downloadAllBtn = document.querySelector('.download-all');
const unlockAllBtn = document.querySelector('.unlock-all');
const videoBtn = document.querySelector('.video-unlock');

downloadAllBtn.addEventListener('click', () => {
    alert('Downloading all exams... This would trigger downloads in a real app.');
});

unlockAllBtn.addEventListener('click', () => {
    alert('Redirect to payment page for 100 Birr unlock. Coming soon!');
});

videoBtn.addEventListener('click', () => {
    alert('Opening offline video... Coming soon!');
});

// Footer Navigation
const footerItems = document.querySelectorAll('.footer-item');
footerItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        footerItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        
        const text = item.querySelector('span:last-child').textContent;
        console.log(`Navigated to: ${text}`);
    });
});

// Set initial active footer item
if (footerItems.length > 0) {
    footerItems[0].classList.add('active');
}

// Menu Items Click Handler
const menuItems = document.querySelectorAll('.menu-item');
menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const itemText = item.querySelector('span:last-child').textContent;
        console.log(`Menu clicked: ${itemText}`);
        
        // Close sidebar on mobile after clicking
        if (window.innerWidth <= 768) {
            sidebar.classList.remove('active');
            mainContent.classList.remove('sidebar-open');
        }
    });
});

// Grade Selector Change Handler
const gradeSelect = document.getElementById('gradeSelect');
gradeSelect.addEventListener('change', (e) => {
    console.log(`Grade selected: ${e.target.value}`);
    // You can add logic to filter subjects based on grade here
});

// Header Button Handlers
const shareBtn = document.querySelector('.share-btn');
const messageBtn = document.querySelector('.message-btn');

shareBtn.addEventListener('click', () => {
    alert('Share feature coming soon!');
});

messageBtn.addEventListener('click', () => {
    alert('Message feature coming soon!');
});

// Prevent sidebar from closing when clicking inside it
sidebar.addEventListener('click', (e) => {
    if (e.target.closest('.sidebar')) {
        e.stopPropagation();
    }
});

console.log('EthioMetric Dashboard Loaded Successfully! 🎓');
