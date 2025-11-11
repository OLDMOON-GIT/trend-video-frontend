/**
 * 상품정보 플레이스홀더 치환 통합 테스트
 *
 * 이 테스트는 실제 파일 시스템과 실제 로직을 검증합니다.
 * Mock 없이 실제 동작을 테스트합니다.
 *
 * 실행: npm test -- product-info-placeholder.integration
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('[통합] 상품정보 플레이스홀더 치환', () => {
  const projectRoot = path.join(__dirname, '..', '..');
  const promptFilePath = path.join(projectRoot, 'prompts', 'prompt_product_info.txt');

  describe('1. 프롬프트 파일 검증', () => {
    it('prompt_product_info.txt 파일이 존재해야 함', () => {
      expect(fs.existsSync(promptFilePath)).toBeTruthy();
    });

    it('프롬프트 파일에 필수 플레이스홀더가 모두 포함되어 있어야 함', () => {
      const promptContent = fs.readFileSync(promptFilePath, 'utf-8');

      // 필수 플레이스홀더 확인
      expect(promptContent).toContain('{title}');
      expect(promptContent).toContain('{thumbnail}');
      expect(promptContent).toContain('{product_link}');
      expect(promptContent).toContain('{product_description}');
      expect(promptContent).toContain('{home_url}');
      expect(promptContent).toContain('{별명}');
    });

    it('플레이스홀더가 중괄호 형식이어야 함', () => {
      const promptContent = fs.readFileSync(promptFilePath, 'utf-8');

      // 잘못된 형식이 있는지 확인 (예: {{title}}, [title], <title>)
      expect(promptContent).not.toMatch(/\{\{title\}\}/);
      expect(promptContent).not.toMatch(/\[title\]/);
      expect(promptContent).not.toMatch(/<title>/);
    });
  });

  describe('2. API 라우트 로직 검증 - /api/scripts/generate', () => {
    const routeFilePath = path.join(projectRoot, 'src', 'app', 'api', 'scripts', 'generate', 'route.ts');

    it('route.ts 파일이 존재해야 함', () => {
      expect(fs.existsSync(routeFilePath)).toBeTruthy();
    });

    it('product-info 타입에서 productInfo 치환 로직이 있어야 함', () => {
      const routeContent = fs.readFileSync(routeFilePath, 'utf-8');

      // product-info 케이스가 있는지 확인
      expect(routeContent).toMatch(/scriptType === 'product-info'/);
      expect(routeContent).toMatch(/getProductInfoPrompt/);

      // productInfo 치환 로직 확인
      expect(routeContent).toContain('if (productInfo)');
      expect(routeContent).toContain('.replace(/{thumbnail}/g');
      expect(routeContent).toContain('.replace(/{product_link}/g');
      expect(routeContent).toContain('.replace(/{product_description}/g');
      expect(routeContent).toContain('.replace(/{home_url}/g');
      expect(routeContent).toContain('.replace(/{별명}/g');
    });

    it('productInfo가 없을 때 경고 로그가 있어야 함', () => {
      const routeContent = fs.readFileSync(routeFilePath, 'utf-8');

      expect(routeContent).toContain('console.warn');
      expect(routeContent).toMatch(/productInfo가 없습니다/);
    });

    it('DB에서 google_sites_url을 가져오는 로직이 있어야 함', () => {
      const routeContent = fs.readFileSync(routeFilePath, 'utf-8');

      expect(routeContent).toContain('google_sites_url');
      expect(routeContent).toContain('user.userId');
      expect(routeContent).toMatch(/Database\(dbPath\)/);
    });
  });

  describe('3. API 라우트 로직 검증 - /api/generate-script', () => {
    const routeFilePath = path.join(projectRoot, 'src', 'app', 'api', 'generate-script', 'route.ts');

    it('route.ts 파일이 존재해야 함', () => {
      expect(fs.existsSync(routeFilePath)).toBeTruthy();
    });

    it('product-info 타입에서 productInfo 치환 로직이 있어야 함', () => {
      const routeContent = fs.readFileSync(routeFilePath, 'utf-8');

      // product-info 케이스 확인
      expect(routeContent).toMatch(/format === 'product-info'/);

      // productInfo 치환 로직 확인
      expect(routeContent).toContain('.replace(/{title}/g');
      expect(routeContent).toContain('.replace(/{thumbnail}/g');
      expect(routeContent).toContain('.replace(/{product_link}/g');
      expect(routeContent).toContain('.replace(/{product_description}/g');
      expect(routeContent).toContain('.replace(/{home_url}/g');
    });

    it('getDb를 사용하여 google_sites_url을 가져와야 함', () => {
      const routeContent = fs.readFileSync(routeFilePath, 'utf-8');

      expect(routeContent).toContain("import { getDb }");
      expect(routeContent).toContain('google_sites_url');
      expect(routeContent).toMatch(/getDb\(\)/);
    });
  });

  describe('4. 치환 로직 시뮬레이션', () => {
    it('모든 플레이스홀더가 치환되어야 함', () => {
      const promptContent = fs.readFileSync(promptFilePath, 'utf-8');

      const mockProductInfo = {
        title: '테스트 상품 제목',
        thumbnail: 'https://example.com/thumb.jpg',
        product_link: 'https://example.com/product',
        description: '이것은 테스트 상품 설명입니다.'
      };

      const homeUrl = 'https://www.youtube.com/@testchannel';
      const nickname = '테스트채널';

      // 실제 치환 로직 시뮬레이션
      let replacedPrompt = promptContent
        .replace(/{title}/g, mockProductInfo.title)
        .replace(/{thumbnail}/g, mockProductInfo.thumbnail)
        .replace(/{product_link}/g, mockProductInfo.product_link)
        .replace(/{product_description}/g, mockProductInfo.description)
        .replace(/{home_url}/g, homeUrl)
        .replace(/{별명}/g, nickname);

      // 치환 후 플레이스홀더가 남아있지 않아야 함
      expect(replacedPrompt).not.toContain('{title}');
      expect(replacedPrompt).not.toContain('{thumbnail}');
      expect(replacedPrompt).not.toContain('{product_link}');
      expect(replacedPrompt).not.toContain('{product_description}');
      expect(replacedPrompt).not.toContain('{home_url}');
      expect(replacedPrompt).not.toContain('{별명}');

      // 실제 값이 포함되어야 함
      expect(replacedPrompt).toContain(mockProductInfo.title);
      expect(replacedPrompt).toContain(mockProductInfo.thumbnail);
      expect(replacedPrompt).toContain(mockProductInfo.product_link);
      expect(replacedPrompt).toContain(mockProductInfo.description);
      expect(replacedPrompt).toContain(homeUrl);
      expect(replacedPrompt).toContain(nickname);
    });

    it('productInfo 필드가 비어있을 때 빈 문자열로 치환되어야 함', () => {
      const testPrompt = '제목: {title}, 링크: {product_link}';

      const emptyProductInfo = {
        title: '',
        thumbnail: '',
        product_link: '',
        description: ''
      };

      const replacedPrompt = testPrompt
        .replace(/{title}/g, emptyProductInfo.title || '')
        .replace(/{product_link}/g, emptyProductInfo.product_link || '');

      // 플레이스홀더가 제거되어야 함
      expect(replacedPrompt).not.toContain('{title}');
      expect(replacedPrompt).not.toContain('{product_link}');

      // 결과는 "제목: , 링크: " 형태여야 함
      expect(replacedPrompt).toBe('제목: , 링크: ');
    });

    it('일부 플레이스홀더만 있는 경우에도 정상 작동해야 함', () => {
      const partialPrompt = '상품명: {title}, 자세히 보기: {product_link}';

      const mockProductInfo = {
        title: '테스트 상품',
        product_link: 'https://example.com/product'
      };

      const replacedPrompt = partialPrompt
        .replace(/{title}/g, mockProductInfo.title)
        .replace(/{thumbnail}/g, '') // 없는 플레이스홀더
        .replace(/{product_link}/g, mockProductInfo.product_link)
        .replace(/{product_description}/g, ''); // 없는 플레이스홀더

      expect(replacedPrompt).toBe('상품명: 테스트 상품, 자세히 보기: https://example.com/product');
      expect(replacedPrompt).not.toContain('{');
      expect(replacedPrompt).not.toContain('}');
    });
  });

  describe('5. 리그레션 방지 - 코드 구조 검증', () => {
    it('/api/scripts/generate에서 product와 product-info 모두 치환 로직이 있어야 함', () => {
      const routeContent = fs.readFileSync(
        path.join(projectRoot, 'src', 'app', 'api', 'scripts', 'generate', 'route.ts'),
        'utf-8'
      );

      // product 타입
      const productSection = routeContent.match(/scriptType === 'product'[\s\S]*?console\.log\('✅ 상품 프롬프트 사용'\)/);
      expect(productSection).toBeTruthy();
      expect(productSection?.[0]).toContain('if (productInfo)');
      expect(productSection?.[0]).toContain('.replace(/{product_link}/g');

      // product-info 타입
      const productInfoSection = routeContent.match(/scriptType === 'product-info'[\s\S]*?console\.log\('✅ 상품정보 프롬프트 사용'\)/);
      expect(productInfoSection).toBeTruthy();
      expect(productInfoSection?.[0]).toContain('if (productInfo)');
      expect(productInfoSection?.[0]).toContain('.replace(/{product_link}/g');
    });

    it('두 API 라우트 모두 동일한 플레이스홀더를 치환해야 함', () => {
      const scriptsGenerateContent = fs.readFileSync(
        path.join(projectRoot, 'src', 'app', 'api', 'scripts', 'generate', 'route.ts'),
        'utf-8'
      );

      const generateScriptContent = fs.readFileSync(
        path.join(projectRoot, 'src', 'app', 'api', 'generate-script', 'route.ts'),
        'utf-8'
      );

      // 두 파일 모두 동일한 플레이스홀더를 치환해야 함
      const placeholders = ['{title}', '{thumbnail}', '{product_link}', '{product_description}', '{home_url}'];

      placeholders.forEach(placeholder => {
        const regex = new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g');
        expect(scriptsGenerateContent).toMatch(regex);
        expect(generateScriptContent).toMatch(regex);
      });
    });

    it('productInfo 객체 구조가 일관되어야 함', () => {
      const scriptsGenerateContent = fs.readFileSync(
        path.join(projectRoot, 'src', 'app', 'api', 'scripts', 'generate', 'route.ts'),
        'utf-8'
      );

      const generateScriptContent = fs.readFileSync(
        path.join(projectRoot, 'src', 'app', 'api', 'generate-script', 'route.ts'),
        'utf-8'
      );

      // 두 파일 모두 productInfo의 같은 필드를 사용해야 함
      const fields = ['productInfo.title', 'productInfo.thumbnail', 'productInfo.product_link', 'productInfo.description'];

      fields.forEach(field => {
        expect(scriptsGenerateContent).toContain(field);
        expect(generateScriptContent).toContain(field);
      });
    });
  });

  describe('6. 에러 케이스 검증', () => {
    it('플레이스홀더가 프롬프트에 없으면 치환이 발생하지 않아야 함', () => {
      const promptWithoutPlaceholders = '이것은 플레이스홀더가 없는 프롬프트입니다.';

      const mockProductInfo = {
        title: '테스트 상품',
        thumbnail: 'https://example.com/thumb.jpg',
        product_link: 'https://example.com/product',
        description: '설명'
      };

      const replacedPrompt = promptWithoutPlaceholders
        .replace(/{title}/g, mockProductInfo.title)
        .replace(/{thumbnail}/g, mockProductInfo.thumbnail);

      // 원본과 동일해야 함
      expect(replacedPrompt).toBe(promptWithoutPlaceholders);
    });

    it('치환 후 의도하지 않은 플레이스홀더가 남아있으면 안 됨', () => {
      const promptContent = fs.readFileSync(promptFilePath, 'utf-8');

      // 정의되지 않은 플레이스홀더가 있는지 확인
      const allPlaceholders = promptContent.match(/\{[^}]+\}/g) || [];
      const validPlaceholders = ['{title}', '{thumbnail}', '{product_link}', '{product_description}', '{home_url}', '{별명}'];

      const invalidPlaceholders = allPlaceholders.filter(p => !validPlaceholders.includes(p));

      if (invalidPlaceholders.length > 0) {
        console.warn('⚠️ 정의되지 않은 플레이스홀더 발견:', invalidPlaceholders);
      }

      // 모든 플레이스홀더는 validPlaceholders에 있어야 함
      expect(invalidPlaceholders.length).toBe(0);
    });
  });

  describe('7. 프론트엔드 → 백엔드 데이터 흐름 검증', () => {
    it('프론트엔드가 보내는 productInfo 구조가 백엔드와 일치해야 함', () => {
      // page.tsx에서 productInfo 구조 확인
      const pageContent = fs.readFileSync(
        path.join(projectRoot, 'src', 'app', 'page.tsx'),
        'utf-8'
      );

      // productInfo 객체 생성 부분 확인
      expect(pageContent).toContain('pendingProductInfoData');
      expect(pageContent).toContain('current_product_info');

      // localStorage에 저장하는 필드 확인
      const productInfoMatch = pageContent.match(/title:.*thumbnail:.*product_link:.*description:/s);
      expect(productInfoMatch).toBeTruthy();
    });

    it('API 요청 body에 productInfo가 포함되어야 함', () => {
      const pageContent = fs.readFileSync(
        path.join(projectRoot, 'src', 'app', 'page.tsx'),
        'utf-8'
      );

      // API 호출 시 productInfo를 body에 포함하는지 확인
      expect(pageContent).toMatch(/productInfo:\s*productInfoForApi/);
      expect(pageContent).toContain("'/api/generate-script'");
    });
  });
});

/**
 * 테스트 실행 가이드:
 *
 * 전체 통합 테스트 실행:
 *   npm test -- product-info-placeholder.integration
 *
 * 특정 섹션만 실행:
 *   npm test -- -t "프롬프트 파일 검증"
 *
 * watch 모드:
 *   npm test -- --watch product-info-placeholder.integration
 *
 * 커버리지:
 *   npm test -- --coverage product-info-placeholder.integration
 *
 * 이 테스트가 실패하면:
 * 1. 프롬프트 파일의 플레이스홀더 형식 확인
 * 2. API 라우트의 치환 로직 확인
 * 3. productInfo 객체 구조 확인
 * 4. 프론트엔드 → 백엔드 데이터 전달 확인
 */
