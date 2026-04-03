// Calculator
const amountRange = document.getElementById("amountrange");
const amountInput = document.getElementById("amountInput");
const emiText = document.getElementById("emi");
const interestText = document.getElementById("interest");
const rateInput = document.getElementById("rate");
let duration = 6;

// Set Duration Function
function setDuration(months, event) {
  duration = months;
  document.querySelectorAll(".duration button").forEach(btn => btn.classList.remove("active"));
  event.target.classList.add("active");
  calculate();
}

// EMI Calculation
function calculate() {
  let principal = parseInt(amountInput.value);
  let annualRate = parseFloat(rateInput.value);
  let monthlyRate = annualRate / 12 / 100;

  let emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, duration)) /
            (Math.pow(1 + monthlyRate, duration) - 1);

  let totalPayment = emi * duration;
  let interest = totalPayment - principal;

  emiText.innerHTML = `<i class="fa-solid fa-indian-rupee-sign"></i> ${emi.toFixed(0)}`;
  interestText.innerHTML = `Total Interest: <i class="fa-solid fa-indian-rupee-sign"></i>${interest.toFixed(0)}`;
}

// Sync slider & input
amountRange.addEventListener("input", () => {
  amountInput.value = amountRange.value;
  calculate();
});

amountInput.addEventListener("input", () => {
  amountRange.value = amountInput.value;
  calculate();
});

rateInput.addEventListener("input", calculate);

calculate(); // initial

// Open Calculator on button click
const openCalcBtn = document.getElementById("openCalc");
if (openCalcBtn) {
  openCalcBtn.addEventListener("click", () => {
    const loanCalc = document.getElementById("loanCalc");
    if (loanCalc) {
      loanCalc.style.display = "flex";
    }
  });
}




// login

    function openPage() {
      // Opens about.html in the same tab
      window.location.href = "login.html";
    }

   

    // img-side
    // Array of image file paths
const images = [
    'right.jpg',
    'IB_Banner.jpg',
    'banner.svg'
    // 'image4.jpg'
    // Add as many image paths as you need
];

let currentImageIndex = 0;
const imageElement = document.getElementById('slideshow-image');
const intervalTime = 5000; // 5000 milliseconds = 5 seconds

function changeImage() {
    if (!imageElement) return;
    // 1. Update the image source
    imageElement.src = images[currentImageIndex];

    // 2. Increment the index
    currentImageIndex++;

    // 3. Reset the index if it goes out of bounds (loop back to the first image)
    if (currentImageIndex >= images.length) {
        currentImageIndex = 0;
    }
}

// Initial call to set the first image (optional, but good practice)
if (imageElement) {
  changeImage();
  setInterval(changeImage, intervalTime);
}



// Mode
// 🌗 Dark Mode Toggle
const body = document.body;

document.addEventListener('DOMContentLoaded', function () {
  const modeToggle = document.querySelector('.Mode');
  if (!modeToggle) return;

  // Apply saved theme if exists, otherwise use OS preference
  const preferredTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const savedTheme = localStorage.getItem('theme') || preferredTheme;
  if (savedTheme === 'dark') {
    body.classList.add('dark-mode');
    modeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>'; // show sun icon
  } else {
    body.classList.remove('dark-mode');
    modeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
  }

  modeToggle.addEventListener('click', function (e) {
    e.preventDefault();
    body.classList.toggle('dark-mode');

    if (body.classList.contains('dark-mode')) {
      localStorage.setItem('theme', 'dark');
      modeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
    } else {
      localStorage.setItem('theme', 'light');
      modeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
    }
  });
});


// Dark Mode Toggle Functionality
// document.addEventListener('DOMContentLoaded', function() {
//   const modeToggle = document.querySelector('.Mode');
//   const modeIcon = modeToggle.querySelector('i');
  
//   // Check for saved theme preference or default to light
//   const currentTheme = localStorage.getItem('theme') || 'light';
  
//   // Apply the saved theme
//   document.documentElement.setAttribute('data-theme', currentTheme);
  
//   // Update icon based on current theme
//   updateModeIcon(currentTheme);
  
//   // Toggle theme when button is clicked
//   modeToggle.addEventListener('click', function() {
//     let theme = document.documentElement.getAttribute('data-theme');
    
//     // Switch theme
//     if (theme === 'light') {
//       document.documentElement.setAttribute('data-theme', 'dark');
//       localStorage.setItem('theme', 'dark');
//       updateModeIcon('dark');
//     } else {
//       document.documentElement.setAttribute('data-theme', 'light');
//       localStorage.setItem('theme', 'light');
//       updateModeIcon('light');
//     }
//   });
  
//   function updateModeIcon(theme) {
//     if (theme === 'dark') {
//       modeIcon.className = 'fa-solid fa-sun';
//     } else {
//       modeIcon.className = 'fa-solid fa-moon';
//     }
//   }
  
//   // Rest of your existing JavaScript code...
// });
