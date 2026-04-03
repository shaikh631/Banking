class BankingSlider {
    constructor() {
        this.slider = document.querySelector('.slider-above');
        this.slides = document.querySelectorAll('.slide-above');
        this.controlBtns = document.querySelectorAll('.control-btn');
        this.prevBtn = document.querySelector('.slider-arrow-prev');
        this.nextBtn = document.querySelector('.slider-arrow-next');
        
        this.currentSlide = 0;
        this.totalSlides = this.slides.length;
        this.autoPlayInterval = null;
        this.isAutoPlaying = true;
        this.autoPlayDelay = 5000; // 5 seconds
        
        this.init();
    }
    
    init() {
        // Add event listeners
        this.prevBtn.addEventListener('click', () => this.prevSlide());
        this.nextBtn.addEventListener('click', () => this.nextSlide());
        
        // Add control button event listeners
        this.controlBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const slideIndex = parseInt(e.target.dataset.slide);
                this.goToSlide(slideIndex);
            });
        });
        
        // Add keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') {
                this.prevSlide();
            } else if (e.key === 'ArrowRight') {
                this.nextSlide();
            } else if (e.key === ' ') {
                e.preventDefault();
                this.toggleAutoPlay();
            }
        });
        
        // Add touch/swipe support
        this.addTouchSupport();
        
        // Start auto-play
        this.startAutoPlay();
        
        // Add auto-play status indicator
        this.addAutoPlayStatus();
    }
    
    goToSlide(slideIndex) {
        this.currentSlide = slideIndex;
        this.updateSlider();
        this.resetAutoPlay();
    }
    
    nextSlide() {
        this.currentSlide = (this.currentSlide + 1) % this.totalSlides;
        this.updateSlider();
        this.resetAutoPlay();
    }
    
    prevSlide() {
        this.currentSlide = (this.currentSlide - 1 + this.totalSlides) % this.totalSlides;
        this.updateSlider();
        this.resetAutoPlay();
    }
    
    updateSlider() {
        // Update slider position
        const translateX = -this.currentSlide * 20; // Each slide is 20% of total width
        this.slider.style.transform = `translateX(${translateX}%)`;
        
        // Update control buttons
        this.controlBtns.forEach((btn, index) => {
            btn.classList.toggle('active', index === this.currentSlide);
        });
        
        // Add animation class for smooth transition
        this.slider.classList.add('sliding');
        setTimeout(() => {
            this.slider.classList.remove('sliding');
        }, 500);
    }
    
    startAutoPlay() {
        if (this.isAutoPlaying) {
            this.autoPlayInterval = setInterval(() => {
                this.nextSlide();
            }, this.autoPlayDelay);
        }
    }
    
    stopAutoPlay() {
        if (this.autoPlayInterval) {
            clearInterval(this.autoPlayInterval);
            this.autoPlayInterval = null;
        }
    }
    
    resetAutoPlay() {
        this.stopAutoPlay();
        if (this.isAutoPlaying) {
            this.startAutoPlay();
        }
    }
    
    toggleAutoPlay() {
        this.isAutoPlaying = !this.isAutoPlaying;
        this.updateAutoPlayStatus();
        
        if (this.isAutoPlaying) {
            this.startAutoPlay();
        } else {
            this.stopAutoPlay();
        }
    }
    
    addTouchSupport() {
        let startX = 0;
        let endX = 0;
        
        this.slider.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
        }, { passive: true });
        
        this.slider.addEventListener('touchmove', (e) => {
            endX = e.touches[0].clientX;
        }, { passive: true });
        
        this.slider.addEventListener('touchend', () => {
            const diffX = startX - endX;
            const minSwipeDistance = 50;
            
            if (Math.abs(diffX) > minSwipeDistance) {
                if (diffX > 0) {
                    this.nextSlide();
                } else {
                    this.prevSlide();
                }
            }
        });
    }
    
    addAutoPlayStatus() {
        const statusDiv = document.createElement('div');
        statusDiv.className = 'auto-play-status';
        statusDiv.innerHTML = `
            Auto-play: <span id="autoPlayState">ON</span> 
            <button class="auto-play-toggle" onclick="slider.toggleAutoPlay()">Toggle</button>
        `;
        
        document.querySelector('.slider-controls').after(statusDiv);
        this.autoPlayStatus = document.getElementById('autoPlayState');
    }
    
    updateAutoPlayStatus() {
        if (this.autoPlayStatus) {
            this.autoPlayStatus.textContent = this.isAutoPlaying ? 'ON' : 'OFF';
            this.autoPlayStatus.style.color = this.isAutoPlaying ? 'green' : 'red';
        }
    }
    
    // Public method to manually control the slider from outside
    setSlide(index) {
        if (index >= 0 && index < this.totalSlides) {
            this.goToSlide(index);
        }
    }
    
    // Clean up method
    destroy() {
        this.stopAutoPlay();
        // Remove event listeners
        this.prevBtn.removeEventListener('click', this.prevSlide);
        this.nextBtn.removeEventListener('click', this.nextSlide);
        document.removeEventListener('keydown', this.handleKeydown);
    }
}

// Additional utility functions
const BankingUtils = {
    // Format currency for display
    formatCurrency: (amount, currency = 'USD') => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency
        }).format(amount);
    },
    
    // Animate numbers (for counters)
    animateNumber: (element, target, duration = 2000) => {
        const start = parseInt(element.textContent.replace(/[^0-9]/g, '') || 0);
        const increment = (target - start) / (duration / 16);
        let current = start;
        
        const timer = setInterval(() => {
            current += increment;
            if ((increment > 0 && current >= target) || (increment < 0 && current <= target)) {
                current = target;
                clearInterval(timer);
            }
            element.textContent = BankingUtils.formatCurrency(Math.round(current));
        }, 16);
    },
    
    // Add loading state to buttons
    setButtonLoading: (button, isLoading) => {
        if (isLoading) {
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        } else {
            button.disabled = false;
            button.innerHTML = button.getAttribute('data-original-text') || button.textContent;
        }
    }
};

// Initialize the slider when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.slider = new BankingSlider();
    
    // Add loading states to CTA buttons
    document.querySelectorAll('.cta-button').forEach(button => {
        button.setAttribute('data-original-text', button.innerHTML);
        button.addEventListener('click', (e) => {
            e.preventDefault();
            BankingUtils.setButtonLoading(button, true);
            
            // Simulate API call
            setTimeout(() => {
                BankingUtils.setButtonLoading(button, false);
                alert('Thank you for your interest! A representative will contact you shortly.');
            }, 2000);
        });
    });
    
    // Add intersection observer for animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
            }
        });
    }, observerOptions);
    
    // Observe feature cards for animation
    document.querySelectorAll('.feature-card-above').forEach(card => {
        observer.observe(card);
    });
});

// Add CSS for additional animations
const additionalStyles = `
    .feature-card {
        opacity: 0;
        transform: translateY(30px);
        transition: all 0.6s ease;
    }
    
    .feature-card.animate-in {
        opacity: 1;
        transform: translateY(0);
    }
    
    .sliding {
        transition: transform 0.5s ease-in-out !important;
    }
    
    .auto-play-status {
        font-size: 0.9rem;
        color: #666;
        margin-top: 1rem;
    }
    
    .auto-play-toggle {
        background: none;
        border: none;
        color: #1a237e;
        cursor: pointer;
        text-decoration: underline;
        font-size: 0.9rem;
    }
    
    .auto-play-toggle:hover {
        color: #283593;
    }
    
    /* Loading spinner */
    .fa-spinner {
        animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;

// Inject additional styles
const styleSheet = document.createElement('chart');
styleSheet.textContent = additionalStyles;
document.head.appendChild(styleSheet);