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

const {
  withInfoPlist,
  withAppDelegate,
  withAndroidManifest,
  withAppBuildGradle,
  withProjectBuildGradle,
  withMainActivity,
  withMainApplication,
  withStringsXml,
  withDangerousMod,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

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

      // 3. Xử lý openURL theo scheme:
      // - zalo-{appID} là callback native SDK → ZDKApplicationDelegate
      // - oni-pos://oauthcode là OAuth callback thực tế của app → Expo Router
      if (!appDelegate.includes('ZDKApplicationDelegate.sharedInstance().application(app, open: url')) {
        // Trường hợp 1: đã có override application(_:open:options:) → thay thế toàn bộ thân hàm
        if (appDelegate.includes('return super.application(app, open: url, options: options)')) {
          appDelegate = appDelegate.replace(
            'return super.application(app, open: url, options: options)',
            `if url.scheme == "zalo-${appID}" && ZDKApplicationDelegate.sharedInstance().application(app, open: url, options: options) {\n      return true\n    }\n    return RCTLinkingManager.application(app, open: url, options: options) || super.application(app, open: url, options: options)`
          );
        } else {
          // Trường hợp 2: chưa có override → thêm func mới trước dấu đóng class
          const openUrlFunc = `
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    // Chỉ callback scheme chuẩn của native SDK mới giao cho Zalo.
    // oni-pos://oauthcode phải đi vào Expo Router.
    if url.scheme == "zalo-${appID}" && ZDKApplicationDelegate.sharedInstance().application(app, open: url, options: options) {
      return true
    }
    return RCTLinkingManager.application(app, open: url, options: options) || super.application(app, open: url, options: options)
  }
`;
          appDelegate = appDelegate.replace(/}\s*$/, `${openUrlFunc}\n}`);
        }
      }

      // Nâng cấp AppDelegate đã được plugin phiên bản cũ inject: phiên bản cũ
      // đưa mọi URL cho ZDK trước, khiến oni-pos://oauthcode có thể bị nuốt.
      appDelegate = appDelegate.replace(
        `if ZDKApplicationDelegate.sharedInstance().application(app, open: url, options: options) {\n      return true\n    }\n    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)`,
        `if url.scheme == "zalo-${appID}" && ZDKApplicationDelegate.sharedInstance().application(app, open: url, options: options) {\n      return true\n    }\n    return RCTLinkingManager.application(app, open: url, options: options) || super.application(app, open: url, options: options)`
      );
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

    // react-native-zalo-kit v5 tự khai báo các artifact me.zalo:*.
    // Xoá dependency legacy do phiên bản plugin cũ từng chèn trực tiếp vào app.
    gradle = gradle.replace(
      /^\s*implementation\s+['"]com\.zing\.zalo\.zalosdk:core:\+['"]\s*$/gm,
      ''
    );

    config.modResults.contents = gradle;
    return config;
  });
}

// ─── Android: project-level build.gradle ─────────────────────────────────────
function withZaloProjectBuildGradle(config) {
  return withProjectBuildGradle(config, (config) => {
    let gradle = config.modResults.contents;

    // Repo chính thức đang được react-native-zalo-kit v5 dùng cho me.zalo:*.
    gradle = gradle.replace(/^\s*maven\s*\{\s*url\s+['"]https:\/\/maven\.zaloapp\.com\/?['"]\s*\}\s*$/gm, '');
    if (!gradle.includes('gitlab.com/api/v4/projects/50747855/packages/maven')) {
      gradle = gradle.replace(
        /(allprojects\s*\{\s*repositories\s*\{)/,
        `$1\n        maven { url 'https://gitlab.com/api/v4/projects/50747855/packages/maven' }`
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
    const zaloMeta = application['meta-data'].find(
      (m) => m.$?.['android:name'] === 'com.zing.zalo.zalosdk.appID'
    );
    if (zaloMeta) {
      zaloMeta.$['android:value'] = '@string/appID';
    } else {
      application['meta-data'].push({
        $: {
          'android:name': 'com.zing.zalo.zalosdk.appID',
          'android:value': '@string/appID',
        },
      });
    }

    // Package visibility từ Android 11: SDK cần thấy app Zalo.
    if (!manifest.manifest.queries) {
      manifest.manifest.queries = [{ package: [] }];
    }
    const queries = manifest.manifest.queries[0];
    if (!queries.package) queries.package = [];
    if (!queries.package.some((p) => p.$?.['android:name'] === 'com.zing.zalo')) {
      queries.package.push({ $: { 'android:name': 'com.zing.zalo' } });
    }

    // Thêm activity chuẩn của Zalo SDK v4/v5 để nhận browser callback.
    if (!application.activity) {
      application.activity = [];
    }
    // Xoá activity legacy từng được plugin cũ sinh ra.
    application.activity = application.activity.filter(
      (a) => a.$?.['android:name'] !== 'com.zing.zalo.sdk.ZaloSDKActivity'
    );
    const browserActivityName = 'com.zing.zalo.zalosdk.oauth.BrowserLoginActivity';
    const hasZaloActivity = application.activity.some(
      (a) => a.$?.['android:name'] === browserActivityName
    );
    if (!hasZaloActivity) {
      application.activity.push({
        $: {
          'android:name': browserActivityName,
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

function withZaloAndroidStrings(config, { appID }) {
  return withStringsXml(config, (config) => {
    const strings = config.modResults.resources.string ?? [];
    const current = strings.find((item) => item.$?.name === 'appID');
    if (current) {
      current._ = appID;
      current.$.translatable = 'false';
    } else {
      strings.push({ _: appID, $: { name: 'appID', translatable: 'false' } });
    }
    config.modResults.resources.string = strings;
    return config;
  });
}

function withZaloMainActivity(config) {
  return withMainActivity(config, (config) => {
    let source = config.modResults.contents;
    if (config.modResults.language === 'kt') {
      if (!source.includes('import android.content.Intent')) {
        source = source.replace('import android.os.Build', 'import android.content.Intent\nimport android.os.Build');
      }
      if (!source.includes('import com.zing.zalo.zalosdk.oauth.ZaloSDK')) {
        source = source.replace(
          'import expo.modules.ReactActivityDelegateWrapper',
          'import expo.modules.ReactActivityDelegateWrapper\nimport com.zing.zalo.zalosdk.oauth.ZaloSDK'
        );
      }
      if (!source.includes('ZaloSDK.Instance.onActivityResult')) {
        source = source.replace(
          /\n(\s*override fun getMainComponentName)/,
          `\n  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {\n    super.onActivityResult(requestCode, resultCode, data)\n    ZaloSDK.Instance.onActivityResult(this, requestCode, resultCode, data)\n  }\n\n$1`
        );
      }
    } else {
      if (!source.includes('import android.content.Intent;')) {
        source = source.replace('import android.os.Bundle;', 'import android.os.Bundle;\nimport android.content.Intent;');
      }
      if (!source.includes('import com.zing.zalo.zalosdk.oauth.ZaloSDK;')) {
        source = source.replace(
          'import com.facebook.react.ReactActivity;',
          'import com.facebook.react.ReactActivity;\nimport com.zing.zalo.zalosdk.oauth.ZaloSDK;'
        );
      }
      if (!source.includes('ZaloSDK.Instance.onActivityResult')) {
        source = source.replace(
          /\n(\s*@Override\s+protected String getMainComponentName)/,
          `\n  @Override\n  public void onActivityResult(int requestCode, int resultCode, Intent data) {\n    super.onActivityResult(requestCode, resultCode, data);\n    ZaloSDK.Instance.onActivityResult(this, requestCode, resultCode, data);\n  }\n\n$1`
        );
      }
    }
    config.modResults.contents = source;
    return config;
  });
}

function withZaloMainApplication(config) {
  return withMainApplication(config, (config) => {
    let source = config.modResults.contents;
    if (config.modResults.language === 'kt') {
      if (!source.includes('import com.zing.zalo.zalosdk.oauth.ZaloSDKApplication')) {
        source = source.replace(
          'import expo.modules.ReactNativeHostWrapper',
          'import expo.modules.ReactNativeHostWrapper\nimport com.zing.zalo.zalosdk.oauth.ZaloSDKApplication'
        );
      }
      if (!source.includes('ZaloSDKApplication.wrap(this)')) {
        source = source.replace('super.onCreate()', 'super.onCreate()\n    ZaloSDKApplication.wrap(this)');
      }
    } else {
      if (!source.includes('import com.zing.zalo.zalosdk.oauth.ZaloSDKApplication;')) {
        source = source.replace(
          'import com.facebook.react.ReactApplication;',
          'import com.facebook.react.ReactApplication;\nimport com.zing.zalo.zalosdk.oauth.ZaloSDKApplication;'
        );
      }
      if (!source.includes('ZaloSDKApplication.wrap(this);')) {
        source = source.replace('super.onCreate();', 'super.onCreate();\n    ZaloSDKApplication.wrap(this);');
      }
    }
    config.modResults.contents = source;
    return config;
  });
}

function withZaloProguard(config) {
  return withDangerousMod(config, ['android', async (config) => {
    const proguardPath = path.join(config.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
    const rules = [
      '-keep class com.zing.zalo.** { *; }',
      '-keep enum com.zing.zalo.** { *; }',
      '-keep interface com.zing.zalo.** { *; }',
    ];
    let content = await fs.promises.readFile(proguardPath, 'utf8');
    const missing = rules.filter((rule) => !content.includes(rule));
    if (missing.length > 0) {
      content = `${content.trimEnd()}\n\n# Zalo SDK\n${missing.join('\n')}\n`;
      await fs.promises.writeFile(proguardPath, content);
    }
    return config;
  }]);
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
  config = withZaloAndroidStrings(config, { appID });
  config = withZaloAndroidManifest(config, { appID });
  config = withZaloMainActivity(config);
  config = withZaloMainApplication(config);
  config = withZaloProguard(config);

  return config;
};

module.exports = withZaloKit;
