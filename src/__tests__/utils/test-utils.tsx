/**
 * Test Utilities
 *
 * Common utilities and helpers for regression tests
 */

import { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';

// Mock window.matchMedia for responsive design tests
export function mockMatchMedia(matches: boolean = false) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

// Mock IntersectionObserver
export function mockIntersectionObserver() {
  const mockIntersectionObserver = jest.fn();
  mockIntersectionObserver.mockReturnValue({
    observe: () => null,
    unobserve: () => null,
    disconnect: () => null,
  });
  window.IntersectionObserver = mockIntersectionObserver as any;
}

// Mock localStorage
export function mockLocalStorage() {
  const localStorageMock = (() => {
    let store: Record<string, string> = {};

    return {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value.toString();
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };
  })();

  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
  });

  return localStorageMock;
}

// Mock sessionStorage
export function mockSessionStorage() {
  const sessionStorageMock = (() => {
    let store: Record<string, string> = {};

    return {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value.toString();
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };
  })();

  Object.defineProperty(window, 'sessionStorage', {
    value: sessionStorageMock,
    writable: true,
  });

  return sessionStorageMock;
}

// Mock IndexedDB
export function mockIndexedDB() {
  const mockDB = {
    objectStoreNames: {
      contains: jest.fn(() => false),
    },
    createObjectStore: jest.fn(() => ({})),
    transaction: jest.fn(() => ({
      objectStore: jest.fn(() => ({
        get: jest.fn(() => ({
          onsuccess: null,
          onerror: null,
        })),
        put: jest.fn(),
      })),
    })),
  };

  const mockIDBOpenRequest = {
    result: mockDB,
    onsuccess: null as any,
    onerror: null as any,
    onupgradeneeded: null as any,
  };

  const mockIndexedDB = {
    open: jest.fn(() => mockIDBOpenRequest),
  };

  Object.defineProperty(window, 'indexedDB', {
    value: mockIndexedDB,
    writable: true,
  });

  return { mockIndexedDB, mockDB, mockIDBOpenRequest };
}

// Mock fetch with common responses
export function createMockFetch() {
  return jest.fn((url: string, options?: any) => {
    // Default successful response
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => '',
    });
  });
}

// Create mock product data
export function createMockProduct(overrides: Partial<any> = {}) {
  return {
    id: 'prod-1',
    productId: 'PROD001',
    title: '테스트 상품',
    price: 10000,
    imageUrl: 'https://example.com/image.jpg',
    affiliateUrl: 'https://example.com/product',
    category: '전체',
    isActive: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// Create mock job data
export function createMockJob(overrides: Partial<any> = {}) {
  return {
    id: 'job-1',
    title: '테스트 작업',
    type: 'longform',
    status: 'completed',
    progress: 100,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// Wait for specific time
export function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Custom render with providers (if needed)
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  // Add custom options here if needed
}

export function customRender(
  ui: ReactElement,
  options?: CustomRenderOptions
) {
  return render(ui, { ...options });
}

// Re-export everything from testing-library
export * from '@testing-library/react';
export { customRender as render };
