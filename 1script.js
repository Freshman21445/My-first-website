AB
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

// Course Data Structure
const courseData = {
    'Mathematics': {
        material: [
            { number: 1, name: 'Chapter 1: Algebra Basics', file: 'math_ch1_material.pdf' },
            { number: 2, name: 'Chapter 2: Quadratic Equations', file: 'math_ch2_material.pdf' },
            { number: 3, name: 'Chapter 3: Functions', file: 'math_ch3_material.pdf' },
            { number: 4, name: 'Chapter 4: Trigonometry', file: 'math_ch4_material.pdf' },
            { number: 5, name: 'Chapter 5: Calculus Introduction', file: 'math_ch5_material.pdf' }
        ],
        exams: [
            { number: 1, name: 'Chapter 1: Algebra Exam', file: 'math_ch1_exam.pdf' },
            { number: 2, name: 'Chapter 2: Quadratic Exam', file: 'math_ch2_exam.pdf' },
            { number: 3, name: 'Chapter 3: Functions Exam', file: 'math_ch3_exam.pdf' },
            { number: 4, name: 'Chapter 4: Trigonometry Exam', file: 'math_ch4_exam.pdf' },
            { number: 5, name: 'Chapter 5: Calculus Exam', file: 'math_ch5_exam.pdf' }
        ]
    },
    'Physics': {
        material: [
            { number: 1, name: 'Chapter 1: Mechanics', file: 'physics_ch1_material.pdf' },
            { number: 2, name: 'Chapter 2: Waves', file: 'physics_ch2_material.pdf' },
            { number: 3, name: 'Chapter 3: Thermodynamics', file: 'physics_ch3_material.pdf' },
            { number: 4, name: 'Chapter 4: Electromagnetism', file: 'physics_ch4_material.pdf' }
        ],
        exams: [
            { number: 1, name: 'Chapter 1: Mechanics Exam', file: 'physics_ch1_exam.pdf' },
            { number: 2, name: 'Chapter 2: Waves Exam', file: 'physics_ch2_exam.pdf' },
            { number: 3, name: 'Chapter 3: Thermodynamics Exam', file: 'physics_ch3_exam.pdf' },
            { number: 4, name: 'Chapter 4: Electromagnetism Exam', file: 'physics_ch4_exam.pdf' }
        ]
    },
    'Chemistry': {
        material: [
            { number: 1, name: 'Chapter 1: Chemical Bonds', file: 'chem_ch1_material.pdf' },
            { number: 2, name: 'Chapter 2: Reactions', file: 'chem_ch2_material.pdf' },
            { number: 3, name: 'Chapter 3: Organic Chemistry', file: 'chem_ch3_material.pdf' }
        ],
        exams: [
            { number: 1, name: 'Chapter 1: Chemical Bonds Exam', file: 'chem_ch1_exam.pdf' },
            { number: 2, name: 'Chapter 2: Reactions Exam', file: 'chem_ch2_exam.pdf' },
            { number: 3, name: 'Chapter 3: Organic Chemistry Exam', file: 'chem_ch3_exam.pdf' }
        ]
    }
};

// Create Modal HTML
function createCourseModal(subject) {
    const existingModal = document.querySelector('.course-modal');
    if (existingModal) {
        existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.className = 'course-modal';
    modal.innerHTML = `
        <div class="course-modal-content">
            <button class="modal-close">&times;</button>
            <h2>${subject}</h2>
            <div class="course-options">
                <button class="option-btn active" data-type="material">📚 Material</button>
                <button class="option-btn" data-type="exams">📝 Exams</button>
            </div>
            <div id="chaptersContainer">
                <h3>Material Chapters</h3>
                <div class="chapters-list" id="chaptersList"></div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    setupModalEventListeners(modal, subject);
    displayChapters(subject, 'material');
}

// Setup Modal Event Listeners
function setupModalEventListeners(modal, subject) {
    const closeBtn = modal.querySelector('.modal-close');
    const optionBtns = modal.querySelectorAll('.option-btn');

    closeBtn.addEventListener('click', () => {
        modal.remove();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });

    optionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            optionBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const type = btn.dataset.type;
            displayChapters(subject, type);
        });
    });
}

// Display Chapters Based on Type
function displayChapters(subject, type) {
    const chaptersList = document.getElementById('chaptersList');
    const chaptersContainer = document.getElementById('chaptersContainer');
    const title = type === 'material' ? 'Material Chapters' : 'Exam Chapters';
    const chapters = courseData[subject][type];

    chaptersContainer.querySelector('h3').textContent = title;
    chaptersList.innerHTML = '';

    chapters.forEach(chapter => {
        const chapterItem = document.createElement('div');
        chapterItem.className = 'chapter-item';
        chapterItem.innerHTML = `
            <div class="chapter-header">
                <div class="chapter-number">${chapter.number}</div>
                <div class="chapter-name">${chapter.name}</div>
            </div>
            <div class="chapter-actions">
                <button class="chapter-btn view-btn" data-file="${chapter.file}" data-action="view">👁️ View</button>
                <button class="chapter-btn download-btn" data-file="${chapter.file}" data-action="download">⬇️ Download</button>
            </div>
        `;
        chaptersList.appendChild(chapterItem);
    });

    // Add event listeners to view and download buttons
    setupChapterButtonListeners(subject, type);
}

// Setup Chapter Button Event Listeners
function setupChapterButtonListeners(subject, type) {
    const viewBtns = document.querySelectorAll('.view-btn');
    const downloadBtns = document.querySelectorAll('.download-btn');

    viewBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const file = btn.dataset.file;
            const chapterName = btn.closest('.chapter-item').querySelector('.chapter-name').textContent;
            handleViewChapter(subject, type, chapterName, file);
        });
    });

    downloadBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const file = btn.dataset.file;
            const chapterName = btn.closest('.chapter-item').querySelector('.chapter-name').textContent;
            handleDownloadChapter(subject, type, chapterName, file);
        });
    });
}

// Handle View Chapter
function handleViewChapter(subject, type, chapterName, file) {
    console.log(`Viewing ${type} for ${subject}: ${chapterName} (${file})`);
    // TODO: Replace with actual implementation
    // You can open a PDF viewer, navigate to a page, or show content
    alert(`Opening: ${chapterName}\n\nFile: ${file}\n\nIn a real app, this would display the content or open a PDF viewer.`);
}

// Handle Download Chapter
function handleDownloadChapter(subject, type, chapterName, file) {
    console.log(`Downloading ${type} for ${subject}: ${chapterName} (${file})`);
    // TODO: Replace with actual implementation
    // Make API call to download the file
    alert(`Downloading: ${chapterName}\n\nFile: ${file}\n\nIn a real app, this would trigger the download.`);
}

// Subject Card Click Handler
const subjectCards = document.querySelectorAll('.subject-card');
subjectCards.forEach(card => {
    card.addEventListener('click', () => {
        const subject = card.querySelector('h2').textContent;
        console.log(`${subject} clicked - Opening course options`);
        
        // Check if subject has data
        if (courseData[subject]) {
            createCourseModal(subject);
        } else {
            alert(`Sorry, course data for ${subject} is not available yet.`);
        }
    });
});

// Download Button Handlers
const downloadAllBtn = document.querySelector('.download-all');
const unlockAllBtn = document.querySelector('.unlock-all');
const videoBtn = document.querySelector('.video-unlock');

if (downloadAllBtn) {
    downloadAllBtn.addEventListener('click', () => {
        alert('Downloading all exams... This would trigger downloads in a real app.');
    });
}

if (unlockAllBtn) {
    unlockAllBtn.addEventListener('click', () => {
        alert('Redirect to payment page for 100 Birr unlock. Coming soon!');
    });
}

if (videoBtn) {
    videoBtn.addEventListener('click', () => {
        alert('Opening offline video... Coming soon!');
    });
}

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
if (gradeSelect) {
    gradeSelect.addEventListener('change', (e) => {
        console.log(`Grade selected: ${e.target.value}`);
        // You can add logic to filter subjects based on grade here
    });
}

// Header Button Handlers
const shareBtn = document.querySelector('.share-btn');
const messageBtn = document.querySelector('.message-btn');

if (shareBtn) {
    shareBtn.addEventListener('click', () => {
        alert('Share feature coming soon!');
    });
}

if (messageBtn) {
    messageBtn.addEventListener('click', () => {
        alert('Message feature coming soon!');
    });
}

// Prevent sidebar from closing when clicking inside it
if (sidebar) {
    sidebar.addEventListener('click', (e) => {
        if (e.target.closest('.sidebar')) {
            e.stopPropagation();
        }
    });
}

console.log('EthioMetric Dashboard Loaded Successfully! 🎓');
