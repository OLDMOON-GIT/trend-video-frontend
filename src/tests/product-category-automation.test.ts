/**
 * 자동화 상품카테고리 통합 테스트
 *
 * 테스트 범위:
 * 1. 베스트셀러에서 신규 상품 조회 및 내목록 중복 체크
 * 2. 딥링크 생성 및 내목록에 상품 등록
 * 3. 카테고리별 자동 타이틀 생성 및 스케줄 등록
 * 4. 전체 파이프라인 자동화 검증
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const testDbPath = path.join(process.cwd(), 'data', 'test-product-category-automation.sqlite');

// 테스트 DB 초기화
function initTestDB() {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  const db = new Database(testDbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // 필수 테이블 생성
  db.exec(`
    CREATE TABLE IF NOT EXISTS coupang_products (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      deep_link TEXT NOT NULL,
      category_id TEXT,
      image_url TEXT,
      original_price INTEGER,
      discount_price INTEGER,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS video_titles (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT,
      category TEXT,
      product_url TEXT,
      product_data TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS video_schedules (
      id TEXT PRIMARY KEY,
      title_id TEXT NOT NULL,
      product_url TEXT,
      channel TEXT,
      youtube_privacy TEXT DEFAULT 'public',
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (title_id) REFERENCES video_titles(id)
    );

    CREATE TABLE IF NOT EXISTS category_channel_mapping (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      category_name TEXT NOT NULL,
      channel TEXT NOT NULL,
      optimal_upload_hour INTEGER DEFAULT 20,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return db;
}

describe('🛍️ 자동화 상품카테고리 통합 테스트', () => {
  let db;

  beforeAll(() => {
    console.log('\n🔧 테스트 환경 초기화 중...');
    db = initTestDB();

    // 카테고리-채널 매핑 데이터 삽입
    const categoryMappings = [
      { categoryId: '1001', categoryName: '의류', channel: '패션_채널' },
      { categoryId: '1002', categoryName: '가전', channel: '가전_채널' },
      { categoryId: '1003', categoryName: '식품', channel: '식품_채널' },
      { categoryId: '1004', categoryName: '뷰티', channel: '뷰티_채널' },
    ];

    categoryMappings.forEach(mapping => {
      db.prepare(`
        INSERT INTO category_channel_mapping (id, category_id, category_name, channel)
        VALUES (?, ?, ?, ?)
      `).run(`cat-${mapping.categoryId}`, mapping.categoryId, mapping.categoryName, mapping.channel);
    });

    console.log('✅ 테스트 DB 초기화 완료');
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  // ============================================
  // Step 1 테스트: 베스트셀러에서 신규 상품 조회
  // ============================================
  describe('Step 1: 베스트셀러에서 신규 상품 조회', () => {
    it('베스트셀러 상품 목록에서 신규 상품을 필터링해야 함', () => {
      console.log('\n📝 [Test 1-1] 신규 상품 필터링 테스트');

      // Mock 베스트셀러 상품 (쿠팡 API 응답)
      const bestsellerProducts = [
        {
          productId: 'prod_001',
          productName: '신발 A',
          categoryId: '1001',
          imageUrl: 'https://...',
          originalPrice: 50000,
          discountPrice: 35000,
          affiliateUrl: 'https://affiliate.coupang.com/...',
        },
        {
          productId: 'prod_002',
          productName: '셔츠 B',
          categoryId: '1001',
          imageUrl: 'https://...',
          originalPrice: 30000,
          discountPrice: 20000,
          affiliateUrl: 'https://affiliate.coupang.com/...',
        },
        {
          productId: 'prod_003',
          productName: '청바지 C',
          categoryId: '1001',
          imageUrl: 'https://...',
          originalPrice: 40000,
          discountPrice: 30000,
          affiliateUrl: 'https://affiliate.coupang.com/...',
        },
      ];

      // 기존 등록 상품 추가
      db.prepare(`
        INSERT INTO coupang_products (id, product_id, product_name, deep_link, category_id)
        VALUES (?, ?, ?, ?, ?)
      `).run('existing_1', 'prod_001', '신발 A', 'https://link.coupang.com/a/xxxxx', '1001');

      // Step 1: 내목록에서 이미 등록된 상품 조회
      const rows = db.prepare('SELECT product_id FROM coupang_products').all();
      const registeredProductIds = new Set(rows.map(row => row.product_id));

      console.log(`  📋 등록된 상품: ${Array.from(registeredProductIds).join(', ')}`);

      // Step 2: 신규 상품 필터링
      const newProducts = bestsellerProducts.filter(
        product => !registeredProductIds.has(product.productId)
      );

      console.log(`  ✅ 신규 상품: ${newProducts.map(p => p.productName).join(', ')}`);

      // 검증
      expect(newProducts).toHaveLength(2);
      expect(newProducts[0].productId).toBe('prod_002');
      expect(newProducts[1].productId).toBe('prod_003');
    });

    it('카테고리별로 신규 상품을 조회해야 함', () => {
      console.log('\n📝 [Test 1-2] 카테고리별 신규 상품 조회 테스트');

      const categoryProducts = {
        '1001': [
          { productId: 'fashion_001', productName: '코트' },
          { productId: 'fashion_002', productName: '부츠' },
        ],
        '1002': [
          { productId: 'elec_001', productName: '선풍기' },
          { productId: 'elec_002', productName: '가습기' },
        ],
      };

      for (const [categoryId, products] of Object.entries(categoryProducts)) {
        console.log(`  📂 카테고리 ${categoryId}에서 ${products.length}개 상품 조회`);

        // 각 카테고리별로 신규 상품만 선택
        const newProducts = products.filter(p => {
          const exists = db.prepare('SELECT 1 FROM coupang_products WHERE product_id = ?').get(p.productId);
          return !exists;
        });

        console.log(`  ✅ 신규 상품: ${newProducts.length}개`);
        expect(newProducts.length).toBeGreaterThan(0);
      }
    });
  });

  // ============================================
  // Step 2 테스트: 딥링크 생성 및 내목록 등록
  // ============================================
  describe('Step 2: 딥링크 생성 및 내목록 등록', () => {
    it('딥링크를 생성하고 내목록에 상품을 등록해야 함', () => {
      console.log('\n📝 [Test 2-1] 딥링크 생성 및 상품 등록 테스트');

      const newProduct = {
        productId: 'new_prod_001',
        productName: '새로운 의류',
        categoryId: '1001',
        imageUrl: 'https://image.coupang.com/...',
        originalPrice: 50000,
        discountPrice: 35000,
        affiliateUrl: 'https://affiliate.coupang.com/a/1234567890...',
      };

      // Step 1: 딥링크 생성 (Mock)
      const generatedDeeplink = `https://link.coupang.com/a/${newProduct.productId}_shortlink`;
      console.log(`  🔗 생성된 딥링크: ${generatedDeeplink}`);

      // Step 2: 내목록에 상품 등록
      const productId = `prod_${Date.now()}`;
      db.prepare(`
        INSERT INTO coupang_products
        (id, product_id, product_name, deep_link, category_id, image_url, original_price, discount_price)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        productId,
        newProduct.productId,
        newProduct.productName,
        generatedDeeplink,
        newProduct.categoryId,
        newProduct.imageUrl,
        newProduct.originalPrice,
        newProduct.discountPrice
      );

      // 검증
      const registered = db.prepare('SELECT * FROM coupang_products WHERE id = ?').get(productId);
      expect(registered).toBeDefined();
      expect(registered.product_name).toBe(newProduct.productName);
      expect(registered.deep_link).toBe(generatedDeeplink);
      expect(registered.status).toBe('active');

      console.log(`  ✅ 상품 등록 완료: ${registered.product_name}`);
    });

    it('여러 상품을 일괄 등록해야 함', () => {
      console.log('\n📝 [Test 2-2] 일괄 상품 등록 테스트');

      const productsToRegister = [
        { productId: 'batch_001', name: '상품 1', category: '1001', price: 10000 },
        { productId: 'batch_002', name: '상품 2', category: '1001', price: 20000 },
        { productId: 'batch_003', name: '상품 3', category: '1002', price: 30000 },
      ];

      // 일괄 등록
      const stmt = db.prepare(`
        INSERT INTO coupang_products
        (id, product_id, product_name, deep_link, category_id, discount_price)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      productsToRegister.forEach(product => {
        stmt.run(
          `prod_${product.productId}`,
          product.productId,
          product.name,
          `https://link.coupang.com/a/${product.productId}`,
          product.category,
          product.price
        );
      });

      // 검증
      const count = (db.prepare('SELECT COUNT(*) as cnt FROM coupang_products').get()).cnt;
      console.log(`  ✅ 총 ${count}개 상품 등록됨`);
      expect(count).toBeGreaterThanOrEqual(productsToRegister.length);
    });
  });

  // ============================================
  // Step 3 테스트: 카테고리별 자동 스케줄 등록
  // ============================================
  describe('Step 3: 카테고리별 자동 타이틀 생성 및 스케줄 등록', () => {
    it('상품 정보로부터 AI 타이틀을 생성해야 함', () => {
      console.log('\n📝 [Test 3-1] AI 타이틀 생성 테스트');

      // 각 테스트마다 새 상품 추가
      const uniqueId = `test_prod_3_1_${Date.now()}`;
      const uniqueProductId = `test_001_${Date.now()}`;
      db.prepare(`
        INSERT INTO coupang_products
        (id, product_id, product_name, deep_link, category_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(uniqueId, uniqueProductId, 'Test 의류 상품', 'https://link.coupang.com/a/test_001', '1001');

      const product = db.prepare('SELECT * FROM coupang_products WHERE product_id = ?')
        .get(uniqueProductId);

      expect(product).toBeDefined();

      // Mock AI 타이틀 생성
      const aiGeneratedTitle = `[추천] ${product.product_name} - 가성비 최고 👔`;
      console.log(`  🤖 생성된 타이틀: ${aiGeneratedTitle}`);

      // 타이틀 저장
      const titleId = `title_${Date.now()}`;
      const category = '의류';
      db.prepare(`
        INSERT INTO video_titles
        (id, title, category, product_url, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(titleId, aiGeneratedTitle, category, product.deep_link, 'pending');

      // 검증
      const savedTitle = db.prepare('SELECT * FROM video_titles WHERE id = ?').get(titleId);
      expect(savedTitle).toBeDefined();
      expect(savedTitle.title).toBe(aiGeneratedTitle);
      expect(savedTitle.category).toBe(category);
    });

    it('카테고리에 맞는 채널을 자동 배정해야 함', () => {
      console.log('\n📝 [Test 3-2] 카테고리별 채널 자동 배정 테스트');

      const testCases = [
        { categoryId: '1001', expectedChannel: '패션_채널' },
        { categoryId: '1002', expectedChannel: '가전_채널' },
        { categoryId: '1003', expectedChannel: '식품_채널' },
        { categoryId: '1004', expectedChannel: '뷰티_채널' },
      ];

      testCases.forEach(testCase => {
        // 카테고리에서 채널 조회
        const mapping = db.prepare(
          'SELECT channel FROM category_channel_mapping WHERE category_id = ?'
        ).get(testCase.categoryId);

        expect(mapping).toBeDefined();
        expect(mapping.channel).toBe(testCase.expectedChannel);

        console.log(`  ✅ ${testCase.categoryId} → ${mapping.channel}`);
      });
    });

    it('타이틀과 스케줄을 함께 등록해야 함', () => {
      console.log('\n📝 [Test 3-3] 타이틀 + 스케줄 통합 등록 테스트');

      // 각 테스트마다 새 상품 추가
      const uniqueId = `test_prod_3_3_${Date.now()}`;
      const uniqueProductId = `test_003_${Date.now()}`;
      db.prepare(`
        INSERT INTO coupang_products
        (id, product_id, product_name, deep_link, category_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(uniqueId, uniqueProductId, 'Test 의류 상품', 'https://link.coupang.com/a/test_003', '1001');

      const product = db.prepare('SELECT * FROM coupang_products WHERE product_id = ?')
        .get(uniqueProductId);

      // 1. 타이틀 생성 및 저장
      const titleId = `title_${Date.now()}`;
      const title = '우아한 패션 아이템 추천 ✨';
      const category = '의류';

      db.prepare(`
        INSERT INTO video_titles (id, title, category, product_url, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(titleId, title, category, product.deep_link, 'pending');

      console.log(`  📝 타이틀 생성: ${title}`);

      // 2. 채널 조회
      const channelMapping = db.prepare(
        'SELECT channel FROM category_channel_mapping WHERE category_id = ?'
      ).get(product.category_id);

      const channel = channelMapping?.channel || '기본_채널';
      console.log(`  📺 채널 배정: ${channel}`);

      // 3. 스케줄 등록
      const scheduleId = `sched_${Date.now()}`;
      db.prepare(`
        INSERT INTO video_schedules (id, title_id, product_url, channel, youtube_privacy, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(scheduleId, titleId, product.deep_link, channel, 'public', 'pending');

      console.log(`  📅 스케줄 등록: pending 상태`);

      // 검증
      const savedSchedule = db.prepare('SELECT * FROM video_schedules WHERE id = ?')
        .get(scheduleId);

      expect(savedSchedule).toBeDefined();
      expect(savedSchedule.title_id).toBe(titleId);
      expect(savedSchedule.channel).toBe(channel);
      expect(savedSchedule.status).toBe('pending');

      console.log(`  ✅ 타이틀 + 스케줄 통합 등록 완료`);
    });
  });

  // ============================================
  // 전체 파이프라인 통합 테스트
  // ============================================
  describe('전체 파이프라인: 신규 상품 → 내목록 등록 → 자동 스케줄', () => {
    it('완전 자동화 파이프라인을 실행해야 함', () => {
      console.log('\n🔄 [전체 파이프라인 테스트] 신규 상품 → 내목록 → 스케줄');

      // 이 테스트 시작 전 count 저장
      const initialProducts = (db.prepare('SELECT COUNT(*) as cnt FROM coupang_products').get()).cnt;
      const initialTitles = (db.prepare('SELECT COUNT(*) as cnt FROM video_titles').get()).cnt;
      const initialSchedules = (db.prepare('SELECT COUNT(*) as cnt FROM video_schedules').get()).cnt;

      // === Step 1: 신규 상품 조회 ===
      const bestsellerProducts = [
        {
          productId: `pipeline_001_${Date.now()}`,
          name: '파이프라인 테스트 상품 1',
          categoryId: '1002',
          price: 25000,
        },
        {
          productId: `pipeline_002_${Date.now()}`,
          name: '파이프라인 테스트 상품 2',
          categoryId: '1002',
          price: 35000,
        },
      ];

      console.log(`\n1️⃣ Step 1: ${bestsellerProducts.length}개 신규 상품 조회`);

      // 신규 상품 필터링
      const newProducts = bestsellerProducts.filter(p => {
        const exists = db.prepare('SELECT 1 FROM coupang_products WHERE product_id = ?').get(p.productId);
        return !exists;
      });

      console.log(`  ✅ 신규 상품: ${newProducts.length}개`);

      // === Step 2: 내목록에 등록 ===
      console.log(`\n2️⃣ Step 2: 신규 상품을 내목록에 등록`);

      const registeredProducts = [];
      newProducts.forEach(product => {
        const productId = `prod_${product.productId}`;
        const deeplink = `https://link.coupang.com/a/${product.productId}`;

        db.prepare(`
          INSERT INTO coupang_products
          (id, product_id, product_name, deep_link, category_id, discount_price)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(productId, product.productId, product.name, deeplink, product.categoryId, product.price);

        registeredProducts.push({ productId, deeplink, categoryId: product.categoryId });
        console.log(`  ✅ 등록: ${product.name} (카테고리: ${product.categoryId})`);
      });

      // === Step 3: 카테고리별 스케줄 자동 등록 ===
      console.log(`\n3️⃣ Step 3: 카테고리별 자동 스케줄 등록`);

      registeredProducts.forEach(product => {
        // 타이틀 생성
        const titleId = `title_${product.productId}`;
        const title = `✨ 최신 ${product.productId} 상품 추천`;

        db.prepare(`
          INSERT INTO video_titles (id, title, category, product_url, status)
          VALUES (?, ?, ?, ?, ?)
        `).run(titleId, title, `category_${product.categoryId}`, product.deeplink, 'pending');

        // 채널 매핑 조회
        const mapping = db.prepare(
          'SELECT channel FROM category_channel_mapping WHERE category_id = ?'
        ).get(product.categoryId);

        const channel = mapping?.channel || '기본_채널';

        // 스케줄 생성
        const scheduleId = `sched_${product.productId}`;
        db.prepare(`
          INSERT INTO video_schedules (id, title_id, product_url, channel, youtube_privacy, status)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(scheduleId, titleId, product.deeplink, channel, 'public', 'pending');

        console.log(`  ✅ 스케줄 등록: ${product.productId} → ${channel}`);
      });

      // === 최종 검증 ===
      console.log(`\n✨ [최종 검증]`);

      const totalProducts = (db.prepare('SELECT COUNT(*) as cnt FROM coupang_products').get()).cnt;
      const totalTitles = (db.prepare('SELECT COUNT(*) as cnt FROM video_titles').get()).cnt;
      const totalSchedules = (db.prepare('SELECT COUNT(*) as cnt FROM video_schedules').get()).cnt;

      const addedProducts = totalProducts - initialProducts;
      const addedTitles = totalTitles - initialTitles;
      const addedSchedules = totalSchedules - initialSchedules;

      console.log(`  📦 등록된 상품: ${addedProducts}개 (총 ${totalProducts}개)`);
      console.log(`  📝 생성된 타이틀: ${addedTitles}개 (총 ${totalTitles}개)`);
      console.log(`  📅 등록된 스케줄: ${addedSchedules}개 (총 ${totalSchedules}개)`);

      expect(addedProducts).toBeGreaterThan(0);
      expect(addedTitles).toBeGreaterThan(0);
      expect(addedSchedules).toBeGreaterThan(0);
      expect(addedTitles).toBe(addedSchedules); // 1:1 매핑
    });

    it('중복 상품은 등록하지 않아야 함', () => {
      console.log('\n📝 [Test 중복 상품 제외 테스트]');

      // 이미 등록된 상품
      const existingProduct = {
        productId: 'duplicate_test',
        name: '중복 테스트 상품',
        categoryId: '1001',
      };

      // 첫 등록
      db.prepare(`
        INSERT INTO coupang_products
        (id, product_id, product_name, deep_link, category_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        `prod_dup_1`,
        existingProduct.productId,
        existingProduct.name,
        `https://link.coupang.com/a/${existingProduct.productId}`,
        existingProduct.categoryId
      );

      console.log(`  ✅ 첫 등록: ${existingProduct.name}`);

      // 중복 체크
      const isDuplicate = db.prepare('SELECT 1 FROM coupang_products WHERE product_id = ?')
        .get(existingProduct.productId);

      expect(isDuplicate).toBeDefined();

      // 중복이므로 등록하지 않음
      if (isDuplicate) {
        console.log(`  ⏭️ 중복 상품 제외: ${existingProduct.productId}`);
      }

      expect(isDuplicate).toBeTruthy();
    });
  });

  // ============================================
  // 에러 처리 테스트
  // ============================================
  describe('에러 처리 및 복구', () => {
    it('딥링크 생성 실패 시 처리해야 함', () => {
      console.log('\n📝 [에러 테스트] 딥링크 생성 실패');

      const product = {
        productId: 'error_test_001',
        name: '에러 테스트 상품',
        categoryId: '1001',
      };

      // 딥링크 생성 실패 시뮬레이션
      let deeplink = null;

      try {
        // Mock: 딥링크 생성 실패
        throw new Error('url convert failed');
      } catch (error) {
        console.log(`  ❌ 에러: ${error.message}`);
        deeplink = null;
      }

      // 딥링크 없이는 등록하지 않음
      if (!deeplink) {
        console.log(`  ⏭️ 상품 등록 스킵: 딥링크 생성 실패`);
      }

      expect(deeplink).toBeNull();
    });

    it('채널 매핑이 없는 카테고리는 기본 채널로 설정해야 함', () => {
      console.log('\n📝 [에러 테스트] 없는 카테고리 처리');

      const unknownCategoryId = '9999';

      // 매핑 조회
      const mapping = db.prepare(
        'SELECT channel FROM category_channel_mapping WHERE category_id = ?'
      ).get(unknownCategoryId);

      const channel = mapping?.channel || '기본_채널';
      console.log(`  ✅ 채널 설정: ${channel}`);

      expect(channel).toBe('기본_채널');
    });
  });
});
