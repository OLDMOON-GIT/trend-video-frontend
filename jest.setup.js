// Jest setup file
import '@testing-library/jest-dom'
import 'whatwg-fetch'

// Mock clipboard API (only in jsdom environment)
if (typeof navigator !== 'undefined') {
  Object.assign(navigator, {
    clipboard: {
      writeText: jest.fn(() => Promise.resolve()),
      readText: jest.fn(() => Promise.resolve('')),
    },
  });
}

// Mock document.execCommand (only in jsdom environment)
if (typeof document !== 'undefined') {
  document.execCommand = jest.fn(() => true);
}

// Mock window.open (only in jsdom environment)
if (typeof window !== 'undefined') {
  window.open = jest.fn();
}

// Mock URL.createObjectURL
global.URL.createObjectURL = jest.fn(() => 'blob:test-url');
global.URL.revokeObjectURL = jest.fn();

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    loading: jest.fn(),
    dismiss: jest.fn(),
  },
  Toaster: () => null,
}));
