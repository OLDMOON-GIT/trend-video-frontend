/**
 * ShopClientView Component Regression Tests
 *
 * Tests for spacing optimization and export functionality
 * Modified in: Latest UX improvements session
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ShopClientView from '../ShopClientView';
import '@testing-library/jest-dom';

// Mock fetch globally
global.fetch = jest.fn();

// Mock toast
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn(),
    loading: jest.fn(),
  },
}));

describe('ShopClientView - Regression Tests', () => {
  const mockProps = {
    initialCategories: [
      { name: '전체', count: 10 },
      { name: '식품', count: 5 },
      { name: '가전', count: 5 },
    ],
    initialTotalProducts: 10,
    googleSitesEditUrl: 'https://sites.google.com/edit/test',
    googleSitesHomeUrl: 'https://sites.google.com/view/test',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.URL.createObjectURL = jest.fn(() => 'blob:test-url');
    global.URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Spacing Optimization Tests', () => {
    test('should render with optimized spacing (mb-4 gap-2)', () => {
      render(<ShopClientView {...mockProps} />);

      const actionContainer = document.querySelector('[class*="mb-4"]');
      expect(actionContainer).toBeTruthy();
    });

    test('should have consistent button gaps', () => {
      render(<ShopClientView {...mockProps} />);

      const gapContainer = document.querySelector('[class*="gap-2"]');
      expect(gapContainer).toBeTruthy();
    });

    test('should not have excessive whitespace in publish tab', () => {
      render(<ShopClientView {...mockProps} />);

      // Container should not have mb-8 or higher
      const containers = document.querySelectorAll('[class*="mb-"]');
      containers.forEach(container => {
        expect(container.className).not.toContain('mb-8');
        expect(container.className).not.toContain('mb-10');
        expect(container.className).not.toContain('mb-12');
      });
    });
  });

  describe('Google Sites Button Tests', () => {
    test('should render Google Sites edit button when URL is provided', () => {
      render(<ShopClientView {...mockProps} />);

      const editButton = screen.getByText(/사이트 편집/);
      expect(editButton).toBeInTheDocument();
    });

    test('should render Google Sites home button when URL is provided', () => {
      render(<ShopClientView {...mockProps} />);

      const homeButton = screen.getByText(/사이트 보기/);
      expect(homeButton).toBeInTheDocument();
    });

    test('should not render edit button when URL is not provided', () => {
      const propsWithoutEdit = { ...mockProps, googleSitesEditUrl: undefined };
      render(<ShopClientView {...propsWithoutEdit} />);

      expect(screen.queryByText(/사이트 편집/)).not.toBeInTheDocument();
    });

    test('should not render home button when URL is not provided', () => {
      const propsWithoutHome = { ...mockProps, googleSitesHomeUrl: undefined };
      render(<ShopClientView {...propsWithoutHome} />);

      expect(screen.queryByText(/사이트 보기/)).not.toBeInTheDocument();
    });

    test('should open edit URL in new tab when clicked', () => {
      const windowOpenSpy = jest.spyOn(window, 'open').mockImplementation();
      render(<ShopClientView {...mockProps} />);

      const editButton = screen.getByText(/사이트 편집/);
      fireEvent.click(editButton);

      expect(windowOpenSpy).toHaveBeenCalledWith(mockProps.googleSitesEditUrl, '_blank');
    });

    test('should open home URL in new tab when clicked', () => {
      const windowOpenSpy = jest.spyOn(window, 'open').mockImplementation();
      render(<ShopClientView {...mockProps} />);

      const homeButton = screen.getByText(/사이트 보기/);
      fireEvent.click(homeButton);

      expect(windowOpenSpy).toHaveBeenCalledWith(mockProps.googleSitesHomeUrl, '_blank');
    });
  });

  describe('HTML Export Button Tests', () => {
    test('should render HTML export button', () => {
      render(<ShopClientView {...mockProps} />);

      expect(screen.getByText(/HTML 내보내기/)).toBeInTheDocument();
    });

    test('should render code copy button', () => {
      render(<ShopClientView {...mockProps} />);

      expect(screen.getByText(/코드 복사/)).toBeInTheDocument();
    });

    test('should show loading state when exporting HTML', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => '<html>test</html>',
      });

      render(<ShopClientView {...mockProps} />);

      const exportButton = screen.getByText(/HTML 내보내기/);
      fireEvent.click(exportButton);

      await waitFor(() => {
        expect(screen.getByText(/내보내는 중.../)).toBeInTheDocument();
      });
    });

    test('should show loading state when copying code', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => '<html>test</html>',
      });

      render(<ShopClientView {...mockProps} />);

      const copyButton = screen.getByText(/코드 복사/);
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(screen.getByText(/복사 중.../)).toBeInTheDocument();
      });
    });

    test('should disable buttons when busy', async () => {
      (global.fetch as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ ok: true, text: async () => '<html>test</html>' }), 100))
      );

      render(<ShopClientView {...mockProps} />);

      const exportButton = screen.getByText(/HTML 내보내기/) as HTMLButtonElement;
      fireEvent.click(exportButton);

      await waitFor(() => {
        expect(exportButton.disabled).toBe(true);
      });
    });
  });

  describe('HTML Download Functionality Tests', () => {
    test('should download HTML file when export button is clicked', async () => {
      const mockHtml = '<html><body>Test Shop</body></html>';
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => mockHtml,
      });

      // Mock link click
      const createElementSpy = jest.spyOn(document, 'createElement');
      const appendChildSpy = jest.spyOn(document.body, 'appendChild').mockImplementation();
      const removeChildSpy = jest.spyOn(document.body, 'removeChild').mockImplementation();

      render(<ShopClientView {...mockProps} />);

      const exportButton = screen.getByText(/HTML 내보내기/);
      fireEvent.click(exportButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/shop/versions/live/html');
      });

      await waitFor(() => {
        expect(createElementSpy).toHaveBeenCalledWith('a');
        expect(appendChildSpy).toHaveBeenCalled();
        expect(removeChildSpy).toHaveBeenCalled();
      });
    });

    test('should handle download error gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'HTML 생성 실패' }),
      });

      const toast = require('react-hot-toast').default;

      render(<ShopClientView {...mockProps} />);

      const exportButton = screen.getByText(/HTML 내보내기/);
      fireEvent.click(exportButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });
  });

  describe('HTML Copy Functionality Tests', () => {
    test('should copy HTML to clipboard when copy button is clicked', async () => {
      const mockHtml = '<html><body>Test Shop</body></html>';
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => mockHtml,
      });

      render(<ShopClientView {...mockProps} />);

      const copyButton = screen.getByText(/코드 복사/);
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockHtml);
      });
    });

    test('should use fallback copy method when clipboard API is unavailable', async () => {
      const mockHtml = '<html><body>Test Shop</body></html>';
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => mockHtml,
      });

      // Remove clipboard API
      const originalClipboard = navigator.clipboard;
      Object.defineProperty(navigator, 'clipboard', { value: undefined, writable: true, configurable: true });

      render(<ShopClientView {...mockProps} />);

      const copyButton = screen.getByText(/코드 복사/);
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(document.execCommand).toHaveBeenCalledWith('copy');
      });

      // Restore clipboard
      Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, writable: true, configurable: true });
    });

    test('should handle copy error gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'HTML 생성 실패' }),
      });

      const toast = require('react-hot-toast').default;

      render(<ShopClientView {...mockProps} />);

      const copyButton = screen.getByText(/코드 복사/);
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });
  });

  describe('ShopVersionPreview Integration Tests', () => {
    test('should render ShopVersionPreview component', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ products: [], nickname: '테스트' }),
      });

      render(<ShopClientView {...mockProps} />);

      // ShopVersionPreview should render with loading or content
      await waitFor(() => {
        expect(document.querySelector('[class*="rounded-2xl"]') || screen.getByText(/상품을 불러오는 중입니다/)).toBeTruthy();
      });
    });

    test('should fetch products when component mounts', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ products: [], nickname: '테스트' }),
      });

      render(<ShopClientView {...mockProps} />);

      // The component should fetch from /api/shop/products/public (without versionId for 'live')
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/shop/products/public');
      });
    });
  });
});
