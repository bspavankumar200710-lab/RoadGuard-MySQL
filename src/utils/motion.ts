import { Transition, Variants } from 'motion/react';

/**
 * Centralized Animation System Configuration ('motion.ts')
 * Inspired by high-end, 60fps productivity and spatial interfaces.
 * Uses GPU-friendly transform and opacity properties with spring physics and natural easing.
 */

export const easings = {
  // Ultra-smooth deceleration curve for modern interfaces
  smooth: [0.16, 1, 0.3, 1] as const,
  // Gentle curve for large background or subtle fade transitions
  gentle: [0.25, 0.1, 0.25, 1] as const,
  // Snappy curve for small toggles and dropdown reveals
  snappy: [0.2, 0.8, 0.2, 1] as const,
  // Acceleration-deceleration for dialogs and modals
  standard: [0.4, 0, 0.2, 1] as const,
  // Subtle overshoot bounce for checkmarks and badges
  bounce: [0.34, 1.56, 0.64, 1] as const,
};

export const springs = {
  // Soft physics for cards and large panels
  soft: {
    type: 'spring',
    damping: 26,
    stiffness: 240,
    mass: 0.8,
  } as Transition,

  // Snappy physics for tabs, pills, and active indicators
  snappy: {
    type: 'spring',
    damping: 24,
    stiffness: 340,
  } as Transition,

  // High-stiffness interactive response for buttons and toggles
  interactive: {
    type: 'spring',
    damping: 18,
    stiffness: 420,
  } as Transition,

  // Bouncy spring for playful micro-interactions (checkboxes, badges)
  bouncy: {
    type: 'spring',
    damping: 15,
    stiffness: 300,
  } as Transition,

  // LayoutId sliding tab indicator
  tabIndicator: {
    type: 'spring',
    damping: 26,
    stiffness: 350,
  } as Transition,
};

/**
 * Page Transitions: subtle fade + slight vertical shift (200–300ms)
 */
export const pageVariants: Variants = {
  initial: {
    opacity: 0,
    y: 8,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.26,
      ease: easings.smooth,
      when: 'beforeChildren',
    },
  },
  exit: {
    opacity: 0,
    y: -6,
    transition: {
      duration: 0.18,
      ease: easings.snappy,
    },
  },
};

/**
 * Card Entrance and Hover Physics
 */
export const cardHoverProps = {
  whileHover: {
    y: -2,
    scale: 1.012,
    transition: { duration: 0.2, ease: easings.smooth },
  },
  whileTap: {
    scale: 0.99,
    transition: { duration: 0.1, ease: easings.snappy },
  },
};

export const cardEnterVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.05,
      duration: 0.32,
      ease: easings.smooth,
    },
  }),
};

/**
 * Interactive Button Micro-interactions
 */
export const buttonPressProps = {
  whileHover: {
    scale: 1.025,
    transition: { duration: 0.16, ease: easings.smooth },
  },
  whileTap: {
    scale: 0.965,
    transition: { duration: 0.08, ease: easings.snappy },
  },
};

export const iconButtonProps = {
  whileHover: {
    scale: 1.08,
    transition: { duration: 0.15, ease: easings.smooth },
  },
  whileTap: {
    scale: 0.92,
    transition: { duration: 0.08, ease: easings.snappy },
  },
};

/**
 * Modal Dialog Animation Variants
 */
export const modalOverlayVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.22, ease: easings.gentle },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.18, ease: easings.gentle },
  },
};

export const modalDialogVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.96,
    y: 14,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.28,
      ease: easings.smooth,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: 8,
    transition: {
      duration: 0.18,
      ease: easings.snappy,
    },
  },
};

/**
 * Dropdowns, Popovers and Floating Menus
 */
export const dropdownVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.97,
    y: -4,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.18,
      ease: easings.smooth,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: -4,
    transition: {
      duration: 0.12,
      ease: easings.snappy,
    },
  },
};

/**
 * Slide-in Side Drawer (Copilot / Assistant / Inspector - from Right)
 */
export const sideDrawerVariants: Variants = {
  hidden: {
    x: '100%',
    opacity: 0.5,
  },
  visible: {
    x: '0%',
    opacity: 1,
    transition: {
      duration: 0.32,
      ease: easings.smooth,
    },
  },
  exit: {
    x: '100%',
    opacity: 0,
    transition: {
      duration: 0.24,
      ease: easings.snappy,
    },
  },
};

/**
 * Mobile Sidebar Drawer (Slides in from Left)
 */
export const leftDrawerVariants: Variants = {
  hidden: {
    x: '-100%',
    opacity: 0.5,
  },
  visible: {
    x: '0%',
    opacity: 1,
    transition: {
      duration: 0.28,
      ease: easings.smooth,
    },
  },
  exit: {
    x: '-100%',
    opacity: 0,
    transition: {
      duration: 0.22,
      ease: easings.snappy,
    },
  },
};

/**
 * Desktop Collapsible Sidebar
 */
export const sidebarTransition: Transition = {
  duration: 0.28,
  ease: easings.smooth,
};

export const sidebarLabelVariants: Variants = {
  hidden: {
    opacity: 0,
    width: 0,
    x: -6,
  },
  visible: {
    opacity: 1,
    width: 'auto',
    x: 0,
    transition: {
      duration: 0.2,
      ease: easings.smooth,
    },
  },
  exit: {
    opacity: 0,
    width: 0,
    x: -6,
    transition: {
      duration: 0.16,
      ease: easings.snappy,
    },
  },
};

/**
 * Staggered Container for Lists and Grids
 */
export const staggerContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.02,
    },
  },
};

export const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.28,
      ease: easings.smooth,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    transition: {
      duration: 0.16,
      ease: easings.snappy,
    },
  },
};

/**
 * Animated Counter Component Helper for numbers
 */
export const numberSpring = {
  damping: 28,
  stiffness: 180,
};

/**
 * Progress Bar Transition
 */
export const progressBarTransition: Transition = {
  duration: 0.8,
  ease: easings.smooth,
};

/**
 * Chat Message Pop-in Animation
 */
export const chatMessageVariants: Variants = {
  hidden: { opacity: 0, y: 8, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.22,
      ease: easings.smooth,
    },
  },
};

/**
 * Accordion / Inline Form Expand & Collapse
 */
export const expandCollapseVariants: Variants = {
  hidden: { opacity: 0, height: 0, y: -8 },
  visible: {
    opacity: 1,
    height: 'auto',
    y: 0,
    transition: {
      duration: 0.24,
      ease: easings.smooth,
    },
  },
  exit: {
    opacity: 0,
    height: 0,
    y: -8,
    transition: {
      duration: 0.18,
      ease: easings.snappy,
    },
  },
};

/**
 * Pop-in micro-animation for checkmarks, badges, status indicators
 */
export const popInVariants: Variants = {
  hidden: { scale: 0, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: springs.bouncy,
  },
  exit: {
    scale: 0,
    opacity: 0,
    transition: { duration: 0.12, ease: easings.snappy },
  },
};
