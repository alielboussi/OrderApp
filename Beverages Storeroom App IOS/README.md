# Beverages Storeroom App iOS (KMP)

This folder contains a Kotlin Multiplatform (KMP) shared module and a SwiftUI iOS app that mirrors the Android app flows, theme, and logic.

## Windows note
You can edit on Windows, but **iOS build/emulator requires macOS + Xcode**. Use a cloud Mac if you do not own a Mac.

## Build and run on macOS
1. Install Xcode.
2. Install CocoaPods: `sudo gem install cocoapods`.
3. In this folder run: `./gradlew :shared:podspec`.
4. Go to `iosApp/` and run: `pod install`.
5. Open `iosApp/BeveragesStoreroomAppIOS.xcworkspace` and run on a simulator.

## Cloud Mac options
- MacStadium (recommended): full macOS with Xcode + iOS Simulator UI.
- MacInCloud: lower-cost alternative with Simulator UI.

## GitHub Actions (optional)
A CI build can be added later, but you still need macOS for simulator testing.
