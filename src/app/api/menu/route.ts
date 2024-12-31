// src/app/api/menu/route.ts
import { NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { Window } from '@/lib/types';
import type { Page } from 'puppeteer-core';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface MenuFileInfo {
  fileGroupId: string;
  fileId: string;
  accessToken: string;
}

// 환경에 따른 브라우저 설정을 가져오는 함수
async function getBrowserOptions() {
  const isVercel = process.env.VERCEL === '1';

  if (isVercel) {
    return {
      args: [
        ...chromium.args,
        '--hide-scrollbars',
        '--disable-web-security',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // 메모리 사용 최적화
        '--disable-accelerated-2d-canvas', // 리소스 사용 감소
        '--disable-gpu', // 서버리스 환경에서 더 안정적
      ],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(
        'https://github.com/Sparticuz/chromium/releases/download/v131.0.0/chromium-v131.0.0-pack.tar'
      ),
      headless: true,
      ignoreHTTPSErrors: true,
      slowMo: 50,
    };
  }

  // 로컬 환경
  return {
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath:
      process.platform === 'win32'
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        : process.platform === 'darwin'
          ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
          : '/usr/bin/google-chrome',
    headless: false,
  };
}

// 로거 타입 정의
interface LogData {
  message?: string;
  error?: Error;
  [key: string]: unknown;
}

// 로거 함수 개선
function createLogger(prefix: string) {
  return {
    info: (message: string, data?: LogData) => {
      const timestamp = new Date().toISOString();
      console.log(
        `[${timestamp}] [INFO] [${prefix}] ${message}`,
        data ? data : ''
      );
    },
    error: (message: string, error?: Error) => {
      const timestamp = new Date().toISOString();
      console.error(
        `[${timestamp}] [ERROR] [${prefix}] ${message}`,
        error ? error : ''
      );
    },
    debug: (message: string, data?: LogData) => {
      const timestamp = new Date().toISOString();
      console.debug(
        `[${timestamp}] [DEBUG] [${prefix}] ${message}`,
        data ? data : ''
      );
    },
  };
}

// __NEXT_DATA__ 대기 로직 개선
async function waitForNextData(
  page: Page,
  logger: ReturnType<typeof createLogger>
) {
  logger.info('__NEXT_DATA__ 대기 시작');

  try {
    // 상태 체크 인터벌 설정
    const checkInterval = setInterval(async () => {
      const state = await page.evaluate(() => ({
        hasNextData: '__NEXT_DATA__' in window,
        hasProps:
          '__NEXT_DATA__' in window &&
          'props' in (window as unknown as Window).__NEXT_DATA__!,
        url: window.location.href,
        readyState: document.readyState,
      }));
      logger.debug('페이지 상태 체크', state);
    }, 5000);

    // __NEXT_DATA__ 대기
    const result = await page.waitForFunction(
      () => {
        try {
          const nextData = (window as unknown as Window).__NEXT_DATA__;
          if (!nextData?.props?.pageProps?.foodResponse) {
            return false;
          }
          return true;
        } catch (e) {
          console.error('__NEXT_DATA__ 체크 중 오류:', e);
          return false;
        }
      },
      {
        timeout: 30000,
        polling: 1000,
      }
    );

    clearInterval(checkInterval);
    logger.info('__NEXT_DATA__ 대기 완료');
    return result;
  } catch (error) {
    logger.error('__NEXT_DATA__ 대기 실패', error as Error);
    throw error;
  }
}

// 로그인 후 리다이렉션 처리 개선
async function handleLogin(
  page: Page,
  logger: ReturnType<typeof createLogger>
) {
  logger.info('로그인 프로세스 시작');
  let retryCount = 0;
  const maxRetries = 3;

  while (retryCount < maxRetries) {
    try {
      // SSO 리다이렉션 체인 대기
      await page.waitForFunction(() => document.readyState === 'complete', {
        timeout: 15000,
      });

      // 로그인 버튼이 나타날 때까지 대기 (타임아웃 증가)
      await page.waitForSelector('button.intranet-btn-normal', {
        timeout: 10000,
      });

      const buttons = await page.$$('button.intranet-btn-normal');
      await buttons[0].click();

      // ID/PW 입력 필드 대기 로직 강화
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }),
        page.waitForSelector('#txtUserID', { timeout: 10000 }),
        page.waitForFunction(() => document.readyState === 'complete'),
      ]);

      await page.type('#txtUserID', env.LOGIN_ID);
      await page.type('#txtPwd', env.LOGIN_PASSWORD);

      // 로그인 처리 및 리다이렉션 대기
      logger.info('로그인 시도');

      // 로그인 버튼 클릭 및 리다이렉션 처리
      await Promise.all([
        page.evaluate(() => {
          (window as unknown as Window).OnLogon();
        }),
        // 여러 네비게이션 이벤트를 기다림
        page.waitForNavigation({
          waitUntil: ['networkidle0', 'domcontentloaded'],
          timeout: 60000, // 타임아웃 증가
        }),
      ]);

      // 최종 URL 확인 및 필요시 리다이렉션
      const currentUrl = page.url();
      logger.info('현재 URL', { url: currentUrl });

      if (!currentUrl.includes('/food/image')) {
        logger.info('메뉴 페이지로 수동 리다이렉션');
        await page.goto(`https://${env.LOGIN_DOMAIN}/food/image`, {
          waitUntil: ['networkidle0', 'domcontentloaded'],
          timeout: 60000, // 타임아웃 증가
        });
      }

      // 페이지 로드 완료 확인
      await Promise.race([
        page.waitForFunction(
          () => {
            return (
              document.readyState === 'complete' &&
              window.location.pathname === '/food/image'
            );
          },
          {
            timeout: 30000,
            polling: 1000,
          }
        ),
        new Promise((resolve) => setTimeout(resolve, 45000)), // 최대 대기 시간
      ]);

      logger.info('로그인 및 리다이렉션 완료');
      break;
    } catch (error) {
      retryCount++;
      logger.error(`로그인 시도 ${retryCount} 실패`, error as Error);

      if (retryCount >= maxRetries) {
        throw new Error(`최대 재시도 횟수(${maxRetries}) 초과`);
      }

      // 페이지 리로드 후 재시도
      await page.reload({ waitUntil: 'networkidle0' });
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

export async function GET() {
  const logger = createLogger('MENU-API');
  let browser = null;
  let page = null;
  const startTime = new Date();
  console.log(`[${startTime.toISOString()}] 메뉴 처리 시작`);

  try {
    const browserOptions = await getBrowserOptions();
    browser = await puppeteer.launch(browserOptions);
    console.log(`[${new Date().toISOString()}] 브라우저 실행 완료`);

    page = await browser.newPage();

    // 페이지 이벤트 리스너 추가
    page.on('console', (msg) => console.log('브라우저 콘솔:', msg.text()));
    page.on('pageerror', (err) => console.error('페이지 에러:', err.message));
    page.on('requestfailed', (request) =>
      console.error('요청 실패:', request.url(), request.failure()?.errorText)
    );

    page.setDefaultNavigationTimeout(30000);

    // 네트워크 요청 모니터링
    page.on('request', (request) => {
      console.log(`[${new Date().toISOString()}] 요청 시작: ${request.url()}`);
    });
    page.on('requestfinished', (request) => {
      console.log(`[${new Date().toISOString()}] 요청 완료: ${request.url()}`);
    });

    console.log(`[${new Date().toISOString()}] 메뉴 페이지 접속 시도`);
    await page.goto(`https://${env.LOGIN_DOMAIN}/food/image`, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    // 페이지 로드 상태 확인
    await page.waitForFunction(() => document.readyState === 'complete', {
      timeout: 10000,
    });

    logger.info('메뉴 페이지 DOM 로드 완료');

    // 추가 대기 시간
    await new Promise((resolve) => setTimeout(resolve, 2000));

    logger.info('페이지 상태', {
      url: page.url(),
      title: await page.title(),
    });

    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      await handleLogin(page, logger);
    }

    // 로그인 후 페이지 로드 대기 개선
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    logger.info('페이지 초기 로드 완료');

    // __NEXT_DATA__ 대기
    await waitForNextData(page, logger);

    const fileInfo: MenuFileInfo = await page.evaluate(() => {
      const nextData = (window as unknown as Window).__NEXT_DATA__;
      const { fileGroupId, fileId } = nextData.props.pageProps.foodResponse;
      const accessToken = nextData.props.pageProps.profile.token.accessToken;
      return { fileGroupId, fileId, accessToken };
    });
    console.log(`[${new Date().toISOString()}] 파일 정보 조회 완료:`, {
      fileGroupId: fileInfo.fileGroupId,
      fileId: fileInfo.fileId,
    });

    // 이미지 다운로드 로깅
    console.log(`[${new Date().toISOString()}] 이미지 다운로드 시작`);
    const imageUrl = `https://${env.LOGIN_DOMAIN}/proxy/files/${fileInfo.fileGroupId}/file/${fileInfo.fileId}/download`;
    const imageResponse = await fetch(imageUrl, {
      headers: {
        Authorization: `Bearer ${fileInfo.accessToken}`,
        Referer: `https://${env.LOGIN_DOMAIN}/food/image`,
      },
    });

    if (!imageResponse.ok) {
      throw new Error(`Failed to download image: ${imageResponse.status}`);
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    console.log(`[${new Date().toISOString()}] 이미지 다운로드 완료`);

    // Supabase 업로드 로깅
    console.log(`[${new Date().toISOString()}] Supabase 업로드 시작`);
    const supabase = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const filename = `food_menu_${new Date().toISOString().split('T')[0]}.png`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('food-menus')
      .upload(`menus/${filename}`, imageBuffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // DB 레코드 생성
    const { error: recordError } = await supabase
      .from('food_menu_records')
      .insert([
        {
          file_name: filename,
          upload_date: new Date().toISOString(),
          storage_path: uploadData.path,
        },
      ]);

    if (recordError) throw recordError;

    const endTime = new Date();
    const processingTime = endTime.getTime() - startTime.getTime();
    console.log(
      `[${endTime.toISOString()}] 메뉴 처리 완료 (소요시간: ${processingTime}ms)`
    );

    return NextResponse.json({
      success: true,
      path: uploadData.path,
      processingTime,
    });
  } catch (error) {
    const errorTime = new Date();
    console.error(`[${errorTime.toISOString()}] 상세 에러 정보:`, {
      message: error instanceof Error ? error.message : '알 수 없는 오류',
      stack: error instanceof Error ? error.stack : undefined,
      type: error?.constructor?.name,
    });

    if (page) {
      try {
        const screenshotPath = `/tmp/error-screenshot-${errorTime.getTime()}.png`;
        await page.screenshot({
          path: screenshotPath,
          fullPage: true,
        });
        console.log(
          `[${new Date().toISOString()}] 에러 스크린샷 저장됨: ${screenshotPath}`
        );

        // 페이지 상태 정보 수집 개선
        const pageState = {
          url: page.url(),
          content: await page.content(),
          cookies: await page.cookies(),
          metrics: await page.metrics(),
          headers: await page.evaluate(() => {
            return {
              userAgent: navigator.userAgent,
              platform: navigator.platform,
              language: navigator.language,
            };
          }),
        };
        console.log(
          `[${new Date().toISOString()}] 상세 페이지 상태:`,
          pageState
        );
      } catch (screenshotError) {
        console.error(
          `[${new Date().toISOString()}] 디버그 정보 수집 실패:`,
          screenshotError
        );
      }
    }

    return NextResponse.json(
      {
        error: 'Failed to process menu',
        errorMessage:
          error instanceof Error ? error.message : '알 수 없는 오류',
        timestamp: errorTime.toISOString(),
      },
      { status: 500 }
    );
  } finally {
    if (browser) {
      await browser.close();
      console.log(`[${new Date().toISOString()}] 브라우저 종료됨`);
    }
  }
}
