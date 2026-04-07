{
  "expo": {
    "name": "Fixsense",
    "slug": "fixsense",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "dark",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#060912"
    },
    "assetBundlePatterns": ["**/*"],
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.fixsense.app",
      "buildNumber": "1",
      "infoPlist": {
        "NSMicrophoneUsageDescription": "Fixsense needs microphone access for live call recording.",
        "NSCameraUsageDescription": "Fixsense needs camera access for video calls."
      }
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#060912"
      },
      "package": "com.fixsense.app",
      "versionCode": 1,
      "permissions": [
        "RECORD_AUDIO",
        "CAMERA",
        "INTERNET",
        "VIBRATE",
        "RECEIVE_BOOT_COMPLETED"
      ]
    },
    "web": {
      "favicon": "./assets/favicon.png"
    },
    "plugins": [
      "expo-router",
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#7c3aed",
          "sounds": []
        }
      ],
      "expo-av",
      "expo-secure-store"
    ],
    "scheme": "fixsense",
    "extra": {
      "supabaseUrl": "https://dkvtufanmaiclmsnpyae.supabase.co",
      "supabaseAnonKey": "REPLACE_WITH_ANON_KEY",
      "eas": {
        "projectId": "fixsense-mobile"
      }
    }
  }
}