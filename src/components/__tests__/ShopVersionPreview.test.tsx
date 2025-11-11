/**
 * ShopVersionPreview Component Regression Tests
 *
 * Tests for spacing optimization and preview functionality
 * Modified in: Latest UX improvements session
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ShopVersionPreview from '../ShopVersionPreview';
import '@testing-library/jest-dom';

// Mock fetch globally
global.fetch = jest.fn();

describe('ShopVersionPreview - Regression Tests', () => {
  const mockProducts = {
    products: [
      {
        id: '1',
        productId: 'PROD001',
        title: '테스트 상품 1',
        price: 10000,
        imageUrl: 'https://example.com/image1.jpg',
        affiliateUrl: 'https://example.com/product1',
        category: '전체',
        isActive: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: '2',
        productId: 'PROD002',
        title: '테스트 상품 2',
        price: 20000,
        imageUrl: 'https://example.com/image2.jpg',
        affiliateUrl: 'https://example.com/product2',
        category: '식품',
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    ],
    nickname: '테스트 닉네임',
    version: {
      id: 'v1',
      name: '버전 1',
      versionNumber: 1,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockProducts,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Spacing Optimization Tests', () => {
    test('should render with reduced padding (p-3 instead of p-6)', async () => {
      render(<ShopVersionPreview versionId="test-version" onClose={jest.fn()} />);

      await waitFor(() => {
        const container = screen.getByTestId = document.querySelector('[class*="p-3"]');
        expect(container).toBeTruthy();
      });
    });

    test('should use rounded-2xl instead of rounded-3xl', async () => {
      render(<ShopVersionPreview versionId="test-version" onClose={jest.fn()} />);

      await waitFor(() => {
        const container = document.querySelector('[class*="rounded-2xl"]');
        expect(container).toBeTruthy();
      });
    });

    test('should not have excessive margin-bottom values', async () => {
      render(<ShopVersionPreview versionId="test-version" onClose={jest.fn()} showHeader />);

      await waitFor(() => {
        // Header should have mb-6 or less
        const header = document.querySelector('[class*="mb-"]');
        expect(header?.className).not.toContain('mb-8');
      });
    });
  });

  describe('Version Loading Tests', () => {
    test('should load live products when versionId is "live"', async () => {
      render(<ShopVersionPreview versionId="live" onClose={jest.fn()} />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/shop/products/public');
      });
    });

    test('should load specific version when versionId is provided', async () => {
      const versionId = 'version-123';
      render(<ShopVersionPreview versionId={versionId} onClose={jest.fn()} />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/shop/products/public?versionId=${versionId}`
        );
      });
    });

    test('should show loading state initially', () => {
      render(<ShopVersionPreview versionId="test-version" onClose={jest.fn()} />);

      expect(screen.getByText(/상품을 불러오는 중입니다.../)).toBeInTheDocument();
    });

    test('should display products after loading', async () => {
      render(<ShopVersionPreview versionId="test-version" onClose={jest.fn()} />);

      await waitFor(() => {
        expect(screen.queryByText(/상품을 불러오는 중입니다.../)).not.toBeInTheDocument();
      });
    });
  });

  describe('Error Handling Tests', () => {
    test('should display error message when fetch fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: '상품을 불러올 수 없습니다.' }),
      });

      render(<ShopVersionPreview versionId="test-version" onClose={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText(/상품을 불러올 수 없습니다./)).toBeInTheDocument();
      });
    });

    test('should handle network errors gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      render(<ShopVersionPreview versionId="test-version" onClose={jest.fn()} />);

      await waitFor(() => {
        // Error message will be the actual error message or generic message
        const errorElement = screen.getByText(/Network error/i);
        expect(errorElement).toBeInTheDocument();
      });
    });
  });

  describe('Header Display Tests', () => {
    test('should show header when showHeader is true', async () => {
      render(<ShopVersionPreview versionId="test-version" onClose={jest.fn()} showHeader />);

      await waitFor(() => {
        expect(screen.getByText(/미리보기 모드:/)).toBeInTheDocument();
      });
    });

    test('should not show header when showHeader is false', () => {
      render(<ShopVersionPreview versionId="test-version" onClose={jest.fn()} showHeader={false} />);

      expect(screen.queryByText(/미리보기 모드:/)).not.toBeInTheDocument();
    });

    test('should call onClose when close button is clicked', async () => {
      const onClose = jest.fn();
      render(<ShopVersionPreview versionId="test-version" onClose={onClose} showHeader />);

      await waitFor(() => {
        const closeButton = screen.getByText(/미리보기 닫기/);
        fireEvent.click(closeButton);
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('should display correct product count in header', async () => {
      render(<ShopVersionPreview versionId="test-version" onClose={jest.fn()} showHeader />);

      await waitFor(() => {
        expect(screen.getByText(/총 2개 상품/)).toBeInTheDocument();
      });
    });
  });

  describe('Bookmark Functionality Tests', () => {
    test('should initialize bookmark storage systems', async () => {
      const localStorageSpy = jest.spyOn(Storage.prototype, 'getItem');

      render(<ShopVersionPreview versionId="test-version" onClose={jest.fn()} />);

      await waitFor(() => {
        expect(screen.queryByText(/상품을 불러오는 중입니다.../)).not.toBeInTheDocument();
      });

      // Verify bookmark storage was checked
      expect(localStorageSpy).toHaveBeenCalledWith('shop_bookmarks');
    });

    test('should use fallback storage if localStorage is blocked', async () => {
      const localStorageSpy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('localStorage blocked');
      });

      render(<ShopVersionPreview versionId="test-version" onClose={jest.fn()} />);

      await waitFor(() => {
        expect(screen.queryByText(/상품을 불러오는 중입니다.../)).not.toBeInTheDocument();
      });

      // Should not throw error
      expect(localStorageSpy).toHaveBeenCalled();
    });
  });
});
