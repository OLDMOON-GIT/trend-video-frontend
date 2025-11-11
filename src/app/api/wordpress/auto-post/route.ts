import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { createCoupangClient } from '@/lib/coupang-client';
import { createWordPressClient } from '@/lib/wordpress-client';
import { createWordPressOAuthClient } from '@/lib/wordpress-oauth-client';
import db from '@/lib/sqlite';

/**
 * 쿠팡 상품을 워드프레스에 자동으로 포스팅하는 API
 *
 * Request Body:
 * - productUrl: 쿠팡 상품 URL
 * - wpSiteUrl: 워드프레스 사이트 URL
 * - wpUsername: 워드프레스 사용자명
 * - wpAppPassword: 워드프레스 Application Password
 * - customCategory?: 커스텀 카테고리 이름 (선택)
 */
export async function POST(request: NextRequest) {
  try {
    // 인증 확인
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      productUrl,
      wpSiteUrl,
      wpUsername,
      wpAppPassword,
      customCategory
    } = body;

    // productUrl은 필수
    if (!productUrl) {
      return NextResponse.json(
        { error: '쿠팡 상품 URL을 입력해주세요.' },
        { status: 400 }
      );
    }

    console.log('🚀 워드프레스 자동 포스팅 시작...');
    console.log('📦 상품 URL:', productUrl);

    // OAuth 토큰 확인
    const oauthData = db.prepare(`
      SELECT access_token, blog_id, blog_url
      FROM wordpress_oauth_tokens
      WHERE user_id = ?
    `).get(user.userId) as any;

    const useOAuth = !!oauthData;
    console.log('🔐 인증 방식:', useOAuth ? 'OAuth' : 'Application Password');

    if (useOAuth) {
      console.log('🌐 워드프레스 블로그:', oauthData.blog_url);
    } else {
      console.log('🌐 워드프레스 사이트:', wpSiteUrl);
      // Application Password 방식은 모든 파라미터 필수
      if (!wpSiteUrl || !wpUsername || !wpAppPassword) {
        return NextResponse.json(
          { error: 'WordPress.com 연결 또는 Application Password 설정이 필요합니다.' },
          { status: 400 }
        );
      }
    }

    // 1. 쿠팡 파트너스 딥링크 생성
    const coupangClient = createCoupangClient({
      accessKey: process.env.COUPANG_ACCESS_KEY || '',
      secretKey: process.env.COUPANG_SECRET_KEY || ''
    });

    console.log('🔗 쿠팡 딥링크 생성 중...');
    const deepLink = await coupangClient.generateDeepLink(productUrl);
    console.log('✅ 딥링크 생성 완료:', deepLink);

    // 2. 상품 정보 크롤링 (쿠팡 API 제한으로 직접 크롤링)
    console.log('🕷️ 상품 정보 크롤링 중...');
    const productInfo = await scrapeProductInfo(productUrl);
    console.log('✅ 상품 정보 크롤링 완료:', {
      title: productInfo.title,
      hasImage: !!productInfo.imageUrl,
      descriptionLength: productInfo.description.length
    });

    // 3. AI로 카테고리 자동 분류
    console.log('🤖 AI 카테고리 분류 중...');
    const category = customCategory || await classifyCategory(productInfo.title, productInfo.description);
    console.log('✅ 카테고리 분류 완료:', category);

    // 4. AI로 상세 설명 생성
    console.log('✍️ AI 상세 설명 생성 중...');
    const detailedDescription = await generateDetailedDescription(productInfo);
    console.log('✅ 상세 설명 생성 완료 (길이:', detailedDescription.length, '자)');

    // 5. 워드프레스 클라이언트 생성
    let wpClient: any;
    if (useOAuth) {
      wpClient = createWordPressOAuthClient({
        accessToken: oauthData.access_token,
        blogId: oauthData.blog_id
      });
    } else {
      wpClient = createWordPressClient({
        siteUrl: wpSiteUrl,
        username: wpUsername,
        appPassword: wpAppPassword
      });
    }

    // 6. HTML 콘텐츠 생성
    const postContent = generatePostContent({
      title: productInfo.title,
      description: detailedDescription,
      imageUrl: productInfo.imageUrl,
      deepLink,
      originalPrice: productInfo.originalPrice,
      discountPrice: productInfo.discountPrice
    });

    // 7. 워드프레스에 포스트 생성 (OAuth vs Application Password 방식에 따라 다르게 처리)
    console.log('📝 워드프레스 포스트 생성 중...');
    let post: any;

    if (useOAuth) {
      // OAuth 방식: 카테고리는 문자열 배열, 이미지는 URL 직접 전달
      post = await wpClient.createPost({
        title: productInfo.title,
        content: postContent,
        excerpt: detailedDescription.substring(0, 200) + '...',
        status: 'publish',
        categories: [category],
        featured_image: productInfo.imageUrl
      });
    } else {
      // Application Password 방식: 이미지 업로드 후 ID 사용, 카테고리 ID 필요

      // 이미지 업로드
      let featuredMediaId: number | undefined;
      if (productInfo.imageUrl) {
        try {
          console.log('🖼️ 썸네일 업로드 중...');
          featuredMediaId = await wpClient.uploadImageFromUrl(
            productInfo.imageUrl,
            productInfo.title
          );
          console.log('✅ 썸네일 업로드 완료, ID:', featuredMediaId);
        } catch (error) {
          console.error('⚠️ 썸네일 업로드 실패:', error);
          // 썸네일 업로드 실패해도 계속 진행
        }
      }

      // 카테고리 ID 찾기 또는 생성
      console.log('📁 카테고리 설정 중...');
      const categoryId = await wpClient.findOrCreateCategory(category);
      console.log('✅ 카테고리 ID:', categoryId);

      // 포스트 생성
      post = await wpClient.createPost({
        title: productInfo.title,
        content: postContent,
        excerpt: detailedDescription.substring(0, 200) + '...',
        status: 'publish',
        categories: [categoryId],
        featured_media: featuredMediaId
      });
    }

    console.log('✅ 워드프레스 포스팅 완료!');
    console.log('📄 포스트 URL:', post.link);

    return NextResponse.json({
      success: true,
      postId: post.id,
      postUrl: post.link,
      deepLink,
      category,
      message: '워드프레스 포스팅이 완료되었습니다.'
    });

  } catch (error: any) {
    console.error('❌ 워드프레스 자동 포스팅 오류:', error);
    return NextResponse.json(
      {
        error: error?.message || '워드프레스 포스팅 중 오류가 발생했습니다.',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

/**
 * 쿠팡 상품 페이지에서 정보 크롤링
 */
async function scrapeProductInfo(productUrl: string): Promise<{
  title: string;
  description: string;
  imageUrl: string;
  originalPrice?: number;
  discountPrice?: number;
}> {
  // Puppeteer나 Cheerio를 사용한 실제 크롤링은 복잡하므로
  // 일단 간단한 fetch로 HTML 파싱
  const response = await fetch(productUrl);
  const html = await response.text();

  // Open Graph 태그에서 정보 추출
  const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
  const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
  const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);

  // 가격 정보 추출 (예시)
  const priceMatch = html.match(/data-price="(\d+)"/);

  return {
    title: titleMatch ? titleMatch[1] : '쿠팡 상품',
    description: descMatch ? descMatch[1] : '',
    imageUrl: imageMatch ? imageMatch[1] : '',
    discountPrice: priceMatch ? parseInt(priceMatch[1]) : undefined
  };
}

/**
 * AI로 카테고리 자동 분류
 */
async function classifyCategory(title: string, description: string): Promise<string> {
  // Claude API를 사용한 카테고리 분류
  const prompt = `다음 상품을 가장 적합한 카테고리로 분류해주세요.
가능한 카테고리: 패션, 뷰티, 식품, 생활용품, 디지털, 가전, 스포츠, 완구, 도서, 반려동물, 자동차

상품명: ${title}
설명: ${description}

카테고리 이름만 한 단어로 답변해주세요.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })
  });

  const data = await response.json();
  const category = data.content?.[0]?.text?.trim() || '기타';

  return category;
}

/**
 * AI로 상세 설명 생성
 */
async function generateDetailedDescription(productInfo: {
  title: string;
  description: string;
}): Promise<string> {
  const prompt = `다음 쿠팡 상품에 대한 매력적인 블로그 포스트 설명을 작성해주세요.
상품의 장점, 특징, 추천 이유를 자연스럽게 포함해주세요.
HTML 태그 없이 순수 텍스트로만 작성해주세요.

상품명: ${productInfo.title}
기본 설명: ${productInfo.description}

블로그 포스트에 적합한 3-4문단의 설명을 작성해주세요:`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })
  });

  const data = await response.json();
  const description = data.content?.[0]?.text?.trim() || productInfo.description;

  return description;
}

/**
 * 워드프레스 포스트 HTML 콘텐츠 생성
 */
function generatePostContent(params: {
  title: string;
  description: string;
  imageUrl: string;
  deepLink: string;
  originalPrice?: number;
  discountPrice?: number;
}): string {
  const { title, description, imageUrl, deepLink, originalPrice, discountPrice } = params;

  return `
<!-- wp:paragraph -->
<p>${description}</p>
<!-- /wp:paragraph -->

${imageUrl ? `
<!-- wp:image {"align":"center"} -->
<div class="wp-block-image"><figure class="aligncenter"><img src="${imageUrl}" alt="${title}"/></figure></div>
<!-- /wp:image -->
` : ''}

${discountPrice ? `
<!-- wp:paragraph -->
<p><strong>💰 가격:</strong> ${discountPrice.toLocaleString()}원${originalPrice ? ` (${Math.round((1 - discountPrice / originalPrice) * 100)}% 할인)` : ''}</p>
<!-- /wp:paragraph -->
` : ''}

<!-- wp:paragraph -->
<p style="text-align:center"><a href="${deepLink}" target="_blank" rel="noopener" class="wp-block-button__link" style="background-color:#ff6b00;padding:15px 30px;border-radius:5px;color:#fff;text-decoration:none;display:inline-block;font-weight:bold">🛒 쿠팡에서 구매하기</a></p>
<!-- /wp:paragraph -->

<!-- wp:paragraph {"fontSize":"small"} -->
<p class="has-small-font-size"><em>이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.</em></p>
<!-- /wp:paragraph -->
  `.trim();
}
