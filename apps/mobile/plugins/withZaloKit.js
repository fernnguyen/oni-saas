/**
 * plugins/withZaloKit.js
 *
 * Custom Expo Config Plugin để cấu hình react-native-zalo-kit
 * Tự động inject Zalo SDK setup vào native code khi chạy `expo prebuild` hoặc EAS Build.
 *
 * iOS:  Thêm URL Scheme "zalo-{APP_ID}" + LSApplicationQueriesSchemes vào Info.plist
 *       Khởi tạo SDK trong AppDelegate
 * Android: Thêm Zalo dependency, cấu hình build.gradle + AndroidManifest
 */

const { withInfoPlist, withAppDelegate, withAndroidManifest, withAppBuildGradle, withProjectBuildGradle } = require('@expo/config-plugins');

// ─── iOS: Info.plist ─────────────────────────────────────────────────────────
function withZaloIosPlist(config, { appID }) {
  return withInfoPlist(config, (config) => {
    const plist = config.modResults;

    // Thêm URL scheme để Zalo app callback về app sau xác thực
    const zaloScheme = `zalo-${appID}`;
    if (!plist.CFBundleURLTypes) {
      plist.CFBundleURLTypes = [];
    }
    const hasScheme = plist.CFBundleURLTypes.some(
      (t) => Array.isArray(t.CFBundleURLSchemes) && t.CFBundleURLSchemes.includes(zaloScheme)
    );
    if (!hasScheme) {
      plist.CFBundleURLTypes.push({
        CFBundleURLSchemes: [zaloScheme],
      });
    }

    // Thêm LSApplicationQueriesSchemes để kiểm tra app Zalo có cài không
    if (!plist.LSApplicationQueriesSchemes) {
      plist.LSApplicationQueriesSchemes = [];
    }
    ['zalosdk', 'zaloshareext'].forEach((scheme) => {
      if (!plist.LSApplicationQueriesSchemes.includes(scheme)) {
        plist.LSApplicationQueriesSchemes.push(scheme);
      }
    });

    // Thêm ZaloAppID (rất quan trọng, nếu thiếu SDK sẽ crash trên iOS)
    plist.ZaloAppID = appID;

    return config;
  });
}

// ─── iOS: AppDelegate — Khởi tạo Zalo SDK ────────────────────────────────────
function withZaloAppDelegate(config, { appID }) {
  return withAppDelegate(config, (config) => {
    let appDelegate = config.modResults.contents;
    const isSwift = config.modResults.language === 'swift';

    if (isSwift) {
      // 1. Thêm import
      if (!appDelegate.includes('import ZaloSDK')) {
        appDelegate = appDelegate.replace(
          'import ReactAppDependencyProvider',
          'import ReactAppDependencyProvider\nimport ZaloSDK'
        );
      }

      // 2. Khởi tạo trong didFinishLaunchingWithOptions
      const swiftInit = `    ZaloSDK.sharedInstance().initialize(withAppId: "${appID}")`;
      if (!appDelegate.includes('ZaloSDK.sharedInstance().initialize(withAppId:')) {
        appDelegate = appDelegate.replace(
          'let delegate = ReactNativeDelegate()',
          `${swiftInit}\n    let delegate = ReactNativeDelegate()`
        );
      }

      // 3. Xử lý openURL — PHẢI dùng ZDKApplicationDelegate, không phải ZaloSDK.
      // QUAN TRỌNG: phải check return value và return true sớm nếu Zalo đã handle URL,
      // không để RCTLinkingManager (Expo Router) nhận URL đó lần nữa (tránh double-consume oauthCode).
      if (!appDelegate.includes('ZDKApplicationDelegate.sharedInstance().application(app, open: url')) {
        // Trường hợp 1: đã có override application(_:open:options:) → thay thế toàn bộ thân hàm
        if (appDelegate.includes('return super.application(app, open: url, options: options)')) {
          appDelegate = appDelegate.replace(
            'return super.application(app, open: url, options: options)',
            `if ZDKApplicationDelegate.sharedInstance().application(app, open: url, options: options) {\n      return true\n    }\n    return super.application(app, open: url, options: options)`
          );
        } else {
          // Trường hợp 2: chưa có override → thêm func mới trước dấu đóng class
          const openUrlFunc = `
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    // Nếu Zalo SDK xử lý URL này, return true ngay — không để Expo Router nhận thêm
    if ZDKApplicationDelegate.sharedInstance().application(app, open: url, options: options) {
      return true
    }
    return super.application(app, open: url, options: options)
  }
`;
          appDelegate = appDelegate.replace(/}\s*$/, `${openUrlFunc}\n}`);
        }
      }
    } else {
      // Objective-C (legacy)
      if (!appDelegate.includes('#import <ZaloSDK/ZaloSDK.h>')) {
        appDelegate = appDelegate.replace(
          '#import "AppDelegate.h"',
          '#import "AppDelegate.h"\n#import <ZaloSDK/ZaloSDK.h>'
        );
      }

      const zaloInit = `  [[ZaloSDK sharedInstance] initializeWithAppId:@"${appID}"];`;
      if (!appDelegate.includes('initializeWithAppId')) {
        appDelegate = appDelegate.replace(
          'return [super application:application didFinishLaunchingWithOptions:launchOptions];',
          `${zaloInit}\n  return [super application:application didFinishLaunchingWithOptions:launchOptions];`
        );
      }

      const handleOpenURL = `
- (BOOL)application:(UIApplication *)application openURL:(NSURL *)url options:(NSDictionary<UIApplicationOpenURLOptionsKey,id> *)options {
  return [[ZaloSDK sharedInstance] application:application openURL:url options:options];
}
`;
      if (!appDelegate.includes('ZaloSDK sharedInstance] application:application openURL:')) {
        appDelegate = appDelegate.replace('@end', `${handleOpenURL}\n@end`);
      }
    }

    config.modResults.contents = appDelegate;
    return config;
  });
}

// ─── Android: build.gradle (app level) ───────────────────────────────────────
function withZaloAndroidBuildGradle(config) {
  return withAppBuildGradle(config, (config) => {
    let gradle = config.modResults.contents;

    // Thêm Maven repository cho Zalo SDK nếu chưa có
    if (!gradle.includes('zalo-sdk')) {
      gradle = gradle.replace(
        'dependencies {',
        `dependencies {\n    implementation 'com.zing.zalo.zalosdk:core:+'`
      );
    }

    config.modResults.contents = gradle;
    return config;
  });
}

// ─── Android: project-level build.gradle ─────────────────────────────────────
function withZaloProjectBuildGradle(config) {
  return withProjectBuildGradle(config, (config) => {
    let gradle = config.modResults.contents;

    // Thêm Zalo Maven repo
    if (!gradle.includes('https://maven.zaloapp.com/')) {
      // Tìm allprojects > repositories block
      gradle = gradle.replace(
        'allprojects {\n    repositories {',
        'allprojects {\n    repositories {\n        maven { url \'https://maven.zaloapp.com/\' }'
      );
    }

    config.modResults.contents = gradle;
    return config;
  });
}

// ─── Android: AndroidManifest.xml ────────────────────────────────────────────
function withZaloAndroidManifest(config, { appID }) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const application = manifest.manifest.application[0];

    // Thêm Zalo App ID như meta-data
    if (!application['meta-data']) {
      application['meta-data'] = [];
    }
    const hasZaloMeta = application['meta-data'].some(
      (m) => m.$?.['android:name'] === 'com.zing.zalo.zalosdk.appID'
    );
    if (!hasZaloMeta) {
      application['meta-data'].push({
        $: {
          'android:name': 'com.zing.zalo.zalosdk.appID',
          'android:value': appID,
        },
      });
    }

    // Thêm activity để nhận callback từ Zalo
    if (!application.activity) {
      application.activity = [];
    }
    const hasZaloActivity = application.activity.some(
      (a) => a.$?.['android:name'] === 'com.zing.zalo.sdk.ZaloSDKActivity'
    );
    if (!hasZaloActivity) {
      application.activity.push({
        $: {
          'android:name': 'com.zing.zalo.sdk.ZaloSDKActivity',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
            category: [
              { $: { 'android:name': 'android.intent.category.DEFAULT' } },
              { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
            ],
            data: [{ $: { 'android:scheme': `zalo-${appID}` } }],
          },
        ],
      });
    }

    return config;
  });
}

// ─── Plugin chính — export để dùng trong app.json ────────────────────────────
const withZaloKit = (config, { appID } = {}) => {
  if (!appID || appID === 'ZALO_APP_ID_PLACEHOLDER') {
    console.warn(
      '[withZaloKit] CẢNH BÁO: zaloAppId chưa được cấu hình. ' +
      'Vui lòng điền App ID thật vào app.json extra.zaloAppId'
    );
    return config;
  }

  config = withZaloIosPlist(config, { appID });
  config = withZaloAppDelegate(config, { appID });
  config = withZaloProjectBuildGradle(config);
  config = withZaloAndroidBuildGradle(config);
  config = withZaloAndroidManifest(config, { appID });

  return config;
};

module.exports = withZaloKit;
