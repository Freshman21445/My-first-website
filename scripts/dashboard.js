const courses = [
  "Anthropology",
  "Emerging Technology",
  "Entrepreneurship",
  "Applied Mathematics",
  "Computer Programming",
  "English",
  "History of Ethiopia and the Horn",
  "Moral and Civic Education",
];

const coursesGrid = document.getElementById("coursesGrid");
const courseModal = document.getElementById("courseModal");
const materialChapters = document.getElementById("materialChapters");
const examChapters = document.getElementById("examChapters");
let currentMaterial = "";

// Render courses
courses.forEach((course) => {
  const courseCard = document.createElement("div");
  courseCard.className = "course-card";
  courseCard.textContent = course;
  courseCard.addEventListener("click", () => openCourseModal(course));
  coursesGrid.appendChild(courseCard);
});

function openCourseModal(courseName) {
  currentMaterial = courseName;
  document.getElementById("modalTitle").textContent = courseName;
  courseModal.classList.remove("hidden");
}

document.getElementById("materialButton").addEventListener("click", () => {
  renderChapters("material");
});

document.getElementById("examButton").addEventListener("click", () => {
  renderChapters("exam");
});

document.getElementById("closeModalButton").addEventListener("click", () => {
  courseModal.classList.add("hidden");
});

document.getElementById("closeMaterialButton").addEventListener("click", () => {
  document.getElementById("materialSection").classList.add("hidden");
});

document.getElementById("closeExamButton").addEventListener("click", () => {
  document.getElementById("examSection").classList.add("hidden");
});

function renderChapters(type) {
  const section = type === "material" ? materialChapters : examChapters;
  section.innerHTML = "";
  for (let i = 1; i <= 5; i++) {
    const chapterButton = document.createElement("button");
    chapterButton.textContent = `Chapter ${i}`;
    if (i === 1) {
      chapterButton.className = "free";
    } else {
      chapterButton.className = "premium";
      chapterButton.addEventListener("click", () => {
        document.getElementById("premiumSection").classList.remove("hidden");
      });
    }
    section.appendChild(chapterButton);
  }
  document.getElementById(type + "Section").classList.remove("hidden");
  courseModal.classList.add("hidden");
}