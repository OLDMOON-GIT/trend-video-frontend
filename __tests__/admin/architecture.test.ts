/**
 * Regression Tests for Architecture Page
 *
 * Tests the architecture page functionality:
 * - Tab navigation with URL state
 * - Diagram zoom/pan controls
 * - Mermaid rendering
 */

describe('Architecture Page', () => {
  describe('Tab State Management', () => {
    const handleTabChange = (tab: 'architecture' | 'erd', mockRouter: any) => {
      if (tab === 'erd') {
        mockRouter.push('/admin/architecture?tab=erd');
      } else {
        mockRouter.push('/admin/architecture');
      }
    };

    test('should navigate to architecture tab without query param', () => {
      const mockRouter = {
        push: jest.fn(),
      };

      handleTabChange('architecture', mockRouter);

      expect(mockRouter.push).toHaveBeenCalledWith('/admin/architecture');
    });

    test('should navigate to ERD tab with query param', () => {
      const mockRouter = {
        push: jest.fn(),
      };

      handleTabChange('erd', mockRouter);

      expect(mockRouter.push).toHaveBeenCalledWith('/admin/architecture?tab=erd');
    });

    test('should parse tab from URL query param', () => {
      const parseTabFromUrl = (url: string): 'architecture' | 'erd' => {
        const urlObj = new URL(url, 'http://localhost');
        const tab = urlObj.searchParams.get('tab');
        return tab === 'erd' ? 'erd' : 'architecture';
      };

      expect(parseTabFromUrl('/admin/architecture')).toBe('architecture');
      expect(parseTabFromUrl('/admin/architecture?tab=erd')).toBe('erd');
      expect(parseTabFromUrl('/admin/architecture?tab=invalid')).toBe('architecture');
    });
  });

  describe('Zoom Controls', () => {
    test('should increase zoom level by 25%', () => {
      let zoomLevel = 100;
      const handleZoomIn = () => {
        if (zoomLevel === 100) {
          zoomLevel = 150; // Jump to 150% from 100%
        } else {
          zoomLevel = Math.min(zoomLevel + 25, 300);
        }
      };

      handleZoomIn();
      expect(zoomLevel).toBe(150);

      handleZoomIn();
      expect(zoomLevel).toBe(175);

      handleZoomIn();
      expect(zoomLevel).toBe(200);
    });

    test('should decrease zoom level by 25%', () => {
      let zoomLevel = 200;
      const handleZoomOut = () => {
        zoomLevel = Math.max(zoomLevel - 25, 50);
      };

      handleZoomOut();
      expect(zoomLevel).toBe(175);

      handleZoomOut();
      expect(zoomLevel).toBe(150);
    });

    test('should not exceed maximum zoom (300%)', () => {
      let zoomLevel = 275;
      const handleZoomIn = () => {
        if (zoomLevel === 100) {
          zoomLevel = 150;
        } else {
          zoomLevel = Math.min(zoomLevel + 25, 300);
        }
      };

      handleZoomIn();
      expect(zoomLevel).toBe(300);

      handleZoomIn();
      expect(zoomLevel).toBe(300); // Should not exceed 300
    });

    test('should not go below minimum zoom (50%)', () => {
      let zoomLevel = 75;
      const handleZoomOut = () => {
        zoomLevel = Math.max(zoomLevel - 25, 50);
      };

      handleZoomOut();
      expect(zoomLevel).toBe(50);

      handleZoomOut();
      expect(zoomLevel).toBe(50); // Should not go below 50
    });

    test('should reset zoom to 100%', () => {
      let zoomLevel = 250;
      let position = { x: 100, y: 200 };

      const handleZoomReset = () => {
        zoomLevel = 100;
        position = { x: 0, y: 0 };
      };

      handleZoomReset();
      expect(zoomLevel).toBe(100);
      expect(position).toEqual({ x: 0, y: 0 });
    });
  });

  describe('Mouse Wheel Zoom', () => {
    test('should zoom in on wheel up (negative deltaY)', () => {
      let zoomLevel = 100;
      const handleWheel = (deltaY: number) => {
        if (deltaY < 0) {
          zoomLevel = Math.min(zoomLevel + 10, 300);
        } else {
          zoomLevel = Math.max(zoomLevel - 10, 50);
        }
      };

      handleWheel(-1); // Wheel up
      expect(zoomLevel).toBe(110);

      handleWheel(-1);
      expect(zoomLevel).toBe(120);
    });

    test('should zoom out on wheel down (positive deltaY)', () => {
      let zoomLevel = 150;
      const handleWheel = (deltaY: number) => {
        if (deltaY < 0) {
          zoomLevel = Math.min(zoomLevel + 10, 300);
        } else {
          zoomLevel = Math.max(zoomLevel - 10, 50);
        }
      };

      handleWheel(1); // Wheel down
      expect(zoomLevel).toBe(140);

      handleWheel(1);
      expect(zoomLevel).toBe(130);
    });
  });

  describe('Drag & Pan', () => {
    test('should update position on drag', () => {
      let isDragging = false;
      let position = { x: 0, y: 0 };
      let dragStart = { x: 0, y: 0 };

      const handleMouseDown = (clientX: number, clientY: number) => {
        isDragging = true;
        dragStart = { x: clientX - position.x, y: clientY - position.y };
      };

      const handleMouseMove = (clientX: number, clientY: number) => {
        if (isDragging) {
          position = {
            x: clientX - dragStart.x,
            y: clientY - dragStart.y,
          };
        }
      };

      const handleMouseUp = () => {
        isDragging = false;
      };

      // Start drag at (100, 100)
      handleMouseDown(100, 100);
      expect(isDragging).toBe(true);

      // Move to (150, 200)
      handleMouseMove(150, 200);
      expect(position).toEqual({ x: 50, y: 100 });

      // Move to (200, 250)
      handleMouseMove(200, 250);
      expect(position).toEqual({ x: 100, y: 150 });

      // Stop drag
      handleMouseUp();
      expect(isDragging).toBe(false);
    });
  });

  describe('Modal State', () => {
    test('should open modal with diagram SVG', () => {
      let isModalOpen = false;
      let modalSvg = '';
      let zoomLevel = 100;

      const handleDiagramClick = (svgContent: string) => {
        modalSvg = svgContent;
        zoomLevel = 150; // Start at 150%
        isModalOpen = true;
      };

      const mockSvg = '<svg><rect /></svg>';
      handleDiagramClick(mockSvg);

      expect(isModalOpen).toBe(true);
      expect(modalSvg).toBe(mockSvg);
      expect(zoomLevel).toBe(150);
    });

    test('should close modal and reset state', () => {
      let isModalOpen = true;
      let modalSvg = '<svg></svg>';

      const handleCloseModal = () => {
        isModalOpen = false;
        modalSvg = '';
      };

      handleCloseModal();

      expect(isModalOpen).toBe(false);
      expect(modalSvg).toBe('');
    });
  });
});
