// src/app/api/menu/route.ts
import { NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { Window } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface MenuFileInfo {
  fileGroupId: string;
  fileId: string;
  accessToken: string;
}

// metrics 타입 정의 추가
interface ProcessMetrics {
  browserLaunchTime: number;
  loginTime: number;
  imageDownloadTime: number;
  uploadTime: number;
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
    headless: true,
  };
}

// 로깅 유틸리티 함수 추가
function logWithMemory(message: string, extra: object = {}) {
  const memory = process.memoryUsage();
  console.log({
    timestamp: new Date().toISOString(),
    message,
    memoryMB: {
      heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
      rss: Math.round(memory.rss / 1024 / 1024),
    },
    ...extra,
  });
}

export async function GET() {
  let browser = null;
  const startTime = new Date();
  const metrics: ProcessMetrics = {
    browserLaunchTime: 0,
    loginTime: 0,
    imageDownloadTime: 0,
    uploadTime: 0,
  };

  logWithMemory('메뉴 처리 시작', { startTime });

  try {
    const browserOptions = await getBrowserOptions();
    logWithMemory('브라우저 옵션 설정 완료', { browserOptions });

    const browserStartTime = Date.now();
    browser = await puppeteer.launch(browserOptions);
    metrics.browserLaunchTime = Date.now() - browserStartTime;
    logWithMemory('브라우저 실행 완료', {
      launchTime: metrics.browserLaunchTime,
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);

    // 네트워크 요청 모니터링
    page.on('request', (request) => {
      logWithMemory('네트워크 요청', {
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
      });
    });

    page.on('response', (response) => {
      logWithMemory('네트워크 응답', {
        url: response.url(),
        status: response.status(),
        ok: response.ok(),
      });
    });

    logWithMemory('메뉴 페이지 접속 시도', {
      url: `https://${env.LOGIN_DOMAIN}/food/image`,
    });

    // 페이지 로드 시작 시간 기록
    const pageLoadStart = Date.now();
    await page.goto(`https://${env.LOGIN_DOMAIN}/food/image`, {
      waitUntil: 'networkidle0',
    });
    logWithMemory('페이지 로드 완료', { loadTime: Date.now() - pageLoadStart });

    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      const loginStartTime = Date.now();
      logWithMemory('로그인 프로세스 시작');

      await page.waitForSelector('button.intranet-btn-normal');
      const buttons = await page.$$('button.intranet-btn-normal');
      await buttons[0].click();

      await page.waitForSelector('#txtUserID');
      await page.type('#txtUserID', env.LOGIN_ID);
      await page.type('#txtPwd', env.LOGIN_PASSWORD);

      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0' }),
        page.evaluate(() => {
          (window as unknown as Window).OnLogon();
        }),
      ]);

      // 로그인 후 메뉴 페이지로 다시 이동
      await page.goto(`https://${env.LOGIN_DOMAIN}/food/image`, {
        waitUntil: 'networkidle0',
      });

      metrics.loginTime = Date.now() - loginStartTime;
      logWithMemory('로그인 완료', { loginTime: metrics.loginTime });
    }

    // 파일 정보 조회 로깅 강화
    logWithMemory('메뉴 파일 정보 조회 시작');
    const fileInfoStartTime = Date.now();

    const fileInfo: MenuFileInfo = await page.evaluate(() => {
      const nextData = (window as unknown as Window).__NEXT_DATA__;
      const { fileGroupId, fileId } = nextData.props.pageProps.foodResponse;
      const accessToken = nextData.props.pageProps.profile.token.accessToken;
      return { fileGroupId, fileId, accessToken };
    });
    logWithMemory('파일 정보 조회 완료', {
      fileInfo: {
        fileGroupId: fileInfo.fileGroupId,
        fileId: fileInfo.fileId,
        retrievalTime: Date.now() - fileInfoStartTime,
      },
    });

    // 이미지 다운로드 로깅 강화
    const downloadStartTime = Date.now();
    const imageUrl = `https://${env.LOGIN_DOMAIN}/proxy/files/${fileInfo.fileGroupId}/file/${fileInfo.fileId}/download`;
    logWithMemory('이미지 다운로드 시작', { imageUrl });

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
    metrics.imageDownloadTime = Date.now() - downloadStartTime;
    logWithMemory('이미지 다운로드 완료', {
      downloadTime: metrics.imageDownloadTime,
      imageSize: imageBuffer.length,
    });

    // Supabase 업로드 로깅 강화
    const uploadStartTime = Date.now();
    const filename = `food_menu_${new Date().toISOString().split('T')[0]}.png`;
    logWithMemory('Supabase 업로드 시작', { filename });

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

    metrics.uploadTime = Date.now() - uploadStartTime;
    logWithMemory('Supabase 업로드 완료', {
      uploadTime: metrics.uploadTime,
      uploadPath: uploadData.path,
    });

    const endTime = new Date();
    const totalTime = endTime.getTime() - startTime.getTime();
    logWithMemory('메뉴 처리 완료', {
      totalTime,
      metrics,
      success: true,
    });

    return NextResponse.json({
      success: true,
      path: uploadData.path,
      metrics,
      totalTime,
    });
  } catch (error) {
    const errorTime = new Date();
    logWithMemory('메뉴 처리 오류', {
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : '알 수 없는 오류',
      metrics,
      currentStep: getCurrentProcessStep(metrics),
    });

    if (browser) {
      try {
        // ... 에러 스크린샷 및 디버그 정보 수집 로직 강화 ...
        const page = (await browser.pages())[0];
        const debugInfo = {
          url: page.url(),
          metrics,
          cookies: await page.cookies(),
          localStorage: await page.evaluate(() => Object.entries(localStorage)),
          html: await page.content(),
        };
        logWithMemory('디버그 정보 수집 완료', { debugInfo });
      } catch (debugError) {
        logWithMemory('디버그 정보 수집 실패', {
          error:
            debugError instanceof Error
              ? debugError.message
              : '알 수 없는 오류',
        });
      }
    }

    return NextResponse.json(
      {
        error: 'Failed to process menu',
        errorDetails:
          error instanceof Error ? error.message : '알 수 없는 오류',
        timestamp: errorTime.toISOString(),
        metrics,
      },
      { status: 500 }
    );
  } finally {
    if (browser) {
      await browser.close();
      logWithMemory('브라우저 종료됨');
    }
  }
}

// 현재 프로세스 단계를 판단하는 헬퍼 함수
function getCurrentProcessStep(metrics: ProcessMetrics): string {
  if (!metrics.browserLaunchTime) return 'BROWSER_LAUNCH';
  if (!metrics.loginTime) return 'LOGIN';
  if (!metrics.imageDownloadTime) return 'IMAGE_DOWNLOAD';
  if (!metrics.uploadTime) return 'UPLOAD';
  return 'COMPLETED';
}
