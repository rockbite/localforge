/**
 * Cost display animator
 * Animates transitions between numeric values with smooth digit-by-digit animations
 */

class CostAnimator {
  constructor(elementId, options = {}) {
    // The DOM element to animate
    this.element = document.getElementById(elementId);
    if (!this.element) {
      console.error(`Element with ID ${elementId} not found`);
      return;
    }

    // Configuration options with defaults
    this.options = Object.assign({
      prefix: '$',           // Currency symbol or prefix
      decimalPlaces: 4,      // Number of decimal places to show
      duration: 800,         // Animation duration in ms
      easing: t => t,        // Linear easing by default
      fps: 30                // Animation frames per second
    }, options);

    // Internal state
    this.currentValue = 0;   // Current display value
    this.targetValue = 0;    // Target value to animate towards
    this.isAnimating = false; // Animation state
    this.animationTimer = null; // Timer reference
    
    // Initialize with current text content if it exists
    const initialText = this.element.textContent.trim();
    if (initialText) {
      const numericValue = parseFloat(initialText.replace(/[^0-9.-]+/g, ''));
      if (!isNaN(numericValue)) {
        this.currentValue = numericValue;
        this.targetValue = numericValue;
      }
    }
    
    // Set initial display
    this.updateDisplay(this.currentValue);
  }

  /**
   * Updates the display to show the current value
   * @param {number} value - The value to display
   */
  updateDisplay(value) {
    this.element.textContent = `${this.options.prefix}${value.toFixed(this.options.decimalPlaces)}`;
  }

  /**
   * Animates to a new target value
   * @param {number} newValue - The target value to animate to
   */
  animateTo(newValue) {
    // Update the target
    this.targetValue = newValue;
    
    // If already animating, just update the target
    if (this.isAnimating) {
      return;
    }
    
    // Start a new animation
    this.isAnimating = true;
    const startValue = this.currentValue;
    const startTime = performance.now();
    const endTime = startTime + this.options.duration;
    const frameDuration = 1000 / this.options.fps;
    
    const animate = (timestamp) => {
      // If the target changed during animation, adjust the parameters
      if (timestamp >= endTime) {
        // Animation complete
        this.currentValue = this.targetValue;
        this.updateDisplay(this.currentValue);
        this.isAnimating = false;
        
        // Check if the target value changed during animation
        if (this.currentValue !== this.targetValue) {
          // Start a new animation to the new target
          this.animateTo(this.targetValue);
        }
        return;
      }
      
      // Calculate progress (0 to 1)
      const progress = Math.min(1, (timestamp - startTime) / this.options.duration);
      
      // Apply easing function
      const easedProgress = this.options.easing(progress);
      
      // Calculate current interpolated value
      const currentValue = startValue + (this.targetValue - startValue) * easedProgress;
      this.currentValue = currentValue;
      
      // Update the display
      this.updateDisplay(currentValue);
      
      // Schedule the next frame
      this.animationTimer = setTimeout(() => {
        requestAnimationFrame(animate);
      }, frameDuration);
    };
    
    // Start the animation
    requestAnimationFrame(animate);
  }

  /**
   * Updates the value without animation
   * @param {number} newValue - The new value to set immediately
   */
  setValue(newValue) {
    // Cancel any ongoing animation
    if (this.animationTimer) {
      clearTimeout(this.animationTimer);
      this.animationTimer = null;
    }
    
    this.isAnimating = false;
    this.currentValue = newValue;
    this.targetValue = newValue;
    this.updateDisplay(newValue);
  }
}

// Create a global animator instance when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Create the animator with custom easing function (ease-out)
  window.costAnimator = new CostAnimator('cost-display', {
    prefix: '$',
    decimalPlaces: 4,
    duration: 800,
    easing: t => 1 - Math.pow(1 - t, 3), // Cubic ease-out for smooth animation
    fps: 60 // Higher FPS for smoother animation
  });
});